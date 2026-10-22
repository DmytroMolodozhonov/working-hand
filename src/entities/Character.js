/**
 * Character.js — the voxel player avatar (local player and remote players).
 *
 * Geometry, sizes, colours and the lookAt arm-tracking maths are the original
 * ones. The rewrite removes all per-frame allocations, adds terrain following
 * (mountains / craters) and exposes clean accessors for weapons and network.
 */

import * as THREE from 'three';
import { applyLook } from './Appearance.js';
import { SimplifiedHand } from './SimplifiedHand.js';

/**
 * The eyes (first person), as in a real body: in the head, a little ahead of the neck — not
 * at the bottom of the head, just over the shoulders (they were: the torso was hidden, and
 * looking down one saw the legs with nothing above them). The head nods and turns on the
 * neck, so looking down the eyes go forward and down, over the chest — never back into it.
 *   NECK — the neck's foot (torso space: the top of the torso, its middle);
 *   EYES — the eyes from there, the head straight (inside the head, about over the chest's
 *   front: looking down one sees the chest, the belt and the hands below);
 *   NECK_BEND — how much of the head's turn moves the eyes round the neck's foot (the
 *   rest is the head on top of the neck and the eyes in it).
 */
export const NECK = new THREE.Vector3(0, 0.75, 0);
export const EYES = new THREE.Vector3(0, 0.65, -0.3);
export const NECK_BEND = 0.4;
const _qId = new THREE.Quaternion();
import { DetailedHand } from './DetailedHand.js';
import { stumpEnd } from './LimbSurgery.js';
import { KD } from '../game/Impact.js';
import { G, jumpSpeed, walkK, heavySink } from '../game/Jump.js';
import { ArmPump } from '../game/ArmPump.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qBody = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _r3 = new THREE.Vector3(), _r4 = new THREE.Vector3();
const _r5 = new THREE.Vector3(), _r6 = new THREE.Vector3(), _ru = new THREE.Vector3(), _rn = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _hv = new THREE.Vector3(), _hq = new THREE.Quaternion();

/**
 * An arm of two bones (L1 from the shoulder to the elbow, L2 on to the hand)
 * reaching for `target`, the elbow bent towards `pole` (a direction). Out of
 * reach: the arm straight towards it; nearer than the bones can fold: as near
 * as they allow. Writes the elbow and the hand.
 */
export function armReach(shoulder, target, L1, L2, pole, outElbow, outHand) {
    const u = _ru.subVectors(target, shoulder);
    let d = u.length();
    if (d < 1e-6) u.copy(pole); // (the hand at the shoulder itself: any way out)
    u.normalize();
    d = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min(L1 + L2 - 1e-4, d));
    const n = _rn.copy(pole).addScaledVector(u, -pole.dot(u));
    if (n.lengthSq() < 1e-8) n.set(0, -1, 0).addScaledVector(u, u.y);
    if (n.lengthSq() < 1e-8) n.set(1, 0, 0);
    n.normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    outElbow.copy(shoulder).addScaledVector(u, a).addScaledVector(n, h);
    return outHand.copy(shoulder).addScaledVector(u, d);
}

/** The body lying the way it fell: [rotation.x, rotation.z] (the hero faces −Z: +x is on the back). */
const FALL = { left: [0, 1.4], back: [1.45, 0], front: [-1.45, 0], right: [0, -1.4] };

// Ground at y=-0.5 corresponded to group.y = 1.5 (baseY) in the original.
export const PLAYER_GROUND_OFFSET = 2.0;
/** From the feet to just over the head: room a body needs under a roof. */
export const HEAD_ROOM = 3.4;
/** Does the body fly (under gravity) rather than stand? High over the floor, in a jump, or pushed up just now
 * (a toss from the ground starts AT the floor: without the last, the floor would take the push back at once). */
export function inAir(y, targetY, crouching, jumpAir, vy) {
    return (y > targetY + 0.6 && !crouching) || !!jumpAir || vy > 0;
}
/** The body's height for the walls (feet to over the head), standing. */
export const BODY_H = 3.5;
/**
 * Bending down (a squat, or a little stoop under a low roof — StoopReader): the body goes lower,
 * so it walks under rock it could not stand under; it cannot stand up into the rock (Game sets
 * `roofNeed`, how much lower the rock over it keeps it). Under a roof just a little too low the
 * head ducks by itself (DUCK), as anybody's would.
 */
export const CROUCH = { DROP: 1.0, DUCK: 0.3, DOWN: 2.5, UP: 1.8 };
const ease = (v, to, down, up, dt) => (to > v ? Math.min(to, v + down * dt) : Math.max(to, v - up * dt));

export class VoxelCharacter {
    constructor(scene, { remote = false } = {}) {
        this.scene = scene;
        this.remote = remote;
        this.group = new THREE.Group();

        this.head = null;
        this.body = null;
        this.leftArmAnchor = new THREE.Group();
        this.leftElbowAnchor = new THREE.Group();
        this.rightArmAnchor = new THREE.Group();
        this.rightElbowAnchor = new THREE.Group();
        this.leftLegPivot = new THREE.Group();
        this.rightLegPivot = new THREE.Group();

        this.skinColor = 0xFFDBB4;
        this.shirtColor = 0x3498db;
        this.pantsColor = 0x2c3e50;
        this.hairColor = 0x4a3728;

        this.runCycle = 0;
        this.isRunning = false;
        this.isCrouching = false;
        this.stoop = 0; // 0…1 bent down a little (the camera: StoopReader)
        this.roofNeed = 0; // 0…1 how much lower the rock right over the body keeps it (Game._roofNeed)
        this.crouchK = 0; // 0…1 how bent the body is (smoothed; never stands up into rock)
        this.lowK = 0; // 0…1 how much lower the body really is (bent + the head ducked under the rock)
        this.runIntensity = 0;
        this.baseY = 1.5;
        this.groundY = -0.5;
        this.verticalVelocity = 0;
        this.onGround = true;

        this.BONE_LENGTH_UPPER = 1.0;
        this.BONE_LENGTH_LOWER = 0.9;

        this.handVersion = 'v3';
        this.aim = { left: null, right: null }; // a held wand's direction (spells follow it)
        this.handsVisible = false;
        this.handVelocity = { left: new THREE.Vector3(), right: new THREE.Vector3() };
        this._lastHandPos = { left: null, right: null };
        // the hand's own speed against the body (running, crouching, turning add nothing) — throws
        this.handRelVelocity = { left: new THREE.Vector3(), right: new THREE.Vector3() };
        this._lastHandLocal = { left: null, right: null };
        // how fast the palm turns (rad/s, world axis × speed): a thrown thing keeps the wrist's snap
        this.palmSpin = { left: new THREE.Vector3(), right: new THREE.Vector3() };
        this._lastPalmQ = { left: null, right: null };
        // running with the arms (a sprinter's swings, in turn): up to +40% while the legs run (ArmPump.js)
        this.armPump = new ArmPump();

        this.createCharacter();
        this.scene.add(this.group);
        this.group.position.set(0, this.baseY, 0);
        // Yaw first, then tilt (flight). Identical to the old order while upright.
        this.group.rotation.order = 'YXZ';
        this.flightTilt = 0;
        this.flightView = 0; // flight: how far the view is pitched along the flight path (rad, + up)
        this.knockedDown = false; // off the feet (Knockdown.js): lying the way `fallDir` says
        this.liftUp = 0;          // lying, pulled up by another's hand: 0 lying … 1 up (Knockdown.js)
        this.fallDir = 'left';
        this._fallRoll = 0;
        this._fallPitch = 0;
        this.tumbleAng = 0; // (thrown by «Джолт»: how far the body has flipped over in the air, rad)
        this.tumbleDir = null;
        this._pitchOwned = false;
        this.staggerLean = 0; // reeling: the body leans back (+) / forward (−)…
        this.staggerRoll = 0; // …or aside
        this.stepping = 0; // s of steps left (reeling: the legs step though nobody walks)
        this.slowScale = 1; // walking speed (the ice beam's chill slows it)
        this.airTop = null; // the highest point of this fall (landing → Knockdown)
        this.landing = null; // {drop, speed, at} of the last landing
        this.legPose = null; // {left: {hip}, right: {hip}}: the legs held so (a surfboard), not walked
        this.boardRoll = 0; // the body tilted sideways with a surfboard under it
        this.flying = false;
        // the hero's gravity: ONE multiplier for falling, jumping and walking (1 = Earth; Jump.js says how to change it)
        this.gravityK = 1;
        this.jumpAir = false; // up in a real jump (JumpReader → Game._jumpStep → jump())
        this.jumpVel = { x: 0, z: 0 }; // the run carried on through the air (a long jump)
        this._jumpT = 0;
        this._planar = { x: 0, z: 0 }; // how fast the body has been walking (smoothed over ~0.5 s)
    }

    /**
     * A real jump: the legs push the body up (strength 0..1 from JumpReader, the gravity's
     * multiplier decides how high), the run goes on through the air. The caller checks that
     * the body may jump (on the ground, not in water, not lying…). True: it left the ground.
     */
    jump(strength) {
        const v = jumpSpeed(strength, this.gravityK);
        if (v < 1 || this.jumpAir || !this.onGround) return false;
        this.verticalVelocity = v;
        this.jumpAir = true;
        this.onGround = false;
        this._jumpT = 0;
        this._jumpS = strength;
        this.airTop = this.group.position.y;
        // (a standing jump stays in place: only a real run is carried on — a long jump)
        const sp = Math.hypot(this._planar.x, this._planar.z);
        const keep = sp > 2 ? 1 : 0;
        this.jumpVel.x = this._planar.x * keep; this.jumpVel.z = this._planar.z * keep;
        return true;
    }

    /** The jump turned out stronger while the body still went up (it went up higher): a little more push. */
    jumpBoost(strength) {
        if (!this.jumpAir || this.verticalVelocity <= 0 || this._jumpT > 0.25 || strength <= (this._jumpS || 0)) return;
        const v = jumpSpeed(strength, this.gravityK) - G * this.gravityK * this._jumpT;
        if (v > this.verticalVelocity) this.verticalVelocity = v;
        this._jumpS = strength;
    }

    createCharacter() {
        const torso = new THREE.Group();
        torso.position.y = 0.75;
        this.group.add(torso);
        this.torso = torso;

        this.head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshLambertMaterial({ color: this.skinColor }));
        this.head.position.y = 1.35;
        this.head.castShadow = true;
        torso.add(this.head);

        const hair = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 1.3), new THREE.MeshLambertMaterial({ color: this.hairColor }));
        hair.position.y = 0.5;
        this.head.add(hair);

        const eyeGeo = new THREE.BoxGeometry(0.2, 0.2, 0.1);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.25, 0.1, -0.6);
        this.head.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.25, 0.1, -0.6);
        this.head.add(rightEye);

        this.body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.8), new THREE.MeshLambertMaterial({ color: this.shirtColor }));
        this.body.position.y = 0;
        this.body.castShadow = true;
        torso.add(this.body);

        const upperArmGeo = new THREE.BoxGeometry(0.4, 0.4, this.BONE_LENGTH_UPPER);
        const armMat = new THREE.MeshLambertMaterial({ color: this.shirtColor });
        const forearmGeo = new THREE.BoxGeometry(0.35, 0.35, this.BONE_LENGTH_LOWER);
        const skinMat = new THREE.MeshLambertMaterial({ color: this.skinColor });

        const buildArm = (armAnchor, elbowAnchor, x) => {
            armAnchor.position.set(x, 0.5, 0);
            torso.add(armAnchor);
            const upper = new THREE.Mesh(upperArmGeo, armMat);
            upper.position.set(0, 0, this.BONE_LENGTH_UPPER / 2);
            upper.castShadow = true;
            armAnchor.add(upper);
            elbowAnchor.position.set(0, 0, this.BONE_LENGTH_UPPER);
            armAnchor.add(elbowAnchor);
            const fore = new THREE.Mesh(forearmGeo, skinMat);
            fore.position.set(0, 0, this.BONE_LENGTH_LOWER / 2);
            fore.castShadow = true;
            elbowAnchor.add(fore);
        };
        buildArm(this.leftArmAnchor, this.leftElbowAnchor, -0.7);
        buildArm(this.rightArmAnchor, this.rightElbowAnchor, 0.7);

        // Legs hang from the bottom of the body (the original left a 0.75 gap there,
        // invisible in first person but seen on other players) down to the feet
        // (group y -1.95 = ground + 0.05)
        const LEG = 1.95;
        const legGeo = new THREE.BoxGeometry(0.5, LEG, 0.5);
        const legMat = new THREE.MeshLambertMaterial({ color: this.pantsColor });
        this.leftLegPivot.position.set(-0.3, 0, 0);
        this.group.add(this.leftLegPivot);
        const leftLeg = new THREE.Mesh(legGeo, legMat);
        leftLeg.position.y = -LEG / 2;
        leftLeg.castShadow = true;
        this.leftLegPivot.add(leftLeg);
        this.rightLegPivot.position.set(0.3, 0, 0);
        this.group.add(this.rightLegPivot);
        const rightLeg = new THREE.Mesh(legGeo, legMat);
        rightLeg.position.y = -LEG / 2;
        rightLeg.castShadow = true;
        this.rightLegPivot.add(rightLeg);

        this.leftHandAnchor = new THREE.Group();
        this.leftHandAnchor.position.set(0, 0, this.BONE_LENGTH_LOWER);
        this.leftElbowAnchor.add(this.leftHandAnchor);
        this.rightHandAnchor = new THREE.Group();
        this.rightHandAnchor.position.set(0, 0, this.BONE_LENGTH_LOWER);
        this.rightElbowAnchor.add(this.rightHandAnchor);

        // V2 detailed (voxel landmarks) hands
        this.leftDetailedHand = new DetailedHand('left');
        this.leftDetailedHand.group.position.set(0, 0, this.BONE_LENGTH_LOWER);
        this.leftDetailedHand.group.scale.set(-1, 1, 1);
        this.leftDetailedHand.group.visible = false;
        this.leftElbowAnchor.add(this.leftDetailedHand.group);
        this.rightDetailedHand = new DetailedHand('right');
        this.rightDetailedHand.group.position.set(0, 0, this.BONE_LENGTH_LOWER);
        this.rightDetailedHand.group.scale.set(-1, 1, 1);
        this.rightDetailedHand.group.visible = false;
        this.rightElbowAnchor.add(this.rightDetailedHand.group);

        // V3 simplified (stable) hands — default
        this.leftSimplifiedHand = new SimplifiedHand('left');
        this.leftSimplifiedHand.group.position.set(0, 0, this.BONE_LENGTH_LOWER);
        this.leftSimplifiedHand.group.visible = false;
        this.leftElbowAnchor.add(this.leftSimplifiedHand.group);
        this.rightSimplifiedHand = new SimplifiedHand('right');
        this.rightSimplifiedHand.group.position.set(0, 0, this.BONE_LENGTH_LOWER);
        this.rightSimplifiedHand.group.visible = false;
        this.rightElbowAnchor.add(this.rightSimplifiedHand.group);
    }

    // ------------------------------------------------------------ arm tracking
    /**
     * Converts 2D screen coords to a 3D direction (original maths, unchanged).
     * Writes into `out`.
     */
    getRelativeDirection(start, end, out) {
        const dy = -(end.y - start.y);
        const dx = -(end.x - start.x);
        let len2d = Math.sqrt(dx * dx + dy * dy);
        if (len2d < 0.01) len2d = 0.01;
        const maxLen = 0.25;
        const zFactor = Math.sqrt(Math.max(0, 1 - (len2d / maxLen)));
        const dz = -zFactor * 2.0;
        return out.set(dx * 8, dy * 8, dz).normalize();
    }

    _smoothLookAt(obj, worldTarget, speed) {
        _q1.copy(obj.quaternion);
        obj.lookAt(worldTarget);
        _q2.copy(obj.quaternion);
        obj.quaternion.copy(_q1).slerp(_q2, speed);
    }

    updateArmsLookAt(poseData, dt = 1 / 60) {
        // 0.55 per frame at 60 FPS, frame-rate independent (the pose is already smoothed
        // upstream; more smoothing here only made the arms trail behind the player)
        const armK = 1 - Math.pow(0.45, Math.min(0.1, dt) * 60);
        this.restoreArms(); // (from the tracked arms, not from a hand shown holding a bow's string)
        if (!poseData.leftShoulder || !poseData.leftElbow || !poseData.leftWrist ||
            !poseData.rightShoulder || !poseData.rightElbow || !poseData.rightWrist) {
            this._updateHands(poseData);
            return;
        }
        this.group.updateMatrixWorld(true);
        this.group.getWorldQuaternion(_qBody);
        _up.set(0, 1, 0).applyQuaternion(_qBody);

        const solveArm = (armAnchor, elbowAnchor, shoulder, elbow, wrist) => {
            // Upper arm
            this.getRelativeDirection(shoulder, elbow, _v1).applyQuaternion(_qBody);
            armAnchor.up.copy(_up);
            _v2.copy(armAnchor.position);
            armAnchor.parent.localToWorld(_v2).add(_v1);
            this._smoothLookAt(armAnchor, _v2, armK);
            armAnchor.updateMatrixWorld(true);
            // Forearm
            this.getRelativeDirection(elbow, wrist, _v1).applyQuaternion(_qBody);
            elbowAnchor.up.copy(_up);
            elbowAnchor.getWorldPosition(_v2).add(_v1);
            this._smoothLookAt(elbowAnchor, _v2, armK);
        };
        solveArm(this.leftArmAnchor, this.leftElbowAnchor, poseData.leftShoulder, poseData.leftElbow, poseData.leftWrist);
        solveArm(this.rightArmAnchor, this.rightElbowAnchor, poseData.rightShoulder, poseData.rightElbow, poseData.rightWrist);

        this._updateHands(poseData);
    }

    _updateHands(poseData) {
        if (this._simplified()) {
            for (const h of [this.leftSimplifiedHand, this.rightSimplifiedHand]) { h.body = this.group; if (poseData.aspect) h.aspect = poseData.aspect; }
            const now = this.handNow ? this.handNow() : Date.now(); // (tests give their own clock)
            if (this.leftSimplifiedHand.group.visible) this.leftSimplifiedHand.update(poseData.leftHandLandmarks || null, this.group.rotation.y, now);
            if (this.rightSimplifiedHand.group.visible) this.rightSimplifiedHand.update(poseData.rightHandLandmarks || null, this.group.rotation.y, now);
        } else {
            if (this.leftDetailedHand.group.visible) this.leftDetailedHand.update(poseData.leftHandLandmarks || null);
            if (this.rightDetailedHand.group.visible) this.rightDetailedHand.update(poseData.rightHandLandmarks || null);
        }
    }

    /** Spell-casting gesture: wrist near/above cheek level (original thresholds). */
    isHandRaised() {
        if (!this.head) return null;
        this.group.updateMatrixWorld(true);
        // Heights are measured along the BODY's up axis, so the gesture works
        // the same standing and lying horizontally in flight.
        this.group.getWorldQuaternion(_qBody);
        _up.set(0, 1, 0).applyQuaternion(_qBody);
        this.head.getWorldPosition(_v3);
        const headH = _v3.sub(this.group.position).dot(_up);
        // How far below the top of the head the hand may be (a bit lower than
        // the original 1.3 so a hand a little below the middle of the screen counts)
        const threshold = 1.55;
        const stats = (elbowAnchor) => {
            _v1.set(0, 0, this.BONE_LENGTH_LOWER).applyMatrix4(elbowAnchor.matrixWorld).sub(this.group.position);
            const height = _v1.dot(_up) - (headH - threshold);
            return { height, valid: height > 0 };
        };
        const l = stats(this.leftElbowAnchor);
        const r = stats(this.rightElbowAnchor);
        if (this.handLost('left')) l.valid = false; // (a cut-off hand casts nothing)
        if (this.handLost('right')) r.valid = false;
        if (!l.valid && !r.valid) return null;
        let side = 'right';
        if (l.valid && r.valid) side = l.height >= r.height ? 'left' : 'right';
        else if (l.valid) side = 'left';
        const bothLevel = l.valid && r.valid && Math.abs(l.height - r.height) < 0.3;
        return { side, bothLevel };
    }

    /** Both wrists above the top of the head ("руки вверх") — the flight gesture. */
    areBothHandsUp() {
        if (this.handLost('left') || this.handLost('right')) return false;
        this.group.updateMatrixWorld(true);
        this.group.getWorldQuaternion(_qBody);
        _up.set(0, 1, 0).applyQuaternion(_qBody);
        this.head.getWorldPosition(_v3);
        // hands at about forehead height or higher count as "up"
        const headTop = _v3.sub(this.group.position).dot(_up) - 0.15;
        const h = (elbowAnchor) => _v1.set(0, 0, this.BONE_LENGTH_LOWER).applyMatrix4(elbowAnchor.matrixWorld).sub(this.group.position).dot(_up);
        return h(this.leftElbowAnchor) > headTop && h(this.rightElbowAnchor) > headTop;
    }

    /** The hands' speed against the body and the palms' turning speed (see handRelVelocity, palmSpin). */
    _updateHandMotion(dt) {
        if (!(dt > 0)) return;
        this.group.updateMatrixWorld(true);
        _m4.copy(this.group.matrixWorld).invert();
        for (const side of ['left', 'right']) {
            const grip = this.getGripObject(side);
            grip.getWorldPosition(_v1).applyMatrix4(_m4);
            const last = this._lastHandLocal[side];
            if (last) { this.handRelVelocity[side].lerp(_v2.subVectors(_v1, last).divideScalar(dt), 0.8); last.copy(_v1); } // (the camera's jitter is filtered upstream)
            else this._lastHandLocal[side] = _v1.clone();
            grip.getWorldQuaternion(_hq);
            const lq = this._lastPalmQ[side];
            if (lq) {
                // the turn since the last frame: q·last⁻¹ = (axis, angle)
                _q1.copy(_hq).multiply(_q2.copy(lq).invert());
                if (_q1.w < 0) { _q1.x = -_q1.x; _q1.y = -_q1.y; _q1.z = -_q1.z; _q1.w = -_q1.w; }
                const ang = 2 * Math.acos(Math.min(1, _q1.w)), s = Math.sqrt(Math.max(0, 1 - _q1.w * _q1.w));
                if (s > 1e-6) _hv.set(_q1.x / s, _q1.y / s, _q1.z / s).multiplyScalar(ang / dt); else _hv.set(0, 0, 0);
                this.palmSpin[side].lerp(_hv, 0.5).clampLength(0, 20);
                lq.copy(_hq);
            } else this._lastPalmQ[side] = _hq.clone();
        }
        const runs = this.isRunning && this.runIntensity > 0 && this.canRun !== false && !this.knockedDown;
        this.armPump.update(dt, this.handLost('left') ? null : this.handRelVelocity.left, this.handLost('right') ? null : this.handRelVelocity.right, runs);
    }

    /**
     * The arm in the body's space (x right, y up, z back): hand, shoulder, reach (× the arm's
     * length), forward (cos to the body's front), up (sin of the arm's elevation), the hand's
     * speed against the body (vRel, speed), its world speed (vWorld), palmUp (cos of the palm's
     * face to world up). For the hand letting go (HandRelease.js).
     */
    armState(side, out = {}) {
        this.group.updateMatrixWorld(true);
        _m4.copy(this.group.matrixWorld).invert();
        out.shoulder = (side === 'left' ? this.leftArmAnchor : this.rightArmAnchor).getWorldPosition(out.shoulder || new THREE.Vector3()).applyMatrix4(_m4);
        out.hand = this.getHandWorldPosition(side, out.hand || new THREE.Vector3()).applyMatrix4(_m4);
        const d = _v3.subVectors(out.hand, out.shoulder), len = d.length() || 1e-6;
        out.reach = len / (this.BONE_LENGTH_UPPER + this.BONE_LENGTH_LOWER);
        out.forward = -d.z / len;
        out.up = d.y / len;
        out.vRel = this.handRelVelocity[side];
        out.speed = out.vRel.length();
        out.vWorld = this.handVelocity[side];
        const g = this.getGripObject(side); // (the palm's face is its −Z, both hands)
        out.palmUp = g.name === 'palm' ? -_v1.setFromMatrixColumn(g.matrixWorld, 2).normalize().y : 0;
        return out;
    }

    /** The camera sees this hand now (seen within 400 ms): a lost hand never lets go of anything. */
    isHandTracked(side) {
        const h = this.getActiveHands()[side];
        return !!h && h.group.visible && h.lastTrackingTime > 0 && Date.now() - h.lastTrackingTime < 400;
    }

    /** Arm stretched out (hand far from the shoulder) — the shield gesture. */
    isArmExtended(side) {
        if (this.handLost(side)) return false;
        const shoulder = (side === 'left' ? this.leftArmAnchor : this.rightArmAnchor).getWorldPosition(_v3);
        const hand = this.getHandWorldPosition(side, _v1);
        return hand.distanceTo(shoulder) > 0.82 * (this.BONE_LENGTH_UPPER + this.BONE_LENGTH_LOWER);
    }

    /**
     * Is this arm lifted (pointing somewhere), not hanging down along the body?
     * The hand is more than ~60° up from straight down.
     */
    isArmRaised(side) {
        if (this.handLost(side)) return false;
        const anchor = side === 'left' ? this.leftArmAnchor : this.rightArmAnchor;
        anchor.updateMatrixWorld(true);
        const shoulder = anchor.getWorldPosition(_v2);
        const hand = this.getHandWorldPosition(side, _v1);
        const v = hand.sub(shoulder);
        const len = v.length();
        // (measured along the body's own "up", like isHandRaised: in flight the body tips
        // forward, and an arm hanging along it must not count as raised — nor an arm
        // stretched at the camera as hanging)
        this.group.getWorldQuaternion(_qBody);
        _up.set(0, 1, 0).applyQuaternion(_qBody);
        // (a hand lifted ~15° from hanging is enough to cast)
        return len > 1e-3 && v.dot(_up) / len > -0.96;
    }

    /**
     * The arms spread out to the sides for a dome («Protection Maxima», «Protection Gods Maxima»): looser than
     * isTPose (the camera seldom sees both arms dead straight at the frame's edges) — both hands well away from
     * the shoulders, not far above or below them, and far apart (out to the sides, not forward).
     */
    isArmsSpread() {
        if (this.isTPose()) return true;
        this.group.updateMatrixWorld(true);
        this.group.getWorldQuaternion(_qBody);
        _up.set(0, 1, 0).applyQuaternion(_qBody);
        const armLen = this.BONE_LENGTH_UPPER + this.BONE_LENGTH_LOWER;
        for (const side of ['left', 'right']) {
            if (this.handLost(side)) return false;
            const shoulder = (side === 'left' ? this.leftArmAnchor : this.rightArmAnchor).getWorldPosition(new THREE.Vector3());
            const hand = this.getHandWorldPosition(side, _v1);
            if (hand.distanceTo(shoulder) < 0.65 * armLen) return false;
            if (Math.abs(hand.sub(shoulder).dot(_up)) > 0.6 * armLen) return false;
        }
        const l = this.getHandWorldPosition('left', new THREE.Vector3());
        const r = this.getHandWorldPosition('right', _v1);
        return l.distanceTo(r) > 1.55 * armLen;
    }

    /** Both arms stretched out sideways at shoulder height (a «T»). */
    isTPose() {
        if (!this.isArmExtended('left') || !this.isArmExtended('right')) return false;
        this.group.updateMatrixWorld(true);
        this.group.getWorldQuaternion(_qBody);
        _up.set(0, 1, 0).applyQuaternion(_qBody);
        const armLen = this.BONE_LENGTH_UPPER + this.BONE_LENGTH_LOWER;
        for (const side of ['left', 'right']) {
            const shoulder = (side === 'left' ? this.leftArmAnchor : this.rightArmAnchor).getWorldPosition(new THREE.Vector3());
            const hand = this.getHandWorldPosition(side, _v1);
            if (Math.abs(hand.sub(shoulder).dot(_up)) > 0.45 * armLen) return false;
        }
        const l = this.getHandWorldPosition('left', new THREE.Vector3());
        const r = this.getHandWorldPosition('right', _v1);
        return l.distanceTo(r) > 1.9 * armLen; // hands far apart: out to the sides, not forward
    }

    /**
     * Flight pose: tilt the whole body forward (0 = upright, ~1.35 = Superman).
     * The rotation order is yaw-then-tilt so turning works while horizontal.
     */
    setFlightTilt(tilt) {
        this.flightTilt = tilt;
        this.group.rotation.x = -tilt;
    }

    getHandDirection(side, out = new THREE.Vector3()) {
        // a wand in this hand: spells go where the wand points (Items sets it every frame)
        const a = this.aim?.[side];
        if (a && performance.now() - a.at < 250) return out.copy(a.dir);
        this.getForearmDirection(side, out);
        // the fingers not seen for a moment: the wand keeps its bend against the forearm
        // (not a jump to the forearm's line — a held thing flew off and came back)
        if (a?.rel) out.applyQuaternion(a.rel).normalize();
        return out;
    }

    /**
     * Where this hand points as the player sees it. In flight the hero's body tips
     * forward (a little while hovering, flat like Superman when cruising) while the
     * eyes keep looking along the flight and the player stands upright at the camera:
     * a hand pointed at something on the screen points at it in the world too, so the
     * body's tilt is taken out of the hand's direction (and the view's own pitch along
     * the flight put in). On the ground it is just the hand's direction.
     */
    getPointingDirection(side, out = new THREE.Vector3()) {
        this.getHandDirection(side, out);
        const t = this.aimTilt();
        if (Math.abs(t) < 1e-5) return out;
        const yaw = this.group.rotation.y;
        return out.applyAxisAngle(_ax.set(Math.cos(yaw), 0, -Math.sin(yaw)), t).normalize();
    }

    /** How far (rad) the view is pitched up from the body's own front (flight only). */
    aimTilt() {
        // (another player's hero: the tilt comes over the network as the body's rotation)
        const tilt = this.remote ? (this.flying ? Math.max(0, Math.min(1.6, -this.group.rotation.x)) : 0) : (this.flightTilt || 0);
        return tilt + (this.flightView || 0);
    }

    /** Elbow → hand (the forearm), whatever is held. */
    getForearmDirection(side, out = new THREE.Vector3()) {
        const anchor = side === 'left' ? this.leftElbowAnchor : this.rightElbowAnchor;
        anchor.updateMatrixWorld(true);
        anchor.getWorldPosition(_v1);
        out.set(0, 0, this.BONE_LENGTH_LOWER).applyMatrix4(anchor.matrixWorld);
        return out.sub(_v1).normalize();
    }

    getHandWorldPosition(side, out = new THREE.Vector3()) {
        // a cut-off hand: the end of the stump (pressed to the wound for «Rescue»)
        if (this.limbs && this.limbs[side + 'Arm'] != null && stumpEnd(this, side + 'Arm', out)) return out;
        const anchor = side === 'left' ? this.leftElbowAnchor : this.rightElbowAnchor;
        anchor.updateMatrixWorld(true);
        return out.set(0, 0, this.BONE_LENGTH_LOWER).applyMatrix4(anchor.matrixWorld);
    }

    /** The object the weapon is held by: the palm when hands are shown, else the wrist anchor. */
    getGripObject(side) {
        const hand = this.getActiveHands()[side];
        if (hand && hand.group.visible && hand.palm) return hand.palm;
        return side === 'left' ? this.leftHandAnchor : this.rightHandAnchor;
    }

    /**
     * Show this hand holding something at `point` (the drawing fingers on a bow's
     * string): the arm bends to it — the elbow forward, out to its side and a little
     * down, in front of the chest. Only how the hero looks this frame (w: 0 the
     * tracked arm … 1 at the point): the tracked arm comes back at the start of the
     * next frame (restoreArms), so tracking, the hand's speed and every gesture keep
     * seeing the player's own arm.
     * @param {number} fingers  how far beyond the wrist the point is (it is in the fingers)
     */
    reachHand(side, point, w = 1, fingers = 0) {
        if (!(w > 0)) return;
        const arm = side === 'left' ? this.leftArmAnchor : this.rightArmAnchor;
        const elbow = side === 'left' ? this.leftElbowAnchor : this.rightElbowAnchor;
        const all = this._reachSaved || (this._reachSaved = {
            left: { on: false, a: new THREE.Quaternion(), e: new THREE.Quaternion() },
            right: { on: false, a: new THREE.Quaternion(), e: new THREE.Quaternion() },
        });
        const saved = all[side];
        // (the tracked arm kept to come back to; bent twice in a frame — again from the tracked arm)
        if (!saved.on) { saved.a.copy(arm.quaternion); saved.e.copy(elbow.quaternion); saved.on = true; }
        else { arm.quaternion.copy(saved.a); elbow.quaternion.copy(saved.e); }
        this._reach = true;
        this.group.updateMatrixWorld(true);
        this.group.getWorldQuaternion(_qBody);
        _up.set(0, 1, 0).applyQuaternion(_qBody);
        const S = arm.getWorldPosition(_r1);
        const pole = _r2.set(side === 'left' ? -0.3 : 0.3, -0.5, -1).applyQuaternion(_qBody);
        const L1 = this.BONE_LENGTH_UPPER, L2 = this.BONE_LENGTH_LOWER;
        armReach(S, point, L1, L2, pole, _r3, _r4);
        if (fingers > 0) {
            // the wrist short of the point by the hand, along the forearm
            const f = _r5.subVectors(point, _r3).normalize();
            armReach(S, _r6.copy(point).addScaledVector(f, -fingers), L1, L2, pole, _r3, _r4);
        }
        arm.up.copy(_up);
        arm.lookAt(_r3);
        if (w < 1) { _q1.copy(arm.quaternion); arm.quaternion.copy(saved.a).slerp(_q1, w); }
        arm.updateMatrixWorld(true);
        elbow.up.copy(_up);
        elbow.lookAt(_r4);
        if (w < 1) { _q1.copy(elbow.quaternion); elbow.quaternion.copy(saved.e).slerp(_q1, w); }
        elbow.updateMatrixWorld(true);
    }

    /** The tracked arms back (after reachHand): every frame starts from the player's own arms. */
    restoreArms() {
        if (!this._reach) return;
        this._reach = false;
        const s = this._reachSaved;
        if (s.left.on) { this.leftArmAnchor.quaternion.copy(s.left.a); this.leftElbowAnchor.quaternion.copy(s.left.e); }
        if (s.right.on) { this.rightArmAnchor.quaternion.copy(s.right.a); this.rightElbowAnchor.quaternion.copy(s.right.e); }
        s.left.on = s.right.on = false;
        this.group.updateMatrixWorld(true);
    }

    setIdlePose() {
        this._reach = false;
        if (this._reachSaved) this._reachSaved.left.on = this._reachSaved.right.on = false;
        this.leftArmAnchor.rotation.set(0, 0, 0);
        this.leftArmAnchor.lookAt(_v1.copy(this.leftArmAnchor.position).add(_v2.set(-0.1, -1, 0)));
        this.leftElbowAnchor.rotation.set(0, 0, 0);
        this.rightArmAnchor.rotation.set(0, 0, 0);
        this.rightArmAnchor.lookAt(_v1.copy(this.rightArmAnchor.position).add(_v2.set(0.1, -1, 0)));
        this.rightElbowAnchor.rotation.set(0, 0, 0);
        this.leftArmAnchor.up.set(0, 1, 0);
        this.rightArmAnchor.up.set(0, 1, 0);
    }

    resetPose() {
        this.setIdlePose();
        this.isRunning = false;
        this.isCrouching = false;
        this.stoop = this.roofNeed = this.crouchK = this.lowK = 0;
        this.runCycle = 0;
        this.group.rotation.set(0, 0, 0);
    }

    setRunning(running, intensity = 0.5) {
        this.isRunning = !!running;
        this.runIntensity = Math.max(0, Math.min(1, intensity || 0));
    }

    setCrouching(crouching) {
        this.isCrouching = !!crouching;
    }

    /** Bent down a little (0…1) — StoopReader. */
    setStoop(v) {
        this.stoop = Math.max(0, Math.min(1, +v || 0));
    }

    /**
     * The body's height for the walls now: lower when bent. `rock`: against the world's rock — the
     * head ducks a little more by itself under a roof just too low (Game._roofNeed lowers it then).
     */
    bodyHeight(rock = false) {
        return BODY_H - CROUCH.DROP * Math.min(1, this.crouchK + (rock ? CROUCH.DUCK : 0));
    }

    /**
     * @param {number} dt
     * @param {CollisionWorld|null} collision  for ground height (mountains, craters)
     * @param {boolean} move  false for remote avatars (position comes from network)
     */
    update(dt, collision = null, move = true) {
        this.restoreArms(); // (a frame without a pose too: the hand's speed is the player's own)
        // Hand world velocity (for throwing / swing strength)
        for (const side of ['left', 'right']) {
            const grip = this.getGripObject(side);
            grip.getWorldPosition(_v1);
            const last = this._lastHandPos[side];
            if (last && dt > 0) {
                _v2.subVectors(_v1, last).divideScalar(dt);
                this.handVelocity[side].lerp(_v2, 0.3);
                last.copy(_v1);
            } else {
                this._lastHandPos[side] = _v1.clone();
            }
        }
        this._updateHandMotion(dt);

        // Crouching lowers the body by up to 1 m (smoothly; not up into the rock over it): the legs fold
        // back (kneeling) so they stay above the ground
        const roof = Math.min(1, this.roofNeed || 0);
        this.crouchK = ease(this.crouchK, Math.min(1, Math.max(this.isCrouching ? 1 : 0, this.stoop || 0, roof - CROUCH.DUCK)), CROUCH.DOWN, CROUCH.UP, dt);
        this.lowK = ease(this.lowK, Math.max(this.crouchK, roof), CROUCH.DOWN * 1.6, CROUCH.UP, dt);
        const crouchAngle = -1.1 * this.lowK;
        // Knocked down: tips over the way it was pushed (and gets up again); reeling: leans
        const up = this.knockedDown ? 1 - (this.liftUp || 0) : 1; // (pulled up by a hand: the body follows it)
        const [px, rz] = this.knockedDown ? (FALL[this.fallDir] || FALL.left).map((a) => a * up) : [this.staggerLean || 0, this.staggerRoll || 0];
        const kf = Math.min(1, dt * (this.knockedDown ? 6 : 4));
        this._fallPitch += (px - this._fallPitch) * kf;
        this._fallRoll += (rz - this._fallRoll) * kf;
        if (Math.abs(this._fallRoll) < 0.002 && rz === 0) this._fallRoll = 0;
        // thrown by «Джолт»: the whole body flips over in the air the way it falls (Knockdown.tumbleAng)
        const [tx, tz] = this.tumbleAng ? (FALL[this.tumbleDir || this.fallDir] || FALL.back).map((a) => Math.sign(a) * this.tumbleAng) : [0, 0];
        if (Math.abs(this._fallRoll) > 0.002 || tz || this.boardRoll || this.group.rotation.z !== 0) this.group.rotation.z = this._fallRoll + tz + (this.boardRoll || 0); // (+ tilted with a surfboard)
        // (x is shared with flight and the bed: owned only while falling, lying, rising or reeling — those exclude flight and bed)
        const own = this.knockedDown || Math.abs(this._fallPitch) > 0.002;
        if (own) this.group.rotation.x = this._fallPitch + tx;
        else if (this._pitchOwned) { this.group.rotation.x = 0; this._fallPitch = 0; }
        this._pitchOwned = own;
        this.stepping = Math.max(0, (this.stepping || 0) - dt);

        if (!move && !this.remote) this.jumpAir = false; // (the horse, the bed, flight… took the body)
        if (move) {
            const fromX = this.group.position.x, fromZ = this.group.position.z;
            if (this.jumpAir) {
                // in the air: the run goes on as it was at the take-off, the legs push nothing
                this._jumpT += dt;
                this.group.position.x += this.jumpVel.x * dt;
                this.group.position.z += this.jumpVel.z * dt;
            } else if (this.isRunning) {
                const walkSpeed = 2.5, runSpeed = 9.75; // (the run: 30% faster than the first 7.5, as the author asked)
                // (on one leg: hopping, no running; Dismember sets limbSpeed / canRun; runBonus: a caught running book; armPump: the arms working)
                const speed = (walkSpeed + (runSpeed - walkSpeed) * (this.canRun === false ? 0 : this.runIntensity)) * (this.speedScale ?? 1) * (this.runBonus ?? 1) * (1 + this.armPump.bonus) * (this.armorRun ?? 1) * (this.limbSpeed ?? 1) * (this.slowScale ?? 1) * walkK(this.gravityK); // (a heavy planet: slower)
                const moveDistance = speed * dt;
                this.group.position.z -= Math.cos(this.group.rotation.y) * moveDistance;
                this.group.position.x -= Math.sin(this.group.rotation.y) * moveDistance;
            }
            // swimming: the arms' strokes push the body through the water (Swimming.js)
            if (this.swimVel && this.swimY != null) {
                this.group.position.x += this.swimVel.x * dt;
                this.group.position.z += this.swimVel.z * dt;
            }
            // Ground following + gravity (flat ground keeps the original baseY exactly)
            // the floor under the feet (not a ceiling / roof / cave rock above)
            const feetNow = this.group.position.y - PLAYER_GROUND_OFFSET + this.bodyDrop();
            // (going up a step the body eases up after the feet: they reach from the floor they stand on)
            const reach = (this.onGround && this.swimY == null ? Math.max(feetNow, Math.min(this.groundY, feetNow + 1.1)) : feetNow) + 1.1;
            const px = this.group.position.x, pz = this.group.position.z;
            const ground = collision ? (this.stepBoxes && collision.standAt ? collision.standAt(px, pz, reach) : collision.groundAt ? collision.groundAt(px, pz, reach) : collision.groundY(px, pz)) : -0.5;
            this.groundY = ground;
            const crouchDrop = this.knockedDown ? 1.45 * (1 - (this.liftUp || 0)) : this.bodyDrop();
            const targetY = ground + PLAYER_GROUND_OFFSET - crouchDrop;
            const y = this.group.position.y;
            if (this.swimY != null) {
                // Swimming: the water holds the body (Swimming.js decides how high)
                this.verticalVelocity = 0;
                this.onGround = false;
                this.airTop = null;
                this.group.position.y += (Math.max(this.swimY, targetY) - y) * Math.min(1, 6 * dt);
            } else if (inAir(y, targetY, this.isCrouching, this.jumpAir, this.verticalVelocity)) {
                // Falling into a crater / off a ledge (or up in a jump, or thrown up: «Up», a vortex) — the hero's gravity
                this.airTop = Math.max(this.airTop ?? y, y);
                this.verticalVelocity -= G * this.gravityK * dt;
                let ny = y + this.verticalVelocity * dt;
                // (thrown up under a cave roof / a ceiling: the head stops at the rock, never in it)
                if (collision?.ceilingAt) {
                    const roof = collision.ceilingAt(this.group.position.x, this.group.position.z, feetNow + 1.1) - HEAD_ROOM + PLAYER_GROUND_OFFSET - this.bodyDrop();
                    if (ny > roof) { ny = Math.max(roof, targetY); if (this.verticalVelocity > 0) this.verticalVelocity = 0; }
                }
                this.group.position.y = Math.max(targetY, ny);
                this.onGround = this.group.position.y <= targetY + 1e-3;
                if (this.onGround) {
                    // (how far it fell and how fast it hit the ground: a high fall knocks over — Knockdown.js)
                    // (the drop as it would hurt on Earth: a long slow fall on the Moon is a soft one)
                    this.landing = { drop: (this.airTop - this.group.position.y) * this.gravityK, speed: -this.verticalVelocity, at: performance.now(), jump: this.jumpAir };
                    this.jumpAir = false;
                    this.airTop = null;
                    this.verticalVelocity = 0;
                }
            } else {
                // (the last bit of a fall is eased onto the ground here: it lands now)
                if (this.airTop != null) this.landing = { drop: (this.airTop - targetY) * this.gravityK, speed: -this.verticalVelocity, at: performance.now() };
                this.verticalVelocity = 0;
                this.airTop = null;
                this.onGround = true;
                this.group.position.y += (targetY - y) * Math.min(1, 10 * dt);
            }
            // how fast the body walks (smoothed): a jump carries it on
            if (dt > 0 && !this.jumpAir) {
                const k = Math.min(1, dt * 4), dx = this.group.position.x - fromX, dz = this.group.position.z - fromZ;
                const far = dx * dx + dz * dz > 25 * dt * dt * 100; // (teleported, not walked)
                this._planar.x += ((far ? 0 : dx / dt) - this._planar.x) * k;
                this._planar.z += ((far ? 0 : dz / dt) - this._planar.z) * k;
            }
        }

        if (this.legPose) {
            // on a surfboard: one leg on the deck, the other paddling (or both bent, standing)
            const k = Math.min(1, 10 * dt);
            this.leftLegPivot.rotation.x += ((this.legPose.left?.hip || 0) - this.leftLegPivot.rotation.x) * k;
            this.rightLegPivot.rotation.x += ((this.legPose.right?.hip || 0) - this.rightLegPivot.rotation.x) * k;
        } else if (this.swimming) {
            // in deep water: the legs kick (flutter) as the arms swim, gently treading water when still
            const m = this.swimMove || 0;
            this.runCycle += dt * (3 + 6 * m);
            const k = Math.min(1, 8 * dt);
            const kick = Math.sin(this.runCycle) * (0.12 + 0.3 * m);
            this.leftLegPivot.rotation.x += (kick - this.leftLegPivot.rotation.x) * k;
            this.rightLegPivot.rotation.x += (-kick - this.rightLegPivot.rotation.x) * k;
        } else if (this.flying) {
            // Superman: legs straight back, slight flutter
            this.runCycle += dt * 6;
            const k = Math.min(1, 6 * dt);
            const flutter = Math.sin(this.runCycle) * 0.05;
            this.leftLegPivot.rotation.x += (flutter - this.leftLegPivot.rotation.x) * k;
            this.rightLegPivot.rotation.x += (-flutter - this.rightLegPivot.rotation.x) * k;
        } else if (this.jumpAir) {
            // in a jump: the knees come up a little, both legs together
            const k = Math.min(1, 10 * dt);
            const tuck = this.verticalVelocity > 0 ? -0.55 : -0.25;
            this.leftLegPivot.rotation.x += (tuck - this.leftLegPivot.rotation.x) * k;
            this.rightLegPivot.rotation.x += (tuck - this.rightLegPivot.rotation.x) * k;
        } else if (this.isRunning || this.stepping > 0) {
            const intensity = this.isRunning ? this.runIntensity : 0.6;
            const animSpeed = 8 + (intensity * 12);
            this.runCycle += dt * animSpeed;
            const swingAmplitude = 0.5 + (intensity * 0.3);
            const legSwing = Math.sin(this.runCycle) * swingAmplitude;
            this.leftLegPivot.rotation.x = legSwing + crouchAngle;
            this.rightLegPivot.rotation.x = -legSwing + crouchAngle;
        } else {
            const k = Math.min(1, 10 * dt);
            this.leftLegPivot.rotation.x += (crouchAngle - this.leftLegPivot.rotation.x) * k;
            this.rightLegPivot.rotation.x += (crouchAngle - this.rightLegPivot.rotation.x) * k;
        }

        // Hands pushed by collisions spring back (realistic resistance)
        const spring = Math.min(1, 15 * dt);
        for (const h of [this.leftSimplifiedHand, this.rightSimplifiedHand]) {
            const rest = h.group.userData.restOffset; // set by the camera/hand setup screen
            h.group.position.x += ((rest ? rest.x : 0) - h.group.position.x) * spring;
            h.group.position.y += ((rest ? rest.y : 0) - h.group.position.y) * spring;
            h.group.position.z += (this.BONE_LENGTH_LOWER + (rest ? rest.z : 0) - h.group.position.z) * spring;
        }
    }

    /**
     * Show this hand held `worldDelta` away from where it is tracked (it rests on something —
     * a body it pushes, a shield taking a spell); springs back by itself next frames.
     */
    setHandOffset(side, worldDelta, max = 0.6) {
        const hand = this.getActiveHands()[side];
        if (!hand || !hand.group.parent) return;
        _v1.copy(worldDelta).clampLength(0, max);
        hand.group.parent.getWorldQuaternion(_q1).invert();
        _v1.applyQuaternion(_q1);
        const rest = hand.group.userData.restOffset;
        hand.group.position.set((rest?.x || 0) + _v1.x, (rest?.y || 0) + _v1.y, this.BONE_LENGTH_LOWER + (rest?.z || 0) + _v1.z);
    }

    getPosition(out = new THREE.Vector3()) { return out.copy(this.group.position); }
    getRotation() { return this.group.rotation; }
    setBodyRotation(yaw) { this.group.rotation.y = yaw; }

    updateHeadRotation(yaw, pitch) {
        this.head.rotation.y = yaw;
        this.head.rotation.x = pitch;
    }

    /**
     * First person: only one's own head is hidden from the camera (layer 1) — the eyes are in
     * it. The whole torso is there (EYES: it is below and behind the eyes, so looking ahead it
     * is out of sight, and looking down one sees the chest, the belly, the belt and the legs
     * going on from it — no emptiness).
     */
    setFirstPerson(isFPV) {
        this._fpv = isFPV;
        const layer = isFPV ? 1 : 0;
        this.head.traverse((c) => c.layers.set(layer));
        this.body.traverse((c) => c.layers.set(0));
        // (the clothes and the armour, ArmorLook: on the head hidden with it, on the torso seen)
        for (const p of [...(this._lookParts || []), ...(this._armorParts || [])]) {
            if (p.parent === this.head) p.traverse((c) => c.layers.set(layer));
            else if (p.parent === this.torso) p.traverse((c) => c.layers.set(0));
        }
        // the hidden head still casts its shadow (the renderer casts shadows only of what the
        // camera's layers show): an unseen double of it
        if (!this._headShadow) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.45, 1.25), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
            m.position.y = 0.1; // (the hair on top)
            m.castShadow = true;
            m.name = 'head-shadow';
            this.head.add(m);
            this._headShadow = m;
        }
        this._headShadow.layers.set(0);
        this._headShadow.visible = !!isFPV;
        if (this._bodyHidden) this._applyBodyLayer();
    }

    /**
     * In space (Space.js, first person): one's own torso and legs (and what is worn on them) unseen by one's
     * own camera — the body lies flat under the eyes there (Superman), and looking down one must see space
     * and the planets, not one's own back. The arms stay (they cast the spells); the shadow and the other
     * players still see the whole body.
     */
    setBodyHidden(on) {
        on = !!on;
        if (this._bodyHidden === on) return;
        this._bodyHidden = on;
        this._applyBodyLayer();
    }

    _applyBodyLayer() {
        const layer = this._bodyHidden && this._fpv ? 1 : 0;
        const set = (o) => o && o.traverse((c) => c.layers.set(layer));
        set(this.body); set(this.leftLegPivot); set(this.rightLegPivot);
        for (const p of [...(this._lookParts || []), ...(this._armorParts || [])]) if (p.parent === this.torso || p.parent === this.body || p.parent === this.leftLegPivot || p.parent === this.rightLegPivot) set(p);
    }

    /** Dress the hero (face, hair, clothes — see Appearance.js). */
    setLook(look) {
        applyLook(this, look);
        this.setFirstPerson(!!this._fpv);
    }

    /** The eyes (the first-person camera): from the neck's foot, turned with the head (NECK, EYES). */
    getHeadPosition(out = new THREE.Vector3()) {
        _q1.copy(_qId).slerp(this.head.quaternion, NECK_BEND);
        out.copy(EYES).applyQuaternion(_q1).add(NECK);
        this.torso.updateWorldMatrix(true, false);
        return this.torso.localToWorld(out);
    }

    getHeadQuaternion(out = new THREE.Quaternion()) {
        return this.head.getWorldQuaternion(out);
    }

    setShowHands(visible) {
        const v3 = this._simplified();
        // (a cut-off hand stays gone)
        const l = visible && !this.handLost('left'), r = visible && !this.handLost('right');
        this.leftSimplifiedHand.group.visible = v3 && l;
        this.rightSimplifiedHand.group.visible = v3 && r;
        this.leftDetailedHand.group.visible = !v3 && l;
        this.rightDetailedHand.group.visible = !v3 && r;
        this.handsVisible = visible;
    }

    /** Is this hand cut off (Dismember: any cut on that arm takes the hand)? */
    handLost(side) {
        return !!this.limbs && this.limbs[side + 'Arm'] != null;
    }

    /** How much lower the body is: crouching, or on the stumps with both legs cut off. */
    bodyDrop() {
        return Math.max(CROUCH.DROP * this.lowK, this.legDrop || 0) + heavySink(this.gravityK); // (a heavy planet: the knees give a little)
    }

    /** V3 (stable), V4 and V5 (the full hand, being finished) are all the voxel SimplifiedHand. */
    _simplified() { return this.handVersion === 'v3' || this.fullHand(); }

    /** V4 and V5: the full hand (every joint, any turn, the pen grip). V5 is V4's hand with the
     * camera program's own hand finder (hand_v5.py: the hands cut out where the body has them). */
    fullHand() { return this.handVersion === 'v4' || this.handVersion === 'v5'; }

    setHandVersion(version) {
        if (version !== 'v2' && version !== 'v3' && version !== 'v4' && version !== 'v5') return;
        this.handVersion = version;
        for (const h of [this.leftSimplifiedHand, this.rightSimplifiedHand]) h.setMode(this.fullHand() ? 'full' : 'stable');
        if (this.handsVisible) this.setShowHands(true);
    }

    setHandQuality(mode) {
        this.leftDetailedHand.setQuality(mode);
        this.rightDetailedHand.setQuality(mode);
    }

    getActiveHands() {
        return this._simplified()
            ? { left: this.leftSimplifiedHand, right: this.rightSimplifiedHand }
            : { left: this.leftDetailedHand, right: this.rightDetailedHand };
    }

    /**
     * Average finger closure 0..1 (index, middle, ring) as TRACKED — used for
     * grabbing/releasing. (The drawn fingers may be wrapped around a handle,
     * so the visual state must not be used here.)
     */
    getGripCurl(side) {
        if (this.handLost(side)) return 0;
        const hand = this.getActiveHands()[side];
        if (!hand) return 0;
        const f = (hand.targetState || hand.currentState).fingers;
        // a real stick seen in the real hand (RealStick.js): the fingers are closed round it
        if (this.realStick?.[side]) return Math.max(0.85, (f.index + f.middle + f.ring) / 3);
        return (f.index + f.middle + f.ring) / 3;
    }

    /**
     * How closed a hand is round something it takes by an edge (a book's cover, a scroll's
     * roller): the index finger counts as much as the others — a pointing hand (the index
     * out to turn a page, the others in) holds nothing.
     */
    getHoldCurl(side) {
        if (this.handLost(side)) return 0;
        const hand = this.getActiveHands()[side];
        if (!hand) return 0;
        const f = (hand.targetState || hand.currentState).fingers;
        return Math.min(f.index, (f.middle + f.ring) / 2);
    }

    // ------------------------------------------------------------- networking
    /** Compact pose snapshot for multiplayer. */
    serializePose() {
        const q = (o) => [r3(o.quaternion.x), r3(o.quaternion.y), r3(o.quaternion.z), r3(o.quaternion.w)];
        return {
            p: [r2(this.group.position.x), r2(this.group.position.y), r2(this.group.position.z)],
            ry: r3(this.group.rotation.y),
            rx: r3(this.group.rotation.x),
            hy: r3(this.head.rotation.y),
            hp: r3(this.head.rotation.x),
            la: q(this.leftArmAnchor), le: q(this.leftElbowAnchor),
            ra: q(this.rightArmAnchor), re: q(this.rightElbowAnchor),
            run: this.isRunning || this.stepping > 0 ? r2(this.isRunning ? this.runIntensity : 0.6) : -1,
            cr: this.lowK > 0.01 ? r2(this.lowK) : 0, // (how much lower: a squat is 1)
            jp: this.jumpAir ? (this.verticalVelocity > 0 ? 2 : 1) : undefined, // (up in a jump: the legs tucked)
            kd: this.knockedDown ? (KD[this.fallDir] || 1) : 0,
            tb: this.knockedDown && this.tumbleAng ? r3(this.tumbleAng) : undefined, // (flipping over in the air: «Джолт»)
            ku: this.knockedDown && this.liftUp > 0 ? r2(this.liftUp) : undefined,
            sg: this.stepping > 0 ? [r2(this.staggerLean || 0), r2(this.staggerRoll || 0)] : undefined,
            lg: this.legPose ? [r3(this.legPose.left?.hip || 0), r3(this.legPose.right?.hip || 0)] : undefined, // (on a surfboard)
            rz: this.boardRoll ? r3(this.boardRoll) : undefined,
            sw: this.swimming ? r2(this.swimMove || 0) : undefined, // (in deep water: how hard the legs kick)
            lh: this.leftSimplifiedHand.serializeState(),
            rh: this.rightSimplifiedHand.serializeState(),
        };
    }

    dispose() {
        this.scene.remove(this.group);
        this.group.traverse((o) => {
            if (o.isMesh || o.isInstancedMesh) {
                o.geometry?.dispose();
                if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
                else o.material?.dispose();
            }
        });
    }
}

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

