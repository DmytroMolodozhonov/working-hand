/**
 * Titans.js — the seven titans alive on their planets (the rules: TitanRules.js; the bodies: TitanModels.js).
 *
 *  - WHERE: one titan on each planet but the Earth, at its home spot (Space.surfaceSpot(planet, 'titan') — the same in a world). It is
 *    in the world (body, mind) only while a player on its planet is within ACTIVE_R of it; a dead one never comes back (saved).
 *  - THE WALKERS (iron, lava, rock, shade, ice): heavy, slow; wander round home; a player within SEE m is the foe — they turn to face him
 *    (no blow sideways — CLAUDE.md «Лицом к цели»), walk to him and strike (a fist from above, BLOW_T s wind-up: one can see it coming
 *    and run), now and then their own ranged blow (TitanRules `ranged`). Every STEP shakes the ground round the foot (QUAKE_R; a hero
 *    within KNOCK_R is thrown off his feet) and presses a dent into the ground (DENT_MAX at most — the world's edits are saved).
 *      iron (Mercury)  the sun ray from the mirror on its breast (aimed, 1.2 s of gathering light — blinds), the magnet (the weapon out of the hand)
 *      lava (Venus)    fireballs (a ballistic arc, burst of fire); its steps leave burning ground
 *      rock (Saturn)   boulders thrown; its stomp raises a ring of stone spikes round the foe
 *      shade (Uranus)  a wave of darkness; it steps through the dark (vanishes, comes out beside the foe); seen and hurt fully only in light
 *      ice (Neptune)   a ring of ice spikes round the foe (frozen); the freezing breath
 *  - THE SANDWORM (Mars): under the sand most of the time (nothing reaches it): a wave runs over the dunes towards where it HEARD steps
 *    (a running hero is heard far, a still one hardly); a rumble — then it bursts up under the foe, the mouth opening like a flower,
 *    swallows (−blow) and stays up, arched, a few seconds (only then is it hurt), sweeps its tail, dives again.
 *  - THE LIVING STORM (Jupiter): drifts towards the foe; within `pull.r` it draws everyone to its heart; inside its wall it throws them
 *    up and away; lightning from it now and then.
 *  - ITS DEATH: the body breaks (walkers fall and crumble, the worm thrashes and sinks, the storm comes apart), the shard of the gods'
 *    power rises from it into the sky towards the Sun; +1000 mana cells to each who fought it (Achievements 'titan_<id>'); all seven —
 *    Godhood.js (10 000 more and immortality).
 * The host (or a single player) runs the minds; the guests follow by `titan` messages and send their blows to the host.
 */
import * as THREE from 'three';
import { registerKind } from './CreatureImpact.js';
import { TITANS, TITAN_IDS, TITAN, TITAN_LINES, titanDamage, titanResist, titanMove, TITAN_BOLT, quakeAt } from './TitanRules.js';
import { titanModel, titanSamples, poseWalker } from './TitanModels.js';
import { GOD_SPELLS } from './Mana.js';
import { BLOCK } from '../world/Terrain.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const r2 = (x) => Math.round(x * 100) / 100;
const rand = (a) => a[0] + Math.random() * (a[1] - a[0]);
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz)); // (the models look along −z)
const FACE_OK = 0.32; // rad: it strikes only this square to its foe

// ------------------------------------------------------------------ shared effect shapes (made once)
let _fx = null;
function fxShapes() {
    if (_fx) return _fx;
    const mk = (o) => { const m = new THREE.MeshStandardMaterial(o); m.userData.shared = true; return m; };
    _fx = {
        ball: new THREE.IcosahedronGeometry(1, 2),
        fireM: mk({ color: 0xffa040, emissive: 0xff6010, emissiveIntensity: 3, roughness: 1 }),
        rockM: mk({ color: 0x8a867e, roughness: 1 }),
        darkM: new THREE.MeshBasicMaterial({ color: 0x041018, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
        spike: new THREE.ConeGeometry(1, 1, 6),
        iceM: mk({ color: 0xd8f2ff, emissive: 0x4ab0ff, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.9 }),
        stoneM: mk({ color: 0x8c887f, roughness: 1 }),
        rayM: new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
        boltM: new THREE.LineBasicMaterial({ color: 0xd8e8ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }),
        shardM: new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
        ring: new THREE.RingGeometry(0.9, 1, 48),
        cyl: new THREE.CylinderGeometry(1, 1, 1, 10, 1, true),
    };
    _fx.darkM.userData.shared = true; _fx.rayM.userData.shared = true; _fx.boltM.userData.shared = true; _fx.shardM.userData.shared = true;
    for (const k of ['ball', 'spike', 'ring', 'cyl']) _fx[k].userData.shared = true;
    return _fx;
}

export class Titans {
    constructor(game) {
        this.game = game;
        this.state = { dead: [], dents: {} };
        this.active = new Map(); // id → titan (only those with a player near)
        this.list = []; // (CreatureImpact)
        this.fxList = []; // flying blobs, spikes, rays, bolts — each {mesh, t, life, step(dt) → done}
        this._netT = 0;
        this._seen = new Set();
    }

    get auth() { return !this.game.sync || !!this.game.authority; }
    get data() { return this.game.terrain?.data || this.game.world?.terrain?.data || null; }
    isDead(id) { return this.state.dead.includes(id); }
    deadSet() { return new Set(this.state.dead); }

    /** A titan's home (its planet's spot): {x, y, z} or null. */
    home(id) {
        const def = TITANS[id], S = this.game.space;
        if (!def || !S?.surfaceSpot) return null;
        return S.surfaceSpot(def.planet, 'titan');
    }

    /** The ground height (the top of the land) under (x, z). */
    ground(x, z) {
        const d = this.data;
        if (!d) return 0;
        const L = d.topLayer ? d.topLayer(Math.round(x), Math.round(z)) : d.heightAt(Math.round(x), Math.round(z));
        return L + 1;
    }

    /**
     * Ready one titan's body ahead (its textures painted, its shaders compiled) when the hero reaches its planet — never on the loading
     * screen (the friend's stalling load, 06.11). Done once per look, in an idle moment; the body is kept for _build.
     */
    warm(id) {
        const def = TITANS[id];
        if (!def || this._warmed?.has(id)) return;
        (this._warmed || (this._warmed = new Set())).add(id);
        const run = () => {
            try {
                const g = this.game, m = titanModel(def.look);
                (this._spare || (this._spare = new Map())).set(id, m);
                if (g.renderer?.compile && g.camera) { const sc = new THREE.Scene(); sc.add(m); g.renderer.compile(sc, g.camera); sc.remove(m); }
                if (!this._fxWarm && g.renderer?.compile && g.camera) { this._fxWarm = true; const sc = new THREE.Scene(); for (const x of Titans.samplesFx()) sc.add(x); g.renderer.compile(sc, g.camera); }
            } catch (e) { console.warn('titan warm', id, e); }
        };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 0);
    }

    // ------------------------------------------------------------------ in the world / out
    update(dt) {
        const g = this.game;
        if (!(dt > 0)) return;
        dt = Math.min(dt, 0.1);
        const realm = g.space?.realm;
        for (const id of TITAN_IDS) if (realm === TITANS[id].planet && !this.isDead(id)) this.warm(id); // (on its planet: its body readied in an idle moment)
        const me = g.character?.group?.position;
        for (const id of TITAN_IDS) {
            const T = this.active.get(id), def = TITANS[id];
            if (this.isDead(id)) { if (T && T.mode !== 'dying') this._drop(id); }
            else if (!T && me && realm === def.planet) {
                const h = this.home(id);
                if (h && Math.hypot(me.x - h.x, me.z - h.z) < TITAN.ACTIVE_R && (this.data?.landMade?.(Math.round(h.x), Math.round(h.z)) ?? true)) this._build(id, h);
            } else if (T && T.mode !== 'dying' && (realm !== def.planet || Math.hypot(me.x - T.pos.x, me.z - T.pos.z) > TITAN.GONE_R) && !this._remoteNear(T)) this._drop(id);
        }
        for (const T of this.active.values()) {
            if (this.auth) this._think(T, dt); else this._follow(T, dt);
            this._draw(T, dt);
        }
        this._stepFx(dt);
        if (this.auth) this._netSend(dt);
        this.mapMark = null;
        for (const T of this.active.values()) if (T.mode !== 'dying') this.mapMark = { x: T.pos.x, z: T.pos.z, name: T.def.name, icon: '⚡' };
    }

    _remoteNear(T) {
        for (const r of this.game.remotes?.values?.() || []) if (r.position && Math.hypot(r.position.x - T.pos.x, r.position.z - T.pos.z) < TITAN.GONE_R) return true;
        return false;
    }

    _build(id, h) {
        const g = this.game, def = TITANS[id];
        const model = this._spare?.get(id) || titanModel(def.look);
        this._spare?.delete(id);
        const scale = def.look === 'worm' ? def.radius * 2 : def.height;
        if (def.look !== 'worm') model.scale.setScalar(scale);
        g.scene.add(model);
        const y = this.ground(h.x, h.z);
        const T = {
            isTitan: true, id, def, model, kind: 'titan', r: def.radius, h: def.height,
            pos: new THREE.Vector3(h.x, def.flies ? y : y, h.z), home: new THREE.Vector3(h.x, y, h.z), yaw: Math.random() * 6.28,
            hp: def.hp, mode: 'wander', foe: null, ph: 0, stepSide: 0, speed: 0, blowT: 0, blowCool: 2, rangedCool: rand(def.ranged.every),
            stompT: 0, sayT: rand(TITAN.SAY_EVERY), wanderTo: null, dents: this.state.dents[id] || 0, hurtT: 0, dieT: 0, t: 0,
            // the worm's own: under / rising / up / diving; the shade's: lit, blink
            wm: 'under', wT: 4, heard: null, up: 0, lit: 0, blinkCool: def.blink ? rand(def.blink.every) : 0, magnetCool: def.magnet ? rand(def.magnet.every) : 0,
            get isDead() { return this.mode === 'dying'; }, get group() { return this.model; }, get position() { return this.pos; },
        };
        T.bodyCapsule = (out) => titanBody(T, out);
        this.active.set(id, T);
        this.list.push(T);
        if (!this._seen.has(id)) { this._seen.add(id); g.hud?.setVoice?.(`⚡ Вдалеке земля дрожит: здесь живёт ${def.name} — осколок силы богов`, true); }
    }

    _drop(id) {
        const T = this.active.get(id);
        if (!T) return;
        this.game.scene.remove(T.model);
        if (T.mode !== 'dying') { T.model.rotation.set(0, 0, 0); (this._spare || (this._spare = new Map())).set(id, T.model); } // (kept for a return: never made twice)
        this.active.delete(id);
        this.list = this.list.filter((x) => x !== T);
    }

    // ------------------------------------------------------------------ the players
    _players(T) {
        const g = this.game, out = this._pl || (this._pl = []);
        out.length = 0;
        const info = { key: 'titan', x: T.pos.x, z: T.pos.z };
        const seen = (id, p) => (g.invis ? g.invis.aiPos(id, p, info) : p);
        if (!g.isDeadLocal && !g.combat?.dead && g.space?.realm === T.def.planet) {
            const p = seen(g.localId, g.character.group.position);
            if (p) out.push({ id: g.localId, p: _v3.set(p.x, p.y - 1.95, p.z).clone(), speed: g.character?.speed ?? Math.hypot(g.character?.velocity?.x || 0, g.character?.velocity?.z || 0) ?? 0, local: true });
        }
        for (const [id, r] of g.remotes || []) {
            if (r.dead || !r.position) continue;
            const p = seen(id, r.position);
            if (p && Math.hypot(p.x - T.pos.x, p.z - T.pos.z) < TITAN.LOSE) out.push({ id, p: new THREE.Vector3(p.x, p.y - 1.95, p.z), speed: r.speed || 3 });
        }
        return out;
    }

    /** Hurt a player (mine here; another's told to his computer). push: a world velocity to throw him. */
    _hurt(T, pl, dmg, kind, push = null, msg = '') {
        const g = this.game;
        if (pl.local || pl.id === g.localId) this._hurtMe(T, dmg, kind, push, msg);
        else g.sync?.titan?.({ e: 'hurt', id: T.id, to: pl.id, dmg, kind, push: push ? [r2(push.x), r2(push.y), r2(push.z)] : null, msg });
    }
    _hurtMe(T, dmg, kind, push = null, msg = '') {
        const g = this.game, c = g.combat;
        if (!c || c.dead || g.isDeadLocal) return;
        if (dmg > 0) { if (c.enabled) c.damage(dmg, 'titan', kind === 'fire' ? 'Inferno' : kind === 'frost' ? 'Ice' : 'melee'); else g.damageLocalPlayer?.(dmg); }
        if (kind === 'fire') g.burning?.ignite?.('p', g.localId, null);
        if (kind === 'freeze') c.freeze?.('titan', T?.def?.ranged?.freeze || 2.5);
        if (kind === 'blind') g.hud?.flash?.('#fff8e0', 0.9, (T?.def?.ranged?.blind || 3) * 1000);
        if (kind === 'dark') g.hud?.flash?.('#000000', 0.85, (T?.def?.ranged?.dark || 6) * 1000);
        if (push) g.knockback?.add?.(push);
        if (msg) g.hud?.setVoice?.(msg, true);
    }

    _say(T, list) {
        const g = this.game, t = pick(list);
        g.hud?.setVoice?.(`⚡ ${T.def.name}: «${t}»`, true);
        g.speech?.say?.(t, { pos: T.pos, voice: 'old_male', rate: 0.7, pitch: 0.5 });
        g.sound?.playTitan?.(T.pos, 'roar', 1);
        if (g.sync && this.auth) g.sync.titan?.({ e: 'say', id: T.id, t });
    }

    // ------------------------------------------------------------------ the minds (host)
    _think(T, dt) {
        T.t += dt;
        if (T.mode === 'dying') return;
        const players = this._players(T);
        // who is the foe: the one it already fights (while near), else the nearest it notices
        let foe = T.foe != null ? players.find((q) => q.id === T.foe) : null;
        if (foe && foe.p.distanceTo(T.pos) > TITAN.LOSE) foe = null;
        if (!foe) {
            let best = null, bd = 1e9;
            for (const q of players) {
                const d = Math.hypot(q.p.x - T.pos.x, q.p.z - T.pos.z);
                const see = T.def.burrows ? TITAN.SEE * (0.25 + Math.min(1, (q.speed || 0) / 6) * 0.75) : TITAN.SEE; // (the worm hears steps: a runner far, a still one hardly)
                if (d < see && d < bd) { bd = d; best = q; }
            }
            if (best && T.foe == null) this._say(T, TITAN_LINES.wake);
            foe = best;
        }
        T.foe = foe ? foe.id : null;
        T.sayT -= dt;
        if (foe && T.sayT <= 0) { T.sayT = rand(TITAN.SAY_EVERY); this._say(T, TITAN_LINES.fight); }
        if (T.def.kit === 'worm') return this._thinkWorm(T, dt, foe, players);
        if (T.def.kit === 'storm') return this._thinkStorm(T, dt, foe, players);
        this._thinkWalker(T, dt, foe, players);
    }

    _thinkWalker(T, dt, foe, players) {
        const def = T.def;
        T.blowCool -= dt; T.rangedCool -= dt;
        if (def.kit === 'shade') this._shadeLight(T, players);
        if (def.magnet) { T.magnetCool -= dt; if (foe && T.magnetCool <= 0 && foe.p.distanceTo(T.pos) < def.magnet.r) { T.magnetCool = rand(def.magnet.every); this._magnet(T, players); } }
        if (def.blink && foe) { T.blinkCool -= dt; if (T.blinkCool <= 0) { T.blinkCool = rand(def.blink.every); this._blink(T, foe); } }
        // a blow in progress: it goes through (one can see it coming)
        if (T.blowT > 0) {
            const was = T.blowT;
            T.blowT += dt / TITAN.BLOW_T;
            if (was < 0.6 && T.blowT >= 0.6) this._blowLands(T, players);
            if (T.blowT >= 1) { T.blowT = 0; T.blowCool = TITAN.BLOW_EVERY; }
            T.speed = 0;
            return;
        }
        if (T.stompT > 0) {
            const was = T.stompT;
            T.stompT += dt / 1.6;
            if (was < 0.6 && T.stompT >= 0.6) this._stomp(T, players, true);
            if (T.stompT >= 1) T.stompT = 0;
            T.speed = 0;
            return;
        }
        const dist = foe ? Math.hypot(foe.p.x - T.pos.x, foe.p.z - T.pos.z) : 0;
        const want = foe ? yawTo(T.pos.x, T.pos.z, foe.p.x, foe.p.z) : T.yaw;
        const facing = !!foe && Math.abs(angDiff(T.yaw, want)) < FACE_OK;
        const farHome = T.pos.distanceTo(T.home) > TITAN.HOME_R;
        const move = titanMove({ foe, dist, reach: def.reach, facing, blowCool: T.blowCool, rangedCool: T.rangedCool, farHome });
        if (move === 'blow') {
            // a foe right under its feet: the stomp; farther: the fist
            if (dist < def.reach * 0.45 && Math.random() < 0.5) T.stompT = 0.001; else T.blowT = 0.001;
            this.game.sound?.playTitan?.(T.pos, 'windup', 1);
            return;
        }
        if (move === 'ranged') { T.rangedCool = rand(def.ranged.every); this._ranged(T, foe); return; }
        let tx = null, tz = null;
        if (move === 'walk') { tx = foe.p.x; tz = foe.p.z; }
        else if (move === 'turn') { this._turn(T, want, dt); T.speed = 0; return; }
        else if (move === 'home') { tx = T.home.x; tz = T.home.z; }
        else {
            if (!T.wanderTo || Math.hypot(T.wanderTo.x - T.pos.x, T.wanderTo.z - T.pos.z) < 20) { const a = Math.random() * 6.28, r = Math.random() * TITAN.HOME_R * 0.8; T.wanderTo = { x: T.home.x + Math.cos(a) * r, z: T.home.z + Math.sin(a) * r }; }
            tx = T.wanderTo.x; tz = T.wanderTo.z;
        }
        const wy = yawTo(T.pos.x, T.pos.z, tx, tz);
        this._turn(T, wy, dt);
        const sp = (move === 'walk' ? def.walk : def.walk * 0.45) * Math.max(0, Math.cos(angDiff(T.yaw, wy)));
        T.speed = sp;
        T.pos.x += -Math.sin(T.yaw) * sp * dt;
        T.pos.z += -Math.cos(T.yaw) * sp * dt;
        T.pos.y = this.ground(T.pos.x, T.pos.z);
        // the steps: half a stride each STEP_T at the full walk
        const was = T.ph;
        T.ph += (sp / def.walk) * Math.PI / TITAN.STEP_T * dt;
        if (Math.floor(was / Math.PI) !== Math.floor(T.ph / Math.PI)) this._step(T, players);
    }

    _turn(T, want, dt) {
        const d = angDiff(T.yaw, want), s = TITAN.TURN * dt;
        T.yaw += Math.abs(d) < s ? d : Math.sign(d) * s;
    }

    /** One step: the ground shakes round the foot, a hero right by it thrown down; a dent pressed into the ground. */
    _step(T, players) {
        const g = this.game, def = T.def;
        T.stepSide = 1 - T.stepSide;
        const side = T.stepSide ? 1 : -1, w = def.radius * 0.45;
        const fx = T.pos.x + Math.cos(T.yaw) * w * side, fz = T.pos.z - Math.sin(T.yaw) * w * side;
        const foot = _v.set(fx, this.ground(fx, fz), fz);
        g.sound?.playTitan?.(foot, 'step', 1);
        this._quake(foot, 1, players);
        this._dent(T, foot);
        if (def.kit === 'fire') this._fireGround(foot);
        g.sync?.titan?.({ e: 'step', id: T.id, p: [r2(foot.x), r2(foot.y), r2(foot.z)] });
    }

    /** The ground shakes at `p` (k 0…1): the camera of each one near, a hero by it thrown down (and a little hurt). */
    _quake(p, k, players) {
        const g = this.game, me = g.character?.group?.position;
        if (me) { const d = Math.hypot(me.x - p.x, me.z - p.z), q = quakeAt(d) * k; if (q > 0.02) g.cameraShake?.(q * 0.8, 0.7); }
        if (!this.auth) return;
        for (const pl of players) {
            const d = Math.hypot(pl.p.x - p.x, pl.p.z - p.z);
            if (d > TITAN.KNOCK_R * k || pl.p.y - p.y > 6) continue;
            const push = new THREE.Vector3(pl.p.x - p.x, 0, pl.p.z - p.z).normalize().multiplyScalar(8 * (1 - d / (TITAN.KNOCK_R * k))).setY(5);
            this._hurt(null, pl, Math.round(TITAN.STEP_DMG * (1 - d / (TITAN.KNOCK_R * k))), 'melee', push, d < 8 ? '⚡ Земля уходит из-под ног!' : '');
        }
    }

    /** A footprint: a shallow dent in the ground (a few blocks taken off the top). Never past DENT_MAX for a titan. */
    _dent(T, p) {
        const g = this.game, d = this.data;
        if (!this.auth || !d || T.dents >= TITAN.DENT_MAX || T.def.flies || !g.builder?._sendEdits) return;
        T.dents++;
        this.state.dents[T.id] = T.dents;
        const r = Math.max(2, Math.round(T.def.radius * 0.35)), edits = [];
        for (let dz = -r; dz <= r; dz++) for (let dx = -Math.round(r * 0.7); dx <= Math.round(r * 0.7); dx++) {
            if ((dx * dx) / ((r * 0.7) ** 2 + 0.01) + (dz * dz) / (r * r) > 1) continue;
            const x = Math.round(p.x + dx), z = Math.round(p.z + dz), L = d.topLayer ? d.topLayer(x, z) : null;
            if (L == null || L < 2) continue;
            if (d.godGiftAt?.(x, L, z)) continue; // (the gods' gifts are never broken)
            edits.push([x, L, z, BLOCK.AIR]);
        }
        if (edits.length) g.builder._sendEdits(edits);
    }

    /** A blow of the fist lands: a wide strike in front of it (and a quake there). */
    _blowLands(T, players) {
        const def = T.def, g = this.game;
        const fx = T.pos.x - Math.sin(T.yaw) * def.reach * 0.6, fz = T.pos.z - Math.cos(T.yaw) * def.reach * 0.6;
        const p = _v2.set(fx, this.ground(fx, fz), fz);
        g.sound?.playTitan?.(p, 'slam', 1);
        g.fx?.explosion?.(p.clone(), 4, 1.5);
        this._quake(p, 1.4, players);
        for (const pl of players) {
            const d = Math.hypot(pl.p.x - p.x, pl.p.z - p.z);
            if (d > def.reach * 0.5) continue;
            const push = new THREE.Vector3(pl.p.x - T.pos.x, 0, pl.p.z - T.pos.z).normalize().multiplyScalar(16).setY(9);
            this._hurt(T, pl, Math.round(def.blow * (1 - d / (def.reach * 0.5) * 0.5)), def.kit === 'fire' ? 'fire' : 'melee', push, `⚡ Удар титана: −${Math.round(def.blow)}`);
        }
        g.sync?.titan?.({ e: 'slam', id: T.id, p: [r2(p.x), r2(p.y), r2(p.z)] });
    }

    /** The stomp under its feet: a big quake; the rock titan raises a ring of stone spikes. */
    _stomp(T, players) {
        const g = this.game;
        const p = _v2.set(T.pos.x, T.pos.y, T.pos.z);
        g.sound?.playTitan?.(p, 'slam', 1.4);
        this._quake(p, 2, players);
        if (T.def.kit === 'rock') for (const pl of players) if (pl.p.distanceTo(T.pos) < T.def.reach * 1.5) this._spikes(T, pl, 'stone');
    }

    // ------------------------------------------------------------------ the ranged blows (each titan its own)
    _ranged(T, foe) {
        const k = T.def.kit;
        T.speed = 0;
        if (k === 'iron') this._sunRay(T, foe);
        else if (k === 'fire') this._throw(T, foe, 'fire');
        else if (k === 'rock') this._throw(T, foe, 'rock');
        else if (k === 'frost') this._spikes(T, foe, 'ice');
        else if (k === 'shade') this._darkWave(T, foe);
    }

    _chest(T, out = new THREE.Vector3()) { return out.set(T.pos.x, T.pos.y + T.def.height * 0.66, T.pos.z); }

    /** Thrown things: blobs of fire (Venus) / boulders (Saturn) on an arc to where the foe is (and a little ahead of him). */
    _throw(T, foe, what) {
        const R = T.def.ranged, g = this.game, S = fxShapes();
        g.sound?.playTitan?.(T.pos, what === 'fire' ? 'fire' : 'throw', 1);
        for (let i = 0; i < (R.n || 1); i++) {
            const from = this._chest(T).add(_v.set(-Math.sin(T.yaw) * T.def.radius, 0, -Math.cos(T.yaw) * T.def.radius));
            const to = new THREE.Vector3(foe.p.x + (Math.random() - 0.5) * 10 * i, foe.p.y, foe.p.z + (Math.random() - 0.5) * 10 * i);
            const dist = from.distanceTo(to), tt = Math.max(1.2, dist / R.speed), grav = 18;
            const vel = new THREE.Vector3((to.x - from.x) / tt, (to.y - from.y) / tt + grav * tt / 2, (to.z - from.z) / tt);
            const size = what === 'fire' ? 2.2 : 3;
            const mesh = new THREE.Mesh(S.ball, what === 'fire' ? S.fireM : S.rockM);
            mesh.scale.setScalar(size);
            mesh.position.copy(from);
            g.scene.add(mesh);
            this._addFx({
                mesh, t: 0, life: tt + 0.5,
                step: (f, dt) => {
                    vel.y -= grav * dt;
                    mesh.position.addScaledVector(vel, dt);
                    mesh.rotation.x += dt * 2; mesh.rotation.y += dt * 1.3;
                    if (what === 'fire' && Math.random() < 0.6) g.fx?.spark?.(mesh.position, 0xff8a20, 0.5, _v.set((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2), 0.6);
                    if (mesh.position.y <= this.ground(mesh.position.x, mesh.position.z) || f.t > tt + 0.3) { this._impact(T, mesh.position.clone(), what); return true; }
                    return false;
                },
            });
        }
        g.sync?.titan?.({ e: 'throw', id: T.id, w: what, to: [r2(foe.p.x), r2(foe.p.y), r2(foe.p.z)] });
    }

    _impact(T, p, what) {
        const g = this.game, R = T.def.ranged;
        g.fx?.explosion?.(p, R.r * 0.6, what === 'fire' ? 1.5 : 1);
        g.sound?.playTitan?.(p, what === 'fire' ? 'burst' : 'crash', 1);
        if (what === 'fire') this._fireGround(p);
        const me = g.character?.group?.position;
        if (me) { const d = me.distanceTo(p); if (d < R.r * 3) g.cameraShake?.(0.4 * (1 - d / (R.r * 3)), 0.5); }
        if (!this.auth) return;
        for (const pl of this._players(T)) {
            const d = pl.p.distanceTo(p);
            if (d > R.r) continue;
            const push = new THREE.Vector3(pl.p.x - p.x, 0, pl.p.z - p.z).normalize().multiplyScalar(10 * (1 - d / R.r)).setY(6);
            this._hurt(T, pl, Math.round(R.dmg * (1 - d / R.r * 0.5)), what === 'fire' ? 'fire' : 'melee', push, what === 'fire' ? `🔥 Огненный шар титана: −${R.dmg}` : `🪨 Валун титана: −${R.dmg}`);
        }
    }

    /** Burning ground where lava touched (Venus): sparks and smoke a while (the fire of the world: Burning). */
    _fireGround(p) {
        const g = this.game;
        if (this.auth) g.burning?.igniteAt?.(p, 3);
        for (let i = 0; i < 14; i++) g.fx?.spark?.(_v.set(p.x + (Math.random() - 0.5) * 6, p.y + 0.3, p.z + (Math.random() - 0.5) * 6), i % 2 ? 0xff7a10 : 0xffc040, 0.6, _v2.set(0, 2 + Math.random() * 3, 0), 1 + Math.random());
    }

    /** Spikes out of the ground round the foe: ice (Neptune — they freeze) or stone (Saturn's stomp). A warning crackle first. */
    _spikes(T, foe, what) {
        const g = this.game, S = fxShapes(), R = T.def.ranged, n = 10, rad = what === 'ice' ? R.r * 0.55 : 7;
        const c = foe.p.clone();
        g.sound?.playTitan?.(c, what === 'ice' ? 'frost' : 'crash', 1);
        const meshes = [];
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, rr = rad * (0.6 + Math.random() * 0.5);
            const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr, y = this.ground(x, z);
            const m = new THREE.Mesh(S.spike, what === 'ice' ? S.iceM : S.stoneM);
            const h = 5 + Math.random() * 5;
            m.scale.set(1.1 + Math.random() * 0.6, 0.01, 1.1 + Math.random() * 0.6);
            m.position.set(x, y - 0.5, z);
            m.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
            m.userData.h = h;
            g.scene.add(m);
            meshes.push(m);
        }
        let hit = false;
        const holder = new THREE.Group();
        this._addFx({
            mesh: holder, extra: meshes, t: 0, life: 4,
            step: (f) => {
                const k = f.t < 0.7 ? 0 : f.t < 0.95 ? (f.t - 0.7) / 0.25 : f.t > 3.3 ? Math.max(0, 1 - (f.t - 3.3) / 0.7) : 1;
                for (const m of meshes) { m.scale.y = 0.01 + m.userData.h * k; m.position.y = this.ground(m.position.x, m.position.z) - 0.5 + m.scale.y / 2; }
                if (!hit && f.t >= 0.75 && this.auth) {
                    hit = true;
                    for (const pl of this._players(T)) if (pl.p.distanceTo(c) < rad * 1.2) this._hurt(T, pl, R.dmg || 6, what === 'ice' ? 'freeze' : 'melee', new THREE.Vector3(0, 9, 0), what === 'ice' ? `❄️ Ледяные шипы: −${R.dmg}, вы вмёрзли` : '🪨 Каменные шипы из-под земли!');
                }
                return false;
            },
        });
        if (this.auth) g.sync?.titan?.({ e: 'spikes', id: T.id, w: what, p: [r2(c.x), r2(c.y), r2(c.z)] });
    }

    /** Mercury: the mirror on its breast gathers the sunlight 1.2 s — then a beam along that line (blinds). */
    _sunRay(T, foe) {
        const g = this.game, S = fxShapes(), R = T.def.ranged;
        const from = this._chest(T), aim = foe.p.clone().setY(foe.p.y + 1.6);
        const dir = aim.clone().sub(from).normalize();
        const beam = new THREE.Mesh(S.cyl, S.rayM);
        beam.visible = false;
        g.scene.add(beam);
        g.sound?.playTitan?.(from, 'charge', 1);
        let hit = false;
        this._addFx({
            mesh: beam, t: 0, life: 2.1,
            step: (f) => {
                if (f.t < 1.2) { if (Math.random() < 0.7) g.fx?.spark?.(from.clone().addScaledVector(dir, T.def.radius * 0.6), 0xfff4c0, 1.2, _v.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), 0.4); return false; }
                beam.visible = true;
                const len = R.len, w = R.r * (1 - Math.max(0, f.t - 1.6) / 0.5);
                beam.position.copy(from).addScaledVector(dir, len / 2);
                beam.quaternion.setFromUnitVectors(_v.set(0, 1, 0), dir);
                beam.scale.set(Math.max(0.05, w), len, Math.max(0.05, w));
                if (!hit) {
                    hit = true;
                    g.sound?.playTitan?.(from, 'ray', 1);
                    g.fx?.lightFlash?.(from.clone(), 0xfff4c0, 6, 0.6, 120);
                    if (this.auth) for (const pl of this._players(T)) {
                        _v.copy(pl.p).setY(pl.p.y + 1.6).sub(from);
                        const t = Math.max(0, Math.min(len, _v.dot(dir)));
                        if (_v.addScaledVector(dir, -t).length() < R.r + 0.8) this._hurt(T, pl, R.dmg, 'blind', null, `☀️ Солнечный луч титана: −${R.dmg}, вы ослеплены`);
                    }
                }
                return false;
            },
        });
        if (this.auth) g.sync?.titan?.({ e: 'ray', id: T.id, to: [r2(aim.x), r2(aim.y), r2(aim.z)] });
    }

    /** Mercury's magnet: the weapons in the hands of players near fly out to it. */
    _magnet(T, players) {
        const g = this.game;
        g.sound?.playTitan?.(T.pos, 'magnet', 1);
        for (const pl of players) {
            if (pl.p.distanceTo(T.pos) > T.def.magnet.r) continue;
            if (pl.local) this._magnetMe(T);
            else g.sync?.titan?.({ e: 'magnet', id: T.id, to: pl.id });
        }
    }
    _magnetMe(T) {
        const g = this.game, it = g.items;
        let took = false;
        for (const side of ['right', 'left']) {
            const held = it?.heldIn?.(side) ?? it?.held?.[side];
            if (!held || !/sword|axe|shield|hammer|spear|blade|pistol|saber|rapier/i.test(held.kind || held.type || '')) continue;
            const dir = _v.subVectors(this._chest(T), g.character.group.position).normalize().multiplyScalar(14).setY(6);
            if (it.throwFrom?.(side, dir) ?? it.dropHeld?.(side, dir)) took = true;
        }
        g.hud?.setVoice?.(took ? '🧲 Титан вырвал оружие у вас из рук!' : '🧲 Железо вокруг тянет к титану', true);
    }

    /** Uranus: a wave of darkness from it — the light round a hero it reaches is gone a while; then (later) it steps through the dark. */
    _darkWave(T, foe) {
        const g = this.game, S = fxShapes(), R = T.def.ranged;
        const ring = new THREE.Mesh(S.ball, S.darkM);
        ring.position.copy(T.pos).setY(T.pos.y + 4);
        g.scene.add(ring);
        g.sound?.playTitan?.(T.pos, 'dark', 1);
        const hitIds = new Set();
        this._addFx({
            mesh: ring, t: 0, life: 2.4,
            step: (f) => {
                const rr = 5 + f.t * 70;
                ring.scale.set(rr, rr * 0.35, rr);
                ring.material.opacity = 0.55 * (1 - f.t / 2.4);
                if (this.auth) for (const pl of this._players(T)) if (!hitIds.has(pl.id) && Math.abs(pl.p.distanceTo(T.pos) - rr) < 6) { hitIds.add(pl.id); this._hurt(T, pl, R.dmg, 'dark', null, `🌑 Волна тьмы: −${R.dmg}, свет вокруг погас`); }
                return false;
            },
        });
        void foe;
        if (this.auth) g.sync?.titan?.({ e: 'dark', id: T.id });
    }

    /** Uranus: it melts into the dark and comes out beside the foe (behind him, facing him). */
    _blink(T, foe) {
        const g = this.game, B = T.def.blink;
        const a = Math.random() * Math.PI * 2, r = rand(B.far);
        this._smoke(T.pos, 40, 0x0a2a30);
        T.pos.set(foe.p.x + Math.cos(a) * r, 0, foe.p.z + Math.sin(a) * r);
        T.pos.y = this.ground(T.pos.x, T.pos.z);
        T.yaw = yawTo(T.pos.x, T.pos.z, foe.p.x, foe.p.z);
        T.blowCool = Math.min(T.blowCool, 0.8);
        this._smoke(T.pos, 40, 0x0a2a30);
        g.sound?.playTitan?.(T.pos, 'dark', 0.8);
    }

    /** Uranus: how much it is lit (0…1) — the light of a player near (Lumos, a fire, a lightning): seen and hurt fully only so. */
    _shadeLight(T, players) {
        const g = this.game;
        let lit = 0;
        const lumos = g.lumos?.active || g.lumos?.lit || g.combat?.lumos;
        for (const pl of players) if (pl.local && lumos && pl.p.distanceTo(T.pos) < 60) lit = 1;
        if (g.burning?.near?.(T.pos, 30)) lit = 1;
        if (T.flashT > 0) lit = 1;
        T.lit += ((lit ? 1 : 0) - T.lit) * 0.1;
    }

    // ------------------------------------------------------------------ the sandworm
    _thinkWorm(T, dt, foe, players) {
        const def = T.def;
        T.wT -= dt; T.rangedCool -= dt;
        if (foe) T.heard = foe.p.clone(); // (it follows the steps it hears)
        if (T.wm === 'under') {
            // swims under the sand to where it heard steps (or wanders): fast; the wave over the dunes shows where
            const to = T.heard || T.wanderTo || T.home;
            const wy = yawTo(T.pos.x, T.pos.z, to.x, to.z);
            this._turn(T, wy, dt * 3);
            const dist = Math.hypot(to.x - T.pos.x, to.z - T.pos.z);
            const sp = Math.min(def.walk, dist);
            T.pos.x += -Math.sin(T.yaw) * sp * dt; T.pos.z += -Math.cos(T.yaw) * sp * dt;
            T.pos.y = this.ground(T.pos.x, T.pos.z);
            T.speed = sp;
            if (!T.heard && (!T.wanderTo || dist < 15)) { const a = Math.random() * 6.28, r = Math.random() * TITAN.HOME_R; T.wanderTo = new THREE.Vector3(T.home.x + Math.cos(a) * r, 0, T.home.z + Math.sin(a) * r); }
            T.rumbleT = (T.rumbleT || 0) - dt;
            if (T.rumbleT <= 0) { T.rumbleT = 0.5; this._quake(T.pos, 0.6, []); }
            if (foe && dist < 6 && T.wT <= 0) { T.wm = 'rising'; T.wT = 1.6; T.riseAt = foe.p.clone(); this.game.sound?.playTitan?.(T.pos, 'rumble', 1.2); }
            return;
        }
        if (T.wm === 'rising') {
            // the rumble under the foe: the ground shakes harder — run! then it bursts up
            if (Math.random() < 0.4) this._quake(T.riseAt, 1.2, []);
            if (T.wT <= 0) {
                T.wm = 'up'; T.wT = 5 + Math.random() * 2; T.up = 0;
                T.pos.set(T.riseAt.x, this.ground(T.riseAt.x, T.riseAt.z), T.riseAt.z);
                this.game.sound?.playTitan?.(T.pos, 'burst', 1.6);
                this.game.fx?.explosion?.(T.pos.clone(), def.radius, 2);
                // the swallow: who stands in the circle of its mouth
                for (const pl of players) {
                    const d = Math.hypot(pl.p.x - T.pos.x, pl.p.z - T.pos.z);
                    if (d < def.radius) this._hurt(T, pl, def.blow, 'melee', new THREE.Vector3((Math.random() - 0.5) * 20, 24, (Math.random() - 0.5) * 20), `🪱 Песчаный змей проглотил вас и выплюнул: −${def.blow}`);
                    else if (d < def.radius * 2.5) this._hurt(T, pl, 4, 'melee', new THREE.Vector3(pl.p.x - T.pos.x, 0, pl.p.z - T.pos.z).normalize().multiplyScalar(14).setY(8), '🪱 Песок взрывается под ногами!');
                }
                this._quake(T.pos, 2.5, players);
            }
            return;
        }
        if (T.wm === 'up') {
            // up and arched: it can be hurt now; it turns to the foe and sweeps its tail / brings down a wall of sand
            T.up = Math.min(1, T.up + dt * 1.5);
            if (foe) this._turn(T, yawTo(T.pos.x, T.pos.z, foe.p.x, foe.p.z), dt * 2);
            if (foe && T.rangedCool <= 0) {
                T.rangedCool = rand(def.ranged.every);
                const R = def.ranged;
                this.game.sound?.playTitan?.(T.pos, 'slam', 1.2);
                for (const pl of players) { const d = pl.p.distanceTo(T.pos); if (d < R.r * 2 && d > def.radius) this._hurt(T, pl, R.dmg, 'melee', new THREE.Vector3(pl.p.x - T.pos.x, 0, pl.p.z - T.pos.z).normalize().multiplyScalar(16).setY(7), `🪱 Хвост змея: −${R.dmg}`); }
            }
            if (T.wT <= 0) { T.wm = 'diving'; T.wT = 1.4; this.game.sound?.playTitan?.(T.pos, 'rumble', 1); }
            return;
        }
        if (T.wm === 'diving') {
            T.up = Math.max(0, T.up - dt * 0.8);
            if (T.wT <= 0) { T.wm = 'under'; T.wT = 3 + Math.random() * 3; T.up = 0; }
        }
    }

    // ------------------------------------------------------------------ the living storm
    _thinkStorm(T, dt, foe, players) {
        const def = T.def;
        T.rangedCool -= dt;
        const to = foe ? foe.p : (T.pos.distanceTo(T.home) > TITAN.HOME_R ? T.home : (T.wanderTo || T.home));
        if (!foe && (!T.wanderTo || T.pos.distanceTo(T.wanderTo) < 30)) { const a = Math.random() * 6.28; T.wanderTo = new THREE.Vector3(T.home.x + Math.cos(a) * TITAN.HOME_R * 0.6, 0, T.home.z + Math.sin(a) * TITAN.HOME_R * 0.6); }
        const dx = to.x - T.pos.x, dz = to.z - T.pos.z, d = Math.hypot(dx, dz) || 1;
        const sp = Math.min(def.walk * (foe ? 1 : 0.5), d);
        T.pos.x += dx / d * sp * dt; T.pos.z += dz / d * sp * dt;
        T.pos.y = this.ground(T.pos.x, T.pos.z);
        T.speed = sp;
        // the pull and the throw (for each player: mine here, the others' told every 0.25 s as a push)
        T.pullT = (T.pullT || 0) - dt;
        const tick = T.pullT <= 0;
        if (tick) T.pullT = 0.25;
        for (const pl of players) {
            const ex = T.pos.x - pl.p.x, ez = T.pos.z - pl.p.z, e = Math.hypot(ex, ez);
            if (e > def.pull.r) continue;
            if (e < def.radius * 0.8) {
                if (tick) this._hurt(T, pl, 0, 'melee', new THREE.Vector3(-ex / (e || 1) * 18 + ez / (e || 1) * 12, 26, -ez / (e || 1) * 18 - ex / (e || 1) * 12), '🌪️ Вихрь подхватил вас и швырнул!');
            } else if (tick) {
                const k = def.pull.speed * (1 - e / def.pull.r) * 0.25 * 4;
                this._hurt(T, pl, 0, 'melee', new THREE.Vector3(ex / e * k + ez / e * k * 0.6, 0.4, ez / e * k - ex / e * k * 0.6), '');
            }
        }
        if (foe && T.rangedCool <= 0 && foe.p.distanceTo(T.pos) < TITAN.SEE) { T.rangedCool = rand(def.ranged.every); this._bolt(T, foe.p.clone()); }
    }

    /** A lightning bolt from the whirl to `at` (a white flash of the funnel first). */
    _bolt(T, at) {
        const g = this.game, S = fxShapes(), R = T.def.ranged;
        const from = new THREE.Vector3(T.pos.x + (Math.random() - 0.5) * 20, T.pos.y + T.def.height * (0.4 + Math.random() * 0.4), T.pos.z + (Math.random() - 0.5) * 20);
        const pts = [];
        const n = 14;
        for (let i = 0; i <= n; i++) { const t = i / n; pts.push(from.clone().lerp(at, t).add(_v.set((Math.random() - 0.5) * 8 * Math.sin(t * Math.PI), (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8 * Math.sin(t * Math.PI)))); }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), S.boltM);
        g.scene.add(line);
        T.flashT = 0.25;
        g.fx?.lightFlash?.(at.clone(), 0xc8dcff, 8, 0.3, 80);
        g.sound?.playTitan?.(at, 'thunder', 1.4);
        this._addFx({ mesh: line, t: 0, life: 0.35, ownGeo: true, step: (f) => { line.visible = Math.random() > 0.3; return false; } });
        if (this.auth) {
            for (const pl of this._players(T)) if (pl.p.distanceTo(at) < R.r + 2) this._hurt(T, pl, R.dmg, 'melee', new THREE.Vector3(0, 6, 0), `⚡ Молния вихря: −${R.dmg}`);
            g.sync?.titan?.({ e: 'bolt', id: T.id, p: [r2(at.x), r2(at.y), r2(at.z)] });
        }
    }

    // ------------------------------------------------------------------ blows on it
    targets() {
        const out = this._targ || (this._targ = []);
        out.length = 0;
        for (const T of this.active.values()) if (T.mode !== 'dying' && this.hittable(T)) out.push(T);
        return out;
    }
    byId(id) { return this.active.get(id) || null; }
    /** May a blow reach it now? (the worm only when up) */
    hittable(T) { return T.def.kit !== 'worm' || T.wm === 'up' || T.wm === 'diving' || T.wm === 'rising'; }

    /** A blow (host): HP by the rules — the gods' spells ×3, «Дай» a third, its own immunities; the shade unlit takes a quarter. */
    hit(T, dmg, spell = null, by = null, kind = null) {
        const g = this.game;
        if (!T || T.mode === 'dying' || !this.hittable(T)) return;
        if (!this.auth) { g.sync?.titan?.({ e: 'hit', id: T.id, dmg, spell, by, kind }); return; }
        let d = titanDamage(spell, dmg, { god: GOD_SPELLS.has(spell), hpMax: T.def.hp });
        d *= titanResist(T.id, spell || kind || '');
        if (T.def.kit === 'shade' && T.lit < 0.5) d *= 0.25;
        if (!(d > 0)) { if (spell || kind) g.hud?.setVoice?.(`⚡ ${T.def.name}: это его не берёт`, true); return; }
        T.hp -= d;
        T.hurtT = 0.25;
        if (by != null) { T.foe = by; g.achievements?.hit?.('titan_' + T.id, T.id, by); }
        if (d >= 60 && Math.random() < 0.4) this._say(T, TITAN_LINES.hurt);
        if (T.hp <= 0) this._dies(T, by);
    }

    hitAt(pos, radius, dmg, spell = null, by = null) {
        for (const T of this.active.values()) {
            if (T.mode === 'dying' || !this.hittable(T)) continue;
            const d = Math.hypot(pos.x - T.pos.x, pos.z - T.pos.z);
            if (d < radius + T.def.radius && pos.y > T.pos.y - 4 && pos.y < T.pos.y + T.def.height + 4) this.hit(T, dmg * Math.max(0.4, 1 - Math.max(0, d - T.def.radius) / (radius + 1)), spell, by);
        }
    }

    hitRay(o, d, len, width, dmg, spell = null, by = null) {
        for (const T of this.active.values()) {
            if (T.mode === 'dying' || !this.hittable(T)) continue;
            const c = titanCenter(T, _v2);
            _v.subVectors(c, o);
            const t = Math.max(0, Math.min(len, _v.dot(d)));
            if (_v.addScaledVector(d, -t).length() < width + T.def.radius + T.def.height * 0.3) this.hit(T, dmg, spell, by);
        }
    }

    boltHit(T, spell, by) { this.hit(T, TITAN_BOLT[spell] ?? 4, spell, by); }

    _dies(T, by) {
        const g = this.game;
        T.mode = 'dying'; T.dieT = 0;
        this.state.dead.push(T.id);
        this._say(T, TITAN_LINES.death);
        g.sound?.playTitan?.(T.pos, 'death', 1.6);
        g.cameraShake?.(0.8, 2.5);
        g.achievements?.killed?.('titan_' + T.id, T.id, by, T.pos);
        g.hud?.setVoice?.(`⚡ ${T.def.name} пал. Из его тела поднимается осколок силы богов и уходит к Солнцу…`, true);
        this._shard(T);
        g.godhood?.titanDied?.(T.id);
        if (g.sync) g.sync.titan?.({ e: 'dead', id: T.id });
    }

    /** The shard of the gods' power rising from the fallen titan up to the sky (a glowing crystal, a trail of sparks). */
    _shard(T) {
        const g = this.game, S = fxShapes();
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), S.shardM);
        m.position.copy(T.pos).setY(T.pos.y + T.def.height * 0.5);
        g.scene.add(m);
        g.fx?.lightFlash?.(m.position.clone(), 0xfff0b0, 10, 3, 200);
        this._addFx({
            mesh: m, t: 0, life: 9, ownGeo: true,
            step: (f, dt) => {
                m.rotation.y += dt * 3; m.rotation.x += dt;
                m.position.y += (f.t < 2 ? 2 : 25) * dt;
                m.scale.setScalar(1 + Math.sin(f.t * 8) * 0.15);
                if (Math.random() < 0.8) g.fx?.spark?.(m.position, 0xffe8a0, 0.8, _v.set((Math.random() - 0.5) * 3, -2, (Math.random() - 0.5) * 3), 1.2);
                return false;
            },
        });
    }

    // ------------------------------------------------------------------ drawing
    _draw(T, dt) {
        const m = T.model, def = T.def;
        T.hurtT = Math.max(0, (T.hurtT || 0) - dt);
        T.flashT = Math.max(0, (T.flashT || 0) - dt);
        if (def.look === 'worm') return this._drawWorm(T, dt);
        if (def.look === 'storm') return this._drawStorm(T, dt);
        m.position.copy(T.pos);
        m.rotation.y = T.yaw;
        if (T.mode === 'dying') {
            // it falls forward, slowly, and crumbles into the ground
            T.dieT += dt;
            const k = Math.min(1, T.dieT / 3.5);
            m.rotation.x = -k * k * 1.45;
            m.position.y = T.pos.y - Math.max(0, T.dieT - 3) * 4;
            if (T.dieT < 6 && Math.random() < 0.9) this._smoke(_v.copy(T.pos).add(_v2.set((Math.random() - 0.5) * def.radius * 3, def.height * Math.random() * 0.6, (Math.random() - 0.5) * def.radius * 3)), 3, def.look === 'lava' ? 0xff6010 : def.look === 'ice' ? 0xd8f0ff : def.look === 'shade' ? 0x1a4a50 : 0x8a867e);
            if (T.dieT > 8) this._drop(T.id);
            return;
        }
        poseWalker(m, { ph: T.ph, k: Math.min(1, T.speed / Math.max(0.1, def.walk * 0.45)), blow: T.blowT, arm: 1, stomp: T.stompT, breathe: T.t * 1.4 });
        // the glow breathing; red when hurt; the shade: seen in light only
        for (const mat of m.userData.glow || []) {
            if (mat.userData.base == null) mat.userData.base = mat.emissiveIntensity;
            mat.emissiveIntensity = mat.userData.base * (1 + 0.15 * Math.sin(T.t * 2.2)) + (T.hurtT > 0 ? 1.5 : 0);
        }
        if (def.look === 'shade') { const op = 0.15 + 0.75 * T.lit; m.traverse((o) => { if (o.material && o.material.transparent) o.material.opacity = op; }); }
        if (def.look === 'lava' && Math.random() < 0.5) this.game.fx?.spark?.(_v.set(T.pos.x + (Math.random() - 0.5) * def.radius * 1.6, T.pos.y + def.height * (0.5 + Math.random() * 0.5), T.pos.z + (Math.random() - 0.5) * def.radius * 1.6), 0xff8a20, 0.8, _v2.set(0, 4 + Math.random() * 4, 0), 1.2);
        if (def.look === 'ice' && Math.random() < 0.6) this.game.fx?.spark?.(_v.set(T.pos.x + (Math.random() - 0.5) * 40, T.pos.y + 3 + Math.random() * def.height, T.pos.z + (Math.random() - 0.5) * 40), 0xffffff, 0.3, _v2.set(-3 + Math.random(), -1.5, Math.random()), 2.5); // (its snowstorm)
    }

    /** The worm's rings along its body: under — a hump of sand moving; up — an arch out of the ground, the head high, the mouth open. */
    _drawWorm(T, dt) {
        const R = T.model.userData.rig, def = T.def, n = R.rings.length, thick = def.radius * 2;
        const up = T.up || 0, fwdx = -Math.sin(T.yaw), fwdz = -Math.cos(T.yaw);
        T.model.visible = up > 0.02 || T.wm === 'rising';
        if (T.mode === 'dying') { T.dieT += dt; T.up = Math.max(0, 1 - T.dieT / 4); if (T.dieT > 6) this._drop(T.id); }
        // the sand wave over it while under (the dunes run) — dust on the surface
        if ((T.wm === 'under' || T.wm === 'rising') && Math.random() < (T.wm === 'rising' ? 1 : 0.6)) for (let i = 0; i < 3; i++) this.game.fx?.spark?.(_v.set(T.pos.x + (Math.random() - 0.5) * thick * 1.5, T.pos.y + 0.5, T.pos.z + (Math.random() - 0.5) * thick * 1.5), 0xc8885a, 1.4, _v2.set((Math.random() - 0.5) * 3, 3 + Math.random() * 4, (Math.random() - 0.5) * 3), 1.4);
        if (!T.model.visible) return;
        const H = def.height * 0.38 * up, len = n * thick * 0.42;
        let headPos = null;
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1); // (0 the head … 1 the tail, deep in the ground)
            // the arch: the head high over its hole, the body curving back down into the sand behind
            const along = s * len, h = H * Math.max(0, Math.cos(s * Math.PI * 0.75)) - s * thick * 2 + Math.sin(T.t * 2 + s * 6) * thick * 0.08;
            const x = T.pos.x - fwdx * along * 0.5, z = T.pos.z - fwdz * along * 0.5;
            const ring = R.rings[i];
            ring.position.set(x, T.pos.y + h - thick * 0.3, z);
            ring.scale.setScalar(thick);
            // each ring looks along the body's line (towards the ring before it)
            const prev = i ? R.rings[i - 1].position : null;
            if (prev) { _v.subVectors(prev, ring.position); if (_v.lengthSq() > 1e-4) ring.quaternion.setFromUnitVectors(_v2.set(0, 0, -1), _v.normalize()); }
            else { ring.quaternion.setFromEuler(_e.set(-Math.PI / 2 * up, T.yaw, 0, 'YXZ')); headPos = ring.position; }
        }
        R.head.position.copy(headPos).add(_v.set(0, thick * 0.25, 0));
        R.head.quaternion.copy(R.rings[0].quaternion);
        R.head.scale.setScalar(thick);
        const open = T.wm === 'up' ? 0.6 + 0.3 * Math.sin(T.t * 3) : T.wm === 'rising' ? 1 : 0.2;
        for (const p of R.petals) p.rotation.x = -open * 1.1;
        if (T.mode === 'dying') for (const r of R.rings) r.position.y -= T.dieT * 3;
    }

    _drawStorm(T, dt) {
        const m = T.model, R = m.userData.rig, def = T.def;
        m.position.copy(T.pos);
        m.scale.set(def.height, def.height, def.height);
        const mat = m.userData.stormMat;
        mat.userData.uT.value += dt;
        mat.userData.uFlash.value = T.flashT > 0 ? 1 : Math.max(0, mat.userData.uFlash.value - dt * 3);
        R.funnels.forEach((f, i) => { f.rotation.y += dt * (1.2 + i * 0.5) * (i % 2 ? -1 : 1); f.position.x = Math.sin(T.t * 0.7 + i) * 0.015; });
        // the face turns to the foe (or wanders)
        const foe = T.foe != null ? this._players(T).find((q) => q.id === T.foe) : null;
        R.face.rotation.y = foe ? Math.atan2(-(foe.p.x - T.pos.x), -(foe.p.z - T.pos.z)) : T.t * 0.2;
        R.face.position.set(Math.sin(R.face.rotation.y) * -0.17, 0.68, Math.cos(R.face.rotation.y) * -0.17);
        R.mouth.scale.y = 0.7 + 0.3 * Math.sin(T.t * 3);
        // the debris it carries round
        for (let i = 0; i < 60; i++) {
            const a = T.t * (1.5 + (i % 5) * 0.3) + i * 2.4, h = ((i * 0.137 + T.t * 0.05) % 1), rr = 0.05 + 0.2 * h ** 1.4;
            _m.compose(_v.set(Math.cos(a) * rr, h, Math.sin(a) * rr), _q.setFromEuler(_e.set(a, a * 0.7, 0)), _s.setScalar(1 + (i % 3)));
            R.debris.setMatrixAt(i, _m);
        }
        R.debris.instanceMatrix.needsUpdate = true;
        if (T.mode === 'dying') {
            T.dieT += dt;
            const k = Math.max(0, 1 - T.dieT / 5);
            m.scale.set(def.height * (1 + T.dieT * 0.2), def.height * k, def.height * (1 + T.dieT * 0.2));
            if (T.dieT > 5.5) this._drop(T.id);
        }
    }

    _smoke(p, n, col) {
        const fx = this.game.fx;
        if (!fx?.spark) return;
        for (let i = 0; i < n; i++) fx.spark(_v.set(p.x + (Math.random() - 0.5) * 6, p.y + Math.random() * 6, p.z + (Math.random() - 0.5) * 6), col, 1.6, _v2.set((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4), 1.5 + Math.random());
    }

    // ------------------------------------------------------------------ effects
    _addFx(f) { this.game.scene.add(f.mesh); this.fxList.push(f); if (this.fxList.length > 40) this._endFx(this.fxList.shift()); }
    _endFx(f) {
        const sc = this.game.scene;
        sc.remove(f.mesh);
        for (const m of f.extra || []) sc.remove(m);
        if (f.ownGeo) f.mesh.geometry?.dispose?.();
    }
    _stepFx(dt) {
        for (let i = this.fxList.length - 1; i >= 0; i--) {
            const f = this.fxList[i];
            f.t += dt;
            if (f.step(f, dt) || f.t > f.life) { this._endFx(f); this.fxList.splice(i, 1); }
        }
    }

    // ------------------------------------------------------------------ the network
    _netSend(dt) {
        const g = this.game;
        if (!g.sync || !this.active.size) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.12;
        const s = [];
        for (const T of this.active.values()) s.push([T.id, r2(T.pos.x), r2(T.pos.y), r2(T.pos.z), r2(T.yaw), T.mode, Math.round(T.hp), r2(T.speed), r2(T.blowT), r2(T.stompT), T.wm, r2(T.up || 0), T.foe, r2(T.lit || 0)]);
        g.sync.titan?.({ e: 'st', s });
    }

    _follow(T, dt) {
        T.t += dt;
        const S = this._net?.get(T.id);
        if (!S) return;
        const k = Math.min(1, dt * 8);
        T.pos.x += (S[1] - T.pos.x) * k; T.pos.y += (S[2] - T.pos.y) * k; T.pos.z += (S[3] - T.pos.z) * k;
        T.yaw += angDiff(T.yaw, S[4]) * k;
        if (S[5] === 'dying' && T.mode !== 'dying') { T.mode = 'dying'; T.dieT = 0; this._shard(T); }
        T.hp = S[6]; T.speed = S[7]; T.blowT = S[8]; T.stompT = S[9]; T.wm = S[10]; T.up = S[11]; T.foe = S[12]; T.lit = S[13];
        T.ph += (T.speed / T.def.walk) * Math.PI / TITAN.STEP_T * dt;
    }

    /** A `titan` message (NetSync). */
    onNet(m, from) {
        const g = this.game, T = this.active.get(m.id);
        if (m.e === 'st') { this._net = new Map((m.s || []).map((r) => [r[0], r])); return; }
        if (m.e === 'say') { if (!this.auth) g.hud?.setVoice?.(`⚡ ${TITANS[m.id]?.name}: «${m.t}»`, true); return; }
        if (m.e === 'hurt') { if (m.to === g.localId) this._hurtMe(T || { def: TITANS[m.id] }, m.dmg, m.kind, m.push ? new THREE.Vector3(...m.push) : null, m.msg); return; }
        if (m.e === 'magnet') { if (m.to === g.localId && T) this._magnetMe(T); return; }
        if (m.e === 'dead') { if (!this.state.dead.includes(m.id)) this.state.dead.push(m.id); g.godhood?.titanDied?.(m.id); return; }
        if (!this.auth) {
            // the effects the host made: shown here the same (no damage — the host told us that apart)
            if (!T) return;
            if (m.e === 'step') this._quake(_v.set(...m.p), 1, []);
            else if (m.e === 'slam') { g.fx?.explosion?.(new THREE.Vector3(...m.p), 4, 1.5); this._quake(_v.set(...m.p), 1.4, []); }
            else if (m.e === 'throw') this._throw(T, { p: new THREE.Vector3(...m.to) }, m.w);
            else if (m.e === 'spikes') this._spikes(T, { p: new THREE.Vector3(...m.p) }, m.w);
            else if (m.e === 'ray') this._sunRay(T, { p: new THREE.Vector3(...m.to).setY(m.to[1] - 1.6) });
            else if (m.e === 'dark') this._darkWave(T, null);
            else if (m.e === 'bolt') this._bolt(T, new THREE.Vector3(...m.p));
            return;
        }
        if (m.e === 'hit' && T) this.hit(T, m.dmg, m.spell, m.by ?? from, m.kind);
    }

    // ------------------------------------------------------------------ the save
    snapshot() { return { dead: [...this.state.dead], dents: { ...this.state.dents } }; }
    restore(s) {
        if (!s) return;
        this.state = { dead: (s.dead || []).filter((id) => TITANS[id]), dents: { ...(s.dents || {}) } };
        for (const id of [...this.active.keys()]) this._drop(id);
    }
    dispose() { for (const id of [...this.active.keys()]) this._drop(id); for (const f of this.fxList) this._endFx(f); this.fxList.length = 0; }

    /** Shapes and materials to compile on the loading screen (Game.prewarm). */
    static samplesFx() {
        const S = fxShapes();
        return [new THREE.Mesh(S.ball, S.fireM), new THREE.Mesh(S.spike, S.iceM), new THREE.Mesh(S.spike, S.stoneM), new THREE.Mesh(S.cyl, S.rayM), new THREE.Mesh(S.ball, S.darkM)];
    }
    static samples() {
        const S = fxShapes();
        return [...titanSamples(), new THREE.Mesh(S.ball, S.fireM), new THREE.Mesh(S.spike, S.iceM), new THREE.Mesh(S.spike, S.stoneM), new THREE.Mesh(S.cyl, S.rayM), new THREE.Mesh(S.ball, S.darkM)];
    }
}

/** A charge's target capsule (Duel._bodies): from the feet to the head (the worm — its raised head; the storm — its heart). */
export function titanBody(T, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
    const p = T.pos, def = T.def;
    if (def.look === 'worm') { out.r = def.radius; out.a.set(p.x, p.y, p.z); out.b.set(p.x, p.y + def.height * 0.38 * (T.up || 0), p.z); return out; }
    out.r = def.radius;
    out.a.set(p.x, p.y + out.r, p.z);
    out.b.set(p.x, p.y + def.height * (def.flies ? 0.8 : 0.85), p.z);
    return out;
}
export function titanCenter(T, out = new THREE.Vector3()) { return out.set(T.pos.x, T.pos.y + (T.def.look === 'worm' ? T.def.height * 0.3 * (T.up || 0) : T.def.height * 0.55), T.pos.z); }

// pushes and gusts (CreatureImpact): a titan does not fall and is not thrown — a mountain does not reel
registerKind('W', {
    name: 'titan', faces: -1,
    list: (g) => g.titans?.list || [],
    get: (g, id) => g.titans?.byId(id),
    alive: (c) => c.mode !== 'dying' && (c.def.kit !== 'worm' || c.wm === 'up'),
    body: () => 'titan',
    centre: (c, out) => titanCenter(c, out),
    pivot: () => ({ obj: null, base: 0, lie: 0 }),
    head: () => null, arms: () => [], legs: () => [],
    move() {},
    toss() {},
    hold() {},
    frozen: () => false,
    noKnock: () => true,
    struck(g, c, o) { if (o.by != null) c.foe = o.by; },
});
