/**
 * Weapons.js — how the player's hands interact with physical weapons.
 *
 * Realistic grabbing:
 *   - the palm must be at the handle and the fingers must CLOSE around it
 *     (an already-closed fist that bumps into the sword does not glue to it),
 *   - the sword is held at the exact point of the handle you grabbed, the
 *     handle settles across the palm and the fingers wrap around it,
 *   - you keep the direction you grabbed it in (blade up / down / sideways),
 *   - opening the hand drops/throws it with its real velocity and spin.
 *   - short tracking drop-outs never make you drop the weapon.
 *
 * Combat: a hit is a real contact between the blade and a zombie's body while
 * the blade moves fast enough; damage and knockback come from the blade speed
 * and direction.
 */

import * as THREE from 'three';
import { Weapon } from '../entities/Weapon.js';
import { segmentSegmentDistSq, clamp } from '../core/math.js';

const GRAB_RADIUS = 0.55; // palm-to-handle distance that allows a grab
const CLOSE_CURL = 0.55; // fingers closed
const OPEN_CURL = 0.35; // fingers open
const RELEASE_CURL = 0.28;
const RELEASE_HOLD_MS = 160; // fingers must stay open this long to drop (no accidental drops)
const CLOSE_WINDOW_MS = 900; // hand must have been open this recently to count as "closing on" the handle
const SETTLE_TIME = 0.18; // seconds for the handle to settle into the grip
const MIN_SWING_SPEED = 3.2; // m/s at the tip to count as a strike

const _P = new THREE.Vector3();
const _X = new THREE.Vector3();
const _Y = new THREE.Vector3();
const _Z = new THREE.Vector3();
const _G = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qPalm = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export class WeaponSystem {
    /**
     * @param {object} game  needs: scene, renderer, world (collision), character, now()
     */
    constructor(game) {
        this.game = game;
        this.weapons = [];
        this.byId = new Map();
        this.hands = {
            left: this._handState(),
            right: this._handState(),
        };
        this.onHit = null; // (zombie, damage, dir, isWeapon, weapon) => void
        this.onGrab = null; // (weapon, side) => void
        this.onRelease = null; // (weapon, side) => void
    }

    _handState() {
        return { held: null, lastOpen: 0, openSince: 0, rel0: null, relC: null, settle: 0, tipPrev: new THREE.Vector3(), basePrev: new THREE.Vector3(), hasPrev: false };
    }

    spawn(type, position, quaternion, id) {
        const w = new Weapon(this.game.scene, type, { position, quaternion, renderer: this.game.renderer, id, headless: !!this.game.headless });
        this.weapons.push(w);
        this.byId.set(w.id, w);
        return w;
    }

    /** Put a weapon lying flat on a surface at `centre` with yaw `yaw`. */
    spawnLying(type, x, surfaceY, z, yaw, id) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw, 'XYZ'));
        const w = this.spawn(type, new THREE.Vector3(x, surfaceY + 0.12, z), q, id);
        // Let it settle physically for a moment, then it sleeps.
        w.wake();
        return w;
    }

    /** Chest reward: rises out of the chest and floats until grabbed. */
    spawnHovering(type, pos, id) {
        const q = new THREE.Quaternion();
        const w = this.spawn(type, pos.clone(), q, id);
        w.sleeping = true;
        w.hover = { base: pos.clone(), t: 0, rise: 1.6 };
        w.position.y -= w.hover.rise;
        return w;
    }

    remove(w) {
        const i = this.weapons.indexOf(w);
        if (i >= 0) this.weapons.splice(i, 1);
        this.byId.delete(w.id);
        w.dispose();
    }

    // ------------------------------------------------------------------ frame
    update(dt, { allowGrab = true } = {}) {
        const now = this.game.now();
        const ch = this.game.character;
        const collision = this.game.world.collision;

        // Hover animation for chest rewards
        for (const w of this.weapons) {
            if (!w.hover || w.holder || w.remoteTarget) continue;
            const h = w.hover;
            h.t += dt;
            const rise = Math.min(1, h.t / 1.0);
            const ease = 1 - Math.pow(1 - rise, 3);
            w.position.set(h.base.x, h.base.y - h.rise * (1 - ease) + Math.sin(h.t * 2) * 0.08 * ease, h.base.z);
            w.quaternion.setFromAxisAngle(_a.set(0, 1, 0), h.t * 0.8);
            w.mesh.updateMatrixWorld(true);
        }

        if (ch) {
            for (const side of ['left', 'right']) this._updateHand(side, dt, now, ch, allowGrab);
        }

        for (const w of this.weapons) {
            if (w.hover && !w.holder) continue;
            w.step(dt, collision);
        }

        // Hand is blocked by what the blade hits (no clipping through walls)
        if (ch) {
            for (const side of ['left', 'right']) {
                const hs = this.hands[side];
                if (!hs.held || hs.held.contactHard < 0.02) continue;
                this._pushHandBack(side, hs.held, ch);
            }
        }
    }

    _updateHand(side, dt, now, ch, allowGrab) {
        const hs = this.hands[side];
        const hand = ch.getActiveHands()[side];
        const visible = hand && hand.group.visible;
        const curl = visible ? ch.getGripCurl(side) : (hs.held ? 1 : 0);
        if (curl < OPEN_CURL) hs.lastOpen = now;
        if (curl < RELEASE_CURL) { if (!hs.openSince) hs.openSince = now; } else hs.openSince = 0;

        if (hs.held) {
            const w = hs.held;
            // Weapon got taken by the network (another player / host reset)
            if (w.holder == null || w.holder.side !== side) { this._forget(side, hand); return; }
            if (hs.openSince && now - hs.openSince > RELEASE_HOLD_MS) {
                this.release(side);
                return;
            }
            this._driveHeld(side, dt, ch);
            return;
        }

        if (!allowGrab || !visible) return;
        const closing = curl > CLOSE_CURL && now - hs.lastOpen < CLOSE_WINDOW_MS;
        if (!closing) return;

        this._palmFrame(ch, side);
        let best = null, bestD = GRAB_RADIUS, bestT = 0.5;
        const owners = this.game.sync ? this.game.sync.weaponOwners : null;
        const me = this.game.localId;
        for (const w of this.weapons) {
            if (w.holder) continue;
            // In multiplayer a weapon in someone else's hand can't be taken.
            if (owners && owners.has(w.id) && owners.get(w.id) !== me) continue;
            if (w.position.distanceToSquared(_G) > 16) continue;
            w.getHandleSegment(_a, _b);
            _c.subVectors(_b, _a);
            const len2 = _c.lengthSq();
            let t = len2 > 0 ? _d.subVectors(_G, _a).dot(_c) / len2 : 0;
            t = clamp(t, 0, 1);
            _d.copy(_a).addScaledVector(_c, t);
            const dist = _d.distanceTo(_G);
            if (dist < bestD) { bestD = dist; best = w; bestT = t; }
        }
        if (best) this.grab(best, side, bestT);
    }

    /** Orthonormal palm frame (X across the palm, Y towards the fingers, Z back of hand). Writes _P,_X,_Y,_Z,_G,_qPalm. */
    _palmFrame(ch, side) {
        const grip = ch.getGripObject(side);
        grip.updateMatrixWorld(true);
        const e = grip.matrixWorld.elements;
        _P.set(e[12], e[13], e[14]);
        if (grip.name === 'palm') {
            _Y.set(e[4], e[5], e[6]).normalize();
            _Z.set(e[8], e[9], e[10]).normalize();
            _X.crossVectors(_Y, _Z).normalize();
            _Z.crossVectors(_X, _Y).normalize();
            // Handle sits in the closed fingers: towards the finger base, on the palm side.
            _G.copy(_P).addScaledVector(_Y, 0.13).addScaledVector(_Z, -0.135);
        } else {
            // Wrist anchor (hands hidden): forearm points along local +Z.
            _Y.set(e[8], e[9], e[10]).normalize();
            _X.set(e[0], e[1], e[2]).normalize();
            _Z.crossVectors(_X, _Y).normalize();
            _X.crossVectors(_Y, _Z).normalize();
            _G.copy(_P).addScaledVector(_Y, 0.25);
        }
        _m.makeBasis(_X, _Y, _Z);
        _qPalm.setFromRotationMatrix(_m);
    }

    grab(w, side, t = 0.5) {
        const ch = this.game.character;
        const hs = this.hands[side];
        if (hs.held) return false;
        this._palmFrame(ch, side);

        // Where along the handle: keep the grabbed point but never on the guard/pommel.
        const spec = w.spec;
        const tt = clamp(t, 0.22, 0.78);
        const handleY = spec.handle[0] + (spec.handle[1] - spec.handle[0]) * tt;

        // Current orientation of the weapon in the palm frame
        const qRel0 = _qPalm.clone().invert().multiply(w.quaternion);
        const wY = _a.set(0, 1, 0).applyQuaternion(w.quaternion);
        const wX = _b.set(1, 0, 0).applyQuaternion(w.quaternion);
        // Blade direction across the palm: keep how it was grabbed; default out of the thumb side.
        let s = Math.sign(wY.dot(_X));
        if (Math.abs(wY.dot(_X)) < 0.3) {
            const thumb = ch.getActiveHands()[side].fingerMeshes?.thumb?.[0]?.pivot;
            if (thumb) {
                thumb.getWorldPosition(_c);
                s = Math.sign(_c.sub(_P).dot(_X)) || 1;
            } else s = 1;
        }
        let e = Math.sign(wX.dot(_Y)) || 1;
        // Canonical grip: blade axis = s*X (across the palm), edge = e*Y (towards the knuckles)
        const axY = _X.clone().multiplyScalar(s);
        const axX = _Y.clone().multiplyScalar(e);
        const axZ = new THREE.Vector3().crossVectors(axX, axY);
        const qWorldC = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axX, axY, axZ));
        const qRelC = _qPalm.clone().invert().multiply(qWorldC);

        // Offsets (COM relative to the grip point) in palm space
        const handleLocal = new THREE.Vector3(0, (handleY - spec.com[1]) * w.S, 0);
        const pRelC = handleLocal.clone().applyQuaternion(qWorldC).negate().add(_G).sub(_P).applyQuaternion(_qPalm.clone().invert());
        const pRel0 = w.position.clone().sub(_P).applyQuaternion(_qPalm.clone().invert());

        hs.held = w;
        hs.rel0 = { p: pRel0, q: qRel0 };
        hs.relC = { p: pRelC, q: qRelC };
        hs.settle = 0;
        hs.hasPrev = false;
        hs.openSince = 0;
        w.hover = null;
        w.clearRemote();
        w.attach({ playerId: this.game.localId || 'local', side });
        const hand = ch.getActiveHands()[side];
        if (hand && hand.setGrip) hand.setGrip(0.62);
        if (this.onGrab) this.onGrab(w, side);
        return true;
    }

    _driveHeld(side, dt, ch) {
        const hs = this.hands[side];
        const w = hs.held;
        this._palmFrame(ch, side);
        hs.settle = Math.min(1, hs.settle + dt / SETTLE_TIME);
        const k = hs.settle * hs.settle * (3 - 2 * hs.settle);
        _a.copy(hs.rel0.p).lerp(hs.relC.p, k);
        _q.copy(hs.rel0.q).slerp(hs.relC.q, k);
        w.drive.position.copy(_a).applyQuaternion(_qPalm).add(_P);
        w.drive.quaternion.copy(_qPalm).multiply(_q);
        // First frames: snap the body to the settling target so it doesn't swing from far away
        if (hs.settle < 0.35) {
            w.position.lerp(w.drive.position, 0.5);
            w.quaternion.slerp(w.drive.quaternion, 0.5);
        }
    }

    _pushHandBack(side, w, ch) {
        // Push the visible hand by how far the blade was stopped.
        const hand = ch.getActiveHands()[side];
        if (!hand || !hand.group.visible || !hand.group.parent) return;
        _a.subVectors(w.position, w.drive.position);
        if (_a.lengthSq() < 0.0004) return;
        _a.clampLength(0, 0.45);
        hand.group.parent.getWorldQuaternion(_q).invert();
        _a.applyQuaternion(_q);
        hand.group.position.addScaledVector(_a, 0.8);
    }

    release(side) {
        const hs = this.hands[side];
        const w = hs.held;
        if (!w) return;
        const hand = this.game.character?.getActiveHands()[side];
        this._forget(side, hand);
        w.release();
        if (this.onRelease) this.onRelease(w, side);
    }

    _forget(side, hand) {
        const hs = this.hands[side];
        hs.held = null;
        hs.rel0 = hs.relC = null;
        if (hand && hand.setGrip) hand.setGrip(null);
    }

    releaseAll() {
        this.release('left');
        this.release('right');
    }

    heldWeapons() {
        const out = [];
        if (this.hands.left.held) out.push(this.hands.left);
        if (this.hands.right.held) out.push(this.hands.right);
        return out;
    }

    hasWeapon() {
        return !!(this.hands.left.held || this.hands.right.held);
    }

    // ----------------------------------------------------------------- combat
    /**
     * Blade vs zombie hits for the local player's held weapons.
     * @param {Zombie[]} zombies
     */
    checkHits(zombies, dt) {
        for (const side of ['left', 'right']) {
            const hs = this.hands[side];
            const w = hs.held;
            if (!w) continue;
            const [base, tip] = w.getBladeSegment(_a, _b);
            const tipVel = w.pointVelocity(tip, _c);
            const speed = tipVel.length();
            if (!hs.hasPrev) {
                hs.basePrev.copy(base); hs.tipPrev.copy(tip); hs.hasPrev = true;
                continue;
            }
            if (speed >= MIN_SWING_SPEED) {
                // Swept test: current blade and the blade half-way through the frame
                const midBase = _d.copy(base).add(hs.basePrev).multiplyScalar(0.5);
                const midTip = new THREE.Vector3().copy(tip).add(hs.tipPrev).multiplyScalar(0.5);
                for (const z of zombies) {
                    if (z.isDead || z.damageCooldown > 0) continue;
                    const zp = z.group.position;
                    if (Math.abs(zp.x - tip.x) > 7 || Math.abs(zp.z - tip.z) > 7) continue;
                    if (now(this) - (w.lastHitTime || 0) < 120) continue;
                    const feet = zp.y - 0.6, head = zp.y + 2.9;
                    const zb = [zp.x, feet, zp.z], zt = [zp.x, head, zp.z];
                    const r = 0.8 + 0.12;
                    const d1 = segmentSegmentDistSq([base.x, base.y, base.z], [tip.x, tip.y, tip.z], zb, zt);
                    const d2 = segmentSegmentDistSq([midBase.x, midBase.y, midBase.z], [midTip.x, midTip.y, midTip.z], zb, zt);
                    if (Math.min(d1, d2) > r * r) continue;
                    const factor = clamp(speed / 9, 0.7, 1.6);
                    const damage = Math.max(1, Math.round(w.spec.damage * factor));
                    const dir = tipVel.clone().setY(0);
                    if (dir.lengthSq() < 1e-4) dir.subVectors(zp, this.game.character.group.position).setY(0);
                    dir.normalize();
                    w.lastHitTime = now(this);
                    // The blade loses energy in the hit
                    w.velocity.multiplyScalar(0.4);
                    w.angularVelocity.multiplyScalar(0.4);
                    if (this.onHit) this.onHit(z, damage, dir, true, w);
                }
            }
            hs.basePrev.copy(base);
            hs.tipPrev.copy(tip);
        }
    }

    clear() {
        for (const w of this.weapons) w.dispose();
        this.weapons.length = 0;
        this.byId.clear();
        for (const side of ['left', 'right']) {
            this.hands[side] = this._handState();
        }
    }
}

const now = (sys) => sys.game.now();
