/**
 * ShipLayout.js — the inside of a ship, in ship-local metres (pure, Node-testable).
 *
 * Ship-local axes: x = starboard, y = up from the waterline, z = aft (the bow is −z).
 * A layout says where you can stand (floors and stair ramps), what stops a body
 * (masts, bulkheads with door gaps, the wheel, cannons, chests, the breastwork rails),
 * where the sails hang, where the wheel, the gangways, the rope ladders, the cabins,
 * the chests, the cannons and the shot racks are, and the walking graph of the crew.
 * The hull's own shell (bulwarks 2.4 m above each deck) comes from hullHalfWidth.
 */

import { SHIP_CLASSES, RAIL } from './ShipTypes.js';

const DOOR_HALF = 1.6; // door gaps 3.2 wide
const DOOR_H = 5.5;
const STAIR_SLOPE = 1.25; // metres of stair per metre of height (a steep ship's stair)
const STAIR_HALF = 1.2;

/** Half the hull's width at (lz, ly): the plan narrows to the bow and to a transom at the stern; the section rounds to the keel. */
export function hullHalfWidth(L, lz, ly) {
    const t = (2 * lz) / L.L;
    if (t < -1 || t > 1) return 0;
    const half = L.B / 2;
    const plan = t < 0 ? half * (1 - Math.pow(-t, 2.2)) : half * (1 - 0.4 * Math.pow(t, 4));
    if (ly >= 0) return plan * (1 - 0.08 * ly / L.deck);
    const keel = keelY(L, lz);
    if (ly <= keel) return 0;
    const s = ly / keel; // 0 at the waterline, 1 at the keel
    return plan * Math.pow(Math.max(0, 1 - s * s), 0.4);
}

/** The keel's height (negative) at lz: it rises a little to the ends. */
export function keelY(L, lz) {
    const t = (2 * lz) / L.L;
    return -L.draft * (1 - 0.4 * Math.pow(Math.min(1, Math.abs(t)), 4));
}

/** The z range of a deck at height y where its half width stays at least `minHalf`. */
function deckSpan(L, y, minHalf, z0 = -L.L / 2, z1 = L.L / 2) {
    let a = z0, b = z1;
    while (a < b && hullHalfWidth(L, a, y) - 0.2 < minHalf) a += 0.25;
    while (b > a && hullHalfWidth(L, b, y) - 0.2 < minHalf) b -= 0.25;
    return [a, b];
}

const CACHE = new Map();

/** The layout of a ship class (built once per class; read-only). */
export function buildLayout(clsId) {
    const C = typeof clsId === 'string' ? SHIP_CLASSES[clsId] : clsId;
    if (!CACHE.has(C.id)) CACHE.set(C.id, makeLayout(C));
    return CACHE.get(C.id);
}

function makeLayout(C) {
    const L = { cls: C.id, ru: C.ru, L: C.L, B: C.B, draft: C.draft, deck: C.deck, rail: RAIL };
    L.hullHalfWidth = (lz, ly) => hullHalfWidth(L, lz, ly);
    const hw = L.hullHalfWidth;
    const D = C.deck, Q = C.quarter;
    const floors = [], ramps = [], solids = [], rooms = [], chests = [], cannons = [], racks = [];
    const stern = L.L / 2 - 0.4;

    // -------------------------------------------------------------- floors
    const [mz0, mz1] = deckSpan(L, D, 0.8);
    const main = { id: 'main', name: 'Палуба', y: D, z0: mz0, z1: Math.min(mz1, stern), holes: [] };
    floors.push(main);
    let lower = null;
    if (C.lower != null) {
        const [lz0, lz1] = deckSpan(L, C.lower, 2);
        lower = { id: 'lower', name: 'Нижняя палуба', y: C.lower, z0: lz0, z1: Math.min(lz1, stern - 1), holes: [] };
        floors.push(lower);
    }
    const quarter = { id: 'quarter', name: 'Ют', y: Q.y, z0: Q.z0, z1: Math.min(Q.z1, stern), holes: [] };
    floors.push(quarter);
    let poop = null;
    if (C.poop) { poop = { id: 'poop', name: 'Полуют', y: C.poop.y, z0: C.poop.z0, z1: Math.min(C.poop.z1, stern), holes: [] }; floors.push(poop); }
    let fore = null;
    if (C.fore) {
        const [fz0] = deckSpan(L, C.fore.y, 0.8);
        fore = { id: 'fore', name: 'Бак', y: C.fore.y, z0: Math.max(C.fore.z0, fz0), z1: C.fore.z1, holes: [] };
        floors.push(fore);
    }
    for (const f of floors) f.halfAt = (lz) => hw(lz, f.y) - 0.2;

    // ------------------------------------------------- stairs and the hatch
    const up = (fromY, toY, zTop, dir, tag) => {
        // two stairs (port and starboard) from fromY up to toY, reaching the higher deck at zTop;
        // dir = -1: the low end is forward of zTop, +1: aft of it; against the sides, clear of the masts
        const run = (toY - fromY) * STAIR_SLOPE;
        let x = Infinity;
        for (let k = 0; k <= 4; k++) x = Math.min(x, hw(zTop + dir * run * k / 4, fromY) - 0.4 - STAIR_HALF - 0.4);
        x = Math.max(2.3, x);
        for (const s of [-1, 1]) ramps.push({ id: tag + (s > 0 ? ':s' : ':p'), ax: s * x, ay: fromY, az: zTop + dir * run, bx: s * x, by: toY, bz: zTop, half: STAIR_HALF });
        return { x, run };
    };
    const qStairs = up(D, Q.y, Q.z0, -1, 'quarter');
    let pStairs = null;
    if (poop) pStairs = up(Q.y, poop.y, poop.z0, -1, 'poop');
    let fStairs = null;
    if (fore) fStairs = up(D, fore.y, fore.z1, +1, 'fore');
    let hatch = null;
    if (lower) {
        const run = (D - lower.y) * STAIR_SLOPE;
        const fm = C.masts[0].z;
        const hz = fm + 3;
        hatch = { z0: hz, z1: hz + run, half: 1.4 };
        ramps.push({ id: 'hatch', ax: 0, ay: D, az: hz, bx: 0, by: lower.y, bz: hz + run, half: 1.4 });
        main.holes.push({ x0: -1.6, x1: 1.6, z0: hz + 0.6, z1: hz + run + 0.3 });
        // the hatch's coaming round the hole (open only where the stair comes up)
        for (const sd of [-1, 1]) solids.push({ x0: sd > 0 ? 1.6 : -1.85, x1: sd > 0 ? 1.85 : -1.6, y0: D, y1: D + 0.9, z0: hz + 0.6, z1: hz + run + 0.55, kind: 'coaming' });
        solids.push({ x0: -1.85, x1: 1.85, y0: D, y1: D + 0.9, z0: hz + run + 0.3, z1: hz + run + 0.55, kind: 'coaming' });
    }

    // -------------------------------------------------- bulkheads and rails
    const wallWithDoor = (z0, z1, y0, y1, kind, gaps = [[-DOOR_HALF, DOOR_HALF]]) => {
        const w = Math.max(hw(z0, y0), hw(z1, y0));
        const cuts = gaps.slice().sort((a, b) => a[0] - b[0]);
        let x = -w;
        for (const [g0, g1] of cuts) {
            if (g0 > x) solids.push({ x0: x, x1: g0, y0, y1, z0, z1, kind });
            x = Math.max(x, g1);
        }
        if (x < w) solids.push({ x0: x, x1: w, y0, y1, z0, z1, kind });
    };
    // the doors in the bulkheads' doorways (Ships.js hangs a pair of leaves in each: Doors.js opens them by hand)
    const doors = [];
    const doorIn = (id, z0, z1, y0, y1) => doors.push({ id, x: 0, y: y0, z: (z0 + z1) / 2, z0, z1, half: DOOR_HALF, h: y1 - y0 - 0.05 });
    const stairGap = (st) => [[-st.x - STAIR_HALF - 0.1, -st.x + STAIR_HALF + 0.1], [st.x - STAIR_HALF - 0.1, st.x + STAIR_HALF + 0.1]];
    // the captain's cabin under the quarterdeck: a bulkhead with a door; the quarterdeck's front rail with gaps at the stairs
    wallWithDoor(Q.z0, Q.z0 + 0.4, D, Q.y, 'bulkhead', [[-DOOR_HALF, DOOR_HALF], ...stairGap(qStairs)]);
    doorIn('cabin', Q.z0, Q.z0 + 0.4, D, Q.y);
    wallWithDoor(Q.z0, Q.z0 + 0.3, Q.y, Q.y + 1.2, 'breastwork', stairGap(qStairs));
    rooms.push({ name: 'Каюта капитана', id: 'captain', x0: -hw(Q.z0, D), x1: hw(Q.z0, D), z0: Q.z0 + 0.4, z1: stern, y: D, top: Q.y });
    if (poop) {
        wallWithDoor(poop.z0, poop.z0 + 0.4, Q.y, poop.y, 'bulkhead', [[-DOOR_HALF, DOOR_HALF], ...stairGap(pStairs)]);
        doorIn('officers', poop.z0, poop.z0 + 0.4, Q.y, poop.y);
        wallWithDoor(poop.z0, poop.z0 + 0.3, poop.y, poop.y + 1.2, 'breastwork', stairGap(pStairs));
        rooms.push({ name: 'Каюта офицеров', id: 'officers', x0: -hw(poop.z0, Q.y), x1: hw(poop.z0, Q.y), z0: poop.z0 + 0.4, z1: stern, y: Q.y, top: poop.y });
    }
    if (fore) {
        wallWithDoor(fore.z1 - 0.4, fore.z1, D, fore.y, 'bulkhead', [[-DOOR_HALF, DOOR_HALF], ...stairGap(fStairs)]);
        doorIn('galley', fore.z1 - 0.4, fore.z1, D, fore.y);
        wallWithDoor(fore.z1 - 0.3, fore.z1, fore.y, fore.y + 1.2, 'breastwork', stairGap(fStairs));
        rooms.push({ name: 'Камбуз', id: 'galley', x0: -hw(fore.z1, D), x1: hw(fore.z1, D), z0: main.z0, z1: fore.z1 - 0.4, y: D, top: fore.y });
    }
    if (lower) {
        const mid = (lower.z0 + lower.z1) / 2;
        rooms.push({ name: 'Кубрик', id: 'crew', x0: -hw(mid, lower.y), x1: hw(mid, lower.y), z0: lower.z0, z1: mid, y: lower.y, top: D });
        rooms.push({ name: 'Кладовая', id: 'store', x0: -hw(mid, lower.y), x1: hw(mid, lower.y), z0: mid, z1: lower.z1, y: lower.y, top: D });
    }
    // under the stairs (the hatch's too): solid right up to the steps — a body on the deck below can't
    // walk in under a stair or poke its head through it; the low end (under 0.6 m) is just stepped onto
    for (const r of ramps) {
        const lo = Math.min(r.ay, r.by);
        const N = 10;
        for (let k = 0; k < N; k++) {
            const t0 = k / N, t1 = (k + 1) / N;
            const ya = r.ay + (r.by - r.ay) * t0, yb = r.ay + (r.by - r.ay) * t1;
            const top = Math.min(ya, yb) - 0.05;
            if (top < lo + 0.6) continue;
            const za = r.az + (r.bz - r.az) * t0, zb = r.az + (r.bz - r.az) * t1;
            solids.push({ x0: r.ax - r.half, x1: r.ax + r.half, y0: lo, y1: top, z0: Math.min(za, zb), z1: Math.max(za, zb), kind: 'stair' });
        }
    }
    // handrails on the open side of every stair (both sides down the hatch): nobody falls off a stair by a slip
    for (const r of ramps) {
        const sides = r.id === 'hatch' ? [-1, 1] : [r.ax > 0 ? -1 : 1];
        for (const sd of sides) {
            const x = r.ax + sd * (r.half + 0.08);
            for (let k = 0; k < 4; k++) {
                const t0 = k / 4, t1 = (k + 1) / 4;
                const ya = r.ay + (r.by - r.ay) * t0, yb = r.ay + (r.by - r.ay) * t1;
                const za = r.az + (r.bz - r.az) * t0, zb = r.az + (r.bz - r.az) * t1;
                solids.push({ x0: x - 0.08, x1: x + 0.08, y0: Math.min(ya, yb) - 0.3, y1: Math.max(ya, yb) + 1.2, z0: Math.min(za, zb), z1: Math.max(za, zb), kind: 'handrail' });
            }
        }
    }

    // -------------------------------------------------------------- masts
    const masts = [];
    const sails = [];
    const lowest = lower ? lower.y : D;
    for (const m of C.masts) {
        const onQuarter = m.z >= Q.z0 && m.z <= quarter.z1;
        const deckY = onQuarter ? Q.y : D;
        const top = D + m.h;
        const mast = { id: m.id, z: m.z, base: lowest, deck: deckY, top, r: 0.9, yards: [] };
        solids.push({ x0: -1, x1: 1, y0: lowest - 0.5, y1: top, z0: m.z - 1, z1: m.z + 1, kind: 'mast' });
        if (m.id === 'mizzen' && C.lateenFrac > 0) {
            // a lateen sail: a long yard slung slantwise along the ship beside the mast, its fore end
            // (the tack) low, lashed down forward of the mast, the after end high over the stern; the
            // cloth a triangle down to the clew aft, its foot above the heads at the wheel, fore-and-aft
            const w = 0.62 * m.h, ang = 0.75, x = 1.15; // (beside the mast, not through it)
            const foot = deckY + 5.6; // (well above the wheel's rim and the helmsman's raised hand — it was 4.2: the cloth touched the wheel on the small ships)
            let z0 = m.z - 0.3 * w * Math.cos(ang);
            z0 -= Math.max(0, z0 + w * Math.cos(ang) - (C.L / 2 - 1.5)); // (the high end stays over the stern)
            const tack = { x, y: foot, z: z0 }, head = { x, y: foot + w * Math.sin(ang), z: z0 + w * Math.cos(ang) };
            const clew = { x, y: foot, z: head.z - 0.6 };
            const h = head.y - foot, yy = (tack.y + head.y) / 2;
            mast.yards.push({ y: yy, w, h, kind: 'lateen' });
            sails.push({
                id: m.id + ':lateen', mast: m.id, kind: 'lateen', yardY: yy, w, h, area: 0.5 * (clew.z - tack.z) * h, tack, head, clew,
                center: { x, y: (tack.y + head.y + clew.y) / 3, z: (tack.z + head.z + clew.z) / 3 }, normal: { x: 1, y: 0, z: 0 },
            });
        } else {
            for (const [k, fy, fw, fh] of [['course', 0.42, 0.5, 0.26], ['topsail', 0.70, 0.35, 0.23]]) {
                const yy = D + fy * m.h, w = fw * m.h, h = fh * m.h;
                mast.yards.push({ y: yy, w, h, kind: 'square', sail: k });
                sails.push({ id: m.id + ':' + k, mast: m.id, kind: 'square', yardY: yy, w, h, area: w * h, center: { x: 0, y: yy - h / 2, z: m.z - 1.3 }, normal: { x: 0, y: 0, z: -1 } });
            }
        }
        masts.push(mast);
    }
    L.sailArea = sails.reduce((a, s) => a + s.area, 0);

    // -------------------------------------------------------------- the wheel
    const helmZ = C.id === 'pinnace' ? Q.z0 + 5 : Q.z0 + 3;
    const helm = { x: 0, y: Q.y + 1.9, z: helmZ, rimR: 1.45, handleR: 1.85, spokes: 8, stand: { x: 0, y: Q.y, z: helmZ + 1.5 } };
    // the helmsman's room: the body stops an arm's length behind the wheel (never pressed against
    // it: the hands reach the spokes in front of the chest, the wand at the belt stays clear of the
    // rim) — it stops bodies only, not hands, blades or blows (ShipCollision skips it for those)
    solids.push({ x0: -1.9, x1: 1.9, y0: Q.y + 0.3, y1: Q.y + 3.9, z0: helmZ + 0.3, z1: helmZ + 0.8, kind: 'helmspace' });
    solids.push({ x0: -1.9, x1: 1.9, y0: Q.y + 0.3, y1: Q.y + 3.9, z0: helmZ - 0.3, z1: helmZ + 0.3, kind: 'wheel' });
    solids.push({ x0: -0.45, x1: 0.45, y0: Q.y, y1: Q.y + 1.9, z0: helmZ - 0.5, z1: helmZ + 0.5, kind: 'wheel' });

    // ------------------------------------------------------------ the capstan
    const mainMast = C.masts.find((m) => m.id === 'main');
    const capZ = mainMast.z - 3.4;
    const capstan = { x: 0, y: D, z: capZ };
    solids.push({ x0: -1.1, x1: 1.1, y0: D, y1: D + 1.9, z0: capZ - 1.1, z1: capZ + 1.1, kind: 'capstan' });

    // ---------------------------------- along the sides: stairs, the gangway, the guns
    const busy = [[Q.z0 - qStairs.run - 0.6, L.L]];
    if (fore) busy.push([-L.L, fore.z1 + fStairs.run + 0.6]);
    const sideFree = (a, b) => busy.every(([p, q]) => b < p || a > q);
    const wide = (z, need) => hw(z, D) - 0.4 >= need;
    // run-in guns along both sides of the main deck (the widest part first, clear of the masts' chains),
    // their muzzles at the gunports in the bulwark, each with its shot rack behind it
    const mastFree = (a, b) => C.masts.every((m) => b < m.z - 2.2 || a > m.z + 2.2);
    const want = (C.masts[0].z + mainMast.z) / 2;
    const order = [];
    for (let z = main.z0 + 2; z < main.z1; z += 0.25) order.push(z);
    order.sort((p, q) => hw(q, D) - hw(p, D));
    const placeGuns = (extra) => {
        const zs = [], taken = busy.concat([extra]);
        const free2 = (a, b) => taken.every(([p, q]) => b < p || a > q);
        for (const z of order) {
            if (zs.length >= C.cannons) break;
            if (!free2(z - 0.9, z + 2.8) || !mastFree(z - 0.9, z + 2.8) || !wide(z - 0.9, 4.1) || !wide(z + 2.8, 4.1)) continue;
            zs.push(z);
            taken.push([z - 0.9, z + 2.8]);
        }
        return zs;
    };
    // the gangway (a gap in both rails, rope ladders down the sides): near the middle between the fore
    // and the main mast, where it leaves the most room for the guns
    let gangZ = want, zs = null;
    for (let d = 0; d < L.L; d += 0.5) {
        for (const z of [want + d, want - d]) {
            if (z - 2.5 < main.z0 || z + 2.5 > main.z1) continue;
            if (!sideFree(z - 2.5, z + 2.5) || !wide(z - 2, L.B * 0.32) || !wide(z + 2, L.B * 0.32)) continue;
            const g = placeGuns([z - 2.5, z + 2.5]);
            if (!zs || g.length > zs.length) { zs = g; gangZ = z; }
        }
        if (zs && zs.length >= C.cannons) break;
    }
    if (!zs) zs = placeGuns([gangZ - 2.5, gangZ + 2.5]);
    zs.sort((p, q) => p - q);
    busy.push([gangZ - 2.5, gangZ + 2.5]);
    for (const z of zs) busy.push([z - 0.9, z + 2.8]);
    const openings = [-1, 1].map((side) => ({ side, z0: gangZ - 2, z1: gangZ + 2, deck: 'main' }));
    const ladders = [-1, 1].map((side) => ({ side, z: gangZ, x: side * (hw(gangZ, D) + 0.35), top: D, bottom: -1.5, rung: 0.9 }));

    let ci = 0;
    for (const z of zs) {
        for (const side of [-1, 1]) {
            const w = hw(z, D) - 0.4;
            const id = 'g' + ci++;
            const muzzle = { x: side * (w - 0.25), y: D + 1.35, z };
            cannons.push({ id, side, x: side * (w - 1.5), y: D, z, muzzle, dir: { x: side, y: 0, z: 0 }, deck: 'main' });
            solids.push({ x0: side > 0 ? w - 2.7 : -w, x1: side > 0 ? w : -(w - 2.7), y0: D, y1: D + 1.7, z0: z - 0.85, z1: z + 0.85, kind: 'cannon' });
            const rz = z + 2.1;
            const rw = hw(rz, D) - 0.4;
            racks.push({ id: 'r' + id.slice(1), cannon: id, x: side * (rw - 0.5), y: D + 0.75, z: rz, balls: 6 });
            solids.push({ x0: side > 0 ? rw - 1.0 : -rw, x1: side > 0 ? rw : -(rw - 1.0), y0: D, y1: D + 0.7, z0: rz - 0.6, z1: rz + 0.6, kind: 'rack' });
        }
    }

    // -------------------------------------------------- cabins: furniture, chests
    const cabinZ = (Q.z0 + stern) / 2;
    solids.push({ x0: -1.6, x1: 1.6, y0: D, y1: D + 1.6, z0: cabinZ - 1.0, z1: cabinZ + 1.0, kind: 'table' });
    const chestAt = (x, y, z, yaw, room, locked) => {
        chests.push({ x, y, z, yaw, room, locked });
        const hx = (yaw === 0 || Math.abs(yaw) > 3) ? 1.9 : 1.3, hz = (yaw === 0 || Math.abs(yaw) > 3) ? 1.3 : 1.9;
        solids.push({ x0: x - hx, x1: x + hx, y0: y, y1: y + 2.3, z0: z - hz, z1: z + hz, kind: 'chest' });
    };
    // the captain's chest against the stern, its lid towards the cabin door
    chestAt(0, D, stern - 2.2, Math.PI, 'captain', 'captain');
    if (lower) {
        chestAt(hw(lower.z1 - 4, lower.y) - 2.4, lower.y, lower.z1 - 4, -Math.PI / 2, 'store', null);
        chestAt(-(hw(lower.z1 - 9, lower.y) - 2.4), lower.y, lower.z1 - 9, Math.PI / 2, 'store', null);
        // barrels in the store
        for (const s of [-1, 1]) solids.push({ x0: s > 0 ? 3.8 : -5.6, x1: s > 0 ? 5.6 : -3.8, y0: lower.y, y1: lower.y + 2.2, z0: lower.z1 - 15, z1: lower.z1 - 13, kind: 'barrel' });
    } else {
        // a pinnace: a second chest in the cabin, by the side
        chestAt(hw(cabinZ, D) - 2.0, D, cabinZ, -Math.PI / 2, 'captain', null);
    }
    if (poop) chestAt(0, Q.y, stern - 2.2, Math.PI, 'officers', null);

    // ------------------------------------------------------------ mooring bitts
    const bitts = [{ id: 'bow', x: 0, y: D, z: main.z0 + 3 }, { id: 'stern', x: 0, y: Q.y, z: stern - 1 }];

    Object.assign(L, { doors, floors, ramps, solids, openings, ladders, helm, masts, sails, bitts, rooms, chests, cannons, racks, capstan, hatch, gangZ, stern });
    L.railTopAt = (lz) => railTop(L, lz);
    buildGraph(L, C, { main, lower, quarter, poop, fore, qStairs, pStairs, fStairs, hatch, helm, capZ, gangZ });
    return L;
}

/** The top of the bulwark at lz: the highest deck there + the rail. */
export function railTop(L, lz) {
    let y = L.deck;
    for (const f of L.floors) if (f.y > y && lz >= f.z0 - 0.5 && lz <= f.z1 + 0.5) y = f.y;
    return y + L.rail;
}

function inFloor(f, lx, lz) {
    if (lz < f.z0 || lz > f.z1) return false;
    if (Math.abs(lx) > f.halfAt(lz)) return false;
    for (const h of f.holes) if (lx >= h.x0 && lx <= h.x1 && lz >= h.z0 && lz <= h.z1) return false;
    return true;
}

function rampY(r, lx, lz) {
    if (Math.abs(lx - r.ax) > r.half) return null;
    const lo = Math.min(r.az, r.bz), hi = Math.max(r.az, r.bz);
    if (lz < lo || lz > hi) return null;
    const t = (lz - r.az) / (r.bz - r.az);
    return r.ay + (r.by - r.ay) * t;
}

/** The stair (ramp) a body at (lx, ly, lz) lies or stands on — on its steps, not at its flush ends — or null. */
export function stairUnder(L, lx, ly, lz) {
    for (const r of L.ramps) {
        const y = rampY(r, lx, lz);
        if (y === null || Math.abs(y - ly) > 0.4) continue;
        if (y - Math.min(r.ay, r.by) < 0.15 || Math.max(r.ay, r.by) - y < 0.15) continue;
        return r;
    }
    return null;
}

/** The highest floor or stair surface under (lx, lz) not above reachLy (ship-local), or null. */
export function floorAt(L, lx, lz, reachLy) {
    let best = null;
    for (const f of L.floors) {
        if (f.y > reachLy + 1e-6 || (best !== null && f.y <= best)) continue;
        if (inFloor(f, lx, lz)) best = f.y;
    }
    for (const r of L.ramps) {
        const y = rampY(r, lx, lz);
        if (y === null || y > reachLy + 1e-6 || (best !== null && y <= best)) continue;
        best = y;
    }
    return best;
}

/** Which floor (object) a point stands on. */
export function floorObjAt(L, lx, lz, reachLy) {
    let best = null;
    for (const f of L.floors) if (f.y <= reachLy + 1e-6 && inFloor(f, lx, lz) && (!best || f.y > best.y)) best = f;
    return best;
}

/** The room a point is in (or null). */
export function roomAt(L, lx, ly, lz) {
    for (const r of L.rooms) if (lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1 && ly >= r.y - 0.5 && ly < r.top - 0.2) return r;
    return null;
}

/** Inside the hull's outline at deck level? */
export function insideHull(L, lx, lz) {
    return Math.abs(lx) < hullHalfWidth(L, lz, L.deck);
}

// ------------------------------------------------------------------ the crew's walking graph
function buildGraph(L, C, P) {
    const nodes = [], edges = [];
    const add = (x, y, z, tag = null) => { const id = nodes.length; nodes.push({ id, x, y, z, tag }); return id; };
    const link = (a, b) => { if (a !== b && a >= 0 && b >= 0) edges.push([a, b]); };
    // a body of radius 0.5 standing there: on that floor and not inside anything solid
    const clear = (x, y, z) => {
        if (floorAt(L, x, z, y + 0.5) !== y) return false;
        for (const b of L.solids) if (b.y1 > y + 0.6 && b.y0 < y + 3.5 && x > b.x0 - 0.5 && x < b.x1 + 0.5 && z > b.z0 - 0.5 && z < b.z1 + 0.5) return false;
        return true;
    };
    // across the main deck round the hatch (never through the hole)
    const segClear = (ax, az, bx, bz, y) => {
        for (let t = 0; t <= 1.0001; t += 0.05) if (!clear(ax + (bx - ax) * t, y, az + (bz - az) * t)) return false;
        return true;
    };
    const linkAround = (a, b) => {
        const A = nodes[a], B = nodes[b];
        if (A.y !== B.y || segClear(A.x, A.z, B.x, B.z, A.y)) { link(a, b); return; }
        const tries = [];
        for (let d = 1.5; d < 8; d += 0.5) tries.push(A.z - d, A.z + d);
        for (const h of L.floors[0].holes) tries.unshift(h.z0 - 1.2);
        for (const zc of tries) {
            if (segClear(A.x, A.z, A.x, zc, A.y) && segClear(A.x, zc, B.x, zc, A.y) && segClear(B.x, zc, B.x, B.z, A.y)) {
                const p = add(A.x, A.y, zc, null), q = add(B.x, B.y, zc, null);
                link(a, p); link(p, q); link(q, b);
                return;
            }
        }
        link(a, b);
    };
    const D = L.deck, Q = P.quarter;
    const laneX = L.B < 14 ? 1.6 : 2.3; // (a pinnace is narrow: between the masts and the guns)
    // the main deck lane (starboard of the masts and the hatch), from the bow (or the forecastle stairs) to the quarterdeck stairs
    const zA = P.fore ? P.fore.z1 + P.fStairs.run + 1 : P.main.z0 + 5;
    const zB = Q.z0 - P.qStairs.run - 1.2;
    const lane = [];
    for (let z = zA; z <= zB + 0.01; z += Math.max(2.5, (zB - zA) / Math.max(1, Math.round((zB - zA) / 4)))) lane.push(add(laneX, D, z, 'deck'));
    for (let i = 1; i < lane.length; i++) link(lane[i - 1], lane[i]);
    const nearestLane = (z) => lane.reduce((b, id) => (Math.abs(nodes[id].z - z) < Math.abs(nodes[b].z - z) ? id : b), lane[0]);
    // the gangways
    for (const side of [-1, 1]) {
        const g = add(side * (L.hullHalfWidth(P.gangZ, D) - 1.4), D, P.gangZ, 'gangway:' + (side > 0 ? '+1' : '-1'));
        const mid = add(side > 0 ? laneX : -laneX, D, P.gangZ, side > 0 ? null : 'deck');
        link(g, mid);
        linkAround(mid, nearestLane(P.gangZ));
    }
    // rigging stations by the masts on the main deck
    for (const m of L.masts) {
        if (m.deck !== D) continue;
        let at = null;
        for (const dz of [1.8, -1.8, 2.6, -2.6, 3.4, -3.4]) {
            if (clear(laneX, D, m.z + dz)) { at = m.z + dz; break; }
        }
        if (at === null) continue;
        const r = add(laneX, D, at, 'rig:' + m.id);
        link(r, nearestLane(at));
    }
    // the capstan
    const cap = add(laneX, D, P.capZ, 'capstan');
    link(cap, nearestLane(P.capZ));
    // the quarterdeck: stairs (starboard), the helm, the captain's place, aft
    const sx = P.qStairs.x;
    const sBot = add(sx, D, Q.z0 - P.qStairs.run - 0.8, null);
    link(sBot, lane[lane.length - 1]);
    const sTop = add(sx, Q.y, Q.z0 + 1.2, null);
    link(sBot, sTop);
    const helmN = add(0, Q.y, P.helm.stand.z, 'helm');
    const capt = add(2.6, Q.y, P.helm.stand.z + 2.5, 'captain');
    const aft = add(2.6, Q.y, Math.min(Q.z1 - 2.5, (P.poop ? P.poop.z0 - P.pStairs.run - 1 : Q.z1 - 2.5)), 'deck');
    const sideQ = add(2.6, Q.y, P.helm.stand.z + 0.4, null);
    link(sTop, sideQ); link(sideQ, helmN); link(sideQ, capt); link(capt, aft);
    for (const m of L.masts) if (m.deck === Q.y) { const r = add(3.0, Q.y, m.z + 1.8, 'rig:' + m.id); link(r, capt); }
    // the captain's cabin: through the door under the quarterdeck
    const doorOut = add(0.6, D, Q.z0 - 1.4, null);
    const besideMast = add(1.65, D, lane.length ? nodes[lane[lane.length - 1]].z + 0.8 : Q.z0 - 6, null);
    const besideDoor = add(1.65, D, Q.z0 - 1.4, null);
    link(lane[lane.length - 1], besideMast); link(besideMast, besideDoor); link(besideDoor, doorOut);
    const doorIn = add(0.6, D, Q.z0 + 1.6, null);
    link(doorOut, doorIn);
    const cabinZ = (Q.z0 + L.stern) / 2;
    const cab = add(-2.8, D, cabinZ - 1.8, 'cabin');
    link(doorIn, cab);
    // the bow: the lookout (on the forecastle when there is one)
    if (P.fore) {
        const fb = add(P.fStairs.x, D, P.fore.z1 + P.fStairs.run + 0.8, null);
        link(fb, lane[0]);
        const ft = add(P.fStairs.x, P.fore.y, P.fore.z1 - 1.2, null);
        link(fb, ft);
        const bow = add(0, P.fore.y, P.fore.z0 + 3, 'bow');
        const fm = add(1.6, P.fore.y, (P.fore.z0 + P.fore.z1) / 2 + 2, null);
        link(ft, fm); link(fm, bow);
    } else {
        const bow = add(0, D, P.main.z0 + 4, 'bow');
        link(bow, lane[0]);
    }
    // the hatch down to the lower deck: hammocks forward, the store aft
    if (P.lower && P.hatch) {
        const top = add(0, D, P.hatch.z0 - 0.8, 'hatch');
        const offLane = add(laneX, D, P.hatch.z0 - 0.8, null);
        link(top, offLane); link(offLane, nearestLane(P.hatch.z0 - 0.8));
        const bot = add(0, P.lower.y, P.hatch.z1 + 1.2, null);
        link(top, bot);
        const lo = P.lower;
        const hamZ = (lo.z0 + (lo.z0 + lo.z1) / 2) / 2;
        const ham1 = add(3, lo.y, hamZ, 'hammock');
        const ham2 = add(-3, lo.y, hamZ + 3, 'hammock');
        const store = add(laneX, lo.y, (lo.z1 + (lo.z0 + lo.z1) / 2) / 2, 'store');
        // (round the stair, never in under it: along the starboard lane, across forward of the hatch)
        const lmid = add(laneX, lo.y, P.hatch.z1 + 2, null);
        link(bot, lmid); link(lmid, store);
        const fz = Math.min(hamZ + 1.5, P.hatch.z0 - 1.2);
        const fwd = add(laneX, lo.y, fz, null);
        const fwdP = add(-laneX, lo.y, fz, null);
        link(lmid, fwd); link(fwd, ham1); link(fwd, fwdP); link(fwdP, ham2);
    }
    L.nodes = nodes;
    L.edges = edges;
}
