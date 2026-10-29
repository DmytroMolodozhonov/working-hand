/**
 * IceCastle.js — the Ice Queen's palace: ONE in the whole world (the author: «На всю карту будет
 * спавниться один замок — Ледяной замок… Не в виде крепости, а именно замок как у Эльзы»).
 *
 *  - Exactly one per world, from the seed alone (every computer, the worker and the host agree —
 *    in multiplayer it is the same one for everybody): on the highest summit found in a ring
 *    ICE_CASTLE.MIN…MAX m from the spawn, away from water, castles and towers. Hard to find: the
 *    minimap shows it only once a player has seen it (IceQueen.js).
 *  - The creative test ground: on the test mountain right by the pedestals (seen at once).
 *  - Its summit is levelled (landAt: the ground of the zone is its floor F, blended into the
 *    mountain round it), snow on top; then the palace of glacier ice: a podium, a grand stair with
 *    lace railings, a round hall with a vaulted cone roof and a central spire, slender spires
 *    round it, tall pointed gates (the gate leaves are doors — Doors.js), a throne of ice and a
 *    snowflake laid in the hall's floor.
 *
 * Pure and deterministic (no THREE: it runs in the terrain workers too). Its parts are the
 * castles' kind of parts (boxes k 0, cylinders k 1), built into the chunks by TerrainData.
 */

import { createRng, createNoise2D } from '../core/math.js';
import { roofShapes } from './PlanSlopes.js';

export const ICE_CASTLE = {
    MIN: 950, MAX: 1700, // m from the spawn: far, but a flight reaches it
    R: 30, BLEND: 24, // m: the levelled zone and the ring blending it into the mountain
    TEST_R: 26, TEST_BLEND: 12,
    // (the author: «где очень высоко… там, где много камня и где реально не может вырасти трава»)
    PEAK_MIN: 76, // layers: the castle's floor is never lower (above the snow line, high above the grass)
    TOP_MAX: 114, // layers: the world's ceiling is 120 — the peak stays under it
    // As in «Холодное сердце»: the palace stands on a shelf of a great jagged mountain — higher snowy peaks
    // and a cliff behind it, a gorge in front of it, and over the gorge the ice staircase (a bridge) from a
    // ledge on the other side up to the palace. (IceCastleSite.shapeAt; the stair: iceCastlePlan.)
    MOUNT: { TOP: 38, BACK: 78, E: 1.15, JAG: 16, GORGE: [3, 14], DEEP: 38, LEDGE: [15, 24], LEDGE_U: 8, LEDGE_DROP: 10, SPAN: 48, ROCK: 175, SPUR_END: 90, SPUR_FALL: 0.9 },
    TEST_PEAK: 40, // (the creative test ground: the castle on its mountain by the pedestals, a smaller peak behind)
    TEST_MOUNT: { TOP: 34, BACK: 52, E: 1.15, JAG: 9, GORGE: [3, 11], DEEP: 18, LEDGE: [12, 15], LEDGE_U: 5, LEDGE_DROP: 8, SPAN: 30, ROCK: 80, SPUR_END: 20, SPUR_FALL: 2.5 },
    HALL_R: 15, // m: the round hall (outer radius)
    PODIUM: 3, // layers: the palace stands on a podium this high above the plateau
};

/** The ice blocks' ids (Terrain.BLOCK keeps the same numbers). */
export const ICE_BLOCK = { WALL: 59, GLOW: 60, FLOOR: 61, DARK: 62 };

/**
 * The queen's ice is her own (the author: «лёд замка Королевы особенный: его можно разрушить, но он в разы более
 * плотный и устойчивый к взрывам и огню»): a blast breaks it only in the heart of the blast (BLAST: that share of
 * its radius — ~8 times less ice than other blocks), fire melts it FIRE times as fast as other ice (Terrain.removeSphere,
 * IceQueen.meltAt). The gods' «Бум» carves through it as through anything (CLAUDE.md: the gods' spells are stronger). (The ice made by «Create an Ice Castle»
 * and «Ice Bridge» is plain ice.)
 */
export const PALACE_ICE = { BLAST: 0.5, FIRE: 0.3 };

/** Is (x, z) in the queen's palace (its plan's bounds)? */
export function inIcePalace(P, x, z) {
    return !!P && x >= P.x0 - 1 && x <= P.x1 + 1 && z >= P.z0 - 1 && z <= P.z1 + 1;
}
const SNOW = 4, AIR = 0;
const TAU = Math.PI * 2;

/**
 * Where the one castle stands: {x, z, F, rot} (rot 0…3: the gates face +z, +x, −z, −x — toward the
 * spawn) or null (no fitting summit — a world of plains).
 * @param raw  the world's raw height field (raw(ix, iz) → top layer; raw.water / raw.sea after a call)
 * @param busy (x, z) → a castle / tower stands there
 * @param test the creative test ground: {x, z} where its mountain is
 */
export function iceCastleSpot(seed, raw, busy, test = null) {
    const H = (x, z) => raw(Math.round(x), Math.round(z));
    const wet = (x, z) => { raw(Math.round(x), Math.round(z)); return !!(raw.water || raw.sea); };
    const climb = (p) => {
        for (let k = 0; k < 40; k++) {
            let up = null;
            for (let a = 0; a < 8; a++) {
                const x = p.x + Math.cos((a / 8) * TAU) * 3, z = p.z + Math.sin((a / 8) * TAU) * 3;
                const h = H(x, z);
                if (h > (up ? up.h : p.h)) up = { x, z, h };
            }
            if (!up) break;
            p = up;
        }
        return p;
    };
    const finish = (p, R) => {
        // the floor: the summit's ground on average (the top cut off, the slopes round it raised)
        let s = 0, n = 0;
        for (const q of [0, R * 0.35, R * 0.7]) {
            const m = q ? 10 : 1;
            for (let k = 0; k < m; k++) { s += H(p.x + Math.cos((k / m) * TAU) * q, p.z + Math.sin((k / m) * TAU) * q); n++; }
        }
        const x = Math.round(p.x), z = Math.round(p.z);
        // high above the grass: a lower summit is raised into a peak of bare rock
        const F = Math.max(Math.round(s / n) + 1, test ? ICE_CASTLE.TEST_PEAK : ICE_CASTLE.PEAK_MIN);
        // the gates look toward the spawn
        const ax = -x, az = -z;
        const rot = Math.abs(az) >= Math.abs(ax) ? (az > 0 ? 0 : 2) : (ax > 0 ? 1 : 3);
        return { x, z, F, rot, test: !!test };
    };
    if (test) return finish(climb({ x: test.x, z: test.z, h: H(test.x, test.z) }), ICE_CASTLE.TEST_R);
    const rng = createRng(((seed * 7349) ^ 0x1ce0c457) >>> 0);
    const a0 = rng() * TAU;
    // candidates round the ring, the highest first; the first summit free of water and buildings wins
    const cands = [];
    for (let i = 0; i < 28; i++) {
        const a = a0 + (i / 28) * TAU;
        for (let j = 0; j < 7; j++) {
            const d = ICE_CASTLE.MIN + (j + rng()) / 7 * (ICE_CASTLE.MAX - ICE_CASTLE.MIN);
            const x = Math.cos(a) * d, z = Math.sin(a) * d;
            cands.push({ x, z, h: H(x, z) });
        }
    }
    cands.sort((p, q) => q.h - p.h || p.x - q.x);
    const R = ICE_CASTLE.R;
    for (let i = 0; i < Math.min(12, cands.length); i++) {
        const p = climb(cands[i]);
        const d = Math.hypot(p.x, p.z);
        if (d < ICE_CASTLE.MIN * 0.8 || d > ICE_CASTLE.MAX * 1.15) continue;
        let ok = !wet(p.x, p.z);
        for (let k = 0; k < 8 && ok; k++) {
            const x = p.x + Math.cos((k / 8) * TAU) * (R + 6), z = p.z + Math.sin((k / 8) * TAU) * (R + 6);
            if (wet(x, z) || busy(x, z)) ok = false;
        }
        if (ok && !busy(p.x, p.z)) return finish(p, R);
    }
    return null;
}

/** World offset (dx, dz) from the castle → its local {u across, v toward the gates}. */
export function iceUV(S, dx, dz) {
    switch (S.rot) {
        case 1: return { u: -dz, v: dx };
        case 2: return { u: -dx, v: -dz };
        case 3: return { u: dz, v: -dx };
        default: return { u: dx, v: dz };
    }
}

/**
 * The mountain the castle stands on (its top layer at a column whose local place is u, v; `h` the land
 * as it is there; `n`, `r` noises −1…1). A great peak behind the castle, falling past it on every side;
 * the castle's shelf; a gorge across its front, and the ledge beyond the gorge the ice stair starts from.
 * → {h, lifted} (lifted: the mountain's rock there — bare, no grass).
 */
export function mountainAt(S, u, v, h, n, r, spur = 0) {
    const M = S.test ? ICE_CASTLE.TEST_MOUNT : ICE_CASTLE.MOUNT, R = S.R;
    const top = Math.min(S.F + M.TOP, ICE_CASTLE.TOP_MAX);
    const dp = Math.hypot(u * 0.85, v + M.BACK); // (the peak behind the castle; the mountain a little wider than deep)
    // the peak falling away: convex, through the castle's floor at the castle
    let m = top - (top - S.F) * Math.pow(dp / M.BACK, M.E);
    // spurs running down from the summit with gullies between them, crags on them — none on the shelf itself
    const d = Math.hypot(u, v);
    const away = Math.min(1, Math.max(0, (d - R * 0.8) / 12));
    const ridge = 1 - Math.abs(spur); // (1 on a spur's crest, 0 deep in a gully)
    m += away * M.JAG * ((ridge * ridge - 0.45) * 1.6 + 0.35 * n + 0.25 * r);
    // the shelf's rocky shoulder: steep crags and ledges falling from its edge to the mountain's flank (no wall)
    const sh = S.F - Math.max(0, d - R * 0.84) * (1.35 + 0.5 * Math.abs(r)) + 3.5 * n;
    if (sh > m) m = Math.round(sh / 2) * 2 + (n > 0.3 ? 1 : 0);
    // beyond the gorge: a spur of the mountain rising to the ledge the ice stair starts from (the way up)
    const [l0, l1] = M.LEDGE;
    if (v > R + l0 - 2 && v < R + M.SPUR_END) {
        const spur = S.F - M.LEDGE_DROP - Math.max(0, v - R - l1) * M.SPUR_FALL - Math.max(0, Math.abs(u) - M.LEDGE_U) * 1.1 + 2.5 * n;
        if (spur > m) m = spur;
    }
    m = Math.min(ICE_CASTLE.TOP_MAX, Math.round(m));
    let out = Math.max(h, m), lifted = m >= h;
    // the gorge across the front: deep, steep-sided, its ends rising into the mountain's flanks
    const [g0, g1] = M.GORGE;
    const vg0 = R + g0 - 3 + 2 * n, vg1 = R + g1 + 3 - 2 * r; // (its rims ragged)
    if (v > vg0 && v < vg1 && Math.abs(u) < M.SPAN) {
        const across = Math.min(v - vg0, vg1 - v) / 5; // 0 at its rims … 1 inside: steep, in rough steps
        const ends = Math.max(0, (Math.abs(u) - M.SPAN * 0.6) / (M.SPAN * 0.4));
        const floor = S.F - M.DEEP * Math.round(Math.min(1, across) * 4) / 4 * (1 - ends) + 3 * n;
        if (out > floor) { out = Math.round(floor); lifted = true; }
    }
    // the ledge beyond the gorge (where the ice stair starts): flat, a little below the castle
    if (v >= R + l0 && v <= R + l1 && Math.abs(u) <= M.LEDGE_U + (v - R - l0) * 0.4) {
        const lv = S.F - M.LEDGE_DROP;
        if (out < lv || out > lv + 2) { out = lv; lifted = true; }
    }
    return { h: out, lifted };
}

/** Local (u across, v toward the gates) → world, for a castle turned by `rot`. */
export function iceLocal(S, u, v) {
    switch (S.rot) {
        case 1: return { x: S.x + v, z: S.z - u };
        case 2: return { x: S.x - u, z: S.z - v };
        case 3: return { x: S.x - v, z: S.z + u };
        default: return { x: S.x + u, z: S.z + v };
    }
}
/** The world yaw (THREE rotation.y) of something facing the castle's front (+v). */
export const iceYaw = (S) => [0, Math.PI / 2, Math.PI, -Math.PI / 2][S.rot];

/** The whole plan: the parts of its blocks and where things are (the hall, the throne, the gates…). */
export function iceCastlePlan(S) {
    const parts = [];
    const F = S.F, P = F + ICE_CASTLE.PODIUM; // P: the palace's floor layer
    const box = (u0, u1, v0, v1, L0, L1, t) => {
        const a = iceLocal(S, u0, v0), b = iceLocal(S, u1, v1);
        parts.push({ k: 0, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), L0, L1, t });
    };
    const cyl = (u, v, r, hr, L0, L1, t) => {
        const c = iceLocal(S, u, v), q = Math.ceil(r);
        parts.push({ k: 1, cx: c.x, cz: c.z, r, hr, x0: Math.floor(c.x - q), x1: Math.ceil(c.x + q), z0: Math.floor(c.z - q), z1: Math.ceil(c.z + q), L0, L1, t });
    };
    const rng = createRng(((S.x * 92821) ^ (S.z * 68917) ^ 0x5a0f) >>> 0);
    const R = S.test ? ICE_CASTLE.TEST_R : ICE_CASTLE.R;
    const HV = -2, HR = ICE_CASTLE.HALL_R; // the hall's centre (v) and radius
    const { WALL, GLOW, FLOOR, DARK } = ICE_BLOCK;
    // the snowy plateau
    cyl(0, 0, R * 0.8, -1, F, F, SNOW);
    // the podium and the hall's floor (the snowflake floor)
    cyl(0, HV, HR + 2, -1, F + 1, P, DARK);
    cyl(0, HV, HR - 1, -1, P, P, FLOOR);
    // the grand stair to the gates (out of the podium's front), with lace railings either side
    const front = HV + HR + 2; // where the podium ends in front
    for (let k = 0; k < ICE_CASTLE.PODIUM; k++) {
        const L = F + 1 + k, v1 = front + 2 * (ICE_CASTLE.PODIUM - k);
        box(-4, 4, front - 1, v1, L, L, k === ICE_CASTLE.PODIUM - 1 ? FLOOR : WALL);
        // railings: glowing posts, a rail on them (lace: a post, a gap, a post)
        for (const s of [-5, 5]) {
            box(s, s, v1 - 1, v1, F + 1, L + 1, DARK);
            box(s, s, v1, v1, L + 2, L + 2, GLOW);
            box(s, s, v1 - 1, v1 - 1, L + 2, L + 2, GLOW);
        }
    }
    // the round hall: walls of glacier ice, two thick
    const W0 = P + 1, W1 = P + 14;
    cyl(0, HV, HR, HR - 2, W0, W1, WALL);
    // a glowing band round it, and its crown
    cyl(0, HV, HR + 0.6, HR - 1, P + 7, P + 7, GLOW);
    cyl(0, HV, HR + 0.6, HR - 1, W1, W1, GLOW);
    // tall pointed windows all round (not at the gates nor behind the throne)
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + TAU / 24;
        const dv = Math.cos(a), du = Math.sin(a);
        if (dv > 0.85 || dv < -0.85) continue;
        for (const d of [HR - 0.5, HR - 1.5, HR - 2.2]) {
            const u = Math.round(du * d), v = Math.round(HV + dv * d);
            box(u, u, v, v, P + 4, P + 10, AIR);
        }
        const u = Math.round(du * HR), v = Math.round(HV + dv * HR);
        box(u, u, v, v, P + 11, P + 11, GLOW);
    }
    // the vaulted roof: rings narrowing to the spire (hollow: a high vault inside)
    const vault = parts.length;
    for (let i = 0; i < 11; i++) {
        const r = HR - 0.5 - i * 1.35;
        if (r < 1) break;
        cyl(0, HV, r, Math.max(-1, r - 2.2), W1 + 1 + i, W1 + 1 + i, i % 4 === 3 ? GLOW : WALL);
    }
    { const sp = roofShapes(parts.slice(vault), [WALL]); if (sp) parts.push(sp); } // (its rings ramps — generation 6)
    // the central spire
    cyl(0, HV, 1.2, -1, W1 + 10, W1 + 24, WALL);
    cyl(0, HV, 0.6, -1, W1 + 25, W1 + 30, GLOW);
    // the gates: a tall pointed archway through the front wall (the leaves are doors: IceQueen.js)
    const gv = HV + HR; // the outer face of the front wall
    box(-2, 2, gv - 3, gv + 1, P + 1, P + 6, AIR);
    box(-1, 1, gv - 3, gv + 1, P + 7, P + 7, AIR);
    box(0, 0, gv - 3, gv + 1, P + 8, P + 8, AIR);
    for (const s of [-3, 3]) box(s, s, gv - 1, gv + 1, P + 1, P + 8, GLOW);
    box(-2, 2, gv, gv + 1, P + 9, P + 9, GLOW);
    box(0, 0, gv, gv + 1, P + 10, P + 11, GLOW);
    // the throne at the back: a dais, a seat, a tall back of spikes
    const tv = HV - HR + 3;
    box(-4, 4, tv - 1, tv + 3, P + 1, P + 1, DARK);
    box(-2, 2, tv - 1, tv + 1, P + 2, P + 2, DARK);
    box(-1, 1, tv - 1, tv, P + 3, P + 3, GLOW);
    box(-1, 1, tv - 1, tv - 1, P + 4, P + 7, GLOW);
    box(0, 0, tv - 1, tv - 1, P + 8, P + 10, GLOW);
    for (const s of [-1, 1]) { box(s * 2, s * 2, tv - 1, tv, P + 3, P + 5, WALL); box(s * 2, s * 2, tv - 1, tv - 1, P + 6, P + 8, GLOW); }
    // a snowflake laid into the floor: six arms of glowing ice with their little branches
    for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU, cu = Math.sin(a), cv = Math.cos(a);
        for (let d = 1; d <= 8; d++) {
            const u = Math.round(cu * d), v = Math.round(HV + 1 + cv * d);
            box(u, u, v, v, P, P, GLOW);
        }
        for (const d of [4, 6]) for (const s of [-1, 1]) {
            const b = a + s * 0.8;
            const u = Math.round(cu * d + Math.sin(b) * 2), v = Math.round(HV + 1 + cv * d + Math.cos(b) * 2);
            box(u, u, v, v, P, P, GLOW);
        }
    }
    // slender spires round the hall, each with its cone and a glowing tip
    const SP = [[13, 10, 20], [-13, 10, 20], [18, -2, 27], [-18, -2, 27], [12, -15, 23], [-12, -15, 23], [0, -21, 32]];
    for (const [u, v, h] of SP) {
        const top = F + 1 + h;
        cyl(u, v, 2.4, -1, F + 1, top, WALL);
        cyl(u, v, 2.9, 1.5, top - 6, top - 6, GLOW);
        const cone = parts.length;
        for (let i = 0; i < 4; i++) cyl(u, v, 2.1 - i * 0.5, -1, top + 1 + i * 2, top + 2 + i * 2, WALL);
        { const sp = roofShapes(parts.slice(cone), [WALL]); if (sp) parts.push(sp); }
        cyl(u, v, 0.4, -1, top + 9, top + 11, GLOW);
    }
    // the ice staircase over the gorge (as in the film): from the ledge beyond the gorge up to the castle's
    // shelf — a deck of ice one block thick, a keel under it, lace railings of glowing ice
    {
        const MM = S.test ? ICE_CASTLE.TEST_MOUNT : ICE_CASTLE.MOUNT;
        const end = MM.LEDGE[0], drop = MM.LEDGE_DROP;
        for (let k = 0; k <= end; k++) {
            const v = R + k, L = F - Math.round((k / end) * drop);
            box(-2, 2, v, v, L, L, k % 3 === 0 ? FLOOR : WALL);
            box(-1, 1, v, v, L - 2, L - 1, DARK);
            for (const s of [-3, 3]) {
                if (k % 2 === 0) box(s, s, v, v, L, L + 1, DARK);
                box(s, s, v, v, L + 2, L + 2, GLOW);
            }
        }
    }
    // crystals of ice standing in the snow round the palace (not on the way to the gates)
    for (let i = 0; i < 12; i++) {
        const a = rng() * TAU, d = R * (0.55 + rng() * 0.22);
        const u = Math.round(Math.sin(a) * d), v = Math.round(Math.cos(a) * d);
        if (Math.abs(u) < 7 && v > 0) continue;
        const h = 2 + Math.floor(rng() * 4);
        cyl(u, v, 0.8 + rng() * 0.5, -1, F + 1, F + h, rng() < 0.5 ? GLOW : WALL);
    }
    const at = (u, v, L) => { const p = iceLocal(S, u, v); return { x: p.x, y: L - 0.5, z: p.z }; };
    return {
        id: 'ice', ...S, R, parts,
        floor: P, // the hall's floor layer (its walking height: P − 0.5)
        hall: { ...at(0, HV, P), r: HR - 2, top: W1 + 10 },
        throne: at(0, tv + 0.5, P + 2),
        gate: { ...at(0, gv, P), w: 5, h: 6, inner: at(0, gv - 4, P), out: at(0, front + 8, F) },
        guard: [at(-5, front + 9, F), at(5, front + 9, F)],
        chandelier: { ...at(0, HV, P), y: W1 + 4 },
        // the queen's chests either side of her throne (CLAUDE.md «Боссы»: every boss has chests — IceQueen.js)
        chests: [at(-5, tv + 2, P), at(5, tv + 2, P)],
        x0: Math.min(...parts.map((p) => p.x0)), x1: Math.max(...parts.map((p) => p.x1)),
        z0: Math.min(...parts.map((p) => p.z0)), z1: Math.max(...parts.map((p) => p.z1)),
    };
}

/**
 * The one castle of a world as the terrain sees it: its spot (worked out once, lazily), its plan,
 * the land it levels (landAt, like a castle's) and its parts in a chunk.
 */
export class IceCastleSite {
    constructor(seed, raw, busy, test = null) {
        this.seed = seed; this.raw = raw; this.busy = busy; this.testAt = test;
        this._crag = createNoise2D((seed ^ 0x1ce5ea) >>> 0);
        this._plan = undefined;
        this._byChunk = new Map();
    }

    /** The plan (null: no castle in this world). */
    get plan() {
        if (this._plan === undefined) {
            const S = iceCastleSpot(this.seed, this.raw, this.busy, this.testAt);
            this._plan = S ? iceCastlePlan(S) : null;
        }
        return this._plan;
    }

    landAt(ix, iz) {
        const k = this.plan;
        if (!k) return null;
        // (only the plateau: round it the massif of rock falls away by itself — liftAt)
        const dx = ix - k.x, dz = iz - k.z;
        if (Math.abs(dx) > k.R || Math.abs(dz) > k.R || dx * dx + dz * dz > k.R * k.R) return null;
        // (the shelf's edge ragged, not a drawn circle; the hall, the stair and the gates always on it)
        const a = Math.atan2(dz, dx), rr = k.R * (0.84 + 0.16 * this._crag(Math.cos(a) * 1.8 - 21, Math.sin(a) * 1.8 + 33));
        if (dx * dx + dz * dz > rr * rr && Math.hypot(dx, dz) > ICE_CASTLE.HALL_R + 10) return null;
        return { castle: k, w: 1, ice: true };
    }

    /**
     * The land at a column as the castle's mountain makes it (`h` the land without it): its peak behind the
     * castle, its crags, the gorge in front, the ledge beyond. Sets this.lifted (its own rock there).
     */
    shapeAt(ix, iz, h) {
        const k = this.plan;
        this.lifted = false;
        if (!k) return h;
        const M = k.test ? ICE_CASTLE.TEST_MOUNT : ICE_CASTLE.MOUNT;
        const dx = ix - k.x, dz = iz - k.z, L = M.BACK * 2.4;
        if (Math.abs(dx) > L || Math.abs(dz) > L) return h;
        const { u, v } = iceUV(k, dx, dz);
        const n = this._crag(ix / 11, iz / 11) * 0.7 + this._crag(ix / 4, iz / 4 + 17) * 0.3;
        const r = this._crag(ix / 26 + 40, iz / 26 - 40);
        // (spurs radiating from the summit behind the castle: a noise round it, stretched along the slope)
        const pu = u * 0.85, pv = v + M.BACK, a = Math.atan2(pv, pu), dp = Math.hypot(pu, pv);
        const spur = this._crag(Math.cos(a) * 3.2 + dp / 70, Math.sin(a) * 3.2 - dp / 70);
        const o = mountainAt(k, u, v, h, n, r, spur);
        this.lifted = o.lifted;
        return o.h;
    }

    /** Bare rock and snow here — no grass, no trees (near the castle; further only on its mountain's own rock)? */
    rocky(ix, iz) {
        const k = this.plan;
        if (!k) return false;
        const dx = ix - k.x, dz = iz - k.z, R = (k.test ? ICE_CASTLE.TEST_MOUNT : ICE_CASTLE.MOUNT).ROCK * 0.45;
        return dx * dx + dz * dz <= R * R;
    }

    partsForChunk(cx, cz, C) {
        const k = this.plan;
        if (!k) return [];
        const x0 = cx * C, z0 = cz * C, x1 = x0 + C - 1, z1 = z0 + C - 1;
        if (k.x1 < x0 || k.x0 > x1 || k.z1 < z0 || k.z0 > z1) return [];
        const key = cx * 65536 + cz;
        let list = this._byChunk.get(key);
        if (!list) { list = k.parts.filter((p) => p.x1 >= x0 && p.x0 <= x1 && p.z1 >= z0 && p.z0 <= z1); this._byChunk.set(key, list); }
        return list.length ? [list] : [];
    }
}

/**
 * Where a visitor arrives at the palace (Creative «У Ледяной Королевы»): the ledge beyond the gorge, at the foot of the ice
 * staircase, facing the palace — 40 m and more from the Queen, the guards (at the gates) far ahead.
 * @returns {{x:number,z:number,yaw:number}} yaw is a bearing atan2(dx, dz) to the palace
 */
export function iceApproach(P) {
    const M = P.test ? ICE_CASTLE.TEST_MOUNT : ICE_CASTLE.MOUNT;
    const a = iceLocal(P, 0, P.R + M.LEDGE[0] + 4), c = iceLocal(P, 0, 0);
    return { x: Math.round(a.x), z: Math.round(a.z), yaw: Math.atan2(c.x - a.x, c.z - a.z) };
}
