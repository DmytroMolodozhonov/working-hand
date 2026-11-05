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
    SIM_MAX: 7,         // seconds one doll is computed at the most (then it is put to sleep where it is)
};

// the points; CHEST and PELVIS are not points of their own (the middle of the shoulders / the hips) — `at` gives them too
export const P = { HEAD: 0, SHL: 1, SHR: 2, HIPL: 3, HIPR: 4, HNL: 5, HNR: 6, KNL: 7, FTL: 8, KNR: 9, FTR: 10, CHEST: 11, PELVIS: 12 };
const N = 11;
/** Where each point is on a person standing (feet frame, x to his right, y up, z behind him) — VillagerModel's measures. */
export const REST = [
    [0, 4.05, 0],                       // head (the middle of the 1.2 m cube)
    [-0.8, 3.25, 0], [0.8, 3.25, 0],    // shoulders
    [-0.3, 1.95, 0], [0.3, 1.95, 0],    // hips
    [-0.8, 2.30, 0], [0.8, 2.30, 0],    // hands (0.95 down the arm)
    [-0.3, 0.95, 0], [-0.3, 0.30, 0],   // left knee, foot
    [0.3, 0.95, 0], [0.3, 0.30, 0],     // right knee, foot
];
const R = [0.68, 0.42, 0.42, 0.42, 0.42, 0.28, 0.28, 0.34, 0.32, 0.34, 0.32];
const dist = (a, b) => Math.hypot(REST[a][0] - REST[b][0], REST[a][1] - REST[b][1], REST[a][2] - REST[b][2]);
// bones that hold their length: [a, b, length, stiffness]
const BONES = [
    // the torso: four corners and both diagonals — stiff
    [P.SHL, P.SHR, dist(P.SHL, P.SHR), 1], [P.HIPL, P.HIPR, dist(P.HIPL, P.HIPR), 1],
    [P.SHL, P.HIPL, dist(P.SHL, P.HIPL), 1], [P.SHR, P.HIPR, dist(P.SHR, P.HIPR), 1],
    [P.SHL, P.HIPR, dist(P.SHL, P.HIPR), 1], [P.SHR, P.HIPL, dist(P.SHR, P.HIPL), 1],
    // the head on its neck (it nods round the shoulders' line)
    [P.HEAD, P.SHL, dist(P.HEAD, P.SHL), 1], [P.HEAD, P.SHR, dist(P.HEAD, P.SHR), 1],
    // the arms, the legs
    [P.SHL, P.HNL, 0.95, 1], [P.SHR, P.HNR, 0.95, 1],
    [P.HIPL, P.KNL, 1.0, 1], [P.KNL, P.FTL, 0.65, 1], [P.HIPR, P.KNR, 1.0, 1], [P.KNR, P.FTR, 0.65, 1],
];
// the joints' limits: [a, b, min, max] — the two points may not come closer than min (nor further than max, if given)
const HEAD_HIP = Math.hypot(0, REST[0][1] - 1.95);
const LIMITS = [
    [P.HEAD, P.HIPL, HEAD_HIP - 0.55, Infinity], [P.HEAD, P.HIPR, HEAD_HIP - 0.55, Infinity], // (the head does not fold onto the chest / far behind)
    [P.HIPL, P.FTL, 0.62, Infinity], [P.HIPR, P.FTR, 0.62, Infinity],     // (a knee bends up to ~140°)
    [P.SHL, P.KNL, 1.05, Infinity], [P.SHR, P.KNR, 1.05, Infinity],       // (a thigh does not go up through the chest)
    [P.KNL, P.KNR, 0.42, Infinity], [P.FTL, P.FTR, 0.42, Infinity],       // (the legs do not pass through each other)
    [P.HNL, P.HNR, 0.45, Infinity], [P.HEAD, P.HNL, 0.75, Infinity], [P.HEAD, P.HNR, 0.75, Infinity],
];
// the balls along the torso (weights of the four corners SHL, SHR, HIPL, HIPR) and their radius — the body's thickness (0.8 deep)
const TORSO_BALLS = [[0.4, 0.4, 0.1, 0.1, 0.5], [0.25, 0.25, 0.25, 0.25, 0.5], [0.1, 0.1, 0.4, 0.4, 0.5]];

const _c = new Float64Array(3);

export class Ragdoll {
    constructor() {
        this.x = new Float64Array(N * 3);
        this.o = new Float64Array(N * 3); // the previous positions (Verlet: the speed is x − o)
        this.asleep = true;
        this.still = 0;
        this.age = 0;
        this.acc = 0;
        this.contacts = 0;
        this.goal = null; // (getting up: where each point is pulled — standUp)
    }

    /** Put point i at (x, y, z) (from a model's current pose — RagdollPose.fromModel). Then `launch`. */
    set(i, x, y, z) { this.x[i * 3] = x; this.x[i * 3 + 1] = y; this.x[i * 3 + 2] = z; }

    /** A standing body at (x, floorY, z) looking along the unit (fx, fz), moving with (vx, vy, vz) m/s, turning at `spin` rad/s round its middle. */
    stand(x, floorY, z, fx, fz, vx = 0, vy = 0, vz = 0, spin = 0) {
        const s = Math.hypot(fx, fz) || 1; fx /= s; fz /= s;
        const rx = -fz, rz = fx; // (his right)
        for (let i = 0; i < N; i++) { const p = REST[i]; this.set(i, x + rx * p[0] - fx * p[2], floorY + p[1], z + rz * p[0] - fz * p[2]); }
        this.launch(vx, vy, vz, spin);
    }

    /**
     * Getting up: every point is pulled (GOAL_K a step) toward a person standing at (x, floorY, z) looking along (fx, fz) — no gravity, slow;
     * the world still pushes the balls out (last), so a body by a wall gets up along it, never through it. `goalDist` says how far it still is.
     */
    standUp(x, floorY, z, fx, fz) {
        const s = Math.hypot(fx, fz) || 1; fx /= s; fz /= s;
        const rx = -fz, rz = fx;
        const g = this.goal || (this.goal = new Float64Array(N * 3));
        for (let i = 0; i < N; i++) { const p = REST[i]; g[i * 3] = x + rx * p[0] - fx * p[2]; g[i * 3 + 1] = floorY + p[1]; g[i * 3 + 2] = z + rz * p[0] - fz * p[2]; }
        this.asleep = false; this.still = 0; this.age = 0;
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
        for (let i = 0; i < N; i++) { const p = REST[i]; this.set(i, x + ax * p[1] + rx * p[0], floorY + (i >= P.SHL && i <= P.HIPR ? 0.52 : R[i] + 0.02), z + az * p[1] + rz * p[0]); } // (each ball resting on the floor, the torso on its thickness)
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
            // getting up: no fall, no swing — each point goes toward its place standing; the bones and the world still hold
            const gl = this.goal, K = DOLL.GOAL_K;
            for (let i = 0; i < N * 3; i++) { o[i] = x[i]; x[i] += (gl[i] - x[i]) * K; }
            this.contacts = 0;
            for (let it = 0; it < DOLL.ITER; it++) {
                for (let b = 0; b < BONES.length; b++) this._len(BONES[b][0], BONES[b][1], BONES[b][2], BONES[b][2], BONES[b][3]);
                if (it & 1 || it === DOLL.ITER - 1) { for (let i = 0; i < N; i++) this._collide(world, i); this._torso(world); }
            }
            for (let i = 0; i < N * 3; i++) o[i] = x[i];
            return;
        }
        for (let i = 0; i < N; i++) {
            const k = i * 3, lim = R[i] * DOLL.MAX_MOVE_K;
            let vx = (x[k] - o[k]) * DOLL.DAMP, vy = (x[k + 1] - o[k + 1]) * DOLL.DAMP - DOLL.G * dt * dt, vz = (x[k + 2] - o[k + 2]) * DOLL.DAMP;
            const m = Math.hypot(vx, vy, vz);
            if (m > lim) { const q = lim / m; vx *= q; vy *= q; vz *= q; }
            o[k] = x[k]; o[k + 1] = x[k + 1]; o[k + 2] = x[k + 2];
            x[k] += vx; x[k + 1] += vy; x[k + 2] += vz;
        }
        this.contacts = 0;
        for (let it = 0; it < DOLL.ITER; it++) {
            for (let b = 0; b < BONES.length; b++) this._len(BONES[b][0], BONES[b][1], BONES[b][2], BONES[b][2], BONES[b][3]);
            for (let b = 0; b < LIMITS.length; b++) this._len(LIMITS[b][0], LIMITS[b][1], LIMITS[b][2], LIMITS[b][3], 1);
            this._knee(P.HIPL, P.KNL, P.FTL); this._knee(P.HIPR, P.KNR, P.FTR);
            this._handsOut();
            // the world last (it wins): every other pass and the final one — the blocks are the dearest question
            if (it & 1 || it === DOLL.ITER - 1) { for (let i = 0; i < N; i++) this._collide(world, i); this._torso(world); }
        }
        let mv = 0;
        for (let i = 0; i < N * 3; i++) { const d = Math.abs(x[i] - o[i]); if (d > mv) mv = d; }
        if (mv < DOLL.SLEEP_V && this.contacts > 0) { this.still += dt; if (this.still >= DOLL.SLEEP_T) this._sleep(); } else this.still = 0;
        if (this.age > DOLL.SIM_MAX) this._sleep();
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
        // forward = −back
        const fw = -((x[k * 3] - mx) * F[6] + (x[k * 3 + 1] - my) * F[7] + (x[k * 3 + 2] - mz) * F[8]);
        if (fw >= 0) return;
        const c = -fw * 0.6;
        x[k * 3] -= F[6] * c; x[k * 3 + 1] -= F[7] * c; x[k * 3 + 2] -= F[8] * c;
        x[h * 3] += F[6] * c * 0.2; x[h * 3 + 1] += F[7] * c * 0.2; x[h * 3 + 2] += F[8] * c * 0.2;
        x[f * 3] += F[6] * c * 0.2; x[f * 3 + 1] += F[7] * c * 0.2; x[f * 3 + 2] += F[8] * c * 0.2;
    }

    /** The hands do not go into the torso (its three balls). */
    _handsOut() {
        for (let t = 0; t < TORSO_BALLS.length; t++) {
            this._torsoPoint(t, _c);
            const rr = TORSO_BALLS[t][4] + R[P.HNL];
            for (let hh = 0; hh < 2; hh++) {
                const k = (hh ? P.HNR : P.HNL) * 3, dx = this.x[k] - _c[0], dy = this.x[k + 1] - _c[1], dz = this.x[k + 2] - _c[2];
                const d = Math.hypot(dx, dy, dz);
                if (d >= rr || d < 1e-6) continue;
                const f = (rr - d) / d;
                this.x[k] += dx * f; this.x[k + 1] += dy * f; this.x[k + 2] += dz * f;
            }
        }
    }

    _torsoPoint(t, out) {
        const w = TORSO_BALLS[t], x = this.x;
        for (let a = 0; a < 3; a++) out[a] = w[0] * x[P.SHL * 3 + a] + w[1] * x[P.SHR * 3 + a] + w[2] * x[P.HIPL * 3 + a] + w[3] * x[P.HIPR * 3 + a];
        return out;
    }

    /** The torso's middle balls against the world: the correction is shared by its four corners. */
    _torso(world) {
        const x = this.x;
        for (let t = 0; t < TORSO_BALLS.length; t++) {
            this._torsoPoint(t, _c);
            const px = _c[0], py = _c[1], pz = _c[2];
            this._ballOut(world, _c, TORSO_BALLS[t][4]);
            const dx = _c[0] - px, dy = _c[1] - py, dz = _c[2] - pz;
            if (!dx && !dy && !dz) continue;
            const w = TORSO_BALLS[t], s = w[0] * w[0] + w[1] * w[1] + w[2] * w[2] + w[3] * w[3];
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
        const ax = this._ballOut(world, _c, R[i]);
        if (ax < 0) return;
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
    static radius(i) { return R[i]; }

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
        for (let i = 0; i < N; i++) probe(this.x[i * 3], this.x[i * 3 + 1], this.x[i * 3 + 2], R[i] - slack);
        const T = new Float64Array(3);
        for (let t = 0; t < TORSO_BALLS.length; t++) { this._torsoPoint(t, T); probe(T[0], T[1], T[2], TORSO_BALLS[t][4] - slack); }
        return worst;
    }

    /** The lowest point of the body (a body lying on a bed has it at the bed's top). */
    lowest() { let m = Infinity; for (let i = 0; i < N; i++) m = Math.min(m, this.x[i * 3 + 1] - R[i]); return m; }
}
