/**
 * RiverBridges.js — the bridges over the rivers (world generation BRIDGES_FROM_GEN = 36; the author 21.11: «через некоторые реки можно встретить самодельные
 * мосты; если большая река — большой каменный мост, если небольшая — деревянный; пусть будут большие и маленькие реки»).
 *
 * Rivers are of two sizes now (Terrain.createHeightField: `raw.big`): a small one (a brook, up to ~16 m across) and a big one (up to ~48 m, deeper).
 * A bridge is built into the chunks like a waterfall (Waterfalls.js, `partsForChunk`): pure, no three.js, deterministic from the seed and the rivers, made when a
 * chunk asks. One cell of the search (CELL m) has a bridge by a chance when a river crosses it in a straight reach (not at a bend or a meeting of rivers).
 *
 *   SMALL river → a WOODEN bridge: a deck of planks 3 wide with dark beams and fence rails (2 high) on both sides, posts of logs standing in the water, a lantern on a post
 *     at each corner; the approach is a mound of earth with the planks on it, a block lower every second column.
 *   BIG river → a STONE bridge: a deck 5 wide of grey and cobbled stone between parapets 3 high, on arches (a pier between every ~11 m, the abutments at the banks),
 *     the water passing under the arches (3 high — a boat goes through); a causeway of cobble at each end, lanterns on stone pillars at the four corners.
 *
 * The crossing is straight along x or z (whichever is nearer across the river), flush at the same height from bank to bank (the higher bank decides), the ramps one block a
 * step every second column. A bridge is made only where both banks are land (no lake, no sea, no bend), the banks differ by at most 3–4 blocks and no built place is near.
 * Nothing here touches the land outside the bridge's footprint; the river's water is never filled (the arches and the posts leave it).
 */
import { BLOCK } from './Terrain.js';

export const BRIDGES = {
    CELL: 208, // m: one cell of the search, at most one bridge in it
    CHANCE: 0.3, // a cell with a river in a straight reach has a bridge by this chance (about one bridge a kilometre of river)
    STRIDE: 5, // m: the step of the search for a river in a cell
    MARGIN: 70, // m: how far a bridge's blocks reach from its centre (a long stone one with its ramps)
    SMALL_W: [2, 16], BIG_W: [12, 48], // water columns across
    LIFT_SMALL: 0, LIFT_BIG: 5, // blocks of the deck above the higher bank
    TRIES: 10,
};

/** Cheap deterministic hash → [0, 1). */
function h01(a, b, s) {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** The stone of the stone bridge at a block (a pattern of grey, cobble and the odd dark brick: never one flat grey). */
export function stoneAt(x, L, z, seed) {
    const r = h01(x * 7 + L, z * 5 - L, seed + 301);
    if (r < 0.14) return BLOCK.COBBLE;
    if (r < 0.2) return BLOCK.CS_DARK;
    if (r > 0.94) return BLOCK.CS_MOSSY;
    return BLOCK.CS_GREY;
}

/**
 * The bridge of one cell, or null. `raw`: the height function with its flags (raw.water, raw.river, raw.flowX/Z, raw.sea, raw.big);
 * `busy(x, z, r)`: is a built place within r of the point.
 */
export function bridgePlan(seed, raw, busy, gx, gz) {
    const S = seed | 0;
    if (h01(gx, gz, S + 7001) > BRIDGES.CHANCE) return null;
    const x0 = gx * BRIDGES.CELL, z0 = gz * BRIDGES.CELL;
    const cands = [];
    const ox = Math.floor(h01(gx, gz, S + 7002) * BRIDGES.STRIDE), oz = Math.floor(h01(gz, gx, S + 7003) * BRIDGES.STRIDE);
    for (let z = z0 + oz + 30; z < z0 + BRIDGES.CELL - 30; z += BRIDGES.STRIDE) {
        for (let x = x0 + ox + 30; x < x0 + BRIDGES.CELL - 30; x += BRIDGES.STRIDE) {
            raw(x, z);
            if (raw.river && raw.water > 0 && !raw.sea) cands.push([x, z, raw.flowX, raw.flowZ]);
        }
    }
    if (!cands.length) return null;
    const start = Math.floor(h01(gx, gz, S + 7004) * cands.length);
    for (let t = 0; t < Math.min(cands.length, BRIDGES.TRIES); t++) {
        const c = cands[(start + t * 13) % cands.length];
        const plan = tryAt(S, raw, busy, c[0], c[1], c[2], c[3], gx, gz, t);
        if (plan) return plan;
    }
    return null;
}

function tryAt(S, raw, busy, px, pz, fx, fz, gx, gz, tryNo) {
    // the crossing is straight along x when the river runs along z, else along z
    const alongX = Math.abs(fz) >= Math.abs(fx);
    // (u: the way across; w: the way along the river)
    const at = alongX ? (u, w) => [u, w] : (u, w) => [w, u];
    const u0 = alongX ? px : pz, w0 = alongX ? pz : px;
    const wet = (u, w) => { const p = at(u, w); raw(p[0], p[1]); return raw.water > 0 || raw.sea; };
    const seaAt = (u, w) => { const p = at(u, w); raw(p[0], p[1]); return !!raw.sea; };
    const extent = (w) => {
        let lo = u0, hi = u0;
        if (!wet(u0, w)) return null;
        while (lo > u0 - 60 && wet(lo - 1, w)) lo--;
        while (hi < u0 + 60 && wet(hi + 1, w)) hi++;
        if (wet(lo - 1, w) || wet(hi + 1, w)) return null;
        for (let u = lo; u <= hi; u++) if (seaAt(u, w)) return null;
        return [lo, hi];
    };
    const e0 = extent(w0);
    if (!e0) return null;
    const bigP = at(u0, w0); raw(bigP[0], bigP[1]);
    const big = !!raw.big;
    const W = e0[1] - e0[0] + 1;
    const lim = big ? BRIDGES.BIG_W : BRIDGES.SMALL_W;
    if (W < lim[0] || W > lim[1]) return null;
    // a straight reach: the same width a little up and down the river (no bend, no meeting of rivers)
    for (const dw of [-8, -4, 4, 8]) {
        const e = extent(w0 + dw);
        if (!e || Math.abs((e[1] - e[0] + 1) - W) > Math.max(4, W * 0.3) || Math.abs(e[0] - e0[0]) > Math.max(5, W * 0.4)) return null;
    }
    // the banks: land on both sides
    const uA = e0[0] - 1, uB = e0[1] + 1;
    const ground = (u, w) => { const p = at(u, w); const g = raw(p[0], p[1]); return raw.water > 0 || raw.sea ? null : g; };
    const gA = ground(uA, w0), gB = ground(uB, w0);
    if (gA == null || gB == null) return null;
    if (Math.abs(gA - gB) > (big ? 4 : 3)) return null;
    const lift = big ? BRIDGES.LIFT_BIG : BRIDGES.LIFT_SMALL;
    const D = Math.max(gA, gB, 1) + lift; // (the deck's top layer)
    const halfW = big ? 3 : 2; // (the deck and its edge: 7 / 5 across)
    const wlo = w0 - halfW, whi = w0 + halfW;
    const kind = big ? 'stone' : 'wood';
    const wc = at(u0, w0);
    if (busy && busy(wc[0], wc[1], W / 2 + 16)) return null;
    // the ramps: a block lower every second column, to where the land meets them
    const ramp = (uBank, dir) => {
        const cols = [];
        for (let k = 1; k <= 30; k++) {
            const u = uBank + dir * k;
            const y = D - Math.floor(k / 2) - 1;
            const g = ground(u, w0);
            if (g == null) return null; // (water, a lake: no bridge)
            if (g >= y) break; // (met the land)
            cols.push({ u, y });
        }
        return cols;
    };
    const rA = ramp(uA, -1), rB = ramp(uB, 1);
    if (!rA || !rB || rA.length > 26 || rB.length > 26) return null;
    for (const r of [rA, rB]) for (const c of r) for (let w = wlo; w <= whi; w++) { const gg = ground(c.u, w); if (gg == null) return null; }
    if (busy) for (const r of [rA, rB]) { const far = r[r.length - 1]; if (far) { const p = at(far.u, w0); if (busy(p[0], p[1], 10)) return null; } }
    const rnd = (k) => h01(gx * 31 + tryNo, gz * 17 + k, S + 7100 + k);
    const parts = [];
    let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
    const put = (ua, ub, wa, wb, L0, L1, t) => {
        if (L1 < L0) return;
        const p = at(ua, wa), q = at(ub, wb);
        const xa = Math.min(p[0], q[0]), xb = Math.max(p[0], q[0]), za = Math.min(p[1], q[1]), zb = Math.max(p[1], q[1]);
        parts.push({ k: 0, x0: xa, x1: xb, z0: za, z1: zb, L0, L1, t });
        if (xa < bx0) bx0 = xa; if (xb > bx1) bx1 = xb; if (za < bz0) bz0 = za; if (zb > bz1) bz1 = zb;
    };
    // a column of the deck's body down to the ground under it
    const body = (u, y, fill, top, edgeTop) => {
        for (let w = wlo; w <= whi; w++) {
            const gg = ground(u, w);
            const edge = w === wlo || w === whi;
            if (gg != null && gg + 1 <= y - 1) put(u, u, w, w, gg + 1, y - 1, fill);
            put(u, u, w, w, y, y, edge ? edgeTop : top);
        }
    };
    if (kind === 'wood') {
        const planks = (u) => (h01(u, w0, S + 7200) < 0.12 ? BLOCK.PLANKS_DARK : BLOCK.PLANKS);
        // the span, bank to bank
        for (let u = uA; u <= uB; u++) {
            for (let w = wlo; w <= whi; w++) {
                const edge = w === wlo || w === whi;
                put(u, u, w, w, D, D, edge ? BLOCK.PLANKS_DARK : planks(u));
                if (edge) put(u, u, w, w, D + 1, D + 2, BLOCK.FENCE); // (the rails: two high — a hero is tall)
            }
        }
        // the posts: logs from the bed up to the deck, on both edges, every fourth column over the water
        for (let u = e0[0] + 1; u <= e0[1] - 1; u += 4) for (const w of [wlo, whi]) {
            const p = at(u, w); const g = raw(p[0], p[1]);
            put(u, u, w, w, g + 1, D - 1, BLOCK.WOOD);
        }
        // under the banks' ends the span rests on the land: a footing of earth to the ground
        for (const u of [uA, uB]) for (let w = wlo; w <= whi; w++) { const gg = ground(u, w); if (gg != null && gg + 1 <= D - 1) put(u, u, w, w, gg + 1, D - 1, BLOCK.DIRT); }
        // the approaches: planks on a mound
        for (const [r, bank, dir] of [[rA, uA, -1], [rB, uB, 1]]) for (const c of r) {
            body(c.u, c.y, BLOCK.DIRT, planks(c.u), BLOCK.PLANKS_DARK);
            for (const w of [wlo, whi]) put(c.u, c.u, w, w, c.y + 1, c.y + 2, BLOCK.FENCE);
            void bank; void dir;
        }
        // a lantern on a post at each corner
        for (const [u, w] of [[uA, wlo], [uA, whi], [uB, wlo], [uB, whi]]) put(u, u, w, w, D + 3, D + 3, BLOCK.LANTERN);
    } else {
        // the stone bridge: arches. The piers (and abutments) and the arches between them, across the river's water columns
        const wn = W; // (water columns)
        const nSpans = Math.max(1, Math.round(wn / 11));
        const first = e0[0], last = e0[1];
        const piers = []; // [from, to] of each pier, in u
        piers.push([uA, first]); // the abutment on the near bank (two thick into the water)
        for (let i = 1; i < nSpans; i++) { const c = Math.round(first + (wn * i) / nSpans); piers.push([c - 1, c + 1]); }
        piers.push([last, uB]);
        const wlevel = 0; // the river's top layer
        const isOpen = (u, y) => {
            for (let i = 0; i < piers.length - 1; i++) {
                const a = piers[i][1] + 1, b = piers[i + 1][0] - 1;
                if (u < a || u > b) continue;
                if (y <= wlevel) return true; // (the river itself)
                const half = (b - a + 1) / 2, c = (a + b) / 2, ry = D - 2 - wlevel;
                const dx = (u - c) / Math.max(0.5, half), dy = (y - wlevel) / Math.max(1, ry);
                return dx * dx + dy * dy <= 1;
            }
            return false;
        };
        for (let u = uA; u <= uB; u++) {
            // the deck, its stones in a pattern; the parapets on the edges
            for (let w = wlo; w <= whi; w++) {
                const edge = w === wlo || w === whi;
                put(u, u, w, w, D, D, edge ? BLOCK.CS_WHITE : stoneAt(u, D, w, S));
                if (edge) put(u, u, w, w, D + 1, D + 2, stoneAt(u, D + 1, w, S));
                put(u, u, w, w, D - 1, D - 1, BLOCK.CS_DARK); // (the deck's underside)
            }
            // the body under the deck: solid, but the arches (the water's way) and nothing under the banks' soil
            for (let w = wlo; w <= whi; w++) {
                const gg = ground(u, w);
                const bed = gg != null ? gg : (() => { const p = at(u, w); return raw(p[0], p[1]); })();
                let run = null;
                for (let y = bed + 1; y <= D - 2; y++) {
                    const open = isOpen(u, y);
                    if (open) { if (run) { put(u, u, w, w, run.y0, y - 1, run.t); run = null; } continue; }
                    const t = stoneAt(u, y, w, S);
                    if (run && run.t === t) continue;
                    if (run) put(u, u, w, w, run.y0, y - 1, run.t);
                    run = { y0: y, t };
                }
                if (run) put(u, u, w, w, run.y0, D - 2, run.t);
            }
        }
        // the causeways: cobble on a stone mound, the parapets going down with the ramp
        for (const r of [rA, rB]) for (const c of r) {
            for (let w = wlo; w <= whi; w++) {
                const gg = ground(c.u, w), edge = w === wlo || w === whi;
                if (gg != null && gg + 1 <= c.y - 1) put(c.u, c.u, w, w, gg + 1, c.y - 1, BLOCK.COBBLE);
                put(c.u, c.u, w, w, c.y, c.y, edge ? BLOCK.CS_WHITE : stoneAt(c.u, c.y, w, S));
                if (edge) put(c.u, c.u, w, w, c.y + 1, c.y + 2, stoneAt(c.u, c.y + 1, w, S));
            }
        }
        // lanterns on stone pillars at the four corners of the span
        for (const [u, w] of [[uA, wlo], [uA, whi], [uB, wlo], [uB, whi]]) { put(u, u, w, w, D + 3, D + 4, BLOCK.CS_DARK); put(u, u, w, w, D + 5, D + 5, BLOCK.LANTERN); }
    }
    if (!parts.length) return null;
    void rnd;
    return { id: 'br' + gx + ',' + gz, kind, big, axis: alongX ? 'x' : 'z', x: Math.round(wc[0]), z: Math.round(wc[1]), W, D, halfW, uA, uB, w0, x0: bx0 - 1, x1: bx1 + 1, z0: bz0 - 1, z1: bz1 + 1, parts };
}

/** The bridges of a world: a plan a cell, made when asked (and kept). */
export class BridgeSite {
    constructor(seed, raw, busy) {
        this.seed = seed | 0; this.raw = raw; this.busy = busy;
        this.cells = new Map(); this._byChunk = new Map();
    }

    cell(gx, gz) {
        const key = gx * 100003 + gz;
        let p = this.cells.get(key);
        if (p === undefined) {
            if (this.cells.size > 400) this.cells.clear();
            p = bridgePlan(this.seed, this.raw, this.busy, gx, gz);
            this.cells.set(key, p);
        }
        return p;
    }

    /** The bridges whose blocks may reach into the square [x0, x1] × [z0, z1]. */
    plansIn(x0, x1, z0, z1) {
        const out = [], C = BRIDGES.CELL, m = BRIDGES.MARGIN;
        for (let gz = Math.floor((z0 - m) / C); gz <= Math.floor((z1 + m) / C); gz++) {
            for (let gx = Math.floor((x0 - m) / C); gx <= Math.floor((x1 + m) / C); gx++) {
                const p = this.cell(gx, gz);
                if (p && p.x1 >= x0 && p.x0 <= x1 && p.z1 >= z0 && p.z0 <= z1) out.push(p);
            }
        }
        return out;
    }

    /** Near a bridge (for the trees and the rocks to keep off it). */
    near(x, z, r = 0) { return this.plansIn(x - r, x + r, z - r, z + r).length > 0; }

    partsForChunk(cx, cz, C) {
        const x0 = cx * C, z0 = cz * C, x1 = x0 + C - 1, z1 = z0 + C - 1;
        const key = cx * 65536 + cz;
        let list = this._byChunk.get(key);
        if (!list) {
            list = [];
            for (const p of this.plansIn(x0, x1, z0, z1)) for (const q of p.parts) if (q.x1 >= x0 && q.x0 <= x1 && q.z1 >= z0 && q.z0 <= z1) list.push(q);
            if (this._byChunk.size > 300) this._byChunk.clear();
            this._byChunk.set(key, list);
        }
        return list.length ? [list] : [];
    }
}
