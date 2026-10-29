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
import { isEnchanted } from './EnchantedStone.js';
import { boxAround, settleJob } from './Structure.js';

export const COLLAPSE = {
    LIMIT: 12000, // blocks: a bigger group counts as standing (a castle, a mountain)
    SHELL: 1.6, // m beyond the blast radius: where hanging blocks are looked for
    BREAK_PER_M: 0.035, // share of a landed piece broken per metre fallen
    BREAK_MAX: 0.7,
    // a piece that comes down with its weight beyond its footing does not drop straight: it topples over the weaker side (the author: «здание падает не всегда
    // перпендикулярно — иногда валится в сторону, в зависимости от равновесия»)
    TOPPLE: true,
    TOPPLE_MIN_H: 4, // cells: the piece is at least this tall (a low slab only slides down)
    TOPPLE_OVER: 0.75, // cells: its middle (the centre of weight) is this far beyond the edge of its footing
    TOPPLE_MAX: 1500, // cells: a bigger piece is a whole castle — it comes down as it is
    TOPPLE_BREAK: 0.15, // more of it breaks: a wall smashed on its side
};

/** Natural ground holds things up; built blocks, trees and leaves hang on it. */
const GROUND = new Set();
function isGround(t) {
    if (!GROUND.size) for (const k of ['GRASS', 'DIRT', 'STONE', 'SNOW', 'SAND', 'ICE', 'BEDROCK', 'FARMLAND', 'PATH']) if (BLOCK[k] != null) GROUND.add(BLOCK[k]);
    return GROUND.has(t) || isEnchanted(t); // (the enchanted stone holds like rock — EnchantedStone.js)
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
                const sh = data.shapeAt ? data.shapeAt(xx, L2, zz) : 0; // (a slab, a ramp falls as it is — BlockShapes.js)
                cells.push(sh ? [xx, L2, zz, tt, sh] : [xx, L2, zz, tt]);
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
/**
 * Where a piece would topple, or null: its footing is the columns whose lowest block lands on something after the fall `d` (`low`: column →
 * its lowest cell); the centre of weight of ALL its blocks beyond that footing's edge (by TOPPLE_OVER cells) in x or z — it turns over that edge
 * (the larger overshoot wins). → {axis: 'x' | 'z', sg: ±1, edge, Lb (the layer of the footing after the fall), over}
 */
export function toppleOf(piece, low, d, room) {
    if (!COLLAPSE.TOPPLE || d <= 0 || piece.cells.length > COLLAPSE.TOPPLE_MAX || piece.cells.length < 6) return null;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, Lb = Infinity, mx = 0, mz = 0, top = -Infinity, bot = Infinity;
    for (const c of piece.cells) { if (c[4]) return null; mx += c[0]; mz += c[2]; if (c[1] > top) top = c[1]; if (c[1] < bot) bot = c[1]; } // (a slab, a ramp: no turning of shapes)
    if (top - bot + 1 < COLLAPSE.TOPPLE_MIN_H) return null;
    mx /= piece.cells.length; mz /= piece.cells.length;
    for (const [x, L, z] of low.values()) {
        if (room(x, L, z) !== d) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
        if (L - d < Lb) Lb = L - d;
    }
    if (!Number.isFinite(x0)) return null; // (nothing under it: it falls straight, it does not turn)
    const ox = mx < x0 - 0.5 ? x0 - 0.5 - mx : mx > x1 + 0.5 ? mx - x1 - 0.5 : 0;
    const oz = mz < z0 - 0.5 ? z0 - 0.5 - mz : mz > z1 + 0.5 ? mz - z1 - 0.5 : 0;
    const over = Math.max(ox, oz);
    if (over < COLLAPSE.TOPPLE_OVER) return null;
    if (ox >= oz) return mx > x1 + 0.5 ? { axis: 'x', sg: 1, edge: x1, Lb, over } : { axis: 'x', sg: -1, edge: x0, Lb, over };
    return mz > z1 + 0.5 ? { axis: 'z', sg: 1, edge: z1, Lb, over } : { axis: 'z', sg: -1, edge: z0, Lb, over };
}

/** A cell of the piece turned 90° over its footing's edge (see toppleOf): [x, L, z] after the fall d, in the turned position. */
export function turned(c, d, T) {
    const h = c[1] - d - T.Lb; // (height over the footing's layer)
    if (T.axis === 'x') {
        const u = c[0] - T.edge; // (offset from the edge column; the edge is the column of the footing's outermost blocks)
        return T.sg > 0 ? [T.edge + 1 + h, T.Lb + (-u), c[2]] : [T.edge - 1 - h, T.Lb + u, c[2]];
    }
    const u = c[2] - T.edge;
    return T.sg > 0 ? [c[0], T.Lb + (-u), T.edge + 1 + h] : [c[0], T.Lb + u, T.edge - 1 - h];
}

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
    // how far each column's lowest block could fall (the footing: where it is exactly d)
    const room = (x, L, z) => {
        let k = 0;
        for (let l = L - 1; l >= floor; l--) { const t = data.get(x, l, z); if (isSolid(t) && !own.has(key(x, l, z))) break; k++; }
        return k;
    };
    const T = toppleOf(piece, low, d, room);
    if (T) {
        const r = topple(data, piece, d, T, own, floor);
        if (r) return r;
    }
    // take it away, then put it down lower (part of it breaks)
    for (const [x, L, z] of piece.cells) data.set(x, L, z, BLOCK.AIR);
    const landed = [], broken = [];
    const p = Math.min(COLLAPSE.BREAK_MAX, d * COLLAPSE.BREAK_PER_M);
    for (const c of piece.cells) {
        const [x, L, z, t, sh = 0] = c;
        if (d > 0 && hash01(x, L, z) < p) { broken.push(c); continue; }
        if (L - d < floor) { broken.push(c); continue; }
        const at = data.get(x, L - d, z);
        if (isSolid(at)) { broken.push(c); continue; }
        data.set(x, L - d, z, t, sh);
        landed.push(sh ? [x, L - d, z, t, sh] : [x, L - d, z, t]);
    }
    return { d, landed, broken };
}

/**
 * The piece turns over the edge of its footing (T from toppleOf) and lies down: every block is moved to where the turn puts it, then the
 * whole lies down till it rests. Blocks that would be inside something solid break (a wall falling on a wall). → the fall, with `tilt`
 * (for the picture: FallingBlocks turns the piece about the edge), or null (it cannot turn — it drops straight as before).
 */
function topple(data, piece, d, T, own, floor) {
    const turnedCells = piece.cells.map((c) => ({ c, p: turned(c, d, T) }));
    const free = (x, L, z) => { const t = data.get(x, L, z); return !isSolid(t) || own.has(key(x, L, z)); };
    // a turned block that lands in the ground beside the building (a hill): it breaks. The rest lies down on what is under it.
    const ok = turnedCells.filter((t) => t.p[1] >= floor && free(t.p[0], t.p[1], t.p[2]));
    if (!ok.length) return null;
    const okSet = new Set(ok);
    const lows = new Map();
    for (const t of ok) { const k = t.p[0] * 100003 + t.p[2]; if (!lows.has(k) || lows.get(k)[1] > t.p[1]) lows.set(k, t.p); }
    const ownTurned = new Set(ok.map((t) => key(t.p[0], t.p[1], t.p[2])));
    let d2 = Infinity;
    for (const [x, L, z] of lows.values()) {
        let k = 0;
        for (let l = L - 1; l >= floor; l--) { const tt = data.get(x, l, z); if (isSolid(tt) && !own.has(key(x, l, z)) && !ownTurned.has(key(x, l, z))) break; k++; }
        d2 = Math.min(d2, k);
    }
    if (!Number.isFinite(d2)) d2 = 0;
    for (const [x, L, z] of piece.cells) data.set(x, L, z, BLOCK.AIR);
    const landed = [], broken = [];
    const p = Math.min(COLLAPSE.BREAK_MAX, (d + d2) * COLLAPSE.BREAK_PER_M + COLLAPSE.TOPPLE_BREAK);
    for (const t of turnedCells) {
        const [x, L, z, ty] = t.c;
        const [nx, nL, nz] = t.p;
        if (hash01(x, L, z) < p || nL - d2 < floor || !okSet.has(t)) { broken.push(t.c); continue; }
        const at = data.get(nx, nL - d2, nz);
        if (isSolid(at)) { broken.push(t.c); continue; }
        data.set(nx, nL - d2, nz, ty);
        landed.push([nx, nL - d2, nz, ty]);
    }
    return { d, landed, broken, tilt: { axis: T.axis, sg: T.sg, edge: T.edge, Lb: T.Lb, d2 } };
}

/**
 * After a blast: everything left hanging falls (now: the falls are returned), and then the building round it is
 * looked at (Structure.js: a floor on one thin column, a balcony whose wall is gone…) — by data.settling, a little
 * each frame, its falls given to `done` (or data.settling.onFalls) when the check is over; without data.settling
 * at once, its falls returned with the rest.
 * gone: the blocks the change took away — [x, L, z, type] (or removeSphere's {x, y, z, type}; false — no check of
 * the building); keep(x, y, z): blocks
 * that hold whatever happens (a house's sphere of protection — HouseWards.js).
 * A fall: {cells, d, landed, broken, stage} (stage: the round of the chain, 0 the first; `crushed` — blocks broken
 * under their load where they stood, d = 0). ordered: a change every computer and a loaded save make the same way
 * (a blast — not a fire's): its check is done before the next such change (Settling.flush).
 */
export function collapseAfter(data, cx, cy, cz, radius, inner = 0, gone = null, keep = null, done = null, ordered = !done) {
    const out = [];
    for (const piece of findHanging(data, cx, cy, cz, radius, inner)) {
        const r = dropPiece(data, piece);
        out.push({ cells: piece.cells, ...r, stage: 0 });
    }
    if (gone === false) return out; // (no check of the building now: a band of a wave — the last one does it)
    const S = data.settling;
    if (S) S.add(settleAround(data, cx, cy, cz, radius, gone, keep), done, ordered);
    else { const job = settleAround(data, cx, cy, cz, radius, gone, keep); job.step(Infinity); out.push(...job.falls); }
    return out;
}

/** A check of the building round a change (Structure.settleJob); its falls (as collapseAfter's) gather in job.falls. */
export function settleAround(data, cx, cy, cz, radius, gone = null, keep = null) {
    const list = gone && gone.length && !Array.isArray(gone[0]) ? gone.map((b) => [b.x, Math.round(b.y + 1), b.z, b.type]) : gone;
    const falls = [];
    const job = settleJob(data, boxAround(data, cx, cy, cz, radius),
        (piece, stage) => { falls.push({ cells: piece.cells, ...dropPiece(data, piece), stage }); },
        (cells, stage) => {
            for (const [x, L, z] of cells) data.set(x, L, z, BLOCK.AIR);
            falls.push({ cells, d: 0, landed: [], broken: cells, stage, crushed: true });
        }, list || null, keep);
    job.falls = falls;
    return job;
}

/**
 * The checks of the buildings after the changes (Structure.settleJob), one at a time, in the order of the changes, a
 * little each frame (step(ms)). A change the other computers and a loaded save make too (a blast, a ruin, a crater)
 * first lets the checks before it finish (flush) — so the same blocks give the same falls everywhere. now: every
 * check at once (a save being loaded, a late joiner's world); quiet: their falls not shown (onFalls not called).
 */
export class Settling {
    constructor() { this.jobs = []; this.now = false; this.quiet = false; this.onFalls = null; }
    get busy() { return this.jobs.length > 0; }
    add(job, done = null, ordered = true) { job.done$ = done; job.ordered = ordered; this.jobs.push(job); if (this.now) this.flush(true); }
    _finish(job) {
        if (this.quiet || !job.falls.length) return;
        (job.done$ || this.onFalls)?.(job.falls, job);
    }
    /** Work on the checks for at most `ms`. */
    step(ms) {
        const t0 = performance.now();
        while (this.jobs.length) {
            const left = ms - (performance.now() - t0);
            if (left <= 0) return;
            const job = this.jobs[0];
            if (!job.step(left)) return;
            this.jobs.shift();
            this._finish(job);
        }
    }
    /**
     * The checks of the changes made the same everywhere, now (before the next such change: the same order on every
     * computer); the others (a fire's, an edit's — their results go out as they are) wait their turn (all: these too).
     */
    flush(all = false) {
        const later = [];
        while (this.jobs.length) {
            const job = this.jobs.shift();
            if (!all && !job.ordered) { later.push(job); continue; }
            job.step(Infinity);
            this._finish(job);
        }
        this.jobs.push(...later);
    }
    /** Run fn with every check at once and unseen (a save, a welcome message replaying the world's changes). */
    replay(fn) {
        const was = [this.now, this.quiet];
        this.flush(true);
        this.now = true; this.quiet = true;
        try { return fn(); } finally { [this.now, this.quiet] = was; }
    }
    clear() { this.jobs.length = 0; }
}
