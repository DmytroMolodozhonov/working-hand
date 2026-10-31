/**
 * Taron.js — the Tarons («Тароны») of the underworld: fat, reddish, horned giants (twice a man's size) with a huge axe-hammer, in camps.
 * Rules, numbers and the «who / what» table: TaronRules.js; the look: fx/TaronModel.js; the voices: audio/TaronSounds.js.
 *
 *   Where     the camps of the underworld's plan (`setPlan({taronCamps: [{x, z, n, r}]})` — src/world/HellMap.js `hellPlan(seed)`; until a plan exists nobody is
 *             made). A camp is loaded 240 m round a player and put away at 400 m; its Tarons are made a few a frame, only once the land is made
 *             (TerrainData.landMade). A killed Taron is a gap in his camp: +1 after 15 game minutes, never above the camp's `n`.
 *   Calm      they stand about, shift their weight, snort, walk a few steps round the camp. Whoever is not theirs and is seen within 40 m (or has hurt one of
 *             them: 30 s of grudge, 70 m) is an enemy: a roar, then the whole camp's awake.
 *   Hunt      walks at HALF the player's speed (never runs), faces the victim fully, winds up (0.9 s — the arms up and back, seen and heard), swings: the blade
 *             (−22, a hard shove, breaks a «Protection» shield) or the hammer (−14 and a daze), 9 m in a cone; then recovers (0.8 s). At most 3 on one
 *             victim; the others wait, or pick another. He does not chase farther than 70 m from the camp: he turns back and walks home.
 *   Narrow    a passage narrower than he is (a bridge < 5 m): he stops and waits at its mouth, swinging at what is within reach.
 *   Death     he falls; spoils: coins, iron, red stones, now and then the axe-hammer; the tenth Tarons' hunter gets an achievement. The tread shakes creatures
 *             within 15 m (CreatureImpact). He steps through wooden walls (planks, doors) with his swing.
 *   Network   the host leads (minds, hits, deaths) and tells each computer the places (8×/s), a swing's start, a death; a guest's blow goes to the host.
 */
import * as THREE from 'three';
import { TARON, TARGETS, ENEMY_KINDS, taronLook, harmOf, walkSpeed, swingSide, swingHits, swingDamage, campSize, respawnStep, lootRoll, packSlots, FRIENDS } from './TaronRules.js';
import { taronModel, poseTaron } from '../fx/TaronModel.js';
import { FarShape } from '../core/FarShape.js';
import { crowdStep, crowdNear } from './CrowdSources.js';
import { BODY_R } from './Crowd.js';
import { registerKind } from './CreatureImpact.js';
import { newUid } from './ItemTypes.js';
import { BLOCK, isWood } from '../world/Terrain.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3();
const wrap = (a) => { a = (a + Math.PI) % TAU; return a < 0 ? a + Math.PI : a - Math.PI; };
const r2 = (x) => Math.round(x * 100) / 100;
const rnd = (a, b) => a + Math.random() * (b - a);
const MODES = ['idle', 'walk', 'hunt', 'windup', 'swing', 'recover', 'flinch', 'roar', 'dead'];
const MODE_NO = Object.fromEntries(MODES.map((m, i) => [m, i]));
const LOAD = 240, KEEP = 400, DRAW = 220, ANIM = 140, FAR = 70, DEATH_T = 6, G = 24;
export const TARON_LOAD = { LOAD, KEEP };

export class Taron {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.byIdMap = new Map();
        this.camps = new Map(); // id → {id, x, z, r, n, dead (killed in a row), respawnT, loaded, alert, grudge}
        this.plan = null;
        this.kills = 0;
        this.enabled = true;
        this._clock = 0; this._tick = 0; this._sendT = 0; this._aroundT = 0; this._scanT = 0;
        this._buf = []; this._buf2 = []; this._tres = [];
        this._claims = new Map(); // victim key → how many Tarons go for it this frame
    }

    get auth() { return this.game.authority !== false; }
    byId(id) { return this.byIdMap.get(id) || null; }
    targets() { return this._targets || (this._targets = []); }
    get _terr() { return this.game.terrain?.data || null; }
    get active() { return !!this.plan?.taronCamps?.length; }

    /** The underworld's plan (src/world/HellMap.js: `hellPlan(seed).taronCamps`) — or null (the world has no camps). */
    setPlan(plan) {
        this.plan = plan || null;
        for (const [id, camp] of [...this.camps]) { this._unload(camp); this.camps.delete(id); }
        if (!plan?.taronCamps) return;
        plan.taronCamps.forEach((c, i) => {
            const id = 'tc' + i;
            this.camps.set(id, { id, i, x: c.x, z: c.z, r: c.r || 30, n: campSize(c.n), dead: 0, respawnT: 0, loaded: false, alert: 0, grudge: null, members: [] });
        });
    }

    _ground(x, z) { const y = this.game.collision?.groundY?.(x, z); return Number.isFinite(y) ? y : 0; }
    _made(x, z) { const t = this._terr; return !t?.landMade || t.landMade(Math.round(x), Math.round(z)); }

    // ============================================================ camps: loaded near the players
    _around(me) {
        const g = this.game;
        const people = [me];
        for (const r of g.remotes?.values?.() || []) if (r.position && !r.dead) people.push(r.position);
        for (const camp of this.camps.values()) {
            const d = people.reduce((m, q) => Math.min(m, Math.hypot(q.x - camp.x, q.z - camp.z)), 1e9);
            if (camp.loaded && d > KEEP) this._unload(camp);
            else if (!camp.loaded && d < LOAD && this._made(camp.x, camp.z)) camp.loaded = true;
        }
    }
    _unload(camp) {
        for (const t of [...camp.members]) this._remove(t, true);
        camp.members.length = 0; camp.loaded = false;
    }
    /** A few Tarons a frame: the camp's missing ones are made (the alive = n − dead). */
    _fill(camp) {
        const want = camp.n - camp.dead;
        if (camp.members.filter((t) => !t.dead).length >= want) return;
        const k = camp.members.length + camp.dead; // (a stable slot: the Tarons of a camp are the same every time)
        const a = (k / camp.n) * TAU + camp.i, rr = camp.r * (0.35 + 0.55 * ((k * 0.37) % 1));
        const x = camp.x + Math.cos(a) * rr, z = camp.z + Math.sin(a) * rr;
        if (!this._made(x, z)) return;
        if (crowdNear(this.game, x, this._ground(x, z), z, TARON.R * 1.5, null, 4, this._buf2).length) return; // (somebody stands there: another try)
        this._make(camp, k, x, z);
    }
    _make(camp, k, x, z) {
        const g = this.game, id = camp.id + 'n' + k + 'g' + camp.dead + 'r' + (camp.born = (camp.born || 0) + 1);
        const look = taronLook(camp.i * 131 + k * 17 + camp.born * 3);
        const model = taronModel(look);
        model.position.set(x, this._ground(x, z), z);
        model.rotation.y = Math.atan2(-(camp.x - x), -(camp.z - z)) + rnd(-0.6, 0.6);
        g.scene.add(model);
        const t = {
            id, ck: 'T', isTaron: true, model, group: model, look, camp, hp: TARON.HP, maxHp: TARON.HP, dead: false, deadT: 0, k,
            st: 'idle', stT: 0, t: 0, mode: 'idle', walk: Math.random() * TAU, speed: 0, breath: Math.random() * 10, side: 'blade',
            target: null, grudge: null, stun: 0, slowT: 0, cool: rnd(0.5, 2), wander: null, wanderT: rnd(2, 8), vy: 0, jam: 0, stepD: 0, hit: false, disarmed: false, net: null, lastHit: null, units: 1,
            r: TARON.R * look.size,
        };
        t.bodyCapsule = (cap) => { cap.a.set(model.position.x, model.position.y + 1.2, model.position.z); cap.b.set(model.position.x, model.position.y + 6 * look.size, model.position.z); cap.r = 1.5 * look.size; return cap; };
        Object.defineProperty(t, 'isDead', { get() { return this.dead; } });
        Object.defineProperty(t, 'position', { get() { return this.model.position; } });
        model.userData.taron = t;
        this.list.push(t); this.byIdMap.set(id, t); camp.members.push(t);
        return t;
    }
    _remove(t, quiet = false) {
        const g = this.game;
        t.far?.dispose?.();
        g.scene.remove(t.model);
        const i = this.list.indexOf(t); if (i >= 0) this.list.splice(i, 1);
        this.byIdMap.delete(t.id);
        const k = t.camp?.members.indexOf(t); if (k >= 0) t.camp.members.splice(k, 1);
        if (!quiet) g.imperius?.release?.('ta', t);
    }

    // ============================================================ the world: whom they fight
    _people(out) {
        const g = this.game;
        out.length = 0;
        const seen = (id, p) => (g.invis ? g.invis.aiPos(id, p) : p);
        if (!g.isDeadLocal && !g.combat?.dead) { const p = seen(g.localId, g.character.group.position); if (p) out.push({ kind: 'player', id: g.localId, x: p.x, y: p.y - 1.2, z: p.z, ref: null }); }
        for (const [id, r] of g.remotes || []) { if (r.dead || !r.position) continue; const p = seen(id, r.position); if (p) out.push({ kind: 'player', id, x: p.x, y: p.y - 1.2, z: p.z, ref: null }); }
        return out;
    }
    /** (host) Enemies a camp sees: players and other creatures (never the underworld's own) within the notice range / grudge range. */
    _enemies(camp, people, out) {
        const g = this.game;
        out.length = 0;
        for (const q of people) {
            const d = Math.hypot(q.x - camp.x, q.z - camp.z);
            const grudge = camp.grudge && camp.grudge.id === q.id && camp.grudge.t > 0;
            if (d <= TARON.LEASH + TARON.NOTICE && camp.members.some((t) => !t.dead && Math.hypot(q.x - t.model.position.x, q.z - t.model.position.z) <= (grudge ? TARON.LEASH : TARON.NOTICE))) out.push(q);
        }
        const list = crowdNear(g, camp.x, 0, camp.z, TARON.LEASH, null, 60, this._buf2);
        for (const b of list) {
            if (!ENEMY_KINDS.includes(b.kind) || b.kind === 'player') continue;
            const o = b.ref;
            if (!o || o.dead || o.isDead || o.isTaron || o.rider || o.fly || o.lev || FRIENDS.includes(b.kind)) continue;
            out.push({ kind: b.kind, id: o.id, x: b.x, y: b.y + (b.kind === 'man' ? 1.4 : 0.8), z: b.z, ref: o });
        }
        return out;
    }

    // ============================================================ frame
    update(dt) {
        if (!this.enabled) return;
        const g = this.game;
        if (!this.plan && g.hell?.plan?.taronCamps) this.setPlan(g.hell.plan); // (the foundation's plan appeared)
        const targets = this._targets || (this._targets = []);
        targets.length = 0;
        if (!this.active) { if (this.list.length) for (const t of [...this.list]) this._remove(t, true); return; }
        const me = g.character.group.position;
        this._clock += dt; this._tick++;
        this._aroundT -= dt;
        if (this._aroundT <= 0) { this._aroundT = 0.5; this._around(me); }
        let people = null;
        this._claims.clear();
        for (const camp of this.camps.values()) {
            if (!camp.loaded) continue;
            if (this.auth) {
                const r = respawnStep(camp.respawnT, dt, camp.n - camp.dead, camp.n);
                camp.respawnT = r.t; if (r.spawn && camp.dead > 0) camp.dead--;
                camp.alert = Math.max(0, camp.alert - dt);
                if (camp.grudge) { camp.grudge.t -= dt; if (camp.grudge.t <= 0) camp.grudge = null; }
                if (this._tick % 6 === camp.i % 6) this._fill(camp);
                people = people || this._people(this._buf);
                camp.enemies = this._enemies(camp, people, camp.enemies || []);
                if (camp.enemies.length) camp.alert = TARON.FORGET;
            } else camp.alert = Math.max(0, camp.alert - dt);
        }
        for (const t of [...this.list]) {
            const p = t.model.position, d = Math.hypot(p.x - me.x, p.z - me.z);
            t.model.visible = d < DRAW;
            if (!t.far && d < DRAW) t.far = this._farOf(t);
            if (t.dead) { this._deadStep(t, dt, d); continue; }
            targets.push(t);
            if (t.imp && g.imperius?.step?.('ta', t, dt)) { this._animate(t, dt, d); continue; }
            if (this.auth) this._think(t, dt); else this._follow(t, dt);
            if (d < ANIM) this._animate(t, dt, d);
        }
        if (this.auth) this._snapshot(dt);
    }

    _farOf(t) { const f = new FarShape(t.model); t.model.userData.farRadius = 7; f.set(true); return f; }

    _set(t, st) { t.st = st; t.stT = 0; }
    _face(t, x, z, dt, rate = 2.4) {
        const want = Math.atan2(-(x - t.model.position.x), -(z - t.model.position.z));
        const diff = wrap(want - t.model.rotation.y), step = Math.sign(diff) * Math.min(Math.abs(diff), rate * dt); // (a heavy turn: ~2.4 rad/s)
        t.model.rotation.y += step;
        return Math.abs(wrap(want - t.model.rotation.y));
    }
    /** How tight is the way ahead? 0 clear … 1 a passage narrower than the Taron (a bridge, a gap between walls). */
    _tight(t, ux, uz) {
        const g = this.game, p = t.model.position, col = g.collision;
        if (!col?.groundY) return false;
        const px = -uz, pz = ux, ahead = 3.5 * t.look.size;
        let bad = 0;
        for (const off of [-TARON.NARROW / 2, TARON.NARROW / 2]) {
            const x = p.x + ux * ahead + px * off, z = p.z + uz * ahead + pz * off;
            const gy = col.groundY(x, z);
            if (!Number.isFinite(gy) || gy < p.y - 4 || gy > p.y + 3.5) bad++; // (a drop beside it, a wall)
            else if (col.isSolidAt?.(x, p.y + 1, z)) bad++;
        }
        return bad >= 2;
    }
    /** One heavy step towards (gx, gz). → metres left. */
    _go(t, gx, gz, speed, dt, stopAt = 0.5) {
        const g = this.game, p = t.model.position;
        const dx = gx - p.x, dz = gz - p.z, d = Math.hypot(dx, dz);
        if (d <= stopAt) { t.speed = 0; return d; }
        const ux = dx / d, uz = dz / d;
        if (this._tight(t, ux, uz)) { t.jam = Math.min(5, t.jam + dt); t.speed = 0; this._face(t, gx, gz, dt); return d; } // (too narrow for him: he stands and waits)
        t.jam = 0;
        const a = crowdStep(g, t, p, ux, uz, Math.max(0.1, d - stopAt), { r: t.r, speed, dt, look: 6, dy: 8, room: (x, z) => this._made(x, z) });
        if (!a) { t.speed = 0; return d; }
        const x0 = p.x, z0 = p.z;
        p.x += a.x * speed * dt; p.z += a.z * speed * dt;
        g.collision?.resolveCylinder?.(p, t.r, p.y, TARON.HEIGHT, 1.2);
        const gy = this._ground(p.x, p.z);
        if (gy - p.y > 1.6) { p.x = x0; p.z = z0; t.speed = 0; return d; } // (a ledge too high even for him)
        p.y += (gy - p.y) * Math.min(1, dt * 8);
        const moved = Math.hypot(p.x - x0, p.z - z0);
        t.speed = moved / Math.max(dt, 1e-3);
        t.walk += moved * 1.1; t.stepD += moved;
        if (t.stepD > speed * TARON.STEP_T) { t.stepD = 0; this._step(t); }
        this._turnTo(t, Math.atan2(-a.x, -a.z), dt);
        return Math.hypot(gx - p.x, gz - p.z);
    }
    _turnTo(t, want, dt) { const diff = wrap(want - t.model.rotation.y); t.model.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), 2.4 * dt); }
    /** A footfall: the sound, a puff of dust, the tremor under the nearby creatures. */
    _step(t) {
        const g = this.game, p = t.model.position;
        g.sound?.playTaron?.(p, 'step', 1);
        g.fx?.smoke?.spawn?.(p.x + rnd(-1, 1), p.y + 0.2, p.z + rnd(-1, 1), 0, 0.8, 0, 0x6a4a3a, 1.4, 0.9, { shrink: -0.2 });
        if (!this.auth) return;
        for (const b of crowdNear(g, p.x, p.y, p.z, TARON.TREMOR_R, t, 8, this._buf2)) {
            const o = b.ref; if (!o || b.kind === 'player' || b.kind === 'taron' || o.isTaron || o.dead || o.isDead) continue;
            const dd = Math.hypot(b.x - p.x, b.z - p.z), f = (1 - dd / TARON.TREMOR_R);
            if (f < 0.25) continue;
            _w.set(b.x - p.x, 0, b.z - p.z).normalize().multiplyScalar(2.2 * f).setY(1.4 * f);
            g.creatureImpact?.apply?.(o, { v: _w.clone(), by: null, kind: 'tremor', from: p.clone() });
        }
    }

    _think(t, dt) {
        const g = this.game, camp = t.camp, p = t.model.position;
        t.t += dt; t.stT += dt; t.breath += dt;
        // gravity (thrown up by a blast)
        const gy = this._ground(p.x, p.z);
        if (t.vy || p.y > gy + 0.05) { t.vy = (t.vy || 0) - G * dt; p.y += t.vy * dt; if (p.y <= gy) { p.y = gy; t.vy = 0; } }
        if (t.stun > 0) { t.stun -= dt; t.mode = 'flinch'; t.speed = 0; if (t.stun <= 0) this._set(t, 'idle'); return; }
        if (t.lev || t.imp) return;
        if (t.slowT > 0) t.slowT -= dt;
        const v = t.slowT > 0 ? 0.5 : 1;
        t.cool -= dt;
        const enemies = camp.enemies;
        const alert = enemies && camp.alert > 0;
        // the victim: the nearest enemy within the leash of the camp; at most PACK on one (the others take the next)
        if (alert && ((this._tick + t.k) % 5 === 0 || !t.target)) t.target = this._pick(t, enemies);
        if (!alert || (t.target && !this._valid(t))) t.target = alert ? this._pick(t, enemies) : null;
        switch (t.st) {
            case 'idle': return this._idle(t, dt);
            case 'roar': {
                t.mode = 'roar'; t.speed = 0;
                if (t.target) this._face(t, t.target.x, t.target.z, dt, 3);
                if (t.stT >= 1.2) this._set(t, 'chase');
                return;
            }
            case 'chase': return this._chase(t, dt, v);
            case 'windup': return this._windup(t, dt);
            case 'swing': return this._swing(t, dt);
            case 'recover': {
                t.mode = 'recover'; t.speed = 0;
                if (t.target) this._face(t, t.target.x, t.target.z, dt, 1.5);
                if (t.stT >= TARON.RECOVER_T) this._set(t, t.target ? 'chase' : 'idle');
                return;
            }
            case 'home': return this._home(t, dt, v);
            default: this._set(t, 'idle');
        }
        void g;
    }
    _valid(t) {
        const tg = t.target, camp = t.camp;
        if (!tg) return false;
        if (tg.ref && (tg.ref.dead || tg.ref.isDead)) return false;
        return Math.hypot(tg.x - camp.x, tg.z - camp.z) <= TARON.LEASH;
    }
    _pick(t, enemies) {
        const camp = t.camp, p = t.model.position;
        let best = null, bd = 1e9;
        for (const q of enemies) {
            const key = q.kind + q.id, n = this._claims.get(key) || 0;
            if (n >= packSlots(1, Math.max(1, camp.members.length)) && t.target?.id !== q.id) continue; // (already enough on it)
            const d = Math.hypot(q.x - p.x, q.z - p.z);
            if (d < bd) { bd = d; best = q; }
        }
        if (best) { const key = best.kind + best.id; this._claims.set(key, (this._claims.get(key) || 0) + 1); if (!t.target) { t.mode = 'roar'; this.game.sound?.playTaron?.(p, 'roar', 1); this._send({ op: 'say', id: t.id, k: 'roar' }); this._set(t, 'roar'); } }
        return best;
    }
    _idle(t, dt) {
        t.mode = 'idle'; t.speed = 0;
        const camp = t.camp, p = t.model.position;
        if (t.target) { this._set(t, 'chase'); return; }
        t.wanderT -= dt;
        if (t.wander) {
            const left = this._go(t, t.wander.x, t.wander.z, walkSpeed() * 0.6, dt, 0.8);
            t.mode = t.speed > 0.2 ? 'walk' : 'idle';
            if (left < 1 || t.wanderT < 0) { t.wander = null; t.wanderT = rnd(4, 12); }
            return;
        }
        if (t.wanderT <= 0) {
            const a = Math.random() * TAU, rr = Math.random() * camp.r * 0.6;
            t.wander = { x: camp.x + Math.cos(a) * rr, z: camp.z + Math.sin(a) * rr }; t.wanderT = 10;
        } else if (Math.random() < dt * 0.04) this.game.sound?.playTaron?.(p, Math.random() < 0.5 ? 'grunt' : 'snort', 0.7);
    }
    _chase(t, dt, v) {
        const tg = t.target, p = t.model.position;
        if (!tg) { this._set(t, 'home'); return; }
        const dToCamp = Math.hypot(p.x - t.camp.x, p.z - t.camp.z);
        if (dToCamp > TARON.LEASH) { t.target = null; this._set(t, 'home'); return; }
        const dx = tg.x - p.x, dz = tg.z - p.z, d = Math.hypot(dx, dz);
        const ang = wrap(Math.atan2(-dx, -dz) - t.model.rotation.y);
        if (d <= TARON.REACH * 0.85 && t.cool <= 0) { // close enough: face FULLY, then the wind-up
            this._face(t, tg.x, tg.z, dt, 3);
            t.mode = 'hunt'; t.speed = 0;
            if (Math.abs(ang) < 0.25) { t.side = swingSide(Math.random()).side; t.hit = false; this._set(t, 'windup'); this.game.sound?.playTaron?.(p, 'wind', 1); this._send({ op: 'wind', id: t.id, side: t.side }); }
            return;
        }
        if (d <= TARON.REACH * 0.85) { this._face(t, tg.x, tg.z, dt, 2); t.mode = 'hunt'; t.speed = 0; return; } // (cooling down in reach)
        t.mode = 'hunt';
        this._go(t, tg.x, tg.z, walkSpeed(t.hp / t.maxHp) * v, dt, TARON.REACH * 0.5);
        if (t.jam > 1.2 && d <= TARON.REACH * 1.3) { this._face(t, tg.x, tg.z, dt, 3); t.side = 'blade'; t.hit = false; this._set(t, 'windup'); } // (stuck at a narrow place with the victim at hand: he swings)
    }
    _home(t, dt, v) {
        const camp = t.camp, p = t.model.position;
        t.mode = 'walk';
        const left = this._go(t, camp.x, camp.z, walkSpeed() * v, dt, camp.r * 0.5);
        if (t.target) { this._set(t, 'chase'); return; }
        if (left < camp.r * 0.6 + 1 || t.stT > 40) this._set(t, 'idle');
        void p;
    }
    _windup(t, dt) {
        const tg = t.target;
        t.mode = 'windup'; t.speed = 0;
        if (tg) this._face(t, tg.x, tg.z, dt, 1.2);
        t.p = Math.min(1, t.stT / TARON.WIND_T);
        if (t.stT >= TARON.WIND_T) { this._set(t, 'swing'); this._voice(t, 'grunt'); }
    }
    _swing(t, dt) {
        t.mode = 'swing'; t.speed = 0;
        t.p = Math.min(1, t.stT / TARON.SWING_T);
        if (!t.hit && t.stT >= TARON.SWING_T * 0.55) { t.hit = true; this._strike(t); }
        if (t.stT >= TARON.SWING_T) { t.cool = rnd(...TARON.COOL); this._set(t, 'recover'); }
    }
    /** The blow lands: whoever of the enemies is in the cone within reach is hit; the wood in front breaks. */
    _strike(t) {
        const g = this.game, p = t.model.position, side = t.side === 'hammer' ? TARON.HAMMER : TARON.BLADE;
        const yaw = t.model.rotation.y;
        const hx = -Math.sin(yaw), hz = -Math.cos(yaw);
        const at = _v.set(p.x + hx * TARON.REACH * 0.7, p.y + 0.5, p.z + hz * TARON.REACH * 0.7);
        g.sound?.playTaron?.(at, side === TARON.HAMMER ? 'hammer' : 'blade', 1.1);
        g.fx?.smoke?.spawn?.(at.x, at.y + 0.3, at.z, 0, 1.6, 0, 0x7a5a42, 2.4, 1.4, { shrink: -0.3 });
        g.fx.shake = Math.max(g.fx.shake || 0, Math.max(0, 0.6 - Math.hypot(at.x - g.character.group.position.x, at.z - g.character.group.position.z) / 80));
        this._smash(t, at);
        const camp = t.camp, people = camp.enemies || [];
        for (const q of people) {
            const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
            const ang = wrap(Math.atan2(-dx, -dz) - yaw);
            if (!swingHits(d, ang)) continue;
            _w.set(dx, 0, dz).normalize();
            const dmg = swingDamage(side, q.kind);
            if (q.kind === 'player') this._hurtPlayer(q.id, dmg, [_w.x * side.push, 4, _w.z * side.push], [p.x, p.y + 3, p.z], side);
            else if (q.ref) this._hitCreature(q, dmg, _w, side, p);
        }
    }
    _smash(t, at) {
        const g = this.game, T = g.terrain?.data;
        if (!T?.get || !T.set) return;
        let n = 0; const E = [];
        const R = 2;
        for (let iy = -1; iy <= 3 && n < TARON.BREAK_BLOCKS * 6; iy++) for (let iz = -R; iz <= R; iz++) for (let ix = -R; ix <= R; ix++) {
            const x = Math.round(at.x) + ix, y = Math.round(at.y) + iy, z = Math.round(at.z) + iz;
            if (T.landMade && !T.landMade(x, z)) continue;
            const b = T.get(x, y, z);
            if (b === BLOCK.AIR || !isWood(b)) continue; // (wood only: stone holds)
            if (g.wards?.protects?.(x, y, z)) continue;
            T.set(x, y, z, BLOCK.AIR);
            if (T.get(x, y, z) === BLOCK.AIR) { E.push([x, y, z, BLOCK.AIR]); n++; }
        }
        if (E.length) { g.builder?._sendEdits?.(E, true); g.sound?.playCrack?.(at, 1.2); }
    }
    _hurtPlayer(id, dmg, v, from, side) {
        const g = this.game;
        if (id === g.localId) { this._hurtMe(dmg, v, from, side); return; }
        this._send({ op: 'hurt', to: id, dmg, v, f: from.map(r2), s: side === TARON.HAMMER ? 1 : 0 });
    }
    _hurtMe(dmg, v, from, side) {
        const g = this.game, c = g.combat;
        if (!c || c.dead || g.isDeadLocal) return;
        const f = _v.set(from[0], from[1], from[2]);
        const hammer = side === TARON.HAMMER || side === 1;
        // a «Protection» shield: a blade swing is a strong blow — it costs mana; the shield breaks if the mana is out (Combat.shieldFactor/_blocked)
        if (c.shieldFactor?.(f) >= 1 && c._blocked?.(f, hammer ? 'TaronHammer' : 'TaronBlade')) return; // (a blade is a strong blow: the shield pays its mana; out of mana — it gives way and the blow goes on)
        if (c.enabled) c.damage(dmg, null, 'taron'); else g.damageLocalPlayer?.(dmg);
        const push = new THREE.Vector3(v[0], v[1], v[2]);
        if (g.impact) g.impact.apply({ v: push, from: f.clone(), by: null, kind: 'taronBlow', noShield: true }); else g.knockback?.add?.(push);
        if (hammer) g.combat?.daze?.(TARON.HAMMER.daze) ?? g.dazed?.(TARON.HAMMER.daze); // (a daze: no casting for a moment)
        g.hud?.setVoice?.(`🪓 Тарон ударил топором-молотом: −${dmg}`, true);
        g.sound?.playTaron?.(f, hammer ? 'hammer' : 'blade', 1);
    }
    _hitCreature(q, dmg, dir, side, from) {
        const g = this.game, o = q.ref;
        if (q.kind === 'animal') g.animals?.hit?.(o, dmg, dir, null);
        else if (q.kind === 'zombie') g.damageZombie?.(o, dmg, false, dir, null);
        else if (q.kind === 'man') g.castleLife?.hit?.(o, dmg, dir, null, { kind: 'taron' });
        else if (q.kind === 'snowman' || q.kind === 'iceMonster') g.iceCastle?.hit?.(o, dmg, 'crush', null);
        else if (o.hp !== undefined) o.hp -= dmg;
        g.creatureImpact?.apply?.(o, { v: _w.clone().multiplyScalar(side.push).setY(4), by: null, kind: 'taronBlow', from: from.clone() });
    }
    _voice(t, k, vol = 1) { this.game.sound?.playTaron?.(t.model.position, k, vol); this._send({ op: 'say', id: t.id, k }); }

    // ============================================================ looks
    _animate(t, dt, d) {
        const mode = t.mode;
        const a = { mode: mode === 'windup' || mode === 'swing' ? mode : mode, t: t.stT, p: t.p ?? Math.min(1, t.stT / (mode === 'roar' ? 1.2 : mode === 'recover' ? TARON.RECOVER_T : 1)), walk: t.walk, speed: t.speed, breath: t.breath, side: t.side, look: 0, axeGone: t.disarmed };
        if (mode === 'recover') a.p = Math.min(1, t.stT / TARON.RECOVER_T);
        poseTaron(t.model, a);
        t.far?.check?.();
        void d; void dt;
    }
    _follow(t, dt) {
        const n = t.net;
        t.t += dt; t.stT += dt; t.breath += dt;
        if (!n) return;
        const p = t.model.position, k = Math.min(1, dt * 8);
        const dx = n.x - p.x, dz = n.z - p.z;
        if (dx * dx + dz * dz > 900) { p.x = n.x; p.z = n.z; } else { p.x += dx * k; p.z += dz * k; }
        p.y += (n.y - p.y) * k;
        t.model.rotation.y += wrap(n.yaw - t.model.rotation.y) * k;
        if (t.mode !== n.mode) { t.mode = n.mode; t.stT = n.t; } else if (Math.abs(t.stT - n.t) > 0.35) t.stT = n.t;
        t.speed = n.speed; t.hp = n.hp; t.side = n.side || t.side;
        if (t.mode === 'windup') t.p = Math.min(1, t.stT / TARON.WIND_T); else if (t.mode === 'swing') t.p = Math.min(1, t.stT / TARON.SWING_T);
        t.walk += Math.hypot(dx, dz) * 1.1;
    }
    _deadStep(t, dt, d) {
        t.deadT += dt; t.mode = 'dead';
        if (d < DRAW) poseTaron(t.model, { mode: 'dead', dead: Math.min(1, t.deadT / 1.4), axeGone: t.disarmed });
        t.far?.check?.();
        if (t.deadT > DEATH_T) { t.model.position.y -= dt * 0.5; if (t.deadT > DEATH_T + 6) this._remove(t); }
    }

    // ============================================================ harm (every spell and blow comes here)
    hit(t, dmg, kind = 'melee', by = null) {
        if (!t || t.dead) return;
        if (!this.auth) { this._send({ op: 'hit', id: t.id, dmg: r2(+dmg || 0), kind, by: by || this.game.localId }); this._flinch(t); return; }
        const h = harmOf(kind, dmg);
        if (h.slow) t.slowT = Math.max(t.slowT, h.slow);
        if (h.stun) { t.stun = Math.max(t.stun, h.stun); t.st = 'idle'; }
        this._provoke(t, by);
        if (!(h.dmg > 0)) return;
        t.hp -= h.dmg; t.lastHit = { by, t: this._clock, kind };
        if (t.hp <= 0 || h.kill) { this.die(t, kind, by); return; }
        this._flinch(t);
    }
    hitAt(pos, radius, dmg, kind, by = null) { for (const t of this.list) if (!t.dead && t.model.position.distanceTo(pos) < radius + TARON.R) this.hit(t, dmg, kind, by); }
    hitRay(org, d, len, width, dmg, kind, by = null) {
        for (const t of this.list) {
            if (t.dead) continue;
            _v.set(t.model.position.x, t.model.position.y + 3.2, t.model.position.z).sub(org);
            const along = _v.dot(d);
            if (along < 0 || along > len) continue;
            if (_v.addScaledVector(d, -along).length() < width + 2.2) this.hit(t, dmg, kind, by);
        }
    }
    /** (any computer) A duel charge reached a Taron: «Авада» kills, a stun stuns, «Экспеллиармус» takes the axe, the rest hurts (TARGETS). */
    boltHit(t, spell, by) {
        if (!t || t.dead) return;
        if (spell === 'AvadaKedavra' || spell === 'Avada') { this.hit(t, 999, 'Avada', by); return; }
        if (spell === 'Stupefy') { this.hit(t, 0, 'Stupefy', by); return; }
        if (spell === 'Expelliarmus') { if (this.auth) { t.disarmed = true; t.stun = Math.max(t.stun, 1.2); this._provoke(t, by); this._dropAxe(t); } else this._send({ op: 'bolt', id: t.id, spell, by: by || this.game.localId }); return; }
        if (spell === 'Disarmor' || spell === 'SapiraDuel' || spell === 'SandsDuel' || spell === 'LevitateDuel') { this._provoke(t, by); return; }
        this.hit(t, 8, spell, by);
    }
    _dropAxe(t) {
        const g = this.game, at = _v.set(t.model.position.x, t.model.position.y + 4, t.model.position.z);
        g.items?.spawnLoose?.({ kind: 'taronAxe', uid: newUid(), count: 1 }, at.clone(), { vel: _w.set(rnd(-3, 3), 4, rnd(-3, 3)) });
    }
    _flinch(t) { if (t.dead) return; t.stun = Math.max(t.stun, TARON.HIT_STUN); t.stT = 0; t.mode = 'flinch'; t.p = 0; this._voice(t, 'hurt', 0.9); if (t.st === 'windup') this._set(t, 'chase'); }
    /** (host) The camp learns who struck: it is awake and the hurt one's neighbours (45 m) join. */
    _provoke(t, by) {
        const camp = t.camp;
        if (!camp || !this.auth) return;
        const who = by === 'local' ? this.game.localId : by;
        if (who != null) camp.grudge = { id: who, t: TARON.HOLD_GRUDGE };
        camp.alert = TARON.FORGET;
        const people = this._people(this._buf);
        camp.enemies = this._enemies(camp, people, camp.enemies || []);
        if (who != null && !camp.enemies.some((q) => q.id === who)) { const q = people.find((m) => m.id === who && Math.hypot(m.x - camp.x, m.z - camp.z) <= TARON.LEASH); if (q) camp.enemies.push(q); }
    }
    die(t, kind = 'melee', by = null) {
        if (t.dead) return;
        const g = this.game, camp = t.camp;
        t.dead = true; t.deadT = 0; t.hp = 0; t.mode = 'dead'; t.speed = 0; t.st = 'dead';
        this._voice(t, 'die', 1);
        t.far?.check?.(true);
        if (camp) { camp.dead = Math.min(camp.n, camp.dead + 1); }
        if (this.auth) {
            const at = _v.set(t.model.position.x, t.model.position.y + 2.5, t.model.position.z);
            const L = lootRoll(Math.random), vel = () => _w.set(rnd(-3, 3), rnd(3, 5), rnd(-3, 3));
            g.items?.spawnLoose?.({ kind: 'coins', uid: newUid(), count: L.coins }, at.clone(), { vel: vel() });
            if (L.iron) g.items?.spawnLoose?.({ kind: 'taronIron', uid: newUid(), count: L.iron }, at.clone(), { vel: vel() });
            if (L.stone) g.items?.spawnLoose?.({ kind: 'redStone', uid: newUid(), count: L.stone }, at.clone(), { vel: vel() });
            if (L.axe && !t.disarmed) g.items?.spawnLoose?.({ kind: 'taronAxe', uid: newUid(), count: 1 }, at.clone(), { vel: vel() });
            this._send({ op: 'die', id: t.id });
            this.kills++;
            g.mana?.taronKill?.(by, kind, this.kills);
            g.achievements?.taronKill?.(this.kills);
        }
    }

    // ============================================================ the network
    _send(m) { const net = this.game.sync?.net; if (net) net.send({ t: 'taron', ...m }, m.op !== 's'); }
    _snapshot(dt) {
        this._sendT -= dt;
        if (this._sendT > 0 || !this.game.sync?.net) return;
        this._sendT = 0.125;
        const g = this.game, me = g.character.group.position, l = [];
        for (const t of this.list) {
            if (t.dead) continue;
            const p = t.model.position;
            if (Math.hypot(p.x - me.x, p.z - me.z) > 260 && ![...(g.remotes?.values?.() || [])].some((r) => r.position && Math.hypot(p.x - r.position.x, p.z - r.position.z) < 260)) continue;
            l.push([t.id, r2(p.x), r2(p.y), r2(p.z), r2(t.model.rotation.y), MODE_NO[t.mode] ?? 0, r2(t.stT), r2(t.speed), Math.round(t.hp), t.side === 'hammer' ? 1 : 0, t.camp?.id, t.k]);
        }
        if (l.length) this._send({ op: 's', l });
    }
    onNet(m, isHost) {
        if (!m) return;
        const g = this.game;
        if (m.op === 's' && !isHost) {
            for (const e of m.l || []) {
                let t = this.byIdMap.get(e[0]);
                if (!t) { // (the host has a Taron that this computer has not made yet: made where the host has it)
                    const camp = this.camps.get(e[10]);
                    if (!camp || !camp.loaded || !this._made(e[1], e[3])) continue;
                    t = this._make(camp, e[11], e[1], e[3]); t.id = e[0]; this.byIdMap.set(t.id, t);
                }
                if (t.dead) continue;
                t.net = { x: e[1], y: e[2], z: e[3], yaw: e[4], mode: MODES[e[5]] || 'idle', t: e[6], speed: e[7], hp: e[8], side: e[9] ? 'hammer' : 'blade' };
            }
        } else if (m.op === 'die' && !isHost) { const t = this.byIdMap.get(m.id); if (t) this.die(t, 'net', null); }
        else if (m.op === 'say' && !isHost) { const t = this.byIdMap.get(m.id); if (t) g.sound?.playTaron?.(t.model.position, m.k, 1); }
        else if (m.op === 'wind' && !isHost) { const t = this.byIdMap.get(m.id); if (t) { t.side = m.side; g.sound?.playTaron?.(t.model.position, 'wind', 1); } }
        else if (m.op === 'hit' && isHost) { const t = this.byIdMap.get(m.id); if (t) this.hit(t, +m.dmg || 0, m.kind || 'melee', m.by || null); }
        else if (m.op === 'bolt' && isHost) { const t = this.byIdMap.get(m.id); if (t) this.boltHit(t, m.spell, m.by || null); }
        else if (m.op === 'hurt' && m.to === g.localId) this._hurtMe(+m.dmg || 0, m.v || [0, 0, 0], m.f || [0, 0, 0], m.s ? 1 : 0);
    }

    sampleModels() {
        const m = taronModel(taronLook(2)); poseTaron(m, { mode: 'windup', p: 0.7, side: 'hammer' });
        const far = taronModel(taronLook(5)); poseTaron(far, { mode: 'idle' });
        new FarShape(far).set(true);
        return [m, far];
    }
    dispose() {
        for (const camp of this.camps.values()) this._unload(camp);
        this.camps.clear(); this.list.length = 0; this.byIdMap.clear();
    }
}

// pushes, gusts, knockdowns (CreatureImpact): a Taron is the heaviest body there is — a blast moves him a step
registerKind('T', {
    name: 'taron', faces: -1,
    list: (g) => g.tarons?.list || [],
    get: (g, id) => g.tarons?.byId(id),
    alive: (c) => !c.dead,
    body: () => 'knight',
    centre: (c, out) => out.set(c.model.position.x, c.model.position.y + 3.2, c.model.position.z),
    pivot: (c) => ({ obj: c.model.userData.root, base: 0, lie: 1.2 }),
    head: (c) => c.model.userData.head, arms: (c) => [c.model.userData.armL, c.model.userData.armR], legs: (c) => [c.model.userData.legL, c.model.userData.legR],
    move(g, c, dx, dz) { const p = c.model.position; p.x += dx * 0.5; p.z += dz * 0.5; g.collision?.resolveCylinder?.(p, c.r, p.y, TARON.HEIGHT, 1.2); },
    toss(g, c, vy) { c.vy = Math.max(c.vy || 0, vy * 0.4); },
    hold(g, c, t) { c.stun = Math.max(c.stun || 0, Math.min(t, 1.5)); c.mode = 'idle'; c.speed = 0; },
    frozen: (c) => c.slowT > 3,
    struck(g, c, o) { if (o.by) g.tarons?._provoke?.(c, o.by === 'local' ? g.localId : o.by); },
});
BODY_R.taron = TARON.R;
export { MODES as TARON_MODES, TARGETS as TARON_TARGETS };
