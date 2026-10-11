/**
 * WaterStorm.js — «Water Vortex Super Maxima»: the water's answer to «Let the Hellfire Come».
 *
 *   Casting      the wand in the hand (Creative: a bare hand too), standing by a river, a lake or
 *                the sea, the wand AIMED AT THE WATER + «Water Vortex Super Maxima» («вотер вортекс
 *                супер максима»). There must be a lot of water there (at least 150 m³ in reach):
 *                a puddle or a brook is not enough.
 *   Mana         (the free world) a mana maximum of 100+; 80 at once, 2 a second while it is held;
 *                «стоп» costs 50 (without 50 it goes on until the mana runs out). The first time it
 *                really does something (sweeps a creature away, puts out a fire) the mana maximum
 *                grows by 10 — once, for good. Creative: no mana rules.
 *   The water    is TAKEN from that river / lake / sea: the water there visibly sinks and empties
 *                (nearest and highest first) as the mass grows; it comes back when the spell ends.
 *   The mass     a huge, churning, pulsing mass of water stands where the wand points and flows
 *                after it (a stretched arm: further, up to 18 m; bent: nearer). It grows while held
 *                (more water drawn), the hands spread apart make it bigger still. Whatever it
 *                reaches is swept away, knocked down and drowns — every creature, the caster too if
 *                he turns it onto himself.
 *   The storm    the wand hand going round and round: the water circles round the caster — a wild
 *                storm of water, bands of waves and waterspouts racing round as fast as the hand
 *                goes, sweeping and drowning everything round the caster. The hand stops and points:
 *                the water flows back to where it points.
 *   Fire         it PUTS OUT FIRE: the Hellfire's blaze, ring and leftover fires, burning trees and
 *                blocks, campfires, Inferno streams (they hiss into steam on it), burning living trees.
 *   The end      «стоп» (50 mana), no mana, the wand gone: the water falls — a great splash and a
 *                flood wave that knocks down whoever is near and spreads out, then drains away; the
 *                river / lake fills back up.
 *   Network      the caster's storm is sent ~10×/s ('ws'); every computer draws it, takes the same
 *                water blocks (the same order from the same source), puts out its fires and pushes its
 *                own player; the host sweeps the creatures.
 */

import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';
import { SwingMeter } from './WaterVortex.js';
import { blazeReach, inBlaze } from './Hellfire.js';

export const STORM = {
    NAME: 'WaterVortexSuperMaxima',
    MIN_MAX_MANA: 100,
    COST: 80,
    DRAIN: 2,
    STOP_COST: 50,
    REWARD: 10,
    MIN_WATER: 150, // m³ (water blocks) in reach of the place pointed at
    SRC_R: 12, // m round the place pointed at: the water it may take…
    SRC_DEPTH: 7, // …down to this many blocks
    MAX_VOLUME: 420, // m³ at most in the mass
    V0: 30, // m³ drawn the moment it is called
    GATHER: 45, // m³ a second drawn while it is held
    TAKE_PER_FRAME: 16, // water blocks taken out of the river in one frame at most
    FOLLOW: 5,
    SPEED: 14,
    R_MIN: 1.2,
    R_MAX: 7,
    RING_RATE: 0.25,
    RING_IN: 1.3,
    RING_OUT: 0.7,
    RING_HOLD: 0.7,
    RING_W: 2.4, // m: the storm's band of water
    RING_H: 4.5,
    TICK: 0.3, // s between sweeps
    SWEEP_EVERY: 0.9, // s: the same creature is swept again at most this often
    SWEEP_VOLUME: 30, // (the push of a vortex this big: knocks down — WaterVortex.pushOf)
    CREATURE_DMG: 1, // drowning, a sweep
    PLAYER_TICK: 0.6,
    PLAYER_DMG: 1,
    SHIELD: 0.5,
    FLOOD_R: 5, // m beyond the mass the falling water reaches
    FLOOD_TIME: 2.2, // s the flood wave runs
    REFILL_DELAY: 1.6, // s after the fall the river starts filling back…
    REFILL_PER_FRAME: 24, // …this many blocks a frame
    MAX_LIFE: 90,
    SEND: 0.1,
    STALE: 1.5,
};

const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---------------------------------------------------------------- the rules (pure)
/** May it be cast? null = yes; 'max' (maximum under 100), 'mana' (not 80 now). */
export function stormBlock({ enabled, max, mana }) {
    if (!enabled) return null;
    if (!((max ?? 0) >= STORM.MIN_MAX_MANA)) return 'max';
    if (!((mana ?? 0) >= STORM.COST)) return 'mana';
    return null;
}

/** May «стоп» end it (free world: 50 mana)? */
export const stormCanStop = ({ enabled, mana }) => !enabled || (mana ?? 0) >= STORM.STOP_COST;

/** Mana the held storm takes in `dt` s. */
export const stormDrain = (dt) => STORM.DRAIN * Math.max(0, dt);

/** The first time it really worked: +10 to the mana maximum, once (mutates `bonus`). */
export function stormReward(bonus) {
    if (!bonus || bonus.waterStorm) return 0;
    bonus.waterStorm = true;
    bonus.fatigue = (bonus.fatigue || 0) + STORM.REWARD;
    return STORM.REWARD;
}

/** Is there water enough here? */
export const enoughWater = (count) => count >= STORM.MIN_WATER;

/** The mass's radius for `volume` m³, the hands `spread` m apart (null: one hand). */
export function massRadius(volume, spread = null) {
    const r = Math.cbrt((3 * Math.max(0, volume)) / (4 * Math.PI));
    const k = spread == null ? 1 : clamp(0.65 + spread * 0.55, 0.8, 1.35);
    return clamp(r * k, STORM.R_MIN, STORM.R_MAX);
}

/** The storm's radius round the caster for a mass of radius R. */
export const stormRadius = (R) => clamp(3.2 + R * 0.5, 3.6, 7.5);

/** Is a body at p in the storm round c (the caster) of radius rr? */
export function inStorm(c, rr, p, bodyR = 0.5) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (Math.abs(d - rr) > STORM.RING_W / 2 + bodyR) return false;
    return p.y > c.y - 2.5 && p.y < c.y + STORM.RING_H;
}

/**
 * The water blocks a storm may take from the place `src` points at, in the order it takes them
 * (the highest layer first, nearest first): the same list on every computer.
 * @param {{get(x, L, z): number}} data  the terrain's blocks
 * @returns {{list: number[][], count: number}} list of [x, L, z]; count: all the water in reach
 */
export function waterInReach(data, src) {
    const sx = Math.round(src.x), sz = Math.round(src.z);
    let top = Math.floor(src.y + 1.5);
    for (let k = 0; k < 4 && data.get(sx, top + 1, sz) === BLOCK.WATER; k++) top++;
    for (let k = 0; k < 4 && data.get(sx, top, sz) !== BLOCK.WATER; k++) top--;
    const R = STORM.SRC_R, out = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        for (let L = top + 1; L >= top - STORM.SRC_DEPTH; L--) if (data.get(sx + dx, L, sz + dz) === BLOCK.WATER) out.push([sx + dx, L, sz + dz, d2]);
    }
    out.sort((a, b) => (b[1] - a[1]) || (a[3] - b[3]) || (a[0] - b[0]) || (a[2] - b[2]));
    const count = out.length;
    return { list: out.slice(0, STORM.MAX_VOLUME).map((e) => [e[0], e[1], e[2]]), count };
}

// ------------------------------------------------------------------ the look
const WATER = [0x7cc4ff, 0xa9dcff, 0xe6f6ff, 0x5aaef0];
const FOAM = [0xffffff, 0xeaf6ff, 0xd9efff];
const pick = (a) => a[(Math.random() * a.length) | 0];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const r2 = (v) => Math.round(v * 100) / 100;

/** Closest distance from p to the segment a–b. */
function segDist(p, a, b) {
    const ab = _d.subVectors(b, a);
    const L = ab.lengthSq();
    const k = L > 1e-9 ? clamp(_e.subVectors(p, a).dot(ab) / L, 0, 1) : 0;
    return _e.copy(a).addScaledVector(ab, k).distanceTo(p);
}

// the mass's water: fixed places in a ball (the same every frame: it churns, it does not flicker)
const BALL = [];
for (let i = 0; i < 360; i++) {
    const h = Math.sin(i * 12.9898) * 43758.5453, u = h - Math.floor(h);
    const h2 = Math.sin(i * 78.233) * 12345.6789, v = h2 - Math.floor(h2);
    const h3 = Math.sin(i * 39.425) * 24634.6345, w = h3 - Math.floor(h3);
    const y = 1 - 2 * u, rr = Math.sqrt(1 - y * y), a = v * TAU;
    BALL.push({ x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, r: Math.cbrt(0.15 + 0.85 * w), a, ph: w * TAU });
}

export class WaterStorm {
    constructor(game) {
        this.game = game;
        this.state = null; // my storm
        this.remote = new Map(); // by -> another wizard's storm
        this.floods = []; // falling water spreading out (everyone's)
        this.refills = []; // rivers filling back: {list, n, at}
        this.meter = new SwingMeter();
        this.log = [];
        this._t = 0;
        this._sendT = 0;
        this._sent = false;
        this._acc = { spray: 0, foam: 0, mist: 0, flow: 0 };
        this.blobs = null;
        // the vortex's own water material (the same shader: nothing compiles mid-game)
        const mat = game.vortex?.blobMat, geo = game.vortex?.blobGeo;
        if (game.scene && mat && geo) {
            this.blobs = new THREE.InstancedMesh(geo, mat, 2400);
            this.blobs.count = 0;
            this.blobs.visible = false;
            this.blobs.frustumCulled = false;
            this.blobs.renderOrder = 2;
            game.scene.add(this.blobs);
        }
    }

    get me() { return this.game.localId; }
    get busy() { return !!this.state; }

    _note(e) {
        this.log.push({ t: Math.round(this._t * 100) / 100, ...e });
        if (this.log.length > 60) this.log.shift();
    }

    _hint(text, isFinal = true) {
        if (isFinal) this.game.hud?.setVoice?.(text, true);
        return null;
    }

    _castSide() {
        const g = this.game;
        const w = g.items?.heldOf?.('wand');
        if (w) return w.side;
        if (g.config?.mode !== 'creative' && g.config?.mode !== 'test') return null;
        const ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        for (const s of [pref, pref === 'right' ? 'left' : 'right']) if (ch.isArmRaised?.(s)) return s;
        return pref;
    }

    // ================================================================ voice
    cast(isFinal = true) {
        const g = this.game;
        if (this.state) return null;
        if (this._t - (this._endAt ?? -9) < 2.5) return null;
        const side = this._castSide();
        if (!side) return this._hint('🪄 «Water Vortex Super Maxima» вызывается только <b>волшебной палочкой в руке</b>', isFinal);
        const src = g.vortex?._pointedWater?.(side);
        if (!src) return this._hint('🌊 Встаньте у реки, озера или моря и покажите палочкой прямо <b>на воду</b> — тогда скажите «Water Vortex Super Maxima»', isFinal);
        const data = g.terrain?.data;
        const w = data ? waterInReach(data, src) : { list: [], count: 0 };
        if (!enoughWater(w.count)) return this._hint(`🌊 Здесь мало воды (${w.count} м³) — нужно не меньше ${STORM.MIN_WATER}: большая река, озеро или море`, isFinal);
        const c = g.combat;
        const why = stormBlock({ enabled: !!c?.enabled, max: c?.maxFatigue || 30, mana: c?.fatigue ?? 0 });
        if (why === 'max') return this._hint(`🌊 Такая буря подвластна только сильным магам: нужен <b>максимум маны ${STORM.MIN_MAX_MANA}</b> (у вас ${Math.floor(c.maxFatigue || 30)})`, isFinal);
        const tired = c?.check(STORM.NAME);
        if (tired || why) return this._hint(tired || `😮‍💨 Не хватает маны: нужно ${STORM.COST}`, true);
        c?.pay(STORM.NAME);
        g._manaLater = true; // (mana: it counts when it really does something)
        const ch = g.character;
        const o = g.castOrigin ? g.castOrigin(side) : ch.getHandWorldPosition(side);
        const d = ch.getPointingDirection ? ch.getPointingDirection(side) : ch.getHandDirection(side);
        this.meter.reset();
        const srcI = [Math.round(src.x), Math.floor(src.y + 1.5), Math.round(src.z)];
        this.state = {
            side, t: 0, o: o.clone(), d: d.clone().normalize(), src: src.clone(), srcI, list: w.list, drawn: 0,
            V: 0, R: STORM.R_MIN, c: src.clone().add(_a.set(0, 1.5, 0)), target: new THREE.Vector3(), vel: new THREE.Vector3(),
            k: 0, ang: 0, spin: 1.5, rr: stormRadius(STORM.R_MIN), ringT: 0, tickT: 0, meT: 0, pushT: 0, roarT: 0, worked: false, swept: new Map(),
        };
        this._note({ ev: 'cast', side, water: w.count });
        g.sound?.playWaterRise?.();
        g.hud?.setVoice?.('🌊 <b>Water Vortex Super Maxima!</b> Вода поднимается из реки и идёт за палочкой: рука дальше — вода дальше, руки шире — больше. <b>Крутите рукой</b> — водяная буря вокруг вас. «Стоп» — 50 маны', true);
        return STORM.NAME;
    }

    /** «Стоп»: 50 mana (free world). @returns true / 'mana' / false */
    sayStop() {
        if (!this.state) return false;
        const c = this.game.combat;
        if (!stormCanStop({ enabled: !!c?.enabled, mana: c?.fatigue })) {
            this._note({ ev: 'cantStop' });
            this.game.hud?.setVoice?.(`🌊 Остановить бурю словом «стоп» стоит <b>${STORM.STOP_COST} маны</b> — у вас ${Math.floor(c.fatigue)}. Она бушует, пока не кончится мана`, true);
            return 'mana';
        }
        if (c?.enabled) c.fatigue = Math.max(0, c.fatigue - STORM.STOP_COST);
        return this.stop('stop');
    }

    /** It ends: the water falls (a flood wave), the river fills back. */
    stop(why = 'stop') {
        if (!this.state) return false;
        const s = this.state;
        this.state = null;
        this._endAt = this._t;
        this._note({ ev: 'end', why });
        this._fall(this.me, s, this.game.character.group.position);
        this._send(null, why);
        const say = { mana: '🌊 Мана кончилась — вода обрушилась', stop: `🛑 Буря остановлена (−${STORM.STOP_COST} маны) — вода обрушилась`, wand: '🌊 Палочка не в руке — вода обрушилась' }[why];
        if (say) this.game.hud?.setVoice?.(say, true);
        return true;
    }

    // ================================================================ update
    update(dt) {
        if (!(dt > 0)) return;
        this._t += dt;
        this._n = 0;
        if (this.state) this._updateMine(dt);
        for (const [by, f] of this.remote) {
            if (this._t - f.at > STORM.STALE) { this._fall(by, f, f.body); this.remote.delete(by); continue; }
            this._updateRemote(f, dt);
        }
        this._updateFloods(dt);
        this._updateRefills();
        if (this.blobs) {
            this.blobs.count = this._n;
            this.blobs.visible = this._n > 0;
            if (this._n) this.blobs.instanceMatrix.needsUpdate = true;
        }
    }

    _updateMine(dt) {
        const g = this.game, s = this.state, ch = g.character, c = g.combat;
        if (c?.dead || g.isDeadLocal || c?.frozen || c?.stunned) { this.stop('down'); return; }
        if (!this._castSide()) { this.stop('wand'); return; }
        const w = g.items?.heldOf?.('wand');
        if (w && w.side !== s.side) s.side = w.side;
        if (c && (c.drain(stormDrain(dt), dt) === false || (c.enabled && c.fatigue <= 1e-6))) { this.stop('mana'); return; }
        s.t += dt;
        if (s.t > STORM.MAX_LIFE) { this.stop('time'); return; }
        const side = s.side;
        if (g.castOrigin) g.castOrigin(side, s.o); else ch.getHandWorldPosition(side, s.o);
        (ch.getPointingDirection ? ch.getPointingDirection(side, s.d) : ch.getHandDirection(side, s.d)).normalize();
        // the water drawn out of the river: more and more while it is held
        const body = ch.group.position;
        const near = s.src.distanceTo(body) < 40;
        if (near) s.V = Math.min(s.list.length, STORM.MAX_VOLUME, s.V + (s.t < 0.05 ? STORM.V0 : STORM.GATHER * dt));
        this._take(s, Math.floor(s.V));
        s.R += (massRadius(s.drawn, this._spread()) - s.R) * Math.min(1, dt * 2);
        // the mass flows after the wand
        this._aim(s.o, s.d, blazeReach(this._stretch(side)), s.R, s.target);
        _a.subVectors(s.target, s.c).multiplyScalar(1 - Math.exp(-STORM.FOLLOW * dt));
        if (_a.length() > STORM.SPEED * dt) _a.setLength(STORM.SPEED * dt);
        s.vel.copy(_a).divideScalar(dt);
        s.c.add(_a);
        // the hand going round: the storm round the caster
        const hand = ch.getHandWorldPosition(side, _b).sub(body);
        this.meter.push(this._t, hand);
        const rate = this.meter.rate;
        if (rate > STORM.RING_RATE && this.meter.speed > 0.4) s.ringT = STORM.RING_HOLD; else s.ringT -= dt;
        const k0 = s.k;
        s.k = s.ringT > 0 ? Math.min(1, s.k + STORM.RING_IN * dt) : Math.max(0, s.k - STORM.RING_OUT * dt);
        if (k0 < 0.5 && s.k >= 0.5) { this._note({ ev: 'ring' }); g.hud?.setVoice?.('🌊 Водяная буря! Крутите рукой — она мчится вокруг вас и сметает всех рядом', true); }
        s.spin += (Math.max(1.2, rate * TAU * 1.15) - s.spin) * Math.min(1, dt * 2.5);
        s.ang += s.spin * dt;
        s.rr = stormRadius(s.R);
        s.roarT -= dt;
        if (s.roarT <= 0) { s.roarT = 1.4; g.sound?.playSplash?.(); }
        s.tickT -= dt;
        if (s.tickT <= 0) {
            s.tickT = STORM.TICK;
            if (this._act(this.me, s, body)) this._worked(s);
        }
        this._hitMe(s, body, dt);
        this._sendT += dt;
        if (this._sendT >= STORM.SEND) {
            this._sendT = 0;
            this._send([r2(s.c.x), r2(s.c.y), r2(s.c.z), r2(s.R), r2(s.k), r2(s.ang), r2(s.spin), r2(s.rr), r2(s.o.x), r2(s.o.y), r2(s.o.z), r2(body.x), r2(body.y), r2(body.z), s.srcI[0], s.srcI[1], s.srcI[2], s.drawn]);
        }
        this._draw(dt, s, body);
    }

    /** Take the river's water out up to `n` blocks (the same blocks on every computer). */
    _take(f, n) {
        const data = this.game.terrain?.data;
        if (!data || !f.list) return;
        n = Math.min(n, f.list.length);
        let k = 0;
        while (f.drawn < n && k++ < STORM.TAKE_PER_FRAME) {
            const [x, L, z] = f.list[f.drawn++];
            if (data.get(x, L, z) === BLOCK.WATER) data.set(x, L, z, BLOCK.AIR);
            else f.list[f.drawn - 1] = null; // (not water any more: nothing to give back)
        }
    }

    _stretch(side) {
        const ch = this.game.character;
        const anchor = side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor;
        const len = (ch.BONE_LENGTH_UPPER || 0.3) + (ch.BONE_LENGTH_LOWER || 0.3);
        if (!anchor || !(len > 0)) return 0.5;
        const sh = anchor.getWorldPosition(_c);
        return clamp((ch.getHandWorldPosition(side, _d).distanceTo(sh) / len - 0.45) / 0.47, 0, 1);
    }

    _spread() {
        const ch = this.game.character;
        if (ch.handLost?.('left') || ch.handLost?.('right')) return null;
        return ch.getHandWorldPosition('left', _c).distanceTo(ch.getHandWorldPosition('right', _d));
    }

    _aim(o, d, reach, R, out) {
        const g = this.game;
        let t = reach;
        for (let k = 0.5; k < reach; k += 0.5) {
            const x = o.x + d.x * k, y = o.y + d.y * k, z = o.z + d.z * k;
            const gy = g.collision?.groundY ? g.collision.groundY(x, z) : -Infinity;
            if ((g._flameBlock && g._flameBlock(x, y, z) === 'solid') || y < gy) { t = Math.max(0.4, k - 0.3); break; }
        }
        out.copy(o).addScaledVector(d, t);
        const gy = g.collision?.groundY ? g.collision.groundY(out.x, out.z) : -Infinity;
        if (out.y < gy + R * 0.6) out.y = gy + R * 0.6;
        return out;
    }

    /** The water as spheres (it stops a flame; the Hellfire hisses out in it). */
    spheres(out = []) {
        const put = (f, body) => {
            if (1 - f.k > 0.2) out.push({ x: f.c.x, y: f.c.y, z: f.c.z, r: f.R });
            if (f.k > 0.2) for (let i = 0; i < 10; i++) {
                const a = f.ang + i * (TAU / 10);
                out.push({ x: body.x + Math.cos(a) * f.rr, y: body.y - 0.5, z: body.z + Math.sin(a) * f.rr, r: STORM.RING_W * 0.5 + 0.9 });
            }
        };
        if (this.state) put(this.state, this.game.character.group.position);
        for (const f of this.remote.values()) put(f, f.body);
        for (const fl of this.floods) if (fl.t < STORM.FLOOD_TIME) out.push({ x: fl.c.x, y: fl.c.y, z: fl.c.z, r: fl.R0 + fl.t * 4 });
        return out;
    }

    /** It really did something: mana (the first time: +10 to the maximum, for good). */
    _worked(s) {
        if (s.worked) return;
        s.worked = true;
        const g = this.game;
        this._note({ ev: 'worked' });
        g.mana?.success?.(STORM.NAME);
        if (!g.combat?.enabled) return;
        g.bonus = g.bonus || { hp: 0, fatigue: 0 };
        const n = stormReward(g.bonus);
        if (!n) return;
        g.combat.addMaxFatigue?.(n);
        g.combat._hudKey = '';
        this._note({ ev: 'reward', n });
        const t = `🌊 Водяная буря покорилась вам! Мана <b>+${n}</b> к максимуму навсегда`;
        if (g.hud?.toast) g.hud.toast(t); else g.hud?.setVoice?.(t, true);
    }

    // ============================================================ what it does
    /** Put out fires there (every computer) and sweep the creatures (the host). @returns true: it did something */
    _act(by, f, body) {
        const g = this.game;
        const mass = 1 - f.k > 0.2, ring = f.k > 0.2;
        let did = false;
        const douse = (p, r) => {
            if ((g.fire?.douse?.(p, r) || 0) > 0) did = true;
            if (g.authority) for (const cf of [...(g.campfires?.list?.values() || [])]) if (Math.hypot(cf.x - p.x, cf.z - p.z) < r + 0.8 && Math.abs(cf.y - p.y) < r + 2) { g.campfires._out(cf); did = true; }
            if (g.authority) for (const t of g.livingTrees?.list || []) if (t.burnT > 0 && Math.hypot(t.model.position.x - p.x, t.model.position.z - p.z) < r + 1.5) { t.burnT = 0; did = true; }
            // the Hellfire (anyone's): in this water it hisses out (Hellfire._wet); counted here
            const H = g.hellfire;
            if (H) {
                const near = (q, R) => q && Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < r + R;
                if (H.state && near(H.state.c, H.state.R)) did = true;
                for (const hf of H.remote?.values() || []) if (near(hf.c, hf.R)) did = true;
                for (const lf of H.left || []) if (near(lf.c, lf.R)) did = true;
            }
        };
        if (mass) douse(f.c, f.R);
        if (ring) for (let i = 0; i < 6; i++) { const a = f.ang + i * (TAU / 6); douse(_a.set(body.x + Math.cos(a) * f.rr, body.y - 1, body.z + Math.sin(a) * f.rr), STORM.RING_W); }
        // creatures
        for (const b of g.duel?._bodies?.(null) || []) {
            if (b.kind === 'p' || b.kind === 'b' || b.kind === 't' || b.kind === 's') continue;
            const mid = _c.copy(b.a).add(b.b).multiplyScalar(0.5);
            let dir = null;
            if (mass && (segDist(f.c, b.a, b.b) < f.R * 0.95 + b.r || inBlaze(f.c, f.R, mid, b.r))) {
                dir = new THREE.Vector3(mid.x - f.c.x, 0, mid.z - f.c.z);
                if (f.vel) dir.addScaledVector(_a.copy(f.vel).setY(0), 0.3);
            } else if (ring && inStorm(body, f.rr, mid, b.r)) {
                const ox = mid.x - body.x, oz = mid.z - body.z, L = Math.hypot(ox, oz) || 1;
                dir = new THREE.Vector3(-oz / L * 1.4 + ox / L * 0.6, 0, ox / L * 1.4 + oz / L * 0.6); // (carried round and flung out)
            }
            if (!dir) continue;
            did = true;
            if (!g.authority) continue;
            const key = b.kind + ':' + b.id;
            if (this._t - (f.swept?.get(key) ?? -9) < STORM.SWEEP_EVERY) continue;
            f.swept?.set(key, this._t);
            if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
            dir.normalize();
            g.vortex?._push?.({ volume: STORM.SWEEP_VOLUME, power: 1, dir, by }, b.kind, b.id);
            if (b.kind === 'z') { const z = g.zombieById?.get(b.id); if (z && !z.isDead) { z.damageCooldown = 0; g.damageZombie(z, STORM.CREATURE_DMG, false, dir, by); } }
            else {
                const cr = g.duel?._creature?.(b.kind, b.id);
                if (b.kind === 'a' && cr) { cr.damageCooldown = 0; g.animals?.hit?.(cr, STORM.CREATURE_DMG, null, by); }
                else if (b.kind === 'v' && cr) g.castleLife?.hit?.(cr, STORM.CREATURE_DMG, null, by, { spell: true });
            }
            this._note({ ev: 'sweep', kind: b.kind, id: b.id, by });
        }
        return did;
    }

    /** Any storm (mine too: no immunity) on my body: swept, knocked down, drowning. */
    _hitMe(f, body, dt) {
        const g = this.game, c = g.combat;
        f.meT = (f.meT || 0) - dt;
        f.pushT = (f.pushT || 0) - dt;
        if (!c || c.dead || g.isDeadLocal || (f.meT > 0 && f.pushT > 0)) return;
        const me = c.center ? c.center(_a) : _a.copy(g.character.group.position);
        const mass = 1 - f.k > 0.2 && inBlaze(f.c, f.R, me, 0.45);
        const ring = f.k > 0.2 && f !== this.state && inStorm(body, f.rr, me, 0.45);
        if (!mass && !ring) return;
        const by = f === this.state || f.by === this.me ? null : f.by;
        if (f.pushT <= 0) {
            f.pushT = STORM.SWEEP_EVERY * 1.4;
            const dir = mass ? new THREE.Vector3(me.x - f.c.x, 0, me.z - f.c.z) : new THREE.Vector3(-(me.z - body.z), 0, me.x - body.x);
            if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
            g.vortex?._push?.({ volume: STORM.SWEEP_VOLUME, power: 1, dir: dir.normalize(), by: by || this.me }, 'p', this.me);
        }
        if (f.meT <= 0) {
            f.meT = STORM.PLAYER_TICK;
            let dmg = STORM.PLAYER_DMG;
            if ((c.shield && c.shield.left > 0) || c.shieldFactor?.(mass ? f.c : body) >= 1) dmg *= STORM.SHIELD;
            this._note({ ev: 'hurtMe', dmg, by: by || 'self' });
            if (c.enabled) c.damage(dmg, by, 'WaterVortex');
            else g.damageLocalPlayer?.(dmg);
        }
    }

    // =========================================================== the end: the water falls
    _fall(by, f, body) {
        const g = this.game;
        const mass = 1 - f.k > 0.2;
        const at = mass ? f.c.clone() : new THREE.Vector3(body.x, body.y - 1.5, body.z);
        const gy = g.collision?.groundY ? g.collision.groundY(at.x, at.z) : at.y - 1;
        at.y = gy + 0.3;
        const R0 = mass ? f.R : f.rr;
        this.floods.push({ by, c: at, R0, t: 0, hit: new Set(), meHit: false, ring: !mass });
        g.sound?.playSplash?.();
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.6);
        this._note({ ev: 'fall', by });
        // the river fills back up a moment later
        if (f.list) this.refills.push({ list: f.list, n: Math.min(f.drawn || 0, f.list.length), at: this._t + STORM.REFILL_DELAY });
    }

    _updateFloods(dt) {
        const g = this.game, fx = g.fx;
        for (let i = this.floods.length - 1; i >= 0; i--) {
            const fl = this.floods[i];
            fl.t += dt;
            const k = fl.t / STORM.FLOOD_TIME;
            if (k >= 1) { this.floods.splice(i, 1); continue; }
            const r = fl.R0 + (fl.ring ? 0 : 0) + STORM.FLOOD_R * Math.sqrt(k) + (fl.ring ? STORM.FLOOD_R * k : 0);
            // the wave: a ring of water running out over the ground, sinking as it goes
            const n = Math.min(140, Math.ceil(TAU * r / 0.45));
            const h = (1 - k) * 1.2;
            for (let j = 0; j < n; j++) {
                const a = j * (TAU / n) + Math.sin(j * 3.1) * 0.05;
                this._put(fl.c.x + Math.cos(a) * r, fl.c.y + h * (0.6 + 0.4 * Math.sin(a * 5 + fl.t * 6)), fl.c.z + Math.sin(a) * r, 0.45 * (1 - k * 0.6));
            }
            if (fx?.sparks) for (let j = 0; j < 10; j++) {
                const a = Math.random() * TAU;
                fx.sparks.spawn(fl.c.x + Math.cos(a) * r, fl.c.y + h, fl.c.z + Math.sin(a) * r, Math.cos(a) * 4, 2 + Math.random() * 3, Math.sin(a) * 4, pick(FOAM), 0.1 + Math.random() * 0.1, 0.6, { gravity: -14 });
            }
            // it puts out fires and knocks down whoever it runs over (the host: creatures; me: myself)
            g.fire?.douse?.(fl.c, r);
            const knock = (pos) => Math.abs(Math.hypot(pos.x - fl.c.x, pos.z - fl.c.z) - r) < 1.4 && pos.y < fl.c.y + 3.5;
            if (g.authority) for (const b of g.duel?._bodies?.(null) || []) {
                if (b.kind === 'p' || b.kind === 'b' || b.kind === 't' || b.kind === 's' || fl.hit.has(b.kind + b.id)) continue;
                if (!knock(b.a)) continue;
                fl.hit.add(b.kind + b.id);
                const dir = new THREE.Vector3(b.a.x - fl.c.x, 0, b.a.z - fl.c.z);
                if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
                g.vortex?._push?.({ volume: 20, power: 1, dir: dir.normalize(), by: fl.by }, b.kind, b.id);
            }
            const me = g.character.group.position;
            if (!fl.meHit && !g.combat?.dead && knock(_b.set(me.x, me.y - 1.5, me.z))) {
                fl.meHit = true;
                const dir = new THREE.Vector3(me.x - fl.c.x, 0, me.z - fl.c.z);
                if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
                g.vortex?._push?.({ volume: 20, power: 1, dir: dir.normalize(), by: fl.by }, 'p', this.me);
                this._note({ ev: 'floodMe' });
            }
        }
    }

    _updateRefills() {
        const data = this.game.terrain?.data;
        for (let i = this.refills.length - 1; i >= 0; i--) {
            const r = this.refills[i];
            if (this._t < r.at) continue;
            let k = 0;
            while (r.n > 0 && k++ < STORM.REFILL_PER_FRAME) {
                const b = r.list[--r.n];
                if (b && data && data.get(b[0], b[1], b[2]) === BLOCK.AIR) data.set(b[0], b[1], b[2], BLOCK.WATER);
            }
            if (r.n <= 0) { this.refills.splice(i, 1); this._note({ ev: 'refilled' }); }
        }
    }

    // ============================================================= network
    _send(s, why = null) {
        if (!s && !this._sent) return;
        this._sent = !!s;
        this.game.sync?.waterStorm?.(s, why);
    }

    onNet(m) {
        if (!m || !m.by || m.by === this.me) return;
        const s = m.s;
        if (!Array.isArray(s) || s.length < 18 || !s.every(Number.isFinite)) {
            const f = this.remote.get(m.by);
            if (f) { this._fall(m.by, f, f.body); this.remote.delete(m.by); }
            return;
        }
        let f = this.remote.get(m.by);
        if (!f) {
            const data = this.game.terrain?.data;
            const src = { x: s[14], y: s[15] - 1.5, z: s[16] };
            f = { by: m.by, c: new THREE.Vector3(s[0], s[1], s[2]), tc: new THREE.Vector3(), o: new THREE.Vector3(), body: new THREE.Vector3(s[11], s[12], s[13]),
                vel: new THREE.Vector3(), R: s[3], k: s[4], ang: s[5], spin: s[6], rr: s[7], list: data ? waterInReach(data, src).list : null, drawn: 0, src: new THREE.Vector3(src.x, src.y, src.z),
                tickT: 0, meT: 0, pushT: 0, swept: new Map() };
            this.remote.set(m.by, f);
        }
        f.tc.set(s[0], s[1], s[2]);
        f.tR = clamp(s[3], 0, STORM.R_MAX); f.tk = clamp(s[4], 0, 1);
        f.spin = clamp(s[6], 0, 40); f.rr = clamp(s[7], 2, 9);
        if (Math.abs(s[5] - f.ang) > 1.5) f.ang = s[5];
        f.o.set(s[8], s[9], s[10]);
        f.netBody = [s[11], s[12], s[13]];
        f.want = Math.max(0, Math.min(STORM.MAX_VOLUME, s[17] | 0));
        f.at = this._t;
    }

    _updateRemote(f, dt) {
        const g = this.game;
        const q = 1 - Math.exp(-dt * 8);
        _a.copy(f.c);
        f.c.lerp(f.tc, q);
        f.vel.subVectors(f.c, _a).divideScalar(dt);
        f.R += ((f.tR ?? f.R) - f.R) * q;
        f.k += ((f.tk ?? f.k) - f.k) * q;
        f.ang += f.spin * dt;
        const av = g.remotes?.get(f.by);
        if (av?.position) f.body.copy(av.position); else if (f.netBody) f.body.set(f.netBody[0], f.netBody[1], f.netBody[2]);
        this._take(f, f.want || 0);
        f.tickT -= dt;
        if (f.tickT <= 0) { f.tickT = STORM.TICK; this._act(f.by, f, f.body); }
        this._hitMe(f, f.body, dt);
        this._draw(dt, f, f.body);
    }

    // ============================================================= drawing
    _put(x, y, z, s) {
        const mesh = this.blobs;
        if (!mesh || this._n >= 2400) return;
        _m.compose(_e.set(x, y, z), _q.identity(), _s.set(s, s, s));
        mesh.setMatrixAt(this._n++, _m);
    }

    _rate(key, rate, dt, max) {
        this._acc[key] += rate * dt;
        const n = Math.min(max, Math.floor(this._acc[key]));
        this._acc[key] -= n;
        return n;
    }

    _draw(dt, f, body) {
        const fx = this.game.fx, t = this._t;
        const wb = 1 - f.k, wr = f.k;
        const c = f.c;
        // ----------------------------------------------------------- the mass
        if (wb > 0.03) {
            const R = f.R * (1 + 0.07 * Math.sin(t * 4.1) + 0.04 * Math.sin(t * 9.7 + 1));
            const n = Math.min(BALL.length, Math.ceil((80 + R * R * 9) * wb));
            const size = 0.42 + R * 0.08;
            for (let i = 0; i < n; i++) {
                const p = BALL[i];
                const sw = t * (1.6 + (1 - p.r) * 2.2) + p.ph; // (the inside churns faster)
                const ca = Math.cos(sw), sa = Math.sin(sw);
                const x = p.x * ca - p.z * sa, z = p.x * sa + p.z * ca;
                const rr = R * p.r * (1 + 0.08 * Math.sin(t * 3 + p.ph * 3));
                this._put(c.x + x * rr, c.y + p.y * rr * 0.85 + 0.15 * Math.sin(t * 5 + p.ph), c.z + z * rr, size * (0.75 + 0.35 * Math.sin(p.ph + t * 2)));
            }
            // spray and foam off its surface
            for (let i = this._rate('spray', 120 * wb * Math.min(2, R / 2), dt, 6); i > 0; i--) {
                const a = Math.random() * TAU, e = (Math.random() - 0.3) * 1.4;
                const ux = Math.cos(a) * Math.cos(e), uy = Math.sin(e), uz = Math.sin(a) * Math.cos(e);
                fx?.sparks?.spawn(c.x + ux * R, c.y + uy * R, c.z + uz * R, ux * 3 - uz * 2, 2 + Math.random() * 3, uz * 3 + ux * 2, pick(WATER), 0.08 + Math.random() * 0.1, 0.7, { gravity: -12 });
            }
            // the river pours up into it while it is drawn
            if (f.src && f.drawn < (f.list?.length || 0)) {
                const L = f.src.distanceTo(c);
                for (let j = 0; j < 22; j++) {
                    const k = ((j / 22) + t * 1.4) % 1;
                    const x = f.src.x + (c.x - f.src.x) * k, z = f.src.z + (c.z - f.src.z) * k;
                    const y = f.src.y + (c.y - f.src.y) * k + Math.sin(k * Math.PI) * Math.min(3, L * 0.2);
                    this._put(x + Math.cos(k * 20 + t * 9) * 0.3, y, z + Math.sin(k * 20 + t * 9) * 0.3, 0.38);
                }
            }
        }
        // ---------------------------------------------------------- the storm
        if (wr > 0.03) {
            const rr = f.rr, gy = body.y - 1.95, sp = f.spin;
            for (let band = 0; band < 4; band++) {
                const r = rr + (band - 1.5) * 0.6;
                const cnt = Math.ceil((TAU * r / 0.42) * wr);
                const a0 = f.ang * (1 + band * 0.08) + band * 1.3;
                const base = gy + 0.6 + band * 0.75;
                for (let j = 0; j < cnt; j++) {
                    const a = a0 - j * (TAU / Math.ceil(TAU * r / 0.42));
                    const y = base + 0.55 * Math.sin(a * 3 + t * 3.2 + band) + 0.3 * Math.sin(a * 7 - t * 5);
                    this._put(body.x + Math.cos(a) * r, y, body.z + Math.sin(a) * r, 0.36 + 0.06 * Math.sin(a * 5 + band));
                }
            }
            // waterspouts racing round with it
            for (let s = 0; s < 4; s++) {
                const a = f.ang * 1.25 + s * (TAU / 4);
                for (let j = 0; j < 14; j++) {
                    const h = j * 0.33, tw = a + h * 0.6 + t * 6;
                    this._put(body.x + Math.cos(a) * rr + Math.cos(tw) * 0.35 * (1 + h * 0.15), gy + h, body.z + Math.sin(a) * rr + Math.sin(tw) * 0.35 * (1 + h * 0.15), 0.42 - j * 0.012);
                }
            }
            for (let i = this._rate('foam', 260 * wr, dt, 10); i > 0; i--) {
                const a = Math.random() * TAU, r = rr + (Math.random() - 0.5) * STORM.RING_W;
                const ca = Math.cos(a), sa = Math.sin(a);
                fx?.sparks?.spawn(body.x + ca * r, gy + Math.random() * STORM.RING_H, body.z + sa * r, -sa * sp * r * 0.7 + ca * 2, 1 + Math.random() * 3, ca * sp * r * 0.7 + sa * 2,
                    Math.random() < 0.5 ? pick(FOAM) : pick(WATER), 0.09 + Math.random() * 0.12, 0.7, { gravity: -12 });
            }
            for (let i = this._rate('mist', 10 * wr, dt, 1); i > 0; i--) {
                const a = Math.random() * TAU;
                fx?.smoke?.spawn(body.x + Math.cos(a) * rr, gy + 1 + Math.random() * 2, body.z + Math.sin(a) * rr, -Math.sin(a) * sp, 0.6, Math.cos(a) * sp, 0xdfeef8, 0.8 + Math.random() * 0.6, 1.2, { shrink: -0.6, spin: 1 });
            }
        }
    }

    clear() {
        // (everything taken comes back at once)
        const data = this.game.terrain?.data;
        const all = [...this.refills.map((r) => ({ list: r.list, n: r.n }))];
        if (this.state) all.push({ list: this.state.list, n: this.state.drawn });
        for (const f of this.remote.values()) all.push({ list: f.list, n: f.drawn });
        if (data) for (const r of all) for (let i = 0; i < (r.n || 0); i++) { const b = r.list?.[i]; if (b && data.get(b[0], b[1], b[2]) === BLOCK.AIR) data.set(b[0], b[1], b[2], BLOCK.WATER); }
        this.state = null;
        this.remote.clear();
        this.floods.length = 0;
        this.refills.length = 0;
    }

    dispose() {
        this.clear();
        if (this.blobs) { this.game.scene?.remove(this.blobs); this.blobs.dispose?.(); }
    }
}
