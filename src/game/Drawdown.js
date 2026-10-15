/**
 * Drawdown.js — «Drawdown» / «Drawdown Maxima»: the ground the wand points at sinks.
 *
 * The raised hand (the wand) points at a piece of ground, the word is said: the ground there sinks
 * into a bowl — and the longer it is held, the deeper it goes (one more layer every DRAWDOWN.EVERY
 * s, deepest in the middle). It holds at least 10 s; then until «стоп» or the mana is gone. Mana:
 * 5 at once and 1 a second; «Максима»: a wider bowl, 20 at once and 2 a second.
 *
 * Everything that stands on the ground goes down WITH it — never left hanging in the air: the whole
 * column of blocks above the sinking layer moves down (houses, castle walls, trees of blocks), the
 * trees of the start, chests, beds, doors and every collision box standing there go down with
 * it; creatures and players stand on the ground and come down as it sinks; things lying about wake
 * up and fall. Water, bedrock and a house under a sphere of protection don't move.
 *
 * No scroll: like «Earthquake» (the other spell of the ground) it is known by everybody.
 *
 * Who decides: the spell goes to everybody ('spell'); every computer runs the same bowl (the same
 * steps at the same time) and moves its own boxes and models; the HOST moves the blocks (they are
 * sent and saved). The caster's computer pays the mana; «стоп» or no mana — everybody stops ('stop').
 */

import * as THREE from 'three';
import { BLOCK, MIN_LAYER } from '../world/Terrain.js';

export const DRAWDOWN = {
    Drawdown: { r: 3.2, deep: 6, every: 1.5, drain: 1 },
    DrawdownMaxima: { r: 7, deep: 9, every: 1.3, drain: 2 },
    MIN_T: 10, // s it holds at least (the author: «держится минимум 10 секунд»)
    REACH: 30, // m: the ground the hand points at
    MAX_T: 600, // (a guard: nothing holds forever)
};

export const isDrawdown = (name) => name === 'Drawdown' || name === 'DrawdownMaxima';

/** How many layers deep the bowl is `dist` m from its middle at `level` (1, 2, … — one more each step). */
export function bowlDepth(name, dist, level) {
    const P = DRAWDOWN[name];
    if (!P || dist > P.r || level <= 0) return 0;
    const k = 1 - (dist / P.r) ** 2;
    return Math.max(0, Math.min(P.deep, Math.round(Math.min(level, P.deep) * k + 0.35)));
}

/** The level after t s of holding. */
export const levelAt = (name, t) => Math.min(DRAWDOWN[name].deep, 1 + Math.floor(t / DRAWDOWN[name].every));

/** Natural ground: where a column «stands» (everything above it — built, grown — goes down with it). */
const GROUND = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SNOW, BLOCK.SAND, BLOCK.FARMLAND, BLOCK.PATH, BLOCK.GRAVEL, BLOCK.DEEPSTONE]);

/** The top layer of natural ground in a column (scanning down from its top), or null. */
export function groundLayer(get, x, z, top) {
    for (let L = top; L > MIN_LAYER; L--) if (GROUND.has(get(x, L, z))) return L;
    return null;
}

/**
 * One layer down for the whole column: the block under the ground's top disappears and everything
 * above it (the ground, a house, a tree…) moves one layer down. → edits [[x, L, z, block], …] | null
 * (bedrock, water standing on it: it stays).
 */
export function sinkColumn(get, x, z, top) {
    const gL = groundLayer(get, x, z, top);
    if (gL == null) return null;
    const base = gL - 1;
    if (base <= MIN_LAYER + 1 || get(x, base, z) === BLOCK.BEDROCK) return null;
    if (get(x, gL + 1, z) === BLOCK.WATER) return null; // (a lake's bed: water doesn't sink with it)
    const edits = [];
    const hi = Math.max(top, gL) + 1;
    for (let L = base; L <= hi; L++) {
        const now = get(x, L, z), next = L < hi ? get(x, L + 1, z) : BLOCK.AIR;
        if (now !== next) edits.push([x, L, z, next]);
    }
    return { edits, gL };
}

/**
 * ON WHOM AND ON WHAT (CLAUDE.md). `does`: sink | none.
 */
export const DRAWDOWN_TARGETS = {
    me: { does: 'sink', why: 'стою на проседающей земле — опускаюсь вместе с ней (тело стоит на земле)' },
    players: { does: 'sink', why: 'все игроки на этой земле опускаются вместе с ней; не урон' },
    zombies: { does: 'sink', why: 'стоят на земле — опускаются с ней' },
    castlePeople: { does: 'sink', why: 'жители, рыцари — опускаются с землёй; разрушение замка (проседают стены) — порча: стража видит, люди пугаются (опасность «quake»)' },
    animals: { does: 'sink', why: 'опускаются с землёй' },
    sailors: { does: 'none', why: 'моряки на корабле: корабль на воде, а вода не проседает' },
    spider: { does: 'sink', why: 'стоит на земле — опускается с ней' },
    livingTrees: { does: 'sink', why: 'живое дерево стоит на земле — опускается с ней' },
    bookBirds: { does: 'none', why: 'летают — их не касается' },
    dragon: { does: 'sink', why: 'на земле — опускается с ней (в полёте — нет)' },
    phoenix: { does: 'none', why: 'в воздухе не касается; на земле — стоит на ней и опускается' },
    blocks: { does: 'sink', why: 'вся колонна блоков над проседающим слоем — земля, дома, стены, деревья из блоков — опускается целиком' },
    trees: { does: 'sink', why: 'деревья (и из блоков, и деревья у старта) опускаются вместе с землёй' },
    furniture: { does: 'sink', why: 'сундуки, кровати, двери и всё с коробкой столкновения опускаются вместе с землёй' },
    looseThings: { does: 'sink', why: 'вещи и оружие на земле просыпаются и падают на опустившуюся землю' },
    water: { does: 'none', why: 'дно озера и моря не проседает (вода не уходит вниз)' },
    bedrock: { does: 'none', why: 'коренная порода не проседает' },
    ships: { does: 'none', why: 'корабли на воде' },
    ward: { does: 'none', why: 'дом под сферой защиты не проседает' },
};

const _m = new THREE.Matrix4(), _v = new THREE.Vector3();

export class Drawdown {
    constructor(game) {
        this.game = game;
    }

    /** Voice on my computer: the raised hand (the wand) points at the ground. */
    cast(name, isFinal) {
        const g = this.game;
        if (name === 'Drawdown' && !isFinal) return null; // (wait: maybe «… Максима»)
        const now = performance.now();
        if (now - (this._lastAt || -1e9) < 1500) return null;
        if (this._mine?.life > 0) return null; // (one at a time: «стоп» ends it)
        const ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        const side = g.wandSide() || (ch.isArmRaised(pref) ? pref : ['right', 'left'].find((s) => ch.isArmRaised(s)));
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (!side || !ch.isArmRaised(side)) return hint('⬇️ Поднимите руку (палочку), направьте её на землю — и скажите «Drawdown»');
        const o = g.castOrigin(side), d = ch.getHandDirection(side);
        const hit = g.terrain?.data?.raycast(o, d, DRAWDOWN.REACH);
        if (!hit || d.y > -0.05) return hint('⬇️ Направьте руку <b>на землю</b> (не дальше 30 м) и скажите «Drawdown»');
        const at = new THREE.Vector3(hit.x, hit.y, hit.z);
        const tired = g.combat.check(name);
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay(name);
        this._lastAt = now;
        g.spells.cast(name, at, d, side, g.localId);
        g.sync?.spell(name, at, d, side);
        g.hud.setVoice('⬇️ Земля проседает… держите — чем дольше, тем глубже. «Стоп» — хватит', true);
        return name;
    }

    /** (every computer) the bowl sinks round `at` while it is held. */
    start(name, at, casterId) {
        const g = this.game;
        const P = DRAWDOWN[name];
        const cx = Math.round(at.x), cz = Math.round(at.z);
        const R = Math.ceil(P.r);
        const mine = casterId === g.localId || casterId === 'local';
        let t = 0, level = 0, rumble = 0;
        const sunk = new Map(); // column → layers already gone down
        const spell = {
            life: DRAWDOWN.MAX_T, held: true, by: casterId, kind: name,
            minT: DRAWDOWN.MIN_T, t: 0, // (SpellManager.stopBy: «стоп» before its 10 s ends it then)
            onUpdate: (sp, dt) => {
                t += dt;
                sp.t = t;
                if (sp.stopLater && t >= DRAWDOWN.MIN_T) { sp.life = 0; return; }
                // the caster pays while it holds (no mana: it stops — for everybody)
                if (mine && g.spells.hooks.drain && g.spells.hooks.drain(casterId, P.drain * dt, dt) === false) {
                    if (t >= DRAWDOWN.MIN_T) { sp.life = 0; g.hud.setVoice('⬇️ Мана кончилась — земля больше не проседает', true); g.sync?.stopSpells?.(); return; }
                }
                // the thread of magic from the hand to the ground
                const hp = g.handPose?.(casterId, mine ? (g.wandSide?.() || g.magicHand || 'right') : 'right');
                if (hp && Math.random() < 0.6) {
                    _v.lerpVectors(hp.origin, at, Math.random());
                    g.fx.spark(_v, 0xa0784a, 0.07, _v.set(0, -0.4, 0), 0.4);
                }
                const lv = levelAt(name, t);
                while (level < lv) { level++; this._step(name, at, cx, cz, R, level, sunk, casterId); }
                rumble -= dt;
                if (rumble <= 0 && level < P.deep) { rumble = 0.25; this._dust(at, P.r, 4); }
            },
        };
        if (mine) this._mine = spell;
        g.spells.spells.push(spell);
    }

    /** One more layer: every column whose bowl got deeper goes down. */
    _step(name, at, cx, cz, R, level, sunk, by) {
        const g = this.game;
        const data = g.terrain?.data;
        const get = data ? (x, L, z) => data.get(x, L, z) : null;
        const edits = [];
        let castle = 0, moved = 0;
        for (let x = cx - R; x <= cx + R; x++) {
            for (let z = cz - R; z <= cz + R; z++) {
                const key = x + ',' + z;
                const want = bowlDepth(name, Math.hypot(x - at.x, z - at.z), level);
                let have = sunk.get(key) || 0;
                while (have < want) {
                    have++;
                    moved++;
                    this._lowerThings(x, z); // (every computer: its boxes and models)
                    if (!g.authority || !get) continue;
                    const top = data.topLayer(x, z);
                    if (g.wards?.protects?.(x, top - 1, z)) continue; // (a house's sphere holds it)
                    const s = sinkColumn(get, x, z, top);
                    if (!s) continue;
                    for (const e of s.edits) {
                        if (e[3] >= BLOCK.CS_GREY && e[3] <= BLOCK.RUNE) castle++;
                        data.set(e[0], e[1], e[2], e[3]);
                        edits.push(e);
                    }
                }
                sunk.set(key, have);
            }
        }
        if (!moved) return;
        this._dust(at, DRAWDOWN[name].r, name === 'DrawdownMaxima' ? 22 : 12);
        g.sound?.playRumble?.() || (level === 1 && g.sound?.playExplosion?.(at, at, 0.4));
        const me = g.character?.group.position;
        if (me && me.distanceTo(at) < DRAWDOWN[name].r + 6) g.fx.shake = Math.max(g.fx.shake || 0, name === 'DrawdownMaxima' ? 0.5 : 0.3);
        if (!g.authority) return;
        // wake the things lying about there: they fall onto the ground that went down
        for (const L of g.items?.loose?.values() || []) if (L.model.position.distanceTo(at) < DRAWDOWN[name].r + 1.5) { L.rest = false; L.sentRest = false; }
        if (edits.length) g.builder?._sendEdits(edits);
        // the people near take fright; a castle sinking is damage done to it
        g.castleLife?.alarm?.(at, 'quake', by, DRAWDOWN[name].r);
        if (castle) g.castleLife?.damaged?.(at, by, castle, true, { r: DRAWDOWN[name].r, kind: 'quake' });
    }

    /** One column went a layer down: what stands on it here (boxes, chests, beds, doors, the start's trees) too. */
    _lowerThings(x, z) {
        const g = this.game;
        const col = g.collision;
        const inCol = (px, pz) => Math.abs(px - x) <= 0.5 && Math.abs(pz - z) <= 0.5;
        // (the whole column goes down: whatever box stands in it goes with it)
        for (const b of [...(col?.queryBoxes?.(x - 0.5, x + 0.5, z - 0.5, z + 0.5) || [])]) {
            if (!inCol((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2)) continue;
            b.minY -= 1; b.maxY -= 1;
        }
        for (const c of g.chests || []) if (inCol(c.mesh.position.x, c.mesh.position.z)) c.mesh.position.y -= 1;
        for (const b of g.beds?.list?.values() || []) if (b.model && inCol(b.model.position.x, b.model.position.z)) { b.model.position.y -= 1; if (b.y != null) b.y -= 1; }
        for (const d of g.doors?.list?.values() || []) if (d.model && inCol(d.x, d.z)) { d.model.position.y -= 1; d.y -= 1; }
        for (const w of g.weapons?.weapons || []) if (!w.holder && inCol(w.position.x, w.position.z)) w.wake?.();
        // the start's trees (drawn apart from the blocks)
        const W = g.world;
        for (const tr of W?.trees || []) {
            if (!tr.alive || !inCol(tr.x, tr.z)) continue;
            for (const mesh of [W.trunkMesh, W.leafMesh]) {
                if (!mesh) continue;
                mesh.getMatrixAt(tr.index, _m);
                _m.elements[13] -= 1;
                mesh.setMatrixAt(tr.index, _m);
                mesh.instanceMatrix.needsUpdate = true;
            }
            if (tr.crown) { tr.crown.minY -= 1; tr.crown.maxY -= 1; }
        }
    }

    _dust(at, r, n) {
        const fx = this.game.fx;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, d = r * (0.6 + Math.random() * 0.5);
            const x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
            fx.glow?.spawn(x, at.y + 0.3, z, -Math.cos(a) * 0.6, 0.6 + Math.random(), -Math.sin(a) * 0.6, [0x9a8466, 0x7d6a55, 0xb59a78][i % 3], 0.6 + Math.random() * 0.6, 1.3, { shrink: -0.4 });
            if (i % 2) fx.spark(_v.set(x, at.y + 0.2, z), 0x6b5440, 0.18, new THREE.Vector3(-Math.cos(a) * 1.5, 1.5 + Math.random() * 2, -Math.sin(a) * 1.5), 0.8);
        }
    }
}
