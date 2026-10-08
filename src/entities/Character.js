/**
 * Character.js — the voxel player avatar (local player and remote players).
 *
 * Geometry, sizes, colours and the lookAt arm-tracking maths are the original
 * ones. The rewrite removes all per-frame allocations, adds terrain following
 * (mountains / craters) and exposes clean accessors for weapons and network.
 */

import * as THREE from 'three';
import { SimplifiedHand } from './SimplifiedHand.js';
import { DetailedHand } from './DetailedHand.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qBody = new THREE.Quaternion();
const _up = new THREE.Vector3();

// Ground at y=-0.5 corresponded to group.y = 1.5 (baseY) in the original.
export const PLAYER_GROUND_OFFSET = 2.0;

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
        this.runIntensity = 0;
        this.baseY = 1.5;
        this.groundY = -0.5;
        this.verticalVelocity = 0;
        this.onGround = true;

        this.BONE_LENGTH_UPPER = 1.0;
        this.BONE_LENGTH_LOWER = 0.9;

        this.handVersion = 'v3';
        this.handsVisible = false;
        this.handVelocity = { left: new THREE.Vector3(), right: new THREE.Vector3() };
        this._lastHandPos = { left: null, right: null };

        this.createCharacter();
        this.scene.add(this.group);
        this.group.position.set(0, this.baseY, 0);
        // Yaw first, then tilt (flight). Identical to the old order while upright.
        this.group.rotation.order = 'YXZ';
        this.flightTilt = 0;
        this.flying = false;
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

        const legGeo = new THREE.BoxGeometry(0.5, 1.2, 0.5);
        const legMat = new THREE.MeshLambertMaterial({ color: this.pantsColor });
        this.leftLegPivot.position.set(-0.3, -0.75, 0);
        this.group.add(this.leftLegPivot);
        const leftLeg = new THREE.Mesh(legGeo, legMat);
        leftLeg.position.y = -0.6;
        this.leftLegPivot.add(leftLeg);
        this.rightLegPivot.position.set(0.3, -0.75, 0);
        this.group.add(this.rightLegPivot);
        const rightLeg = new THREE.Mesh(legGeo, legMat);
        rightLeg.position.y = -0.6;
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
        // 0.2 per frame at 60 FPS, frame-rate independent
        const armK = 1 - Math.pow(0.8, Math.min(0.1, dt) * 60);
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
        if (this.handVersion === 'v3') {
            if (this.leftSimplifiedHand.group.visible) this.leftSimplifiedHand.update(poseData.leftHandLandmarks || null, this.group.rotation.y);
            if (this.rightSimplifiedHand.group.visible) this.rightSimplifiedHand.update(poseData.rightHandLandmarks || null, this.group.rotation.y);
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
        if (!l.valid && !r.valid) return null;
        let side = 'right';
        if (l.valid && r.valid) side = l.height >= r.height ? 'left' : 'right';
        else if (l.valid) side = 'left';
        const bothLevel = l.valid && r.valid && Math.abs(l.height - r.height) < 0.3;
        return { side, bothLevel };
    }

    /** Both wrists above the top of the head ("руки вверх") — the flight gesture. */
    areBothHandsUp() {
        this.group.updateMatrixWorld(true);
        this.group.getWorldQuaternion(_qBody);
        _up.set(0, 1, 0).applyQuaternion(_qBody);
        this.head.getWorldPosition(_v3);
        // hands at about forehead height or higher count as "up"
        const headTop = _v3.sub(this.group.position).dot(_up) - 0.15;
        const h = (elbowAnchor) => _v1.set(0, 0, this.BONE_LENGTH_LOWER).applyMatrix4(elbowAnchor.matrixWorld).sub(this.group.position).dot(_up);
        return h(this.leftElbowAnchor) > headTop && h(this.rightElbowAnchor) > headTop;
    }

    /** Arm stretched out (hand far from the shoulder) — the shield gesture. */
    isArmExtended(side) {
        const shoulder = (side === 'left' ? this.leftArmAnchor : this.rightArmAnchor).getWorldPosition(_v3);
        const hand = this.getHandWorldPosition(side, _v1);
        return hand.distanceTo(shoulder) > 0.82 * (this.BONE_LENGTH_UPPER + this.BONE_LENGTH_LOWER);
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
        const anchor = side === 'left' ? this.leftElbowAnchor : this.rightElbowAnchor;
        anchor.updateMatrixWorld(true);
        anchor.getWorldPosition(_v1);
        out.set(0, 0, this.BONE_LENGTH_LOWER).applyMatrix4(anchor.matrixWorld);
        return out.sub(_v1).normalize();
    }

    getHandWorldPosition(side, out = new THREE.Vector3()) {
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

    setIdlePose() {
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

    /**
     * @param {number} dt
     * @param {CollisionWorld|null} collision  for ground height (mountains, craters)
     * @param {boolean} move  false for remote avatars (position comes from network)
     */
    update(dt, collision = null, move = true) {
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

        // Crouching lowers the body by 1 m: the legs fold back (kneeling) so they stay above the ground
        const crouchAngle = this.isCrouching ? -1.35 : 0;

        if (move) {
            // Movement (original speeds)
            if (this.isRunning) {
                const walkSpeed = 2.5, runSpeed = 7.5;
                const speed = walkSpeed + (runSpeed - walkSpeed) * this.runIntensity;
                const moveDistance = speed * dt;
                this.group.position.z -= Math.cos(this.group.rotation.y) * moveDistance;
                this.group.position.x -= Math.sin(this.group.rotation.y) * moveDistance;
            }
            // Ground following + gravity (flat ground keeps the original baseY exactly)
            const ground = collision ? collision.groundY(this.group.position.x, this.group.position.z) : -0.5;
            this.groundY = ground;
            const crouchDrop = this.isCrouching ? 1.0 : 0;
            const targetY = ground + PLAYER_GROUND_OFFSET - crouchDrop;
            const y = this.group.position.y;
            if (y > targetY + 0.6 && !this.isCrouching) {
                // Falling into a crater / off a ledge
                this.verticalVelocity -= 20 * dt;
                this.group.position.y = Math.max(targetY, y + this.verticalVelocity * dt);
                this.onGround = this.group.position.y <= targetY + 1e-3;
                if (this.onGround) this.verticalVelocity = 0;
            } else {
                this.verticalVelocity = 0;
                this.onGround = true;
                this.group.position.y += (targetY - y) * Math.min(1, 10 * dt);
            }
        }

        if (this.flying) {
            // Superman: legs straight back, slight flutter
            this.runCycle += dt * 6;
            const k = Math.min(1, 6 * dt);
            const flutter = Math.sin(this.runCycle) * 0.05;
            this.leftLegPivot.rotation.x += (flutter - this.leftLegPivot.rotation.x) * k;
            this.rightLegPivot.rotation.x += (-flutter - this.rightLegPivot.rotation.x) * k;
        } else if (this.isRunning) {
            const animSpeed = 8 + (this.runIntensity * 12);
            this.runCycle += dt * animSpeed;
            const swingAmplitude = 0.5 + (this.runIntensity * 0.3);
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

    getPosition(out = new THREE.Vector3()) { return out.copy(this.group.position); }
    getRotation() { return this.group.rotation; }
    setBodyRotation(yaw) { this.group.rotation.y = yaw; }

    updateHeadRotation(yaw, pitch) {
        this.head.rotation.y = yaw;
        this.head.rotation.x = pitch;
    }

    /** First person: hide own head/body from the camera (layer 1) but keep the shadow. */
    setFirstPerson(isFPV) {
        const layer = isFPV ? 1 : 0;
        this.head.traverse((c) => c.layers.set(layer));
        this.body.traverse((c) => c.layers.set(layer));
    }

    getHeadPosition(out = new THREE.Vector3()) {
        this.head.getWorldPosition(out);
        this.head.getWorldQuaternion(_q1);
        _v1.set(0, -0.5, -0.4).applyQuaternion(_q1);
        return out.add(_v1);
    }

    getHeadQuaternion(out = new THREE.Quaternion()) {
        return this.head.getWorldQuaternion(out);
    }

    setShowHands(visible) {
        const v3 = this.handVersion === 'v3';
        this.leftSimplifiedHand.group.visible = v3 && visible;
        this.rightSimplifiedHand.group.visible = v3 && visible;
        this.leftDetailedHand.group.visible = !v3 && visible;
        this.rightDetailedHand.group.visible = !v3 && visible;
        this.handsVisible = visible;
    }

    setHandVersion(version) {
        if (version !== 'v2' && version !== 'v3') return;
        this.handVersion = version;
        if (this.handsVisible) this.setShowHands(true);
    }

    setHandQuality(mode) {
        this.leftDetailedHand.setQuality(mode);
        this.rightDetailedHand.setQuality(mode);
    }

    getActiveHands() {
        return this.handVersion === 'v3'
            ? { left: this.leftSimplifiedHand, right: this.rightSimplifiedHand }
            : { left: this.leftDetailedHand, right: this.rightDetailedHand };
    }

    /**
     * Average finger closure 0..1 (index, middle, ring) as TRACKED — used for
     * grabbing/releasing. (The drawn fingers may be wrapped around a handle,
     * so the visual state must not be used here.)
     */
    getGripCurl(side) {
        const hand = this.getActiveHands()[side];
        if (!hand) return 0;
        const f = (hand.targetState || hand.currentState).fingers;
        return (f.index + f.middle + f.ring) / 3;
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
            run: this.isRunning ? r2(this.runIntensity) : -1,
            cr: this.isCrouching ? 1 : 0,
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

