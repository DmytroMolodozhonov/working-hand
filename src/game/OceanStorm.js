/**
 * OceanStorm.js — the storms over the sea (the author: «грозы и смерчи над океаном»; the rules and the timetable — world/OceanWeather.js).
 *
 * When the world's wind (SeaWind.js, Game.wind) rises to a storm, near the sea:
 *   - the sky goes dark and it pours (Storm.js `seaK`: the same rain and far lightning as the weather's) — over the sea and its shore
 *     (120 m inland it fades); in a cave / a closed room — only heard;
 *   - the gale howls over the water (SeaSounds 'gale');
 *   - lightning strikes the sea now and then (OceanWeather.boltsOf: the same bolts on every computer); a ship near draws it to her
 *     masts (Ships.lightningAt: −25, the sail catches fire); a body right there is struck (the spell's own bolt: castLightningHit);
 *   - waterspouts walk over the sea with the wind (OceanWeather.spoutsOf; WaterspoutFx draws them, a roar near — SeaSounds 'spout').
 *
 * What a waterspout does (who / what):
 *   - me (each computer pushes its own player — the other players see it through their packets): within PULL m round it, at the
 *     surface, on a deck, swimming or flying low — the wind swirls me round and draws me in; in the core I am lifted up and, high,
 *     flung out (Knockdown: thrown, tumbling) — once per spout every FLING_EVERY s; absolute steadiness holds me (FirmRules);
 *     deep under the water (≥ 3 m) — nothing; indoors / in a cave — nothing.
 *   - ships (the host): pushed round and in, spun; in the core the hull takes harm (−SHIP_HARM a second), the black ship too (its
 *     curse guards it from spells, not from the weather);
 *   - the sea's creatures flee it (SeaLife.js asks `nearSpout`); things floating, birds, dragons — not touched (a dragon flies over it).
 * Nothing is sent over the network: the timetable is the same everywhere.
 */
import * as THREE from 'three';
import { spoutsOf, boltsOf, spoutPush, stormWeight, OCEAN } from '../world/OceanWeather.js';
import { windLevelSmooth } from '../world/SeaWind.js';
import { WATER_LEVEL_Y } from '../world/Terrain.js';
import { WaterspoutFx } from '../fx/WaterspoutFx.js';

export const OCEAN_STORM = {
    NEAR: 700, // m: the seas whose spouts and bolts concern me
    SEE: 900, // m: a spout seen this far
    BOLT_SEE: 650, // m: a bolt drawn this far
    INLAND: 120, // m from the shore: the sea's storm fades out
    FLING_AT: 20, // m above the water: lifted this high, flung out
    FLING_EVERY: 6, // s
    SHIP_HARM: 6, // a second in the core
    DEEP: 3, // m under the water: the spout does not reach
};

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _push = {};
const _list = [];
const _bolts = [];

export class OceanStorm {
    constructor(game) {
        this.game = game;
        this.fx = null; // (made on first need — or at the loading screen by prewarm)
        this.spouts = []; // the spouts near, nearest first: [{id, x, z, k, spin, d}]
        this.seaK = 0; // how much of the sea's storm reaches me (0…1)
        this._lastT = 0;
        this._flung = new Map(); // spout id → when I was last flung by it
        this._shipT = 0;
    }

    _fx() { return this.fx || (this.fx = new WaterspoutFx(this.game.scene, this.game.water?.spray || null)); }

    /** For Game.prewarm: the spout's funnel and cloud (their shaders compile at the loading screen). */
    samples() { return this._fx().samples(); }

    /** Is (x, z) within `r` + a spout's reach of a spout (the sea's creatures flee)? */
    nearSpout(x, z, r = 0) {
        for (const s of this.spouts) if (s.k > 0.2 && Math.hypot(x - s.x, z - s.z) < OCEAN.PULL + r) return s;
        return null;
    }

    update(dt) {
        const g = this.game, sea = g.sea, ch = g.character;
        const t = g.weatherClock ?? Date.now() / 1000; // (weatherClock: a test's / a tool's fixed moment)
        if (!sea || !ch || g.space?.realm && g.space.realm !== 'earth' || g.hellGate?.inHell) { this._off(); return; }
        const me = ch.group.position;
        if (me.y > 2000) { this._off(); return; } // (space)
        const W = stormWeight(g.seed, t);
        const s = sea.s(me.x, me.z);
        const near = Math.max(0, Math.min(1, (s + OCEAN_STORM.INLAND) / OCEAN_STORM.INLAND));
        this.seaK = W * near;
        if (g.storm) g.storm.seaK = this.seaK;
        const heard = g.storm?.heard?.() ?? 1;
        const lvl = windLevelSmooth(g.wind?.speed || 0);
        const gale = near * Math.max(0, Math.min(1, (lvl - 5.5) / 3)) * heard;
        // the spouts and bolts of the seas near
        _list.length = 0;
        let spoutSound = 0;
        if (W > 0 || this.spouts.length) {
            for (const sea0 of sea.index.near(me.x, me.z, OCEAN_STORM.NEAR)) {
                for (const sp of spoutsOf(sea.index, sea0, g.seed, t, [])) {
                    sp.d = Math.hypot(sp.x - me.x, sp.z - me.z);
                    if (sp.d < OCEAN_STORM.SEE) _list.push(sp);
                }
                if (W > 0 && this._lastT) this._bolts(sea0, this._lastT, t, me);
            }
            _list.sort((a, b) => a.d - b.d);
        }
        this.spouts = _list.slice();
        this._lastT = t;
        const seaY = WATER_LEVEL_Y;
        if (this.spouts.length || this.fx) {
            const light = 1 - 0.75 * (g.world?.nightAmount || 0);
            this._fx().update(dt, t, this.spouts, seaY, g.wind, light);
        }
        for (const sp of this.spouts) spoutSound = Math.max(spoutSound, sp.k * Math.max(0, 1 - sp.d / 260));
        this._pushMe(dt, me, seaY);
        if (g.authority) this._pushShips(dt);
        const under = g.swim?.underwater ? 1 : 0;
        g.sound?.seaAmbience?.(gale * (1 - 0.7 * under), spoutSound * heard * (1 - 0.6 * under), 0);
        for (const [id, at] of this._flung) if (t - at > 60) this._flung.delete(id);
    }

    _off() {
        this.seaK = 0;
        if (this.game.storm) this.game.storm.seaK = 0;
        if (this.spouts.length) { this.spouts = []; this.fx?.update(0, 0, [], 0, null); }
        this.game.sound?.seaAmbience?.(0, 0, 0);
        this._lastT = 0;
    }

    /** The bolts of a sea in [t0, t1): drawn near me; the host does their harm. */
    _bolts(sea0, t0, t1, me) {
        const g = this.game;
        for (const b of boltsOf(g.sea.index, sea0, g.seed, t0, t1, _bolts)) {
            if (Math.hypot(b.x - me.x, b.z - me.z) > OCEAN_STORM.BOLT_SEE) continue;
            _p.set(b.x, WATER_LEVEL_Y + (g.sea.height(b.x, b.z) || 0), b.z);
            // a ship's masts near draw it (the tallest thing on the sea)
            for (const s of g.ships?.awake || []) {
                if (s.state === 'wreck' || !s.pose || !s.layout?.masts?.length) continue;
                const sx = s.pose.x ?? s.st?.x, sz = s.pose.z ?? s.st?.z;
                if (sx == null || Math.hypot(sx - b.x, sz - b.z) > 60) continue;
                const m = s.layout.masts[0];
                s.pose.toWorld(0, s.layout.deck + 14, m.z, _v);
                _p.copy(_v);
                break;
            }
            g.spells?.castLightningHit?.(_p.clone(), null);
            if (g.authority) g.ships?.lightningAt?.(_p, null);
            // me right there, at the surface or on a deck
            const ch = g.character;
            if (ch && ch.group.position.distanceTo(_p) < 3.5 && !g.swim?.underwater) g.combat?.damage?.(20, null, 'Lightning');
        }
    }

    /** A spout's wind on me (my own computer). */
    _pushMe(dt, me, seaY) {
        const g = this.game, ch = g.character;
        if (!this.spouts.length || g.combat?.dead) return;
        const w = g.world;
        if ((w?.indoor || 0) > 0.5 || (w?.cave || 0) > 0.5) return;
        const y = me.y - seaY;
        if (y < -OCEAN_STORM.DEEP) return; // (deep under the water: calm)
        for (const sp of this.spouts) {
            if (sp.d > OCEAN.PULL) break;
            const f = spoutPush(sp, me.x, Math.max(0, y), me.z, _push);
            if (!f) continue;
            if (g.steady?.absolute) return; // (absolute steadiness: the wind can't move me — FirmRules)
            const kb = g.knockback;
            if (kb && !g.flight?.active) { kb.x += f.vx * 4 * dt; kb.z += f.vz * 4 * dt; }
            if (f.vy > 0 && y < OCEAN_STORM.FLING_AT + 6) {
                ch.verticalVelocity = Math.max(ch.verticalVelocity || 0, f.vy);
                ch.onGround = false;
            }
            const t = g.weatherClock ?? Date.now() / 1000;
            if (y > OCEAN_STORM.FLING_AT && f.core && !(t - (this._flung.get(sp.id) || 0) < OCEAN_STORM.FLING_EVERY)) {
                this._flung.set(sp.id, t);
                // flung out of the funnel: thrown far, tumbling
                const dx = me.x - sp.x, dz = me.z - sp.z, l = Math.hypot(dx, dz) || 1;
                if (kb) { kb.x += dx / l * 22; kb.z += dz / l * 22; }
                g.knock?.knock?.({ dir: 'back', down: 2, kind: 'spout', toss: 6, fly: true, tumble: 1, strength: 0.8 });
                g.hud?.setVoice?.('🌪️ Смерч подхватил вас и выбросил!', true);
            } else if (f.near > 0.5 && !this._warned) {
                this._warned = true;
                g.hud?.setVoice?.('🌪️ Смерч тянет вас к себе!', true);
                setTimeout(() => { this._warned = false; }, 8000);
            }
            break;
        }
    }

    /** (host) A spout's wind on the ships near it. */
    _pushShips(dt) {
        const g = this.game, ships = g.ships;
        if (!ships?.awake?.size || !this.spouts.length) return;
        this._shipT += dt;
        const harm = this._shipT >= 1;
        if (harm) this._shipT = 0;
        for (const s of ships.awake) {
            if (s.state === 'wreck' || s.state === 'sinking' || !s.st) continue;
            const st = s.st, sx = s.pose?.x ?? st.x, sz = s.pose?.z ?? st.z;
            if (sx == null) continue;
            for (const sp of this.spouts) {
                const f = spoutPush(sp, sx, 0, sz, _push);
                if (!f) continue;
                // world push → her surge (u) and sway (v); a heavy ship feels a quarter
                const c = Math.cos(st.yaw), sn = Math.sin(st.yaw);
                const fx = -sn, fz = -c, rx = c, rz = -sn;
                const k = 0.25 * dt;
                st.u += (f.vx * fx + f.vz * fz) * k;
                st.v = (st.v || 0) + (f.vx * rx + f.vz * rz) * k;
                st.r = (st.r || 0) + sp.spin * sp.k * f.near * 0.35 * dt;
                st.tau = Infinity;
                s.changed = true;
                if (harm && f.core) ships.damage(s, OCEAN_STORM.SHIP_HARM, null);
                break;
            }
        }
    }
}
