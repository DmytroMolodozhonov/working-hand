/**
 * Structure.js — does a building still stand? (the author: «на одной недостаточно усиленной колонне оно не удержится»)
 *
 * Collapse.js alone asked only «is it still joined to the ground?» — a whole floor on one thin column stood.
 * Here every built block has a material (STUFF): its weight, how far it may reach out with nothing under it, how
 * much a joint of it passes sideways, how much it carries. After a change (a blast, a burnt beam, a stone taken
 * away) a box round the change — from under it to the tops over it — is looked at again, in rounds:
 *
 *  1. The way down. From what holds (natural ground, bedrock, the enchanted stone, the gods' gifts, a house's sphere
 *     of protection — they never give way) every built block is reached the cheapest way: standing on a block costs
 *     nothing; a step sideways costs 1/reach of the block stepped onto (STRUCT.Q = 1: a stone balcony reaches 10
 *     blocks, a plank one 7, thatch 3) — ½, ⅓, ¼ of it from a column 2, 3, 4+ blocks thick (a thick slab, a beam, a
 *     wall over a gap reach farther); leaning on the edge of a block a layer lower (a roof's ramps, the ring of an
 *     arch) costs a tenth; hanging under a block ¼ (the bottom of a thick slab; a lamp on its chain hangs anywhere under its
 *     ceiling). A block not reached within Q — a balcony twice as long as its stone allows, a floor whose walls are
 *     gone — has nothing to hold it: it falls.
 *  2. The weight. From the top down (the farthest from the ground first) each block passes all it carries (its own
 *     weight and what is on it) to what holds it: the block under it (twice the share), the ones beside it nearer the
 *     ground, the one it hangs from, the ones it leans on. So a roof's weight runs along the roof to its walls, a
 *     wall's down the wall. Then:
 *     - a lone column (nothing beside it) bends and breaks under far less than a wall: it carries STRUCT.COLUMN of its
 *       material's `carry` one storey high, less the taller it is (a stone column 1×1 one storey high: 72 — a 7×7
 *       stone floor with a storey of walls and a roof on it is ~200: the column breaks, all of it comes down; a hall's
 *       pillar under its share of the vault holds; a column 3×3 has its blocks braced — it holds a house);
 *     - the weight passed sideways across a wall of joints one over the other between two columns may not be more than
 *       their bonds together (a 1-thick slab: one joint; a deep beam: all of its layers) — else it tears there (a
 *       house on a 2×2 pillar: its floor tears round the pillar);
 *     - hanging and leaning joints pass no more than their bond / a share of their carry.
 *  3. What lost its way down falls (Collapse.dropPiece: straight down as one piece, the harder the more breaks); the
 *     next round the fallen pieces lie on what is under them, the weight runs anew — a neighbour that carries more
 *     now may give way too: a chain, each round a little later (STRUCT.STAGE, as seen).
 *
 * «As built, so it stands» (worse()): given what the change took away (`gone`), a block gives way only if the change
 * made it worse — over its strength and loaded more than before. Everything the game built, and the world as the
 * last fall left it, stands by definition (a turret on a roof stands — until a blast loads its roof more); only what
 * a change loads more may fall (tools/structbench.mjs checks the untouched world of many seeds).
 *
 * A check is a job worked a little at a time (settleJob().step(ms): no long frame), one job at a time, in the order
 * of the changes (Collapse.Settling); deterministic — the same blocks, the same falls on every computer and when a
 * save replays its blasts (fixed orders, integer costs). Built blocks on the box's edge count as held (beyond it the
 * building stood before). Pure data (no three.js): works on a TerrainData.
 */

import { BLOCK, MIN_LAYER, CHUNK, MAX_LAYER } from './Terrain.js';
import { isEnchanted } from './EnchantedStone.js';

export const STRUCT = {
    Q: 120, // the dearest way down a block may have (a step sideways onto stone: Q / its reach)
    DEEP: 4, // a step sideways from a column of 2, 3, 4+ blocks one on another costs ½, ⅓, ¼
    HANG: 0.25, // hanging under a block costs this share of a step (what hangs is held by its joint's bond)
    LEAN: 0.1, // leaning on the edge of a block a layer lower costs this share of a step (a rafter, an arch's ring: pressed, not bent)
    LEAN_CARRY: 0.5, // …and passes down at most this share of what the weaker block carries
    UNDER: 2, // the block under a block takes this many shares of its weight (each other holder one)
    COLUMN: 0.12, // a lone column one storey high (nothing beside it) carries this share of its material's `carry` (stone: 72)
    STOREY: 4, // layers: …one storey; a column four times as tall carries half of that, a quarter as tall — twice as much
    CHAIN: 8, // layers: a lamp or a chandelier hangs on its chain this far under its ceiling
    WORSE: 1.05, // a block over its strength gives way only if it carries this much more than before the change (worse())
    TIP: 0.5, // blocks: how far beyond the feet of its columns the middle of a piece's weight may be (balance())
    BEND: 30, // weight × blocks off their feet each lone column's own stiffness holds still (a lamp's hood, a lean-to on its posts)
    MARGIN: 11, // m round the change looked at too (the roofs and floors that lean on it: a stone slab reaches 10)
    DEPTH: 4, // layers under the change looked at
    ROUNDS: 10, // at most this many rounds of falling in one check (a chain)
    STAGE: 0.45, // s between the rounds of a chain, as seen (FallingBlocks)
    MAX_CELLS: 900_000, // a box bigger than this is cut down to it (round the change)
    WARM_CELLS: 360_000, // the buffers made ahead (~9 MB): a «Total Destruction» box
};

/**
 * The materials: w — weight (a stone block 1); reach — blocks it reaches out sideways with nothing under it;
 * bond — the weight a side joint passes (a hanging one: as much); carry — the weight a block carries on itself
 * (braced by blocks beside it; a lone column — STRUCT.COLUMN of it).
 */
const S_STONE = { w: 1, reach: 10, bond: 25, carry: 600 };
const S_ARCANE = { w: 1, reach: 10, bond: 40, carry: 600 }; // (the wizards' arcane stone: its blocks bound by magic)
const S_ICE = { w: 0.9, reach: 10, bond: 60, carry: 2000 }; // (the Ice Queen's palace ice: frozen into one by her magic)
const S_GOLD = { w: 0.6, reach: 8, bond: 20, carry: 600 }; // (metal: a chandelier on its chain, its arms)
const S_PLASTER = { w: 0.7, reach: 4, bond: 25, carry: 600 }; // (wattle and daub in a timber frame)
const S_PLANKS = { w: 0.4, reach: 7, bond: 30, carry: 600 }; // (a post, a beam, a floor on its joists: wood along its grain)
const S_LOG = { w: 0.6, reach: 5, bond: 30, carry: 600 }; // (a trunk)
const S_TILES = { w: 0.5, reach: 5, bond: 25, carry: 200 }; // (tiles on battens and rafters)
const S_THATCH = { w: 0.25, reach: 3, bond: 15, carry: 60 }; // (straw on rafters)
const S_HAY = { w: 0.2, reach: 2, bond: 3, carry: 15 };
const S_FENCE = { w: 0.2, reach: 3, bond: 5, carry: 20 };
const S_LEAVES = { w: 0.05, reach: 6, bond: 5, carry: 6 };
const S_CLOTH = { w: 0.05, reach: 12, bond: 5, carry: 40 }; // (banners, awnings, garlands: fastened to their walls and poles)
const S_CARPET = { w: 0.4, reach: 7, bond: 30, carry: 150 }; // (a carpet lies on the floorboards: the floor itself)
const S_LAMP = { w: 0.1, reach: 2, bond: 20, carry: 600 }; // (its iron frame on a post; also the fire in a hearth, under its stones)
const S_PLANT = { w: 0.05, reach: 2, bond: 1, carry: 2 };
const S_SHELF = { w: 0.4, reach: 3, bond: 8, carry: 40 }; // (books, potions)
const S_DEFAULT = { w: 0.6, reach: 4, bond: 15, carry: 150 };

const STUFF = [];
(function table() {
    const B = BLOCK;
    const put = (list, s) => { for (const k of list) if (B[k] != null) STUFF[B[k]] = s; };
    put(['CS_GREY', 'CS_SAND', 'CS_DARK', 'CS_WHITE', 'CS_MOSSY', 'COBBLE', 'BRICK'], S_STONE);
    put(['ARCANE', 'ARCANE_DARK', 'RUNE'], S_ARCANE);
    put(['ICE_WALL', 'ICE_GLOW', 'ICE_FLOOR', 'ICE_DARK'], S_ICE);
    put(['GOLD'], S_GOLD);
    put(['PLASTER'], S_PLASTER);
    put(['PLANKS', 'PLANKS_DARK'], S_PLANKS);
    put(['WOOD', 'BIRCH', 'SPRUCE', 'CHERRY', 'DARK', 'PLANET_WOOD'], S_LOG);
    put(['ROOF_RED', 'ROOF_BLUE', 'ROOF_SLATE', 'ROOF_PURPLE'], S_TILES);
    put(['THATCH'], S_THATCH);
    put(['HAY'], S_HAY);
    put(['FENCE'], S_FENCE);
    put(['LEAVES', 'BIRCH_LEAVES', 'SPRUCE_LEAVES', 'CHERRY_LEAVES', 'DARK_LEAVES', 'PLANET_LEAF'], S_LEAVES);
    put(['CLOTH_WHITE', 'CLOTH_YELLOW'], S_CLOTH);
    put(['CARPET_RED', 'CARPET_BLUE', 'CARPET_GREEN', 'CARPET_PURPLE'], S_CARPET);
    put(['LANTERN', 'ARCANE_LAMP', 'ARCANE_LAMP_VIOLET'], S_LAMP);
    put(['WHEAT', 'VEG', 'FLOWERS'], S_PLANT);
    put(['BOOKS', 'POTION'], S_SHELF);
})();
/** The material of a built block (STUFF). */
export const stuffOf = (t) => STUFF[t] || S_DEFAULT;

/** What never gives way and holds whatever leans on it: natural ground (here and on the planets), bedrock, frozen water, the enchanted stone. */
const HOLDS = new Set();
export function holdsFast(t) {
    if (!HOLDS.size) for (const k of ['GRASS', 'DIRT', 'STONE', 'SNOW', 'SAND', 'ICE', 'BEDROCK', 'FARMLAND', 'PATH', 'ICE_SHAPE', 'GRAVEL', 'DEEPSTONE', 'REGOLITH', 'PLANET_ROCK', 'PLANET_ICE', 'PLANET_DARK', 'PLANET_GRASS']) if (BLOCK[k] != null) HOLDS.add(BLOCK[k]);
    return HOLDS.has(t) || isEnchanted(t);
}

/** Lamps and chandeliers (a lantern, a crystal lamp, a golden chandelier) may hang on a chain from what is over them, STRUCT.CHAIN layers up at most. */
const CHAIN = new Set([BLOCK.LANTERN, BLOCK.ARCANE_LAMP, BLOCK.ARCANE_LAMP_VIOLET, BLOCK.GOLD]);

// the costs and shares by type, in flat arrays (no objects looked up in the loops)
const N_T = 256;
const SIDE = new Int32Array(N_T), HANG = new Int32Array(N_T), W = new Float64Array(N_T), BOND = new Float64Array(N_T), CARRY = new Float64Array(N_T);
const KIND = new Uint8Array(N_T); // 0 air / water, 1 holds, 2 built
const LEANC = new Int32Array(N_T), DIV = [null, null, new Int32Array(N_T), new Int32Array(N_T), new Int32Array(N_T)]; // (a lean; a step from a column 2, 3, 4 thick)
const CHAINED = new Uint8Array(N_T);
const TREE = new Uint8Array(N_T); // (a tree's trunk and crown: a box of nothing but trees and ground is not looked at — they stand on their roots)
const WATER = BLOCK.WATER;
let ready = false;
function costs() {
    for (let t = 0; t < N_T; t++) {
        if (t === BLOCK.AIR || t === WATER) continue;
        CHAINED[t] = CHAIN.has(t) ? 1 : 0;
        KIND[t] = holdsFast(t) ? 1 : 2;
        TREE[t] = STUFF[t] === S_LOG || STUFF[t] === S_LEAVES ? 1 : 0;
        const s = stuffOf(t);
        SIDE[t] = Math.round(STRUCT.Q / s.reach);
        HANG[t] = Math.max(1, Math.round(SIDE[t] * STRUCT.HANG));
        LEANC[t] = Math.round(SIDE[t] * STRUCT.LEAN);
        for (let k = 2; k <= STRUCT.DEEP; k++) DIV[k][t] = Math.round(SIDE[t] / k);
        W[t] = s.w; BOND[t] = s.bond; CARRY[t] = s.carry;
    }
    ready = true;
}

const INF = 0x3fffffff;
/** (for the benches) the phase at work and the slowest pieces of work seen: [ms, phase, box] */
export const STATS = { phase: '', slow: [] };
/**
 * «As built, so it stands»: against the box as it was before the change, a block gives way only if the change made
 * it worse — over its strength (checked before) and carrying more than it did (STRUCT.WORSE).
 */
const worse = (now, before) => now > before * STRUCT.WORSE + 0.25;

/**
 * The ways a block is held, besides standing on the block under it (never torn): 0…3 by the block beside it
 * (+x, −x, +z, −z), 4 hanging under the block over it, 5…8 leaning on the edge of a block a layer lower beside it
 * (+x, −x, +z, −z: a roof's rows of ramps, the steps of an arch). [dx, dL, dz] of the holder.
 */
const HELD = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]];
const OFF = new Int32Array(9);
const DXH = Int8Array.from(HELD, (h) => h[0]), DLH = Int8Array.from(HELD, (h) => h[1]), DZH = Int8Array.from(HELD, (h) => h[2]);

/**
 * The buffers of the job at work (one at a time; a job that finds them taken by another starts its round anew).
 * A box of the world read into flat arrays: x0…x0+NX−1, L0…L0+NY−1, z0…z0+NZ−1 — index ((L−L0)·NZ + z−z0)·NX + x−x0.
 */
/** A list of whole numbers that grows (no garbage: the same array, kept). */
class IntList {
    constructor(n = 4096) { this.a = new Int32Array(n); this.n = 0; }
    push(v) { if (this.n === this.a.length) { const b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; }
}
const buf = {
    n: 0, owner: null, T: null, P: null, recv: null, order: null, RUN: null, SX: null, SZ: null, seen: null, lost: null, cnt: null,
    // Dial's buckets as lists in flat arrays: head[p] → an entry; entry e: its cell ec[e], the next en[e]
    head: new Int32Array(STRUCT.Q + 1), ec: new Int32Array(1 << 16), en: new Int32Array(1 << 16), ne: 0,
    touched: new IntList(), marked: new IntList(), stack: new IntList(), tops: new IntList(), body: new IntList(), feet: new IntList(),
    mx: null, mz: null, // the first moments (Σ weight × x, z off the block) of what each block carries: where its weight's middle is
    // the box before the change (one job's at a time: preOwner)
    preOwner: null, preT: null, preP: null, preLoad: null, preSX: null, preSZ: null,
};
function ensure(n) {
    if (buf.n >= n) return;
    const m = Math.max(n, Math.ceil(buf.n * 1.5));
    buf.n = m;
    buf.T = new Uint8Array(m); buf.P = new Int32Array(m); buf.recv = new Float32Array(m); buf.order = new Int32Array(m); buf.RUN = new Uint8Array(m);
    buf.SX = new Float32Array(m); buf.SZ = new Float32Array(m); buf.seen = new Uint8Array(m * 2); buf.lost = new Uint8Array(m);
    buf.mx = new Float32Array(m); buf.mz = new Float32Array(m);
    buf.preT = new Uint8Array(m); buf.preP = new Int32Array(m); buf.preLoad = new Float32Array(m); buf.preSX = new Float32Array(m); buf.preSZ = new Float32Array(m);
    buf.preOwner = null;
}

/** Made ahead (the loading screen — Game.warmUp): the buffers of a box as big as a «Total Destruction»'s, the tables (no first-blast jerk). */
export function prepareStructure(cells = STRUCT.WARM_CELLS) { if (!ready) costs(); ensure(cells); }

// the work is cut into pieces: every phase yields when the job's time is up (looked at the clock every ~500 cells' work;
// due(k): k cells' work done)
const clock = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
let deadline = Infinity, ops = 0;
const due = (k = 1) => { ops += k; if (ops < 512) return false; ops = 0; return deadline !== Infinity && clock() > deadline; };

/** The box read from the world (cells of the gods' gifts and of `keep` read as bedrock: they hold). Returns the built blocks (trees left out). */
function* readBox(job) {
    STATS.phase = 'readBox';
    const { data, B } = job, { x0, z0, L0, NX, NY, NZ } = B;
    const n = NX * NY * NZ, NXZ = NX * NZ;
    ensure(n);
    const T = buf.T;
    T.fill(0, 0, n);
    const gift = data.godGiftAt, keep = job.keep;
    let built = 0;
    for (let z = 0; z < NZ; z++) {
        for (let x = 0; x < NX; x++) {
            const wx = x0 + x, wz = z0 + z;
            const c = data.chunk(wx >> 5, wz >> 5);
            if (!c || c.empty || !c.blocks) continue;
            const col = (wz & (CHUNK - 1)) * CHUNK + (wx & (CHUNK - 1));
            const top = Math.min(L0 + NY - 1, c.top[col]);
            const god = gift && gift(wx, 0, wz);
            for (let L = L0; L <= top; L++) {
                const t = c.blocks[(L - MIN_LAYER) * CHUNK * CHUNK + col];
                if (t === BLOCK.AIR) continue; // (water is kept: nothing for the building, but it braces a pile standing in it — sides())
                const fast = KIND[t] === 2 && (god || (keep && keep(wx, L - 1, wz)));
                T[(L - L0) * NXZ + z * NX + x] = fast ? BLOCK.BEDROCK : t;
                if (KIND[t] === 2 && !fast && !TREE[t]) built++;
            }
        }
        if (due(NX * 8)) yield;
    }
    return built;
}

/** Does block i touch its holder a layer lower (way d > 4) by the edge only — nothing beside it, nothing under it? (a ramp on a ramp, a rafter) */
function edgeOnly(i, d, NXZ) { const T = buf.T; return !KIND[T[i - NXZ]] && !KIND[T[i + OFF[d] + NXZ]]; }

/** How many of the four blocks beside cell i brace it (built, ground — or the water round a pile of a quay). */
function sides(i, NX) {
    const T = buf.T;
    return (KIND[T[i + 1]] || T[i + 1] === WATER ? 1 : 0) + (KIND[T[i - 1]] || T[i - 1] === WATER ? 1 : 0)
        + (KIND[T[i + NX]] || T[i + NX] === WATER ? 1 : 0) + (KIND[T[i - NX]] || T[i - NX] === WATER ? 1 : 0);
}

/**
 * The way down of every built block of the box (buf.P: its cost; INF — none within STRUCT.Q).
 * Dial's buckets: the costs are whole numbers ≤ Q.
 */
function* waysDown(job) {
    STATS.phase = 'waysDown';
    const { NX, NY, NZ } = job.B;
    const n = NX * NY * NZ, NXZ = NX * NZ, T = buf.T, P = buf.P, Q = STRUCT.Q, RUN = buf.RUN, DEEP = STRUCT.DEEP;
    for (let d = 0; d < 9; d++) OFF[d] = HELD[d][0] + HELD[d][1] * NXZ + HELD[d][2] * NX;
    P.fill(INF, 0, n);
    const head = buf.head;
    head.fill(-1);
    buf.ne = 0;
    // (a lamp, a chandelier on its chain: never too far — its chain holds it wherever its ceiling is)
    const push = (i, p) => {
        if (p > Q && CHAINED[T[i]]) p = Q;
        if (p >= P[i] || p > Q) return;
        P[i] = p;
        if (buf.ne === buf.ec.length) { const a = new Int32Array(buf.ec.length * 2), b = new Int32Array(buf.ec.length * 2); a.set(buf.ec); b.set(buf.en); buf.ec = a; buf.en = b; }
        const e = buf.ne++;
        buf.ec[e] = i; buf.en[e] = head[p]; head[p] = e;
    };
    const torn = job.torn, any = torn.size > 0;
    // how thick each column of blocks is (blocks one on another, the ground among them), up to DEEP
    for (let c = 0; c < NXZ; c++) {
        let L = 0;
        while (L < NY) {
            if (!KIND[T[c + L * NXZ]]) { L++; continue; }
            let e = L;
            while (e < NY && KIND[T[c + e * NXZ]]) e++;
            const r = Math.min(DEEP, e - L);
            for (let l = L; l < e; l++) RUN[c + l * NXZ] = r;
            L = e;
        }
        if (due(NY)) yield;
    }
    // the starts: built blocks on (or beside, or under) what holds, and those on the box's edges
    for (let L = 0; L < NY; L++) {
        for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) {
            const i = L * NXZ + z * NX + x, t = T[i];
            if (KIND[t] !== 2) continue;
            if (L === 0 || x === 0 || z === 0 || x === NX - 1 || z === NZ - 1 || L === NY - 1) { push(i, 0); continue; } // (beyond the box: it stood before)
            if (KIND[T[i - NXZ]] === 1) { push(i, 0); continue; }
            if (CHAINED[t]) for (let k = 1; k <= STRUCT.CHAIN && L + k < NY; k++) { const c = KIND[T[i + k * NXZ]]; if (c === 1) push(i, HANG[t]); if (c) break; }
            for (let d = 0; d < 9; d++) {
                if (KIND[T[i + OFF[d]]] !== 1 || (any && torn.has(i * 16 + d))) continue;
                if (d > 4 && !edgeOnly(i, d, NXZ)) continue;
                push(i, d === 4 ? HANG[t] : Math.round(SIDE[t] * (d > 4 ? STRUCT.LEAN : 1 / DEEP)));
            }
            if ((x & 15) === 15 && due(64)) yield;
        }
        if (due(NX)) yield;
    }
    for (let p = 0; p <= Q; p++) {
        while (head[p] !== -1) {
            const e = head[p];
            head[p] = buf.en[e];
            const i = buf.ec[e];
            if (P[i] !== p) continue;
            const L = (i / NXZ) | 0, r = i - L * NXZ, z = (r / NX) | 0, x = r - z * NX;
            // standing on i: the block over it (free)
            if (L < NY - 1) { const j = i + NXZ; if (KIND[T[j]] === 2) push(j, p); }
            // the blocks i holds otherwise: j = i − OFF[d] (a step beside it the cheaper, the thicker the column i is in;
            // a lamp holds nothing beside it or under it — only what stands on it, the stones of a hearth over its fire)
            if (CHAINED[T[i]] && STUFF[T[i]] === S_LAMP) continue;
            const deep = RUN[i], inner = x > 0 && x < NX - 1 && z > 0 && z < NZ - 1;
            for (let d = 0; d < 9; d++) {
                if (!inner || L === 0 || L === NY - 1) {
                    const jx = x - DXH[d], jL = L - DLH[d], jz = z - DZH[d];
                    if (jx < 0 || jx >= NX || jz < 0 || jz >= NZ || jL < 0 || jL >= NY) continue;
                }
                const j = i - OFF[d], tj = T[j];
                if (KIND[tj] !== 2 || (any && torn.has(j * 16 + d))) continue;
                if (d > 4 && !edgeOnly(j, d, NXZ)) continue;
                push(j, p + (d < 4 ? (deep > 1 ? DIV[deep][tj] : SIDE[tj]) : d === 4 ? HANG[tj] : LEANC[tj]));
            }
            // a lamp on its chain under i (air between)
            if (L > 1 && !KIND[T[i - NXZ]]) for (let k2 = 2; k2 <= STRUCT.CHAIN && L - k2 >= 0; k2++) { const j = i - k2 * NXZ, c = KIND[T[j]]; if (c === 2 && CHAINED[T[j]]) push(j, p + HANG[T[j]]); if (c) break; }
            if (due(4)) yield;
        }
    }
}

/**
 * The weight, from the top down (record: the box before the change — only its loads and side flows are kept, into
 * job.pre). Returns the cells crushed; tears the joints that pass too much (into job.torn); counts in `out`.
 */
function* weigh(job, out, record) {
    STATS.phase = 'weigh';
    const { NX, NY, NZ } = job.B;
    const n = NX * NY * NZ, NXZ = NX * NZ, T = buf.T, P = buf.P, recv = buf.recv, Q = STRUCT.Q, mx = buf.mx, mz = buf.mz;
    recv.fill(0, 0, n); mx.fill(0, 0, n); mz.fill(0, 0, n);
    const tops = buf.tops;
    tops.n = 0;
    // the order: the dearest way down first; of the same cost, the higher first (key = P·NY + L) — a counting sort
    const K = (Q + 1) * NY;
    if (!buf.cnt || buf.cnt.length < K + 1) buf.cnt = new Int32Array(K + 1);
    const cnt = buf.cnt;
    cnt.fill(0, 0, K + 1);
    let m = 0;
    for (let i0 = 0; i0 < n; i0 += 16384) {
        for (let i = i0, e = Math.min(n, i0 + 16384); i < e; i++) if (KIND[T[i]] === 2 && P[i] !== INF) { cnt[P[i] * NY + ((i / NXZ) | 0)]++; m++; }
        if (due(16384)) yield;
    }
    let acc = 0;
    for (let k = K - 1; k >= 0; k--) { const c = cnt[k]; cnt[k] = acc; acc += c; }
    const order = buf.order;
    for (let i0 = 0; i0 < n; i0 += 16384) {
        for (let i = i0, e = Math.min(n, i0 + 16384); i < e; i++) if (KIND[T[i]] === 2 && P[i] !== INF) order[cnt[P[i] * NY + ((i / NXZ) | 0)]++] = i;
        if (due(16384)) yield;
    }
    const crushed = [];
    const torn = job.torn, SX = buf.SX, SZ = buf.SZ, touched = buf.touched;
    // (against the box before the change: only a block that is still the same one has its old load)
    const pre = record ? null : job.pre, preT = pre?.T, preLoad = pre?.load;
    const before = (i) => (preT[i] === T[i] ? preLoad[i] : 0);
    const keepLoad = record ? job.pre.load : null;
    if (record) keepLoad.fill(0, 0, n);
    const hold = new Int32Array(10), way = new Int8Array(10), share = new Float64Array(10);
    for (let o = 0; o < m; o++) {
        if (due(6)) yield;
        const i = order[o], t = T[i], p = P[i];
        const L = (i / NXZ) | 0, r = i - L * NXZ, z = (r / NX) | 0, x = r - z * NX;
        if (L === 0 || x === 0 || z === 0 || x === NX - 1 || z === NZ - 1 || L === NY - 1) continue; // (the box's edge: held from beyond)
        const load = W[t] + recv[i], MX = mx[i], MZ = mz[i];
        if (record) keepLoad[i] = load;
        else if (!sides(i, NX) && KIND[T[i + NXZ]] === 2 && sides(i + NXZ, NX) && recv[i] > W[t]) tops.push(i); // (the top of a lone column under something: is it balanced? — balance())
        if (!record && recv[i] > CARRY[t] * STRUCT.COLUMN * 0.25 && !sides(i, NX)) {
            // a lone column bends and breaks under a weight a wall carries easily; the taller, the less
            let up = i + NXZ, dn = i - NXZ, h = 1;
            while (up < n && KIND[T[up]] === 2 && !sides(up, NX)) { h++; up += NXZ; }
            while (dn >= NXZ && KIND[T[dn]] === 2 && !sides(dn, NX)) { h++; dn -= NXZ; }
            if (recv[i] > CARRY[t] * Math.min(1, STRUCT.COLUMN * Math.sqrt(STRUCT.STOREY / h)) && (!pre || worse(load, before(i)))) {
                crushed.push(i); out.crushed++;
                for (let j = i - NXZ; j > dn; j -= NXZ) crushed.push(j); // (it breaks as a whole, down to where something braces it)
                continue;
            }
        }
        // its holders: the block under it, those beside it nearer the ground, the one over it it hangs from,
        // the ones a layer lower it leans on
        let h = 0, sum = 0;
        const dn = i - NXZ, kd = KIND[T[dn]];
        if (kd === 1) continue; // (standing on the ground: all of it goes into the ground)
        if (kd === 2 && P[dn] <= p) { hold[h] = dn; way[h] = -1; share[h] = STRUCT.UNDER; h++; sum += STRUCT.UNDER; }
        const pk = p * NY + L, any = torn.size > 0, D = kd ? 5 : 9; // (standing on a block: it leans on nothing beside it lower)
        for (let d = 0; d < D; d++) {
            const j = i + OFF[d], kj = KIND[T[j]];
            if (!kj || (any && torn.has(i * 16 + d))) continue;
            if (kj === 2 && (P[j] === INF || P[j] * NY + L + HELD[d][1] >= pk)) continue; // (only one nearer the ground)
            if (kd && (kj === 1 || P[j] >= p)) continue; // (standing on a block: sideways only to a built one nearer the ground — an arch's push)
            if (d > 4 && !edgeOnly(i, d, NXZ)) continue;
            if (kj === 2 && STUFF[T[j]] === S_LAMP) continue; // (a lamp holds nothing beside it)
            hold[h] = j; way[h] = d; share[h] = 1; h++; sum += 1;
        }
        // (none: a lamp on its chain — its little weight is its ceiling's, left out)
        for (let k = 0; k < h; k++) {
            const a = load * share[k] / sum, j = hold[k], d = way[k];
            if (d >= 0 && d < 4) {
                // sideways: what crosses the joint is added up for its whole wall of joints (shear(): a deep beam)
                const J = d === 0 || d === 2 ? i : j, A = d < 2 ? SX : SZ;
                if (!A[J]) touched.push(J * 2 + (d < 2 ? 0 : 1));
                A[J] += a;
            } else if (d >= 4 && !record) {
                // hanging — no more than the weaker block's bond; leaning — a share of what the weaker one carries
                const bond = d > 4 ? Math.min(CARRY[t], KIND[T[j]] === 2 ? CARRY[T[j]] : Infinity) * STRUCT.LEAN_CARRY
                    : Math.min(BOND[t], KIND[T[j]] === 2 ? BOND[T[j]] : Infinity);
                if (a > bond && (!pre || worse(load, before(i)))) { torn.add(i * 16 + d); out.torn++; continue; }
            }
            if (KIND[T[j]] === 2) {
                recv[j] += a;
                // (and where its middle is: what i carried, and i itself, a step off j)
                const f = a / load;
                if (d < 0 || d === 4) { mx[j] += f * MX; mz[j] += f * MZ; } else { mx[j] += f * MX - a * HELD[d][0]; mz[j] += f * MZ - a * HELD[d][2]; }
            }
        }
    }
    if (!record && tops.n) yield* balance(job, crushed, out, pre ? before : null);
    yield* shear(job, out, record);
    return crushed;
}

/**
 * Balance: a piece of a building resting on lone columns only (no wall, no ground under any of it) stands only if
 * the middle of its weight is over them — over the box round their feet (STRUCT.TIP more at most). A roof on its four
 * posts stands; on one post at its corner (the three others knocked out) it tips over: the column breaks, the roof
 * comes down. (A roof resting on a wall too is held by the wall.) before(i): the load before the change — only a
 * piece whose columns carry more now may tip.
 */
function* balance(job, crushed, out, before) {
    STATS.phase = 'balance';
    const { NX, NY, NZ } = job.B, NXZ = NX * NZ, n = NXZ * NY, T = buf.T, recv = buf.recv, mx = buf.mx, mz = buf.mz, mark = buf.lost;
    const tops = buf.tops, body = buf.body, feet = buf.feet, stack = buf.stack, done = buf.marked;
    done.n = 0;
    const isTop = (c) => !sides(c, NX) && KIND[T[c]] === 2;
    for (let q = 0; q < tops.n; q++) {
        const t0 = tops.a[q];
        if (mark[t0 + NXZ]) continue;
        // the piece over this column: its built blocks that are not lone columns, as far as they go
        body.n = 0; feet.n = 0; stack.n = 0;
        stack.push(t0 + NXZ); mark[t0 + NXZ] = 1; body.push(t0 + NXZ);
        let held = false;
        while (stack.n && !held) {
            const c = stack.a[--stack.n];
            const L = (c / NXZ) | 0, r = c - L * NXZ, z = (r / NX) | 0, x = r - z * NX;
            if (L <= 1 || x === 0 || z === 0 || x === NX - 1 || z === NZ - 1 || L >= NY - 1 || body.n > 30000) { held = true; break; } // (beyond the box: held as before)
            const dn = c - NXZ, kd = KIND[T[dn]];
            if (kd === 1) { held = true; break; } // (it rests on the ground somewhere)
            if (kd === 2 && isTop(dn)) { if (!mark[dn]) { mark[dn] = 2; feet.push(dn); body.push(dn); } }
            for (let d = 0; d < 6; d++) {
                const e = d === 0 ? c + 1 : d === 1 ? c - 1 : d === 2 ? c + NX : d === 3 ? c - NX : d === 4 ? c + NXZ : c - NXZ;
                if (mark[e] || KIND[T[e]] !== 2 || !sides(e, NX)) { if (KIND[T[e]] === 1) held = true; continue; }
                mark[e] = 1; body.push(e); stack.push(e);
            }
            if (due(8)) yield;
        }
        if (!held && feet.n) {
            // the middle of the weight on the columns, and the box round their feet
            let W0 = 0, sx = 0, sz = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, more = !before;
            for (let k = 0; k < feet.n; k++) {
                const c = feet.a[k], r = c % NXZ, z = (r / NX) | 0, x = r - z * NX, l = W[T[c]] + recv[c];
                W0 += l; sx += l * x + mx[c]; sz += l * z + mz[c];
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
                if (before && worse(l, before(c))) more = true;
            }
            // (how far off its feet the middle is; a little weight a little off — a lamp's hood on its post — the column's
            // own stiffness holds: STRUCT.BEND, weight × blocks)
            const cx = sx / W0, cz = sz / W0, tip = 0.5 + STRUCT.TIP;
            const off = Math.max(x0 - tip - cx, cx - x1 - tip, z0 - tip - cz, cz - z1 - tip);
            if (STATS.why) STATS.why.push({ feet: feet.n, W: +W0.toFixed(1), off: +off.toFixed(2), body: body.n, at: [x0, z0, x1, z1], c: [+cx.toFixed(1), +cz.toFixed(1)] });
            if (more && off > 0 && W0 * (off + STRUCT.TIP) > STRUCT.BEND * feet.n) {
                // it tips over: the columns under it break, as a whole each (down to where something braces them)
                for (let k = 0; k < feet.n; k++) for (let c = feet.a[k]; c >= NXZ && KIND[T[c]] === 2 && !sides(c, NX); c -= NXZ) crushed.push(c);
                out.crushed++;
            }
        }
        for (let k = 0; k < body.n; k++) done.push(body.a[k]); // (the other columns of the same piece: done with it)
    }
    for (let k = 0; k < done.n; k++) mark[done.a[k]] = 0;
    done.n = 0;
}

/**
 * The side joints: the weight passed across them is added up for each wall of joints one over the other between the
 * same two columns (a slab one block thick: one joint; a beam or a wall over a gap: all its layers together — the
 * deeper, the stronger); more than their bonds together — and, against the box before the change, more than it
 * passed before — the whole wall of joints tears.
 */
function* shear(job, out, record) {
    STATS.phase = 'shear';
    const { NX, NZ } = job.B, NXZ = NX * NZ, n = NXZ * job.B.NY, T = buf.T, SX = buf.SX, SZ = buf.SZ, seen = buf.seen;
    const touched = buf.touched, marked = buf.marked, torn = job.torn;
    const TA = touched.a;
    if (record) {
        // (before the change: only what crossed each joint is kept)
        const sx = job.pre.SX, sz = job.pre.SZ;
        sx.fill(0, 0, n); sz.fill(0, 0, n);
        for (let q = 0; q < touched.n; q++) { const code = TA[q], J = code >> 1; if (code & 1) { sz[J] = SZ[J]; SZ[J] = 0; } else { sx[J] = SX[J]; SX[J] = 0; } }
        touched.n = 0;
        return;
    }
    const pre = job.pre, preT = pre?.T;
    const both = (a, b) => KIND[T[a]] && KIND[T[b]] && (KIND[T[a]] === 2 || KIND[T[b]] === 2);
    const bondOf = (a, b) => Math.min(KIND[T[a]] === 2 ? BOND[T[a]] : Infinity, KIND[T[b]] === 2 ? BOND[T[b]] : Infinity);
    for (let q = 0; q < touched.n; q++) {
        const code = TA[q];
        if (seen[code]) continue;
        if (due(8)) yield;
        const ax = code & 1, o = ax ? NX : 1, A = ax ? SZ : SX, PA = pre ? (ax ? pre.SZ : pre.SX) : null, dPos = ax ? 2 : 0;
        let a = code >> 1;
        while (a >= NXZ && both(a - NXZ, a - NXZ + o) && !torn.has((a - NXZ) * 16 + dPos)) a -= NXZ;
        let flow = 0, cap = 0, was = 0;
        const start = a;
        for (; a < n && both(a, a + o) && !(a !== start && torn.has(a * 16 + dPos)); a += NXZ) {
            flow += A[a]; cap += bondOf(a, a + o); seen[a * 2 + ax] = 1; marked.push(a * 2 + ax);
            if (pre && preT[a] === T[a] && preT[a + o] === T[a + o]) was += PA[a];
        }
        if (flow <= cap || (pre && !worse(flow, was))) continue;
        out.torn++;
        for (let b = start; b < a; b += NXZ) { torn.add(b * 16 + dPos); torn.add((b + o) * 16 + dPos + 1); }
    }
    for (let q = 0; q < touched.n; q++) { const code = TA[q], J = code >> 1; if (code & 1) SZ[J] = 0; else SX[J] = 0; }
    for (let q = 0; q < marked.n; q++) seen[marked.a[q]] = 0;
    touched.n = 0; marked.n = 0;
}

/**
 * The built blocks of the box with no way down, in pieces (joined face to face, or by an edge a layer up or down — a
 * roof's ramps): [{cells: [[x, L, z, type, shape?], …]}]. Against the box before the change, a piece starts only from a
 * block that had a way down then (one that never had — as built — goes only along with a piece that falls).
 */
function* lostPieces(job) {
    STATS.phase = 'lostPieces';
    const { data, B } = job, { x0, z0, L0, NX, NY, NZ } = B;
    const n = NX * NY * NZ, NXZ = NX * NZ, T = buf.T, P = buf.P, seen = buf.lost;
    const pieces = [];
    let any = false;
    for (let i0 = 0; i0 < n && !any; i0 += 16384) {
        for (let i = i0, e = Math.min(n, i0 + 16384); i < e; i++) if (P[i] === INF && KIND[T[i]] === 2) { any = true; break; }
        if (due(16384)) yield;
    }
    if (!any) return pieces;
    seen.fill(0, 0, n);
    const pre = job.pre, stack = buf.stack;
    const visit = (j) => { if (!seen[j] && KIND[T[j]] === 2 && P[j] === INF) { seen[j] = 1; stack.push(j); } };
    for (let i = 0; i < n; i++) {
        if ((i & 16383) === 16383 && due(16384)) yield;
        if (seen[i] || KIND[T[i]] !== 2 || P[i] !== INF) continue;
        if (pre && pre.T[i] === T[i] && pre.P[i] === INF) continue;
        const cells = [];
        stack.n = 0; stack.push(i); seen[i] = 1;
        while (stack.n) {
            const a = stack.a[--stack.n];
            const L = (a / NXZ) | 0, r = a - L * NXZ, z = (r / NX) | 0, x = r - z * NX;
            const wx = x0 + x, wL = L0 + L, wz = z0 + z, t = T[a];
            const sh = data.shapeAt ? data.shapeAt(wx, wL, wz) : 0;
            cells.push(sh ? [wx, wL, wz, t, sh] : [wx, wL, wz, t]);
            if (x < NX - 1) visit(a + 1);
            if (x > 0) visit(a - 1);
            if (z < NZ - 1) visit(a + NX);
            if (z > 0) visit(a - NX);
            if (L < NY - 1) { visit(a + NXZ); if (x < NX - 1) visit(a + NXZ + 1); if (x > 0) visit(a + NXZ - 1); if (z < NZ - 1) visit(a + NXZ + NX); if (z > 0) visit(a + NXZ - NX); }
            if (L > 0) { visit(a - NXZ); if (x < NX - 1) visit(a - NXZ + 1); if (x > 0) visit(a - NXZ - 1); if (z < NZ - 1) visit(a - NXZ + NX); if (z > 0) visit(a - NXZ - NX); }
        }
        pieces.push({ cells });
        if (due(cells.length * 4)) yield;
    }
    return pieces;
}

/** The box round a change at (cx, cy, cz), radius r: `margin` round it, from DEPTH layers under it to the tops over it. */
export function boxAround(data, cx, cy, cz, r, margin = STRUCT.MARGIN) {
    const R = r + margin;
    let x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), z0 = Math.floor(cz - R), z1 = Math.ceil(cz + R);
    const floor = (data.bedrockTop ?? MIN_LAYER) + 1;
    const L0 = Math.max(floor, Math.floor(cy + 1 - r) - STRUCT.DEPTH);
    let top = L0;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const t = data.topLayer(x, z); if (t > top) top = t; }
    const NY = Math.min(MAX_LAYER, top + 1) - L0 + 1;
    // (a box too big — a whole mountain in it: cut round the change)
    while ((x1 - x0 + 1) * NY * (z1 - z0 + 1) > STRUCT.MAX_CELLS && x1 - x0 > 8) { x0++; x1--; z0++; z1--; }
    return { x0, z0, L0, NX: x1 - x0 + 1, NY, NZ: z1 - z0 + 1 };
}

/** Do the cells still hold what was read? (another change came between the pieces of a job's round: the round is made anew) */
function still(data, cells) { for (const c of cells) if (data.get(c[0], c[1], c[2]) !== c[3]) return false; return true; }

/**
 * A round of a job: 'more' — something fell (look again), 'stop' — it stands, 'again' — the box before the change was
 * worked out (the round is made anew against it), 'stale' — the world changed under it (made anew).
 */
function* round(job) {
    if (job.pre && buf.preOwner !== job) job.pre = null; // (another job's box before its change took the buffers: worked out anew)
    const built = yield* readBox(job);
    if (!built) return 'stop';
    const n = job.B.NX * job.B.NY * job.B.NZ;
    yield* waysDown(job);
    const lost = yield* lostPieces(job);
    const out = { crushed: 0, torn: 0 };
    const crushed = lost.length ? null : yield* weigh(job, out, false);
    const fails = lost.length || crushed.length || out.torn;
    if (fails && job.gone && !job.pre) {
        // the first failure: the box before the change (as it is now, with what the change took away put back)
        const { x0, z0, L0, NX, NY, NZ } = job.B, NXZ = NX * NZ, T = buf.T;
        yield* readBox(job);
        for (const c of job.gone) {
            const x = c[0] - x0, L = c[1] - L0, z = c[2] - z0;
            if (x < 0 || x >= NX || z < 0 || z >= NZ || L < 0 || L >= NY) continue;
            const i = L * NXZ + z * NX + x;
            if (!KIND[T[i]] && c[3] !== WATER) T[i] = c[3];
        }
        job.torn.clear();
        yield* waysDown(job);
        buf.preT.set(T.subarray(0, n)); buf.preP.set(buf.P.subarray(0, n));
        job.pre = { T: buf.preT, P: buf.preP, load: buf.preLoad, SX: buf.preSX, SZ: buf.preSZ };
        buf.preOwner = job;
        yield* weigh(job, out, true);
        return 'again';
    }
    if (lost.length) {
        for (const piece of lost) if (!still(job.data, piece.cells)) return 'stale';
        job.stage++;
        for (const piece of lost) job.drop(piece, job.stage);
        return 'more';
    }
    if (crushed.length) {
        const { x0, z0, L0, NX, NZ } = job.B, NXZ = NX * NZ, cells = [];
        for (const i of new Set(crushed)) {
            const L = (i / NXZ) | 0, r = i - L * NXZ, z = (r / NX) | 0, x = r - z * NX;
            cells.push([x0 + x, L0 + L, z0 + z, buf.T[i]]);
        }
        if (!still(job.data, cells)) return 'stale';
        job.stage++;
        job.crush(cells, job.stage);
        return 'more';
    }
    return out.torn ? 'more' : 'stop'; // (torn joints: the weight runs another way next round)
}

/**
 * A check of the building round a change, worked a little at a time: job.step(ms) → true when done.
 * drop(piece, stage) lets a piece fall (Collapse.dropPiece); crush(cells, stage) — the blocks broken under their load
 * where they stood (taken away). gone: the blocks the change took away ([x, L, z, type]; [] — none) — then only what
 * the change made worse gives way («as built, so it stands»); null — anything too weak falls. keep(x, y, z): blocks
 * that hold whatever happens (a house's sphere of protection).
 */
export function settleJob(data, B, drop, crush, gone = null, keep = null) {
    if (!ready) costs();
    // (nothing built touched what the change took away — only the land: no building lost a thing, the ground holds as before)
    const idle = !!gone?.length && !touchesBuilt(data, gone);
    const job = {
        data, B, drop, crush, gone, keep, torn: new Set(), pre: null, stage: 0, rounds: 0, gen: null, done: idle,
        step(ms = Infinity) {
            const prev = deadline;
            deadline = ms === Infinity ? Infinity : clock() + ms;
            try {
                while (!job.done) {
                    if (!job.gen || buf.owner !== job) { job.gen = round(job); buf.owner = job; }
                    const t0 = clock();
                    const r = job.gen.next();
                    const dt = clock() - t0;
                    if (dt > 4 && STATS.slow.length < 50) STATS.slow.push([+dt.toFixed(1), STATS.phase, `${job.B.NX}x${job.B.NY}x${job.B.NZ}`, r.done ? 'end ' + r.value : '']);
                    if (!r.done) return false; // (its time is up: on with it next time)
                    job.gen = null;
                    if (r.value === 'more' && ++job.rounds < STRUCT.ROUNDS) continue;
                    if (r.value === 'again' || r.value === 'stale') { if (++job.retries < 4) continue; }
                    if (r.value === 'more' || r.value === 'stop' || job.retries >= 4) job.done = true;
                }
            } finally { deadline = prev; }
            if (buf.owner === job) buf.owner = null;
            if (buf.preOwner === job) buf.preOwner = null;
            job.pre = null; job.torn.clear();
            return true;
        },
        retries: 0,
    };
    return job;
}

/** Did a change that took these blocks away touch anything built (one of them, or a block beside one of them; trees aside)? */
function touchesBuilt(data, gone) {
    for (const [x, L, z, t] of gone) {
        if (KIND[t] === 2 && !TREE[t]) return true;
        for (let d = 0; d < 6; d++) {
            const u = data.get(x + (d === 0 ? 1 : d === 1 ? -1 : 0), L + (d === 4 ? 1 : d === 5 ? -1 : 0), z + (d === 2 ? 1 : d === 3 ? -1 : 0));
            if (KIND[u] === 2 && !TREE[u]) return true;
        }
    }
    return false;
}

/** settleJob, all at once. Returns the number of rounds that let something fall. */
export function settle(data, B, drop, crush, gone = null, keep = null) {
    const job = settleJob(data, B, drop, crush, gone, keep);
    job.step(Infinity);
    return job.stage;
}

/**
 * Would anything of the box give way by the plain physics? (the check of the untouched world — tools/structbench.mjs,
 * the tests): the cells with no way down and those crushed or torn at the first look. Changes nothing.
 */
export function judge(data, B) {
    if (!ready) costs();
    const job = { data, B, torn: new Set(), pre: null, keep: null };
    const run = (g) => { for (;;) { const r = g.next(); if (r.done) return r.value; } };
    buf.owner = job;
    const built = run(readBox(job));
    const res = { built, lost: [], crushed: [], torn: [] };
    if (!built) return res;
    run(waysDown(job));
    const { x0, z0, L0, NX, NZ } = B, NXZ = NX * NZ;
    const at = (i) => { const L = (i / NXZ) | 0, r = i - L * NXZ, z = (r / NX) | 0, x = r - z * NX; return [x0 + x, L0 + L, z0 + z, buf.T[i]]; };
    for (const p of run(lostPieces(job))) res.lost.push(...p.cells);
    const out = { crushed: 0, torn: 0 };
    for (const i of new Set(run(weigh(job, out, false)))) res.crushed.push(at(i));
    for (const k of job.torn) res.torn.push([...at((k / 16) | 0), k % 16]);
    buf.owner = null;
    return res;
}
