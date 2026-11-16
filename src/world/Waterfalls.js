/**
 * Waterfalls.js — the waterfalls of the rivers (world generation WATERFALLS_FROM_GEN = 32; the author 16.11: «маленькие и большие водопады,
 * как реки… обязательно красивые»).
 *
 * A fall is a rocky bluff on a river's bank, built into the chunks like a castle (Terrain._buildCastles, `partsForChunk`): rock in strata
 * (grey stone, dark seams, moss and wet gravel low down), a plateau of grass on top, a brook running over it from a little pool, and the
 * water falling in a sheet over the face of the bluff into the river. The sheet is real water blocks (a column against the rock): what
 * makes it fall is how it is drawn (Terrain.buildChunkArrays marks the vertical faces of raised water, UltraWater draws the streaks).
 * A tall bank gets a tall fall (the bluff rises to the hill behind it), a flat one a low cascade; the big ones fall in two tiers.
 *
 * Pure (no three.js): the terrain workers make it too. Deterministic from the seed and the rivers (`raw`): the same falls on every
 * computer; a chunk asks only for its own parts. Nothing here touches the land outside the bluff's footprint.
 */
import { BLOCK } from './Terrain.js';

export const FALLS = {
    CELL: 176, // m: one cell of the search, at most one fall in it
    CHANCE: 0.85, // a cell with a river in it has a fall by this chance
    STRIDE: 6, // m: the step of the search for a river in a cell
    MARGIN: 34, // m: how far a fall's blocks reach from its anchor
    MIN_P: 4, // the lowest plateau (a low cascade) over the river's level
    MAX_P: 30, // the highest: a taller bluff is not built
    EDGE: 24, // m: how far from the river's middle to look for its bank
};

/** The three sizes (by the height of the bluff over the river's bank). */
export const FALL_KINDS = [
    { id: 'cascade', minH: 0, W: [9, 12], D: [6, 8], sw: [2, 3], tiers: 1 },
    { id: 'fall', minH: 7, W: [12, 16], D: [9, 12], sw: [3, 4], tiers: 2 },
    { id: 'great', minH: 14, W: [16, 22], D: [12, 16], sw: [5, 7], tiers: 2 },
];
export const fallKindOf = (H) => (H >= 14 ? FALL_KINDS[2] : H >= 7 ? FALL_KINDS[1] : FALL_KINDS[0]);

/** Cheap deterministic hash → [0, 1). */
function h01(a, b, s) {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The rock of one block of the bluff (strata, moss and gravel low, dark seams). `rel` the height over the river's bank. */
export function bluffBlock(x, L, z, rel, seed) {
    const r = h01(x * 3 + L, z * 5 - L, seed + 71);
    if (rel <= 3 && r < 0.4) return BLOCK.CS_MOSSY; // (the damp foot: mossy stone)
    if (rel <= 2 && r > 0.9) return BLOCK.GRAVEL; // (wet gravel)
    const seam = Math.floor((L + 4 * h01(x >> 4, z >> 4, seed + 73)) / 7); // (a dark seam now and then: the rock's strata — in patches, never a stripe the whole way round)
    if ((L + Math.floor(4 * h01(x >> 4, z >> 4, seed + 73))) % 7 === 0 && h01(x >> 2, z >> 2, seed + seam) < 0.5) return BLOCK.DEEPSTONE;
    if (r > 0.94) return BLOCK.GRAVEL;
    if (r < 0.07 && rel < 12) return BLOCK.CS_MOSSY; // (a patch of moss higher up)
    return BLOCK.STONE;
}

/** Make the fall of one cell, or null. `raw`: the height function with its flags (raw.water, raw.river, raw.flowX/Z, raw.sea). */
export function fallPlan(seed, raw, busy, gx, gz) {
    const S = seed | 0;
    if (h01(gx, gz, S + 9001) > FALLS.CHANCE) return null;
    const x0 = gx * FALLS.CELL, z0 = gz * FALLS.CELL;
    // the rivers in this cell: the first ones a deterministic walk finds
    const cands = [];
    const ox = Math.floor(h01(gx, gz, S + 9002) * FALLS.STRIDE), oz = Math.floor(h01(gz, gx, S + 9003) * FALLS.STRIDE);
    for (let z = z0 + oz + 12; z < z0 + FALLS.CELL - 12; z += FALLS.STRIDE) {
        for (let x = x0 + ox + 12; x < x0 + FALLS.CELL - 12; x += FALLS.STRIDE) {
            raw(x, z);
            if (raw.river && raw.water > 0 && !raw.sea) cands.push([x, z, raw.flowX, raw.flowZ]);
        }
    }
    if (!cands.length) return null;
    const start = Math.floor(h01(gx, gz, S + 9004) * cands.length);
    for (let t = 0; t < Math.min(cands.length, 8); t++) {
        const c = cands[(start + t * 7) % cands.length];
        const plan = tryAt(S, raw, busy, c[0], c[1], c[2], c[3], gx, gz, t);
        if (plan) return plan;
    }
    return null;
}

function tryAt(S, raw, busy, px, pz, fx, fz, gx, gz, tryNo) {
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const rnd = (k) => h01(gx * 31 + tryNo, gz * 17 + k, S + 9100 + k);
    // the bank: along the river's normal, on the side where the land is higher
    let best = null;
    for (const s of [1, -1]) {
        const nx = -fz * s, nz = fx * s;
        let ex = null;
        for (let d = 0.5; d <= FALLS.EDGE; d += 0.5) {
            const x = Math.round(px + nx * d), z = Math.round(pz + nz * d);
            raw(x, z);
            if (!raw.water) { ex = [x, z, d]; break; }
        }
        if (!ex) continue;
        const g1 = raw(Math.round(ex[0] + nx * 12), Math.round(ex[1] + nz * 12));
        const w1 = raw.water || raw.sea;
        if (w1) continue;
        if (!best || g1 > best.g) best = { s, nx, nz, ex, g: g1 };
    }
    if (!best) return null;
    const { nx, nz } = best, E = best.ex;
    const tx = -nz, tz = nx; // along the river
    const gE = raw(E[0], E[1]);
    if (raw.sea || raw.water || raw.beach) return null;
    // the size: by the land behind the bank (the bluff rises to the hill) — measured over the deepest the bluff can be
    const Dmax = FALL_KINDS[2].D[1], Wmax = FALL_KINDS[2].W[1];
    let back = -99;
    for (let u = 6; u <= Dmax + 3; u += 3) for (let v = -Wmax / 2; v <= Wmax / 2; v += 4) {
        const g = raw(Math.round(E[0] + nx * u + tx * v), Math.round(E[1] + nz * u + tz * v));
        if (raw.water || raw.sea) return null;
        if (g > back) back = g;
    }
    let P = Math.max(back + 1, gE + FALLS.MIN_P + Math.floor(rnd(1) * 3));
    if (P > FALLS.MAX_P) return null;
    const H = P - gE;
    const K = fallKindOf(H);
    const pick = (r2) => r2[0] + Math.floor(rnd(2 + r2[0]) * (r2[1] - r2[0] + 1));
    const W = pick(K.W), D = pick(K.D), sw = pick(K.sw);
    // keep away from every built place and from other falls' ground
    if (busy && busy(E[0] + nx * D * 0.5, E[1] + nz * D * 0.5, Math.max(W, D) + 10)) return null;
    // the footprint's columns: its land (raw heights), and no river bend or sea inside it
    const cols = [];
    const R = Math.ceil(Math.max(W, D) * 0.75) + 3;
    for (let dz = -R * 2; dz <= R * 2; dz++) for (let dx = -R * 2; dx <= R * 2; dx++) {
        const x = Math.round(E[0] + dx), z = Math.round(E[1] + dz);
        const u = (x - E[0]) * nx + (z - E[1]) * nz, v = (x - E[0]) * tx + (z - E[1]) * tz;
        if (u < 0 || u > D + 1 || Math.abs(v) > W / 2 + 1) continue;
        const e = 1 - (Math.pow(Math.abs(v) / (W / 2), 2) + Math.pow(u / D, 2)); // (an ellipse cut at the river: a dome, not a box)
        const g = raw(x, z);
        if (raw.water || raw.sea) { if (e > 0.2) return null; continue; }
        cols.push({ x, z, u, v, e, g });
    }
    if (cols.length < 20) return null;
    const parts = [];
    const put = (x0, x1, z0, z1, L0, L1, t) => { if (L1 >= L0) parts.push({ k: 0, x0, x1, z0, z1, L0, L1, t }); };
    const tiered = K.tiers === 2 && H >= 9;
    const Pm = tiered ? gE + Math.round(H * 0.55) : 0; // the landing of a two-tier fall
    const half = sw / 2;
    const SU = K.id === 'cascade' ? 1 : 2; // (the sheet is set back into the bluff: an alcove with rock walls on both sides — depth, shade)
    const pondR = K.id === 'cascade' ? 2 : K.id === 'fall' ? 3 : 4;
    const brookLen = Math.max(3, Math.min(7, D - SU - 2 * pondR - 1));
    const pondU = brookLen + pondR; // (the pool the brook comes from; counted from the sheet)
    // the lanes of the water: the main one, and on the big falls two thin ones beside it (trickles that run from the same pool)
    const lanes = K.id === 'great' ? [0, -(half + 3), half + 3] : K.id === 'fall' ? [0, (rnd(9) < 0.5 ? -1 : 1) * (half + 2.5)] : [0];
    const laneW = (i) => (i === 0 ? half : 0.5);
    const chan = (v) => lanes.some((l, i) => Math.abs(v - l) <= laneW(i));
    const pondV = Math.min(W / 2 - 1.5, lanes.length > 1 ? half + 4 : pondR * 1.1);
    const inPond = (uc, v) => ((uc - pondU) * (uc - pondU)) / (pondR * pondR + 1) + (v * v) / (pondV * pondV) <= 1;
    let fx0 = 1e9, fx1 = -1e9, fz0 = 1e9, fz1 = -1e9;
    for (const c of cols) {
        const { x, z, u, v, g } = c;
        const uc = u - SU; // (along the brook, from the sheet)
        const lane0 = Math.abs(v) <= half; // (the main sheet; the thin lanes just fall straight)
        const isChan = chan(v) && uc >= 0 && uc <= pondU;
        const isPond = inPond(uc, v);
        if (lane0 && u < SU) continue; // (the alcove: no rock in front of the sheet — the ground stays)
        const n = (h01(x, z, S + 9200) - 0.5) * 0.18 + (h01(x >> 2, z >> 2, S + 9201) - 0.5) * 0.3;
        let e = c.e + n;
        if (isChan || isPond) e = Math.max(e, 0.6); // (the water's own ground is always up to the plateau)
        if (e <= 0.02) continue;
        const f = Math.min(1, Math.max(0, e) * 1.7); // (a plateau in the middle only; the rest a hillside)
        let T = Math.round(g + (P - g) * Math.pow(f, 0.9) + (h01(x >> 1, z >> 1, S + 9202) - 0.5) * 4 * (1 - f)); // (crags: ragged, terraced slopes)
        if (T > P) T = P;
        // the face: benches and bays — a wall is never flat (the walls of the alcove stay whole and tall)
        if (u < 3 && !isChan && !isPond && Math.abs(v) > half + 1.5) {
            const r = h01(x, z, S + 9203);
            if (u < 1 && r < 0.22) continue; // (a bay)
            T -= Math.floor(r * 0.45 * (T - g)); // (a bench)
        }
        if (T <= g && !isChan && !isPond) continue;
        const plateau = T >= P;
        // the rock, layer by layer (runs of one block make one box)
        const topSolid = isPond ? P - 3 : isChan ? (tiered && lane0 && uc < 1.5 ? (uc < 0.5 ? Pm - 2 : Pm - 1) : P - 2) : T;
        let run = null;
        const flush = (L) => { if (run) { put(x, x, z, z, run.L0, L - 1, run.t); run = null; } };
        for (let L = g + 1; L <= topSolid; L++) {
            let t = bluffBlock(x, L, z, L - gE, S);
            if (L === T && plateau && u > 2.5 && !isChan && !isPond) t = BLOCK.GRASS;
            else if (L >= T - 2 && plateau && u > 2.5 && !isChan && !isPond) t = BLOCK.DIRT;
            if (run && run.t === t) continue;
            flush(L);
            run = { L0: L, t };
        }
        flush(topSolid + 1);
        // the water: the brook and the pool at P − 1, the sheet down the face
        if (isPond) put(x, x, z, z, P - 2, P - 1, BLOCK.WATER);
        else if (isChan) {
            if (!lane0 && uc < 0.5) put(x, x, z, z, 1, P - 1, BLOCK.WATER); // (a thin trickle: straight down from its brook)
            else if (tiered && lane0 && uc < 0.5) put(x, x, z, z, 1, Pm - 1, BLOCK.WATER); // (the lower sheet: from the landing to the river)
            else if (tiered && lane0 && uc < 1.5) put(x, x, z, z, Pm, P - 1, BLOCK.WATER); // (the upper sheet falls on the landing)
            else if (!tiered && lane0 && uc < 0.5) put(x, x, z, z, 1, P - 1, BLOCK.WATER); // (one sheet from the lip to the river)
            else put(x, x, z, z, P - 1, P - 1, BLOCK.WATER); // (the brook)
        }
        if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; if (z < fz0) fz0 = z; if (z > fz1) fz1 = z;
    }
    if (!parts.length) return null;
    // where the sheet lands (the mist, the sound): the middle of its foot, and the lip
    const foot = { x: E[0] + nx * SU, y: 1, z: E[1] + nz * SU };
    const nxn = nx, nzn = nz;
    return {
        id: 'wf' + gx + ',' + gz, kind: K.id, x: Math.round(E[0]), z: Math.round(E[1]), gE, P, H, W, D, sw, tiered, Pm, nx: nxn, nz: nzn,
        foot, SU, fxAt: { x: E[0] + nx * (SU - 1), z: E[1] + nz * (SU - 1) }, lip: { x: E[0] + nx * SU, y: P, z: E[1] + nz * SU },
        x0: fx0 - 1, x1: fx1 + 1, z0: fz0 - 1, z1: fz1 + 1, parts,
    };
}

/** The falls of a world: a plan a cell, made when asked (and kept). */
export class WaterfallSite {
    constructor(seed, raw, busy) {
        this.seed = seed | 0; this.raw = raw; this.busy = busy;
        this.cells = new Map(); this._byChunk = new Map();
    }

    cell(gx, gz) {
        const key = gx * 100003 + gz;
        let p = this.cells.get(key);
        if (p === undefined) {
            if (this.cells.size > 600) this.cells.clear();
            p = fallPlan(this.seed, this.raw, this.busy, gx, gz);
            this.cells.set(key, p);
        }
        return p;
    }

    /** The falls whose blocks may reach into the square [x0, x1] × [z0, z1]. */
    plansIn(x0, x1, z0, z1) {
        const out = [], C = FALLS.CELL, m = FALLS.MARGIN;
        for (let gz = Math.floor((z0 - m) / C); gz <= Math.floor((z1 + m) / C); gz++) {
            for (let gx = Math.floor((x0 - m) / C); gx <= Math.floor((x1 + m) / C); gx++) {
                const p = this.cell(gx, gz);
                if (p && p.x1 >= x0 && p.x0 <= x1 && p.z1 >= z0 && p.z0 <= z1) out.push(p);
            }
        }
        return out;
    }

    /** Near a fall (for the other things — trees, houses — to keep off its rock). */
    near(x, z, r = 0) { return this.plansIn(x - r, x + r, z - r, z + r).length > 0; }

    /** The falls within `r` of a point (the mist and the sound). */
    around(x, z, r) { return this.plansIn(x - r, x + r, z - r, z + r); }

    partsForChunk(cx, cz, C) {
        const x0 = cx * C, z0 = cz * C, x1 = x0 + C - 1, z1 = z0 + C - 1;
        const key = cx * 65536 + cz;
        let list = this._byChunk.get(key);
        if (!list) {
            list = [];
            for (const p of this.plansIn(x0, x1, z0, z1)) for (const q of p.parts) if (q.x1 >= x0 && q.x0 <= x1 && q.z1 >= z0 && q.z0 <= z1) list.push(q);
            if (this._byChunk.size > 400) this._byChunk.clear();
            this._byChunk.set(key, list);
        }
        return list.length ? [list] : [];
    }
}
