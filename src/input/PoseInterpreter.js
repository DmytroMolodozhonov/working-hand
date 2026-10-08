/**
 * PoseInterpreter.js — turns landmarks into game input (original rules):
 * arm landmarks, run intensity (shoulder bobbing), punch (fast wrist),
 * crouch (nose height with hysteresis), head yaw/pitch (Kalidokit face solver).
 */

export class PoseInterpreter {
    /**
     * @param {object} [faceSolver] Kalidokit.Face (optional; head rotation)
     */
    constructor(faceSolver = null) {
        this.faceSolver = faceSolver;
        this.shoulderHistory = [];
        this.prevWrists = null;
        this.wasCrouching = false;
        this.lastHead = { yaw: 0, pitch: 0 };
        // «Earthquake» stomp: a knee lifted, then put down hard
        this.legs = { left: { liftedAt: 0 }, right: { liftedAt: 0 } };
        this.stompAt = 0;
        this.legsSeenAt = 0;
    }

    /**
     * Knee lift and stomp. Image y grows downwards; a standing knee is about half
     * a torso below the hip, a lifted knee comes up to the hip's height.
     */
    _legs(lm, data, now = performance.now()) {
        const torso = Math.abs((lm[23].y + lm[24].y) / 2 - (lm[11].y + lm[12].y) / 2) || 0.3;
        for (const [side, hip, knee] of [['left', 23, 25], ['right', 24, 26]]) {
            const k = lm[knee], h = lm[hip];
            if ((k.visibility ?? 1) < 0.5 || (h.visibility ?? 1) < 0.5) continue;
            this.legsSeenAt = now;
            const below = (k.y - h.y) / torso; // ~0.5 standing, ~0 knee up
            const leg = this.legs[side];
            if (below < 0.28) leg.liftedAt = now;
            else if (below > 0.42 && leg.liftedAt && now - leg.liftedAt < 1500) {
                this.stompAt = now; // put down after a lift
                leg.liftedAt = 0;
            }
            data[side + 'KneeUp'] = below < 0.28;
        }
    }

    /**
     * @param {object} results  {poseLandmarks, faceLandmarks, leftHandLandmarks, rightHandLandmarks}
     * @param {HTMLVideoElement|object} video  for face solver aspect ratio
     */
    process(results, video) {
        const data = {
            headRotation: { yaw: this.lastHead.yaw, pitch: this.lastHead.pitch },
            bodyRotation: 0,
            leftShoulder: null, leftElbow: null, leftWrist: null,
            rightShoulder: null, rightElbow: null, rightWrist: null,
            leftHandLandmarks: null, rightHandLandmarks: null,
            nose: null,
            isRunning: false,
            runIntensity: 0,
            isCrouching: this.wasCrouching,
            isPunching: false,
            punchingHand: null,
            hasPose: false,
        };
        const lm = results.poseLandmarks;
        if (lm && lm.length >= 33) {
            data.hasPose = true;
            const P = (i) => ({ x: lm[i].x, y: lm[i].y, z: lm[i].z || 0 });
            data.leftShoulder = P(11); data.leftElbow = P(13); data.leftWrist = P(15);
            data.rightShoulder = P(12); data.rightElbow = P(14); data.rightWrist = P(16);
            data.nose = P(0);

            const zDiff = (lm[11].z || 0) - (lm[12].z || 0);
            data.bodyRotation = Math.max(-1, Math.min(1, zDiff * 5));
            data.torso = torsoMetrics(lm);

            // Run intensity from shoulder bobbing (8-frame window)
            this.shoulderHistory.push((lm[11].y + lm[12].y) / 2);
            if (this.shoulderHistory.length > 8) this.shoulderHistory.shift();
            if (this.shoulderHistory.length >= 3) {
                let total = 0;
                for (let i = 1; i < this.shoulderHistory.length; i++) total += Math.abs(this.shoulderHistory[i] - this.shoulderHistory[i - 1]);
                data.runIntensity = Math.max(0, Math.min(1, (total - 0.02) / 0.13));
                data.isRunning = data.runIntensity > 0.1;
            }

            // Punch: wrist moved fast since last frame
            if (!this.prevWrists) this.prevWrists = { left: { ...data.leftWrist }, right: { ...data.rightWrist } };
            const leftDist = Math.hypot(data.leftWrist.x - this.prevWrists.left.x, data.leftWrist.y - this.prevWrists.left.y);
            const rightDist = Math.hypot(data.rightWrist.x - this.prevWrists.right.x, data.rightWrist.y - this.prevWrists.right.y);
            this.prevWrists = { left: { ...data.leftWrist }, right: { ...data.rightWrist } };
            const punchThreshold = 0.08;
            data.isPunching = leftDist > punchThreshold || rightDist > punchThreshold;
            data.punchingHand = leftDist > rightDist ? 'left' : 'right';

            this._legs(lm, data);

            // Crouch with hysteresis
            const noseY = data.nose.y;
            if (!this.wasCrouching) { if (noseY > 0.5) this.wasCrouching = true; }
            else if (noseY < 0.45) this.wasCrouching = false;
            data.isCrouching = this.wasCrouching;
        }

        data.stompAt = this.stompAt;
        data.legsSeenAt = this.legsSeenAt;
        if (results.rightHandLandmarks) data.rightHandLandmarks = results.rightHandLandmarks;
        if (results.leftHandLandmarks) data.leftHandLandmarks = results.leftHandLandmarks;

        if (results.faceLandmarks && this.faceSolver) {
            try {
                const faceRig = this.faceSolver.solve(results.faceLandmarks, { runtime: 'mediapipe', video, smooth: true });
                if (faceRig && faceRig.head) {
                    this.lastHead.yaw = -(faceRig.head.y || 0);
                    this.lastHead.pitch = faceRig.head.x || 0;
                    data.headRotation.yaw = this.lastHead.yaw;
                    data.headRotation.pitch = this.lastHead.pitch;
                }
            } catch (e) {
                // A broken face frame must never stop the game
            }
        }
        return data;
    }
}

/**
 * Raw torso measurements used to steer flight (the body is the steering
 * wheel). Values are relative; the flight controller calibrates a neutral
 * pose at take-off and works with the differences.
 *   lateral  — sideways lean (shoulder centre vs hip centre, or shoulder roll
 *              when the hips are out of the camera), + = leaning to the
 *              person's LEFT
 *   depth    — shoulders' depth relative to the hips (smaller = leaning
 *              forward towards the camera); null without hips
 *   noseRel  — nose height above the shoulder line / shoulder width
 *              (drops when leaning forward or looking down)
 */
export function torsoMetrics(lm) {
    const ls = lm[11], rs = lm[12], lh = lm[23], rh = lm[24], nose = lm[0];
    const sw = Math.max(0.05, Math.abs(ls.x - rs.x));
    const sMidX = (ls.x + rs.x) / 2, sMidY = (ls.y + rs.y) / 2, sMidZ = ((ls.z || 0) + (rs.z || 0)) / 2;
    const hipsOk = lh && rh && (lh.visibility ?? 1) > 0.5 && (rh.visibility ?? 1) > 0.5 && lh.y > sMidY;
    let lateral, depth = null;
    if (hipsOk) {
        const hMidX = (lh.x + rh.x) / 2, hMidZ = ((lh.z || 0) + (rh.z || 0)) / 2;
        // Image is not mirrored: the person's left is the image right.
        lateral = (sMidX - hMidX) / sw;
        depth = sMidZ - hMidZ;
    } else {
        // Shoulder roll: leaning left drops the person's left shoulder (lm 11)
        lateral = (ls.y - rs.y) / sw;
    }
    return { lateral, depth, noseRel: (sMidY - nose.y) / sw, hips: !!hipsOk };
}
