/**
 * TotalDestruction.js — «Total Destruction» («Тотал Дестракшн»).
 *
 * Point the raised hand (the wand) at a place and say the words. Nothing flies and
 * nothing glows: the ground there starts to tremble, the shaking grows, dust and
 * stones jump, the walls crack and crumble — and then everything built in the area
 * (castles, houses, walls, towers, trees) falls apart by itself and lies as ruins.
 * The ground sinks a little; no crater. Every creature in the area is thrown off
 * its feet and crushed — 5× «Бомбардо Максима».
 *
 *   - only for one whose mana MAXIMUM is 100 or more (in «Выживание»); 80 mana a cast;
 *   - outside Creative only from its scroll (a dark red ribbon, very rare);
 *   - «Total Destruction Maxima»: twice as strong (a wider circle, longer shaking, twice
 *     the harm); a mana maximum of 200, 160 mana a cast; learnt from the same scroll;
 *   - in a cave (or over one) the caves cave in: their ceilings break off and lie on
 *     their floors (Ruin.js);
 *   - multiplayer: the caster sends the place ('tdes'), every computer shakes and
 *     brings down the same blocks (Ruin.js is deterministic); the host hurts the
 *     creatures, everyone hurts himself.
 */

import { breaking } from '../world/EnchantedStone.js';
import * as THREE from 'three';
import { RUIN, ruinSample, hash01 } from '../world/Ruin.js';
import { keepIn } from './HouseWards.js';
import { BASE_COLORS, isCastleBlock } from '../world/Terrain.js';
import { DAMAGE, blastDamage } from './Damage.js';
const BLAST = DAMAGE.BlastPeak;
import { MAXIMA_POWER } from '../fx/SpellManager.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

export const TOTAL = {
    NAME: 'TotalDestruction',
    MIN_MAX_MANA: 100, // the mana maximum one must have
    COST: 80,
    POWER: 5 * MAXIMA_POWER, // 5× «Бомбардо Максима»
    RADIUS: RUIN.RADIUS,
    SHAKE: 3.4, // s the ground shakes before it all comes down
    FALL: 2.6, // s the blocks are seen falling
    RANGE: 160, // m: how far one can point it
    MAX_BLOCKS: 4000, // falling blocks drawn (more just turn to dust)
    // «Total Destruction Maxima»: twice as strong
    MAXIMA: { NAME: 'TotalDestructionMaxima', MIN_MAX_MANA: 200, COST: 160, RADIUS: 28, SHAKE: 4.4, HARM: 2 },
};

/** The numbers of one form of the spell. */
function form(max) {
    const M = TOTAL.MAXIMA;
    return max
        ? { name: M.NAME, label: 'Total Destruction Maxima', minMax: M.MIN_MAX_MANA, R: M.RADIUS, shake: M.SHAKE, harm: M.HARM }
        : { name: TOTAL.NAME, label: 'Total Destruction', minMax: TOTAL.MIN_MAX_MANA, R: TOTAL.RADIUS, shake: TOTAL.SHAKE, harm: 1 };
}

const G = 22;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const DUST = [0x9a8f80, 0x8a7d6c, 0xa89c8a, 0x7b7064];

export class TotalDestruction {
    constructor(game) {
        this.game = game;
        this.list = []; // destructions going on (mine and others')
        this.geo = new THREE.BoxGeometry(1, 1, 1);
        this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    }

    /** Is one of mine still going (one at a time)? */
    get busy() { return this.list.some((d) => d.mine && !d.done); }

    /**
     * The words heard: point the raised hand at the place.
     * @returns {string|null} the spell name when cast
     */
    cast(isFinal, name = TOTAL.NAME) {
        const g = this.game, ch = g.character;
        const max = name === TOTAL.MAXIMA.NAME, f = form(max);
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (this.busy) return null;
        if (!max && !isFinal) return null; // (wait: maybe «…Максима»)
        const c = g.combat;
        if (c?.enabled && (g.breakward?.cellMax(f.name, f.minMax, c.maxFatigue || 30) ?? (c.maxFatigue || 30)) < f.minMax) {
            return hint(`🔷 «${f.label}» подвластно только сильным магам: нужен <b>максимум маны ${f.minMax}</b> (у вас ${Math.floor(c.maxFatigue || 30)})`);
        }
        const terrain = g.world?.terrain;
        if (!terrain || !g.world.destructible) return hint(`🚫 Здесь «${f.label}» не работает`);
        const side = g.wandSide() || (ch.isArmRaised(g.magicHand || g.lastMagicHand || 'right') ? (g.magicHand || g.lastMagicHand || 'right') : ['right', 'left'].find((s) => ch.isArmRaised(s)));
        if (!side || !ch.isArmRaised(side)) return hint(`✋ Поднимите руку и <b>направьте её</b> на то, что должно рухнуть, — и скажите «${f.label}»`);
        const origin = g.castOrigin(side);
        const dir = ch.getHandDirection(side);
        const hit = terrain.raycast(origin, dir, TOTAL.RANGE);
        if (!hit) return hint('🎯 Направьте руку на землю, замок или дом — рука сейчас показывает в небо');
        const tired = c?.check(f.name);
        if (tired) { g.hud.setVoice(tired, true); return null; }
        c?.pay(f.name);
        const p = new THREE.Vector3(hit.x, hit.y, hit.z);
        if (g.breakward?.afterPay(f.name, f.minMax, p)) return null; // (метка «слом защиты»: ячеек не хватало — 23 % беды)
        this.start(p, g.localId, true, max);
        g.sync?.ruin?.(p, max);
        return f.name;
    }

    /** It begins at `p` (my cast, or another player's from the network). */
    start(p, by, mine = false, max = false) {
        const g = this.game;
        const data = g.world?.terrain?.data;
        const f = form(max);
        if (g.temple?.wards?.(p, f.R)) { g.temple.wardHit(p, f.R); g.sound?.playRumble?.(p, g.character.group.position); return null; } // (the Gods' temple: its golden ward)
        const d = { p: p.clone(), by, mine, max, ...f, P: TOTAL.POWER * f.harm, t: 0, done: false, collapsed: false, sample: data ? ruinSample(data, p.x, p.z, f.R, 400, p.y) : [], crash: 0 };
        this.list.push(d);
        g.sound?.playRumble?.(d.p, g.character.group.position);
        return d;
    }

    update(dt) {
        if (!this.list.length) return;
        for (const d of [...this.list]) {
            d.t += dt;
            if (!d.collapsed) {
                this._shake(d, dt);
                if (d.t >= d.shake) this._collapse(d);
            } else this._fall(d, dt);
            if (d.done) this.list.splice(this.list.indexOf(d), 1);
        }
    }

    // --------------------------------------------------------------- shaking
    _shake(d, dt) {
        const g = this.game, fx = g.fx, R = d.R;
        const k = Math.min(1, d.t / d.shake); // it grows
        // the camera: the ground trembles under my feet (felt far away too)
        const me = g.character.group.position;
        const dist = Math.hypot(me.x - d.p.x, me.z - d.p.z);
        const near = Math.max(0, 1 - Math.max(0, dist - R) / (R * 4));
        fx.shake = Math.max(fx.shake || 0, near * (0.25 + 1.1 * k) * (0.85 + Math.random() * 0.3));
        // dust lifts off the ground, little stones jump
        const data = g.world?.terrain?.data;
        const n = Math.random() < dt * (20 + 70 * k) ? 1 + Math.floor(k * 3) : 0;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
            const x = d.p.x + Math.cos(a) * r, z = d.p.z + Math.sin(a) * r;
            const y = data ? data.topLayer(Math.round(x), Math.round(z)) - 0.4 : d.p.y;
            const col = DUST[(Math.random() * DUST.length) | 0];
            fx.smoke.spawn(x, y + 0.2, z, (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 1.2 * k, (Math.random() - 0.5) * 0.8, col, 0.6 + Math.random() * 1.2, 1.6 + Math.random(), { shrink: -0.35, spin: 1 });
            fx.debris.spawn(x, y + 0.3, z, (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 3 * k, (Math.random() - 0.5) * 1.5, 0x6b5f52, 0.12 + Math.random() * 0.15, 1.2, { shrink: 0.1, fade: false, spin: 8 });
        }
        // the walls crack: chips and dust fall off them, more and more
        const s = d.sample;
        const m = s.length ? (Math.random() < dt * (10 + 60 * k) ? 1 + Math.floor(k * 2) : 0) : 0;
        for (let i = 0; i < m; i++) {
            const [x, L, z, t] = s[(Math.random() * s.length) | 0];
            const col = BASE_COLORS[t] ?? 0x888888;
            for (let j = 0; j < 2; j++) fx.debris.spawn(x + (Math.random() - 0.5), L - 1 + (Math.random() - 0.5), z + (Math.random() - 0.5), (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, col, 0.15 + Math.random() * 0.2, 2, { shrink: 0.1, fade: false, spin: 8 });
            if (Math.random() < 0.5) fx.smoke.spawn(x, L - 1, z, (Math.random() - 0.5) * 0.5, -0.3, (Math.random() - 0.5) * 0.5, DUST[(Math.random() * DUST.length) | 0], 0.5 + Math.random() * 0.6, 1.4, { shrink: -0.3, spin: 1 });
        }
        // a crack runs through stone now and then (a dull crunch), more often towards the end
        if (k > 0.35 && d.t > (d.nextCrack || 0)) {
            d.nextCrack = d.t + 0.9 - 0.6 * k + Math.random() * 0.3;
            if (s.length) { const [x, L, z] = s[(Math.random() * s.length) | 0]; g.sound?.playCrack?.(_p.set(x, L - 1, z), 0.6 + 0.8 * k); }
        }
    }

    // --------------------------------------------------------------- collapse
    _collapse(d) {
        const g = this.game, R = d.R, p = d.p;
        d.collapsed = true;
        d.t = 0;
        const authoritative = !!g.authority;
        // (a house's sphere of protection holds: what is inside stays — the sphere wears down instead)
        const keep = g.wards?.keepFor(p, R) || [];
        // (the enchanted stone: the plain one never breaks it, the Maxima only near its middle — EnchantedStone.js)
        const en = d.max ? 'TotalDestructionMaxima' : null;
        const out = breaking(en && g.world.terrain?.data, en, p.x, p.z, () => g.world.ruin(p, R, keepIn(keep)));
        g.explosions?.push({ p: [p.x, p.y, p.z], r: R, ruin: 1, ...(en ? { en } : {}), ...(keep.length ? { k: keep } : {}) }); // (saves and late joiners: the same ruins)
        g.wards?.struck(p, R, d.max ? 'TotalDestructionMaxima' : 'TotalDestruction', d.by); // (it breaks a house's sphere at once)
        for (const f of out.falls || []) g.falling?.add(f);
        g.wreck?.afterBlast(p, R, 99); // (nothing holds: the gates of a throne room break too)
        if (authoritative) {
            let wrecked = 0;
            for (const b of out.removed) if (isCastleBlock(b[3])) wrecked++;
            g.castleLife?.damaged(p, d.by, wrecked, true, { r: R, kind: 'ruin' });
        }
        // the blocks are seen falling down to where the ruins lie
        this._startFall(d, out);
        if (out.props?.length) g.fx.debrisFrom(out.props, p, 200);
        // a cloud of dust over the whole area
        const data = g.world.terrain?.data;
        for (let i = 0; i < 160; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
            const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
            const y = data ? data.topLayer(Math.round(x), Math.round(z)) : p.y;
            const gr = 120 + ((Math.random() * 50) | 0);
            g.fx.smoke.spawn(x, y + Math.random() * 6, z, Math.cos(a) * 2, 1 + Math.random() * 2.5, Math.sin(a) * 2, (gr << 16) | ((gr - 8) << 8) | (gr - 18), 1.6 + Math.random() * 2.2, 3 + Math.random() * 2.5, { shrink: -0.3, spin: 1 });
        }
        // …and in the caves under it (where a ceiling came down)
        if (data) for (const [x, L, z] of d.sample) {
            if (L >= data.topLayer(x, z) || Math.random() < 0.5) continue;
            for (let i = 0; i < 2; i++) g.fx.smoke.spawn(x + (Math.random() - 0.5) * 3, L - 2 - Math.random() * 2, z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.5, -0.5 + Math.random(), (Math.random() - 0.5) * 1.5, DUST[(Math.random() * DUST.length) | 0], 1.2 + Math.random() * 1.5, 3 + Math.random() * 2, { shrink: -0.3, spin: 1 });
        }
        const me = g.character.group.position;
        g.sound?.playExplosion?.(p, me, 3);
        const dist = Math.hypot(me.x - p.x, me.z - p.z);
        g.fx.shake = Math.max(g.fx.shake || 0, 2.2 * Math.max(0, 1 - Math.max(0, dist - R) / (R * 4)));
        g.books?.hitAt?.(p, R);
        g.houses?.hitAt?.(p, R);
        this._unburyAll(d, authoritative); // (a cave's heap of stones fell where someone stood: on top of it)
        this._hurtMe(d);
        if (authoritative) this._hurtCreatures(d);
        // the weapons lying there jump
        for (const w of g.weapons?.weapons || []) {
            if (w.holder || Math.hypot(w.position.x - p.x, w.position.z - p.z) > R + 2) continue;
            w.hover = null;
            w.wake();
            if (!w.remoteTarget) {
                w.velocity.add(_v.set((Math.random() - 0.5) * 4, 4 + Math.random() * 4, (Math.random() - 0.5) * 4));
                w.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
            }
        }
        if (d.mine) g.mana?.success(d.name); // (it worked)
    }

    /** Feet at `feet` in the stones: where they stand on top of them (null: free already). */
    _onTop(x, z, feet) {
        const T = this.game.world.terrain?.data;
        if (!T) return null;
        const ix = Math.round(x), iz = Math.round(z);
        let L = Math.floor(feet + 1.5 + 1e-3);
        const L0 = L;
        while (L - L0 < 24 && T.solidIn(ix, iz, L, L + 2)) L++;
        return L > L0 ? L - 1.5 : null;
    }

    /** Whoever stood where the stones came down now stands on them (never inside the rock). */
    _unburyAll(d, authoritative) {
        const g = this.game, R = d.R + 4, p = d.p;
        const near = (x, z) => Math.abs(x - p.x) < R && Math.abs(z - p.z) < R;
        const me = g.character.group.position;
        if (near(me.x, me.z)) {
            const f = this._onTop(me.x, me.z, me.y - PLAYER_GROUND_OFFSET);
            if (f != null) { me.y = f + PLAYER_GROUND_OFFSET; g._lastFree?.copy(me); }
        }
        if (!authoritative) return;
        for (const z of g.zombies || []) {
            const q = z.group?.position;
            if (!q || z.isDead || !near(q.x, q.z)) continue;
            const f = this._onTop(q.x, q.z, q.y - 1.0);
            if (f != null) q.y = f + 1.0;
        }
        for (const v of g.castleLife?.byId?.values() || []) {
            if (v.dead || !near(v.x, v.z)) continue;
            const f = this._onTop(v.x, v.z, v.y);
            if (f != null) v.y = f;
        }
        for (const a of g.animals?.list || []) {
            const q = a.group?.position;
            if (!q || a.dead || !near(q.x, q.z)) continue;
            const f = this._onTop(q.x, q.z, q.y - 0.5);
            if (f != null) q.y = f + 0.5;
        }
    }

    /** The ground jumps under my feet and the walls fall on me. */
    _hurtMe(d) {
        const g = this.game, R = d.R, p = d.p, harm = d.harm;
        if (g.isDeadLocal) return;
        const me = g.character.group.position;
        const dist = Math.hypot(me.x - p.x, me.z - p.z);
        if (dist > R + 3 || Math.abs(me.y - 2 - p.y) > 30) return;
        const k = 1 - dist / (R + 3);
        if (!g.flight?.active) {
            _v.set(me.x - p.x, 0, me.z - p.z);
            if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1);
            g.impact?.apply({ v: _v.normalize().multiplyScalar(3 + 6 * k), from: null, by: d.by, spell: d.name, always: { down: 3 * harm }, toss: (3 + 5 * k) * Math.sqrt(harm), jolt: 3 * k, down: 3 * harm });
        }
        // 5× «Бомбардо Максима» (a shield takes part of it)
        let dmg = blastDamage(dist, R, d.P); // (the same blast for every body: 8 × power at the centre)
        const c = g.combat, s = c?.shield;
        if (s && s.left > 0 && c._payHit(d.name)) dmg *= s.type === 2 ? 0.25 : 0.5; // (half its mana; out of mana: shattered — all of it)
        dmg = Math.round(dmg);
        if (dmg <= 0) return;
        const by = d.by === g.localId ? null : d.by;
        if (c?.enabled) c.damage(dmg, by, d.name);
        else g.damageLocalPlayer?.(dmg);
    }

    /** (host) Every creature in the area: off its feet, crushed. */
    _hurtCreatures(d) {
        const g = this.game, R = d.R, P = d.P, p = d.p, by = d.by;
        const reach = R + 3;
        for (const z of g.zombies || []) {
            if (z.isDead) continue;
            const zp = z.group.position;
            const dd = Math.hypot(zp.x - p.x, zp.z - p.z);
            if (dd > reach || Math.abs(zp.y - p.y) > 30) continue;
            const k = 1 - dd / reach;
            const dir = new THREE.Vector3(zp.x - p.x, 0, zp.z - p.z);
            if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
            dir.normalize();
            g.damageZombie(z, Math.max(2, Math.round(blastDamage(dd, R, P))), false, dir, null);
            z.velocity?.addScaledVector(dir, 4 * k);
            z.vy = Math.max(z.vy || 0, 3 + 6 * k);
        }
        const at = new THREE.Vector3(p.x, p.y, p.z);
        g.animals?.hitAt(at, R, BLAST * P, by);
        g.spiders?.hitAt(at, R, BLAST * P, d.name, by);
        g.dragons?.hitAt(at, R, BLAST * P, 'TotalDestruction', by);
        g.iceCastle?.hitAt(at, R, BLAST * P, 'TotalDestruction', by); // (a scroll's spell: it hurts the queen too)
        g.phoenixes?.hitAt(at, R, BLAST * P, d.name, by);
        g.owls?.hitAt(at, R, BLAST * P, d.name, by); // (a scroll's spell: it kills an owl)
        g.canaries?.hitAt(at, R, BLAST * P, d.name, by); // (a canary: the blast hurts it, the camp turns on the caster)
        g.gargoyles?.hitAt(at, R, BLAST * P, d.name, by); // (an infernal gargoyle: the blast breaks stone)
        g.castleLife?.hitAt(at, R, BLAST * P, by);
        g.crystals?.hitAt?.(at, R, by, d.name); // (mana crystals in it crack: their power to the caster)
        g.livingTrees?.hitAt(at, R, BLAST * P, d.name); // (the mightiest spells break a living tree too, not only fire)
        g.ships?.blast?.(at, R, P, by);
        g.ships?.crew?.hitAt(at, R, BLAST * P, by, d.name);
        g.creatureImpact?.spellArea(d.name, by, (c) => {
            const dd = Math.hypot(c.x - p.x, c.z - p.z);
            if (dd > reach || Math.abs(c.y - p.y) > 30) return null;
            const v = new THREE.Vector3(c.x - p.x, 0, c.z - p.z);
            if (v.lengthSq() < 1e-6) v.set(1, 0, 0);
            return v.normalize().multiplyScalar(3 + 6 * (1 - dd / reach));
        }, { from: p.clone(), noSlide: (c) => !c.isVillager });
    }

    // ------------------------------------------------- the blocks falling down
    _startFall(d, out) {
        const g = this.game, data = g.world.terrain?.data;
        const all = out.removed || [];
        const step = Math.max(1, all.length / (d.maxBlocks || TOTAL.MAX_BLOCKS));
        const cells = [];
        for (let i = 0; i < all.length; i += step) cells.push(all[Math.floor(i)]);
        // the rubble is in the data already: drawn when the blocks have come down on it
        d.rubbleKeys = (out.rubble || []).map(([x, L, z]) => `${x},${L},${z}`);
        if (d.rubbleKeys.length) data?.hideCells?.(d.rubbleKeys);
        if (!cells.length) return;
        const mesh = new THREE.InstancedMesh(this.geo, this.mat, cells.length);
        mesh.castShadow = !d.band; // (a wave's bands: many at once — no shadows)
        mesh.frustumCulled = false;
        d.blocks = cells.map(([x, L, z, t], i) => {
            mesh.setColorAt(i, _c.setHex(BASE_COLORS[t] ?? 0x888888));
            const h = hash01(x, L, z, 21);
            const floor = data ? data.floorBelow(x, z, L) : L - 4; // (where it comes down: the ruins, a cave's floor)
            return {
                x, y: L - 1, z, vx: (hash01(x, L, z, 22) - 0.5) * 2.4, vy: 0, vz: (hash01(x, L, z, 23) - 0.5) * 2.4,
                wait: h * 0.9 + Math.max(0, 6 - (L - floor)) * 0.02, // (it crumbles: not all at once)
                to: floor, rx: 0, ry: 0, rz: 0, sx: (hash01(x, L, z, 24) - 0.5) * 6, sz: (hash01(x, L, z, 25) - 0.5) * 6,
                size: 1, t, gone: false,
            };
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        g.scene.add(mesh);
        d.mesh = mesh;
        this._draw(d);
    }

    _fall(d, dt) {
        const g = this.game;
        if (d.blocks) {
            let left = 0, puffs = 0;
            for (const b of d.blocks) {
                if (b.gone) continue;
                left++;
                if (d.t < b.wait) continue;
                b.vy -= G * dt;
                b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
                b.rx += b.sx * dt; b.rz += b.sz * dt;
                if (b.y <= b.to) {
                    b.gone = true;
                    // it breaks on the ruins: dust and a few chips
                    if (puffs++ < 6) {
                        g.fx.smoke.spawn(b.x, b.to + 0.3, b.z, (Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5, DUST[(Math.random() * DUST.length) | 0], 1 + Math.random() * 1.2, 2 + Math.random(), { shrink: -0.3, spin: 1 });
                        g.fx.debris.spawn(b.x, b.to + 0.4, b.z, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, BASE_COLORS[b.t] ?? 0x888888, 0.3 + Math.random() * 0.25, 1.5, { shrink: 0.12, fade: false, spin: 10 });
                    }
                }
            }
            this._draw(d);
            // crash after crash while it comes down
            if (d.crash < 4 && d.t > d.crash * 0.45 + 0.3) { d.crash++; g.sound?.playExplosion?.(d.p, g.character.group.position, 1 + Math.random()); }
            if (!left || d.t > TOTAL.FALL + 2.5) this._endFall(d);
        } else if (d.t > 0.5) this._endFall(d);
        if (d.rubbleKeys && d.t > 1.3) { g.world.terrain?.data?.showCells?.(d.rubbleKeys); d.rubbleKeys = null; }
    }

    _draw(d) {
        const mesh = d.mesh;
        if (!mesh) return;
        d.blocks.forEach((b, i) => {
            if (b.gone) _m.makeScale(0, 0, 0);
            else _m.compose(_p.set(b.x, b.y, b.z), _q.setFromEuler(_e.set(b.rx, b.ry, b.rz)), _s.setScalar(b.size));
            mesh.setMatrixAt(i, _m);
        });
        mesh.instanceMatrix.needsUpdate = true;
    }

    _endFall(d) {
        if (d.mesh) { this.game.scene.remove(d.mesh); d.mesh.dispose(); d.mesh = null; }
        if (d.rubbleKeys) { this.game.world.terrain?.data?.showCells?.(d.rubbleKeys); d.rubbleKeys = null; }
        d.done = true;
    }

    /** Everything going on ends now (a new world, the game ends). */
    clear() {
        for (const d of this.list) this._endFall(d);
        this.list = [];
    }
}
