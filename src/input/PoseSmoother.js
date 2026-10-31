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
 *
 * Ahead of the picture (PREDICT): a picture is shown 60–150 ms after it was taken (the camera's own delay, the networks,
 * the stream, the filters). The arms' and hands' points are carried on by their own steadied velocity to the moment the
 * frame is drawn — so a moving hand is where it is NOW, and between two pictures it keeps moving instead of standing
 * still (no «ступеньки» at 60+ FPS). Only a hand/arm that really moves is carried (its speed well above the camera's
 * jitter — a still hand never trembles more), at most PREDICT.MAX ahead, and the carry fades as the move slows down
 * (no overshoot when the hand stops). tools/handbench/pointbench.mjs measures the wand's aim through it.
 * Pure logic, no THREE.
 */

const POINT_KEYS = ['leftShoulder', 'leftElbow', 'leftWrist', 'rightShoulder', 'rightElbow', 'rightWrist', 'nose'];
const HAND_KEYS = ['leftHandLandmarks', 'rightHandLandmarks'];
const ARM_KEYS = { left: ['leftShoulder', 'leftElbow', 'leftWrist'], right: ['rightShoulder', 'rightElbow', 'rightWrist'] };

/** How far ahead of the picture the arms and hands are shown (see the top; numbers from tools/handbench/pointbench.mjs). */
export const PREDICT = {
    ON: true,
    EXTRA: 0.04, // s beyond the picture's known age: the camera's own delay before the program has it + what the filters still trail
    MAX: 0.14, // s: never further ahead than this
    VEL_CUT: 5, // Hz: the velocity steadied (the filtered points' step from picture to picture)
    HAND_LO: 0.9, HAND_HI: 1.8, // palm sizes a second: below LO the hand is still (not carried), from HI carried fully
    ARM_LO: 0.12, ARM_HI: 0.25, // shoulders' widths a second (the wrist's travel), the same for the arm
    // the most a point is carried (a quick flick that stops would be shown past where it stopped: a careful aim — the
    // move that feels «ватный» — is carried fully, a flick only this far): shoulders' widths / palm sizes
    ARM_MAX: 0.16, HAND_MAX: 0.6,
    // how one-way the steps go (|steadied velocity| ÷ steadied |step|: the camera's jitter turns every way — ~0.3…0.5, a
    // real move ~1): carried only from the first number, fully from the second
    ONE_WAY: [0.7, 0.9],
    // shoulders' widths a second: a FAST swing (a flick, a chop, a swing of the arm) is not carried — carried, it is shown
    // past where it stopped (a careful aim, ≤ ~2 widths a second, is carried fully)
    FAST: [3, 5],
    FAST_HOLD: [120, 280], // ms after a fast swing before the arm is carried again (it slows down: no overshoot)
    RUN: 3, // pictures in a row moving one way before a move is carried fully (from the 2nd: a part)
};
const _alpha = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
const _ramp = (v, lo, hi) => (v <= lo ? 0 : v >= hi ? 1 : ((v - lo) / (hi - lo)) ** 2 * (3 - 2 * (v - lo) / (hi - lo)));

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
        this.eff = 0; this.effFrom = 0; this.effTo = 0; // the moment the shown pose stands for (arrival clock, ms)
        // the prediction: the last picture's points (copies), their time (the picture's own, ms), steadied velocities (per s)
        this.pv = { at: null, pts: {}, vel: {}, hv: {}, gain: { left: 0, right: 0, leftHandLandmarks: 0, rightHandLandmarks: 0 }, cap: { left: 0, right: 0, leftHandLandmarks: 0, rightHandLandmarks: 0 }, fastAt: { left: null, right: null }, calm: { left: 1, right: 1 } };
        this.lead = 0; // s the shown pose is carried ahead of the newest picture (this frame)
        // the arms NOT carried this frame (the game sets it: a hand holding a thing it may throw — ThrowModel needs the arm's
        // true speed; carried, a throw was sped up and slowed down by the carry: tools/throwbench.mjs 9 % → 41 % speed error)
        this.hold = { left: false, right: false };
    }

    /** The velocities of the arms' and hands' points from the newest picture (its own time `ts`, ms). */
    _velocities(pose, ts) {
        const P = this.pv;
        const dt = P.at == null ? 0 : (ts - P.at) / 1000;
        const ok = dt > 0.004 && dt < 0.25;
        const a = ok ? _alpha(PREDICT.VEL_CUT, dt) : 0;
        const one = (key, p) => {
            if (!p) { delete P.pts[key]; delete P.vel[key]; return; }
            const q = P.pts[key] || (P.pts[key] = { x: p.x, y: p.y, n: false });
            const v = P.vel[key] || (P.vel[key] = { x: 0, y: 0, ux: 0, uy: 0 });
            if (ok && q.n) {
                const ix = (p.x - q.x) / dt, iy = (p.y - q.y) / dt;
                v.x += a * (ix - v.x); v.y += a * (iy - v.y);
                v.m = (v.m || 0) + a * (Math.hypot(ix, iy) - (v.m || 0)); // (the steadied size of the steps: against |v| — how one-way the move is)
                // (what is carried: the steadied velocity, never faster than this picture's own step along it — a hand
                // that stops is not carried on past where it stopped; turned back — not carried at all)
                const s2 = v.x * v.x + v.y * v.y, along = s2 > 1e-12 ? (ix * v.x + iy * v.y) / Math.sqrt(s2) : 0;
                const k = along <= 0 ? 0 : Math.min(1, along / Math.sqrt(s2));
                v.ux = v.x * k; v.uy = v.y * k;
                // (pictures in a row moving the same way: one step is no move yet — a jump, a glitch, a single jitter)
                v.run = k > 0.3 ? Math.min(9, (v.run || 0) + 1) : 0;
            } else { v.x = 0; v.y = 0; v.ux = 0; v.uy = 0; v.m = 0; v.run = 0; }
            q.x = p.x; q.y = p.y; q.n = true;
        };
        for (const side of ['left', 'right']) {
            for (const k of ARM_KEYS[side]) one(k, pose[k]);
            // (how much this arm is carried: the wrist's speed in shoulders' widths a second — a still arm is not)
            const w = P.vel[side + 'Wrist'], sw = pose.leftShoulder && pose.rightShoulder ? Math.max(0.05, Math.hypot(pose.leftShoulder.x - pose.rightShoulder.x, pose.leftShoulder.y - pose.rightShoulder.y)) : 0.25;
            const ws = w ? Math.hypot(w.ux, w.uy) / sw : 0;
            // (a fast swing: not carried, and not while it slows down after it either — FAST_HOLD)
            if (ws > PREDICT.FAST[0]) P.fastAt[side] = ts;
            const calm = _ramp(ts - (P.fastAt[side] ?? -1e9), PREDICT.FAST_HOLD[0], PREDICT.FAST_HOLD[1]);
            P.gain[side] = w ? _ramp(ws, PREDICT.ARM_LO, PREDICT.ARM_HI) * (1 - _ramp(ws, PREDICT.FAST[0], PREDICT.FAST[1])) * calm * _ramp(Math.hypot(w.x, w.y) / Math.max(1e-9, w.m), PREDICT.ONE_WAY[0], PREDICT.ONE_WAY[1]) : 0;
            if (w) P.gain[side] *= _ramp(w.run || 0, 1, PREDICT.RUN);
            P.calm[side] = calm;
            P.cap[side] = w ? PREDICT.ARM_MAX * sw / Math.max(1e-6, Math.hypot(w.ux, w.uy)) : 0; // (s: the carry's limit along the wrist)
        }
        for (const key of HAND_KEYS) {
            const lm = pose[key];
            if (!lm || lm.length < 21) { for (let i = 0; i < 21; i++) one(key + i, null); P.gain[key] = 0; delete P.hv[key]; continue; }
            let mx = 0, my = 0;
            for (let i = 0; i < 21; i++) { one(key + i, lm[i]); mx += P.vel[key + i].ux; my += P.vel[key + i].uy; }
            const size = Math.max(0.01, Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y));
            // the hand is carried WHOLE (its shape as seen): its travel, its turn and its growing/shrinking in the picture —
            // the velocities' best fit (least squares) of a moving, turning, scaling hand; never each point by itself
            const hv = P.hv[key] || (P.hv[key] = { x: 0, y: 0, a: 0, b: 0, cx: 0, cy: 0, asp: 1 });
            const asp = pose.aspect || 1;
            hv.x = mx / 21; hv.y = my / 21; hv.asp = asp;
            let cx = 0, cy = 0;
            for (let i = 0; i < 21; i++) { cx += lm[i].x; cy += lm[i].y; }
            cx /= 21; cy /= 21; hv.cx = cx; hv.cy = cy;
            let rr = 0, ru = 0, rx = 0;
            for (let i = 0; i < 21; i++) {
                const v = P.vel[key + i], X = (lm[i].x - cx) * asp, Y = lm[i].y - cy, U = (v.ux - hv.x) * asp, W = v.uy - hv.y;
                rr += X * X + Y * Y; ru += X * U + Y * W; rx += X * W - Y * U;
            }
            hv.a = rr > 1e-9 ? ru / rr : 0; // (per s: growing)
            hv.b = rr > 1e-9 ? rx / rr : 0; // (rad per s: turning)
            const sp = Math.hypot(hv.x * asp, hv.y) + Math.sqrt(rr / 21) * Math.hypot(hv.a, hv.b);
            const w0 = P.vel[key + 0], w9 = P.vel[key + 9]; // (one-way: the wrist's and the middle knuckle's steps)
            const oneWay = Math.min(Math.hypot(w0.x, w0.y) / Math.max(1e-9, w0.m), Math.hypot(w9.x, w9.y) / Math.max(1e-9, w9.m)) * _ramp(Math.min(w0.run || 0, w9.run || 0), 1, PREDICT.RUN);
            P.gain[key] = _ramp(sp / size, PREDICT.HAND_LO, PREDICT.HAND_HI) * _ramp(oneWay, PREDICT.ONE_WAY[0], PREDICT.ONE_WAY[1]) * P.calm[key === 'leftHandLandmarks' ? 'left' : 'right']; // (palm sizes a second)
            P.cap[key] = PREDICT.HAND_MAX * size / Math.max(1e-6, sp);
        }
        P.at = ts;
    }

    /** `out` carried `lead` s ahead along the velocities (in place). */
    _carry(out, lead) {
        const P = this.pv;
        for (const side of ['left', 'right']) {
            const g = this.hold[side] ? 0 : P.gain[side] * Math.min(lead, P.cap[side]);
            if (!(g > 0)) continue;
            for (const k of ARM_KEYS[side]) {
                const p = out[k], v = P.vel[k];
                if (p && v) out[k] = { ...p, x: p.x + v.ux * g, y: p.y + v.uy * g };
            }
        }
        for (const key of HAND_KEYS) {
            const g = this.hold[key === 'leftHandLandmarks' ? 'left' : 'right'] ? 0 : P.gain[key] * Math.min(lead, P.cap[key]), lm = out[key], v = P.hv[key];
            if (!(g > 0) || !lm || lm.length < 21 || !v) continue;
            const c = new Array(lm.length), asp = v.asp, ka = v.a * g, kb = Math.max(-0.6, Math.min(0.6, v.b * g)); // (≤ ~35° of turn carried)
            for (let i = 0; i < lm.length; i++) {
                const X = (lm[i].x - v.cx) * asp, Y = lm[i].y - v.cy;
                c[i] = { ...lm[i], x: lm[i].x + v.x * g + (ka * X - kb * Y) / asp, y: lm[i].y + v.y * g + (kb * X + ka * Y) };
            }
            out[key] = c;
        }
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
        // (the picture's own time — PoseService gives it; without it, the moment it came)
        const ts = Number.isFinite(pose.ts) ? Math.min(now, pose.ts) : now;
        if (PREDICT.ON) this._velocities(pose, ts);
        this.toAge = now - ts;
        // (the time the shown pose stands for: the blend goes from what is shown now to the new picture, so a frame part
        // way through it shows the moment part way between them — a hand's speed read off the shown poses (ThrowModel) is
        // then a true speed, not the beat of the game's frames against the camera's pictures)
        this.effFrom = this.display ? this.eff : now;
        this.effTo = now;
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
        const big = Math.max(0, (this.jump || 0) - 0.25) * 1500; // +150 ms per 0.1 of the image beyond 25%
        const duration = Math.max(16, Math.min(40, this.interval * 0.5)) + Math.min(120, big);
        const k = from === to ? 1 : Math.min(1, Math.max(0, (now - this.startedAt) / duration));
        // how far ahead of the newest picture this frame is drawn (its age now + what the camera and the filters still trail)
        const lead = PREDICT.ON ? Math.max(0, Math.min(PREDICT.MAX, (this.toAge + (now - this.startedAt)) / 1000 + PREDICT.EXTRA)) : 0;
        this.lead = lead;
        // (the moment the shown pose stands for: the picture's arrival, as before — an arm whose hand holds a thing to throw is
        // never carried (`hold`), so the hands' memory (ThrowModel) reads its true speed off it)
        this.eff = this.effFrom + (this.effTo - this.effFrom) * k;
        const out = Object.assign({}, to);
        if (lead > 0) this._carry(out, lead);
        if (k < 1) {
            out.headRotation = mixAngles(from.headRotation, to.headRotation, k);
            out.bodyRotation = mixNum(from.bodyRotation, to.bodyRotation, k);
            out.runIntensity = mixNum(from.runIntensity, to.runIntensity, k);
            for (const key of POINT_KEYS) out[key] = mixPoint(from[key], out[key], k);
            for (const key of HAND_KEYS) out[key] = mixList(from[key], out[key], k);
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
