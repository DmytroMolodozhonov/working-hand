/**
 * TrackingGuard.js — safety layer between the neural network and the game.
 *
 * The network sometimes loses a hand in fast/complex movements, swaps left
 * and right, returns a "hand" on the face, or jumps for one frame. The
 * original passed every frame straight through, so one bad frame broke the
 * hand animation. Every frame now goes through these checks:
 *
 * Hands
 *   1. Assignment by body: each detected hand is matched to the pose wrist it
 *      belongs to (not to the network's left/right label, which flips).
 *   2. Sanity: NaN / off-screen / degenerate (collapsed) hands are rejected.
 *   3. Anatomy: bone-length proportions must match the hand seen in recent
 *      frames (rejects mangled hands from motion blur).
 *   4. Teleport: a sudden jump far from the last good position is only
 *      accepted if the next frames confirm it.
 *   5. Ghosts: a hand far away from any pose wrist is ignored.
 *   6. Smoothing: a One-Euro filter for the whole hand (HandFilter: removes jitter,
 *      no lag in quick moves — the speed above the camera's own jitter opens it).
 *   Lost hands return null → the hand model keeps its last pose (2 s), so the
 *   animation never "drops" because of a short loss.
 *
 * Pose (arms)
 *   Per-landmark visibility gating: a low-confidence elbow/wrist keeps its last
 *   good value instead of flailing; One-Euro filtered; whole-pose loss is
 *   bridged for 0.8 s.
 */

import { OneEuroFilter } from '../core/math.js';

const BONES = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

/** Which of BONES are the palm's own (rigid): the wrist and the knuckles. */
const PALM_BONE = BONES.map(([a, b]) => [0, 1, 5, 9, 13, 17].includes(a) && [0, 1, 5, 9, 13, 17].includes(b));

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Palm size: wrist→middle-knuckle plus index→pinky knuckles (robust scale). */
export function palmSize(lm) {
    return dist2(lm[0], lm[9]) + dist2(lm[5], lm[17]) * 0.5;
}

/** Basic sanity: finite, roughly on screen, not collapsed to a point. */
export function isSaneHand(lm) {
    if (!lm || lm.length < 21) return false;
    for (let i = 0; i < 21; i++) {
        const p = lm[i];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z ?? 0)) return false;
        if (p.x < -0.25 || p.x > 1.25 || p.y < -0.25 || p.y > 1.25) return false;
    }
    const s = palmSize(lm);
    return s > 0.015 && s < 0.9;
}

/** Normalised bone-length signature (scale invariant). */
export function boneSignature(lm) {
    const s = palmSize(lm) || 1;
    return BONES.map(([a, b]) => dist2(lm[a], lm[b]) / s);
}

/**
 * Match detected hands to the person's left/right wrist (pose landmarks 15/16).
 * @param {Array<{landmarks,label,score}>} hands
 * @param {Array|null} pose  33 pose landmarks
 * @returns {{left: Array|null, right: Array|null}}
 */
export function assignHands(hands, pose) {
    const out = { left: null, right: null };
    const valid = hands.filter((h) => h && isSaneHand(h.landmarks) && (h.score ?? 1) >= 0.5);
    if (valid.length === 0) return out;

    const lw = pose && pose[15], rw = pose && pose[16];
    const lOk = lw && (lw.visibility ?? 1) > 0.3;
    const rOk = rw && (rw.visibility ?? 1) > 0.3;

    if (lOk || rOk) {
        const d = (h, w) => (w ? dist2(h.landmarks[0], w) : Infinity);
        // Ghost filter: must be near *some* wrist (relative to body size)
        const shoulderW = pose[11] && pose[12] ? Math.max(0.08, dist2(pose[11], pose[12])) : 0.2;
        const maxDist = shoulderW * 1.1;
        const near = valid.filter((h) => Math.min(lOk ? d(h, lw) : Infinity, rOk ? d(h, rw) : Infinity) < maxDist);
        if (near.length === 1) {
            const h = near[0];
            const dl = lOk ? d(h, lw) : Infinity, dr = rOk ? d(h, rw) : Infinity;
            if (dl <= dr) out.left = h.landmarks; else out.right = h.landmarks;
        } else if (near.length >= 2) {
            const [a, b] = near;
            const costAB = (lOk ? d(a, lw) : 1) + (rOk ? d(b, rw) : 1);
            const costBA = (lOk ? d(b, lw) : 1) + (rOk ? d(a, rw) : 1);
            if (costAB <= costBA) { out.left = a.landmarks; out.right = b.landmarks; }
            else { out.left = b.landmarks; out.right = a.landmarks; }
        }
        return out;
    }

    // No body reference: fall back to the network's label. MediaPipe assumes a
    // mirrored (selfie) image; our camera image is not mirrored, so labels are swapped.
    for (const h of valid) {
        if (h.label === 'Left' && !out.right) out.right = h.landmarks;
        else if (h.label === 'Right' && !out.left) out.left = h.landmarks;
    }
    return out;
}

/** Per-hand validator + filter. */
export class HandStabilizer {
    /** The hand filter's strength (see HandFilter; tuned in tests/unit/hand-latency.test.js). */
    static params = { minCutoff: 0.6, beta: 8, dCutoff: 4, floorK: 1.5, floorT: 3 };

    constructor() {
        this.signature = null; // running average of bone signature
        this.lastGood = null;
        this.lastGoodTime = -Infinity;
        this.pendingJump = null;
        this.pendingCount = 0;
        // the whole hand through one speed-adaptive filter (HandFilter): every point
        // with the same strength, so the hand keeps its shape and turns without delay
        this.filter = new HandFilter(HandStabilizer.params);
        this.out = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
        this.rejected = 0;
        this.accepted = 0;
    }

    reset() {
        this.signature = null;
        this.longest = null;
        this.lastGood = null;
        this.lastGoodTime = -Infinity;
        this.pendingJump = null;
        this.pendingCount = 0;
        this.filter.reset();
    }

    /**
     * @param {Array|null} lm  21 landmarks or null
     * @param {number} tMs  timestamp (ms)
     * @returns {Array|null} accepted, filtered landmarks (reused array) or null
     */
    process(lm, tMs) {
        if (!lm || !isSaneHand(lm)) return null;
        const recent = tMs - this.lastGoodTime < 250;

        // Anatomy check against recent hands
        const sig = boneSignature(lm);
        if (this.signature && recent) {
            // A finger bone seen SHORTER is a finger bending or turning to the camera (a grab:
            // rejecting it froze the hand open for ~¼ s while it closed on a thing) — only a
            // bone grown much longer, or the palm itself out of shape, is a mangled hand
            let bad = 0;
            for (let i = 0; i < sig.length; i++) {
                // (a finger: against the longest it was seen lately — opening a fist is no glitch either)
                const ref = PALM_BONE[i] ? this.signature[i] : Math.max(this.signature[i], this.longest?.[i] || 0);
                const d = sig[i] - ref;
                if ((PALM_BONE[i] ? Math.abs(d) : d) > Math.max(0.35 * ref, 0.12)) bad++;
            }
            if (bad > 6) { this.rejected++; return null; }
        }

        // Teleport check: a big jump must be confirmed by following frames
        if (this.lastGood && recent) {
            const size = palmSize(this.lastGood);
            const jump = dist2(lm[0], this.lastGood[0]);
            const scaleJump = palmSize(lm) / (size || 1);
            const dtSec = Math.max(1 / 60, (tMs - this.lastGoodTime) / 1000);
            const tooFar = jump > Math.max(0.12, size * 2.5) * Math.min(1.5, Math.max(1, dtSec * 30));
            const tooScaled = scaleJump > 2.2 || scaleJump < 0.45;
            if (tooFar || tooScaled) {
                if (this.pendingJump && dist2(lm[0], this.pendingJump[0]) < size * 1.2) this.pendingCount++;
                else { this.pendingJump = lm; this.pendingCount = 1; }
                if (this.pendingCount < 3) { this.rejected++; return null; }
                // Confirmed: it really moved there. Restart the filter to avoid a smear.
                this.filter.reset();
            }
        }
        this.pendingJump = null;
        this.pendingCount = 0;

        // Update anatomy reference (slow running average)
        if (!this.signature || !recent) this.signature = sig.slice();
        else for (let i = 0; i < sig.length; i++) this.signature[i] += (sig[i] - this.signature[i]) * 0.1;
        // the longest each bone was seen (slowly forgotten: ~1% a picture)
        if (!this.longest || !recent) this.longest = sig.slice();
        else for (let i = 0; i < sig.length; i++) this.longest[i] = Math.max(sig[i], this.longest[i] * 0.99);

        this.lastGood = lm;
        this.lastGoodTime = tMs;
        this.accepted++;

        return this.filter.filter(lm, tMs / 1000, this.out);
    }
}

/**
 * A One-Euro filter for the whole hand at once (Casiez et al., CHI 2012). The
 * speed is the hand's own: how fast its points move, in palm sizes a second (the
 * same near the camera and far from it), so a quick turn of the wrist — the
 * fingertips sweep a palm or more in a tenth of a second — passes at once, while
 * a still hand's jitter (a few hundredths of a palm) is smoothed away. Every point
 * gets the same strength: the hand keeps its shape (the palm's turn and the finger
 * joints are measured from differences between the points).
 */
export class HandFilter {
    constructor({ minCutoff = 0.8, beta = 8, dCutoff = 4, floorK = 1.5, floorT = 3 } = {}) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.floorK = floorK;
        this.floorT = floorT;
        this.prev = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
        this.reset();
    }

    reset() {
        this.has = false;
        this.speed = 0;
        this.floor = null;
        this.lastTime = null;
    }

    static alpha(cutoff, dt) {
        return 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    }

    /** lm: 21 points; tSec: seconds; out: 21 {x,y,z} (written and returned). */
    filter(lm, tSec, out) {
        const P = this.prev;
        let dt = this.lastTime == null ? 0 : tSec - this.lastTime;
        if (!this.has || !(dt > 0) || dt > 0.5) {
            // the first picture (or after a long gap): as it is
            for (let i = 0; i < 21; i++) { P[i].x = lm[i].x; P[i].y = lm[i].y; P[i].z = lm[i].z || 0; }
            this.has = true; this.speed = 0;
        } else {
            let sum = 0;
            for (let i = 0; i < 21; i++) {
                const dx = lm[i].x - P[i].x, dy = lm[i].y - P[i].y, dz = (lm[i].z || 0) - P[i].z;
                sum += dx * dx + dy * dy + dz * dz;
            }
            const size = Math.max(0.02, palmSize(lm));
            const seen = Math.sqrt(sum / 21) / size / dt; // (palm sizes a second)
            // the camera's own jitter: the floor the seen speed comes down to while the hand
            // is still (it drops at once, rises over `floorT` s) — only a move above it counts
            if (this.floor == null) this.floor = seen;
            this.floor += (seen < this.floor ? 0.3 : Math.min(1, dt / this.floorT)) * (seen - this.floor);
            const raw = Math.max(0, seen - this.floorK * this.floor);
            this.speed += HandFilter.alpha(this.dCutoff, dt) * (raw - this.speed);
            const a = HandFilter.alpha(this.minCutoff + this.beta * this.speed, dt);
            for (let i = 0; i < 21; i++) {
                P[i].x += a * (lm[i].x - P[i].x);
                P[i].y += a * (lm[i].y - P[i].y);
                P[i].z += a * ((lm[i].z || 0) - P[i].z);
            }
        }
        this.lastTime = tSec;
        for (let i = 0; i < 21; i++) { out[i].x = P[i].x; out[i].y = P[i].y; out[i].z = P[i].z; }
        return out;
    }
}

const POSE_KEYS = [0, 11, 12, 13, 14, 15, 16, 23, 24];

/** Visibility gating + smoothing for the body landmarks that drive the arms. */
export class PoseStabilizer {
    constructor() {
        this.filters = new Map();
        this.held = new Map();
        this.lastPose = null;
        this.lastTime = -Infinity;
        for (const k of POSE_KEYS) this.filters.set(k, [new OneEuroFilter(2.0, 3.0), new OneEuroFilter(2.0, 3.0), new OneEuroFilter(1.5, 1.0)]);
    }

    /**
     * @param {Array|null} pose 33 landmarks
     * @returns {Array|null} stabilised copy (or the last pose for a short gap)
     */
    process(pose, tMs) {
        if (!pose || pose.length < 33) {
            if (this.lastPose && tMs - this.lastTime < 800) return this.lastPose;
            return null;
        }
        const t = tMs / 1000;
        const out = pose.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
        for (const k of POSE_KEYS) {
            const p = pose[k];
            const vis = p.visibility ?? 1;
            const finite = Number.isFinite(p.x) && Number.isFinite(p.y);
            const prev = this.held.get(k);
            if ((vis < 0.35 || !finite) && prev) {
                out[k] = { ...prev, visibility: vis };
                continue;
            }
            if (!finite) continue;
            const [fx, fy, fz] = this.filters.get(k);
            out[k] = { x: fx.filter(p.x, t), y: fy.filter(p.y, t), z: fz.filter(p.z || 0, t), visibility: vis };
            this.held.set(k, out[k]);
        }
        this.lastPose = out;
        this.lastTime = tMs;
        return out;
    }
}
