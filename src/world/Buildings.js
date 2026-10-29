/**
 * Buildings.js — the different buildings of the settlements (world generation 11; BUILDINGS_FROM_GEN, Terrain.js).
 *
 * The author: «сейчас в деревнях одни и те же дома… больше РАЗНЫХ зданий: церковь, кузница, таверна, мельница, колодец,
 * конюшня, пекарня, лавка травника, амбар». Pure data (no THREE): the blocks go into the settlement's plan (`Plan.box`), the
 * rest into the records the game already knows:
 *  - a building that people live in is a HOUSE record (`out.houses`: the real door, glass, beds, chests, the family at home —
 *    src/game/Houses.js) with a `trade` (who lives there: the priest, the smith…) and a `flavor` of its chests;
 *  - a building with a counter has a STALL record (`out.stalls`, with `shop`: what is on the counter — MarketGoods.SHOPS);
 *  - the moving and sounding parts of a building (the mill's sails, the church bell, the forge's smoke) are `out.fx` records,
 *    drawn by src/game/BuildingFx.js (one shared shape, only near the player);
 *  - the well is only blocks (a basin, a roof on posts, a bucket) and an `out.wells` record.
 *
 * Sizes are from the world (1 block = 1 m; the hero ~3.5 m, 4.6 with a hat): a door 3 wide × 6 high, a room 7–8 m to the
 * eaves, a way through a room 3 wide, a counter 2 high (a market stall), a table top at the waist (2 m), a seat at the knee
 * (1.5 m), a bed 2.5 × 5.5 (Beds.js). A normal lot is 17 × 14 (the houses' 17 m grid, back to back with the next row: a building
 * is up to 15 × 13 with its eaves one block over, nothing before b = −7 — the road's edge is at −8);
 * a BIG lot (`big`: the church, the stable) is 26 × 26 — the lots round it are left empty, as round the graveyard.
 * The door always looks at the road (local −b), the door node 8 m before the lot's middle joins the road's node.
 *
 * Lot coordinates (a across, b deep; the door side is −b) are turned by `rotLot`; layer 0 is the floor, −1 the floor's blocks.
 * (Imports Castles.js and Terrain.js only inside functions: they import this file, never read BLOCK at the top level.)
 */

import { BLOCK } from './Terrain.js';
import { createRng } from '../core/math.js';
import { SHAPE } from './BlockShapes.js';
import { rotLot, inwardRy, CHEST_GAP, HOUSE_CHEST_SCALE, placeChests, floorCells } from './Castles.js';

/** What there is: the name for the player, a big lot or a normal one. */
export const BUILDING_KINDS = {
    well: { ru: 'Колодец', big: false, house: false },
    granary: { ru: 'Амбар', big: false, house: true },
    smithy: { ru: 'Кузница', big: false, house: true },
    tavern: { ru: 'Таверна', big: false, house: true },
    chapel: { ru: 'Часовня', big: false, house: true },
    church: { ru: 'Церковь', big: true, house: true },
    mill: { ru: 'Мельница', big: false, house: true },
    bakery: { ru: 'Пекарня', big: false, house: true },
    herbalist: { ru: 'Лавка травника', big: false, house: true },
    stable: { ru: 'Конюшня', big: true, house: true },
};
export const BUILDING_IDS = Object.keys(BUILDING_KINDS);

/** Who lives in a building (a person's trade: CastleLife `e.trade`; the clothes — game/Trades.js). */
export const TRADE_OF = {
    granary: 'keeper', smithy: 'smith', tavern: 'innkeeper', chapel: 'priest', church: 'priest',
    mill: 'miller', bakery: 'baker', herbalist: 'herbalist', stable: 'stableman',
};
/** What the chests of a building hold (ItemTypes.rollStoreLoot flavors). */
const FLAVOR_OF = { granary: 'food', smithy: 'arms', tavern: 'food', chapel: 'scrolls', church: 'scrolls', mill: 'food', bakery: 'food', herbalist: 'scrolls', stable: 'clothes' };

// ---------------------------------------------------------------- the kit
const DOOR_W = 3, DOOR_TOP = 5; // the doorway: 3 wide, layers 0…5 (6 high)

/** The toolbox of one building: lot coordinates in, plan blocks out. */
function kit(p, cu, cv, face, kind, rng, s, out) {
    const B = BLOCK;
    const rot = (a, b) => rotLot(a, b, face);
    out.fx = out.fx || []; out.wells = out.wells || []; out.buildings = out.buildings || [];
    const filled = new Set(); // (what stands on the floor — placeChests keeps chests off it)
    const K = {
        p, B, s, rng, out, kind, filled, face,
        house: {
            kind, bld: kind, rich: false, id: null, door: null, inside: null, doorNode: null, homeNode: null, beds: 0,
            doorRec: null, windows: [], chests: [], bedSpots: [], c: null, r: 8, trade: TRADE_OF[kind] || null, flavor: FLAVOR_OF[kind] || null,
        },
        beds: [], keep: [], wants: [], inner: [],
        mark() { return p.parts.length; },
        raw(a0, a1, l0, l1, b0, b1, t) { const [x0, z0] = rot(a0, b0), [x1, z1] = rot(a1, b1); p.box(cu + x0, cu + x1, l0, l1, cv + z0, cv + z1, t); },
        pt(a, b, l = 0) { const [x, z] = rot(a, b); return p.pt(cu + x, cv + z, l); },
        node(a, b, l = 0, tag) { const [x, z] = rot(a, b); return p.node(cu + x, cv + z, l, tag); },
        slab(a, b, l, shape = SHAPE.SLAB) { const [x, z] = rot(a, b); p.slabAt(cu + x, cv + z, l, shape); },
        cyl(a, b, r, l0, l1, t, hr = -1) { const [x, z] = rot(a, b); p.cyl(cu + x, cv + z, r, l0, l1, t, hr); },
        /** World yaw of a character facing along lot (a, b) (the model faces −Z). */
        yaw(a, b) { const o = K.pt(0, 0), q = K.pt(a, b); return Math.atan2(-(q.x - o.x), -(q.z - o.z)); },
        /** rotation.y of a thin thing lying along lot direction (a, b). */
        along(a, b) { const o = K.pt(0, 0), q = K.pt(a, b); return Math.atan2(-(q.z - o.z), q.x - o.x); },
        rect(a0, a1, b0, b1) { const [x0, z0] = rot(a0, b0), [x1, z1] = rot(a1, b1); return p.rect(cu + x0, cu + x1, cv + z0, cv + z1); },
    };
    K.box = floorCells(K.raw, 0, filled);
    K.house.c = K.pt(0, 0);
    return K;
}

/** A hole in a wall the game glazes (a pane: Houses.js). `tint`: a coloured pane (stained glass). */
function win(K, a0, a1, b0, b1, l0, l1, tint, plane) {
    K.box(a0, a1, l0, l1, b0, b1, 0);
    const q0 = K.pt(a0, b0), q1 = K.pt(a1, b1);
    const alongA = plane ? plane === 'a' : b0 === b1; // (the pane lies along a: a window in a front or back wall)
    const rec = {
        x: (q0.x + q1.x) / 2, z: (q0.z + q1.z) / 2, y: (K.p.L(l0) + K.p.L(l1)) / 2 - 1,
        ry: alongA ? K.along(1, 0) : K.along(0, 1), w: (alongA ? a1 - a0 : b1 - b0) + 1, h: l1 - l0 + 1,
    };
    if (tint != null) rec.tint = tint;
    K.house.windows.push(rec);
}

/** The front door: a doorway 3 × 6 in the front wall (b = bf) at a = da, a lintel, a step, a lantern post. */
function frontDoor(K, da, bf, timber) {
    const B = K.B;
    K.box(da - 1, da + 1, 0, DOOR_TOP, bf, bf, 0);
    K.box(da - 2, da + 2, DOOR_TOP + 1, DOOR_TOP + 1, bf, bf, timber);
    K.box(da - 1, da + 1, -1, -1, bf - 2, bf - 1, B.PATH);
    const dp = K.pt(da, bf), di = K.pt(da, bf + 1);
    K.house.doorRec = { x: dp.x, y: dp.y, z: dp.z, ry: inwardRy(K.along(1, 0), di.x - dp.x, di.z - dp.z), w: DOOR_W, h: DOOR_TOP + 1 };
    // a lantern on a post at each side of the step
    for (const side of [-3, 3]) { K.box(da + side, da + side, 0, 3, bf - 1, bf - 1, timber); K.box(da + side, da + side, 4, 4, bf - 1, bf - 1, B.LANTERN); }
}

/** Walls, base course, corner posts and the floor of a rectangle (outer a0…a1 × b0…b1), the inside cleared. */
function shell(K, o) {
    const { a0, a1, b0, b1, h, wall, base, post, floor } = o;
    K.box(a0, a1, -1, -1, b0, b1, floor);
    K.box(a0, a1, 0, h - 1, b0, b0, wall); K.box(a0, a1, 0, h - 1, b1, b1, wall);
    K.box(a0, a0, 0, h - 1, b0, b1, wall); K.box(a1, a1, 0, h - 1, b0, b1, wall);
    K.box(a0, a1, 0, 1, b0, b0, base); K.box(a0, a1, 0, 1, b1, b1, base);
    K.box(a0, a0, 0, 1, b0, b1, base); K.box(a1, a1, 0, 1, b0, b1, base);
    K.box(a0 + 1, a1 - 1, 0, h - 1, b0 + 1, b1 - 1, 0);
    for (const [a, b] of [[a0, b0], [a1, b0], [a0, b1], [a1, b1]]) K.box(a, a, 0, h - 1, b, b, post);
}

/**
 * A gable roof over a rectangle (outer a0…a1 × b0…b1, eaves at layer h, one block of overhang), the ramps on it (slopeTop).
 * `ridge`: 'a' (the ridge runs along a, the slopes fall to −b and +b: the outer depth must be odd) or 'b' (along b, the outer
 * width must be odd). The gable ends are filled with `wall`. Returns the top layer.
 */
function gable(K, o) {
    const { a0, a1, b0, b1, h, roof, wall, ridge } = o;
    const mark = K.mark();
    let top;
    if (ridge === 'a') {
        const n = (b1 - b0) / 2; // half the depth
        for (let k = 0; k <= n + 1; k++) {
            K.raw(a0 - 1, a1 + 1, h + k, h + k, b0 - 1 + k, b1 + 1 - k, roof);
            if (k <= n) K.raw(a0 + 1, a1 - 1, h + k, h + k, b0 + k, b1 - k, 0);
            if (k >= 1 && k <= n) { K.raw(a0, a0, h + k, h + k, b0 + k, b1 - k, wall); K.raw(a1, a1, h + k, h + k, b0 + k, b1 - k, wall); }
        }
        top = h + n + 1;
    } else {
        const n = (a1 - a0) / 2;
        for (let k = 0; k <= n + 1; k++) {
            K.raw(a0 - 1 + k, a1 + 1 - k, h + k, h + k, b0 - 1, b1 + 1, roof);
            if (k <= n) K.raw(a0 + k, a1 - k, h + k, h + k, b0 + 1, b1 - 1, 0);
            if (k >= 1 && k <= n) { K.raw(a0 + k, a1 - k, h + k, h + k, b0, b0, wall); K.raw(a0 + k, a1 - k, h + k, h + k, b1, b1, wall); }
        }
        top = h + n + 1;
    }
    K.p.slopeTop(mark, roof);
    return top;
}

/** A table: legs at the corners, a top half a block thick at the waist (2 m). Cells a0…a1 × b0…b1. */
function table(K, a0, a1, b0, b1, top, leg) {
    for (const [a, b] of [[a0, b0], [a1, b0], [a0, b1], [a1, b1]]) K.box(a, a, 0, 0, b, b, leg);
    K.box(a0, a1, 1, 1, b0, b1, top);
    for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) K.slab(a, b, 1, SHAPE.SLAB_TOP);
}

/** A bench: a seat at the knee (1.5 m) — a block with a half block on it. */
function bench(K, a0, a1, b0, b1, mat) {
    K.box(a0, a1, 0, 0, b0, b1, mat);
    K.box(a0, a1, 1, 1, b0, b1, mat);
    for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) K.slab(a, b, 1, SHAPE.SLAB);
}

/** Chests against the walls of a room (the floor a0…a1 × b0…b1, cell edges); `wants`: [a, b] spots. */
function chests(K, a0, a1, b0, b1, wants, inner = []) {
    placeChests({ a0, a1, b0, b1, filled: K.filled, beds: K.beds, keep: K.keep, wants, inner, scales: [HOUSE_CHEST_SCALE] },
        (a, b, fa, fb) => K.house.chests.push({ ...K.pt(a, b, 0), yaw: K.yaw(fa, fb), gap: CHEST_GAP, scale: HOUSE_CHEST_SCALE }));
}

/** The house record goes out: the nodes in front of the door and inside, the chest list. Returns the door node. */
function finish(K, da, bf, inB, o = {}) {
    const door = K.node(da, bf - 3, 0);
    const inside = K.node(da, inB, 0, 'home');
    K.p.link(door, inside);
    const H = K.house;
    H.door = K.pt(da, bf - 3, 0);
    H.inside = K.pt(da, inB, 0);
    H.doorNode = door; H.homeNode = inside;
    H.bedColour = o.bedColour || 'white';
    H.r = o.r || 9;
    K.p.flushSlabs();
    K.out.houses.push(H);
    return door;
}

/** A counter shop: a stall record (the merchant behind the counter looks at the customer's side). */
function shopStall(K, o) {
    const { a0, a1, b0, b1, front, back, shop, towards } = o;
    const fn = K.node(front[0], front[1], 0, 'stall');
    K.p.link(fn, K.node(o.link[0], o.link[1], 0));
    K.out.stalls.push({
        front: K.pt(front[0], front[1], 0), back: K.pt(back[0], back[1], 0), frontNode: fn,
        counter: { ...K.rect(a0, a1, b0, b1), top: K.p.L(1) - 0.5 },
        yaw: K.yaw(towards[0], towards[1]), shop, building: K.kind, houseOf: K.out.houses.length, // (its house is the record `finish` puts next)
    });
}

// ================================================================== the well
/** A village well on a little stone square: a basin with water, a roof on four posts, a windlass, a rope and a bucket. */
function buildWell(K) {
    const B = K.B, out = K.out;
    const roof = K.s.villageRoof || B.ROOF_RED;
    // the square, 11 × 11, a ring of darker stones
    K.box(-5, 5, -1, -1, -5, 5, B.COBBLE);
    K.box(-4, 4, -1, -1, -4, -4, B.CS_GREY); K.box(-4, 4, -1, -1, 4, 4, B.CS_GREY); K.box(-4, -4, -1, -1, -4, 4, B.CS_GREY); K.box(4, 4, -1, -1, -4, 4, B.CS_GREY);
    // the basin: 3 × 3, a metre of water (its surface a metre under the ground), stone steps along the front to wade in and out, a low rim of
    // stone on the other three sides (the front is open: the way to the steps)
    K.box(-1, 1, -2, -1, -1, 1, 0);
    K.box(-1, 1, -2, -2, 0, 1, B.WATER);
    K.box(-1, 1, -2, -2, -1, -1, B.CS_GREY); // the steps (their top is the water's surface)
    K.box(-2, 2, 0, 0, 2, 2, B.CS_GREY); K.box(-2, -2, 0, 0, -1, 1, B.CS_GREY); K.box(2, 2, 0, 0, -1, 1, B.CS_GREY);
    K.box(-2, 2, 1, 1, 2, 2, B.COBBLE); // (the back of the rim is a block higher: a place to lean)
    // four posts, a beam with the windlass, a small gable roof
    for (const [a, b] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) K.box(a, a, 1, 7, b, b, B.PLANKS_DARK);
    K.box(-2, 2, 7, 7, -2, -2, B.PLANKS_DARK); K.box(-2, 2, 7, 7, 2, 2, B.PLANKS_DARK);
    K.box(-2, 2, 6, 6, 0, 0, B.WOOD); // the windlass
    K.box(0, 0, 3, 5, 0, 0, B.FENCE); // the rope
    K.box(0, 0, 2, 2, 0, 0, B.PLANKS_DARK); // the bucket
    const mark = K.mark();
    for (let k = 0; k <= 3; k++) {
        K.raw(-3, 3, 8 + k, 8 + k, -3 + k, 3 - k, roof);
        if (k <= 2) K.raw(-2, 2, 8 + k, 8 + k, -2 + k, 2 - k, 0);
        if (k >= 1 && k <= 2) { K.raw(-3, -3, 8 + k, 8 + k, -3 + k, 3 - k, B.PLANKS_DARK); K.raw(3, 3, 8 + k, 8 + k, -3 + k, 3 - k, B.PLANKS_DARK); }
    }
    K.p.slopeTop(mark, roof);
    K.box(0, 0, 7, 7, 0, 0, B.LANTERN);
    // a bench, a flowerbed, a trough
    bench(K, -4, -4, -1, 1, B.PLANKS);
    K.box(4, 4, 0, 0, -3, -3, B.FLOWERS); K.box(-4, -4, 0, 0, 3, 3, B.FLOWERS);
    K.box(3, 4, 0, 1, 1, 1, B.PLANKS_DARK);
    K.p.flushSlabs();
    // the four ways onto the square join the road's nodes (the walking graph: the middle of the square)
    const mid = K.node(0, -7, 0, 'yard');
    out.wells.push({ ...K.pt(0, 0, 0), r: 5, ru: 'Колодец' });
    return mid;
}


// ================================================================ the smithy
/**
 * A smithy: one high hall, 15 × 13 outside. The forge on the left wall (a hearth with glowing coals under a hood and a chimney
 * high over the roof), the anvil on a stump, a quench barrel, a bellows, a coal heap, a long work table; on the right a counter
 * (the smith sells swords, axes, shields and arrows) with racks on the wall behind it. The door in the front gable looks at the road.
 */
function buildSmithy(K) {
    const B = K.B, s = K.s;
    const wall = s.houseStone, timber = B.PLANKS_DARK, roof = B.ROOF_SLATE, h = 8;
    const R = { a0: -7, a1: 7, b0: -6, b1: 6 };
    shell(K, { ...R, h, wall, base: B.COBBLE, post: timber, floor: B.COBBLE });
    frontDoor(K, -2, -6, timber);
    // windows: the front right, the back, both side walls (the forge has the left wall's middle)
    win(K, 3, 5, -6, -6, 2, 4); win(K, 1, 3, 6, 6, 2, 4); win(K, 7, 7, -4, -3, 2, 4); win(K, 7, 7, 3, 4, 2, 4);
    win(K, -7, -7, -5, -4, 2, 4); win(K, -7, -7, 3, 4, 2, 4);
    gable(K, { ...R, h, roof, wall, ridge: 'b' });
    win(K, 0, 0, -6, -6, h + 2, h + 3); // a window in the front gable
    // ---- the forge on the left wall: a hearth with embers, a hood, a chimney high over the roof
    K.box(-6, -5, 0, 0, -1, 1, B.CS_DARK);
    K.box(-6, -5, 1, 1, 0, 0, B.LANTERN); // the coals
    K.box(-6, -6, 1, 2, -1, -1, B.COBBLE); K.box(-6, -6, 1, 2, 1, 1, B.COBBLE);
    K.box(-5, -5, 1, 2, -1, -1, B.COBBLE); K.box(-5, -5, 1, 2, 1, 1, B.COBBLE); // the pillars
    K.box(-6, -5, 3, 3, -1, 1, B.CS_DARK); // the hood
    K.box(-6, -5, 4, 6, -1, 1, B.CS_DARK);
    K.box(-6, -5, 7, h + 6, 0, 1, B.CS_DARK); // the chimney
    K.box(-6, -6, 2, 2, 0, 0, B.LANTERN); // a glow under the hood
    // the bellows, the anvil on a stump, the quench barrels, coal
    K.box(-6, -5, 0, 0, 2, 2, B.PLANKS_DARK); K.box(-6, -5, 1, 1, 2, 2, B.PLANKS);
    K.box(-4, -4, 0, 0, 0, 0, B.WOOD); K.box(-4, -4, 1, 1, 0, 0, B.CS_DARK);
    K.box(-6, -6, 0, 1, -3, -3, B.WOOD); K.box(-5, -5, 0, 0, -3, -3, B.WOOD);
    K.box(-6, -5, 0, 0, -5, -4, B.DEEPSTONE); K.box(-6, -6, 1, 1, -5, -5, B.DEEPSTONE);
    // the work table at the back-left with a vice and a whetstone on it
    table(K, -6, -4, 4, 5, B.PLANKS_DARK, timber);
    K.box(-5, -5, 2, 2, 4, 4, B.CS_GREY); K.box(-4, -4, 2, 2, 5, 5, B.PLANKS);
    // ---- the shop: a counter across the middle of the right half, racks of shields and blades on the right wall behind it
    K.box(0, 1, 0, 1, -2, 2, B.PLANKS);
    K.box(0, 1, 2, 2, -2, 2, B.PLANKS_DARK);
    for (let b = -2; b <= 2; b++) for (const a of [0, 1]) K.slab(a, b, 2, SHAPE.SLAB); // (a ledge: the goods lie on the top)
    for (let b = -4; b <= 4; b += 2) { K.box(6, 6, 2, 2, b, b, B.FENCE); K.box(6, 6, 4, 4, b, b, B.FENCE); K.box(6, 6, 3, 3, b, b, B.CLOTH_YELLOW); }
    // the grindstone by the front right corner
    K.box(5, 6, 0, 0, -5, -5, B.PLANKS_DARK); K.box(5, 6, 1, 1, -5, -5, B.CS_GREY);
    // ties under the roof and lamps on them
    for (const b of [-3, 3]) { K.box(-6, 6, h - 1, h - 1, b, b, timber); for (const a of [-4, 0, 4]) K.box(a, a, h - 2, h - 2, b, b, B.LANTERN); }
    // outside: a woodpile on the right, a rack of barrels on the left
    K.box(8, 8, 0, 1, 1, 4, B.WOOD); K.box(-8, -8, 0, 0, -2, 0, B.PLANKS_DARK);
    K.keep.push([-3.5, -0.5, -6.5, -3.5]); // the doorway's swing
    chests(K, -6.5, 6.5, -5.5, 5.5, [[0, 5], [6, 5]]);
    shopStall(K, { a0: 0, a1: 1, b0: -2, b1: 2, front: [-3, 0], back: [4, 0], shop: 'smith', towards: [-1, 0], link: [-2, -9] });
    K.out.fx.push({ k: 'smoke', ...K.pt(-5.5, 0.5, h + 7), r: 1.2 });
    K.out.fx.push({ k: 'forge', ...K.pt(-5.5, 0, 1) });
    return finish(K, -2, -6, -2, { r: 10 });
}

// ================================================================ the bakery
/**
 * A bakery: a white house with a shop in front (a counter, baskets of bread and pies, the baker behind it) and the bakehouse
 * behind (a big brick oven with glowing coals and a chimney, a kneading table, flour sacks, a woodpile, shelves).
 */
function buildBakery(K) {
    const B = K.B, s = K.s;
    const wall = B.PLASTER, timber = B.PLANKS_DARK, roof = s.poorRoof || B.THATCH, h = 8;
    const R = { a0: -6, a1: 6, b0: -5, b1: 5 };
    shell(K, { ...R, h, wall, base: B.COBBLE, post: timber, floor: B.PLANKS });
    frontDoor(K, 3, -5, timber);
    win(K, -5, -3, -5, -5, 2, 4); win(K, -1, 0, -5, -5, 2, 4); // (shop windows with the loaves behind the glass)
    win(K, -6, -6, -3, -2, 2, 4); win(K, 6, 6, -3, -2, 2, 4); win(K, 6, 6, 2, 3, 2, 4); win(K, 2, 4, 5, 5, 2, 4);
    for (const a of [-5, -4, -3, -1, 0]) K.box(a, a, 1, 1, -6, -6, B.FLOWERS); // flower boxes under the shop windows
    gable(K, { ...R, h, roof, wall, ridge: 'a' });
    // ---- the shop: a counter along a, the customers in front (3 rows), the baker behind
    K.box(-5, 0, 0, 1, -1, 0, B.PLANKS);
    K.box(-5, 0, 2, 2, -1, 0, B.PLANKS_DARK);
    for (let a = -5; a <= 0; a++) for (const b of [-1, 0]) K.slab(a, b, 2, SHAPE.SLAB); // (the ledge)
    for (const a of [-4, -2, 0]) K.box(a, a, 3, 3, 0, 0, B.HAY); // baskets of loaves on the counter's back
    K.box(-6, -6, 2, 2, 1, 4, B.PLANKS); K.box(-6, -6, 4, 4, 1, 4, B.PLANKS); // shelves on the left wall, loaves on them
    for (const b of [1, 3]) { K.box(-6, -6, 3, 3, b, b, B.HAY); K.box(-6, -6, 5, 5, b, b, B.HAY); }
    // ---- the bakehouse: the oven on the back wall, a kneading table, flour sacks, wood, a barrel of water
    K.box(-5, -1, 0, 2, 4, 5, B.BRICK);
    K.box(-4, -2, 3, 3, 4, 5, B.BRICK); K.box(-3, -3, 4, 4, 4, 5, B.BRICK); // the dome
    K.box(-4, -2, 0, 1, 4, 4, 0); // the mouth: a dark hollow in the oven's front
    K.box(-3, -3, 0, 0, 4, 4, B.LANTERN); // the coals in it
    K.box(-4, -4, 1, 1, 4, 4, B.LANTERN); K.box(-2, -2, 1, 1, 4, 4, B.LANTERN);
    K.box(-4, -2, 5, h + 3, 5, 5, B.BRICK); K.box(-3, -3, 6, h + 5, 4, 4, B.COBBLE); // the flue and the chimney (through the roof)
    table(K, 2, 4, 4, 4, B.PLANKS, timber); // the kneading table, against the back wall
    K.box(3, 3, 2, 2, 4, 4, B.CLOTH_WHITE); K.box(2, 2, 2, 2, 4, 4, B.HAY);
    K.box(5, 5, 0, 1, 4, 4, B.CLOTH_WHITE); K.box(5, 5, 2, 2, 4, 4, B.CLOTH_WHITE); // flour sacks in the corner
    K.box(0, 0, 0, 2, 4, 4, B.WOOD); // wood for the oven
    K.box(-6, -6, 0, 1, 2, 2, B.WOOD); // a barrel
    for (const b of [-2, 2]) { K.box(-5, 5, h - 1, h - 1, b, b, timber); for (const a of [-3, 0, 3]) K.box(a, a, h - 2, h - 2, b, b, B.LANTERN); }
    K.out.fx.push({ k: 'smoke', ...K.pt(-3, 4, h + 8), r: 1.0 });
    // outside: a bench by the door, a flour cart's wheel
    bench(K, 5, 6, -7, -7, B.PLANKS_DARK);
    K.keep.push([1.5, 4.5, -5.5, -2.5]);
    chests(K, -5.5, 5.5, -4.5, 4.5, [[5, 2], [-5, -4]]);
    shopStall(K, { a0: -5, a1: 0, b0: -1, b1: 0, front: [-3, -4], back: [-2.5, 2], shop: 'baker', towards: [0, -1], link: [3, -9] });
    return finish(K, 3, -5, -2, { r: 9 });
}

// ============================================================== the herbalist
/**
 * The herbalist's shop: a small thatched house, bundles of herbs drying under the beams, shelves of jars and flasks, a cauldron, a
 * counter (flasks, healing apples, herbs), a fenced herb garden at the side.
 */
function buildHerbalist(K) {
    const B = K.B;
    const wall = B.PLANKS, timber = B.PLANKS_DARK, roof = B.THATCH, h = 7;
    const R = { a0: -5, a1: 5, b0: -5, b1: 5 };
    shell(K, { ...R, h, wall, base: B.COBBLE, post: timber, floor: B.PLANKS_DARK });
    frontDoor(K, -2, -5, timber);
    win(K, 1, 3, -5, -5, 2, 4); win(K, 5, 5, -3, -2, 2, 4); win(K, -5, -5, -3, -2, 2, 4); win(K, -2, 0, 5, 5, 2, 4);
    for (const a of [1, 2, 3]) K.box(a, a, 1, 1, -6, -6, B.FLOWERS);
    gable(K, { ...R, h, roof, wall, ridge: 'a' });
    // shelves along both side walls: jars (potions) and books
    for (const w of [-4, 4]) {
        K.box(w, w, 1, 1, 0, 3, B.PLANKS_DARK); K.box(w, w, 3, 3, 0, 3, B.PLANKS_DARK); K.box(w, w, 5, 5, 0, 3, B.PLANKS_DARK);
        for (const b of [0, 1, 2, 3]) { K.box(w, w, 2, 2, b, b, b % 2 ? B.POTION : B.BOOKS); K.box(w, w, 4, 4, b, b, b % 2 ? B.BOOKS : B.POTION); }
    }
    // the cauldron over a little fire in the back
    K.box(-1, 0, 0, 1, 3, 4, B.CS_DARK); K.box(-1, 0, 2, 2, 3, 4, B.POTION); K.box(-1, 0, 0, 0, 3, 3, B.LANTERN);
    // the counter, the herbalist behind it
    K.box(-3, 0, 0, 1, -1, -1, B.PLANKS); K.box(-3, 0, 2, 2, -1, -1, B.PLANKS_DARK);
    for (let a = -3; a <= 0; a++) K.slab(a, -1, 2, SHAPE.SLAB);
    // herbs hanging from the beams: bundles of flowers, vegetables and hay
    for (const b of [-3, 0, 3]) {
        K.box(-3, 3, h - 1, h - 1, b, b, timber);
        [-3, -1, 1, 3].forEach((a, i) => K.box(a, a, h - 2, h - 2, b, b, [B.FLOWERS, B.VEG, B.HAY, B.FLOWERS][(i + b + 8) % 4]));
    }
    K.box(0, 0, h - 2, h - 2, -3, -3, B.LANTERN);
    // the garden at the right side: a fence round raised beds of herbs, a gate towards the road
    K.box(6, 9, -1, -1, -3, 3, B.FARMLAND);
    for (const [a, t] of [[7, B.FLOWERS], [8, B.VEG]]) K.box(a, a, 0, 0, -2, 2, t);
    K.box(6, 9, 0, 0, -4, -4, B.FENCE); K.box(6, 9, 0, 0, 4, 4, B.FENCE); K.box(9, 9, 0, 0, -4, 4, B.FENCE); K.box(6, 6, 0, 0, -4, 4, B.FENCE);
    K.box(7, 8, 0, 0, -4, -4, 0); // the gate
    K.box(-8, -8, 0, 1, -2, 0, B.WOOD); // a woodpile at the other side
    K.keep.push([-3.5, -0.5, -5.5, -3]);
    chests(K, -4.5, 4.5, -4.5, 4.5, [[3, 4], [-3, 4]]);
    shopStall(K, { a0: -3, a1: 0, b0: -1, b1: -1, front: [-2, -4], back: [-1.5, 1.5], shop: 'herbs', towards: [0, -1], link: [-2, -9] });
    return finish(K, -2, -5, -3, { r: 8 });
}

// ================================================================ the tavern
/**
 * A tavern: a big warm hall. The bar across the back (the innkeeper sells food and drink), barrels and shelves behind it, round
 * tables with benches, a fireplace on the right wall with armchairs, a chandelier of lanterns, a signboard before the door.
 */
function buildTavern(K) {
    const B = K.B, s = K.s;
    const wall = B.PLASTER, timber = B.PLANKS_DARK, roof = s.villageRoof || B.ROOF_RED, h = 8;
    const R = { a0: -7, a1: 7, b0: -6, b1: 6 };
    shell(K, { ...R, h, wall, base: s.houseStone, post: timber, floor: B.PLANKS });
    // half-timbering: beams across the walls
    for (const b of [-6, 6]) K.box(-7, 7, 4, 4, b, b, timber);
    for (const a of [-7, 7]) K.box(a, a, 4, 4, -6, 6, timber);
    frontDoor(K, 0, -6, timber);
    win(K, -5, -4, -6, -6, 2, 5); win(K, 4, 5, -6, -6, 2, 5);
    win(K, -7, -7, -4, -3, 2, 5); win(K, 7, 7, -4, -3, 2, 5); win(K, -7, -7, 3, 4, 2, 5); win(K, 7, 7, 3, 4, 2, 5); win(K, -5, -3, 6, 6, 2, 5);
    for (const a of [-5, -4, 4, 5]) K.box(a, a, 1, 1, -7, -7, B.FLOWERS);
    gable(K, { ...R, h, roof, wall, ridge: 'a' });
    // ---- the bar across the back right: a counter, barrels and shelves behind it (a way 3 wide round its left end)
    K.box(-1, 6, 0, 1, 0, 1, B.PLANKS_DARK);
    K.box(-1, 6, 2, 2, 0, 1, B.PLANKS);
    for (let a = -1; a <= 6; a++) for (const b of [0, 1]) K.slab(a, b, 2, SHAPE.SLAB);
    for (const a of [0, 2, 4, 6]) K.box(a, a, 3, 3, 1, 1, B.POTION); // bottles along the bar
    for (const a of [3, 4, 5, 6]) { K.box(a, a, 0, 1, 5, 5, B.WOOD); K.box(a, a, 1, 1, 5, 5, B.WOOD); } // the barrels in a row
    K.box(3, 6, 2, 2, 5, 5, B.PLANKS_DARK); K.box(3, 6, 3, 3, 5, 5, B.POTION); K.box(3, 6, 4, 4, 5, 5, B.PLANKS_DARK); K.box(3, 6, 5, 5, 5, 5, B.POTION); // shelves above
    K.box(-1, 2, 3, 3, 5, 5, B.PLANKS_DARK); K.box(-1, 2, 4, 4, 5, 5, B.POTION); // (a second shelf, higher than a head)
    // ---- the tables: a long one on the right with benches on both sides; on the left a settle along the wall and a small table
    table(K, 3, 5, -4, -3, B.PLANKS, timber);
    bench(K, 3, 5, -5, -5, B.PLANKS_DARK); bench(K, 3, 5, -2, -2, B.PLANKS_DARK);
    K.box(4, 4, 2, 2, -3, -3, B.LANTERN);
    bench(K, -6, -6, -5, -3, B.PLANKS_DARK);
    table(K, -5, -4, -5, -4, B.PLANKS, timber); K.box(-5, -5, 2, 2, -5, -5, B.LANTERN);
    // ---- the fireplace on the left wall: a stone hearth with a fire and a chimney
    K.box(-6, -5, 0, 0, -1, 1, B.CS_DARK); K.box(-6, -5, 1, 1, 0, 0, B.LANTERN);
    K.box(-6, -6, 1, 2, -1, -1, B.COBBLE); K.box(-6, -6, 1, 2, 1, 1, B.COBBLE); K.box(-5, -5, 1, 2, -1, -1, B.COBBLE); K.box(-5, -5, 1, 2, 1, 1, B.COBBLE);
    K.box(-6, -5, 3, 3, -1, 1, B.CS_DARK); K.box(-6, -5, 4, h + 4, 0, 1, B.CS_DARK);
    K.box(-2, 2, -1, -1, -2, 3, B.CARPET_RED); // a rug down the middle
    // ---- a chandelier on a chain: a ring of fence, lanterns on it
    for (const b of [-3, 3]) K.box(-6, 6, h - 1, h - 1, b, b, timber);
    K.box(0, 0, h - 2, h - 2, -3, -3, B.FENCE);
    K.box(-1, 1, h - 3, h - 3, -4, -2, B.FENCE); K.box(0, 0, h - 3, h - 3, -3, -3, 0);
    for (const [a, b] of [[-1, -4], [1, -4], [-1, -2], [1, -2]]) K.box(a, a, h - 4 + 1, h - 4 + 1, b, b, B.LANTERN);
    for (const a of [-4, 4]) K.box(a, a, h - 2, h - 2, 3, 3, B.LANTERN);
    // ---- the signboard on two posts before the door, a bench by the wall
    K.box(5, 5, 0, 6, -7, -7, timber); K.box(7, 7, 0, 6, -7, -7, timber);
    K.box(5, 7, 5, 6, -7, -7, B.PLANKS); K.box(6, 6, 5, 5, -7, -7, B.CLOTH_YELLOW);
    // ---- the chest, the bar's record
    K.out.fx.push({ k: 'smoke', ...K.pt(-5.5, 0.5, h + 5), r: 1.1 });
    K.keep.push([-1.5, 1.5, -6.5, -3.5]);
    chests(K, -6.5, 6.5, -5.5, 5.5, [[-6, 5], [-4, 5]]);
    shopStall(K, { a0: -1, a1: 6, b0: 0, b1: 1, front: [1, -3], back: [2.5, 3.5], shop: 'tavern', towards: [0, -1], link: [0, -9] });
    return finish(K, 0, -6, -3, { r: 11 });
}

// ================================================================ the granary
/**
 * A granary: a tall barn of dark boards. Grain bins of planks along both side walls (wheat, hay), sacks, crates and barrels, a stack
 * of hay at the back; a keeper looks after it. A road of 7 across the middle for the carts.
 */
function buildGranary(K) {
    const B = K.B, s = K.s;
    const wall = B.PLANKS_DARK, timber = B.WOOD, roof = s.poorRoof || B.THATCH, h = 8;
    const R = { a0: -7, a1: 7, b0: -6, b1: 6 };
    shell(K, { ...R, h, wall, base: B.COBBLE, post: timber, floor: B.PLANKS_DARK });
    // the big doors: a frame round the doorway, the leaf is the real door
    frontDoor(K, 0, -6, timber);
    K.box(-3, 3, 0, 6, -7, -7, 0);
    for (const a of [-3, 3]) K.box(a, a, 0, 6, -7, -7, timber);
    K.box(-3, 3, 7, 7, -7, -7, timber);
    win(K, -5, -4, -6, -6, 3, 4); win(K, 4, 5, -6, -6, 3, 4); win(K, -7, -7, -1, 0, 3, 4); win(K, 7, 7, -1, 0, 3, 4); win(K, -1, 1, 6, 6, 4, 5);
    gable(K, { ...R, h, roof, wall, ridge: 'b' });
    win(K, 0, 0, -6, -6, h + 3, h + 4); // a hay door high in the front gable
    // grain bins along the side walls: 3 deep, boards 2 high, full of grain
    for (const sgn of [-1, 1]) {
        const a0 = sgn < 0 ? -6 : 4, a1 = a0 + 2;
        for (const [b0, b1, t] of [[-4, -1, B.WHEAT], [1, 3, B.HAY]]) {
            K.box(a0, a1, -1, -1, b0, b1, B.PLANKS);
            K.box(a0, a1, 0, 0, b0, b1, t);
            K.box(a0, a1, 1, 1, b0, b0, B.PLANKS); K.box(a0, a1, 1, 1, b1, b1, B.PLANKS);
            K.box(a0, a0, 1, 1, b0, b1, B.PLANKS); K.box(a1, a1, 1, 1, b0, b1, B.PLANKS);
            K.box(a0 + 1, a1 - 1, 1, 1, b0 + 1, b1 - 1, t === B.HAY ? B.HAY : 0);
            K.box(a0, a1, 0, 0, b0, b0, B.PLANKS); K.box(a0, a1, 0, 0, b1, b1, B.PLANKS);
            K.box(a0, a0, 0, 0, b0, b1, B.PLANKS); K.box(a1, a1, 0, 0, b0, b1, B.PLANKS);
        }
    }
    // a stack of hay bales and crates at the back in the middle
    K.box(-2, 2, 0, 2, 5, 5, B.HAY); K.box(-1, 1, 3, 3, 5, 5, B.HAY);
    K.box(-3, -3, 0, 1, 5, 5, B.PLANKS); K.box(3, 3, 0, 1, 5, 5, B.PLANKS);
    // barrels and a cart wheel by the door
    K.box(-6, -6, 0, 1, -5, -5, B.WOOD); K.box(-5, -5, 0, 0, -5, -5, B.WOOD); K.box(6, 6, 0, 1, -5, -5, B.WOOD);
    for (const b of [-3, 3]) { K.box(-6, 6, h - 1, h - 1, b, b, timber); K.box(0, 0, h - 2, h - 2, b, b, B.LANTERN); }
    // a hay-lifting beam with a pulley under the gable, a haycart outside
    K.box(0, 0, h + 2, h + 2, -7, -7, timber); K.box(0, 0, h + 1, h + 1, -7, -7, B.FENCE);
    K.box(8, 9, 0, 0, 0, 3, B.PLANKS_DARK); K.box(8, 9, 1, 1, 0, 3, B.HAY);
    K.keep.push([-1.5, 1.5, -6.5, -3.5]);
    chests(K, -6.5, 6.5, -5.5, 5.5, [[3, 5], [-3, 5], [0, 5]]);
    return finish(K, 0, -6, -3, { r: 10 });
}

// =================================================================== the mill
/**
 * A windmill: a round stone tower with a wooden upper part, a cone cap and four sails turning on its front (BuildingFx: the sails
 * are one shape turned by the video card). A millstone, a hopper and sacks inside, a heap of sacks and a cart outside.
 */
function buildMill(K) {
    const B = K.B, s = K.s;
    const stone = s.houseStone, timber = B.PLANKS_DARK, roof = s.poorRoof || B.THATCH;
    // the floor, the stone tower (ring 4.2…5.5 thick), a wooden storey above, a floor between them
    K.cyl(0, 0, 5.5, -1, -1, B.COBBLE);
    K.cyl(0, 0, 5.5, 0, 6, stone, 4.2);
    K.cyl(0, 0, 5.5, 0, 1, B.COBBLE, 4.2);
    K.cyl(0, 0, 5.0, 7, 7, B.PLANKS_DARK); // the ceiling of the ground room (the hopper floor)
    K.cyl(0, 0, 4.7, 8, 12, B.PLANKS, 3.6); // the wooden storey
    K.cyl(0, 0, 4.7, 8, 8, B.PLANKS_DARK);
    // the door in the front (the wall is 2 cells thick here), the lintel, the step
    K.box(-1, 1, 0, DOOR_TOP, -5, -4, 0);
    K.box(-2, 2, DOOR_TOP + 1, DOOR_TOP + 1, -5, -4, timber);
    K.box(-1, 1, -1, -1, -7, -6, B.PATH);
    const dp = K.pt(0, -5), di = K.pt(0, -4);
    K.house.doorRec = { x: dp.x, y: dp.y, z: dp.z, ry: inwardRy(K.along(1, 0), di.x - dp.x, di.z - dp.z), w: DOOR_W, h: DOOR_TOP + 1 };
    for (const side of [-3, 3]) { K.box(side, side, 0, 3, -6, -6, timber); K.box(side, side, 4, 4, -6, -6, B.LANTERN); }
    // windows: slits through the wall to the left, right and back
    win(K, -5, -4, 0, 1, 3, 4, undefined, 'b'); win(K, 4, 5, 0, 1, 3, 4, undefined, 'b'); win(K, -1, 0, 4, 5, 3, 4, undefined, 'a');
    // the cap: a cone of straw or tiles, narrower each layer, and the hub of the sails on its front
    const mark = K.mark();
    for (let k = 0; k < 7; k++) K.cyl(0, 0, 5.4 - k * 0.8, 13 + k, 13 + k, roof);
    K.cyl(0, 0, 0.6, 20, 21, roof);
    K.box(0, 0, 22, 23, 0, 0, B.GOLD); // a little weathervane
    void mark;
    // the axle and the hub: a beam out of the cap, the sails turn on it
    K.box(0, 0, 16, 16, -6, -6, timber); K.box(0, 0, 15, 17, -6, -6, timber);
    // ---- inside: the millstone (a pair of stones) with its hopper, sacks, a bench, a grain bin
    K.cyl(0, 2, 1.7, 0, 1, B.CS_GREY); K.cyl(0, 2, 0.8, 2, 2, B.PLANKS_DARK); K.box(0, 0, 3, 6, 2, 2, timber); // the stones, the hopper's neck, the shaft
    K.box(-1, 1, 5, 5, 1, 3, B.PLANKS); K.box(-1, 1, 6, 6, 1, 3, 0); // (a hopper above)
    K.box(-3, -3, 0, 1, 2, 3, B.CLOTH_WHITE); K.box(-3, -3, 2, 2, 3, 3, B.CLOTH_WHITE); K.box(3, 3, 0, 1, 2, 3, B.CLOTH_WHITE);
    K.box(-3, -2, 0, 1, -3, -3, B.WOOD); // a barrel and a bin by the door
    for (const a of [-2, 2]) K.box(a, a, 6, 6, 0, 0, B.LANTERN);
    // outside: sacks, a handcart
    K.box(4, 5, 0, 1, -7, -7, B.CLOTH_WHITE); K.box(4, 4, 2, 2, -7, -7, B.CLOTH_WHITE);
    K.box(-6, -4, 0, 0, -7, -7, B.PLANKS_DARK); K.box(-6, -6, 1, 1, -7, -7, B.WOOD); K.box(-4, -4, 1, 1, -7, -7, B.WOOD);
    K.keep.push([-1.5, 1.5, -6, -3]);
    chests(K, -3.9, 3.9, -3.9, 3.9, [[-3, -3], [3, -3]]);
    const hub = K.pt(0, -7.5, 16);
    const o = K.pt(0, 0, 0), q = K.pt(0, -1, 0);
    K.out.fx.push({ k: 'vanes', x: hub.x, y: hub.y + 1.5, z: hub.z, dx: q.x - o.x, dz: q.z - o.z, R: 8, speed: 0.55 });
    return finish(K, 0, -5, -2, { r: 8 });
}

// ============================================================ church and chapel
const STAINED = [0xd8433a, 0x3f6fd6, 0xe3b83a, 0x3fa65f, 0x9a4fd0];
/**
 * A church (a big lot) or a chapel (a normal one): the bell tower in front with the door, behind it the nave — a gable roof, tall
 * windows of coloured glass, pews on both sides of a carpeted aisle — and the chancel with the altar, a golden cross and candles.
 * The bell hangs in the open belfry (BuildingFx rings and swings it); a spire with a cross on top.
 */
function buildChurch(K, big) {
    const B = K.B, s = K.s;
    const stone = big ? s.stone : B.PLASTER, trim = s.houseStone, timber = B.PLANKS_DARK, roof = big ? B.ROOF_SLATE : (s.villageRoof || B.ROOF_RED);
    const c = big
        ? { T: 3, tb0: -6, tb1: 0, th: 20, W: 5, nb1: 13, nh: 9, C: 3, cb1: 18, ch: 8, rows: [2, 4, 6, 8, 10], pewA: [2, 4], wins: [[3, 4], [7, 8], [11, 12]] }
        : { T: 2, tb0: -6, tb1: -2, th: 14, W: 3, nb1: 6, nh: 7, C: 0, cb1: 6, ch: 7, rows: [1, 3], pewA: [2, 2], wins: [[1, 2], [4, 5]] };
    const nb0 = c.tb1;
    // ---- the tower
    shell(K, { a0: -c.T, a1: c.T, b0: c.tb0, b1: c.tb1, h: c.th, wall: stone, base: trim, post: trim, floor: B.PLANKS_DARK });
    // ---- the nave
    shell(K, { a0: -c.W, a1: c.W, b0: nb0, b1: c.nb1, h: c.nh, wall: stone, base: trim, post: trim, floor: B.PLANKS_DARK });
    if (big) shell(K, { a0: -c.C, a1: c.C, b0: c.nb1, b1: c.cb1, h: c.ch, wall: stone, base: trim, post: trim, floor: B.PLANKS_DARK });
    frontDoor(K, 0, c.tb0, timber);
    K.box(-1, 1, 0, 5, c.tb1, c.tb1, 0); // the arch from the tower's foot into the nave
    K.box(-1, 1, 6, 6, c.tb1, c.tb1, trim);
    if (big) K.box(-2, 2, 0, 6, c.nb1, c.nb1, 0); // into the chancel
    // the tower: a ceiling over the foot, the belfry open on three sides, the bell on a beam
    K.box(-c.T + 1, c.T - 1, 8, 8, c.tb0 + 1, c.tb1 - 1, timber);
    const mid = (c.tb0 + c.tb1) / 2;
    for (const [a0, a1, b0, b1] of [[-1, 1, c.tb0, c.tb0], [-c.T, -c.T, mid - 1, mid + 1], [c.T, c.T, mid - 1, mid + 1]]) {
        K.box(a0, a1, c.th - 5, c.th - 2, b0, b1, 0);
        K.box(a0, a1, c.th - 6, c.th - 6, b0, b1, trim);
    }
    K.box(-c.T + 1, c.T - 1, c.th - 5, c.th - 5, Math.round(mid), Math.round(mid), B.WOOD); // the bell's beam
    // windows of the nave: tall, coloured glass
    c.wins.forEach(([b0, b1], i) => {
        win(K, -c.W, -c.W, b0, b1, 3, big ? 7 : 5, STAINED[i % STAINED.length], 'b');
        win(K, c.W, c.W, b0, b1, 3, big ? 7 : 5, STAINED[(i + 2) % STAINED.length], 'b');
    });
    // buttresses between the tall windows of a church (a step-in of stone against each side wall)
    if (big) for (const b of [2, 5, 9, 13 - 0]) for (const sgn of [-1, 1]) { const a0 = sgn * (c.W + 1); K.box(a0, a0, 0, 5, b, b, trim); K.box(a0, a0, 6, 6, b, b, trim); K.slab(a0, b, 6, SHAPE.SLAB); }
    // ---- the roofs and the spire
    gable(K, { a0: -c.W, a1: c.W, b0: nb0 + (big ? 0 : 0), b1: c.nb1, h: c.nh, roof, wall: stone, ridge: 'b' });
    if (big) gable(K, { a0: -c.C, a1: c.C, b0: c.nb1, b1: c.cb1, h: c.ch, roof, wall: stone, ridge: 'b' });
    const mark = K.mark();
    for (let k = 0; k <= c.T; k++) K.raw(-c.T + k, c.T - k, c.th + k, c.th + k, c.tb0 + k, c.tb1 - k, roof);
    K.p.slopeTop(mark, roof);
    const top = c.th + c.T + 1;
    K.box(0, 0, top, top + 3, Math.round(mid), Math.round(mid), B.GOLD); K.box(-1, 1, top + 2, top + 2, Math.round(mid), Math.round(mid), B.GOLD); // the cross
    // ---- inside the nave: the carpet, pews on both sides, the altar
    K.box(-1, 1, -1, -1, nb0 + 1, c.nb1 - 1, s.carpet);
    c.rows.forEach((b) => {
        for (const sgn of [-1, 1]) {
            const a0 = sgn < 0 ? -c.pewA[1] : c.pewA[0], a1 = sgn < 0 ? -c.pewA[0] : c.pewA[1];
            bench(K, a0, a1, b, b, B.PLANKS_DARK);
            K.box(a0, a1, 0, 1, b - 1, b - 1, B.PLANKS_DARK); // the back of the pew in front
        }
    });
    const altarB = big ? 16 : c.nb1 - 1, wallB = big ? c.cb1 : c.nb1;
    if (big) {
        K.box(-2, 2, 0, 0, 14, 17, B.PLANKS); // the chancel is a step higher
        K.box(-2, 2, 0, 0, 13, 13, B.CS_WHITE); K.slab(-2, 13, 0); K.slab(-1, 13, 0); K.slab(0, 13, 0); K.slab(1, 13, 0); K.slab(2, 13, 0);
        K.box(-2, 2, -1, -1, 14, 17, B.CARPET_RED);
    }
    const y0 = big ? 1 : 0; // (the chancel floor)
    K.box(-1, 1, y0, y0 + 1, altarB, altarB, B.CS_WHITE); // the altar
    K.box(-1, 1, y0 + 2, y0 + 2, altarB, altarB, B.CLOTH_WHITE);
    K.box(-1, -1, y0 + 3, y0 + 3, altarB, altarB, B.LANTERN); K.box(1, 1, y0 + 3, y0 + 3, altarB, altarB, B.LANTERN); // the candles
    K.box(0, 0, y0 + 3, y0 + 8, wallB, wallB, B.GOLD); K.box(-2, 2, y0 + 6, y0 + 6, wallB, wallB, B.GOLD); // the golden cross on the wall
    if (big) { win(K, -2, -2, 17, 18, 3, 7, STAINED[0], 'b'); win(K, 2, 2, 17, 18, 3, 7, STAINED[1], 'b'); }
    K.box(-c.W + 1, -c.W + 1, 0, 0, nb0 + 1, nb0 + 1, B.CS_WHITE); K.box(-c.W + 1, -c.W + 1, 1, 1, nb0 + 1, nb0 + 1, B.POTION); // the font by the door
    // chandeliers on chains from the tie beams
    const ties = big ? [4, 8, 12] : [2, 4];
    for (const b of ties) {
        K.box(-c.W + 1, c.W - 1, c.nh - 1, c.nh - 1, b, b, timber);
        K.box(0, 0, c.nh - 2, c.nh - 2, b, b, B.FENCE);
        K.box(-1, 1, c.nh - 3, c.nh - 3, b, b, B.FENCE); K.box(0, 0, c.nh - 3, c.nh - 3, b - 1, b + 1, B.FENCE);
        for (const [a, bb] of [[-1, b], [1, b], [0, b - 1], [0, b + 1]]) K.box(a, a, c.nh - 3, c.nh - 3, bb, bb, B.LANTERN);
    }
    // outside: a lamp each side of the door (frontDoor), steps, flowers
    for (const a of [-c.T - 1, c.T + 1]) K.box(a, a, 0, 0, c.tb0 - 1, c.tb0 - 1, B.FLOWERS);
    K.keep.push([-1.5, 1.5, c.tb0 - 0.5, c.tb0 + 2]); // the doorway's swing
    chests(K, -c.T + 0.5, c.T - 0.5, c.tb0 + 0.5, c.tb1 - 0.5, [[-c.T + 1, c.tb1 - 1], [c.T - 1, c.tb1 - 1]]); // in the tower's foot, against its side walls
    K.out.fx.push({ k: 'bell', ...K.pt(0, mid, c.th - 4), ax: K.pt(1, mid).x - K.pt(0, mid).x, az: K.pt(1, mid).z - K.pt(0, mid).z, big });
    return finish(K, 0, c.tb0, c.tb0 + 2, { r: big ? 16 : 10 });
}

// =================================================================== the stable
/**
 * A stable (a big lot): a long barn, an aisle down the front, four box stalls along the back with fence partitions and half doors,
 * feeding troughs and hay, saddles on racks by the door, a water trough outside. Horses stand in the stalls (their own pens).
 */
function buildStable(K) {
    const B = K.B, s = K.s;
    const wall = B.PLANKS, timber = B.PLANKS_DARK, roof = s.poorRoof || B.ROOF_RED, h = 8;
    const R = { a0: -10, a1: 10, b0: -5, b1: 5 };
    shell(K, { ...R, h, wall, base: B.COBBLE, post: timber, floor: B.GRAVEL });
    frontDoor(K, 0, -5, timber);
    for (const a of [-6, 6]) { K.box(a - 1, a + 1, 0, 6, -5, -5, B.PLANKS); K.box(a - 1, a - 1, 0, 6, -5, -5, timber); K.box(a + 1, a + 1, 0, 6, -5, -5, timber); K.box(a, a, 0, 6, -5, -5, timber); } // the big doors: shut, the leaves barred
    win(K, -9, -8, -5, -5, 2, 4); win(K, 8, 9, -5, -5, 2, 4); win(K, -3, -2, -5, -5, 3, 4); win(K, 2, 3, -5, -5, 3, 4);
    for (const a of [-8, -3, 2]) win(K, a, a + 1, 5, 5, 2, 4);
    K.box(5, 7, 0, 5, 5, 5, 0); K.box(4, 8, 6, 6, 5, 5, timber); // a back door out to the paddock (3 wide, 6 high)
    gable(K, { ...R, h, roof, wall, ridge: 'a' });
    // a cupola on the ridge with louvres, a weathervane
    K.box(-1, 1, 14, 16, -1, 1, timber); K.box(0, 0, 15, 15, -1, -1, 0); K.box(0, 0, 15, 15, 1, 1, 0); K.box(-1, -1, 15, 15, 0, 0, 0); K.box(1, 1, 15, 15, 0, 0, 0);
    K.box(-2, 2, 17, 17, -2, 2, roof); K.box(-1, 1, 18, 18, -1, 1, roof); K.box(0, 0, 19, 19, 0, 0, roof); K.box(0, 0, 20, 21, 0, 0, B.GOLD);
    win(K, 0, 0, -5, -5, h + 2, h + 3); K.box(0, 0, h + 4, h + 4, -6, -6, timber); K.box(0, 0, h + 3, h + 3, -6, -6, B.FENCE); // a haymow door with its hoist
    // the stalls (3 wide inside, 4 deep): partitions of fence 2 high, a half door of fence, a trough and hay
    const stalls = [[-8, -5], [-4, -1], [0, 3]];
    stalls.forEach(([a0, a1]) => {
        for (const pa of [a0 - 1, a1 + 1]) K.box(pa, pa, 0, 1, 1, 4, B.FENCE);
        K.box(a0, a1, 0, 1, 1, 1, B.FENCE);
        K.box(a0 + 1, a0 + 1, 0, 0, 4, 4, B.PLANKS); // the trough at the back
        K.box(a0, a1, -1, -1, 2, 4, B.DIRT); K.box(a0, a0, 0, 0, 3, 4, B.HAY); K.box(a0 + 2, a0 + 2, 0, 0, 3, 3, B.HAY);
    });
    // the right end of the building: the tack room — saddles on racks, a barrel, bales (the way to the back door stays 3 wide)
    K.box(8, 9, 0, 1, 1, 2, B.PLANKS_DARK); K.box(8, 9, 2, 2, 1, 2, B.CARPET_RED); K.box(9, 9, 0, 0, 3, 4, B.WOOD); K.box(8, 9, 0, 0, 4, 4, B.HAY);
    K.box(-9, -8, 1, 1, -4, -4, B.PLANKS_DARK); K.box(-9, -9, 0, 0, -4, -4, timber); K.box(-8, -8, 0, 0, -4, -4, timber); K.box(-9, -8, 2, 2, -4, -4, B.CARPET_RED);
    K.box(8, 9, 0, 1, -4, -4, B.HAY); K.box(9, 9, 2, 2, -4, -4, B.HAY);
    for (const a of [-7, 0, 7]) { K.box(a, a, h - 1, h - 1, -5, 5, timber); K.box(a, a, h - 2, h - 2, -2, -2, B.LANTERN); K.box(a, a, h - 2, h - 2, 4, 4, B.LANTERN); }
    // outside before the doors: a water trough on the left, a barrel
    K.box(-6, -4, 0, 0, -7, -7, B.PLANKS_DARK); K.box(-6, -6, 1, 1, -7, -7, timber); K.box(-4, -4, 1, 1, -7, -7, timber);
    K.box(12, 12, 0, 1, -2, -1, B.WOOD);
    // ---- the paddock behind: a fence 1 high with posts, a trough, a hay rack, a gate towards the back door
    K.box(-10, 10, -1, -1, 6, 17, B.GRASS);
    for (let a = -10; a <= 10; a += 1) K.box(a, a, 0, 0, 17, 17, B.FENCE);
    for (let b = 6; b <= 17; b += 1) { K.box(-10, -10, 0, 0, b, b, B.FENCE); K.box(10, 10, 0, 0, b, b, B.FENCE); }
    for (let a = -10; a <= 10; a += 4) { K.box(a, a, 1, 1, 17, 17, B.FENCE); }
    for (let b = 6; b <= 17; b += 4) { K.box(-10, -10, 1, 1, b, b, B.FENCE); K.box(10, 10, 1, 1, b, b, B.FENCE); }
    K.box(-8, -6, 0, 0, 16, 16, B.PLANKS_DARK); K.box(-8, -6, -1, -1, 16, 16, B.PLANKS_DARK); // a trough
    K.box(7, 9, 0, 1, 16, 16, B.HAY); K.box(7, 9, 2, 2, 16, 16, B.FENCE); // a hay rack
    K.box(-2, 2, 0, 0, 12, 12, B.WOOD); // a jump pole
    K.box(-2, -2, 0, 1, 12, 12, B.WOOD); K.box(2, 2, 0, 1, 12, 12, B.WOOD);
    // ---- the horses: two of the stalls, and two in the paddock (pens: the stall, the paddock)
    K.out.pens = K.out.pens || [];
    for (const i of [0, 2]) {
        const [a0, a1] = stalls[i], q = K.pt((a0 + a1) / 2, 2.6, 0);
        K.out.pens.push({ x: q.x, y: q.y, z: q.z, r: 1.3, animals: ['horse'], stable: true });
    }
    const pq = K.pt(0, 11.5, 0);
    K.out.pens.push({ x: pq.x, y: pq.y, z: pq.z, r: 5.5, animals: ['horse', 'horse'], stable: true });
    K.keep.push([-1.5, 1.5, -5.5, -2.5], [4.5, 7.5, 1.5, 5.5]);
    chests(K, -9.5, 9.5, -4.5, 0.5, [[-8, -4], [8, -4]]);
    K.house.back = K.pt(6, 5, 0);
    return finish(K, 0, -5, -3, { r: 14 });
}

const BUILDERS = {
    well: buildWell, smithy: buildSmithy, bakery: buildBakery, herbalist: buildHerbalist, tavern: buildTavern, granary: buildGranary, mill: buildMill,
    chapel: (K) => buildChurch(K, false), church: (K) => buildChurch(K, true), stable: buildStable,
};

/**
 * Build a building of `kind` on the lot (cu, cv) turned `face`. Returns the door node (to join to the road), or the middle of the
 * square for a well. The numbers of `rng` are not drawn (a building is the same everywhere).
 */
export function buildBuilding(p, kind, cu, cv, face, rng, s, out) {
    const K = kit(p, cu, cv, face, kind, rng, s, out);
    const node = BUILDERS[kind](K);
    out.buildings.push({ kind, ru: BUILDING_KINDS[kind].ru, ...K.pt(0, 0, 0), r: BUILDING_KINDS[kind].big ? 18 : 10, house: BUILDING_KINDS[kind].house ? out.houses.length - 1 : -1 });
    return node;
}

// ============================================================ where they stand
/** By the size of the castle (its style): what its village has. Small — a well and a granary; middle — and a smithy, a tavern, a chapel; large — all. */
export function townKinds(style, rng) {
    if (style === 'compact') return ['well', 'granary'].concat(rng() < 0.5 ? ['herbalist'] : []);
    if (style === 'fortress') return ['well', 'granary', 'smithy', 'tavern', 'chapel'].concat(rng() < 0.5 ? ['herbalist'] : []);
    return ['church', 'stable', 'well', 'mill', 'granary', 'smithy', 'tavern', 'bakery', 'herbalist']; // grand
}

/** A folk hamlet of n houses (4…9): small — a well and a granary; middle — and a smithy or a tavern; large — and a bakery / a mill / a chapel. */
export function hamletKinds(n, rng) {
    const out = ['well', 'granary'];
    if (n >= 6) out.push(rng() < 0.5 ? 'smithy' : 'tavern');
    if (n >= 8) out.push(['bakery', 'mill', 'chapel', 'herbalist'][Math.floor(rng() * 4)]);
    return out;
}

/** The kinds wanting the middle of the town (the market) and those wanting the outskirts. */
const NEAR_MARKET = new Set(['church', 'chapel', 'tavern', 'well', 'bakery', 'herbalist']);

/**
 * Put the buildings of a castle's village on lots of its rings (called from Castles.buildVillage before the houses): each takes
 * the best free lot — the market's kinds the nearest to the square, the workshops (smithy, mill, stable, granary) the outer ring,
 * far from it — marks it used (a big one claims 26 × 26, as the graveyard) and joins its door to the road's node like a house.
 * Deterministic from the castle's place; the village's own random numbers are not drawn.
 */
export function placeTownBuildings(p, s, out, lots, used, g) {
    const { mcv, R2, R2z, free, rotLot: rot } = g;
    const rng = createRng(((p.X * 73856093) ^ (p.Z * 19349663) ^ 0x0b1d5) >>> 0);
    const kinds = townKinds(s.style, rng);
    const taken = new Set();
    for (const kind of kinds) {
        const big = BUILDING_KINDS[kind].big;
        const outerWanted = !NEAR_MARKET.has(kind);
        let best = null;
        for (const lot of lots) {
            if (taken.has(lot)) continue;
            if (used.some((o) => { const r = big || o.big ? 26 : 14; return Math.abs(o.u - lot.u) < r && Math.abs(o.v - lot.v) < r; })) continue;
            if (big) { const [da, db] = rot(0, 6, lot.face); if (!free(lot.u + da, lot.v + db, 14)) continue; }
            const outer = Math.abs(lot.u) > R2 || Math.abs(lot.v) > R2z;
            const d = Math.hypot(lot.u, lot.v - mcv);
            const score = outerWanted ? (outer ? 0 : 1000) - d : (lot.inner ? 0 : 400) + d;
            if (!best || score < best.score) best = { lot, score };
        }
        if (!best) continue;
        const lot = best.lot;
        taken.add(lot);
        used.push({ u: lot.u, v: lot.v, big });
        const node = buildBuilding(p, kind, lot.u, lot.v, lot.face, rng, s, out);
        const [ra, rb] = rot(0, -9, lot.face);
        p.link(node, p.node(lot.u + ra, lot.v + rb, 0));
    }
}
