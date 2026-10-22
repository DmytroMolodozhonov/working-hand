/**
 * IceMagicPlan.js — the blocks of «Create an Ice Castle» and «Ice Bridge» (src/game/IceMagic.js).
 *
 * The castle is made the way Elsa makes hers in «Let It Go» (Frozen, 2013): a stamp of the foot and a
 * snowflake of ice spreads over the ground from it; then the hands go up and the palace rises out of
 * the floor — the walls, a stair, a balcony over the gates, slender spires, a dome closing over the
 * hall, a chandelier like a snowflake. Its shape is its own: a round hall under a DOME (the Ice Queen's
 * palace — IceCastle.js — has a cone roof and stands on a podium), six spires round it like the six
 * points of a snowflake, a balcony over tall pointed gates, a gallery inside with a curving stair, a
 * throne at the back.
 *
 * The bridge: an arch of ice from one point to another, a deck three blocks wide, railings of ice with
 * glowing posts, a keel of deep ice under it.
 *
 * Pure and deterministic (no THREE): the same record gives the same blocks on every computer, and a
 * loaded world puts the castle back from its record. Every cell: [x, L, z, block, h] — h: its share of
 * the growth (the castle: of its height; the bridge: of its length; the floor: 0) — the cells come
 * sorted by h, so «grown to f» is a prefix of the list.
 */

import { iceLocal, ICE_BLOCK } from './IceCastle.js';

export const ICE_MAGIC = {
    FLOOR_R: 15, // m: the snowflake floor
    HALL_R: 11, // m: the hall's outer radius (walls 2 thick)
    WALL_H: 12, // layers of wall over the floor
    DOME_H: 11, // layers of the dome over the walls
    TOP: 36, // layers: the highest point (the dome's finial) over the floor
    BRIDGE_MIN: 5, BRIDGE_MAX: 60, // m: how long a bridge can be
    BRIDGE_RISE: 22, // layers: the most the two ends may differ
    LIFT_MAX: 12, // layers: the most the ice columns lift the floor over the ground at the foot
    PILLAR_STEP: 5, PILLAR_R: 1.25, // m: the columns under the floor (a grid of round columns of deep ice)
    PILLAR_DEEP: 80, // layers: the deepest a column goes down to the ground (a ravine, the sea's bottom)
};

const AIR = 0;
const { WALL, GLOW, FLOOR, DARK } = ICE_BLOCK;
const TAU = Math.PI * 2;

/**
 * The castle. S: {x, z, G (the floor's layer), rot (0…3: the gates face +z, +x, −z, −x), pil (the
 * columns under the floor: [x, z, bottom, …] — the layer of the ground under each of their cells)}.
 * @returns {{cells: Array, clear: Array, floor: Array, pillars: Array, gate, throne, chandelier, bed, stair, rect, H}}
 */
export function iceCastleMagicPlan(S) {
    const it = iceCastleMagicSteps(S);
    for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/**
 * The same plan made a piece at a time (a generator: each next() is ~1 ms) — the game makes it over a
 * few frames (IceMagic.js), never in one.
 */
export function* iceCastleMagicSteps(S) {
    const F = S.G;
    const H = ICE_MAGIC.TOP;
    const map = new Map(); // a number for (x, L, z) → [x, L, z, t, h]
    const X0 = Math.round(S.x) - 64, Z0 = Math.round(S.z) - 64;
    const put = (x, L, z, t) => {
        const k = ((L - F + 16) * 128 + (x - X0)) * 128 + (z - Z0);
        const c = map.get(k);
        if (c) c[3] = t; else map.set(k, [x, L, z, t, Math.max(0, (L - F) / H)]);
    };
    // (local u across, v toward the gates; the world cells round them)
    const cellsOf = (u0, u1, v0, v1) => {
        const a = iceLocal(S, u0, v0), b = iceLocal(S, u1, v1);
        return [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z)];
    };
    const box = (u0, u1, v0, v1, L0, L1, t) => {
        const [x0, x1, z0, z1] = cellsOf(u0, u1, v0, v1);
        for (let x = Math.round(x0); x <= Math.round(x1); x++) for (let z = Math.round(z0); z <= Math.round(z1); z++) for (let L = L0; L <= L1; L++) put(x, L, z, t);
    };
    // a ring (hr ≥ 0) or a disc (hr < 0) round local (u, v); keep(u, v): only the cells it says
    const cyl = (u, v, r, hr, L0, L1, t, keep = null) => {
        const c = iceLocal(S, u, v), q = Math.ceil(r) + 1;
        for (let x = Math.floor(c.x - q); x <= Math.ceil(c.x + q); x++) for (let z = Math.floor(c.z - q); z <= Math.ceil(c.z + q); z++) {
            const d = Math.hypot(x - c.x, z - c.z);
            if (d > r || d <= hr) continue;
            if (keep && !keep(...toLocal(S, x, z))) continue;
            for (let L = L0; L <= L1; L++) put(x, L, z, t);
        }
    };
    const HR = ICE_MAGIC.HALL_R, FR = ICE_MAGIC.FLOOR_R, W1 = F + ICE_MAGIC.WALL_H;
    const ang = (u, v) => Math.atan2(u, v); // (0: the gates, ±π: the throne)

    // ---- the snowflake floor: pale ice, its six arms of deep blue ice with their branches (seen from
    // high above as a snowflake), a deep blue rim, a glowing heart where the foot came down
    cyl(0, 0, FR, -1, F, F, FLOOR);
    cyl(0, 0, FR, FR - 0.8, F, F, DARK);
    cyl(0, 0, 2.2, -1, F, F, DARK);
    cyl(0, 0, 1.2, -1, F, F, GLOW);
    for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU, su = Math.sin(a), cv = Math.cos(a);
        for (let d = 2; d <= FR - 2; d += 0.5) { const p = [Math.round(su * d), Math.round(cv * d)]; box(p[0], p[0], p[1], p[1], F, F, DARK); }
        for (const [d, len] of [[5, 2.5], [8.5, 3.2], [11.5, 2.2]]) for (const s of [-1, 1]) {
            const b = a + s * 0.75;
            for (let e = 0.5; e <= len; e += 0.5) { const u = Math.round(su * d + Math.sin(b) * e), v = Math.round(cv * d + Math.cos(b) * e); box(u, u, v, v, F, F, e > len - 0.6 ? GLOW : DARK); }
        }
    }
    yield;
    const floor = [...map.values()].map((c) => { c[4] = 0; return c; });
    map.clear();
    // ---- the columns that hold the floor up (on a slope, over a ravine, over water): deep ice from the ground up
    const pillars = [];
    const pil = S.pil || [];
    for (let i = 0; i + 2 < pil.length; i += 3) for (let L = pil[i + 2] + 1; L < F; L++) pillars.push([pil[i], L, pil[i + 1], DARK, 0]);

    yield;
    // ---- the hall: walls of glacier ice two thick, glowing bands, the gates, the windows
    cyl(0, 0, HR, HR - 2, F + 1, W1, WALL);
    cyl(0, 0, HR + 0.5, HR - 1, F + 5, F + 5, GLOW);
    cyl(0, 0, HR + 0.5, HR - 1, W1, W1, GLOW);
    // tall pointed windows round it (not at the gates, the balcony nor behind the throne)
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + TAU / 24;
        const su = Math.sin(a), cv = Math.cos(a);
        if (Math.abs(cv) > 0.8) continue;
        for (const d of [HR - 0.5, HR - 1.5]) { const u = Math.round(su * d), v = Math.round(cv * d); box(u, u, v, v, F + 3, F + 8, AIR); }
        const u = Math.round(su * (HR - 1)), v = Math.round(cv * (HR - 1));
        box(u, u, v, v, F + 9, F + 9, AIR);
        box(u, u, v, v, F + 10, F + 10, GLOW);
    }
    yield;
    // ---- the gallery inside along the wall (not over the stair), its glowing rail, the curving stair
    const STAIR_A0 = -0.95, STAIR_DA = 0.21, STEPS = 8; // (from the front-left, round to the back-left)
    const stairEnd = STAIR_A0 - STEPS * STAIR_DA;
    const overStair = (u, v) => { const a = ang(u, v); return a < STAIR_A0 + 0.15 && a > stairEnd; };
    cyl(0, 0, HR - 1.5, HR - 4.3, F + 9, F + 9, FLOOR, (u, v) => !overStair(u, v));
    cyl(0, 0, HR - 3.7, HR - 4.4, F + 10, F + 10, GLOW, (u, v) => { const a = ang(u, v); return !overStair(u, v) && !(a <= stairEnd + 0.05 && a > stairEnd - 0.45); });
    for (let k = 0; k < STEPS; k++) {
        if (k === STEPS / 2) yield;
        const a1 = STAIR_A0 - k * STAIR_DA, a0 = a1 - STAIR_DA - 0.02;
        cyl(0, 0, HR - 1.5, HR - 4.3, F + 1, F + 1 + k, k === STEPS - 1 ? FLOOR : DARK, (u, v) => { const a = ang(u, v); return a <= a1 && a > a0; });
        cyl(0, 0, HR - 1.5, HR - 4.3, F + 1 + k, F + 1 + k, FLOOR, (u, v) => { const a = ang(u, v); return a <= a1 && a > a0; });
    }
    yield;
    // ---- the gates: a tall pointed archway, glowing posts and arch (the leaves are doors — IceMagic.js)
    const gv = HR; // the outer face of the front wall
    box(-2, 2, gv - 3, gv + 1, F + 1, F + 6, AIR);
    box(-1, 1, gv - 3, gv + 1, F + 7, F + 7, AIR);
    box(0, 0, gv - 3, gv + 1, F + 8, F + 8, AIR);
    for (const s of [-3, 3]) box(s, s, gv - 1, gv + 1, F + 1, F + 8, GLOW);
    box(-2, 2, gv, gv + 1, F + 9, F + 9, GLOW);
    box(-1, 1, gv, gv + 1, F + 10, F + 10, GLOW);
    yield;
    // ---- the balcony over the gates (Elsa's): a half-round floor out of the wall, a glowing rail, a door to it from the gallery
    cyl(0, gv, 4, -1, F + 11, F + 11, FLOOR, (u, v) => v >= gv - 1);
    cyl(0, gv, 4, 3, F + 12, F + 12, GLOW, (u, v) => v > gv + 0.5);
    box(-1, 1, gv - 3, gv, F + 12, F + 14, AIR); // (W1 is F+12: the doorway cuts the glowing band too)
    box(-1, 1, gv - 3, gv - 2, F + 10, F + 10, FLOOR); // (a step from the gallery up to the balcony)
    box(-1, 1, gv - 3, gv - 2, F + 11, F + 11, FLOOR);
    yield;
    // ---- the throne at the back: a dais, a seat, a tall back of glowing spikes
    const tv = -(HR - 3);
    box(-3, 3, tv - 1, tv + 2, F + 1, F + 1, DARK);
    box(-1, 1, tv, tv + 1, F + 2, F + 2, GLOW);
    box(-1, 1, tv - 1, tv - 1, F + 2, F + 6, GLOW);
    box(0, 0, tv - 1, tv - 1, F + 7, F + 8, GLOW);
    for (const s of [-1, 1]) { box(s * 2, s * 2, tv - 1, tv + 1, F + 2, F + 3, WALL); box(s * 2, s * 2, tv - 1, tv - 1, F + 4, F + 6, GLOW); }
    yield;
    // ---- the dome: rings narrowing over the walls (hollow: a high vault inside), a cap, the finial
    const DH = ICE_MAGIC.DOME_H;
    for (let i = 0; i < DH; i++) {
        const r = HR * Math.sqrt(1 - (i / DH) ** 2);
        cyl(0, 0, r, r - 1.7, W1 + 1 + i, W1 + 1 + i, i % 3 === 2 ? GLOW : WALL);
    }
    cyl(0, 0, 3, -1, W1 + 1 + DH, W1 + 1 + DH, WALL);
    cyl(0, 0, 1.2, -1, W1 + 2 + DH, W1 + 6 + DH, WALL);
    cyl(0, 0, 0.6, -1, W1 + 7 + DH, F + H, GLOW);
    // the balcony's doorway through the dome's first rings
    box(-1, 1, gv - 3, gv, W1 + 1, W1 + 2, AIR);
    yield;
    // ---- six spires round the hall, like the points of a snowflake: a shaft, a glowing band, a cone, a glowing tip
    for (let k = 0; k < 6; k++) {
        const a = TAU / 12 + (k / 6) * TAU, d = HR + 2;
        const u = Math.sin(a) * d, v = Math.cos(a) * d;
        const top = F + [21, 26, 30, 30, 26, 21][k];
        cyl(u, v, 1.8, -1, F + 1, top, WALL);
        cyl(u, v, 2.3, 1.2, top - 4, top - 4, GLOW);
        for (let i = 0; i < 3; i++) cyl(u, v, 1.5 - i * 0.4, -1, top + 1 + i * 2, top + 2 + i * 2, WALL);
        cyl(u, v, 0.45, -1, top + 7, top + 9, GLOW);
    }
    // (sorted by height: «grown to f» is the cells with h ≤ f)
    yield;
    const all = [...map.values()];
    const cells = all.filter((c) => c[3] !== AIR).sort((a, b) => a[4] - b[4] || a[1] - b[1]);
    const clear = all.filter((c) => c[3] === AIR);
    const at = (u, v, L) => { const p = iceLocal(S, u, v); return { x: p.x, y: L - 0.5, z: p.z }; };
    const R = FR + 1;
    return {
        cells, clear, floor, pillars, H, F,
        gate: { ...at(0, gv + 0.1, F), w: 5, h: 6, gv },
        throne: at(0, tv + 0.5, F + 2),
        chandelier: { ...at(0, 0, F), y: W1 + 4 },
        bed: { ...at(5.2, -3.6, F), yaw: 0 },
        stair: at(Math.sin(STAIR_A0) * (HR - 3), Math.cos(STAIR_A0) * (HR - 3), F),
        rect: { x0: S.x - R, x1: S.x + R, z0: S.z - R, z1: S.z + R },
    };
}

/**
 * The cells of the columns under the floor: a grid round (x, z) — every PILLAR_STEP m, inside the floor —
 * and six more under the rim, at the snowflake's arms. → [[x, z], …] (each column a few cells round).
 */
export function icePillarCells(x, z) {
    const out = [], seen = new Set();
    const R = ICE_MAGIC.FLOOR_R - 1.5, st = ICE_MAGIC.PILLAR_STEP, pr = ICE_MAGIC.PILLAR_R;
    const centres = [];
    for (let u = -2 * st; u <= 2 * st; u += st) for (let v = -2 * st; v <= 2 * st; v += st) if (Math.hypot(u, v) <= R) centres.push([u, v]);
    for (let k = 0; k < 6; k++) centres.push([Math.sin((k / 6) * TAU + TAU / 12) * (R + 0.5), Math.cos((k / 6) * TAU + TAU / 12) * (R + 0.5)]);
    for (const [u, v] of centres) {
        const cx = x + u, cz = z + v;
        for (let i = Math.floor(cx - pr); i <= Math.ceil(cx + pr); i++) for (let j = Math.floor(cz - pr); j <= Math.ceil(cz + pr); j++) {
            if (Math.hypot(i - cx, j - cz) > pr || seen.has(i + ',' + j)) continue;
            seen.add(i + ',' + j);
            out.push([i, j]);
        }
    }
    return out;
}

/** World (x, z) → the castle's local (u, v). */
export function toLocal(S, x, z) {
    const dx = x - S.x, dz = z - S.z;
    switch (S.rot) {
        case 1: return [-dz, dx];
        case 2: return [-dx, -dz];
        case 3: return [dz, -dx];
        default: return [dx, dz];
    }
}

/** The castle's turn so that its gates face the way (fx, fz) points. */
export function rotTowards(fx, fz) {
    return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz > 0 ? 0 : 2);
}

/**
 * The bridge. B: {ax, aL, az, bx, bL, bz} — its two ends (x, z) and the layers its deck starts and ends
 * on (one over the ground there). The deck rises in an arch between them.
 * @returns {{cells: Array, len: number, top: number}}
 */
export function iceBridgePlan(B) {
    const dx = B.bx - B.ax, dz = B.bz - B.az;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len, fz = dz / len, sx = -fz, sz = fx; // (along, across)
    const rise = Math.min(9, 1 + 0.13 * len);
    const deckAt = (t) => Math.round(B.aL + (B.bL - B.aL) * t + rise * 4 * t * (1 - t));
    const deck = new Map(); // "x,z" → {L, t, w}
    for (let s = 0; s <= len + 0.01; s += 0.25) {
        const t = s / len, L = deckAt(t);
        for (let w = -2; w <= 2; w += 0.5) {
            const x = Math.round(B.ax + fx * s + sx * w), z = Math.round(B.az + fz * s + sz * w);
            const k = x + ',' + z, edge = Math.abs(w) > 1.5;
            const was = deck.get(k);
            // (a cell the deck covers is deck, even where the rail's line also passes)
            if (!was || (was.edge && !edge)) deck.set(k, { x, z, L, t, edge, w });
        }
    }
    const map = new Map();
    const put = (x, L, z, t, h) => { const k = x + ',' + L + ',' + z; if (!map.has(k) || t !== DARK) map.set(k, [x, L, z, t, h]); };
    let n = 0;
    for (const c of deck.values()) {
        if (c.edge) {
            // the railing: a low wall of ice, a glowing post every few metres
            const post = (Math.round(c.t * len) % 4 === 0) || c.t < 0.03 || c.t > 0.97;
            put(c.x, c.L, c.z, DARK, c.t);
            put(c.x, c.L + 1, c.z, post ? GLOW : WALL, c.t);
            if (post) put(c.x, c.L + 2, c.z, GLOW, c.t);
        } else {
            put(c.x, c.L, c.z, Math.abs(c.w) < 0.3 && (n++ % 3 === 0) ? GLOW : FLOOR, c.t);
            if (c.t > 0.06 && c.t < 0.94) put(c.x, c.L - 1, c.z, DARK, c.t); // (the keel under the deck)
        }
    }
    const cells = [...map.values()].sort((a, b) => a[4] - b[4]);
    return { cells, len, top: Math.max(B.aL, B.bL) + Math.ceil(rise) };
}

/**
 * Is there water or snow (or ice) within r of (x, z)? data: the terrain (topLayer, get).
 * Looks at the columns every 2 m — the surface and just under it (snow lies on top, the water's top layer).
 */
export function waterOrSnowNear(data, x, z, r, isIce = (t) => t >= WALL && t <= DARK) {
    if (!data) return null;
    const WATER = 8, SNOW = 4, ICE = 10;
    for (let d = 0; d <= r; d += 2) {
        const n = d === 0 ? 1 : Math.ceil((TAU * d) / 2);
        for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU, cx = Math.round(x + Math.cos(a) * d), cz = Math.round(z + Math.sin(a) * d);
            if (data.isSeaColumn?.(cx, cz)) return { x: cx, z: cz, what: 'water' };
            const L = data.topLayer(cx, cz);
            for (let k = 0; k < 2; k++) {
                const t = data.get(cx, L - k, cz);
                if (t === WATER || t === ICE) return { x: cx, z: cz, what: 'water' };
                if (t === SNOW || isIce(t)) return { x: cx, z: cz, what: 'snow' };
            }
        }
    }
    return null;
}
