/**
 * Collapse.js — what is left hanging in the air after a blast falls down.
 *
 * Blow away the walls under a roof and the roof comes down; blow a hole round a
 * floor and that piece of floor drops; cut a tree's trunk and its crown falls.
 * After every blast the blocks around the crater are checked: a group of blocks
 * joined to each other (face to face) that is no longer joined to the ground —
 * natural ground (grass, dirt, stone, sand, snow, ice, bedrock) — falls straight
 * down as one piece until it meets something. The harder it lands, the more of
 * it breaks into pieces (the rest stays where it landed: a roof lies on the floor).
 *
 * Deterministic (the same blocks, the same result on every computer and when a
 * save replays its blasts), and quick: the search goes down first, so blocks that
 * do stand on the ground are found to do so after a few steps; a very big group
 * (a whole castle) counts as standing.
 *
 * Pure data (no three.js): works on a TerrainData.
 */

import { BLOCK, MIN_LAYER, isSolid } from './Terrain.js';

export const COLLAPSE = {
    LIMIT: 12000, // blocks: a bigger group counts as standing (a castle, a mountain)
    SHELL: 1.6, // m beyond the blast radius: where hanging blocks are looked for
    BREAK_PER_M: 0.035, // share of a landed piece broken per metre fallen
    BREAK_MAX: 0.7,
};

/** Natural ground holds things up; built blocks, trees and leaves hang on it. */
const GROUND = new Set();
function isGround(t) {
    if (!GROUND.size) for (const k of ['GRASS', 'DIRT', 'STONE', 'SNOW', 'SAND', 'ICE', 'BEDROCK', 'FARMLAND', 'PATH']) if (BLOCK[k] != null) GROUND.add(BLOCK[k]);
    return GROUND.has(t);
}
const movable = (t) => isSolid(t) && t !== BLOCK.ICE_SHAPE && t !== BLOCK.BEDROCK;

const N6 = [0, 1, 0, 1, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, -1, 0, -1, 0]; // (up, +x, −x, +z, −z, down)
const key = (x, L, z) => ((x + 1048576) * 2097152 + (z + 1048576)) * 256 + (L - MIN_LAYER);
function hash01(x, L, z) {
    let h = Math.imul(x, 73856093) ^ Math.imul(L, 19349663) ^ Math.imul(z, 83492791);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * A search for hanging groups that can be fed cell by cell (visit(x, L, z)), over many calls — the cells
 * already judged are remembered. pieces: the groups found hanging so far ({cells}).
 */
export function hangingSearch(data) {
    const floor = (data.bedrockTop ?? MIN_LAYER) + 1;
    const known = new Map(); // key -> 1 standing, 2 hanging
    const pieces = [];
    const visit = (x, L, z) => {
        const t = data.get(x, L, z);
        if (!movable(t) || isGround(t)) return;
        if (known.has(key(x, L, z))) return;
        // a depth-first search, downwards first
        const seen = new Map();
        const stack = [x, L, z];
        let standing = false;
        seen.set(key(x, L, z), t);
        while (stack.length) {
            const sz = stack.pop(), sL = stack.pop(), sx = stack.pop();
            const st = known.get(key(sx, sL, sz));
            if (st === 1) { standing = true; break; }
            for (let j = 0; j < 18; j += 3) { // (the six neighbours, up first — N6: no arrays made a step)
                const nx = sx + N6[j], nL = sL + N6[j + 1], nz = sz + N6[j + 2];
                if (nL < floor) { standing = true; break; }
                const k = key(nx, nL, nz);
                if (seen.has(k)) continue;
                const nt = data.get(nx, nL, nz);
                if (!movable(nt)) { if (nt === BLOCK.BEDROCK) { standing = true; break; } continue; }
                if (isGround(nt) || known.get(k) === 1) { standing = true; break; }
                seen.set(k, nt);
                stack.push(nx, nL, nz);
            }
            if (standing || seen.size > COLLAPSE.LIMIT) { standing = true; break; }
        }
        const mark = standing ? 1 : 2;
        for (const k of seen.keys()) known.set(k, mark);
        if (!standing) {
            const cells = [];
            for (const [k, tt] of seen) {
                const L2 = (k % 256) + MIN_LAYER, rest = Math.floor(k / 256);
                const zz = (rest % 2097152) - 1048576, xx = Math.floor(rest / 2097152) - 1048576;
                cells.push([xx, L2, zz, tt]);
            }
            pieces.push({ cells });
        }
    };
    return { visit, pieces };
}

/**
 * The groups of blocks near a blast that hang in the air.
 * @returns {Array<{cells: Array<[number, number, number, number]>}>}  [x, L, z, type]
 */
export function findHanging(data, cx, cy, cz, radius, inner = 0) {
    const floor = (data.bedrockTop ?? MIN_LAYER) + 1;
    const { visit, pieces } = hangingSearch(data);
    const R = radius + COLLAPSE.SHELL;
    const x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), z0 = Math.floor(cz - R), z1 = Math.ceil(cz + R);
    const Lc = cy + 1.5;
    const L0 = Math.max(floor, Math.floor(Lc - R)), L1 = Math.ceil(Lc + R);
    // (a band of a wave — `inner`: what is inside was looked at by the bands before; only the new
    // band is searched — far fewer blocks a frame. A whole circle keeps its old order.)
    const skip = inner > 0 ? Math.max(0, inner - 2 * COLLAPSE.SHELL) : 0;
    const cols = [];
    if (skip > 0) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const h = (x - cx) ** 2 + (z - cz) ** 2; if (h <= R * R && h >= skip * skip) cols.push(x, z, h); }
    if (skip > 0) {
        // (a column of a band: from the caves under it (as deep as a ruin caves them in) up to its top block — above it all is air)
        const lo = Math.max(L0, Math.floor(Lc - 32));
        for (let i = 0; i < cols.length; i += 3) {
            const x = cols[i], z = cols[i + 1], h = cols[i + 2], hi = Math.min(L1, data.topLayer ? data.topLayer(x, z) : L1);
            for (let L = lo; L <= hi; L++) if (h + (L - 1 - cy) ** 2 <= R * R) visit(x, L, z);
        }
    } else {
        for (let L = L0; L <= L1; L++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
            const dx = x - cx, dy = L - 1 - cy, dz = z - cz;
            if (dx * dx + dy * dy + dz * dz <= R * R) visit(x, L, z);
        }
    }
    return pieces;
}

/**
 * Let a hanging piece fall (changes the data): it goes down until a block under
 * it meets something; landing breaks part of it. Returns {d, landed, broken}.
 */
export function dropPiece(data, piece) {
    const own = new Set(piece.cells.map(([x, L, z]) => key(x, L, z)));
    const floor = (data.bedrockTop ?? MIN_LAYER) + 1;
    // the lowest block of the piece in each column, and how far it may fall there
    const low = new Map();
    for (const [x, L, z] of piece.cells) { const c = x * 100003 + z; if (!low.has(c) || low.get(c)[1] > L) low.set(c, [x, L, z]); }
    let d = Infinity;
    for (const [x, L, z] of low.values()) {
        let k = 0;
        for (let l = L - 1; l >= floor - 1; l--) {
            if (l < floor) break;
            const t = data.get(x, l, z);
            if (isSolid(t) && !own.has(key(x, l, z))) break;
            k++;
        }
        d = Math.min(d, k);
    }
    if (!Number.isFinite(d)) d = 0;
    // take it away, then put it down lower (part of it breaks)
    for (const [x, L, z] of piece.cells) data.set(x, L, z, BLOCK.AIR);
    const landed = [], broken = [];
    const p = Math.min(COLLAPSE.BREAK_MAX, d * COLLAPSE.BREAK_PER_M);
    for (const c of piece.cells) {
        const [x, L, z, t] = c;
        if (d > 0 && hash01(x, L, z) < p) { broken.push(c); continue; }
        if (L - d < floor) { broken.push(c); continue; }
        const at = data.get(x, L - d, z);
        if (isSolid(at)) { broken.push(c); continue; }
        data.set(x, L - d, z, t);
        landed.push([x, L - d, z, t]);
    }
    return { d, landed, broken };
}

/** After a blast: everything left hanging falls. Returns the falls [{cells, d, landed, broken}]. */
export function collapseAfter(data, cx, cy, cz, radius, inner = 0) {
    const out = [];
    for (const piece of findHanging(data, cx, cy, cz, radius, inner)) {
        const r = dropPiece(data, piece);
        out.push({ cells: piece.cells, ...r });
    }
    return out;
}
