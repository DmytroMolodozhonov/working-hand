/**
 * VampireCastle.js — the castle of Count Sracula (the vampire count), ONE in the whole world (the author 01.11: «некая локация в обычном
 * мире… на скале огромный замок со шпилями — не крепость, а именно замок со шпилями, как обычно у вампиров… в отличие от замка Ледяной
 * Королевы, тут красивый мост, по которому можно прийти… трон красивый… отдельная комната, где он спит в гробу»).
 *
 *  - Exactly one per world (generation VAMPIRE_FROM_GEN), from the seed alone — every computer, the worker and the host agree: on flat-ish
 *    land in a ring VAMP.MIN…MAX m from the spawn, away from water, castles, towers, villages and the Ice Queen's mountain.
 *  - THE CRAG: a crag of dark rock rises VAMP.RISE layers over the land (its top the castle's floor F), sheer cliffs all round, ragged.
 *    In front of it a GORGE (the land as it was, far below) and beyond it a long ridge — the approach — falling gently to the plain.
 *  - THE BRIDGE over the gorge, level with the gates: a deck of dressed black stone on three arches, parapets with merlons, iron lantern posts.
 *  - THE CASTLE (not a fortress): a curtain wall low round the crag's edge with turrets; a tall keep — the great hall with pointed windows,
 *    a row of columns, a red runner to the throne on its dais; four corner towers and two great gate towers, all with tall slate spires;
 *    one slender spire over the hall's roof, the highest; behind the throne a door to the CRYPT — the coffin room (the coffin is a model:
 *    VampireLife), two chests by the coffin.
 *  - Its blocks are the world's own (dressed black stone, basalt, slate, red carpet, gold, lanterns): ordinary stone — a blast breaks it
 *    (and wakes the count: VampireLife).
 *
 * Pure and deterministic (no THREE: it runs in the terrain workers too). Its parts are the castles' kind (boxes k 0, cylinders k 1).
 */

import { createRng, createNoise2D } from '../core/math.js';
import { roofShapes } from './PlanSlopes.js';

export const VAMP = {
    MIN: 650, MAX: 1300, // m from the spawn: away from the start, a ride or a flight reaches it
    R: 34, // m: the crag's top (the castle's ground) — round, ragged at its edge
    RISE: 30, // layers the crag stands over the land round it
    FLOOR_MAX: 96, // layers: never higher (the spires stay under the world's ceiling 120)
    CLIFF: 3.2, // layers down per m at the cliff
    GORGE: 18, // m between the crag's edge and the ridge (the bridge's span)
    RIDGE: { W: 6, DROP: 0.34, LEN: 120, SIDE: 1.4 }, // the approach: its half-width on top, its fall per m, its length, its sides' fall per m
    DARK_R: 280, // m: the clouds over the castle's land (always dark — VampireLife)
    DARK_FADE: 120, // m more where the darkness thins out
};

/** World offset → local {u across, v toward the gates}; local → world (as the Ice Castle's). */
export function vampUV(S, dx, dz) {
    switch (S.rot) {
        case 1: return { u: -dz, v: dx };
        case 2: return { u: -dx, v: -dz };
        case 3: return { u: dz, v: -dx };
        default: return { u: dx, v: dz };
    }
}
export function vampLocal(S, u, v) {
    switch (S.rot) {
        case 1: return { x: S.x + v, z: S.z - u };
        case 2: return { x: S.x - u, z: S.z - v };
        case 3: return { x: S.x - v, z: S.z + u };
        default: return { x: S.x + u, z: S.z + v };
    }
}
/** The world yaw (THREE rotation.y) of something facing the castle's front (+v). */
export const vampYaw = (S) => [0, Math.PI / 2, Math.PI, -Math.PI / 2][S.rot];

const TAU = Math.PI * 2;
// the castle's blocks (Terrain.BLOCK numbers)
const B = { AIR: 0, STONE: 3, COBBLE: 25, ROOF: 31, CARPET: 33, GOLD: 34, PLANKS_DARK: 28, LANTERN: 40, BASALT: 78, OBSIDIAN: 79, BRICK: 84, IRON: 85 };

/**
 * Where the one castle stands: {x, z, F, rot} or null (no fitting land).
 * @param raw  the world's raw height field (raw(ix, iz) → top layer; raw.water / raw.sea after a call)
 * @param busy (x, z, r) → another site / mountain is within r there
 */
export function vampireSpot(seed, raw, busy) {
    const H = (x, z) => raw(Math.round(x), Math.round(z));
    const wet = (x, z) => { raw(Math.round(x), Math.round(z)); return !!(raw.water || raw.sea); };
    const rng = createRng(((seed * 4111) ^ 0x7a3b1d05) >>> 0);
    const a0 = rng() * TAU;
    let best = null;
    for (let i = 0; i < 36; i++) {
        const a = a0 + (i / 36) * TAU;
        for (let j = 0; j < 4; j++) {
            const d = VAMP.MIN + (j + rng()) / 4 * (VAMP.MAX - VAMP.MIN);
            const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
            const h0 = H(x, z);
            if (h0 < 2 || wet(x, z) || busy(x, z, VAMP.R + VAMP.GORGE + 40)) continue;
            // the land round it: flat-ish and dry (the ridge in front, the crag's foot all round)
            let lo = h0, hi = h0, dry = true;
            for (let k = 0; k < 12 && dry; k++) {
                const b = (k / 12) * TAU;
                for (const r of [VAMP.R, VAMP.R + 40]) {
                    const px = x + Math.cos(b) * r, pz = z + Math.sin(b) * r;
                    if (wet(px, pz)) { dry = false; break; }
                    const h = H(px, pz); lo = Math.min(lo, h); hi = Math.max(hi, h);
                }
            }
            if (!dry) continue;
            const score = hi - lo + Math.abs(d - (VAMP.MIN + VAMP.MAX) / 2) * 0.004;
            if (!best || score < best.score) best = { x, z, h0, lo, hi, score };
        }
    }
    if (!best || best.hi - best.lo > 26) return null;
    const F = Math.min(VAMP.FLOOR_MAX, Math.round(best.hi + VAMP.RISE * 0.6 + (best.h0 - best.lo) * 0.2 + VAMP.RISE * 0.4));
    // the gates (and the bridge, the ridge) look toward the spawn
    const ax = -best.x, az = -best.z;
    const rot = Math.abs(az) >= Math.abs(ax) ? (az > 0 ? 0 : 2) : (ax > 0 ? 1 : 3);
    return { x: best.x, z: best.z, F, rot };
}

/**
 * The crag, the gorge and the ridge at a column (local u, v; `h` the land as it is; n, r noises −1…1) → {h, lifted}.
 * lifted: the crag's / the ridge's own rock there (bare, no grass, no trees).
 */
export function vampLandAt(S, u, v, h, n, r) {
    const R = VAMP.R, F = S.F, d = Math.hypot(u, v);
    let m = -Infinity;
    // the crag: its top flat (the castle's ground), sheer ragged cliffs round it, a scree skirt at the foot
    const edge = R * (0.94 + 0.06 * r);
    if (d <= edge) m = F;
    else {
        const cliff = F - (d - edge) * VAMP.CLIFF * (1 + 0.35 * n) - Math.max(0, d - edge - 6) * 0.5;
        const skirt = h + Math.max(0, 9 - (d - edge) * 0.7) + 2 * n; // (scree heaped at the foot)
        m = Math.max(cliff, Math.min(skirt, F - 2));
        if (d > edge + 30) m = -Infinity;
    }
    // the ridge in front, beyond the gorge: from just under the gates down to the plain
    const RG = VAMP.RIDGE, v0 = R + VAMP.GORGE;
    if (v >= v0 && v <= v0 + RG.LEN) {
        const top = F - 1 - (v - v0) * RG.DROP;
        const side = Math.max(0, Math.abs(u) - RG.W - 2 * n);
        const ridge = top - side * RG.SIDE * 1.8 + (side > 0 ? n * 1.5 : 0);
        if (ridge > m) m = ridge;
    }
    m = Math.round(m);
    if (!(m > h)) return { h, lifted: false };
    return { h: m, lifted: true };
}

/** The whole plan: the parts of its blocks and where things are (the hall, the throne, the crypt, the coffin, the chests, the guards' posts…). */
export function vampireCastlePlan(S) {
    const parts = [];
    const F = S.F, R = VAMP.R;
    const box = (u0, u1, v0, v1, L0, L1, t) => {
        const a = vampLocal(S, u0, v0), b = vampLocal(S, u1, v1);
        parts.push({ k: 0, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), L0, L1, t });
    };
    const cyl = (u, v, r, hr, L0, L1, t) => {
        const c = vampLocal(S, u, v), q = Math.ceil(r);
        parts.push({ k: 1, cx: c.x, cz: c.z, r, hr, x0: Math.floor(c.x - q), x1: Math.ceil(c.x + q), z0: Math.floor(c.z - q), z1: Math.ceil(c.z + q), L0, L1, t });
    };
    const rng = createRng(((S.x * 73856) ^ (S.z * 19349) ^ 0x5ac1) >>> 0);
    // a slender spire: a round tower, a band of basalt, a gallery of merlons, a tall slate cone (ramps), an iron finial with a lantern
    const spire = (u, v, rt, h, cone) => {
        const top = F + h;
        cyl(u, v, rt, rt - 1.2, F + 1, top, B.BRICK);
        for (let L = F + 6; L < top - 2; L += 7) cyl(u, v, rt + 0.4, rt - 1, L, L, B.BASALT); // (string courses)
        // narrow lancet windows up the tower, a lantern glowing in the top one
        for (let k = 0; k < 4; k++) {
            const a = (k / 4) * TAU + 0.4, wu = Math.round(u + Math.sin(a) * (rt - 0.5)), wv = Math.round(v + Math.cos(a) * (rt - 0.5));
            box(wu, wu, wv, wv, top - 6, top - 4, B.AIR);
        }
        cyl(u, v, rt + 0.8, rt - 0.3, top + 1, top + 1, B.BASALT); // (the gallery's floor ring)
        for (let k = 0; k < 12; k += 2) {
            const a = (k / 12) * TAU, mu = Math.round(u + Math.sin(a) * (rt + 0.3)), mv = Math.round(v + Math.cos(a) * (rt + 0.3));
            box(mu, mu, mv, mv, top + 2, top + 2, B.BRICK); // (merlons)
        }
        const start = parts.length;
        const steps = Math.max(3, Math.round(cone / 2));
        for (let i = 0; i < steps; i++) cyl(u, v, Math.max(0.5, rt - (i * rt) / steps), -1, top + 2 + i * 2, top + 3 + i * 2, B.ROOF);
        { const sp = roofShapes(parts.slice(start), [B.ROOF]); if (sp) parts.push(sp); }
        const tip = top + 3 + steps * 2;
        box(u, u, v, v, tip, tip + 3, B.IRON);
        box(u, u, v, v, tip + 4, tip + 4, B.LANTERN);
        return top;
    };

    // ---- the crag's top: the courtyard (cobbles), its edge a band of basalt
    cyl(0, 0, R * 0.93, -1, F, F, B.COBBLE);
    cyl(0, 0, R * 0.93, R * 0.93 - 1.5, F, F, B.BASALT);
    // ---- the curtain wall: low (5), merlons, round turrets at its corners; the gateway in front
    const WR = Math.floor(R * 0.9) - 1;
    cyl(0, 0, WR, WR - 1.6, F + 1, F + 5, B.BRICK);
    cyl(0, 0, WR + 0.4, WR - 2, F + 5, F + 5, B.BASALT);
    for (let k = 0; k < 80; k += 2) {
        const a = (k / 80) * TAU, cu = Math.sin(a), cv = Math.cos(a);
        const mu = Math.round(cu * (WR - 0.6)), mv = Math.round(cv * (WR - 0.6));
        if (mv > 0 && Math.abs(mu) < 8) continue; // (the gateway)
        box(mu, mu, mv, mv, F + 6, F + 6, B.BRICK);
    }
    for (const a of [0.9, -0.9, 2.3, -2.3]) spire(Math.round(Math.sin(a) * WR), Math.round(Math.cos(a) * WR), 2.6, 14, 8);
    // ---- the gate: two great towers flanking a tall pointed arch in the wall
    const gv = WR; // the gateway's line
    box(-4, 4, gv - 3, gv + 1, F + 1, F + 8, B.AIR);
    box(-3, 3, gv - 3, gv + 1, F + 9, F + 9, B.AIR);
    box(-2, 2, gv - 3, gv + 1, F + 10, F + 10, B.AIR);
    box(-5, 5, gv - 1, gv + 1, F + 11, F + 12, B.BRICK); // (the arch's lintel band)
    box(-1, 1, gv + 1, gv + 1, F + 11, F + 11, B.GOLD); // (a gilt boss over the arch)
    for (const s of [-1, 1]) spire(s * 7, gv - 1, 3.4, 22, 12);
    // ---- the keep: the great hall (inner 18 wide × 30 deep, walls 16 tall), steep slate roof, the highest spire over it
    const HU = 10, HV0 = -18, HV1 = 14, WALLTOP = F + 16;
    box(-HU, HU, HV0, HV1, F, F, B.BRICK); // (its floor: dressed black stone)
    box(-HU, HU, HV0, HV1, F + 1, WALLTOP, B.BRICK);
    box(-HU + 2, HU - 2, HV0 + 2, HV1 - 2, F + 1, WALLTOP, B.AIR); // (the hall inside — walls 2 thick)
    box(-HU - 0.0, HU, HV0, HV1, F + 7, F + 7, B.BASALT); box(-HU + 2, HU - 2, HV0 + 2, HV1 - 2, F + 7, F + 7, B.AIR); // (a string course outside)
    // buttresses along its long sides, each crowned by a little pinnacle
    for (let v = HV0 + 3; v <= HV1 - 3; v += 6) for (const s of [-1, 1]) {
        box(s * (HU + 1), s * (HU + 2), v, v + 1, F + 1, F + 12, B.BRICK);
        box(s * (HU + 1), s * (HU + 1), v, v, F + 13, F + 15, B.BASALT);
        box(s * (HU + 1), s * (HU + 1), v, v, F + 16, F + 16, B.IRON);
    }
    // tall pointed windows between the buttresses (lanterns glowing above them inside)
    for (let v = HV0 + 6; v <= HV1 - 5; v += 6) for (const s of [-1, 1]) {
        box(s * HU, s * (HU - 1), v - 1, v + 1, F + 4, F + 11, B.AIR);
        box(s * HU, s * (HU - 1), v, v, F + 12, F + 13, B.AIR);
        box(s * (HU - 2), s * (HU - 2), v, v, F + 14, F + 14, B.LANTERN);
    }
    // the hall's door: a tall pointed doorway in its front wall, facing the gate
    box(-2, 2, HV1 - 1, HV1, F + 1, F + 7, B.AIR); box(-1, 1, HV1 - 1, HV1, F + 8, F + 8, B.AIR);
    box(-3, 3, HV1, HV1, F + 9, F + 9, B.BASALT);
    // a rose window over the door (a ring of glowing panes round a gilt heart)
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, ru = Math.round(Math.sin(a) * 2.5), rl = Math.round(Math.cos(a) * 2.5); box(ru, ru, HV1, HV1, F + 12 + rl, F + 12 + rl, B.LANTERN); }
    box(0, 0, HV1, HV1, F + 12, F + 12, B.GOLD);
    // the steep roof: slabs of slate stepping in to a ridge (ramps — generation 6's slopes)
    const roof0 = parts.length;
    for (let i = 0; i <= HU; i++) box(-HU - 1 + i, HU + 1 - i, HV0 - 1, HV1 + 1, WALLTOP + 1 + i * 2, WALLTOP + 2 + i * 2, B.ROOF);
    { const sp = roofShapes(parts.slice(roof0), [B.ROOF]); if (sp) parts.push(sp); }
    // the gable ends (black stone up under the roof)
    for (const v of [HV0, HV1]) for (let i = 0; i <= HU; i++) box(-HU + i, HU - i, v, v, WALLTOP + 1 + i * 2, WALLTOP + 2 + i * 2, B.BRICK);
    // the columns of the hall (two rows), lanterns hung on them
    for (let v = HV0 + 5; v <= HV1 - 5; v += 5) for (const s of [-1, 1]) {
        cyl(s * 5, v, 0.9, -1, F + 1, WALLTOP, B.BASALT);
        box(s * 5 - s, s * 5 - s, v, v, F + 6, F + 6, B.LANTERN);
    }
    // the red runner from the door to the dais, a gold edge either side
    box(-1, 1, HV0 + 6, HV1 - 2, F, F, B.CARPET);
    for (const s of [-2, 2]) box(s, s, HV0 + 6, HV1 - 2, F, F, B.GOLD);
    // THE THRONE on its dais at the back: three steps of black stone, a seat of red velvet, a tall back of black stone edged with gold,
    // two gilt finials; chandelier-lanterns either side
    const TV = HV0 + 4;
    box(-6, 6, HV0 + 2, TV + 2, F + 1, F + 1, B.BASALT);
    box(-4, 4, HV0 + 2, TV + 1, F + 2, F + 2, B.BASALT);
    box(-2, 2, HV0 + 2, TV, F + 3, F + 3, B.OBSIDIAN);
    box(-1, 1, TV - 1, TV, F + 4, F + 4, B.CARPET); // (the seat)
    box(-1, 1, TV - 2, TV - 2, F + 4, F + 10, B.OBSIDIAN); // (the back)
    box(-1, 1, TV - 1, TV - 1, F + 5, F + 8, B.CARPET); // (velvet on the back)
    box(0, 0, TV - 2, TV - 2, F + 11, F + 12, B.GOLD); // (a gilt crest)
    for (const s of [-2, 2]) { box(s, s, TV - 2, TV, F + 4, F + 6, B.OBSIDIAN); box(s, s, TV - 2, TV - 2, F + 7, F + 8, B.GOLD); } // (the arms, gilt finials)
    for (const s of [-5, 5]) { box(s, s, TV, TV, F + 2, F + 5, B.IRON); box(s, s, TV, TV, F + 6, F + 6, B.LANTERN); } // (candle-stands)
    // ---- the corner towers of the keep and the highest spire over the hall
    for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) spire(su * (HU + 1), sv > 0 ? HV1 + 1 : HV0 - 1, 3.2, 26, 14);
    const hallTop = spire(0, (HV0 + HV1) / 2 | 0, 2.2, 16 + 2 * HU + 6, 16); // (it rises out of the roof's ridge)
    void hallTop;
    // ---- THE CRYPT: behind the throne, through a low pointed door — a vaulted room of black stone, the coffin on a plinth (VampireLife puts it)
    const CV0 = HV0 - 13, CV1 = HV0 - 1, CU = 7;
    box(-CU, CU, CV0, CV1, F, F, B.OBSIDIAN);
    box(-CU, CU, CV0, CV1, F + 1, F + 8, B.BRICK);
    box(-CU + 1, CU - 1, CV0 + 1, CV1 - 1, F + 1, F + 7, B.AIR);
    box(-CU, CU, CV0, CV1, F + 9, F + 9, B.BASALT);
    // its vault: stepping in
    const vault0 = parts.length;
    for (let i = 0; i < 4; i++) box(-CU + i * 2, CU - i * 2, CV0, CV1, F + 10 + i, F + 10 + i, B.ROOF);
    { const sp = roofShapes(parts.slice(vault0), [B.ROOF]); if (sp) parts.push(sp); }
    // the door from the hall (behind the throne, a little aside), the coffin's plinth, candles round it, iron grilles as windows
    box(-6, -4, HV0 - 1, HV0 + 1, F + 1, F + 5, B.AIR);
    box(-5, -5, HV0 - 1, HV0 + 1, F + 6, F + 6, B.AIR);
    const CMV = Math.round((CV0 + CV1) / 2);
    box(-2, 2, CMV - 3, CMV + 3, F + 1, F + 1, B.BASALT);
    for (const [cu, cv] of [[-4, CMV - 4], [4, CMV - 4], [-4, CMV + 4], [4, CMV + 4]]) { box(cu, cu, cv, cv, F + 1, F + 3, B.IRON); box(cu, cu, cv, cv, F + 4, F + 4, B.LANTERN); }
    for (const s of [-1, 1]) box(s * CU, s * CU, CMV - 1, CMV + 1, F + 4, F + 6, B.IRON);
    // ---- THE BRIDGE over the gorge: level with the gates, three arches under its deck, parapets and lantern posts
    const BV0 = R - 3, BV1 = R + VAMP.GORGE + 2, BW = 4;
    for (let v = BV0; v <= BV1; v++) {
        box(-BW, BW, v, v, F, F, B.BRICK);
        const t = (v - BV0) / (BV1 - BV0);
        const arch = Math.abs(Math.sin(t * Math.PI * 3)); // (three arches: thick at the piers, thin at the crowns)
        const th = 1 + Math.round((1 - arch) * 9);
        box(-BW + 1, BW - 1, v, v, F - th, F - 1, B.BRICK);
        for (const s of [-1, 1]) {
            box(s * (BW + 1), s * (BW + 1), v, v, F, F + 1, B.BRICK);
            if ((v - BV0) % 2 === 0) box(s * (BW + 1), s * (BW + 1), v, v, F + 2, F + 2, B.BRICK); // (merlons)
            if ((v - BV0) % 5 === 2) { box(s * (BW + 1), s * (BW + 1), v, v, F + 2, F + 4, B.IRON); box(s * (BW + 1), s * (BW + 1), v, v, F + 5, F + 5, B.LANTERN); }
        }
        if (th >= 6) box(-BW + 2, BW - 2, v, v, F - th - 14, F - th - 1, B.BASALT); // (the piers down into the gorge)
    }
    box(-1, 1, BV0, BV1, F, F, B.CARPET); // (a red runner over the bridge to the gates — the count's welcome)
    // ---- dead trees? no: iron lantern posts along the ridge's top, every 9 m, down to the plain
    for (let v = BV1 + 4; v < BV1 + VAMP.RIDGE.LEN; v += 9) {
        const L = Math.round(F - 1 - (v - (R + VAMP.GORGE)) * VAMP.RIDGE.DROP);
        for (const s of [-1, 1]) { box(s * (VAMP.RIDGE.W - 1), s * (VAMP.RIDGE.W - 1), v, v, L + 1, L + 3, B.IRON); box(s * (VAMP.RIDGE.W - 1), s * (VAMP.RIDGE.W - 1), v, v, L + 4, L + 4, B.LANTERN); }
    }
    void rng;

    const at = (u, v, L) => { const p = vampLocal(S, u, v); return { x: p.x, y: L, z: p.z }; };
    const out = {
        id: 'vampire', ...S, R, parts,
        floor: F, // (walking height: F + 0.5)
        hall: { ...at(0, (HV0 + HV1) / 2, F + 0.5), u0: -HU + 2, u1: HU - 2, v0: HV0 + 2, v1: HV1 - 2, top: WALLTOP },
        throne: at(0, TV - 0.5, F + 3.5),
        crypt: { ...at(0, CMV, F + 0.5), u0: -CU + 1, u1: CU - 1, v0: CV0 + 1, v1: CV1 - 1 },
        coffin: at(0, CMV, F + 1.5),
        chests: [at(-5, CMV, F + 0.5), at(5, CMV, F + 0.5)],
        gate: at(0, gv, F + 0.5),
        bridge: at(0, (BV0 + BV1) / 2, F + 0.5),
        approach: at(0, BV1 + 12, Math.round(F - 1 - (BV1 + 12 - (R + VAMP.GORGE)) * VAMP.RIDGE.DROP) + 0.5),
        // the guards' posts: two at the bridge's head, two at the gate, two in the courtyard, four in the hall
        posts: [at(-3, BV0 + 1, F + 0.5), at(3, BV0 + 1, F + 0.5), at(-6, gv - 4, F + 0.5), at(6, gv - 4, F + 0.5),
            at(-14, 4, F + 0.5), at(14, 4, F + 0.5), at(-3, HV1 - 5, F + 0.5), at(3, HV1 - 5, F + 0.5), at(-3, TV + 5, F + 0.5), at(3, TV + 5, F + 0.5)],
        // where the bats roost and wheel: round the spires' tops
        roosts: [at(0, 0, F + 50), at(-7, gv, F + 30), at(7, gv, F + 30), at(-(HU + 1), HV0 - 1, F + 34), at(HU + 1, HV0 - 1, F + 34), at(-(HU + 1), HV1 + 1, F + 34), at(HU + 1, HV1 + 1, F + 34)],
        yaw: vampYaw(S),
    };
    out.x0 = Math.min(...parts.map((p) => p.x0)); out.x1 = Math.max(...parts.map((p) => p.x1));
    out.z0 = Math.min(...parts.map((p) => p.z0)); out.z1 = Math.max(...parts.map((p) => p.z1));
    return out;
}

/** Is (x, z) inside the keep's hall or the crypt (a roof over the head: «indoors» for the bats, the light)? */
export function inVampKeep(P, x, z) {
    if (!P) return false;
    const { u, v } = vampUV(P, x - P.x, z - P.z);
    const H = P.hall, C = P.crypt;
    const lu = (q) => vampUV(P, q.x - P.x, q.z - P.z);
    void lu;
    return (u >= H.u0 - 1 && u <= H.u1 + 1 && v >= H.v0 - 1 && v <= H.v1 + 1) || (u >= C.u0 - 1 && u <= C.u1 + 1 && v >= C.v0 - 1 && v <= C.v1 + 1);
}

/** The one castle of a world as the terrain sees it: its spot (lazily), its plan, its land (the crag, the ridge), its parts in a chunk. */
export class VampireCastleSite {
    constructor(seed, raw, busy) {
        this.seed = seed; this.raw = raw; this.busy = busy;
        this._crag = createNoise2D((seed ^ 0x5a3c1e) >>> 0);
        this._plan = undefined;
        this._byChunk = new Map();
    }

    get plan() {
        if (this._plan === undefined) {
            const S = vampireSpot(this.seed, this.raw, this.busy);
            this._plan = S ? vampireCastlePlan(S) : null;
        }
        return this._plan;
    }

    /** The land at a column as the crag and the ridge make it (`h` the land without them). Sets this.lifted. */
    shapeAt(ix, iz, h) {
        const k = this.plan;
        this.lifted = false;
        if (!k) return h;
        const dx = ix - k.x, dz = iz - k.z, L = VAMP.R + VAMP.GORGE + VAMP.RIDGE.LEN + 20;
        if (Math.abs(dx) > L || Math.abs(dz) > L) return h;
        const { u, v } = vampUV(k, dx, dz);
        const n = this._crag(ix / 9, iz / 9) * 0.7 + this._crag(ix / 3.5, iz / 3.5 + 11) * 0.3;
        const a = Math.atan2(v, u);
        const r = this._crag(Math.cos(a) * 2.2 + 13, Math.sin(a) * 2.2 - 7);
        const o = vampLandAt(k, u, v, h, n, r);
        this.lifted = o.lifted;
        return o.h;
    }

    /** Bare dark rock here (the crag and the ridge's top): no grass, no trees. */
    rocky(ix, iz) {
        const k = this.plan;
        if (!k) return false;
        const dx = ix - k.x, dz = iz - k.z;
        if (dx * dx + dz * dz <= (VAMP.R + 30) ** 2) return true;
        const { u, v } = vampUV(k, dx, dz);
        return v > VAMP.R && v < VAMP.R + VAMP.GORGE + VAMP.RIDGE.LEN && Math.abs(u) < VAMP.RIDGE.W + 10;
    }

    /** Near the castle (for the other sites to keep away). */
    near(x, z, r) {
        const k = this.plan;
        return !!k && Math.hypot(x - k.x, z - k.z) < r + VAMP.R + VAMP.GORGE + VAMP.RIDGE.LEN;
    }

    partsForChunk(cx, cz, C) {
        const k = this.plan;
        if (!k) return [];
        const x0 = cx * C, z0 = cz * C, x1 = x0 + C - 1, z1 = z0 + C - 1;
        if (k.x1 < x0 || k.x0 > x1 || k.z1 < z0 || k.z0 > z1) return [];
        const key = cx * 65536 + cz;
        let list = this._byChunk.get(key);
        if (!list) { list = k.parts.filter((p) => p.x1 >= x0 && p.x0 <= x1 && p.z1 >= z0 && p.z0 <= z1); if (this._byChunk.size > 400) this._byChunk.clear(); this._byChunk.set(key, list); }
        return list.length ? [list] : [];
    }
}
