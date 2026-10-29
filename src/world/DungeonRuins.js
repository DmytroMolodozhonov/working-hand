/**
 * DungeonRuins.js — the ruins on the ground (Dungeons.js places them): six buildings that fell, three of plain stone and three of arcane,
 * each a small one, a middling one, a great one. The plan's F is the levelled ground (l = −1 the ground itself), the front — the way in — at −v.
 * (DungeonKit.js: the tools — walls that are remains of walls, rings, pillars, rubble, bushes, flags.) Pure data (no THREE).
 */

import { BLOCK } from './Terrain.js';
import { TAU } from './DungeonKit.js';

const FRONT = (3 * Math.PI) / 2; // (the angle of −v in a ring)

// ------------------------------------------------------------------ pieces
/** A stone path from (0, v0) along +v to v1, 3 wide, here and there missing; the stones of two kinds. */
function path(k, v0, v1, w = 3, mat = BLOCK.PATH) {
    const h = (w - 1) / 2;
    for (let v = v0; v <= v1; v++) for (let u = -h; u <= h; u++) {
        const x = k.r();
        if (x < 0.1) continue;
        k.put(u, u, -1, -1, v, v, x < 0.28 ? k.flag() : mat);
    }
}

/** A barrel-ish stack of planks (a crate or two), a chair, a table: small furniture of what is left. */
function table(k, u, v, w = 3, d = 2, mat = BLOCK.PLANKS_DARK) {
    k.put(u, u + w - 1, 0, 0, v, v + d - 1, mat);
    k.put(u, u, 1, 1, v, v, mat); // (a broken leg's stump on one end: it is a table with a missing half)
    if (k.r() < 0.5) k.put(u + w, u + w, 0, 0, v, v, mat); // (a chair)
}
const crate = (k, u, v, n = 1, mat = BLOCK.PLANKS_DARK) => k.put(u, u, 0, n - 1, v, v, mat);

/** A standing stone or an obelisk: `h` high, with a lamp on its top (lit unless it fell). */
function obelisk(k, u, v, h, { lift = 0, fallen = false, lamp = BLOCK.ARCANE_LAMP_VIOLET, mat = BLOCK.ARCANE_DARK } = {}) {
    if (!fallen) {
        k.put(u, u, lift, lift + h - 1, v, v, mat);
        k.put(u, u, lift + h, lift + h, v, v, lamp);
    } else {
        k.put(u, u, lift, lift + 1, v, v, mat);
        const dir = k.r() < 0.5 ? 1 : -1;
        k.put(u + dir, u + dir * Math.max(2, h - 2), lift, lift, v, v, mat);
        k.put(u + dir * (h - 1), u + dir * (h - 1), lift, lift, v, v, lamp);
    }
}

/** A well with its cover on (no hole: nothing to fall into), a post, a bucket. */
function well(k, u, v) {
    const B = BLOCK;
    k.cylP(u, v, 2.4, 0, 1, B.COBBLE, 1.2);
    k.cylP(u, v, 2.4, 0, 0, B.CS_GREY, 0);
    k.cylP(u, v, 1.5, 1, 1, B.PLANKS_DARK);
    k.put(u - 2, u - 2, 2, 3, v, v, B.PLANKS_DARK); k.put(u + 2, u + 2, 2, 3, v, v, B.PLANKS_DARK); k.put(u - 2, u + 2, 4, 4, v, v, B.PLANKS_DARK);
}

/** A fence that mostly fell: posts (FENCE) along a line with gaps. */
function fence(k, u0, v0, u1, v1) {
    const n = Math.max(Math.abs(u1 - u0), Math.abs(v1 - v0));
    for (let i = 0; i <= n; i++) {
        if (k.r() < 0.4) continue;
        const u = Math.round(u0 + ((u1 - u0) * i) / n), v = Math.round(v0 + ((v1 - v0) * i) / n);
        k.put(u, u, 0, 0, v, v, BLOCK.FENCE);
    }
}

/** A room's roof timbers that are left: beams across at layer l, a few. */
function beams(k, u0, u1, v0, v1, l, n = 4, mat = BLOCK.PLANKS_DARK) {
    for (let i = 0; i < n; i++) {
        const v = k.rint(v0, v1), a = k.rint(u0, u0 + Math.floor((u1 - u0) / 2)), b = k.rint(a + 2, u1);
        k.put(a, b, l, l, v, v, mat);
        if (k.r() < 0.4) k.put(a, a, l - 1, l - 1, v, v, mat);
    }
}

/** Scattered fallen blocks and bushes over a rectangle, away from `keep` (boxes [u0,u1,v0,v1]). */
function litter(k, u0, u1, v0, v1, rubbles, bushes, keep = []) {
    const free = (u, v) => !keep.some((q) => u >= q[0] - 1 && u <= q[1] + 1 && v >= q[2] - 1 && v <= q[3] + 1);
    for (let i = 0, t = 0; i < rubbles && t < rubbles * 6; t++) { const u = k.rint(u0, u1), v = k.rint(v0, v1); if (free(u, v)) { k.rubble(u, v, 1 + k.r() * 1.4); i++; } }
    for (let i = 0, t = 0; i < bushes && t < bushes * 6; t++) { const u = k.rint(u0, u1), v = k.rint(v0, v1); if (free(u, v)) { k.bush(u, v, 1 + k.r() * 1.3); i++; } }
}

/** Scrub grown up in the cracks: single leaf blocks here and there (the meadow's own grass and flowers grow by themselves — Flora.js). */
function weeds(k, u0, u1, v0, v1, n) {
    for (let i = 0; i < n / 2; i++) { const u = k.rint(u0, u1), v = k.rint(v0, v1); k.put(u, u, 0, 0, v, v, k.r() < 0.6 ? BLOCK.LEAVES : BLOCK.DARK_LEAVES); }
}

// ------------------------------------------------------------------ plain: the watch-tower (small)
function ruinTower(k) {
    const B = BLOCK, fall = FRONT + Math.PI + (k.r() - 0.5) * 1.6; // (the broken side: away from the door, a little to one side)
    k.cylP(0, 0, 6.2, -1, -1, B.CS_GREY);
    for (let i = 0; i < 30; i++) { const a = k.r() * TAU, d = k.r() * 5.6; const u = Math.round(Math.cos(a) * d), v = Math.round(Math.sin(a) * d); k.put(u, u, -1, -1, v, v, k.r() < 0.5 ? k.flag() : B.DIRT); }
    // the ring wall, 2 thick, about 10 high when whole; the door to the front
    k.ring(0, 0, 5.6, 3.4, 10, { fall, lo: 2, doors: [{ a: FRONT, w: 0.46 }] });
    // arrow slits and one wide window
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 0.25]) {
        if (Math.abs(((a - fall + Math.PI * 3) % TAU) - Math.PI) < 0.9) continue;
        const u = Math.round(Math.cos(a) * 4.3), v = Math.round(Math.sin(a) * 4.3), u2 = Math.round(Math.cos(a) * 5.1), v2 = Math.round(Math.sin(a) * 5.1);
        k.air(u, u, 5, 6, v, v); k.air(u2, u2, 5, 6, v2, v2);
    }
    // the door's remains: a stone threshold and the stumps of the frame
    k.put(-1, 1, -1, -1, -6, -5, B.CS_DARK);
    for (const su of [-2, 2]) k.put(su, su, 0, k.rint(3, 5), -5, -5, B.CS_DARK);
    // the wooden floors that were: beams at 4 blocks, a few planks; the stair that wound up the inside wall, broken after ten steps
    beams(k, -4, 4, -3, 3, 4, 5);
    k.put(-3, 3, 4, 4, 2, 2, B.PLANKS_DARK); k.put(-2, 1, 4, 4, 3, 3, B.PLANKS_DARK);
    for (let i = 0; i < 10; i++) {
        const a = 0.35 + i * 0.5, u = Math.round(Math.cos(a) * 2.9), v = Math.round(Math.sin(a) * 2.9);
        k.put(u, u, 0, Math.floor(i / 2), v, v, i % 2 ? B.CS_GREY : B.COBBLE);
    }
    // outside: the fallen side's heaps, the stakes of a palisade, a ring of stones where a fire was, bushes and a dead tree
    for (const da of [-0.5, 0, 0.5]) k.rubble(Math.round(Math.cos(fall + da) * 7.4), Math.round(Math.sin(fall + da) * 7.4), 2.1);
    for (let i = 0; i < 22; i++) {
        const a = (i / 22) * TAU;
        if (Math.abs(((a - FRONT + Math.PI * 3) % TAU) - Math.PI) < 0.45 || k.r() < 0.35) continue;
        k.put(Math.round(Math.cos(a) * 11), Math.round(Math.cos(a) * 11), 0, k.rint(0, 2), Math.round(Math.sin(a) * 11), Math.round(Math.sin(a) * 11), B.PLANKS_DARK);
    }
    k.cylP(-9, -8, 1.9, 0, 0, B.COBBLE, 0.8);
    k.put(-12, -10, 0, 0, -11, -11, B.WOOD);
    path(k, -14, -7, 3, B.PATH);
    k.deadTree(10, 5, 6); k.bush(-10, 6, 1.7); k.bush(9, -9, 1.4); k.bush(-5, 10, 1.3);
    weeds(k, -12, 12, -12, 12, 22);
    // the chest: inside, against the back, its lid to the door; a second one among the heaps of the fall
    k.chest(0, 1, 0, -1, 0, 'tower');
    k.chest(Math.round(Math.cos(fall) * 9.5), Math.round(Math.sin(fall) * 9.5), Math.abs(Math.cos(fall)) > Math.abs(Math.sin(fall)) ? -Math.sign(Math.cos(fall)) : 0, Math.abs(Math.cos(fall)) > Math.abs(Math.sin(fall)) ? 0 : -Math.sign(Math.sin(fall)), 0, 'heap');
}

// ------------------------------------------------------------------ plain: the manor (middling)
function ruinManor(k) {
    const B = BLOCK;
    // the yard's wall (2 thick, 6 high), a gate to the front between two pillars
    const R = 26;
    k.wall(-R, -R, R, -R, 6, { th: 2, decay: 0.55, gaps: [[R - 3, R + 3]], side: 1, cren: true });
    k.wall(-R, R, R, R, 6, { th: 2, decay: 0.6, side: -1 });
    k.wall(-R, -R, -R, R, 6, { th: 2, decay: 0.6, side: 1 });
    k.wall(R, -R, R, R, 6, { th: 2, decay: 0.65, side: -1 });
    for (const su of [-4, 4]) k.pillar(su, -R, 8, { broken: 0.4, mat: B.CS_GREY });
    path(k, -R - 3, -2, 3); path(k, 2, 5, 3);
    // the main house at the back: 19 × 12, walls 8 high, the door to the front, windows, a partition, the chimney
    const hu0 = -9, hu1 = 9, hv0 = 5, hv1 = 16;
    k.flags(hu0 + 1, hu1 - 1, hv0 + 1, hv1 - 1, { worn: 0.15, hole: 0.1 });
    k.wall(hu0, hv0, hu1, hv0, 8, { th: 1, decay: 0.55, gaps: [[8, 10]], wins: [[3, 4, 3, 5], [14, 15, 3, 5]] });
    k.wall(hu0, hv1, hu1, hv1, 8, { th: 1, decay: 0.5, wins: [[4, 5, 3, 5], [12, 13, 3, 5]], side: -1 });
    k.wall(hu0, hv0, hu0, hv1, 8, { th: 1, decay: 0.6, wins: [[3, 4, 3, 5], [8, 9, 3, 5]] });
    k.wall(hu1, hv0, hu1, hv1, 8, { th: 1, decay: 0.6, wins: [[3, 4, 3, 5], [8, 9, 3, 5]], side: -1 });
    k.wall(-2, hv0 + 1, -2, hv1 - 1, 6, { th: 1, decay: 0.7, gaps: [[4, 6]] });
    // the chimney: a stack against the back wall, taller than anything, a hearth
    k.put(-1, 2, 0, 11, hv1 - 1, hv1 - 1, B.BRICK); k.put(0, 1, 0, 0, hv1 - 2, hv1 - 2, B.COBBLE);
    k.put(-2, 3, 12, 12, hv1 - 1, hv1 - 1, B.COBBLE);
    // roof timbers left, a table and benches in the hall, a bed frame in the room beyond the partition
    beams(k, hu0, hu1, hv0 + 1, hv1 - 1, 8, 7);
    k.put(hu0 + 1, hu0 + 1, 7, 7, hv0, hv1, B.PLANKS_DARK);
    table(k, 3, 8, 4, 2); k.put(3, 6, 0, 0, 11, 11, B.PLANKS_DARK); k.put(3, 6, 0, 0, 7, 7, B.PLANKS_DARK);
    k.put(-8, -8, 0, 0, 7, 9, B.PLANKS_DARK); k.put(-7, -6, 0, 0, 7, 9, B.CLOTH_WHITE); k.put(-8, -8, 1, 1, 7, 7, B.PLANKS_DARK);
    k.put(-8, -7, 0, 2, 14, 15, B.BOOKS); // (a shelf)
    k.rubble(-5, 12, 2.2); k.rubble(6, 14, 1.6);
    // a cellar under the hall: a stair down off the hall floor (5 steps), a store room with a chest, a stack of barrels
    k.put(-8, -4, -7, -2, 6, 12, B.COBBLE);
    k.put(-9, 3, -7, -2, 11, 16, B.COBBLE);
    k.air(-8, 2, -5, -2, 12, 15);
    k.air(-7, -5, -5, 3, 7, 11);
    for (let i = 0; i < 5; i++) k.put(-7, -5, -2 - i, -2 - i, 7 + i, 7 + i, i % 2 ? B.CS_GREY : B.COBBLE);
    k.put(-8, 2, -6, -6, 12, 15, k.flag());
    for (let i = 0; i < 14; i++) { const u = k.rint(-8, 2), v = k.rint(12, 15); k.put(u, u, -6, -6, v, v, k.flag()); }
    k.put(-1, 2, -5, -3, 15, 15, B.PLANKS_DARK); k.put(1, 2, -5, -4, 14, 14, B.PLANKS_DARK); // (barrels)
    k.put(-8, -8, -5, -4, 13, 14, B.PLANKS_DARK);
    k.put(-1, 0, -2, -2, 15, 15, B.LANTERN);
    // the barn at the right: a timber frame, plank walls fallen, hay
    const bu0 = 11, bu1 = 23, bv0 = -16, bv1 = -5;
    for (let v = bv0; v <= bv1; v += 4) for (const u of [bu0, bu1]) { if (k.r() < 0.25) continue; k.put(u, u, 0, k.rint(5, 8), v, v, B.PLANKS_DARK); }
    for (let u = bu0 + 4; u < bu1; u += 4) for (const v of [bv0, bv1]) { if (k.r() < 0.3) continue; k.put(u, u, 0, k.rint(4, 8), v, v, B.PLANKS_DARK); }
    k.wall(bu0, bv0, bu1, bv0, 6, { decay: 0.78, mat: B.PLANKS, gaps: [[4, 8]] });
    k.wall(bu0, bv1, bu1, bv1, 6, { decay: 0.7, mat: B.PLANKS, side: -1 });
    k.wall(bu0, bv0, bu0, bv1, 6, { decay: 0.8, mat: B.PLANKS });
    k.wall(bu1, bv0, bu1, bv1, 6, { decay: 0.75, mat: B.PLANKS, side: -1 });
    beams(k, bu0, bu1, bv0, bv1, 8, 5);
    for (let i = 0; i < 4; i++) { const u = k.rint(bu0 + 2, bu1 - 2), v = k.rint(bv0 + 2, bv1 - 2); k.put(u, u + 1, 0, k.rint(0, 1), v, v + 1, B.HAY); }
    // a cart overturned by the gate, barrels, a signpost
    k.put(-9, -6, 0, 0, -16, -15, B.PLANKS_DARK); k.put(-9, -9, 1, 1, -16, -16, B.PLANKS_DARK); k.put(-10, -10, 0, 1, -14, -14, B.PLANKS);
    crate(k, -12, -18, 2); crate(k, -13, -17, 1); k.put(7, 7, 0, 3, -20, -20, B.WOOD); k.put(6, 8, 3, 3, -20, -20, B.PLANKS);
    // two cottages that were farmhands': their low walls
    k.wall(-24, -14, -15, -14, 5, { decay: 0.6, th: 1 }); k.wall(-24, -6, -15, -6, 5, { decay: 0.6, side: -1 }); k.wall(-24, -14, -24, -6, 5, { decay: 0.65 }); k.wall(-15, -14, -15, -6, 5, { decay: 0.55, gaps: [[3, 5]], side: -1 });
    k.flags(-23, -16, -13, -7, { worn: 0.2, hole: 0.15 });
    table(k, -21, -11, 3, 2); k.rubble(-18, -9, 1.5);
    k.wall(14, 9, 22, 9, 5, { decay: 0.62 }); k.wall(14, 18, 22, 18, 5, { decay: 0.6, side: -1 }); k.wall(14, 9, 14, 18, 5, { decay: 0.6, gaps: [[3, 5]] }); k.wall(22, 9, 22, 18, 5, { decay: 0.7, side: -1 });
    k.flags(15, 21, 10, 17, { worn: 0.2, hole: 0.15 });
    k.put(16, 17, 0, 0, 16, 17, B.HAY); k.put(20, 20, 0, 1, 11, 12, B.PLANKS_DARK);
    // the well, the garden gone to seed, a dead orchard
    well(k, -8, -6);
    k.put(-22, -13, -1, -1, 10, 21, B.FARMLAND);
    for (let u = -21; u <= -14; u += 2) k.put(u, u, 0, 0, 11, 20, k.r() < 0.5 ? B.VEG : B.WHEAT);
    fence(k, -23, 9, -12, 9); fence(k, -23, 22, -12, 22); fence(k, -23, 9, -23, 22); fence(k, -12, 9, -12, 14);
    for (const [u, v] of [[-4, 20], [4, 22], [8, -10], [-14, -22], [14, -22], [20, 22]]) k.deadTree(u, v, k.rint(5, 7));
    litter(k, -24, 24, -24, 24, 14, 12, [[-9, 9, 5, 16], [11, 23, -16, -5], [-24, -15, -14, -6], [14, 22, 9, 18], [-1, 1, -26, 5], [-23, -12, 9, 22]]);
    weeds(k, -24, 24, -24, 24, 60);
    // the chests: the hall by the hearth, the cellar, the barn, the cottage
    k.chest(5, hv1 - 3, 0, -1, 0, 'hall');
    k.chest(-3, 14, 0, -1, -5, 'cellar');
    k.chest(bu1 - 3, bv1 - 3, -1, 0, 0, 'barn');
    k.chest(-20, -8, 1, 0, 0, 'cottage');
}

// ------------------------------------------------------------------ plain: the fort (great)
function ruinFort(k) {
    const B = BLOCK, R = 34;
    // the yard's flags and parade ground
    k.put(-R + 4, R - 4, -1, -1, -R + 4, R - 4, B.GRAVEL);
    for (let i = 0; i < 300; i++) { const u = k.rint(-R + 4, R - 4), v = k.rint(-R + 4, R - 4); k.put(u, u + 1, -1, -1, v, v + 1, k.r() < 0.6 ? B.PATH : B.COBBLE); }
    // the curtain wall, 3 thick, 11 high when whole, battlements where it stands, the gate at the front
    k.wall(-R, -R, R, -R, 11, { th: 3, decay: 0.5, gaps: [[R - 3, R + 3]], side: 1, cren: true });
    k.wall(-R, R, R, R, 11, { th: 3, decay: 0.55, side: -1, cren: true });
    k.wall(-R, -R, -R, R, 11, { th: 3, decay: 0.6, side: 1, cren: true });
    k.wall(R, -R, R, R, 11, { th: 3, decay: 0.55, side: -1, cren: true });
    // the corner towers: rings, each its own fall; a doorway to the yard
    const ctrs = [[-R, -R], [R, -R], [-R, R], [R, R]];
    ctrs.forEach(([u, v], i) => {
        const toYard = Math.atan2(-v, -u);
        k.ring(u, v, 6.4, 3.8, 17, { fall: i === 1 || i === 2 ? toYard + Math.PI : null, lo: 3, doors: [{ a: toYard, w: 0.42 }] });
        k.cylP(u, v, 3.7, -1, -1, B.CS_GREY);
    });
    // the gatehouse: two square towers, a passage, the broken grille
    for (const su of [-1, 1]) {
        const u0 = su * 3, u1 = su * 10;
        k.wall(u0, -R - 3, u1, -R - 3, 13, { th: 1, decay: 0.5, side: 1 });
        k.wall(u0, -R + 5, u1, -R + 5, 13, { decay: 0.55, side: -1 });
        k.wall(u0, -R - 3, u0, -R + 5, 13, { decay: 0.45 }); k.wall(u1, -R - 3, u1, -R + 5, 13, { decay: 0.5 });
        k.put(Math.min(u0, u1) + 1, Math.max(u0, u1) - 1, -1, -1, -R - 2, -R + 4, B.CS_DARK);
    }
    for (let u = -2; u <= 2; u++) if (k.r() < 0.55) k.put(u, u, 4, k.rint(7, 10), -R - 1, -R - 1, B.FENCE);
    k.put(-3, 3, 11, 11, -R - 1, -R - 1, B.CS_DARK);
    k.rubble(-6, -R - 7, 2.2); k.rubble(8, -R - 6, 2.6);
    // a way from the gate, the ruts of a ram on it
    path(k, -R - 14, -R + 1, 5, B.PATH);
    k.put(-3, 0, 0, 0, -R - 12, -R - 9, B.PLANKS_DARK); k.put(-3, -3, 1, 1, -R - 12, -R - 9, B.PLANKS_DARK); k.put(-2, -2, 1, 2, -R - 10, -R - 10, B.WOOD);
    // the keep at the back: 25 × 19, walls 18 high, a hall with a dais
    const ku0 = -12, ku1 = 12, kv0 = 10, kv1 = 28;
    k.flags(ku0 + 1, ku1 - 1, kv0 + 1, kv1 - 1, { worn: 0.15, hole: 0.12 });
    k.wall(ku0, kv0, ku1, kv0, 18, { th: 2, decay: 0.6, gaps: [[11, 13]], wins: [[4, 5, 6, 9], [19, 20, 6, 9]] });
    k.wall(ku0, kv1, ku1, kv1, 18, { th: 2, decay: 0.55, side: -1, wins: [[7, 8, 6, 9], [16, 17, 6, 9]] });
    k.wall(ku0, kv0, ku0, kv1, 18, { th: 2, decay: 0.65, wins: [[5, 6, 6, 9], [12, 13, 6, 9]] });
    k.wall(ku1, kv0, ku1, kv1, 18, { th: 2, decay: 0.62, side: -1, wins: [[5, 6, 6, 9], [12, 13, 6, 9]] });
    // the floors that were: ledges on the inside of the walls at 6 and 12, the stair up the left wall
    k.put(ku0 + 2, ku0 + 4, 5, 5, kv0 + 3, kv1 - 3, B.PLANKS_DARK); k.put(ku1 - 4, ku1 - 2, 5, 5, kv0 + 3, kv1 - 8, B.PLANKS_DARK);
    for (let i = 0; i < 6; i++) k.put(ku0 + 2, ku0 + 3, 0, i, kv0 + 3 + i, kv0 + 3 + i, i % 2 ? B.CS_GREY : B.COBBLE);
    beams(k, ku0, ku1, kv0 + 3, kv1 - 3, 11, 6);
    // the dais: three steps, a throne block, banners' poles
    k.put(-5, 5, 0, 0, kv1 - 8, kv1 - 2, B.CS_DARK); k.put(-4, 4, 1, 1, kv1 - 6, kv1 - 2, B.CS_GREY); k.put(-2, 2, 2, 2, kv1 - 4, kv1 - 2, B.CS_DARK);
    k.put(0, 0, 3, 5, kv1 - 3, kv1 - 3, B.CS_DARK); k.put(-1, 1, 3, 3, kv1 - 3, kv1 - 3, B.CS_DARK);
    for (const su of [-7, 7]) { k.put(su, su, 0, 7, kv1 - 3, kv1 - 3, B.PLANKS_DARK); k.put(su, su, 5, 6, kv1 - 3, kv1 - 3, B.CARPET_RED); }
    k.put(-1, 1, -1, -1, kv0 + 1, kv1 - 8, B.CARPET_RED);
    table(k, -4, 18, 8, 2); table(k, -4, 21, 8, 2);
    k.rubble(-6, 14, 2.4); k.rubble(7, 24, 2);
    // the barracks at the left: a long house with rows of bunks, a hearth
    const au0 = -30, au1 = -14, av0 = -26, av1 = -11;
    k.flags(au0 + 1, au1 - 1, av0 + 1, av1 - 1, { worn: 0.15, hole: 0.12 });
    k.wall(au0, av0, au1, av0, 8, { decay: 0.55, wins: [[4, 5, 3, 5], [10, 11, 3, 5]] }); k.wall(au0, av1, au1, av1, 8, { decay: 0.55, side: -1, gaps: [[6, 8]] });
    k.wall(au0, av0, au0, av1, 8, { decay: 0.6 }); k.wall(au1, av0, au1, av1, 8, { decay: 0.55, side: -1, gaps: [[5, 7]] });
    for (let v = av0 + 2; v <= av1 - 3; v += 3) { k.put(au0 + 2, au0 + 4, 0, 0, v, v + 1, B.PLANKS_DARK); k.put(au0 + 2, au0 + 2, 1, 1, v, v + 1, B.PLANKS_DARK); k.put(au0 + 3, au0 + 4, 1, 1, v, v + 1, B.HAY); }
    k.put(au0 + 1, au0 + 2, 0, 3, av0 + 1, av0 + 1, B.BRICK);
    beams(k, au0, au1, av0 + 1, av1 - 1, 8, 4);
    // the forge at the right: an open shed, an anvil, a furnace that still glows, a trough, the stalls beyond
    const fu0 = 14, fu1 = 30, fv0 = -26, fv1 = -11;
    k.flags(fu0 + 1, fu1 - 1, fv0 + 1, fv1 - 1, { worn: 0.15, hole: 0.15 });
    k.wall(fu0, fv0, fu1, fv0, 6, { decay: 0.55 }); k.wall(fu1, fv0, fu1, fv1, 6, { decay: 0.6, side: -1 }); k.wall(fu0, fv1, fu0 + 7, fv1, 6, { decay: 0.6, side: -1 });
    for (const [u, v] of [[fu0, fv1], [fu0 + 8, fv1], [fu1, fv1], [fu0, fv0 + 8]]) if (k.r() < 0.8) k.put(u, u, 0, k.rint(4, 6), v, v, B.PLANKS_DARK);
    k.put(fu1 - 4, fu1 - 2, 0, 2, fv0 + 1, fv0 + 3, B.BRICK); k.put(fu1 - 3, fu1 - 3, 3, 5, fv0 + 2, fv0 + 2, B.BRICK); k.put(fu1 - 3, fu1 - 3, 1, 1, fv0 + 4, fv0 + 4, B.LANTERN);
    k.put(fu1 - 8, fu1 - 8, 0, 0, fv0 + 3, fv0 + 3, B.CS_DARK); k.put(fu1 - 9, fu1 - 7, 1, 1, fv0 + 3, fv0 + 3, B.CS_DARK);
    k.put(fu0 + 3, fu0 + 6, 0, 0, fv0 + 2, fv0 + 3, B.PLANKS_DARK); k.put(fu0 + 3, fu0 + 6, 1, 1, fv0 + 2, fv0 + 2, B.PLANKS_DARK);
    k.put(fu0 + 2, fu0 + 4, 0, 1, fv1 - 6, fv1 - 4, B.HAY);
    // the well and the dummies on the parade ground
    well(k, 0, -10);
    for (const [u, v] of [[-10, 2], [-6, 2], [10, 4]]) { k.put(u, u, 0, 3, v, v, B.WOOD); k.put(u - 1, u + 1, 2, 2, v, v, B.WOOD); k.put(u, u, 4, 4, v, v, B.HAY); }
    // the wall walk's stairs, fallen blocks along the foot of the walls, bushes in the corners, trees dead and alive
    litter(k, -R + 5, R - 5, -R + 5, R - 5, 18, 16, [[ku0, ku1, kv0, kv1], [au0, au1, av0, av1], [fu0, fu1, fv0, fv1], [-3, 3, -R - 3, 0], [-5, 5, -R - 14, -R + 4]]);
    weeds(k, -R + 4, R - 4, -R + 4, R - 4, 90);
    for (const [u, v] of [[-22, 4], [24, 6], [-26, 22], [27, -4]]) k.deadTree(u, v, k.rint(6, 9));
    // the chests: the keep (either side of the dais), the barracks, the forge, the gatehouse, a corner tower
    k.chest(-9, kv1 - 4, 1, 0, 0, 'keep');
    k.chest(9, kv1 - 4, -1, 0, 0, 'keep');
    k.chest(au0 + 4, av1 - 3, 0, -1, 0, 'barracks');
    k.chest(fu0 + 5, fv0 + 6, 0, 1, 0, 'forge');
    k.chest(-6, -R + 1, 1, 0, 0, 'gatehouse');
    k.chest(-R + 5, R - 6, 0, -1, 0, 'tower');
}

// ------------------------------------------------------------------ magical: the chapel (small)
function ruinChapel(k) {
    const B = BLOCK;
    // the nave 9 × 15, the apse a half-ring at the back, the porch to the front
    k.flags(-3, 3, -7, 7, { worn: 0.18, hole: 0.12 });
    k.wall(-4, -8, 4, -8, 9, { th: 1, decay: 0.6, gaps: [[3, 5]], side: 1 });
    k.wall(-4, -8, -4, 8, 9, { th: 1, decay: 0.5, wins: [[2, 3, 3, 7], [7, 8, 3, 7], [12, 13, 3, 7]], side: 1 });
    k.wall(4, -8, 4, 8, 9, { th: 1, decay: 0.55, wins: [[2, 3, 3, 7], [7, 8, 3, 7], [12, 13, 3, 7]], side: -1, gaps: [[10, 12]] });
    k.ring(0, 8, 4.9, 3.7, 10, { fall: Math.PI * 0.2, lo: 3, doors: [] });
    // the glass that was: sill lamps in the tall windows still glow violet
    for (const v of [-5, 0, 5]) { if (k.r() < 0.7) k.put(-4, -4, 2, 2, v, v, B.ARCANE_LAMP_VIOLET); if (k.r() < 0.7) k.put(4, 4, 2, 2, v + 1, v + 1, B.ARCANE_LAMP_VIOLET); }
    // the rune circle in the floor and its lamps, the altar in the apse
    k.cylP(0, 0, 3.2, -1, -1, B.ARCANE_DARK, 2.2); k.cylP(0, 0, 2.2, -1, -1, B.RUNE, 1.2); k.put(0, 0, -1, -1, 0, 0, B.ARCANE_LAMP);
    k.put(-3, 3, 0, 0, 5, 6, B.ARCANE_DARK); k.put(-1, 1, 1, 1, 6, 6, B.CS_WHITE); k.put(-1, 1, 2, 2, 7, 7, B.BOOKS); k.put(0, 0, 3, 3, 7, 7, B.ARCANE_LAMP_VIOLET);
    // pews: low remains
    for (let v = -5; v <= 1; v += 2) for (const [a, b] of [[-3, -1], [1, 3]]) { if (v > -3 && v < 3 && a === -1) continue; if (k.r() < 0.55) k.put(a, b, 0, 0, v, v, B.PLANKS_DARK); }
    beams(k, -3, 3, -6, 6, 9, 3);
    // the bell tower's stump at the front left, the bell in the rubble
    k.wall(-9, -10, -5, -10, 8, { decay: 0.4, side: 1 }); k.wall(-9, -6, -5, -6, 8, { decay: 0.45, side: -1 }); k.wall(-9, -10, -9, -6, 8, { decay: 0.4 }); k.wall(-5, -10, -5, -6, 8, { decay: 0.7, gaps: [[1, 3]] });
    k.flags(-8, -6, -9, -7, { worn: 0.1, hole: 0.1 });
    k.rubble(-7, -8, 1.6); k.put(-7, -7, 1, 1, -8, -8, B.GOLD);
    // the side room, the vestry: low walls, a shelf of books
    k.wall(5, 0, 10, 0, 6, { decay: 0.5 }); k.wall(5, 7, 10, 7, 6, { decay: 0.55, side: -1 }); k.wall(10, 0, 10, 7, 6, { decay: 0.5, side: -1 });
    k.flags(6, 9, 1, 6, { worn: 0.15, hole: 0.1 });
    k.put(9, 9, 0, 2, 2, 5, B.BOOKS); k.put(7, 8, 0, 0, 2, 3, B.PLANKS_DARK);
    // two obelisks before the porch: one standing and glowing, one fallen; a ring of garden
    obelisk(k, -7, -13, 5); obelisk(k, 7, -13, 5, { fallen: true });
    path(k, -16, -9, 3, B.CS_WHITE);
    k.cylP(-11, 3, 1.8, 0, 0, B.LEAVES, 0.8);
    litter(k, -12, 12, -14, 12, 6, 9, [[-4, 4, -8, 8], [-9, -5, -10, -6], [5, 10, 0, 7], [-1, 1, -16, -8]]);
    weeds(k, -13, 13, -15, 13, 36);
    k.deadTree(10, -5, 6);
    // the chests: the left aisle, the vestry
    k.chest(-2, -3, -1, 0, 0, 'nave');
    k.chest(8, 4, -1, 0, 0, 'vestry');
}

// ------------------------------------------------------------------ magical: the temple (middling)
function ruinTemple(k) {
    const B = BLOCK;
    // the platform of three steps (each a block higher, 2 narrower), its floor of flags: the cella and the colonnades stand on it (lift 3)
    k.put(-19, 19, 0, 0, -24, 24, B.ARCANE); k.put(-17, 17, 1, 1, -22, 22, B.CS_WHITE); k.put(-15, 15, 2, 2, -20, 20, B.ARCANE);
    for (let i = 0; i < 70; i++) { const u = k.rint(-19, 19), v = k.rint(-24, 24), l = Math.abs(u) <= 15 && Math.abs(v) <= 20 ? 2 : Math.abs(u) <= 17 && Math.abs(v) <= 22 ? 1 : 0; k.put(u, u, l, l, v, v, k.r() < 0.5 ? B.CS_MOSSY : k.flag()); }
    for (let i = 0; i < 30; i++) { const u = k.rint(-14, 14), v = k.rint(-19, 19); k.put(u, u, 2, 2, v, v, B.GRASS); }
    const L = 3;
    // the cella: 19 × 21, walls 10 high, 2 thick, the door at the front, long windows; the portico's pillars; the colonnade's pillars both sides
    k.wall(-9, -10, 9, -10, 10, { th: 2, decay: 0.55, lift: L, gaps: [[6, 12]], side: 1 });
    k.wall(-9, 10, 9, 10, 10, { th: 2, decay: 0.5, lift: L, side: -1 });
    k.wall(-9, -10, -9, 10, 10, { th: 2, decay: 0.6, lift: L, wins: [[3, 4, 3, 7], [8, 9, 3, 7], [14, 15, 3, 7]], gaps: [[10, 12]] });
    k.wall(9, -10, 9, 10, 10, { th: 2, decay: 0.58, lift: L, side: -1, wins: [[3, 4, 3, 7], [8, 9, 3, 7], [14, 15, 3, 7]], gaps: [[10, 12]] });
    for (let v = -14; v <= 14; v += 4) for (const su of [-13, 13]) k.pillar(su, v, 11, { broken: 0.4, lift: L, mat: B.CS_WHITE });
    for (let u = -13; u <= 13; u += 4) k.pillar(u, -18, 11, { broken: 0.35, lift: L, mat: B.CS_WHITE });
    // architraves that held: stone beams bridging neighbouring pillars
    for (let v = -14; v < 14; v += 4) for (const su of [-13, 13]) if (k.r() < 0.45) k.put(su, su, L + 12, L + 12, v, v + 4, B.CS_WHITE);
    for (let u = -13; u < 13; u += 4) if (k.r() < 0.4) k.put(u, u + 4, L + 12, L + 12, -18, -18, B.CS_WHITE);
    // the floor inside: flags, the sunken circle of runes (a block lower), its rings of dark stone and the lamps round it
    k.flags(-7, 7, -8, 8, { l: L - 1, worn: 0.15, hole: 0.1 });
    k.cylP(0, 0, 6.6, L - 1, L - 1, B.AIR); // (the sunken floor)
    k.cylP(0, 0, 6.6, L - 2, L - 2, B.ARCANE_DARK); k.cylP(0, 0, 5.4, L - 2, L - 2, B.RUNE, 4.3); k.cylP(0, 0, 3.2, L - 2, L - 2, B.ARCANE_DARK, 2.2); k.cylP(0, 0, 1.4, L - 2, L - 2, B.RUNE);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, u = Math.round(Math.cos(a) * 7.6), v = Math.round(Math.sin(a) * 7.6); k.put(u, u, L, L, v, v, B.ARCANE_DARK); k.put(u, u, L + 1, L + 1, v, v, i % 3 ? B.ARCANE_LAMP_VIOLET : B.ARCANE_LAMP); }
    // the altar on its steps at the back
    k.put(-4, 4, L, L, 7, 9, B.ARCANE_DARK); k.put(-3, 3, L + 1, L + 1, 8, 9, B.CS_WHITE); k.put(-1, 1, L + 2, L + 2, 9, 9, B.ARCANE_DARK); k.put(0, 0, L + 3, L + 3, 9, 9, B.BOOKS); k.put(0, 0, L + 4, L + 4, 9, 9, B.ARCANE_LAMP_VIOLET);
    beams(k, -8, 8, -8, 8, L + 10, 6, B.CS_WHITE);
    // the vestries, left and right behind the cella: a low room each, shelves of books
    for (const s of [-1, 1]) {
        const a = s * 11, b = s * 17;
        k.wall(a, 3, b, 3, 7, { decay: 0.5, lift: L }); k.wall(a, 11, b, 11, 7, { decay: 0.55, lift: L, side: -1 });
        k.wall(b, 3, b, 11, 7, { decay: 0.5, lift: L, side: -1 });
        k.flags(Math.min(a, b) + (s > 0 ? 1 : 0), Math.max(a, b) - (s > 0 ? 0 : 1), 4, 10, { l: L - 1, worn: 0.1, hole: 0.1 });
        k.put(b - s, b - s, L, L + 2, 4, 9, B.BOOKS); k.put(a + s * 2, a + s * 3, L, L, 4, 5, B.PLANKS_DARK);
    }
    // four obelisks at the corners of the platform, one fallen; a fountain basin on the way
    [[-16, -21], [16, -21], [-16, 21], [16, 21]].forEach(([u, v], i) => obelisk(k, u, v, 6, { lift: L - 1, fallen: i === 2, mat: B.ARCANE_DARK }));
    path(k, -30, -25, 5, B.CS_WHITE);
    for (const v of [-27, -31]) for (const su of [-4, 4]) { k.pillar(su, v, 7, { broken: 0.5, lift: 0, mat: B.ARCANE }); }
    k.cylP(0, -29, 3.2, 0, 1, B.CS_WHITE, 2); k.cylP(0, -29, 2, 0, 0, B.ARCANE_DARK);
    litter(k, -28, 28, -31, 30, 12, 14, [[-20, 20, -25, 25], [-6, 6, -32, -24]]);
    weeds(k, -28, 28, -31, 30, 60);
    // the chests: flanking the altar, in each vestry
    k.chest(-6, 5, 1, 0, L, 'sanctum');
    k.chest(6, 5, -1, 0, L, 'sanctum');
    k.chest(-14, 8, 1, 0, L, 'vestry');
    k.chest(14, 8, -1, 0, L, 'vestry');
}

// ------------------------------------------------------------------ magical: the citadel (great)
function ruinCitadel(k) {
    const B = BLOCK;
    // the courtyard's floor: flags in rings, a great rune circle with radial inlays leading to the tower
    k.cylP(0, 4, 32, -1, -1, B.CS_GREY);
    for (let i = 0; i < 260; i++) { const a = k.r() * TAU, d = Math.sqrt(k.r()) * 31; k.put(Math.round(Math.cos(a) * d), Math.round(Math.cos(a) * d), -1, -1, Math.round(4 + Math.sin(a) * d), Math.round(4 + Math.sin(a) * d), k.r() < 0.6 ? k.flag() : k.r() < 0.5 ? B.GRASS : B.DIRT); }
    k.cylP(0, 4, 22, -1, -1, B.ARCANE_DARK, 21); k.cylP(0, 4, 16, -1, -1, B.RUNE, 15);
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + 0.26;
        for (let d = 11; d <= 21; d++) { if (k.r() < 0.22) continue; const u = Math.round(Math.cos(a) * d), v = Math.round(4 + Math.sin(a) * d); k.put(u, u, -1, -1, v, v, d % 4 === 0 ? B.ARCANE_LAMP : B.ARCANE_DARK); }
    }
    // the great tower in the middle: 8 across, 26 high when whole, a doorway to the front, its crown broken
    k.ring(0, 4, 8.2, 5.6, 26, { fall: 0.7, lo: 4, doors: [{ a: FRONT, w: 0.34 }] });
    k.cylP(0, 4, 5.4, -1, -1, B.CS_WHITE);
    for (let i = 0; i < 4; i++) { const a = 0.9 + i * 1.57, u = Math.round(Math.cos(a) * 6.6), v = Math.round(4 + Math.sin(a) * 6.6); k.put(u, u, 6 + i * 3, 6 + i * 3, v, v, B.ARCANE_LAMP_VIOLET); }
    // the ring of arches round the court: 12 pillars on a circle of 29, lintels where they held
    const pil = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.13, u = Math.round(Math.cos(a) * 29), v = Math.round(4 + Math.sin(a) * 29); pil.push([u, v]); }
    pil.forEach(([u, v], i) => {
        k.pillar(u, v, 13, { broken: 0.35, mat: B.CS_WHITE });
        const [u2, v2] = pil[(i + 1) % 12];
        if (k.r() < 0.4) { const n = Math.max(Math.abs(u2 - u), Math.abs(v2 - v)); for (let t = 1; t < n; t++) k.put(Math.round(u + ((u2 - u) * t) / n), Math.round(u + ((u2 - u) * t) / n), 14, 14, Math.round(v + ((v2 - v) * t) / n), Math.round(v + ((v2 - v) * t) / n), B.ARCANE); }
        else if (k.r() < 0.6) { const n = Math.max(Math.abs(u2 - u), Math.abs(v2 - v)); for (let t = 1; t < n; t++) { if (k.r() < 0.6) continue; k.put(Math.round(u + ((u2 - u) * t) / n), Math.round(u + ((u2 - u) * t) / n), 0, k.rint(0, 2), Math.round(v + ((v2 - v) * t) / n), Math.round(v + ((v2 - v) * t) / n), k.stone()); } }
    });
    // the gate: two great pylons at the front of the ring
    for (const su of [-1, 1]) { k.wall(su * 6, -29, su * 11, -29, 15, { th: 2, decay: 0.4, side: 1 }); k.wall(su * 6, -29, su * 6, -25, 15, { decay: 0.5 }); k.wall(su * 11, -29, su * 11, -25, 15, { decay: 0.5 }); }
    k.put(-6, 6, 16, 16, -29, -28, B.ARCANE_DARK); k.put(-1, 1, 17, 17, -29, -28, B.ARCANE_LAMP_VIOLET);
    // four lesser towers at the diagonals
    [[-27, -22], [27, -22], [-27, 30], [27, 30]].forEach(([u, v], i) => {
        const ta = Math.atan2(4 - v, -u);
        k.ring(u, v, 5.2, 3, 16, { fall: i % 2 ? ta + Math.PI : null, lo: 3, doors: [{ a: ta, w: 0.5 }] });
        k.cylP(u, v, 3, -1, -1, B.CS_WHITE);
    });
    // the library at the left of the court: stacks of books, tables, a fallen roof
    const lu0 = -22, lu1 = -8, lv0 = 12, lv1 = 22;
    k.flags(lu0 + 1, lu1 - 1, lv0 + 1, lv1 - 1, { worn: 0.15, hole: 0.12 });
    k.wall(lu0, lv0, lu1, lv0, 9, { decay: 0.5, gaps: [[6, 8]], wins: [[2, 3, 3, 6], [10, 11, 3, 6]] }); k.wall(lu0, lv1, lu1, lv1, 9, { decay: 0.5, side: -1, wins: [[3, 4, 3, 6], [9, 10, 3, 6]] });
    k.wall(lu0, lv0, lu0, lv1, 9, { decay: 0.6 }); k.wall(lu1, lv0, lu1, lv1, 9, { decay: 0.55, side: -1, gaps: [[4, 6]] });
    for (let v = lv0 + 2; v <= lv1 - 3; v += 3) { k.put(lu0 + 1, lu0 + 1, 0, 3, v, v + 1, B.BOOKS); if (k.r() < 0.8) k.put(lu1 - 1, lu1 - 1, 0, 3, v, v + 1, B.BOOKS); }
    k.put(lu0 + 5, lu0 + 8, 0, 0, lv0 + 5, lv0 + 6, B.PLANKS_DARK); k.put(lu0 + 5, lu0 + 5, 1, 1, lv0 + 5, lv0 + 5, B.BOOKS);
    beams(k, lu0, lu1, lv0 + 1, lv1 - 1, 9, 5);
    k.rubble(lu0 + 7, lv0 + 8, 2.2);
    // the observatory at the right: a ring wall with the ribs of a dome that was
    k.ring(18, 12, 7.2, 5.6, 9, { fall: 5.4, lo: 3, doors: [{ a: Math.PI * 0.75, w: 0.5 }] });
    k.cylP(18, 12, 5.4, -1, -1, B.CS_WHITE);
    for (let i = 0; i < 8; i++) {
        if (k.r() < 0.3) continue;
        const a = (i / 8) * TAU;
        for (let l = 9; l < 15; l++) { const rr = 6.4 * Math.sqrt(Math.max(0, 1 - Math.pow((l - 8) / 7, 2))); if (k.r() < 0.08) break; const u = Math.round(18 + Math.cos(a) * rr), v = Math.round(12 + Math.sin(a) * rr); k.put(u, u, l, l, v, v, B.ARCANE_DARK); }
    }
    k.put(18, 18, 0, 1, 12, 12, B.ARCANE_DARK); k.put(17, 19, 2, 2, 12, 12, B.CS_WHITE); k.put(18, 18, 3, 3, 12, 12, B.ARCANE_LAMP); // (the great lens' mount)
    // a fallen tower's drum in the court, rubble round the wall, the obelisks on the way in
    for (let i = 0; i < 4; i++) k.put(-3 + i * 2, -3 + i * 2, 0, 1, -16 + i, -15 + i, B.ARCANE);
    obelisk(k, -8, -36, 7); obelisk(k, 8, -36, 7, { fallen: true }); obelisk(k, -8, -44, 7, { fallen: true }); obelisk(k, 8, -44, 7);
    path(k, -46, -30, 5, B.CS_WHITE);
    for (const v of [-34, -40]) for (const su of [-4, 4]) k.pillar(su, v, 7, { broken: 0.5, mat: B.ARCANE });
    litter(k, -36, 36, -32, 38, 22, 24, [[-8, 8, -4, 12], [lu0, lu1, lv0, lv1], [11, 25, 5, 19], [-7, 7, -46, -26]]);
    weeds(k, -34, 34, -30, 36, 110);
    for (const [u, v] of [[-20, 0], [22, -6], [-12, -18], [14, 26]]) k.deadTree(u, v, k.rint(6, 9));
    // the chests: in the tower, in the library, in the observatory, in a lesser tower
    k.chest(-3, 3, 1, 0, 0, 'tower');
    k.chest(3, 7, -1, 0, 0, 'tower');
    k.chest(lu0 + 3, lv1 - 3, 0, -1, 0, 'library');
    k.chest(lu1 - 3, lv0 + 3, 0, 1, 0, 'library');
    k.chest(16, 10, 1, 0, 0, 'observatory');
    k.chest(-27, -20, 0, 1, 0, 'lesser');
}

export const RUIN_BUILDERS = { ruin_tower: ruinTower, ruin_manor: ruinManor, ruin_fort: ruinFort, ruin_chapel: ruinChapel, ruin_temple: ruinTemple, ruin_citadel: ruinCitadel };
void crate;
