/**
 * FleetOrders.js — the king of a sea castle (or whoever took a ship) commands the crew of his own ship.
 *
 * Who is «his»: Ships.loyalTo — the ship's owner, or the owner of the castle whose port it belongs to. His crew
 * never turns on him (Sailors.provoke), calls him «ваше величество» and understands short orders, said aloud near
 * a sailor (parseCrewOrder in FleetMath.js; the talk goes through Sailors.hear):
 *   «к бою» — the gunners man the guns, the guns are loaded (a ball from the rack each);  «заряжай»;
 *   «огонь» / «огонь по кораблю» / «огонь по тому кораблю» (the hand shows) / «по берегу» — the side that looks at the
 *     target fires, the other is silent; if no side bears: the helmsman turns the ship (when nobody of the players is
 *     at the wheel) or the captain says why not; no fire through our own ships, the pier, the shore, the masts;
 *   «на абордаж» — alongside the enemy (≤ BOARD_GAP m hull to hull) the crew leaps across and fights the enemy crew
 *     (CrewTactics: two at a time, the rest in the ring); the captain and two guards stay;  «отбой» — everyone back;
 *   «паруса поднять / убрать», «отдать швартовы», «поворот налево / направо».
 * While the king is aboard (or near) the crew answers whoever strikes at him: a mate of an enemy crew on the deck, a
 * zombie on the deck, a player who hurt him (Sailors._think → foeFor). The king is never a target of his crew.
 *
 * Multiplayer: the host runs the crew, the guns and the helm; a guest's order goes to the host ('screw' {ord}).
 */

import * as THREE from 'three';
import { FLEET, broadside, gunsBear, beamTurn, yawFacing, angleDiff, lineOfFire, parseCrewOrder, orderNeedsAim, REPLY } from './FleetMath.js';
import { gunPitch } from './Blackbeard.js';
import { HELM_LOCK } from './ShipTypes.js';
import { WATER_LEVEL_Y } from '../world/Terrain.js';
import { floorAt, hullHalfWidth } from './ShipLayout.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const _m = new THREE.Vector3();
const _l = { x: 0, y: 0, z: 0 };
const _o = { x: 0, y: 0, z: 0 };
const _vel = { x: 0, z: 0 };
const NONE = Object.freeze([]);
const LOAD_T = 1.6; // s: a gunner puts a ball in the barrel
const SPOT = 2.6; // m: a gunner stands this far inboard of his gun (Blackbeard._gunSpot)
const GUARDS = 2; // stay on the ship when the rest board
const HOLD_MS = 6000; // a turn order lasts this long
const KEEP_OFF = 45; // m: the autopilot does not run nearer the shore than this

export class FleetOrders {
    constructor(game) {
        this.game = game;
        this.st = new Map(); // ship id → {mode, target, reload, gun, auto, board, say…}
        this._away = new Map(); // deck → [our boarders there] (fought as a group: Sailors._tactics)
    }

    get S() { return this.game.ships; }
    get C() { return this.game.ships.crew; }
    get auth() { return this.game.authority; }

    state(s) {
        let f = this.st.get(s.id);
        if (!f) { f = { mode: 'idle', target: null, reload: new Map(), gun: new Map(), auto: null, board: null, said: new Map(), t: 0, aimT: 0 }; this.st.set(s.id, f); }
        return f;
    }

    /** Is the ship under orders now (the sailors' mind asks). */
    active(s) { const f = this.st.get(s.id); return !!f && (f.mode !== 'idle' || !!f.board); }

    // ============================================================== the words
    /**
     * (every computer) The local king said something near sailor `v`. → {ok: true} when it was an order (the answer
     * is said by the captain, on the host), null when it is ordinary talk.
     */
    hear(text, v) {
        const g = this.game;
        const ord = parseCrewOrder(text);
        if (!ord) return null;
        const s = v.crew || v.ship;
        if (!s || !this.S.loyalTo(s, g.localId)) return null;
        const aim = ord.kind === 'fire' || ord.kind === 'board' ? this.aimRay() : null;
        if (this.auth) this.execute(s, ord, g.localId, aim);
        else g.sync?.net.send({ t: 'screw', ord, id: s.id, aim, from: g.localId });
        return { ord };
    }

    /**
     * The local king was hurt by player `byId`: the crews of his ships near him turn on that player (a guest tells the
     * host). Zombies and boarders are not named here — they are seen on the deck (foeFor).
     */
    kingHurt(byId) {
        const g = this.game;
        if (byId == null || byId === 'local' || byId === g.localId || typeof byId === 'object') return;
        if (!g.remotes?.has(byId)) return; // (only another player is named: a name of a spell / a creature is not)
        for (const s of this.S.awake) {
            if (!this.S.loyalTo(s, g.localId) || this.S.loyalTo(s, byId) || !this._alive(s)) continue;
            if (Math.hypot(s.st.x - g.character.group.position.x, s.st.z - g.character.group.position.z) > 70) continue;
            if (this.auth) this.C.provoke(s, byId, null);
            else g.sync?.net.send({ t: 'screw', def: 1, id: s.id, p: byId, from: g.localId });
        }
    }

    /** (host) A guest's order. */
    remote(m) {
        const s = this.S.list.get(m.id);
        if (m.def) { if (s && this.S.loyalTo(s, m.from) && m.p && !this.S.loyalTo(s, m.p) && this._alive(s)) this.C.provoke(s, m.p, null); return; }
        if (!s || !m.ord || !this.S.loyalTo(s, m.from) || !this.S._near(s, m.from, 140)) return;
        this.execute(s, m.ord, m.from, m.aim || null);
    }

    /** The ray the king points along: a raised hand, else where the camera looks. null when there is none. */
    aimRay() {
        const g = this.game, ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        const side = ch.isArmRaised?.(pref) ? pref : ['right', 'left'].find((sd) => ch.isArmRaised?.(sd));
        const o = new THREE.Vector3(), d = new THREE.Vector3();
        if (side) { ch.getHandWorldPosition(side, o); ch.getHandDirection(side, d); }
        else if (g.camera) { g.camera.getWorldPosition(o); g.camera.getWorldDirection(d); }
        else return null;
        d.normalize();
        return { o: [o.x, o.y, o.z], d: [d.x, d.y, d.z], hand: !!side };
    }

    // ============================================================== ships
    _alive(s) { return this.C.alive(s) > 0; }

    /** Is `t` on the same side as `s` (one owner), or the owner himself. */
    sameSide(s, t) {
        if (s === t) return true;
        const a = this.S.ownerOf(s), b = this.S.ownerOf(t);
        return !!a && a === b;
    }

    /** Ships `s` may fire at / board: awake, afloat, not of its own side. */
    enemies(s, out = []) {
        out.length = 0;
        for (const t of this.S.awake) if (t !== s && t.state !== 'sinking' && t.state !== 'wreck' && !this.sameSide(s, t)) out.push(t);
        return out;
    }

    _nearestEnemy(s, maxD) {
        let best = null, bd = maxD;
        for (const t of this.enemies(s, this._en || (this._en = []))) {
            const d = Math.hypot(t.st.x - s.st.x, t.st.z - s.st.z);
            if (d < bd) { bd = d; best = t; }
        }
        return best;
    }

    /** The target the king's ray meant: a ship near the ray, else the first spot of land or sea it reaches. */
    resolveAim(s, ray) {
        if (!ray) return null;
        const [ox, oy, oz] = ray.o, [dx, dy, dz] = ray.d;
        let best = null, bs = Infinity;
        for (const t of this.enemies(s, this._en || (this._en = []))) {
            const cx = t.st.x - ox, cy = t.pose.y - oy, cz = t.st.z - oz;
            const along = cx * dx + cy * dy + cz * dz;
            if (along < 0 || along > FLEET.FIRE_NEAR + 100) continue;
            const off = Math.hypot(cx - dx * along, cy - dy * along, cz - dz * along);
            const allow = t.layout.L / 2 + 6;
            if (off < allow && off / allow < bs) { bs = off / allow; best = t; }
        }
        if (best) return { kind: 'ship', id: best.id };
        const data = this.game.terrain?.data;
        for (let k = 3; k < 520; k += 3) {
            const x = ox + dx * k, y = oy + dy * k, z = oz + dz * k;
            const sea = y < WATER_LEVEL_Y + 0.2;
            if (sea || (data && data.isSolidAt(x, y, z))) return { kind: 'point', x, y: sea ? WATER_LEVEL_Y : y, z, sea };
        }
        return null;
    }

    /** The target's world point {x, y, z} (a ship: her deck, led by her motion over the ball's flight). */
    targetPoint(s, t, from, out) {
        if (t.kind === 'ship') {
            const T = this.S.list.get(t.id);
            if (!T) return null;
            out.x = T.st.x; out.y = T.pose.y + T.layout.deck * 0.5; out.z = T.st.z;
            if (from) {
                const D = Math.hypot(out.x - from.x, out.z - from.z), tf = D / 66;
                this.S.pointVel(T, out.x, out.z, _vel);
                out.x += _vel.x * tf; out.z += _vel.z * tf;
            }
            return out;
        }
        out.x = t.x; out.y = t.y; out.z = t.z;
        return out;
    }

    // ============================================================== the orders (host)
    _voice(s) {
        const list = this.C.crews.get(s.id) || [];
        return list.find((v) => v.role === 'captain' && !v.dead && !v.overboard && v.ship === s)
            || list.find((v) => !v.dead && !v.overboard && v.ship === s) || null;
    }

    _say(s, key, f, every = 0) {
        const now = performance.now();
        if (every && f && now - (f.said.get(key) ?? -1e9) < every) return;
        f?.said.set(key, now);
        const v = this._voice(s);
        if (v) this.C._say(v, pick(REPLY[key] || [key]), 4.5);
    }

    /** (host) Carry out an order given by `by` (a king of this ship). aim: the ray he pointed along. */
    execute(s, ord, by, aim = null) {
        if (!this.auth || !this.S.loyalTo(s, by) || !this._alive(s)) return;
        const g = this.game, f = this.state(s);
        g.castleLife?.night?.crewAlarm?.(s); // (the sleepers jump up)
        switch (ord.kind) {
            case 'battle': f.mode = 'battle'; f.target = null; f.by = by; this._say(s, 'battle', f); break;
            case 'cease': this._cease(s, f); this._say(s, 'cease', f); break;
            case 'load': f.mode = 'battle'; f.by = by; this._say(s, 'ok', f); break;
            case 'fire': this._orderFire(s, f, ord, by, aim); break;
            case 'board': this._orderBoard(s, f, by, aim); break;
            case 'sails': {
                this.S.setSails(s, 'all', ord.open ? 1 : 0, by);
                this._say(s, ord.open ? 'sailsUp' : 'sailsDown', f);
                break;
            }
            case 'cast': {
                const tied = s.lines.map((l, i) => (l.state === 'tied' ? i : -1)).filter((i) => i >= 0);
                this.S.rigging._by = by;
                for (const i of tied) this.S.rigging.liftLine(s, i, 'lift');
                this.S.rigging._by = null;
                this._say(s, tied.length ? 'cast' : 'ok', f);
                break;
            }
            case 'turn': {
                if (!this._canSteer(s, f)) break;
                f.by = by;
                f.auto = { yaw: s.st.yaw - ord.dir * Math.PI / 3, gain: 7, until: performance.now() + HOLD_MS, free: true };
                this.S.setSails(s, 'all', 1, by);
                this._say(s, 'turn', f);
                break;
            }
        }
    }

    _cease(s, f) {
        f.mode = 'idle'; f.target = null; f.board = null; f.auto = null;
        for (const v of this.C.crews.get(s.id) || []) { v.gun = null; v.fleetBoard = null; }
        this._stopWind(s);
    }

    _orderFire(s, f, ord, by, aim) {
        let target = null;
        if (ord.target === 'aim' || ord.target === 'shore' || (ord.target !== 'ship' && aim?.hand)) target = this.resolveAim(s, aim);
        if (ord.target === 'shore' && target?.kind === 'ship') target = null; // (shore: not a ship)
        if (!target && (ord.target === 'ship' || ord.target === 'any')) {
            const t = this._nearestEnemy(s, FLEET.FIRE_NEAR);
            if (t) target = { kind: 'ship', id: t.id };
        }
        if (!target && ord.target === 'any' && aim) target = this.resolveAim(s, aim);
        f.mode = 'battle'; f.by = by;
        if (!target) { this._say(s, 'noTarget', f); return; }
        f.target = target; f.board = null; f.salvos = 0;
        this._say(s, 'fire', f);
    }

    _orderBoard(s, f, by, aim) {
        let T = null;
        const t = aim && this.resolveAim(s, aim);
        if (t?.kind === 'ship') T = this.S.list.get(t.id);
        if (!T || !T.awake) T = this._nearestEnemy(s, FLEET.BOARD_NEAR * 4);
        if (!T) { this._say(s, 'boardNone', f); return; }
        f.mode = 'battle'; f.by = by; f.board = T.id; f.target = null; f.phase = 'approach';
        this._say(s, Math.hypot(T.st.x - s.st.x, T.st.z - s.st.z) > FLEET.BOARD_NEAR ? 'boardFar' : 'board', f);
    }

    // ============================================================== the frame (host)
    update(dt) {
        if (!this.auth) { this._drawAway?.(); return; }
        for (const [id, f] of this.st) {
            const s = this.S.list.get(id);
            if (!s || !s.awake || s.state === 'sinking' || s.state === 'wreck' || !this._alive(s)) {
                if (s) { this._cease(s, f); }
                this.st.delete(id);
                continue;
            }
            if (f.mode === 'idle' && !f.auto) continue;
            f.t += dt;
            if (!this.S.loyalTo(s, f.by)) { this._cease(s, f); continue; }
            this._guns(s, f, dt);
            if (f.board) this._boarding(s, f, dt);
            else if (f.target) this._firing(s, f, dt);
            this._drive(s, f, dt);
        }
        for (const [T, list] of this._away) {
            if (list.length && T.awake) { this.C._tactics(T, list, dt); this.C._separate(T, list, dt); }
            list.length = 0;
        }
    }

    // ------------------------------------------------------------ the autopilot
    /** null: the crew can steer her; else the captain's reason ('cannot': a player holds the wheel; 'moored': tied to the pier). */
    _steerBlock(s) {
        if (s.helmBy) return 'cannot';
        if (s.state === 'moored' && s.lines.some((l) => l.state === 'tied')) return 'moored';
        return null;
    }

    _canSteer(s, f) {
        const why = this._steerBlock(s);
        if (why) this._say(s, why, f, 8000);
        return !why;
    }

    /** (host) Hold the course the order wants: the wheel and the sails' wind, as the black ship's helmsman does. */
    _drive(s, f, dt) {
        const A = f.auto;
        if (!A) { return; }
        const st = s.st;
        if (s.helmBy || (A.until && performance.now() > A.until)) { f.auto = null; this._stopWind(s); return; }
        const seas = this.game.terrain?.data?.seas;
        let gain = A.gain;
        if (seas) {
            const ahead = KEEP_OFF + Math.abs(st.u) * 8;
            const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
            const here = seas.signedDist(st.x, st.z), there = seas.signedDist(st.x + fx * ahead, st.z + fz * ahead);
            if (there < KEEP_OFF && there <= here) { gain = 0; this._say(s, 'shore', f, 10000); }
        }
        const err = angleDiff(A.yaw, st.yaw);
        if (Math.abs(err) > 1) gain *= Math.max(0.55, 1 - (Math.abs(err) - 1) * 0.3);
        st.wheel = -Math.max(-1, Math.min(1, err * 2.2 - st.r * 3)) * HELM_LOCK;
        if (gain > 0) s.blow = { by: 'fleet:' + s.id, power: 1, gain, dx: -Math.sin(st.yaw), dz: -Math.cos(st.yaw), at: performance.now() };
        else this._stopWind(s);
        if (s.sails.some((sl) => sl.target < 1 && sl.burnt < 1)) this.S.setSails(s, 'all', 1, null);
        s.changed = true;
        void dt;
    }

    _stopWind(s) {
        if (s.blow && String(s.blow.by).startsWith('fleet:')) { s.blow = null; s.st.tau = 20; }
    }

    // ------------------------------------------------------------ the guns
    /** The guns the crew mans: the side that looks at the target (both sides while there is none). */
    _stations(s, f) {
        const L = s.layout;
        let sides = [1, -1];
        if (f.target) {
            const w = this.targetPoint(s, f.target, null, _o);
            if (w) { s.pose.toLocal(w.x, s.pose.y, w.z, _l); sides = [_l.x >= 0 ? 1 : -1]; }
        }
        const guns = L.cannons.filter((c) => sides.includes(c.side));
        const crew = (this.C.crews.get(s.id) || []).filter((v) => !v.dead && !v.overboard && v.ship === s && v.role !== 'captain' && !v.fleetBoard && !v.foe && !v.rescue && !(v.stunT > 0));
        // keep whoever is at a gun; give the free guns to the nearest free hands
        for (const [gid, vid] of f.gun) {
            const v = this.C.byId.get(vid);
            if (!v || !crew.includes(v) || !guns.some((c) => c.id === gid)) { if (v && v.gun === gid) v.gun = null; f.gun.delete(gid); }
        }
        for (const c of guns) {
            if (f.gun.has(c.id)) continue;
            let best = null, bd = Infinity;
            for (const v of crew) {
                if (v.gun || v.mode === 'sleepMat' || v.nsleep) continue;
                const d = Math.hypot(v.l.x - (c.x - c.side * SPOT), v.l.z - c.z);
                if (d < bd) { bd = d; best = v; }
            }
            if (best) { best.gun = c.id; best.path = null; f.gun.set(c.id, best.id); }
        }
        for (const v of crew) if (v.gun && !guns.some((c) => c.id === v.gun)) v.gun = null;
        return guns;
    }

    _gunSpot(c) { return { x: c.x - c.side * SPOT, y: c.y, z: c.z }; }

    _manned(s, c, f) {
        const v = this.C.byId.get(f.gun.get(c.id));
        if (!v || v.dead || v.overboard || v.ship !== s) return null;
        const sp = this._gunSpot(c);
        return Math.hypot(v.l.x - sp.x, v.l.z - sp.z) < 1.3 ? v : null;
    }

    /** A ball from the rack nearest the gun; false when the racks are empty. */
    _takeBall(s, c) {
        let best = null, bd = Infinity;
        for (const r of s.layout.racks) {
            if ((s.racks.get(r.id) || 0) <= 0) continue;
            const d = Math.hypot(r.x - c.x, r.z - c.z);
            if (d < bd) { bd = d; best = r; }
        }
        if (!best) return false;
        s.racks.set(best.id, s.racks.get(best.id) - 1);
        s.changed = true;
        this.S.cannons._event(s, { k: 'rack', r: best.id, n: s.racks.get(best.id) });
        return true;
    }

    _guns(s, f, dt) {
        const C = this.S.cannons;
        const guns = this._stations(s, f);
        if (!guns.length && f.mode === 'battle' && s.layout.cannons.length === 0) return;
        let wantsBall = false;
        for (const c of guns) {
            const G = C.gunOf(s, c.id);
            if (!G || G.st.loaded || G.st.fuse > 0) continue;
            const v = this._manned(s, c, f);
            if (!v) { continue; }
            if (performance.now() < (f.reload.get(c.id) || 0)) continue;
            v.loadT = (v.loadT || 0) + dt;
            v.mode = 'work';
            if (v.loadT < LOAD_T) continue;
            v.loadT = 0;
            if (!this._takeBall(s, c)) { wantsBall = true; continue; }
            G.st.loaded = true;
            s.changed = true;
            C._event(s, { k: 'load', g: c.id });
            this.game.sound?.playClang?.(0.4);
        }
        if (wantsBall) this._say(s, 'noBalls', f, 15000);
    }

    /** (host) A target is set: does a side bear, is the line clear — fire, or turn the ship, or say why not. */
    _firing(s, f, dt) {
        const T = f.target.kind === 'ship' ? this.S.list.get(f.target.id) : null;
        if (f.target.kind === 'ship' && (!T || !T.awake || T.state === 'sinking' || T.state === 'wreck')) {
            f.target = null; f.auto = null; this._stopWind(s);
            this._say(s, 'cease', f);
            return;
        }
        f.aimT -= dt;
        const w = this.targetPoint(s, f.target, { x: s.st.x, z: s.st.z }, _o);
        if (!w) { f.target = null; return; }
        s.pose.toLocal(w.x, s.pose.y, w.z, _l);
        const b = broadside(_l.x, _l.z);
        const tol = T ? T.layout.L * 0.4 : FLEET.TOL_MIN;
        const bear = gunsBear(b, { tol });
        f.bear = bear;
        if (!bear.ok) {
            const block = this._steerBlock(s), steer = !block;
            if (bear.why === 'angle') {
                if (!steer) { this._say(s, block, f, 10000); return; }
                const psi = yawFacing(s.st.x, s.st.z, w.x, w.z);
                f.auto = { yaw: beamTurn(s.st.yaw, psi).yaw, gain: b.dist > 120 ? 8 : 5, until: performance.now() + 4000 };
                this._say(s, 'maneuver', f, 9000);
            } else if (bear.why === 'far') {
                if (!steer) { this._say(s, block === 'moored' ? 'moored' : 'far', f, 12000); return; }
                f.auto = { yaw: yawFacing(s.st.x, s.st.z, w.x, w.z), gain: 9, until: performance.now() + 4000 }; // (bow on her: closing the range)
                this._say(s, 'far', f, 12000);
            } else this._say(s, 'near', f, 12000);
            return;
        }
        if (f.auto && !f.auto.free) { f.auto = null; this._stopWind(s); }
        if (f.aimT > 0) return;
        f.aimT = 0.4;
        this._salvo(s, f, T, w, b);
    }

    /** Fire every loaded, manned gun of the side that bears whose ball has a clear way; the rest wait. */
    _salvo(s, f, T, w, b) {
        const g = this.game, C = this.S.cannons, now = performance.now();
        const data = g.terrain?.data;
        let i = 0, blocked = 0;
        for (const c of s.layout.cannons) {
            if (c.side !== b.side) continue;
            const G = C.gunOf(s, c.id);
            if (!G || !G.st.loaded || G.st.fuse > 0 || now < (f.reload.get(c.id) || 0)) continue;
            if (!this._manned(s, c, f)) continue;
            C._muzzle(G, _m);
            s.pose.dirToWorld(c.side, 0, _l);
            const along = (w.x - _m.x) * _l.x + (w.z - _m.z) * _l.z;
            const pitch = gunPitch(along, w.y - _m.y);
            const tgt = f.target;
            const res = lineOfFire({ x: _m.x, y: _m.y, z: _m.z }, _l.x, _l.z, pitch, (x, y, z, t) => {
                if (data && data.isSolidAt(x, y, z)) {
                    if (tgt.kind === 'point' && Math.hypot(x - w.x, z - w.z) < 16) return 'target';
                    return 'land';
                }
                for (const o of this.S.awake) {
                    if (o === s && t < 0.25) continue;
                    if (!o.collider.hasXZ(x, z) || !o.collider.pointBlocked(x, y, z)) continue;
                    return o === T ? 'target' : this.sameSide(s, o) ? 'own' : 'ship';
                }
                return null;
            }, { reach: Math.max(1, along - 2), water: WATER_LEVEL_Y - 0.5 });
            if (!res.clear) { blocked++; continue; }
            G.st.pitch = pitch + (Math.random() - 0.5) * 0.01;
            C.light(G, f.by);
            G.st.fuse += i * 0.3; // (a rolling broadside)
            f.reload.set(c.id, now + FLEET.RELOAD * 1000);
            i++;
        }
        if (i) {
            f.salvos = (f.salvos || 0) + 1;
            s.pose.toWorld(0, s.layout.deck, 0, _o);
            g.castleLife?.alarm?.({ x: _o.x, y: _o.y, z: _o.z }, 'blast', f.by, 4); // (the guns are heard ashore)
            this._say(s, 'fire', f, 7000);
        } else if (blocked) this._say(s, 'blocked', f, 10000);
    }

    // ------------------------------------------------------------ boarding
    /** (host) Alongside the enemy: the crew leaps across. */
    _boarding(s, f, dt) {
        const T = this.S.list.get(f.board);
        if (!T || !T.awake || T.state === 'sinking' || T.state === 'wreck' || this.sameSide(s, T)) { this._recall(s, f); f.board = null; f.auto = null; this._stopWind(s); this._say(s, 'boardBack', f); return; }
        if (this._enemyAlive(T) <= 0) { this._recall(s, f); f.board = null; f.auto = null; this._stopWind(s); this._say(s, 'boardBack', f); return; } // (her crew is beaten: back aboard — she is ours)
        T.pose.toLocal(s.st.x, T.pose.y, s.st.z, _l); // (our place in her frame)
        const sT = _l.x >= 0 ? 1 : -1;
        const lat = Math.abs(_l.x), lon = Math.abs(_l.z);
        const gap = lat - (s.layout.B + T.layout.B) / 2;
        const overlap = (s.layout.L + T.layout.L) / 2;
        const near = gap <= FLEET.BOARD_GAP && lon < overlap - 4;
        if (near) {
            f.phase = 'leap';
            if (f.auto && !f.auto.free) f.auto = { yaw: T.st.yaw, gain: 2, until: performance.now() + 2000, hold: true }; // (keep station)
            const list = (this.C.crews.get(s.id) || []).filter((v) => !v.dead && !v.overboard && v.ship === s && v.role !== 'captain' && !(v.stunT > 0));
            const guards = Math.min(GUARDS, Math.max(0, list.length - 2));
            const boarders = list.filter((v) => !v.gun || f.mode === 'battle').slice(guards);
            for (const v of boarders) if (!v.fleetBoard) { v.fleetBoard = T.id; v.gun = null; v.path = null; }
            const cap = this._voice(s);
            if (cap && cap.role === 'captain' && !cap.fleetBoard && f.t > 4 && this._enemyAlive(T) <= 2) { /* (the captain stays at his wheel) */ }
            return;
        }
        // not yet: run alongside (parallel to her, her side towards ours)
        const block = this._steerBlock(s);
        if (block) { this._say(s, block, f, 10000); return; }
        f.phase = 'approach';
        const par = Math.abs(angleDiff(T.st.yaw, s.st.yaw)) < Math.PI / 2 || Math.abs(T.st.u) > 1.5;
        const yaw = par ? T.st.yaw : T.st.yaw + Math.PI;
        const lx = -sT * ((s.layout.B + T.layout.B) / 2 + FLEET.BOARD_GAP * 0.6);
        // (we come up on the side we are on: she is to the other side of us)
        T.pose.toWorld(-lx, 0, 0, _o);
        const far = Math.hypot(_o.x - s.st.x, _o.z - s.st.z);
        const lead = Math.min(40, far * 0.5);
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const gx = _o.x + fx * lead, gz = _o.z + fz * lead;
        f.auto = { yaw: far > 60 ? yawFacing(s.st.x, s.st.z, gx, gz) : yaw, gain: far > 60 ? 10 : 6 + Math.abs(T.st.u) * 1.2, until: performance.now() + 3000 };
        void dt;
    }

    _enemyAlive(T) { return this.C.alive(T); }

    /** Everybody back to his own ship. */
    _recall(s, f) {
        void f;
        for (const v of this.C.crews.get(s.id) || []) v.fleetBoard = null;
    }

    // ============================================================== the sailors' minds
    /** (Sailors._think, our deck) the fleet's business before the usual: the boarders to the rail, the gunners at their guns. */
    think(v, s, dt) {
        const f = this.st.get(s.id);
        if (!f) return false;
        const C = this.C;
        if (v.fleetBoard) {
            const T = this.S.list.get(v.fleetBoard);
            if (!T || !T.awake || !this._alive(s)) { v.fleetBoard = null; return false; }
            const gw = this._gangways(s, T, this._gw || (this._gw = {}));
            const tx = gw.a.x - Math.sign(gw.a.x) * 0.6, tz = gw.a.z + ((v.idx % 3) - 1) * 1.2;
            if (Math.hypot(tx - v.l.x, tz - v.l.z) > 1.2) { C._steer(v, s, tx, tz, 5.2, dt); v.mode = 'run'; return true; }
            const to = { x: gw.b.x - Math.sign(gw.b.x) * (1.4 + Math.random() * 2.5), y: T.layout.deck, z: gw.b.z + (Math.random() - 0.5) * 8 };
            to.y = floorAt(T.layout, to.x, to.z, T.layout.deck + 1) ?? T.layout.deck;
            this.game.blackbeard._leap(v, s, T, to);
            v.mode = 'run';
            return true;
        }
        if (v.gun) {
            const c = s.layout.cannons.find((x) => x.id === v.gun);
            if (!c) { v.gun = null; return false; }
            const sp = this._gunSpot(c);
            if (Math.hypot(sp.x - v.l.x, sp.z - v.l.z) > 0.8) { C._steer(v, s, sp.x, sp.z, 5.2, dt); v.mode = 'run'; }
            else { v.speed = 0; if (v.mode !== 'work') v.mode = 'idle'; v.lyaw = c.side > 0 ? -Math.PI / 2 : Math.PI / 2; }
            return true;
        }
        return false;
    }

    /** The two gangway points across the gap: ours (ship-local) and hers (local to her). */
    _gangways(s, T, out) {
        s.pose.toLocal(T.st.x, s.pose.y, T.st.z, _o);
        const sB = _o.x >= 0 ? 1 : -1; // (our side that looks at her)
        T.pose.toLocal(s.st.x, T.pose.y, s.st.z, _o);
        const sT = _o.x >= 0 ? 1 : -1; // (her side that looks at ours)
        out.a = { x: sB * (hullHalfWidth(s.layout, s.layout.gangZ, s.layout.deck) - 1.0), y: s.layout.deck, z: s.layout.gangZ };
        out.b = { x: sT * (hullHalfWidth(T.layout, T.layout.gangZ, T.layout.deck) - 1.0), y: T.layout.deck, z: T.layout.gangZ };
        return out;
    }

    /** (Sailors.update) One of ours on another deck: his foe there — or back over to his own ship. */
    thinkAway(v, dt) {
        if (!v.fleetBoard && !v.fleetHome) return false;
        const T = v.ship, B = v.crew, C = this.C;
        if (!B || T === B) return false;
        if (v.dead) { v.mode = 'dead'; v.speed = 0; C._fall(v, T, dt); C._offStair(v, T, dt); return true; }
        if (v.lev) { v.mode = 'idle'; v.speed = 0; return true; }
        if (v.stunT > 0 || v.vy) {
            if (v.stunT > 0) v.stunT -= dt;
            C._fall(v, T, dt); C._offStair(v, T, dt);
            v.mode = 'idle'; v.speed = 0; v.busy = false;
            if (v.fs) v.fs.st = 'close';
            return true;
        }
        if (v.parryShow > 0) { v.parryShow -= dt; v.mode = 'block'; v.speed = 0; return true; }
        if (v.braceT > 0) { C._braced(v, dt); return true; }
        // the ships drifted apart: into the sea (he swims home — Sailors._swim)
        T.pose.toLocal(B.st.x, T.pose.y, B.st.z, _l);
        if (Math.abs(_l.x) - (B.layout.B + T.layout.B) / 2 > FLEET.BOARD_GAP * 2.2 || !B.awake) { C._overboard(v, Math.random() < 0.5 ? -1 : 1); v.fleetBoard = null; return true; }
        // a foe on her deck: an enemy sailor first (the nearest)
        if (v.fleetBoard) {
            const foe = this.sailorFoe(v, T);
            if (foe) { v.foe = foe.id; v.fp = foe; v.path = null; this._addAway(T, v); return true; }
        }
        if (v.foe) { v.foe = null; v.fp = null; v.fs = null; v.busy = false; v.tac = null; v.fpath = null; }
        // done (or recalled): back to her gangway, over the gap
        v.fleetBoard = null;
        v.fleetHome = true;
        const sT = _l.x >= 0 ? 1 : -1; // (her side that looks at us)
        const gb = { x: sT * (hullHalfWidth(T.layout, T.layout.gangZ, T.layout.deck) - 1.0), z: T.layout.gangZ };
        const tx = gb.x - Math.sign(gb.x) * 0.6, tz = gb.z + ((v.idx % 3) - 1) * 1.2;
        if (Math.hypot(tx - v.l.x, tz - v.l.z) > 1.2) { C._steer(v, T, tx, tz, 5.2, dt); v.mode = 'run'; return true; }
        B.pose.toLocal(T.st.x, B.pose.y, T.st.z, _o);
        const sB = _o.x >= 0 ? 1 : -1;
        const ga = { x: sB * (hullHalfWidth(B.layout, B.layout.gangZ, B.layout.deck) - 1.0), z: B.layout.gangZ };
        const to = { x: ga.x - Math.sign(ga.x) * (1.5 + Math.random() * 3), y: B.layout.deck, z: ga.z + (Math.random() - 0.5) * 8 };
        to.y = floorAt(B.layout, to.x, to.z, B.layout.deck + 1) ?? B.layout.deck;
        v.fleetHome = false;
        this.game.blackbeard._leap(v, T, B, to);
        return true;
    }

    _addAway(T, v) {
        let a = this._away.get(T);
        if (!a) { a = []; this._away.set(T, a); }
        a.push(v);
    }

    // ============================================================== foes (creatures, not players)
    /** Is sailor `o` at war with sailor `v` (a boarder of the other side on the deck v stands on). */
    _enemies(v, o) {
        if (o.dead || o.overboard || o === v || o.vy) return false;
        const a = v.crew || v.ship, b = o.crew || o.ship;
        if (!a || !b || a === b) return false;
        return !this.sameSide(a, b);
    }

    /** The nearest living enemy sailor on deck `T` (v's frame is T's): {id: 'c:…', x, y, z} or null. */
    sailorFoe(v, T) {
        const intr = this._intruders(T);
        const own = v.crew === T;
        if (own && !intr.length) return null; // (the usual: nobody of another ship on her deck)
        let best = null, bd = Infinity;
        const look = (o) => {
            if (o.ship !== T || !this._enemies(v, o)) return;
            const d = Math.hypot(o.l.x - v.l.x, o.l.z - v.l.z) + Math.abs(o.l.y - v.l.y) * 2 - (('c:' + o.id) === v.foe ? 1e3 : 0);
            if (d < bd) { bd = d; best = o; }
        };
        for (const o of intr) look(o);
        if (!own) for (const o of this.C.crews.get(T.id) || []) look(o);
        return best ? { id: 'c:' + best.id, x: best.l.x, y: best.l.y, z: best.l.z } : null;
    }

    /** The sailors standing on deck `T` who belong to another ship (boarders), rebuilt once a frame. */
    _intruders(T) {
        const now = performance.now();
        if (now - (this._intrAt || 0) > 30) {
            this._intrAt = now;
            const m = this._intr || (this._intr = new Map());
            for (const a of m.values()) a.length = 0;
            for (const list of this.C.crews.values()) {
                for (const o of list) {
                    if (o.ship === o.crew || o.dead || !o.ship) continue;
                    let a = m.get(o.ship.id);
                    if (!a) { a = []; m.set(o.ship.id, a); }
                    a.push(o);
                }
            }
        }
        return this._intr?.get(T.id) || NONE;
    }

    /**
     * (Sailors._think) A foe for a sailor of ship `s` that is no player: an enemy boarder on his deck — or, when the
     * king of this ship is aboard / near, a zombie on the deck. null: none.
     */
    foeFor(v, s) {
        const g = this.game;
        const sf = this.sailorFoe(v, s);
        if (sf) return sf;
        if (!this.S.ownerOf(s) || !g.zombies?.length) return null;
        let best = null, bd = 40;
        for (const z of this._zombiesNear(s)) {
            if (z.isDead || z.isFrozen) continue;
            const p = z.group.position;
            s.pose.toLocal(p.x, p.y - (z.gOff ?? 0), p.z, _l);
            const L = s.layout;
            if (Math.abs(_l.x) > hullHalfWidth(L, _l.z, L.deck) + 0.5 || Math.abs(_l.z) > L.L / 2 || Math.abs(_l.y - v.l.y) > 3) continue; // (aboard only)
            const d = Math.hypot(_l.x - v.l.x, _l.z - v.l.z);
            if (d < bd) { bd = d; best = { id: 'c:z:' + z.id, x: _l.x, y: _l.y, z: _l.z }; }
        }
        return best;
    }

    /** The zombies within 60 m of the ship, looked up twice a second (not once a sailor a frame). */
    _zombiesNear(s) {
        const now = performance.now();
        const c = this._zc || (this._zc = new Map());
        let e = c.get(s.id);
        if (!e) { e = { t: -1e9, list: [] }; c.set(s.id, e); }
        if (now - e.t > 500) {
            e.t = now; e.list.length = 0;
            for (const z of this.game.zombies) {
                if (z.isDead) continue;
                const p = z.group.position;
                if (Math.abs(p.x - s.st.x) < 60 && Math.abs(p.z - s.st.z) < 60) e.list.push(z);
            }
        }
        return e.list;
    }

    /** A creature foe by its id, in the frame of deck `s`: {x, y, z} or null. */
    localOf(s, id, out) {
        if (id.startsWith('c:z:')) {
            const z = this.game.zombieById?.get(+id.slice(4)) ?? this.game.zombieById?.get(id.slice(4));
            if (!z || z.isDead) return null;
            const p = z.group.position;
            return s.pose.toLocal(p.x, p.y - (z.gOff ?? 0), p.z, out);
        }
        const o = this.C.byId.get(id.slice(2));
        if (!o || o.dead || o.overboard || o.ship !== s) return null;
        out.x = o.l.x; out.y = o.l.y; out.z = o.l.z;
        return out;
    }

    /** (Sailors._strike) The blade of sailor `v` came down on creature foe `id`. */
    strike(v, s, id) {
        const g = this.game;
        const by = this.S.ownerOf(v.crew || s); // (the king's name goes on it: kills count for him, the balls spare him)
        if (id.startsWith('c:z:')) {
            const z = g.zombieById?.get(+id.slice(4)) ?? g.zombieById?.get(id.slice(4));
            if (!z || z.isDead) return;
            const p = z.group.position;
            const dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz) || 1;
            g.damageZombie(z, v.dmg, true, new THREE.Vector3(dx / d, 0.2, dz / d), by);
            return;
        }
        const o = this.C.byId.get(id.slice(2));
        if (!o || o.dead) return;
        const dx = o.x - v.x, dz = o.z - v.z, d = Math.hypot(dx, dz) || 1;
        this.C.hit(o, v.dmg, new THREE.Vector3(dx / d, 0, dz / d), by, { weapon: true });
    }

    dispose() { this.st.clear(); this._away.clear(); }
}
