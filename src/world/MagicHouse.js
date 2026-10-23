/**
 * MagicHouse.js — the plan of a house made by magic («Create a House», «Improve a House»).
 *
 * Pure data, deterministic from (seed, level, place, the wood of the trees used): every computer
 * builds the same house, and the house of a level is found again from its record alone (it is
 * never kept block by block — the blocks themselves travel as ordinary block edits).
 *
 * Every house is a little different (procedural): its size, which side the side rooms are on,
 * where the door, the windows and the inside doorways are, the roof (a gable or a hipped one, of
 * thatch, of dark planks or of tiles), a chimney, flower boxes — and the wood: the walls are the
 * logs of the trees the magic took (birch — a light house, spruce or dark oak — a dark one…).
 *
 *   level 1  a small log house: a door, a room with a bed, a separate store room with one chest,
 *            glass in the windows, a roof.
 *   level 2  bigger: a hall with a table, a bedroom with two beds, the store room.
 *   level 3  a second floor (stairs in the hall), a balcony over the door, a bed and a chest upstairs.
 *   level 4  the ground floor of stone, a kitchen with a hearth and a chimney, four beds.
 *   level 5  a big stone house (the stone comes up from under the ground — no resource is needed for
 *            it): stone walls, a slate roof, five beds, three chests, a carpet, the balcony.
 *
 * Local coordinates (as the village houses of Castles.js): a to the right, b to the back (the door
 * is in the front wall, b = −d), l = layers above the ground (l = −1 is the floor laid in the ground
 * itself). The hero is ~4.8 m tall: doors are 3 wide and 5 high, a storey is 7 layers.
 */

import { BLOCK, TREE_KINDS } from './Terrain.js';
import { createRng } from '../core/math.js';
import { inwardRy } from './Castles.js';
import { cellShapes } from './PlanSlopes.js';

/** What each level takes (resources lying by the house, trees round it, mana) — «each next one twice as much». */
export const HOUSE_LEVELS = [
    null,
    { wool: 3, sand: 10, trees: 3, mana: 20, drain: 0.5 },
    { wool: 6, sand: 20, trees: 4, mana: 40, drain: 1 },
    { wool: 12, sand: 40, trees: 6, mana: 80, drain: 2 },
    { wool: 24, sand: 80, trees: 8, mana: 160, drain: 4 },
    { wool: 48, sand: 160, trees: 10, mana: 320, drain: 8 },
];
export const MAX_LEVEL = 5;
/** The magic lasts this long (s). */
export const MAGIC_TIME = 10;
/** Trees this near the house's middle are taken (m). */
export const TREE_RADIUS = 26;
/** The biggest house (level 5) reaches this far from its middle (m): another house must stand twice as far. */
export const HOUSE_REACH = 22;

/** The plan's grid (cells round the middle — housePlan): reused, a stamp per plan says which are written. */
const GR = 48, GW = 2 * GR + 1, GL0 = -10, GLN = 96, GN = GW * GW * GLN;
let _stamp = null, _val = null, _gen = 0;

const STOREY = 7; // layers of a ground storey (walls 0..6; the upper floor's slab at 7)
const UPPER = 6; // layers of walls of the upper storey
const BED_W = 2.5, BED_L = 5.5; // (Beds.js)
const CHEST_SCALE = 2, CHEST_W = 1.25 * CHEST_SCALE, CHEST_D = 0.85 * CHEST_SCALE, CHEST_GAP = 0.15;

/** Lot-local (a, b) turned so that −b (the door side) points to `face` (as Castles.rotLot). */
export function rotLot(a, b, face) {
    if (face === 0) return [a, b];
    if (face === 1) return [-b, a];
    if (face === 2) return [-a, -b];
    return [b, -a];
}

/** The face whose front (−b) looks along (dx, dz) — towards the one who made the house. */
export function faceTowards(dx, dz) {
    if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
    return dz < 0 ? 0 : 2;
}

/** The rooms of each level, from left to right (ground floor / upper floor). */
function roomsOf(level, rng) {
    const r = () => (rng() < 0.5 ? 0 : 1);
    if (level <= 1) return { ground: [{ role: 'main', w: 6 + r(), beds: 1, door: true }, { role: 'store', w: 4, chests: [0] }], upper: null };
    if (level === 2) return { ground: [{ role: 'hall', w: 5 + r(), door: true, table: true }, { role: 'bed', w: 6, beds: 2 }, { role: 'store', w: 4 + r(), chests: [0] }], upper: null };
    if (level === 3) return {
        ground: [{ role: 'hall', w: 7, door: true, stairs: true }, { role: 'bed', w: 6, beds: 2 }, { role: 'store', w: 4 + r(), chests: [0] }],
        upper: [{ role: 'lounge', fill: true, balcony: true, table: true }, { role: 'bed', w: 4 + r(), beds: 1, chests: [1] }],
    };
    if (level === 4) return {
        ground: [{ role: 'hall', w: 7 + r(), door: true, stairs: true }, { role: 'kitchen', w: 5 + r(), hearth: true, table: true }, { role: 'bed', w: 6, beds: 2 }, { role: 'store', w: 4, chests: [0] }],
        upper: [{ role: 'lounge', fill: true, balcony: true }, { role: 'bed', w: 6, beds: 2 }, { role: 'store', w: 4, chests: [1] }],
    };
    return {
        ground: [{ role: 'hall', w: 7 + r(), door: true, stairs: true, carpet: true }, { role: 'kitchen', w: 6, hearth: true, table: true }, { role: 'bed', w: 6, beds: 2 }, { role: 'store', w: 5 + r(), chests: [0, 2] }],
        upper: [{ role: 'lounge', fill: true, balcony: true, table: true, carpet: true }, { role: 'bed', w: 6, beds: 2 }, { role: 'bed', w: 4, beds: 1 }, { role: 'store', w: 4, chests: [1] }],
    };
}

/** The depth (half, b) of each level's house: never less than the level before had. */
function depthOf(level, rng) {
    const base = [0, 5, 6, 6, 7, 8][Math.min(MAX_LEVEL, level)];
    return base + (rng() < 0.5 ? 0 : 1);
}

/**
 * The plan of a house.
 * @param {{seed:number, level:number, x:number, z:number, G:number, face:number, woods?:number[], minD?:number}} o
 *   x, z: its middle (whole blocks); G: the ground layer (its floor is laid in it); face: the door side;
 *   woods: the wood blocks of the trees the magic took (the most first); minD: the depth of the house it grows from.
 * @returns {{cells:number[][], fill:number[][], door, windows, beds, chests, rect, w, d, top, own:Set<string>}}
 *   cells [x, L, z, block, shape?] (AIR carves; shape — a ramp of the roof, BlockShapes.js); fill — foundation stone, laid only where nothing solid is.
 */
export function housePlan({ seed, level, x, z, G, face = 0, woods = [], minD = 0 }) {
    level = Math.max(1, Math.min(MAX_LEVEL, level | 0));
    const rng = createRng((seed >>> 0) + level * 7919);
    const mirror = createRng(seed >>> 0)() < 0.5 ? -1 : 1; // (the same side for every level of one house)
    const { ground, upper } = roomsOf(level, rng);
    // the rooms side by side: the inside is 2w − 1 wide — make the sum fit (the hall takes the odd block)
    let inner = ground.reduce((s, r) => s + r.w, 0) + ground.length - 1;
    if (inner % 2 === 0) { ground[0].w++; inner++; }
    const w = (inner + 1) / 2;
    const d = Math.max(minD, depthOf(level, rng));
    const two = !!upper;
    const h = STOREY;
    const T = two ? h + UPPER : h - 1; // the top layer of the walls
    // ---- materials: the logs of the trees taken; stone for the big houses
    const log = woods[0] ?? BLOCK.WOOD;
    const trim = woods.find((t) => t !== log) ?? (log === BLOCK.DARK || log === BLOCK.SPRUCE ? BLOCK.PLANKS : BLOCK.PLANKS_DARK);
    const leavesOf = TREE_KINDS.find((k) => k.wood === log)?.leaves;
    const pick = (list) => list[Math.floor(rng() * list.length)];
    const stone = level >= 5 ? pick([BLOCK.CS_GREY, BLOCK.CS_SAND, BLOCK.BRICK, BLOCK.CS_WHITE]) : pick([BLOCK.COBBLE, BLOCK.STONE]);
    const wallLow = level >= 4 ? stone : log; // the ground storey
    const wallHigh = level >= 5 ? stone : log; // the upper storey
    const corner = level >= 5 ? BLOCK.CS_DARK : level >= 4 ? BLOCK.COBBLE : trim;
    const floor = level >= 5 ? BLOCK.PLANKS_DARK : BLOCK.PLANKS;
    const roof = level >= 5 ? pick([BLOCK.ROOF_SLATE, BLOCK.ROOF_BLUE]) : level >= 4 ? pick([BLOCK.ROOF_RED, BLOCK.ROOF_SLATE, BLOCK.PLANKS_DARK])
        : pick(leavesOf != null ? [BLOCK.THATCH, BLOCK.THATCH, BLOCK.PLANKS_DARK, trim] : [BLOCK.PLANKS_DARK, trim]);
    const hip = rng() < 0.3;
    // ---- writing
    // (a cell is a place in a grid round the middle — not a "x,L,z" string, nor a Map: a big house writes
    // ~40 000 cells, and its plan took tens of milliseconds of a frame. The first write of a cell gives its
    // order, the last its block — as a Map would; a cell outside the grid goes in a Map, `extra`.)
    if (!_stamp) { _stamp = new Int32Array(GN); _val = new Uint16Array(GN); }
    if (++_gen > 2e9) { _stamp.fill(0); _gen = 1; }
    const gen = _gen, written = [], extra = new Map(), extraKeys = [];
    const fill = [];
    const W = (a, b) => { const [rx, rz] = rotLot(mirror * a, b, face); return [x + rx, z + rz]; };
    const Lw = (l) => G + 1 + l;
    const [ra, rb] = rotLot(mirror, 0, face), [sa, sb] = rotLot(0, 1, face); // (rotLot without an array a cell)
    const put = (a, b, l, t) => {
        const rx = ra * a + sa * b, rz = rb * a + sb * b;
        if (rx >= -GR && rx <= GR && rz >= -GR && rz <= GR && l >= GL0 && l < GL0 + GLN) {
            const i = ((l - GL0) * GW + rz + GR) * GW + rx + GR;
            if (_stamp[i] !== gen) { _stamp[i] = gen; written.push(i); }
            _val[i] = t;
        } else {
            const k = ((rx + 512) * 1024 + l + 512) * 1024 + rz + 512;
            if (!extra.has(k)) { written.push(-1 - extraKeys.length); extraKeys.push(k); }
            extra.set(k, t);
        }
    };
    const box = (a0, a1, l0, l1, b0, b1, t) => {
        for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++) for (let b = Math.min(b0, b1); b <= Math.max(b0, b1); b++) {
            for (let l = Math.min(l0, l1); l <= Math.max(l0, l1); l++) put(a, b, l, t);
        }
    };
    const pt = (a, b, l = 0) => { const [rx, rz] = rotLot(mirror * a, b, face); return { x: x + rx, z: z + rz, y: Lw(l) - 1.5 }; };
    const yaw = (a, b) => { const o = pt(0, 0), q = pt(a, b); return Math.atan2(-(q.x - o.x), -(q.z - o.z)); };
    const along = (a, b) => { const o = pt(0, 0), q = pt(a, b); return Math.atan2(-(q.z - o.z), q.x - o.x); };
    const out = { door: null, windows: [], beds: [], chests: [], w, d, level, two, top: 0 };
    const window = (a0, a1, b0, b1, l0, l1) => {
        box(a0, a1, l0, l1, b0, b1, BLOCK.AIR);
        const q0 = pt(a0, b0), q1 = pt(a1, b1);
        const alongA = b0 === b1;
        out.windows.push({ x: (q0.x + q1.x) / 2, z: (q0.z + q1.z) / 2, y: (Lw(l0) + Lw(l1)) / 2 - 1, ry: alongA ? along(1, 0) : along(0, 1), w: (alongA ? Math.abs(a1 - a0) : Math.abs(b1 - b0)) + 1, h: l1 - l0 + 1 });
    };
    // ---- the ground under it: clear the place (bumps, bushes), lay the foundation and the floor
    const bal = two ? 3 : 0; // the balcony sticks out at the front
    for (let a = -w - 1; a <= w + 1; a++) for (let b = -d - 1 - bal; b <= d + 1; b++) {
        for (let l = 0; l <= T + d + 4; l++) put(a, b, l, BLOCK.AIR);
        if (a >= -w && a <= w && b >= -d && b <= d) for (let l = -5; l <= -2; l++) { const [wx, wz] = W(a, b); fill.push([wx, Lw(l), wz, BLOCK.STONE]); }
    }
    box(-w, w, -1, -1, -d, d, floor);
    // ---- the shell: walls, a stone course at the bottom, corner posts
    box(-w, w, 0, h - 1, -d, -d, wallLow); box(-w, w, 0, h - 1, d, d, wallLow);
    box(-w, -w, 0, h - 1, -d, d, wallLow); box(w, w, 0, h - 1, -d, d, wallLow);
    if (level < 4) { box(-w, w, 0, 0, -d, -d, BLOCK.COBBLE); box(-w, w, 0, 0, d, d, BLOCK.COBBLE); box(-w, -w, 0, 0, -d, d, BLOCK.COBBLE); box(w, w, 0, 0, -d, d, BLOCK.COBBLE); }
    if (two) {
        box(-w, w, h, h, -d, d, floor); // the upper floor (and the wall's band)
        box(-w, w, h, h, -d, -d, trim); box(-w, w, h, h, d, d, trim); box(-w, -w, h, h, -d, d, trim); box(w, w, h, h, -d, d, trim);
        box(-w, w, h + 1, T, -d, -d, wallHigh); box(-w, w, h + 1, T, d, d, wallHigh);
        box(-w, -w, h + 1, T, -d, d, wallHigh); box(w, w, h + 1, T, -d, d, wallHigh);
    }
    for (const [a, b] of [[-w, -d], [w, -d], [-w, d], [w, d]]) box(a, a, 0, T, b, b, corner);
    // ---- the rooms of a storey: partitions with doorways, windows, the things in them
    const storey = (rooms, l0, top) => {
        let a = -w + 1;
        const total = 2 * w - 1;
        const fixed = rooms.reduce((s, r) => s + (r.fill ? 0 : r.w), 0) + rooms.length - 1;
        const spans = [];
        rooms.forEach((r, i) => {
            const rw = r.fill ? total - fixed : r.w;
            spans.push({ r, a0: a, a1: a + rw - 1 });
            a += rw;
            if (i < rooms.length - 1) {
                // the partition, a doorway in its front part (3 wide, 5 high)
                box(a, a, l0, top, -d + 1, d - 1, l0 === 0 ? wallLow : wallHigh);
                const ob = -d + 2 + Math.floor(rng() * 2);
                box(a, a, l0, l0 + 4, ob, ob + 2, BLOCK.AIR);
                a += 1;
            }
        });
        for (const s of spans) furnish(s, l0, top);
        return spans;
    };
    const furnish = ({ r, a0, a1 }, l0, top) => {
        const mid = Math.round((a0 + a1) / 2);
        const e0 = a0 - 0.5, e1 = a1 + 0.5;
        // the door (the hall / the main room)
        if (r.door) {
            const da = r.stairs ? a0 + 5 : Math.max(a0 + 1, Math.min(a1 - 1, mid + (rng() < 0.5 ? 0 : (r.beds ? 1 : -1))));
            box(da - 1, da + 1, l0, l0 + 4, -d, -d, BLOCK.AIR);
            box(da - 2, da + 2, l0 + 5, l0 + 5, -d, -d, trim); // the lintel
            box(da - 1, da + 1, -1, -1, -d - 2, -d - 1, BLOCK.PATH); // the doorstep
            const dp = pt(da, -d, l0);
            const fr = rotLot(1, 0, face); // (the leaf turned as a village door, whichever side the rooms are on)
            const di = pt(da, -d + 1, l0); // (a step into the hall: the leaf opens into the house)
            out.door = { x: dp.x, y: dp.y, z: dp.z, ry: inwardRy(Math.atan2(-fr[1], fr[0]), di.x - dp.x, di.z - dp.z), w: 3, h: 5 };
            r._door = da;
            if (level >= 2 && rng() < 0.6) for (const fa of [da - 3, da + 3]) if (fa > a0 - 1 && fa < a1 + 1) box(fa, fa, 1, 1, -d - 1, -d - 1, BLOCK.FLOWERS);
        }
        // windows: the front (beside the door), the back, the outer side walls
        const wl0 = l0 + 2, wl1 = l0 + 3;
        const ww = a1 - a0 >= 4 && rng() < 0.5 ? 2 : 1;
        const fronts = [];
        if (r._door != null) { if (r._door - 3 - ww >= a0) fronts.push(r._door - 3 - ww + 1); if (r._door + 3 + ww - 1 <= a1) fronts.push(r._door + 3); }
        else if (!r.balcony) fronts.push(mid - (ww > 1 ? 1 : 0));
        for (const fa of fronts) window(fa, fa + ww - 1, -d, -d, wl0, wl1);
        if (!r.hearth && (rng() < 0.6 || r.role === 'bed')) window(mid - (ww > 1 ? 1 : 0), mid - (ww > 1 ? 1 : 0) + ww - 1, d, d, wl0, wl1);
        if (a0 === -w + 1 && !r.stairs) window(-w, -w, -1, 0, wl0, wl1);
        if (a1 === w - 1) window(w, w, -1 + (rng() < 0.5 ? 0 : -1), 0, wl0, wl1);
        // a lantern under the ceiling
        put(mid, 0, top, BLOCK.LANTERN);
        // beds against the back wall, pillow to the wall
        const nb = r.beds || 0;
        for (let k = 0; k < nb; k++) {
            const ca = r.role === 'main' ? e0 + 1.6 : e0 + (k + 0.5) * ((e1 - e0) / nb);
            const q = pt(ca, d - 0.5 - 2.85, l0);
            out.beds.push({ ...q, yaw: yaw(0, 1) });
        }
        // chests: the back wall (or, the back taken by a bed, the outer side wall), the next one beside it
        (r.chests || []).forEach((k, i) => {
            let ca, cb, fa, fb;
            if (i === 0 && !nb) { ca = (e0 + e1) / 2; cb = d - 0.5 - CHEST_GAP - CHEST_D / 2; fa = 0; fb = -1; }
            else { const right = a1 === w - 1 || a0 !== -w + 1; ca = right ? e1 - CHEST_GAP - CHEST_D / 2 : e0 + CHEST_GAP + CHEST_D / 2; cb = nb ? -d + 0.5 + 3.6 + CHEST_W / 2 : d - 0.5 - CHEST_D - CHEST_GAP - 1.2 - CHEST_W / 2; fa = right ? -1 : 1; fb = 0; }
            out.chests.push({ k, ...pt(ca, cb, l0), yaw: yaw(fa, fb), gap: CHEST_GAP, scale: CHEST_SCALE });
        });
        // a hearth at the back wall with its chimney above the roof; a table
        if (r.hearth) {
            box(mid - 1, mid + 1, l0, l0 + 3, d - 1, d - 1, BLOCK.COBBLE);
            put(mid, d - 1, l0, BLOCK.LANTERN);
            chimneys.push(mid);
        }
        const byWell = r.stairs || (two && r.balcony); // (the stairwell is in this room)
        if (r.table) { const ta = byWell ? a1 - 1 : mid; box(ta - 1, ta, l0, l0 + 1, 0, 1, BLOCK.PLANKS); box(ta - 2, ta - 2, l0, l0, 0, 1, trim); }
        if (r.carpet) box(a0 + (byWell ? 4 : 1), a1 - 1, l0 - 1, l0 - 1, -d + 2, d - 2, level >= 5 ? BLOCK.CARPET_RED : BLOCK.CARPET_GREEN);
        // the stairs up (along the outer side wall, from the front towards the back)
        if (r.stairs && two) {
            const b0 = d - 1 - h;
            for (let i = 0; i < h; i++) box(a0, a0 + 2, 0, i, b0 + i, b0 + i, trim);
            box(a0, a0 + 2, h, h, b0, d - 2, BLOCK.AIR); // the stairwell
        }
    };
    const chimneys = [];
    const low = storey(ground, 0, h - 1);
    let high = null;
    if (two) {
        high = storey(upper, h + 1, T);
        // the railing round the stairwell
        const s0 = low[0].a0, b0 = d - 1 - h;
        box(s0 + 3, s0 + 3, h + 1, h + 1, b0, d - 3, BLOCK.FENCE);
        box(s0, s0 + 2, h + 1, h + 1, b0 - 1, b0 - 1, BLOCK.FENCE);
        // the balcony over the door: a floor on two posts, a railing, a doorway out to it
        const lg = high[0];
        const e = lg.a1 + 1;
        box(-w, e, h, h, -d - 3, -d - 1, trim);
        box(-w, -w, 0, h - 1, -d - 3, -d - 3, corner); box(e, e, 0, h - 1, -d - 3, -d - 3, corner);
        box(-w, e, h + 1, h + 1, -d - 3, -d - 3, BLOCK.FENCE);
        box(-w, -w, h + 1, h + 1, -d - 2, -d - 1, BLOCK.FENCE); box(e, e, h + 1, h + 1, -d - 2, -d - 1, BLOCK.FENCE);
        const bm = Math.min(lg.a1 - 1, Math.max(lg.a0 + 4, Math.round((lg.a0 + lg.a1) / 2)));
        box(bm - 1, bm + 1, h + 1, h + 5, -d, -d, BLOCK.AIR);
    }
    // ---- the roof: a gable along a (gable walls at the sides) or a hipped one
    const R = T + 1;
    for (let k = 0; k <= d + 1; k++) {
        const a0 = hip ? -w - 1 + k : -w - 1, a1 = hip ? w + 1 - k : w + 1;
        if (a0 > a1) break;
        box(a0, a1, R + k, R + k, -d - 1 + k, d + 1 - k, roof);
        if (k <= d) box(Math.max(-w + 1, a0 + 1), Math.min(w - 1, a1 - 1), R + k, R + k, -d + k, d - k, BLOCK.AIR);
        if (!hip && k >= 1 && k <= d) { box(-w, -w, R + k, R + k, -d + k, d - k, wallHigh); box(w, w, R + k, R + k, -d + k, d - k, wallHigh); }
        out.top = Lw(R + k);
    }
    for (const a of chimneys) box(a, a, 0, T + d + 4, d + 1, d + 1, BLOCK.COBBLE); // (after the roof: it goes through the eaves)
    // ---- the result
    const raw = [];
    const own = new Set();
    // (the magic builds it from the ground up: the lowest layers first, then outwards from the middle —
    // sorted as numbers: the layer, the distance from the middle, then the order written)
    const order = new Float64Array(written.length);
    for (const i of written) {
        let rx, l, rz, t;
        if (i >= 0) { rx = (i % GW) - GR; rz = (Math.floor(i / GW) % GW) - GR; l = Math.floor(i / (GW * GW)) + GL0; t = _val[i]; } else {
            const k = extraKeys[-1 - i];
            rx = Math.floor(k / 1048576) - 512; l = (Math.floor(k / 1024) % 1024) - 512; rz = (k % 1024) - 512; t = extra.get(k);
        }
        const cx = x + rx, cL = G + 1 + l, cz = z + rz;
        order[raw.length] = ((l + 512) * 4096 + Math.abs(rx) + Math.abs(rz)) * 65536 + raw.length;
        raw.push([cx, cL, cz, t]);
        if (t !== BLOCK.AIR) own.add(cx + ',' + cL + ',' + cz);
    }
    order.sort();
    const cells = new Array(raw.length);
    for (let i = 0; i < order.length; i++) cells[i] = raw[order[i] % 65536];
    cellShapes(cells, [roof]); // (the roof's slopes of ramps, its hips — BlockShapes.js: a fifth number on those cells)
    const c0 = pt(-w - 1, -d - 1 - bal), c1 = pt(w + 1, d + 1);
    out.rect = { x0: Math.min(c0.x, c1.x), x1: Math.max(c0.x, c1.x), z0: Math.min(c0.z, c1.z), z1: Math.max(c0.z, c1.z) };
    out.floorY = Lw(0) - 1.5;
    return { ...out, cells, fill, own };
}
