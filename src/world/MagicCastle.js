/**
 * MagicCastle.js — the plan of a castle made by magic («Create a Castle», CastleMagic.js).
 *
 * In the spirit of the castle of the second film of Narnia («Prince Caspian», 2008: Miraz's castle of
 * the Telmarines — dark grey stone, a Spanish gothic look, high narrow towers) — but, as the author
 * asked, no square fortress with four towers at its corners: a big, beautiful palace with spires.
 *
 *   - in front: a gatehouse — two slender round towers with tall spires, the gate between them
 *     (two leaves of oak with iron bands, opened by the hand), a low wall with battlements round a
 *     courtyard, two little corner towers with spires; a paved path from the gate to the palace;
 *   - the palace (the keep): a high throne hall in the middle under a steep slate roof, tall windows
 *     high in its walls, a round window in its front gable; the throne of gold on a dais at its far end,
 *     a red carpet from the doors to it, banners, chandeliers; its doors — two leaves of iron;
 *   - its wings: on the left the bedchamber (four beds), on the right a dining hall and, behind an iron
 *     door, the treasury with three chests; iron doors from the throne hall into both wings;
 *   - towers: four slender round towers at the palace's corners (the back ones higher) and the great
 *     tower behind the throne — the highest, its spire ~70 m over the ground; little turrets on the hall's
 *     front gable. Every spire is pointed, of slate or blue tiles, with a gold finial.
 *
 * Pure data, deterministic from (seed, place, face): every computer finds the same castle from its record
 * (its blocks travel as ordinary block edits). Two parts: castleLayout() — cheap (the doors, the beds, the
 * chests, the windows, the throne, the rect: every computer, at once), and castleCells() — the blocks
 * (thousands: made once per castle, in a worker in the browser — castle.worker.js).
 *
 * Local coordinates as MagicHouse.js: a to the right, b to the back (the gate is in front, −b), l = layers
 * above the ground (l = −1 the floor laid in the ground itself). Blocks are 1 m; the hero is ~4.8 m tall.
 */

import { BLOCK } from './Terrain.js';
import { createRng } from '../core/math.js';
import { rotLot } from './MagicHouse.js';
import { inwardRy } from './Castles.js';

/** What the spell takes. */
export const CASTLE = {
    MANA: 500, // mana, at once (Creative: nothing)
    TIME: 30, // s the magic lasts
    STONE_R: 34, // m round the place: the stone the castle is made of is looked for this far
    STONE_NEED: 260, // blocks of stone (the rock under the ground counts) — «there is always enough round»
    STONE_TAKE: 48, // bare stones on the surface really taken (they rise and fly into the walls)
    AHEAD: 44, // m: the castle's middle this far ahead of the caster (its gate ~20 m away)
    REACH: 40, // m: the castle's reach from its middle (another magic castle / house twice as far)
    RISE_END: 0.62, // the share of the time when the walls and the towers have risen out of the ground
};

// the castle's size (local)
const FRONT = -24; // the front wall (the gate)
const KEEP_B0 = -8, KEEP_B1 = 20, KEEP_A = 16; // the palace
const HALL_A = 7; // the throne hall's walls (a = ±7)
const WING_TOP = 9; // the wings' walls (l 0..9), their flat roof at 10
const HALL_TOP = 17; // the hall's walls (l 0..17)
const YARD_A = 22; // the courtyard's side walls
const GATE_HALF = 3; // the gate is 7 wide (a −3..3)…
const GATE_H = 9; // …and 9 high
const DOOR_HALF = 2; // the palace's doors: 5 wide, 6 high
const DOOR_H = 6;
const BED_W = 2.5, BED_L = 5.5; // (Beds.js)
const CHEST_SCALE = 2, CHEST_D = 0.85 * CHEST_SCALE, CHEST_GAP = 0.15;

/** The towers: [a, b, radius, top of the wall (l), spire's height]. */
const TOWERS = [
    [-11, -23, 3.5, 26, 15], [11, -23, 3.5, 26, 15], // the gatehouse
    [-YARD_A, FRONT, 2.5, 16, 10], [YARD_A, FRONT, 2.5, 16, 10], // the courtyard's front corners
    [-KEEP_A, KEEP_B0, 3, 30, 15], [KEEP_A, KEEP_B0, 3, 30, 15], // the palace's front corners
    [-KEEP_A, KEEP_B1, 3.2, 36, 17], [KEEP_A, KEEP_B1, 3.2, 36, 17], // its back corners
    [0, 25, 4.5, 46, 22], // the great tower behind the throne
];
/** The turrets on the hall's front gable: [a, b, radius, from l, top l, spire]. */
const TURRETS = [[-HALL_A, KEEP_B0, 1.6, HALL_TOP + 1, 25, 9], [HALL_A, KEEP_B0, 1.6, HALL_TOP + 1, 25, 9]];

/** The stone of the castle by its seed: Miraz's dark stone most often; slate or blue spires. */
export function castleStyle(seed) {
    const r = createRng((seed >>> 0) + 101);
    const pale = r() < 0.25; // (now and then a paler castle — still with dark trim)
    return {
        wall: pale ? BLOCK.CS_GREY : BLOCK.CS_DARK,
        trim: pale ? BLOCK.CS_DARK : BLOCK.CS_GREY,
        roof: r() < 0.55 ? BLOCK.ROOF_SLATE : BLOCK.ROOF_BLUE,
        floor: BLOCK.CS_WHITE,
        banner: r() < 0.7 ? BLOCK.CARPET_RED : BLOCK.CARPET_BLUE,
    };
}

/** The frame of a castle: local (a, b, l) → world. */
function frame({ x, z, G, face }) {
    const W = (a, b) => { const [rx, rz] = rotLot(a, b, face); return [x + rx, z + rz]; };
    const Lw = (l) => G + 1 + l;
    const pt = (a, b, l = 0) => { const [wx, wz] = W(a, b); return { x: wx, z: wz, y: Lw(l) - 1.5 }; };
    const yaw = (a, b) => { const o = pt(0, 0), q = pt(a, b); return Math.atan2(-(q.x - o.x), -(q.z - o.z)); };
    const along = (a, b) => { const o = pt(0, 0), q = pt(a, b); return Math.atan2(-(q.z - o.z), q.x - o.x); };
    return { W, Lw, pt, yaw, along };
}

/** The local rectangle the castle takes (with a margin of one block). */
const EXT = { a0: -YARD_A - 4, a1: YARD_A + 4, b0: FRONT - 5, b1: 31 };

/**
 * The cheap part: everything but the blocks.
 * @param {{seed:number, x:number, z:number, G:number, face:number}} o  x, z: the middle; G: the ground layer; face: the gate's side
 * @returns {{doors:object[], beds:object[], chests:object[], windows:object[], throne, rect, gate, top:number}}
 */
export function castleLayout(o) {
    const { pt, yaw, along } = frame(o);
    const out = { doors: [], beds: [], chests: [], windows: [], rect: null, top: o.G + 1 + 46 + 22 };
    // a door in a wall: `axis` 'b' — the wall runs along a (its leaves face ±b), 'a' — along b
    const leaf = (id, a, b, w, h, inA, inB, extra) => {
        const p = pt(a, b, 0), q = pt(a + inA, b + inB, 0);
        const fr = rotLot(inB !== 0 ? 1 : 0, inB !== 0 ? 0 : 1, o.face);
        return { id, x: p.x, y: p.y, z: p.z, ry: inwardRy(Math.atan2(-fr[1], fr[0]), q.x - p.x, q.z - p.z), w, h, ...extra };
    };
    // two leaves in a wall along a (as the castles' gates — Alohomora.js): the hinges at the jambs
    const pair = (id, b, half, h, extra) => {
        const c = leaf(id, 0, b, 1, h, 0, 1, extra);
        const ax = Math.cos(c.ry), az = -Math.sin(c.ry), lw = half + 0.5;
        for (const s of [-1, 1]) out.doors.push({ ...c, id: id + (s < 0 ? 'L' : 'R'), x: c.x + ax * s * lw / 2, z: c.z + az * s * lw / 2, w: lw, mirror: s > 0 });
    };
    // the gate: two leaves of oak with iron bands, opening into the courtyard
    pair('g', FRONT + 1, GATE_HALF, GATE_H, { banded: true });
    // the palace's doors: two leaves of iron
    pair('p', KEEP_B0, DOOR_HALF, DOOR_H, { metal: true, banded: true });
    // iron doors from the hall into the wings, and into the treasury
    out.doors.push(leaf('wL', -HALL_A, 1, 3, 5, -1, 0, { metal: true }));
    out.doors.push(leaf('wR', HALL_A, 1, 3, 5, 1, 0, { metal: true }));
    out.doors.push(leaf('tR', 11.5, 7, 3, 5, 0, 1, { metal: true }));
    // the bedchamber (the left wing, a −15…−8): four beds along its outer wall, the pillows to it
    for (let k = 0; k < 4; k++) {
        const q = pt(-KEEP_A + 0.5 + BED_L / 2 + 0.1, -4 + k * 6.2, 0);
        out.beds.push({ ...q, yaw: yaw(-1, 0) });
    }
    // the treasury (the right wing behind its iron door, b 8…19): three chests along its outer wall
    [10.5, 14, 17.5].forEach((cb, k) => {
        out.chests.push({ k, ...pt(KEEP_A - 0.5 - CHEST_GAP - CHEST_D / 2, cb, 0), yaw: yaw(-1, 0), gap: CHEST_GAP, scale: CHEST_SCALE });
    });
    // the windows with glass: the hall's high ones, the wings' outer ones, the round one in the gable
    for (const s of [-1, 1]) for (let b = -4; b <= 16; b += 5) {
        const q = pt(s * HALL_A, b, 0);
        out.windows.push({ x: q.x, z: q.z, y: (o.G + 1 + 12 + o.G + 1 + 16) / 2 - 1, ry: along(0, 1), w: 1, h: 5 });
    }
    for (const s of [-1, 1]) for (const b of [-3, 3, 9, 15]) {
        const q = pt(s * KEEP_A, b, 0);
        out.windows.push({ x: q.x, z: q.z, y: o.G + 1 + 4 - 1, ry: along(0, 1), w: 1, h: 3 });
    }
    { const q = pt(0, KEEP_B0, 0); out.windows.push({ x: q.x, z: q.z, y: o.G + 1 + 22 - 1, ry: along(1, 0), w: 5, h: 5 }); }
    // the throne (gold on the dais at the hall's far end, facing the doors)
    out.throne = { ...pt(0, KEEP_B1 - 1, 2), yaw: yaw(0, -1) };
    out.gate = pt(0, FRONT, 0);
    const c0 = pt(EXT.a0, EXT.b0), c1 = pt(EXT.a1, EXT.b1);
    out.rect = { x0: Math.min(c0.x, c1.x), x1: Math.max(c0.x, c1.x), z0: Math.min(c0.z, c1.z), z1: Math.max(c0.z, c1.z) };
    out.floorY = o.G + 1 - 1.5;
    return out;
}

/** What each block of the castle is: 0 the air carved, 1 risen out of the ground, 2 built on (from above). */
export const PART = { AIR: 0, RISE: 1, TOP: 2 };

/**
 * The blocks of the castle.
 * @returns {{cells:Int32Array, fill:Int32Array, n:number}}  cells: [x, L, z, block, part] × n, in the order the
 *   magic puts them (the air first, from the top; the risen walls layer by layer from the ground; then the
 *   battlements, the roofs and the spires — each piece bottom-up); fill: [x, L, z, block] — the foundation's
 *   stone, laid only where nothing solid is.
 */
export function castleCells(o) {
    const { x, z, G, face } = o;
    const st = castleStyle(o.seed);
    const map = new Map(); // key -> block (a later write wins)
    const part = new Map(); // key -> PART
    const K = (a, b, l) => ((a + 128) * 256 + (b + 128)) * 256 + (l + 64);
    const put = (a, b, l, t, p = PART.RISE) => { const k = K(a, b, l); map.set(k, t); part.set(k, t === BLOCK.AIR ? PART.AIR : p); };
    const box = (a0, a1, l0, l1, b0, b1, t, p) => {
        for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++) for (let b = Math.min(b0, b1); b <= Math.max(b0, b1); b++) {
            for (let l = Math.min(l0, l1); l <= Math.max(l0, l1); l++) put(a, b, l, t, p);
        }
    };
    const fill = [];
    const { W, Lw } = frame(o);
    // ---- the place: bumps, bushes and trees cleared (up to 14 m), the foundation laid, the floors
    for (let a = EXT.a0; a <= EXT.a1; a++) for (let b = EXT.b0; b <= EXT.b1; b++) {
        for (let l = 0; l <= 14; l++) put(a, b, l, BLOCK.AIR);
        const [wx, wz] = W(a, b);
        for (let l = -6; l <= -2; l++) fill.push(wx, Lw(l), wz, BLOCK.STONE);
        put(a, b, -1, BLOCK.GRASS);
    }
    // the courtyard's paving and the path to the gate
    box(-YARD_A + 1, YARD_A - 1, -1, -1, FRONT + 1, KEEP_B0 - 1, BLOCK.COBBLE);
    box(-2, 2, -1, -1, FRONT - 4, FRONT, BLOCK.PATH);
    box(-2, 2, -1, -1, FRONT + 1, KEEP_B0 - 1, BLOCK.PATH);
    // the palace's floor
    box(-KEEP_A, KEEP_A, -1, -1, KEEP_B0, KEEP_B1, st.floor);
    // ---- the courtyard's walls with battlements, the gatehouse
    const wall = (a0, a1, b0, b1, top, t = st.wall) => {
        box(a0, a1, 0, top, b0, b1, t);
        box(a0, a1, top + 1, top + 1, b0, b1, st.trim, PART.TOP); // (the coping)
        for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++) for (let b = Math.min(b0, b1); b <= Math.max(b0, b1); b++) {
            if ((a + b) % 2 === 0) put(a, b, top + 2, st.wall, PART.TOP); // (the merlons)
        }
    };
    wall(-YARD_A, -8, FRONT, FRONT + 1, 9); wall(8, YARD_A, FRONT, FRONT + 1, 9);
    wall(-YARD_A, -YARD_A + 1, FRONT, KEEP_B0 - 1, 9); wall(YARD_A - 1, YARD_A, FRONT, KEEP_B0 - 1, 9);
    // the gatehouse: a thick wall between its towers, the gate's arch, a banner over it
    wall(-9, 9, FRONT, FRONT + 2, 15);
    box(-GATE_HALF, GATE_HALF, 0, GATE_H - 1, FRONT, FRONT + 2, BLOCK.AIR);
    box(-GATE_HALF + 1, GATE_HALF - 1, GATE_H, GATE_H, FRONT, FRONT + 2, BLOCK.AIR); // (the arch)
    box(-GATE_HALF - 1, GATE_HALF + 1, GATE_H + 1, GATE_H + 1, FRONT - 1, FRONT - 1, st.trim, PART.TOP);
    box(-1, 1, GATE_H + 2, 14, FRONT - 1, FRONT - 1, st.banner, PART.TOP);
    // ---- the palace: the wings (l 0..9, a flat roof with battlements), the hall rising over them
    box(-KEEP_A, KEEP_A, 0, WING_TOP, KEEP_B0, KEEP_B0, st.wall); box(-KEEP_A, KEEP_A, 0, WING_TOP, KEEP_B1, KEEP_B1, st.wall);
    box(-KEEP_A, -KEEP_A, 0, WING_TOP, KEEP_B0, KEEP_B1, st.wall); box(KEEP_A, KEEP_A, 0, WING_TOP, KEEP_B0, KEEP_B1, st.wall);
    box(-KEEP_A, KEEP_A, 1, 1, KEEP_B0 - 0, KEEP_B0, st.trim); // (a band of pale stone low round it)
    for (const s of [-1, 1]) {
        const a0 = s * (HALL_A + 1), a1 = s * (KEEP_A - 1);
        box(a0, a1, WING_TOP + 1, WING_TOP + 1, KEEP_B0 + 1, KEEP_B1 - 1, st.trim, PART.TOP); // the wing's roof
        for (let b = KEEP_B0; b <= KEEP_B1; b++) if (b % 2 === 0) put(s * KEEP_A, b, WING_TOP + 1, st.wall, PART.TOP);
        for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++) if (a % 2 === 0) { put(a, KEEP_B0, WING_TOP + 1, st.wall, PART.TOP); put(a, KEEP_B1, WING_TOP + 1, st.wall, PART.TOP); }
    }
    // the hall's own walls, high over the wings
    box(-HALL_A, -HALL_A, 0, HALL_TOP, KEEP_B0, KEEP_B1, st.wall); box(HALL_A, HALL_A, 0, HALL_TOP, KEEP_B0, KEEP_B1, st.wall);
    box(-HALL_A, HALL_A, 0, HALL_TOP, KEEP_B0, KEEP_B0, st.wall); box(-HALL_A, HALL_A, 0, HALL_TOP, KEEP_B1, KEEP_B1, st.wall);
    box(-HALL_A, HALL_A, HALL_TOP - 3, HALL_TOP - 3, KEEP_B0, KEEP_B0, st.trim); box(-HALL_A, HALL_A, HALL_TOP - 3, HALL_TOP - 3, KEEP_B1, KEEP_B1, st.trim);
    // the palace's doors (5 wide, 6 high, an arch over them) and the doorways into the wings
    box(-DOOR_HALF, DOOR_HALF, 0, DOOR_H - 1, KEEP_B0, KEEP_B0, BLOCK.AIR);
    box(-DOOR_HALF + 1, DOOR_HALF - 1, DOOR_H, DOOR_H, KEEP_B0, KEEP_B0, BLOCK.AIR);
    box(-DOOR_HALF - 1, DOOR_HALF + 1, DOOR_H + 1, DOOR_H + 1, KEEP_B0, KEEP_B0, st.trim);
    for (const s of [-1, 1]) box(s * HALL_A, s * HALL_A, 0, 4, 0, 2, BLOCK.AIR);
    // the right wing: the dining hall in front, the treasury behind its own wall and iron door
    box(HALL_A + 1, KEEP_A - 1, 0, WING_TOP, 7, 7, st.wall);
    box(10, 12, 0, 4, 7, 7, BLOCK.AIR);
    // ---- windows: the hall's high ones, the wings' outer ones, the round one in the front gable
    for (const s of [-1, 1]) for (let b = -4; b <= 16; b += 5) box(s * HALL_A, s * HALL_A, 12, 16, b, b, BLOCK.AIR);
    for (const s of [-1, 1]) for (const b of [-3, 3, 9, 15]) box(s * KEEP_A, s * KEEP_A, 3, 5, b, b, BLOCK.AIR);
    for (const a of [-12, -4, 4, 12]) box(a, a, 3, 5, KEEP_B1, KEEP_B1, BLOCK.AIR);
    // ---- the hall's roof: steep, slate, along b; its gables of stone
    const R = HALL_TOP + 1;
    for (let k = 0; k <= HALL_A + 1; k++) {
        const a0 = -HALL_A - 1 + k, a1 = HALL_A + 1 - k;
        for (const kk of [0, 1]) box(a0, a1, R + 2 * k + kk, R + 2 * k + kk, KEEP_B0 - 1, KEEP_B1 + 1, st.roof, PART.TOP);
        if (a1 - a0 >= 2) {
            for (const kk of [0, 1]) box(a0 + 1, a1 - 1, R + 2 * k + kk, R + 2 * k + kk, KEEP_B0 + 1, KEEP_B1 - 1, BLOCK.AIR);
            for (const kk of [0, 1]) { box(a0 + 1, a1 - 1, R + 2 * k + kk, R + 2 * k + kk, KEEP_B0, KEEP_B0, st.wall, PART.TOP); box(a0 + 1, a1 - 1, R + 2 * k + kk, R + 2 * k + kk, KEEP_B1, KEEP_B1, st.wall, PART.TOP); }
        }
    }
    put(0, KEEP_B0 - 1, R + 2 * (HALL_A + 1) + 2, BLOCK.GOLD, PART.TOP);
    // the round window of the front gable (its glass: castleLayout)
    for (let a = -2; a <= 2; a++) for (let l = 20; l <= 24; l++) if (a * a + (l - 22) * (l - 22) <= 5) put(a, KEEP_B0, l, BLOCK.AIR);
    // ---- inside: the throne hall
    box(-1, 1, -1, -1, KEEP_B0 + 1, KEEP_B1 - 5, st.banner); // the carpet from the doors to the throne
    box(-4, 4, 0, 0, KEEP_B1 - 4, KEEP_B1 - 1, st.trim); // the dais
    box(-3, 3, 0, 0, KEEP_B1 - 3, KEEP_B1 - 1, st.banner);
    box(-1, 1, 1, 1, KEEP_B1 - 2, KEEP_B1 - 1, BLOCK.GOLD); // the seat
    box(-1, 1, 2, 7, KEEP_B1 - 1, KEEP_B1 - 1, BLOCK.GOLD); // the back, high
    put(0, KEEP_B1 - 1, 8, BLOCK.GOLD);
    box(-2, -2, 1, 2, KEEP_B1 - 2, KEEP_B1 - 1, BLOCK.GOLD); box(2, 2, 1, 2, KEEP_B1 - 2, KEEP_B1 - 1, BLOCK.GOLD); // armrests
    box(-3, 3, 9, 14, KEEP_B1 - 1, KEEP_B1 - 1, st.banner); // a great banner behind it
    for (const s of [-1, 1]) {
        put(s * 3, KEEP_B1 - 1, 1, BLOCK.LANTERN); put(s * 3, KEEP_B1 - 1, 2, BLOCK.LANTERN);
        for (let b = -5; b <= 17; b += 5) { put(s * (HALL_A - 1), b, 7, BLOCK.LANTERN); box(s * (HALL_A - 1), s * (HALL_A - 1), 8, 11, b + 2, b + 2, st.banner); }
        // pillars along the hall
        for (let b = -3; b <= 14; b += 5) box(s * 4, s * 4, 0, HALL_TOP, b, b, st.trim);
    }
    for (const cb of [0, 10]) { // chandeliers of gold
        box(0, 0, 14, HALL_TOP, cb, cb, BLOCK.GOLD);
        box(-2, 2, 13, 13, cb, cb, BLOCK.GOLD); box(0, 0, 13, 13, cb - 2, cb + 2, BLOCK.GOLD);
        for (const [a, b] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) put(a, cb + b, 12, BLOCK.LANTERN);
    }
    // the wings inside: lanterns; a long table in the dining hall; carpets
    for (const s of [-1, 1]) for (let b = -4; b <= 16; b += 6) put(s * 11.5 | 0, b, WING_TOP, BLOCK.LANTERN);
    box(10, 13, 0, 1, -4, 3, BLOCK.PLANKS_DARK);
    box(-14, -9, -1, -1, -6, 18, BLOCK.CARPET_BLUE);
    box(9, 15, -1, -1, 9, 19, BLOCK.CARPET_RED);
    put(15, 13, 3, BLOCK.LANTERN);
    // ---- the towers: round shells rising out of the ground, battlements, a pointed spire with gold
    const tower = (ca, cb, r, l0, top, spire, rise = true) => {
        const R0 = Math.ceil(r + 1.5);
        for (let a = -R0; a <= R0; a++) for (let b = -R0; b <= R0; b++) {
            const d = Math.hypot(a, b);
            if (d > r + 0.5) continue;
            const inside = d < r - 0.7;
            for (let l = l0; l <= top; l++) put(ca + a, cb + b, l, inside ? BLOCK.AIR : st.wall, rise ? PART.RISE : PART.TOP);
            if (l0 === 0) put(ca + a, cb + b, -1, st.floor);
        }
        // narrow windows round it, every 6 layers (into its hollow)
        for (let l = l0 + 5; l < top - 2; l += 6) for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const wa = Math.round(ca + da * r), wb = Math.round(cb + db * r);
            put(wa, wb, l, BLOCK.AIR); put(wa, wb, l + 1, BLOCK.AIR);
        }
        // a corbelled ring and its merlons
        for (let a = -R0; a <= R0; a++) for (let b = -R0; b <= R0; b++) {
            const d = Math.hypot(a, b);
            if (d > r + 1.2) continue;
            if (d > r - 0.7) put(ca + a, cb + b, top + 1, st.trim, PART.TOP);
            if (d > r + 0.3 && (a + b) % 2 === 0) put(ca + a, cb + b, top + 2, st.wall, PART.TOP);
        }
        // the spire: a cone of slate from the ring up to a point, a gold finial
        for (let k = 0; k <= spire; k++) {
            const rr = (r + 0.6) * (1 - k / (spire + 1)) ** 1.15;
            const Ri = Math.ceil(rr);
            for (let a = -Ri; a <= Ri; a++) for (let b = -Ri; b <= Ri; b++) {
                const d = Math.hypot(a, b);
                if (d <= rr + 0.25 && (d > rr - 1.3 || k === 0)) put(ca + a, cb + b, top + 2 + k, st.roof, PART.TOP);
            }
        }
        put(ca, cb, top + 3 + spire, BLOCK.GOLD, PART.TOP); put(ca, cb, top + 4 + spire, BLOCK.GOLD, PART.TOP);
        // a banner on its front
        if (rise && r >= 3) box(ca, ca, top - 8, top - 3, cb - Math.ceil(r) - 0, cb - Math.ceil(r) - 0, st.banner, PART.TOP);
    };
    for (const [a, b, r, top, sp] of TOWERS) tower(a, b, r, 0, top, sp);
    for (const [a, b, r, l0, top, sp] of TURRETS) tower(a, b, r, l0, top, sp, false);
    // the courtyard and the gate kept clear of the towers' bases (their round shells may touch them)
    box(-GATE_HALF, GATE_HALF, 0, GATE_H - 1, FRONT, FRONT + 2, BLOCK.AIR);
    box(-DOOR_HALF, DOOR_HALF, 0, DOOR_H - 1, KEEP_B0, KEEP_B0, BLOCK.AIR);
    // ---- the result in its order
    const air = [], rise = [], top = [];
    for (const [k, t] of map) {
        const l = (k % 256) - 64, b = (Math.floor(k / 256) % 256) - 128, a = Math.floor(k / 65536) - 128;
        const [wx, wz] = W(a, b);
        const c = [wx, Lw(l), wz, t, part.get(k), a, b];
        (c[4] === PART.AIR ? air : c[4] === PART.RISE ? rise : top).push(c);
    }
    air.sort((p, q) => q[1] - p[1]);
    // (rising: layer by layer from the ground, all the castle at once — it grows out of the earth)
    rise.sort((p, q) => p[1] - q[1] || (Math.abs(p[5]) + Math.abs(p[6])) - (Math.abs(q[5]) + Math.abs(q[6])));
    // (built on: piece by piece — each piece (a tower's top, a roof) from its lowest layer up, the nearest to the middle first)
    const piece = (c) => Math.round(Math.hypot(c[5], c[6] - 4) / 6);
    top.sort((p, q) => piece(p) - piece(q) || p[1] - q[1]);
    const all = [...air, ...rise, ...top];
    const cells = new Int32Array(all.length * 5);
    all.forEach((c, i) => { cells[i * 5] = c[0]; cells[i * 5 + 1] = c[1]; cells[i * 5 + 2] = c[2]; cells[i * 5 + 3] = c[3]; cells[i * 5 + 4] = c[4]; });
    return { cells, fill: Int32Array.from(fill), n: all.length, nAir: air.length, nRise: rise.length };
}
