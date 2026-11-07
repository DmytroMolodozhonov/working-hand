/**
 * SchoolLand.js — the land of the mode «Школа Акселдорф» (docs/rules/school.md; the author 07.11): a valley of its own with the school
 * castle Akseldorf in the middle, a lake beyond its walls, the road the carriage comes by, woods and hills round it — nothing else
 * (no other castles, caves or creatures). Pure (no THREE): made in the terrain workers (Terrain `school`), the same on every computer.
 *
 * The castle is in the spirit of an old school of magic, but its own — no names, crests or houses of any book:
 *   - the CURTAIN WALL (60 × 120 m inside) with merlons and a wall-walk, four round CORNER TOWERS with tall slate spires;
 *   - the GATEHOUSE in the south: two round towers and a tall pointed archway (8 × 12 m), the road from the valley's edge to it;
 *   - the COURTYARD (flagstones, a round fountain, lamp posts);
 *   - the GREAT HALL in the north (32 × 48 m inside, walls 20 m, a steep slate roof): tall pointed windows, banners between them,
 *     four long tables with benches, the teachers' dais with their long table and the Director's high chair, floating candles
 *     (arcane lamps) under the roof, a rose window over the door;
 *   - the WINGS round the courtyard (one storey of 8 m, slate roofs): the classrooms — defence against the dark arts, potions
 *     (cauldron hearths), pentagrams, the history of the world — the dormitory and the library (shelves of books);
 *   - the ASTRONOMY TOWER, the highest, over the north-east corner.
 * Measures from the world's: a block 1 m, the hero 3.5 m, doors 3 × 6 (the hall's 6 × 9), passages ≥ 3, a table 2 m (at the waist),
 * a bench 1 m, a storey 8 m.
 */
import { BLOCK, CHUNK, MIN_LAYER, MAX_LAYER, OLD_BEDROCK } from './Terrain.js';
import { roofShapes } from './PlanSlopes.js';

export const SCHOOL = {
    G: 20, // the castle's ground (top layer of the valley floor there)
    WALL: { u: 60, v0: -78, v1: 50 }, // the curtain wall's line (inner half-width, north and south)
    LAKE: { x: 125, z: 70, r: 48 }, // the lake beyond the walls (south-east)
    EDGE: 260, // m: the valley's woods and hills begin; beyond — the hills close it in
    ROAD: { w: 3, z1: 250 }, // the road from the gate (z 50) south to the valley's edge
    ARRIVE: { x: 0, z: 225 }, // where the carriage starts
    GATE: { x: 0, z: 50 },
};

const fract = (x) => x - Math.floor(x);
const hash = (x, z, s = 0) => fract(Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453);
function vnoise(x, z, s) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz, s), b = hash(ix + 1, iz, s), c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** The valley's top layer at (x, z): flat round the castle, a gentle roll beyond, the lake's bowl, hills closing it at the edge. */
export function schoolHeight(x, z) {
    const S = SCHOOL, r = Math.hypot(x, z * 0.85);
    const roll = (vnoise(x * 0.025, z * 0.025, 3) - 0.5) * 5 + (vnoise(x * 0.08, z * 0.08, 4) - 0.5) * 1.5;
    const flat = Math.max(0, Math.min(1, (r - 110) / 60)); // (the castle's plateau, then the land rolls)
    let h = S.G + roll * flat;
    // the road: level with the valley, a little worn into it
    if (Math.abs(x) <= S.ROAD.w + 1 && z > S.WALL.v1 && z < S.ROAD.z1) h = S.G + roll * flat * 0.3;
    // the lake's bowl
    const dl = Math.hypot(x - S.LAKE.x, z - S.LAKE.z) / S.LAKE.r;
    if (dl < 1.25) { const k = Math.max(0, 1 - dl); h = Math.min(h, S.G - 1 - Math.round(7 * Math.sqrt(k)) + (dl > 1 ? (dl - 1) * 4 : 0)); }
    // the hills at the valley's edge: rising, wooded, steep at last — no way out
    if (r > S.EDGE) { const k = (r - S.EDGE) / 50; h += k * k * 22 + vnoise(x * 0.05, z * 0.05, 7) * 6 * Math.min(1, k); }
    return Math.round(h);
}

/** Water (the lake) here up to this layer, else null. */
export function schoolWater(x, z) {
    const dl = Math.hypot(x - SCHOOL.LAKE.x, z - SCHOOL.LAKE.z) / SCHOOL.LAKE.r;
    return dl < 1.05 ? SCHOOL.G - 1 : null;
}

/** Is (x, z) inside the castle's walls (flagstones, no trees, the light of the rooms)? */
export const inSchoolWalls = (x, z) => Math.abs(x) <= SCHOOL.WALL.u + 8 && z >= SCHOOL.WALL.v0 - 8 && z <= SCHOOL.WALL.v1 + 8;

/** Where a tree stands near (x, z) on a grid cell (null: none) — the woods thicken toward the edge, none on the road, the lake, inside. */
export function schoolTree(cx, cz) {
    const x = cx * 9 + Math.floor(hash(cx, cz, 21) * 7), z = cz * 9 + Math.floor(hash(cx, cz, 22) * 7);
    const r = Math.hypot(x, z * 0.85);
    if (inSchoolWalls(x, z) || r < 95) return null;
    if (Math.abs(x) <= SCHOOL.ROAD.w + 5 && z > 0 && z < SCHOOL.ROAD.z1 + 10) return null;
    if (Math.hypot(x - SCHOOL.LAKE.x, z - SCHOOL.LAKE.z) < SCHOOL.LAKE.r + 6) return null;
    const dens = r > SCHOOL.EDGE - 30 ? 0.85 : r > 170 ? 0.4 : 0.12;
    if (hash(cx, cz, 23) > dens) return null;
    return { x, z, kind: [1, 2, 3, 1, 5][Math.floor(hash(cx, cz, 24) * 5)] };
}

// ------------------------------------------------------------------ the castle
const TAU = Math.PI * 2;

/** The castle's plan: its parts (boxes k 0, discs/rings k 1, roof ramps k 3) and where things are. Fixed at (0, 0): gates to the south (+z). */
export function schoolCastlePlan() {
    const B = BLOCK; // (read here, not at the module's top: Terrain.js imports this file — its BLOCK is not ready then)
    const S = SCHOOL, F = S.G, parts = [];
    const box = (x0, x1, z0, z1, L0, L1, t) => parts.push({ k: 0, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), L0, L1, t });
    const cyl = (cx, cz, r, hr, L0, L1, t) => { const q = Math.ceil(r); parts.push({ k: 1, cx, cz, r, hr, x0: Math.floor(cx - q), x1: Math.ceil(cx + q), z0: Math.floor(cz - q), z1: Math.ceil(cz + q), L0, L1, t }); };
    const roofOf = (start) => { const sp = roofShapes(parts.slice(start), [B.ROOF_SLATE, B.ROOF_BLUE]); if (sp) parts.push(sp); };
    const STONE = B.CS_GREY, TRIM = B.CS_WHITE, DARK = B.CS_DARK, MOSS = B.CS_MOSSY;

    /** A round tower with string courses, lancet windows, a gallery and a tall slate cone with a gilt finial. */
    const tower = (cx, cz, r, h, cone, roof = B.ROOF_SLATE) => {
        const top = F + h;
        cyl(cx, cz, r, r - 1.4, F + 1, top, STONE);
        cyl(cx, cz, r + 0.5, -1, F + 1, F + 2, MOSS); // (the mossy plinth)
        for (let L = F + 8; L < top - 2; L += 8) cyl(cx, cz, r + 0.35, r - 1, L, L, TRIM);
        for (let L = F + 6; L < top - 4; L += 8) for (let k = 0; k < 4; k++) {
            const a = (k / 4) * TAU + 0.6 + L * 0.13, wx = Math.round(cx + Math.sin(a) * (r - 0.6)), wz = Math.round(cz + Math.cos(a) * (r - 0.6));
            box(wx, wx, wz, wz, L, L + 2, B.AIR);
        }
        cyl(cx, cz, r + 1, r - 0.5, top + 1, top + 1, TRIM); // (the gallery's floor)
        for (let k = 0; k < 16; k += 2) { const a = (k / 16) * TAU, mx = Math.round(cx + Math.sin(a) * (r + 0.5)), mz = Math.round(cz + Math.cos(a) * (r + 0.5)); box(mx, mx, mz, mz, top + 2, top + 2, STONE); }
        const s0 = parts.length, steps = Math.max(3, Math.round(cone / 2));
        for (let i = 0; i < steps; i++) cyl(cx, cz, Math.max(0.5, r - (i * r) / steps), -1, top + 2 + i * 2, top + 3 + i * 2, roof);
        roofOf(s0);
        const tip = top + 3 + steps * 2;
        box(cx, cx, cz, cz, tip, tip + 2, B.GOLD);
        return top;
    };
    /** A hall-like wing: walls, a floor, a steep slate roof (ridge along its long side), windows, a door. */
    const wing = (x0, x1, z0, z1, wallH, roof, axisX) => {
        box(x0, x1, z0, z1, F, F, B.PLANKS);
        box(x0, x1, z0, z1, F + 1, F + wallH, STONE);
        box(x0 + 1, x1 - 1, z0 + 1, z1 - 1, F + 1, F + wallH, B.AIR);
        box(x0, x1, z0, z1, F + 1, F + 1, MOSS); box(x0 + 1, x1 - 1, z0 + 1, z1 - 1, F + 1, F + 1, B.AIR); // (a mossy foot)
        box(x0, x1, z0, z1, F + wallH, F + wallH, TRIM); box(x0 + 1, x1 - 1, z0 + 1, z1 - 1, F + wallH, F + wallH, B.AIR); // (the eaves' band)
        const s0 = parts.length, half = Math.ceil((axisX ? z1 - z0 : x1 - x0) / 2);
        for (let i = 0; i <= half; i++) {
            if (axisX) box(x0 - 1, x1 + 1, z0 - 1 + i, z1 + 1 - i, F + wallH + 1 + i, F + wallH + 1 + i, roof);
            else box(x0 - 1 + i, x1 + 1 - i, z0 - 1, z1 + 1, F + wallH + 1 + i, F + wallH + 1 + i, roof);
        }
        roofOf(s0);
        // the gables up under the roof
        for (let i = 0; i <= half; i++) {
            if (axisX) for (const x of [x0, x1]) box(x, x, z0 + i, z1 - i, F + wallH + 1 + i, F + wallH + 1 + i, STONE);
            else for (const z of [z0, z1]) box(x0 + i, x1 - i, z, z, F + wallH + 1 + i, F + wallH + 1 + i, STONE);
        }
    };
    /** Pointed windows along a wall (x fixed or z fixed), every `step` m, sills F+3. */
    const windowsAlong = (fixed, isX, a0, a1, step, h = 4) => {
        for (let a = a0; a <= a1; a += step) {
            if (isX) { box(fixed, fixed, a, a + 1, F + 3, F + 3 + h, B.AIR); box(fixed, fixed, a, a, F + 4 + h, F + 4 + h, B.AIR); }
            else { box(a, a + 1, fixed, fixed, F + 3, F + 3 + h, B.AIR); box(a, a, fixed, fixed, F + 4 + h, F + 4 + h, B.AIR); }
        }
    };
    const door = (x0, x1, z0, z1, h = 6) => box(x0, x1, z0, z1, F + 1, F + h, B.AIR);

    // ---- the courtyard: flagstones in two greys, a border of white stone
    const W = S.WALL;
    for (let z = W.v0 + 2; z <= W.v1 - 2; z += 4) for (let x = -W.u + 2; x <= W.u - 2; x += 4) box(x, Math.min(x + 3, W.u - 2), z, Math.min(z + 3, W.v1 - 2), F, F, ((x + z) / 4) & 1 ? STONE : TRIM);
    // ---- the curtain wall: 2 thick, 12 high, a wall-walk and merlons; mossy at its foot
    const WH = 12;
    for (const [x0, x1, z0, z1] of [[-W.u - 2, W.u + 2, W.v0 - 2, W.v0 - 1], [-W.u - 2, W.u + 2, W.v1 + 1, W.v1 + 2], [-W.u - 2, -W.u - 1, W.v0 - 2, W.v1 + 2], [W.u + 1, W.u + 2, W.v0 - 2, W.v1 + 2]]) {
        box(x0, x1, z0, z1, F + 1, F + WH, STONE);
        box(x0, x1, z0, z1, F + 1, F + 2, MOSS);
        box(x0, x1, z0, z1, F + WH, F + WH, TRIM);
    }
    for (let x = -W.u - 2; x <= W.u + 2; x += 2) for (const z of [W.v0 - 2, W.v1 + 2]) box(x, x, z, z, F + WH + 1, F + WH + 1, STONE);
    for (let z = W.v0 - 2; z <= W.v1 + 2; z += 2) for (const x of [-W.u - 2, W.u + 2]) box(x, x, z, z, F + WH + 1, F + WH + 1, STONE);
    // the four corner towers
    for (const [x, z] of [[-W.u - 2, W.v0 - 2], [W.u + 2, W.v0 - 2], [-W.u - 2, W.v1 + 2], [W.u + 2, W.v1 + 2]]) tower(x, z, 6, 30, 16);

    // ---- the gatehouse: two towers, the archway 8 wide, 12 high (pointed), the road's carpet of path to it
    const GZ = W.v1 + 1;
    for (const s of [-1, 1]) tower(s * 9, GZ, 5, 24, 14, B.ROOF_BLUE);
    box(-6, 6, GZ - 3, GZ + 3, F + 1, F + 16, STONE); // (the gate's block between the towers)
    box(-6, 6, GZ - 3, GZ + 3, F + 16, F + 16, TRIM);
    for (let x = -6; x <= 6; x += 2) for (const z of [GZ - 3, GZ + 3]) box(x, x, z, z, F + 17, F + 17, STONE);
    box(-4, 4, GZ - 3, GZ + 3, F + 1, F + 12, B.AIR); box(-3, 3, GZ - 3, GZ + 3, F + 13, F + 13, B.AIR); box(-2, 2, GZ - 3, GZ + 3, F + 14, F + 14, B.AIR);
    box(-1, 1, GZ + 3, GZ + 3, F + 15, F + 15, B.GOLD); // (a gilt keystone)
    box(-3, 3, GZ - 3, GZ + 3, F, F, B.PATH);

    // ---- the GREAT HALL: inside 32 × 48, walls 2 thick and 20 high, a steep slate roof
    const HX = 17, HZ0 = W.v0 + 2, HZ1 = HZ0 + 50, HH = 20;
    box(-HX, HX, HZ0, HZ1, F, F, B.CS_WHITE);
    for (let z = HZ0 + 2; z < HZ1 - 1; z += 2) for (let x = -HX + 2; x < HX - 1; x += 2) box(x, x, z, z, F, F, ((x + z) / 2) & 1 ? DARK : TRIM); // (a chequered floor)
    box(-HX, HX, HZ0, HZ1, F + 1, F + HH, STONE);
    box(-HX + 2, HX - 2, HZ0 + 2, HZ1 - 2, F + 1, F + HH, B.AIR);
    box(-HX, HX, HZ0, HZ1, F + 1, F + 2, MOSS); box(-HX + 2, HX - 2, HZ0 + 2, HZ1 - 2, F + 1, F + 2, B.AIR);
    box(-HX, HX, HZ0, HZ1, F + 10, F + 10, TRIM); box(-HX + 2, HX - 2, HZ0 + 2, HZ1 - 2, F + 10, F + 10, B.AIR);
    // buttresses with pinnacles along its long sides
    for (let z = HZ0 + 4; z <= HZ1 - 4; z += 7) for (const s of [-1, 1]) {
        box(s * (HX + 1), s * (HX + 2), z, z + 1, F + 1, F + 16, STONE);
        box(s * (HX + 1), s * (HX + 1), z, z, F + 17, F + 19, TRIM);
        box(s * (HX + 1), s * (HX + 1), z, z, F + 20, F + 20, B.GOLD);
    }
    // tall pointed windows between them, banners inside between the windows
    for (let z = HZ0 + 7; z <= HZ1 - 6; z += 7) for (const s of [-1, 1]) {
        box(s * HX, s * (HX - 1), z, z + 1, F + 5, F + 15, B.AIR);
        box(s * HX, s * (HX - 1), z, z, F + 16, F + 17, B.AIR);
        const bz = z + 3;
        if (bz < HZ1 - 3) { box(s * (HX - 2), s * (HX - 2), bz, bz + 1, F + 8, F + 16, (z / 7) & 1 ? B.CARPET_PURPLE : B.CARPET_BLUE); box(s * (HX - 2), s * (HX - 2), bz, bz + 1, F + 7, F + 7, B.GOLD); }
    }
    // the roof: slate slabs stepping in to a ridge (ramps), gables of stone
    const r0 = parts.length;
    for (let i = 0; i <= HX; i++) box(-HX - 1 + i, HX + 1 - i, HZ0 - 1, HZ1 + 1, F + HH + 1 + i, F + HH + 1 + i, B.ROOF_SLATE);
    roofOf(r0);
    for (const z of [HZ0, HZ1]) for (let i = 0; i <= HX; i++) box(-HX + i, HX - i, z, z, F + HH + 1 + i, F + HH + 1 + i, STONE);
    // the door to the courtyard (6 × 9, pointed) and a rose window over it
    door(-3, 3, HZ1 - 1, HZ1, 8); box(-2, 2, HZ1 - 1, HZ1, F + 9, F + 9, B.AIR); box(-4, 4, HZ1, HZ1, F + 10, F + 10, TRIM);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU, rx = Math.round(Math.sin(a) * 3), rl = Math.round(Math.cos(a) * 3); box(rx, rx, HZ1, HZ1, F + 15 + rl, F + 15 + rl, B.ARCANE_LAMP); }
    box(0, 0, HZ1, HZ1, F + 15, F + 15, B.GOLD);
    // the four long tables (2 high: at the waist; 2 wide), benches either side (1 high), a runner down the middle
    const TZ0 = HZ0 + 14, TZ1 = HZ1 - 6;
    for (const tx of [-11, -5, 4, 10]) {
        box(tx, tx + 1, TZ0, TZ1, F + 2, F + 2, B.PLANKS_DARK);
        for (let z = TZ0; z <= TZ1; z += 6) box(tx, tx + 1, z, z, F + 1, F + 1, B.PLANKS_DARK); // (the legs)
        box(tx - 1, tx - 1, TZ0, TZ1, F + 1, F + 1, B.PLANKS); box(tx + 2, tx + 2, TZ0, TZ1, F + 1, F + 1, B.PLANKS); // (benches)
        for (let z = TZ0 + 2; z <= TZ1 - 2; z += 5) box(tx, tx + 1, z, z, F + 3, F + 3, B.LANTERN); // (candles on the tables)
    }
    box(-1, 0, TZ0 - 4, HZ1 - 2, F, F, B.CARPET_RED);
    // the teachers' dais at the north end: two steps, the long table across, the Director's high chair in the middle
    const DZ = HZ0 + 2;
    box(-HX + 2, HX - 2, DZ, DZ + 8, F + 1, F + 1, DARK);
    box(-HX + 4, HX - 4, DZ, DZ + 6, F + 2, F + 2, DARK);
    box(-10, 10, DZ + 4, DZ + 5, F + 4, F + 4, B.PLANKS_DARK); // (the teachers' table: on the dais, at the waist)
    for (let x = -10; x <= 10; x += 5) box(x, x, DZ + 4, DZ + 5, F + 3, F + 3, B.PLANKS_DARK);
    box(-10, 10, DZ + 4, DZ + 5, F + 5, F + 5, B.AIR);
    for (let x = -9; x <= 9; x += 3) box(x, x, DZ + 2, DZ + 2, F + 3, F + 3, B.PLANKS); // (the teachers' seats)
    box(-1, 1, DZ + 1, DZ + 2, F + 3, F + 3, B.CARPET_PURPLE); // (the Director's seat)
    box(-1, 1, DZ, DZ, F + 3, F + 9, B.PLANKS_DARK); box(0, 0, DZ, DZ, F + 10, F + 11, B.GOLD); // (its high back, a gilt crest)
    box(-1, 1, DZ + 1, DZ + 1, F + 4, F + 8, B.CARPET_PURPLE);
    for (const s of [-1, 1]) box(s * 12, s * 12, DZ + 3, DZ + 3, F + 3, F + 6, B.GOLD), box(s * 12, s * 12, DZ + 3, DZ + 3, F + 7, F + 7, B.LANTERN); // (candelabra)
    // the floating candles: arcane lamps in rows under the roof
    for (let z = HZ0 + 6; z <= HZ1 - 4; z += 5) for (let x = -12; x <= 12; x += 6) box(x + ((z / 5) & 1) * 3, x + ((z / 5) & 1) * 3, z, z, F + 14 + ((x + z) & 1), F + 14 + ((x + z) & 1), B.ARCANE_LAMP);

    // ---- the WINGS round the courtyard (one storey, 8 high)
    const WS = 8;
    // west: the potions classroom (north) and the history classroom (south)
    const wxo = -W.u, wxi = -HX - 6;
    wing(wxo, wxi, HZ0, HZ0 + 24, WS, B.ROOF_SLATE, false);
    wing(wxo, wxi, HZ0 + 26, HZ0 + 50, WS, B.ROOF_SLATE, false);
    // east: defence against the dark arts (north, the big one) and pentagrams (south)
    const exi = HX + 6, exo = W.u;
    wing(exi, exo, HZ0, HZ0 + 24, WS, B.ROOF_SLATE, false);
    wing(exi, exo, HZ0 + 26, HZ0 + 50, WS, B.ROOF_SLATE, false);
    // south-west: the library; south-east: the dormitory (along the courtyard's sides, toward the gate)
    const SZ0 = HZ1 + 10, SZ1 = W.v1 - 10;
    wing(-W.u, -W.u + 22, SZ0, SZ1, WS, B.ROOF_BLUE, true);
    wing(W.u - 22, W.u, SZ0, SZ1, WS, B.ROOF_BLUE, true);
    // their doors (3 × 6) to the courtyard and windows
    for (const [x0, x1, z0, z1] of [[wxi - 1, wxi, HZ0 + 11, HZ0 + 13], [wxi - 1, wxi, HZ0 + 37, HZ0 + 39], [exi, exi + 1, HZ0 + 11, HZ0 + 13], [exi, exi + 1, HZ0 + 37, HZ0 + 39],
        [-W.u + 21, -W.u + 22, (SZ0 + SZ1) / 2 - 1 | 0, ((SZ0 + SZ1) / 2 | 0) + 1], [W.u - 22, W.u - 21, (SZ0 + SZ1) / 2 - 1 | 0, ((SZ0 + SZ1) / 2 | 0) + 1]]) door(x0, x1, z0, z1);
    for (const [zA, zB] of [[HZ0 + 3, HZ0 + 21], [HZ0 + 29, HZ0 + 47]]) { windowsAlong(wxi, true, zA, zB, 5); windowsAlong(exi, true, zA, zB, 5); }
    windowsAlong(SZ1, false, -W.u + 3, -W.u + 19, 5); windowsAlong(SZ1, false, W.u - 19, W.u - 3, 5);
    // inside: the potions room's hearths (cauldrons go on them — the school's life), the library's shelves, the dormitory's beds' places
    for (let z = HZ0 + 5; z <= HZ0 + 19; z += 7) for (const x of [-48, -40]) { box(x - 1, x + 1, z - 1, z + 1, F + 1, F + 1, B.COBBLE); box(x, x, z, z, F + 1, F + 1, B.LANTERN); }
    for (let z = SZ0 + 3; z <= SZ1 - 3; z += 4) { box(-W.u + 2, -W.u + 2, z, z + 2, F + 1, F + 6, B.BOOKS); box(-W.u + 8, -W.u + 12, z, z, F + 1, F + 5, B.BOOKS); }
    // the pentagram room's floor: a great circle of runes; the defence room: a duelling strip
    cyl(39, HZ0 + 38, 8, 7, F, F, B.RUNE); box(30, 50, HZ0 + 12, HZ0 + 12, F, F, B.CARPET_BLUE);
    // lamps in the wings
    for (const [x, z] of [[-40, HZ0 + 12], [-40, HZ0 + 38], [40, HZ0 + 12], [40, HZ0 + 38], [-W.u + 11, (SZ0 + SZ1) / 2 | 0], [W.u - 11, (SZ0 + SZ1) / 2 | 0]]) box(x, x, z, z, F + 7, F + 7, B.ARCANE_LAMP);

    // ---- the courtyard: a round fountain (stone basin, water, a column with a gilt crown), lamp posts along the way
    const FZ = Math.round((HZ1 + W.v1) / 2);
    cyl(0, FZ, 6, 5, F + 1, F + 2, TRIM); cyl(0, FZ, 5, -1, F, F, B.CS_DARK); cyl(0, FZ, 5, -1, F + 1, F + 1, B.WATER);
    cyl(0, FZ, 1.2, -1, F + 1, F + 6, TRIM); box(0, 0, FZ, FZ, F + 7, F + 7, B.GOLD);
    for (let z = HZ1 + 4; z <= W.v1 - 4; z += 9) for (const s of [-1, 1]) { box(s * 7, s * 7, z, z, F + 1, F + 4, B.CS_DARK); box(s * 7, s * 7, z, z, F + 5, F + 5, B.LANTERN); }

    // ---- the astronomy tower, the highest, over the hall's north-east
    tower(HX + 3, HZ0 + 3, 5, 52, 16, B.ROOF_BLUE);

    const at = (x, z, L = F + 0.5) => ({ x, y: L, z });
    const out = {
        parts, F,
        hall: { x0: -HX + 2, x1: HX - 2, z0: HZ0 + 2, z1: HZ1 - 2, door: at(0, HZ1 + 2), dais: at(0, DZ + 3, F + 2.5), director: at(0, DZ + 1.5, F + 3.5), tables: [-11, -5, 4, 10].map((tx) => ({ x: tx + 0.5, z0: TZ0, z1: TZ1 })) },
        gate: at(0, GZ + 4), courtyard: at(0, FZ + 8), fountain: at(0, FZ),
        rooms: {
            potions: { x0: wxo + 1, x1: wxi - 1, z0: HZ0 + 1, z1: HZ0 + 23, door: at(wxi + 2, HZ0 + 12) },
            history: { x0: wxo + 1, x1: wxi - 1, z0: HZ0 + 27, z1: HZ0 + 49, door: at(wxi + 2, HZ0 + 38) },
            defence: { x0: exi + 1, x1: exo - 1, z0: HZ0 + 1, z1: HZ0 + 23, door: at(exi - 2, HZ0 + 12) },
            pentagrams: { x0: exi + 1, x1: exo - 1, z0: HZ0 + 27, z1: HZ0 + 49, door: at(exi - 2, HZ0 + 38) },
            library: { x0: -W.u + 1, x1: -W.u + 21, z0: SZ0 + 1, z1: SZ1 - 1, door: at(-W.u + 24, (SZ0 + SZ1) / 2) },
            dormitory: { x0: W.u - 21, x1: W.u - 1, z0: SZ0 + 1, z1: SZ1 - 1, door: at(W.u - 24, (SZ0 + SZ1) / 2) },
        },
        arrive: at(S.ARRIVE.x, S.ARRIVE.z),
    };
    out.x0 = Math.min(...parts.map((p) => p.x0)); out.x1 = Math.max(...parts.map((p) => p.x1));
    out.z0 = Math.min(...parts.map((p) => p.z0)); out.z1 = Math.max(...parts.map((p) => p.z1));
    // the rooms under a roof (lit as rooms, never dark as a cave): the hall and the wings
    out.lit = [[-HX, HZ0, HX, HZ1], [wxo, HZ0, wxi, HZ0 + 50], [exi, HZ0, exo, HZ0 + 50], [-W.u, SZ0, -W.u + 22, SZ1], [W.u - 22, SZ0, W.u, SZ1]];
    return out;
}

let _plan = null;
/** The castle's plan (made once per thread). */
export const schoolPlan = () => _plan || (_plan = schoolCastlePlan());

/** The castle's parts in a chunk (lists for Terrain._buildCastles). */
const _byChunk = new Map();
export function schoolPartsForChunk(cx, cz, C = CHUNK) {
    const k = schoolPlan(), x0 = cx * C, z0 = cz * C, x1 = x0 + C - 1, z1 = z0 + C - 1;
    if (k.x1 < x0 || k.x0 > x1 || k.z1 < z0 || k.z0 > z1) return [];
    const key = cx * 65536 + cz;
    let list = _byChunk.get(key);
    if (!list) { list = k.parts.filter((p) => p.x1 >= x0 && p.x0 <= x1 && p.z1 >= z0 && p.z0 <= z1); if (_byChunk.size > 400) _byChunk.clear(); _byChunk.set(key, list); }
    return list.length ? [list] : [];
}

/** The valley's chunk without the castle (Terrain adds the castle's parts and the trees). */
export function generateSchoolChunk(cx, cz) {
    const HEIGHT = MAX_LAYER - MIN_LAYER + 1;
    const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const top = new Int16Array(CHUNK * CHUNK);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    let maxTop = MIN_LAYER, minOpen = MAX_LAYER;
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, z = z0 + lz, h = schoolHeight(x, z), w = schoolWater(x, z);
        const road = Math.abs(x) <= SCHOOL.ROAD.w && z > SCHOOL.WALL.v1 && z < SCHOOL.ROAD.z1;
        const inside = inSchoolWalls(x, z);
        for (let L = MIN_LAYER; L <= h; L++) {
            let t;
            if (L <= OLD_BEDROCK) t = BLOCK.BEDROCK;
            else if (L < h - 4) t = BLOCK.STONE;
            else if (L < h) t = w != null ? BLOCK.SAND : BLOCK.DIRT;
            else t = w != null ? (hash(x, z, 31) < 0.5 ? BLOCK.SAND : BLOCK.GRAVEL) : road ? BLOCK.PATH : inside ? BLOCK.STONE : h > SCHOOL.G + 14 && hash(x, z, 32) < 0.4 ? BLOCK.STONE : BLOCK.GRASS;
            blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = t;
        }
        let tp = h;
        if (w != null && w > h) { for (let L = h + 1; L <= w; L++) blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = BLOCK.WATER; tp = w; }
        top[lz * CHUNK + lx] = tp;
        if (tp > maxTop) maxTop = tp;
        if (h + 1 < minOpen) minOpen = h + 1;
    }
    return { cx, cz, blocks, top, maxTop, modified: false, minOpen, sea: null, school: true };
}
