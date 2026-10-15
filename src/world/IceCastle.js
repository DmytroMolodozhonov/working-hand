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

export const ICE_CASTLE = {
    MIN: 950, MAX: 1700, // m from the spawn: far, but a flight reaches it
    R: 30, BLEND: 24, // m: the levelled zone and the ring blending it into the mountain
    TEST_R: 26, TEST_BLEND: 12,
    // (the author: «где очень высоко… там, где много камня и где реально не может вырасти трава»)
    PEAK_MIN: 86, // layers: the castle's floor is never lower — a lower summit is raised into a crag of rock
    MASSIF: 42, // m beyond the plateau: the rocky massif falling steeply from it to the mountain round it
    TEST_PEAK: 66, TEST_MASSIF: 20, // (the creative test ground: its mountain grows a peak of rock and snow)
    ROCK: 10, // m beyond the massif: still no grass, no trees — bare rock, scree and snow
    HALL_R: 15, // m: the round hall (outer radius)
    PODIUM: 3, // layers: the palace stands on a podium this high above the plateau
};

/** The ice blocks' ids (Terrain.BLOCK keeps the same numbers). */
export const ICE_BLOCK = { WALL: 59, GLOW: 60, FLOOR: 61, DARK: 62 };
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

/** The castle's massif: how high the rock stands `d` m from its middle (−∞: beyond it). Crags by `n`. */
export function massifHeight(S, d, n, spread = 1) {
    const R = S.test ? ICE_CASTLE.TEST_R : ICE_CASTLE.R, M = (S.test ? ICE_CASTLE.TEST_MASSIF : ICE_CASTLE.MASSIF) * spread;
    if (d > R + M) return -Infinity;
    if (d <= R) return S.F;
    const t = (d - R) / M; // 0 at the plateau's edge … 1 at the massif's foot
    // steep crags: a cliff under the rim, ledges, buttresses and gullies, falling to nothing at the foot
    const h = S.F * (1 - Math.pow(t, 1.25)) + 10 * n * Math.min(1, t * 4) * (1 - t) - 1;
    return Math.round(t < 0.5 ? Math.round(h / 3) * 3 : h); // (its upper half in ledges: snow lies on them)
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
    cyl(0, 0, R, -1, F, F, SNOW);
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
    for (let i = 0; i < 11; i++) {
        const r = HR - 0.5 - i * 1.35;
        if (r < 1) break;
        cyl(0, HV, r, Math.max(-1, r - 2.2), W1 + 1 + i, W1 + 1 + i, i % 4 === 3 ? GLOW : WALL);
    }
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
        for (let i = 0; i < 4; i++) cyl(u, v, 2.1 - i * 0.5, -1, top + 1 + i * 2, top + 2 + i * 2, WALL);
        cyl(u, v, 0.4, -1, top + 9, top + 11, GLOW);
    }
    // crystals of ice standing in the snow round the palace (not on the way to the gates)
    for (let i = 0; i < 12; i++) {
        const a = rng() * TAU, d = R * (0.7 + rng() * 0.25);
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
        return { castle: k, w: 1, ice: true };
    }

    /** The rock massif under the castle at a column (its top layer), or −∞ beyond it. */
    liftAt(ix, iz) {
        const k = this.plan;
        if (!k) return -Infinity;
        const M = k.R + (k.test ? ICE_CASTLE.TEST_MASSIF : ICE_CASTLE.MASSIF);
        const dx = ix - k.x, dz = iz - k.z;
        if (Math.abs(dx) > M || Math.abs(dz) > M) return -Infinity;
        const d = Math.hypot(dx, dz);
        if (d > M) return -Infinity;
        // (not a drum: spurs and bays round it, crags and gullies down its sides)
        const a = Math.atan2(dz, dx);
        const spread = 0.6 + 0.5 * (0.5 + 0.5 * this._crag(Math.cos(a) * 2.2 + 30, Math.sin(a) * 2.2 - 12));
        const n = 0.6 * this._crag(ix / 7, iz / 7) + 0.4 * Math.abs(this._crag(Math.cos(a) * 6 - 5, Math.sin(a) * 6 + 9)) * 2 - 0.4;
        return massifHeight(k, d, n, spread);
    }

    /** Bare rock and snow here — no grass, no trees (the massif and a ring round it)? */
    rocky(ix, iz) {
        const k = this.plan;
        if (!k) return false;
        const M = k.R + (k.test ? ICE_CASTLE.TEST_MASSIF : ICE_CASTLE.MASSIF) + ICE_CASTLE.ROCK;
        const dx = ix - k.x, dz = iz - k.z;
        return Math.abs(dx) <= M && Math.abs(dz) <= M && dx * dx + dz * dz <= M * M;
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
