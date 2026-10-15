/**
 * DragonLairs.js — the dragons' lairs: special, rare, huge caves high up in the big mountains.
 *
 * (the author: «Драконы живут в особых пещерах, на больших горах… прям на горы поднимаешься, там
 * большая пещера. Вход… им там удобнее взлетать. Такой большой-большой вход.»)
 *
 *  - Rare: at most one per LAIR.CELL × LAIR.CELL metres, and only where a big mountain stands
 *    (its peak at least LAIR.PEAK_MIN layers high) — far from the spawn.
 *  - High up: the hall is carved into the mountain under its peak; its floor is where the
 *    mountainside is still high (LAIR.DROP layers below the peak at most), so you climb the
 *    mountain to reach it.
 *  - A great hall (radius 17–22 m, a dome up to 15 m where the rock above allows), much bigger
 *    than any chamber of the ordinary caves, its floor flat (the hoard lies on it).
 *  - A huge entrance in the steep side of the mountain: a wide, high mouth (13 m wide, ~10 m
 *    high) straight out onto the slope — a dragon walks out of it and takes off from there.
 *
 * Pure and deterministic (Node-testable, no THREE): the same seed gives the same lairs on every
 * computer. A lair is a cave «system» like CaveSystems' (segs, chambers, bounds), so TerrainData
 * carves it with the same carveColumn; its `lair` says where the hall, the hoard and the mouth are.
 */

import { createRng } from '../core/math.js';

export const LAIR = {
    CELL: 480, // m: at most one lair per cell
    CHANCE: 0.22, // a cell with a big enough mountain holds one this often (half as many lairs as before — the author asked; the ones left stay where they were)
    MIN_SPAWN: 320, // m: never nearer the spawn
    PEAK_MIN: 25, // the peak's top layer (a big mountain: they reach 36 far from the spawn)
    DROP: 9, // layers from the peak down to the mouth's floor (at least…)
    DROP_MAX: 16, // …and at most: the lair stays high up the mountain
    R_MIN: 17, R_MAX: 22, // m: the hall's radius
    H: 15, // the hall's dome (layers above its floor) where the rock allows
    MOUTH_R: 6.5, // m: the entrance's radius (13 m wide)
    OUT: 10, // m the entrance reaches beyond the mouth spot (out onto the slope)
    NEED: 8, // layers of rock over the hall's floor all round it (it is inside the mountain)
};

const TAU = Math.PI * 2;

/**
 * The lair of a lair cell (or null).
 * @param {number} gx  the cell
 * @param {number} gz
 * @param {number} seed  the world's seed
 * @param {(x:number, z:number) => number} H  the ground's top layer at a column
 * @param {(x:number, z:number) => boolean} blocked  no lair here (water, a castle or village…)
 */
export function lairOf(gx, gz, seed, H, blocked) {
    const rng = createRng(((seed * 4241) ^ Math.imul(gx, 7919) ^ Math.imul(gz, 15485863) ^ 0xd4a90) >>> 0);
    if (rng() > LAIR.CHANCE) return null;
    const C = LAIR.CELL;
    // the highest ground of the cell (sampled), then climbed to its peak
    let p = null;
    for (let i = 0; i < 48; i++) {
        const x = gx * C + 40 + rng() * (C - 80), z = gz * C + 40 + rng() * (C - 80);
        const h = H(Math.round(x), Math.round(z));
        if (!p || h > p.h) p = { x, z, h };
    }
    if (!p || p.h < LAIR.PEAK_MIN - 3) return null;
    for (let k = 0; k < 30; k++) {
        let up = null;
        for (let a = 0; a < 8; a++) {
            const x = p.x + Math.cos((a / 8) * TAU) * 4, z = p.z + Math.sin((a / 8) * TAU) * 4;
            const h = H(Math.round(x), Math.round(z));
            if (h > (up ? up.h : p.h)) up = { x, z, h };
        }
        if (!up) break;
        p = up;
    }
    if (p.h < LAIR.PEAK_MIN || Math.hypot(p.x, p.z) < LAIR.MIN_SPAWN || blocked(p.x, p.z)) return null;
    const r = LAIR.R_MIN + rng() * (LAIR.R_MAX - LAIR.R_MIN);
    // the side of the mountain for the mouth: walking down from the peak, where it falls steeply
    // enough (the mouth's floor DROP…DROP_MAX layers below the peak) with the hall all inside rock
    let best = null;
    const a0 = rng() * TAU;
    for (let i = 0; i < 16; i++) {
        const a = a0 + (i / 16) * TAU, dx = Math.cos(a), dz = Math.sin(a);
        for (let d = 6; d < 90; d += 2) {
            const mx = p.x + dx * d, mz = p.z + dz * d;
            if (blocked(mx, mz)) break;
            const F = H(Math.round(mx), Math.round(mz));
            if (p.h - F < LAIR.DROP) continue;
            if (p.h - F > LAIR.DROP_MAX) break; // (too steep a fall to a low mouth: not this side)
            // the hall: inward from the mouth by most of its radius; rock over it all round
            const cx = mx - dx * r * 0.85, cz = mz - dz * r * 0.85;
            let ok = 0, n = 0, wet = false;
            for (const q of [0, r * 0.45, r * 0.8]) {
                const m = q ? Math.ceil((TAU * q) / 5) : 1;
                for (let k = 0; k < m; k++) {
                    const x = cx + Math.cos((k / m) * TAU) * q, z = cz + Math.sin((k / m) * TAU) * q;
                    if (blocked(x, z)) { wet = true; break; }
                    // (the mouth's side may open: only the rest counts)
                    if (q && ((x - cx) * dx + (z - cz) * dz) > r * 0.5) continue;
                    n++;
                    if (H(Math.round(x), Math.round(z)) >= F + LAIR.NEED) ok++;
                }
                if (wet) break;
            }
            if (wet || n === 0) break;
            const score = ok / n;
            if (score > 0.85 && (!best || score > best.score || (score === best.score && F > best.F))) best = { a, dx, dz, mx, mz, cx, cz, F, score };
            break;
        }
    }
    if (!best) return null;
    const { dx, dz, mx, mz, cx, cz, F } = best;
    const id = 'lair' + gx + '_' + gz;
    const hall = { x: cx, z: cz, F, r, h: LAIR.H, end: true, from: { x: mx, z: mz }, w1: 0, w2: 0, p1: 0, p2: 0, lair: true };
    // the entrance: a wide, high tunnel from inside the hall out through the mountainside (open:
    // no roof kept where it comes out), its floor level with the hall's
    const segs = [];
    const R = LAIR.MOUTH_R, y = F + 0.79 * R + 0.5;
    const len = Math.hypot(mx - cx, mz - cz) - r * 0.4 + LAIR.OUT;
    const n = Math.max(1, Math.ceil(len / 3));
    for (let i = 0; i < n; i++) {
        const t0 = r * 0.4 + (i / n) * len, t1 = r * 0.4 + ((i + 1) / n) * len;
        segs.push({ ax: cx + dx * t0, ay: y, az: cz + dz * t0, bx: cx + dx * t1, by: y, bz: cz + dz * t1, r: R, open: true, minL: F + 1 });
    }
    const s = { id, test: false, segs, chambers: [hall], chests: [], seed: Math.floor(rng() * 1e9) };
    let x0 = cx - r - 1, x1 = cx + r + 1, z0 = cz - r - 1, z1 = cz + r + 1;
    for (const g of segs) {
        const q = g.r * 1.3 + 1;
        x0 = Math.min(x0, g.bx - q); x1 = Math.max(x1, g.bx + q); z0 = Math.min(z0, g.bz - q); z1 = Math.max(z1, g.bz + q);
    }
    Object.assign(s, { x0, x1, z0, z1 });
    // the dragon's own chests: two against the back of the hall, either side of the hoard (the treasure it guards)
    for (const side of [-1, 1]) {
        const x = cx - dx * r * 0.55 - dz * side * r * 0.5, z = cz - dz * r * 0.55 + dx * side * r * 0.5;
        s.chests.push({ x, y: F, z, a: Math.atan2(cx - x, cz - z), boss: 'dragon' });
    }
    // where things are: the hoard against the back wall, away from the mouth; the mouth; the ledge
    // outside it (where a dragon takes off)
    s.lair = {
        id, x: cx, z: cz, F, r, dir: Math.atan2(dz, dx), dx, dz,
        hoard: { x: cx - dx * r * 0.35, z: cz - dz * r * 0.35 },
        mouth: { x: mx, z: mz },
        out: { x: mx + dx * (LAIR.OUT + 6), z: mz + dz * (LAIR.OUT + 6) },
        seed: s.seed,
    };
    return s;
}

/** Is a point (x, z, layer-ish y) inside a lair's hall? (its floor up to its dome) */
export function inHall(L, x, y, z, pad = 0) {
    return Math.hypot(x - L.x, z - L.z) < L.r + pad && y > L.F - 2 && y < L.F + LAIR.H + 2;
}
