/**
 * SimplifiedHand.js - Version 20 (Organic Freedom)
 * 1) THUMB ABDUCTION: Thumb can now splay OUTWARDS (spread) based on tracking.
 * 2) FINGER FANS: All fingers spread out (fan) when you spread your hand.
 * 3) NATURAL POSE: Thumb base rotated 45deg by default to match anatomy.
 * 4) LOGIC: Added 'fingerSpread' and 'thumbSpread' analysis.
 */

class SimplifiedHand {
    constructor(scene, side = 'right') {
        this.scene = scene;
        this.side = side;
        this.group = new THREE.Group();

        this.skinColor = 0xDCAE82;
        this.material = new THREE.MeshLambertMaterial({ color: this.skinColor });

        this.PALM_W = 0.28; // Reduced from 0.36
        this.PALM_H = 0.45;
        this.PALM_D = 0.14; // Reduced from 0.18

        this.landmarkHistory = [];
        this.HISTORY_LENGTH = 7;

        this.lastTrackingTime = 0;
        this.PERSISTENCE_DURATION = 2000;
        this.isHoldingPose = false;

        this.fingerMeshes = {};
        this.createModel();

        this.currentState = {
            fingers: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
            fingerSpread: 0, // 0 = tight, 1 = spread
            thumbSpread: 0,  // 0 = against palm, 1 = wide open
            wristTwist: 0, wristTilt: 0, wristRoll: 0
        };
        this.targetState = JSON.parse(JSON.stringify(this.currentState));

        this.LERP_SPEED = 0.35; // Faster response
        this.ROT_LERP_SPEED = 0.25; // Faster rotation response

        this.group.traverse(obj => { if (obj.isMesh) obj.frustumCulled = false; });
    }

    createModel() {
        this.handPivot = new THREE.Group();
        this.group.add(this.handPivot);

        const palmGeo = new THREE.BoxGeometry(this.PALM_W, this.PALM_H, this.PALM_D);
        this.palm = new THREE.Mesh(palmGeo, this.material);
        this.palm.position.y = this.PALM_H / 2;
        this.palm.name = 'palm';
        this.handPivot.add(this.palm);

        this.handPivot.rotation.x = Math.PI / 2;
        this.handPivot.rotation.y = 0; // Neutral baseline

        const fingerConfigs = {
            // Updated X and Z positions for smaller palm
            thumb: { x: -0.14, y: 0.10, z: 0.06, len: 0.52, w: 0.10, isThumb: true },
            index: { x: -0.09, y: 0.45, z: 0, len: 0.42, w: 0.08 },
            middle: { x: 0.00, y: 0.48, z: 0, len: 0.48, w: 0.08 },
            ring: { x: 0.09, y: 0.45, z: 0, len: 0.40, w: 0.075 },
            pinky: { x: 0.13, y: 0.40, z: 0, len: 0.32, w: 0.07 }
        };

        for (const [name, cfg] of Object.entries(fingerConfigs)) {
            const segments = this.createFinger(cfg);
            this.fingerMeshes[name] = segments;
            this.palm.add(segments[0].pivot);
        }

        if (this.side === 'left') {
            this.group.scale.set(-1, 1, 1);
        }
    }

    createFinger(cfg) {
        const segments = [];
        const segLen = cfg.len / 3;
        let lastParent = null;
        for (let i = 0; i < 3; i++) {
            const pivot = new THREE.Group();
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, segLen, cfg.w * 0.95), this.material);
            mesh.position.y = segLen / 2;
            pivot.add(mesh);
            if (i === 0) {
                pivot.position.set(cfg.x, cfg.y - this.PALM_H / 2, cfg.z);

                if (cfg.isThumb) {
                    // NATURAL THUMB POSE:
                    // Rotated out (Z) significantly ~45deg
                    // Rotated forward (X) slightly
                    pivot.rotation.z = 0.8;
                    pivot.rotation.x = 0.3;
                    // Initial "twist" to face finger pads
                    pivot.rotation.y = -0.4;
                }
            } else { pivot.position.y = segLen; }
            segments.push({ pivot, mesh });
            if (lastParent) lastParent.add(pivot);
            lastParent = pivot;
        }
        return segments;
    }

    lerpAngle(current, target, step) {
        let diff = target - current;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        return current + diff * step;
    }

    update(landmarks, bodyRotation = 0) {
        const now = Date.now();
        const timeGap = now - this.lastTrackingTime;

        if (landmarks && landmarks.length >= 21) {
            // If tracking was lost for a significant time, clear history to prevent "ghost" drags
            if (timeGap > 300 && this.landmarkHistory.length > 0) {
                this.landmarkHistory = [];
                // Snap current state closer to new target to avoid long weird transitions
                this.currentState.wristTwist = this.targetState.wristTwist;
            }

            this.lastTrackingTime = now;
            this.isHoldingPose = false;
            this.landmarkHistory.push(landmarks.map(l => ({ x: l.x, y: l.y, z: l.z })));
            if (this.landmarkHistory.length > this.HISTORY_LENGTH) this.landmarkHistory.shift();
            const avgLandmarks = this.getAverageLandmarks();
            this.analyzeLandmarks(avgLandmarks, bodyRotation);
        } else {
            const timeSinceLost = now - this.lastTrackingTime;
            if (timeSinceLost < this.PERSISTENCE_DURATION) {
                this.isHoldingPose = true;
            } else {
                // Return to neutral pose smoothly
                const returnSpeed = 0.05;
                for (const f in this.targetState.fingers) {
                    this.targetState.fingers[f] *= (1 - returnSpeed);
                }
                this.targetState.fingerSpread *= (1 - returnSpeed);
                this.targetState.thumbSpread *= (1 - returnSpeed);

                this.targetState.wristTwist = this.lerpAngle(this.targetState.wristTwist, 0, returnSpeed);
                this.targetState.wristTilt = this.lerpAngle(this.targetState.wristTilt, 0, returnSpeed);
                this.targetState.wristRoll = this.lerpAngle(this.targetState.wristRoll, 0, returnSpeed);

                // Clear history if long gone to ensure clean re-acquisition
                if (this.landmarkHistory.length > 0) this.landmarkHistory = [];
            }
        }

        for (const f in this.currentState.fingers) {
            this.currentState.fingers[f] += (this.targetState.fingers[f] - this.currentState.fingers[f]) * this.LERP_SPEED;
        }
        this.currentState.fingerSpread += (this.targetState.fingerSpread - this.currentState.fingerSpread) * this.LERP_SPEED;
        this.currentState.thumbSpread += (this.targetState.thumbSpread - this.currentState.thumbSpread) * this.LERP_SPEED;

        this.currentState.wristTwist = this.lerpAngle(this.currentState.wristTwist, this.targetState.wristTwist, this.ROT_LERP_SPEED);
        this.currentState.wristTilt = this.lerpAngle(this.currentState.wristTilt, this.targetState.wristTilt, this.ROT_LERP_SPEED);
        this.currentState.wristRoll = this.lerpAngle(this.currentState.wristRoll, this.targetState.wristRoll, this.ROT_LERP_SPEED);

        this.animateModel();
    }

    getAverageLandmarks() {
        const avg = [];
        const count = this.landmarkHistory.length;
        if (count === 0) return null;

        for (let i = 0; i < 21; i++) {
            let x = 0, y = 0, z = 0;
            let weightSum = 0;

            // Weighted average: recent frames (at the end of array) have more impact
            this.landmarkHistory.forEach((frame, idx) => {
                const weight = (idx + 1) / count;
                x += frame[i].x * weight;
                y += frame[i].y * weight;
                z += frame[i].z * weight;
                weightSum += weight;
            });

            avg.push({ x: x / weightSum, y: y / weightSum, z: z / weightSum });
        }
        return avg;
    }

    analyzeLandmarks(landmarks, bodyRotation = 0) {
        const getCurl = (baseIdx, tipIdx) => {
            const wrist = landmarks[0];
            const tip = landmarks[tipIdx];
            const base = landmarks[baseIdx];
            const dTip = Math.sqrt(Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2));
            const dBase = Math.sqrt(Math.pow(base.x - wrist.x, 2) + Math.pow(base.y - wrist.y, 2));
            const ratio = dTip / (dBase + 0.05);
            // More sensitive range: 1.2 to 0.4 instead of 1.1 to ratio
            return Math.max(0, Math.min(1, (1.15 - ratio) * 3.2));
        };

        this.targetState.fingers.index = getCurl(5, 8);
        this.targetState.fingers.middle = getCurl(9, 12);
        this.targetState.fingers.ring = getCurl(13, 16);
        this.targetState.fingers.pinky = getCurl(17, 20);

        const tBase = landmarks[1];
        const tTip = landmarks[4];
        const tDist = Math.sqrt(Math.pow(tTip.x - tBase.x, 2) + Math.pow(tTip.y - tBase.y, 2));
        this.targetState.fingers.thumb = Math.max(0, Math.min(1, (0.09 - tDist) * 20));

        // --- SPREAD CALCULATIONS ---

        // 1. Finger Fan (Index vs Pinky)
        const iTip = landmarks[8];
        const pTip = landmarks[20];
        const fanDist = Math.sqrt(Math.pow(iTip.x - pTip.x, 2) + Math.pow(iTip.y - pTip.y, 2));
        // Normal fan ~ 0.15 closed to 0.35 open? Heuristic.
        this.targetState.fingerSpread = Math.max(0, Math.min(1, (fanDist - 0.15) * 3.5));

        // 2. Thumb Abduction (Thumb Tip vs Index Knuckle)
        // If thumb is far from index, it's open.
        const iKnuckle = landmarks[5];
        const thumbDist = Math.sqrt(Math.pow(tTip.x - iKnuckle.x, 2) + Math.pow(tTip.y - iKnuckle.y, 2));
        // 0.2 is wide, 0.05 is closed.
        this.targetState.thumbSpread = Math.max(0, Math.min(1, (thumbDist - 0.05) * 4.0));

        const indexB = landmarks[5];
        const pinkyB = landmarks[17];
        const middleB = landmarks[9];
        const wrist = landmarks[0];

        // --- ROTATION STABILIZATION ---
        // 1. Twist (Clockwise/Counter-clockwise)
        // Improved: Use center of palm (Middle Finger Knuckle) to Index/Pinky for better stability
        let dx = pinkyB.x - indexB.x;
        let dy = pinkyB.y - indexB.y;

        // Add a bit of "depth" correction based on wrist position
        let dist2dSq = dx * dx + dy * dy;

        if (dist2dSq > 0.0008) {
            let twist = Math.atan2(dy, dx);
            let targetTwist = 0;

            if (this.side === 'right') {
                // Symmetric but inverted for non-mirrored hand + 180deg flip correction
                targetTwist = -twist + 0.25;
            } else {
                // The formula that works for the left hand
                targetTwist = twist - Math.PI - 0.25;
            }

            // --- FLIP PROTECTION ---
            // Detect if the hand is inverted
            const palmDirY = middleB.y - wrist.y;
            if (palmDirY > 0.1 && Math.abs(this.lerpAngle(this.targetState.wristTwist, targetTwist, 1)) > Math.PI * 0.8) {
                // Potential flip error detected
            }

            // High-pass filter for the target itself - reduced to 0.35 to stop jitter
            this.targetState.wristTwist = this.lerpAngle(this.targetState.wristTwist, targetTwist, 0.35);
        }

        // 2. Tilt (Up/Down) - Clamped to avoid broken arm look
        const targetTilt = Math.max(-1.2, Math.min(1.2, (middleB.y - wrist.y) * 3.0));
        this.targetState.wristTilt += (targetTilt - this.targetState.wristTilt) * 0.4;

        // 3. Roll (Side-to-Side) - Heavily dampened as Z is noisy
        const rawRoll = (pinkyB.z - indexB.z) * 6;
        const targetRoll = Math.max(-0.8, Math.min(0.8, rawRoll));
        this.targetState.wristRoll += (targetRoll - this.targetState.wristRoll) * 0.25;
    }

    animateModel() {
        this.palm.rotation.y = this.currentState.wristTwist;
        this.palm.rotation.x = this.currentState.wristTilt;
        this.palm.rotation.z = this.currentState.wristRoll;

        const maxBend = Math.PI / 1.95;
        const spread = this.currentState.fingerSpread;
        const thumbOut = this.currentState.thumbSpread;

        for (const [name, segments] of Object.entries(this.fingerMeshes)) {
            const curl = this.currentState.fingers[name];
            const rotDelta = curl * maxBend;
            const pivot = segments[0].pivot;

            if (name === 'thumb') {
                // BASE ROTATION + SPREAD
                // Spread rotates the thumb OUT relative to palm (Z-axis opening)
                // Base Z is 0.8. Spread adds more.
                pivot.rotation.z = 0.8 + (thumbOut * 0.5);

                segments.forEach((seg, i) => {
                    // Bend
                    seg.pivot.rotation.x = -rotDelta * 0.5;
                    if (i === 0) {
                        // Twist Inward for opposition
                        // The more bent, the more twisted.
                        seg.pivot.rotation.y = -0.4 - (rotDelta * 0.6);
                        // Tuck
                        seg.pivot.rotation.z += -rotDelta * 0.2;
                    }
                });
            } else {
                // NORMAL FINGERS (Fan effect)
                // Index rotates +Z (Left), Pinky rotates -Z (Right) for RIGHT HAND coordinates?
                // Pivot orientations are Z-axis is "sideways" for fingers in this rig?
                // Actually in this rig, Z is depth (out of palm). So Spread is rotation around Z axis of the finger base.

                let spreadDir = 0;
                if (name === 'index') spreadDir = 0.2; // Spreads Left
                if (name === 'middle') spreadDir = 0.05;
                if (name === 'ring') spreadDir = -0.1;
                if (name === 'pinky') spreadDir = -0.25;

                // Apply fan spread to Base Joint Only
                pivot.rotation.z = spreadDir * spread;

                segments.forEach(seg => {
                    seg.pivot.rotation.x = -rotDelta;
                });
            }
        }
    }

    setShowHands(visible) { this.group.visible = visible; }
    setQuality() { }

    getCollisionBoxes() {
        const boxes = [];
        if (!this.group.visible) return boxes;

        // 1. Palm Box (Main body)
        if (this.palm) {
            const worldPos = new THREE.Vector3();
            this.palm.getWorldPosition(worldPos);
            // Smaller, more accurate palm box
            const box = new THREE.Box3().setFromCenterAndSize(worldPos, new THREE.Vector3(0.32, 0.45, 0.16));
            boxes.push({ box, object: this.palm, type: 'palm' });
        }

        // 2. All Finger Segments (Phalanges)
        // This makes the fingers "solid" instead of just having active tips.
        for (const [name, segments] of Object.entries(this.fingerMeshes)) {
            segments.forEach((seg, i) => {
                const worldPos = new THREE.Vector3();
                seg.mesh.getWorldPosition(worldPos);

                // Box size based on segment (base segments can be slightly larger)
                const size = (name === 'thumb') ? 0.16 : 0.14;
                const box = new THREE.Box3().setFromCenterAndSize(worldPos, new THREE.Vector3(size, size, size));

                boxes.push({
                    box,
                    object: seg.mesh,
                    type: 'finger',
                    finger: name,
                    segment: i
                });
            });
        }
        return boxes;
    }
}

if (typeof window !== 'undefined') { window.SimplifiedHand = SimplifiedHand; }
