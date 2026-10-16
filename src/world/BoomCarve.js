/**
 * BoomCarve.js — the crater of «Бум» (src/game/Boom.js) dug out of the voxel world: pure data, no three.js.
 *
 * The spell tears a mountain (a castle, a tower…) apart from inside: everything within R of its middle,
 * above a bowl, goes — the mountain itself, what stood on it, the ground under it down to DEPTH below the land
 * round it. The bowl's floor at distance d (m, across) from the middle:
 *
 *     floor(d) = base − DEPTH + (DEPTH + RISE) · (d / R)²
 *
 * (base: the land round the target; past R the wall slopes up — boomFloor). So nothing is left hanging over the crater — every column is cleared
 * from its floor up to the sky. Past R the crater's wall slopes up (SLOPE m up per m out, out to R + SLOPE_W):
 * a great mountain is not cut like a cake, its torn side falls back steeply; beyond that its flanks stand.
 *
 * It is a lot of blocks (a whole mountain: hundreds of thousands), so it is done as a job, a piece at a time
 * within a time budget each frame (boomStep): the columns nearest the middle first (it bursts outwards), then
 * the sea comes into what was opened under its level (a flood from the water's edge, a cell at a time), then
 * what was left hanging at the crater's rim (a castle wall cut in two) is found and falls (Collapse.js).
 * The result does not depend on how the job was cut into frames: every computer gets the same crater, and a
 * save or a late joiner replays it whole (runBoom).
 *
 *   boomJob(data, {p: [x, y, z], b: base, r: R}) → job      boomStep(job, ms) → true when done
 *   runBoom(data, e) → job (done)                          boomFloor(d, base, R)
 */

import { BLOCK, MIN_LAYER } from './Terrain.js';
import { hangingSearch, dropPiece } from './Collapse.js';

export const BOOM_SHAPE = {
    R: 56, // m: the crater's radius (across) — a mountain this wide is gone
    DEPTH: 14, // m below the land round it, at the middle
    RISE: 16, // m above the land at the rim (the bowl's wall rises there)
    SLOPE: 1.6, // m up per m out: the crater's torn wall past R
    SLOPE_W: 26, // m past R the wall is cut back
    RIM: 3, // m beyond the wall: where hanging blocks are looked for
    SAMPLE: 40, // one block in this many is handed out as a flying boulder (Boom.js shows a few of them)
};

/** The bowl's floor (block-centre y: everything above it goes) at `d` m from the middle. */
export function boomFloor(d, base, R = BOOM_SHAPE.R) {
    const k = Math.min(1, d / R);
    return base - BOOM_SHAPE.DEPTH + (BOOM_SHAPE.DEPTH + BOOM_SHAPE.RISE) * k * k + Math.max(0, d - R) * BOOM_SHAPE.SLOPE;
}

/** How far out (m) the crater reaches: its bowl and its sloping wall. */
export const boomReach = (R = BOOM_SHAPE.R) => R + BOOM_SHAPE.SLOPE_W;

const COLS = new Map(); // R -> {dx, dz, d, n, rimFrom} (one or two radii ever: the spell's own)
/** The columns round the middle within R + RIM, nearest first (dx, dz; d — their distance). */
export function boomColumns(R = BOOM_SHAPE.R) {
    let c = COLS.get(R);
    if (c) return c;
    const W = R + BOOM_SHAPE.SLOPE_W, M = Math.ceil(W + BOOM_SHAPE.RIM), list = [];
    for (let dz = -M; dz <= M; dz++) for (let dx = -M; dx <= M; dx++) {
        const d = Math.hypot(dx, dz);
        if (d <= W + BOOM_SHAPE.RIM) list.push([d, dx, dz]);
    }
    list.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]); // (the same order everywhere)
    const n = list.length, out = { dx: new Int16Array(n), dz: new Int16Array(n), d: new Float32Array(n), n, inner: 0 };
    for (let i = 0; i < n; i++) { out.d[i] = list[i][0]; out.dx[i] = list[i][1]; out.dz[i] = list[i][2]; if (list[i][0] <= W) out.inner = i + 1; }
    COLS.set(R, out);
    return out;
}

/**
 * A new crater job. `e`: {p: [x, y, z] (the blast's middle), b: base (the land round it), r: R}.
 * job.samples: [x, y, z, type, …] — blocks torn out, for the flying rocks (taken and cleared by Boom.js).
 */
export function boomJob(data, e) {
    const R = e.r || BOOM_SHAPE.R;
    return {
        data, R, base: e.b, cx: Math.round(e.p[0]), cz: Math.round(e.p[2]),
        cols: boomColumns(R), i: 0, phase: 'carve', removed: 0, castle: 0,
        wet: [], q: null, qi: 0, rimI: 0, search: null, falls: [], samples: [], done: false,
    };
}

const isBuilt = (t) => t >= BLOCK.CS_GREY && t <= BLOCK.RUNE; // (Terrain.isCastleBlock without the import cycle)

/**
 * Work on the job for up to `ms` milliseconds (Infinity: to the end). @returns true when it is done.
 */
export function boomStep(job, ms = 3) {
    if (job.done) return true;
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const over = () => ms !== Infinity && now() - t0 > ms;
    const data = job.data, C = job.cols;
    let k = 0;
    // 1) the columns, the middle first
    while (job.phase === 'carve') {
        if (job.i >= C.inner) { job.phase = 'flood'; break; }
        const i = job.i++;
        const ix = job.cx + C.dx[i], iz = job.cz + C.dz[i];
        const floorY = boomFloor(C.d[i], job.base, job.R);
        const top = data.topLayer(ix, iz);
        if (top - 1 > floorY) {
            // (a few of the blocks, for the rocks flying: picked by place — the same on every computer)
            if (job.samples.length < 4 * 600 && ((ix * 7 + iz * 13) & 3) === 0) {
                const y = Math.max(floorY + 1, top - 1 - ((ix * 31 + iz * 17) & 7));
                const t = data.get(ix, Math.round(y + 1), iz);
                if (t !== BLOCK.AIR && t !== BLOCK.WATER) job.samples.push(ix, y, iz, t);
            }
            for (let L = top; L > floorY + 1 && L > top - 6; L--) if (isBuilt(data.get(ix, L, iz))) { job.castle++; break; }
            job.removed += data.carveColumn(ix, iz, floorY, job.wet);
        }
        if ((++k & 3) === 0 && over()) return false;
    }
    // 2) the sea comes into what was opened under its level (only from where water already is)
    if (job.phase === 'flood') {
        const R2 = (boomReach(job.R) + 1) ** 2;
        // (filled as it is reached: each cell once; first the cells opened beside the water — a piece at a time)
        if (!job.q) { job.q = []; job.wi = 0; }
        const q = job.q, w = job.wet;
        while (w && job.wi < w.length) {
            const x = w[job.wi++], L = w[job.wi++], z = w[job.wi++];
            if (data.get(x, L, z) === BLOCK.AIR && wetNear(data, x, L, z)) { data.fillWater(x, L, z); q.push(x, L, z); }
            if ((++k & 255) === 0 && over()) return false;
        }
        job.wet = null;
        while (job.qi < q.length) {
            const x = q[job.qi++], L = q[job.qi++], z = q[job.qi++];
            for (let n = 0; n < 5; n++) {
                const nx = x + (n === 0 ? 1 : n === 1 ? -1 : 0), nz = z + (n === 2 ? 1 : n === 3 ? -1 : 0), nL = n === 4 ? L - 1 : L;
                if (nL > 0 || nL <= MIN_LAYER) continue;
                if ((nx - job.cx) ** 2 + (nz - job.cz) ** 2 > R2) continue;
                if (data.get(nx, nL, nz) !== BLOCK.AIR) continue;
                data.fillWater(nx, nL, nz);
                q.push(nx, nL, nz);
            }
            if ((++k & 63) === 0 && over()) return false;
        }
        job.q = null;
        job.phase = 'rim';
    }
    // 3) the rim: what is left hanging (a castle wall cut through, a tree at the edge) falls
    if (job.phase === 'rim') {
        if (!job.search) { job.search = hangingSearch(data); job.rimI = Math.max(0, C.inner - 1); while (job.rimI > 0 && C.d[job.rimI] > boomReach(job.R) - 2) job.rimI--; }
        const lo = Math.max(MIN_LAYER + 1, Math.floor(job.base - BOOM_SHAPE.DEPTH));
        while (job.rimI < C.n) {
            const i = job.rimI++;
            const ix = job.cx + C.dx[i], iz = job.cz + C.dz[i], top = data.topLayer(ix, iz);
            for (let L = lo; L <= top; L++) job.search.visit(ix, L, iz);
            if ((++k & 7) === 0 && over()) return false;
        }
        job.phase = 'drop';
        job.pi = 0;
    }
    // 4) …and falls (a piece at a time)
    if (job.phase === 'drop') {
        const P = job.search.pieces;
        while (job.pi < P.length) {
            const piece = P[job.pi++];
            job.falls.push({ cells: piece.cells, ...dropPiece(data, piece) });
            if (over()) return false;
        }
        job.search = null;
        job.phase = 'done';
        job.done = true;
    }
    return job.done;
}

/** Is there water beside (or above) this cell? */
function wetNear(data, x, L, z) {
    const W = BLOCK.WATER;
    return data.get(x, L + 1, z) === W || data.get(x + 1, L, z) === W || data.get(x - 1, L, z) === W || data.get(x, L, z + 1) === W || data.get(x, L, z - 1) === W;
}

/** A saved «Бум» (a save, a late joiner): the whole crater at once. */
export function runBoom(data, e) {
    if (!data?.carveColumn) return null;
    const job = boomJob(data, e);
    boomStep(job, Infinity);
    job.samples.length = 0;
    return job;
}
