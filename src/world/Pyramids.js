/**
 * Pyramids.js — the three pyramids of Pharaoh Sandy (Фараон Песчаный), ONE desert of them in the whole world (generation PYRAMIDS_FROM_GEN = 27;
 * the author 06.11: «Большая, огромная пирамида — реально огромная. Рядом ещё две: средняя и маленькая, как в Египте — три пирамиды»).
 *
 *  - Exactly one place per world, from the seed alone (the same on every computer, in the worker and on the host): a flat-ish dry land
 *    PYR.MIN…PYR.MAX m from the spawn, away from every site. THE DESERT: the land under and round them is levelled (the plate) and turned to
 *    sand with low dunes at its edges; no trees, no grass.
 *  - THE GREAT PYRAMID (base 160 m, 96 m high; the world's ceiling is 120): the pharaoh's. Six rooms in a chain, each of its own look
 *    (painted walls of coloured blocks — the eye of Horus, the ankh, the scarab, the sun, the lotus —, columns, a floor medallion, gold):
 *      1 The Guards' Hall (sleeping mummies in plain sarcophagi) → 2 The Hall of Columns → (east) 3 The Scarab Hall (the jewels) and
 *      (west) 4 The Hall of Sand (a trap: a patch of sand in the stone floor gives way) → 5 The Hall of Stars (the treasury) →
 *      6 The Burial Chamber (the golden sarcophagus on its dais, three chests, a corbelled vault). The torches are put out: «Fire» lights one.
 *  - THE MIDDLE PYRAMID (base 100 m, 60 m high): a maze of 4 m passages — dead ends with chests, skeleton-mummies at the junctions, zombies.
 *  - THE SMALL PYRAMID (base 56 m, 34 m high): one corridor, a room with a chest, and the simplest trap: a tile of another colour in the floor
 *    (a pressure plate) — a volley of darts from the walls.
 *  - The blocks of all three are PYR_* (Terrain.BLOCK 86…94): a blast breaks them only in the heart of it (PYR.BLAST: a quarter of the volume — «в 4 раза
 *    прочнее»); they hold fast (Structure.holdsFast). Painted blocks and torches are ordinary blocks.
 *
 * Pure and deterministic (no THREE: it runs in the terrain workers too). Its parts are the castles' kind (boxes: k 0).
 * Local axes (as VampireCastle): u across, v toward the entrances (+v); everything faces the spawn.
 */

import { createRng, createNoise2D } from '../core/math.js';

export const PYR = {
    MIN: 700, MAX: 1500, // m from the spawn
    BIG: { u: 0, v: 0, half: 80, h: 96 }, // base 160 × 160, 96 m high (the apex under the world's ceiling at F ≤ 22)
    MID: { u: -160, v: 60, half: 50, h: 60 }, // base 100 × 100
    SMALL: { u: -260, v: 120, half: 28, h: 34 }, // base 56 × 56
    PLATE: { u0: -330, u1: 125, v0: -100, v1: 205, FADE: 56 }, // the levelled desert (local m) and the fade to the land round it
    FLOOR_MAX: 22, FLOOR_MIN: 3,
    BLAST: 0.63, // a blast breaks their blocks only within this share of its radius (0.63³ ≈ ¼ of the volume: four times as hard)
    DESERT_R: 600, // m round the plate where Terrain keeps trees off
    DOOR: { W: 5, H: 7 }, // the passages: 5 wide, 7 high (the hero is 3.5 m: a 3×6 door at least)
};

/** The blocks (Terrain.BLOCK numbers — a unit test keeps them equal). */
export const PB = {
    AIR: 0, SAND: 9, GOLD: 34, CARPET_RED: 33, CARPET_BLUE: 38,
    STONE: 86, BRICK: 87, BLUE: 88, RED: 89, TURQ: 90, BLACK: 91, TORCH_OFF: 92, TORCH_ON: 93, PLATE: 94,
};
/** The pyramid's blocks (a blast's hardness, the repair…): a range check. */
export const isPyramidBlock = (t) => t >= PB.STONE && t <= PB.PLATE && t !== PB.TORCH_OFF && t !== PB.TORCH_ON;

const TAU = Math.PI * 2;

/** World offset → local {u, v}; local → world. */
export function pyrUV(S, dx, dz) {
    switch (S.rot) {
        case 1: return { u: -dz, v: dx };
        case 2: return { u: -dx, v: -dz };
        case 3: return { u: dz, v: -dx };
        default: return { u: dx, v: dz };
    }
}
export function pyrLocal(S, u, v) {
    switch (S.rot) {
        case 1: return { x: S.x + v, z: S.z - u };
        case 2: return { x: S.x - u, z: S.z - v };
        case 3: return { x: S.x - v, z: S.z + u };
        default: return { x: S.x + u, z: S.z + v };
    }
}
/** The world yaw (THREE rotation.y) of something facing +v (the entrances). */
export const pyrYaw = (S) => [0, Math.PI / 2, Math.PI, -Math.PI / 2][S.rot];

/** The local corners of the plate → world bounding box. */
function plateBox(S) {
    const P = PYR.PLATE, xs = [], zs = [];
    for (const [u, v] of [[P.u0, P.v0], [P.u1, P.v0], [P.u0, P.v1], [P.u1, P.v1]]) { const q = pyrLocal(S, u, v); xs.push(q.x); zs.push(q.z); }
    return { x0: Math.floor(Math.min(...xs)), x1: Math.ceil(Math.max(...xs)), z0: Math.floor(Math.min(...zs)), z1: Math.ceil(Math.max(...zs)) };
}

/**
 * Where the pyramids stand: {x, z, F, rot} or null. The land under the plate is levelled to F, so only «not wet, not too steep, not near another
 * site» matters.  @param raw the world's raw height field   @param busy (x, z, r) → another site / mountain within r
 */
export function pyramidSpot(seed, raw, busy) {
    const H = (x, z) => raw(Math.round(x), Math.round(z));
    const wet = (x, z) => { raw(Math.round(x), Math.round(z)); return !!(raw.water || raw.sea); };
    const sea = (x, z) => { raw(Math.round(x), Math.round(z)); return !!raw.sea; }; // (a lake or a river under the plate is just sanded over; the sea is not)
    const rng = createRng(((seed * 7919) ^ 0x3c6ef372) >>> 0);
    const a0 = rng() * TAU;
    const P = PYR.PLATE, cu = (P.u0 + P.u1) / 2, cv = (P.v0 + P.v1) / 2;
    let best = null;
    for (let i = 0; i < 60; i++) {
        const a = a0 + (i / 60) * TAU;
        for (let j = 0; j < 4; j++) {
            const d = PYR.MIN + (j + rng()) / 4 * (PYR.MAX - PYR.MIN);
            const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
            // the gates look toward the spawn
            const ax = -x, az = -z;
            const rot = Math.abs(az) >= Math.abs(ax) ? (az > 0 ? 0 : 2) : (ax > 0 ? 1 : 3);
            const S = { x, z, rot };
            const h0 = H(x, z);
            if (h0 < 2 || wet(x, z) || busy(x, z, 300)) continue;
            // the plate's land: dry all over, not too uneven (it is levelled; the fade ring takes up the rest)
            let lo = 999, hi = -999, dry = true, sum = 0, n = 0, lakes = 0;
            for (let u = P.u0; u <= P.u1 && dry; u += 38) for (let v = P.v0; v <= P.v1; v += 38) {
                const q = pyrLocal(S, u, v);
                if (sea(q.x, q.z) || ((u === P.u0 || u === P.u0 + 38 * 6 || u > P.u1 - 38) && (v === P.v0 || v > P.v1 - 38) && busy(q.x, q.z, 60))) { dry = false; break; } // (no other site under the plate)
                if (wet(q.x, q.z)) lakes++;
                const h = H(q.x, q.z); lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
            }
            if (!dry || n === 0) continue;
            const score = hi - lo + lakes * 2 + Math.abs(d - (PYR.MIN + PYR.MAX) / 2) * 0.004;
            if (!best || score < best.score) best = { x, z, rot, lo, hi, mean: sum / n, score };
        }
    }
    void cu; void cv;
    if (!best || best.hi - best.lo > 70) return null;
    const F = Math.max(PYR.FLOOR_MIN, Math.min(PYR.FLOOR_MAX, Math.round(best.mean)));
    return { x: best.x, z: best.z, F, rot: best.rot };
}

/**
 * The desert at a column (local u, v; `h` the land as it is; n a noise −1…1) → {h, lifted}: the plate levelled to F (the dunes at its edge, the
 * natural land beyond the fade). lifted: it is the desert's sand (no grass, no trees).
 */
export function pyramidLandAt(S, u, v, h, n) {
    const P = PYR.PLATE, F = S.F;
    const du = Math.min(u - P.u0, P.u1 - u), dv = Math.min(v - P.v0, P.v1 - v), d = Math.min(du, dv); // m inside the plate's edge (negative: outside)
    if (d < -P.FADE) return { h, lifted: false };
    if (d >= 0) {
        // (low sand ripples near the rim, perfectly flat round the pyramids: the floors are at F)
        const rim = Math.max(0, 1 - d / 40);
        return { h: Math.round(F + rim * n * 2.2), lifted: true };
    }
    // the fade: the land rises or falls from F to its own height; sand all the way (the desert spreads a little past the plate)
    const k = 1 + d / P.FADE; // 1 at the edge → 0 at the end of the fade
    const hh = Math.round(h + (F - h) * k * k * (3 - 2 * k) + n * 1.4 * (1 - k));
    return { h: Math.max(1, hh), lifted: true };
}

// ------------------------------------------------------------------ murals: pictures made of coloured blocks
// (letters: B lapis blue, R red ochre, T turquoise, K black, G gold, W pale sandstone; '.' leaves the wall as it is)
const COL = { B: PB.BLUE, R: PB.RED, T: PB.TURQ, K: PB.BLACK, G: PB.GOLD, W: PB.BRICK };
export const MOTIFS = {
    eye: [
        '.KKKKKKKKKK.',
        'K..TTTTTT..K',
        'K.TBBKKBBT.K',
        'KKTBKGGKBTKK',
        '.K.TBKKBT.KK',
        '..KK.TTT.K.K',
        '.....K.K.K.K',
        '.....KK..KK.',
    ],
    ankh: [
        '..GGG..',
        '.G...G.',
        '.G...G.',
        '.G...G.',
        '..GGG..',
        'GGGGGGG',
        'GGGGGGG',
        '..GGG..',
        '..GGG..',
        '..GGG..',
        '..GGG..',
    ],
    scarab: [
        '..K.....K..',
        '...K...K...',
        '..KGGGGGK..',
        '.GGTGGGTGG.',
        'GGTBGGGBTGG',
        'GGGGGKGGGGG',
        '.GGGGKGGGG.',
        '..G.GKG.G..',
        '.K...K...K.',
    ],
    sun: [
        '..R.R.R.R..',
        '.R..RRR..R.',
        '..RRGGGRR..',
        'R.RGGGGGR.R',
        '..RGGGGGR..',
        'R.RGGGGGR.R',
        '..RRGGGRR..',
        '.R..RRR..R.',
        '..R.R.R.R..',
    ],
    lotus: [
        '...T...',
        '..TTT..',
        '.TTBTT.',
        'TTBBBTT',
        '.TBBBT.',
        '..KGK..',
        '...G...',
        '...G...',
    ],
    djed: [
        '.RRRRR.',
        '.GGGGG.',
        '.RRRRR.',
        '..GGG..',
        '.RRRRR.',
        '..GGG..',
        '..GGG..',
        '..GGG..',
        '..GGG..',
        '.KKKKK.',
    ],
    figure: [
        '..KKK....',
        '.KKKK.G..',
        '..KK.GGG.',
        '..K..G.G.',
        '.KKKGG...',
        'K.KKK....',
        '..KKK....',
        '..KKK....',
        '..K.K....',
        '..K.K....',
        '.KK.KK...',
    ],
    cobra: [
        '..GG...',
        '.GRRG..',
        '.GRRG..',
        '..GG...',
        '..GG...',
        '.GGGG..',
        'GGTTGG.',
        'GTTTTG.',
        '.GGGG..',
    ],
};
/**
 * The plan of the three pyramids. Every room, its doors and its things are written in local coordinates; `sleepers` are the plain sarcophagi
 * (the mummies in them wake when somebody comes near: PharaohLife), `posts` the skeleton-mummies' places in the maze, `zombieSpots`, `chests`,
 * `plates` (the pressure plates), `sandTrap` (the false floor), `torches` (blocks that are put out, TORCH_OFF), `gold` (the jewels' places).
 */
export function pyramidPlan(S, seed = 1) {
    const parts = [];
    const F = S.F;
    const box = (u0, u1, v0, v1, L0, L1, t) => {
        const a = pyrLocal(S, u0, v0), b = pyrLocal(S, u1, v1);
        parts.push({ k: 0, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), L0, L1, t });
    };
    const at = (u, v, L) => { const p = pyrLocal(S, u, v); return { x: p.x, y: L, z: p.z }; };
    const rng = createRng(((seed * 31) ^ 0x1b873593) >>> 0);
    const out = {
        id: 'pyramids', ...S, parts, torches: [], sleepers: [], posts: [], zombieSpots: [], chests: [], plates: [], jewels: [], rooms: [], doors: [], sandTrap: null,
    };

    // ---- the pyramid's body: layers of dressed sandstone, a pale course now and then, the top gilded
    const pyramid = (P) => {
        for (let j = 0; j < P.h; j++) {
            const hj = Math.max(0, Math.round(P.half * (1 - j / P.h)));
            const t = j >= P.h - 4 ? PB.GOLD : (j % 12 === 11 ? PB.BRICK : PB.STONE);
            box(P.u - hj, P.u + hj, P.v - hj, P.v + hj, F + 1 + j, F + 1 + j, t);
        }
        // (the foundation: a platform of pale stone round the base, two steps)
        box(P.u - P.half - 3, P.u + P.half + 3, P.v - P.half - 3, P.v + P.half + 3, F, F, PB.BRICK);
        box(P.u - P.half - 1, P.u + P.half + 1, P.v - P.half - 1, P.v + P.half + 1, F + 1, F + 1, PB.BRICK);
    };
    pyramid(PYR.BIG); pyramid(PYR.MID); pyramid(PYR.SMALL);

    // ---- helpers for rooms
    /** A carved room: air from the floor to the ceiling, a floor of dressed stone, its plan recorded. */
    const room = (name, u0, u1, v0, v1, h, floor = PB.BRICK) => {
        box(u0, u1, v0, v1, F + 1, F + h, PB.AIR);
        box(u0 - 1, u1 + 1, v0 - 1, v1 + 1, F, F, floor);
        const r = { name, u0, u1, v0, v1, h, floor: F + 0.5, c: at((u0 + u1) / 2, (v0 + v1) / 2, F + 0.5) };
        out.rooms.push(r);
        return r;
    };
    /** A passage along v (a = u centre) or along u: air 5 wide, 7 high; recorded as a door for the tests. */
    const passV = (a, v0, v1, h = PYR.DOOR.H) => { box(a - 2, a + 2, Math.min(v0, v1), Math.max(v0, v1), F + 1, F + h, PB.AIR); box(a - 3, a + 3, Math.min(v0, v1), Math.max(v0, v1), F, F, PB.BRICK); out.doors.push({ axis: 'v', a, v0: Math.min(v0, v1), v1: Math.max(v0, v1), w: 5, h }); };
    const passU = (b, u0, u1, h = PYR.DOOR.H) => { box(Math.min(u0, u1), Math.max(u0, u1), b - 2, b + 2, F + 1, F + h, PB.AIR); box(Math.min(u0, u1), Math.max(u0, u1), b - 3, b + 3, F, F, PB.BRICK); out.doors.push({ axis: 'u', a: b, u0: Math.min(u0, u1), u1: Math.max(u0, u1), w: 5, h }); };

    /** One run of a picture: the bitmap on a wall plane. plane: {axis 'u'|'v', fixed, a0 (the left end along the wall), L0 (the bottom layer), flip}. */
    const paint = (plane, bmp, a0, L0) => {
        const rows = bmp.length, w = bmp[0].length;
        for (let r = 0; r < rows; r++) {
            const L = L0 + (rows - 1 - r);
            let c = 0;
            while (c < w) {
                const ch = bmp[r][c];
                if (ch === '.' || !COL[ch]) { c++; continue; }
                let e = c; while (e + 1 < w && bmp[r][e + 1] === ch) e++;
                const x0 = a0 + c * plane.dir, x1 = a0 + e * plane.dir;
                if (plane.axis === 'u') box(Math.min(x0, x1), Math.max(x0, x1), plane.fixed, plane.fixed, L, L, COL[ch]);
                else box(plane.fixed, plane.fixed, Math.min(x0, x1), Math.max(x0, x1), L, L, COL[ch]);
                c = e + 1;
            }
        }
    };
    /** A solid run on a wall plane: along-wall a0…a1, layers L0…L1. */
    const plot = (plane, a0, a1, L0, L1, t) => {
        const x0 = Math.min(a0, a1), x1 = Math.max(a0, a1);
        if (plane.axis === 'u') box(x0, x1, plane.fixed, plane.fixed, L0, L1, t); else box(plane.fixed, plane.fixed, x0, x1, L0, L1, t);
    };
    const BG = { eye: 'W', ankh: 'B', scarab: 'R', sun: 'B', lotus: 'R', djed: 'T', figure: 'W', cobra: 'B' };
    /** A framed picture: a field of colour, a gold border one block wide, the motif on the field. Size w+2 × h+2. */
    const panel = (plane, name, a0, L0) => {
        const m = MOTIFS[name], w = m[0].length, h = m.length, d = plane.dir;
        const aL = a0 - d, aR = a0 + d * w, lo = L0 - 1, hi = L0 + h;
        plot(plane, aL, aR, lo, hi, PB.GOLD);
        plot(plane, aL + d, aR - d, lo + 1, hi - 1, COL[BG[name]]);
        paint(plane, m, a0, L0);
    };
    /**
     * The painted look of one wall: a chequered dado, a row of framed pictures (repeated, spaced, only those that fit the room's height), a gold
     * line and a zigzag under the ceiling. `skips`: [from, to] ranges along the wall left bare (doors).
     */
    const wall = (plane, lo, hi, h, motifs, skips = []) => {
        const ok = (a) => !skips.some(([s, e]) => a >= s && a <= e);
        const dir = plane.dir;
        for (let a = lo; a !== hi + dir; a += dir) {
            if (!ok(a)) continue;
            const t = (Math.abs(a - lo) % 2 === 0) ? PB.RED : PB.BRICK;
            plot(plane, a, a, F + 1, F + 1, t);
            plot(plane, a, a, F + h - 1, F + h - 1, PB.GOLD);
            plot(plane, a, a, F + h, F + h, ((Math.abs(a - lo) + (a & 1)) % 4 < 2) ? PB.TURQ : PB.BLUE);
        }
        // the pictures: the free rows are F+2 … F+h−2
        const avail = h - 3;
        let a = lo + dir * 2, i = 0, guard = 0;
        const room = Math.abs(hi - lo);
        while (Math.abs(a - lo) < room - 3 && guard++ < 60) {
            // the next motif that fits
            let name = null;
            for (let t = 0; t < motifs.length; t++) { const n = motifs[(i + t) % motifs.length]; if (MOTIFS[n].length + 2 <= avail) { name = n; i += t; break; } }
            if (!name) break;
            const w = MOTIFS[name][0].length + 2, e = a + dir * (w - 1);
            if (Math.abs(e - lo) > room - 2) break;
            let fine = true; for (let x = a; x !== e + dir; x += dir) if (!ok(x)) { fine = false; break; }
            if (fine) {
                const hh = MOTIFS[name].length + 2;
                panel(plane, name, a + dir, F + 2 + 1 + Math.floor((avail - hh) / 2));
                a = e + dir * 3;
            } else a += dir * 2;
            i++;
        }
    };
    /** The four walls of a room painted (the doors' ranges left bare). */
    const paintRoom = (R, motifs, skipsOf = {}) => {
        // west/east walls (fixed u), south/north walls (fixed v); `dir` +1 along increasing coordinate
        wall({ axis: 'v', fixed: R.u0 - 1, dir: 1 }, R.v0, R.v1, R.h, motifs, skipsOf.w || []);
        wall({ axis: 'v', fixed: R.u1 + 1, dir: 1 }, R.v0, R.v1, R.h, motifs.slice().reverse(), skipsOf.e || []);
        wall({ axis: 'u', fixed: R.v0 - 1, dir: 1 }, R.u0, R.u1, R.h, motifs, skipsOf.s || []);
        wall({ axis: 'u', fixed: R.v1 + 1, dir: 1 }, R.u0, R.u1, R.h, motifs.slice().reverse(), skipsOf.n || []);
    };
    /** A torch on a wall cell (a put-out one: «Fire» lights it). */
    const torch = (u, v, L) => { box(u, u, v, v, L, L, PB.TORCH_OFF); const p = at(u, v, L); out.torches.push({ x: p.x, y: L, z: p.z }); };
    /** A floor medallion: a gold disc with a red ring. */
    const medallion = (cu, cv, r) => {
        for (let u = -r; u <= r; u++) for (let v = -r; v <= r; v++) {
            const d = Math.hypot(u, v);
            if (d > r + 0.4) continue;
            box(cu + u, cu + u, cv + v, cv + v, F, F, d > r - 1.2 ? PB.RED : d > r - 2.4 ? PB.TURQ : PB.GOLD);
        }
    };
    /** A column 2×2 from the floor to the ceiling with gold capital and turquoise ring. */
    const column = (u, v, h) => {
        box(u, u + 1, v, v + 1, F + 1, F + h, PB.BRICK);
        box(u, u + 1, v, v + 1, F + 1, F + 1, PB.GOLD); box(u, u + 1, v, v + 1, F + h - 1, F + h, PB.GOLD);
        box(u, u + 1, v, v + 1, F + Math.floor(h / 2), F + Math.floor(h / 2), PB.TURQ);
        box(u, u + 1, v, v + 1, F + 2, F + 2, PB.BLUE);
    };
    const sleeper = (u, v, yawLocal, roomName) => { const p = at(u, v, F + 0.5); out.sleepers.push({ ...p, uL: u, vL: v, yawL: yawLocal, room: roomName }); };
    const chest = (u, v, room) => { const p = at(u, v, F + 0.5); out.chests.push({ ...p, uL: u, vL: v, room, id: 'pc' + out.chests.length }); };

    // =================================================================== THE GREAT PYRAMID (centre 0,0; front +v, the entrance in the +v face)
    const G = PYR.BIG;
    // the entrance: a broad doorway cut through the stepped face, a gilded frame, two pillars of lapis
    passV(0, 46, G.half + 4);
    box(3, 4, G.half - 6, G.half - 5, F + 1, F + 8, PB.BLUE); box(-4, -3, G.half - 6, G.half - 5, F + 1, F + 8, PB.BLUE);
    box(-4, 4, G.half - 6, G.half - 5, F + 8, F + 9, PB.GOLD);
    // ---- 1 The Guards' Hall
    const R1 = room('guards', -12, 12, 22, 46, 16, PB.STONE);
    // ---- passage B → 2 The Hall of Columns
    passV(0, 12, 21);
    const R2 = room('columns', -17, 17, -12, 12, 18);
    // ---- the wings: a corridor from each side of the columns' hall
    passU(0, 18, 27); passU(0, -27, -18);
    const R3 = room('scarab', 28, 52, -12, 12, 14);
    const R4 = room('sand', -52, -28, -12, 12, 14);
    // ---- passage C → 5 The Hall of Stars
    passV(0, -22, -13);
    const R5 = room('stars', -15, 15, -42, -23, 14);
    // ---- passage D → 6 The Burial Chamber
    passV(0, -49, -43);
    const R6 = room('burial', -21, 21, -62, -50, 13, PB.STONE);
    // the burial chamber's vault: stepped in, painted with gold stars on blue
    for (let k = 0; k < 6; k++) box(-21 + k, 21 - k, -62 + k, -50 - k, F + 14 + k, F + 14 + k, PB.AIR);
    out.rooms[out.rooms.length - 1].vault = 6;

    // ---- paint and furnish each room
    paintRoom(R1, ['figure', 'eye', 'figure', 'scarab'], { n: [[-3, 3]], s: [[-3, 3]] });
    paintRoom(R2, ['sun', 'ankh', 'cobra', 'djed'], { n: [[-3, 3]], s: [[-3, 3]], w: [[-3, 3]], e: [[-3, 3]] });
    paintRoom(R3, ['scarab', 'lotus', 'ankh', 'scarab'], { w: [[-3, 3]] });
    paintRoom(R4, ['eye', 'cobra', 'eye', 'djed'], { e: [[-3, 3]] });
    paintRoom(R5, ['lotus', 'sun', 'lotus', 'eye'], { s: [[-3, 3]], n: [[-3, 3]] });
    paintRoom(R6, ['figure', 'ankh', 'eye', 'sun', 'cobra'], { n: [[-3, 3]] });

    // floors
    medallion(0, 34, 6);
    medallion(0, 0, 8);
    medallion(40, 0, 6);
    medallion(0, -32, 7);
    medallion(0, -56, 6);
    // the Hall of Columns: two rows of columns
    for (const u of [-9, 7]) for (const v of [-9, -3, 3, 9]) column(u, v - 1, 18);
    // the Hall of Stars: the ceiling's stars — blue sky with gold and turquoise points
    {
        const L = F + R5.h + 1;
        box(R5.u0, R5.u1, R5.v0, R5.v1, L, L, PB.BLUE);
        for (let i = 0; i < 90; i++) { const u = R5.u0 + Math.floor(rng() * (R5.u1 - R5.u0 + 1)), v = R5.v0 + Math.floor(rng() * (R5.v1 - R5.v0 + 1)); box(u, u, v, v, L, L, rng() < 0.6 ? PB.GOLD : PB.TURQ); }
        // (and a great sun in the middle of the ceiling)
        for (let u = -3; u <= 3; u++) for (let v = -3; v <= 3; v++) if (Math.hypot(u, v) <= 3.2) box(u, u, -32 + v, -32 + v, L, L, Math.hypot(u, v) > 2.2 ? PB.RED : PB.GOLD);
    }
    {
        // the burial chamber's vault: the same
        for (let k = 0; k < 6; k++) {
            const L = F + 13 + 1 + k;
            box(-21 + k - 1, -21 + k - 1, -62 + k, -50 - k, L, L, PB.BLUE); box(21 - k + 1, 21 - k + 1, -62 + k, -50 - k, L, L, PB.BLUE);
        }
        const L = F + 20;
        box(-15, 15, -58, -56, L, L, PB.BLUE);
        for (let i = 0; i < 40; i++) box(-14 + Math.floor(rng() * 29), -14 + Math.floor(rng() * 29), -58 + Math.floor(rng() * 3), -58 + Math.floor(rng() * 3), L, L, PB.GOLD);
    }
    // the burial dais: three steps of pale stone, gold at its corners; the sarcophagus stands on it (a model: PharaohLife)
    box(-7, 7, -60, -52, F + 1, F + 1, PB.BRICK); box(-5, 5, -59, -53, F + 2, F + 2, PB.BRICK); box(-3, 3, -58, -54, F + 3, F + 3, PB.GOLD);
    for (const [u, v] of [[-8, -60], [8, -60], [-8, -52], [8, -52]]) box(u, u, v, v, F + 1, F + 7, PB.GOLD);
    out.pharaoh = { ...at(0, -56, F + 4.5), uL: 0, vL: -56 }; // the sarcophagus' spot (on the top step)

    // the Hall of Sand: a patch of sand in the stone floor — the false floor (the trap): one layer of sand over an 7 m pit with a soft bed of
    // sand at the bottom and a stair out along its west edge. The game takes the false floor away when somebody stands on it (PharaohLife).
    {
        const T = { u0: -45, u1: -35, v0: -6, v1: 4 }; // 11 × 11
        box(T.u0, T.u1, T.v0, T.v1, F - 7, F - 1, PB.AIR); // the pit
        box(T.u0 - 1, T.u1 + 1, T.v0 - 1, T.v1 + 1, F - 9, F - 9, PB.BRICK);
        box(T.u0, T.u1, T.v0, T.v1, F - 8, F - 8, PB.SAND); // a bed of sand
        box(T.u0, T.u1, T.v0, T.v1, F, F, PB.SAND); // the false floor
        for (let k = 0; k < 8; k++) box(T.u0, T.u0 + 1, T.v1 - 2 - k, T.v1 - 2 - k, F - 8, F - 7 + k, PB.BRICK); // the stair: whole columns
        out.sandTrap = { ...T, floorL: F, pitL: F - 7, stair: { u0: T.u0, u1: T.u0 + 1, v0: T.v1 - 9, v1: T.v1 - 2 }, c: at((T.u0 + T.u1) / 2, (T.v0 + T.v1) / 2, F + 0.5) };
    }

    // torches (all put out): along the long walls of every room, at the height of a hand's reach (4 above the floor)
    const torchRow = (R, per, doorW = false, doorE = false) => {
        for (let v = R.v0 + 3; v <= R.v1 - 3; v += per) {
            if (!(doorW && Math.abs(v) <= 3)) torch(R.u0 - 1, v, F + 4);
            if (!(doorE && Math.abs(v) <= 3)) torch(R.u1 + 1, v, F + 4);
        }
    };
    torchRow(R1, 8); torchRow(R2, 8, true, true); torchRow(R3, 8, true, false); torchRow(R4, 8, false, true); torchRow(R5, 8); torchRow(R6, 6);
    // the entrance's passage: two torches before the first hall
    for (const v of [60, 52]) { torch(-3, v, F + 4); torch(3, v, F + 4); }

    // sleepers: the plain sarcophagi along the walls (their lids closed): the guards' hall 6, the columns 4, the scarab hall 3, the sand hall 3, the stars 4
    const row = (R, n, side, name) => { // along a west (side -1) / east (+1) wall of a room
        const span = (R.v1 - R.v0 - 4) / Math.max(1, n - 1);
        for (let i = 0; i < n; i++) sleeper(side < 0 ? R.u0 + 2 : R.u1 - 2, Math.round(R.v0 + 2 + i * span), side < 0 ? -Math.PI / 2 : Math.PI / 2, name);
    };
    row(R1, 3, -1, 'guards'); row(R1, 3, 1, 'guards');
    row(R2, 2, -1, 'columns'); row(R2, 2, 1, 'columns');
    row(R3, 3, 1, 'scarab'); row(R4, 3, -1, 'sand'); row(R5, 2, -1, 'stars'); row(R5, 2, 1, 'stars');

    // chests: one to three in each room, in the corners and behind columns (the secrets: a chest in the corner of the Hall of Sand, behind the false floor's pit)
    chest(-10, 44, 'guards'); chest(10, 44, 'guards');
    chest(-15, 10, 'columns'); chest(15, -10, 'columns');
    chest(50, 10, 'scarab'); chest(50, -10, 'scarab'); chest(34, 10, 'scarab');
    chest(-50, 10, 'sand'); chest(-50, -10, 'sand');
    chest(-13, -40, 'stars'); chest(13, -40, 'stars'); chest(0, -40, 'stars');
    // the pharaoh's three chests in the burial chamber (egyptian: gold, jewels, the sun)
    for (const u of [-14, 0, 14]) { const p = at(u, -60, F + 0.5); out.chests.push({ ...p, uL: u, vL: -60, room: 'burial', id: 'pharaoh' + (u + 14), boss: true }); }
    // jewels: gold ornaments set on stands (collectable: small ones go to the backpack and sell, the big ones are carried in the hands)
    for (const [u, v, big] of [[40, 6, false], [46, 6, false], [40, -6, false], [46, -6, false], [34, 0, true], [-16, -58, false], [16, -58, false]]) {
        box(u, u, v, v, F + 1, F + 1, PB.BRICK); box(u, u, v, v, F + 2, F + 2, PB.GOLD);
        const p = at(u, v, F + 2.5); out.jewels.push({ ...p, big, room: u > 20 ? 'scarab' : 'burial' });
    }

    // =================================================================== THE MIDDLE PYRAMID: the maze
    const M = PYR.MID, N = 9, PITCH = 8, MH = 6;
    const cellU = (i) => M.u + (i - 4) * PITCH, cellV = (j) => M.v + (j - 4) * PITCH;
    {
        // the maze: depth-first from the entrance cell (4, 8) (the +v side), a perfect maze
        const wall = [];
        for (let i = 0; i < N; i++) { wall.push([]); for (let j = 0; j < N; j++) wall[i].push({ n: true, s: true, e: true, w: true, seen: false }); }
        const stack = [[4, 8]]; wall[4][8].seen = true;
        const dirs = [[0, 1, 'n', 's'], [0, -1, 's', 'n'], [1, 0, 'e', 'w'], [-1, 0, 'w', 'e']];
        const mrng = createRng(((seed * 97) ^ 0x2545f491) >>> 0);
        while (stack.length) {
            const [i, j] = stack[stack.length - 1];
            const opts = dirs.filter(([di, dj]) => i + di >= 0 && i + di < N && j + dj >= 0 && j + dj < N && !wall[i + di][j + dj].seen);
            if (!opts.length) { stack.pop(); continue; }
            const [di, dj, a, b] = opts[Math.floor(mrng() * opts.length)];
            wall[i][j][a] = false; wall[i + di][j + dj][b] = false; wall[i + di][j + dj].seen = true;
            stack.push([i + di, j + dj]);
        }
        // carve: a 5 × 5 cell (a passage 5 wide) at every junction, connectors between open neighbours
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
            const u = cellU(i), v = cellV(j);
            box(u - 2, u + 2, v - 2, v + 2, F + 1, F + MH, PB.AIR); box(u - 3, u + 3, v - 3, v + 3, F, F, PB.BRICK);
            if (!wall[i][j].e && i + 1 < N) { box(u + 3, u + PITCH - 3, v - 2, v + 2, F + 1, F + MH, PB.AIR); }
            if (!wall[i][j].n && j + 1 < N) { box(u - 2, u + 2, v + 3, v + PITCH - 3, F + 1, F + MH, PB.AIR); }
        }
        // the floor all through (the connectors' floor too)
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
            const u = cellU(i), v = cellV(j);
            if (!wall[i][j].e && i + 1 < N) box(u + 3, u + PITCH - 3, v - 3, v + 3, F, F, PB.BRICK);
            if (!wall[i][j].n && j + 1 < N) box(u - 3, u + 3, v + 3, v + PITCH - 3, F, F, PB.BRICK);
        }
        // the entrance: a passage from the front face to the entrance cell
        passV(M.u, M.v + (8 - 4) * PITCH, M.v + M.half + 3);
        // paint the maze lightly: a red band and a gold line at each cell's walls are too many blocks — only the entrance and the dead ends
        const degree = (i, j) => (!wall[i][j].n ? 1 : 0) + (!wall[i][j].s ? 1 : 0) + (!wall[i][j].e ? 1 : 0) + (!wall[i][j].w ? 1 : 0);
        const dead = [], junction = [];
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const d = degree(i, j); if (d === 1 && !(i === 4 && j === 8)) dead.push([i, j]); else if (d >= 3) junction.push([i, j]); }
        // the heart: the cell farthest from the entrance by walking — the treasure chamber (a bigger room, the chest of the maze)
        const dist = {}; const q = [[4, 8]]; dist['4,8'] = 0;
        while (q.length) { const [i, j] = q.shift(); const d = dist[i + ',' + j]; for (const [di, dj, a] of dirs) { if (wall[i][j][a]) continue; const k = (i + di) + ',' + (j + dj); if (dist[k] === undefined) { dist[k] = d + 1; q.push([i + di, j + dj]); } } }
        let far = [4, 8], best = -1; for (const k of Object.keys(dist)) if (dist[k] > best) { best = dist[k]; far = k.split(',').map(Number); }
        {
            const u = cellU(far[0]), v = cellV(far[1]);
            box(u - 4, u + 4, v - 4, v + 4, F + 1, F + 8, PB.AIR); box(u - 5, u + 5, v - 5, v + 5, F, F, PB.BRICK);
            medallion(u, v, 3);
            const p = at(u, v, F + 0.5); out.mazeHeart = p; out.chests.push({ ...at(u, v + 3, F + 0.5), uL: u, vL: v + 3, room: 'maze', id: 'pcHeart' });
            for (const [du, dv] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { torch(u + du, v + dv, F + 4); }
        }
        // chests at the dead ends (up to 6), skeleton-mummies at the junctions, zombies at a few dead ends
        dead.slice(0, 6).forEach(([i, j], k) => { const u = cellU(i), v = cellV(j); out.chests.push({ ...at(u, v, F + 0.5), uL: u, vL: v, room: 'maze', id: 'pcM' + k }); });
        junction.slice(0, 9).forEach(([i, j]) => { const u = cellU(i), v = cellV(j); out.posts.push({ ...at(u, v, F + 0.5), uL: u, vL: v, room: 'maze' }); });
        dead.slice(6, 10).forEach(([i, j]) => { const u = cellU(i), v = cellV(j); out.zombieSpots.push({ ...at(u, v, F + 0.5), room: 'maze' }); });
        // torches at every third junction (put out)
        junction.forEach(([i, j], k) => { if (k % 2 === 0) { const u = cellU(i), v = cellV(j); torch(u - 3, v - 3, F + 4); } });
        // a few frescoes where the maze meets the entrance: the walls of the first cell
        paint({ axis: 'u', fixed: cellV(8) + 3, dir: 1 }, MOTIFS.eye, cellU(4) - 6, F + 3);
        paint({ axis: 'u', fixed: cellV(8) + 3, dir: 1 }, MOTIFS.ankh, cellU(4) + 4, F + 2);
        out.maze = { N, PITCH, entrance: [4, 8], heart: far, dead: dead.length, junctions: junction.length };
    }

    // =================================================================== THE SMALL PYRAMID: the corridor and the dart trap
    {
        const Sm = PYR.SMALL;
        passV(Sm.u, Sm.v - 3, Sm.v + Sm.half + 3);
        const Rs = room('small', Sm.u - 7, Sm.u + 7, Sm.v - 13, Sm.v - 3, 9);
        paintRoom(Rs, [], { n: [[Sm.u - 2, Sm.u + 2]] });
        // the corridor's walls: a red-and-pale dado, a gold line and a zigzag
        wall({ axis: 'v', fixed: Sm.u - 3, dir: 1 }, Sm.v - 2, Sm.v + Sm.half - 6, PYR.DOOR.H, []);
        wall({ axis: 'v', fixed: Sm.u + 3, dir: 1 }, Sm.v - 2, Sm.v + Sm.half - 6, PYR.DOOR.H, []);
        // the pressure plate: one tile of another colour in the corridor's floor, in plain sight, near the middle
        const pv = Sm.v + 14;
        box(Sm.u - 1, Sm.u + 1, pv - 1, pv + 1, F, F, PB.PLATE);
        out.plates.push({ ...at(Sm.u, pv, F + 0.5), uL: Sm.u, vL: pv, hw: 1.6, kind: 'darts', room: 'small' });
        // the dart slits: dark blocks high in the corridor's walls (the game fires from them)
        out.dartSlits = [];
        for (const dv of [-6, -2, 2, 6]) for (const s of [-1, 1]) { box(Sm.u + s * 3, Sm.u + s * 3, pv + dv, pv + dv, F + 3, F + 3, PB.BLACK); out.dartSlits.push({ ...at(Sm.u + s * 3, pv + dv, F + 3.5), side: s }); }
        chest(Sm.u - 5, Sm.v - 11, 'small'); chest(Sm.u + 5, Sm.v - 11, 'small');
        torch(Sm.u - 3, Sm.v + 22, F + 4); torch(Sm.u + 3, Sm.v + 22, F + 4); torch(Sm.u - 3, Sm.v + 6, F + 4); torch(Sm.u + 3, Sm.v + 6, F + 4);
        const p = at(Sm.u, Sm.v + 14, F + 0.5); out.smallPlate = p;
    }

    // ---- the front of all three: a long avenue of paving from the spawn side to the great entrance, with lapis posts
    box(-4, 4, G.half + 4, G.half + 90, F, F, PB.BRICK);
    for (let v = G.half + 10; v < G.half + 90; v += 12) for (const s of [-1, 1]) { box(s * 6, s * 6, v, v, F + 1, F + 4, PB.BLUE); box(s * 6, s * 6, v, v, F + 5, F + 5, PB.GOLD); }
    // the spot a hero stands on to see the three (the approach), the gate
    out.approach = at(0, G.half + 70, F + 0.5);
    out.gate = at(0, G.half + 2, F + 0.5);
    out.yaw = pyrYaw(S);
    // the bounds
    out.x0 = Math.min(...parts.map((p) => p.x0)); out.x1 = Math.max(...parts.map((p) => p.x1));
    out.z0 = Math.min(...parts.map((p) => p.z0)); out.z1 = Math.max(...parts.map((p) => p.z1));
    out.plate = plateBox(S);
    return out;
}

/** The three pyramids as the terrain sees them: its spot (lazily), its plan, its desert, its parts in a chunk. */
export class PyramidSite {
    constructor(seed, raw, busy) {
        this.seed = seed; this.raw = raw; this.busy = busy;
        this._dune = createNoise2D((seed ^ 0x6a09e667) >>> 0);
        this._plan = undefined;
        this._byChunk = new Map();
        this.lifted = false;
    }

    get plan() {
        if (this._plan === undefined) {
            const S = pyramidSpot(this.seed, this.raw, this.busy);
            this._plan = S ? pyramidPlan(S, this.seed) : null;
        }
        return this._plan;
    }

    /** The land at a column as the desert makes it (`h` the land without it). Sets this.lifted. */
    shapeAt(ix, iz, h) {
        const k = this.plan;
        this.lifted = false;
        if (!k) return h;
        const B = k.plate, M = PYR.PLATE.FADE + 6;
        if (ix < B.x0 - M || ix > B.x1 + M || iz < B.z0 - M || iz > B.z1 + M) return h;
        const { u, v } = pyrUV(k, ix - k.x, iz - k.z);
        const n = this._dune(ix / 17, iz / 17) * 0.7 + this._dune(ix / 6 + 9, iz / 6 - 4) * 0.3;
        const o = pyramidLandAt(k, u, v, h, n);
        this.lifted = o.lifted;
        return o.h;
    }

    /** Desert sand here (no trees, no grass). */
    sandy(ix, iz) {
        const k = this.plan;
        if (!k) return false;
        const B = k.plate, M = PYR.PLATE.FADE;
        if (ix < B.x0 - M || ix > B.x1 + M || iz < B.z0 - M || iz > B.z1 + M) return false;
        const { u, v } = pyrUV(k, ix - k.x, iz - k.z), P = PYR.PLATE;
        return u > P.u0 - M && u < P.u1 + M && v > P.v0 - M && v < P.v1 + M;
    }

    /** Near the pyramids (for the other sites to keep away). */
    near(x, z, r) {
        const k = this.plan;
        return !!k && x > k.plate.x0 - r && x < k.plate.x1 + r && z > k.plate.z0 - r && z < k.plate.z1 + r;
    }

    partsForChunk(cx, cz, C) {
        const k = this.plan;
        if (!k) return [];
        const x0 = cx * C, z0 = cz * C, x1 = x0 + C - 1, z1 = z0 + C - 1;
        if (k.x1 < x0 || k.x0 > x1 || k.z1 < z0 || k.z0 > z1) return [];
        const key = cx * 65536 + cz;
        let list = this._byChunk.get(key);
        if (!list) { list = k.parts.filter((p) => p.x1 >= x0 && p.x0 <= x1 && p.z1 >= z0 && p.z0 <= z1); if (this._byChunk.size > 400) this._byChunk.clear(); this._byChunk.set(key, list); }
        return list.length ? [list] : [];
    }
}
