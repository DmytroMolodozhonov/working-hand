/**
 * Landscape.js — the land of generation-5 worlds: big beautiful mountains and many kinds of land.
 *
 * (the author: «чтобы мир реально создавался красивым, фантастичным… большие горы красивые…
 * трава такая однотипная, зелёная, нету переливов… горы идут вверх-вверх-вверх, а потом раз — и
 * плоская полоса»)
 *
 * The ideas (not the code) of the well-known Minecraft world mods: long mountain ranges with sharp
 * peaks, ridges, crags and deep valleys between them; high plateaus with cliffs; many kinds of land
 * melting into each other; fantastic places — scarlet canyons with striped walls, emerald hills,
 * moonlit groves, islands floating in the sky (TerrainData._floatIslands);
 * the grass and the leaves change their colour from place to place.
 *
 *  - The height: rolling hills everywhere; mountain regions (long ranges, Tectonic-like) built of a
 *    ridged noise — the crests sharp, every next octave strongest where the ridge already is (as
 *    erosion leaves them); there is no ceiling: above LUSH.SOFT the ground just rises less steeply,
 *    so a peak stays a peak (never a flat strip); highlands: plateaus with stepped cliffs.
 *  - The kinds of land (BIOMES) come from a climate: warmth, wetness and a «wonder» field that makes
 *    the fantastic lands far from the spawn. Each column has weights of all of them (polynomial,
 *    not exp: the same numbers on every computer), so colours and shapes blend smoothly.
 *  - Near the spawn the land is as it always was (the play area); it changes into the new land
 *    between LUSH.NEAR and LUSH.FAR.
 *
 * Pure and deterministic (Node-testable, no THREE): the same seed gives the same land everywhere.
 */

import { createNoise2D, smoothstep } from '../core/math.js';

export const LUSH = {
    NEAR: 130, FAR: 300, // m: the old spawn land melts into the new one between these
    WONDER_NEAR: 300, WONDER_FAR: 520, // m: the fantastic lands only beyond this
    SOFT: 96, // layers: only above this does the ground rise less steeply (no ceiling, no flat tops)…
    TOP: 113, // …slowing down round this (never above ~116: the world is 120 layers high)
    SNOW: 66, // the snow line (lower in the cold, a little ragged)
    TREE_LINE: 54, // no trees above (but a few spruces a little higher in the cold)
    ISLE_MIN: 420, // m: no floating islands nearer the spawn
};

/** Land kinds of a column (fn.kind of the height field). */
export const KIND = { LAND: 0, MESA: 2, CLIFF: 3 }; // (1 was the stone spires — taken out: the author didn't like them)

/**
 * The kinds of land. T, W: their warmth and wetness (−1…1); fant: a fantastic land (only where the
 * «wonder» field is high). grass, grass2: the grass and its patches; leaf: the leaves' tint
 * [colour, share] (null: as they are); trees: how many trees; kinds: which trees (TREE_KINDS
 * indexes: 0 oak, 1 birch, 2 spruce, 3 cherry, 4 dark oak); tall: tall grass (share of the cells,
 * height in m); flowers: share of the cells and their colours.
 */
export const BIOMES = [
    { id: 'meadow', name: 'Цветущий луг', T: 0.15, W: -0.05, grass: 0x55a843, grass2: 0x86c04a, leaf: null, trees: 0.08, kinds: [0, 0, 1, 3], tall: [0.5, 0.45, 1.0], flowers: [0.16, 0xffd84a, 0xf6f4ee, 0x6fa0ff, 0xe8413c, 0xb070e0, 0xff8fc0] },
    { id: 'forest', name: 'Лес', T: 0.0, W: 0.55, grass: 0x3c8a3a, grass2: 0x2d733a, leaf: null, trees: 0.62, kinds: [0, 0, 1, 4, 4], tall: [0.32, 0.4, 0.8], flowers: [0.03, 0xf6f4ee, 0x6fa0ff] },
    { id: 'autumn', name: 'Золотая осень', T: -0.3, W: 0.15, grass: 0xa0ad45, grass2: 0xc4a548, leaf: [[0xe0862c, 0xf0b938, 0xc8452c, 0xd36a22, 0xb8a032], 0.86], trees: 0.42, kinds: [1, 1, 0, 0, 4], tall: [0.36, 0.4, 0.85], flowers: [0.05, 0xff9a3a, 0xffd84a] },
    { id: 'sakura', name: 'Вишнёвая долина', T: 0.5, W: 0.45, grass: 0x74bd57, grass2: 0x9ccc68, leaf: null, trees: 0.36, kinds: [3, 3, 3, 1], tall: [0.38, 0.35, 0.75], flowers: [0.12, 0xffb3d1, 0xfdf0f5, 0xff8fc0] },
    { id: 'jungle', name: 'Пышные заросли', T: 0.75, W: 0.75, grass: 0x2f9e38, grass2: 0x47b04a, leaf: [[0x2aa43a], 0.35], trees: 0.66, kinds: [0, 4, 4, 0], tall: [0.6, 0.6, 1.3], flowers: [0.06, 0xff5a3a, 0xffd84a, 0xd050ff] },
    { id: 'taiga', name: 'Тайга', T: -0.7, W: 0.35, grass: 0x4c9a62, grass2: 0x6aab78, leaf: [[0x2f6a58], 0.3], trees: 0.55, kinds: [2, 2, 2, 1], tall: [0.25, 0.35, 0.7], flowers: [0.03, 0x8fb0ff, 0xf6f4ee] },
    { id: 'steppe', name: 'Золотая степь', T: 0.7, W: -0.65, grass: 0xbab04e, grass2: 0xd0b45a, leaf: [[0x7d8f2c], 0.35], trees: 0.035, kinds: [0, 4], tall: [0.62, 0.6, 1.25], flowers: [0.04, 0xff9a3a, 0xe8c040, 0xe8413c] },
    { id: 'tundra', name: 'Холодное нагорье', T: -0.75, W: -0.55, grass: 0x8fae7a, grass2: 0xaab884, leaf: [[0x3f6a5a], 0.3], trees: 0.05, kinds: [2, 2, 1], tall: [0.22, 0.25, 0.5], flowers: [0.04, 0xf6f4ee, 0x8fb0ff, 0xb070e0] },
    // the fantastic lands (far from the spawn)
    { id: 'moon', name: 'Лунная роща', fant: 'moon', grass: 0x3a8a86, grass2: 0x6a66c0, leaf: [[0x8a57d6, 0x5a7fe0, 0x6f4ab8], 0.82], trees: 0.4, kinds: [4, 1, 0, 4], tall: [0.42, 0.4, 0.95], flowers: [0.1, 0x7ff9ff, 0xd08bff, 0x9fd0ff], glow: true },
    { id: 'mesa', name: 'Алые каньоны', fant: 'mesa', grass: 0x9a9a48, grass2: 0xb3a24f, leaf: [[0x8a9a3a], 0.4], trees: 0.03, kinds: [0, 4], tall: [0.12, 0.4, 0.8], flowers: [0.02, 0xff7a2a, 0xe8413c] },
    { id: 'emerald', name: 'Изумрудные холмы', fant: 'emerald', grass: 0x3e9a55, grass2: 0x62b06a, leaf: [[0x2f9a5a], 0.4], trees: 0.3, kinds: [2, 0, 1], tall: [0.3, 0.35, 0.8], flowers: [0.06, 0xf6f4ee, 0xffd84a, 0x7fd0ff] },
];
export const BIOME = Object.fromEntries(BIOMES.map((b, i) => [b.id, i]));
const N_PLAIN = BIOMES.findIndex((b) => b.fant);
const NB = BIOMES.length;

// the alpine look the grass takes high up, and the scarlet rock's stripes
const ALPINE = [0x8a9f80, 0x9fae94];
const MESA_BANDS = [0xb5562f, 0xc9733f, 0xdb9b5c, 0x9c4a2e, 0xe3b98e, 0xa95b3a, 0xc6653a, 0xd8a070];
const MESA_SAND = 0xc8743c;

const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const PAL = BIOMES.map((b) => ({ g: rgb(b.grass), g2: rgb(b.grass2) }));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Integer hash → [0, 1) (the same everywhere). */
export function hashLand(a, b, s) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/**
 * The landscape of a seed: the far land's height and the kind of land of every column.
 * @param {number} seed
 */
export function createLandscape(seed) {
    const s = seed | 0;
    const nT = createNoise2D(s ^ 0x51ed270b), nW = createNoise2D(s ^ 0x2d358dcc), nF = createNoise2D(s ^ 0x7a1c3b5f);
    const nK = createNoise2D(s ^ 0x1f83d9ab), nR = createNoise2D(s ^ 0x5be0cd19), nWarp = createNoise2D(s ^ 0x6c8e9cf5);
    const nM = [0x3ad4f1e1, 0x4b2a6c3d, 0x18e6f0a7, 0x77c1d30b, 0x2c49e8b5].map((k) => createNoise2D(s ^ k));
    const nH = createNoise2D(s ^ 0x0f6e3c19), nH2 = createNoise2D(s ^ 0x46a1b2c3);
    const nP = createNoise2D(s ^ 0x13579bdf), nP2 = createNoise2D(s ^ 0x2468ace0);
    const nC = createNoise2D(s ^ 0x0badcafe), nS = createNoise2D(s ^ 0x5eed5eed), nPatch = createNoise2D(s ^ 0x7e11a5e5);
    const nSnow = createNoise2D(s ^ 0x5a0f5a0f), nPk = createNoise2D(s ^ 0x1ce4e5b9);

    // the octaves of the ridges are turned against each other (the noise's grid never shows)
    const ROT = [0, 0.71, 1.93, 2.6, 4.1].map((a) => [Math.cos(a), Math.sin(a)]);

    const L = {
        /** Last height(): the kind of land (KIND), the fantastic lands' weights, the wonder share. */
        kind: KIND.LAND, mesa: 0, emer: 0, moon: 0, fant: 0,
    };

    /** Climate of a column: warmth, wetness, wonder (filled into `out`). */
    L.climate = (x, z, out) => {
        // (turned against the noise's grid, two octaves: no square patches of a colour)
        const u = x * 0.8 - z * 0.6, v = x * 0.6 + z * 0.8;
        out.T = clamp(1.05 * nT(u / 1150, v / 1150) + 0.4 * nT(z / 330 + 40, -x / 330 - 17) + 0.12 * nT(v / 90, u / 90), -1, 1);
        out.W = clamp(1.05 * nW(v / 1000, -u / 1000) + 0.4 * nW(x / 300 - 23, z / 300 + 61) + 0.12 * nW(u / 85, v / 85), -1, 1);
        return out;
    };

    /** The fantastic lands' weights of a column (L.mesa, L.emer, L.moon; L.fant their sum). */
    const wonder = (x, z, dist) => {
        const far = smoothstep(LUSH.WONDER_NEAR, LUSH.WONDER_FAR, dist);
        if (far <= 0) { L.fant = L.mesa = L.emer = L.moon = 0; return; }
        const f = 1.25 * nF((x * 0.6 + z * 0.8) / 900, (z * 0.6 - x * 0.8) / 900) + 0.3 * nF(x / 240 + 77, z / 240 + 5);
        const fant = smoothstep(0.34, 0.58, f) * far;
        L.fant = fant;
        if (fant <= 0) { L.mesa = L.emer = L.moon = 0; return; }
        const k = nK(x / 520, z / 520);
        const mesa = smoothstep(-0.06, -0.24, k), emer = smoothstep(0.06, 0.24, k);
        L.mesa = fant * mesa; L.emer = fant * emer; L.moon = fant * (1 - mesa - emer);
    };

    /** Ridged multifractal: sharp crests, gullies between; ~0…1. */
    const ridged = (x, z) => {
        let sum = 0, amp = 1, w = 1, f = 1 / 230;
        for (let o = 0; o < 4; o++) {
            const [c, si] = ROT[o];
            const u = (x * c - z * si) * f, v = (x * si + z * c) * f;
            let n = 1 - Math.abs(nM[o](u + o * 17.3, v - o * 9.1) * 1.55);
            if (n < 0) n = 0;
            n *= n;
            n *= w;
            sum += n * amp;
            w = clamp(n * 1.8, 0, 1);
            amp *= 0.47;
            f *= 2.03;
        }
        return Math.max(0, sum / 1.5 - 0.04);
    };

    /** Terraces: flat steps with steep risers (cliffs, a plateau's or a canyon's stepped walls). */
    const terrace = (h, step, sharp) => {
        const t = h / step, i = Math.floor(t), fr = t - i;
        return (i + smoothstep(0.5 - sharp, 0.5 + sharp, fr)) * step;
    };

    /**
     * The far land's height at a column (a float, before rivers, lakes, seas), `dist` its distance
     * from the spawn. Sets L.kind (the scarlet rock, a cliff…) and the wonder weights.
     */
    L.height = (x, z, dist) => {
        L.kind = KIND.LAND;
        wonder(x, z, dist);
        // the land's own big shapes
        const wx = x + 60 * nWarp(x / 400, z / 400), wz = z + 60 * nWarp(x / 400 + 31, z / 400 - 47);
        // rolling hills (the plains: castles, villages, fields)
        let h = 3.2 + 2.6 * nH(x / 74, z / 74) + 1.4 * nH2(x / 25, z / 25) + 0.45 * nH(x / 8 + 13, z / 8 - 7);
        // mountain regions: long ranges (stretched along one way), sharp peaks
        const rx = wx * 0.83 + wz * 0.55, rz = (-wx * 0.55 + wz * 0.83) * 1.7;
        const m = smoothstep(-0.12, 0.34, nR(rx / 760, rz / 760) + 0.25 * nR(x / 210 + 9, z / 210 + 3));
        if (m > 0) {
            const r = ridged(wx, wz);
            const big = 0.78 + 0.4 * smoothstep(-0.4, 0.5, nR(x / 1500 - 21, z / 1500 + 8)); // (some ranges higher)
            const mt = m * m * (3 - 2 * m);
            // along a crest: peaks and saddles (a ridge never runs level — no «flat strip» from afar);
            // r·√r: the slopes steepen towards the top, the summit a point
            const pk = smoothstep(-0.55, 0.6, nPk(wx / 140, wz / 140) + 0.3 * nPk(x / 47 + 3, z / 47 - 8));
            // the range's body (valleys inside it lie high too), the ridges on it
            const mass = smoothstep(-0.35, 0.55, nPk(x / 330 + 61, z / 330 - 14));
            const rr = r * (0.3 + 0.7 * Math.sqrt(r));
            const teeth = 0.82 + 0.36 * (0.5 + 0.5 * nPk(wx / 31 - 7, wz / 31 + 19)); // (summits along a crest, a few dozen metres apart)
            const lift = 0.4 + 0.6 * Math.min(1, r * 2.4); // (the body rises under the ridges: a summit, not a dome)
            h += mt * (4 + 26 * mass * lift + rr * 76 * big * (0.5 + 0.62 * pk) * teeth) + mt * (2 + 5 * r) * nH2(x / 11 - 5, z / 11 + 2); // (crags, rougher up high)
        }
        // highlands: plateaus with stepped cliffs (not in the mountains)
        const pl = smoothstep(0.4, 0.5, nP(x / 430, z / 430)) * (1 - m) * (1 - L.fant);
        if (pl > 0) {
            const top = 15 + 8 * nP2(x / 160, z / 160) + 1.5 * nH2(x / 19, z / 19);
            h = Math.max(h, h + (terrace(top, 5, 0.12) - h) * pl);
            if (pl > 0.05 && pl < 0.95) L.kind = KIND.CLIFF;
        }
        // the scarlet canyons: a striped tableland cut by deep stepped canyons, buttes left standing
        if (L.mesa > 0) {
            const top = 24 + 6 * nP2(x / 120 + 50, z / 120);
            const c = Math.abs(nC(wx / 170, wz / 170) + 0.3 * nC(x / 47 + 11, z / 47 - 4));
            const cut = 1 - smoothstep(0.035, 0.2, c);
            const floor = 3 + 1.2 * nH2(x / 15, z / 15);
            const mh = terrace(top - cut * (top - floor), 4, 0.16);
            h = h + (mh - h) * smoothstep(0, 0.6, L.mesa);
            if (L.mesa > 0.3) L.kind = KIND.MESA;
        }
        // emerald hills: round green hills rolling one into another (the stone spires that stood here were taken out at the author's wish)
        if (L.emer > 0) h += L.emer * (5 + 5 * nS(x / 46 + 33, z / 46 - 21) + 2.5 * nS(x / 15 - 8, z / 15 + 12));
        // no ceiling: the highest ground only rises less steeply (smoothly — a peak keeps its point)
        if (h > LUSH.SOFT) { const e = h - LUSH.SOFT, K = LUSH.TOP - LUSH.SOFT; h = LUSH.SOFT + (e * K) / (K + e * 0.85); } // (→ at most SOFT + K/0.85 ≈ 116)
        return h;
    };

    /** A ragged edge (−1…1, smooth over a few metres): the floating islands' outline. */
    L.wobble = (x, z) => 1.4 * nS(x / 4.3 + 101, z / 4.3 - 57);

    /** Groves and clearings: how many trees there are here, ×0.3…1.4 of the land's own share. */
    const nG = createNoise2D(s ^ 0x6a6f7665);
    L.grove = (x, z) => 0.3 + 1.1 * smoothstep(-0.32, 0.32, nG(x / 85, z / 85) + 0.35 * nG(x / 23 + 5, z / 23 - 8));

    /** The snow line at a column (lower in the cold, a little ragged). */
    L.snowLine = (x, z, T) => LUSH.SNOW + 6 * nSnow(x / 23, z / 23) + 3 * nSnow(x / 7 + 3, z / 7) - 16 * Math.max(0, -T) + 6 * Math.max(0, T);
    /** Snow patches below the line: 0…1, a few metres across (low: snow lies here first). */
    L.snowPatch = (x, z) => 0.5 + 0.5 * (0.7 * nSnow(x / 5.3 + 211, z / 5.3 - 77) + 0.3 * nSnow(x / 2.1 - 40, z / 2.1 + 19));

    /**
     * The kinds of land at a column: their weights into `w` (Float32Array(BIOMES.length), summing
     * to 1); returns the strongest kind. `fx`: the column's fantastic lands' weights ({mesa, emer,
     * moon, fant} — the height field's flags); `spawn`: 0…1, near the spawn a fresh meadow.
     */
    L.biomes = (c, w, spawn, fx) => {
        let sum = 0;
        const plain = 1 - fx.fant;
        for (let i = 0; i < N_PLAIN; i++) {
            const b = BIOMES[i];
            const dt = c.T - b.T, dw = c.W - b.W;
            let k = 1 - (dt * dt + dw * dw) / 0.42;
            k = k > 0 ? k * k : 0;
            w[i] = k * plain + 1e-4;
        }
        w[BIOME.meadow] += 0.6 * spawn;
        w[BIOME.moon] = fx.moon * 1.4; w[BIOME.mesa] = fx.mesa * 1.4; w[BIOME.emerald] = fx.emer * 1.4;
        let best = 0;
        for (let i = 0; i < NB; i++) { sum += w[i]; if (w[i] > w[best]) best = i; }
        for (let i = 0; i < NB; i++) w[i] /= sum;
        return best;
    };

    /**
     * The colours of a column: its grass, its leaves' tint, its rock and sand — packed into `out`
     * ({grass, leaf, leafK, rock, sand}). `w`: the column's biome weights; h its height.
     */
    L.colours = (x, z, h, w, c, out) => {
        const p1 = 0.5 + 0.5 * nPatch(x / 17, z / 17) + 0.22 * nPatch(x / 5.5 + 20, z / 5.5 - 9);
        const pk = clamp(p1, 0, 1);
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < NB; i++) {
            const k = w[i];
            if (k < 0.002) continue;
            const P = PAL[i];
            r += k * (P.g[0] + (P.g2[0] - P.g[0]) * pk);
            g += k * (P.g[1] + (P.g2[1] - P.g[1]) * pk);
            b += k * (P.g[2] + (P.g2[2] - P.g[2]) * pk);
        }
        // high up the grass turns alpine, warm places a touch yellower, cold ones bluer
        const alp = smoothstep(30, 62, h);
        if (alp > 0) {
            const A = rgb(ALPINE[pk > 0.5 ? 1 : 0]);
            r += (A[0] - r) * alp * 0.75; g += (A[1] - g) * alp * 0.75; b += (A[2] - b) * alp * 0.75;
        }
        r *= 1 + 0.05 * c.T; b *= 1 - 0.06 * c.T;
        out.grass = (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255);
        // the leaves: the strongest tinting land wins (autumn: a colour per tree-sized patch)
        let lk = 0, lc = 0;
        for (let i = 0; i < NB; i++) {
            const lf = BIOMES[i].leaf;
            if (!lf || w[i] * lf[1] <= lk) continue;
            lk = w[i] * lf[1];
            const pal = lf[0];
            lc = pal.length === 1 ? pal[0] : pal[Math.floor(hashLand(x >> 2, z >> 2, s + 91) * pal.length)];
        }
        out.leaf = lc; out.leafK = lk;
        // the rock: grey; the scarlet lands' stripes are drawn per layer (rockColour)
        out.mesa = w[BIOME.mesa];
        return out;
    };

    return L;
}

/** The scarlet rock's colour of a layer (stripes), mixed into grey by `k` (0…1). */
export function mesaRock(L, k, grey) {
    const band = MESA_BANDS[((L * 7 + (L >> 2) * 3) % MESA_BANDS.length + MESA_BANDS.length) % MESA_BANDS.length];
    return mixColour(grey, band, k);
}

/** The scarlet lands' sand. */
export const MESA_SAND_COLOUR = MESA_SAND;

/** a + (b − a)·k for packed 0xRRGGBB colours. */
export function mixColour(a, b, k) {
    if (k <= 0) return a;
    if (k >= 1) return b;
    const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
    const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
    const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
