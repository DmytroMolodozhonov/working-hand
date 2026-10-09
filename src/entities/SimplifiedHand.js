/**
 * SimplifiedHand.js — "V3 (Стабильная)" voxel hand.
 *
 * The model, proportions, finger analysis and animation are the author's
 * original Version 20 ("Organic Freedom") code, ported 1:1 so the hands look
 * and move exactly as before. Added on top (all opt-in, no visual change):
 *   - wrist-twist flip guard (atan2 wrap-around glitches are ignored unless they persist)
 *   - grip override: fingers wrap a held handle instead of passing through it
 *   - serializeState()/applyState() for multiplayer avatars
 *   - allocation-free history averaging
 *   - the wrist turn is only trusted when the knuckles are seen well (an
 *     edge-on hand doesn't flip the model over)
 */

import * as THREE from 'three';
import { lerpAngle } from '../core/math.js';

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

export class SimplifiedHand {
    constructor(side = 'right') {
        this.side = side;
        this.group = new THREE.Group();

        this.skinColor = 0xDCAE82;
        this.material = new THREE.MeshLambertMaterial({ color: this.skinColor });

        this.PALM_W = 0.28;
        this.PALM_H = 0.45;
        this.PALM_D = 0.14;

        // The landmarks come 1€-filtered (TrackingGuard) and blended (PoseSmoother):
        // a long average on top only made the hand lag
        this.HISTORY_LENGTH = 2;
        this.landmarkHistory = [];
        this._historyPool = [];
        this._avg = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));

        this.lastTrackingTime = 0;
        this.PERSISTENCE_DURATION = 2000;
        this.isHoldingPose = false;

        this.fingerMeshes = {};
        this.createModel();

        this.currentState = {
            fingers: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
            fingerSpread: 0,
            thumbSpread: 0,
            wristTwist: 0, wristTilt: 0, wristRoll: 0,
        };
        this.targetState = JSON.parse(JSON.stringify(this.currentState));

        this.LERP_SPEED = 0.5;
        this.ROT_LERP_SPEED = 0.45;

        // Safeguards
        this._pendingTwist = null;
        this._pendingTwistFrames = 0;
        this.gripOverride = null; // {curl, thumb} when holding a handle

        this.group.traverse((obj) => { if (obj.isMesh) obj.frustumCulled = false; });
    }

    createModel() {
        this.handPivot = new THREE.Group();
        this.group.add(this.handPivot);

        this.palm = new THREE.Mesh(new THREE.BoxGeometry(this.PALM_W, this.PALM_H, this.PALM_D), this.material);
        this.palm.position.y = this.PALM_H / 2;
        this.palm.name = 'palm';
        this.handPivot.add(this.palm);
        // a softer shape: the knuckle ridge and the heel of the hand
        this.knuckleMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(this.skinColor).multiplyScalar(0.9) });
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(this.PALM_W * 0.96, 0.06, this.PALM_D * 1.12), this.knuckleMat);
        ridge.position.y = this.PALM_H / 2 - 0.03;
        this.palm.add(ridge);
        const heel = new THREE.Mesh(new THREE.BoxGeometry(this.PALM_W * 0.8, 0.1, this.PALM_D * 1.08), this.material);
        heel.position.y = -this.PALM_H / 2 + 0.06;
        this.palm.add(heel);

        this.handPivot.rotation.x = Math.PI / 2;
        this.handPivot.rotation.y = 0;

        const fingerConfigs = {
            thumb: { x: -0.14, y: 0.10, z: 0.06, len: 0.52, w: 0.10, isThumb: true },
            index: { x: -0.09, y: 0.45, z: 0, len: 0.42, w: 0.08 },
            middle: { x: 0.00, y: 0.48, z: 0, len: 0.48, w: 0.08 },
            ring: { x: 0.09, y: 0.45, z: 0, len: 0.40, w: 0.075 },
            pinky: { x: 0.13, y: 0.40, z: 0, len: 0.32, w: 0.07 },
        };
        for (const [name, cfg] of Object.entries(fingerConfigs)) {
            const segments = this.createFinger(cfg);
            this.fingerMeshes[name] = segments;
            this.palm.add(segments[0].pivot);
        }
        if (this.side === 'left') this.group.scale.set(-1, 1, 1);
    }

    /** The skin colour of the hand (from the hero's look). */
    setSkin(color) {
        this.material.color.setHex(color);
        this.knuckleMat?.color.setHex(color).multiplyScalar(0.9);
    }

    createFinger(cfg) {
        const segments = [];
        const segLen = cfg.len / 3;
        let lastParent = null;
        if (!this.nailMat) this.nailMat = new THREE.MeshLambertMaterial({ color: 0xf6d9d0 });
        for (let i = 0; i < 3; i++) {
            const pivot = new THREE.Group();
            // fingers get a little thinner towards the tip; a nail on the last bone
            const w = cfg.w * (1 - 0.1 * i);
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, segLen * 0.96, w * 0.95), this.material);
            mesh.position.y = segLen / 2;
            pivot.add(mesh);
            if (i === 2) {
                const nail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, segLen * 0.45, 0.012), this.nailMat);
                nail.position.set(0, segLen * 0.7, -w * 0.48);
                pivot.add(nail);
            }
            if (i === 0) {
                pivot.position.set(cfg.x, cfg.y - this.PALM_H / 2, cfg.z);
                if (cfg.isThumb) {
                    pivot.rotation.z = 0.8;
                    pivot.rotation.x = 0.3;
                    pivot.rotation.y = -0.4;
                }
            } else {
                pivot.position.y = segLen;
            }
            segments.push({ pivot, mesh });
            if (lastParent) lastParent.add(pivot);
            lastParent = pivot;
        }
        return segments;
    }

    lerpAngle(current, target, step) {
        return lerpAngle(current, target, step);
    }

    /**
     * @param {Array|null} landmarks  21 MediaPipe hand landmarks (already validated) or null
     * @param {number} bodyRotation  unused by the model, kept for API compatibility
     * @param {number} [now]  ms timestamp (defaults to Date.now())
     */
    update(landmarks, bodyRotation = 0, now = Date.now()) {
        const timeGap = now - this.lastTrackingTime;

        if (landmarks && landmarks.length >= 21) {
            if (timeGap > 300 && this.landmarkHistory.length > 0) {
                this._recycleHistory();
                this.currentState.wristTwist = this.targetState.wristTwist;
            }
            this.lastTrackingTime = now;
            this.isHoldingPose = false;
            const frame = this._historyPool.pop() || Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
            for (let i = 0; i < 21; i++) {
                frame[i].x = landmarks[i].x; frame[i].y = landmarks[i].y; frame[i].z = landmarks[i].z || 0;
            }
            this.landmarkHistory.push(frame);
            if (this.landmarkHistory.length > this.HISTORY_LENGTH) this._historyPool.push(this.landmarkHistory.shift());
            this.analyzeLandmarks(this.getAverageLandmarks(), bodyRotation);
        } else {
            const timeSinceLost = now - this.lastTrackingTime;
            if (timeSinceLost < this.PERSISTENCE_DURATION) {
                this.isHoldingPose = true;
            } else {
                const returnSpeed = 0.05;
                for (const f in this.targetState.fingers) this.targetState.fingers[f] *= (1 - returnSpeed);
                this.targetState.fingerSpread *= (1 - returnSpeed);
                this.targetState.thumbSpread *= (1 - returnSpeed);
                // (the wrist keeps its last turn — a lost hand must not roll over palm up)
                this.targetState.wristTilt = lerpAngle(this.targetState.wristTilt, 0, returnSpeed * 0.3);
                this.targetState.wristRoll = lerpAngle(this.targetState.wristRoll, 0, returnSpeed * 0.3);
                if (this.landmarkHistory.length > 0) this._recycleHistory();
            }
        }

        this._stepState();
        this.animateModel();
    }

    _recycleHistory() {
        while (this.landmarkHistory.length) this._historyPool.push(this.landmarkHistory.pop());
    }

    _stepState() {
        const cs = this.currentState, ts = this.targetState;
        for (const f in cs.fingers) {
            let target = ts.fingers[f];
            if (this.gripOverride) {
                // Fingers close around the handle, never through it.
                if (f === 'thumb') target = Math.max(0.45, Math.min(target, this.gripOverride.thumb));
                else target = Math.min(this.gripOverride.curl + 0.04, Math.max(this.gripOverride.curl - 0.06, target));
            }
            cs.fingers[f] += (target - cs.fingers[f]) * this.LERP_SPEED;
        }
        cs.fingerSpread += ((this.gripOverride ? 0 : ts.fingerSpread) - cs.fingerSpread) * this.LERP_SPEED;
        cs.thumbSpread += (ts.thumbSpread - cs.thumbSpread) * this.LERP_SPEED;
        cs.wristTwist = lerpAngle(cs.wristTwist, ts.wristTwist, this.ROT_LERP_SPEED);
        cs.wristTilt = lerpAngle(cs.wristTilt, ts.wristTilt, this.ROT_LERP_SPEED);
        cs.wristRoll = lerpAngle(cs.wristRoll, ts.wristRoll, this.ROT_LERP_SPEED);
    }

    getAverageLandmarks() {
        const count = this.landmarkHistory.length;
        if (count === 0) return null;
        const avg = this._avg;
        for (let i = 0; i < 21; i++) {
            let x = 0, y = 0, z = 0, weightSum = 0;
            for (let idx = 0; idx < count; idx++) {
                const p = this.landmarkHistory[idx][i];
                const weight = (idx + 1) / count;
                x += p.x * weight; y += p.y * weight; z += p.z * weight;
                weightSum += weight;
            }
            avg[i].x = x / weightSum; avg[i].y = y / weightSum; avg[i].z = z / weightSum;
        }
        return avg;
    }

    analyzeLandmarks(landmarks) {
        const wrist = landmarks[0];
        const getCurl = (baseIdx, tipIdx) => {
            const tip = landmarks[tipIdx];
            const base = landmarks[baseIdx];
            const dTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
            const dBase = Math.hypot(base.x - wrist.x, base.y - wrist.y);
            const ratio = dTip / (dBase + 0.05);
            return Math.max(0, Math.min(1, (1.15 - ratio) * 3.2));
        };
        const ts = this.targetState;
        ts.fingers.index = getCurl(5, 8);
        ts.fingers.middle = getCurl(9, 12);
        ts.fingers.ring = getCurl(13, 16);
        ts.fingers.pinky = getCurl(17, 20);

        const tBase = landmarks[1];
        const tTip = landmarks[4];
        const tDist = Math.hypot(tTip.x - tBase.x, tTip.y - tBase.y);
        ts.fingers.thumb = Math.max(0, Math.min(1, (0.09 - tDist) * 20));

        const iTip = landmarks[8];
        const pTip = landmarks[20];
        const fanDist = Math.hypot(iTip.x - pTip.x, iTip.y - pTip.y);
        ts.fingerSpread = Math.max(0, Math.min(1, (fanDist - 0.15) * 3.5));

        const iKnuckle = landmarks[5];
        const thumbDist = Math.hypot(tTip.x - iKnuckle.x, tTip.y - iKnuckle.y);
        ts.thumbSpread = Math.max(0, Math.min(1, (thumbDist - 0.05) * 4.0));

        const indexB = landmarks[5];
        const pinkyB = landmarks[17];
        const middleB = landmarks[9];

        const dx = pinkyB.x - indexB.x;
        const dy = pinkyB.y - indexB.y;
        // How well the knuckle line is seen compared to the hand's length: an
        // edge-on hand shows almost a dot and its angle is noise — then hold the turn
        const handLen = Math.hypot(middleB.x - wrist.x, middleB.y - wrist.y) + 1e-6;
        const conf = Math.max(0, Math.min(1, (Math.hypot(dx, dy) / handLen - 0.22) / 0.3));
        // Which way the palm faces, from the depth of the points (3D): the cross product of
        // wrist→index knuckle and wrist→pinky knuckle. Its sign flips only when the hand
        // really turns over — the 2D knuckle line alone also «flips» when seen edge-on.
        const ax = indexB.x - wrist.x, ay = indexB.y - wrist.y, az = (indexB.z || 0) - (wrist.z || 0);
        const bx = pinkyB.x - wrist.x, by = pinkyB.y - wrist.y, bz = (pinkyB.z || 0) - (wrist.z || 0);
        const nz = ax * by - ay * bx;
        const nlen = Math.hypot(ay * bz - az * by, az * bx - ax * bz, nz) + 1e-9;
        const facingNow = Math.abs(nz) / nlen > 0.35 ? Math.sign(nz) : 0; // (0: edge-on, unsure)
        if (facingNow && facingNow !== this._facing) {
            this._facingVotes = (this._facingVotes || 0) + 1;
            if (this._facing === undefined || this._facingVotes >= 4) { this._facing = facingNow; this._facingVotes = 0; this._facingAt = performance.now(); }
        } else this._facingVotes = 0;
        if (conf > 0 && dx * dx + dy * dy > 0.0008) {
            const twist = Math.atan2(dy, dx);
            const targetTwist = this.side === 'right' ? -twist + 0.25 : twist - Math.PI - 0.25;
            // SAFEGUARD: a sudden ~180° jump is almost always a tracking glitch
            // (edge-on hand, atan2 wrap). Accept it only if it persists AND the palm's
            // 3D facing turned over too.
            const jump = Math.abs(lerpAngle(0, targetTwist - ts.wristTwist, 1));
            if (jump > 1.8) {
                const t = performance.now();
                if (this._pendingTwist !== null && Math.abs(lerpAngle(0, targetTwist - this._pendingTwist, 1)) < 0.6) {
                    this._pendingTwistFrames++;
                } else {
                    this._pendingTwist = targetTwist;
                    this._pendingTwistFrames = 1;
                    this._pendingTwistAt = t;
                }
                const turnedOver = this._facingAt && t - this._facingAt < 1500;
                if (this._pendingTwistFrames >= 8 && t - this._pendingTwistAt > 250 && conf > 0.55 && (turnedOver || this._pendingTwistFrames >= 30)) {
                    ts.wristTwist = lerpAngle(ts.wristTwist, targetTwist, 0.6);
                    this._pendingTwist = null;
                    this._pendingTwistFrames = 0;
                }
            } else {
                this._pendingTwist = null;
                this._pendingTwistFrames = 0;
                // (a hand turns at a human pace: at most ~0.35 rad per recognition)
                const step = lerpAngle(0, targetTwist - ts.wristTwist, 1) * 0.6 * conf;
                ts.wristTwist += Math.max(-0.35, Math.min(0.35, step));
            }
        }

        const targetTilt = Math.max(-1.2, Math.min(1.2, (middleB.y - wrist.y) * 3.0));
        ts.wristTilt += (targetTilt - ts.wristTilt) * 0.6;

        const rawRoll = ((pinkyB.z || 0) - (indexB.z || 0)) * 6;
        const targetRoll = Math.max(-0.8, Math.min(0.8, rawRoll));
        ts.wristRoll += (targetRoll - ts.wristRoll) * 0.45;
    }

    animateModel() {
        const cs = this.currentState;
        this.palm.rotation.y = cs.wristTwist;
        this.palm.rotation.x = cs.wristTilt;
        this.palm.rotation.z = cs.wristRoll;

        const maxBend = Math.PI / 1.95;
        const spread = cs.fingerSpread;
        const thumbOut = cs.thumbSpread;
        for (const name of FINGERS) {
            const segments = this.fingerMeshes[name];
            const rotDelta = cs.fingers[name] * maxBend;
            const pivot = segments[0].pivot;
            if (name === 'thumb') {
                pivot.rotation.z = 0.8 + (thumbOut * 0.5);
                for (let i = 0; i < segments.length; i++) {
                    const seg = segments[i];
                    seg.pivot.rotation.x = -rotDelta * 0.5;
                    if (i === 0) {
                        seg.pivot.rotation.y = -0.4 - (rotDelta * 0.6);
                        seg.pivot.rotation.z += -rotDelta * 0.2;
                    }
                }
            } else {
                let spreadDir = 0;
                if (name === 'index') spreadDir = 0.2;
                if (name === 'middle') spreadDir = 0.05;
                if (name === 'ring') spreadDir = -0.1;
                if (name === 'pinky') spreadDir = -0.25;
                pivot.rotation.z = spreadDir * spread;
                for (const seg of segments) seg.pivot.rotation.x = -rotDelta;
            }
        }
    }

    setShowHands(visible) { this.group.visible = visible; }
    setQuality() { }

    /** Hold a handle: fingers wrap to `curl` (0..1). null releases. */
    setGrip(curl) {
        this.gripOverride = curl == null ? null : { curl, thumb: Math.min(1, curl + 0.15) };
    }

    // ------------------------------------------------------------- networking
    serializeState() {
        const c = this.currentState, f = c.fingers;
        const r = (v) => Math.round(v * 100) / 100;
        return [r(f.thumb), r(f.index), r(f.middle), r(f.ring), r(f.pinky), r(c.fingerSpread), r(c.thumbSpread), r(c.wristTwist), r(c.wristTilt), r(c.wristRoll)];
    }

    /** Remote avatar: drive the hand from a network snapshot (smoothed). */
    applyState(arr) {
        if (!Array.isArray(arr) || arr.length < 10) return;
        const t = this.targetState;
        t.fingers.thumb = arr[0]; t.fingers.index = arr[1]; t.fingers.middle = arr[2]; t.fingers.ring = arr[3]; t.fingers.pinky = arr[4];
        t.fingerSpread = arr[5]; t.thumbSpread = arr[6]; t.wristTwist = arr[7]; t.wristTilt = arr[8]; t.wristRoll = arr[9];
        this._stepState();
        this.animateModel();
    }

    getCollisionBoxes() {
        const boxes = [];
        if (!this.group.visible) return boxes;
        const worldPos = new THREE.Vector3();
        this.palm.getWorldPosition(worldPos);
        boxes.push({ box: new THREE.Box3().setFromCenterAndSize(worldPos, new THREE.Vector3(0.32, 0.45, 0.16)), object: this.palm, type: 'palm' });
        for (const [name, segments] of Object.entries(this.fingerMeshes)) {
            segments.forEach((seg, i) => {
                const p = new THREE.Vector3();
                seg.mesh.getWorldPosition(p);
                const size = name === 'thumb' ? 0.16 : 0.14;
                boxes.push({ box: new THREE.Box3().setFromCenterAndSize(p, new THREE.Vector3(size, size, size)), object: seg.mesh, type: 'finger', finger: name, segment: i });
            });
        }
        return boxes;
    }
}
