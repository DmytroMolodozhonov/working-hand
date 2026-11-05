/**
 * ShopHalls.js — the two big shops of a wizards' settlement (generation WIZ_SHOPS_FROM_GEN; the author 05.11):
 *
 *  - the POTION HALL «Лавка зелий» (west of the plaza, across the west road from the cauldron hall): a half-timbered apothecary with a
 *    slate roof, a smoking chimney, a golden sign with a flask over a 5-wide door. Inside it is packed: shelves of three tiers on three walls,
 *    two double-sided island shelves, a counter at the back with the keeper behind it, a cauldron for sale on a rune circle, a table of empty
 *    flasks, bunches of herbs under the roof. Every potion of the world is on its shelves (src/game/ShopHallLife.js lays them out);
 *  - the SCROLL HALL «Лавка свитков» (north-east, behind the library): a white stone hall with dark pilasters, a golden band, a violet roof
 *    and a round turret at its corner; inside — pigeonholes full of rolled scrolls on three walls, four long reading tables where the scrolls
 *    for sale lie, a rune circle in the middle, the counter before the back wall.
 * Both are walked through: the keeper walks the aisles (the waypoints `walk` / `links`), comes to the buyer, shows a good on its shelf.
 *
 * Sizes from the world's gauges (not by eye): a block 1 m, the hero ~3.5 m (eyes ≈ 3.4 m); doors 5 wide × 6 high (hats pass), aisles ≥ 3,
 * the counters 2 m high (a waist's height) and 2 deep, tables 2 m; shelves' tops at 1, 3 and 5 m (the lowest two in the hand's reach).
 * Pure data (no THREE): the blocks go to the plan, the records to the settlement's def (stalls, civic buildings, `halls`).
 * Local coordinates of the settlement (WizardVillages.js); `kit` — its helpers (gable, windowHole, civicDoor).
 */

import { BLOCK } from './Terrain.js';

/** The lots the halls take (local rects of the settlement, with their paths) — no house lot may come near them. */
export const HALL_RECTS = {
    potions: { u0: -70, u1: -27, v0: -51, v1: -23 }, // (with its ingredients' room on the west side)
    scrolls: { u0: 19, u1: 58, v0: 35, v1: 65 },
};

export const HALL = {
    TIERS: [0, 2, 4], // the shelves' board layers (tops at 1, 3, 5 m over the floor)
    REACH_TIERS: 2, // goods for sale on the lowest two (a hand reaches them; the top one — the keeper's show of bottles)
};

/** The world direction of a local one (du, dv). */
function dir(p, du, dv) { const a = p.pt(0, 0), b = p.pt(du, dv); return { x: b.x - a.x, z: b.z - a.z }; }

/** A local box of the plan → the world rect + feet y (for the game's «is the hero in the shop»). */
function hallRect(p, u0, u1, v0, v1) { return { ...p.rect(u0, u1, v0, v1), y: p.L(0) - 1.5 }; }

/** The shelf cells (u, v) of a line of boards at layers TIERS between uprights. → slots {x, y, z, tier, face: {x, z} (the aisle side)} */
function shelfLine(p, cells, uprights, mat, face, out, decor, real = HALL.REACH_TIERS) {
    for (const [u, v] of cells) {
        const up = uprights.has(u + ',' + v);
        for (const l of HALL.TIERS) p.box(u, u, l, l, v, v, mat);
        if (up) { p.box(u, u, 0, HALL.TIERS[HALL.TIERS.length - 1] + 2, v, v, BLOCK.PLANKS_DARK); continue; }
        HALL.TIERS.forEach((l, ti) => {
            const q = p.pt(u, v, 0), f = p.pt(u + face[0], v + face[1], 0);
            const s = { x: q.x, y: p.L(l) - 0.5, z: q.z, tier: ti, face: { x: f.x - q.x, z: f.z - q.z } };
            (ti < real ? out : decor).push(s);
        });
    }
}

// ------------------------------------------------------------------ the potion hall
/** «Лавка зелий»: local u −56…−28, v −50…−26; the door in the north wall towards the west road (v 0). */
export function buildPotionHall(p, rng, out, kit) {
    const B = BLOCK;
    const u0 = -56, u1 = -28, v0 = -50, v1 = -26, h = 10, du = -42;
    // ---- the shell: a mossy stone plinth, white plaster between dark timbers, a timber belt, the floor of dark planks
    p.box(u0, u1, -1, -1, v0, v1, B.PLANKS_DARK);
    p.walls(u0, u1, v0, v1, 0, 1, B.CS_MOSSY);
    p.walls(u0, u1, v0, v1, 2, h - 1, B.PLASTER);
    p.box(u0 + 1, u1 - 1, 0, h - 1, v0 + 1, v1 - 1, 0);
    for (let u = u0; u <= u1; u += 4) { p.box(u, u, 2, h - 1, v0, v0, B.PLANKS_DARK); p.box(u, u, 2, h - 1, v1, v1, B.PLANKS_DARK); }
    for (let v = v0; v <= v1; v += 4) { p.box(u0, u0, 2, h - 1, v, v, B.PLANKS_DARK); p.box(u1, u1, 2, h - 1, v, v, B.PLANKS_DARK); }
    for (const [a, b] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) p.box(a, a, 0, h, b, b, B.PLANKS_DARK);
    p.walls(u0, u1, v0, v1, 6, 6, B.PLANKS_DARK); // (the belt between the floors of the timber frame)
    kit.gable(p, u0, u1, v0, v1, h, B.ROOF_SLATE, B.PLASTER);
    // the chimney of the brewing room at the back
    p.box(-33, -32, 0, h + 16, v0 - 1, v0, B.BRICK); // (in the back wall, outside: the shelves inside stay whole)
    p.box(-33, -32, h + 17, h + 17, v0 - 1, v0, B.COBBLE);
    // ---- the door (5 wide, 6 high), its dark frame, the sign over it: a golden frame, a violet board (the painted plaque before it — ShopHallModels.hallSign)
    p.box(du - 2, du + 2, 0, 5, v1, v1, 0);
    p.box(du - 3, du + 3, 6, 6, v1, v1, B.ARCANE_DARK);
    p.box(du - 3, du - 3, 0, 5, v1, v1, B.ARCANE_DARK); p.box(du + 3, du + 3, 0, 5, v1, v1, B.ARCANE_DARK);
    p.box(du - 5, du + 5, 7, 12, v1 + 1, v1 + 1, B.GOLD);
    p.box(du - 4, du + 4, 8, 11, v1 + 1, v1 + 1, B.CARPET_PURPLE);
    p.box(du - 6, du - 6, 9, 9, v1 + 1, v1 + 1, B.ARCANE_LAMP_VIOLET); p.box(du + 6, du + 6, 9, 9, v1 + 1, v1 + 1, B.ARCANE_LAMP_VIOLET);
    // the porch: a step of white stone, a path of 3 to the west road, lamps on posts by the door
    p.box(du - 3, du + 3, -1, -1, v1 + 1, v1 + 3, B.CS_WHITE);
    p.box(du - 1, du + 1, -1, -1, v1 + 4, -2, B.PATH);
    for (const s of [-4, 4]) { p.box(du + s, du + s, 0, 2, v1 + 3, v1 + 3, B.FENCE); p.box(du + s, du + s, 3, 3, v1 + 3, v1 + 3, B.ARCANE_LAMP); }
    // ---- windows: the front at both sides of the door (lit bottles stand in them), high ones in the side walls (over the shelves)
    const windows = [];
    for (const a of [-52, -48, -36, -32]) kit.windowHole(p, windows, true, v1, a, a + 1, 2, 5);
    for (const b of [-46, -38, -30]) kit.windowHole(p, windows, false, u1, b, b + 1, 7, 8); // (the west wall is the ingredients' room's)
    // ---- inside: a green runner from the door to the counter, the rune circle of the cauldron, lamps and herbs under the roof
    p.box(du - 1, du + 1, -1, -1, -41, v1 - 1, B.CARPET_GREEN);
    p.cyl(-45, -37, 2.6, -1, -1, B.RUNE);
    for (const b of [-46, -38, -30]) p.box(u0 + 1, u1 - 1, h - 1, h - 1, b, b, B.PLANKS_DARK); // (the tie beams of the roof: the lamps hang under them)
    for (const a of [-52, -45, -38, -32]) for (const b of [-46, -38, -30]) p.box(a, a, h - 2, h - 2, b, b, (a + b) % 3 ? B.ARCANE_LAMP : B.ARCANE_LAMP_VIOLET);
    // ---- the shelves (the goods' slots: `slots` — for sale; `decor` — the keeper's show of bottles the game draws)
    const slots = [], decor = [];
    const ups = (list) => new Set(list.map(([a, b]) => a + ',' + b));
    const line = (a0, a1, b0, b1) => { const c = []; for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) c.push([a, b]); return c; };
    // the west and east walls: v −47…−30, uprights every 6; the back wall: u −54…−30
    // (the west wall's shelves leave the doorway to the ingredients' room free: v −39…−35)
    shelfLine(p, line(-55, -55, -47, -40), ups([[-55, -47], [-55, -44], [-55, -40]]), B.PLANKS_DARK, [1, 0], slots, decor);
    shelfLine(p, line(-55, -55, -34, -30), ups([[-55, -34], [-55, -30]]), B.PLANKS_DARK, [1, 0], slots, decor);
    shelfLine(p, line(-29, -29, -47, -30), ups([[-29, -47], [-29, -41], [-29, -35], [-29, -30]]), B.PLANKS_DARK, [-1, 0], slots, decor);
    shelfLine(p, line(-54, -30, -49, -49), ups([[-54, -49], [-48, -49], [-42, -49], [-36, -49], [-30, -49]]), B.PLANKS_DARK, [0, 1], decor, decor, 0); // (behind the keeper: only his show — out of the buyer's reach)
    // two islands, two columns each (both sides: one faces each aisle), v −44…−33, uprights at the ends and the middle
    for (const [a, b] of [[-50, -49], [-35, -34]]) {
        const U = ups([[a, -44], [a, -39], [a, -33], [b, -44], [b, -39], [b, -33]]);
        shelfLine(p, line(a, a, -44, -33), U, B.PLANKS, [-1, 0], slots, decor);
        shelfLine(p, line(b, b, -44, -33), U, B.PLANKS, [1, 0], slots, decor);
        p.box(a, b, 6, 6, -44, -33, B.PLANKS_DARK); // (the islands' crowns)
        p.box(a, a, 7, 7, -39, -39, B.ARCANE_LAMP); p.box(b, b, 7, 7, -39, -39, B.ARCANE_LAMP);
    }
    // ---- the counter (2 high, 2 deep, 7 long) with green cloth, the keeper behind it; the flasks' table (2 high) in the middle
    p.box(-45, -39, 0, 1, -44, -43, B.PLANKS_DARK);
    p.box(-45, -39, 1, 1, -44, -43, B.CARPET_GREEN);
    p.box(-39, -38, 0, 1, -38, -36, B.PLANKS_DARK);
    p.box(-39, -38, 1, 1, -38, -36, B.CLOTH_WHITE);
    const flasks = [];
    for (const a of [-39, -38]) for (const b of [-38, -37, -36]) { const q = p.pt(a, b, 0); flasks.push({ x: q.x, y: p.L(1) - 0.5, z: q.z, tier: 0, face: { x: 0, z: 0 } }); }
    // ---- the stall (CastleTalk: the keeper is a seller of the settlement; ShopHallLife works his shop)
    const counter = { ...p.rect(-45, -39, -44, -43), top: p.L(1) - 0.5 };
    const fn = p.node(du, -41, 0, 'stall');
    const cauldron = { ...p.pt(-45, -37, 0), yaw: p.yaw(Math.PI / 2) };
    // ---- the walking graph (CastleLife's paths) and the keeper's own waypoints in the aisles
    const W = [[du, -29], [-52, -29], [-52, -46], [-47, -46], [du, -46], [-37, -46], [-32, -46], [-32, -29], [du, -41], [du, -34], [-47, -41], [-37, -41], [-52, -37]];
    const links = [[0, 1], [1, 12], [12, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0], [0, 9], [9, 8], [8, 10], [10, 3], [8, 11], [11, 5]];
    const door = p.node(du, v1 + 3, 0), inn = p.node(du, -29, 0, 'room:potionHall');
    p.link(door, inn); p.link(inn, p.node(du, -34, 0)); p.link(p.node(du, -34, 0), fn); p.link(door, p.node(du, 0, 0));
    const stall = {
        trade: 'potionhall', hall: 'potions', potions: true, cauldron, cauldronPrice: 500,
        front: p.pt(du, -41, 0), back: p.pt(du, -46, 0), frontNode: fn, counter, yaw: p.yaw(Math.PI), // (the keeper looks at the door)
    };
    out.stalls.push(stall);
    const mainStall = out.stalls.length - 1;
    // ---- the guard: a mage of the shop by the door (a «stall» with no counter: his post — ShopHallLife walks him round and watches)
    out.stalls.push({ hall: 'potions', guard: true, front: p.pt(du + 4, -29, 0), back: p.pt(du + 4, -29, 0), frontNode: inn, yaw: p.yaw(Math.PI) });
    const guardStall = out.stalls.length - 1;
    buildIngredientRoom(p, out, kit, windows);
    out.halls.push({
        kind: 'potions', name: 'Лавка зелий', stall: mainStall, guard: guardStall, slots, decor, flasks,
        room: hallRect(p, u0 + 1, u1 - 1, v0 + 1, v1 - 1), door: p.pt(du, v1 + 2, 0), inside: p.pt(du, -29, 0),
        walk: W.map(([a, b]) => p.pt(a, b, 0)), links, home: 4, entry: 0, front: 8,
        sign: { ...p.pt(du, v1 + 1.56, 0), y: p.L(9.5) - 1, face: dir(p, 0, 1), w: 8.6, h: 3.6 },
    });
    out.civic.push({
        kind: 'potionHall', civic: true, rich: true, wizard: true, c: p.pt(-42, -38), r: 14, doorRec: kit.civicDoor(p, du, v1, 0, -1, 5, 6), windows,
        chests: [], bedSpots: [], homeNode: inn, doorNode: door, door: p.pt(du, v1 + 3), inside: p.pt(du, -29), beds: 0,
    });
}

// ------------------------------------------------------------------ the ingredients' room
/**
 * The potion hall's side room on its west (the author 05.11: «отдельная комната, где можно купить элементы для варки зелий»): local u −68…−56
 * (the hall's west wall shared), v −48…−28, a lean-to roof of slate; the way in — a doorway 3×6 from the hall (v −38…−36). Shelves of three
 * tiers on the west and the south walls, a long table (2 m) in the middle, a counter (2 m, 2 deep) at the north end with its seller behind it.
 */
function buildIngredientRoom(p, out, kit, windows) {
    const B = BLOCK;
    const u0 = -68, u1 = -56, v0 = -48, v1 = -28;
    p.box(u0, u1 - 1, -1, -1, v0, v1, B.PLANKS_DARK);
    p.walls(u0, u1, v0, v1, 0, 1, B.CS_MOSSY);
    p.box(u0, u0, 2, 7, v0, v1, B.PLASTER); p.box(u0, u1 - 1, 2, 7, v0, v0, B.PLASTER); p.box(u0, u1 - 1, 2, 7, v1, v1, B.PLASTER);
    p.box(-62, u1 - 1, 8, 8, v0, v0, B.PLASTER); p.box(-62, u1 - 1, 8, 8, v1, v1, B.PLASTER); // (the walls rise under the higher half of the lean-to)
    for (let v = v0; v <= v1; v += 4) p.box(u0, u0, 2, 7, v, v, B.PLANKS_DARK);
    for (let u = u0; u < u1; u += 4) { p.box(u, u, 2, 7, v0, v0, B.PLANKS_DARK); p.box(u, u, 2, 7, v1, v1, B.PLANKS_DARK); }
    p.walls(u0, u1, v0, v1, 5, 5, B.PLANKS_DARK);
    p.box(u0 + 1, u1 - 1, 0, 7, v0 + 1, v1 - 1, 0);
    p.box(-62, u1 - 1, 8, 8, v0 + 1, v1 - 1, 0);
    // the lean-to roof: two steps of slate leaning on the hall's wall
    const mark = p.parts.length;
    p.box(u0 - 1, -63, 8, 8, v0 - 1, v1 + 1, B.ROOF_SLATE);
    p.box(-62, u1 - 1, 9, 9, v0 - 1, v1 + 1, B.ROOF_SLATE);
    p.slopeTop(mark, B.ROOF_SLATE);
    // the doorway from the hall (3 wide, 6 high) with a dark frame
    p.box(u1, u1, 0, 5, -38, -36, 0);
    p.box(u1, u1, 6, 6, -39, -35, B.ARCANE_DARK);
    // windows high in the west wall (over the shelves)
    for (const b of [-45, -37]) kit.windowHole(p, windows, false, u0, b, b + 1, 6, 7);
    // lamps hanging from the roof
    for (const [a, b] of [[-65, -44], [-65, -36], [-59, -44], [-59, -36], [-62, -31]]) p.box(a, a, a <= -63 ? 7 : 8, a <= -63 ? 7 : 8, b, b, B.ARCANE_LAMP);
    // ---- the shelves: west wall v −46…−34 (the counter's corner left free), south wall u −66…−58
    const slots = [], decor = [];
    const ups = (list) => new Set(list.map(([a, b]) => a + ',' + b));
    const line = (a0, a1, b0, b1) => { const c = []; for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) c.push([a, b]); return c; };
    shelfLine(p, line(-67, -67, -46, -34), ups([[-67, -46], [-67, -40], [-67, -34]]), B.PLANKS_DARK, [1, 0], slots, decor);
    shelfLine(p, line(-66, -58, -47, -47), ups([[-66, -47], [-62, -47], [-58, -47]]), B.PLANKS_DARK, [0, 1], slots, decor);
    // the long table (2 high, 3 × 6) with a green cloth: herbs and stones lie on it
    p.box(-63, -61, 0, 1, -43, -38, B.PLANKS_DARK);
    p.box(-63, -61, 1, 1, -43, -38, B.CARPET_GREEN);
    for (let a = -63; a <= -61; a++) for (let b = -43; b <= -38; b++) { const q = p.pt(a, b, 0); slots.push({ x: q.x, y: p.L(1) - 0.5, z: q.z, tier: 0, face: { x: 0, z: 0 } }); }
    // ---- the counter (2 high, 2 deep, 6 long) at the north end; its seller behind it (v −31…−29)
    p.box(-65, -60, 0, 1, -33, -32, B.PLANKS_DARK);
    p.box(-65, -60, 1, 1, -33, -32, B.CLOTH_WHITE);
    const counter = { ...p.rect(-65, -60, -33, -32), top: p.L(1) - 0.5 };
    const fn = p.node(-62, -35, 0, 'stall');
    p.link(fn, p.node(-52, -37, 0)); // (into the hall's walking graph)
    out.stalls.push({ trade: 'ingredienthall', hall: 'ingredients', front: p.pt(-62, -35, 0), back: p.pt(-62, -30, 0), frontNode: fn, counter, yaw: p.yaw(Math.PI) });
    const W = [[-58, -37], [-58, -45], [-65, -45], [-65, -35], [-58, -34], [-58, -30], [-62, -30], [-62, -35], [-52, -37]];
    const links = [[0, 1], [1, 2], [2, 3], [3, 7], [7, 4], [4, 0], [4, 5], [5, 6], [0, 8]];
    out.halls.push({
        kind: 'ingredients', name: 'Комната ингредиентов', stall: out.stalls.length - 1, slots, decor, flasks: [],
        room: hallRect(p, u0 + 1, u1 - 1, v0 + 1, v1 - 1), door: p.pt(-54, -37, 0), inside: p.pt(-58, -37, 0),
        walk: W.map(([a, b]) => p.pt(a, b, 0)), links, home: 6, entry: 0, front: 7, sign: null,
    });
}

// ------------------------------------------------------------------ the scroll hall
/** «Лавка свитков»: local u 28…52, v 36…60, a turret at the north-east corner; the door in the west wall towards the hall's lane (u 17). */
export function buildScrollHall(p, rng, out, kit) {
    const B = BLOCK;
    const u0 = 28, u1 = 52, v0 = 36, v1 = 60, h = 11, dv = 48;
    // ---- the shell: white stone, dark pilasters every 4, a golden band, a dark plinth; a floor of white and dark flags
    p.box(u0, u1, -1, -1, v0, v1, B.CS_WHITE);
    for (let a = u0 + 1; a < u1; a++) for (let b = v0 + 1; b < v1; b++) if ((a + b) % 2 === 0 && (a - 1) % 4 === 0) p.box(a, a, -1, -1, b, b, B.CS_DARK);
    p.walls(u0, u1, v0, v1, 0, h - 1, B.CS_WHITE);
    p.walls(u0, u1, v0, v1, 0, 0, B.ARCANE_DARK);
    p.box(u0 + 1, u1 - 1, 0, h - 1, v0 + 1, v1 - 1, 0);
    for (let u = u0; u <= u1; u += 4) { p.box(u, u, 0, h, v0, v0, B.ARCANE_DARK); p.box(u, u, 0, h, v1, v1, B.ARCANE_DARK); }
    for (let v = v0; v <= v1; v += 4) { p.box(u0, u0, 0, h, v, v, B.ARCANE_DARK); p.box(u1, u1, 0, h, v, v, B.ARCANE_DARK); }
    p.walls(u0, u1, v0, v1, h - 2, h - 2, B.GOLD); // (the golden band under the eaves)
    kit.gable(p, u0, u1, v0, v1, h, B.ROOF_PURPLE, B.CS_WHITE);
    // the turret at the north-east corner: a round stone tower, a band of violet lamps, a tall violet cone, a golden finial
    const tu = 53, tv = 61, top = h + 10;
    p.cyl(tu, tv, 3.5, 0, top, B.CS_WHITE);
    p.cyl(tu, tv, 3.6, top - 3, top - 3, B.GOLD);
    for (const [a, b] of [[tu - 3, tv], [tu + 3, tv], [tu, tv - 3], [tu, tv + 3]]) p.box(a, a, top - 6, top - 5, b, b, B.ARCANE_LAMP_VIOLET);
    for (let k = 0; k <= 6; k++) p.cyl(tu, tv, Math.max(0.6, 4.4 - k * 0.68), top + 1 + k, top + 1 + k, B.ROOF_PURPLE);
    p.box(tu, tu, top + 8, top + 9, tv, tv, B.GOLD); p.box(tu, tu, top + 10, top + 10, tv, tv, B.ARCANE_LAMP);
    // ---- the door in the west wall (5 wide, 6 high): an arch of dark stone, the sign over it (a golden frame, a parchment board, a red seal)
    p.box(u0, u0, 0, 5, dv - 2, dv + 2, 0);
    p.box(u0, u0, 6, 6, dv - 3, dv + 3, B.ARCANE_DARK); p.box(u0, u0, 7, 7, dv - 2, dv + 2, B.ARCANE_DARK);
    p.box(u0 - 1, u0 - 1, 9, 13, dv - 5, dv + 5, B.GOLD);
    p.box(u0 - 1, u0 - 1, 10, 12, dv - 4, dv + 4, B.CLOTH_YELLOW);
    for (const s of [-6, 6]) p.box(u0 - 1, u0 - 1, 11, 11, dv + s, dv + s, B.ARCANE_LAMP_VIOLET);
    // the porch: white steps, a path of 3 to the lane, lamps
    p.box(u0 - 3, u0 - 1, -1, -1, dv - 3, dv + 3, B.CS_WHITE);
    p.box(19, u0 - 4, -1, -1, dv - 1, dv + 1, B.PATH);
    for (const s of [-4, 4]) { p.box(u0 - 3, u0 - 3, 0, 2, dv + s, dv + s, B.FENCE); p.box(u0 - 3, u0 - 3, 3, 3, dv + s, dv + s, B.ARCANE_LAMP_VIOLET); }
    // ---- windows: tall ones in the front wall beside the door, high ones in the side walls over the pigeonholes
    const windows = [];
    for (const b of [39, 42, 54, 57]) kit.windowHole(p, windows, false, u0, b, b + 1, 2, 6);
    for (const a of [32, 38, 44]) { kit.windowHole(p, windows, true, v0, a, a + 1, 8, 9); kit.windowHole(p, windows, true, v1, a, a + 1, 8, 9); }
    // ---- inside: the rune circle, a violet runner, candles (lamps) under the roof, red-and-gold banners on the pilasters
    p.cyl(37, dv, 4, -1, -1, B.RUNE, 3);
    p.box(u0 + 1, 45, -1, -1, dv - 1, dv + 1, B.CARPET_PURPLE);
    for (const a of [32, 38, 44, 49]) for (const b of [40, 48, 56]) p.box(a, a, h - 1, h - 1, b, b, (a + b) % 2 ? B.ARCANE_LAMP_VIOLET : B.ARCANE_LAMP);
    // ---- the pigeonholes: the back (east) wall and the two side walls, four tiers, full of rolled scrolls (the game draws them: `decor`)
    const slots = [], decor = [];
    const ups = (list) => new Set(list.map(([a, b]) => a + ',' + b));
    const line = (a0, a1, b0, b1) => { const c = []; for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) c.push([a, b]); return c; };
    const holes = (cells, U, face, real = 0) => {
        for (const [a, b] of cells) {
            if (U.has(a + ',' + b)) { p.box(a, a, 0, 7, b, b, B.PLANKS_DARK); continue; }
            for (const l of [0, 2, 4, 6]) {
                p.box(a, a, l, l, b, b, B.PLANKS_DARK);
                const q = p.pt(a, b, 0), f = p.pt(a + face[0], b + face[1], 0);
                (l / 2 < real ? slots : decor).push({ x: q.x, y: p.L(l) - 0.5, z: q.z, tier: l / 2, face: { x: f.x - q.x, z: f.z - q.z }, wall: true });
            }
        }
    };
    holes(line(51, 51, 38, 58), ups([[51, 38], [51, 43], [51, 48], [51, 53], [51, 58]]), [-1, 0]);
    // ---- four long tables (2 high, 2 deep, 4 long; the aisles round them 3 wide) with parchment cloth: the scrolls for sale lie on them, two rows each
    // (they come first: the side pigeonholes' lowest two tiers take the rest — a hand reaches them)
    for (const [a0, b0] of [[32, 41], [39, 41], [32, 54], [39, 54]]) {
        p.box(a0, a0 + 3, 0, 1, b0, b0 + 1, B.PLANKS_DARK);
        p.box(a0, a0 + 3, 1, 1, b0, b0 + 1, B.CLOTH_YELLOW);
        for (let a = a0; a <= a0 + 3; a++) for (let b = b0; b <= b0 + 1; b++) {
            const q = p.pt(a, b, 0), f = p.pt(a, b0 < dv ? b0 + 2 : b0 - 1, 0);
            slots.push({ x: q.x, y: p.L(1) - 0.5, z: q.z, tier: 0, face: { x: f.x - q.x, z: f.z - q.z } });
        }
    }
    holes(line(30, 49, 37, 37), ups([[30, 37], [35, 37], [40, 37], [45, 37], [49, 37]]), [0, 1], 2);
    holes(line(30, 49, 59, 59), ups([[30, 59], [35, 59], [40, 59], [45, 59], [49, 59]]), [0, -1], 2);
    // ---- the counter (2 high, 2 deep, 9 long) before the back pigeonholes, red cloth; the keeper stands between it and them
    p.box(46, 47, 0, 1, dv - 4, dv + 4, B.PLANKS_DARK);
    p.box(46, 47, 1, 1, dv - 4, dv + 4, B.CARPET_RED);
    const counter = { ...p.rect(46, 47, dv - 4, dv + 4), top: p.L(1) - 0.5 };
    const fn = p.node(44, dv, 0, 'stall');
    // ---- the walking graph and the keeper's waypoints
    const W = [[31, dv], [37, dv], [44, dv], [37, 39], [48, 40], [49, dv], [48, 56], [37, 57], [30, 39], [30, 57], [44, 40], [44, 56]]; // (the tables' aisles: u 29–31, 36–38, 43–45)
    const links = [[0, 1], [1, 2], [0, 8], [8, 3], [3, 10], [10, 4], [4, 5], [5, 6], [6, 11], [11, 7], [7, 9], [9, 0], [1, 3], [1, 7], [2, 10], [2, 11]];
    const door = p.node(u0 - 3, dv, 0), inn = p.node(31, dv, 0, 'room:scrollHall');
    p.link(door, inn); p.link(inn, fn); p.link(door, p.node(17, dv, 0));
    const stall = { trade: 'scrollhall', hall: 'scrolls', front: p.pt(44, dv, 0), back: p.pt(49, dv, 0), frontNode: fn, counter, yaw: p.yaw(-Math.PI / 2) };
    out.stalls.push(stall);
    out.halls.push({
        kind: 'scrolls', name: 'Лавка свитков', stall: out.stalls.length - 1, slots, decor, flasks: [],
        room: hallRect(p, u0 + 1, u1 - 1, v0 + 1, v1 - 1), door: p.pt(u0 - 2, dv, 0), inside: p.pt(31, dv, 0),
        walk: W.map(([a, b]) => p.pt(a, b, 0)), links, home: 5, entry: 0, front: 2,
        sign: { ...p.pt(u0 - 1.56, dv, 0), y: p.L(11) - 1, face: dir(p, -1, 0), w: 8.6, h: 2.6 },
    });
    out.civic.push({
        kind: 'scrollHall', civic: true, rich: true, wizard: true, c: p.pt(40, dv), r: 14, doorRec: kit.civicDoor(p, u0, dv, 1, 0, 5, 6), windows,
        chests: [], bedSpots: [], homeNode: inn, doorNode: door, door: p.pt(u0 - 3, dv), inside: p.pt(31, dv), beds: 0,
    });
    void rng;
}
