/**
 * RealSdf.js — the shapes the «Реалистичный» hero is made of, as signed distances (no THREE: it runs in a worker).
 *
 * A body is a list of primitives (spheres, oriented ellipsoids, round cones, round boxes, tori, cones, half-spaces) in
 * groups: inside a group they melt together (smooth union, `k`), the groups are added (or cut away) one after another.
 * Each primitive carries a `part` (torso, arm, leg, head, lip, nail…) — the vertices it makes know what they are (the
 * weights, the cloth, the colour). The mesher (`meshSdf`) samples the distance only near the surface (blocks far from it
 * are skipped), makes a surface-nets mesh, puts every vertex onto the surface (two Newton steps) and gives it the
 * surface's own normal and ambient occlusion — so the skin is smooth, the creases (between fingers, under the chin, in
 * the ears) are darker by themselves.
 */

export const T = { SPHERE: 1, ELLIPSOID: 2, CONE: 3, BOX: 4, TORUS: 5, PLANE: 6, CAP: 7, HCONE: 8, ETORUS: 9, BUMP: 10 };

const sqrt = Math.sqrt, abs = Math.abs, max = Math.max, min = Math.min;

/** Polynomial smooth min (IQ): melts two shapes over `k`. */
export function smin(a, b, k) {
    if (k <= 0) return a < b ? a : b;
    const h = max(k - abs(a - b), 0) / k;
    return min(a, b) - h * h * k * 0.25;
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

// ------------------------------------------------------------------ small vector helpers (arrays [x, y, z])
export const v3 = (x, y, z) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => sqrt(dot(a, a));
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** An orthonormal frame [x, y, z] whose z is `zAxis`, its y as near `upHint` as it can be. */
export function frameZ(zAxis, upHint = [0, 1, 0]) {
    const z = norm(zAxis);
    let x = cross(upHint, z);
    if (len(x) < 1e-5) x = cross([1, 0, 0], z);
    x = norm(x);
    return [x, cross(z, x), z];
}
/** A frame [x, y, z] whose y is `yAxis` (a limb along y), x as near `xHint` as it can be. */
export function frameY(yAxis, xHint = [1, 0, 0]) {
    const y = norm(yAxis);
    let z = cross(xHint, y);
    if (len(z) < 1e-5) z = cross([0, 0, 1], y);
    z = norm(z);
    return [cross(y, z), y, z];
}
/** Rotation about an axis (Rodrigues) as a frame of the world's x, y, z turned. */
export function rotFrame(axis, ang) {
    const a = norm(axis), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    const [x, y, z] = a;
    // the rows of R (R·v turns v): the frame's axes are its columns, we keep rows of the inverse (= transposed)
    return [[t * x * x + c, t * x * y + s * z, t * x * z - s * y], [t * x * y - s * z, t * y * y + c, t * y * z + s * x], [t * x * z + s * y, t * y * z - s * x, t * z * z + c]];
}

// ------------------------------------------------------------------ primitives
let _pid = 0;
/**
 * A primitive. `o`: {part, zone, sub (cut away), k (smooth with its group)} — and its shape:
 *   sphere(c, r) · ellipsoid(c, radii, frame) · cone(a, b, ra, rb, {flat, flatAxis}) · box(c, half, frame, round)
 *   torus(c, R, r, frame) · plane(n, d) (keeps n·p ≥ d) · cap(c, frame, r, h, round) (a rounded cylinder along y)
 *   hcone(c, frame, h, r, round) (a cone along y, tip up)
 */
function prim(t, p, o = {}) {
    return { id: _pid++, t, p, part: o.part ?? 0, zone: o.zone ?? 0, bs: null };
}
export function sphere(c, r, o) { const q = prim(T.SPHERE, [c[0], c[1], c[2], r], o); q.bs = [c[0], c[1], c[2], r]; return q; }
/** `frame`: three unit axes (rows); the radii along them. */
export function ellipsoid(c, radii, frame = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], o) {
    const q = prim(T.ELLIPSOID, [c[0], c[1], c[2], ...frame[0], ...frame[1], ...frame[2], radii[0], radii[1], radii[2]], o);
    q.bs = [c[0], c[1], c[2], max(radii[0], radii[1], radii[2])];
    return q;
}
/** A round cone from `a` (radius ra) to `b` (rb); `flat` < 1 squeezes it across `flatAxis` (a flattened limb). */
export function cone(a, b, ra, rb, o = {}) {
    const ab = sub(b, a), L = len(ab), u = norm(ab);
    let fa = o.flatAxis ? norm(sub(o.flatAxis, mul(u, dot(o.flatAxis, u)))) : [0, 0, 0];
    const q = prim(T.CONE, [a[0], a[1], a[2], u[0], u[1], u[2], L, ra, rb, fa[0], fa[1], fa[2], o.flat ?? 1], o);
    q.bs = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, L / 2 + max(ra, rb)];
    return q;
}
export function box(c, half, frame = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], round = 0, o) {
    const q = prim(T.BOX, [c[0], c[1], c[2], ...frame[0], ...frame[1], ...frame[2], half[0], half[1], half[2], round], o);
    q.bs = [c[0], c[1], c[2], len(half) + round];
    return q;
}
/** A torus round the frame's y axis (in its x–z plane). */
export function torus(c, R, r, frame = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], o) {
    const q = prim(T.TORUS, [c[0], c[1], c[2], ...frame[0], ...frame[1], ...frame[2], R, r], o);
    q.bs = [c[0], c[1], c[2], R + r];
    return q;
}
/** A half-space: inside where n·p < d (a flat sole: intersect with the floor's plane). */
export function plane(n, d, o) { const l = len(n) || 1, u = norm(n); const q = prim(T.PLANE, [u[0], u[1], u[2], d / l], o); q.bs = null; return q; }
/** A rounded cylinder along the frame's y: radius r, half-height h. */
export function cap(c, frame, r, h, round = 0, o) {
    const q = prim(T.CAP, [c[0], c[1], c[2], ...frame[0], ...frame[1], ...frame[2], r, h, round], o);
    q.bs = [c[0], c[1], c[2], sqrt(r * r + h * h) + round];
    return q;
}
/** A cone along the frame's y: radius r1 at c, r2 at c + y·h (a hat's crown, a wizard's cone). */
export function hcone(c, frame, h, r1, r2 = 0, round = 0, o) {
    const q = prim(T.HCONE, [c[0], c[1], c[2], ...frame[0], ...frame[1], ...frame[2], h, r1, r2, round], o);
    q.bs = [c[0] + frame[1][0] * h / 2, c[1] + frame[1][1] * h / 2, c[2] + frame[1][2] * h / 2, sqrt(max(r1, r2) ** 2 + h * h / 4) + round];
    return q;
}

/** An elliptic ring in the frame's x–y plane (semi-axes ax, ay), its tube r thick: an ear's rim. */
export function etorus(c, ax, ay, r, frame, o) {
    const q = prim(T.ETORUS, [c[0], c[1], c[2], ...frame[0], ...frame[1], ...frame[2], ax, ay, r], o);
    q.bs = [c[0], c[1], c[2], max(ax, ay) + r];
    return q;
}
/**
 * A soft bump (amp > 0) or dent (< 0) of the surface: a gaussian of widths `sig` along the frame's axes — the way a
 * sculptor pushes clay: cheekbones, the brow's ridge, the eye's socket, a chin.
 */
export function bump(c, sig, amp, frame = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], o) {
    const q = prim(T.BUMP, [c[0], c[1], c[2], ...frame[0], ...frame[1], ...frame[2], sig[0], sig[1], sig[2], amp], o);
    q.bs = [c[0], c[1], c[2], 3 * max(sig[0], sig[1], sig[2])];
    return q;
}

/** The signed distance of one primitive at (x, y, z). */
export function primDist(q, x, y, z) {
    const p = q.p;
    switch (q.t) {
        case T.SPHERE: {
            const dx = x - p[0], dy = y - p[1], dz = z - p[2];
            return sqrt(dx * dx + dy * dy + dz * dz) - p[3];
        }
        case T.ELLIPSOID: {
            const dx = x - p[0], dy = y - p[1], dz = z - p[2];
            const lx = (dx * p[3] + dy * p[4] + dz * p[5]) / p[12], ly = (dx * p[6] + dy * p[7] + dz * p[8]) / p[13], lz = (dx * p[9] + dy * p[10] + dz * p[11]) / p[14];
            const k0 = sqrt(lx * lx + ly * ly + lz * lz);
            const mx = lx / p[12], my = ly / p[13], mz = lz / p[14];
            const k1 = sqrt(mx * mx + my * my + mz * mz);
            if (k1 < 1e-9) return -min(p[12], p[13], p[14]);
            return k0 * (k0 - 1) / k1;
        }
        case T.CONE: {
            // the round cone (IQ), in the plane of its axis; squeezed across flatAxis
            let dx = x - p[0], dy = y - p[1], dz = z - p[2];
            const L = p[6], ra = p[7], rb = p[8];
            if (p[12] !== 1) {
                const f = dx * p[9] + dy * p[10] + dz * p[11], s = 1 / p[12] - 1;
                dx += p[9] * f * s; dy += p[10] * f * s; dz += p[11] * f * s;
            }
            const t = dx * p[3] + dy * p[4] + dz * p[5];
            const ex = dx - p[3] * t, ey = dy - p[4] * t, ez = dz - p[5] * t;
            const r2 = sqrt(ex * ex + ey * ey + ez * ez);
            const b = (ra - rb) / L, a = sqrt(max(0, 1 - b * b));
            const k = -b * r2 + a * t; // (2D: q = (r2, t))
            let d;
            if (k < 0) d = sqrt(r2 * r2 + t * t) - ra;
            else if (k > a * L) d = sqrt(r2 * r2 + (t - L) * (t - L)) - rb;
            else d = r2 * a + t * b - ra;
            return p[12] !== 1 ? d * p[12] : d;
        }
        case T.BOX: {
            const dx = x - p[0], dy = y - p[1], dz = z - p[2];
            const qx = abs(dx * p[3] + dy * p[4] + dz * p[5]) - p[12], qy = abs(dx * p[6] + dy * p[7] + dz * p[8]) - p[13], qz = abs(dx * p[9] + dy * p[10] + dz * p[11]) - p[14];
            const ox = max(qx, 0), oy = max(qy, 0), oz = max(qz, 0);
            return sqrt(ox * ox + oy * oy + oz * oz) + min(max(qx, qy, qz), 0) - p[15];
        }
        case T.TORUS: {
            const dx = x - p[0], dy = y - p[1], dz = z - p[2];
            const lx = dx * p[3] + dy * p[4] + dz * p[5], ly = dx * p[6] + dy * p[7] + dz * p[8], lz = dx * p[9] + dy * p[10] + dz * p[11];
            const qx = sqrt(lx * lx + lz * lz) - p[12];
            return sqrt(qx * qx + ly * ly) - p[13];
        }
        case T.PLANE: return x * p[0] + y * p[1] + z * p[2] - p[3];
        case T.ETORUS: {
            const dx = x - p[0], dy = y - p[1], dz = z - p[2];
            const lx = dx * p[3] + dy * p[4] + dz * p[5], ly = dx * p[6] + dy * p[7] + dz * p[8], lz = dx * p[9] + dy * p[10] + dz * p[11];
            const ex = lx / p[12], ey = ly / p[13], re = sqrt(ex * ex + ey * ey);
            const d2 = (re - 1) * min(p[12], p[13]);
            return sqrt(d2 * d2 + lz * lz) - p[14];
        }
        case T.BUMP: {
            const dx = x - p[0], dy = y - p[1], dz = z - p[2];
            const lx = (dx * p[3] + dy * p[4] + dz * p[5]) / p[12], ly = (dx * p[6] + dy * p[7] + dz * p[8]) / p[13], lz = (dx * p[9] + dy * p[10] + dz * p[11]) / p[14];
            return -p[15] * Math.exp(-(lx * lx + ly * ly + lz * lz));
        }
        case T.CAP: {
            const dx = x - p[0], dy = y - p[1], dz = z - p[2];
            const lx = dx * p[3] + dy * p[4] + dz * p[5], ly = dx * p[6] + dy * p[7] + dz * p[8], lz = dx * p[9] + dy * p[10] + dz * p[11];
            const qx = sqrt(lx * lx + lz * lz) - p[12] + p[14], qy = abs(ly) - p[13] + p[14];
            const ox = max(qx, 0), oy = max(qy, 0);
            return min(max(qx, qy), 0) + sqrt(ox * ox + oy * oy) - p[14];
        }
        case T.HCONE: {
            // a capped cone (IQ) along the frame's y: radius r1 at c, r2 at c + y·H
            const dx = x - p[0], dy = y - p[1], dz = z - p[2];
            const lx = dx * p[3] + dy * p[4] + dz * p[5], lz = dx * p[9] + dy * p[10] + dz * p[11];
            const h = p[12] * 0.5, r1 = p[13], r2 = p[14];
            const qx = sqrt(lx * lx + lz * lz), qy = dx * p[6] + dy * p[7] + dz * p[8] - h;
            const k2x = r2 - r1, k2y = 2 * h;
            const cax = qx - min(qx, qy < 0 ? r1 : r2), cay = abs(qy) - h;
            const t = max(0, min(1, ((r2 - qx) * k2x + (h - qy) * k2y) / (k2x * k2x + k2y * k2y)));
            const cbx = qx - r2 + k2x * t, cby = qy - h + k2y * t;
            const s = cbx < 0 && cay < 0 ? -1 : 1;
            return s * sqrt(min(cax * cax + cay * cay, cbx * cbx + cby * cby)) - p[15];
        }
    }
    return 1e9;
}

// ------------------------------------------------------------------ a shape: groups of primitives
/**
 * new Shape() .union(prims, k, joinK) .cut(prims, k, joinK) .inter(prims, k)
 *   union — the group's primitives melt (k), the group melts into what is there (joinK);
 *   cut — the group is cut out of what is there (a cavity, a nostril);
 *   inter — what is there is kept only inside the group (a flat sole).
 */
export class Shape {
    constructor() { this.groups = []; this._near = null; }
    union(prims, k = 0, joinK = 0) { this.groups.push({ mode: 0, prims, k, joinK }); return this; }
    cut(prims, k = 0, joinK = 0) { this.groups.push({ mode: 1, prims, k, joinK }); return this; }
    inter(prims, k = 0, joinK = 0) { this.groups.push({ mode: 2, prims, k, joinK }); return this; }
    /** Bumps and dents added to what is there (sculpting: `bump`). */
    bumps(prims) { this.groups.push({ mode: 3, prims, k: 0, joinK: 0 }); return this; }

    /** Only the primitives near a box (centre c, radius R): the rest cannot change the distance there. */
    near(cx, cy, cz, R) {
        const out = [];
        for (const g of this.groups) {
            const margin = R + g.k + g.joinK + 1e-3;
            const list = [];
            for (const q of g.prims) {
                if (!q.bs) { list.push(q); continue; }
                const dx = cx - q.bs[0], dy = cy - q.bs[1], dz = cz - q.bs[2];
                if (sqrt(dx * dx + dy * dy + dz * dz) - q.bs[3] <= margin) list.push(q);
            }
            if (list.length || g.mode === 2) out.push({ mode: g.mode, prims: list, k: g.k, joinK: g.joinK });
        }
        return out;
    }

    /** The distance at (x, y, z) from groups `gs` (all of them, or `near`'s). Writes `out.part/zone` of what wins there. */
    dist(x, y, z, gs = this.groups, out = null) {
        let acc = 1e9, win = null;
        for (let i = 0; i < gs.length; i++) {
            const g = gs[i], P = g.prims;
            if (g.mode === 3) { for (let j = 0; j < P.length; j++) acc += primDist(P[j], x, y, z); continue; }
            let dg = 1e9, gw = null, best = 1e9;
            for (let j = 0; j < P.length; j++) {
                const d = primDist(P[j], x, y, z);
                if (d < best) { best = d; gw = P[j]; }
                dg = g.k > 0 ? smin(dg, d, g.k) : (d < dg ? d : dg);
            }
            if (g.mode === 0) {
                if (gw && dg < acc) win = gw;
                acc = g.joinK > 0 ? smin(acc, dg, g.joinK) : min(acc, dg);
            } else if (g.mode === 1) {
                if (gw && -dg > acc) win = gw;
                acc = g.joinK > 0 ? smax(acc, -dg, g.joinK) : max(acc, -dg);
            } else {
                if (!P.length) { acc = max(acc, 1e9); continue; }
                acc = g.joinK > 0 ? smax(acc, dg, g.joinK) : max(acc, dg);
            }
        }
        if (out) { out.part = win ? win.part : 0; out.zone = win ? win.zone : 0; out.prim = win; }
        return acc;
    }
}

// ------------------------------------------------------------------ the mesher
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/**
 * A surface-nets mesh of `shape` inside the box [lo, hi] with cells of `cell`.
 * Returns {pos, nor, idx, part, zone, ao, n} (plain typed arrays). `aoShape` — the shape the occlusion is measured
 * against (the whole body: a head's neck is shaded by the shoulders too).
 */
export function meshSdf(shape, lo, hi, cell, { aoShape = shape, ao = true, block = 8 } = {}) {
    const nx = Math.ceil((hi[0] - lo[0]) / cell) + 1, ny = Math.ceil((hi[1] - lo[1]) / cell) + 1, nz = Math.ceil((hi[2] - lo[2]) / cell) + 1;
    const N = nx * ny * nz;
    const val = new Float32Array(N).fill(NaN);
    const at = (i, j, k) => i + nx * (j + ny * k);
    const B = block;
    const bx = Math.ceil((nx - 1) / B), by = Math.ceil((ny - 1) / B), bz = Math.ceil((nz - 1) / B);
    const live = new Uint8Array(bx * by * bz);
    const nearOf = new Array(bx * by * bz);
    const half = B * cell * 0.5, hd = half * Math.sqrt(3);
    // 1. blocks: far from the surface — one sign for all; near — every sample
    for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
        const cx = lo[0] + (I * B) * cell + half, cy = lo[1] + (J * B) * cell + half, cz = lo[2] + (K * B) * cell + half;
        const gs = shape.near(cx, cy, cz, hd * 1.6 + 2 * cell);
        const d = shape.dist(cx, cy, cz, gs);
        const bi = I + bx * (J + by * K);
        if (Math.abs(d) > hd * 1.6 + 2 * cell) { live[bi] = d > 0 ? 1 : 2; continue; }
        live[bi] = 3;
        nearOf[bi] = gs;
        const i1 = Math.min(nx - 1, (I + 1) * B), j1 = Math.min(ny - 1, (J + 1) * B), k1 = Math.min(nz - 1, (K + 1) * B);
        for (let k = K * B; k <= k1; k++) for (let j = J * B; j <= j1; j++) for (let i = I * B; i <= i1; i++) {
            const a = at(i, j, k);
            if (val[a] === val[a]) continue; // (done by a neighbour)
            val[a] = shape.dist(lo[0] + i * cell, lo[1] + j * cell, lo[2] + k * cell, gs);
        }
    }
    // (far blocks: their sign where nothing was measured)
    for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
        const bi = I + bx * (J + by * K);
        if (live[bi] === 3) continue;
        const s = live[bi] === 1 ? 1e3 : -1e3;
        const i1 = Math.min(nx - 1, (I + 1) * B), j1 = Math.min(ny - 1, (J + 1) * B), k1 = Math.min(nz - 1, (K + 1) * B);
        for (let k = K * B; k <= k1; k++) for (let j = J * B; j <= j1; j++) for (let i = I * B; i <= i1; i++) {
            const a = at(i, j, k);
            if (val[a] !== val[a]) val[a] = s;
        }
    }
    // 2. a vertex in every cell the surface crosses
    const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
    const cAt = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
    let vp = [];
    const corner = new Float64Array(8);
    for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
        if (live[I + bx * (J + by * K)] !== 3) continue;
        const i1 = Math.min(nx - 1, (I + 1) * B), j1 = Math.min(ny - 1, (J + 1) * B), k1 = Math.min(nz - 1, (K + 1) * B);
        for (let k = K * B; k < k1; k++) for (let j = J * B; j < j1; j++) for (let i = I * B; i < i1; i++) {
            let mask = 0;
            for (let c = 0; c < 8; c++) {
                const v = val[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
                corner[c] = v;
                if (v < 0) mask |= 1 << c;
            }
            if (mask === 0 || mask === 255) continue;
            let sx = 0, sy = 0, sz = 0, n = 0;
            for (const [a, b] of EDGES) {
                const va = corner[a], vb = corner[b];
                if ((va < 0) === (vb < 0)) continue;
                const t = va / (va - vb);
                sx += (a & 1) + (((b & 1) - (a & 1)) * t);
                sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t);
                sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
                n++;
            }
            cellV[cAt(i, j, k)] = vp.length / 3;
            vp.push(lo[0] + (i + sx / n) * cell, lo[1] + (j + sy / n) * cell, lo[2] + (k + sz / n) * cell);
        }
    }
    // 3. quads round every crossed edge (the 4 cells sharing it)
    const quads = [];
    const tryQuad = (c0, c1, c2, c3, flip) => {
        if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) return;
        if (flip) quads.push(c0, c3, c2, c1); else quads.push(c0, c1, c2, c3);
    };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const v0 = val[at(i, j, k)];
        const in0 = v0 < 0;
        // edge along x (i → i+1)
        if (i < nx - 1) {
            const v1 = val[at(i + 1, j, k)];
            if ((v1 < 0) !== in0) tryQuad(cellV[cAt(i, j - 1, k - 1)], cellV[cAt(i, j, k - 1)], cellV[cAt(i, j, k)], cellV[cAt(i, j - 1, k)], !in0);
        }
        if (j < ny - 1) {
            const v1 = val[at(i, j + 1, k)];
            if ((v1 < 0) !== in0) tryQuad(cellV[cAt(i - 1, j, k - 1)], cellV[cAt(i - 1, j, k)], cellV[cAt(i, j, k)], cellV[cAt(i, j, k - 1)], !in0);
        }
        if (k < nz - 1) {
            const v1 = val[at(i, j, k + 1)];
            if ((v1 < 0) !== in0) tryQuad(cellV[cAt(i - 1, j - 1, k)], cellV[cAt(i, j - 1, k)], cellV[cAt(i, j, k)], cellV[cAt(i - 1, j, k)], !in0);
        }
    }
    const nv = vp.length / 3;
    const pos = new Float32Array(vp); vp = null;
    const nor = new Float32Array(nv * 3), part = new Uint8Array(nv), zone = new Uint8Array(nv), occ = new Float32Array(nv);
    const info = { part: 0, zone: 0, prim: null };
    const e = cell * 0.25;
    // 4. every vertex onto the surface, its normal, what it is, how hidden it is
    for (let v = 0; v < nv; v++) {
        let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        const ci = Math.max(0, Math.min(bx - 1, Math.floor((x - lo[0]) / (B * cell)))), cj = Math.max(0, Math.min(by - 1, Math.floor((y - lo[1]) / (B * cell)))), ck = Math.max(0, Math.min(bz - 1, Math.floor((z - lo[2]) / (B * cell))));
        const gs = nearOf[ci + bx * (cj + by * ck)] || shape.groups;
        const x0 = x, y0 = y, z0 = z;
        let gx = 0, gy = 0, gz = 0;
        for (let it = 0; it < 3; it++) {
            // the gradient from a tetrahedron of 4 samples (IQ)
            const a = shape.dist(x + e, y - e, z - e, gs), b = shape.dist(x - e, y - e, z + e, gs), c = shape.dist(x - e, y + e, z - e, gs), dd = shape.dist(x + e, y + e, z + e, gs);
            gx = a - b - c + dd; gy = -a - b + c + dd; gz = -a + b - c + dd;
            const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
            gx /= gl; gy /= gl; gz /= gl;
            if (it === 2) break;
            const d = (a + b + c + dd) * 0.25;
            x -= gx * d; y -= gy * d; z -= gz * d;
            // (never further than a cell from where the net put it: a thin place must not jump across)
            const mx = x - x0, my = y - y0, mz = z - z0, m = Math.sqrt(mx * mx + my * my + mz * mz);
            if (m > cell * 0.9) { const s = cell * 0.9 / m; x = x0 + mx * s; y = y0 + my * s; z = z0 + mz * s; }
        }
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        nor[v * 3] = gx; nor[v * 3 + 1] = gy; nor[v * 3 + 2] = gz;
        shape.dist(x, y, z, gs, info);
        part[v] = info.part; zone[v] = info.zone;
        if (ao) {
            // the classic distance-field occlusion: how much nearer than the step the shapes around are
            let o = 0, w = 1;
            for (const h of [0.025, 0.06, 0.12, 0.22]) {
                const d = aoShape.dist(x + gx * h, y + gy * h, z + gz * h);
                o += w * Math.max(0, h - d) / h;
                w *= 0.55;
            }
            occ[v] = Math.max(0, Math.min(1, 1 - 0.62 * o));
        } else occ[v] = 1;
    }
    // 5. two triangles per quad, along the shorter diagonal
    const idx = new Uint32Array(quads.length / 4 * 6);
    let o = 0;
    for (let q = 0; q < quads.length; q += 4) {
        const a = quads[q], b = quads[q + 1], c = quads[q + 2], d = quads[q + 3];
        const ac = d2(pos, a, c), bd = d2(pos, b, d);
        if (ac <= bd) { idx[o++] = a; idx[o++] = b; idx[o++] = c; idx[o++] = a; idx[o++] = c; idx[o++] = d; }
        else { idx[o++] = a; idx[o++] = b; idx[o++] = d; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
    }
    return { pos, nor, idx, part, zone, ao: occ, n: nv };
}

function d2(P, a, b) {
    const dx = P[a * 3] - P[b * 3], dy = P[a * 3 + 1] - P[b * 3 + 1], dz = P[a * 3 + 2] - P[b * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
}
