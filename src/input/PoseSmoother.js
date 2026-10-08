/**
 * PoseSmoother.js — smooth motion between camera results.
 *
 * The game draws 60–144 frames per second, but the neural networks deliver a
 * new pose only 15–30 times per second. Applying each pose as it arrives
 * makes the hero (and the camera, which follows the head) move in small
 * jumps, which looks like lag. Here every new pose is blended in over the
 * measured time until the next one, starting from what is on screen now, so
 * the motion is continuous at any frame rate.
 *
 * Discrete flags (punch, crouch, running) are taken from the latest result.
 * Pure logic, no THREE.
 */

const POINT_KEYS = ['leftShoulder', 'leftElbow', 'leftWrist', 'rightShoulder', 'rightElbow', 'rightWrist', 'nose'];
const HAND_KEYS = ['leftHandLandmarks', 'rightHandLandmarks'];

export class PoseSmoother {
    constructor() {
        this.reset();
    }

    reset() {
        this.from = null; // what was displayed when the latest pose arrived
        this.to = null; // the latest pose
        this.display = null;
        this.startedAt = 0;
        this.lastPushAt = 0;
        this.interval = 50; // ms between results (measured)
    }

    /** A new result from the camera pipeline. */
    push(pose, now = performance.now()) {
        if (!pose) return;
        if (this.lastPushAt) {
            const gap = now - this.lastPushAt;
            // Ignore pauses (camera hiccup / tab hidden) when measuring the rate
            if (gap > 0 && gap < 250) this.interval = this.interval * 0.8 + gap * 0.2;
        }
        this.lastPushAt = now;
        this.from = this.display || this.to || pose;
        this.to = pose;
        this.startedAt = now;
        // How far the arms jump with this result (image fractions): small moves are shown
        // at once, a big jump (often a tracking glitch) is glided over instead of teleporting
        let jump = 0;
        for (const key of POINT_KEYS) {
            const a = this.from[key], b = pose[key];
            if (a && b) jump = Math.max(jump, Math.hypot(b.x - a.x, b.y - a.y));
        }
        this.jump = jump;
    }

    /** The pose to show at time `now` (null before the first result). */
    sample(now = performance.now()) {
        const to = this.to;
        if (!to) return null;
        const from = this.from;
        // Blend over half an interval (at most 40 ms): no visible jumps, but the hero
        // reaches the newest pose quickly instead of trailing a whole result behind.
        // Only a jump no real arm makes between two results (over a quarter of the
        // image: a tracking glitch) is glided over a little longer — a fast but real
        // swing must never be delayed (it made the whole body feel slow).
        const big = Math.max(0, (this.jump || 0) - 0.25) * 600; // +60 ms per 0.1 of the image beyond 25%
        const duration = Math.max(16, Math.min(40, this.interval * 0.5)) + Math.min(90, big);
        const k = from === to ? 1 : Math.min(1, Math.max(0, (now - this.startedAt) / duration));
        const out = Object.assign({}, to);
        if (k < 1) {
            out.headRotation = mixAngles(from.headRotation, to.headRotation, k);
            out.bodyRotation = mixNum(from.bodyRotation, to.bodyRotation, k);
            out.runIntensity = mixNum(from.runIntensity, to.runIntensity, k);
            for (const key of POINT_KEYS) out[key] = mixPoint(from[key], to[key], k);
            for (const key of HAND_KEYS) out[key] = mixList(from[key], to[key], k);
            if (to.torso && from.torso) {
                out.torso = {
                    ...to.torso,
                    lateral: mixNum(from.torso.lateral, to.torso.lateral, k),
                    noseRel: mixNum(from.torso.noseRel, to.torso.noseRel, k),
                    depth: to.torso.depth != null && from.torso.depth != null ? mixNum(from.torso.depth, to.torso.depth, k) : to.torso.depth,
                };
            }
        }
        this.display = out;
        return out;
    }
}

function mixNum(a, b, k) {
    if (typeof a !== 'number' || typeof b !== 'number') return b;
    return a + (b - a) * k;
}

function mixAngles(a, b, k) {
    if (!a || !b) return b;
    return { ...b, yaw: mixNum(a.yaw, b.yaw, k), pitch: mixNum(a.pitch, b.pitch, k) };
}

function mixPoint(a, b, k) {
    if (!a || !b) return b;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: mixNum(a.z || 0, b.z || 0, k) };
}

function mixList(a, b, k) {
    // A hand that just appeared (or a different landmark count) shows up directly
    if (!a || !b || a.length !== b.length) return b;
    const out = new Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = mixPoint(a[i], b[i], k);
    return out;
}
