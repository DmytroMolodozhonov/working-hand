/**
 * CreationBuild.js — the blocks of a building made by «Да пусть создастся …» (DivineCreation.js): a recipe (CreationRules —
 * parts, sizes, materials) → real blocks of the world. Pure data, no THREE: made in a worker (creation.worker.js), the same
 * on every computer from the same recipe, seed, place and ground.
 *
 * Sizes are the world's (CLAUDE.md «Размеры»): a block is 1 m, the hero ~3.5 m tall, a door 3 wide and 6 high (a house's
 * own door — MagicHouse — 3 × 5), a storey 7 m, a corridor and a stair 3 blocks wide, nothing hanging in the air (every
 * part stands on the ground or on what holds it: a bridge on its piers, a spire on its tower, a sail on its mast).
 * The houses are MagicHouse's houses (their rooms, doors, beds, chests, glass — the same furnishing as «Create a House»),
 * in the materials asked; the rest is built here: towers with spiral stairs and battlements or spires, castles (curtain
 * walls with a walkway, towers, a gatehouse, a keep, a moat with a bridge), whole cities (streets, a square, houses of every
 * size facing the streets, a wall with towers and gates), statues carved of blocks (a pig, a horse, a dragon, a knight…),
 * wells, fountains, bridges, arches, pyramids with a chamber, obelisks, temples with columns, lighthouses, windmills, ships,
 * gardens, pavilions, domes, grand stairs, hedge mazes.
 *
 * Local coordinates of a part (as MagicHouse): a to the right, b to the back (the front, −b, looks at the caster), l the
 * layer over the part's floor (l = −1 is the floor laid in the ground). Each part stands on its own ground (G — the
 * ground under it, from the heights sampled round the place): a city follows the land, house by house.
 *
 *   creationPlan({recipe, seed, x, z, face, grid}) → {cells, clear, fill, paths, doors, windows, beds, chests, rect, top, parts, n}
 *     cells  Int32Array [x, L, z, block, shape]×n — in the order they appear (the lowest layers first)
 *     clear  [{x0, x1, z0, z1, L0, L1}] — boxes cleared first (the ground's bumps, trees and bushes in the way)
 *     fill   Int32Array [x, L, z, block]×m — foundation, laid only where nothing solid is
 *     paths  Int32Array [x, z, block]×k — the streets: the ground's top block of that column becomes it
 *   grid: {x0, z0, w, d, G: Int16Array (the ground's top layer, −32768 unknown), wet: Uint8Array (1 water)} round the place
 */

import { BLOCK } from './Terrain.js';
import { createRng } from '../core/math.js';
import { housePlan, rotLot } from './MagicHouse.js';
import { inwardRy } from './Castles.js';
import { cellShapes } from './PlanSlopes.js';
import { SHAPE } from './BlockShapes.js';
import { PARTS, MATERIALS } from '../game/CreationRules.js';

export const BUILD = {
    DOOR_W: 3, DOOR_H: 6, // a door of a part made here (the hero ~3.5 m)
    STOREY: 7,
    GAP: 4, // m between two parts laid out round the main one
    STREET: 5, // a city's street (m)
    MAX_CELLS: 260000,
};

const M = (k, d) => (k && MATERIALS[k] ? MATERIALS[k].block : d);
const isRoofBlock = (t) => t === BLOCK.ROOF_RED || t === BLOCK.ROOF_BLUE || t === BLOCK.ROOF_SLATE || t === BLOCK.ROOF_PURPLE || t === BLOCK.THATCH;
const LOGS = new Set([BLOCK.WOOD, BLOCK.BIRCH, BLOCK.SPRUCE, BLOCK.CHERRY, BLOCK.DARK]);
const STONES = new Set([BLOCK.COBBLE, BLOCK.STONE, BLOCK.CS_GREY, BLOCK.CS_SAND, BLOCK.BRICK, BLOCK.CS_WHITE]);
const ROOF_KEYS = new Set(['redroof', 'blueroof', 'slateroof', 'purpleroof', 'thatch']);
const RAMP = { 0: SHAPE.RAMP_PZ, 1: SHAPE.RAMP_NX, 2: SHAPE.RAMP_NZ, 3: SHAPE.RAMP_PX };

// =============================================================================== the writer
/** All the blocks of a plan, keyed by place (a later write of a place changes its block, its order stays the first). */
class Writer {
    constructor() { this.map = new Map(); this.fill = []; this.paths = new Map(); this.clear = []; this.doors = []; this.windows = []; this.beds = []; this.chests = []; this.top = -1e9; this.full = false; }
    static key(x, L, z) { return ((x + 1048576) * 2097152 + (z + 1048576)) * 1024 + (L + 512); }
    set(x, L, z, t, s = 0) {
        const k = Writer.key(x, L, z);
        if (!this.map.has(k) && this.map.size >= BUILD.MAX_CELLS) { this.full = true; return; }
        this.map.set(k, t | (s << 8));
        if (t && L > this.top) this.top = L;
    }
    get(x, L, z) { const v = this.map.get(Writer.key(x, L, z)); return v == null ? -1 : v & 255; }
}

/**
 * A part's frame: its middle (x, z), its face, its floor's ground G; put/box in local (a, b, l).
 */
function frame(W, x, z, face, G, rng, mats) {
    const [ra, rb] = rotLot(1, 0, face), [sa, sb] = rotLot(0, 1, face);
    const wx = (a, b) => x + ra * a + sa * b, wz = (a, b) => z + rb * a + sb * b;
    const Lw = (l) => G + 1 + l;
    const f = {
        x, z, face, G, rng, mats, W,
        put: (a, b, l, t, s = 0) => W.set(wx(a, b), Lw(l), wz(a, b), t, s ? rotShape(s, face) : 0),
        box(a0, a1, l0, l1, b0, b1, t, s = 0) {
            for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++) for (let b = Math.min(b0, b1); b <= Math.max(b0, b1); b++) {
                for (let l = Math.min(l0, l1); l <= Math.max(l0, l1); l++) f.put(a, b, l, t, s);
            }
        },
        /** A world point of a local place (y: the floor's top of layer l, as MagicHouse.pt). */
        pt: (a, b, l = 0) => ({ x: wx(a, b), z: wz(a, b), y: Lw(l) - 1.5 }),
        yaw(a, b) { const o = f.pt(0, 0), q = f.pt(a, b); return Math.atan2(-(q.x - o.x), -(q.z - o.z)); },
        along(a, b) { const o = f.pt(0, 0), q = f.pt(a, b); return Math.atan2(-(q.z - o.z), q.x - o.x); },
        get: (a, b, l) => W.get(wx(a, b), Lw(l), wz(a, b)),
        /** A doorway 3 × 6 in a wall at (a, b) whose inside is (ia, ib) from it, with a leaf (Doors.js). */
        door(a, b, l, ia, ib, color = 0x6b4424) {
            const alongA = ib !== 0;
            if (alongA) f.box(a - 1, a + 1, l, l + BUILD.DOOR_H - 1, b, b, BLOCK.AIR); else f.box(a, a, l, l + BUILD.DOOR_H - 1, b - 1, b + 1, BLOCK.AIR);
            const dp = f.pt(a, b, l), di = f.pt(a + ia, b + ib, l);
            const fr = alongA ? rotLot(1, 0, face) : rotLot(0, 1, face);
            W.doors.push({ x: dp.x, y: dp.y, z: dp.z, ry: inwardRy(Math.atan2(-fr[1], fr[0]), di.x - dp.x, di.z - dp.z), w: BUILD.DOOR_W, h: BUILD.DOOR_H, color });
        },
        /** A window opening with glass (Houses.setExtraPanes) in a wall along a (b fixed) or along b. */
        window(a0, a1, b0, b1, l0, l1) {
            f.box(a0, a1, l0, l1, b0, b1, BLOCK.AIR);
            if (!mats.glass) return;
            const q0 = f.pt(a0, b0), q1 = f.pt(a1, b1);
            const alongA = b0 === b1;
            W.windows.push({ x: (q0.x + q1.x) / 2, z: (q0.z + q1.z) / 2, y: (Lw(l0) + Lw(l1)) / 2 - 1, ry: alongA ? f.along(1, 0) : f.along(0, 1), w: (alongA ? Math.abs(a1 - a0) : Math.abs(b1 - b0)) + 1, h: l1 - l0 + 1 });
        },
        /** The ground at a local place (its own top layer — the grid). */
        ground: null,
        wx, wz, Lw,
    };
    return f;
}

/** A ramp's shape turned with the part (local RAMP_PZ — rising towards +b — becomes the world's). */
function rotShape(s, face) {
    if (s < SHAPE.RAMP_PX || s > SHAPE.RAMP_NZ) return s;
    const dir = { [SHAPE.RAMP_PX]: [1, 0], [SHAPE.RAMP_NX]: [-1, 0], [SHAPE.RAMP_PZ]: [0, 1], [SHAPE.RAMP_NZ]: [0, -1] }[s];
    const [x, z] = rotLot(dir[0], dir[1], face);
    return x > 0 ? SHAPE.RAMP_PX : x < 0 ? SHAPE.RAMP_NX : z > 0 ? SHAPE.RAMP_PZ : SHAPE.RAMP_NZ;
}

// =============================================================================== materials
function styleOf(recipe, part, rng) {
    const st = recipe.style || {};
    const pick = (l) => l[Math.floor(rng() * l.length)];
    const wallK = part.wall || st.wall;
    const roofK = part.roof || st.roof;
    const wall = M(wallK, pick([BLOCK.CS_GREY, BLOCK.CS_GREY, BLOCK.CS_SAND, BLOCK.BRICK, BLOCK.CS_WHITE]));
    const roof = roofK && ROOF_KEYS.has(roofK) ? M(roofK) : roofK ? M(roofK) : pick([BLOCK.ROOF_RED, BLOCK.ROOF_SLATE, BLOCK.ROOF_BLUE]);
    const trimK = st.trim && st.trim !== wallK ? st.trim : null;
    const trim = M(trimK, wall === BLOCK.CS_DARK ? BLOCK.CS_GREY : wall === BLOCK.CS_WHITE || wall === BLOCK.GOLD ? BLOCK.CS_SAND : wall === BLOCK.PLANKS || LOGS.has(wall) ? BLOCK.PLANKS_DARK : BLOCK.CS_DARK);
    const floor = LOGS.has(wall) || wall === BLOCK.PLANKS ? BLOCK.PLANKS : BLOCK.PLANKS_DARK;
    return { wall, roof, trim, floor, glass: st.glass !== false, wallK, roofK };
}

// =============================================================================== the ground
/** The ground's sampled heights round the place: G(x, z) (null — unknown), wet(x, z). */
function groundOf(grid) {
    const G = (x, z) => {
        if (!grid) return null;
        const i = Math.round(x) - grid.x0, k = Math.round(z) - grid.z0;
        if (i < 0 || k < 0 || i >= grid.w || k >= grid.d) return null;
        const v = grid.G[k * grid.w + i];
        return v === -32768 ? null : v;
    };
    const wet = (x, z) => {
        if (!grid) return false;
        const i = Math.round(x) - grid.x0, k = Math.round(z) - grid.z0;
        return i >= 0 && k >= 0 && i < grid.w && k < grid.d && grid.wet[k * grid.w + i] === 1;
    };
    return { G, wet };
}

/** The floor of a part: the middle of the ground under its rectangle (dry columns), and how much of it is water. */
function siteOf(gr, rect, fallback) {
    const hs = [];
    let wetN = 0, n = 0;
    const step = Math.max(1, Math.round(Math.max(rect.x1 - rect.x0, rect.z1 - rect.z0) / 24));
    for (let x = Math.floor(rect.x0); x <= Math.ceil(rect.x1); x += step) for (let z = Math.floor(rect.z0); z <= Math.ceil(rect.z1); z += step) {
        n++;
        if (gr.wet(x, z)) { wetN++; continue; }
        const h = gr.G(x, z);
        if (h != null) hs.push(h);
    }
    hs.sort((a, b) => a - b);
    return { G: hs.length ? hs[Math.floor(hs.length * 0.5)] : fallback, max: hs.length ? hs[hs.length - 1] : fallback, min: hs.length ? hs[0] : fallback, wet: n ? wetN / n : 0 };
}

/** The world rectangle of a part (half sizes ha, hb round x, z, turned by face). */
function rectOf(x, z, ha, hb, face) {
    const odd = face === 1 || face === 3;
    const A = odd ? hb : ha, B = odd ? ha : hb;
    return { x0: x - A, x1: x + A, z0: z - B, z1: z + B };
}

/** Clear the land over a part (bumps, trees, bushes), lay the foundation under it (where the ground is lower). */
function prepare(W, gr, rect, G, H, margin = 1) {
    const r = { x0: Math.floor(rect.x0) - margin, x1: Math.ceil(rect.x1) + margin, z0: Math.floor(rect.z0) - margin, z1: Math.ceil(rect.z1) + margin };
    let hi = G;
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) {
        const h = gr.G(x, z);
        if (h == null) continue;
        if (h > hi) hi = h;
        if (h < G && !gr.wet(x, z)) for (let L = Math.max(h + 1, G - 12); L <= G; L++) W.fill.push(x, L, z, L === G ? BLOCK.STONE : BLOCK.DIRT);
    }
    W.clear.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, L0: G + 1, L1: Math.min(G + 96, Math.max(G + H + 3, hi + 14)) });
}

// =============================================================================== the parts
/** A house (MagicHouse's — rooms, door, beds, chests, glass) in the materials asked. */
function partHouse(W, p, ctx) {
    const { x, z, face, G, st, seed } = ctx;
    const [w, d] = p.size;
    let level = w >= 30 || d >= 24 ? 5 : w >= 24 ? 4 : w >= 19 ? 3 : w >= 15 ? 2 : 1;
    if ((p.floors || 1) >= 2) level = Math.max(level, 3);
    if (p.kind === 'hall') level = Math.max(level, 4);
    const plan = housePlan({ seed, level, x, z, G, face, woods: LOGS.has(st.wall) ? [st.wall] : [] });
    const roofOld = new Set();
    for (const c of plan.cells) if (isRoofBlock(c[3]) || (c[4] && c[3] !== BLOCK.AIR)) roofOld.add(c[3]);
    const asked = !!st.wallK;
    for (const c of plan.cells) {
        let t = c[3];
        if (asked && (LOGS.has(t) || (STONES.has(t) && c[1] > G))) t = st.wall;
        if (roofOld.has(t) && st.roofK) t = st.roof;
        W.set(c[0], c[1], c[2], t, c[4] || 0);
    }
    for (const f of plan.fill) W.fill.push(f[0], f[1], f[2], f[3]);
    if (plan.door) W.doors.push({ ...plan.door, color: 0x7a4f2a });
    W.windows.push(...plan.windows);
    W.beds.push(...plan.beds);
    W.chests.push(...plan.chests);
    return plan.top - G - 1;
}

/** A round tower: walls, a door, slit windows, spiral stairs to its top, battlements or a spire. */
function towerAt(f, a0, b0, r, h, st, { spire = false, door = true, doorSide = [0, -1], lantern = false, rng }) {
    const R2 = r * r, ri = r - 1.2;
    const top = h - 1;
    for (let a = -r - 1; a <= r + 1; a++) for (let b = -r - 1; b <= r + 1; b++) {
        const d2 = a * a + b * b;
        if (d2 > (r + 0.5) * (r + 0.5)) continue;
        f.put(a0 + a, b0 + b, -1, st.floor === BLOCK.PLANKS ? BLOCK.COBBLE : st.trim);
        const shell = d2 > ri * ri;
        for (let l = 0; l <= top; l++) f.put(a0 + a, b0 + b, l, shell ? (l === 0 || l % 8 === 7 ? st.trim : st.wall) : BLOCK.AIR);
        // the top platform (its stairwell left open)
        if (!shell) f.put(a0 + a, b0 + b, top, st.floor);
    }
    // spiral stairs along the inside of the wall: a block a layer, round and round, up to the platform
    const rs = Math.max(1.4, ri - 1.1), perTurn = Math.max(10, Math.round(2 * Math.PI * rs));
    const startAng = Math.atan2(-doorSide[1], doorSide[0]) + Math.PI * 0.5;
    for (let s = 0; s < top; s++) {
        const ang = startAng + (s / perTurn) * Math.PI * 2;
        for (const rr of [rs - 0.6, rs + 0.6]) {
            const a = Math.round(Math.cos(ang) * rr), b = Math.round(Math.sin(ang) * rr);
            if (a * a + b * b > ri * ri) continue;
            f.put(a0 + a, b0 + b, s, st.trim);
            for (let k = 1; k <= 4; k++) if (f.get(a0 + a, b0 + b, s + k) === st.floor) f.put(a0 + a, b0 + b, s + k, BLOCK.AIR); // (the stairwell through the platform)
        }
    }
    // a pillar in the middle of a wide tower (the stairs wind round it)
    if (ri >= 4) f.box(a0, a0, 0, top - 1, b0, b0, st.trim);
    if (door) {
        const [da, db] = doorSide;
        const ea = Math.round(da * r), eb = Math.round(db * r);
        for (let k = 0; k <= 1; k++) f.box(a0 + ea - da * k - (db ? 1 : 0), a0 + ea - da * k + (db ? 1 : 0), 0, BUILD.DOOR_H - 1, b0 + eb - db * k - (da ? 1 : 0), b0 + eb - db * k + (da ? 1 : 0), BLOCK.AIR);
        f.door(a0 + ea, b0 + eb, 0, -da, -db);
    }
    // slit windows up the tower, turning round it
    for (let l = 9, k = 0; l < top - 3; l += 7, k++) {
        const ang = k * 2.1 + 0.6;
        const a = Math.round(Math.cos(ang) * r), b = Math.round(Math.sin(ang) * r);
        f.window(a0 + a, a0 + a, b0 + b, b0 + b, l, l + 2);
    }
    if (lantern) {
        // the lighthouse's lantern room: glass all round, a fire of lanterns, a gold rim, a cap
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
            const d2 = a * a + b * b;
            if (d2 > R2) continue;
            const rim = d2 > (r - 1) * (r - 1);
            for (let l = top + 1; l <= top + 5; l++) f.put(a0 + a, b0 + b, l, rim ? (l === top + 1 || l === top + 5 ? BLOCK.GOLD : (Math.abs(a) + Math.abs(b)) % 3 === 0 ? st.trim : BLOCK.AIR) : BLOCK.AIR);
        }
        f.box(a0 - 1, a0 + 1, top + 1, top + 3, b0 - 1, b0 + 1, BLOCK.LANTERN);
        f.box(a0, a0, top + 1, top + 4, b0, b0, BLOCK.GOLD);
        cone(f, a0, b0, r + 1, top + 6, Math.max(3, r), st.roof);
        return top + 6 + r;
    }
    if (spire) {
        const sh = Math.round(r * 2.2 + 3);
        cone(f, a0, b0, r + 1, top + 1, sh, st.roof);
        f.box(a0, a0, top + sh + 1, top + sh + 2, b0, b0, BLOCK.GOLD); // (the finial)
        return top + sh + 2;
    }
    // battlements: a parapet with merlons round the platform
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        const d2 = a * a + b * b;
        if (d2 > (r + 0.5) * (r + 0.5) || d2 <= ri * ri) continue;
        f.put(a0 + a, b0 + b, top + 1, st.wall);
        if ((Math.round(Math.atan2(b, a) * r) & 1) === 0) f.put(a0 + a, b0 + b, top + 2, st.wall);
    }
    void rng;
    return top + 2;
}

/** A cone roof (a spire) over a circle of radius r, from layer l0, height h. */
function cone(f, a0, b0, r, l0, h, t) {
    for (let k = 0; k < h; k++) {
        const rr = r * (1 - k / h);
        if (rr < 0.35) { f.put(a0, b0, l0 + k, t); continue; }
        const R = Math.ceil(rr);
        for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
            const d = Math.hypot(a, b);
            if (d <= rr + 0.2 && d > rr - 1.3) f.put(a0 + a, b0 + b, l0 + k, t);
            else if (d <= rr - 1.3) f.put(a0 + a, b0 + b, l0 + k, BLOCK.AIR);
        }
    }
}

/** A straight wall from (a0, b0) to (a1, b1) — thick 3, a walkway on top, merlons outside; `out` the outer side. */
function curtain(f, a0, b0, a1, b1, h, st, out = [0, -1]) {
    const alongA = b0 === b1;
    const n = alongA ? Math.abs(a1 - a0) : Math.abs(b1 - b0);
    const sa = alongA ? Math.sign(a1 - a0) || 1 : 0, sb = alongA ? 0 : Math.sign(b1 - b0) || 1;
    for (let i = 0; i <= n; i++) {
        const a = a0 + sa * i, b = b0 + sb * i;
        for (let t = -1; t <= 1; t++) {
            const ca = a + (alongA ? 0 : t), cb = b + (alongA ? t : 0);
            f.put(ca, cb, -1, st.trim);
            for (let l = 0; l < h; l++) f.put(ca, cb, l, l === 0 || l === h - 1 ? st.trim : st.wall);
        }
        // the parapet on the outer edge, merlons every other block; a low rail on the inner edge
        const oa = a + out[0], ob = b + out[1], ia = a - out[0], ib = b - out[1];
        f.put(oa, ob, h, st.wall);
        if (i % 2 === 0) f.put(oa, ob, h + 1, st.wall);
        f.put(ia, ib, h, st.trim);
    }
}

/** A stair of ramps up the inside of a wall: from (a, b) going along (da, db) up to layer h; 2 wide (side (sa, sb)). */
function stair(f, a, b, da, db, h, sa, sb, t) {
    for (let i = 0; i < h; i++) {
        for (let w = 0; w < 2; w++) {
            const ca = a + da * i + sa * w, cb = b + db * i + sb * w;
            for (let l = 0; l < i; l++) f.put(ca, cb, l, t);
            f.put(ca, cb, i, t, da > 0 ? SHAPE.RAMP_PX : da < 0 ? SHAPE.RAMP_NX : db > 0 ? SHAPE.RAMP_PZ : SHAPE.RAMP_NZ);
            for (let l = i + 1; l < i + 5; l++) f.put(ca, cb, l, BLOCK.AIR);
        }
    }
}

function partTower(W, p, ctx) {
    const { st, rng } = ctx;
    const f = ctx.f;
    const r = Math.max(4, Math.round(Math.min(p.size[0], p.size[1]) / 2)); // (4 at least: the spiral stairs and the hero inside)
    const h = Math.max(12, Math.round(p.size[2] * (p.spires ? 0.72 : 1)));
    const n = p.count || 1;
    let top = 0;
    for (let i = 0; i < n; i++) {
        const a = n === 1 ? 0 : Math.round((i - (n - 1) / 2) * (2 * r + 6));
        top = Math.max(top, towerAt(f, a, 0, r, h + (i % 2) * 3, st, { spire: p.spires || rng() < 0.45, rng }));
    }
    return top;
}

function partLighthouse(W, p, ctx) {
    const r = Math.max(4, Math.round(Math.min(p.size[0], p.size[1]) / 2));
    const st = { ...ctx.st, wall: ctx.st.wallK ? ctx.st.wall : BLOCK.CS_WHITE, trim: ctx.st.wallK ? ctx.st.trim : BLOCK.BRICK };
    return towerAt(ctx.f, 0, 0, r, Math.max(16, p.size[2] - r - 6), st, { lantern: true, rng: ctx.rng });
}

function partWindmill(W, p, ctx) {
    const { f, st } = ctx;
    const r = Math.max(4, Math.round(Math.min(p.size[0], p.size[1]) / 2));
    const h = Math.max(12, p.size[2] - 6);
    const st2 = { ...st, wall: st.wallK ? st.wall : BLOCK.PLASTER, trim: st.wallK ? st.trim : BLOCK.PLANKS_DARK, roof: st.roofK ? st.roof : BLOCK.THATCH };
    const top = towerAt(f, 0, 0, r, h, st2, { spire: true, rng: ctx.rng });
    // the sails: four arms of frames and cloth on a hub at the front, high on the tower (fixed to its wall)
    const hl = h - 2, hb = -r - 1;
    f.box(0, 0, hl, hl, hb, -r, BLOCK.PLANKS_DARK);
    const L = Math.min(hl - 2, r + 7);
    for (let k = 0; k < 4; k++) {
        const ang = k * Math.PI / 2 + Math.PI / 4;
        for (let s = 1; s <= L; s++) {
            const a = Math.round(Math.cos(ang) * s), l = hl + Math.round(Math.sin(ang) * s);
            if (l < 1) continue;
            f.put(a, hb - 1, l, BLOCK.PLANKS_DARK);
            if (s > 2) { const pa = Math.round(Math.cos(ang + 0.32) * s), pl = hl + Math.round(Math.sin(ang + 0.32) * s); if (pl >= 1) f.put(pa, hb - 1, pl, BLOCK.CLOTH_WHITE); }
        }
    }
    f.put(0, hb - 1, hl, BLOCK.GOLD);
    return top;
}

function partWall(W, p, ctx) {
    const { f, st } = ctx;
    const n = Math.round(p.size[0] / 2);
    const h = Math.max(4, Math.round(p.size[2]));
    curtain(f, -n, 0, n, 0, h, st, [0, -1]);
    if (n >= 7) { f.box(-2, 2, 0, Math.min(h - 2, 7), -1, 1, BLOCK.AIR); f.box(-3, 3, Math.min(h - 1, 8), Math.min(h - 1, 8), -1, 1, st.trim); } // (a gate through it)
    stair(f, n - 3, 2, -1, 0, h, 0, 1, st.trim);
    return h + 2;
}

/** A castle: a courtyard behind curtain walls, towers, a gatehouse, a keep (a big house), a well; a moat and a bridge. */
function partCastle(W, p, ctx) {
    const { f, st, rng, gr } = ctx;
    const rt = Math.max(4, Math.min(6, Math.round(Math.min(p.size[0], p.size[1]) / 14)));
    const A = Math.round(p.size[0] / 2) - (p.moat ? rt + 5 : rt + 1), B = Math.round(p.size[1] / 2) - (p.moat ? rt + 5 : rt + 1);
    // (the walls' stairs run along the side walls from the front towers back: they must reach the walkway before the back towers)
    const hw = Math.max(7, Math.min(18, Math.round(p.size[2] * 0.45), 2 * B - 2 * rt - 8));
    const th = hw + 8 + Math.round(rng() * 4);
    const spires = p.spires !== undefined ? p.spires || rng() < 0.4 : rng() < 0.6;
    // the courtyard's paving and the land cleared inside
    for (let a = -A + 2; a <= A - 2; a++) for (let b = -B + 2; b <= B - 2; b++) f.put(a, b, -1, (a + b) % 7 === 0 ? BLOCK.COBBLE : BLOCK.PATH);
    // the four curtain walls (the front one with a gate)
    curtain(f, -A, -B, A, -B, hw, st, [0, -1]);
    curtain(f, -A, B, A, B, hw, st, [0, 1]);
    curtain(f, -A, -B, -A, B, hw, st, [-1, 0]);
    curtain(f, A, -B, A, B, hw, st, [1, 0]);
    // the gate: 7 wide, 9 high, under an arch of trim
    f.box(-3, 3, 0, 8, -B - 1, -B + 1, BLOCK.AIR);
    f.box(-4, 4, 9, 9, -B - 1, -B + 1, st.trim);
    // stairs up to the walkway along both side walls (inside), from behind the front towers to the back
    stair(f, -A + 2, -B + rt + 2, 0, 1, hw, 1, 0, st.trim);
    stair(f, A - 2, -B + rt + 2, 0, 1, hw, -1, 0, st.trim);
    // the towers: the corners, then along the walls, the gatehouse's two first
    const want = p.towers != null ? p.towers : 4 + (A > 34 ? 2 : 0);
    const spots = [[-A, -B], [A, -B], [-A, B], [A, B], [-7, -B - 1], [7, -B - 1], [0, B], [-A, 0], [A, 0], [-Math.round(A / 2), B], [Math.round(A / 2), B], [-A, Math.round(B / 2)]];
    if (want >= 6) spots.splice(0, 0, spots.splice(4, 2)[0], spots.splice(4, 1)[0]); // (the gatehouse first when there are many)
    let top = hw + 2;
    for (let i = 0; i < Math.min(want, spots.length); i++) {
        const [a, b] = spots[i];
        const inward = [Math.abs(a) >= A - 0.5 ? -Math.sign(a) : 0, Math.abs(b) >= B - 0.5 ? -Math.sign(b) : 0];
        const ds = inward[1] ? [0, inward[1]] : [inward[0], 0];
        top = Math.max(top, towerAt(f, a, b, rt, th + (i < 4 ? 0 : 2), st, { spire: spires, doorSide: [ds[0], ds[1]], rng }));
        // (the tower's door opens into the courtyard: the wall's blocks in front of it go)
        const da = a + ds[0] * (rt + 1), db = b + ds[1] * (rt + 1);
        if (ds[1]) f.box(da - 1, da + 1, 0, BUILD.DOOR_H - 1, db - ds[1] * 1, db, BLOCK.AIR); else f.box(da - ds[0], da, 0, BUILD.DOOR_H - 1, db - 1, db + 1, BLOCK.AIR);
    }
    // the keep: a big house at the back of the courtyard, its door to the gate
    const kw = Math.min(2 * A - 10, 34), kd = Math.min(Math.round(B * 0.9), 24);
    const kb = B - 4 - Math.ceil(kd / 2) - 2;
    const keep = { kind: 'house', size: [kw, kd, 14], floors: kw >= 24 ? 2 : 1 };
    const kc = f.pt(0, kb);
    const kG = ctx.G;
    partHouse(W, keep, { ...ctx, x: Math.round(kc.x), z: Math.round(kc.z), G: kG, face: ctx.face, seed: ctx.seed + 17 });
    // a well in the courtyard, a path from the gate
    wellAt(f, Math.round(A / 2.5), -Math.round(B / 3), st);
    for (let b = -B + 1; b < kb - kd / 2; b++) f.box(-1, 1, -1, -1, b, b, BLOCK.COBBLE);
    // the moat round the walls, a bridge over it before the gate
    if (p.moat) {
        for (let a = -A - rt - 5; a <= A + rt + 5; a++) for (let b = -B - rt - 5; b <= B + rt + 5; b++) {
            const out = Math.max(Math.abs(a) - A, Math.abs(b) - B);
            if (out < rt + 2 || out > rt + 4) continue;
            const was = f.get(a, b, 0);
            if (was !== -1 && was !== BLOCK.AIR) continue; // (a tower's foot stands there: the moat goes round it)
            f.put(a, b, -4, BLOCK.STONE);
            for (const l of [-3, -2, -1]) f.put(a, b, l, BLOCK.WATER);
            f.put(a, b, 0, BLOCK.AIR);
        }
        f.box(-3, 3, -1, -1, -B - rt - 5, -B - 2, BLOCK.PLANKS_DARK);
        f.box(-3, -3, 0, 0, -B - rt - 5, -B - 2, BLOCK.FENCE); f.box(3, 3, 0, 0, -B - rt - 5, -B - 2, BLOCK.FENCE);
    }
    void gr;
    return top;
}

/** A city: streets on a grid, a square with a fountain, houses of every size facing the streets, walls and gates. */
function partCity(W, p, ctx) {
    const { st, rng, gr } = ctx;
    const f = ctx.f;
    const A = Math.round(p.size[0] / 2), B = Math.round(p.size[1] / 2);
    // a block of houses between streets: two houses across (a lot 21 m — the biggest of them 19), two rows back to back (15 m each)
    const S = BUILD.STREET, blockA = 42, blockB = 30;
    const nx = Math.max(1, Math.floor((2 * A - S) / (blockA + S))), nz = Math.max(1, Math.floor((2 * B - S) / (blockB + S)));
    const spanA = nx * (blockA + S) + S, spanB = nz * (blockB + S) + S;
    const a0 = -Math.floor(spanA / 2), b0 = -Math.floor(spanB / 2);
    const pathT = BLOCK.PATH, cobble = BLOCK.COBBLE;
    // the streets: the top of the land itself becomes a path (it follows the hills)
    const street = (a, b) => { const q = f.pt(a, b); W.paths.set(q.x + ',' + q.z, (a + b) % 9 === 0 ? cobble : pathT); };
    for (let i = 0; i <= nx; i++) { const sa = a0 + i * (blockA + S); for (let a = sa; a < sa + S; a++) for (let b = b0; b < b0 + spanB; b++) street(a, b); }
    for (let k = 0; k <= nz; k++) { const sb = b0 + k * (blockB + S); for (let b = sb; b < sb + S; b++) for (let a = a0; a < a0 + spanA; a++) street(a, b); }
    // the square: the middle block (its own ground), a fountain in it, a statue or a well
    const mi = Math.floor(nx / 2), mk = Math.floor(nz / 2);
    const lots = [];
    const wantHouses = p.houses || Math.max(4, Math.min(40, Math.round((nx * nz) * 3.2)));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        const ca = a0 + S + i * (blockA + S), cb = b0 + S + k * (blockB + S); // the block's corner
        if (i === mi && k === mk) { lots.push({ square: true, a: ca + blockA / 2, b: cb + blockB / 2 }); continue; }
        // four houses on a block: two rows (front ones face −b, back ones face +b), two across
        for (const [ha, hb, face] of [[ca + blockA / 4, cb + blockB / 4, 0], [ca + 3 * blockA / 4, cb + blockB / 4, 0], [ca + blockA / 4, cb + 3 * blockB / 4, 2], [ca + 3 * blockA / 4, cb + 3 * blockB / 4, 2]]) lots.push({ a: ha, b: hb, face });
    }
    // which lots get a house (as many as asked, near the square first)
    const homes = lots.filter((q) => !q.square).sort((q1, q2) => Math.hypot(q1.a, q1.b) - Math.hypot(q2.a, q2.b) + (rng() - 0.5) * 8).slice(0, wantHouses);
    let top = 0;
    for (const q of homes) {
        const c = f.pt(Math.round(q.a), Math.round(q.b));
        const x = Math.round(c.x), z = Math.round(c.z);
        const hface = (ctx.face + q.face) % 4;
        const level = rng() < 0.4 ? 2 : 1; // (a lot holds a house of level 1 or 2: 13 / 19 m wide, 13 deep)
        const sizes = [0, [13, 11], [16, 13]][level];
        const site = siteOf(gr, rectOf(x, z, sizes[0] / 2, sizes[1] / 2, hface), ctx.G);
        if (site.wet > 0.25 || Math.abs(site.G - ctx.G) > 14) continue; // (no house in a lake or up a cliff)
        const hst = { ...st };
        if (!st.wallK) hst.wall = [BLOCK.PLASTER, BLOCK.BRICK, BLOCK.CS_SAND, BLOCK.WOOD, BLOCK.CS_GREY][Math.floor(rng() * 5)];
        if (!st.roofK) hst.roof = [BLOCK.ROOF_RED, BLOCK.ROOF_RED, BLOCK.ROOF_SLATE, BLOCK.THATCH, BLOCK.ROOF_BLUE][Math.floor(rng() * 5)];
        hst.wallK = hst.wallK || 'x'; hst.roofK = hst.roofK || 'x';
        prepare(W, gr, rectOf(x, z, sizes[0] / 2 + 1, sizes[1] / 2 + 1, hface), site.G, 16, 0);
        partHouse(W, { kind: 'house', size: [sizes[0], sizes[1], 11], floors: level >= 3 ? 2 : 1 }, { ...ctx, x, z, G: site.G, face: hface, st: hst, seed: ctx.seed + Math.round(q.a * 31 + q.b * 7) });
        top = Math.max(top, site.G + 20);
    }
    // the square: paved, a fountain in its middle, benches of planks, lanterns on posts at its corners
    const sq = lots.find((q) => q.square);
    if (sq) {
        const c = f.pt(Math.round(sq.a), Math.round(sq.b));
        const block = Math.min(blockA, blockB);
        const site = siteOf(gr, rectOf(c.x, c.z, block / 2, block / 2, 0), ctx.G);
        const sf = frame(W, Math.round(c.x), Math.round(c.z), ctx.face, site.G, rng, st);
        prepare(W, gr, rectOf(c.x, c.z, block / 2, block / 2, 0), site.G, 10, 0);
        for (let a = -block / 2; a < block / 2; a++) for (let b = -block / 2; b < block / 2; b++) sf.put(a, b, -1, (Math.abs(a) + Math.abs(b)) % 4 === 0 ? BLOCK.CS_WHITE : cobble);
        fountainAt(sf, 0, 0, 5, st, rng);
        for (const [a, b] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) { sf.box(a, a, 0, 4, b, b, BLOCK.FENCE); sf.put(a, b, 5, BLOCK.LANTERN); }
        for (const s of [-1, 1]) { sf.box(-3, 3, 0, 0, s * 9, s * 9, BLOCK.PLANKS_DARK); }
    }
    // the walls round it with a tower at each corner and a gate in each side
    if (p.walls) {
        const hw = 9, WA = Math.floor(spanA / 2) + 3, WB = Math.floor(spanB / 2) + 3;
        const wst = { ...st, wall: st.wallK && st.wall !== BLOCK.PLASTER ? st.wall : BLOCK.CS_GREY, trim: BLOCK.CS_DARK };
        // (the walls follow the land: each piece of 8 m on its own ground)
        const seg = (a, b, alongA, out) => {
            const c = f.pt(a, b);
            const site = siteOf(gr, rectOf(c.x, c.z, 4, 4, 0), ctx.G);
            const sf = frame(W, Math.round(c.x), Math.round(c.z), ctx.face, site.G, rng, wst);
            prepare(W, gr, rectOf(c.x, c.z, 5, 5, 0), site.G, hw + 2, 0);
            if (alongA) curtain(sf, -4, 0, 4, 0, hw, wst, out); else curtain(sf, 0, -4, 0, 4, hw, wst, out);
            return sf;
        };
        for (let a = -WA + 4; a <= WA - 4; a += 9) {
            for (const [b, out] of [[-WB, [0, -1]], [WB, [0, 1]]]) {
                const sf = seg(a, b, true, out);
                if (Math.abs(a) < 5) sf.box(-2, 2, 0, 6, -1, 1, BLOCK.AIR); // (the gate)
            }
        }
        for (let b = -WB + 4; b <= WB - 4; b += 9) {
            for (const [a, out] of [[-WA, [-1, 0]], [WA, [1, 0]]]) {
                const sf = seg(a, b, false, out);
                if (Math.abs(b) < 5) sf.box(-1, 1, 0, 6, -2, 2, BLOCK.AIR);
            }
        }
        for (const [a, b] of [[-WA, -WB], [WA, -WB], [-WA, WB], [WA, WB]]) {
            const c = f.pt(a, b);
            const site = siteOf(gr, rectOf(c.x, c.z, 4, 4, 0), ctx.G);
            const sf = frame(W, Math.round(c.x), Math.round(c.z), ctx.face, site.G, rng, wst);
            prepare(W, gr, rectOf(c.x, c.z, 5, 5, 0), site.G, hw + 14, 0);
            top = Math.max(top, site.G + towerAt(sf, 0, 0, 4, hw + 7, wst, { spire: p.spires, doorSide: [-Math.sign(a), 0], rng }));
        }
    }
    return top - ctx.G;
}

function wellAt(f, a0, b0, st) {
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        const ring = Math.abs(a) === 2 || Math.abs(b) === 2;
        if (ring) { f.put(a0 + a, b0 + b, -1, BLOCK.COBBLE); f.put(a0 + a, b0 + b, 0, BLOCK.COBBLE); }
        else { for (let l = -6; l <= -2; l++) f.put(a0 + a, b0 + b, l, l === -6 ? BLOCK.STONE : l <= -4 ? BLOCK.WATER : BLOCK.AIR); f.put(a0 + a, b0 + b, -1, BLOCK.AIR); }
        if (ring) for (let l = -6; l <= -2; l++) f.put(a0 + a, b0 + b, l, BLOCK.COBBLE);
    }
    f.box(a0 - 2, a0 - 2, 1, 4, b0, b0, BLOCK.WOOD); f.box(a0 + 2, a0 + 2, 1, 4, b0, b0, BLOCK.WOOD);
    f.box(a0 - 2, a0 + 2, 5, 5, b0, b0, BLOCK.PLANKS_DARK);
    f.box(a0 - 3, a0 + 3, 6, 6, b0 - 1, b0 + 1, st.roof);
    f.box(a0 - 2, a0 + 2, 7, 7, b0, b0, st.roof);
    return 8;
}

function fountainAt(f, a0, b0, r, st, rng) {
    const stone = st.wallK ? st.wall : BLOCK.CS_WHITE;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        const d = Math.hypot(a, b);
        if (d > r + 0.4) continue;
        f.put(a0 + a, b0 + b, -2, BLOCK.STONE);
        if (d > r - 0.8) { f.put(a0 + a, b0 + b, -1, stone); f.put(a0 + a, b0 + b, 0, stone); }
        else { f.put(a0 + a, b0 + b, -1, BLOCK.WATER); f.put(a0 + a, b0 + b, 0, BLOCK.AIR); }
    }
    // the column and two bowls, water in the upper one
    const h = Math.max(3, Math.round(r * 0.8));
    f.box(a0, a0, -1, h + 2, b0, b0, stone);
    const bowl = (l, br) => {
        for (let a = -br; a <= br; a++) for (let b = -br; b <= br; b++) {
            const d = Math.hypot(a, b);
            if (d > br + 0.4) continue;
            f.put(a0 + a, b0 + b, l, stone);
            if (d > br - 0.9) f.put(a0 + a, b0 + b, l + 1, stone); else if (a || b) f.put(a0 + a, b0 + b, l + 1, BLOCK.WATER);
        }
    };
    bowl(Math.round(h * 0.55), Math.max(2, Math.round(r * 0.55)));
    bowl(h + 1, 1);
    f.put(a0, b0, h + 3, BLOCK.GOLD);
    void rng;
    return h + 4;
}

function partWell(W, p, ctx) { return wellAt(ctx.f, 0, 0, ctx.st); }
function partFountain(W, p, ctx) { return fountainAt(ctx.f, 0, 0, Math.max(3, Math.round(Math.min(p.size[0], p.size[1]) / 2)), ctx.st, ctx.rng); }

/** A bridge along b: an arched deck over the ground or the water, piers, railings, lanterns. */
function partBridge(W, p, ctx) {
    const { f, st, gr } = ctx;
    const hw = Math.max(2, Math.round(p.size[0] / 2)), n = Math.round(p.size[1] / 2);
    const end0 = gr.G(f.pt(0, -n).x, f.pt(0, -n).z), end1 = gr.G(f.pt(0, n).x, f.pt(0, n).z);
    const base = Math.max(end0 ?? ctx.G, end1 ?? ctx.G) - ctx.G;
    const rise = Math.max(2, Math.round(p.size[2] * 0.6));
    const deck = st.wallK && !LOGS.has(st.wall) && st.wall !== BLOCK.PLANKS ? st.wall : BLOCK.PLANKS_DARK;
    const stone = st.wallK ? st.wall : BLOCK.CS_GREY;
    let top = 0;
    for (let b = -n; b <= n; b++) {
        const k = b / n;
        const l = base + Math.round(rise * (1 - k * k));
        top = Math.max(top, l + 2);
        for (let a = -hw; a <= hw; a++) {
            f.put(a, b, l - 1, deck);
            for (let q = l; q <= l + 5; q++) if (Math.abs(a) < hw) f.put(a, b, q, BLOCK.AIR);
        }
        // railings and an arch's stone under the deck's edges
        f.put(-hw, b, l, BLOCK.FENCE); f.put(hw, b, l, BLOCK.FENCE);
        f.put(-hw - 1, b, l - 1, stone); f.put(hw + 1, b, l - 1, stone);
        if (b % 8 === 0) { f.put(-hw, b, l + 1, BLOCK.FENCE); f.put(-hw, b, l + 2, BLOCK.LANTERN); f.put(hw, b, l + 1, BLOCK.FENCE); f.put(hw, b, l + 2, BLOCK.LANTERN); }
        // piers down to the ground (or to the bottom of the water) every 9 m
        if (b % 9 === 0 || Math.abs(b) === n) {
            const w = f.pt(0, b);
            const gnd = (gr.G(w.x, w.z) ?? ctx.G) - ctx.G;
            for (let a = -hw - 1; a <= hw + 1; a++) for (let q = Math.min(gnd, l - 2) - 2; q <= l - 2; q++) f.put(a, b, q, stone);
        }
    }
    return top;
}

function partArch(W, p, ctx) {
    const { f, st } = ctx;
    const A = Math.max(4, Math.round(p.size[0] / 2)), h = Math.max(9, Math.round(p.size[2])), t = Math.max(1, Math.round(p.size[1] / 2));
    const inner = A - 3, spring = h - inner - 2;
    for (let a = -A; a <= A; a++) for (let b = -t; b <= t; b++) {
        for (let l = -1; l <= h; l++) {
            const ia = Math.abs(a);
            let solid;
            if (ia > inner) solid = true;
            else if (l >= spring) solid = Math.hypot(a, l - spring) > inner;
            else solid = false;
            if (l === -1) solid = true;
            if (solid) f.put(a, b, l, l === h || ia >= A || l === -1 ? st.trim : st.wall);
        }
    }
    f.box(-1, 1, h + 1, h + 1, -t, t, BLOCK.GOLD);
    return h + 2;
}

function partPyramid(W, p, ctx) {
    const { f, st } = ctx;
    const A = Math.round(p.size[0] / 2), B = Math.round(p.size[1] / 2);
    const stone = st.wallK ? st.wall : BLOCK.CS_SAND, trim = st.wallK ? st.trim : BLOCK.CS_WHITE;
    const H = Math.min(Math.round(p.size[2]), Math.min(A, B));
    for (let l = 0; l < H; l++) {
        const a1 = Math.round(A * (1 - l / H)), b1 = Math.round(B * (1 - l / H));
        if (a1 < 0 || b1 < 0) break;
        for (let a = -a1; a <= a1; a++) for (let b = -b1; b <= b1; b++) f.put(a, b, l, l % 5 === 4 ? trim : stone);
        f.box(-a1, a1, -1, -1, -b1, b1, stone);
    }
    f.put(0, 0, H, BLOCK.GOLD);
    // a corridor 3 × 6 from the front to a chamber inside, a chest in it
    const ch = Math.min(5, Math.floor(H / 2) - 1);
    if (H >= 9) {
        f.box(-1, 1, 0, 5, -B, -ch, BLOCK.AIR);
        f.box(-ch, ch, 0, Math.min(7, H - ch - 2), -ch, ch, BLOCK.AIR);
        f.box(-ch, ch, -1, -1, -ch, ch, BLOCK.GOLD);
        f.put(-ch, 3, ch, BLOCK.LANTERN); f.put(ch, 3, ch, BLOCK.LANTERN);
        const q = f.pt(0, ch - 1.5, 0);
        W.chests.push({ k: W.chests.length, ...q, yaw: f.yaw(0, -1), gap: 0.15, scale: 2 });
        // (the stone over the corridor's mouth: a lintel of trim)
        f.box(-2, 2, 6, 6, -B, -B + 1, trim);
    }
    return H + 1;
}

function partObelisk(W, p, ctx) {
    const { f, st } = ctx;
    const r = Math.max(1, Math.round(p.size[0] / 2)), H = Math.round(p.size[2]);
    const stone = st.wallK ? st.wall : BLOCK.CS_DARK;
    f.box(-r - 2, r + 2, -1, 0, -r - 2, r + 2, st.trim);
    f.box(-r - 1, r + 1, 1, 1, -r - 1, r + 1, st.trim);
    for (let l = 2; l < H - r; l++) { const w = l > H * 0.6 && r > 1 ? r - 1 : r; f.box(-w, w, l, l, -w, w, stone); }
    for (let k = 0; k <= r; k++) f.box(-(r - k), r - k, H - r + k, H - r + k, -(r - k), r - k, BLOCK.GOLD);
    return H + 1;
}

/** A temple: a podium with steps, a ring of columns, the cella with its door, a gabled roof; an altar inside. */
function partTemple(W, p, ctx) {
    const { f, st } = ctx;
    const A = Math.round(p.size[0] / 2), B = Math.round(p.size[1] / 2);
    const stone = st.wallK ? st.wall : BLOCK.CS_WHITE, trim = st.wallK ? st.trim : BLOCK.CS_SAND;
    const roof = st.roofK ? st.roof : BLOCK.ROOF_RED;
    const pod = 2, ch = Math.max(9, Math.min(16, Math.round(p.size[2] * 0.55)));
    for (let l = -1; l < pod; l++) f.box(-A + (pod - 1 - l), A - (pod - 1 - l), l, l, -B + (pod - 1 - l), B - (pod - 1 - l), trim);
    const L0 = pod; // the floor of the temple (its blocks on layer L0 − 1)
    // columns round the edge every 3 m
    for (let a = -A + 2; a <= A - 2; a += 3) for (const b of [-B + 2, B - 2]) f.box(a, a, L0, L0 + ch - 1, b, b, stone);
    for (let b = -B + 5; b <= B - 5; b += 3) for (const a of [-A + 2, A - 2]) f.box(a, a, L0, L0 + ch - 1, b, b, stone);
    // the cella: walls, a door 3 × 6, windows high up
    const ca = A - 6, cb0 = -B + 7, cb1 = B - 5;
    for (let l = L0; l < L0 + ch; l++) {
        f.box(-ca, ca, l, l, cb0, cb0, stone); f.box(-ca, ca, l, l, cb1, cb1, stone);
        f.box(-ca, -ca, l, l, cb0, cb1, stone); f.box(ca, ca, l, l, cb0, cb1, stone);
    }
    f.door(0, cb0, L0, 0, 1, 0x5a3a1a);
    for (let b = cb0 + 4; b < cb1 - 2; b += 5) for (const a of [-ca, ca]) f.window(a, a, b, b + 1, L0 + ch - 5, L0 + ch - 3);
    f.box(-ca + 1, ca - 1, L0 - 1, L0 - 1, cb0 + 1, cb1 - 1, BLOCK.CARPET_RED);
    // the altar at the back, gold on it, lanterns
    f.box(-2, 2, L0, L0 + 1, cb1 - 3, cb1 - 2, trim); f.box(-1, 1, L0 + 2, L0 + 2, cb1 - 3, cb1 - 2, BLOCK.GOLD);
    f.put(-ca + 1, cb1 - 1, L0 + 3, BLOCK.LANTERN); f.put(ca - 1, cb1 - 1, L0 + 3, BLOCK.LANTERN);
    // the entablature and the gabled roof along b
    const R = L0 + ch;
    f.box(-A + 1, A - 1, R, R, -B + 1, B - 1, trim);
    for (let k = 0; k <= A; k++) {
        const a1 = A - k;
        if (a1 < 0) break;
        f.box(-a1, a1, R + 1 + k, R + 1 + k, -B + 1, B - 1, roof);
        if (a1 >= 2) f.box(-a1 + 1, a1 - 1, R + 1 + k, R + 1 + k, -B + 2, B - 2, BLOCK.AIR);
        f.box(-a1, a1, R + 1 + k, R + 1 + k, -B + 1, -B + 1, trim); // (the pediment)
    }
    return R + A + 2;
}

/** A ship of planks: a hull, a deck, masts with sails, a cabin at the stern. On the ground it stands as a monument. */
function partShip(W, p, ctx) {
    const { f, st } = ctx;
    const A = Math.max(3, Math.round(p.size[0] / 2)), B = Math.round(p.size[1] / 2);
    const hull = st.wallK && (LOGS.has(st.wall) || st.wall === BLOCK.PLANKS || st.wall === BLOCK.PLANKS_DARK) ? st.wall : BLOCK.PLANKS_DARK;
    const deck = BLOCK.PLANKS, depth = Math.max(3, Math.round(A * 0.9));
    for (let b = -B; b <= B; b++) {
        const k = b / B;
        const half = A * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(k), 2.6))); // (the bow and the stern narrow)
        for (let l = -1; l <= depth; l++) {
            const w = half * Math.sqrt(Math.max(0.05, l / depth + 0.15));
            const W2 = Math.round(w);
            for (let a = -W2; a <= W2; a++) {
                const edge = Math.abs(a) === W2 || l === -1;
                f.put(a, b, l, edge ? hull : l === depth ? deck : BLOCK.AIR);
            }
        }
        const W3 = Math.round(half * 1.07);
        f.put(-W3, b, depth + 1, BLOCK.FENCE); f.put(W3, b, depth + 1, BLOCK.FENCE);
        if (Math.abs(b) === B) f.box(-1, 1, depth + 1, depth + 1, b, b, BLOCK.FENCE);
    }
    // the stern's cabin, its door to the deck
    const cb = Math.round(B * 0.62);
    f.box(-A + 2, A - 2, depth + 1, depth + 6, cb, B - 3, hull);
    f.box(-A + 3, A - 3, depth + 1, depth + 5, cb + 1, B - 4, BLOCK.AIR);
    f.box(-1, 1, depth + 1, depth + 6, cb, cb, BLOCK.AIR);
    f.door(0, cb, depth + 1, 0, 1, 0x4a2f16);
    f.box(-A + 2, A - 2, depth + 7, depth + 7, cb, B - 3, st.roofK ? st.roof : BLOCK.PLANKS_DARK);
    f.put(0, B - 4, depth + 4, BLOCK.LANTERN);
    // masts with square sails of cloth (on yards), the bowsprit
    const masts = B >= 14 ? [-Math.round(B * 0.45), Math.round(B * 0.08)] : [0];
    const mh = Math.round(p.size[2] * 0.85);
    for (const mb of masts) {
        f.box(0, 0, 0, depth + mh, mb, mb, BLOCK.WOOD);
        for (const [y0, sw, sh] of [[depth + 4, A + 2, Math.round(mh * 0.38)], [depth + 5 + Math.round(mh * 0.42), A, Math.round(mh * 0.3)]]) {
            f.box(-sw, sw, y0 + sh, y0 + sh, mb, mb, BLOCK.WOOD);
            for (let l = y0; l < y0 + sh; l++) for (let a = -sw + 1; a <= sw - 1; a++) if (a !== 0) f.put(a, mb - 1, l, BLOCK.CLOTH_WHITE);
        }
        f.put(0, mb, depth + mh + 1, BLOCK.CLOTH_YELLOW); // (the pennant)
    }
    for (let k = 1; k <= 5; k++) f.put(0, -B - k, depth + Math.floor(k / 2), BLOCK.WOOD);
    return depth + mh + 2;
}

function partGarden(W, p, ctx) {
    const { f, rng } = ctx;
    const A = Math.round(p.size[0] / 2), B = Math.round(p.size[1] / 2);
    for (let a = -A; a <= A; a++) for (let b = -B; b <= B; b++) {
        const edge = Math.abs(a) === A || Math.abs(b) === B;
        const path = Math.abs(a) <= 1 || Math.abs(b) <= 1;
        if (edge) { if (!(path && Math.abs(b) === B && b < 0)) f.put(a, b, 0, BLOCK.FENCE); f.put(a, b, -1, BLOCK.PATH); continue; }
        if (path) { f.put(a, b, -1, BLOCK.PATH); continue; }
        const bed = ((Math.abs(a) >> 2) + (Math.abs(b) >> 2)) % 3;
        f.put(a, b, -1, bed === 2 ? BLOCK.GRASS : BLOCK.FARMLAND);
        if (bed === 0) f.put(a, b, 0, BLOCK.FLOWERS); else if (bed === 1 && (a + b) % 2 === 0) f.put(a, b, 0, BLOCK.VEG);
    }
    // hedges and two little trees
    for (const [a, b] of [[-A + 3, B - 3], [A - 3, B - 3]]) {
        f.box(a, a, 0, 3, b, b, BLOCK.WOOD);
        for (let da = -2; da <= 2; da++) for (let db = -2; db <= 2; db++) for (let l = 3; l <= 5; l++) if (Math.hypot(da, db, l - 4) < 2.6 && (da || db || l > 3)) f.put(a + da, b + db, l, rng() < 0.15 ? BLOCK.CHERRY_LEAVES : BLOCK.LEAVES);
    }
    return 7;
}

function partPavilion(W, p, ctx) {
    const { f, st } = ctx;
    const r = Math.max(3, Math.round(Math.min(p.size[0], p.size[1]) / 2)), h = Math.max(6, Math.round(p.size[2] * 0.6));
    const stone = st.wallK ? st.wall : BLOCK.CS_WHITE;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        const d = Math.hypot(a, b);
        if (d > r + 0.4) continue;
        f.put(a, b, -1, st.trim); f.put(a, b, 0, d > r - 0.6 ? st.trim : BLOCK.AIR);
    }
    f.box(-1, 1, 0, 0, -r, -r + 1, BLOCK.AIR); // (the way in)
    const n = 8;
    for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2 + Math.PI / n;
        const a = Math.round(Math.cos(ang) * (r - 0.5)), b = Math.round(Math.sin(ang) * (r - 0.5));
        f.box(a, a, 0, h, b, b, stone);
    }
    cone(f, 0, 0, r + 1, h + 1, Math.max(3, r), st.roof);
    f.put(0, 0, h + 1 + Math.max(3, r), BLOCK.GOLD);
    f.put(0, 0, h, BLOCK.LANTERN);
    return h + r + 3;
}

function partDome(W, p, ctx) {
    const { f, st } = ctx;
    const r = Math.max(5, Math.round(Math.min(p.size[0], p.size[1]) / 2)), wh = Math.max(7, Math.round(p.size[2] - r));
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        const d = Math.hypot(a, b);
        if (d > r + 0.4) continue;
        f.put(a, b, -1, st.floor);
        for (let l = 0; l < wh; l++) f.put(a, b, l, d > r - 0.8 ? (l === 0 || l === wh - 1 ? st.trim : st.wall) : BLOCK.AIR);
    }
    for (let l = 0; l <= r; l++) {
        const rr = Math.sqrt(Math.max(0, r * r - l * l));
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
            const d = Math.hypot(a, b);
            if (d <= rr + 0.4 && d > rr - 1.2) f.put(a, b, wh + l, st.roofK ? st.roof : BLOCK.ROOF_BLUE);
            else if (d <= rr - 1.2) f.put(a, b, wh + l, BLOCK.AIR);
        }
    }
    f.door(0, -r, 0, 0, 1);
    for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4 + 0.39; const a = Math.round(Math.cos(ang) * r), b = Math.round(Math.sin(ang) * r); if (b > -r + 1 || Math.abs(a) > 2) f.window(a, a, b, b, 3, 5); }
    f.put(0, 0, wh + r - 2, BLOCK.LANTERN);
    f.put(0, 0, wh + r + 1, BLOCK.GOLD);
    return wh + r + 2;
}

function partStairs(W, p, ctx) {
    const { f, st } = ctx;
    const hw = Math.max(1, Math.round(p.size[0] / 2)), n = Math.min(Math.round(p.size[1]), Math.round(p.size[2]));
    for (let i = 0; i < n; i++) for (let a = -hw; a <= hw; a++) {
        const b = -Math.round(p.size[1] / 2) + i;
        for (let l = -1; l < i; l++) f.put(a, b, l, st.wall);
        f.put(a, b, i, st.trim, Math.abs(a) === hw ? 0 : SHAPE.RAMP_PZ);
        if (Math.abs(a) === hw) f.put(a, b, i + 1, BLOCK.FENCE);
    }
    return n + 2;
}

function partMaze(W, p, ctx) {
    const { f, rng } = ctx;
    const cell = 4; // a corridor 3 wide, a wall 1 thick
    const nx = Math.max(4, Math.floor(p.size[0] / cell)), nz = Math.max(4, Math.floor(p.size[1] / cell));
    const a0 = -Math.floor(nx * cell / 2), b0 = -Math.floor(nz * cell / 2);
    const h = 5;
    const seen = new Uint8Array(nx * nz), open = new Set();
    const st = [[0, 0]];
    seen[0] = 1;
    while (st.length) {
        const [i, k] = st[st.length - 1];
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dk]) => [i + di, k + dk]).filter(([u, v]) => u >= 0 && v >= 0 && u < nx && v < nz && !seen[v * nx + u]);
        if (!nb.length) { st.pop(); continue; }
        const [u, v] = nb[Math.floor(rng() * nb.length)];
        seen[v * nx + u] = 1;
        open.add(`${Math.min(i, u)},${Math.min(k, v)},${i !== u ? 'a' : 'b'}`);
        st.push([u, v]);
    }
    const hedge = BLOCK.LEAVES;
    for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) {
        const a = a0 + i * cell, b = b0 + k * cell;
        f.box(a, a, -1, h, b, b, BLOCK.WOOD);
        if (i < nx && !(k === 0 && i === 0) && !(k === nz && i === nx - 1) && !open.has(`${i},${k - 1},b`)) f.box(a + 1, a + cell - 1, 0, h - 1, b, b, hedge);
        if (k < nz && !open.has(`${i - 1},${k},a`)) f.box(a, a, 0, h - 1, b + 1, b + cell - 1, hedge);
        if (i < nx && k < nz) f.box(a + 1, a + cell - 1, -1, -1, b + 1, b + cell - 1, BLOCK.PATH);
    }
    // the way in (front, left) and out (back, right); a gold block in the middle
    f.box(a0 + 1, a0 + cell - 1, 0, h - 1, b0, b0, BLOCK.AIR);
    f.box(a0 + (nx - 1) * cell + 1, a0 + nx * cell - 1, 0, h - 1, b0 + nz * cell, b0 + nz * cell, BLOCK.AIR);
    return h + 1;
}

// ------------------------------------------------------------------------------- statues
/**
 * The sculptures: each a few simple solids in a box of height 1 (y up from the pedestal, z forward to the front, x to
 * the right): e — an ellipsoid [cx, cy, cz, rx, ry, rz], c — a capsule [ax, ay, az, bx, by, bz, r], k — a cone [ax, ay, az,
 * bx, by, bz, r0, r1]. 'a' marks the accent (eyes, a crown, horns: gold or the trim).
 */
const quad = ({ L = 0.5, H = 0.45, leg = 0.32, neck = 0.15, head = 0.13, snout = 0, ears = 'pt', tail = 0.2, horns = 0, fat = 1, up = 0.12 }) => {
    const by = leg + H * 0.42, bz = 0, hz = L * 0.55 + head * 0.5, hy = by + neck + H * 0.12 + up;
    const out = [
        ['e', 0, by, bz, 0.2 * fat, H * 0.42, L * 0.55],
        ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => ['c', sx * 0.11 * fat, by - 0.05, sz * L * 0.36, sx * 0.11 * fat, 0.02, sz * L * 0.38, 0.055 * Math.max(0.8, fat)]),
        ['c', 0, by + H * 0.15, L * 0.45, 0, hy - 0.04, hz - head * 0.3, 0.09 * fat],
        ['e', 0, hy, hz, head * 0.85, head * 0.85, head],
        ['e', 0.07, hy + 0.03, hz + head * 0.6, 0.025, 0.025, 0.025, 'a'], ['e', -0.07, hy + 0.03, hz + head * 0.6, 0.025, 0.025, 0.025, 'a'],
    ];
    if (snout) out.push(['e', 0, hy - 0.03, hz + head * 0.95, snout * 0.8, snout * 0.7, snout]);
    if (ears === 'pt') out.push(['k', 0.06, hy + head * 0.6, hz - 0.02, 0.08, hy + head * 1.5, hz - 0.03, 0.04, 0.005], ['k', -0.06, hy + head * 0.6, hz - 0.02, -0.08, hy + head * 1.5, hz - 0.03, 0.04, 0.005]);
    if (ears === 'round') out.push(['e', 0.08, hy + head * 0.75, hz - 0.03, 0.045, 0.045, 0.025], ['e', -0.08, hy + head * 0.75, hz - 0.03, 0.045, 0.045, 0.025]);
    if (ears === 'flop') out.push(['e', 0.11, hy + 0.02, hz - 0.02, 0.025, 0.07, 0.05], ['e', -0.11, hy + 0.02, hz - 0.02, 0.025, 0.07, 0.05]);
    if (ears === 'long') out.push(['c', 0.04, hy + head * 0.6, hz - 0.03, 0.06, hy + head * 2.8, hz - 0.08, 0.03], ['c', -0.04, hy + head * 0.6, hz - 0.03, -0.06, hy + head * 2.8, hz - 0.08, 0.03]);
    if (tail) out.push(['c', 0, by + H * 0.1, -L * 0.5, 0, by + H * 0.35 - tail * 0.6, -L * 0.5 - tail, 0.035]);
    if (horns) out.push(['k', 0.06, hy + head * 0.6, hz - 0.02, 0.18, hy + head * 0.6 + horns, hz + 0.05, 0.035, 0.008, 'a'], ['k', -0.06, hy + head * 0.6, hz - 0.02, -0.18, hy + head * 0.6 + horns, hz + 0.05, 0.035, 0.008, 'a']);
    return out;
};
const humanoid = ({ hat = null, crown = false, sword = false, staff = false, robe = false }) => {
    const out = [
        ['c', 0.07, 0.02, 0, 0.07, 0.42, 0, 0.055], ['c', -0.07, 0.02, 0, -0.07, 0.42, 0, 0.055],
        ['e', 0, 0.58, 0, 0.14, 0.2, 0.08], ['c', 0.17, 0.72, 0, 0.21, 0.45, 0.04, 0.04], ['c', -0.17, 0.72, 0, -0.21, 0.45, 0.04, 0.04],
        ['e', 0, 0.86, 0, 0.075, 0.09, 0.08], ['e', 0.03, 0.87, 0.07, 0.012, 0.012, 0.012, 'a'], ['e', -0.03, 0.87, 0.07, 0.012, 0.012, 0.012, 'a'],
    ];
    if (robe) out.push(['k', 0, 0.02, 0, 0, 0.62, 0, 0.2, 0.12]);
    if (hat === 'wizard') out.push(['k', 0, 0.92, 0, 0, 1.0, -0.03, 0.12, 0.005, 'a'], ['e', 0, 0.925, 0, 0.14, 0.012, 0.14, 'a']);
    if (hat === 'helmet') out.push(['e', 0, 0.9, 0, 0.085, 0.07, 0.09, 'a']);
    if (crown) out.push(['c', 0, 0.94, 0, 0, 0.98, 0, 0.065, 'a'], ['k', 0.05, 0.96, 0, 0.05, 1.0, 0, 0.015, 0.003, 'a'], ['k', -0.05, 0.96, 0, -0.05, 1.0, 0, 0.015, 0.003, 'a'], ['k', 0, 0.96, 0.05, 0, 1.0, 0.05, 0.015, 0.003, 'a']);
    if (sword) out.push(['c', 0.22, 0.42, 0.06, 0.22, 0.98, 0.06, 0.018, 'a'], ['c', 0.17, 0.45, 0.06, 0.27, 0.45, 0.06, 0.016, 'a'], ['e', -0.24, 0.55, 0.06, 0.03, 0.14, 0.1]);
    if (staff) out.push(['c', -0.22, 0.02, 0.04, -0.22, 0.98, 0.04, 0.018], ['e', -0.22, 0.99, 0.04, 0.035, 0.035, 0.035, 'a']);
    return out;
};
const SCULPT = {
    pig: () => quad({ L: 0.62, H: 0.5, leg: 0.16, neck: 0.02, head: 0.17, snout: 0.07, ears: 'pt', tail: 0.06, fat: 1.35, up: 0 }),
    horse: () => quad({ L: 0.55, H: 0.32, leg: 0.42, neck: 0.25, head: 0.12, snout: 0.07, ears: 'pt', tail: 0.3, fat: 0.9, up: 0.12 }),
    cow: () => quad({ L: 0.62, H: 0.42, leg: 0.3, neck: 0.06, head: 0.14, snout: 0.06, ears: 'flop', tail: 0.3, horns: 0.08, fat: 1.25, up: 0.02 }),
    sheep: () => quad({ L: 0.55, H: 0.5, leg: 0.22, neck: 0.04, head: 0.12, snout: 0.04, ears: 'flop', tail: 0.05, fat: 1.45, up: 0.04 }),
    dog: () => quad({ L: 0.5, H: 0.34, leg: 0.3, neck: 0.12, head: 0.13, snout: 0.07, ears: 'flop', tail: 0.25, fat: 0.95, up: 0.1 }),
    cat: () => quad({ L: 0.48, H: 0.3, leg: 0.28, neck: 0.1, head: 0.13, snout: 0.03, ears: 'pt', tail: 0.4, fat: 0.85, up: 0.12 }),
    bear: () => quad({ L: 0.6, H: 0.55, leg: 0.24, neck: 0.04, head: 0.17, snout: 0.07, ears: 'round', tail: 0.03, fat: 1.5, up: 0.05 }),
    rabbit: () => [['e', 0, 0.3, 0, 0.18, 0.26, 0.2], ['e', 0, 0.62, 0.06, 0.12, 0.12, 0.12], ['c', 0.04, 0.7, 0.03, 0.06, 0.98, -0.02, 0.035], ['c', -0.04, 0.7, 0.03, -0.06, 0.98, -0.02, 0.035],
        ['e', 0.05, 0.64, 0.16, 0.018, 0.018, 0.018, 'a'], ['e', -0.05, 0.64, 0.16, 0.018, 0.018, 0.018, 'a'], ['e', 0.1, 0.08, 0.12, 0.06, 0.06, 0.12], ['e', -0.1, 0.08, 0.12, 0.06, 0.06, 0.12], ['e', 0, 0.2, -0.2, 0.07, 0.07, 0.07]],
    frog: () => [['e', 0, 0.3, 0, 0.32, 0.26, 0.3], ['e', 0.15, 0.58, 0.12, 0.09, 0.09, 0.09, 'a'], ['e', -0.15, 0.58, 0.12, 0.09, 0.09, 0.09, 'a'], ['e', 0.3, 0.12, -0.05, 0.12, 0.1, 0.22], ['e', -0.3, 0.12, -0.05, 0.12, 0.1, 0.22], ['c', 0.15, 0.1, 0.25, 0.2, 0.02, 0.35, 0.05], ['c', -0.15, 0.1, 0.25, -0.2, 0.02, 0.35, 0.05]],
    bird: () => [['e', 0, 0.42, 0, 0.16, 0.2, 0.22], ['e', 0, 0.72, 0.1, 0.11, 0.11, 0.11], ['k', 0, 0.71, 0.2, 0, 0.68, 0.34, 0.04, 0.003, 'a'], ['e', 0.05, 0.75, 0.18, 0.018, 0.018, 0.018, 'a'], ['e', -0.05, 0.75, 0.18, 0.018, 0.018, 0.018, 'a'],
        ['e', 0.19, 0.55, -0.02, 0.04, 0.3, 0.16], ['e', -0.19, 0.55, -0.02, 0.04, 0.3, 0.16], ['k', 0, 0.35, -0.2, 0, 0.25, -0.42, 0.1, 0.02], ['c', 0.06, 0.25, 0.02, 0.06, 0.0, 0.04, 0.025, 'a'], ['c', -0.06, 0.25, 0.02, -0.06, 0.0, 0.04, 0.025, 'a']],
    fish: () => [['e', 0, 0.55, 0, 0.12, 0.2, 0.36], ['k', 0, 0.55, -0.33, 0, 0.75, -0.55, 0.05, 0.16], ['k', 0, 0.75, 0, 0, 0.9, -0.08, 0.1, 0.01], ['e', 0.07, 0.6, 0.24, 0.025, 0.025, 0.025, 'a'], ['e', -0.07, 0.6, 0.24, 0.025, 0.025, 0.025, 'a'], ['c', 0, 0.0, 0, 0, 0.4, 0, 0.06]],
    dragon: () => [...quad({ L: 0.62, H: 0.3, leg: 0.22, neck: 0.32, head: 0.11, snout: 0.08, ears: 'none', tail: 0, horns: 0.1, fat: 1, up: 0.2 }),
        ['c', 0, 0.38, -0.35, 0, 0.2, -0.7, 0.06], ['c', 0, 0.2, -0.7, 0.12, 0.08, -0.9, 0.04],
        ['k', 0.15, 0.48, 0.05, 0.6, 0.85, -0.05, 0.06, 0.01], ['e', 0.38, 0.62, -0.08, 0.24, 0.17, 0.02], ['k', -0.15, 0.48, 0.05, -0.6, 0.85, -0.05, 0.06, 0.01], ['e', -0.38, 0.62, -0.08, 0.24, 0.17, 0.02]],
    snake: () => {
        const out = [];
        for (let i = 0; i < 40; i++) { const t = i / 40, a = t * Math.PI * 4.2, r = 0.32 - t * 0.18; out.push(['e', Math.cos(a) * r, 0.06 + t * 0.32, Math.sin(a) * r, 0.08, 0.07, 0.08]); }
        out.push(['c', 0.1, 0.38, 0.05, 0.05, 0.75, 0.12, 0.06], ['e', 0.05, 0.8, 0.18, 0.08, 0.06, 0.12], ['e', 0.09, 0.83, 0.25, 0.015, 0.015, 0.015, 'a'], ['e', 0.01, 0.83, 0.25, 0.015, 0.015, 0.015, 'a']);
        return out;
    },
    knight: () => humanoid({ hat: 'helmet', sword: true }), king: () => humanoid({ crown: true, robe: true }), wizard: () => humanoid({ hat: 'wizard', staff: true, robe: true }), human: () => humanoid({}),
    heart: () => [['e', 0.17, 0.66, 0, 0.24, 0.24, 0.13], ['e', -0.17, 0.66, 0, 0.24, 0.24, 0.13], ['k', 0, 0.58, 0, 0, 0.0, 0, 0.38, 0.02]],
    star: () => { const out = [['e', 0, 0.5, 0, 0.16, 0.16, 0.08]]; for (let k = 0; k < 5; k++) { const a = Math.PI / 2 + k * Math.PI * 2 / 5; out.push(['k', 0, 0.5, 0, Math.cos(a) * 0.48, 0.5 + Math.sin(a) * 0.48, 0, 0.12, 0.01]); } return out; },
    skull: () => [['e', 0, 0.55, 0, 0.36, 0.34, 0.36], ['e', 0, 0.25, 0.1, 0.24, 0.18, 0.24], ['e', 0.14, 0.55, 0.3, 0.09, 0.09, 0.08, 'h'], ['e', -0.14, 0.55, 0.3, 0.09, 0.09, 0.08, 'h'], ['e', 0, 0.38, 0.33, 0.04, 0.06, 0.05, 'h']],
    tree: () => [['c', 0, 0, 0, 0, 0.55, 0, 0.07], ['e', 0, 0.68, 0, 0.36, 0.3, 0.36], ['e', 0.2, 0.55, 0.1, 0.18, 0.15, 0.18], ['e', -0.18, 0.58, -0.1, 0.18, 0.15, 0.18]],
};

function inside(s, x, y, z) {
    if (s[0] === 'e') { const dx = (x - s[1]) / s[4], dy = (y - s[2]) / s[5], dz = (z - s[3]) / s[6]; return dx * dx + dy * dy + dz * dz <= 1; }
    const ax = s[1], ay = s[2], az = s[3], bx = s[4], by = s[5], bz = s[6];
    const vx = bx - ax, vy = by - ay, vz = bz - az, L2 = vx * vx + vy * vy + vz * vz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy + (z - az) * vz) / L2));
    const px = ax + vx * t - x, py = ay + vy * t - y, pz = az + vz * t - z;
    const r = s[0] === 'c' ? s[7] : s[7] + (s[8] - s[7]) * t;
    return px * px + py * py + pz * pz <= r * r;
}

/** A statue: a pedestal and the sculpture carved of blocks (the whole ones of its solids), facing the front. */
function partStatue(W, p, ctx) {
    const { f, st } = ctx;
    const subject = SCULPT[p.subject] ? p.subject : 'human';
    const H = Math.max(3, Math.round(p.size[2]));
    const ped = Math.max(1, Math.min(4, Math.round(H * 0.16)));
    const SH = H - ped;
    const mat = st.wallK ? st.wall : p.subject === 'king' ? BLOCK.GOLD : BLOCK.CS_WHITE;
    const acc = mat === BLOCK.GOLD ? BLOCK.CS_DARK : BLOCK.GOLD;
    const pr = Math.max(2, Math.round(Math.min(p.size[0], p.size[1]) / 2));
    f.box(-pr - 1, pr + 1, -1, -1, -pr - 1, pr + 1, st.trim);
    f.box(-pr, pr, 0, ped - 1, -pr, pr, st.trim === mat ? BLOCK.CS_DARK : st.trim);
    if (ped >= 2) f.box(-pr, pr, ped - 1, ped - 1, -pr, pr, BLOCK.GOLD);
    const solids = SCULPT[subject]();
    const ext = Math.ceil(SH * 0.75);
    // (a voxel is the sculpture's if its middle is inside a solid; 'h' carves a hollow — the skull's eyes)
    const keep = [];
    for (let a = -ext; a <= ext; a++) for (let b = -ext; b <= ext; b++) for (let l = 0; l < SH + 2; l++) {
        const x = (a) / SH, y = (l + 0.5) / SH, z = (-b) / SH;
        let hit = null;
        for (const s of solids) if (inside(s, x, y, z)) { if (s[s.length - 1] === 'h') { hit = 'h'; break; } hit = s[s.length - 1] === 'a' ? 'a' : hit || 'm'; }
        if (hit && hit !== 'h') keep.push([a, b, l, hit]);
    }
    let top = ped;
    for (const [a, b, l, m] of keep) { f.put(a, b, ped + l, m === 'a' ? acc : mat); top = Math.max(top, ped + l + 1); }
    return top;
}

const BUILDERS = {
    house: partHouse, hall: partHouse, tower: partTower, castle: partCastle, city: partCity, wall: partWall, bridge: partBridge, well: partWell,
    fountain: partFountain, statue: partStatue, arch: partArch, pyramid: partPyramid, obelisk: partObelisk, temple: partTemple,
    lighthouse: partLighthouse, windmill: partWindmill, ship: partShip, garden: partGarden, pavilion: partPavilion, dome: partDome, stairs: partStairs, maze: partMaze,
};

// =============================================================================== the layout
/** The half sizes (a, b) a part takes on the ground (a house: as big as MagicHouse makes it). */
export function partHalf(p) {
    const [w, d] = p.size;
    if (p.kind === 'house' || p.kind === 'hall') return [Math.max(8, w / 2 + 2), Math.max(7, d / 2 + 4)];
    if (p.kind === 'tower') { const r = Math.max(3, Math.round(Math.min(w, d) / 2)), n = p.count || 1; return [n * (r + 3) + 1, r + 2]; }
    if (p.kind === 'ship') return [w / 2 + 2, d / 2 + 6];
    if (p.kind === 'statue') return [Math.max(w / 2, p.size[2] * 0.42) + 1, Math.max(d / 2, p.size[2] * 0.42) + 1];
    return [w / 2 + 1, d / 2 + 1];
}

/**
 * Where each part stands (local to the whole: a right, b back; −b looks at the caster): the first (the main one) in the
 * middle, the others round it — in front first, then the sides, then behind — never on another (BUILD.GAP between).
 * A part with `at` asked keeps it when it overlaps nothing.
 */
export function layoutParts(parts) {
    const placed = [];
    const overlaps = (r) => placed.some((q) => r.a0 < q.a1 + BUILD.GAP && r.a1 > q.a0 - BUILD.GAP && r.b0 < q.b1 + BUILD.GAP && r.b1 > q.b0 - BUILD.GAP);
    const rectAt = (a, b, ha, hb) => ({ a0: a - ha, a1: a + ha, b0: b - hb, b1: b + hb, a, b });
    parts.forEach((p, i) => {
        const [ha, hb] = partHalf(p);
        if (i === 0) { placed.push({ ...rectAt(0, 0, ha, hb), p }); return; }
        if (p.at) { const r = rectAt(p.at[0], -p.at[1], ha, hb); if (!overlaps(r)) { placed.push({ ...r, p }); return; } }
        const m = placed[0];
        // rings outwards: front, left, right, back
        for (let ring = 0; ring < 12; ring++) {
            const cands = [
                [0, m.b0 - BUILD.GAP - hb - ring * 6], [m.a0 - BUILD.GAP - ha - ring * 6, 0], [m.a1 + BUILD.GAP + ha + ring * 6, 0], [0, m.b1 + BUILD.GAP + hb + ring * 6],
                [m.a0 - BUILD.GAP - ha - ring * 6, m.b0 - hb], [m.a1 + BUILD.GAP + ha + ring * 6, m.b0 - hb],
            ];
            for (const [a, b] of cands) { const r = rectAt(Math.round(a), Math.round(b), ha, hb); if (!overlaps(r)) { placed.push({ ...r, p }); return; } }
        }
    });
    return placed;
}

/** The whole footprint (local half sizes) of a recipe: for the ground to be sampled before the plan. */
export function recipeExtent(recipe) {
    const lay = layoutParts(recipe.parts || []);
    let A = 4, B = 4;
    for (const q of lay) { A = Math.max(A, Math.abs(q.a0), Math.abs(q.a1)); B = Math.max(B, Math.abs(q.b0), Math.abs(q.b1)); }
    return { A: Math.ceil(A) + 3, B: Math.ceil(B) + 3 };
}

/** The world rectangle of a recipe placed at (x, z) with its face (for the ground's grid and the site's checks). */
export function recipeRect(recipe, x, z, face) {
    const { A, B } = recipeExtent(recipe);
    return rectOf(x, z, A, B, face);
}

/**
 * The plan: every part laid out, on its own ground, built of blocks.
 * @param {{recipe: object, seed: number, x: number, z: number, face: number, grid: object, G?: number}} o
 */
export function creationPlan(o) {
    const recipe = o.recipe;
    const rng = createRng((o.seed >>> 0) + 7);
    const gr = groundOf(o.grid);
    const W = new Writer();
    const face = o.face | 0;
    const lay = layoutParts(recipe.parts || []);
    const out = { parts: [] };
    let top = 0;
    for (const q of lay) {
        const p = q.p;
        const [ra, rb] = rotLot(q.a, q.b, face);
        const x = Math.round(o.x + ra), z = Math.round(o.z + rb);
        const pf = (face + (p.rot | 0)) % 4;
        const [ha, hb] = partHalf(p);
        const rect = rectOf(x, z, ha, hb, pf);
        const site = siteOf(gr, rect, o.G ?? 0);
        let G = site.G;
        if (p.kind === 'bridge' || p.kind === 'ship') G = site.wet > 0.3 ? Math.max(site.min, (o.G ?? site.G) - 1) : site.G;
        const st = styleOf(recipe, p, rng);
        const f = frame(W, x, z, pf, G, rng, st);
        const ctx = { f, st, rng, gr, x, z, face: pf, G, seed: (o.seed >>> 0) + lay.indexOf(q) * 101, recipe };
        if (p.kind !== 'city') prepare(W, gr, rect, G, p.size[2] + 4);
        const h = BUILDERS[p.kind] ? BUILDERS[p.kind](W, p, ctx) : 0;
        top = Math.max(top, G + 1 + (h || 0));
        out.parts.push({ kind: p.kind, rect, G });
        if (W.full) break;
    }
    // ---- the result: the blocks from the ground up (the lowest layers first, then outwards from the middle)
    const n = W.map.size;
    const order = new Float64Array(n);
    const keys = new Float64Array(n), vals = new Int32Array(n);
    let i = 0;
    for (const [k, v] of W.map) { keys[i] = k; vals[i] = v; i++; }
    for (let j = 0; j < n; j++) {
        const k = keys[j];
        const L = (k % 1024) - 512, xz = Math.floor(k / 1024), x = Math.floor(xz / 2097152) - 1048576, z = (xz % 2097152) - 1048576;
        const dist = Math.min(4095, Math.abs(x - o.x) + Math.abs(z - o.z));
        order[j] = ((L + 512) * 4096 + dist) * 1048576 + j;
    }
    order.sort();
    const cells = new Int32Array(n * 5);
    const plain = [];
    for (let j = 0; j < n; j++) {
        const idx = order[j] % 1048576, k = keys[idx], v = vals[idx];
        const L = (k % 1024) - 512, xz = Math.floor(k / 1024), x = Math.floor(xz / 2097152) - 1048576, z = (xz % 2097152) - 1048576;
        cells[j * 5] = x; cells[j * 5 + 1] = L; cells[j * 5 + 2] = z; cells[j * 5 + 3] = v & 255; cells[j * 5 + 4] = v >> 8;
        plain.push([x, L, z, v & 255, v >> 8]);
    }
    // the roofs' slopes (ramps on the top cells of a roof material) — the shapes of the houses' own roofs stay
    const roofs = [BLOCK.ROOF_RED, BLOCK.ROOF_BLUE, BLOCK.ROOF_SLATE, BLOCK.ROOF_PURPLE, BLOCK.THATCH];
    cellShapes(plain.map((c) => (c[4] ? [c[0], c[1], c[2], 0] : c)), roofs).forEach((c, j) => { if (c[4] && !cells[j * 5 + 4]) cells[j * 5 + 4] = c[4]; });
    const paths = new Int32Array(W.paths.size * 3);
    let pi = 0;
    for (const [k, t] of W.paths) { const [px, pz] = k.split(',').map(Number); paths[pi++] = px; paths[pi++] = pz; paths[pi++] = t; }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of out.parts) { x0 = Math.min(x0, q.rect.x0); x1 = Math.max(x1, q.rect.x1); z0 = Math.min(z0, q.rect.z0); z1 = Math.max(z1, q.rect.z1); }
    return {
        cells, n, fill: Int32Array.from(W.fill), clear: W.clear, paths,
        doors: W.doors, windows: W.windows, beds: W.beds, chests: W.chests.map((c, k) => ({ ...c, k })),
        rect: { x0, x1, z0, z1 }, top: Math.max(top, W.top), parts: out.parts, full: W.full,
    };
}
