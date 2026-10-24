/**
 * VillagerCommands.js — the castle's people carry out the player's plain-word commands (src/ai/TalkCommands.js).
 *
 * The host runs it (the host moves the villagers); a guest's command comes to the host over the network as an
 * order named 'cmd' (VillagerOrders.run → NetSync 'vord'), the host checks it AGAIN with `canDo`.
 *
 * A command is `v.cmd = {kind, t, …}` (t: s left). The kinds:
 *   - pose   a body pose for `t` s (sit on the ground, crouch, lie down, salute, wave, dance, laugh, hug, nod, «смирно»);
 *   - face   turn to me / away / where I point / a side, and stay turned;
 *   - walk   go to a point or a place (me, the pointed ground, home, the barracks, the gate, the throne, the market, back),
 *            by the castle's paths or straight, at a walk / run / sneak; then stand (and look at me when he came to me);
 *   - hold   stand where he is and wait;
 *   - form   a place in a formation (line, column, circle, wedge, shields) — faces and stands ready;
 *   - patrol the posts of the castle one after another;
 *   - spar   two knights fight each other: the blows are real swings of the sword (the model's `strikeNow`); a spar
 *            ends at the third touch (a bow and a salute), a fight «насмерть» — real blows, till one falls or yields;
 *   - spme   a knight sparring with the player: no damage, a show of swings and blocks;
 *   - release / weapon / spare: the rest.
 * Everything walks through `life._steer` / the paths (collisions, `Crowd`), turns to the target before a blow («лицом к
 * цели»), and gives way to danger (a fight, fear — CastleLife._think runs this after them).
 */

import * as THREE from 'three';
import { canDo, COMMANDS, formationSlots, ONLY_ACTIVE } from '../ai/TalkCommands.js';
import { FACE, facesTarget, yawTo, turnToward } from './FaceTarget.js';
import { makeItemModel, disposeModel } from './ItemTypes.js';

const WALK = 2.3, RUN = 5.6, SNEAK = 1.3;
const SPEEDS = { walk: WALK, run: RUN, sneak: SNEAK };
const REACH = 2.4;
const ENGAGE = 3.6; // m: fighters this near have met (the crowd keeps two bodies ~3 m apart — they never got closer and stood there)
const TOUCHES = 3; // a spar ends at the third touch
const HURT_YIELD = 0.3; // a fighter «насмерть» yields with less than this share of hp
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const POSES = {
    crouch: { mode: 'crouch', t: 6 }, salute: { mode: 'salute', t: 2.6 }, wave: { mode: 'wave', t: 3 }, nod: { mode: 'nod', t: 1.6 },
    dance: { mode: 'dance', t: 8 }, laugh: { mode: 'laugh', t: 4 }, hug: { mode: 'hug', t: 3 }, attn: { mode: 'attn', t: 20 }, bow: { mode: 'bow', t: 1.8 },
    sit: { mode: 'sit', t: 25, seat: true }, lie: { mode: 'sleepMat', t: 20, lie: true }, guard: { mode: 'block', t: 20 },
};
const PLACE_TAG = { home: 'home', barracks: 'barracksDoor', castle: 'gateIn', throne: 'throneFront', market: 'market' };

export class VillagerCommands {
    constructor(life) {
        this.life = life;
    }

    get game() { return this.life.game; }

    /** The king, or his commander / deputy (Ranks.js). */
    _cmdr(cs, by) { return this.life.isCommander ? this.life.isCommander(cs, by) : by != null && this.life.state(cs.def.id).owner === by; }

    /** Is the player the lord of this villager's castle? */
    _lord(v, by) { return this._cmdr(v.cs, by); }
    /** The king himself (ranks are his alone to give). */
    _owner(v, by) { return by != null && this.life.state(v.cs.def.id).owner === by; }

    /** (host) A command for `v` (from VillagerOrders.run 'cmd'): `a` = {id, scope…, foe, point, mode, form, slot, pace, dir}. */
    run(v, a, by) {
        if (!v || v.dead || !a || !COMMANDS[a.id]) return false;
        const can = canDo(a.id, v.role, { playerIsKing: this._lord(v, by), playerIsOwner: this._owner(v, by), wizard: !!v.wizard });
        if (!can.ok) return false;
        const c = COMMANDS[a.id];
        if (v.foe || v.fleeT > 0) return false; // (in a fight or running for his life: no time)
        const [kind, what] = c.do.split(':');
        const me = this.life._playerPos(by);
        const base = { id: a.id, by, t: c.hold || 20, sheathed: false };
        // («подойди и поклонись»: the rest of the chain waits; `done` starts the next when this one is over)
        const then = Array.isArray(a.then) ? a.then.slice(0, 3) : null;
        switch (kind) {
            case 'pose': this._pose(v, what, a, base); break;
            case 'face': this._face(v, what, a, me, base); break;
            case 'hold': this._clear(v, true); v.cmd = { ...base, kind: 'hold', t: c.hold || 120, yaw: v.yaw, wait: what === 'wait' }; break;
            case 'release': this.life.orders._release(v); this.clear(v); break;
            case 'walk': this._walk(v, what, a, me, base); break;
            case 'pace': { // «беги» / «иди шагом»: the pace of the walk he is on, or a quick run to me
                if (v.cmd?.kind === 'walk') v.cmd.pace = a.pace || what;
                else v.paceOver = { pace: a.pace || what, t: 30 };
                break;
            }
            case 'form': this._form(v, a, base); break;
            case 'fight': this._fight(v, what, a, me, base); break;
            case 'weapon': v.sheath = what === 'away'; if (what === 'out') v.sheath = false; break;
            case 'spare': v.spare = { until: Date.now() + 120000, id: a.foe || null }; break;
            case 'fetch': this._fetch(v, what, a, me, base); break;
            case 'justice': if (!this.life.justice.run(v, what, a, me, by)) return false; break; // (an arrest, a search — JusticeLife)
            case 'court': if (a.op) return this.life.court?.hostOp(v, a, by) ?? false; break; // (a guest-king's word to the vizier: the host does it — CourtLife)
            case 'rank': { // the king tells his vizier whom to raise: only the king himself; the host keeps it (CastleLife.setRank)
                if (!this._owner(v, by) || a.pid == null || a.pid === by) return false;
                const level = { friend: 1, honored: 2, commander: 3, deputy: 4, none: 0 }[what] ?? 1;
                this.life.setRank(v.cs, a.pid, level, String(a.title || '').slice(0, 40), String(a.pname || '').slice(0, 30));
                return true;
            }
            case 'say': break; // (words only — CommandTalk)
            case 'cast': this._clear(v, true); v.cmd = { ...base, kind: 'pose', mode: 'cast', t: 2.6 }; break; // (a wizard's show: the wand arm up)
            default: return false;
        }
        if (v.cmd) v.cmd.then = then;
        else if (then?.length) { // (a command that did not make a state — a release, a weapon: the chain goes on at once)
            const [n, ...rest] = then;
            this.run(v, { ...n, then: rest }, by);
        }
        v.talking = 0;
        return true;
    }

    /** A command ended by itself: the next of the chain begins (a forced end — «хватит», a fight — drops the chain). */
    done(v) {
        const c = v.cmd, then = c?.then;
        const by = c?.by;
        this.clear(v);
        if (then?.length && !v.dead) {
            const [n, ...rest] = then;
            this.run(v, { ...n, then: rest }, by);
        }
    }

    clear(v, keepSheath = false) {
        if (!v.cmd && !v.seated) return;
        if (v.cmd?.carry) this._dropCarry(v, v.cmd);
        if (v.cmd?.seat) v.seated = false;
        v.cmd = null; v.cmdLie = false; v.paceOver = null;
        if (!keepSheath) v.sheath = false;
    }

    _clear(v, keepSheath) { this.clear(v, keepSheath); v.follow = null; v.followFar = false; v.order = null; v.path = null; v.guard = null; }

    _pose(v, what, a, base) {
        if (what === 'stand') { this.clear(v, true); return; }
        const p = POSES[what];
        if (!p) return;
        this._clear(v, true);
        v.cmd = { ...base, kind: 'pose', mode: p.mode, t: p.t, seat: !!p.seat, lie: !!p.lie };
        v.cmdLie = !!p.lie;
        if (p.seat) v.seated = true;
    }

    _face(v, what, a, me, base) {
        this._clear(v, true);
        let yaw = v.yaw;
        const here = { x: v.x, z: v.z };
        if (what === 'me' && me) yaw = yawTo(v.x, v.z, me.x, me.z);
        else if (what === 'away' && me) yaw = yawTo(v.x, v.z, me.x, me.z) + Math.PI;
        else if (what === 'point' && a.point) yaw = yawTo(here.x, here.z, a.point.x, a.point.z);
        else if (what === 'dir' || a.dir) {
            const d = a.dir;
            yaw = v.yaw + (d === 'right' ? -Math.PI / 2 : d === 'left' ? Math.PI / 2 : Math.PI);
        } else if (what === 'point' && me) yaw = yawTo(v.x, v.z, me.x, me.z);
        v.cmd = { ...base, kind: 'face', yaw, t: base.t };
    }

    _walk(v, what, a, me, base) {
        this._clear(v, true);
        const pace = a.pace || 'walk';
        let tx = v.x, tz = v.z, node = null, looks = null, stop = 0.6;
        if (a.to || what === 'person') { // to a man (the vizier leads the king to him)
            const t = this.life.byId.get(a.to);
            if (!t) return;
            tx = t.x; tz = t.z; looks = t.id; stop = 2.8; node = null; base.t = 70;
        }
        else if (what === 'come' && me) { tx = me.x; tz = me.z; looks = 'me'; stop = 2.6; }
        else if (what === 'point' && a.point) { tx = a.point.x; tz = a.point.z; const far = Math.hypot(tx - v.x, tz - v.z); base.maxT = Math.min(300, 40 + far / 1.6); base.t = base.maxT + 20; this.life.alog?.decision(v, `иду в точку (${Math.round(tx)}, ${Math.round(tz)}), ${Math.round(far)} м, на это даю ${Math.round(base.maxT)} с`); }
        else if (what === 'dir' && me) { // «пройди пять шагов вперёд»: along or across where I look (the hero's own forward)
            const g = this.game;
            const yaw = g.character?.group?.rotation?.y ?? 0;
            const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
            const rx = -fz, rz = fx; // my right
            const k = { forward: [fx, fz], back: [-fx, -fz], right: [rx, rz], left: [-rx, -rz] }[a.dir] || [fx, fz];
            const dist = Math.max(0.8, Math.min(60, Number(a.dist) || 6));
            tx = v.x + k[0] * dist; tz = v.z + k[1] * dist; stop = 0.5; base.t = 20 + dist; base.noWalkFar = true;
        }
        else if (what === 'back' && me) { // a few steps back from me
            const dx = v.x - me.x, dz = v.z - me.z, d = Math.hypot(dx, dz) || 1;
            tx = v.x + dx / d * 3; tz = v.z + dz / d * 3; looks = 'me'; stop = 0.4;
        } else if (what === 'forward' && me) { const d = dist(v, me) || 1; tx = v.x + (me.x - v.x) / d * 2.5; tz = v.z + (me.z - v.z) / d * 2.5; looks = 'me'; stop = 0.3; }
        else if (what === 'retreat' && me) {
            const dx = v.x - me.x, dz = v.z - me.z, d = Math.hypot(dx, dz) || 1;
            tx = v.x + dx / d * 14; tz = v.z + dz / d * 14; stop = 0.8; base.t = 20;
        } else if (what === 'stroll' && me) { const ang = Math.random() * 6.28; tx = me.x + Math.cos(ang) * 6; tz = me.z + Math.sin(ang) * 6; looks = 'me'; stop = 1; }
        else if (PLACE_TAG[what]) {
            const list = v.cs.graph.tagged(PLACE_TAG[what]);
            if (!list.length) { this.life._say(v, pick(['Туда я не дойду.', 'Не вижу туда пути.']), 3); return; }
            // the nearest of them to him
            let bi = list[0], bd = Infinity;
            for (const id of list) { const n = v.cs.graph.nodes[id]; const d = n ? Math.hypot(n.x - v.x, n.z - v.z) : Infinity; if (d < bd) { bd = d; bi = id; } }
            const n = v.cs.graph.nodes[bi];
            tx = n.x; tz = n.z; node = bi; stop = 1.2;
            base.t = 90;
        } else return;
        if (what === 'come') base.t = 60; else if (!base.t || base.t < 15) base.t = 30;
        v.cmd = { ...base, kind: 'walk', maxT: base.maxT, tx, tz, node, pace, looks, stop, walkT: 0, hold: what === 'come' ? 12 : what === 'retreat' ? 0 : what === 'dir' || what === 'back' || what === 'forward' ? 2 : 25 };
        if (what === 'retreat') v.cmd.hold = 4;
    }

    _form(v, a, base) {
        if (!a.slot) return;
        this._clear(v, true);
        v.cmd = { ...base, kind: 'form', slot: a.slot, t: 180, form: a.form || 'line', walkT: 0 };
    }

    _fight(v, what, a, me, base) {
        const life = this.life;
        if (what === 'stop') { // the end of a fight on an order: back to the posts, a bow to each other
            const foe = v.cmd?.foe ? life.byId.get(v.cmd.foe) : null;
            if (v.cmd?.kind === 'spar') { v.cmd = { ...base, kind: 'pose', mode: 'bow', t: 1.4 }; if (foe?.cmd?.foe === v.id) foe.cmd = { ...base, kind: 'pose', mode: 'bow', t: 1.4 }; }
            else this.life.orders._release(v);
            if (v.cmd?.kind !== 'pose') this.clear(v);
            v.sheath = false;
            return;
        }
        if (what === 'spar' || what === 'him') {
            const foe = a.foe ? life.byId.get(a.foe) : null;
            if (!foe || foe.dead || foe === v) return;
            if (a.mode === 'deadly' || what === 'him') { foe.byOrder = base.by; life.alog?.decision(v, `убивает ${foe.title || ''} ${foe.name || foe.id} по приказу — его смерть законна, тревоги не будет`); }
            this._clear(v, true); v.sheath = false;
            v.cmd = { ...base, kind: 'spar', foe: foe.id, mode: a.mode === 'deadly' ? 'deadly' : 'spar', t: a.mode === 'deadly' ? 120 : 45, touches: 0, swingT: 0.6 + Math.random() * 0.6, walkT: 0 };
            return;
        }
        if (what === 'me') {
            this._clear(v, true); v.sheath = false;
            v.cmd = { ...base, kind: 'spme', t: 40, blows: 0 };
            return;
        }
        if (what === 'guard') {
            const g = v.cs.graph;
            const nodeId = g.nearest(v.x, v.y, v.z, 8);
            this._clear(v, true); v.sheath = false;
            v.order = { kind: 'defend', by: base.by, t: 900, post: { x: v.x, y: v.y, z: v.z, node: nodeId } };
            return;
        }
        if (what === 'patrol') {
            const posts = life.orders._posts(v.cs);
            if (!posts.length) return;
            this._clear(v, true); v.sheath = false;
            // each patrol member starts from a different post, so they do not walk in a bunch
            v.cmd = { ...base, kind: 'patrol', posts, i: Math.floor(Math.random() * posts.length), t: 300, wait: 0, walkT: 0 };
            return;
        }
        if (what === 'arrest') {
            const foe = a.foe ? life.byId.get(a.foe) : null;
            if (!foe) return;
            // (the king's order to hold a suspect: he comes up and stands by him — no blow)
            this._clear(v, true);
            v.cmd = { ...base, kind: 'walk', tx: foe.x, tz: foe.z, pace: 'walk', stop: 1.8, t: 40, walkT: 0, hold: 15, looks: foe.id };
        }
    }

    // ------------------------------------------------------------------ each frame (host)
    /** A villager with a command: false → the normal life goes on. */
    step(v, dt) {
        const c = v.cmd;
        if (!c) { this._paceStep(v, dt); return false; }
        c.t -= dt;
        const life = this.life;
        if (v.fear?.level >= 2) { this.clear(v); return false; }
        if (c.t <= 0) { this.done(v); return false; }
        if ((c.kind === 'spar' || c.kind === 'search' || c.kind === 'arrest' || c.kind === 'walk' && c.looks && c.looks !== 'me') && (c.wakeT = (c.wakeT || 0) - dt) <= 0) this._wakeNear(v, c);
        v.sheath = v.sheath && c.kind !== 'spar' && c.kind !== 'spme';
        switch (c.kind) {
            case 'pose': return this._poseStep(v, c, dt);
            case 'face': return this._faceStep(v, c, dt);
            case 'hold': v.speed = 0; v.mode = v.talking > 0 ? 'talk' : 'idle'; v.yaw = v.talking > 0 ? v.yaw : turnToward(v.yaw, c.yaw, dt * 4); life._ground(v); return true;
            case 'walk': return this._walkStep(v, c, dt);
            case 'form': return this._formStep(v, c, dt);
            case 'patrol': return this._patrolStep(v, c, dt);
            case 'spar': return this._sparStep(v, c, dt);
            case 'spme': return this._spmeStep(v, c, dt);
            case 'fetch': return this._fetchStep(v, c, dt);
            case 'arrest': case 'captive': case 'search': return this.life.justice.step(v, c, dt);
            default: this.clear(v); return false;
        }
    }

    _poseStep(v, c, dt) {
        v.speed = 0; v.mode = c.mode; v.path = null;
        const me = this.life._playerPos(c.by);
        if (me && (c.mode === 'salute' || c.mode === 'wave' || c.mode === 'hug' || c.mode === 'nod' || c.mode === 'bow' || c.mode === 'laugh' || c.mode === 'dance')) v.yaw = turnToward(v.yaw, yawTo(v.x, v.z, me.x, me.z), dt * 6);
        if (c.seat) v.seated = true;
        if (c.mode !== 'sleepMat') this.life._ground(v);
        else v.cmdLie = true;
        if (c.mode === 'sleepMat' && v.talking > 0) v.talking = 0; // (a lying man does not stand up to talk: he is heard lying)
        return true;
    }

    _faceStep(v, c, dt) {
        v.speed = 0; v.mode = 'idle'; v.path = null;
        v.yaw = turnToward(v.yaw, c.yaw, dt * 5);
        this.life._ground(v);
        return true;
    }

    /** Walks to a point: by the castle's paths when far / out of sight, straight otherwise (collisions: `_steer`). */
    _goStep(v, c, dt, speed, tx = c.tx, tz = c.tz, stop = c.stop) {
        const life = this.life;
        const d = Math.hypot(tx - v.x, tz - v.z);
        if (d <= stop) return 0;
        c.walkT += dt;
        const inside = life._inLand(v.cs.def, { x: v.x, z: v.z }, 0);
        // (a place outside the walls: first out through the gate — the straight way would end at the wall)
        if (inside && !c.outDone && !life._inLand(v.cs.def, { x: tx, z: tz }, 0)) {
            const gr = v.cs.graph, gates = gr.tagged('gateOut');
            if (gates.length) {
                if (c.gate == null) { let bd = Infinity; for (const id of gates) { const n = gr.nodes[id]; const dd = n ? Math.hypot(n.x - v.x, n.z - v.z) : Infinity; if (dd < bd) { bd = dd; c.gate = id; } } }
                const gn = gr.nodes[c.gate];
                if (gn && Math.hypot(gn.x - v.x, gn.z - v.z) > 3.5) {
                    if (!v.path) life._goTo(v, c.gate);
                    if (life._followPath(v, dt, speed)) v.path = null;
                    return d;
                }
            }
            c.outDone = true; v.path = null;
        }
        if (c.node != null && d > 6 && inside) {
            if (!v.path) life._goTo(v, c.node);
            if (life._followPath(v, dt, speed)) v.path = null;
            return d;
        }
        if (d > 12 && inside && !life._sees(v, { x: tx, y: v.y + 1, z: tz })) {
            c.pathT = (c.pathT || 0) - dt;
            if (c.pathT <= 0 || !v.path) { c.pathT = 1.5; life._goTo(v, v.cs.graph.nearest(tx, v.y, tz, 8)); }
            if (life._followPath(v, dt, speed)) v.path = null;
            return d;
        }
        v.path = null;
        life._steer(v, tx, tz, speed, dt, stop);
        return Math.hypot(tx - v.x, tz - v.z);
    }

    /** The ones asleep round a knight at his work (an arrest, a search, a fight, a walk up to a man) are woken: they cannot sleep through it. */
    _wakeNear(v, c) {
        c.wakeT = 1;
        const night = this.life.night;
        if (!night) return;
        const foe = c.foe ? this.life.byId.get(c.foe) : c.looks ? this.life.byId.get(c.looks) : null;
        for (const o of v.cs.active.values()) {
            if (!o.sleep || o.dead) continue;
            const near = Math.hypot(o.x - v.x, o.z - v.z) < 7 || (foe && o === foe && Math.hypot(o.x - v.x, o.z - v.z) < 12);
            if (near) { night.wake(o, 'noise', v.id); this.life.alog?.decision(o, `разбужен: рядом ${v.title || ''} ${v.name || ''} занят делом`); }
        }
    }

    _paceStep() { /* (a pace order with no walk: nothing to do — only a following villager changes pace, below) */ }

    _walkStep(v, c, dt) {
        const life = this.life;
        const speed = SPEEDS[c.pace] || WALK;
        // (coming to me: I may walk on — the goal follows me)
        if (c.looks === 'me' && c.stop > 2) { const me = life._playerPos(c.by); if (me) { c.tx = me.x; c.tz = me.z; } }
        if (typeof c.looks === 'string' && c.looks !== 'me') { const f = life.byId.get(c.looks); if (f) { c.tx = f.x; c.tz = f.z; } }
        const left = this._goStep(v, c, dt, speed);
        if (left > 0 && c.walkT < (c.maxT || 60)) {
            v.mode = v.speed > WALK * 1.2 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
            life._ground(v);
            return true;
        }
        // arrived (or no way): stand, look at me when I called him
        c.hold -= dt;
        v.speed = 0; v.path = null;
        v.mode = v.talking > 0 ? 'talk' : 'idle';
        if (c.looks) {
            const me = c.looks === 'me' ? life._playerPos(c.by) : life.byId.get(c.looks);
            if (me) v.yaw = turnToward(v.yaw, yawTo(v.x, v.z, me.x, me.z), dt * 6);
        }
        life._ground(v);
        if (c.hold <= 0) { this.done(v); return false; }
        return true;
    }

    _formStep(v, c, dt) {
        const life = this.life;
        const s = c.slot;
        const left = this._goStep(v, c, dt, WALK * 1.4, s.x, s.z, 0.35);
        if (left > 0 && c.walkT < 40) {
            v.mode = v.speed > WALK * 1.2 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
            life._ground(v);
            return true;
        }
        v.speed = 0; v.path = null;
        v.mode = c.form === 'circle' || c.form === 'shields' ? 'block' : 'attn';
        v.yaw = turnToward(v.yaw, s.yaw, dt * 5);
        life._ground(v);
        return true;
    }

    _patrolStep(v, c, dt) {
        const life = this.life;
        const p = c.posts[c.i % c.posts.length];
        if (c.wait > 0) { c.wait -= dt; v.speed = 0; v.mode = 'idle'; v.yaw += Math.sin(performance.now() / 700) * dt * 0.8; life._ground(v); return true; }
        c.node = p.node;
        c.tx = p.x; c.tz = p.z;
        const left = this._goStep(v, c, dt, WALK, p.x, p.z, 1.6);
        if (left > 0 && c.walkT < 45) { v.mode = v.speed > 0 ? 'walk' : 'idle'; life._ground(v); return true; }
        c.i++; c.wait = 3 + Math.random() * 3; c.walkT = 0; v.path = null;
        return true;
    }

    // ------------------------------------------------------------------ carrying things
    /**
     * «Убери доспехи сзади по сундукам», «принеси мне меч», «собери всё это»: he walks to each thing lying there, lifts it (it
     * is gone from the ground and seen in his arms), carries it to the place (me / beside the chest / a pile) and sets it down.
     * `a.uids`: the things (nearest first), `a.dest`: {kind: 'me' | 'spot', x, z, yaw, id?}. A chest here keeps one loot only, so
     * «в сундук» means: laid in a row at its foot — the knight says so.
     */
    _fetch(v, what, a, me, base) {
        const uids = Array.isArray(a.uids) ? a.uids.slice(0, 8) : [];
        const dest = a.dest;
        if (!uids.length || !dest) return;
        this._clear(v, true);
        v.cmd = { ...base, kind: 'fetch', uids, dest, t: 150, carry: null, node: null, walkT: 0, n: 0, row: 0, mode: what };
    }

    _fetchStep(v, c, dt) {
        const life = this.life, items = this.game.items;
        if (!items) { this.done(v); return false; }
        const hands = c.carry;
        if (!hands) {
            // the next thing still lying there
            while (c.uids.length && !items.loose.has(c.uids[0])) c.uids.shift();
            if (!c.uids.length) { if (c.n) life._say(v, pick(['Готово!', 'Всё, сделал.', 'Убрано.']), 3); this.done(v); return false; }
            const L = items.loose.get(c.uids[0]);
            const p = L.model.position;
            const left = this._goStep(v, c, dt, WALK * 1.3, p.x, p.z, 1.5);
            if (left > 0 && c.walkT < 40) { v.mode = v.speed > WALK * 1.2 ? 'run' : v.speed > 0 ? 'walk' : 'idle'; life._ground(v); return true; }
            if (left > 0) { c.uids.shift(); c.walkT = 0; return true; } // (cannot reach it: the next one)
            // lifted: gone from the ground (everybody is told), in his arms
            if (L.item.shop && !L.item.shop.paid) { c.uids.shift(); return true; } // (an unpaid good on a counter is not his to carry)
            const item = L.item;
            items.pickUp(item.uid, '#' + v.id, 'right');
            c.carry = { item, mesh: this._carryModel(v, item) };
            c.uids.shift();
            c.walkT = 0;
            v.speed = 0; v.path = null;
            return true;
        }
        // to the place
        const d = c.dest;
        let tx = d.x, tz = d.z, stop = d.kind === 'me' ? 2.4 : 1.0;
        if (d.kind === 'me') { const me = life._playerPos(c.by); if (me) { tx = me.x; tz = me.z; } }
        const left = this._goStep(v, c, dt, WALK * 1.2, tx, tz, stop);
        if (left > 0 && c.walkT < 50) { v.mode = v.speed > 0 ? 'walk' : 'idle'; life._ground(v); return true; }
        // set down: before me (a hand's reach, at the height of a hand), or in a row at the spot
        let px, pz, py = v.y + 1.2;
        if (d.kind === 'me') {
            const me = life._playerPos(c.by);
            px = v.x + Math.cos(v.yaw - Math.PI / 2) * 0.0 - Math.sin(v.yaw) * 1.1; pz = v.z - Math.cos(v.yaw) * 1.1;
            py = (me ? me.y - 1.95 : v.y) + 1.8;
        } else {
            const k = c.row++, perRow = 5;
            const side = d.yaw ?? 0;
            const rx = Math.cos(side), rz = -Math.sin(side), fx = -Math.sin(side), fz = -Math.cos(side);
            px = d.x + rx * ((k % perRow) - 2) * 1.0 + fx * 1.6 * (1 + Math.floor(k / perRow));
            pz = d.z + rz * ((k % perRow) - 2) * 1.0 + fz * 1.6 * (1 + Math.floor(k / perRow));
            py = v.y + 1.2;
        }
        this._dropCarry(v, c, _a.set(px, py, pz));
        c.n++;
        c.walkT = 0;
        v.speed = 0;
        if (c.n >= 8) { life._say(v, 'Вот, всё.', 3); this.done(v); return false; }
        return true;
    }

    /** The thing in his arms, seen: the item's own model before his chest (not a new shape per item — makeItemModel is cached by kind). */
    _carryModel(v, item) {
        try {
            const m = makeItemModel(item);
            m.scale.multiplyScalar(0.8);
            m.position.set(0, 0.9, -0.85);
            v.model.group.add(m);
            return m;
        } catch (_) { return null; }
    }

    /** Sets the carried thing down (at `at`, else at his feet): back to the ground as a loose thing. */
    _dropCarry(v, c, at = null) {
        const cr = c.carry;
        if (!cr) return;
        c.carry = null;
        if (cr.mesh) { v.model.group.remove(cr.mesh); try { disposeModel(cr.mesh); } catch (_) { /* (shared geometry stays) */ } }
        const pos = at ? at.clone() : _b.set(v.x, v.y + 1.4, v.z).clone();
        this.game.items?.spawnLoose(cr.item, pos, {});
    }

    // ------------------------------------------------------------------ fights
    _sparStep(v, c, dt) {
        const life = this.life;
        const foe = life.byId.get(c.foe);
        if (!foe || foe.dead || foe.sleep || foe.fleeT > 0) { this._sparEnd(v, c, null); return false; }
        const d = dist(v, foe);
        // (a stranger's fight in the middle: both fighters keep to their foe; a real enemy (zombies) ends it — fear/foe run before this)
        if (c.mode === 'deadly') {
            const share = (v.hp || 1) / (v.maxHp || v.hp || 1);
            if (share < HURT_YIELD && (v.maxHp || 0) > 0) { this._sparEnd(v, c, foe, 'yield'); return true; }
        }
        // (met: near enough, or pressed against him and unable to get closer — the fight begins where they stand)
        c.stuckT = v.speed < 0.2 && d < 7 ? (c.stuckT || 0) + dt : 0;
        if (d > ENGAGE && c.stuckT < 0.8) {
            c.walkT += dt;
            life._steer(v, foe.x, foe.z, WALK * 1.2, dt, ENGAGE - 0.8);
            v.mode = v.speed > WALK * 1.2 ? 'run' : v.speed > 0 ? 'walk' : 'block';
            if (c.walkT > 14) { this.clear(v); return false; }
            life._ground(v);
            return true;
        }
        c.walkT = 0;
        v.speed = 0;
        const want = yawTo(v.x, v.z, foe.x, foe.z);
        v.yaw = turnToward(v.yaw, want, dt * 9);
        // a swing, then a guard — turn by turn with the foe (the model's own swing lands the blow: `strike`)
        if (c.hurtT > 0) { c.hurtT -= dt; v.mode = 'flinch'; life._ground(v); return true; } // (touched: a start back)
        c.swingT -= dt;
        if (c.swingT <= 0 && !c.swinging) { c.swinging = true; c.swingEnd = 0.75; }
        if (c.swinging) {
            v.mode = 'attack';
            c.swingEnd -= dt;
            if (c.swingEnd <= 0) { c.swinging = false; c.swingT = 0.9 + Math.random() * 1.1; }
        } else v.mode = 'block';
        life._ground(v);
        return true;
    }

    /** (host) The sword of a fighter on a command reached: a touch on the foe. */
    strike(v) {
        const c = v.cmd;
        if (!c) return;
        if (c.kind === 'spme') { c.blows++; this._clash(v.x, v.y, v.z, 0.5); this._spark(v.x, v.y + 2.6, v.z); return; }
        if (c.kind !== 'spar') return;
        const foe = this.life.byId.get(c.foe);
        if (!foe || foe.dead) return;
        const d = dist(v, foe);
        if (d > ENGAGE + 1.2) return;
        if (!facesTarget(v.yaw, v.x, v.z, foe.x, foe.z, FACE.MELEE)) return; // («лицом к цели»)
        const fc = foe.cmd;
        const parried = fc && fc.kind === 'spar' && foe.mode === 'block' && Math.random() < 0.55;
        const mx = (v.x + foe.x) / 2, mz = (v.z + foe.z) / 2;
        this._spark(mx, v.y + 2.6, mz);
        if (parried) { this._clash(mx, v.y, mz, 0.7); return; }
        if (c.mode === 'deadly') {
            const dmg = v.role === 'king' ? 5 : 3;
            this.life.hit(foe, dmg, { x: (foe.x - v.x) / (d || 1), y: 0, z: (foe.z - v.z) / (d || 1) }, null, { via: 'guard' });
            if (foe.dead) { this._sparEnd(v, c, foe, 'won'); }
            return;
        }
        // a touch: the touched one flinches, the spar goes on to the third touch
        c.touches++;
        if (fc && fc.kind === 'spar') fc.touches = c.touches;
        if (fc) fc.hurtT = 0.45;
        this.life._say(v, pick(['Есть касание!', 'Попал!', 'Раз!', 'Держи!']), 2);
        this._clash(mx, v.y, mz, 0.9);
        if (c.touches >= TOUCHES) this._sparEnd(v, c, foe, 'touches');
    }

    _spark(x, y, z) {
        const fx = this.game.fx;
        if (!fx?.spark) return;
        for (let i = 0; i < 5; i++) fx.spark(_a.set(x, y, z), 0xfff1c0, 0.08, _b.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.35);
    }

    /** The clash of two swords, heard from where they meet. */
    _clash(x, y, z, power = 0.6) {
        const g = this.game;
        const me = g.character?.group?.position;
        if (!me || Math.hypot(me.x - x, me.z - z) > 40) return;
        g.sound?.playClang?.(power * Math.max(0.15, 1 - Math.hypot(me.x - x, me.z - z) / 40));
    }

    /** The end of a spar: a bow to each other, back to the posts; a yielded / won fight: a word. */
    _sparEnd(v, c, foe, why = null) {
        const life = this.life;
        const bow = (k) => { k.cmd = { id: 'stop_fight', by: c.by, kind: 'pose', mode: 'bow', t: 1.6 }; k.swinging = false; };
        if (why === 'won') { life._say(v, pick(['Бой окончен.', 'Победа за мной.']), 2.5); this.clear(v); return; }
        bow(v);
        if (foe && foe.cmd?.kind === 'spar') bow(foe);
        if (why === 'yield') life._say(v, pick(['Сдаюсь!', 'Хватит, я признаю поражение!']), 3);
        else if (why === 'touches') life._say(foe || v, pick(['Хорошая схватка!', 'Славно потренировались.', 'Ты хорошо дерёшься.']), 3);
    }

    /** A knight sparring with the player: swings and blocks facing me, no damage, no step closer than 2.6 m. */
    _spmeStep(v, c, dt) {
        const life = this.life;
        const me = life._playerPos(c.by);
        if (!me) { this.clear(v); return false; }
        const d = dist(v, me);
        v.yaw = turnToward(v.yaw, yawTo(v.x, v.z, me.x, me.z), dt * 7);
        if (d > 4.5) { life._steer(v, me.x, me.z, WALK * 1.2, dt, 3); v.mode = v.speed > 0 ? 'walk' : 'block'; life._ground(v); return true; }
        if (d < 2.2) { const k = 2.6 - d; v.x += (v.x - me.x) / (d || 1) * k * dt * 2; v.z += (v.z - me.z) / (d || 1) * k * dt * 2; }
        v.speed = 0;
        c.cycle = ((c.cycle || 0) + dt) % 2.4;
        v.mode = c.cycle < 0.8 ? 'attack' : 'block';
        life._ground(v);
        return true;
    }
}

export { ONLY_ACTIVE, formationSlots };
