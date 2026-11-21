/**
 * ForestRules.js — the undergrowth of the forest (world generation FOREST_FROM_GEN; the author 21.11: «лес — это просто деревья, ну иногда
 * грибы… лес должен быть разнообразный, интересный, проработанный… много мелких деталей»). Pure (no three.js): what lies and grows between
 * the trunks, from the seed and the chunk's own blocks — the same on every computer.
 *
 * Kinds: a fallen log (a broken trunk, or a tree torn up with its roots), a stump, ferns, mushrooms (four sorts, in rings and clusters),
 * hazel and berry bushes, drifts of fallen leaves, heaps of twigs, bluebells and wood anemones in the clearings, mossy boulders.
 * Thick forest (Landscape `grove` high) has more of everything and more dead wood; clearings have flowers and ferns.
 * Only on forest ground (the chunk's biome), on a grass block with air over it, away from the trunks of the chunk's own trees, off built
 * places and off waterfalls; the solid kinds (logs, stumps, boulders) keep inside the chunk so a neighbour's answer never matters.
 */
import { BLOCK, CHUNK, MIN_LAYER } from './Terrain.js';
import { BIOME } from './Landscape.js';

export const FOREST_FROM_GEN = 36;

export const FOREST = {
    CELL: 4, // m: the cell of the candidates
    TRUNK_R: 1.9, // m: kept clear round the trunk of a tree (the trunk is 2 m wide)
    LOG_LEN: [4.5, 9], LOG_R: [0.55, 0.95], STUMP_R: [0.75, 1.35], STONE_R: [1.0, 2.3],
    MARGIN: 5.6, // m: the solid kinds keep this far from the chunk's edge (a log 9 m long fits)
};

function h01(a, b, s) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
const lerp = (r, t) => r[0] + (r[1] - r[0]) * t;

/** Drifts (0…1, smooth over ~14 m): where mushrooms, flowers, leaves gather. */
function patch(x, z, seed, salt) {
    const X = x / 14, Z = z / 14, ix = Math.floor(X), iz = Math.floor(Z), fx = X - ix, fz = Z - iz;
    const u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
    const a = h01(ix, iz, seed + salt), b = h01(ix + 1, iz, seed + salt), c = h01(ix, iz + 1, seed + salt), d = h01(ix + 1, iz + 1, seed + salt);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

/** The kinds, with the number of shapes each has (ForestModel.js draws them): the order is the order of the meshes. */
export const KINDS = { log: 2, stump: 2, fern: 3, mush: 4, bush: 2, litter: 2, twig: 2, bell: 2, stone: 2 };

/**
 * The undergrowth of one terrain chunk `c` (cx, cz, top, blocks, bio, trees, shape): [{ id, k, v, x, y, z, s, yaw, … }].
 * `data`: the TerrainData (its land for the grove, its sites and falls to keep off).
 */
export function forestOfChunk(data, c) {
    const out = [];
    if (!c || !c.bio || !c.top) return out;
    const forest = BIOME.forest, seed = data.seed | 0, COLS = CHUNK * CHUNK, x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    const trees = c.trees || [];
    const S = data.sites, land = data.land;
    const colOf = (x, z) => (z - z0) * CHUNK + (x - x0);
    /** a free forest-grass spot: ground y (top of the block) or null */
    const ground = (x, z, flat) => {
        const lx = Math.round(x) - x0, lz = Math.round(z) - z0; // (a block spans ±0.5 round its whole number)
        if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK || x < x0 || z < z0 || x >= x0 + CHUNK || z >= z0 + CHUNK) return null;
        const col = lz * CHUNK + lx;
        if (c.bio[col] !== forest) return null;
        const L = c.top[col], i = (L - MIN_LAYER) * COLS + col;
        if (c.blocks[i] !== BLOCK.GRASS) return null;
        const above = c.blocks[i + COLS];
        if (above !== BLOCK.AIR && above !== undefined) return null;
        if (c.shape && c.shape[i]) return null; // (a slab or a ramp: nothing lies on it)
        if (flat) { // the ground round it level (a log does not lie across a step)
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = lx + dx, nz = lz + dz;
                if (nx < 0 || nz < 0 || nx >= CHUNK || nz >= CHUNK) continue;
                if (Math.abs(c.top[nz * CHUNK + nx] - L) > 1) return null;
            }
        }
        return L - 0.5;
    };
    const clearOfTrees = (x, z, r) => { for (const t of trees) { const dx = t.x - x, dz = t.z - z, R = FOREST.TRUNK_R + r; if (dx * dx + dz * dz < R * R) return false; } return true; };
    const clearOfSites = (x, z, r) => !(S && (S.landAt(Math.round(x), Math.round(z)) || S.near(x, z, r + 4).length)) && !data.falls?.near?.(x, z, r + 3);
    const push = (o) => { o.id = o.k + c.cx + ',' + c.cz + ':' + out.length; out.push(o); return o; };

    // the solid things, kept clear of everything (and of one another)
    const solids = [];
    const room = (x, z, r) => { for (const q of solids) { const dx = q.x - x, dz = q.z - z, R = q.r + r; if (dx * dx + dz * dz < R * R) return false; } return true; };
    const solid = (o, r) => { solids.push({ x: o.x, z: o.z, r }); return o; };
    const inner = (x, z) => x - x0 >= FOREST.MARGIN && x - x0 <= CHUNK - FOREST.MARGIN && z - z0 >= FOREST.MARGIN && z - z0 <= CHUNK - FOREST.MARGIN;

    const CELL = FOREST.CELL;
    for (let cz = 0; cz < CHUNK; cz += CELL) for (let cx = 0; cx < CHUNK; cx += CELL) {
        const gx = x0 + cx, gz = z0 + cz, kx = gx >> 2, kz = gz >> 2;
        const jx = gx + 0.4 + h01(kx, kz, seed + 6101) * (CELL - 0.8), jz = gz + 0.4 + h01(kz, kx, seed + 6102) * (CELL - 0.8);
        if (!ground(jx, jz, false)) continue;
        const g = land?.grove ? land.grove(jx, jz) : 0.9; // (0.3 clearing … 1.4 thick forest)
        const thick = Math.min(1, Math.max(0, (g - 0.3) / 1.1));
        const damp = patch(jx, jz, seed, 6110), flowerP = patch(jx + 90, jz - 40, seed, 6111), leafP = patch(jx - 30, jz + 60, seed, 6112);
        const roll = h01(kx + 3, kz - 7, seed + 6120);
        const y = ground(jx, jz, false);
        const yaw = h01(kx, kz + 5, seed + 6130) * Math.PI * 2;
        const rr = (n) => h01(kx * 5 + n, kz * 3 - n, seed + 6140 + n);

        // ---- fallen leaves: drifts, deepest under the thick trees (the commonest thing on the floor)
        if (leafP * (0.5 + thick) > 0.42 && rr(1) < 0.62 && clearOfSites(jx, jz, 1)) {
            push({ k: 'litter', v: rr(2) < 0.35 ? 1 : 0, x: jx, y, z: jz, s: 0.85 + rr(3) * 0.8, yaw });
        }
        // ---- ferns: in the damp and the shade, in clumps of one to three
        if (rr(4) < 0.2 + 0.5 * damp * (0.4 + thick)) {
            const n = 1 + Math.floor(rr(5) * 3);
            for (let i = 0; i < n; i++) {
                const a = rr(6 + i) * Math.PI * 2, d = 0.4 + rr(9 + i) * 1.4, fx = jx + Math.cos(a) * d, fz = jz + Math.sin(a) * d;
                const fy = ground(fx, fz, false);
                if (fy == null || !clearOfTrees(fx, fz, 0.3) || !clearOfSites(fx, fz, 0.5)) continue;
                push({ k: 'fern', v: Math.floor(rr(12 + i) * KINDS.fern), x: fx, y: fy, z: fz, s: 0.7 + rr(15 + i) * 0.75, yaw: rr(18 + i) * 6.28 });
            }
        }
        // ---- mushrooms: where it is damp — a ring or a cluster of one sort (the sort by the patch)
        if (damp > 0.35 && rr(21) < 0.2 + 0.4 * (damp - 0.35) + 0.12 * thick) {
            const v = Math.min(KINDS.mush - 1, Math.floor(h01(Math.floor(jx / 14), Math.floor(jz / 14), seed + 6150) * KINDS.mush));
            const ring = rr(22) < 0.12, n = ring ? 6 : 1;
            for (let i = 0; i < n; i++) {
                const a = ring ? (i / n) * Math.PI * 2 + rr(24) : rr(25 + i) * Math.PI * 2, d = ring ? 1.7 + rr(26) * 0.3 : 0.3 + rr(27 + i) * 1.0;
                const mx = jx + Math.cos(a) * d, mz = jz + Math.sin(a) * d, my = ground(mx, mz, false);
                if (my == null || !clearOfTrees(mx, mz, 0.2) || !clearOfSites(mx, mz, 0.3)) continue;
                push({ k: 'mush', v, x: mx, y: my, z: mz, s: 0.6 + rr(30 + i) * 0.75, yaw: rr(33 + i) * 6.28 });
            }
        }
        // ---- bushes: hazel and berry
        if (rr(36) < 0.1 + 0.12 * (1 - thick) + 0.05 * damp && clearOfTrees(jx, jz, 1) && clearOfSites(jx, jz, 1.5)) {
            push({ k: 'bush', v: rr(37) < 0.4 ? 1 : 0, x: jx, y, z: jz, s: 0.8 + rr(38) * 0.6, yaw });
        }
        // ---- twigs and branches
        if (rr(39) < 0.12 + 0.12 * thick && clearOfSites(jx, jz, 1)) {
            const tx = jx + (rr(41) - 0.5) * 2, tz = jz + (rr(42) - 0.5) * 2, ty = ground(tx, tz, false);
            if (ty != null) push({ k: 'twig', v: rr(40) < 0.35 ? 1 : 0, x: tx, y: ty, z: tz, s: 0.8 + rr(43) * 0.7, yaw });
        }
        // ---- flowers in the lighter places: bluebells and wood anemones in drifts
        if (flowerP > 0.5 && thick < 0.75 && rr(44) < 0.5 * (flowerP - 0.35)) {
            const v = patch(jx, jz, seed, 6113) < 0.5 ? 0 : 1;
            const n = 2 + Math.floor(rr(45) * 3);
            for (let i = 0; i < n; i++) {
                const a = rr(46 + i) * 6.28, d = 0.2 + rr(50 + i) * 1.9, fx = jx + Math.cos(a) * d, fz = jz + Math.sin(a) * d, fy = ground(fx, fz, false);
                if (fy == null || !clearOfTrees(fx, fz, 0.2) || !clearOfSites(fx, fz, 0.3)) continue;
                push({ k: 'bell', v, x: fx, y: fy, z: fz, s: 0.75 + rr(54 + i) * 0.6, yaw: rr(58 + i) * 6.28 });
            }
        }
        // ---- dead wood and stone: few and big — only in the middle of the chunk, level, with room (a log is solid)
        if (inner(jx, jz) && roll < 0.12 + 0.16 * thick && clearOfSites(jx, jz, 5)) {
            const len = lerp(FOREST.LOG_LEN, rr(60)), r = lerp(FOREST.LOG_R, rr(61)), ax = Math.cos(yaw), az = Math.sin(yaw);
            const ok = [-0.5, 0, 0.5].every((f) => { const px = jx + ax * len * f, pz = jz + az * len * f; return ground(px, pz, true) != null && clearOfTrees(px, pz, r) && inner(px, pz); });
            if (ok && room(jx, jz, len * 0.5 + r)) push(solid({ k: 'log', v: rr(62) < 0.4 ? 1 : 0, x: jx, y, z: jz, s: 1, yaw, len, r }, len * 0.5 + r));
        } else if (inner(jx, jz) && roll > 0.84 - 0.04 * thick && roll < 0.92 && clearOfSites(jx, jz, 4)) {
            const r = lerp(FOREST.STUMP_R, rr(63));
            if (ground(jx, jz, true) != null && clearOfTrees(jx, jz, r) && room(jx, jz, r + 0.5)) push(solid({ k: 'stump', v: rr(64) < 0.45 ? 1 : 0, x: jx, y, z: jz, s: 1, yaw, r, h: 0.9 + rr(65) * 0.9 }, r + 0.5));
        } else if (inner(jx, jz) && roll > 0.965 && roll < 0.965 + 0.012 + 0.012 * thick && clearOfSites(jx, jz, 4)) {
            const r = lerp(FOREST.STONE_R, rr(66));
            if (ground(jx, jz, true) != null && clearOfTrees(jx, jz, r) && room(jx, jz, r + 0.3)) push(solid({ k: 'stone', v: rr(67) < 0.5 ? 1 : 0, x: jx, y, z: jz, s: 1, yaw, r, squash: 0.62 + rr(68) * 0.3 }, r + 0.3));
        }
    }
    void colOf;
    return out;
}

/** The solid boxes of an item (logs a chain along their length; stumps and stones one): [{ minX, … }] — for Collision.addBox. */
export function boxesOf(it) {
    if (it.k === 'log') {
        const n = Math.max(2, Math.ceil(it.len / 1.3)), w = it.r * 0.86, hgt = it.r * 1.55, ax = Math.cos(it.yaw), az = Math.sin(it.yaw), out = [];
        for (let i = 0; i < n; i++) {
            const f = (i + 0.5) / n - 0.5, px = it.x + ax * it.len * f, pz = it.z + az * it.len * f;
            out.push({ minX: px - w, maxX: px + w, minY: it.y, maxY: it.y + hgt, minZ: pz - w, maxZ: pz + w });
        }
        return out;
    }
    if (it.k === 'stump') { const w = it.r * 0.8; return [{ minX: it.x - w, maxX: it.x + w, minY: it.y, maxY: it.y + it.h * 0.95, minZ: it.z - w, maxZ: it.z + w }]; }
    if (it.k === 'stone') { const w = it.r * 0.62, hgt = Math.max(0.5, it.r * it.squash * 1.05); return [{ minX: it.x - w, maxX: it.x + w, minY: it.y, maxY: it.y + hgt, minZ: it.z - w, maxZ: it.z + w }]; }
    return [];
}
