/**
 * PoseInterpreter.js — turns landmarks into game input (original rules):
 * arm landmarks, run intensity (shoulder bobbing), punch (fast wrist),
 * crouch (nose height with hysteresis), head yaw/pitch (Kalidokit face solver).
 */

import { mouthOpenness } from '../game/VoiceGate.js';
import { LegReader } from './LegReader.js';

/**
 * The head tilted back: a real head goes back ~40–45° before the camera loses the
 * face — by then the eyes look straight up. So upward the game turns the view
 * further (up to ~88°: the sky right above), small nods stay as they are.
 * Positive = up (rad).
 */
export function lookPitch(p) {
    if (!(p > 0.3)) return p;
    return Math.min(Math.PI / 2 - 0.03, p + (p - 0.3) * 2.2);
}

/**
 * Is this hand in its trouser pocket (as the camera sees it)? The wrist is at the
 * hip (the pocket's opening is about at the hip joint), the elbow is bent (a hand
 * hanging relaxed has a straight arm), and the hand is gone into the pocket (not
 * seen) or its fingers point down into it. Hands on the waist point their fingers
 * sideways; a hand reaching down to the ground goes far below the hip.
 * Measured in torso heights (shoulder → hip), so the distance to the camera
 * doesn't matter. true / false, or null when the hip or the shoulder isn't seen.
 */
export function pocketPose(lm, hand, side, aspect = 4 / 3, hipSide = side) {
    const [s, e, w] = side === 'left' ? [11, 13, 15] : [12, 14, 16];
    const h = hipSide === 'left' ? 23 : 24; // (the right hand can reach across to the LEFT pocket: the wand's)
    const sh = lm?.[s], el = lm?.[e], wr = lm?.[w], hip = lm?.[h];
    if (!sh || !el || !wr || !hip) return null;
    if ((hip.visibility ?? 1) < 0.5 || (sh.visibility ?? 1) < 0.5) return null;
    const T = hip.y - sh.y;
    if (T < 0.05) return null;
    const out = hipSide === 'left' ? 1 : -1; // (the person's left is the picture's right)
    const dy = (wr.y - hip.y) / T;
    const dxOut = ((wr.x - hip.x) * out * aspect) / T;
    // (the wrist in FRONT of the hip, where the pocket is — not beside the thigh, where a lowered
    // arm with a thing in the hand hangs: lowering a hand never puts what it holds away)
    if (dy < -0.3 || dy > 0.25 || dxOut < -0.25 || dxOut > 0.18) return false;
    // the elbow bent (the upper arm and the forearm in the picture)
    const ux = (el.x - sh.x) * aspect, uy = el.y - sh.y, fx = (wr.x - el.x) * aspect, fy = wr.y - el.y;
    const nu = Math.hypot(ux, uy), nf = Math.hypot(fx, fy);
    if (nu < 1e-4 || nf < 1e-4) return false;
    const bend = Math.acos(Math.max(-1, Math.min(1, (ux * fx + uy * fy) / (nu * nf))));
    if (bend < 0.5) return false; // (~30°: a straight or relaxed hanging arm — a hand going into a pocket bends the elbow)
    // the hand: gone into the pocket, or its fingers pointing down
    if (!hand || hand.length < 21) return true;
    const dxh = (hand[9].x - hand[0].x) * aspect, dyh = hand[9].y - hand[0].y;
    const len = Math.hypot(dxh, dyh);
    return len > 1e-4 && dyh / len > 0.8; // (within ~35° of straight down)
}

/**
 * The hand brought to the mouth (eating): in the picture the hand covers the mouth —
 * the palm's middle (or, unseen, the wrist just under it) close to the mouth, the
 * elbow below. Sizes in shoulder widths, so near or far from the camera is the same.
 */
export function handAtMouth(lm, hand, side, aspect = 4 / 3) {
    const [e, w] = side === 'left' ? [13, 15] : [14, 16];
    const ls = lm?.[11], rs = lm?.[12], nose = lm?.[0], el = lm?.[e], wr = lm?.[w];
    if (!ls || !rs || !nose || !el || !wr) return null;
    if ((nose.visibility ?? 1) < 0.5) return null;
    const W = Math.abs(ls.x - rs.x) * aspect;
    if (W < 0.03) return null;
    const m9 = lm[9], m10 = lm[10];
    const mouth = m9 && m10 && (m9.visibility ?? 1) > 0.5 && (m10.visibility ?? 1) > 0.5
        ? { x: (m9.x + m10.x) / 2, y: (m9.y + m10.y) / 2 } : { x: nose.x, y: nose.y + 0.12 * W };
    if (el.y < wr.y) return false; // (the forearm goes up to the face)
    if (hand && hand.length >= 21) {
        const cx = (hand[0].x + hand[5].x + hand[9].x + hand[17].x) / 4, cy = (hand[0].y + hand[5].y + hand[9].y + hand[17].y) / 4;
        return Math.hypot((cx - mouth.x) * aspect, cy - mouth.y) / W < 0.45;
    }
    const dx = (wr.x - mouth.x) * aspect / W, dy = (wr.y - mouth.y) / W;
    return Math.abs(dx) < 0.35 && dy > -0.1 && dy < 0.7;
}

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
        // the head's turn: still → small jitter smoothed away; a real turn passes at once
        this.headFilter = { yaw: new OneEuro(0.2, 0.5), pitch: new OneEuro(0.2, 0.5) };
        // «Earthquake» stomp: a knee lifted, then put down hard
        this.legs = { left: { liftedAt: 0 }, right: { liftedAt: 0 } };
        this.stompAt = 0;
        this.legsSeenAt = 0;
        this.legReader = new LegReader(); // (the surfboard: getting on, paddling with a leg)
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
     * How far each arm is lifted, from the camera picture itself: 0 = hanging,
     * ~0.13 = lifted ~30°, 1 = at shoulder height, more = above (1 - cos of the
     * angle from hanging). The wrist's drop below the shoulder is compared with the
     * whole arm's length (shoulder → elbow → wrist), both in shoulder widths (the
     * same at any distance from the camera). The arm's length is this person's own,
     * learned as they play: the longest the arm has looked lately — and it looks
     * whole both hanging and lifted sideways, so holding an arm up doesn't unlearn it.
     * (The 3D arm can't tell: its tilt towards the camera is guessed from how short
     * the arm looks, so a player standing further away seems to hold the arms forward.)
     */
    _armLift(lm) {
        const sw = Math.hypot(lm[11].x - lm[12].x, lm[11].y - lm[12].y);
        if (sw < 0.02) return null;
        const t = performance.now() / 1000;
        const dt = Math.min(1, Math.max(0, t - (this._liftT || t)));
        this._liftT = t;
        const L = this._armLen || (this._armLen = { left: 0, right: 0, full: 1.5 });
        const seg = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y) / sw;
        let longest = 0;
        for (const [side, s, e, w] of [['left', 11, 13, 15], ['right', 12, 14, 16]]) {
            if ((lm[w].visibility ?? 1) < 0.3 || (lm[e].visibility ?? 1) < 0.3) continue;
            // smoothed (~0.3 s): one jumpy picture doesn't stretch the arm
            const len = seg(s, e) + seg(e, w);
            L[side] = L[side] ? L[side] + (len - L[side]) * Math.min(1, dt / 0.3) : len;
            longest = Math.max(longest, L[side]);
        }
        // the whole arm: the longest seen lately (forgotten slowly — a new player, another camera)
        L.full = Math.max(1.1, longest, L.full - 0.01 * dt);
        const out = {};
        for (const [side, s, w] of [['left', 11, 15], ['right', 12, 16]]) {
            if ((lm[w].visibility ?? 1) < 0.3) { out[side] = 0; continue; } // (below the picture: hanging)
            out[side] = 1 - (lm[w].y - lm[s].y) / sw / L.full;
        }
        return out;
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
        // the picture's shape (a hand's turn and a pocket are measured in it)
        if (video && video.videoWidth > 0 && video.videoHeight > 0) data.aspect = video.videoWidth / video.videoHeight;
        const lm = results.poseLandmarks;
        if (lm && lm.length >= 33) {
            data.hasPose = true;
            const P = (i) => ({ x: lm[i].x, y: lm[i].y, z: lm[i].z || 0 });
            data.leftShoulder = P(11); data.leftElbow = P(13); data.leftWrist = P(15);
            data.rightShoulder = P(12); data.rightElbow = P(14); data.rightWrist = P(16);
            data.nose = P(0);
            data.armLift = this._armLift(lm);
            data.pocket = {
                left: pocketPose(lm, results.leftHandLandmarks, 'left', data.aspect),
                right: pocketPose(lm, results.rightHandLandmarks, 'right', data.aspect),
                cross: pocketPose(lm, results.rightHandLandmarks, 'right', data.aspect, 'left'), // (the right hand in the LEFT pocket)
            };
            data.mouthHand = { left: handAtMouth(lm, results.leftHandLandmarks, 'left', data.aspect), right: handAtMouth(lm, results.rightHandLandmarks, 'right', data.aspect) };

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
            data.legs = this.legReader.read(lm);

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

        // the mouth (is it me who speaks? — VoiceGate)
        data.mouth = mouthOpenness(results.faceLandmarks);
        if (results.faceLandmarks && this.faceSolver) {
            try {
                const faceRig = this.faceSolver.solve(results.faceLandmarks, { runtime: 'mediapipe', video, smooth: true });
                if (faceRig && faceRig.head) {
                    const t = performance.now() / 1000;
                    this.lastHead.yaw = this.headFilter.yaw.filter(-(faceRig.head.y || 0), t);
                    this.lastHead.pitch = this.headFilter.pitch.filter(faceRig.head.x || 0, t);
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

/**
 * The 1€ filter (Casiez, Roussel, Vogel 2012): smoothing that adapts to speed —
 * strong while the value barely moves (kills jitter), weak while it moves fast
 * (no lag on a real movement).
 */
export class OneEuro {
    constructor(minCutoff = 1, beta = 0.5, dCutoff = 1) {
        this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
        this.x = null; this.dx = 0; this.t = 0;
    }

    filter(v, t) {
        if (this.x === null || !Number.isFinite(this.x)) { this.x = v; this.t = t; return v; }
        const dt = Math.max(1e-3, t - this.t);
        this.t = t;
        const a = (cutoff) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
        const dv = (v - this.x) / dt;
        this.dx += a(this.dCutoff) * (dv - this.dx);
        const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
        this.x += a(cutoff) * (v - this.x);
        return this.x;
    }
}
