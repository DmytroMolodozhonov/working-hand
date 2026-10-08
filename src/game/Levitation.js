/**
 * Levitation.js — «Вингардиум Левиоса».
 *
 * Point a hand at a loose object a few metres away (a sword, an axe, an ice
 * ball…) and say the words: the object rises and floats in front of the
 * hand, following it — slowly and heavily, like it is carried by magic.
 * A fast, far jerk of the hand breaks the spell: the object flies off with
 * the speed it had (you can throw things this way). Saying the words again
 * lets it down gently.
 */

import * as THREE from 'three';

export const LEVITATE = {
    RANGE: 10, // m
    CONE: 0.5, // rad around the pointing direction
    MIN_HOLD: 2, // m in front of the hand
    MAX_HOLD: 6,
    TWIST: 1.6, // the object turns this much more than the wrist (a small turn of the hand swings it)
    FOLLOW: 3.5, // how fast the float point follows the hand (1/s)
    DROP_DISTANCE: 0.75, // m of hand movement within DROP_WINDOW = a jerk
    DROP_WINDOW: 0.25,
    GRACE: 0.8,
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();

export class Levitation {
    constructor(game) {
        this.game = game;
        this.state = null; // {kind:'weapon'|'ice', obj, side, hold, target, age, history}
        this._t = 0;
    }

    get active() {
        return !!this.state;
    }

    /** Objects that can be lifted: loose weapons and ice balls. */
    _candidates() {
        const out = [];
        for (const w of this.game.weapons.weapons) {
            if (w.holder || w.remoteTarget) continue;
            out.push({ kind: 'weapon', obj: w, pos: w.position });
        }
        for (const b of this.game.water?.resting || []) out.push({ kind: 'ice', obj: b, pos: b.pos });
        return out;
    }

    /**
     * Cast: the hand pointing best at a loose object picks it up.
     * @returns {string|null} hint when nothing is pointed at
     */
    cast() {
        if (this.state) { this.release(true); return null; }
        const ch = this.game.character;
        let best = null;
        for (const side of ['right', 'left']) {
            const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
            const dir = ch.getHandDirection(side, new THREE.Vector3());
            for (const c of this._candidates()) {
                const to = _v1.subVectors(c.pos, hand);
                const d = to.length();
                if (d > LEVITATE.RANGE || d < 0.3) continue;
                const ang = dir.angleTo(to.normalize());
                if (ang > LEVITATE.CONE) continue;
                const score = ang * 6 + d * 0.15 - (this.game.magicHand === side ? 0.3 : 0);
                if (!best || score < best.score) best = { ...c, side, score, d };
            }
        }
        if (!best) return '🪶 Направьте руку на предмет (меч, топор, ледяной шар) не дальше 10 м и скажите «Вингардиум Левиоса»';
        const s = {
            kind: best.kind,
            obj: best.obj,
            side: best.side,
            hold: Math.min(LEVITATE.MAX_HOLD, Math.max(LEVITATE.MIN_HOLD, best.d)),
            target: best.pos.clone(),
            age: 0,
            history: [],
        };
        // The wrist steers the object's rotation from now on
        s.handQ0 = this._handQuat(s.side, new THREE.Quaternion());
        s.objQ0 = (best.kind === 'weapon' ? best.obj.quaternion : best.obj.mesh.quaternion).clone();
        if (s.kind === 'weapon') {
            const w = s.obj;
            w.hover = null;
            w.attach({ levitate: true, side: null });
            if (this.game.sync) this.game.sync._localGrab(w, 'levitate');
        } else {
            const b = s.obj;
            this.game.water.resting.splice(this.game.water.resting.indexOf(b), 1);
            this.game.collision.removeBox(b.boxId);
            b.vel = new THREE.Vector3();
        }
        this.state = s;
        this._sparkle(best.pos, 20);
        if (this.game.sound) this.game.sound.playBombardoCast?.();
        return null;
    }

    update(dt) {
        this._t += dt;
        const s = this.state;
        if (!s) return;
        const ch = this.game.character;
        s.age += dt;
        if (s.kind === 'weapon' && (s.obj.holder?.levitate !== true || !this.game.weapons.byId.has(s.obj.id))) { this.state = null; return; }
        if (s.attack) { this._updateAttack(s, dt); return; }

        // Where the object should float: in front of the hand, following it slowly
        const hand = ch.getHandWorldPosition(s.side, _v1);
        const dir = ch.getHandDirection(s.side, _v2);
        const want = _v3.copy(hand).addScaledVector(dir, s.hold);
        want.y = Math.max(want.y + 0.3, this.game.collision.surfaceY(want.x, want.z) + 0.6);
        s.target.lerp(want, 1 - Math.exp(-dt * LEVITATE.FOLLOW));

        if (this._jerked(s, ch)) { this.release(false); return; }

        // Rotation follows the wrist: turn / tilt / twist the hand and the object does
        // the same (amplified) — a floating sword can be swung like this
        const turn = this._wristTurn(s, _q1);
        if (s.kind === 'weapon') {
            const w = s.obj;
            w.drive.position.copy(s.target);
            w.drive.quaternion.copy(turn).multiply(s.objQ0);
        } else {
            const b = s.obj;
            _v1.subVectors(s.target, b.pos);
            b.vel.lerp(_v1.multiplyScalar(4), Math.min(1, dt * 6));
            b.pos.addScaledVector(b.vel, dt);
            b.mesh.position.copy(b.pos);
            b.mesh.quaternion.slerp(_q2.copy(turn).multiply(s.objQ0), Math.min(1, dt * 10));
        }
        // Magic sparkles around the floating object
        if (Math.random() < 0.6) {
            const p = s.kind === 'weapon' ? s.obj.position : s.obj.pos;
            this.game.fx.spark(_v1.set(p.x + (Math.random() - 0.5) * 0.8, p.y + (Math.random() - 0.5) * 0.8, p.z + (Math.random() - 0.5) * 0.8), Math.random() < 0.5 ? 0xffe9a8 : 0xc9a8ff, 0.08, _v2.set(0, 0.6, 0), 0.6);
        }
    }

    /**
     * «Атак» while a sword / axe floats: it flies at the nearest living
     * creature (or on, along the hand, if there is none) and sticks into it.
     */
    attack() {
        const s = this.state;
        if (!s || s.kind !== 'weapon') return '🪶 Сначала поднимите меч или топор «Вингардиум Левиоса», потом — «Атак»';
        const g = this.game;
        const w = s.obj;
        let best = null;
        const consider = (pos, target) => {
            const d = pos.distanceTo(w.position);
            if (d < 30 && (!best || d < best.d)) best = { d, pos, target };
        };
        for (const z of g.zombies) if (!z.isDead && !z.isThrall) consider(z.group.position, { kind: 'z', z });
        for (const [id, r] of g.remotes) if (!r.dead) consider(r.position, { kind: 'p', id, r });
        for (const a of g.animals?.list || []) if (!a.dead) consider(a.group.position, { kind: 'a', a });
        const dir = g.character.getHandDirection(s.side, new THREE.Vector3());
        s.attack = { target: best ? best.target : null, dir, t: 0 };
        this._sparkle(w.position, 25);
        return null;
    }

    _updateAttack(s, dt) {
        const g = this.game;
        const w = s.obj;
        const A = s.attack;
        A.t += dt;
        const tp = A.target ? (A.target.kind === 'z' ? A.target.z.group.position : A.target.kind === 'p' ? A.target.r.position : A.target.a.group.position) : null;
        const goal = tp ? _v1.copy(tp).add(_v2.set(0, 0.9, 0)) : _v1.copy(w.position).addScaledVector(A.dir, 30);
        const to = _v2.subVectors(goal, w.position);
        const d = to.length();
        const step = Math.min(d, 22 * dt);
        to.normalize();
        // flies fast (kinematic), the tip first
        w.position.addScaledVector(to, step);
        w.drive.position.copy(w.position);
        w.drive.quaternion.setFromUnitVectors(_v3.set(0, 1, 0), to);
        w.quaternion.copy(w.drive.quaternion);
        w.velocity.copy(to).multiplyScalar(22);
        if (Math.random() < 0.8) this.game.fx.spark(w.position, 0xc9a8ff, 0.08, _v3.copy(to).multiplyScalar(-3), 0.4);
        const dead = A.target && (A.target.kind === 'z' ? A.target.z.isDead : A.target.kind === 'p' ? A.target.r.dead : A.target.a.dead);
        if (A.target && !dead && d < 1.0) {
            // hit: it sticks in
            this.state = null;
            w.drive = null;
            w.holder = null;
            if (g.sync) g.sync._localRelease(w);
            const dmg = (w.type === 'axe' ? 5 : 4) * (w.damageScale || 1);
            if (A.target.kind === 'z') {
                if (g.authority) g.damageZombie(A.target.z, dmg, true, to.clone(), g.localId);
                else g.sync?.sendHit(A.target.z, dmg, to.clone(), true);
                if (!A.target.z.isDead) g.weapons._stick(w, A.target.z, null);
            } else if (A.target.kind === 'p') {
                const r = A.target.r;
                const victim = { group: r.character.group, get isDead() { return r.dead; }, removable: false, playerId: A.target.id };
                g.weapons._stick(w, victim, null);
                g.combat.hitRemote({ id: A.target.id, damageCooldown: 0, group: r.character.group }, Math.round(dmg), !!w.magic);
                g.sync?.impale?.(A.target.id, w.id);
            } else {
                g.animals?.hit(A.target.a, dmg, to.clone(), g.localId);
            }
            g.hud.setVoice('🗡️ Оружие вонзилось!', true);
            return;
        }
        if (A.t > 3 || (!A.target && A.t > 1.6)) this.release(false);
    }

    /** World orientation of the hand (the palm when hands are shown). */
    _handQuat(side, out) {
        const grip = this.game.character.getGripObject(side);
        grip.updateWorldMatrix(true, false);
        return grip.getWorldQuaternion(out);
    }

    /** How the wrist turned since the object was picked up (amplified), as a world rotation. */
    _wristTurn(s, out) {
        const now = this._handQuat(s.side, _q2);
        out.copy(now).multiply(_q3.copy(s.handQ0).invert()); // rotation from then to now
        if (out.w < 0) { out.x = -out.x; out.y = -out.y; out.z = -out.z; out.w = -out.w; }
        const angle = 2 * Math.acos(Math.min(1, out.w));
        if (angle < 1e-4) return out.identity();
        const k = Math.sin(angle / 2);
        _v3.set(out.x / k, out.y / k, out.z / k);
        return out.setFromAxisAngle(_v3, Math.min(Math.PI, angle * LEVITATE.TWIST));
    }

    /** A fast, far movement of the hand relative to the body. */
    _jerked(s, ch) {
        const hand = ch.getHandWorldPosition(s.side, _v1).sub(ch.group.position);
        const now = this._t;
        s.history.push({ t: now, x: hand.x, y: hand.y, z: hand.z });
        while (s.history.length && now - s.history[0].t > LEVITATE.DROP_WINDOW) s.history.shift();
        if (s.age < LEVITATE.GRACE) return false;
        const o = s.history[0];
        return Math.hypot(hand.x - o.x, hand.y - o.y, hand.z - o.z) > LEVITATE.DROP_DISTANCE;
    }

    /** Let go. gentle = set it down softly, otherwise it flies on with its speed. */
    release(gentle) {
        const s = this.state;
        if (!s) return;
        this.state = null;
        if (s.kind === 'weapon') {
            const w = s.obj;
            if (gentle) w.velocity.multiplyScalar(0.2);
            w.release();
            if (this.game.sync) this.game.sync._localRelease(w);
        } else {
            const b = s.obj;
            const vel = gentle ? new THREE.Vector3() : b.vel.clone().multiplyScalar(1.5);
            this.game.scene.remove(b.mesh);
            this.game.water._spawnFalling({ pos: b.pos.clone(), vel, r: b.r, frozen: true, local: true, mat: b.mesh.material });
        }
    }

    _sparkle(p, n) {
        for (let i = 0; i < n; i++) {
            this.game.fx.spark(p, Math.random() < 0.5 ? 0xffe9a8 : 0xc9a8ff, 0.1, _v1.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.7);
        }
    }

    /** The levitated weapon for the multiplayer pose message. */
    heldWeapon() {
        return this.state && this.state.kind === 'weapon' ? this.state.obj : null;
    }
}
