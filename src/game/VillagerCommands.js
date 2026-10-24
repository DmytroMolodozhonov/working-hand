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

const WALK = 2.3, RUN = 5.6, SNEAK = 1.3;
const SPEEDS = { walk: WALK, run: RUN, sneak: SNEAK };
const REACH = 2.4;
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

    /** Is the player the lord of this villager's castle? */
    _lord(v, by) { return this.life.state(v.cs.def.id).owner === by && by != null; }

    /** (host) A command for `v` (from VillagerOrders.run 'cmd'): `a` = {id, scope…, foe, point, mode, form, slot, pace, dir}. */
    run(v, a, by) {
        if (!v || v.dead || !a || !COMMANDS[a.id]) return false;
        const can = canDo(a.id, v.role, { playerIsKing: this._lord(v, by), wizard: !!v.wizard });
        if (!can.ok) return false;
        const c = COMMANDS[a.id];
        if (v.foe || v.fleeT > 0) return false; // (in a fight or running for his life: no time)
        const [kind, what] = c.do.split(':');
        const me = this.life._playerPos(by);
        const base = { id: a.id, by, t: c.hold || 20, sheathed: false };
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
            case 'say': break; // (words only — CommandTalk)
            case 'cast': this._clear(v, true); v.cmd = { ...base, kind: 'pose', mode: 'cast', t: 2.6 }; break; // (a wizard's show: the wand arm up)
            default: return false;
        }
        v.talking = 0;
        return true;
    }

    clear(v, keepSheath = false) {
        if (!v.cmd && !v.seated) return;
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
        if (what === 'come' && me) { tx = me.x; tz = me.z; looks = 'me'; stop = 2.6; }
        else if (what === 'point' && a.point) { tx = a.point.x; tz = a.point.z; }
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
        v.cmd = { ...base, kind: 'walk', tx, tz, node, pace, looks, stop, walkT: 0, hold: what === 'come' ? 12 : what === 'retreat' ? 0 : what === 'back' || what === 'forward' ? 3 : 25 };
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
        if (c.t <= 0 || v.fear?.level >= 2) { this.clear(v); return false; }
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

    _paceStep() { /* (a pace order with no walk: nothing to do — only a following villager changes pace, below) */ }

    _walkStep(v, c, dt) {
        const life = this.life;
        const speed = SPEEDS[c.pace] || WALK;
        // (coming to me: I may walk on — the goal follows me)
        if (c.looks === 'me' && c.stop > 2) { const me = life._playerPos(c.by); if (me) { c.tx = me.x; c.tz = me.z; } }
        if (typeof c.looks === 'string' && c.looks !== 'me') { const f = life.byId.get(c.looks); if (f) { c.tx = f.x; c.tz = f.z; } }
        const left = this._goStep(v, c, dt, speed);
        if (left > 0 && c.walkT < 60) {
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
        if (c.hold <= 0) { this.clear(v); return false; }
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
        if (d > REACH + 0.6) {
            c.walkT += dt;
            life._steer(v, foe.x, foe.z, WALK * 1.2, dt, REACH - 0.4);
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
        if (d > REACH + 0.9) return;
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
