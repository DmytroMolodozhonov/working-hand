/**
 * Zombie.js — enemy AI and visuals.
 *
 * Same look, speeds, damage rules and animations as the original. Rewritten
 * for performance:
 *   - geometries are shared by all zombies (only small per-zombie materials for
 *     the red hit flash / ice tint),
 *   - sand / ice-shatter / flying limbs / blood go through pooled FX systems
 *     instead of hundreds of meshes with their own requestAnimationFrame loops,
 *   - corpses are cleaned up after a while (endless waves no longer slow down),
 *   - zero allocations in update().
 */

import * as THREE from 'three';
import { slowFactor, tickSlow } from '../game/Slow.js';

let SHARED = null;
function shared() {
    if (SHARED) return SHARED;
    SHARED = {
        head: new THREE.BoxGeometry(1.2, 1.2, 1.2),
        eye: new THREE.BoxGeometry(0.2, 0.2, 0.1),
        arm: new THREE.BoxGeometry(0.4, 1.2, 0.4),
        body: new THREE.BoxGeometry(1.2, 1.5, 0.8),
        leg: new THREE.BoxGeometry(0.5, 1.2, 0.5),
        crystal: new THREE.ConeGeometry(0.1, 0.3, 4),
        eyeMat: new THREE.MeshBasicMaterial({ color: 0xFF0000 }),
        crystalMat: new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.8 }),
        crystalMatSolid: new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 1.0 }),
    };
    return SHARED;
}

const SKIN = 0x6DA36D, SHIRT = 0x5D4037, PANTS = 0x212121;
const ICE = new THREE.Color(0xaaddff);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();

export const ZOMBIE_GROUND_OFFSET = 1.0; // the origin, 1 m over the ground under its feet
/**
 * How a zombie walks and strikes (the author: «slow, stubborn; it comes up close, turns to you and hits»).
 * Its face (the red eyes, the arms held out) looks along its local +Z: yaw = atan2(dx, dz).
 */
export const ZOMBIE = {
    SPEED: 2.1, // m/s: a slow trudge (a hero walks 2.5, runs 9.75 — walking away it falls behind)
    STOP: 1.35, // m between its middle and the target's: it stands here, its hands on you
    REACH: 2.0, // m: as far as its blow reaches (the arms 1.2 m out in front, the target's body)
    FACE: 0.35, // rad: turned at least this close to the target — only then it strikes
    TURN: 4.0, // rad/s: how fast it turns round
    STRIDE: 1.6, // m walked in one full cycle of the legs (two steps)
    SWING: 0.75, // s: one blow — the arms go up, come down
    HIT_AT: 0.62, // the part of the swing when the arms come down on the target
    EVERY: 1.3, // s between two blows
};
const HIP = 0.3, LEG_H = 0.6; // (the legs hang from the hips, inside the body: the feet come down to the ground)
const SHOULDER_Y = 1.4, SHOULDER_Z = -0.1, ARM_H = 0.6;
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const DUMMY_HEALTH = 60; // the training dummy (a plain zombie has 5): a head cut (999) still ends it
export const CORPSE_LIFETIME = 25;

export class Zombie {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Vector3} startPos
     * @param {number|string} id
     * @param {object} ctx  {fx, sound}
     */
    constructor(scene, startPos, id, ctx = {}) {
        this.scene = scene;
        this.id = id;
        this.ctx = ctx;
        this.group = new THREE.Group();
        this.group.position.set(startPos.x, 0.5, startPos.z);
        this.group.scale.set(1, 1.12, 1);
        this.sizeK = 1; // (the training dummy is bigger: setDummy)
        this.gOff = ZOMBIE_GROUND_OFFSET; // origin height over the feet's ground

        this.baseSpeed = ZOMBIE.SPEED;
        this.speed = this.baseSpeed;
        this.health = 5;
        this.isDead = false;
        this.isDying = false;
        this.velocity = new THREE.Vector3();
        this.vy = 0; // vertical speed (thrown by explosions, stepping off ledges)
        this.rotVelocity = new THREE.Vector3();
        this.bodyParts = [];
        this.materials = [];
        this.createBody();
        scene.add(this.group);

        this.damageCooldown = 0;
        this.hitFlashTimer = 0;
        this.walkCycle = 0;
        this.isSleeping = false;
        this.isFrozen = false;
        this.frozenTimer = 0;
        this.freezeProgress = 0;
        this.isStunned = false;
        this.stunTimer = 0;
        this.iceCrystals = new THREE.Group();
        this.group.add(this.iceCrystals);
        this.lastAttackTime = 0;
        this.isAttacking = false;
        this.struck = false; // (host) the arms have just come down: Game sees whether they reached somebody
        this.yaw = 0; // where it faces (its rotation.y)
        this.burning = 0; // s left smoking in the sunlight (shown on every computer)
        this.attackAnimProgress = 0;
        this.animVariation = Math.random() * 10;
        this.lastDistSq = Infinity;
        this.corpseTimer = 0;
        this.removable = false;
        this._skipAccum = 0;
        this.remote = false; // true on multiplayer clients (host simulates)
        this.limbMask = 0; // bit 0 head, 1 lArm, 2 rArm, 3 lLeg, 4 rLeg (severed)
    }

    _mat(color) {
        const m = new THREE.MeshLambertMaterial({ color });
        m.userData.origColor = color;
        this.materials.push(m);
        return m;
    }

    createBody() {
        const g = shared();
        this.head = new THREE.Mesh(g.head, this._mat(SKIN));
        this.head.position.y = 2.1;
        this.group.add(this.head);
        this.bodyParts.push(this.head);

        const leftEye = new THREE.Mesh(g.eye, g.eyeMat);
        leftEye.position.set(-0.25, 0.1, 0.6);
        this.head.add(leftEye);
        const rightEye = new THREE.Mesh(g.eye, g.eyeMat);
        rightEye.position.set(0.25, 0.1, 0.6);
        this.head.add(rightEye);
        this.eyes = [leftEye, rightEye];

        const shirt = this._mat(SHIRT);
        this.leftArm = new THREE.Mesh(g.arm, shirt);
        this.leftArm.position.set(-0.7, 1.4, 0.5);
        this.leftArm.rotation.x = -Math.PI / 2;
        this.group.add(this.leftArm);
        this.bodyParts.push(this.leftArm);
        this.rightArm = new THREE.Mesh(g.arm, shirt);
        this.rightArm.position.set(0.7, 1.4, 0.5);
        this.rightArm.rotation.x = -Math.PI / 2;
        this.group.add(this.rightArm);
        this.bodyParts.push(this.rightArm);

        this.body = new THREE.Mesh(g.body, shirt);
        this.body.position.y = 0.75;
        this.group.add(this.body);
        this.bodyParts.push(this.body);

        const pants = this._mat(PANTS);
        this.leftLeg = new THREE.Mesh(g.leg, pants);
        this.leftLeg.position.set(-0.3, 0, 0);
        this.group.add(this.leftLeg);
        this.bodyParts.push(this.leftLeg);
        this.rightLeg = new THREE.Mesh(g.leg, pants);
        this.rightLeg.position.set(0.3, 0, 0);
        this.group.add(this.rightLeg);
        this.bodyParts.push(this.rightLeg);
        this._setLegs(0);
        this._setArm(this.leftArm, -Math.PI / 2);
        this._setArm(this.rightArm, -Math.PI / 2);
    }

    /**
     * A leg turned at its hip (not round its middle — that slid the feet like oars, «it floats»):
     * its top stays in the body, its foot comes down to the ground (local y −0.9 → 1 m under the origin).
     */
    _setLeg(leg, a) {
        leg.rotation.x = a;
        leg.position.y = HIP - LEG_H * Math.cos(a);
        leg.position.z = -LEG_H * Math.sin(a);
    }

    _setLegs(swing) { this._setLeg(this.leftLeg, swing); this._setLeg(this.rightLeg, -swing); }

    /** An arm turned at its shoulder (−π/2: held straight out in front). */
    _setArm(arm, a) {
        arm.rotation.x = a;
        arm.position.y = SHOULDER_Y - ARM_H * Math.cos(a);
        arm.position.z = SHOULDER_Z - ARM_H * Math.sin(a);
    }

    /** Legs and arms back to standing, slowly (k: what is left of the swing this frame). */
    _relax(k) {
        this._setLegs(this.leftLeg.rotation.x * k);
        if (!this.isAttacking) {
            this._setArm(this.leftArm, -Math.PI / 2 + (this.leftArm.rotation.x + Math.PI / 2) * k);
            this._setArm(this.rightArm, -Math.PI / 2 + (this.rightArm.rotation.x + Math.PI / 2) * k);
        }
        this.body.rotation.z *= k; this.head.rotation.z *= k;
    }

    /** Turns towards a yaw, at most TURN rad/s. → how far it still is from it (rad). */
    turnTo(yaw, dt) {
        this.yaw = this.group.rotation.y; // (what others turned it to — a blow, «Левиоса» — counts too)
        const d = wrapA(yaw - this.yaw), m = ZOMBIE.TURN * dt;
        this.yaw = wrapA(this.yaw + Math.max(-m, Math.min(m, d)));
        this.group.rotation.y = this.yaw;
        return Math.abs(wrapA(yaw - this.yaw));
    }

    /** Can its blow reach a body at p (horizontally within REACH, not far above/below, its face turned to it)? */
    reaches(p, extra = 0) {
        const pos = this.group.position;
        const feet = pos.y - this.gOff;
        if (p.y < feet - 1.2 || p.y > feet + 3.2) return false; // (p: the target's middle/eyes/feet — a body standing by it)
        return Math.hypot(p.x - pos.x, p.z - pos.z) < ZOMBIE.REACH * this.sizeK + extra && this.faces(p);
    }

    /** Is it turned to a point (its face to it, within FACE)? */
    faces(p) {
        const pos = this.group.position;
        return Math.abs(wrapA(Math.atan2(p.x - pos.x, p.z - pos.z) - this.yaw)) < ZOMBIE.FACE;
    }

    setSleeping(sleeping) { this.isSleeping = sleeping; }

    _setColor(hex) {
        for (const m of this.materials) m.color.setHex(hex);
    }

    _restoreColor() {
        for (const m of this.materials) {
            _c.setHex(m.userData.origColor);
            if (this.freezeProgress > 0) _c.lerp(ICE, Math.min(1, this.freezeProgress));
            m.color.copy(_c);
        }
    }

    /**
     * @param {number} dt
     * @param {THREE.Vector3|null} targetPos  nearest player position
     * @param {THREE.Camera|null} camera
     * @param {CollisionWorld|null} collision
     */
    update(dt, targetPos, camera, collision) {
        const pos = this.group.position;
        // (the per-frame slowing down of a blow's push and sway, as it was at 60 frames a second — the same on a
        // slow computer: at 20 frames a blow used to tip a zombie over flat, out of a blade's reach for long)
        const decay = (f) => f ** (dt * 60);
        this.lastDistSq = targetPos ? pos.distanceToSquared(targetPos) : Infinity;
        const ground = collision ? (collision.groundAt ? collision.groundAt(pos.x, pos.z, pos.y - 1.0 + 1.1) : collision.groundY(pos.x, pos.z)) : -0.5;

        if (this.damageCooldown > 0) this.damageCooldown -= dt;
        tickSlow(this, dt); // («Даст»: slowed for a while)
        this._spinHalo(dt);
        // Blown by «Вайнд»: slides away, slowing down (also when stunned or frozen)
        if (this.windVel && !this.isDead && !this.isDying) {
            pos.addScaledVector(this.windVel, dt);
            this.windVel.multiplyScalar(Math.max(0, 1 - 1.8 * dt));
            if (this.windVel.lengthSq() < 0.05) this.windVel = null;
            // carried by the wind: can't walk until it calms down
            else if (this.windVel.lengthSq() > 2.25) { this._settleY(dt, ground); return; }
        }
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= dt;
            if (this.hitFlashTimer <= 0) this._restoreColor();
        }

        if (this.isDying) {
            this.deathAnimTimer -= dt;
            const targetRot = -Math.PI / 2;
            this.group.rotation.x += (targetRot - this.group.rotation.x) * 5 * dt;
            const restY = ground + 0.8 * this.sizeK;
            if (pos.y > restY) {
                this.vy -= 25 * dt;
                pos.y = Math.max(restY, pos.y + Math.min(this.vy, -2) * dt);
            } else { pos.y = restY; this.vy = 0; }
            pos.addScaledVector(this.velocity, dt);
            this.velocity.multiplyScalar(decay(0.95));
            if (this.deathAnimTimer <= 0) {
                this.isDying = false;
                this.group.rotation.x = targetRot;
                pos.y = restY;
            }
            return;
        }

        if (this.isDead) {
            // Corpse: lie for a while, then sink into the ground and get removed.
            if (!this.group.visible) { this.removable = this.corpseTimer > 6; this.corpseTimer += dt; return; }
            this.corpseTimer += dt;
            // (the ground under it broken — a blast, a ruin: the body falls down to what is left)
            if (this.corpseTimer <= CORPSE_LIFETIME) {
                const restY = ground + 0.8 * this.sizeK;
                if (pos.y > restY + 0.05) { this.vy = (this.vy || 0) - 25 * dt; pos.y = Math.max(restY, pos.y + this.vy * dt); } else this.vy = 0;
            }
            if (this.corpseTimer > CORPSE_LIFETIME) {
                pos.y -= dt * 0.6;
                if (this.corpseTimer > CORPSE_LIFETIME + 4) this.removable = true;
            }
            return;
        }

        if (this.isFrozen) {
            this.frozenTimer -= dt;
            if (this.frozenTimer <= 0) this.unfreeze();
            return;
        }
        // «Остолбеней»: stands still
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            if (pos.y > ground + this.gOff + 0.01) { this.vy = (this.vy || 0) - 25 * dt; pos.y = Math.max(ground + this.gOff, pos.y + this.vy * dt); }
            return;
        }

        if (this.isSleeping) {
            if (targetPos && Math.sqrt(this.lastDistSq) < 15) this.isSleeping = false;
            else return;
        }

        // Far zombies think less often (original optimisation, now time-correct)
        if (this.lastDistSq > 1600) {
            this._skipAccum += dt;
            if (this._skipAccum < 0.08) return;
            dt = Math.min(0.2, this._skipAccum);
        }
        this._skipAccum = 0;

        if (this.isStunned) {
            this.stunTimer -= dt;
            if (this.stunTimer <= 0) {
                this.isStunned = false;
            } else {
                this.head.rotation.y += dt * 15;
                this.head.rotation.z = Math.sin(performance.now() * 0.01) * 0.3;
                this._relax(decay(0.9));
                pos.addScaledVector(this.velocity, dt);
                this.velocity.multiplyScalar(decay(0.9));
                this._settleY(dt, ground);
                return;
            }
        }

        pos.addScaledVector(this.velocity, dt);
        this.velocity.multiplyScalar(decay(0.9));
        this._settleY(dt, ground);

        this.group.rotation.z += this.rotVelocity.z * dt;
        this.group.rotation.x += this.rotVelocity.x * dt;
        this.rotVelocity.multiplyScalar(decay(0.9));
        if (this.dummy && !this.isFrozen && this.velocity.lengthSq() < 0.25) this._sway();
        if (this.velocity.lengthSq() < 0.01) {
            this.group.rotation.z *= decay(0.9);
            this.group.rotation.x *= decay(0.9);
            this.head.rotation.x *= decay(0.9);
            this.body.rotation.x *= decay(0.9);
        }

        if (targetPos && this.velocity.lengthSq() < 0.25) {
            _v.subVectors(targetPos, pos);
            _v.y = 0;
            const distance = _v.length();
            const stop = ZOMBIE.STOP * this.sizeK;
            if (Number.isFinite(distance)) {
                const toT = Math.atan2(_v.x, _v.z);
                let walked = 0;
                if (distance > stop && !this.isAttacking) {
                    if (distance > 0.1) _v.divideScalar(distance);
                    const sp = this.speed * slowFactor(this) * (this.pace ?? 1); // (pace: slower when only wandering)
                    // round the others on its way (zombies, people, beasts — Crowd.js; the host's game sets it)
                    const st = this.steer ? this.steer(this, pos, _v.x, _v.z, distance - stop, sp, dt) : _v;
                    if (st) {
                        // it faces where it goes, and turns before it walks: never sideways, never backwards
                        const off = this.turnTo(Math.atan2(st.x, st.z), dt);
                        const go = sp * dt * Math.max(0, Math.cos(off)) * (off < 0.6 ? 1 : 0);
                        const step = Math.min(go, Math.max(0, distance - stop));
                        pos.x += st.x * step; pos.z += st.z * step;
                        walked = step;
                    } else this.turnTo(toT, dt); // (waiting for room: it looks at its prey)
                    this.group.rotation.x = 0;
                    this.group.rotation.z = 0;
                } else this.turnTo(toT, dt); // (close: it turns its face to the target)
                if (walked > 1e-4) {
                    // the legs step with the ground it covers (no sliding)
                    this.walkCycle += (walked / ZOMBIE.STRIDE) * Math.PI * 2;
                    this._animateWalk();
                } else this._relax(decay(0.85));
            }
        }

        // Hide the head when it would clip through the FPV camera
        if (camera) {
            this.head.getWorldPosition(_v2);
            const close = _v2.distanceTo(camera.position) < 0.7;
            if (close && this.head.visible) { this.head.visible = false; this.wasHeadHiddenByCamera = true; }
            else if (!close && this.wasHeadHiddenByCamera) { this.head.visible = !(this.limbMask & 1); this.wasHeadHiddenByCamera = false; }
        }

        if (this.isAttacking) this._animateAttack(dt);
        if (this.burning > 0) this._smoke(dt);
    }

    /** Makes this zombie the training dummy: 25% bigger — model, body parts, hits and collision all follow the one scale. */
    setDummy() {
        if (this.dummy) return;
        this.dummy = true;
        this.sizeK = 1.25;
        // it is there to practise on: blows don't fell it at once (two of them did — and then there was
        // nothing left to cut); a blade still takes its arms, legs and head, the head ends it
        this.health = DUMMY_HEALTH;
        this.group.scale.set(1.25, 1.12 * 1.25, 1.25);
        // the feet stay on the ground: the origin rises with the legs' length (the feet: local y −0.9)
        this.gOff = ZOMBIE_GROUND_OFFSET + 0.9 * 1.12 * 0.25;
        this.group.position.y += this.gOff - ZOMBIE_GROUND_OFFSET;
    }

    /** Training dummy: a slight sway so that it looks alive. */
    _sway() {
        const t = performance.now() * 0.001 + this.animVariation;
        this.head.rotation.y = Math.sin(t * 0.7) * 0.12;
        this._setArm(this.leftArm, -Math.PI / 2 + Math.sin(t * 0.9) * 0.06);
        this._setArm(this.rightArm, -Math.PI / 2 + Math.cos(t * 0.8) * 0.06);
        this._setLegs(this.leftLeg.rotation.x * 0.9);
    }

    /** Stand on the ground, or fly/fall with gravity when thrown or stepping off a ledge. */
    _settleY(dt, ground) {
        const pos = this.group.position;
        const floor = ground + this.gOff;
        if (this.vy !== 0 || pos.y > floor + 0.05) {
            this.vy -= 25 * dt;
            pos.y += this.vy * dt;
            if (pos.y <= floor) { pos.y = floor; this.vy = 0; }
        } else {
            pos.y = floor;
        }
    }

    /** A heavy, swaying trudge: the legs from the hips, the body rolling from foot to foot, the arms held out. */
    _animateWalk() {
        const c = this.walkCycle + this.animVariation;
        this._setLegs(Math.sin(c) * 0.45);
        this.body.rotation.z = Math.sin(c) * 0.05;
        this.head.rotation.z = Math.sin(c) * 0.08;
        this.head.rotation.y = Math.sin(c * 0.5) * 0.1;
        if (!this.isAttacking) {
            this._setArm(this.leftArm, -Math.PI / 2 + Math.sin(c * 0.8) * 0.12);
            this._setArm(this.rightArm, -Math.PI / 2 + Math.cos(c * 0.8) * 0.12);
        }
    }

    /** The blow: both arms go up over the head, then come down on the target (struck: the moment they land). */
    _animateAttack(dt) {
        const p0 = this.attackAnimProgress;
        const p = this.attackAnimProgress = p0 + dt / ZOMBIE.SWING;
        if (p0 < ZOMBIE.HIT_AT && p >= ZOMBIE.HIT_AT) this.struck = true;
        let a; // the arms' angle: −π/2 straight out; less — up; more — down
        if (p < ZOMBIE.HIT_AT) a = -Math.PI / 2 - 1.0 * Math.sin((p / ZOMBIE.HIT_AT) * Math.PI / 2);
        else { const q = (p - ZOMBIE.HIT_AT) / (1 - ZOMBIE.HIT_AT); a = -Math.PI / 2 - 1.0 + 1.5 * Math.min(1, q * 2.5) - 0.5 * Math.max(0, q - 0.4) / 0.6; }
        const lean = p < ZOMBIE.HIT_AT ? -0.12 * (p / ZOMBIE.HIT_AT) : 0.28 * Math.sin(Math.min(1, (p - ZOMBIE.HIT_AT) / (1 - ZOMBIE.HIT_AT)) * Math.PI);
        this.body.rotation.x = lean;
        this.head.rotation.x = lean * 1.4;
        this._setArm(this.leftArm, a);
        this._setArm(this.rightArm, a + 0.08);
        if (p >= 1) {
            this.isAttacking = false;
            this.attackAnimProgress = 0;
            this.body.rotation.x = 0;
            this.head.rotation.x = 0;
        }
    }

    triggerAttack() {
        if (this.isAttacking) return;
        this.isAttacking = true;
        this.attackAnimProgress = 0;
        this.struck = false;
    }

    /** Smoke and sparks off a zombie burning in the sunlight. */
    _smoke(dt) {
        this.burning -= dt;
        const fx = this.ctx.fx;
        if (!fx || Math.random() > dt * 14) return;
        const p = this.group.position;
        _v2.set(p.x + (Math.random() - 0.5) * 0.9, p.y + Math.random() * 2.2 * this.sizeK, p.z + (Math.random() - 0.5) * 0.9);
        _v.set((Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4);
        fx.spark(_v2, Math.random() < 0.35 ? 0xff7a1a : 0x555555, 0.16, _v, 0.8);
    }

    /**
     * @param {number} amount
     * @param {boolean} isWeapon
     * @param {THREE.Vector3} [hitDir]  direction of the blow (physical knockback)
     * @param {function} [rand]  random source (host passes Math.random; events are replicated)
     * @returns {object} what happened (for network replication)
     */
    /**
     * @param {object} [hit] where a blade hit: {y: height above the zombie's origin,
     *   side: -1 left / +1 right, speed: m/s} — that part is cut off and flies along the blow
     */
    takeDamage(amount, isWeapon, hitDir = null, rand = Math.random, hit = null) {
        const result = { severed: -1, decap: false, died: false, shattered: false };
        if (this.isDead) return result;
        if (this.isFrozen) {
            this.shatter();
            result.shattered = true;
            return result;
        }
        this.health -= amount;
        this.damageCooldown = 0.4;
        this.isAttacking = false;
        this.attackAnimProgress = 0;
        this.isSleeping = false;

        this.hitFlashTimer = 0.15;
        this._setColor(0xff0000);

        // (arms, legs and the head come off only where a blade's edge really went through them:
        // Dismember.js cuts them — no more random cuts by the height of the blow)

        // Knockback: backwards from facing (original), or along the physical blow.
        if (hitDir) _v.set(hitDir.x, 0, hitDir.z).normalize();
        else _v.set(0, 0, -1).applyQuaternion(this.group.quaternion);
        // (the dummy stands its ground: a blow rocks it, it doesn't fly off out of the blade's reach)
        const kb = this.dummy ? 0.25 : 1;
        this.velocity.addScaledVector(_v, 3.9 * kb);
        this.isStunned = true;
        this.stunTimer = this.dummy ? 0.4 : 1.0;
        this.rotVelocity.z = (rand() - 0.5) * 10 * kb;
        this.rotVelocity.x = -(rand() * 5) * kb;
        if (this.head.visible) this.head.rotation.x = -0.3; // (a jolt: the cube head bowed 45° sank its corner over the neck — no blade could get to it)
        this.body.rotation.x = -Math.PI / 6;

        if (this.health <= 0) {
            this.velocity.addScaledVector(_v, (isWeapon ? 8.0 : 5.0) * kb);
            this.die();
            result.died = true;
        }
        return result;
    }

    decapitate(vel = null) {
        if (this.limbMask & 1) return;
        this.limbMask |= 1;
        this.head.visible = false;
        this._spawnPart('head', vel);
        this._blood(2.1, 15);
    }

    severLimb(rand = Math.random, forced = -1, vel = null) {
        const limbs = [
            { bit: 2, part: this.leftArm, y: 1.4, type: 'arm' },
            { bit: 4, part: this.rightArm, y: 1.4, type: 'arm' },
            { bit: 8, part: this.leftLeg, y: 0.5, type: 'leg' },
            { bit: 16, part: this.rightLeg, y: 0.5, type: 'leg' },
        ];
        const alive = limbs.filter((l) => !(this.limbMask & l.bit));
        if (alive.length === 0) return -1;
        const chosen = forced >= 0 ? limbs.find((l) => l.bit === forced) : alive[Math.floor(rand() * alive.length)];
        if (!chosen || (this.limbMask & chosen.bit)) return -1;
        this.limbMask |= chosen.bit;
        chosen.part.visible = false;
        this._spawnPart(chosen.type, vel);
        if (chosen.type === 'leg') this.speed = Math.max(0.5, this.speed - 1.0);
        this._blood(chosen.y, 8);
        return chosen.bit;
    }

    _spawnPart(type, vel = null) {
        const fx = this.ctx.fx;
        if (!fx) return;
        const startY = type === 'head' ? 2.1 : type === 'arm' ? 1.4 : 0.5;
        fx.flyingPart(type, this.group.position.x, this.group.position.y + startY, this.group.position.z, vel);
    }

    _blood(localY, count) {
        const fx = this.ctx.fx;
        if (!fx) return;
        _v.set(0, localY, 0);
        this.group.localToWorld(_v);
        fx.blood(_v, count);
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        this.isDying = true;
        this.deathAnimTimer = 0.6;
        this.isAttacking = false;
        this.isStunned = false;
        this.corpseTimer = 0;
        if (this.ctx.sound && !this.dummy) this.ctx.sound.playDeath(this.group.position);
    }

    turnToSand() {
        if (this.isDead) return;
        this.isDead = true;
        this.group.visible = false;
        this.corpseTimer = 0;
        if (this.ctx.fx) this.ctx.fx.sandBurst(this.group.position);
    }

    applyChill(amount) {
        if (this.isDead || this.isFrozen) return;
        this.freezeProgress = (this.freezeProgress || 0) + amount;
        this.speed = Math.max(0, this.baseSpeed * (1.0 - this.freezeProgress));
        if (this.hitFlashTimer <= 0) this._restoreColor();
        if (Math.random() < amount * 10) this.spawnIceCrystalOnBody();
        const s = 0.5 + this.freezeProgress;
        for (const c of this.iceCrystals.children) c.scale.lerp(_v.set(s, s, s), 0.1);
        if (this.freezeProgress >= 1.0) this.freeze();
    }

    spawnIceCrystalOnBody() {
        const g = shared();
        const mesh = new THREE.Mesh(g.crystal, g.crystalMat);
        const angle = Math.random() * Math.PI * 2;
        const height = Math.random() * 2.0;
        mesh.position.set(Math.cos(angle) * 0.5, height, Math.sin(angle) * 0.5);
        mesh.lookAt(_v.set(0, height, 0));
        mesh.rotateX(-Math.PI / 2);
        mesh.rotation.x += (Math.random() - 0.5);
        mesh.scale.set(0.1, 0.1, 0.1);
        this.iceCrystals.add(mesh);
    }

    freeze() {
        if (this.isFrozen || this.isDead) return;
        this.isFrozen = true;
        this.frozenTimer = 120;
        const g = shared();
        for (const c of this.iceCrystals.children) c.material = g.crystalMatSolid;
    }

    unfreeze() {
        this.isFrozen = false;
        this.freezeProgress = 0;
        this.speed = this.baseSpeed;
        this.iceCrystals.clear();
        this._restoreColor();
    }

    shatter() {
        if (this.isDead) return;
        this.isDead = true;
        this.group.visible = false;
        this.corpseTimer = 0;
        if (this.ctx.fx) this.ctx.fx.iceShatter(this.group.position);
        if (this.ctx.sound) this.ctx.sound.playFrozenHit();
    }

    // ------------------------------------------------------------- «Брейнрот»
    /** Under a wizard's spell: violet eyes and a hypnotic ring turning over the head. */
    setThrall(on) {
        if (!!on === !!this.isThrall) return;
        this.isThrall = !!on;
        const g = shared();
        if (!g.thrallEye) g.thrallEye = new THREE.MeshBasicMaterial({ color: 0xd65bff });
        for (const e of this.eyes || []) e.material = on ? g.thrallEye : g.eyeMat;
        if (on && !this.halo) {
            if (!g.haloGeo) g.haloGeo = new THREE.TorusGeometry(0.55, 0.07, 6, 28);
            if (!g.haloMat) g.haloMat = new THREE.MeshBasicMaterial({ color: 0xc040ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
            this.halo = new THREE.Mesh(g.haloGeo, g.haloMat);
            this.halo.position.y = 3.0;
            this.halo.rotation.x = Math.PI / 2;
            this.group.add(this.halo);
        }
        if (this.halo) this.halo.visible = !!on;
    }

    _spinHalo(dt) {
        if (!this.halo || !this.halo.visible) return;
        this.halo.rotation.z += dt * 3;
        this.halo.scale.setScalar(1 + Math.sin(performance.now() / 180) * 0.12);
    }

    // ------------------------------------------------------------- networking
    serialize() {
        const p = this.group.position;
        const r = (v) => Math.round(v * 100) / 100;
        let flags = 0;
        if (this.isDead) flags |= 1;
        if (this.isFrozen) flags |= 2;
        if (this.isStunned) flags |= 4;
        if (this.isSleeping) flags |= 8;
        if (this.isAttacking) flags |= 16;
        if (!this.group.visible) flags |= 32;
        if (this.isThrall) flags |= 64;
        if (this.dummy) flags |= 128;
        if (this.burning > 0) flags |= 256;
        return [this.id, r(p.x), r(p.y), r(p.z), r(this.group.rotation.y), flags, this.limbMask, r(this.freezeProgress), r(this.group.rotation.x)];
    }

    /** Client side: apply host snapshot (positions are interpolated by the caller). */
    applySnapshot(s) {
        const flags = s[5];
        const wasDead = this.isDead;
        this.isDead = !!(flags & 1);
        this.isStunned = !!(flags & 4);
        this.isSleeping = !!(flags & 8);
        if ((flags & 16) && !this.isAttacking) this.triggerAttack();
        if ((flags & 32) && this.group.visible) this.group.visible = false;
        this.setThrall(!!(flags & 64));
        if ((flags & 128) && !this.dummy) this.setDummy();
        this.burning = flags & 256 ? 0.5 : 0;
        const frozen = !!(flags & 2);
        if (frozen && !this.isFrozen) { this.freezeProgress = 1; this.freeze(); this._restoreColor(); }
        else if (!frozen && this.isFrozen) this.unfreeze();
        else if (!frozen && Math.abs(s[7] - this.freezeProgress) > 0.05) { this.freezeProgress = s[7]; this._restoreColor(); }
        if (this.isDead && !wasDead) this.corpseTimer = 0;
        this.netTarget = this.netTarget || new THREE.Vector3();
        this.netTarget.set(s[1], s[2], s[3]);
        this.netRotY = s[4];
        this.netRotX = s[8] || 0;
    }

    /** Client-side visual update: interpolate towards host state and animate. */
    updateRemote(dt, camera) {
        this._spinHalo(dt);
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= dt;
            if (this.hitFlashTimer <= 0) this._restoreColor();
        }
        if (!this.netTarget) return;
        const pos = this.group.position;
        const k = Math.min(1, dt * 12);
        const x0 = pos.x, z0 = pos.z;
        const moved = Math.hypot(this.netTarget.x - pos.x, this.netTarget.z - pos.z);
        if (moved > 8) pos.copy(this.netTarget); else pos.lerp(this.netTarget, k);
        const dRot = wrapA(this.netRotY - this.group.rotation.y);
        this.group.rotation.y += dRot * k;
        this.yaw = this.group.rotation.y;
        this.group.rotation.x += (this.netRotX - this.group.rotation.x) * k;
        if (this.burning > 0) this._smoke(dt);
        if (this.isDead || this.isFrozen) return;
        if (this.isStunned) { this.head.rotation.y += dt * 15; return; }
        const step = moved > 8 ? 0 : Math.hypot(pos.x - x0, pos.z - z0);
        if (this.dummy && moved < 0.02) this._sway();
        else if (step > 1e-3 && !this.isAttacking) { this.walkCycle += (step / ZOMBIE.STRIDE) * Math.PI * 2; this._animateWalk(); } // (the same steps as on the host)
        else this._relax(Math.pow(0.85, dt * 60));
        if (this.isAttacking) { this._animateAttack(dt); this.struck = false; }
        if (camera) {
            this.head.getWorldPosition(_v2);
            const close = _v2.distanceTo(camera.position) < 0.7;
            this.head.visible = !close && !(this.limbMask & 1);
        }
    }

    dispose() {
        this.scene.remove(this.group);
        for (const m of this.materials) m.dispose();
        this.iceCrystals.clear();
    }
}
