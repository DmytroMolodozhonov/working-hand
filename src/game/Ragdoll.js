/**
 * Ragdoll.js — a cheap rag doll for a body that is knocked down, thrown or dead (the author: «даже не анимация, а скорее тряпичная
 * кукла: как он умер/упал в той позе, так и остался, но без прохода в текстуры»).
 *
 * 11 points (head, chest, pelvis, 2 elbows, 2 hands, 2 knees, 2 feet) joined by bones of the hero's measures (shoulder 1.0, forearm 0.9,
 * thigh 1.0, shin 1.0, torso 1.0, neck 0.9 — the same as the stand-in body of the game, blocks of 1 m, hero ~3.5 m). Verlet integration,
 * fixed steps (the same result at any frame rate), bone lengths held by relaxation, joints limited by minimum distances (a knee does not
 * fold flat, the spine does not fold in two, an elbow stops at ~150°). Every point is a ball with a radius that is pushed out of the
 * world — the collision boxes (beds, chests, cupboards), the terrain's blocks and the floor — in sub-steps of half its radius, so
 * a point flung at 60 m/s never skips a block. A doll asleep (everything moves < 2 mm for half a second) costs nothing: `step` returns at
 * once until it is woken (`wake`).
 *
 * Pure numbers (no THREE): `world` = {boxes(minX,maxX,minZ,maxZ) → [{minX,maxX,minY,maxY,noSupport?}], solid(ix,iz,layerLo,layerHi) → bool,
 * floor(x, z, reachY) → floor height}. The arrays are reused: no garbage while it moves.
 */

export const DOLL = {
    DT: 1 / 60, G: 24, DAMP: 0.992, ITER: 8,
    FRICTION: 0.55,     // share of the sliding kept each contact step (a body on a floor stops)
    SLEEP_V: 0.002, SLEEP_T: 0.5,
    MAX_MOVE_K: 0.5,    // a point moves at most this share of its radius per step: no skipping a block
    SIM_MAX: 6,         // seconds one doll is simulated before it is put to sleep at the latest
};

// point indices
export const P = { HEAD: 0, CHEST: 1, PELVIS: 2, ELL: 3, HNL: 4, ELR: 5, HNR: 6, KNL: 7, FTL: 8, KNR: 9, FTR: 10 };
const N = 11;
const R = [0.6, 0.6, 0.55, 0.3, 0.3, 0.3, 0.3, 0.35, 0.35, 0.35, 0.35];
// bones: [a, b, length]
const BONES = [
    [P.HEAD, P.CHEST, 0.9], [P.CHEST, P.PELVIS, 1.0],
    [P.CHEST, P.ELL, 1.0], [P.ELL, P.HNL, 0.9], [P.CHEST, P.ELR, 1.0], [P.ELR, P.HNR, 0.9],
    [P.PELVIS, P.KNL, 1.0], [P.KNL, P.FTL, 1.0], [P.PELVIS, P.KNR, 1.0], [P.KNR, P.FTR, 1.0],
    // (the shoulders and the hips are not one point: the width is held by these)
    [P.ELL, P.ELR, 1.55], [P.KNL, P.KNR, 0.6],
];
// joint limits: [a, b, min distance] — the bones' ends cannot come closer than this (a bend of at most ~150° at the elbow, ~140° at the knee…)
const LIMITS = [
    [P.CHEST, P.HNL, 0.45], [P.CHEST, P.HNR, 0.45], [P.PELVIS, P.FTL, 0.55], [P.PELVIS, P.FTR, 0.55],
    [P.HEAD, P.PELVIS, 1.45], [P.CHEST, P.KNL, 1.1], [P.CHEST, P.KNR, 1.1], [P.HEAD, P.ELL, 0.8], [P.HEAD, P.ELR, 0.8],
    [P.ELL, P.ELR, 1.2], [P.HEAD, P.KNL, 1.6], [P.HEAD, P.KNR, 1.6],
];

export class Ragdoll {
    constructor() {
        this.x = new Float64Array(N * 3);
        this.o = new Float64Array(N * 3); // the previous positions (Verlet: the speed is x − o)
        this.asleep = true;
        this.still = 0;
        this.age = 0;
        this.acc = 0;
        this.contacts = 0;
    }

    /**
     * Start from a standing body at (x, floorY, z) facing the unit (fx, fz), moving with (vx, vy, vz) m/s (the shove / the throw). `spin`
     * (rad/s about the vertical axis through the middle) turns it as it flies.
     */
    stand(x, floorY, z, fx, fz, vx = 0, vy = 0, vz = 0, spin = 0) {
        const s = Math.hypot(fx, fz) || 1; fx /= s; fz /= s;
        const px = -fz, pz = fx; // (its left-right axis)
        const set = (i, a, h, b) => { this.x[i * 3] = x + fx * b + px * a; this.x[i * 3 + 1] = floorY + h; this.x[i * 3 + 2] = z + fz * b + pz * a; };
        set(P.HEAD, 0, 3.55, 0); set(P.CHEST, 0, 2.65, 0); set(P.PELVIS, 0, 1.65, 0);
        set(P.ELL, -0.7, 2.55, 0); set(P.HNL, -0.7, 1.7, 0); set(P.ELR, 0.7, 2.55, 0); set(P.HNR, 0.7, 1.7, 0);
        set(P.KNL, -0.3, 0.95, 0); set(P.FTL, -0.3, 0.3, 0); set(P.KNR, 0.3, 0.95, 0); set(P.FTR, 0.3, 0.3, 0);
        this._launch(vx, vy, vz, spin, x, z);
    }

    /**
     * Start from a body that is already lying (a dead body in its pose): feet at (x, floorY, z), the head along the unit (ax, az), `side`
     * ±1 — which way its left lies. The pose is kept; it only settles onto whatever it lies on.
     */
    lie(x, floorY, z, ax, az, side = 1) {
        const s = Math.hypot(ax, az) || 1; ax /= s; az /= s;
        const px = -az * side, pz = ax * side;
        const y = floorY + 0.35;
        const set = (i, along, across) => { this.x[i * 3] = x + ax * along + px * across; this.x[i * 3 + 1] = y; this.x[i * 3 + 2] = z + az * along + pz * across; };
        set(P.FTL, 0.0, -0.3); set(P.FTR, 0.0, 0.3); set(P.KNL, 1.0, -0.3); set(P.KNR, 1.0, 0.3);
        set(P.PELVIS, 2.0, 0); set(P.CHEST, 3.0, 0); set(P.HEAD, 3.9, 0);
        set(P.ELL, 2.9, -0.85); set(P.HNL, 2.0, -0.95); set(P.ELR, 2.9, 0.85); set(P.HNR, 2.0, 0.95);
        this._launch(0, 0, 0, 0, x, z);
    }

    _launch(vx, vy, vz, spin, cx, cz) {
        const dt = DOLL.DT;
        for (let i = 0; i < N; i++) {
            const k = i * 3;
            const rx = this.x[k] - cx, rz = this.x[k + 2] - cz;
            this.o[k] = this.x[k] - (vx - spin * rz) * dt;
            this.o[k + 1] = this.x[k + 1] - vy * dt;
            this.o[k + 2] = this.x[k + 2] - (vz + spin * rx) * dt;
        }
        this.asleep = false; this.still = 0; this.age = 0; this.acc = 0;
    }

    wake() { this.asleep = false; this.still = 0; }

    /** A push now (m/s on every point, y included). */
    push(vx, vy, vz) { for (let i = 0; i < N; i++) { this.o[i * 3] -= vx * DOLL.DT; this.o[i * 3 + 1] -= vy * DOLL.DT; this.o[i * 3 + 2] -= vz * DOLL.DT; } this.wake(); }

    /** Advance by `dt` seconds (fixed inner steps). → true while it still moves. */
    step(world, dt) {
        if (this.asleep) return false;
        this.acc += Math.min(dt, 0.1);
        let n = 0;
        while (this.acc >= DOLL.DT && n < 6) { this.acc -= DOLL.DT; this._tick(world); n++; }
        return !this.asleep;
    }

    _tick(world) {
        const dt = DOLL.DT, x = this.x, o = this.o;
        this.age += dt;
        // integrate (the move of a point is limited: it never jumps further than half its radius in one step)
        for (let i = 0; i < N; i++) {
            const k = i * 3, lim = R[i] * DOLL.MAX_MOVE_K;
            let vx = (x[k] - o[k]) * DOLL.DAMP, vy = (x[k + 1] - o[k + 1]) * DOLL.DAMP - DOLL.G * dt * dt, vz = (x[k + 2] - o[k + 2]) * DOLL.DAMP;
            const m = Math.hypot(vx, vy, vz);
            if (m > lim) { const q = lim / m; vx *= q; vy *= q; vz *= q; }
            o[k] = x[k]; o[k + 1] = x[k + 1]; o[k + 2] = x[k + 2];
            x[k] += vx; x[k + 1] += vy; x[k + 2] += vz;
        }
        // relax the bones and the joint limits, then push the balls out of the world (the world is last: it wins over the bones)
        this.contacts = 0;
        for (let it = 0; it < DOLL.ITER; it++) {
            for (let b = 0; b < BONES.length; b++) this._bone(BONES[b][0], BONES[b][1], BONES[b][2], 2);
            for (let b = 0; b < LIMITS.length; b++) this._bone(LIMITS[b][0], LIMITS[b][1], LIMITS[b][2], 1);
            for (let i = 0; i < N; i++) this._collide(world, i);
        }
        // asleep?
        let mv = 0;
        for (let i = 0; i < N * 3; i++) mv = Math.max(mv, Math.abs(x[i] - o[i]));
        if (mv < DOLL.SLEEP_V && this.contacts > 0) { this.still += dt; if (this.still >= DOLL.SLEEP_T) this._sleep(); } else this.still = 0;
        if (this.age > DOLL.SIM_MAX) this._sleep();
    }

    _sleep() { this.asleep = true; for (let i = 0; i < N * 3; i++) this.o[i] = this.x[i]; }

    /** mode 2: hold the length (both ends move); mode 1: hold at least this length. */
    _bone(a, b, len, mode) {
        const x = this.x, i = a * 3, j = b * 3;
        const dx = x[j] - x[i], dy = x[j + 1] - x[i + 1], dz = x[j + 2] - x[i + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-9;
        if (mode === 1 && d >= len) return;
        const k = (d - len) / d * 0.5;
        x[i] += dx * k; x[i + 1] += dy * k; x[i + 2] += dz * k;
        x[j] -= dx * k; x[j + 1] -= dy * k; x[j + 2] -= dz * k;
    }

    /** Push ball i out of the boxes, the blocks and the floor; the part of the move along the surface is rubbed away (friction). */
    _collide(world, i) {
        const x = this.x, o = this.o, k = i * 3, r = R[i];
        // the floor (and whatever stands as a floor: a bed's top under the ball)
        const fl = world.floor(x[k], x[k + 2], x[k + 1] - r + 0.15); // (a floor the ball's bottom reaches; a taller step beside it is a wall: the blocks push it sideways)
        if (x[k + 1] < fl + r) { x[k + 1] = fl + r; this._rub(k, 1); }
        // the boxes: a ball against a rectangle prism
        const list = world.boxes(x[k] - r, x[k] + r, x[k + 2] - r, x[k + 2] + r);
        for (let q = 0; q < list.length; q++) {
            const b = list[q];
            if (b.maxY < x[k + 1] - r || b.minY > x[k + 1] + r) continue;
            const cx = Math.min(Math.max(x[k], b.minX), b.maxX), cy = Math.min(Math.max(x[k + 1], b.minY), b.maxY), cz = Math.min(Math.max(x[k + 2], b.minZ), b.maxZ);
            let dx = x[k] - cx, dy = x[k + 1] - cy, dz = x[k + 2] - cz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r * r) continue;
            if (d2 > 1e-10) {
                const d = Math.sqrt(d2), pu = (r - d) / d;
                x[k] += dx * pu; x[k + 1] += dy * pu; x[k + 2] += dz * pu;
                this._rub(k, Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > Math.abs(dz) ? 1 : Math.abs(dx) > Math.abs(dz) ? 0 : 2);
            } else {
                // the centre is inside the box: out through the nearest face — the TOP if the ball is in its upper half (it lies on it, never under)
                const l = x[k] - b.minX, rr = b.maxX - x[k], bk = x[k + 2] - b.minZ, fr = b.maxZ - x[k + 2], up = b.maxY - x[k + 1], dn = x[k + 1] - b.minY;
                const m = Math.min(l, rr, bk, fr, up, dn * 4);
                if (m === up) x[k + 1] = b.maxY + r; else if (m === l) x[k] = b.minX - r; else if (m === rr) x[k] = b.maxX + r; else if (m === bk) x[k + 2] = b.minZ - r; else if (m === fr) x[k + 2] = b.maxZ + r; else x[k + 1] = b.minY - r;
                this._rub(k, 1);
            }
        }
        // the blocks (one cell around the ball's middle, the neighbours by the faces)
        if (world.solid) this._blocks(world, k, r);
    }

    _blocks(world, k, r) {
        const x = this.x;
        // (layer L spans y ∈ [L−1.5, L−0.5], the same count as CastleLife._walkCell; the ball may touch the layer above and below too)
        const ix = Math.round(x[k]), iz = Math.round(x[k + 2]), L0 = Math.round(x[k + 1] + 1);
        for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const cx = ix + dx, cz = iz + dz, L = L0 + dy;
            if (!world.solid(cx, cz, L, L)) continue;
            const minX = cx - 0.5, maxX = cx + 0.5, minZ = cz - 0.5, maxZ = cz + 0.5, by0 = L - 1.5, by1 = L - 0.5;
            const px = Math.min(Math.max(x[k], minX), maxX), pz = Math.min(Math.max(x[k + 2], minZ), maxZ), py = Math.min(Math.max(x[k + 1], by0), by1);
            const ex = x[k] - px, ey = x[k + 1] - py, ez = x[k + 2] - pz;
            const d2 = ex * ex + ey * ey + ez * ez;
            if (d2 >= r * r) continue;
            if (d2 > 1e-10) { const d = Math.sqrt(d2), pu = (r - d) / d; x[k] += ex * pu; x[k + 1] += ey * pu; x[k + 2] += ez * pu; this._rub(k, Math.abs(ey) > Math.abs(ex) && Math.abs(ey) > Math.abs(ez) ? 1 : Math.abs(ex) > Math.abs(ez) ? 0 : 2); }
            else {
                // inside the block: out sideways to the nearest free side (never up through a ceiling or down through a floor)
                const l = x[k] - minX, rr = maxX - x[k], bk = x[k + 2] - minZ, fr = maxZ - x[k + 2], m = Math.min(l, rr, bk, fr);
                if (m === l) x[k] = minX - r; else if (m === rr) x[k] = maxX + r; else if (m === bk) x[k + 2] = minZ - r; else x[k + 2] = maxZ + r;
                this._rub(k, 0);
            }
        }
    }

    /** A contact on axis `ax` (0 x, 1 y, 2 z): the speed into the surface is killed, the sliding along it loses part of itself. */
    _rub(k, ax) {
        const x = this.x, o = this.o;
        this.contacts++;
        for (let a = 0; a < 3; a++) {
            const j = k + a, v = x[j] - o[j];
            if (a === ax) o[j] = x[j] - v * 0.05; // (the normal: almost no bounce)
            else o[j] = x[j] - v * DOLL.FRICTION; // (along the surface)
        }
    }

    // ------------------------------------------------------------ results
    /** The point i's position into out [x, y, z]. */
    at(i, out = [0, 0, 0]) { out[0] = this.x[i * 3]; out[1] = this.x[i * 3 + 1]; out[2] = this.x[i * 3 + 2]; return out; }

    /** Radius of ball i. */
    static radius(i) { return R[i]; }

    /** Is every ball clear of the world right now (the test the guard uses)? → the worst penetration (m), 0 = clear. */
    penetration(world) {
        let worst = 0;
        const x = this.x;
        for (let i = 0; i < N; i++) {
            const k = i * 3, r = R[i] - 0.06;
            const list = world.boxes(x[k] - r, x[k] + r, x[k + 2] - r, x[k + 2] + r);
            for (let q = 0; q < list.length; q++) {
                const b = list[q];
                if (b.maxY < x[k + 1] - r || b.minY > x[k + 1] + r) continue;
                const cx = Math.min(Math.max(x[k], b.minX), b.maxX), cy = Math.min(Math.max(x[k + 1], b.minY), b.maxY), cz = Math.min(Math.max(x[k + 2], b.minZ), b.maxZ);
                const d = Math.hypot(x[k] - cx, x[k + 1] - cy, x[k + 2] - cz);
                if (d < r) worst = Math.max(worst, r - d);
            }
            const fl = world.floor(x[k], x[k + 2], x[k + 1] - R[i] + 0.15);
            if (x[k + 1] < fl + r) worst = Math.max(worst, fl + r - x[k + 1]);
        }
        return worst;
    }

    /** Lowest and highest point's y (a body lying on a bed has its lowest point at the bed's top). */
    lowest() { let m = Infinity; for (let i = 0; i < N; i++) m = Math.min(m, this.x[i * 3 + 1] - R[i]); return m; }
}
