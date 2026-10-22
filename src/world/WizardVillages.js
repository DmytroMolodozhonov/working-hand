/**
 * WizardVillages.js — the big settlements of the wizards (no castle, no tower: a town of wizards).
 *
 * A settlement stands on its own in a castle- and tower-free cell of the castle grid (480 m); one
 * is always found 0.7–2.1 km from the spawn, the others here and there about the world. It is
 * ~100 wizards' houses on two square ring roads and four spokes, and in the middle:
 *  - the round plaza with the CENTRAL FIRE (a stone ring; the game keeps a campfire burning in it —
 *    src/game/WizVillages.js) and the STATUE of Coprus the Clever: a wizard of stone, his wand up
 *    (the plaque on the pedestal is drawn by the game);
 *  - the TOWN HALL (north, «Ратуша»): a great hall with the Elder's chair, a clock tower;
 *  - the CAULDRON HALL («Зельеварня»): a big cauldron where a wizard brews;
 *  - the small LIBRARY: shelves, a reading table with 2–5 scrolls of simple spells (different from
 *    place to place) and the desk of the world's history (its books — LoreLibrary.js);
 *  - the MARKET (south): a crooked lane — leaning, twisted shops with overhanging upper floors,
 *    crooked spires and chimneys (strange, not logical), a counter in every shop's open front;
 *    trades: cauldrons and potions, potions, robes, wands, magic armour, scrolls, curiosities and
 *    the pawnshop (src/game/WizardMarket.js says what each sells / buys);
 *  - the ARENA's place (south-east): a level round field kept empty for the arena (another
 *    module builds it: `def.arena` = {x, z, y, r}).
 * Around: lamp posts, obelisks, magic fountains, herb gardens, gate arches at the spokes.
 *
 * Pure data, deterministic from the seed (every computer, every worker builds the same town);
 * the record has the shape of a castle's (src/world/Castles.js) so the people, the houses, the
 * doors, the chests and the market work on it as on castles and towers. kind: 'wizvillage'.
 * Rot-local coordinates: centre (0, 0), the market lane to the front (−v).
 *
 * (Imports Terrain.js for BLOCK: never read BLOCK at the top level here.)
 */

import { BLOCK } from './Terrain.js';
import { CASTLE_CELL, BLEND, hash01, Plan, buildHouse, rotLot, inwardRy } from './Castles.js';
import { createRng } from '../core/math.js';
import { offEarth } from './Planets.js';

export const VILLAGE_ZONE = 124; // half-size of the levelled land
const VILLAGE_P = 0.6; // share of the castle- and tower-free cells that try to hold a settlement
const V_M = VILLAGE_ZONE + BLEND + 10; // the land stays ≥ 10 m inside its cell
const V_SPAN = CASTLE_CELL - 2 * V_M;
const TRIES = 10;
const MIN_SPAWN = 420 + VILLAGE_ZONE;
const SPAWN_RING = [700, 2100];
export const MAX_HOUSES = 100;
const R1 = 70, R2 = 106; // the ring roads (centre lines)
const PLAZA_R = 18;
/** The arena's place (another module builds the arena): local centre and radius. */
export const ARENA_SPOT = { u: 40, v: -40, r: 22 };
const SHOP_V = [-27, -38, -49, -60]; // the market's shops along the lane (their middles)
const LANE_END = -68;
/** The trades of the market (src/game/WizardMarket.js): the cauldrons first (west, by the plaza), the pawnshop last (east, at the end). */
export const VILLAGE_TRADES = ['cauldrons', 'potions', 'robes', 'wands', 'armor', 'scrolls', 'curios', 'pawn'];
/** Simple spells the library keeps (none of them known from the start: SpellBook.START_SPELLS). */
export const LIBRARY_SPELLS = ['LightningStrike', 'Thunderwave', 'ToTheSun', 'AlohomoraMaxima', 'ImproveHouse', 'Brainrot', 'Waterball', 'Overgrown', 'Snowman', 'AirBubble', 'Drawdown', 'Breakthrough', 'LetItRain', 'Unfurl'];
export const STATUE_NAME = 'Coprus the Clever';

const NAMES_A = ['Лунная', 'Звёздная', 'Туманная', 'Совиная', 'Хрустальная', 'Сумеречная', 'Ведьмина', 'Котловая', 'Кривая', 'Свечная', 'Искристая', 'Полынная'];
const NAMES_B = ['Лощина', 'Слобода', 'Заводь', 'Пустошь', 'Гавань', 'Опушка', 'Падь', 'Горка'];
const ELDER_A = ['Бальтазар', 'Евлампий', 'Аристарх', 'Мелентий', 'Феофан', 'Корнелий', 'Амвросий', 'Ипполит', 'Серафим', 'Гервасий'];
const ELDER_B = ['Седой', 'Рассудительный', 'Многознающий', 'Тихоголосый', 'Длиннобородый', 'Звездочёт', 'Старый'];

// ------------------------------------------------------------- the middle
/** The plaza, the fire, the statue, the roads, the gates and lamps; the walking graph of the roads. */
function buildCore(p, rng, out) {
    const B = BLOCK, Z = VILLAGE_ZONE;
    // ---- the plaza: cobbles, a ring of runes, violet lamp pillars
    p.cyl(0, 0, PLAZA_R, -1, -1, B.COBBLE);
    p.cyl(0, 0, PLAZA_R - 2, -1, -1, B.RUNE, PLAZA_R - 3);
    for (let i = 0; i < 4; i++) {
        const a = (45 + 90 * i) * Math.PI / 180;
        const u = Math.round((PLAZA_R - 1) * Math.cos(a)), v = Math.round((PLAZA_R - 1) * Math.sin(a));
        p.box(u, u, 0, 3, v, v, B.ARCANE_DARK);
        p.box(u, u, 4, 4, v, v, B.ARCANE_LAMP_VIOLET);
    }
    // ---- the central fire: a ring of stones round a bed of cobbles (the game keeps a campfire in it)
    p.cyl(0, 0, 2.6, -1, -1, B.COBBLE);
    p.cyl(0, 0, 2.6, 0, 0, B.CS_DARK, 1.7);
    out.fire = p.pt(0, 0, 0);
    // ---- the statue of Coprus the Clever: a wizard of stone on a pedestal, his wand raised high, facing the fire
    const S = B.CS_GREY;
    p.box(-3, 3, 0, 2, 11, 17, B.CS_WHITE); // the pedestal
    p.box(-3, 3, 3, 3, 11, 17, B.ARCANE_DARK);
    p.box(-2, 2, 4, 6, 12, 16, S); // the robe, wide at the hem
    p.box(-2, 2, 7, 9, 13, 15, S);
    p.box(-1, 1, 10, 11, 13, 15, S); // the chest
    p.box(-2, 2, 11, 11, 13, 15, S); // the shoulders
    p.box(-3, -3, 7, 10, 14, 14, S); p.box(-3, -3, 6, 6, 14, 14, B.CS_WHITE); // the left arm down, the hand
    p.box(3, 3, 11, 14, 14, 14, S); p.box(3, 3, 15, 15, 14, 14, B.CS_WHITE); // the right arm up, the hand
    p.box(3, 3, 16, 17, 14, 14, B.PLANKS_DARK); // the wand
    p.box(3, 3, 18, 18, 14, 14, B.ARCANE_LAMP); // its glowing tip
    p.box(-1, 1, 12, 13, 13, 15, S); // the head
    p.box(0, 0, 10, 12, 12, 12, B.CS_WHITE); // the long beard
    p.box(-2, 2, 14, 14, 12, 16, S); // the hat's brim
    p.box(-1, 1, 15, 16, 13, 15, S); p.box(0, 0, 17, 18, 14, 14, S); p.box(0, 0, 19, 19, 15, 15, S); // the hat, its tip bent back
    const sp = p.pt(0, 10.45, 1);
    out.statue = { x: sp.x, y: p.L(1) - 1, z: sp.z, ry: p.yaw(0) + Math.PI, name: STATUE_NAME };
    // ---- the roads (3 wide): two square rings, the spokes to the gates; the north spoke goes round the hall
    const road = (u0, u1, v0, v1, t = B.PATH) => p.box(u0, u1, -1, -1, v0, v1, t);
    for (const R of [R1, R2]) {
        road(-R - 1, R + 1, -R - 1, -R + 1); road(-R - 1, R + 1, R - 1, R + 1);
        road(-R - 1, -R + 1, -R - 1, R + 1); road(R - 1, R + 1, -R - 1, R + 1);
    }
    road(PLAZA_R - 1, Z - 2, -1, 1); road(-(Z - 2), -(PLAZA_R - 1), -1, 1); // east, west
    road(-18, -16, 6, 53); road(16, 18, 6, 53); road(-18, 18, 51, 53); road(-1, 1, 52, Z - 2); // north round the hall
    road(-3, 3, LANE_END, -(PLAZA_R - 2), B.COBBLE); road(-1, 1, -(Z - 2), LANE_END); // the market lane, the south road
    // ---- the walking graph of the roads
    const roadNodes = (axis, fixed, from, to, step = 12) => {
        p.roadLine(axis, fixed, from, to);
        for (let t = from; t <= to; t += step) p.node(axis === 'u' ? t : fixed, axis === 'u' ? fixed : t, 0);
        p.node(axis === 'u' ? to : fixed, axis === 'u' ? fixed : to, 0);
    };
    for (const R of [R1, R2]) {
        roadNodes('u', -R, -R, R); roadNodes('u', R, -R, R);
        roadNodes('v', -R, -R, R); roadNodes('v', R, -R, R);
        p.node(0, -R, 0); p.node(0, R, 0); p.node(-R, 0, 0, 'ring'); p.node(R, 0, 0, 'ring'); // (the crossings)
    }
    roadNodes('u', 0, PLAZA_R, Z - 4); roadNodes('u', 0, -(Z - 4), -PLAZA_R);
    roadNodes('v', -17, 8, 52); roadNodes('v', 17, 8, 52); roadNodes('u', 52, -17, 17); roadNodes('v', 0, 52, Z - 4);
    roadNodes('v', 0, -(Z - 4), -(PLAZA_R), 11);
    for (const v of SHOP_V) p.node(0, v, 0, 'market');
    p.node(0, -(Z - 4), 0, 'gateOut'); p.node(0, Z - 4, 0, 'gateOut'); p.node(Z - 4, 0, 0, 'gateOut'); p.node(-(Z - 4), 0, 0, 'gateOut');
    // the plaza: a ring of nodes round the fire (the statue's side left open), the spokes joined to it
    const ring = [[12, 0], [9, 9], [-9, 9], [-12, 0], [-9, -9], [0, -12], [9, -9]].map(([u, v]) => p.node(u, v, 0, 'plaza'));
    for (let i = 0; i < ring.length; i++) p.link(ring[i], ring[(i + 1) % ring.length]);
    p.link(p.node(PLAZA_R, 0, 0), ring[0]); p.link(p.node(-PLAZA_R, 0, 0), ring[3]); p.link(p.node(0, -PLAZA_R, 0), ring[5]);
    p.link(p.node(17, 8, 0), ring[1]); p.link(p.node(-17, 8, 0), ring[2]);
    // ---- the gates at the ends of the spokes: arches of dark arcane stone with a violet lamp
    for (const [u, v, alongU] of [[0, -(Z - 6), true], [0, Z - 6, true], [Z - 6, 0, false], [-(Z - 6), 0, false]]) {
        for (const sd of [-1, 1]) {
            const a = alongU ? u + 3 * sd : u, b = alongU ? v : v + 3 * sd;
            p.box(a, a, 0, 6, b, b, B.ARCANE_DARK);
        }
        if (alongU) p.box(u - 3, u + 3, 7, 7, v, v, B.ARCANE_DARK); else p.box(u, u, 7, 7, v - 3, v + 3, B.ARCANE_DARK);
        p.box(u, u, 8, 8, v, v, B.ARCANE_LAMP_VIOLET);
    }
    // ---- lamp posts along the roads (between the lots: the doors' paths stay free)
    const post = (u, v) => { p.box(u, u, 0, 2, v, v, B.FENCE); p.box(u, u, 3, 3, v, v, B.ARCANE_LAMP); };
    for (const R of [R1, R2]) {
        for (let t = -R + 16; t <= R - 16; t += 32) {
            if (Math.abs(t) < 8) continue;
            post(t, -R + 3); post(t, R - 3); post(-R + 3, t); post(R - 3, t);
        }
    }
    for (let t = PLAZA_R + 7; t < Z - 8; t += 14) {
        if (Math.abs(t - R1) < 6 || Math.abs(t - R2) < 6) continue;
        post(t, 3); post(-t, -3);
        if (t > 56) { post(3, t); post(-3, -t); }
    }
    // the obelisks at the inner ring's corners
    for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const u = su * (R1 - 5), v = sv * (R1 - 5);
        p.cyl(u, v, 2.5, -1, -1, B.RUNE, 1.5);
        p.box(u, u, 0, 6, v, v, B.ARCANE_DARK);
        p.box(u, u, 7, 7, v, v, B.ARCANE_LAMP);
    }
    // ---- the arena's place: kept level and empty (a faint ring of stones round it)
    const A = ARENA_SPOT;
    p.cyl(A.u, A.v, A.r + 1.5, -1, -1, B.COBBLE, A.r + 0.5);
    p.link(p.node(A.u, A.v + A.r + 4, 0, 'arena'), p.node(A.u, 0, 0)); // (its north edge, joined to the east road: the arena's builders put the way in)
    const ac = p.pt(A.u, A.v, 0);
    out.arena = { x: ac.x, y: ac.y, z: ac.z, r: A.r };
    out.posts = [{ ...p.pt(-4, -20, 0), yaw: p.yaw(0) }, { ...p.pt(4, -20, 0), yaw: p.yaw(0) }, { ...p.pt(-5, 22, 0), yaw: p.yaw(Math.PI) }, { ...p.pt(5, 22, 0), yaw: p.yaw(Math.PI) }];
    void rng;
}

/**
 * A civic building's door in its doorway (w wide, h high), opening into the room: local (u, v) of the
 * doorway's middle, (iu, iv) the way in.
 */
function civicDoor(p, u, v, iu, iv, w, h) {
    const d = p.pt(u, v), q = p.pt(u + Math.abs(iv), v + Math.abs(iu)), i = p.pt(u + iu, v + iv);
    return { x: d.x, y: d.y, z: d.z, ry: inwardRy(Math.atan2(-(q.z - d.z), q.x - d.x), i.x - d.x, i.z - d.z), w, h };
}

/** A window hole in a wall along u (fixed v) or along v (fixed u); its record for the glass. */
function windowHole(p, list, alongU, fixed, a0, a1, l0, l1) {
    if (alongU) p.box(a0, a1, l0, l1, fixed, fixed, 0); else p.box(fixed, fixed, l0, l1, a0, a1, 0);
    const m = (a0 + a1) / 2;
    const c = alongU ? p.pt(m, fixed) : p.pt(fixed, m);
    const o = p.pt(0, 0), q = alongU ? p.pt(1, 0) : p.pt(0, 1);
    list.push({ x: c.x, z: c.z, y: (p.L(l0) + p.L(l1)) / 2 - 1, ry: Math.atan2(-(q.z - o.z), q.x - o.x), w: a1 - a0 + 1, h: l1 - l0 + 1 });
}

/** A gable roof over the rectangle (slopes along v), hollow, with the gable ends in `wall`. */
function gable(p, u0, u1, v0, v1, l, roof, wall) {
    const half = Math.ceil((v1 - v0) / 2);
    for (let k = 0; k <= half + 1; k++) {
        const a = v0 - 1 + k, b = v1 + 1 - k;
        if (a > b) break;
        p.box(u0 - 1, u1 + 1, l + k, l + k, a, b, roof);
        if (a + 1 <= b - 1) p.box(u0 + 1, u1 - 1, l + k, l + k, a + 1, b - 1, 0);
        if (k >= 1 && a + 1 <= b - 1) { p.box(u0, u0, l + k, l + k, a + 1, b - 1, wall); p.box(u1, u1, l + k, l + k, a + 1, b - 1, wall); }
    }
    return l + half + 1;
}

/** The town hall: the great hall, the Elder's chair, two chests, a clock tower. */
function buildHall(p, rng, out) {
    const B = BLOCK;
    const u0 = -13, u1 = 13, v0 = 24, v1 = 46, h = 11;
    p.box(u0, u1, -1, -1, v0, v1, B.CS_WHITE); // the floor
    p.walls(u0, u1, v0, v1, 0, h - 1, B.ARCANE);
    p.walls(u0, u1, v0, v1, 0, 0, B.ARCANE_DARK);
    p.box(u0 + 1, u1 - 1, 0, h - 1, v0 + 1, v1 - 1, 0);
    for (const [a, b] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) p.box(a, a, 0, h + 1, b, b, B.ARCANE_DARK);
    const top = gable(p, u0, u1, v0, v1, h, B.ROOF_PURPLE, B.ARCANE);
    // the clock tower in the middle of the roof
    p.box(-4, 4, h, top + 8, 31, 39, B.ARCANE);
    p.box(-3, 3, h, top + 7, 32, 38, 0);
    for (let k = 0; k <= 6; k++) p.box(-5 + k, 5 - k, top + 9 + k, top + 9 + k, 30 + k, 40 - k, B.ROOF_PURPLE);
    p.box(0, 0, top + 16, top + 16, 35, 35, B.ARCANE_LAMP_VIOLET);
    p.box(-1, 1, top + 4, top + 6, 30, 30, B.GOLD); // the clock face
    p.box(0, 0, top + 5, top + 5, 30, 30, B.CS_DARK);
    // the doorway (5 wide, 6 high: the pointed hats pass), steps of path before it
    p.box(-2, 2, 0, 5, v0, v0, 0);
    p.box(-3, 3, 6, 6, v0, v0, B.ARCANE_DARK);
    p.box(0, 0, 7, 7, v0, v0, B.ARCANE_LAMP);
    p.box(-2, 2, -1, -1, v0 - 3, v0 - 1, B.PATH);
    const windows = [];
    for (const a of [-10, -6, 6, 10]) windowHole(p, windows, true, v0, a - 1, a, 2, 6);
    for (const b of [30, 36, 42]) { windowHole(p, windows, false, u0, b - 1, b, 2, 6); windowHole(p, windows, false, u1, b - 1, b, 2, 6); }
    // inside: a purple runner to the chair, long tables, shelves of books, the Elder's chair, lamps
    p.box(-1, 1, -1, -1, v0 + 1, 41, B.CARPET_PURPLE);
    for (const su of [-1, 1]) {
        p.box(su * 6, su * 9, 0, 1, 29, 38, B.PLANKS);
        p.box(su * 5, su * 5, 0, 0, 29, 38, B.PLANKS_DARK); p.box(su * 10, su * 10, 0, 0, 29, 38, B.PLANKS_DARK);
    }
    p.box(-12, -4, 0, 4, v1 - 1, v1 - 1, B.BOOKS); p.box(4, 12, 0, 4, v1 - 1, v1 - 1, B.BOOKS);
    p.box(0, 0, 0, 0, 43, 43, B.PLANKS_DARK); p.box(-1, 1, 1, 3, 44, 44, B.PLANKS_DARK); p.box(0, 0, 4, 4, 44, 44, B.ARCANE_LAMP_VIOLET);
    for (const [a, b] of [[-7, 28], [7, 28], [-7, 40], [7, 40], [0, 34]]) p.box(a, a, h - 1, h - 1, b, b, B.ARCANE_LAMP);
    out.throne = { ...p.pt(0, 43, 1), yaw: p.yaw(0) };
    out.throneFront = p.pt(0, 39, 0);
    out.chests.push({ ...p.pt(-11, 43.6, 0), yaw: p.yaw(0), room: 'hall' }, { ...p.pt(11, 43.6, 0), yaw: p.yaw(0), room: 'hall' });
    // the walking graph
    const door = p.node(0, 21, 0, 'hallGate'), inn = p.node(0, 27, 0), mid = p.node(0, 34, 0, 'room:hall'), tf = p.node(0, 39, 0, 'throneFront');
    p.link(door, inn); p.link(inn, mid); p.link(mid, tf);
    p.link(door, p.node(17, 20, 0)); p.link(door, p.node(-17, 20, 0));
    out.civic.push({
        kind: 'hall', civic: true, rich: true, wizard: true, c: p.pt(0, 35), r: 15, doorRec: civicDoor(p, 0, v0, 0, 1, 5, 6), windows,
        chests: [], bedSpots: [], homeNode: mid, doorNode: door, door: p.pt(0, 21), inside: p.pt(0, 30), beds: 0,
    });
    void rng;
}

/** The cauldron hall: the big cauldron in the middle, shelves of potions, herbs, a chimney. */
function buildCauldronHall(p, rng, out) {
    const B = BLOCK;
    const u0 = -52, u1 = -30, v0 = 14, v1 = 32, h = 8, cu = -41, cv = 24;
    p.box(u0, u1, -1, -1, v0, v1, B.COBBLE);
    p.walls(u0, u1, v0, v1, 0, h - 1, B.ARCANE);
    p.box(u0 + 1, u1 - 1, 0, h - 1, v0 + 1, v1 - 1, 0);
    for (const [a, b] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) p.box(a, a, 0, h, b, b, B.ARCANE_DARK);
    gable(p, u0, u1, v0, v1, h, B.ROOF_BLUE, B.ARCANE);
    p.box(cu, cu + 1, 0, h + 14, v1 - 2, v1 - 1, B.COBBLE); // the chimney over the hearth
    // the big cauldron: a wide ring of stone, the brew glowing in it, the fire under it
    p.cyl(cu, cv, 3, 0, 1, B.CS_DARK, 2);
    p.cyl(cu, cv, 2, 0, 0, B.POTION);
    // the doorway (3 wide, 6 high) in the front wall (towards the west road)
    p.box(cu - 1, cu + 1, 0, 5, v0, v0, 0);
    p.box(cu - 2, cu + 2, 6, 6, v0, v0, B.ARCANE_DARK);
    p.box(cu - 1, cu + 1, -1, -1, v0 - 3, v0 - 1, B.PATH);
    const windows = [];
    for (const a of [-48, -34]) windowHole(p, windows, true, v0, a - 1, a, 2, 4);
    windowHole(p, windows, false, u0, 22, 23, 2, 4); windowHole(p, windows, false, u1, 22, 23, 2, 4);
    // shelves of potions and ingredients, herbs hanging, a lamp over the cauldron
    for (const b of [17, 20]) { p.box(u0 + 1, u0 + 1, 0, 3, b, b + 1, B.PLANKS_DARK); p.box(u0 + 1, u0 + 1, 2, 2, b, b + 1, B.POTION); }
    for (const b of [26, 29]) { p.box(u1 - 1, u1 - 1, 0, 3, b, b + 1, B.PLANKS_DARK); p.box(u1 - 1, u1 - 1, 2, 2, b, b + 1, B.POTION); }
    for (const a of [-49, -45, -37, -33]) p.box(a, a, h - 1, h - 1, v1 - 1, v1 - 1, B.WHEAT);
    p.box(cu, cu, h - 1, h - 1, cv, cv, B.ARCANE_LAMP);
    // the brewer's place, the walking graph (the west road passes before the door)
    const door = p.node(cu, 11, 0), inn = p.node(cu, 17, 0, 'room:cauldronHall');
    p.link(door, inn); p.link(door, p.node(cu, 0, 0));
    const spot = p.node(cu, 20, 0, 'cauldron');
    p.link(inn, spot);
    out.spots.push({ kind: 'cauldron', ...p.pt(cu, 20.4, 0), yaw: p.yaw(Math.PI), node: spot });
    out.civic.push({
        kind: 'cauldronHall', civic: true, rich: true, wizard: true, c: p.pt(cu, cv), r: 12, doorRec: civicDoor(p, cu, v0, 0, 1, 3, 6), windows,
        chests: [], bedSpots: [], homeNode: inn, doorNode: door, door: p.pt(cu, 11), inside: p.pt(cu, 17), beds: 0,
    });
    void rng;
}

/** The small library: shelves round the walls, the reading table with the scrolls, room for the lore books. */
function buildLibrary(p, rng, out) {
    const B = BLOCK;
    const u0 = 28, u1 = 46, v0 = 14, v1 = 28, h = 8, du = 37;
    p.box(u0, u1, -1, -1, v0, v1, B.PLANKS_DARK);
    p.walls(u0, u1, v0, v1, 0, h - 1, B.ARCANE);
    p.box(u0 + 1, u1 - 1, 0, h - 1, v0 + 1, v1 - 1, 0);
    for (const [a, b] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) p.box(a, a, 0, h, b, b, B.ARCANE_DARK);
    gable(p, u0, u1, v0, v1, h, B.ROOF_PURPLE, B.ARCANE);
    p.box(du - 1, du + 1, 0, 5, v0, v0, 0);
    p.box(du - 2, du + 2, 6, 6, v0, v0, B.ARCANE_DARK);
    p.box(du - 1, du + 1, -1, -1, v0 - 3, v0 - 1, B.PATH);
    const windows = [];
    windowHole(p, windows, true, v0, 31, 32, 2, 4); windowHole(p, windows, true, v0, 42, 43, 2, 4);
    // the shelves: the back wall and both side walls (a gap at the windows)
    p.box(u0 + 1, u1 - 1, 0, 5, v1 - 1, v1 - 1, B.BOOKS);
    p.box(u0 + 1, u0 + 1, 0, 5, v0 + 4, v1 - 2, B.BOOKS);
    p.box(u1 - 1, u1 - 1, 0, 5, v0 + 4, v1 - 2, B.BOOKS);
    // the reading table (2 high: its top at a hand's height), a lamp over it, a rug
    p.box(du - 3, du + 3, -1, -1, 18, 23, B.CARPET_PURPLE);
    p.box(du - 2, du + 2, 0, 1, 20, 21, B.PLANKS_DARK);
    p.box(du, du, h - 1, h - 1, 20, 21, B.ARCANE_LAMP);
    for (const [a, b] of [[31, 24], [43, 24]]) p.box(a, a, h - 1, h - 1, b, b, B.ARCANE_LAMP);
    // the scrolls of simple spells on the table: 2–5, different from place to place (repeats between places are fine)
    const n = 2 + Math.floor(rng() * 4);
    const pool = LIBRARY_SPELLS.slice();
    const scrolls = [];
    for (let i = 0; i < n; i++) { const k = Math.floor(rng() * pool.length); scrolls.push(pool.splice(k, 1)[0]); }
    const top = p.L(1) - 0.5;
    const spots = scrolls.map((_, i) => { const q = p.pt(du - 1.6 + (3.2 * i) / Math.max(1, n - 1), 20.5, 0); return { x: q.x, y: top, z: q.z }; });
    // the desk of the world's history before the back shelves: the books of the lore lie on it (LoreLibrary.js — LoreBooks.js)
    p.box(31, 43, 0, 1, 24, 25, B.PLANKS_DARK);
    const lore = [];
    for (let i = 0; i < 7; i++) { const q = p.pt(32 + i * 1.6, 24.5, 0); lore.push({ x: q.x, y: p.L(1) - 0.5, z: q.z }); }
    const door = p.node(du, 11, 0), inn = p.node(du, 17, 0, 'room:library'), desk = p.node(du, 18, 0, 'library');
    p.link(door, inn); p.link(inn, desk); p.link(door, p.node(du, 0, 0));
    out.spots.push({ kind: 'desk', ...p.pt(du, 18.6, 0), yaw: p.yaw(Math.PI), node: desk });
    out.library = { scrolls, spots, lore, ...p.rect(u0 + 1, u1 - 1, v0 + 1, v1 - 1) };
    out.civic.push({
        kind: 'library', civic: true, rich: true, wizard: true, c: p.pt(du, 21), r: 10, doorRec: civicDoor(p, du, v0, 0, 1, 3, 6), windows,
        chests: [], bedSpots: [], homeNode: inn, doorNode: door, door: p.pt(du, 11), inside: p.pt(du, 17), beds: 0,
    });
}

// ------------------------------------------------------------- the market
/**
 * The crooked lane of the market: shops on both sides, each a narrow tall house that leans and
 * twists (its upper floors drift over the lane and aside, a crooked spire, a bent chimney), its
 * open front with a counter, the seller behind it; hanging signs, lamps over the lane.
 */
function buildMarket(p, rng, out) {
    const B = BLOCK;
    const walls = [B.PLASTER, B.ARCANE, B.BRICK, B.PLANKS_DARK, B.CS_SAND, B.CS_MOSSY];
    const roofs = [B.ROOF_PURPLE, B.ROOF_BLUE, B.ROOF_SLATE, B.ROOF_RED, B.ROOF_PURPLE];
    const signs = { cauldrons: B.POTION, potions: B.POTION, robes: B.CARPET_PURPLE, wands: B.GOLD, armor: B.CS_GREY, scrolls: B.BOOKS, curios: B.ARCANE_LAMP_VIOLET, pawn: B.GOLD };
    const shelves = { cauldrons: B.COBBLE, potions: B.POTION, robes: B.CARPET_PURPLE, wands: B.PLANKS, armor: B.CS_GREY, scrolls: B.BOOKS, curios: B.ARCANE_LAMP_VIOLET, pawn: B.CLOTH_YELLOW };
    // the trades: the cauldrons by the plaza (west, first: room for its cauldron), the pawnshop at the far end (east, last)
    const mid = VILLAGE_TRADES.slice(1, -1);
    for (let i = mid.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [mid[i], mid[j]] = [mid[j], mid[i]]; }
    const order = [VILLAGE_TRADES[0], ...mid, VILLAGE_TRADES[VILLAGE_TRADES.length - 1]];
    // (west 0..3 along the lane, then east 0..3)
    let k = 0;
    for (const s of [-1, 1]) {
        SHOP_V.forEach((vc, i) => {
            const trade = order[k++];
            const wall = walls[Math.floor(rng() * walls.length)], roof = roofs[Math.floor(rng() * roofs.length)];
            const T = B.PLANKS_DARK;
            const f = 4 * s, bk = 13 * s; // the front (on the lane) and the back
            const lo = Math.min(f, bk), hi = Math.max(f, bk);
            // ---- the ground floor: side and back walls, corner pillars at the open front, a ceiling
            p.box(lo, hi, -1, -1, vc - 5, vc + 5, B.PLANKS_DARK);
            p.box(lo, hi, 0, 5, vc - 5, vc - 5, wall); p.box(lo, hi, 0, 5, vc + 5, vc + 5, wall);
            p.box(bk, bk, 0, 5, vc - 5, vc + 5, wall);
            p.box(f, f, 0, 5, vc - 5, vc - 4, T); p.box(f, f, 0, 5, vc + 4, vc + 5, T);
            p.box(lo, hi, 6, 6, vc - 5, vc + 5, T);
            // the counter in the open front (2 high, 2 deep: things lie on it), cloth on it; shelves of the trade on the back wall
            p.box(f, f + s, 0, 1, vc - 2, vc + 2, B.PLANKS_DARK);
            p.box(f, f + s, 1, 1, vc - 2, vc + 2, trade === 'pawn' ? B.CLOTH_YELLOW : B.CLOTH_WHITE);
            p.box(bk - s, bk - s, 0, 4, vc - 3, vc + 3, B.PLANKS_DARK);
            p.box(bk - s, bk - s, 1, 1, vc - 3, vc + 3, shelves[trade]); p.box(bk - s, bk - s, 3, 3, vc - 3, vc + 3, shelves[trade]);
            p.box(9 * s, 9 * s, 5, 5, vc, vc, B.ARCANE_LAMP);
            // ---- the crooked upper floors: the walls drift layer by layer (over the lane and aside)
            const H = 15 + Math.floor(rng() * 9);
            const ku = (rng() * 0.42 - 0.12), kv = (rng() * 0.36 - 0.18), bend = rng() < 0.5 ? 1 : -1;
            const off = (l) => {
                const t = l - 6;
                // (towards the lane at most 2: the opposite shop leans too — the lane narrows overhead; away at most 3)
                const amt = Math.max(-3, Math.min(2, Math.round(ku * t + (t > 6 ? bend * 0.12 * (t - 6) : 0))));
                const du = -s * amt;
                const dv = Math.max(-2, Math.min(2, Math.round(kv * t - (t > 8 ? bend * 0.15 * (t - 8) : 0))));
                return [du, dv];
            };
            let l = 7, top = [0, 0];
            while (l <= H) {
                const [du, dv] = off(l);
                let l1 = l;
                while (l1 + 1 <= H && off(l1 + 1)[0] === du && off(l1 + 1)[1] === dv) l1++;
                const a0 = lo + du, a1 = hi + du, b0 = vc - 5 + dv, b1 = vc + 5 + dv;
                // a floor of the shell: four walls (timber at the corners)
                p.box(a0, a1, l, l1, b0, b0, wall); p.box(a0, a1, l, l1, b1, b1, wall);
                p.box(a0, a0, l, l1, b0, b1, wall); p.box(a1, a1, l, l1, b0, b1, wall);
                for (const [a, b] of [[a0, b0], [a1, b0], [a0, b1], [a1, b1]]) p.box(a, a, l, l1, b, b, T);
                // lit windows in the lane-side wall (the shops live upstairs: lamps glow in them)
                const fa = s < 0 ? a1 : a0;
                for (let w = l; w <= l1; w++) if ((w - 7) % 4 === 1) { p.box(fa, fa, w, w, b0 + 3, b0 + 3, (w + i) % 8 === 2 ? B.ARCANE_LAMP_VIOLET : B.ARCANE_LAMP); p.box(fa, fa, w, w, b1 - 3, b1 - 3, B.ARCANE_LAMP); }
                top = [du, dv];
                l = l1 + 1;
            }
            // ---- the crooked roof: a pyramid drifting to one side, a bent spire, a twisted chimney
            const [tu, tv] = top;
            const drift = rng() < 0.5 ? 1 : -1;
            for (let r = 0; r <= 5; r++) {
                const sh = Math.round(r * 0.6) * drift;
                const a0 = lo + tu + r, a1 = hi + tu - r, b0 = vc - 5 + tv + r + sh, b1 = vc + 5 + tv - r + sh;
                if (a0 > a1 || b0 > b1) break;
                p.box(a0, a1, H + 1 + r, H + 1 + r, b0, b1, roof);
                if (r === 5 || a0 + 1 > a1 - 1 || b0 + 1 > b1 - 1) {
                    const su = Math.round((a0 + a1) / 2), sv = Math.round((b0 + b1) / 2);
                    p.box(su, su, H + 2 + r, H + 4 + r, sv, sv, roof);
                    p.box(su + s, su + s, H + 5 + r, H + 6 + r, sv + drift, sv + drift, roof);
                    p.box(su + s, su + s, H + 7 + r, H + 7 + r, sv + drift, sv + drift, B.ARCANE_LAMP_VIOLET);
                    break;
                }
            }
            const cu0 = bk - 2 * s + tu, cv0 = vc + 3 * drift + tv;
            for (let c = 0; c < 3; c++) p.box(cu0 + (c % 2) * s, cu0 + (c % 2) * s, H + 1 + c * 3, H + 3 + c * 3, cv0 - (c === 2 ? drift : 0), cv0 - (c === 2 ? drift : 0), B.BRICK);
            // ---- the hanging sign over the lane, a lamp under the eaves
            p.box(3 * s, 3 * s, 9, 9, vc + 2, vc + 2, B.FENCE);
            p.box(3 * s, 3 * s, 7, 8, vc + 2, vc + 2, signs[trade]);
            p.box(3 * s, 3 * s, 7, 7, vc - 3, vc - 3, B.ARCANE_LAMP);
            // ---- the stall: the seller behind the counter, the buyer in the lane
            const front = p.pt(2 * s, vc, 0), back = p.pt(7.5 * s, vc, 0);
            const fn = p.node(2 * s, vc, 0, 'stall');
            p.link(fn, p.node(0, vc, 0));
            const stall = {
                trade, front, back, frontNode: fn,
                counter: { ...p.rect(f, f + s, vc - 2, vc + 2), top: p.L(1) - 0.5 },
                yaw: p.yaw(s < 0 ? -Math.PI / 2 : Math.PI / 2), // (the seller looks at the lane)
            };
            if (trade === 'cauldrons') {
                // the master of cauldrons and potions (CastleTalk / Cauldrons.js): his cauldron for sale stands by the lane's mouth
                stall.potions = true;
                const c = p.pt(-8.5, -19.5, 0);
                stall.cauldron = { x: c.x, y: c.y, z: c.z, yaw: p.yaw(-Math.PI / 2) };
            }
            if (trade === 'pawn') stall.pawn = true;
            out.stalls.push(stall);
        });
    }
    // the crooked arch over the lane's mouth
    for (const su of [-1, 1]) p.box(su * 4, su * 4, 0, 7 + (su > 0 ? 1 : 0), -18, -18, B.ARCANE_DARK);
    p.box(-4, 0, 8, 8, -18, -18, B.ARCANE_DARK); p.box(0, 4, 9, 9, -18, -18, B.ARCANE_DARK);
    p.box(1, 1, 10, 10, -18, -18, B.GOLD);
    p.box(-1, -1, 7, 7, -18, -18, B.ARCANE_LAMP_VIOLET);
    out.market = { ...p.pt(0, -44, 0), ...p.rect(-13, 13, LANE_END, -18) };
}

// ------------------------------------------------------------- the houses
/** Reserved places of the middle: no lot may come near them. */
function lotFree(u, v, r) {
    if (Math.abs(u) < 5 + r || Math.abs(v) < 5 + r) return false; // the spokes
    if (Math.hypot(u, v) < PLAZA_R + 4 + r) return false;
    const inRect = (a0, a1, b0, b1, m = 3) => u + r > a0 - m && u - r < a1 + m && v + r > b0 - m && v - r < b1 + m;
    if (inRect(-19, 19, 6, 54)) return false; // the hall and its lanes
    if (inRect(-52, -30, 10, 32)) return false; // the cauldron hall
    if (inRect(28, 46, 10, 28)) return false; // the library
    if (inRect(-14, 14, LANE_END - 2, -16)) return false; // the market
    if (Math.hypot(u - ARENA_SPOT.u, v - ARENA_SPOT.v) < ARENA_SPOT.r + 4 + r) return false; // the arena's place
    for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (Math.abs(u - su * (R1 - 5)) < r + 4 && Math.abs(v - sv * (R1 - 5)) < r + 4) return false; // the obelisks
    return true;
}

/** Up to MAX_HOUSES wizards' houses on lots facing the roads; the other lots: gardens, fountains, obelisks. */
function buildHouses(p, rng, out) {
    const B = BLOCK;
    const lots = [];
    const addLots = (along, fixed, from, to, side, face) => {
        for (let t = from; t <= to; t += 16) {
            const u = along === 'u' ? t : fixed + side * 9;
            const v = along === 'u' ? fixed + side * 9 : t;
            if (!lotFree(u, v, 7)) continue;
            lots.push({ u, v, face });
        }
    };
    // inside the inner ring (facing it), between the rings (both sides), outside the outer ring
    addLots('u', -R1, -R1 + 10, R1 - 10, 1, 0); addLots('u', R1, -R1 + 10, R1 - 10, -1, 2);
    addLots('v', -R1, -R1 + 10, R1 - 10, 1, 3); addLots('v', R1, -R1 + 10, R1 - 10, -1, 1);
    for (const [R, side] of [[R1, -1], [R2, 1], [R2, -1]]) {
        const lim = R - 8;
        addLots('u', -R, -lim, lim, side, side < 0 ? 2 : 0); addLots('u', R, -lim, lim, -side, side < 0 ? 0 : 2);
        addLots('v', -R, -lim, lim, side, side < 0 ? 1 : 3); addLots('v', R, -lim, lim, -side, side < 0 ? 3 : 1);
    }
    // (no two lots on one place)
    const used = [];
    const free = lots.filter((L) => {
        if (used.some((o) => Math.abs(o.u - L.u) < 14 && Math.abs(o.v - L.v) < 14)) return false;
        used.push(L);
        return true;
    });
    // which lots get houses: a shuffle; the rest are gardens
    const order = free.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const nHouses = Math.min(MAX_HOUSES, Math.round(free.length * 0.9));
    const isHouse = new Set(order.slice(0, nHouses));
    const kinds = ['cottage', 'manor', 'towerhouse', 'cottage', 'stone', 'hut', 'towerhouse', 'manor'];
    const roofs = [B.ROOF_PURPLE, B.ROOF_BLUE, B.ROOF_SLATE];
    const decorate = (P, { w, d, da, top, house, table, cauldron }) => {
        if (cauldron) P.box(cauldron[0], cauldron[0], 0, 0, cauldron[1], cauldron[1], B.POTION);
        if (table) P.box(table[0], table[0], 2, 2, table[1], table[1], B.ARCANE_LAMP);
        P.box(w - 2, w - 2, 0, 0, -d - 1, -d - 1, B.FLOWERS);
        P.box(0, 0, top, top, 0, 0, B.ARCANE_LAMP_VIOLET);
        P.box(da + 2, da + 2, 4, 4, -d - 1, -d - 1, B.ARCANE_LAMP);
        house.wizard = true;
    };
    free.forEach((lot, i) => {
        const [ra, rb] = rotLot(0, -9, lot.face);
        const road = p.node(lot.u + ra, lot.v + rb, 0);
        if (isHouse.has(i)) {
            const roof = roofs[Math.floor(rng() * roofs.length)];
            const style = {
                houseStone: rng() < 0.6 ? B.ARCANE : B.CS_WHITE, villageRoof: roof, poorRoof: roof, poorWall: rng() < 0.5 ? B.PLASTER : B.PLANKS,
                roof, carpet: B.CARPET_PURPLE, bedRich: rng() < 0.5 ? 'purple' : 'blue', doorTop: 5, noWoodpile: true, decorate,
            };
            const kind = kinds[Math.floor(rng() * kinds.length)];
            const door = buildHouse(p, kind, lot.u, lot.v, lot.face, rng, style, out);
            p.link(door, road);
            return;
        }
        garden(p, lot, road, rng);
    });
}

/** A lot without a house: a herb garden, a magic fountain, a little obelisk, a flower bed with a bench. */
function garden(p, lot, road, rng) {
    const B = BLOCK;
    const at = (a, b) => { const [x, z] = rotLot(a, b, lot.face); return [lot.u + x, lot.v + z]; };
    const box = (a0, a1, l0, l1, b0, b1, t) => { const [u0, v0] = at(a0, b0), [u1, v1] = at(a1, b1); p.box(u0, u1, l0, l1, v0, v1, t); };
    const x = rng();
    if (x < 0.3) { // a magic fountain: a white basin, a glowing column
        const [u, v] = at(0, 0);
        p.cyl(u, v, 3.5, 0, 0, B.CS_WHITE, 2.5);
        p.cyl(u, v, 2.5, -1, -1, B.ICE_GLOW);
        p.box(u, u, 0, 2, v, v, B.CS_WHITE); p.box(u, u, 3, 3, v, v, B.ARCANE_LAMP);
    } else if (x < 0.55) { // the herb garden: rows of flowers and herbs on tilled earth
        box(-5, 5, -1, -1, -4, 4, B.FARMLAND);
        for (let a = -5; a <= 5; a += 2) box(a, a, 0, 0, -4, 4, (a / 2) % 2 ? B.FLOWERS : B.VEG);
    } else if (x < 0.75) { // a little obelisk in a ring of runes
        const [u, v] = at(0, 0);
        p.cyl(u, v, 3, -1, -1, B.RUNE, 2);
        p.box(u, u, 0, 4, v, v, B.ARCANE_DARK); p.box(u, u, 5, 5, v, v, B.ARCANE_LAMP_VIOLET);
    } else { // flower beds, a bench, a lamp
        box(-4, -2, 0, 0, -2, 2, B.FLOWERS); box(2, 4, 0, 0, -2, 2, B.FLOWERS);
        box(-1, 1, 0, 0, 3, 3, B.PLANKS_DARK);
        box(0, 0, 0, 2, -4, -4, B.FENCE); box(0, 0, 3, 3, -4, -4, B.ARCANE_LAMP);
    }
    const [gu, gv] = at(0, -6);
    p.link(p.node(gu, gv, 0, 'garden'), road);
}

// ------------------------------------------------------------- the whole site
/** The whole settlement. Returns the castle-shaped record. */
export function buildVillageSite(seed, gx, gz, X, Z, F, rng) {
    const rot = Math.floor(rng() * 4);
    const p = new Plan(X, Z, F, rot);
    const out = { houses: [], pens: [], chests: [], civic: [], stalls: [], spots: [] };
    buildCore(p, rng, out);
    buildHall(p, rng, out);
    buildCauldronHall(p, rng, out);
    buildLibrary(p, rng, out);
    buildMarket(p, rng, out);
    buildHouses(p, rng, out);
    p.joinRoads();
    const id = 'wv' + gx + '_' + gz;
    const name = `${NAMES_A[Math.floor(rng() * NAMES_A.length)]} ${NAMES_B[Math.floor(rng() * NAMES_B.length)]}`;
    const elder = `${ELDER_A[Math.floor(rng() * ELDER_A.length)]} ${ELDER_B[Math.floor(rng() * ELDER_B.length)]}`;
    const dwellings = out.houses.length;
    // (the dwellings first — the people's homes by number; then the hall, the cauldron hall, the library)
    const houses = out.houses.concat(out.civic).map((h, i) => ({ ...h, id: id + '_h' + i }));
    const beds = out.houses.reduce((n, h) => n + (h.beds || 1), 0);
    const def = {
        id, kind: 'wizvillage', gx, gz, x: X, z: Z, F, rot, name, king: elder, elder, color: 0x2f7f86, colorName: 'бирюзовые',
        stone: BLOCK.ARCANE, zone: VILLAGE_ZONE, style: 'wizvillage', styleName: 'Поселение волшебников',
        walls: p.rect(-R1, R1, -R1, R1), inner: p.rect(-13, 13, 24, 46), keep: p.rect(-13, 13, 24, 46),
        gate: p.pt(0, -(VILLAGE_ZONE - 4)), gateIn: p.pt(0, -PLAZA_R), gateYaw: p.yaw(0), door: p.pt(0, 21), doorIn: p.pt(0, 27),
        population: 1 + out.stalls.length + Math.round(beds * 1.1), knights: 0, teachers: 0, wseed: seed, dwellings,
        throne: out.throne, throneFront: out.throneFront, posts: out.posts,
        rooms: [], chests: out.chests.map((c, i) => ({ ...c, id: id + '_ch' + i })),
        houses, stalls: out.stalls, fields: [], pens: [], market: out.market, wallWalk: [],
        dummies: [], spots: out.spots, fire: out.fire, statue: out.statue, library: out.library, arena: out.arena,
        lore: out.library.lore, // (the library's desk: where the books of the world's history lie — LoreLibrary.js)
        nodes: p.nodes, edges: p.edges, parts: p.parts,
        topL: F + 1 + 60,
    };
    def._byChunk = new Map();
    return def;
}

// ------------------------------------------------------------- placement
/** Level, dry, low ground for a settlement at (X, Z)? Its median height (the land's level) or null. */
export function villageGround(raw, X, Z) {
    let wet = 0, all = 0;
    const hs = [];
    const lush = !!raw.land;
    const Zn = VILLAGE_ZONE;
    for (let dz = -Zn; dz <= Zn; dz += 12) for (let dx = -Zn; dx <= Zn; dx += 12) {
        const h = raw(X + dx, Z + dz);
        all++;
        if (raw.water) { wet++; continue; }
        if (h > (lush ? 12 : 10)) return null;
        hs.push(h);
    }
    if (wet > all * 0.25 || hs.length < 10) return null;
    hs.sort((a, b) => a - b);
    if (hs[Math.floor(hs.length * 0.9)] - hs[Math.floor(hs.length * 0.1)] > (lush ? 8 : 7)) return null;
    return Math.max(0, Math.min(5, Math.round(hs[Math.floor(hs.length / 2)])));
}

/** Finds and remembers the settlements (the same shape of answers as CastleIndex / TowerIndex). */
export class VillageIndex {
    constructor(seed, raw, castles, towers) {
        this.seed = seed; this.raw = raw; this.castles = castles; this.towers = towers;
        this.cells = new Map();
        this._lastCell = null;
        this._spawn = undefined;
    }

    _key(gx, gz) { return gx * 65536 + gz; }

    cellOf(gx, gz) {
        const key = this._key(gx, gz);
        if (this.cells.has(key)) return this.cells.get(key);
        const t = this._make(gx, gz);
        this.cells.set(key, t);
        return t;
    }

    _rng(gx, gz) { return createRng((this.seed * 48271 + gx * 15485863 + gz * 32452843 + 0x77a1) >>> 0); }

    /** The first good spot of a cell (or null), and the rng to go on with. */
    _place(gx, gz) {
        const rng = this._rng(gx, gz);
        rng();
        for (let t = 0; t < TRIES; t++) {
            const X = Math.round(gx * CASTLE_CELL + V_M + rng() * V_SPAN);
            const Z = Math.round(gz * CASTLE_CELL + V_M + rng() * V_SPAN);
            if (Math.hypot(X, Z) < MIN_SPAWN) continue;
            const F = villageGround(this.raw, X, Z);
            if (F == null) continue;
            return { X, Z, F, rng };
        }
        return null;
    }

    /** A free cell: no castle, no tower. */
    _freeCell(gx, gz) { return !this.castles.cellOf(gx, gz) && !this.towers.cellOf(gx, gz); }

    /** The cell of the settlement always found near the spawn (a key, or −1). */
    spawnKey() {
        if (this._spawn !== undefined) return this._spawn;
        this._spawn = -1;
        const cells = [];
        const n = Math.ceil(SPAWN_RING[1] / CASTLE_CELL) + 1;
        for (let gz = -n; gz <= n; gz++) for (let gx = -n; gx <= n; gx++) {
            const d = Math.hypot((gx + 0.5) * CASTLE_CELL, (gz + 0.5) * CASTLE_CELL);
            if (d >= SPAWN_RING[0] && d <= SPAWN_RING[1]) cells.push({ gx, gz, d });
        }
        cells.sort((a, b) => a.d - b.d || a.gx - b.gx || a.gz - b.gz);
        for (const c of cells) {
            if (!this._freeCell(c.gx, c.gz)) continue;
            if (this._place(c.gx, c.gz)) { this._spawn = this._key(c.gx, c.gz); break; }
        }
        return this._spawn;
    }

    _make(gx, gz) {
        if (offEarth((gx + 1) * CASTLE_CELL)) return null; // (no settlements on other planets)
        if (!this._freeCell(gx, gz)) return null; // (one site per cell)
        const pass = hash01(gx * 17 + 9, gz * 19 + 2, this.seed + 3100) <= VILLAGE_P;
        if (!pass) {
            const d = Math.hypot((gx + 0.5) * CASTLE_CELL, (gz + 0.5) * CASTLE_CELL);
            if (d < SPAWN_RING[0] || d > SPAWN_RING[1] || this.spawnKey() !== this._key(gx, gz)) return null;
        }
        const at = this._place(gx, gz);
        if (!at) return null;
        return buildVillageSite(this.seed, gx, gz, at.X, at.Z, at.F, at.rng);
    }

    /** Settlements whose land reaches within `r` of a point. */
    near(x, z, r = 0) {
        if (offEarth(x - r)) return [];
        const out = [];
        const g0x = Math.floor((x - r) / CASTLE_CELL) - 1, g1x = Math.floor((x + r) / CASTLE_CELL) + 1;
        const g0z = Math.floor((z - r) / CASTLE_CELL) - 1, g1z = Math.floor((z + r) / CASTLE_CELL) + 1;
        for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
            const c = this.cellOf(gx, gz);
            if (!c) continue;
            if (Math.max(Math.abs(c.x - x), Math.abs(c.z - z)) <= c.zone + BLEND + r) out.push(c);
        }
        return out;
    }

    landAt(ix, iz) {
        const gx = Math.floor(ix / CASTLE_CELL), gz = Math.floor(iz / CASTLE_CELL);
        let c = this._lastCell;
        if (!c || c.gx !== gx || c.gz !== gz) c = this._lastCell = { gx, gz, castle: this.cellOf(gx, gz) };
        const k = c.castle;
        if (!k) return null;
        const d = Math.max(Math.abs(ix - k.x), Math.abs(iz - k.z));
        if (d > k.zone + BLEND) return null;
        const w = d <= k.zone ? 1 : 1 - (d - k.zone) / BLEND;
        return { castle: k, w: w * w * (3 - 2 * w) };
    }

    partsForChunk(cx, cz, CHUNK) {
        const x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = x0 + CHUNK - 1, z1 = z0 + CHUNK - 1;
        const out = [];
        for (const c of this.near(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK)) {
            const key = cx * 65536 + cz;
            let list = c._byChunk.get(key);
            if (!list) {
                list = c.parts.filter((q) => q.x1 >= x0 && q.x0 <= x1 && q.z1 >= z0 && q.z0 <= z1);
                c._byChunk.set(key, list);
            }
            if (list.length) out.push(list);
        }
        return out;
    }

    nearestForMap(p, r = 900) {
        const now = Math.floor(p.x / 40) + ',' + Math.floor(p.z / 40);
        if (this._mapKey !== now) {
            this._mapKey = now;
            this._mapList = this.near(p.x, p.z, r).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 1);
        }
        return this._mapList;
    }
}
