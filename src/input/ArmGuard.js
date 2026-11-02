/**
 * ArmGuard.js — the arms (shoulder → elbow → wrist) between the camera network and the hero.
 * Only the arms: the palms and fingers have their own guard (TrackingGuard.HandStabilizer).
 *
 * The author: arms raised over the head shook — the camera does not see part of the arm there.
 * What happened: the network still gives the elbow/wrist out of the picture, but as a guess with a
 * low visibility that wanders from picture to picture; the old guard switched at one threshold
 * (0.35) between that guess and a point frozen where it was last seen (frozen in the picture, so
 * when the shoulder moved the arm stretched) — every picture near the threshold flipped the arm.
 *
 * Now, per elbow and wrist:
 *   1. Trust 0..1, smooth: from the network's visibility (0.15 → 0.55) AND from how far inside the
 *      picture the point is (out of the frame it is a guess). It drops at once, comes back over
 *      ~0.15 s — a point seen again glides in, never snaps.
 *   2. Where it is not trusted, the point is its PARENT + the last well-seen bone (elbow from the
 *      shoulder, wrist from the elbow, in shoulder widths): the arm keeps its shape and goes with
 *      the body, the untrusted guess is mixed in only by its trust. No threshold, no flips.
 *   3. A bone never comes out longer than it was seen (+15%): guesses out of the frame stretch it.
 *      (Shorter is real: an arm turned to the camera.)
 *   4. An adaptive One-Euro filter in shoulder widths a second: a still arm's jitter is smoothed,
 *      a fast swing passes at once (the hero must never trail the body); a less trusted point is
 *      smoothed harder.
 * Everything is told to ArmLog (zns-arms.log).
 *
 * Pure logic, no THREE. Works on the 33 MediaPipe pose landmarks, returns a copy.
 */

import { armLog as defaultLog } from '../core/ArmLog.js';

export const ARMS = [
    { side: 'left', s: 11, e: 13, w: 15 },
    { side: 'right', s: 12, e: 14, w: 16 },
];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

/** How far inside the picture the point is (<0: outside) and through which edge it is nearest. */
export function edgeOf(p) {
    const d = { left: p.x, right: 1 - p.x, top: p.y, bottom: 1 - p.y };
    let where = 'top', min = Infinity;
    for (const k in d) if (d[k] < min) { min = d[k]; where = k; }
    return { edge: min, where };
}

class Joint {
    constructor() { this.reset(); }
    reset() {
        this.has = false;
        this.trust = 0;
        this.off = null; // the last well-seen bone (from the parent), shoulder widths
        this.len = 0; // the longest the bone was seen lately (2D, shoulder widths)
        this.lenSeen = 0;
        this.x = 0; this.y = 0; this.z = 0;
        this.speed = 0;
        this.rawX = null; this.rawY = null;
    }
}

export class ArmGuard {
    /** Tuned in tests/unit/arm-guard.test.js (+ latency.test.js: the hero must not trail). */
    static params = {
        visLo: 0.15, visHi: 0.55, // visibility → trust
        edgeLo: -0.04, edgeHi: 0.01, // inside the picture (fractions) → trust
        trustFall: 0.03, trustRise: 0.15, // s
        learnAt: 0.8, // trust over this: the bone is learnt from the picture
        maxStretch: 1.15, lenForget: 0.02, lenMinSeen: 8, // the bone's length guard
        minCutoff: 1.6, beta: 2.5, dCutoff: 2.0, lowTrustCut: 0.4, // the filter (Hz; speed in shoulder widths/s)
        edgeCutoff: 1.2, // Hz: no filter of its own - a point not fully trusted still steadied this much (at zero trust)
    };

    /**
     * @param {object} [o]
     * @param {boolean} [o.filter=true]  the One-Euro filter (off: only trust, hold and bone length —
     *   for a network that smooths on its own, MediaPipe Holistic)
     * @param {object} [o.params]  overrides of ArmGuard.params
     * @param {object|null} [o.log]  ArmLog (null: none)
     */
    constructor({ filter = true, params = {}, log = defaultLog } = {}) {
        this.filterOn = filter;
        this.p = { ...ArmGuard.params, ...(filter === 'light' ? { minCutoff: 3.5, beta: 4 } : {}), ...params };
        this.log = log;
        this.joints = new Map();
        for (const a of ARMS) { this.joints.set(a.e, new Joint()); this.joints.set(a.w, new Joint()); }
        this.reset();
    }

    reset() {
        for (const j of this.joints.values()) j.reset();
        this.sw = 0;
        this.lastT = null;
    }

    /**
     * @param {Array|null} pose  33 landmarks (not changed)
     * @param {number} tMs  the picture's time
     * @returns {Array|null}  a copy with the elbows and wrists guarded (each has `trust` too)
     */
    process(pose, tMs) {
        if (!pose || pose.length < 33) return pose;
        const P = this.p;
        const t = tMs / 1000;
        let dt = this.lastT == null ? 0 : t - this.lastT;
        const fresh = !(dt > 0) || dt > 0.5; // the first picture or after a long gap
        if (fresh) for (const j of this.joints.values()) { j.has = false; j.speed = 0; }
        if (!(dt > 0)) dt = 1 / 30;
        this.lastT = t;

        // the scale: the shoulders' width (followed over ~0.4 s, so a jumpy shoulder does not shake the arms)
        const ls = pose[11], rs = pose[12];
        const swRaw = ls && rs && Number.isFinite(ls.x) && Number.isFinite(rs.x) ? Math.hypot(ls.x - rs.x, ls.y - rs.y) : 0;
        if (swRaw > 0.02) this.sw = this.sw && !fresh ? this.sw + (swRaw - this.sw) * Math.min(1, dt / 0.4) : swRaw;
        const sw = Math.max(0.05, this.sw || 0.2);

        const out = pose.slice();
        this.log?.result();
        for (const arm of ARMS) {
            for (const [k, pk, name] of [[arm.e, arm.s, 'elbow'], [arm.w, arm.e, 'wrist']]) {
                const p = pose[k], parent = out[pk];
                if (!p || !parent || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(parent.x)) continue;
                const J = this.joints.get(k);
                const vis = p.visibility ?? 1;
                const { edge, where } = edgeOf(p);
                const trustRaw = smoothstep(P.visLo, P.visHi, vis) * smoothstep(P.edgeLo, P.edgeHi, edge);
                // 1. trust: down at once, back up gently
                if (!J.has) J.trust = trustRaw;
                else J.trust += (trustRaw - J.trust) * Math.min(1, dt / (trustRaw < J.trust ? P.trustFall : P.trustRise));

                // the raw bone, shoulder widths
                const rx = (p.x - parent.x) / sw, ry = (p.y - parent.y) / sw, rz = ((p.z || 0) - (parent.z || 0)) / sw;
                const rLen = Math.hypot(rx, ry);
                const jump = J.rawX == null ? 0 : Math.hypot(p.x - J.rawX, p.y - J.rawY) / sw;
                J.rawX = p.x; J.rawY = p.y;
                // (learnt only once the trust itself is back: a point seen again glides in from the held bone)
                if (trustRaw > P.learnAt && J.trust > P.learnAt) {
                    J.off = { x: rx, y: ry, z: rz };
                    J.len = J.lenSeen ? Math.max(rLen, J.len * (1 - Math.min(1, dt * P.lenForget))) : rLen;
                    J.lenSeen++;
                }

                // 2. the target: the network's point by its trust, the rest — the last good bone from the parent
                let tx = p.x, ty = p.y, tz = p.z || 0;
                if (J.off && J.trust < 0.999) {
                    const hx = parent.x + J.off.x * sw, hy = parent.y + J.off.y * sw, hz = (parent.z || 0) + J.off.z * sw;
                    tx = hx + (tx - hx) * J.trust; ty = hy + (ty - hy) * J.trust; tz = hz + (tz - hz) * J.trust;
                }
                // 3. never longer than seen
                let clamped = false;
                if (J.lenSeen >= P.lenMinSeen && J.len > 0) {
                    const dx = (tx - parent.x) / sw, dy = (ty - parent.y) / sw;
                    const L = Math.hypot(dx, dy), max = J.len * P.maxStretch;
                    if (L > max) { const s = max / L; tx = parent.x + dx * s * sw; ty = parent.y + dy * s * sw; clamped = true; }
                }

                // 4. the filter
                if (!J.has) { J.x = tx; J.y = ty; J.z = tz; J.speed = 0; J.has = true; }
                else if (!this.filterOn) {
                    J.speed += alpha(P.dCutoff, dt) * (Math.hypot(tx - J.x, ty - J.y) / sw / dt - J.speed);
                    // (no filter of its own - the game's comes after - but a point only partly trusted (at the picture's edge, the
                    // visibility flickering) is the network's guess wandering: steadied by how little it is trusted; a seen one passes)
                    const a = J.trust >= 0.98 ? 1 : alpha(P.edgeCutoff, dt) + (1 - alpha(P.edgeCutoff, dt)) * J.trust * J.trust;
                    J.x += a * (tx - J.x); J.y += a * (ty - J.y); J.z += a * (tz - J.z);
                } else {
                    const v = Math.hypot(tx - J.x, ty - J.y) / sw / dt; // shoulder widths a second
                    J.speed += alpha(P.dCutoff, dt) * (v - J.speed);
                    const cut = (P.minCutoff + P.beta * J.speed) * (P.lowTrustCut + (1 - P.lowTrustCut) * J.trust);
                    const a = alpha(cut, dt);
                    J.x += a * (tx - J.x); J.y += a * (ty - J.y);
                    J.z += alpha(cut * 0.6, dt) * (tz - J.z); // (the depth is the network's guess: steadier)
                }
                out[k] = { x: J.x, y: J.y, z: J.z, visibility: vis, trust: J.trust };
                this.log?.joint(arm.side, name, { vis, trust: J.trust, edge, where, clamped, jump, speed: J.speed });
            }
        }
        return out;
    }
}
