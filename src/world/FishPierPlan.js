/**
 * FishPierPlan.js — the fishermen's mini-pier of the Creative test ground (pure: no THREE, node-testable). The game part — FishPier.js.
 *
 * The author 07.11: «в творческом режиме, у нас же недалеко там моря, был такой отдельный мини-причал для рыбаков. И там можно было бесплатно удочку взять».
 *
 * Standing on the shore of the test sea (Castles.testSeaCastleSpot: the sea lies to −z), a good way west of the sea castle's land (a pier of its own,
 * not the castle's port): from the land (z = zL) a short ramp up to a LANDING (9×7, with the rod rack, a crate, a bench and lanterns), then a BOARDWALK (5 wide) out over
 * the water to the HEAD (9×9, rails all round but the front, a bench, lanterns), all on a deck two blocks over the water (`D` layers: the deck's top is D − 0.5), the posts
 * of logs down to the sea floor under it, cross-beams under the deck, a fence rail along every side.
 * Measures from the world: block 1 m, the hero ~3.5 m (a rail is a block high — the waist; the lamps on posts a block higher), the deck 5 wide (two heroes abreast and a rod's swing).
 *
 * The rack: a beam on two posts at the landing's west side, `RACK.SLOTS` rods lying on it along z (butt towards the land), a hand's reach — the rods are things
 * (`kind: 'fishingRod'`), free: a taken one is replaced after a moment (FishPier.js).
 *
 * `plan(P)` → {blocks: [[x, y, z, type, shape]], rect, rack: {slots: [{x, y, z}], quat: [x, y, z, w]}, head: {x, y, z}, stand: {x, y, z}}; `P` = {xc, zL, D, len, floorAt(x, z) → the
 * layer of the solid floor under the deck's column (sea bed / ground), groundAt(x, z) → the land's top layer}.
 */
import { BLOCK } from './Terrain.js';

export const PIER = {
    LEN: 30, // m from the landing's front to the head's front (longer where the water is shallow — FishPier.js)
    DECK: 2, // layers over the water
    ROAD_W: 2, // half width of the boardwalk (5 wide)
    LAND: { half: 4, len: 7 }, // the landing: 9 × 7
    HEAD: { half: 4, len: 9 }, // the head: 9 × 9
    RAMP: 3, // steps up from the shore
    POST_EVERY: 4,
    LAMP_EVERY: 12,
};
export const RACK = { SLOTS: 3, BEAM_Y: 3, X: -3, Z_FROM: 1, Z_TO: 5, ROD_LEN: 4.4, DX: [-0.28, 0, 0.28] };

/** Where it stands in the world: the pier's centre x and the first deck row z. Pure. */
export function pierSite(testSea, castleX, rectU1, shoreFallbackZ = 0) {
    const xc = Math.round(castleX - rectU1 - 60);
    const zs = testSea ? testSea.z + Math.sqrt(Math.max(0, testSea.r0 * testSea.r0 - (xc - testSea.x) ** 2)) : shoreFallbackZ;
    return { xc, zShore: Math.round(zs) };
}

export function plan(P) {
    const { xc, zL, D } = P;
    const len = P.len ?? PIER.LEN;
    const floorAt = P.floorAt || (() => D - 3), groundAt = P.groundAt || (() => D - 1);
    const B = new Map();
    const put = (x, y, z, t, shape = 0) => { B.set(x + ',' + y + ',' + z, [x, y, z, t, shape]); };
    const zE = zL - len; // the head's front row
    const zHeadBack = zE + PIER.HEAD.len - 1;
    const zLandBack = zL - PIER.LAND.len + 1;
    const plank = (dx, half) => (Math.abs(dx) === half ? BLOCK.PLANKS_DARK : BLOCK.PLANKS);
    const deckRow = (z, half) => { for (let dx = -half; dx <= half; dx++) put(xc + dx, D, z, plank(dx, half)); };
    // the deck: the landing, the boardwalk, the head
    for (let z = zL; z >= zLandBack; z--) deckRow(z, PIER.LAND.half);
    for (let z = zLandBack - 1; z > zHeadBack; z--) deckRow(z, PIER.ROAD_W);
    for (let z = zHeadBack; z >= zE; z--) deckRow(z, PIER.HEAD.half);
    // the ramp: steps up from the shore to the landing (filled from the ground)
    for (let k = 1; k <= PIER.RAMP; k++) {
        const z = zL + k, top = D - k;
        for (let dx = -PIER.ROAD_W; dx <= PIER.ROAD_W; dx++) {
            const g = groundAt(xc + dx, z);
            for (let y = g + 1; y <= top; y++) put(xc + dx, y, z, plank(dx, PIER.ROAD_W));
        }
    }
    // the posts (logs from the floor to under the deck) at the edges and corners, a cross-beam under the deck at each row of posts
    const post = (x, z) => { const f = floorAt(x, z); for (let y = f + 1; y <= D - 1; y++) put(x, y, z, BLOCK.WOOD); };
    const rows = new Set();
    for (let z = zL; z >= zE; z -= PIER.POST_EVERY) rows.add(z);
    rows.add(zLandBack); rows.add(zHeadBack); rows.add(zE);
    for (const z of rows) {
        const half = z <= zHeadBack ? PIER.HEAD.half : z >= zLandBack ? PIER.LAND.half : PIER.ROAD_W;
        for (const dx of half === PIER.ROAD_W ? [-half, half] : [-half, -Math.floor(half / 2), Math.ceil(half / 2), half]) post(xc + dx, z);
        for (let dx = -half; dx <= half; dx++) if (Math.abs(dx) !== half) put(xc + dx, D - 1, z, BLOCK.PLANKS_DARK); // (the beam across, between the edge posts)
    }
    // the rails: a fence a block over the deck along every side; gaps: the entrance (the landing's land side) and the head's front middle
    const fence = (x, z) => put(x, D + 1, z, BLOCK.FENCE);
    for (let z = zL; z >= zLandBack; z--) { fence(xc - PIER.LAND.half, z); fence(xc + PIER.LAND.half, z); }
    for (let dx = -PIER.LAND.half; dx <= PIER.LAND.half; dx++) if (Math.abs(dx) > PIER.ROAD_W) fence(xc + dx, zLandBack); // (the landing's back is open over the boardwalk's width)
    for (let dx = -PIER.LAND.half; dx <= PIER.LAND.half; dx++) if (Math.abs(dx) > PIER.ROAD_W) fence(xc + dx, zL); // (the land side, but the entrance: the boardwalk's width stays open)
    for (let z = zLandBack - 1; z > zHeadBack; z--) { fence(xc - PIER.ROAD_W, z); fence(xc + PIER.ROAD_W, z); }
    for (let z = zHeadBack; z >= zE; z--) { fence(xc - PIER.HEAD.half, z); fence(xc + PIER.HEAD.half, z); }
    for (let dx = -PIER.HEAD.half; dx <= PIER.HEAD.half; dx++) { if (Math.abs(dx) > 1) fence(xc + dx, zE); if (Math.abs(dx) > PIER.ROAD_W) fence(xc + dx, zHeadBack); }
    // the lamps: on the rail's corners (a block over it), and every LAMP_EVERY along the boardwalk
    const lamp = (x, z) => put(x, D + 2, z, BLOCK.LANTERN);
    for (const sx of [-1, 1]) { lamp(xc + sx * PIER.HEAD.half, zE); lamp(xc + sx * PIER.HEAD.half, zHeadBack); lamp(xc + sx * PIER.LAND.half, zL); lamp(xc + sx * PIER.LAND.half, zLandBack); }
    for (let z = zLandBack - PIER.LAMP_EVERY / 2; z > zHeadBack; z -= PIER.LAMP_EVERY) lamp(xc - PIER.ROAD_W, Math.round(z));
    // a bench on the head (against the west rail), a crate and a barrel-stack at the landing's east side
    for (let k = 0; k < 3; k++) put(xc + 3, D + 1, zE + 4 + k, BLOCK.PLANKS_DARK);
    put(xc + 3, D + 1, zE + 3, BLOCK.PLANKS_DARK); put(xc + 3, D + 2, zE + 3, BLOCK.PLANKS_DARK); // (the bench's end: higher, a back)
    put(xc + 3, D + 1, zL - 2, BLOCK.PLANKS_DARK); put(xc + 3, D + 2, zL - 2, BLOCK.PLANKS_DARK); put(xc + 3, D + 1, zL - 3, BLOCK.PLANKS_DARK); // (crates)
    // the rod rack on the landing's west side: two posts and a beam along z at layer D + BEAM_Y
    const rx = xc + RACK.X, z1 = zL - RACK.Z_FROM, z2 = zL - RACK.Z_TO;
    for (const z of [z1, z2]) for (let y = D + 1; y <= D + RACK.BEAM_Y; y++) put(rx, y, z, BLOCK.WOOD);
    for (let z = z1; z >= z2; z--) put(rx, D + RACK.BEAM_Y, z, BLOCK.PLANKS_DARK);
    // the rods lie on the beam along z (butt towards the land: +z), reel down: the model's +Y turned to −Z (a turn of −90° about X)
    const yTop = D + RACK.BEAM_Y - 0.5 + 0.1; // (the beam's top face + the rod's radius, about)
    const cz = (z1 + z2) / 2;
    const slots = RACK.DX.slice(0, RACK.SLOTS).map((dx) => ({ x: rx + dx, y: yTop, z: cz + RACK.ROD_LEN / 2 }));
    const s = Math.SQRT1_2;
    const blocks = [...B.values()];
    let x0 = Infinity, x1 = -Infinity, zmin = Infinity, zmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const b of blocks) { x0 = Math.min(x0, b[0]); x1 = Math.max(x1, b[0]); zmin = Math.min(zmin, b[2]); zmax = Math.max(zmax, b[2]); ymin = Math.min(ymin, b[1]); ymax = Math.max(ymax, b[1]); }
    return {
        blocks,
        rect: { x0, x1, z0: zmin, z1: zmax, y0: ymin, y1: ymax },
        rack: { slots, quat: [-s, 0, 0, s], beamZ: [z2, z1], x: rx },
        head: { x: xc, y: D - 0.5, z: zE + 2 },
        stand: { x: xc, y: D - 0.5, z: zL - 3 },
        marker: [xc, D, zE + 1, BLOCK.PLANKS],
        zE, zL, D,
    };
}
