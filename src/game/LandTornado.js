/**
 * LandTornado.js — the tornado on the LAND (the author 07.11: «будет и земная версия торнадо — подхватывает не воду, а землю, постройки и всё, что на пути; в воду войти не может;
 * создаётся заклинанием Tornado или появляется сама — в 2 раза реже, чем водяное; через время само исчезает»). Rules and the timetable: world/TornadoWeather.js; the funnel is
 * WaterspoutFx in its dusty-brown dress; the calling is TornadoSummonFx with the ground under it.
 *
 *   born  : in a storm, on dry land (TornadoWeather.landTornadoesOf: half the spouts' rate), or called with «Tornado» away from the sea (300 mana, the wand to the sky)
 *   walks : with the wind, swaying; it can NOT enter water — the moment its foot is over water (the sea, a lake, a river) it falls apart and does not come back
 *   tears : (the host) every TICK s a few cells of the ground under the funnel, topmost first — the loose ground in two thin layers, then roofs, planks, plaster, walls, by hardness (tearHits);
 *           a house under protection is not touched; what it lifts flies round the funnel and is flung out (debris), the building round the hole settles (Builder._sendEdits settle)
 *   people: me (each computer pushes its own hero): within PULL swirled and drawn in, lifted in the core and flung out; absolute steadiness holds; creatures: the host (CreatureImpact);
 *           the villagers fear it (Danger 'twister')
 *   dies  : a called one after SUMMON_LIFE (4 min), a natural one at the end of its life; both fade over FADE s
 *
 * «А если»: it comes over a house with a ward → the ward holds; over the sea's shore → it falls apart; the host leaves → every computer still sees the same timetable, the new host tears;
 * nobody near (no player within 300 m) → nothing is torn (the land there is not made); two called at once → MAX_SUMMONED, the oldest goes; the hero dies/sleeps/is in space → nothing pushes him.
 */
import * as THREE from 'three';
import { TORNADO, landTornadoesOf, tornadoPush, tearHits, isSoil } from '../world/TornadoWeather.js';
import { stormWeight } from '../world/OceanWeather.js';
import { BLOCK, BASE_COLORS, isCastleBlock } from '../world/Terrain.js';
import { WaterspoutFx } from '../fx/WaterspoutFx.js';
import { TornadoSummonFx } from '../fx/TornadoSummonFx.js';

const TINT = [0.78, 0.66, 0.5]; // dusty brown
const _push = {}, _v = new THREE.Vector3(), _w = new THREE.Vector3(), _list = [];
const TEAR_NEAR = 300; // m: nobody nearer — nothing torn (the land there is not made)

export class LandTornado {
    constructor(game) {
        this.game = game;
        this.fx = null;
        this.callFx = null;
        this.list = []; // the tornadoes near: [{id, x, z, k, spin, y, d, …}]
        this.summoned = [];
        this.dead = new Set(); // ids that touched water (gone for good)
        this._t4 = 0; this._cache = [];
        this._tearT = 0;
        this.hits = new Map(); // 'x,L,z' → tearing steps done
        this.soil = new Map(); // 'x,z' → soil layers lifted
        this._flung = new Map();
        this._cr = 0;
        this.sound = 0; // 0…1: the roar I hear (OceanStorm mixes it into the spout loop)
    }

    // ------------------------------------------------------------ where it can be
    /** Water at the column (x, z): the sea, a lake, a river. */
    wetAt(x, z) {
        const g = this.game, data = g.terrain?.data;
        const sea = g.sea;
        if (sea && sea.s(x, z) > -6) return true;
        if (!data || !data.landMade?.(Math.round(x), Math.round(z))) return false;
        const ix = Math.round(x), iz = Math.round(z), top = data.topLayer(ix, iz);
        return data.get(ix, top + 1, iz) === BLOCK.WATER || data.get(ix, top, iz) === BLOCK.WATER;
    }

    /** Dry land far enough from the sea (for being born / called): the raw ground has no water here. */
    landAt(x, z) {
        const g = this.game, data = g.terrain?.data;
        if (!data?.heightAt) return false;
        if (g.sea && g.sea.s(x, z) > -TORNADO.SUMMON_WATER_MARGIN) return false;
        data.heightAt(Math.round(x), Math.round(z));
        return !data.heightAt.water;
    }

    /** Where a «Tornado» cast from p facing yaw comes down on land: {x, z, ground} ahead on dry ground (no water within the margin), or null. */
    placeFor(p, yaw) {
        const g = this.game, data = g.terrain?.data, M = TORNADO.SUMMON_WATER_MARGIN;
        if (!data) return null;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        for (const d of [TORNADO.SUMMON_AHEAD, 60, 35, 80]) {
            const x = p.x + fx * d, z = p.z + fz * d;
            if (!this.landAt(x, z)) continue;
            let wet = false;
            for (let k = 0; k < 8 && !wet; k++) wet = this.wetAt(x + Math.cos(k * 0.785) * M * 0.6, z + Math.sin(k * 0.785) * M * 0.6);
            if (wet || this.wetAt(x, z)) continue;
            return { x, z, ground: g.collision?.groundY ? g.collision.groundY(x, z) : p.y - 2 };
        }
        return null;
    }

    // ------------------------------------------------------------ «Tornado» on land
    /** The spell arrives (every computer): the calling plays, the funnel comes down at its DESCEND s. */
    call(from, at, by = null, side = null) {
        const spin = Math.random() < 0.5 ? 1 : -1;
        const ground = this.game.collision?.groundY ? this.game.collision.groundY(at.x, at.z) : from.y - 2;
        (this.callFx || (this.callFx = new TornadoSummonFx(this.game))).start(from, { x: at.x, y: 1, z: at.z, ground }, spin, by, side);
        this.summon(at, by, 6, spin);
    }

    summon(at, by = null, delay = 0, spin = Math.random() < 0.5 ? 1 : -1) {
        const t = (this.game.weatherClock ?? Date.now() / 1000) + delay;
        const id = 'twister:' + (by ?? '?') + ':' + Math.round(t * 10);
        if (this.summoned.some((s) => s.id === id)) return;
        this.summoned.push({ id, x0: at.x, z0: at.z, born: t, life: TORNADO.SUMMON_LIFE, spin, by, ph: Math.random() * 6.28 });
        while (this.summoned.length > TORNADO.MAX_SUMMONED) this.summoned.shift();
    }

    _summonedAt(t, out) {
        for (let i = this.summoned.length - 1; i >= 0; i--) {
            const s = this.summoned[i], age = t - s.born;
            if (age > s.life || age < -8 || this.dead.has(s.id)) { this.summoned.splice(i, 1); continue; }
            const [rx, rz] = TORNADO.SUMMON_ROAM;
            const x = s.x0 + Math.sin(age / 37 + s.ph) * rx * Math.min(1, age / 50), z = s.z0 + Math.sin(age / 27 + s.ph * 1.7) * rz * Math.min(1, age / 50);
            const k = Math.max(0, Math.min(1, age / 5, (s.life - age) / TORNADO.FADE));
            out.push({ id: s.id, x, z, k, born: s.born, life: s.life, spin: s.spin, summoned: true, land: true });
        }
    }

    // ------------------------------------------------------------ the picture
    _fx() {
        if (this.fx) return this.fx;
        const g = this.game;
        // (the dust the funnel throws up: smoke puffs in place of the sea's spray)
        const dust = { add: (x, y, z, vx, vy, vz, size, life) => g.fx?.smoke?.spawn(x, y, z, vx * 0.35, vy * 0.4, vz * 0.35, Math.random() < 0.5 ? 0x9a8a6e : 0xb6a27c, Math.min(2.4, size * 1.4 + 0.3), Math.min(2.2, life), { shrink: -0.4 }) };
        this.fx = new WaterspoutFx(g.scene, dust, { tint: TINT, land: true });
        return this.fx;
    }

    /** For Game.prewarm: the funnel, the cloud and the sheath (their shaders compile at the loading screen). */
    samples() { return [...this._fx().samples(), ...(this.callFx || (this.callFx = new TornadoSummonFx(this.game))).samples()]; }

    nearest(x, z, r = 0) {
        for (const s of this.list) if (s.k > 0.2 && Math.hypot(x - s.x, z - s.z) < TORNADO.PULL + r) return s;
        return null;
    }

    // ------------------------------------------------------------ every frame
    update(dt) {
        const g = this.game, ch = g.character;
        const t = g.weatherClock ?? Date.now() / 1000;
        this.callFx?.update(dt);
        if (!ch || g.space?.offEarth || g.hellGate?.inHell) { this._off(); return; }
        const me = ch.group.position;
        if (me.y > 2000) { this._off(); return; }
        // the timetable (4 times a second; between — the cached positions, they walk 4 m/s)
        this._t4 -= dt;
        if (this._t4 <= 0) {
            this._t4 = 0.25;
            _list.length = 0;
            if (this.summoned.length) this._summonedAt(t, _list);
            const W = stormWeight(g.seed, t);
            if (W > 0 || this.list.length) for (const tn of landTornadoesOf(g.seed, t, me.x, me.z, (x, z) => this.landAt(x, z), [])) _list.push(tn);
            // it cannot enter water: the foot over water → gone for good
            for (const tn of _list) {
                if (this.dead.has(tn.id)) { tn.k = 0; continue; }
                if (tn.k > 0.05 && this.wetAt(tn.x, tn.z)) { this.dead.add(tn.id); tn.k = 0; }
            }
            this._cache = _list.filter((tn) => tn.k > 0.01 && !this.dead.has(tn.id));
            for (const tn of this._cache) tn.d = Math.hypot(tn.x - me.x, tn.z - me.z);
            this._cache = this._cache.filter((tn) => tn.d < 800).sort((a, b) => a.d - b.d);
            if (this.dead.size > 200) this.dead.clear();
        }
        this.list = this._cache;
        // positions moved a little since the last timetable look: draw at the live place (the same function of t)
        const data = g.terrain?.data;
        for (const tn of this.list) { tn.y = data?.landMade?.(Math.round(tn.x), Math.round(tn.z)) ? data.surfaceY(tn.x, tn.z) : (tn.y ?? me.y - 2); }
        if (this.list.length || this.fx) {
            const light = 1 - 0.75 * (g.world?.nightAmount || 0);
            this._fx().update(dt, t, this.list, 0, g.wind, light);
        }
        let snd = 0;
        for (const tn of this.list) snd = Math.max(snd, tn.k * Math.max(0, 1 - tn.d / 260));
        this.sound = snd;
        this._pushMe(dt, me);
        if (g.authority) {
            if ((this._tearT -= dt) <= 0) { this._tearT = TORNADO.TICK; this._tear(); }
            if ((this._cr -= dt) <= 0) { this._cr = 0.5; this._pushCreatures(); }
        }
        for (const [id, at] of this._flung) if (t - at > 60) this._flung.delete(id);
    }

    _off() {
        if (this.list.length) { this.list = []; this.fx?.update(0, 0, [], 0, null); }
        this.sound = 0;
    }

    // ------------------------------------------------------------ me
    _pushMe(dt, me) {
        const g = this.game, ch = g.character;
        if (!this.list.length || g.combat?.dead || g.isDeadLocal) return;
        const w = g.world;
        if ((w?.cave || 0) > 0.5) return;
        const y = Math.max(0, me.y - (this.list[0].y ?? me.y));
        for (const tn of this.list) {
            if (tn.d > TORNADO.PULL) break;
            const f = tornadoPush(tn, me.x, y, me.z, _push);
            if (!f) continue;
            if (g.steady?.absolute) return;
            const k = (w?.indoor || 0) > 0.5 ? 0.4 : 1;
            const kb = g.knockback;
            if (kb && !g.flight?.active) { kb.x += f.vx * 4 * dt * k; kb.z += f.vz * 4 * dt * k; }
            if (f.vy > 0) { ch.verticalVelocity = Math.max(ch.verticalVelocity || 0, f.vy * k); ch.onGround = false; }
            const t = g.weatherClock ?? Date.now() / 1000;
            if (y > 14 && f.core && !(t - (this._flung.get(tn.id) || 0) < 6)) {
                this._flung.set(tn.id, t);
                const dx = me.x - tn.x, dz = me.z - tn.z, l = Math.hypot(dx, dz) || 1;
                if (kb) { kb.x += dx / l * 22; kb.z += dz / l * 22; }
                g.knock?.knock?.({ dir: 'back', down: 2, kind: 'twister', toss: 6, fly: true, tumble: 1, strength: 0.9 });
                g.hud?.setVoice?.('🌪️ Смерч подхватил вас и выбросил!', true);
            } else if (f.near > 0.5 && !this._warned) {
                this._warned = true;
                g.hud?.setVoice?.('🌪️ Смерч тянет вас к себе!', true);
                setTimeout(() => { this._warned = false; }, 8000);
            }
            break;
        }
    }

    // ------------------------------------------------------------ the host: creatures
    _pushCreatures() {
        const g = this.game;
        if (!g.creatureImpact?.spellArea || !this.list.length) return;
        for (const tn of this.list) {
            if (tn.k < 0.3 || tn.d > 500) continue;
            g.creatureImpact.spellArea('Twister', null, (p) => {
                const f = tornadoPush(tn, p.x, Math.max(0, p.y - (tn.y ?? p.y)), p.z, _push);
                return f ? _w.set(f.vx * 0.5, f.vy, f.vz * 0.5).clone() : null;
            }, { fly: true, toss: 4, down: 1 });
        }
    }

    // ------------------------------------------------------------ the host: tearing the ground and the buildings
    _tear() {
        const g = this.game, data = g.terrain?.data;
        if (!data || !this.list.length) return;
        const near = (x, z) => {
            const me = g.character?.group?.position;
            if (me && Math.hypot(me.x - x, me.z - z) < TEAR_NEAR) return true;
            if (g.remotes) for (const r of g.remotes.values()) { const p = r.character?.group?.position; if (p && Math.hypot(p.x - x, p.z - z) < TEAR_NEAR) return true; }
            return false;
        };
        const edits = [];
        let castle = 0, ax = 0, az = 0;
        for (const tn of this.list) {
            if (tn.k < 0.4 || !near(tn.x, tn.z)) continue;
            const R = TORNADO.R * (0.7 + 0.5 * tn.k);
            for (let i = 0; i < TORNADO.CELLS; i++) {
                const a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * R;
                const x = Math.round(tn.x + Math.cos(a) * r), z = Math.round(tn.z + Math.sin(a) * r);
                if (!data.landMade(x, z)) continue;
                const top = data.topLayer(x, z);
                const type = data.get(x, top, z);
                const need = tearHits(type);
                if (!need) continue;
                if (data.get(x, top + 1, z) === BLOCK.WATER) continue;
                if (isSoil(type)) { // (the ground itself: two thin layers, never a crater)
                    const key = x * 100003 + z;
                    const n = this.soil.get(key) || 0;
                    if (n >= TORNADO.SOIL) continue;
                    this.soil.set(key, n + 1);
                }
                if (g.wards?.forbids(_v.set(tn.x, top, tn.z), _w.set(x, top - 1, z))) continue; // (a house under a ward: untouched)
                const hk = `${x},${top},${z}`;
                const done = (this.hits.get(hk) || 0) + 1;
                if (done < need) { this.hits.set(hk, done); continue; }
                this.hits.delete(hk);
                data.set(x, top, z, BLOCK.AIR);
                edits.push([x, top, z, BLOCK.AIR]);
                if (isCastleBlock(type)) { castle++; ax += x; az += z; }
                this._flyUp(tn, x, top - 1, z, BASE_COLORS[type] ?? 0x8a7a60);
            }
        }
        if (this.hits.size > 6000) this.hits.clear();
        if (this.soil.size > 20000) this.soil.clear();
        if (edits.length) {
            g.builder?._sendEdits(edits, true); // (what the torn blocks held comes down: a roof gone — the walls give way)
            if (castle) g.castleLife?.alarm?.(_v.set(ax / castle, this.list[0]?.y ?? 0, az / castle), 'twister', null, 60);
        }
    }

    /** A torn block flies: spiralling round the funnel, then flung out (pooled debris — capped by the pool). */
    _flyUp(tn, x, y, z, color) {
        const fx = this.game.fx;
        if (!fx?.debris) return;
        const dx = x - tn.x, dz = z - tn.z, d = Math.hypot(dx, dz) || 1;
        const sw = (10 + Math.random() * 10) * tn.spin;
        for (let k = 0; k < 2; k++) {
            const out = 3 + Math.random() * 6;
            fx.debris.spawn(x + (Math.random() - 0.5) * 0.6, y + 0.5, z + (Math.random() - 0.5) * 0.6,
                -dz / d * sw + dx / d * out, 8 + Math.random() * 12, dx / d * sw + dz / d * out,
                color, 0.4 + Math.random() * 0.4, 2.8 + Math.random() * 1.6, { shrink: 0.1, fade: false, spin: 12 });
        }
    }

    dispose() { this.summoned.length = 0; this.list = []; }
}
