/**
 * DungeonBuild.js — the dungeons UNDER the ground (old mine, crypt, passage, tomb, catacombs, cave temple) and the entry that builds any dungeon
 * (Dungeons.js places them; DungeonRules.js lists the kinds; DungeonKit.js the tools; DungeonRuins.js the ruins on the ground).
 *
 * The plan's F is the rooms' floor (l = −1); a stair (a half-sunk house at the yard) goes down from the ground (l = depth − 1). The shell is laid first,
 * the air carved out of it, the pieces last — a doorway is always open and no piece of the decoration stops a way. Every passage is 3 wide at least
 * and 5 high (the hero is ~3.5 m tall). Pure data (no THREE).
 */

import { BLOCK } from './Terrain.js';
import { Plan } from './Castles.js';
import { createRng } from '../core/math.js';
import { KINDS, DUNGEON } from './DungeonRules.js';
import { Kit, themes, TAU } from './DungeonKit.js';
import { RUIN_BUILDERS } from './DungeonRuins.js';

// ------------------------------------------------------------------ the pieces under the ground
/** The stair that goes down from the yard: a half-sunk house, 3 wide, 5 high, one block down every two. Returns RUN (the v where the rooms begin). */
function stair(k, depth, shellMat) {
    const run = 2 * depth + 2;
    for (let j = 0; j < run; j++) {
        const lf = depth - (j >> 1) - 1;
        k.solid(-2, 2, lf - 1, lf + 6, j, j, shellMat ?? k.stone());
        k.air(-1, 1, lf + 1, lf + 5, j, j);
    }
    k.rooms.push({ u0: -1, u1: 1, v0: 0, v1: run - 1, stair: true, depth });
    return run;
}

/** A room: walls of the shell's stone (patched with other courses), a floor of flags, a ceiling `h` up. */
function room(k, u0, u1, v0, v1, h = 6, { wall = null, tag = '', patch = 0.14 } = {}) {
    const wm = wall ?? k.stone();
    k.solid(u0 - 1, u1 + 1, -2, h, v0 - 1, v1 + 1, wm);
    k.air(u0, u1, 0, h - 1, v0, v1);
    k.rooms.push({ u0, u1, v0, v1, h, tag });
    // the floor: flags of two kinds, here and there a cracked one
    const fm = k.flag();
    k.solid(u0, u1, -2, -1, v0, v1, fm);
    for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) if (k.r() < 0.3) k.solid(u, u, -1, -1, v, v, k.flag());
    // the walls: patches of other stone and moss on the faces turned to the room
    const n = Math.round((u1 - u0 + v1 - v0 + 2) * 2 * h * patch);
    for (let i = 0; i < n; i++) {
        const side = k.rint(0, 3), l = k.rint(0, h - 1), m = k.r() < 0.45 ? k.moss() : k.stone();
        if (side === 0) { const u = k.rint(u0, u1); k.solid(u, u, l, l, v0 - 1, v0 - 1, m); }
        else if (side === 1) { const u = k.rint(u0, u1); k.solid(u, u, l, l, v1 + 1, v1 + 1, m); }
        else if (side === 2) { const v = k.rint(v0, v1); k.solid(u0 - 1, u0 - 1, l, l, v, v, m); }
        else { const v = k.rint(v0, v1); k.solid(u1 + 1, u1 + 1, l, l, v, v, m); }
    }
}

/** A passage 3 wide (w) along v at u = c from v0 to v1, or along u at v = c from u0 to u1 (axis 'u'). */
function pass(k, axis, c, a0, a1, { w = 3, h = 5, wall = null, tag = '' } = {}) {
    const hw = (w - 1) / 2;
    if (axis === 'v') room(k, c - hw, c + hw, a0, a1, h, { wall, tag, patch: 0.1 });
    else room(k, a0, a1, c - hw, c + hw, h, { wall, tag, patch: 0.1 });
}

/** A cavern: a round hall of radius r and height h (a dome: the radius falls towards the roof), its floor flags. */
function cavern(k, u, v, r, h, { tag = '', floor = true } = {}) {
    const wm = k.stone();
    k.cylS(u, v, r + 1.2, -2, h, wm);
    for (let l = 0; l < h; l++) {
        const f = l <= 1 ? 1 : Math.sqrt(Math.max(0.05, 1 - Math.pow((l - 1) / (h - 1.5), 2)));
        k.cylA(u, v, r * f, l, l);
    }
    if (floor) k.cylS(u, v, r, -2, -1, k.flag());
    k.rooms.push({ round: true, u, v, r, h, tag });
    // rocky variety on the wall
    const n = Math.round(r * 5);
    for (let i = 0; i < n; i++) {
        const a = k.r() * TAU, l = k.rint(0, h - 2), f = l <= 1 ? 1 : Math.sqrt(Math.max(0.05, 1 - Math.pow((l - 1) / (h - 1.5), 2)));
        const uu = Math.round(u + Math.cos(a) * (r * f + 1)), vv = Math.round(v + Math.sin(a) * (r * f + 1));
        k.solid(uu, uu, l, l, vv, vv, k.r() < 0.5 ? k.moss() : k.stone());
    }
}

/** A lamp on a bracket (a block of light) at (u, v), layer l. */
function lamp(k, u, v, l = 3) { k.put(u, u, l, l, v, v, k.th.lamp); }

/** A lit hanging lamp pair on a gallery wall every `step` blocks. */
function lamps(k, axis, c, a0, a1, step, l = 3, off = 1) {
    for (let a = a0 + 2; a <= a1 - 1; a += step) {
        if (axis === 'v') { lamp(k, c - off, a, l); } else { lamp(k, a, c - off, l); }
    }
}

/** A sarcophagus (stone coffin) along v or u at (u, v): 2×4 of fine stone with a lid course. */
function sarcophagus(k, u, v, alongV = true, gold = false) {
    const B = BLOCK;
    const [uu, vv] = alongV ? [1, 3] : [3, 1];
    k.put(u, u + uu - 1, 0, 0, v, v + vv - 1, B.CS_WHITE);
    k.put(u, u + uu - 1, 1, 1, v, v + vv - 1, k.r() < 0.5 ? B.CS_GREY : B.CS_WHITE);
    if (gold) k.put(u + (alongV ? 0 : 1), u + (alongV ? 1 : 1), 2, 2, v + (alongV ? 1 : 0), v + (alongV ? 1 : 0), B.GOLD);
}

/** A set of burial niches (loculi) cut into a wall: along `axis` at the plane `plane`, from `a0` to `a1`, depth 2, two courses high. */
function niches(k, axis, plane, dir, a0, a1, step = 4) {
    const B = BLOCK;
    for (let a = a0; a <= a1; a += step) {
        for (const l of [0, 3]) {
            if (axis === 'v') { k.air(plane + dir, plane + dir * 2, l, l + 1, a, a + 1); k.put(plane + dir, plane + dir * 2, l, l, a, a + 1, B.CS_WHITE); }
            else { k.air(a, a + 1, l, l + 1, plane + dir, plane + dir * 2); k.put(a, a + 1, l, l, plane + dir, plane + dir * 2, B.CS_WHITE); }
        }
    }
}

/** The facade of the stair house at the yard, by kind: v < 0 is outside, the way in at u = 0. */
function facade(k, depth, kind) {
    const B = BLOCK, g = depth - 1; // g: the yard's ground layer
    const wm = k.th.stone;
    // a path to the door, the yard's floor
    k.put(-1, 1, g, g, -12, -1, B.PATH);
    for (let v = -11; v < 0; v += 2) if (k.r() < 0.6) k.put(k.rint(-2, 2), k.rint(-2, 2), g, g, v, v, B.GRAVEL);
    if (kind === 'mine') {
        // a timber head-frame: two posts, a beam, a hanging lamp and a sign board, a heap of tailings and a cart
        for (const su of [-2, 2]) k.put(su, su, g + 1, g + 6, -1, -1, B.PLANKS_DARK);
        k.put(-3, 3, g + 7, g + 7, -1, -1, B.PLANKS_DARK);
        k.put(-1, 1, g + 6, g + 6, -1, -1, B.PLANKS);
        k.put(0, 0, g + 5, g + 5, -1, -1, B.LANTERN);
        for (const su of [-3, 3]) { k.put(su, su, g + 1, g + 4, -2, -2, B.PLANKS_DARK); k.put(su, su, g + 5, g + 5, -2, -2, B.PLANKS_DARK); }
        k.rubble(-6, -4, 2.6, g + 1);
        k.rubble(6, -6, 1.8, g + 1);
        k.put(5, 7, g + 1, g + 1, -3, -1, B.PLANKS_DARK); k.put(5, 7, g + 2, g + 2, -3, -3, B.PLANKS_DARK); k.put(5, 7, g + 2, g + 2, -1, -1, B.PLANKS_DARK); k.put(5, 5, g + 2, g + 2, -3, -1, B.PLANKS_DARK); k.put(7, 7, g + 2, g + 2, -3, -1, B.PLANKS_DARK);
        k.put(-7, -7, g + 1, g + 2, -2, -2, B.PLANKS_DARK); k.put(-7, -7, g + 1, g + 1, 0, 1, B.HAY);
    } else if (kind === 'crypt' || kind === 'catacombs') {
        // a mausoleum front: pillars, a pediment, a stepped base, a lamp at each pillar, bushes grown at the sides
        for (const su of [-3, 3]) { k.put(su, su, g + 1, g + 6, -2, -2, B.CS_WHITE); k.put(su, su, g + 7, g + 7, -2, -2, B.CS_DARK); k.put(su, su, g + 8, g + 8, -2, -2, B.LANTERN); }
        k.put(-3, 3, g + 7, g + 7, -1, -1, B.CS_DARK);
        k.put(-2, 2, g + 8, g + 8, -1, -1, B.CS_WHITE);
        k.put(-1, 1, g + 9, g + 9, -1, -1, B.CS_WHITE);
        k.put(-4, 4, g, g, -5, -3, B.CS_GREY);
        k.put(-3, 3, g + 1, g + 1, -4, -3, B.CS_MOSSY);
        k.bush(-6, -2, 1.6, g + 1); k.bush(6, -3, 1.4, g + 1);
        k.deadTree(8, 3, 6, g + 1); k.rubble(-6, 3, 1.8, g + 1);
        for (const [u, v] of [[-5, -7], [5, -8], [-7, -9], [7, -5]]) { k.put(u, u, g + 1, g + 1 + k.rint(0, 2), v, v, B.CS_WHITE); } // (old gravestones)
    } else if (kind === 'tomb') {
        // a sandstone gate: two tall pylons, a lintel, steps, sphinx-like couchant blocks, braziers
        for (const su of [-3, 3]) { k.put(su - 1, su + 1, g + 1, g + 8, -3, -1, B.CS_SAND); k.put(su - 1, su + 1, g + 9, g + 9, -3, -1, B.CS_WHITE); k.put(su, su, g + 10, g + 10, -2, -2, B.GOLD); }
        k.put(-2, 2, g + 7, g + 8, -3, -1, B.CS_SAND);
        k.put(-2, 2, g + 9, g + 9, -3, -1, B.CS_WHITE);
        k.put(-5, 5, g, g, -8, -4, B.CS_SAND);
        k.put(-4, 4, g + 1, g + 1, -7, -4, B.CS_WHITE);
        for (const su of [-6, 6]) { k.put(su, su, g + 1, g + 2, -9, -6, B.CS_SAND); k.put(su, su, g + 3, g + 3, -9, -9, B.CS_SAND); }
        k.rubble(-8, -2, 2.2, g + 1); k.rubble(8, -3, 2, g + 1);
        for (const su of [-2, 2]) { k.put(su, su, g + 1, g + 1, -6, -6, B.CS_DARK); k.put(su, su, g + 2, g + 2, -6, -6, B.LANTERN); }
    } else if (kind === 'cavetemple') {
        // an arcane gate in a rock face: a rough arch with violet lamps and runes before it
        for (const su of [-3, 3]) { k.put(su, su, g + 1, g + 7, -2, -1, B.ARCANE_DARK); k.put(su, su, g + 8, g + 8, -2, -2, B.ARCANE_LAMP_VIOLET); }
        k.put(-3, 3, g + 7, g + 7, -2, -1, B.ARCANE_DARK);
        k.put(-1, 1, g + 8, g + 8, -2, -2, B.ARCANE);
        k.cylP(0, -7, 3.2, g, g, B.RUNE);
        k.put(-1, 1, g, g, -7, -7, B.ARCANE_DARK);
        k.rubble(-6, -3, 2.4, g + 1); k.bush(6, -5, 1.5, g + 1); k.bush(-5, -9, 1.3, g + 1);
        for (const su of [-5, 5]) { k.put(su, su, g + 1, g + 3, -5, -5, B.ARCANE_DARK); k.put(su, su, g + 4, g + 4, -5, -5, B.ARCANE_LAMP_VIOLET); }
    } else { // passage: a stone well-house with a low roof, a ring of stones
        k.cylP(0, -4, 3.4, g + 1, g + 1, B.COBBLE, 2.2); // (a low curb of an old well, one block: it is stepped over)
        k.put(-3, -3, g + 1, g + 3, -4, -4, B.CS_MOSSY); k.put(3, 3, g + 1, g + 2, -4, -4, B.CS_MOSSY);
        k.put(-3, 3, g + 7, g + 7, -1, -1, B.COBBLE);
        for (const su of [-3, 3]) k.put(su, su, g + 1, g + 6, -1, -1, B.CS_MOSSY);
        k.put(-3, 3, g + 7, g + 7, -1, -1, B.CS_GREY);
        k.bush(-6, -4, 1.7, g + 1); k.bush(5, -7, 1.4, g + 1); k.rubble(6, -2, 1.6, g + 1);
    }
    void wm;
}

// ------------------------------------------------------------------ the underground dungeons
/** Old mine (small): a timbered gallery with side drifts, a collapse, a cart, flecks of gold in the walls, a face at the end. */
function buildMine(k, K) {
    const B = BLOCK, d = K.depth, RUN = stair(k, d, B.COBBLE);
    facade(k, d, 'mine');
    const v0 = RUN, v1 = RUN + 46;
    // the main gallery (5 wide) with timber frames every 4 blocks and rails of planks
    pass(k, 'v', 0, v0, v1, { w: 5, h: 6, tag: 'gallery' });
    for (let v = v0 + 2; v <= v1 - 1; v += 4) {
        for (const su of [-2, 2]) k.put(su, su, 0, 4, v, v, B.PLANKS_DARK);
        k.put(-2, 2, 5, 5, v, v, B.PLANKS_DARK);
        if (k.r() < 0.12) k.put(-2, 2, 5, 5, v, v, B.AIR);
    }
    for (let v = v0; v <= v1; v++) if (v % 2 === 0) { k.put(-1, -1, -1, -1, v, v, B.PLANKS_DARK); k.put(1, 1, -1, -1, v, v, B.PLANKS_DARK); }
    lamps(k, 'v', 0, v0 + 2, v1, 8, 4, -1);
    // gold flecks in the walls
    for (let i = 0; i < 9; i++) { const su = k.r() < 0.5 ? -3 : 3, v = k.rint(v0 + 2, v1), l = k.rint(0, 3); k.solid(su, su, l, l, v, v, B.GOLD); }
    // the first collapse in the gallery: a heap with a gap to climb over
    k.rubble(0, v0 + 20, 2.6);
    // drift A to the left at v0+10: ends in a store room with a chest
    const dA = v0 + 12;
    pass(k, 'u', dA, -17, -3, { w: 3, h: 5, tag: 'drift' });
    for (let u = -5; u >= -16; u -= 4) { k.put(u, u, 0, 3, dA - 1, dA - 1, B.PLANKS_DARK); k.put(u, u, 0, 3, dA + 1, dA + 1, B.PLANKS_DARK); k.put(u, u, 4, 4, dA - 1, dA + 1, B.PLANKS_DARK); }
    room(k, -23, -16, dA - 4, dA + 4, 6, { tag: 'store' });
    k.put(-22, -21, 0, 1, dA + 3, dA + 4, B.PLANKS_DARK); k.put(-22, -22, 2, 2, dA + 3, dA + 3, B.PLANKS); // (a stack of crates)
    k.put(-18, -18, 0, 0, dA - 3, dA - 3, B.HAY);
    k.chest(-20, dA, 1, 0, 0, 'store');
    // drift B to the right at v0+26: a cave-in, a pick on the floor, then a dead end with a chest
    const dB = v0 + 28;
    pass(k, 'u', dB, 3, 15, { w: 3, h: 5, tag: 'drift' });
    k.rubble(8, dB, 1.4);
    room(k, 16, 24, dB - 4, dB + 4, 6, { tag: 'dead end' });
    k.put(18, 18, 0, 3, dB - 4, dB - 4, B.PLANKS_DARK); k.put(18, 18, 4, 4, dB - 4, dB + 4, B.PLANKS_DARK);
    k.chest(22, dB + 2, -1, 0, 0, 'drift');
    // the face at the end: a wide chamber, a pit of broken rock, a cart, a lamp
    room(k, -6, 6, v1 + 1, v1 + 10, 7, { tag: 'face' });
    k.rubble(-3, v1 + 6, 2.6); k.rubble(4, v1 + 9, 1.8);
    for (let i = 0; i < 7; i++) { const su = k.r() < 0.5 ? -7 : 7, v = k.rint(v1 + 2, v1 + 9), l = k.rint(0, 4); k.solid(su, su, l, l, v, v, B.GOLD); }
    k.put(3, 5, 0, 0, v1 + 2, v1 + 4, B.PLANKS_DARK); k.put(3, 5, 1, 1, v1 + 2, v1 + 2, B.PLANKS_DARK); k.put(3, 5, 1, 1, v1 + 4, v1 + 4, B.PLANKS_DARK); // (the cart)
    lamp(k, -6, v1 + 3, 3); lamp(k, 6, v1 + 8, 3);
    k.chest(0, v1 + 8, 0, -1, 0, 'face');
    // a third spot for a larger store: a side niche off the gallery at the right, v0+36
    room(k, 3, 9, v0 + 36, v0 + 40, 6, { tag: 'niche' });
    k.air(2, 2, 0, 4, v0 + 37, v0 + 39);
    k.chest(7, v0 + 38, -1, 0, 0, 'niche');
}

/** Crypt (small): a stair to a vaulted nave of pillars and burial niches, an altar at its end, two side chambers. */
function buildCrypt(k, K) {
    const B = BLOCK, d = K.depth, RUN = stair(k, d, B.CS_DARK);
    facade(k, d, 'crypt');
    // antechamber with a pair of braziers and the bars of an old gate
    room(k, -3, 3, RUN, RUN + 6, 7, { tag: 'antechamber' });
    for (const su of [-3, 3]) { k.put(su, su, 0, 0, RUN + 1, RUN + 1, B.CS_DARK); k.put(su, su, 1, 1, RUN + 1, RUN + 1, B.LANTERN); }
    // the nave: 9 wide, 8 high vault, two rows of pillars, niches in the long walls
    const n0 = RUN + 9, n1 = n0 + 22;
    pass(k, 'v', 0, RUN + 7, n0 - 1, { w: 3, h: 6, tag: 'door' });
    room(k, -4, 4, n0, n1, 8, { tag: 'nave' });
    for (let v = n0 + 3; v <= n1 - 3; v += 4) for (const su of [-2, 2]) { k.put(su, su, 0, 0, v, v, B.CS_DARK); k.put(su, su, 1, 5, v, v, B.CS_GREY); k.put(su, su, 6, 6, v, v, B.CS_DARK); }
    niches(k, 'v', -5, -1, n0 + 2, n1 - 3, 5);
    niches(k, 'v', 5, 1, n0 + 2, n1 - 3, 5);
    for (let v = n0 + 4; v <= n1 - 4; v += 8) { lamp(k, -4, v, 4); lamp(k, 4, v, 4); }
    // two coffins in the open, one lid slid aside
    sarcophagus(k, -1, n0 + 7, true); sarcophagus(k, 0, n0 + 14, true, true);
    k.put(1, 1, 2, 2, n0 + 7, n0 + 7, B.CS_WHITE);
    k.rubble(2, n0 + 11, 1.6); k.bush(0, n0 + 2, 0.4);
    // the altar at the end: steps, a block of stone with books, a lamp each side
    room(k, -3, 3, n1 + 1, n1 + 6, 8, { tag: 'altar' });
    k.put(-3, 3, 0, 0, n1 + 4, n1 + 6, B.CS_GREY); k.put(-2, 2, 1, 1, n1 + 5, n1 + 6, B.CS_WHITE); k.put(-1, 1, 2, 2, n1 + 6, n1 + 6, B.BOOKS);
    for (const su of [-3, 3]) { k.put(su, su, 1, 1, n1 + 4, n1 + 4, B.CS_DARK); k.put(su, su, 2, 2, n1 + 4, n1 + 4, B.LANTERN); }
    k.chest(0, n1 + 3, 0, -1, 0, 'altar');
    // a chamber each side, reached through the niche wall by a doorway
    const sv = n0 + 9;
    room(k, -14, -8, sv - 3, sv + 3, 7, { tag: 'chamber' });
    pass(k, 'u', sv, -7, -5, { w: 3, h: 5, tag: 'door' });
    sarcophagus(k, -13, sv - 2, true); k.rubble(-9, sv + 2, 1.3);
    k.chest(-9, sv, 1, 0, 0, 'chamber');
    const sv2 = n0 + 16;
    room(k, 8, 14, sv2 - 3, sv2 + 3, 7, { tag: 'chamber' });
    pass(k, 'u', sv2, 5, 7, { w: 3, h: 5, tag: 'door' });
    sarcophagus(k, 12, sv2 - 2, true);
    k.chest(9, sv2 + 1, -1, 0, 0, 'chamber');
}

/** Passage (small): a winding corridor with turns, small cells off it and a secret room at the end. */
function buildPassage(k, K) {
    const B = BLOCK, d = K.depth, RUN = stair(k, d, B.CS_MOSSY);
    facade(k, d, 'passage');
    // landing room, then a corridor that bends: v → −u → v → +u → v
    room(k, -3, 3, RUN, RUN + 4, 6, { tag: 'landing' });
    pass(k, 'v', 0, RUN + 5, RUN + 16, { tag: 'corridor' });
    pass(k, 'u', RUN + 17, -14, 1, { tag: 'corridor' });
    pass(k, 'v', -14, RUN + 18, RUN + 32, { tag: 'corridor' });
    pass(k, 'u', RUN + 33, -14, 12, { tag: 'corridor' });
    pass(k, 'v', 12, RUN + 34, RUN + 44, { tag: 'corridor' });
    lamps(k, 'v', 0, RUN + 5, RUN + 16, 6, 3);
    lamps(k, 'v', -14, RUN + 18, RUN + 32, 7, 3);
    lamps(k, 'u', RUN + 33, -12, 12, 8, 3);
    // cells off the corridors
    room(k, 3, 10, RUN + 9, RUN + 15, 6, { tag: 'cell' });
    pass(k, 'u', RUN + 12, 1, 2, { tag: 'door' });
    k.put(5, 9, 0, 0, RUN + 14, RUN + 14, B.PLANKS_DARK); k.put(5, 5, 1, 1, RUN + 14, RUN + 14, B.PLANKS_DARK); k.rubble(8, RUN + 10, 1.2);
    k.chest(7, RUN + 12, -1, 0, 0, 'cell');
    room(k, -23, -17, RUN + 22, RUN + 28, 6, { tag: 'cell' });
    pass(k, 'u', RUN + 25, -16, -15, { tag: 'door' });
    k.put(-22, -22, 0, 1, RUN + 23, RUN + 24, B.PLANKS_DARK); k.put(-22, -21, 0, 0, RUN + 27, RUN + 28, B.HAY); k.bush(-19, RUN + 24, 0.3);
    k.chest(-20, RUN + 25, 1, 0, 0, 'cell');
    // a room with an old well-shaft at the bend, rubble and pillars
    room(k, 14, 22, RUN + 29, RUN + 37, 6, { tag: 'hall' });
    pass(k, 'u', RUN + 33, 13, 14, { tag: 'door' });
    for (const [u, v] of [[16, RUN + 31], [20, RUN + 31], [16, RUN + 35], [20, RUN + 35]]) { k.put(u, u, 0, 0, v, v, B.CS_DARK); k.put(u, u, 1, 4, v, v, B.CS_GREY); }
    k.rubble(18, RUN + 33, 1.8);
    // the way ends at a bricked-up bay and a secret room behind a gap
    room(k, 8, 16, RUN + 45, RUN + 54, 7, { tag: 'secret' });
    pass(k, 'v', 12, RUN + 45, RUN + 45, { tag: 'door' });
    k.put(10, 14, 0, 0, RUN + 51, RUN + 53, B.CS_GREY); k.put(11, 13, 1, 1, RUN + 52, RUN + 53, B.CS_WHITE); k.put(12, 12, 2, 2, RUN + 53, RUN + 53, B.BOOKS);
    lamp(k, 8, RUN + 47, 3); lamp(k, 16, RUN + 47, 3);
    k.chest(12, RUN + 49, 0, -1, 0, 'secret');
}

/** Tomb (middling): a long entrance corridor, an antechamber of statues, the great hall of pillars with sarcophagi, two treasuries, the burial chamber. */
function buildTomb(k, K) {
    const B = BLOCK, d = K.depth, RUN = stair(k, d, B.CS_SAND);
    facade(k, d, 'tomb');
    const a0 = RUN;
    // the entrance passage with painted... niches and braziers
    pass(k, 'v', 0, a0, a0 + 10, { w: 5, h: 7, tag: 'passage' });
    for (let v = a0 + 2; v <= a0 + 9; v += 4) { lamp(k, -2, v, 4); lamp(k, 2, v, 4); }
    niches(k, 'v', -3, -1, a0 + 2, a0 + 8, 4);
    niches(k, 'v', 3, 1, a0 + 2, a0 + 8, 4);
    // the antechamber: statues (a pedestal, a body, a head of white stone) in the corners, a floor pattern in gold
    const b0 = a0 + 11, b1 = b0 + 10;
    room(k, -6, 6, b0, b1, 9, { tag: 'antechamber' });
    for (const [u, v] of [[-5, b0 + 1], [5, b0 + 1], [-5, b1 - 1], [5, b1 - 1]]) { k.put(u, u, 0, 1, v, v, B.CS_DARK); k.put(u, u, 2, 5, v, v, B.CS_WHITE); k.put(u, u, 6, 6, v, v, B.CS_SAND); lamp(k, u > 0 ? u - 1 : u + 1, v, 3); }
    k.put(-1, 1, -1, -1, b0 + 4, b0 + 6, B.GOLD); k.put(0, 0, -1, -1, b0 + 2, b1 - 2, B.CS_WHITE); k.put(-3, 3, -1, -1, b0 + 5, b0 + 5, B.CS_WHITE);
    k.rubble(4, b0 + 7, 1.6);
    // the great hall: 15 wide, 29 long, 9 high; pillar rows; sarcophagi between them; a dais at the end
    const c0 = b1 + 6, c1 = c0 + 28;
    pass(k, 'v', 0, b1 + 1, c0 - 1, { w: 5, h: 8, tag: 'gate' });
    room(k, -7, 7, c0, c1, 10, { tag: 'hall' });
    for (let v = c0 + 3; v <= c1 - 4; v += 5) for (const su of [-4, 4]) {
        k.put(su - 1, su + 1, 0, 0, v - 1, v + 1, B.CS_DARK); k.put(su, su, 1, 7, v, v, k.r() < 0.1 ? B.CS_GREY : B.CS_SAND); k.put(su - 1, su + 1, 8, 8, v - 1, v + 1, B.CS_DARK);
    }
    for (let v = c0 + 2; v <= c1 - 6; v += 6) { sarcophagus(k, -6, v, true); sarcophagus(k, 5, v + 1, true, v % 12 === 0); }
    for (let v = c0 + 5; v <= c1 - 4; v += 8) { lamp(k, -7, v, 5); lamp(k, 7, v, 5); }
    k.rubble(0, c0 + 12, 2.4); k.rubble(-3, c0 + 20, 1.6);
    for (let v = c0 + 1; v <= c1 - 1; v++) if (v % 2 === 0) k.put(0, 0, -1, -1, v, v, B.GOLD);
    // two treasuries, off the hall's sides by short passages
    const t0 = c0 + 7;
    pass(k, 'u', t0 + 4, -15, -8, { w: 5, h: 7, tag: 'door' });
    room(k, -23, -15, t0, t0 + 8, 8, { tag: 'treasury' });
    k.put(-22, -20, 0, 0, t0 + 1, t0 + 2, B.GOLD); k.put(-22, -21, 1, 1, t0 + 1, t0 + 1, B.GOLD); k.put(-17, -16, 0, 1, t0 + 7, t0 + 8, B.CS_WHITE);
    lamp(k, -23, t0 + 4, 4);
    k.chest(-19, t0 + 5, 1, 0, 0, 'treasury');
    const t1 = c0 + 17;
    pass(k, 'u', t1 + 4, 8, 15, { w: 5, h: 7, tag: 'door' });
    room(k, 16, 24, t1, t1 + 8, 8, { tag: 'treasury' });
    k.put(18, 22, 0, 0, t1 + 1, t1 + 1, B.GOLD); k.put(22, 24, 0, 1, t1 + 7, t1 + 8, B.CS_WHITE); k.rubble(20, t1 + 3, 1.4);
    lamp(k, 24, t1 + 4, 4);
    k.chest(20, t1 + 5, -1, 0, 0, 'treasury');
    // a hidden niche in the antechamber's side wall
    room(k, 8, 12, b0 + 3, b0 + 7, 7, { tag: 'niche' });
    pass(k, 'u', b0 + 5, 7, 7, { w: 3, h: 5, tag: 'door' });
    k.chest(10, b0 + 5, -1, 0, 0, 'niche');
    // the burial chamber at the end: steps up to a dais, the great sarcophagus gilded, braziers
    const d0 = c1 + 4, d1 = d0 + 11;
    pass(k, 'v', 0, c1 + 1, d0 - 1, { w: 5, h: 8, tag: 'gate' });
    room(k, -6, 6, d0, d1, 10, { tag: 'burial' });
    k.put(-4, 4, 0, 0, d0 + 5, d1, B.CS_WHITE); k.put(-3, 3, 1, 1, d0 + 7, d1, B.CS_WHITE); k.put(-1, 1, 2, 3, d0 + 8, d0 + 10, B.CS_WHITE); k.put(-1, 1, 4, 4, d0 + 8, d0 + 10, B.GOLD);
    for (const su of [-5, 5]) { k.put(su, su, 0, 2, d0 + 1, d0 + 1, B.CS_DARK); k.put(su, su, 3, 3, d0 + 1, d0 + 1, B.LANTERN); }
    k.chest(-4, d0 + 3, 1, 0, 0, 'burial');
    k.chest(4, d0 + 3, -1, 0, 0, 'burial');
}

/** Catacombs (middling): a grid of passages lined with burial niches, ossuaries, a chapel at the far end, cells with chests. */
function buildCatacombs(k, K) {
    const B = BLOCK, d = K.depth, RUN = stair(k, d, B.CS_DARK);
    facade(k, d, 'catacombs');
    const hall0 = RUN;
    room(k, -5, 5, hall0, hall0 + 8, 8, { tag: 'hall' });
    for (const [u, v] of [[-4, hall0 + 1], [4, hall0 + 1], [-4, hall0 + 7], [4, hall0 + 7]]) { k.put(u, u, 0, 0, v, v, B.CS_DARK); k.put(u, u, 1, 3, v, v, B.CS_WHITE); k.put(u, u, 4, 4, v, v, B.LANTERN); }
    // the spine, 3 wide, and three cross passages
    const sp0 = hall0 + 9, sp1 = sp0 + 56;
    pass(k, 'v', 0, sp0, sp1, { tag: 'spine' });
    const xs = [sp0 + 8, sp0 + 24, sp0 + 40];
    for (const x of xs) pass(k, 'u', x, -26, 26, { tag: 'cross' });
    for (const x of xs) { niches(k, 'u', x - 2, -1, -24, -3, 4); niches(k, 'u', x + 2, 1, -24, -3, 4); niches(k, 'u', x - 2, -1, 4, 24, 4); niches(k, 'u', x + 2, 1, 4, 24, 4); }
    niches(k, 'v', -2, -1, sp0 + 1, sp1 - 1, 6);
    niches(k, 'v', 2, 1, sp0 + 1, sp1 - 1, 6);
    lamps(k, 'v', 0, sp0, sp1, 8, 3);
    for (const x of xs) lamps(k, 'u', x, -24, 24, 9, 3);
    // collapses and a heap of old bones (white and grey stone) here and there
    k.rubble(0, sp0 + 16, 2.4); k.rubble(14, xs[1], 1.6); k.rubble(-20, xs[0], 1.4);
    for (const [u, v] of [[-10, xs[0] + 1], [10, xs[2] - 1], [0, sp0 + 30]]) k.put(u, u + 1, 0, 0, v, v + 1, B.CS_WHITE);
    // ossuary chambers at the ends of the first and the last cross passages
    room(k, -28, -21, xs[0] - 4, xs[0] + 4, 7, { tag: 'ossuary' });
    pass(k, 'u', xs[0], -26, -22, { tag: 'door' });
    for (let i = 0; i < 12; i++) { const u = k.rint(-27, -22), v = xs[0] + k.rint(-3, 3); k.put(u, u, 0, k.rint(0, 1), v, v, k.r() < 0.7 ? B.CS_WHITE : B.CS_GREY); } // (a heap of old bones)
    k.chest(-24, xs[0] + 3, 1, 0, 0, 'ossuary');
    room(k, 22, 28, xs[2] - 4, xs[2] + 4, 7, { tag: 'cell' });
    k.put(24, 26, 0, 0, xs[2] - 3, xs[2] - 3, B.PLANKS_DARK); k.put(24, 24, 1, 1, xs[2] - 3, xs[2] - 3, B.PLANKS_DARK);
    k.chest(25, xs[2] + 1, -1, 0, 0, 'cell');
    room(k, 22, 28, xs[1] - 3, xs[1] + 3, 7, { tag: 'cell' });
    k.chest(25, xs[1] + 1, -1, 0, 0, 'cell');
    // the chapel at the end: round, a dome, an altar and four pillars, rows of old benches
    const cu = 0, cv = sp1 + 9;
    cavern(k, cu, cv, 8, 10, { tag: 'chapel' });
    pass(k, 'v', 0, sp1 + 1, sp1 + 2, { tag: 'door' });
    k.cylP(cu, cv, 2.2, 0, 0, B.CS_GREY); k.put(-1, 1, 1, 1, cv + 5, cv + 5, B.CS_WHITE); k.put(-1, 1, 1, 1, cv + 6, cv + 6, B.BOOKS);
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.78, u = Math.round(cu + Math.cos(a) * 5), v = Math.round(cv + Math.sin(a) * 5); k.put(u, u, 0, 6, v, v, B.CS_GREY); lamp(k, u, v, 7); }
    for (const [u, v] of [[-3, cv - 5], [3, cv - 5], [-3, cv - 3], [3, cv - 3]]) k.put(u, u, 0, 0, v, v, B.PLANKS_DARK);
    k.chest(5, cv - 1, -1, 0, 0, 'chapel');
    k.chest(-5, cv + 2, 1, 0, 0, 'chapel');
}

/** Cave temple (middling): a rough cave passage into a great round cavern with a ring of pillars, an altar and a rune circle, side chapels. */
function buildCaveTemple(k, K) {
    const B = BLOCK, d = K.depth, RUN = stair(k, d, B.ARCANE_DARK);
    facade(k, d, 'cavetemple');
    // the winding passage: overlapping caverns of different radius, 5 wide and more
    const pts = [[0, RUN + 4, 4], [-2, RUN + 11, 3.4], [3, RUN + 18, 4], [0, RUN + 25, 3.6], [-3, RUN + 31, 3.4]];
    room(k, -2, 2, RUN, RUN + 3, 7, { tag: 'passage' });
    for (const [u, v, r] of pts) cavern(k, u, v, r, 7, { tag: 'passage' });
    for (let i = 0; i < pts.length - 1; i++) {
        const [u0, v0] = pts[i], [u1, v1] = pts[i + 1];
        for (let t = 0; t <= 1; t += 0.2) cavern(k, Math.round(u0 + (u1 - u0) * t), Math.round(v0 + (v1 - v0) * t), 2.6, 6, { tag: 'passage' });
    }
    for (const [u, v] of pts) { lamp(k, u + 3, v, 3); k.put(u - 3, u - 3, 0, 2, v, v, B.ARCANE_DARK); }
    k.rubble(1, RUN + 14, 1.8);
    // the cavern
    const cu = 0, cv = RUN + 52, R = 15, H = 14;
    for (let t = 0; t <= 1; t += 0.14) cavern(k, Math.round(-3 + (cu + 3) * t), Math.round(RUN + 31 + (cv - R + 3 - RUN - 31) * t), 2.6, 6, { tag: 'passage' });
    cavern(k, cu, cv, R, H, { tag: 'cavern' });
    // the rune circle in the floor, the altar platform in the middle (steps), eight pillars with violet lamps
    k.cylP(cu, cv, 10, -1, -1, B.ARCANE_DARK, 8.4);
    k.cylP(cu, cv, 7.5, -1, -1, B.RUNE, 6.5);
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12, u = Math.round(cu + Math.cos(a) * 9.2), v = Math.round(cv + Math.sin(a) * 9.2); k.put(u, u, -1, -1, v, v, B.RUNE); }
    k.cylP(cu, cv, 4.2, 0, 0, B.ARCANE_DARK); k.cylP(cu, cv, 3, 1, 1, B.ARCANE); k.cylP(cu, cv, 1.6, 2, 2, B.ARCANE_DARK);
    k.put(cu, cu, 3, 3, cv, cv, B.BOOKS); k.put(cu, cu, 4, 4, cv, cv, B.ARCANE_LAMP_VIOLET);
    for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + 0.4, u = Math.round(cu + Math.cos(a) * 11.5), v = Math.round(cv + Math.sin(a) * 11.5);
        const snapped = k.r() < 0.25, h = snapped ? k.rint(2, 5) : 9;
        k.put(u, u, 0, h, v, v, i % 2 ? B.ARCANE_DARK : B.CS_DARK);
        if (!snapped) k.put(u, u, h + 1, h + 1, v, v, B.ARCANE_LAMP_VIOLET); else k.rubble(u + 1, v, 1.2);
    }
    // crystals of light on the cave wall
    for (let i = 0; i < 10; i++) { const a = k.r() * TAU, l = k.rint(2, 7), f = Math.sqrt(Math.max(0.05, 1 - Math.pow((l - 1) / (H - 1.5), 2))); const u = Math.round(cu + Math.cos(a) * (R * f + 1)), v = Math.round(cv + Math.sin(a) * (R * f + 1)); k.solid(u, u, l, l, v, v, B.ARCANE_LAMP_VIOLET); }
    k.chest(cu - 6, cv - 9, 0, 1, 0, 'cavern');
    k.chest(cu + 6, cv - 9, 0, 1, 0, 'cavern');
    // two side chapels, each a round room off the cavern by a short passage
    cavern(k, -23, cv, 5, 8, { tag: 'chapel' });
    pass(k, 'u', cv, -19, -15, { tag: 'door' });
    k.put(-24, -22, 0, 0, cv - 1, cv + 1, B.ARCANE_DARK); k.put(-23, -23, 1, 1, cv, cv, B.ARCANE); lamp(k, -23, cv + 3, 3);
    k.chest(-20, cv + 2, 1, 0, 0, 'chapel');
    cavern(k, 23, cv + 6, 5, 8, { tag: 'chapel' });
    pass(k, 'u', cv + 6, 15, 19, { tag: 'door' });
    k.put(22, 24, 0, 0, cv + 5, cv + 7, B.ARCANE_DARK); lamp(k, 23, cv + 9, 3); k.rubble(21, cv + 3, 1.2);
    k.chest(26, cv + 6, -1, 0, 0, 'chapel');
    // a hidden crypt behind the cavern: a cell that holds a lone chest
    cavern(k, 0, cv + 24, 4.2, 7, { tag: 'hidden' });
    pass(k, 'v', 0, cv + 15, cv + 19, { tag: 'door' });
    k.chest(0, cv + 22, 0, -1, 0, 'hidden');
}

const UNDER_BUILDERS = { mine: buildMine, crypt: buildCrypt, passage: buildPassage, tomb: buildTomb, catacombs: buildCatacombs, cavetemple: buildCaveTemple };

// ------------------------------------------------------------------ entry
const THEME_OF = { mine: 'mine', crypt: 'crypt', passage: 'crypt', tomb: 'tomb', catacombs: 'crypt', cavetemple: 'temple' };

/**
 * Build a dungeon site (Dungeons.DungeonSite): {parts, chests, entrance, rooms}.
 * `chests` are in the cave chests' shape ({x, y, z, a}) plus the kind's `look`, the ground ones' `flavor`.
 */
export function buildDungeon(site) {
    const K = KINDS[site.type];
    const T = themes();
    const p = new Plan(site.x, site.z, site.F, site.rot);
    const rng = createRng((site.seed ^ 0x51ed27) >>> 0);
    rng();
    const theme = K.under ? T[THEME_OF[site.type]] : T[K.magic ? 'magic' : 'ruin'];
    const k = new Kit(p, rng, theme, K.under, site.want);
    (K.under ? UNDER_BUILDERS : RUIN_BUILDERS)[site.type](k, K);
    k.flush();
    for (const c of k.chests) { c.look = K.look; if (K.flavor) c.flavor = K.flavor; c.dungeon = site.id; }
    const e = K.under ? p.pt(0, -9, site.land - site.F) : p.pt(0, -K.zone + 1, 0);
    const entrance = { x: e.x, z: e.z, y: e.y };
    return { parts: p.parts, chests: k.chests, entrance, rooms: k.rooms };
}

export { DUNGEON };
