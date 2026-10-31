/**
 * ArmSolver.js — the hero's arm from the camera's picture, as a human arm moves (pure, no THREE).
 *
 * The author: «когда я замахиваюсь, рука не настолько реалистична… не кажется, что я замахнулся, как она выгнулась у
 * меня в реальности… дело в самой руке, её ограничениях и примитивности». What the old way (Character.getRelativeDirection)
 * did: each segment's depth came from its foreshortening against ONE fixed length for every person (0.25 of the picture)
 * and was ALWAYS taken as forward. So:
 *   - the arm could never go behind the body: a wind-up behind the shoulder was drawn in front of it;
 *   - a person whose arm is shorter than 0.25 of the picture never had a straight arm sideways or up — it always leant
 *     ~30–50° forward (a T-pose was a half-hug);
 *   - the camera's own depth (MediaPipe z) was thrown away; nothing knew the elbow or the shoulder.
 *
 * Here, for each arm:
 *   1) the lengths of THIS player's upper arm and forearm in the picture are learnt (from the shoulders' width — a
 *      human's proportions — and then from the longest each segment is seen), so a straight arm is straight;
 *   2) each segment's depth is ±√(L² − l²); the sign (in front of / behind the shoulder, the elbow) is chosen among the
 *      four combinations by a cost: the camera's depth (smoothed), «in front» as the usual place, no jumps where the
 *      segment is far out of the picture's plane (a flip is free only near it), and anatomy — the elbow bends ≤ 150°,
 *      the upper arm goes back only so far, the forearm never goes through the torso;
 *   3) the shoulder girdle moves: up when the arm is raised, back when it is drawn behind (a cocked throw), forward
 *      when it reaches.
 * tools/armbench.mjs measures it against the old way on human arm poses seen by a noisy camera.
 */

export const ARM = {
    UPPER_K: 0.78, FORE_K: 0.66, // a human upper arm / forearm (elbow → wrist) over the shoulders' width (biacromial)
    L_LO: 0.75, L_HI: 1.35, // what is learnt stays within this × the proportion
    NEAR_FULL: 0.93, LEARN_UP: 0.06, LEARN_DECAY: 0.9996, // seen at ≥ 93 % of it: averaged in; otherwise slowly back to the proportion
    W_DECAY: 0.9985, // the shoulders' width: the widest seen, forgotten slowly (turning sideways makes it narrow)
    Z_SMOOTH: 0.8, // the camera's depth difference, lightly smoothed (the game's filter has already smoothed it)
    Z_W: 1.8, // how much the camera's depth counts … (tools/armbench.mjs: 1.8 — the wind-up drawn behind 92 %, the side right 98 %)
    Z_FULL: 0.5, // … full when it says ±half a segment
    BEHIND_UPPER: 0.37, BEHIND_FORE: 0.25, // «in front» is the usual place
    FLIP: 0.4, // a sign changing where the segment is far out of the plane is a jump: costs this × its depth share
    ELBOW_MAX: 150 * Math.PI / 180, // the elbow bends at most this much
    BACK_MAX: 0.8, // the upper arm drawn back at most this far (z of its unit direction: ~55° behind the body's plane)
    ANATOMY: 3, // the cost of a pose no arm makes
    // the torso (body space of the arm's anchor: x out from the body's middle, the shoulder at |x| 0.7, y up from it, z back)
    TORSO_X: 0.62, TORSO_Z: 0.38, TORSO_Y0: -2.2, TORSO_Y1: 0.35,
    UPPER: 1.0, FORE: 0.9, // the game's bones
    GIRDLE_UP: 0.12, GIRDLE_BACK: 0.14, GIRDLE_FWD: 0.12, // the shoulder girdle's travel (m)
    GIRDLE_K: 0.35, // its smoothing per frame
    // ——— steadiness (the author: «когда я поднимаю руку вверх, она может шататься, дрожать»; tools/armstab.mjs) ———
    // An arm in the picture's plane (down, up, sideways) shows nearly its whole length, and there √(L² − l²) is steepest:
    // the camera's 2–3 % of noise on l made a depth of ±15°, and the in front / behind choice flipped on it several times
    // a second — the raised arm swung ±17° forward and back on its own. So:
    // a segment seen at ≥ (1 − dz) of its length lies in the plane (no depth out of the noise; the rest rescaled): dz = NOISE_K × the
    // noise of l / L, learnt on this camera and this distance (a far player is noisier) while the arm is still
    PLANE_E: 0.2, // the depth's softness at the plane (planeDepth)
    NOISE_K: 3.5, DZ_LO: 0.02, DZ_HI: 0.08,
    NOISE_PX: 0.0028, // the prior: the camera's noise on a segment's length in the picture (height units; ≈ 1 cm of a real arm)
    NOISE_INIT2: 6.4e-5, // (rad²: the jerk's start — a fair camera until it shows otherwise)
    NOISE_INIT: 0.01, NOISE_MEAN: 0.12, NOISE_T: 1.5, // s: the length's own mean (its noise is what is off it); how slowly the noise is learnt
    NOISE_STILL: 1.2, // rad/s: only while the segment barely turns (a moving arm's length changes on purpose)
    REBASE: 0.3, // a side changing with the segment nearer the plane than this (of its length) glides there (DirFilter.rebase)
    SIGN_HYST: 0.06, // a side (in front / behind) changes only when the other is better by this much (no flicker on noise)
    // the drawn directions on a VERY noisy camera only: an adaptive 1€ on each segment's direction (DirFilter); a usual camera's
    // arm is smoothed once, by PoseSmoother (whose carry ahead the wand's aim needs: tools/handbench/pointbench.mjs)
    F_MIN: 0.4, // Hz: the cutoff when still (a very noisy camera)
    F_BETA: 12, // Hz more per rad/s of the arm's turn …
    F_W0: 1.2, // … past this (rad/s: the camera's noise, averaged, looks like a slow turn — it must not open the filter)
    F_DCUT: 3, // Hz: how fast the turn's speed is followed
    F_MAX: 30, // Hz
    ONE_LO: 0.65, // one way: |the averaged velocity| ÷ the averaged |step| (the noise ≈ 0.3…0.5, a move ≈ 1) — under it, noise
    // how noisy the camera is: the directions' jerk (a smooth move has next to none; a picture's noise is a kink), learnt while
    // the input wanders every way: under NOISY_LO — a usual camera (tools/handbench/pointing.mjs's 720p webcam: ~0.008…0.014),
    // the filter off; from NOISY_HI — a very noisy one (tools/armstab.mjs ×1: ~0.02…0.03), the filter full
    NOISY_LO: 0.018, NOISY_HI: 0.026, J_STILL: 0.3, // (… learnt only while it turns slower than J_STILL rad/s)
    D_MIN: 1, // Hz: a segment's depth (out of the picture's plane) when the arm is still …
    D_JUMP: 0.1, D_FAST: 80, // … and at once when it changes by more than this share of the segment (a real move in depth)
};

/**
 * A unit direction's adaptive 1€ filter (pure, fixed memory): the cutoff from the turn's speed — the signed velocity averaged
 * (the camera's noise mostly cancels in it, unlike |the step|, which the noise alone keeps high) — past a dead band: still —
 * F_MIN (the noise cut), turning — up to F_MAX (a swing, a throw keep their speed). Applied by how noisy the camera is (k:
 * the directions' jerk learnt — noise()): a usual camera — not at all (PoseSmoother is the one smoothing, the wand's aim keeps
 * its lead), a very noisy one — fully. It also knows the turn's speed (w) for the solver, and glides over a side the solver
 * flipped (rebase). tools/armstab.mjs + tools/handbench/pointbench.mjs chose the numbers: a filter strong enough to still a
 * usual camera's arm made a slow aim 2–3 times later — the wand's aim wins there.
 */
export class DirFilter {
    constructor(o = ARM) {
        this.o = o; this.on = false;
        this.x = 0; this.y = 0; this.z = 0; // what is drawn
        this.px = 0; this.py = 0; this.pz = 0; this.vx = 0; this.vy = 0; this.vz = 0; // the input before, its velocity
        this.w = 0; // the turn's speed now (rad/s)
        this.m = 0; // the averaged size of its steps (rad/s)
        this.qx = 0; this.qy = 0; this.qz = 0; this.j2 = -1; // the input two frames back; its jerk² averaged (the camera's noise: a
        // smooth move, however slow or fast, has next to none — a picture's noise is a kink)
    }
    reset() { this.on = false; this.w = 0; }
    /** The input jumps here by itself (the solver chose the other side): not a turn — it must not open the filter. */
    rebase(x, y, z) { if (this.on) { this.qx += x - this.px; this.qy += y - this.py; this.qz += z - this.pz; this.px = x; this.py = y; this.pz = z; } }
    /** The camera's noise of this direction (rad, from the jerk: a frame's kink), learnt. */
    noise() { return this.j2 > 0 ? Math.sqrt(this.j2) : Math.sqrt(this.o.NOISE_INIT2); }
    /** In: a unit direction (x, y, z), the frame's dt (s). The drawn direction into `out`. */
    step(x, y, z, dt, out, k = 1) {
        const o = this.o;
        if (!this.on || !(dt > 0) || dt > 0.5) {
            this.x = this.px = this.qx = x; this.y = this.py = this.qy = y; this.z = this.pz = this.qz = z;
            this.vx = this.vy = this.vz = 0; this.w = 0; this.m = 0; this.on = true;
        } else {
            const ad = alpha(o.F_DCUT, dt);
            this.vx += ad * ((x - this.px) / dt - this.vx); this.vy += ad * ((y - this.py) / dt - this.vy); this.vz += ad * ((z - this.pz) / dt - this.vz);
            // (one way: |the averaged velocity| ÷ the averaged |step| — the camera's noise turns every way (≈ 0.3…0.5), a real
            // move, however slow (a careful aim of the wand), goes one way (≈ 1): only the first teaches the noise)
            this.m += ad * (Math.hypot(x - this.px, y - this.py, z - this.pz) / dt - this.m);
            const jx = x - 2 * this.px + this.qx, jy = y - 2 * this.py + this.qy, jz = z - 2 * this.pz + this.qz, j2 = jx * jx + jy * jy + jz * jz;
            // (learnt only while the input wanders every way — a move going one way, however slow, is not the camera's noise)
            if (this.j2 < 0) this.j2 = o.NOISE_INIT2;
            else if (this.w < o.J_STILL && (this.m <= 1e-6 || this.w / this.m < o.ONE_LO)) this.j2 += (Math.min(j2, 16 * this.j2 + 1e-6) - this.j2) * alpha(1 / (2 * Math.PI * o.NOISE_T), dt);
            this.qx = this.px; this.qy = this.py; this.qz = this.pz;
            this.px = x; this.py = y; this.pz = z;
            this.w = Math.hypot(this.vx, this.vy, this.vz);
            // (k: how noisy this camera is — a usual one is not smoothed here at all: PoseSmoother is the one smoothing, the wand's
            // aim keeps every millisecond; a very noisy one (a dark room, a far player, a poor webcam) — up to the full filter)
            const a = 1 - k * (1 - alpha(Math.min(o.F_MAX, o.F_MIN + o.F_BETA * Math.max(0, this.w - o.F_W0)), dt));
            this.x += (x - this.x) * a; this.y += (y - this.y) * a; this.z += (z - this.z) * a;
            const l = Math.hypot(this.x, this.y, this.z) || 1;
            this.x /= l; this.y /= l; this.z /= l;
        }
        out.x = this.x; out.y = this.y; out.z = this.z;
        return out;
    }
}

function alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

function noiseState() { return { m: 0, v: -1 }; }

/**
 * The noise of a segment's length (l / L): learnt while it is still, the prior until then (NOISE_PX / L). Returns dz.
 */
function planeDz(N, L, l, w, dt) {
    const q = l / (L || 1), prior = ARM.NOISE_PX / (L || 1);
    if (N.v < 0) { N.m = q; N.v = ARM.NOISE_INIT * ARM.NOISE_INIT; } // (a camera is taken for a fair one until it shows otherwise)
    N.m += (q - N.m) * alpha(1 / (2 * Math.PI * ARM.NOISE_MEAN), dt);
    if (w < ARM.NOISE_STILL) { const r = q - N.m; N.v += (r * r - N.v) * alpha(1 / (2 * Math.PI * ARM.NOISE_T), dt); }
    // (never far below the prior: a still arm in a perfectly still picture must not make the depth twitchy again)
    const sd = noiseSd(N, L);
    return clamp(ARM.NOISE_K * sd, ARM.DZ_LO, ARM.DZ_HI);
}

/** The camera's noise of a segment's direction (rad): as of its length (the same picture noise across it). */
function noiseSd(N, L) { const prior = ARM.NOISE_PX / (L || 1); return Math.max(N.v > 0 ? Math.sqrt(N.v) : prior, prior * 0.5); }

function depthStep(prev, d, L, w, dt) {
    if (prev < 0 || !(dt > 0)) return d;
    const k = alpha(Math.min(ARM.F_MAX, ARM.D_MIN + ARM.F_BETA * Math.max(0, w - ARM.F_W0) + ARM.D_FAST * Math.max(0, Math.abs(d - prev) / L - ARM.D_JUMP)), dt);
    return prev + (d - prev) * k;
}

function sideState() {
    return { Lu: 0, Lf: 0, su: -1, sf: -1, zu: 0, zf: 0, gx: 0, gy: 0, gz: 0, du: -1, df: -1, seen: false, fu: new DirFilter(), ff: new DirFilter(), nu: noiseState(), nf: noiseState() };
}

export class ArmSolver {
    constructor() {
        this.W = 0; // the shoulders' width in the picture (height units)
        this.left = sideState();
        this.right = sideState();
        this._u = { x: 0, y: 0, z: 0 }; this._f = { x: 0, y: 0, z: 0 };
    }

    /** The shoulders' width this picture (call once per picture with both shoulders). */
    shoulders(ls, rs, aspect = 1, dt = 1 / 30) {
        if (!ls || !rs) return this.W;
        const w = Math.hypot((ls.x - rs.x) * aspect, ls.y - rs.y);
        this.W = Math.max(this.W * Math.pow(ARM.W_DECAY, dt * 30), w);
        return this.W;
    }

    /**
     * One arm. shoulder/elbow/wrist: the picture's points {x, y, z} (x, z by the width, y by the height — MediaPipe).
     * side: 'left' | 'right' (the hero's). Fills out.u, out.f (unit directions in the body's space: x right, y up,
     * z back — as the old getRelativeDirection: the picture is mirrored) and out.g (the shoulder girdle's offset).
     */
    solve(side, shoulder, elbow, wrist, aspect = 1, out = { u: { x: 0, y: 0, z: 0 }, f: { x: 0, y: 0, z: 0 }, g: { x: 0, y: 0, z: 0 } }, dt = 1 / 30) {
        const S = side === 'left' ? this.left : this.right;
        const n = Math.max(0, Math.min(6, dt * 30)); this._n = n; // (the numbers are per picture at 30 a second: scaled to this frame)
        const ema = (k) => 1 - Math.pow(1 - k, n);
        const W = this.W > 1e-3 ? this.W : 0.32; // (no shoulders yet: as the old way's scale)
        const pu = W * ARM.UPPER_K, pf = W * ARM.FORE_K;
        // the segments in the picture (height units), mirrored: x right of the hero = left in the picture
        const ux = -(elbow.x - shoulder.x) * aspect, uy = -(elbow.y - shoulder.y);
        const fx = -(wrist.x - elbow.x) * aspect, fy = -(wrist.y - elbow.y);
        const lu = Math.hypot(ux, uy), lf = Math.hypot(fx, fy);
        // (how noisy this camera is for this arm: 0 clean … 1 noisy — the noise of the segments' lengths, learnt while still)
        const nq = Math.max(S.fu.noise(), S.ff.noise());
        const kN = S.kN = nq <= ARM.NOISY_LO ? 0 : nq >= ARM.NOISY_HI ? 1 : (nq - ARM.NOISY_LO) / (ARM.NOISY_HI - ARM.NOISY_LO);
        // learn this player's lengths
        if (!S.seen) { S.Lu = Math.max(pu, lu); S.Lf = Math.max(pf, lf); S.seen = true; }
        S.Lu = this._learn(S.Lu, lu, pu); S.Lf = this._learn(S.Lf, lf, pf);
        let du = planeDepth(S.Lu, lu, planeDz(S.nu, S.Lu, lu, S.fu.w, dt)), df = planeDepth(S.Lf, lf, planeDz(S.nf, S.Lf, lf, S.ff.w, dt));
        // (the depth itself smoothed — still: slowly, turning: at once: a picture whose length dipped past the noise band put
        // the arm 7° out of the plane for one picture, and that jump opened the direction's filter — a twitch of 10 cm)
        du = S.du = depthStep(S.du, du, S.Lu, S.fu.w, dt); df = S.df = depthStep(S.df, df, S.Lf, S.ff.w, dt);
        const ru = du / S.Lu, rf = df / S.Lf; // how far out of the picture's plane (0 … 1)
        // the camera's depth (bigger z = further from the camera = behind), smoothed
        const zu = ((elbow.z || 0) - (shoulder.z || 0)) * aspect, zf = ((wrist.z || 0) - (elbow.z || 0)) * aspect;
        S.zu += (zu - S.zu) * ema(ARM.Z_SMOOTH); S.zf += (zf - S.zf) * ema(ARM.Z_SMOOTH);
        const eu = clamp(S.zu / (ARM.Z_FULL * S.Lu), -1.5, 1.5), ef = clamp(S.zf / (ARM.Z_FULL * S.Lf), -1.5, 1.5);
        const sx = side === 'left' ? -1 : 1;
        let best = Infinity, bsu = S.su, bsf = S.sf, cur = Infinity;
        for (let k = 0; k < 4; k++) {
            const su = k & 1 ? 1 : -1, sf = k & 2 ? 1 : -1;
            let c = 0;
            // the camera's depth, «in front» as the usual place, no jumps far out of the plane
            c += ru * (-su * eu * ARM.Z_W + (su > 0 ? ARM.BEHIND_UPPER : 0) + (su !== S.su ? ARM.FLIP : 0));
            c += rf * (-sf * ef * ARM.Z_W + (sf > 0 ? ARM.BEHIND_FORE : 0) + (sf !== S.sf ? ARM.FLIP : 0));
            // anatomy
            const u = this._dir(this._u, ux, uy, su * du), f = this._dir(this._f, fx, fy, sf * df);
            const cosE = u.x * f.x + u.y * f.y + u.z * f.z;
            if (Math.acos(clamp(cosE, -1, 1)) > ARM.ELBOW_MAX) c += ARM.ANATOMY * ru * rf + ARM.ANATOMY * 0.3;
            if (u.z > ARM.BACK_MAX) c += ARM.ANATOMY * (u.z - ARM.BACK_MAX) * 5;
            // the forearm through the torso (the wrist inside it, the elbow too): body space from the shoulder
            const ex = sx * 0.7 + u.x * ARM.UPPER, ey = u.y * ARM.UPPER, ez = u.z * ARM.UPPER;
            const wx = ex + f.x * ARM.FORE, wy = ey + f.y * ARM.FORE, wz = ez + f.z * ARM.FORE;
            if (Math.abs(wx) < ARM.TORSO_X && wz > -ARM.TORSO_Z && wz < ARM.TORSO_Z && wy > ARM.TORSO_Y0 && wy < ARM.TORSO_Y1) c += ARM.ANATOMY;
            if (Math.abs(ex) < ARM.TORSO_X && ez > -ARM.TORSO_Z && ez < ARM.TORSO_Z && ey > ARM.TORSO_Y0 && ey < ARM.TORSO_Y1) c += ARM.ANATOMY;
            if (su === S.su && sf === S.sf) cur = c;
            if (c < best - 1e-9) { best = c; bsu = su; bsf = sf; }
        }
        if (cur - best < ARM.SIGN_HYST) { bsu = S.su; bsf = S.sf; } // (the other side only when clearly better)
        const flipU = bsu !== S.su, flipF = bsf !== S.sf;
        S.su = bsu; S.sf = bsf;
        let u = this._dir(out.u, ux, uy, bsu * du), f = this._dir(out.f, fx, fy, bsf * df);
        // (the other side: the drawn arm glides there — the jump is the solver's, not the player's turn: it must not open the
        // filter, or the arm was thrown 20–40 cm in a frame)
        // (near the plane only: a flip far out of it is a real move the solver saw clearly — drawn at once)
        if (flipU && du < ARM.REBASE * S.Lu) S.fu.rebase(u.x, u.y, u.z);
        if (flipF && df < ARM.REBASE * S.Lf) S.ff.rebase(f.x, f.y, f.z);
        out.rawU = out.rawU || { x: 0, y: 0, z: 0 }; out.rawF = out.rawF || { x: 0, y: 0, z: 0 };
        out.rawU.x = u.x; out.rawU.y = u.y; out.rawU.z = u.z; out.rawF.x = f.x; out.rawF.y = f.y; out.rawF.z = f.z;
        // the drawn directions: still — steady, moving — at once (DirFilter)
        if (this.filter !== false) { u = S.fu.step(u.x, u.y, u.z, dt, u, kN); f = S.ff.step(f.x, f.y, f.z, dt, f, kN); }
        // the shoulder girdle: up with a raised arm, back with an arm drawn behind, forward with a reach
        const reachF = Math.max(0, -(u.z * ARM.UPPER + f.z * ARM.FORE) / (ARM.UPPER + ARM.FORE));
        const gy = ARM.GIRDLE_UP * Math.max(0, u.y);
        const gz = ARM.GIRDLE_BACK * Math.max(0, u.z) - ARM.GIRDLE_FWD * reachF * (1 - Math.max(0, u.y));
        S.gy += (gy - S.gy) * ema(ARM.GIRDLE_K); S.gz += (gz - S.gz) * ema(ARM.GIRDLE_K);
        out.g.x = 0; out.g.y = S.gy; out.g.z = S.gz;
        out.behindU = bsu > 0; out.behindF = bsf > 0;
        return out;
    }

    /**
     * This segment's length in the picture: the longest it has been seen lately (an arm in the picture's plane shows its
     * whole length; one bad picture moves it only half way), forgotten slowly (the player walks off / comes close),
     * within the human proportion's bounds.
     */
    _learn(L, l, prior) {
        // (only the pictures where it shows nearly its whole length teach it — averaged, not the biggest: the camera's noise
        // would make the biggest too long, and a too-long arm in the plane gets a false depth: +9 % length ≈ 25° off)
        const n = this._n ?? 1;
        if (l > ARM.NEAR_FULL * L) L += (l - L) * (1 - Math.pow(1 - ARM.LEARN_UP, n));
        else L = prior + (L - prior) * Math.pow(ARM.LEARN_DECAY, n); // (back towards the human proportion, never drifting below it)
        return clamp(L, prior * ARM.L_LO, prior * ARM.L_HI);
    }

    /** A unit direction from the picture's (x, y) and a depth d (+ behind). */
    _dir(o, x, y, d) {
        const l = Math.hypot(x, y, d) || 1;
        o.x = x / l; o.y = y / l; o.z = d / l;
        return o;
    }
}

/**
 * A segment's depth (out of the picture's plane) from its whole length L and the length l it shows: √(L² − l²), but a
 * segment seen at ≥ (1 − dz) of its length lies in the plane — there √ is steepest and the camera's noise on l
 * alone made ±15° of depth (the raised arm swung forward and back by itself).
 */
export function planeDepth(L, l, dz = ARM.DZ_LO) {
    const q = Math.min(1, l / (L * (1 - dz) || 1)), e = Math.max(0, 1 - q * q), E2 = ARM.PLANE_E * ARM.PLANE_E;
    // (√e is infinitely steep at e = 0: the noise just past the band still kicked out ±10°; e / √(e + E²) is not — the same
    // depth for a segment well out of the plane, a gentle one near it)
    return L * e * Math.sqrt(1 + E2) / Math.sqrt(e + E2);
}

/** The old way (Character.getRelativeDirection), kept for comparison (tools/armbench.mjs). Body space, z back. */
export function oldDirection(start, end, out = { x: 0, y: 0, z: 0 }) {
    const dy = -(end.y - start.y), dx = -(end.x - start.x);
    let len2d = Math.sqrt(dx * dx + dy * dy);
    if (len2d < 0.01) len2d = 0.01;
    const zFactor = Math.sqrt(Math.max(0, 1 - len2d / 0.25));
    const x = dx * 8, y = dy * 8, z = -zFactor * 2.0, l = Math.hypot(x, y, z) || 1;
    out.x = x / l; out.y = y / l; out.z = z / l;
    return out;
}
