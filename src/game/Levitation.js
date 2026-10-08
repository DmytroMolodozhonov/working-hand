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
    FOLLOW: 3.5, // how fast the float point follows the hand (1/s)
    DROP_DISTANCE: 0.75, // m of hand movement within DROP_WINDOW = a jerk
    DROP_WINDOW: 0.25,
    GRACE: 0.8,
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

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

        // Where the object should float: in front of the hand, following it slowly
        const hand = ch.getHandWorldPosition(s.side, _v1);
        const dir = ch.getHandDirection(s.side, _v2);
        const want = _v3.copy(hand).addScaledVector(dir, s.hold);
        want.y = Math.max(want.y + 0.3, this.game.collision.surfaceY(want.x, want.z) + 0.6);
        s.target.lerp(want, 1 - Math.exp(-dt * LEVITATE.FOLLOW));

        if (this._jerked(s, ch)) { this.release(false); return; }

        if (s.kind === 'weapon') {
            const w = s.obj;
            w.drive.position.copy(s.target);
            // a slow magical spin
            w.drive.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(_v1.set(0, 1, 0), dt * 0.8));
        } else {
            const b = s.obj;
            _v1.subVectors(s.target, b.pos);
            b.vel.lerp(_v1.multiplyScalar(4), Math.min(1, dt * 6));
            b.pos.addScaledVector(b.vel, dt);
            b.mesh.position.copy(b.pos);
            b.mesh.rotation.y += dt * 0.6;
        }
        // Magic sparkles around the floating object
        if (Math.random() < 0.6) {
            const p = s.kind === 'weapon' ? s.obj.position : s.obj.pos;
            this.game.fx.spark(_v1.set(p.x + (Math.random() - 0.5) * 0.8, p.y + (Math.random() - 0.5) * 0.8, p.z + (Math.random() - 0.5) * 0.8), Math.random() < 0.5 ? 0xffe9a8 : 0xc9a8ff, 0.08, _v2.set(0, 0.6, 0), 0.6);
        }
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
