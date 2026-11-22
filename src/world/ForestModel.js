/**
 * ForestModel.js — the look of the forest's undergrowth (ForestRules.js where; ForestFloor.js draws).
 * The author 21.11: «лес — много мелких деталей». Every kind is a small, real shape with its own drawing, not a box:
 *   log     a trunk lying in the moss (bark furrows, moss on top, a broken end of splinters or a torn root plate, branch stubs, shelf fungus)
 *   stump   a felled stump (flat saw-cut with rings, root flare) or a broken one (jagged splinters), moss at the foot
 *   fern    a clump of arched pinnate fronds (three sorts: lady fern, a tall shield fern, low bracken)
 *   mush    four sorts in a cluster: fly agaric (red, white warts, a ring), porcini (a fat brown bun), chanterelles (funnels), parasols (white)
 *   bush    a hazel / a berry bush: thin stems, sprigs of leaves in crossed cards, red and dark berries
 *   litter  a drift of fallen leaves (ochre, rust, brown, olive) with a dark edge
 *   twig    fallen sticks and a heap of branches
 *   bell    bluebells (blue) and wood anemones (white): sprigs in a clump
 * ONE shared picture (a 256² atlas of 16 cells, drawn once on a canvas) for all of them + the colour in the vertices; one Lambert material
 * (alpha-tested: the leaves' edges are the picture's), one geometry per shape (17 in all), instanced by ForestFloor — no draw call per item.
 * The arrays come from `forestArrays(kind, v)` (no canvas, no three: a test can build them).
 */
import * as THREE from 'three';

export function rng(seed) { let s = (seed ^ 0x9e3779b9) >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------------------------------------------------------------- the picture: cells of the atlas
export const CELL = { BARK: 0, RINGS: 1, FERN: 2, LEAVES: 3, SPRIG: 4, RED: 5, BROWN: 6, STEM: 7, ORANGE: 8, MOSS: 9, BELL: 10, TWIG: 11, WHITE: 12, ANEMONE: 13 };
export const cellUV = (cell, u, v) => [((cell % 4) + 0.03 + 0.94 * u) / 4, 1 - (Math.floor(cell / 4) + 0.03 + 0.94 * (1 - v)) / 4];

// ---------------------------------------------------------------- a little mesh builder
export class Mesh {
    constructor() { this.p = []; this.n = []; this.c = []; this.u = []; }
    /** one triangle: three vertices [x,y,z, nx,ny,nz, u,v] and a colour [r,g,b] (or one colour per vertex) */
    tri(a, b, c, col) {
        for (const q of [a, b, c]) {
            this.p.push(q[0], q[1], q[2]); this.n.push(q[3], q[4], q[5]); this.u.push(q[6], q[7]);
            const k = q.col || col; this.c.push(k[0], k[1], k[2]);
        }
    }
    quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
    get count() { return this.p.length / 3; }
    arrays() { return { pos: new Float32Array(this.p), nor: new Float32Array(this.n), col: new Float32Array(this.c), uv: new Float32Array(this.u), count: this.count }; }
}
export const norm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/**
 * A tube along `path` ([[x,y,z]…]) with the radii `rad`, `seg` sides (even). `colorAt(point, normal, t)` → [r,g,b]. The picture of `cell` is laid
 * round the tube `uRep` times and runs once along every ring-to-ring step (the cell is a tile: no seams to see in bark).
 * `capStart` / `capEnd`: { cell, col } for a flat end (null: open).
 */
export function tube(M, path, rad, seg, cell, colorAt, uRep = 2, vRep = 1, capStart = null, capEnd = null) {
    void vRep;
    const rings = [];
    let prevA = null;
    for (let i = 0; i < path.length; i++) {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
        const t = norm(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        let A = null;
        if (prevA) { const d = prevA[0] * t[0] + prevA[1] * t[1] + prevA[2] * t[2]; A = norm(prevA[0] - t[0] * d, prevA[1] - t[1] * d, prevA[2] - t[2] * d); }
        if (!A || !isFinite(A[0])) { const ref = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; A = norm(...cross(ref, t)); }
        const B = cross(t, A);
        prevA = A;
        const ring = [];
        for (let s = 0; s <= seg; s++) {
            const th = (s / seg) * Math.PI * 2, ca = Math.cos(th), sa = Math.sin(th);
            const nx = A[0] * ca + B[0] * sa, ny = A[1] * ca + B[1] * sa, nz = A[2] * ca + B[2] * sa;
            ring.push({ p: [path[i][0] + nx * rad[i], path[i][1] + ny * rad[i], path[i][2] + nz * rad[i]], n: [nx, ny, nz] });
        }
        rings.push({ ring, t, ctr: path[i] });
    }
    const per = Math.max(1, Math.round(seg / uRep));
    for (let i = 0; i < rings.length - 1; i++) {
        const t0 = i / (rings.length - 1), t1 = (i + 1) / (rings.length - 1);
        for (let s = 0; s < seg; s++) {
            const u0 = (s % per) / per, u1 = ((s % per) + 1) / per;
            const mk = (q, t, u, v) => { const uv = cellUV(cell, u, v); const o = [q.p[0], q.p[1], q.p[2], q.n[0], q.n[1], q.n[2], uv[0], uv[1]]; o.col = colorAt(q.p, q.n, t); return o; };
            M.quad(mk(rings[i].ring[s], t0, u0, 0), mk(rings[i].ring[s + 1], t0, u1, 0), mk(rings[i + 1].ring[s + 1], t1, u1, 1), mk(rings[i + 1].ring[s], t1, u0, 1));
        }
    }
    const cap = (rg, cellId, col, flip) => {
        const c0 = rg.ctr, n = flip ? mul(rg.t, -1) : rg.t;
        for (let s = 0; s < seg; s++) {
            const a = rg.ring[s].p, b = rg.ring[s + 1].p, th0 = (s / seg) * 6.2832, th1 = ((s + 1) / seg) * 6.2832;
            const uvc = cellUV(cellId, 0.5, 0.5), ua = cellUV(cellId, 0.5 + 0.5 * Math.cos(th0), 0.5 + 0.5 * Math.sin(th0)), ub = cellUV(cellId, 0.5 + 0.5 * Math.cos(th1), 0.5 + 0.5 * Math.sin(th1));
            const C = [c0[0], c0[1], c0[2], n[0], n[1], n[2], uvc[0], uvc[1]], A = [a[0], a[1], a[2], n[0], n[1], n[2], ua[0], ua[1]], B = [b[0], b[1], b[2], n[0], n[1], n[2], ub[0], ub[1]];
            if (flip) M.tri(C, B, A, col); else M.tri(C, A, B, col);
        }
    };
    if (capStart) cap(rings[0], capStart.cell, capStart.col, true);
    if (capEnd) cap(rings[rings.length - 1], capEnd.cell, capEnd.col, false);
}

export const hash3 = (x, y, z) => { let h = (Math.imul(Math.floor(x * 9.1), 374761393) + Math.imul(Math.floor(y * 9.1), 668265263) + Math.imul(Math.floor(z * 9.1), 2246822519)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BARK = [0.62, 0.55, 0.5], MOSSC = [0.3, 0.46, 0.2], WOOD = [0.86, 0.74, 0.55], CREAM = [0.93, 0.9, 0.8];
/** bark colour with moss on the upper faces and a dark damp underside */
const barkColor = (mossAmt, tone = BARK) => (p, n) => {
    const k = 0.82 + 0.3 * hash3(p[0] * 2, p[1] * 2, p[2] * 2);
    let c = mul(tone, k);
    const moss = Math.max(0, Math.min(1, (n[1] - 0.2) * 1.6 + (hash3(p[0] * 3, 0, p[2] * 3) - 0.5) * 1.1)) * mossAmt;
    c = mix(c, MOSSC, moss);
    if (n[1] < -0.3) c = mul(c, 0.7);
    return c;
};

// ---------------------------------------------------------------- mushrooms
const CAPS = {
    // [cell, skin colour, stem colour, cap radius, cap height, stem height, stem radius, profile]
    0: { cell: CELL.RED, tint: [1, 1, 1], stem: CREAM, R: 0.46, H: 0.3, sh: 0.62, sr: 0.07, shape: 'dome', ring: true },
    1: { cell: CELL.BROWN, tint: [1, 1, 1], stem: [0.9, 0.84, 0.7], R: 0.36, H: 0.26, sh: 0.4, sr: 0.14, shape: 'bun', ring: false },
    2: { cell: CELL.ORANGE, tint: [1, 1, 1], stem: [0.98, 0.78, 0.4], R: 0.27, H: 0.17, sh: 0.3, sr: 0.065, shape: 'funnel', ring: false },
    3: { cell: CELL.WHITE, tint: [1, 1, 1], stem: [0.96, 0.94, 0.88], R: 0.5, H: 0.17, sh: 0.78, sr: 0.05, shape: 'parasol', ring: true },
};
function mushroom(M, x, y, z, v, scale, lean, R) {
    const D = CAPS[v], s = scale;
    const sh = D.sh * s, sr = D.sr * s, cr = D.R * s, ch = D.H * s;
    const lx = Math.cos(lean[0]) * Math.sin(lean[1]) * sh * 0.25, lz = Math.sin(lean[0]) * Math.sin(lean[1]) * sh * 0.25;
    const stemCol = (p) => mul(D.stem, 0.9 + 0.2 * hash3(p[0], p[1], p[2]) - (p[1] - y) * 0.05);
    const flare = v === 1 ? 1.25 : v === 2 ? 0.7 : 1.35; // (a porcini's belly, a chanterelle's thin foot, an agaric's bulb)
    const path = [], rad = [];
    for (let i = 0; i <= 3; i++) { const f = i / 3; path.push([x + lx * f * f, y + sh * f, z + lz * f * f]); rad.push(sr * (i === 0 ? flare : i === 1 ? (v === 1 ? 1.1 : 1) : 0.85)); }
    tube(M, path, rad, 6, CELL.STEM, stemCol, 1, 1);
    const topP = path[3];
    // the cap: a lathe — rings of (radius fraction, height fraction)
    const prof = D.shape === 'dome' ? [[0, 1.02], [0.3, 0.97], [0.6, 0.8], [0.85, 0.5], [1, 0.14], [0.96, 0]]
        : D.shape === 'bun' ? [[0, 1], [0.35, 0.96], [0.7, 0.82], [0.92, 0.55], [1, 0.25], [0.9, 0.02]]
            : D.shape === 'funnel' ? [[0, 0.1], [0.25, 0.04], [0.55, 0.35], [0.85, 0.72], [1.05, 1], [0.98, 0.84]]
                : [[0, 1], [0.3, 0.9], [0.65, 0.5], [0.95, 0.12], [1, 0]];
    const SEG = 8, rings = [];
    for (const [rf, hf] of prof) {
        const ring = [];
        for (let k = 0; k <= SEG; k++) {
            const th = (k / SEG) * Math.PI * 2, wob = 1 + 0.07 * Math.sin(th * 3 + x * 3) * rf; // (the edge is a little wavy)
            ring.push([topP[0] + Math.cos(th) * cr * rf * wob, topP[1] + hf * ch - (v === 2 ? ch * 0.3 : 0), topP[2] + Math.sin(th) * cr * rf * wob, th, rf]);
        }
        rings.push(ring);
    }
    const capCol = (rf, th) => { const k = 0.9 + 0.2 * hash3(x + th, rf * 3, z); return [k, k, k]; };
    for (let i = 0; i < rings.length - 1; i++) {
        for (let k = 0; k < SEG; k++) {
            const mk = (q, nUp) => {
                const u = 0.5 + 0.5 * q[4] * Math.cos(q[3]), w = 0.5 + 0.5 * q[4] * Math.sin(q[3]);
                const uv = cellUV(D.cell, u, w), nn = norm(Math.cos(q[3]) * q[4] * 0.8, nUp, Math.sin(q[3]) * q[4] * 0.8);
                const o = [q[0], q[1], q[2], nn[0], nn[1], nn[2], uv[0], uv[1]]; o.col = capCol(q[4], q[3]); return o;
            };
            const nUp = D.shape === 'funnel' ? 0.9 : 0.8 + 0.2 * (1 - i / rings.length);
            M.quad(mk(rings[i][k], nUp), mk(rings[i][k + 1], nUp), mk(rings[i + 1][k + 1], nUp), mk(rings[i + 1][k], nUp));
        }
    }
    // the underside: the gills (cream, a little darker towards the stem) — a fan from the stem to the rim
    const rim = rings[rings.length - 1], hub = [topP[0], topP[1] - (v === 2 ? ch * 0.15 : 0), topP[2]];
    for (let k = 0; k < SEG; k++) {
        const uv = cellUV(CELL.STEM, 0.5, 0.5);
        const A = [hub[0], hub[1], hub[2], 0, -1, 0, uv[0], uv[1]], B = [rim[k][0], rim[k][1], rim[k][2], 0, -1, 0, uv[0], uv[1]], C = [rim[k + 1][0], rim[k + 1][1], rim[k + 1][2], 0, -1, 0, uv[0], uv[1]];
        M.tri(A, C, B, v === 1 ? [0.85, 0.78, 0.5] : [0.82, 0.76, 0.66]);
    }
    // a ring (a skirt) on the stem of the agaric and the parasol
    if (D.ring) {
        const ry = y + sh * 0.62, rr = sr * 3.2, n2 = 8;
        for (let k = 0; k < n2; k++) {
            const a0 = (k / n2) * 6.2832, a1 = ((k + 1) / n2) * 6.2832;
            const c0 = [x + lx * 0.4, ry, z + lz * 0.4];
            const uv = cellUV(CELL.STEM, 0.5, 0.5);
            const A = [c0[0] + Math.cos(a0) * sr, ry, c0[2] + Math.sin(a0) * sr, 0, 1, 0, uv[0], uv[1]], B = [c0[0] + Math.cos(a1) * sr, ry, c0[2] + Math.sin(a1) * sr, 0, 1, 0, uv[0], uv[1]];
            const C = [c0[0] + Math.cos(a1) * rr, ry - sr * 1.6, c0[2] + Math.sin(a1) * rr, 0, 0.7, 0.3, uv[0], uv[1]], Dd = [c0[0] + Math.cos(a0) * rr, ry - sr * 1.6, c0[2] + Math.sin(a0) * rr, 0, 0.7, 0.3, uv[0], uv[1]];
            M.quad(A, B, C, Dd, [0.95, 0.93, 0.85]);
        }
    }
    void R;
}

// ---------------------------------------------------------------- frond cards (ferns, sprigs, bluebells)
/** An arched strip: from `base` along `dir` (unit, horizontal part) with `elev0` rising and drooping by `droop`; `w` wide; `len` long; the cell's picture along it. */
export function frond(M, base, yaw, elev0, droop, len, w, cell, colA, colB, segs = 4, taper = 0.25) {
    const dx = Math.cos(yaw), dz = Math.sin(yaw), px = -dz, pz = dx;
    let x = base[0], y = base[1], z = base[2], el = elev0;
    const step = len / segs, rows = [];
    for (let i = 0; i <= segs; i++) {
        const f = i / segs, wi = w * (1 - (1 - taper) * f * f) * 0.5;
        rows.push({ x, y, z, wi, f, n: norm(-Math.sin(el) * dx * 0.5, Math.cos(el) * 0.6 + 0.5, -Math.sin(el) * dz * 0.5) });
        x += Math.cos(el) * dx * step; z += Math.cos(el) * dz * step; y += Math.sin(el) * step;
        el -= droop / segs;
    }
    for (let i = 0; i < segs; i++) {
        const a = rows[i], b = rows[i + 1];
        const mk = (r, side) => { const uv = cellUV(cell, side < 0 ? 0 : 1, r.f); const o = [r.x + px * r.wi * side, r.y, r.z + pz * r.wi * side, r.n[0], r.n[1], r.n[2], uv[0], uv[1]]; o.col = mix(colA, colB, r.f); return o; };
        M.quad(mk(a, -1), mk(a, 1), mk(b, 1), mk(b, -1));
    }
}

// ---------------------------------------------------------------- the kinds
const BUILD = {
    // ---- a fallen log lying along +x: 6 m long, 0.7 m radius, its axis at y = 0.55 (a little sunk)
    log(v) {
        const M = new Mesh(), R = rng(1100 + v * 37), L = 6, r0 = 0.72;
        const N = 9, path = [], rad = [];
        for (let i = 0; i <= N; i++) {
            const f = i / N;
            path.push([-L / 2 + f * L, 0.6 + 0.07 * Math.sin(f * 4 + v) + (f > 0.8 ? 0.05 * (f - 0.8) : 0), 0.1 * Math.sin(f * 3.1 + v * 2)]);
            let r = r0 * (1.08 - 0.28 * f) * (1 + 0.05 * Math.sin(f * 17 + v)); // (the butt is thicker)
            if (v === 0 && i === N) r *= 0.82; // (a broken, ragged end)
            rad.push(r);
        }
        tube(M, path, rad, 10, CELL.BARK, barkColor(0.7), 2, 4, { cell: CELL.RINGS, col: [1, 0.95, 0.9] }, v === 0 ? null : { cell: CELL.RINGS, col: [1, 0.95, 0.9] });
        const end = path[N];
        if (v === 0) { // the broken end: splinters (thin wedges of pale wood, taller than the break)
            const nS = 9;
            for (let k = 0; k < nS; k++) {
                const a0 = (k / nS) * 6.2832, a1 = ((k + 1) / nS) * 6.2832, am = (a0 + a1) / 2, h = 0.45 + 0.9 * R();
                const mk = (a, rr, dx) => { const o = [end[0] + dx, end[1] + Math.cos(a) * rr, end[2] + Math.sin(a) * rr, 1, 0, 0, 0.5, 0.5]; o.col = WOOD; return o; };
                const tip = mk(am, rad[N] * 0.45, h);
                M.tri(mk(a0, rad[N], 0), mk(a1, rad[N], 0), tip, mix(WOOD, [0.7, 0.55, 0.38], R() * 0.5));
            }
        } else { // a torn-up tree: the root plate stands at the butt end (roots like claws, earth clots, moss)
            const butt = path[0];
            for (let k = 0; k < 7; k++) {
                const a = (k / 7) * 6.2832 + R() * 0.4, len = 1.1 + R() * 0.9, up = 0.3 + R() * 0.5;
                const rp = [], rr = [];
                for (let i = 0; i <= 4; i++) { const f = i / 4; rp.push([butt[0] - 0.1 - f * len * 0.55 - f * f * 0.3, butt[1] + Math.cos(a) * (0.35 + f * len * up), butt[2] + Math.sin(a) * (0.35 + f * len * 0.9)]); rr.push(0.2 * (1 - f * 0.8)); }
                tube(M, rp, rr, 5, CELL.BARK, barkColor(0.2, [0.5, 0.4, 0.32]), 1, 2);
            }
            // the plate itself: a ragged disc of earth and rootlets standing on edge
            const SEG = 10, uv = cellUV(CELL.MOSS, 0.5, 0.5);
            for (let k = 0; k < SEG; k++) {
                const a0 = (k / SEG) * 6.2832, a1 = ((k + 1) / SEG) * 6.2832, r1 = 1.0 + 0.3 * Math.sin(k * 2.3), r2 = 1.0 + 0.3 * Math.sin((k + 1) * 2.3);
                const C = [butt[0] - 0.5, butt[1], butt[2], -1, 0, 0, uv[0], uv[1]], A = [butt[0] - 0.5 - 0.12 * Math.sin(k), butt[1] + Math.cos(a0) * r1, butt[2] + Math.sin(a0) * r1, -1, 0, 0, uv[0], uv[1]], B = [butt[0] - 0.5 - 0.12 * Math.sin(k + 1), butt[1] + Math.cos(a1) * r2, butt[2] + Math.sin(a1) * r2, -1, 0, 0, uv[0], uv[1]];
                M.tri(C, B, A, mix([0.34, 0.25, 0.17], [0.28, 0.4, 0.2], hash3(k, 1, v)));
            }
        }
        // branch stubs sticking out of the trunk
        for (let k = 0; k < 3 + v; k++) {
            const f = 0.15 + R() * 0.7, i = Math.min(N - 1, Math.floor(f * N)), P = path[i], a = (R() < 0.7 ? -1.2 : 1.3) + (R() - 0.5) * 1.2, len = 0.5 + R() * 0.9;
            const rp = [[P[0], P[1] + Math.cos(a) * rad[i] * 0.8, P[2] + Math.sin(a) * rad[i] * 0.8], [P[0] + 0.12, P[1] + Math.cos(a) * (rad[i] + len * 0.6), P[2] + Math.sin(a) * (rad[i] + len * 0.6)], [P[0] + 0.25, P[1] + Math.cos(a) * (rad[i] + len), P[2] + Math.sin(a) * (rad[i] + len)]];
            tube(M, rp, [0.13, 0.1, 0.07], 5, CELL.BARK, barkColor(0.3), 1, 1, null, { cell: CELL.RINGS, col: [1, 0.95, 0.9] });
        }
        if (v === 0) { // shelf fungus on the side and a few mushrooms on top
            for (let k = 0; k < 3; k++) {
                const f = 0.25 + R() * 0.5, P = path[Math.floor(f * N)], sr = 0.22 + R() * 0.16, ay = P[1] + 0.35 * (R() - 0.5), side = k === 1 ? 1 : -1;
                const SEG = 7;
                for (let q = 0; q < SEG; q++) {
                    const a0 = (q / SEG) * Math.PI, a1 = ((q + 1) / SEG) * Math.PI, zc = P[2] + side * (rad[Math.floor(f * N)] * 0.96);
                    const uvA = cellUV(CELL.BROWN, 0.5, 0.5);
                    const C = [P[0], ay, zc, 0, 0.8, side * 0.5, uvA[0], uvA[1]], A = [P[0] + Math.cos(a0) * sr * 1.5, ay - 0.03, zc + side * Math.sin(a0) * sr * 1.2, 0, 0.8, side * 0.5, uvA[0], uvA[1]], B = [P[0] + Math.cos(a1) * sr * 1.5, ay - 0.03, zc + side * Math.sin(a1) * sr * 1.2, 0, 0.8, side * 0.5, uvA[0], uvA[1]];
                    M.tri(C, side > 0 ? A : B, side > 0 ? B : A, mix([0.78, 0.62, 0.42], [0.55, 0.38, 0.24], q / SEG));
                }
            }
            for (let k = 0; k < 3; k++) mushroom(M, -1.2 + R() * 2.2, 1.28, (R() - 0.5) * 0.3, 1 + (k % 3 === 2 ? 1 : 0), 0.42 + R() * 0.25, [R() * 6, 0.3], R);
        }
        return M;
    },

    // ---- a stump: flat saw-cut (v 0) or broken and jagged (v 1); 1 m high, 1 m radius at the middle
    stump(v) {
        const M = new Mesh(), R = rng(2200 + v * 53), path = [], rad = [];
        const N = 6;
        for (let i = 0; i <= N; i++) { const f = i / N; path.push([0, f * 1.0 - 0.05, 0]); rad.push(1.0 * (1 + 0.55 * Math.pow(1 - f, 4) + 0.04 * Math.sin(f * 11)) * (v === 1 ? 0.9 - 0.12 * f : 0.96)); }
        tube(M, path, rad, 12, CELL.BARK, barkColor(0.85), 2, 3, null, v === 0 ? { cell: CELL.RINGS, col: [1, 0.96, 0.9] } : null);
        if (v === 1) { // a jagged, split top: long splinters of pale wood and a dark hollow
            const nS = 10, top = path[N][1];
            for (let k = 0; k < nS; k++) {
                const a0 = (k / nS) * 6.2832, a1 = ((k + 1) / nS) * 6.2832, am = (a0 + a1) / 2, h = 0.2 + 0.85 * Math.pow(R(), 1.4);
                const P0 = (a) => [Math.cos(a) * rad[N], top, Math.sin(a) * rad[N]];
                const t0 = P0(a0), t1 = P0(a1), tip = [Math.cos(am) * rad[N] * 0.7, top + h, Math.sin(am) * rad[N] * 0.7];
                const nn = norm(Math.cos(am), 0.4, Math.sin(am)), uv = cellUV(CELL.RINGS, 0.5, 0.9);
                const mk = (p) => [p[0], p[1], p[2], nn[0], nn[1], nn[2], uv[0], uv[1]];
                M.tri(mk(t0), mk(t1), mk(tip), mix(WOOD, [0.62, 0.48, 0.34], R() * 0.6));
            }
            const uv = cellUV(CELL.BARK, 0.5, 0.5);
            for (let k = 0; k < 8; k++) { const a0 = (k / 8) * 6.2832, a1 = ((k + 1) / 8) * 6.2832; const mk = (p, y) => [p[0], y, p[1], 0, 1, 0, uv[0], uv[1]]; M.tri(mk([0, 0], top - 0.3), mk([Math.cos(a1) * rad[N] * 0.7, Math.sin(a1) * rad[N] * 0.7], top - 0.15), mk([Math.cos(a0) * rad[N] * 0.7, Math.sin(a0) * rad[N] * 0.7], top - 0.15), [0.1, 0.07, 0.05]); }
        }
        // the roots: thick, running out into the ground
        for (let k = 0; k < 6; k++) {
            const a = (k / 6) * 6.2832 + R() * 0.5, len = 0.9 + R() * 0.9, rp = [], rr = [];
            for (let i = 0; i <= 4; i++) { const f = i / 4; rp.push([Math.cos(a) * (0.75 + f * len), 0.35 * (1 - f) * (1 - f) - 0.08 - f * 0.05, Math.sin(a) * (0.75 + f * len)]); rr.push(0.3 * (1 - f * 0.85)); }
            tube(M, rp, rr, 6, CELL.BARK, barkColor(0.55), 1, 2);
        }
        if (v === 1) { // a bracket fungus at the foot
            for (let k = 0; k < 2; k++) {
                const a = 1 + k * 2.6, y = 0.25 + k * 0.2, uvA = cellUV(CELL.BROWN, 0.5, 0.5), SEG = 7, cx = Math.cos(a) * 1.0, cz = Math.sin(a) * 1.0;
                for (let q = 0; q < SEG; q++) {
                    const a0 = (q / SEG) * Math.PI, a1 = ((q + 1) / SEG) * Math.PI, tx = -Math.sin(a), tz = Math.cos(a);
                    const mk = (aa, o) => [cx + Math.cos(a) * Math.sin(aa) * 0.42 * o + tx * Math.cos(aa) * 0.5 * o, y - 0.03 * (o > 0 ? 1 : 0), cz + Math.sin(a) * Math.sin(aa) * 0.42 * o + tz * Math.cos(aa) * 0.5 * o, 0, 1, 0, uvA[0], uvA[1]];
                    M.tri(mk(0, 0), mk(a0, 1), mk(a1, 1), mix([0.8, 0.66, 0.46], [0.5, 0.36, 0.22], q / SEG));
                }
            }
        }
        return M;
    },

    // ---- ferns: a clump of arched fronds from the middle
    fern(v) {
        const M = new Mesh(), R = rng(3300 + v * 41);
        const P = [{ n: 9, len: [1.5, 2.1], w: 0.95, droop: 1.1, el0: 1.0, a: [0.34, 0.56, 0.2], b: [0.58, 0.78, 0.3] }, { n: 7, len: [1.9, 2.6], w: 1.1, droop: 0.6, el0: 1.15, a: [0.28, 0.5, 0.18], b: [0.46, 0.7, 0.26] }, { n: 11, len: [0.9, 1.4], w: 0.75, droop: 0.9, el0: 0.7, a: [0.4, 0.55, 0.16], b: [0.62, 0.72, 0.22] }][v];
        for (let i = 0; i < P.n; i++) {
            const yaw = (i / P.n) * 6.2832 + R() * 0.45, len = P.len[0] + R() * (P.len[1] - P.len[0]);
            const k = 0.88 + R() * 0.24;
            frond(M, [Math.cos(yaw) * 0.04, 0.02, Math.sin(yaw) * 0.04], yaw, P.el0 - R() * 0.25, P.droop * (0.8 + R() * 0.5), len, P.w * (0.85 + R() * 0.3), CELL.FERN, mul(P.a, k), mul(P.b, k), 4, 0.15);
        }
        return M;
    },

    // ---- mushrooms: a cluster of one sort, large and small together (the cluster is ~1.4 m wide)
    mush(v) {
        const M = new Mesh(), R = rng(4400 + v * 47);
        const n = [3, 2, 4, 2][v];
        for (let i = 0; i < n; i++) {
            const a = i === 0 ? 0 : R() * 6.2832, d = i === 0 ? 0 : 0.25 + R() * 0.55, sc = i === 0 ? 1 : 0.45 + R() * 0.5;
            mushroom(M, Math.cos(a) * d, 0, Math.sin(a) * d, v, sc * (v === 2 ? 0.95 : 1), [R() * 6.28, (R() - 0.3) * 0.7], R);
        }
        // a few tiny ones at the edge
        for (let i = 0; i < 1; i++) mushroom(M, (R() - 0.5) * 1.3, 0, (R() - 0.5) * 1.3, v, 0.28 + R() * 0.12, [R() * 6.28, 0.2], R);
        return M;
    },

    // ---- a bush: thin stems up and out, sprigs of leaves in crossed cards, berries on v 1
    bush(v) {
        const M = new Mesh(), R = rng(5500 + v * 59), nS = 7;
        const leafA = v === 0 ? [0.36, 0.55, 0.2] : [0.3, 0.48, 0.2], leafB = v === 0 ? [0.62, 0.78, 0.28] : [0.5, 0.68, 0.26];
        for (let s = 0; s < nS; s++) {
            const a = (s / nS) * 6.2832 + R() * 0.5, lean = 0.3 + R() * 0.45, H = 1.7 + R() * 1.1, path = [], rad = [];
            for (let i = 0; i <= 3; i++) { const f = i / 3; path.push([Math.cos(a) * lean * f * H * 0.9, f * H, Math.sin(a) * lean * f * H * 0.9]); rad.push(0.09 * (1 - f * 0.65)); }
            tube(M, path, rad, 4, CELL.BARK, barkColor(0.05, [0.5, 0.42, 0.33]), 1, 2);
            // sprigs: cards at the stem, round it
            for (let q = 1; q <= 3; q++) {
                const P = path[q], n = q === 3 ? 3 : 1;
                for (let k = 0; k < n; k++) {
                    const ya = R() * 6.2832, size = 0.9 + R() * 0.55, tilt = 0.2 + R() * 0.8;
                    frond(M, [P[0], P[1], P[2]], ya, tilt, 0.5, size, 0.85, CELL.SPRIG, mul(leafA, 0.9 + R() * 0.2), mul(leafB, 0.9 + R() * 0.2), 2, 0.7);
                }
            }
            if (v === 1) { // berries: small dark/red beads on the stem
                const P = path[2], col = R() < 0.5 ? [0.78, 0.1, 0.12] : [0.2, 0.12, 0.3];
                for (let b = 0; b < 3; b++) {
                    const bx = P[0] + (R() - 0.5) * 0.5, by = P[1] - R() * 0.25, bz = P[2] + (R() - 0.5) * 0.5, br = 0.07 + R() * 0.03;
                    const uv = cellUV(CELL.MOSS, 0.5, 0.5);
                    for (let f = 0; f < 4; f++) { // a tiny pyramid pair (cheap bead)
                        const a0 = (f / 4) * 6.2832, a1 = ((f + 1) / 4) * 6.2832;
                        const T = [bx, by + br, bz, 0, 1, 0, uv[0], uv[1]], Bt = [bx, by - br, bz, 0, -1, 0, uv[0], uv[1]];
                        const A = [bx + Math.cos(a0) * br, by, bz + Math.sin(a0) * br, Math.cos(a0), 0, Math.sin(a0), uv[0], uv[1]], B = [bx + Math.cos(a1) * br, by, bz + Math.sin(a1) * br, Math.cos(a1), 0, Math.sin(a1), uv[0], uv[1]];
                        M.tri(T, A, B, col); M.tri(Bt, B, A, col);
                    }
                }
            }
        }
        return M;
    },

    // ---- a drift of fallen leaves: three crossing flat cards slightly above the ground, the picture is the leaves
    litter(v) {
        const M = new Mesh(), R = rng(6600 + v * 61);
        const tint = v === 0 ? [[1, 0.95, 0.85], [0.95, 0.86, 0.7], [1, 0.9, 0.78]] : [[0.9, 0.95, 0.8], [1, 0.88, 0.75], [0.85, 0.92, 0.75]];
        for (let i = 0; i < 3; i++) {
            const S = 1.7 - i * 0.3, yaw = R() * 6.2832, y = 0.05 + i * 0.015, c = Math.cos(yaw), s = Math.sin(yaw), ox = (R() - 0.5) * 0.6, oz = (R() - 0.5) * 0.6;
            const mk = (u, w) => { const uv = cellUV(CELL.LEAVES, u, w), px = (u - 0.5) * 2 * S, pz = (w - 0.5) * 2 * S; const o = [ox + px * c - pz * s, y, oz + px * s + pz * c, 0, 1, 0, uv[0], uv[1]]; o.col = tint[i]; return o; };
            M.quad(mk(0, 0), mk(1, 0), mk(1, 1), mk(0, 1));
        }
        return M;
    },

    // ---- twigs: lone sticks (v 0) or a heap of branches (v 1)
    twig(v) {
        const M = new Mesh(), R = rng(7700 + v * 67), n = v === 0 ? 5 : 9;
        for (let i = 0; i < n; i++) {
            const a = R() * 6.2832, len = v === 0 ? 0.9 + R() * 1.6 : 1.2 + R() * 1.9, x0 = (R() - 0.5) * (v === 0 ? 2.2 : 0.9), z0 = (R() - 0.5) * (v === 0 ? 2.2 : 0.9), y0 = v === 0 ? 0.07 : 0.1 + (i % 4) * 0.13;
            const path = [], rad = [];
            for (let k = 0; k <= 3; k++) { const f = k / 3; path.push([x0 + Math.cos(a) * (f - 0.5) * len, y0 + 0.05 * Math.sin(f * 3 + i) + (v === 1 ? (R() - 0.3) * 0.15 : 0), z0 + Math.sin(a) * (f - 0.5) * len]); rad.push(0.06 * (1 - f * 0.5) + 0.02); }
            tube(M, path, rad, 4, CELL.TWIG, (p) => mul([0.62, 0.5, 0.38], 0.85 + 0.3 * hash3(p[0], p[1], p[2])), 1, 1, null, { cell: CELL.RINGS, col: [1, 0.92, 0.8] });
            if (R() < 0.6) { // a side twig
                const P = path[1], b = a + (R() < 0.5 ? 0.7 : -0.7), l2 = len * 0.35;
                tube(M, [P, [P[0] + Math.cos(b) * l2, P[1] + 0.05, P[2] + Math.sin(b) * l2]], [0.035, 0.02], 4, CELL.TWIG, () => [0.55, 0.44, 0.33], 1, 1);
            }
        }
        return M;
    },

    // ---- bluebells (v 0) and wood anemones (v 1): crossed sprigs in a clump
    bell(v) {
        const M = new Mesh(), R = rng(8800 + v * 71), n = 7, cell = v === 0 ? CELL.BELL : CELL.ANEMONE;
        for (let i = 0; i < n; i++) {
            const yaw = (i / n) * 6.2832 + R() * 0.7, d = R() * 0.45, ox = Math.cos(yaw) * d, oz = Math.sin(yaw) * d, h = (v === 0 ? 1.0 : 0.7) + R() * 0.45;
            const k = 0.9 + R() * 0.2;
            frond(M, [ox, 0.02, oz], R() * 6.2832, 1.35, 0.25 + R() * 0.3, h, 0.7, cell, [k, k, k], [k, k, k], 3, 1);
        }
        return M;
    },
};

/** The arrays of kind `kind`, shape `v` (positions, normals, colours, uvs of non-indexed triangles). Pure. */
export function forestArrays(kind, v) {
    const f = BUILD[kind];
    if (!f) throw new Error('no such forest kind ' + kind);
    return f(v).arrays();
}

// ---------------------------------------------------------------- the geometries and the material (shared)
const _geos = new Map();
export function forestGeometry(kind, v) {
    const key = kind + v;
    if (_geos.has(key)) return _geos.get(key);
    const a = forestArrays(kind, v), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
    g.computeBoundingSphere();
    g.userData.shared = true; g.userData.keep = true;
    _geos.set(key, g);
    return g;
}

let _tex, _mat;
/** The atlas: 4 × 4 cells of 64², drawn once. null without a canvas (tests). */
export function forestAtlas() {
    if (_tex !== undefined) return _tex;
    if (typeof document === 'undefined') return (_tex = null);
    const S = 256, C = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d'), R = rng(2121);
    const cell = (id, draw) => { x.save(); x.beginPath(); x.rect((id % 4) * C, Math.floor(id / 4) * C, C, C); x.clip(); x.translate((id % 4) * C, Math.floor(id / 4) * C); draw(); x.restore(); };
    const ell = (px, py, rx, ry, rot, fill, stroke) => { x.save(); x.translate(px, py); x.rotate(rot); x.beginPath(); x.ellipse(0, 0, rx, ry, 0, 0, 7); x.fillStyle = fill; x.fill(); if (stroke) { x.strokeStyle = stroke; x.lineWidth = 0.7; x.beginPath(); x.moveTo(-rx, 0); x.lineTo(rx, 0); x.stroke(); } x.restore(); };
    const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
    x.clearRect(0, 0, S, S);
    // bark: vertical furrows (u runs round, v along): deep dark cracks, pale ridges, lichen flecks
    cell(CELL.BARK, () => {
        x.fillStyle = '#8a7a6a'; x.fillRect(0, 0, C, C);
        for (let i = 0; i < 22; i++) { const px = R() * C, w = 1 + R() * 2.5; x.fillStyle = rgb(40, 32, 26, 0.55); let y0 = -4; x.beginPath(); x.moveTo(px, y0); for (let y = 0; y <= C + 4; y += 6) x.lineTo(px + Math.sin(y * 0.3 + i) * 1.6, y); x.lineTo(px + w, C + 4); x.lineTo(px + w, -4); x.fill(); }
        for (let i = 0; i < 18; i++) { const px = R() * C; x.strokeStyle = rgb(200, 190, 170, 0.3); x.lineWidth = 1; x.beginPath(); x.moveTo(px, 0); for (let y = 0; y <= C; y += 5) x.lineTo(px + Math.sin(y * 0.4 + i * 2) * 1.5, y); x.stroke(); }
        for (let i = 0; i < 40; i++) { x.fillStyle = rgb(R() < 0.5 ? 30 : 190, R() < 0.5 ? 26 : 180, R() < 0.5 ? 22 : 150, 0.25); x.fillRect(R() * C, R() * C, 1 + R() * 2, 1 + R() * 3); }
        for (let i = 0; i < 5; i++) { x.fillStyle = rgb(170, 190, 150, 0.35); x.beginPath(); x.arc(R() * C, R() * C, 1.5 + R() * 3, 0, 7); x.fill(); } // lichen
    });
    // the cut end: growth rings, a darker heart, radial cracks, a bark rim
    cell(CELL.RINGS, () => {
        x.fillStyle = '#d7b98a'; x.fillRect(0, 0, C, C);
        const g = x.createRadialGradient(C / 2, C / 2, 2, C / 2, C / 2, C * 0.52); g.addColorStop(0, '#b98a58'); g.addColorStop(0.55, '#d9bd8e'); g.addColorStop(1, '#a88458'); x.fillStyle = g; x.fillRect(0, 0, C, C);
        for (let r = 3; r < C * 0.5; r += 1.8 + R() * 1.6) { x.strokeStyle = rgb(110, 80, 48, 0.25 + R() * 0.3); x.lineWidth = 0.6; x.beginPath(); x.ellipse(C / 2 + (R() - 0.5) * 0.8, C / 2 + (R() - 0.5) * 0.8, r, r * (0.94 + R() * 0.1), 0, 0, 7); x.stroke(); }
        for (let i = 0; i < 6; i++) { const a = R() * 6.28; x.strokeStyle = rgb(70, 48, 30, 0.6); x.lineWidth = 0.9; x.beginPath(); x.moveTo(C / 2, C / 2); x.lineTo(C / 2 + Math.cos(a) * C * 0.45, C / 2 + Math.sin(a) * C * 0.45); x.stroke(); }
        x.strokeStyle = '#4a3828'; x.lineWidth = 3; x.beginPath(); x.arc(C / 2, C / 2, C * 0.5, 0, 7); x.stroke();
    });
    // a fern frond (the rachis up the middle, pinnae in pairs shrinking to the tip, pinnules on each)
    cell(CELL.FERN, () => {
        x.strokeStyle = '#5f8a2e'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(C / 2, C); x.lineTo(C / 2, 1); x.stroke();
        for (let i = 0; i < 16; i++) {
            const y = C - 3 - i * 3.8, f = i / 16, L = (C * 0.46) * (1 - f * 0.92) * (f < 0.1 ? 0.5 + f * 5 : 1), tone = 85 + R() * 50;
            for (const sd of [-1, 1]) {
                const ax = C / 2, ay = y, bx = C / 2 + sd * L, by = y - L * 0.35;
                x.strokeStyle = rgb(60, tone, 40, 1); x.lineWidth = 0.8; x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
                for (let k = 1; k <= 6; k++) { const t = k / 6.5, px = ax + (bx - ax) * t, py = ay + (by - ay) * t, s = 2.6 * (1 - 0.3 * t); ell(px, py - s * 0.2, s * 0.55, s * 1.25, sd * 0.4, rgb(70 + R() * 30, tone + 35, 38, 1)); }
            }
        }
        ell(C / 2, 3, 1.5, 3.5, 0, rgb(100, 160, 60, 1));
    });
    // fallen leaves on the ground: a dark soft disc and scatter of autumn leaves with veins
    cell(CELL.LEAVES, () => {
        const g = x.createRadialGradient(C / 2, C / 2, 4, C / 2, C / 2, C / 2); g.addColorStop(0, 'rgba(78,56,34,0.7)'); g.addColorStop(0.6, 'rgba(78,56,34,0.4)'); g.addColorStop(1, 'rgba(78,56,34,0)'); x.fillStyle = g; x.beginPath(); x.arc(C / 2, C / 2, C / 2, 0, 7); x.fill();
        const cols = [[196, 140, 52], [168, 86, 40], [134, 96, 48], [118, 120, 50], [210, 168, 70], [150, 60, 34], [96, 74, 44]];
        for (let i = 0; i < 70; i++) {
            const a = R() * 6.28, d = Math.sqrt(R()) * C * 0.46, c = cols[Math.floor(R() * cols.length)], k = 0.82 + R() * 0.3;
            ell(C / 2 + Math.cos(a) * d, C / 2 + Math.sin(a) * d, 2.2 + R() * 2.4, 1.2 + R() * 1.1, R() * 6.28, rgb(c[0] * k, c[1] * k, c[2] * k, 1), rgb(60, 40, 20, 0.7));
        }
        for (let i = 0; i < 4; i++) { x.fillStyle = rgb(70, 110, 40, 0.8); x.beginPath(); x.arc(C / 2 + (R() - 0.5) * 36, C / 2 + (R() - 0.5) * 36, 1.6 + R() * 1.8, 0, 7); x.fill(); } // (a few green: this year's)
    });
    // a sprig of leaves (hazel, berry): oval, toothed, a midrib and side veins
    cell(CELL.SPRIG, () => {
        x.strokeStyle = '#5c4a30'; x.lineWidth = 1.3; x.beginPath(); x.moveTo(C / 2, C); x.lineTo(C / 2, 6); x.stroke();
        for (let i = 0; i < 7; i++) {
            const y = C - 6 - i * 8, sd = i % 2 ? 1 : -1, s = 1 - i * 0.07, tone = 105 + R() * 55;
            ell(C / 2 + sd * 10 * s, y - 3, 11 * s, 6 * s, sd * -0.55, rgb(45 + R() * 30, tone, 30), rgb(25, 70, 20, 0.8));
        }
        ell(C / 2, 7, 6, 10, 0, rgb(70, 140, 40), rgb(25, 70, 20, 0.8));
    });
    // mushroom caps seen from above (u,v round the middle): a red cap with white warts
    const capBase = (id, c0, c1, c2) => cell(id, () => { const g = x.createRadialGradient(C / 2, C / 2, 2, C / 2, C / 2, C / 2); g.addColorStop(0, c0); g.addColorStop(0.7, c1); g.addColorStop(1, c2); x.fillStyle = g; x.fillRect(0, 0, C, C); });
    capBase(CELL.RED, '#d33a2a', '#bd2a1f', '#8a1c14');
    cell(CELL.RED, () => { for (let i = 0; i < 24; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * C * 0.42; x.fillStyle = rgb(246, 240, 226, 0.95); x.beginPath(); x.ellipse(C / 2 + Math.cos(a) * d, C / 2 + Math.sin(a) * d, 1.5 + R() * 2.4, 1.2 + R() * 1.8, R() * 3, 0, 7); x.fill(); } });
    capBase(CELL.BROWN, '#a5723e', '#8a5a2c', '#5d3a1c');
    cell(CELL.BROWN, () => { for (let i = 0; i < 60; i++) { x.fillStyle = rgb(R() < 0.5 ? 60 : 200, R() < 0.5 ? 40 : 150, R() < 0.5 ? 20 : 100, 0.18); x.beginPath(); x.arc(R() * C, R() * C, 1 + R() * 3, 0, 7); x.fill(); } });
    cell(CELL.STEM, () => { x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, C, C); for (let i = 0; i < 26; i++) { x.strokeStyle = rgb(R() < 0.5 ? 150 : 255, R() < 0.5 ? 130 : 250, R() < 0.5 ? 100 : 235, 0.35); x.lineWidth = 1; const px = R() * C; x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (R() - 0.5) * 4, C); x.stroke(); } });
    capBase(CELL.ORANGE, '#f0a52a', '#e08a1c', '#b8641a');
    cell(CELL.ORANGE, () => { for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.28; x.strokeStyle = rgb(150, 80, 20, 0.28); x.lineWidth = 1.1; x.beginPath(); x.moveTo(C / 2, C / 2); x.lineTo(C / 2 + Math.cos(a) * C / 2, C / 2 + Math.sin(a) * C / 2); x.stroke(); } });
    cell(CELL.MOSS, () => { x.fillStyle = '#3d5a24'; x.fillRect(0, 0, C, C); for (let i = 0; i < 160; i++) { x.fillStyle = rgb(60 + R() * 50, 100 + R() * 60, 30 + R() * 30, 0.55); x.beginPath(); x.arc(R() * C, R() * C, 1 + R() * 2.5, 0, 7); x.fill(); } });
    // bluebells: two long leaves at the foot, an arching stem, drooping bells; and twigs
    cell(CELL.BELL, () => {
        for (const sd of [-1, 1]) { x.fillStyle = rgb(70, 130, 50); x.beginPath(); x.moveTo(C / 2, C); x.quadraticCurveTo(C / 2 + sd * 26, C - 18, C / 2 + sd * 12, C * 0.45); x.quadraticCurveTo(C / 2 + sd * 14, C - 22, C / 2, C); x.fill(); }
        x.strokeStyle = '#5a8f38'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(C / 2, C - 2); x.quadraticCurveTo(C / 2 + 2, C * 0.35, C / 2 + 14, 9); x.stroke();
        for (let i = 0; i < 6; i++) { const t = 0.35 + i * 0.11, px = C / 2 + 14 * t * t * 1.4 - (1 - t) * 0, py = 9 + (1 - t) * 0 + i * 5.5; ell(C / 2 + 4 + i * 1.7, 10 + i * 5.6, 3.1, 4.4, 0.35, rgb(86, 90, 205), rgb(40, 40, 120, 0.8)); void px; void py; }
    });
    cell(CELL.TWIG, () => { x.fillStyle = '#7a6248'; x.fillRect(0, 0, C, C); for (let i = 0; i < 30; i++) { x.fillStyle = rgb(R() < 0.5 ? 50 : 170, R() < 0.5 ? 40 : 140, R() < 0.5 ? 30 : 100, 0.3); x.fillRect(R() * C, R() * C, 5 + R() * 12, 1); } });
    capBase(CELL.WHITE, '#f1ece0', '#e0d8c4', '#b9ad92');
    cell(CELL.WHITE, () => { for (let i = 0; i < 30; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * C * 0.45; x.fillStyle = rgb(150, 110, 70, 0.4); x.beginPath(); x.ellipse(C / 2 + Math.cos(a) * d, C / 2 + Math.sin(a) * d, 2 + R() * 3, 1, a, 0, 7); x.fill(); } x.fillStyle = rgb(160, 120, 80, 0.85); x.beginPath(); x.arc(C / 2, C / 2, 5, 0, 7); x.fill(); });
    // wood anemone: a divided leaf and white star flowers with yellow hearts
    cell(CELL.ANEMONE, () => {
        x.strokeStyle = '#5f8c3a'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(C / 2, C); x.lineTo(C / 2 - 2, 14); x.stroke();
        for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) ell(C / 2 + sd * (8 + i * 2), C - 6 - i * 3, 9, 3.6, sd * (0.5 - i * 0.2), rgb(66 + R() * 20, 130 + R() * 20, 52), rgb(30, 80, 28, 0.7));
        const fx = C / 2 - 2, fy = 13;
        for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.28; ell(fx + Math.cos(a) * 6, fy + Math.sin(a) * 6, 6, 2.6, a, rgb(250, 248, 244)); }
        x.fillStyle = rgb(232, 196, 40); x.beginPath(); x.arc(fx, fy, 2.4, 0, 7); x.fill();
        ell(C / 2 + 14, 30, 4, 2.2, -0.6, rgb(244, 242, 238)); x.fillStyle = rgb(232, 196, 40); x.beginPath(); x.arc(C / 2 + 14, 30, 1.2, 0, 7); x.fill();
    });
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4; t.userData = { shared: true };
    return (_tex = t);
}

/** The one material of the whole undergrowth: Lambert, vertex colours × the atlas, the leaf edges cut by the picture's alpha. */
export function forestMaterial() {
    if (_mat) return _mat;
    const m = new THREE.MeshLambertMaterial({ map: forestAtlas() || null, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide });
    m.userData.shared = true; m.userData.keep = true;
    return (_mat = m);
}
