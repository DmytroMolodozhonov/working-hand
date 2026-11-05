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
import { TornadoSummonFx, TORNADO_FX } from '../fx/TornadoSummonFx.js';

export const OCEAN_STORM = {
    NEAR: 700, // m: the seas whose spouts and bolts concern me
    SEE: 900, // m: a spout seen this far
    BOLT_SEE: 650, // m: a bolt drawn this far
    INLAND: 120, // m from the shore: the sea's storm fades out
    FLING_AT: 20, // m above the water: lifted this high, flung out
    FLING_EVERY: 6, // s
    SHIP_HARM: 6, // a second in the core
    DEEP: 3, // m under the water: the spout does not reach
    FLEE_R: 170, // m: a ship's crew that sees a spout this near runs from it (the author: «все моряки боятся смерча»)
    // «Tornado» (the spell, 05.11): a spout called down out of the sky over the sea
    SUMMON_LIFE: 12 * 60, // s: 12 game hours at most (a game hour is a real minute) — no spout stands for ever (the author)
    SUMMON_AHEAD: 45, // m ahead of the caster it comes down
    SUMMON_MIN_S: 25, // m off the shore at least (deep water)
    SHORE_REACH: 25, // m: on the land this near the sea it may be called too (the author: «в 20 метрах от моря на суше — тоже можно»)
    SUMMON_ROAM: [55, 40], // m: it wanders round where it was called (a slow loop, not off across the sea)
    MAX_SUMMONED: 4, // at once in the world (the oldest goes first)
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
        this.summoned = []; // «Tornado»: [{id, x0, z0, born, life, spin, by}]
    }

    /** Is (p) at sea — over the sea's water (on it, under it, on a deck, flying over it)? A lake, a river, the land — no. */
    seaHere(p) {
        const sea = this.game.sea;
        return !!sea && sea.s(p.x, p.z) > -OCEAN_STORM.SHORE_REACH; // (on it, or on its shore within SHORE_REACH m — a lake is no sea: sea.s knows only the seas)
    }

    /** Where a «Tornado» cast from p facing yaw comes down: {x, z} ahead over deep sea, or null (not at sea / too shallow ahead). */
    placeFor(p, yaw) {
        const sea = this.game.sea;
        if (!sea || !this.seaHere(p)) return null;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        for (const d of [OCEAN_STORM.SUMMON_AHEAD, 70, 95, 30, 120]) { // (from the shore: further out, where the water is deep)
            const x = p.x + fx * d, z = p.z + fz * d;
            if (sea.index.signedDist(x, z) >= OCEAN_STORM.SUMMON_MIN_S && sea.s(x, z) >= OCEAN_STORM.SUMMON_MIN_S) return { x, z };
        }
        return null;
    }

    /** «Tornado» cast (every computer, from the packet): the calling plays (TornadoSummonFx), the spout comes down at its DESCEND s. */
    call(from, at, by = null, side = null) {
        const spin = Math.random() < 0.5 ? 1 : -1;
        (this.callFx || (this.callFx = new TornadoSummonFx(this.game))).start(from, at, spin, by, side);
        this.summon(at, by, TORNADO_FX.DESCEND, spin);
    }

    /** The spout of a «Tornado» begins to come down at (x, z) after `delay` s. */
    summon(at, by = null, delay = 0, spin = Math.random() < 0.5 ? 1 : -1) {
        const t = (this.game.weatherClock ?? Date.now() / 1000) + delay;
        const id = 'tornado:' + (by ?? '?') + ':' + Math.round(t * 10);
        if (this.summoned.some((s) => s.id === id)) return;
        this.summoned.push({ id, x0: at.x, z0: at.z, born: t, life: OCEAN_STORM.SUMMON_LIFE, spin, by, ph: Math.random() * 6.28 });
        while (this.summoned.length > OCEAN_STORM.MAX_SUMMONED) this.summoned.shift();
    }

    /** The called spouts at time t (they wander slowly round their place; fade at the end of their life or in the shallows). */
    _summonedAt(t, out) {
        const idx = this.game.sea?.index;
        for (let i = this.summoned.length - 1; i >= 0; i--) {
            const s = this.summoned[i], age = t - s.born;
            if (age > s.life || age < -5) { this.summoned.splice(i, 1); continue; }
            const [rx, rz] = OCEAN_STORM.SUMMON_ROAM;
            const x = s.x0 + Math.sin(age / 41 + s.ph) * rx * Math.min(1, age / 60), z = s.z0 + Math.sin(age / 29 + s.ph * 1.7) * rz * Math.min(1, age / 60);
            const sd = idx ? idx.signedDist(x, z) : 99;
            const shore = Math.max(0, Math.min(1, (sd - (OCEAN.DIE_S - 8)) / 10));
            const k = Math.max(0, Math.min(1, age / 5, (s.life - age) / OCEAN.FADE)) * shore; // (called: the funnel comes down out of the eye in 5 s — faster than a storm's)
            out.push({ id: s.id, x, z, k, born: s.born, life: s.life, spin: s.spin, summoned: true });
        }
    }

    _fx() { return this.fx || (this.fx = new WaterspoutFx(this.game.scene, this.game.water?.spray || null)); }

    /** For Game.prewarm: the spout's funnel and cloud (their shaders compile at the loading screen). */
    samples() { return [...this._fx().samples(), ...(this.callFx || (this.callFx = new TornadoSummonFx(this.game))).samples()]; }

    /** Is (x, z) within `r` + a spout's reach of a spout (the sea's creatures flee)? */
    nearSpout(x, z, r = 0) {
        for (const s of this.spouts) if (s.k > 0.2 && Math.hypot(x - s.x, z - s.z) < OCEAN.PULL + r) return s;
        return null;
    }

    update(dt) {
        const g = this.game, sea = g.sea, ch = g.character;
        const t = g.weatherClock ?? Date.now() / 1000; // (weatherClock: a test's / a tool's fixed moment)
        this.callFx?.update(dt); // (a «Tornado» being called: the sky turning, the sea spinning)
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
        if (this.summoned.length) { this._summonedAt(t, _list); for (const sp of _list) sp.d = Math.hypot(sp.x - me.x, sp.z - me.z); }
        if (W > 0 || this.spouts.length) {
            for (const sea0 of sea.index.near(me.x, me.z, OCEAN_STORM.NEAR)) {
                for (const sp of spoutsOf(sea.index, sea0, g.seed, t, [])) {
                    sp.d = Math.hypot(sp.x - me.x, sp.z - me.z);
                    if (sp.d < OCEAN_STORM.SEE) _list.push(sp);
                }
                if (W > 0 && this._lastT) this._bolts(sea0, this._lastT, t, me);
            }
        }
        _list.sort((a, b) => a.d - b.d);
        this.spouts = _list.slice();
        this._lastT = t;
        // a called spout brings its own dark cloud and rain round it (≤ 400 m)
        for (const sp of this.spouts) if (sp.summoned) this.seaK = Math.max(this.seaK, Math.min(1, sp.k * 1.5) * Math.max(0, 1 - sp.d / 600));
        if (this.callFx) this.seaK = Math.max(this.seaK, this.callFx.darkAt(me)); // (the calling: the sky goes dark at once, not when the funnel is down)
        if (g.storm) g.storm.seaK = this.seaK;
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
            // the crew sees a spout near: they run before it, away (the black ship's own helmsman does the same — Blackbeard._sail)
            if (harm || !s._fleeAt) {
                const near = this.nearSpout(sx, sz, OCEAN_STORM.FLEE_R - OCEAN.PULL);
                if (near && g.fleet?.flee) g.fleet.flee(s, Math.atan2(-(sx - near.x), -(sz - near.z)), 4);
            }
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
