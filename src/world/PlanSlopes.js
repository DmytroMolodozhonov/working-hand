/**
 * PlanSlopes.js — the ramps of the buildings' roofs (generation 6, BlockShapes.js).
 *
 * The plans of the castles, villages, towers and houses (Castles.Plan) build their roofs as they always did — layer by
 * layer, a stair of whole blocks — and then mark which of those blocks are ramps (Plan.slopeTop): the roof's own top
 * cells, each rising towards the higher one beside it (a gable's slopes, a pyramid's four faces and its hip corners as
 * outer corners, a valley as an inner corner). The blocks stay exactly where they were (a world of an older generation
 * puts the same blocks and ignores the marks: Terrain._buildCastles), only their shape changes — so the roof is the
 * same height, the walking graph the same, a castle the same castle.
 *
 * The marks are one plan part ({k: 3, cells: [x, L, z, shape, …]}, world coordinates and world-turned shapes): plain data,
 * planned in a worker and sent over like the rest of the plan.
 */
import { SHAPE } from './BlockShapes.js';

/**
 * The roof's top cells as ramps: `parts` (Plan parts, in build order) are laid out in a small box; every column's
 * highest cell of a roof material (`mats`) with nothing over it becomes a ramp rising towards its one higher
 * neighbour (one block higher, the opposite side lower or none), a hip's corner (only a diagonal neighbour higher, the
 * two beside it level) an outer corner, a valley (two perpendicular higher) an inner corner; a ridge stays whole.
 * Returns the marks' part, or null.
 */
export function roofShapes(parts, mats) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, L0 = Infinity, L1 = -Infinity;
    for (const p of parts) {
        if (p.k > 2) continue;
        if (p.x0 < x0) x0 = p.x0; if (p.x1 > x1) x1 = p.x1; if (p.z0 < z0) z0 = p.z0; if (p.z1 > z1) z1 = p.z1;
        if (p.L0 < L0) L0 = p.L0; if (p.L1 > L1) L1 = p.L1;
    }
    if (!(x1 >= x0) || !(L1 >= L0)) return null;
    const W = x1 - x0 + 1, D = z1 - z0 + 1, H = L1 - L0 + 1;
    if (W * D * H > 4e6) return null; // (never: a roof is small)
    const g = new Uint8Array(W * D * H);
    const at = (x, L, z) => ((L - L0) * D + (z - z0)) * W + (x - x0);
    // the parts laid out as Terrain._buildCastles lays them (a box, a disc, a ring's sector)
    for (const p of parts) {
        if (p.k > 2) continue;
        const cyl = p.k === 1 || p.k === 2;
        const r2 = cyl ? p.r * p.r + p.r * 0.6 : 0, h2 = cyl && p.hr >= 0 ? p.hr * p.hr + p.hr * 0.6 : -1;
        for (let z = p.z0; z <= p.z1; z++) for (let x = p.x0; x <= p.x1; x++) {
            if (cyl) {
                const d2 = (x - p.cx) * (x - p.cx) + (z - p.cz) * (z - p.cz);
                if (d2 > r2 || d2 <= h2) continue;
                if (p.k === 2) {
                    let a = Math.atan2(z - p.cz, x - p.cx) - p.a0w;
                    a -= Math.floor(a / (Math.PI * 2)) * (Math.PI * 2);
                    if (a >= p.span) continue;
                }
            }
            for (let L = p.L0; L <= p.L1; L++) g[at(x, L, z)] = p.t;
        }
    }
    // each column's roof top (−1e9: no roof there)
    const top = new Int32Array(W * D).fill(-1e9);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        for (let L = L1; L >= L0; L--) {
            const t = g[at(x, L, z)];
            if (!t) continue;
            if (mats.includes(t)) top[(z - z0) * W + (x - x0)] = L;
            break; // (the column's highest block: the roof's, or something over it — then no ramp)
        }
    }
    const T = (x, z) => (x < x0 || x > x1 || z < z0 || z > z1 ? -1e9 : top[(z - z0) * W + (x - x0)]);
    const cells = [];
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const l = T(x, z);
        if (l < -1e8) continue;
        const shape = topShape(T, x, z, l);
        if (shape) cells.push(x, l, z, shape);
    }
    if (!cells.length) return null;
    return { k: 3, x0, x1, z0, z1, L0, L1, t: 0, cells };
}

/**
 * The shape of a roof's top cell at (x, z) on layer l, by its neighbours' tops (`T(x, z)`: a roof column's top layer,
 * −1e9 where there is no roof): a ramp rising towards its one higher neighbour (the opposite side lower or none), a
 * hip's corner (only a diagonal higher, the two beside it level, the other sides lower) an outer corner, a valley (two
 * perpendicular higher) an inner corner; else whole (0).
 */
export function topShape(T, x, z, l) {
    const e = T(x + 1, z), w = T(x - 1, z), s = T(x, z + 1), n = T(x, z - 1);
    const ue = e === l + 1, uw = w === l + 1, us = s === l + 1, un = n === l + 1;
    const lo = (v) => v < l;
    const ups = ue + uw + us + un;
    if (ups === 1) {
        if (ue && lo(w)) return SHAPE.RAMP_PX;
        if (uw && lo(e)) return SHAPE.RAMP_NX;
        if (us && lo(n)) return SHAPE.RAMP_PZ;
        if (un && lo(s)) return SHAPE.RAMP_NZ;
        return 0;
    }
    if (ups === 2 && (ue || uw) && (us || un)) {
        // a valley: the low corner away from both rises
        if ((ue ? lo(w) : lo(e)) && (us ? lo(n) : lo(s))) return ue ? (us ? SHAPE.IN_00 : SHAPE.IN_01) : (us ? SHAPE.IN_10 : SHAPE.IN_11);
        return 0;
    }
    if (ups === 0) {
        const pp = T(x + 1, z + 1) === l + 1, pn = T(x + 1, z - 1) === l + 1, np = T(x - 1, z + 1) === l + 1, nn = T(x - 1, z - 1) === l + 1;
        if (pp + pn + np + nn !== 1) return 0;
        const dx = pp || pn ? 1 : -1, dz = pp || np ? 1 : -1;
        const sx = dx > 0 ? e : w, sz = dz > 0 ? s : n, ox = dx > 0 ? w : e, oz = dz > 0 ? n : s;
        if (sx === l && sz === l && lo(ox) && lo(oz)) return pp ? SHAPE.OUT_11 : pn ? SHAPE.OUT_10 : np ? SHAPE.OUT_01 : SHAPE.OUT_00;
    }
    return 0;
}

/**
 * The same for a plan given as cells [x, L, z, block] (a house made by magic — MagicHouse.housePlan): every column's
 * highest block, if it is of a roof material (`mats`), gets its shape as a fifth number (only when it has one).
 */
export function cellShapes(cells, mats) {
    const top = new Map(); // column → index of its highest block
    const key = (x, z) => (x + 32768) * 65536 + (z + 32768);
    for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (!c[3]) continue;
        const k = key(c[0], c[2]), j = top.get(k);
        if (j === undefined || cells[j][1] < c[1]) top.set(k, i);
    }
    const T = (x, z) => { const j = top.get(key(x, z)); return j !== undefined && mats.includes(cells[j][3]) ? cells[j][1] : -1e9; };
    for (const j of top.values()) {
        const c = cells[j];
        if (!mats.includes(c[3])) continue;
        const s = topShape(T, c[0], c[2], c[1]);
        if (s) c[4] = s;
    }
    return cells;
}
