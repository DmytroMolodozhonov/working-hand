/**
 * Flourish.js — «Flourish» (the author 05.11: «земля → трава, потом цветочки»). From a scroll; instant (no concentration).
 *
 * Point the wand at the ground and say «Flourish» (FLOURISH.COST mana): from the pointed place the bare earth turns green — a ring
 * of living green runs out over FLOURISH.GRASS_T s (dirt, farmland → grass; a road, sand, stone, snow, a castle's floor stay), then
 * the flowers come up on the new and old grass round it (FLOURISH.BLOOM share of the columns), a drift of colours.
 *
 * Who / what (FLOURISH_TARGETS): the earth and the grass only — no creature, no player is touched; the enchanted stone, the gods'
 * gifts, a house under its sphere — not; space and the planets without air, hell — nothing grows (Space / HellRules block it before).
 * Network: the blocks go as edits (builder._sendEdits — saved with the world as any edit); the flowers as one message `flr`
 * (the columns), every computer asks the same of its own grass; they are kept with the world (snapshot).
 * What may go wrong: pointed at water / the sky / too far — a hint, no mana; the land not made yet — wait; the chunk away and back —
 * the flowers are in `data._bloom` (made again from it); a world saved and loaded — the snapshot; a cave — no sky needed, it grows.
 */
import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';
import { isEnchanted } from '../world/EnchantedStone.js';

export const FLOURISH = { COST: 12, R: 6, REACH: 30, GRASS_T: 1.6, BLOOM_AT: 2.2, BLOOM: 0.45, KEEP: 6000 };

/** The blocks that turn to grass. */
export const GREENS = new Set([BLOCK.DIRT, BLOCK.FARMLAND].filter((v) => v != null));

/** «Flourish» on whom / on what. */
export const FLOURISH_TARGETS = {
    earth: { does: 'земля и пашня становятся травой', why: 'заклинание оживляет землю' },
    grass: { does: 'на траве распускаются цветы', why: 'трава расцветает' },
    road: { does: 'не действует', why: 'дорога, песок, камень, снег — не земля' },
    enchanted: { does: 'не действует', why: 'заколдованный камень и дары богов магия не меняет' },
    creatures: { does: 'не действует', why: 'это заклинание земли — никого не ранит и не толкает' },
    space: { does: 'не действует', why: 'без воздуха и почвы ничего не растёт (Space.spellBlocked)' },
};

const _o = new THREE.Vector3(), _d = new THREE.Vector3();

export class Flourish {
    constructor(game) {
        this.game = game;
        this.jobs = [];
        this.bloomed = []; // [x, z] — kept with the world
    }

    /** Voice: «Flourish». → the name, or null (a hint said). */
    cast(isFinal) {
        const g = this.game;
        if (!isFinal) return null;
        const hint = (t) => { g.hud?.setVoice?.(t, true); return null; };
        const side = g.wandSide?.() || [g.dom, g.off].find((s) => g.character?.isArmRaised?.(s));
        if (!side) return hint('🌱 Направьте палочку на землю и скажите «Flourish»');
        g.character.getHandDirection(side, _d);
        _o.copy(g.castOrigin ? g.castOrigin(side) : g.character.getHandWorldPosition(side, _o));
        const cell = g.builder?._hitCell?.(_o, _d, FLOURISH.REACH);
        if (!cell?.point || cell.type === BLOCK.WATER) return hint('🌱 Направьте палочку на землю (не на воду и не в небо) — не дальше 30 м');
        const t = g.terrain?.data;
        if (!t || (t.landMade && !t.landMade(cell.x, cell.z))) return hint('🌱 Земля там ещё не готова — подождите мгновение');
        const tired = g.combat?.check?.('Flourish');
        if (tired) return hint(tired);
        g.combat?.pay?.('Flourish');
        this.start(cell.x, cell.z, g.localId, true);
        g.mana?.success?.('Flourish');
        return 'Flourish';
    }

    /** The green ring runs out from (x, z) — on every computer the same (the blocks: the caster's edits; the flowers: `flr`). */
    start(x, z, by, mine) {
        this.jobs.push({ x, z, t: 0, done: new Set(), mine, by, bloomed: false });
        this._fxBurst(x, z);
    }

    update(dt) {
        if (!this.jobs.length) return;
        const g = this.game, t = g.terrain?.data;
        for (let i = this.jobs.length - 1; i >= 0; i--) {
            const J = this.jobs[i];
            J.t += dt;
            const r = Math.min(FLOURISH.R, FLOURISH.R * J.t / FLOURISH.GRASS_T);
            if (J.mine && t) {
                const edits = [];
                for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
                    const d = Math.hypot(dx, dz);
                    if (d > r) continue;
                    const ix = J.x + dx, iz = J.z + dz, key = ix + ',' + iz;
                    if (J.done.has(key)) continue;
                    J.done.add(key);
                    if (t.landMade && !t.landMade(ix, iz)) continue;
                    const L = t.topLayer(ix, iz), b = t.get(ix, L, iz);
                    if (!GREENS.has(b) || isEnchanted(b)) continue;
                    if (g.wards?.forbids?.(g.character.group.position, _o.set(ix, L, iz))) continue;
                    if (t.get(ix, L + 1, iz) !== BLOCK.AIR) continue; // (something on it: it stays as it is)
                    edits.push([ix, L, iz, BLOCK.GRASS]);
                    if (Math.random() < 0.25) g.fx?.spark?.(_o.set(ix, L + 0.6, iz), 0x7fd34a, 0.08, _d.set(0, 1.2 + Math.random(), 0), 0.6);
                }
                if (edits.length) g.builder?._sendEdits?.(edits, false);
            }
            if (!J.bloomed && J.t >= FLOURISH.BLOOM_AT) {
                J.bloomed = true;
                if (J.mine) {
                    const list = this._bloomList(J.x, J.z);
                    this.applyBloom(list);
                    g.sync?.net?.send?.({ t: 'flr', l: list }, true);
                }
            }
            if (J.t > FLOURISH.BLOOM_AT + 0.5) this.jobs.splice(i, 1);
        }
    }

    /** The grass columns round (x, z) that flower (a share of them, the same pick from the place: a drift, not a carpet). */
    _bloomList(x, z) {
        const t = this.game.terrain?.data, out = [];
        if (!t) return out;
        for (let dz = -FLOURISH.R; dz <= FLOURISH.R; dz++) for (let dx = -FLOURISH.R; dx <= FLOURISH.R; dx++) {
            if (Math.hypot(dx, dz) > FLOURISH.R) continue;
            const ix = x + dx, iz = z + dz;
            const h = Math.abs(Math.sin(ix * 12.9898 + iz * 78.233) * 43758.5453) % 1;
            if (h > FLOURISH.BLOOM) continue;
            const L = t.topLayer(ix, iz);
            if (t.get(ix, L, iz) !== BLOCK.GRASS) continue;
            out.push([ix, iz]);
        }
        return out;
    }

    /** The flowers on these columns (mine or from `flr`): asked of the grass; kept for the save. */
    applyBloom(list) {
        const g = this.game, t = g.terrain?.data;
        if (!t?.setBloom || !Array.isArray(list)) return;
        for (const p of list.slice(0, 400)) {
            if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
            if (t.setBloom(p[0] | 0, p[1] | 0)) {
                this.bloomed.push([p[0] | 0, p[1] | 0]);
                if (Math.random() < 0.3) g.fx?.spark?.(_o.set(p[0], t.topLayer(p[0], p[1]) + 0.9, p[1]), [0xe8392c, 0x4f7fe0, 0xf5d23a, 0xd86aa8][(Math.random() * 4) | 0], 0.07, _d.set(0, 0.8, 0), 0.7);
            }
        }
        if (this.bloomed.length > FLOURISH.KEEP) this.bloomed.splice(0, this.bloomed.length - FLOURISH.KEEP);
    }

    /** (the net) Another's «Flourish»: its ring of green light; the flowers come by `flr`. */
    onNet(m) { if (m?.t === 'flr') this.applyBloom(m.l); }

    _fxBurst(x, z) {
        const g = this.game, t = g.terrain?.data;
        const y = t ? t.topLayer(x, z) + 0.8 : 0;
        for (let i = 0; i < 36; i++) {
            const a = (i / 36) * Math.PI * 2;
            g.fx?.spark?.(_o.set(x, y, z), i % 3 ? 0x8ee05a : 0xfff3a0, 0.1, _d.set(Math.cos(a) * 4, 0.6 + Math.random(), Math.sin(a) * 4), 0.9);
        }
        g.sound?.playMagic?.(null, 0.8);
    }

    snapshot() { return this.bloomed.length ? this.bloomed.slice(-FLOURISH.KEEP) : null; }
    restore(list) { if (Array.isArray(list)) this.applyBloom2(list); }
    applyBloom2(list) { const t = this.game.terrain?.data; if (!t?.setBloom) return; for (const p of list) if (Array.isArray(p) && t.setBloom(p[0] | 0, p[1] | 0)) this.bloomed.push([p[0] | 0, p[1] | 0]); }
}
