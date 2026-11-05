/**
 * Ragdoll.js — a rag doll for a person knocked off his feet, thrown («Джолт», a blast, a blow) or dead (the author: «даже не анимация,
 * а скорее тряпичная кукла… чтобы они фактически обтекающе взаимодействовали со стеной, сундуком, с другими предметами»).
 *
 * The doll has the joints of the villager's model (VillagerModel.js: the feet frame, the person looks along −Z): two shoulders (±0.8, 3.25),
 * two hips (±0.3, 1.95) — the four corners of a stiff torso —, the head (its middle 0.6 above the neck: the 1.2 m cube), two hands (the arm
 * is one piece, 1.18 m: the ball 0.95 from the shoulder, its radius reaching the end of the arm), two knees (a thigh 1.0) and two feet (a
 * shin 0.95: the ball 0.65 below the knee). RagdollPose.js turns the points into the model's own parts — what is drawn IS the doll.
 *
 * Verlet integration with a fixed step (the same at any frame rate), bones held by relaxation; the joints are limited the way a body is:
 * the head nods but does not fold into the chest or behind the back, a knee bends only one way and not flat, the legs do not fold up
 * through the chest, the hands do not go through the torso, knees and feet do not pass through each other. Every ball — and three balls
 * along the torso (chest, belly, its middle) — is pushed out of the world: the collision boxes (beds, chests, cupboards, cauldrons), the
 * terrain's blocks and the floor; a ball moves at most half its radius a step, so a body flung at 60 m/s never skips a block. Where it
 * touches, the speed into the surface is gone and the sliding loses most of itself: a body thrown at a wall goes limp against it, a leg
 * hangs over the chest's lid, the arm falls along the bed's edge. Still for half a second — asleep (costs nothing, keeps its pose).
 *
 * Pure numbers (no THREE): `world` = {boxes(minX,maxX,minZ,maxZ) → [{minX,maxX,minY,maxY,noSupport?}], solid(ix,iz,layerLo,layerHi) → bool,
 * floor(x, z, reachY) → floor height}. Arrays reused: no garbage while it moves.
 */

export const DOLL = {
    DT: 1 / 60, G: 24, DAMP: 0.995, ITER: 8,
    FRICTION: 0.45,     // share of the sliding kept each contact step (a body on a floor stops in a few steps)
    BOUNCE: 0.08,       // share of the speed into a surface that comes back
    LIMP: 0.93,         // touching anything, the parts' motion relative to the whole dies out by this share a step (muscles gone slack, a dangling leg stops swinging in ~0.3 s); in the air — nothing
    STICK: 0.007,       // a touching ball sliding slower than this a step (~0.4 m/s) sticks: cloth and skin on a floor, a mattress, a lid — no slow creep
    SLEEP_V: 0.006, SLEEP_T: 0.4, // (≤ ~0.35 m/s for 0.4 s while it touches something: it lies — the last slow settling of the joints is not seen)
    MAX_MOVE_K: 0.5,    // a ball moves at most this share of its radius per step: no skipping a block
    GOAL_K: 0.09,       // getting up: the share of the way to the standing pose each step (~1 s to stand)
    RISE_T: 0.85,       // s: getting up — the whole body's turn from lying to standing (Ragdoll.standUp)
    SIM_MAX: 7,         // seconds one doll is computed at the most (then it is put to sleep where it is)
    TONE_K: 0.11,       // a living body (tone 1): the share of the way each limb is pulled a step back to its own shape against the torso
    TONE_T: 1.6,        // s: the muscles hold while the body lands and rolls; after that it lies as it lies (and can fall asleep)
    TONE_LIVE: 0.5,     // a living one thrown («Джолт», a blast, «Левиоса»): half the slackness of a dead one (the author 05.11: «он же не умер… на 50 % менее выражена»)
};

// the points; CHEST and PELVIS are not points of their own (the middle of the shoulders / the hips) — `at` gives them too
export const P = { HEAD: 0, SHL: 1, SHR: 2, HIPL: 3, HIPR: 4, HNL: 5, HNR: 6, KNL: 7, FTL: 8, KNR: 9, FTR: 10, CHEST: 11, PELVIS: 12 };
const N = 11;
const LIMBS = [P.HEAD, P.HNL, P.HNR, P.KNL, P.FTL, P.KNR, P.FTR]; // (the parts a living body's muscles hold — _tone)
/** The frame (right, up, back — 9 numbers) of points given as [[x, y, z]…] (the rest pose) — as Ragdoll.frame does for the doll. */
function frameOf(R, out) {
    let rx = R[P.SHR][0] + R[P.HIPR][0] - R[P.SHL][0] - R[P.HIPL][0], ry = R[P.SHR][1] + R[P.HIPR][1] - R[P.SHL][1] - R[P.HIPL][1], rz = R[P.SHR][2] + R[P.HIPR][2] - R[P.SHL][2] - R[P.HIPL][2];
    let n = Math.hypot(rx, ry, rz) || 1; rx /= n; ry /= n; rz /= n;
    let ux = R[P.SHL][0] + R[P.SHR][0] - R[P.HIPL][0] - R[P.HIPR][0], uy = R[P.SHL][1] + R[P.SHR][1] - R[P.HIPL][1] - R[P.HIPR][1], uz = R[P.SHL][2] + R[P.SHR][2] - R[P.HIPL][2] - R[P.HIPR][2];
    const d = ux * rx + uy * ry + uz * rz; ux -= rx * d; uy -= ry * d; uz -= rz * d;
    n = Math.hypot(ux, uy, uz) || 1; ux /= n; uy /= n; uz /= n;
    out[0] = rx; out[1] = ry; out[2] = rz; out[3] = ux; out[4] = uy; out[5] = uz;
    out[6] = ry * uz - rz * uy; out[7] = rz * ux - rx * uz; out[8] = rx * uy - ry * ux;
    return out;
}
/** The rotation (quaternion [x, y, z, w]) whose columns are the frame's right, up, back. */
function quatOfFrame(F, q) {
    const m00 = F[0], m10 = F[1], m20 = F[2], m01 = F[3], m11 = F[4], m21 = F[5], m02 = F[6], m12 = F[7], m22 = F[8];
    const tr = m00 + m11 + m22;
    if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); q[3] = 0.25 / s; q[0] = (m21 - m12) * s; q[1] = (m02 - m20) * s; q[2] = (m10 - m01) * s; }
    else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q[3] = (m21 - m12) / s; q[0] = 0.25 * s; q[1] = (m01 + m10) / s; q[2] = (m02 + m20) / s; }
    else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q[3] = (m02 - m20) / s; q[0] = (m01 + m10) / s; q[1] = 0.25 * s; q[2] = (m12 + m21) / s; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); q[3] = (m10 - m01) / s; q[0] = (m02 + m20) / s; q[1] = (m12 + m21) / s; q[2] = 0.25 * s; }
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
    return q;
}
function quatMul(a, b) {
    return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
function quatRot(q, v) {
    const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
function quatSlerp(a, b, t) {
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    let c = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; } // (the short way round)
    let k0 = 1 - t, k1 = t;
    if (c < 0.9995) { const th = Math.acos(c), s = Math.sin(th); k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s; }
    const q = [a[0] * k0 + bx * k1, a[1] * k0 + by * k1, a[2] * k0 + bz * k1, a[3] * k0 + bw * k1], l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/**
 * Where each point is on a person standing, in his model's own frame (feet at 0, y up, the model's x and z as they are) — VillagerModel's
 * measures (it looks along −Z: x is his right, z behind him). Other bodies (a zombie, a Taron) give their own `makeSpec`.
 */
export const REST = [
    [0, 4.05, 0],                       // head (the middle of the 1.2 m cube)
    [-0.8, 3.25, 0], [0.8, 3.25, 0],    // shoulders (the model's −x side first)
    [-0.3, 1.95, 0], [0.3, 1.95, 0],    // hips
    [-0.8, 2.30, 0], [0.8, 2.30, 0],    // hands (0.95 down the arm)
    [-0.3, 0.95, 0], [-0.3, 0.30, 0],   // −x knee, foot
    [0.3, 0.95, 0], [0.3, 0.30, 0],     // +x knee, foot
];
const R0 = [0.68, 0.42, 0.42, 0.42, 0.42, 0.28, 0.28, 0.34, 0.32, 0.34, 0.32];

/**
 * A body's measures for the doll: `rest` — the 11 points standing (model frame, see REST), `r` — the balls' radii, `torsoR` — the three
 * balls along the torso (its thickness), `faces` — −1: the model looks along −Z (villagers, sailors, Tarons), +1: along +Z (zombies);
 * `scale` — the model's size in the world (a Taron ×1.06…). The bones' lengths and the joints' limits are measured from `rest`.
 */
export function makeSpec({ rest = REST, r = R0, torsoR = [0.5, 0.5, 0.5], faces = -1, scale = 1, rigidHead = false } = {}) {
    const sc = Array.isArray(scale) ? scale : [scale, scale, scale]; // (a zombie is stretched up only: 1 × 1.12 × 1)
    const q = rest.map((p) => [p[0] * sc[0], p[1] * sc[1], p[2] * sc[2]]);
    const sr = (sc[0] + sc[1] + sc[2]) / 3;
    const rr = r.map((x) => x * sr);
    const d = (a, b) => Math.hypot(q[a][0] - q[b][0], q[a][1] - q[b][1], q[a][2] - q[b][2]);
    const h = d(P.HIPL, P.SHL) / Math.hypot(0.5, 1.3); // (the size of this body against a villager's torso: the joints' limits scale with it — 1 for a villager)
    const hipMid = [(q[P.HIPL][0] + q[P.HIPR][0]) / 2, (q[P.HIPL][1] + q[P.HIPR][1]) / 2, (q[P.HIPL][2] + q[P.HIPR][2]) / 2];
    const headHip = Math.hypot(q[P.HEAD][0] - hipMid[0], q[P.HEAD][1] - hipMid[1], q[P.HEAD][2] - hipMid[2]);
    const legLen = d(P.HIPL, P.KNL) + d(P.KNL, P.FTL);
    return {
        rest: q, r: rr, faces, scale: sr, h,
        // bones that hold their length: [a, b, length, stiffness]
        bones: [
            [P.SHL, P.SHR, d(P.SHL, P.SHR), 1], [P.HIPL, P.HIPR, d(P.HIPL, P.HIPR), 1],
            [P.SHL, P.HIPL, d(P.SHL, P.HIPL), 1], [P.SHR, P.HIPR, d(P.SHR, P.HIPR), 1],
            [P.SHL, P.HIPR, d(P.SHL, P.HIPR), 1], [P.SHR, P.HIPL, d(P.SHR, P.HIPL), 1],
            [P.HEAD, P.SHL, d(P.HEAD, P.SHL), 1], [P.HEAD, P.SHR, d(P.HEAD, P.SHR), 1], // (the head nods round the shoulders' line)
            [P.SHL, P.HNL, d(P.SHL, P.HNL), 1], [P.SHR, P.HNR, d(P.SHR, P.HNR), 1],
            [P.HIPL, P.KNL, d(P.HIPL, P.KNL), 1], [P.KNL, P.FTL, d(P.KNL, P.FTL), 1], [P.HIPR, P.KNR, d(P.HIPR, P.KNR), 1], [P.KNR, P.FTR, d(P.KNR, P.FTR), 1],
            // (a head with no neck — a zombie's block, a Taron's sunk in his shoulders: held to the hips too, it does not nod)
            ...(rigidHead ? [[P.HEAD, P.HIPL, d(P.HEAD, P.HIPL), 1], [P.HEAD, P.HIPR, d(P.HEAD, P.HIPR), 1]] : []),
        ],
        // the joints' limits: [a, b, min, max]
        limits: [
            [P.HEAD, P.HIPL, headHip - 0.55 * h, Infinity], [P.HEAD, P.HIPR, headHip - 0.55 * h, Infinity], // (the head does not fold onto the chest / far behind)
            [P.HIPL, P.FTL, 0.62 * legLen / 1.65, Infinity], [P.HIPR, P.FTR, 0.62 * legLen / 1.65, Infinity], // (a knee bends up to ~140°)
            [P.SHL, P.KNL, 1.05 * h, Infinity], [P.SHR, P.KNR, 1.05 * h, Infinity],             // (a thigh does not go up through the chest)
            [P.KNL, P.KNR, 0.42 * rr[P.KNL] / 0.34, Infinity], [P.FTL, P.FTR, 0.42 * rr[P.FTL] / 0.32, Infinity], // (the legs do not pass through each other)
            [P.HNL, P.HNR, 0.45 * h, Infinity], [P.HEAD, P.HNL, 0.75 * h, Infinity], [P.HEAD, P.HNR, 0.75 * h, Infinity],
        ],
        // the body's own parts never through each other (the author 05.11: «у NPC по отношению к самому себе косточкам нет коллизии…
        // борода проходит сквозь него, голова…»): every two balls not joined by a bone, and every limb ball against the torso's balls,
        // kept at least as far apart as their radii allow — a little less (the flesh gives), never closer than they stand at rest
        self: (() => {
            const joined = new Set(), key = (a, b) => (a < b ? a * 16 + b : b * 16 + a);
            for (const [a, b] of [[P.SHL, P.SHR], [P.HIPL, P.HIPR], [P.SHL, P.HIPL], [P.SHR, P.HIPR], [P.SHL, P.HIPR], [P.SHR, P.HIPL], [P.HEAD, P.SHL], [P.HEAD, P.SHR], [P.SHL, P.HNL], [P.SHR, P.HNR], [P.HIPL, P.KNL], [P.KNL, P.FTL], [P.HIPR, P.KNR], [P.KNR, P.FTR], [P.HIPL, P.FTL], [P.HIPR, P.FTR]]) joined.add(key(a, b));
            const out = [];
            const pts = [P.HEAD, P.HNL, P.HNR, P.KNL, P.FTL, P.KNR, P.FTR];
            for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
                const a = pts[i], b = pts[j];
                if (joined.has(key(a, b))) continue;
                out.push([a, b, Math.min((rr[a] + rr[b]) * 0.8, d(a, b) * 0.95)]);
            }
            return out;
        })(),
        // the head, the knees and the feet against the torso's balls (the hands: _handsOut); the head's chin may come to the chest — not into it
        selfTorso: [[P.HEAD, 0.55], [P.KNL, 0.85], [P.KNR, 0.85], [P.FTL, 0.85], [P.FTR, 0.85]],
        // the balls along the torso (weights of the corners SHL, SHR, HIPL, HIPR; radius — the body's thickness)
        torso: [[0.4, 0.4, 0.1, 0.1, torsoR[0] * sr], [0.25, 0.25, 0.25, 0.25, torsoR[1] * sr], [0.1, 0.1, 0.4, 0.4, torsoR[2] * sr]],
    };
}
/** A villager's (and a sailor's) doll — the model the game's people are drawn with. */
export const HUMAN = makeSpec();

const _c = new Float64Array(3);

export class Ragdoll {
    constructor(spec = HUMAN) {
        this.sp = spec;
        this.x = new Float64Array(N * 3);
        this.o = new Float64Array(N * 3); // the previous positions (Verlet: the speed is x − o)
        this.asleep = true;
        this.still = 0;
        this.age = 0;
        this.acc = 0;
        this.contacts = 0;
        this.goal = null; // (getting up: where each point is pulled — standUp)
        this.tone = 0; // (0 — dead, all slack; 1 — a living body's muscles in full: the limbs held to the torso's own shape — see _tone)
    }

    /** Put point i at (x, y, z) (from a model's current pose — RagdollPose.fromModel). Then `launch`. */
    set(i, x, y, z) { this.x[i * 3] = x; this.x[i * 3 + 1] = y; this.x[i * 3 + 2] = z; }

    /** A standing body at (x, floorY, z) looking along the unit (fx, fz), moving with (vx, vy, vz) m/s, turning at `spin` rad/s round its middle. */
    stand(x, floorY, z, fx, fz, vx = 0, vy = 0, vz = 0, spin = 0) {
        this._place(this.x, x, floorY, z, fx, fz);
        this.launch(vx, vy, vz, spin);
    }

    /** The rest pose put at (x, floorY, z), the body looking along (fx, fz) — into `out` (33 numbers). */
    _place(out, x, floorY, z, fx, fz) {
        const sp = this.sp;
        const th = sp.faces < 0 ? Math.atan2(-fx, -fz) : Math.atan2(fx, fz); // (the model's own turn: its forward is −Z or +Z)
        const c = Math.cos(th), sn = Math.sin(th);
        for (let i = 0; i < N; i++) { const p = sp.rest[i]; out[i * 3] = x + c * p[0] + sn * p[2]; out[i * 3 + 1] = floorY + p[1]; out[i * 3 + 2] = z - sn * p[0] + c * p[2]; }
    }

    /**
     * Getting up: every point is pulled (GOAL_K a step) toward a person standing at (x, floorY, z) looking along (fx, fz) — no gravity, slow;
     * the world still pushes the balls out (last), so a body by a wall gets up along it, never through it. `goalDist` says how far it still is.
     */
    standUp(x, floorY, z, fx, fz) {
        // The body turns up as a WHOLE by the shortest way from how it lies (the author 05.11: «когда он встал, он перевернулся… сальто»
        // — every point used to crawl straight to its place standing, and a body lying the «wrong» way round went over itself): its
        // up (hips → shoulders) is turned to the sky by the shortest arc — on its back it sits up and faces its feet, on its face it
        // pushes up and faces where its head was, on its side it rolls up — its middle rising from where it lies to (x, floorY, z).
        // `fx, fz` are only the fallback (a body standing already). → the way it will face {fx, fz}.
        const sp = this.sp, F = this.frame(this._rf || (this._rf = new Array(9)));
        const q0 = quatOfFrame(F, [0, 0, 0, 1]);
        const ux = F[3], uy = F[4], uz = F[5];
        // the shortest arc from its up to the world's up
        let ax = -uz, az = ux; const ay = 0, sa = Math.hypot(ax, az), ca = uy;
        let q1;
        if (sa < 1e-4) q1 = ca > 0 ? q0.slice() : quatMul([1, 0, 0, 0], q0); // (already up / upside down: over its side)
        else { const ang = Math.atan2(sa, ca), h = Math.sin(ang / 2) / sa; q1 = quatMul([ax * h, ay * h, az * h, Math.cos(ang / 2)], q0); }
        // the rest pose's own frame: each point's place against the hips' middle in it
        const R = sp.rest, RF = frameOf(R, []), rq = quatOfFrame(RF, [0, 0, 0, 1]), ri = [-rq[0], -rq[1], -rq[2], rq[3]];
        const ph = (R[P.HIPL][1] + R[P.HIPR][1]) / 2;
        const loc = this._loc || (this._loc = new Float64Array(N * 3));
        for (let i = 0; i < N; i++) {
            const v = quatRot(ri, [(R[i][0] - (R[P.HIPL][0] + R[P.HIPR][0]) / 2) * 1, R[i][1] - ph, R[i][2] - (R[P.HIPL][2] + R[P.HIPR][2]) / 2]);
            loc[i * 3] = v[0]; loc[i * 3 + 1] = v[1]; loc[i * 3 + 2] = v[2];
        }
        const p0 = this.at(P.PELVIS, []);
        this.rise = { t: 0, q0, q1, p0, p1: [x, floorY + ph, z] };
        // the end: standing so (the goal goalDist measures)
        const g = this.goal || (this.goal = new Float64Array(N * 3));
        this._riseAt(1, g);
        this.asleep = false; this.still = 0; this.age = 0;
        // where it faces then: forward = −back for a model looking along −Z, +back for one along +Z
        const bw = quatRot(quatMul(q1, ri), [RF[6], RF[7], RF[8]]);
        let ox = bw[0] * sp.faces, oz = bw[2] * sp.faces;
        const ol = Math.hypot(ox, oz);
        if (ol < 0.2) { ox = fx; oz = fz; } else { ox /= ol; oz /= ol; }
        return { fx: ox, fz: oz };
    }

    /** Where every point is at share `s` (0…1) of getting up (into `out`): the rest shape turned by the slerp of q0 → q1, its middle risen. */
    _riseAt(s, out) {
        const r = this.rise, q = quatSlerp(r.q0, r.q1, s), loc = this._loc;
        const lift = Math.sin(Math.min(1, s * 1.15) * Math.PI / 2); // (the hips come up a little ahead of the turn: no feet driven into the floor)
        const px = r.p0[0] + (r.p1[0] - r.p0[0]) * s, py = r.p0[1] + (r.p1[1] - r.p0[1]) * lift, pz = r.p0[2] + (r.p1[2] - r.p0[2]) * s;
        for (let i = 0; i < N; i++) {
            const v = quatRot(q, [loc[i * 3], loc[i * 3 + 1], loc[i * 3 + 2]]);
            out[i * 3] = px + v[0]; out[i * 3 + 1] = py + v[1]; out[i * 3 + 2] = pz + v[2];
        }
        return out;
    }

    /** How far (m) the farthest point still is from where getting up takes it. */
    goalDist() {
        if (!this.goal) return 0;
        let m = 0;
        for (let i = 0; i < N; i++) m = Math.max(m, Math.hypot(this.x[i * 3] - this.goal[i * 3], this.x[i * 3 + 1] - this.goal[i * 3 + 1], this.x[i * 3 + 2] - this.goal[i * 3 + 2]));
        return m;
    }

    /**
     * A body already lying (a dead body in its pose): feet at (x, floorY, z), the head along the unit (ax, az), on its back. The pose is kept;
     * it only settles onto whatever it lies on.
     */
    lie(x, floorY, z, ax, az) {
        const s = Math.hypot(ax, az) || 1; ax /= s; az /= s;
        const rx = az, rz = -ax; // (his right, lying on his back with the head along a)
        const sp = this.sp, hy = (sp.rest[P.HIPL][1] + sp.rest[P.HIPR][1]) / 2 - sp.rest[P.HIPL][1];
        for (let i = 0; i < N; i++) { const p = sp.rest[i]; this.set(i, x + ax * p[1] + rx * p[0], floorY + (i >= P.SHL && i <= P.HIPR ? sp.torso[1][4] + 0.02 : sp.r[i] + 0.02), z + az * p[1] + rz * p[0]); }
        void hy; // (each ball resting on the floor, the torso on its thickness)
        this.launch(0, 0, 0, 0);
    }

    /** Give every point the speed (vx, vy, vz) plus a turn round the vertical through the middle. */
    launch(vx, vy, vz, spin = 0) {
        const dt = DOLL.DT;
        let cx = 0, cz = 0;
        for (let i = 0; i < N; i++) { cx += this.x[i * 3]; cz += this.x[i * 3 + 2]; }
        cx /= N; cz /= N;
        for (let i = 0; i < N; i++) {
            const k = i * 3, rx = this.x[k] - cx, rz = this.x[k + 2] - cz;
            this.o[k] = this.x[k] - (vx - spin * rz) * dt;
            this.o[k + 1] = this.x[k + 1] - vy * dt;
            this.o[k + 2] = this.x[k + 2] - (vz + spin * rx) * dt;
        }
        this.asleep = false; this.still = 0; this.age = 0; this.acc = 0;
    }

    wake() { if (this.asleep) { this.asleep = false; this.still = 0; this.age = Math.min(this.age, DOLL.SIM_MAX - 3); } }

    /** A push now (m/s on every point, y included): another blow on a body lying there. */
    push(vx, vy, vz) { for (let i = 0; i < N; i++) { this.o[i * 3] -= vx * DOLL.DT; this.o[i * 3 + 1] -= vy * DOLL.DT; this.o[i * 3 + 2] -= vz * DOLL.DT; } this.wake(); }

    /** Advance by `dt` seconds (fixed inner steps, at most 4 a call). → true while it still moves. */
    step(world, dt) {
        if (this.asleep) return false;
        this.acc += Math.min(dt, 0.1);
        let n = 0;
        while (this.acc >= DOLL.DT && n < 4) { this.acc -= DOLL.DT; this._tick(world); n++; }
        if (n >= 4) this.acc = 0; // (a slow frame: the doll goes a little slower, never a burst of steps)
        return !this.asleep;
    }

    _tick(world) {
        const dt = DOLL.DT, x = this.x, o = this.o;
        this.age += dt;
        // limp: on the ground (it touched something last step) the limbs' swinging relative to the whole body dies out
        let mx = 0, my = 0, mz = 0;
        if (this.contacts > 0) {
            for (let i = 0; i < N; i++) { mx += x[i * 3] - o[i * 3]; my += x[i * 3 + 1] - o[i * 3 + 1]; mz += x[i * 3 + 2] - o[i * 3 + 2]; }
            mx /= N; my /= N; mz /= N;
            const L = DOLL.LIMP;
            for (let i = 0; i < N; i++) {
                const k = i * 3;
                o[k] = x[k] - (mx + (x[k] - o[k] - mx) * L); o[k + 1] = x[k + 1] - (my + (x[k + 1] - o[k + 1] - my) * L); o[k + 2] = x[k + 2] - (mz + (x[k + 2] - o[k + 2] - mz) * L);
            }
        }
        if (this.goal) {
            // getting up: no fall, no swing — the body turns up as a whole (rise: the shortest turn, its middle rising), each point pulled
            // to where that turn has it now; the bones and the world still hold
            let gl = this.goal, K = DOLL.GOAL_K;
            if (this.rise && this.rise.t < DOLL.RISE_T) {
                this.rise.t += dt;
                const u = Math.min(1, this.rise.t / DOLL.RISE_T);
                gl = this._riseAt(u * u * (3 - 2 * u), this._rg || (this._rg = new Float64Array(N * 3)));
                K = 0.35;
            }
            for (let i = 0; i < N * 3; i++) { o[i] = x[i]; x[i] += (gl[i] - x[i]) * K; }
            this.contacts = 0;
            for (let it = 0; it < DOLL.ITER; it++) for (let b = 0; b < this.sp.bones.length; b++) { const B = this.sp.bones[b]; this._len(B[0], B[1], B[2], B[2], B[3]); }
            // the world: the body is moved out of a wall, a bed, the floor as ONE piece — never a shoulder shoved alone (the author 05.11,
            // the third time: «когда NPC встаёт, он всё равно переворачивается, делает сальто» — getting up by a wall, the collisions pushed
            // single points and the torso's frame jumped over itself in a step). Twice: what one push leaves the next one takes.
            const y = this._ry || (this._ry = new Float64Array(N * 3));
            for (let pass = 0; pass < 2; pass++) {
                y.set(x);
                for (let i = 0; i < N; i++) this._collide(world, i);
                this._torso(world);
                let dx = 0, dy = 0, dz = 0;
                for (let i = 0; i < N; i++) {
                    const k = i * 3, ex = x[k] - y[k], ey = x[k + 1] - y[k + 1], ez = x[k + 2] - y[k + 2];
                    if (Math.abs(ex) > Math.abs(dx)) dx = ex; if (ey > dy) dy = ey; if (Math.abs(ez) > Math.abs(dz)) dz = ez;
                }
                for (let i = 0; i < N; i++) { const k = i * 3; x[k] = y[k] + dx; x[k + 1] = y[k + 1] + dy; x[k + 2] = y[k + 2] + dz; }
                if (!dx && !dy && !dz) break;
            }
            // (wedged — a wall on one side, a bed on the other: no one shift frees it; what is still in a solid is pushed out by itself)
            for (let i = 0; i < N; i++) this._collide(world, i);
            this._torso(world);
            for (let i = 0; i < N * 3; i++) o[i] = x[i];
            return;
        }
        for (let i = 0; i < N; i++) {
            const k = i * 3, lim = this.sp.r[i] * DOLL.MAX_MOVE_K;
            let vx = (x[k] - o[k]) * DOLL.DAMP, vy = (x[k + 1] - o[k + 1]) * DOLL.DAMP - DOLL.G * dt * dt, vz = (x[k + 2] - o[k + 2]) * DOLL.DAMP;
            const m = Math.hypot(vx, vy, vz);
            if (m > lim) { const q = lim / m; vx *= q; vy *= q; vz *= q; }
            o[k] = x[k]; o[k + 1] = x[k + 1]; o[k + 2] = x[k + 2];
            x[k] += vx; x[k + 1] += vy; x[k + 2] += vz;
        }
        // (the muscles hold the limbs only while the body touches something — lying, landing, sliding: in the air a living body is as
        //  helpless as a slack one, and its limbs pulled straight there turned the whole body over: the author 05.11 «в воздухе
        //  переворачивается»)
        if (this.tone > 0 && this.contacts > 0 && this.age < DOLL.TONE_T) this._tone(); // (and only while it lands and rolls: then it lies still, as a body does — never twitching on)
        this.contacts = 0;
        this._hitMask = (this._hitMask || 0) | (this._hitNow || 0); this._hitNow = 0; // (what touched the world last step and this one)
        for (let it = 0; it < DOLL.ITER; it++) {
            for (let b = 0; b < this.sp.bones.length; b++) { const B = this.sp.bones[b]; this._len(B[0], B[1], B[2], B[2], B[3]); };
            for (let b = 0; b < this.sp.limits.length; b++) { const L = this.sp.limits[b]; this._len(L[0], L[1], L[2], L[3], 1); };
            this._knee(P.HIPL, P.KNL, P.FTL); this._knee(P.HIPR, P.KNR, P.FTR);
            this._handsOut();
            if (it & 1 && this._selfOn !== false) this._selfOut();
            // the world last (it wins): every other pass and the final one — the blocks are the dearest question
            if (it & 1 || it === DOLL.ITER - 1) { for (let i = 0; i < N; i++) this._collide(world, i); this._torso(world); }
        }
        this._hitMask = this._hitNow || 0;
        let mv = 0;
        for (let i = 0; i < N * 3; i++) { const d = Math.abs(x[i] - o[i]); if (d > mv) mv = d; }
        if (mv < DOLL.SLEEP_V && this.contacts > 0) { this.still += dt; if (this.still >= DOLL.SLEEP_T) this._sleep(); } else this.still = 0;
        if (this.age > DOLL.SIM_MAX) this._sleep();
    }

    /**
     * A living body's muscles: the head, the hands, the knees and the feet are pulled back toward where they are on a standing body
     * against the torso as it lies now (its own frame: the hips' middle, up to the shoulders, across them) — by TONE_K × tone a step,
     * and their swinging is calmed by the same share. The torso itself goes where the push sends it; the limbs follow it, not flop.
     */
    _tone() {
        const x = this.x, o = this.o, R = this.sp.rest;
        const hx = (x[P.HIPL * 3] + x[P.HIPR * 3]) / 2, hy = (x[P.HIPL * 3 + 1] + x[P.HIPR * 3 + 1]) / 2, hz = (x[P.HIPL * 3 + 2] + x[P.HIPR * 3 + 2]) / 2;
        let ux = (x[P.SHL * 3] + x[P.SHR * 3]) / 2 - hx, uy = (x[P.SHL * 3 + 1] + x[P.SHR * 3 + 1]) / 2 - hy, uz = (x[P.SHL * 3 + 2] + x[P.SHR * 3 + 2]) / 2 - hz;
        let ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
        let rx = x[P.SHR * 3] - x[P.SHL * 3], ry = x[P.SHR * 3 + 1] - x[P.SHL * 3 + 1], rz = x[P.SHR * 3 + 2] - x[P.SHL * 3 + 2];
        const d = rx * ux + ry * uy + rz * uz; rx -= ux * d; ry -= uy * d; rz -= uz * d;
        const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
        const fx = ry * uz - rz * uy, fy = rz * ux - rx * uz, fz = rx * uy - ry * ux; // (right × up)
        // the same frame on the rest pose
        const RH = [(R[P.HIPL][0] + R[P.HIPR][0]) / 2, (R[P.HIPL][1] + R[P.HIPR][1]) / 2, (R[P.HIPL][2] + R[P.HIPR][2]) / 2];
        const RS = [(R[P.SHL][0] + R[P.SHR][0]) / 2 - RH[0], (R[P.SHL][1] + R[P.SHR][1]) / 2 - RH[1], (R[P.SHL][2] + R[P.SHR][2]) / 2 - RH[2]];
        const rsl = Math.hypot(RS[0], RS[1], RS[2]) || 1, Ru = [RS[0] / rsl, RS[1] / rsl, RS[2] / rsl];
        let Rr = [R[P.SHR][0] - R[P.SHL][0], R[P.SHR][1] - R[P.SHL][1], R[P.SHR][2] - R[P.SHL][2]];
        const rd = Rr[0] * Ru[0] + Rr[1] * Ru[1] + Rr[2] * Ru[2]; Rr = [Rr[0] - Ru[0] * rd, Rr[1] - Ru[1] * rd, Rr[2] - Ru[2] * rd];
        const rrl = Math.hypot(Rr[0], Rr[1], Rr[2]) || 1; Rr = [Rr[0] / rrl, Rr[1] / rrl, Rr[2] / rrl];
        const Rf = [Rr[1] * Ru[2] - Rr[2] * Ru[1], Rr[2] * Ru[0] - Rr[0] * Ru[2], Rr[0] * Ru[1] - Rr[1] * Ru[0]];
        const K = DOLL.TONE_K * this.tone, D = this._toneD || (this._toneD = new Float64Array(N * 3));
        D.fill(0);
        for (const i of LIMBS) {
            const a = R[i][0] - RH[0], b = R[i][1] - RH[1], c = R[i][2] - RH[2];
            const lr = a * Rr[0] + b * Rr[1] + c * Rr[2], lu = a * Ru[0] + b * Ru[1] + c * Ru[2], lf = a * Rf[0] + b * Rf[1] + c * Rf[2];
            const tx = hx + rx * lr + ux * lu + fx * lf, ty = hy + ry * lr + uy * lu + fy * lf, tz = hz + rz * lr + uz * lu + fz * lf;
            const k = i * 3;
            D[k] = (tx - x[k]) * K; D[k + 1] = (ty - x[k + 1]) * K; D[k + 2] = (tz - x[k + 2]) * K;
        }
        // Muscles are INSIDE the body: they move the limbs against the torso, never the whole. Pulling the limbs alone gave the body a
        // push and a turn out of nothing — thrown by «Джолт» it somersaulted in the air (the author 05.11: «в воздухе переворачивается…
        // сильно сломана математика»: the torso turned 86° where a slack body turns 41°). So the pull's own drift and its turn about the
        // body's middle are taken back from every point: the body as a whole flies and spins exactly as a slack one would.
        let cx = 0, cy = 0, cz = 0, mx = 0, my = 0, mz = 0;
        for (let i = 0; i < N; i++) { const k = i * 3; cx += x[k]; cy += x[k + 1]; cz += x[k + 2]; mx += D[k]; my += D[k + 1]; mz += D[k + 2]; }
        cx /= N; cy /= N; cz /= N; mx /= N; my /= N; mz /= N;
        let Lx = 0, Ly = 0, Lz = 0, I = 0;
        for (let i = 0; i < N; i++) {
            const k = i * 3, px = x[k] - cx, py = x[k + 1] - cy, pz = x[k + 2] - cz;
            D[k] -= mx; D[k + 1] -= my; D[k + 2] -= mz;
            Lx += py * D[k + 2] - pz * D[k + 1]; Ly += pz * D[k] - px * D[k + 2]; Lz += px * D[k + 1] - py * D[k];
            I += px * px + py * py + pz * pz;
        }
        // (the turn taken back: ω = L / I — the body as a ball of its points, close enough for a step this small)
        const wx = Lx / (I || 1), wy = Ly / (I || 1), wz = Lz / (I || 1);
        for (let i = 0; i < N; i++) {
            const k = i * 3, px = x[k] - cx, py = x[k + 1] - cy, pz = x[k + 2] - cz;
            const dx = D[k] - (wy * pz - wz * py), dy = D[k + 1] - (wz * px - wx * pz), dz = D[k + 2] - (wx * py - wy * px);
            x[k] += dx; x[k + 1] += dy; x[k + 2] += dz;
            // (the limbs' swinging calmed too — by the same internal field, so this takes nothing from the flight either)
            o[k] += dx * 0.5; o[k + 1] += dy * 0.5; o[k + 2] += dz * 0.5;
        }
    }

    _sleep() { this.asleep = true; for (let i = 0; i < N * 3; i++) this.o[i] = this.x[i]; }

    /** Hold the distance a–b within [min, max] (stiffness k: 1 — at once). */
    _len(a, b, min, max, k) {
        const x = this.x, i = a * 3, j = b * 3;
        const dx = x[j] - x[i], dy = x[j + 1] - x[i + 1], dz = x[j + 2] - x[i + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-9;
        let want;
        if (d < min) want = min; else if (d > max) want = max; else return;
        const f = (d - want) / d * 0.5 * k;
        x[i] += dx * f; x[i + 1] += dy * f; x[i + 2] += dz * f;
        x[j] -= dx * f; x[j + 1] -= dy * f; x[j + 2] -= dz * f;
    }

    /** The torso's frame now: right (r), up (u), back (b) — unit vectors into `out` (9 numbers). */
    frame(out) {
        const x = this.x;
        let rx = x[P.SHR * 3] + x[P.HIPR * 3] - x[P.SHL * 3] - x[P.HIPL * 3], ry = x[P.SHR * 3 + 1] + x[P.HIPR * 3 + 1] - x[P.SHL * 3 + 1] - x[P.HIPL * 3 + 1], rz = x[P.SHR * 3 + 2] + x[P.HIPR * 3 + 2] - x[P.SHL * 3 + 2] - x[P.HIPL * 3 + 2];
        let n = Math.hypot(rx, ry, rz) || 1; rx /= n; ry /= n; rz /= n;
        let ux = x[P.SHL * 3] + x[P.SHR * 3] - x[P.HIPL * 3] - x[P.HIPR * 3], uy = x[P.SHL * 3 + 1] + x[P.SHR * 3 + 1] - x[P.HIPL * 3 + 1] - x[P.HIPR * 3 + 1], uz = x[P.SHL * 3 + 2] + x[P.SHR * 3 + 2] - x[P.HIPL * 3 + 2] - x[P.HIPR * 3 + 2];
        const d = ux * rx + uy * ry + uz * rz; ux -= rx * d; uy -= ry * d; uz -= rz * d;
        n = Math.hypot(ux, uy, uz) || 1; ux /= n; uy /= n; uz /= n;
        out[0] = rx; out[1] = ry; out[2] = rz; out[3] = ux; out[4] = uy; out[5] = uz;
        out[6] = ry * uz - rz * uy; out[7] = rz * ux - rx * uz; out[8] = rx * uy - ry * ux; // (r × u = behind him)
        return out;
    }

    /** A knee bends only forward (the shin goes back): a knee behind the hip–foot line is brought in front of it. */
    _knee(h, k, f) {
        const x = this.x, F = this._f || (this._f = new Float64Array(9));
        this.frame(F);
        const mx = (x[h * 3] + x[f * 3]) / 2, my = (x[h * 3 + 1] + x[f * 3 + 1]) / 2, mz = (x[h * 3 + 2] + x[f * 3 + 2]) / 2;
        // forward = −back; back = (right × up) for a model looking along −Z, its opposite for one looking along +Z
        const sg = -this.sp.faces, bx = F[6] * sg, by = F[7] * sg, bz = F[8] * sg;
        const fw = -((x[k * 3] - mx) * bx + (x[k * 3 + 1] - my) * by + (x[k * 3 + 2] - mz) * bz);
        if (fw >= 0) return;
        const c = -fw * 0.6;
        x[k * 3] -= bx * c; x[k * 3 + 1] -= by * c; x[k * 3 + 2] -= bz * c;
        x[h * 3] += bx * c * 0.2; x[h * 3 + 1] += by * c * 0.2; x[h * 3 + 2] += bz * c * 0.2;
        x[f * 3] += bx * c * 0.2; x[f * 3 + 1] += by * c * 0.2; x[f * 3 + 2] += bz * c * 0.2;
    }

    /** The hands do not go into the torso (its three balls). */
    _handsOut() {
        for (let t = 0; t < this.sp.torso.length; t++) {
            this._torsoPoint(t, _c);
            const rr = this.sp.torso[t][4] + this.sp.r[P.HNL];
            for (let hh = 0; hh < 2; hh++) {
                const k = (hh ? P.HNR : P.HNL) * 3, dx = this.x[k] - _c[0], dy = this.x[k + 1] - _c[1], dz = this.x[k + 2] - _c[2];
                const d = Math.hypot(dx, dy, dz);
                if (d >= rr || d < 1e-6) continue;
                const f = (rr - d) / d;
                this.x[k] += dx * f; this.x[k + 1] += dy * f; this.x[k + 2] += dz * f;
            }
        }
    }

    /** The body's own parts out of each other (makeSpec.self, selfTorso): both moved apart by half — no part pushes the body around. */
    _selfOut() {
        const x = this.x, o = this.o, sp = this.sp, hit = this._hitMask || 0;
        if (sp.self) for (const [a, b, m] of sp.self) {
            if (hit & ((1 << a) | (1 << b))) continue; // (against a wall, the floor, a bed: the world decides where it is)
            const ka = a * 3, kb = b * 3, dx = x[kb] - x[ka], dy = x[kb + 1] - x[ka + 1], dz = x[kb + 2] - x[ka + 2];
            const dd = Math.hypot(dx, dy, dz);
            if (dd >= m - 0.02 || dd < 1e-6) continue; // (a touch of flesh: let be — only a part really in another is moved)
            const f = (m - 0.02 - dd) / dd * 0.5;
            x[ka] -= dx * f; x[ka + 1] -= dy * f; x[ka + 2] -= dz * f; x[kb] += dx * f; x[kb + 1] += dy * f; x[kb + 2] += dz * f;
            o[ka] -= dx * f; o[ka + 1] -= dy * f; o[ka + 2] -= dz * f; o[kb] += dx * f; o[kb + 1] += dy * f; o[kb + 2] += dz * f; // (moved, not flung: no speed is added)
        }
        if (sp.selfTorso) for (let t = 0; t < sp.torso.length; t++) {
            this._torsoPoint(t, _c);
            for (const [i, k] of sp.selfTorso) {
                if (hit & (1 << i)) continue;
                // (the head's own neck: the chest ball is where it hangs from — only the belly and the hips push it, and the chest a little)
                const kk = i === P.HEAD && t === 0 ? k * 0.75 : k;
                const m = (sp.torso[t][4] + sp.r[i]) * kk, j = i * 3;
                const dx = x[j] - _c[0], dy = x[j + 1] - _c[1], dz = x[j + 2] - _c[2], dd = Math.hypot(dx, dy, dz);
                if (dd >= m - 0.02 || dd < 1e-6) continue;
                const f = (m - 0.02 - dd) / dd;
                x[j] += dx * f; x[j + 1] += dy * f; x[j + 2] += dz * f;
                o[j] += dx * f; o[j + 1] += dy * f; o[j + 2] += dz * f;
            }
        }
    }

    _torsoPoint(t, out) {
        const w = this.sp.torso[t], x = this.x;
        for (let a = 0; a < 3; a++) out[a] = w[0] * x[P.SHL * 3 + a] + w[1] * x[P.SHR * 3 + a] + w[2] * x[P.HIPL * 3 + a] + w[3] * x[P.HIPR * 3 + a];
        return out;
    }

    /** The torso's middle balls against the world: the correction is shared by its four corners. */
    _torso(world) {
        const x = this.x;
        for (let t = 0; t < this.sp.torso.length; t++) {
            this._torsoPoint(t, _c);
            const px = _c[0], py = _c[1], pz = _c[2];
            this._ballOut(world, _c, this.sp.torso[t][4]);
            const dx = _c[0] - px, dy = _c[1] - py, dz = _c[2] - pz;
            if (!dx && !dy && !dz) continue;
            const w = this.sp.torso[t], s = w[0] * w[0] + w[1] * w[1] + w[2] * w[2] + w[3] * w[3];
            const cs = [P.SHL, P.SHR, P.HIPL, P.HIPR];
            for (let q = 0; q < 4; q++) {
                const k = cs[q] * 3, f = w[q] / s;
                x[k] += dx * f; x[k + 1] += dy * f; x[k + 2] += dz * f;
                this._rub(k, Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > Math.abs(dz) ? 1 : Math.abs(dx) > Math.abs(dz) ? 0 : 2);
            }
        }
    }

    /** Ball i out of the world. */
    _collide(world, i) {
        const k = i * 3;
        _c[0] = this.x[k]; _c[1] = this.x[k + 1]; _c[2] = this.x[k + 2];
        const ax = this._ballOut(world, _c, this.sp.r[i]);
        if (ax < 0) return;
        this._hitNow = (this._hitNow || 0) | (1 << i); // (this part touches the world: the world wins over the body's own parts — _selfOut)
        this.x[k] = _c[0]; this.x[k + 1] = _c[1]; this.x[k + 2] = _c[2];
        this._rub(k, ax);
    }

    /**
     * Push the ball (p: 3 numbers, radius r) out of the floor, the boxes and the blocks. → the axis of the strongest push (0 x, 1 y, 2 z),
     * or −1 if it touched nothing.
     */
    _ballOut(world, p, r) {
        this._ax = -1; this._best = 0;
        // the floor the ball's bottom reaches (a taller step beside it is a wall: the blocks push it sideways)
        const fl = world.floor(p[0], p[2], p[1] - r + 0.15);
        if (p[1] < fl + r) { this._note(1, fl + r - p[1]); p[1] = fl + r; }
        // the boxes: a ball against a box
        const list = world.boxes(p[0] - r, p[0] + r, p[2] - r, p[2] + r);
        for (let q = 0; q < list.length; q++) {
            const b = list[q];
            if (b.maxY < p[1] - r || b.minY > p[1] + r) continue;
            const cx = Math.min(Math.max(p[0], b.minX), b.maxX), cy = Math.min(Math.max(p[1], b.minY), b.maxY), cz = Math.min(Math.max(p[2], b.minZ), b.maxZ);
            const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r * r) continue;
            if (d2 > 1e-10) {
                const d = Math.sqrt(d2), pu = (r - d) / d;
                p[0] += dx * pu; p[1] += dy * pu; p[2] += dz * pu;
                this._note(Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > Math.abs(dz) ? 1 : Math.abs(dx) > Math.abs(dz) ? 0 : 2, r - d);
            } else {
                // the middle inside the box: out by the nearest face — the TOP when it is in its upper part (it lies on it, never under)
                const l = p[0] - b.minX, rr = b.maxX - p[0], bk = p[2] - b.minZ, fr = b.maxZ - p[2], up = b.maxY - p[1], dn = p[1] - b.minY;
                const m = Math.min(l, rr, bk, fr, up, dn * 4);
                if (m === up) { p[1] = b.maxY + r; this._note(1, up + r); } else if (m === l) { p[0] = b.minX - r; this._note(0, l + r); } else if (m === rr) { p[0] = b.maxX + r; this._note(0, rr + r); }
                else if (m === bk) { p[2] = b.minZ - r; this._note(2, bk + r); } else if (m === fr) { p[2] = b.maxZ + r; this._note(2, fr + r); } else { p[1] = b.minY - r; this._note(1, dn + r); }
            }
        }
        // (the axis of the strongest push: _note)
        // the blocks (layer L spans y ∈ [L−1.5, L−0.5], CastleLife._walkCell's count) round the ball
        if (world.solid) {
            const ix = Math.round(p[0]), iz = Math.round(p[2]), L0 = Math.round(p[1] + 1);
            for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                const cx = ix + dx, cz = iz + dz, L = L0 + dy;
                const minX = cx - 0.5, maxX = cx + 0.5, minZ = cz - 0.5, maxZ = cz + 0.5, by0 = L - 1.5, by1 = L - 0.5;
                if (p[0] + r <= minX || p[0] - r >= maxX || p[2] + r <= minZ || p[2] - r >= maxZ || p[1] + r <= by0 || p[1] - r >= by1) continue; // (the ball does not reach this cell: no question asked)
                if (!world.solid(cx, cz, L, L)) continue;
                const qx = Math.min(Math.max(p[0], minX), maxX), qz = Math.min(Math.max(p[2], minZ), maxZ), qy = Math.min(Math.max(p[1], by0), by1);
                const ex = p[0] - qx, ey = p[1] - qy, ez = p[2] - qz;
                const d2 = ex * ex + ey * ey + ez * ez;
                if (d2 >= r * r) continue;
                if (d2 > 1e-10) { const d = Math.sqrt(d2), pu = (r - d) / d; p[0] += ex * pu; p[1] += ey * pu; p[2] += ez * pu; this._note(Math.abs(ey) > Math.abs(ex) && Math.abs(ey) > Math.abs(ez) ? 1 : Math.abs(ex) > Math.abs(ez) ? 0 : 2, r - d); }
                else {
                    // inside the block: out sideways to the nearest free side (never up through a ceiling, never down through a floor)
                    const l = p[0] - minX, rr = maxX - p[0], bk = p[2] - minZ, fr = maxZ - p[2], m = Math.min(l, rr, bk, fr);
                    if (m === l) p[0] = minX - r; else if (m === rr) p[0] = maxX + r; else if (m === bk) p[2] = minZ - r; else p[2] = maxZ + r;
                    this._note(m === l || m === rr ? 0 : 2, m + r);
                }
            }
        }
        return this._ax;
    }

    _note(a, d) { if (d > this._best) { this._best = d; this._ax = a; } }

    /** A contact on axis `ax` (0 x, 1 y, 2 z): the speed into the surface is gone (a little comes back), the sliding along it loses most of itself. */
    _rub(k, ax) {
        const x = this.x, o = this.o;
        this.contacts++;
        let t2 = 0;
        for (let a = 0; a < 3; a++) if (a !== ax) { const v = x[k + a] - o[k + a]; t2 += v * v; }
        const stick = t2 < DOLL.STICK * DOLL.STICK;
        for (let a = 0; a < 3; a++) {
            const j = k + a, v = x[j] - o[j];
            o[j] = x[j] - v * (a === ax ? DOLL.BOUNCE : stick ? 0 : DOLL.FRICTION);
        }
    }

    // ------------------------------------------------------------ results
    /** Point i's place into out [x, y, z] (CHEST / PELVIS: the middle of the shoulders / the hips). */
    at(i, out = [0, 0, 0]) {
        if (i === P.CHEST || i === P.PELVIS) {
            const a = i === P.CHEST ? P.SHL : P.HIPL, b = i === P.CHEST ? P.SHR : P.HIPR;
            for (let q = 0; q < 3; q++) out[q] = (this.x[a * 3 + q] + this.x[b * 3 + q]) / 2;
            return out;
        }
        out[0] = this.x[i * 3]; out[1] = this.x[i * 3 + 1]; out[2] = this.x[i * 3 + 2];
        return out;
    }

    /** Ball i's radius. */
    static radius(i) { return HUMAN.r[i]; }

    /** Ball i's radius in this doll. */
    radius(i) { return this.sp.r[i]; }

    /** How deep the body is in the world right now (m; 0 — clear): every ball and the torso's three. */
    penetration(world) {
        let worst = 0;
        const probe = (px, py, pz, r) => {
            _c[0] = px; _c[1] = py; _c[2] = pz;
            this._ballOut(world, _c, r);
            const d = Math.hypot(_c[0] - px, _c[1] - py, _c[2] - pz);
            if (d > worst) worst = d;
        };
        const slack = 0.06; // (a ball just touching is not «in»)
        for (let i = 0; i < N; i++) probe(this.x[i * 3], this.x[i * 3 + 1], this.x[i * 3 + 2], this.sp.r[i] - slack);
        const T = new Float64Array(3);
        for (let t = 0; t < this.sp.torso.length; t++) { this._torsoPoint(t, T); probe(T[0], T[1], T[2], this.sp.torso[t][4] - slack); }
        return worst;
    }

    /** The lowest point of the body (a body lying on a bed has it at the bed's top). */
    lowest() { let m = Infinity; for (let i = 0; i < N; i++) m = Math.min(m, this.x[i * 3 + 1] - this.sp.r[i]); return m; }
}
