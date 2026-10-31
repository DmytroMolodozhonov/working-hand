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
};

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

function sideState() {
    return { Lu: 0, Lf: 0, su: -1, sf: -1, zu: 0, zf: 0, gx: 0, gy: 0, gz: 0, seen: false };
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
        // learn this player's lengths
        if (!S.seen) { S.Lu = Math.max(pu, lu); S.Lf = Math.max(pf, lf); S.seen = true; }
        S.Lu = this._learn(S.Lu, lu, pu); S.Lf = this._learn(S.Lf, lf, pf);
        const du = Math.sqrt(Math.max(0, S.Lu * S.Lu - lu * lu)), df = Math.sqrt(Math.max(0, S.Lf * S.Lf - lf * lf));
        const ru = du / S.Lu, rf = df / S.Lf; // how far out of the picture's plane (0 … 1)
        // the camera's depth (bigger z = further from the camera = behind), smoothed
        const zu = ((elbow.z || 0) - (shoulder.z || 0)) * aspect, zf = ((wrist.z || 0) - (elbow.z || 0)) * aspect;
        S.zu += (zu - S.zu) * ema(ARM.Z_SMOOTH); S.zf += (zf - S.zf) * ema(ARM.Z_SMOOTH);
        const eu = clamp(S.zu / (ARM.Z_FULL * S.Lu), -1.5, 1.5), ef = clamp(S.zf / (ARM.Z_FULL * S.Lf), -1.5, 1.5);
        const sx = side === 'left' ? -1 : 1;
        let best = Infinity, bsu = S.su, bsf = S.sf;
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
            if (c < best - 1e-9) { best = c; bsu = su; bsf = sf; }
        }
        S.su = bsu; S.sf = bsf;
        const u = this._dir(out.u, ux, uy, bsu * du), f = this._dir(out.f, fx, fy, bsf * df);
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
