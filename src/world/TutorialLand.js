/**
 * TutorialLand.js — the land of «Обучение» (Tutorial.js): not a world, a small bounded map (the author 07.11: «это даже не будет мир,
 * это будет вообще типа новая карта, чисто с границами… максимально убираем всё лишнее»). Pure (no THREE): made in the terrain
 * workers like any land (Terrain._generateChunk → generateTutorialChunk), the same on every computer.
 *
 *   - a round meadow (radius MEADOW) of grass on dirt, flat — nothing to trip over; in its middle a ring of cobbles (the place where the
 *     hero stands, SPAWN, facing north) and a path round it;
 *   - north of it the little hill (HILL) of rock under a skin of earth and grass, with gravel and loose stones: the target of the first
 *     «Бомбардо»;
 *   - round all of it a wall of cliffs (from CLIFF0 to CLIFF1, rising to WALL m: layered stone, gravel ledges, grass and moss on the
 *     ledges' tops) and beyond them a high plateau of rock to the end of sight: no edge to fall off, no way out, nothing else at all —
 *     no caves, castles, trees, seas or creatures (Terrain `tutorial`: no feature runs).
 * Measures from the world's: a block 1 m, the hero 3.5 m tall; the meadow 84 m across (room to walk and run, and for the zombies to come
 * from far enough to be seen); the hill 13 m wide, 6 high, 22 m before the hero (a spell's easy reach, not too close for the blast).
 */
import { BLOCK, CHUNK, MIN_LAYER, MAX_LAYER, OLD_BEDROCK } from './Terrain.js';

export const TUTORIAL = {
    G: 10, // the meadow's top layer
    MEADOW: 42, // m: the flat meadow's radius
    CLIFF0: 44, CLIFF1: 54, // m: the cliffs rise between these
    WALL: 18, // m: the cliffs' height over the meadow
    SPAWN: { x: 0, z: 12 }, // the hero's place (facing north, −z: the hill straight ahead)
    HILL: { x: 0, z: -12, r: 6.5, h: 6 }, // the little hill for «Бомбардо»
    RING: 3.5, // m: the cobbled ring under the hero
    PATH: [8, 9.2], // m: the path round it
    ZOMBIES: { r: 34, n: 3 }, // where the zombies of the fight come from (north, this far from the middle)
};

const fract = (x) => x - Math.floor(x);
const hash = (x, z, s = 0) => fract(Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453);
function vnoise(x, z, s) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz, s), b = hash(ix + 1, iz, s), c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** The ground's top layer at (x, z). */
export function tutorialHeight(x, z) {
    const T = TUTORIAL, r = Math.hypot(x, z);
    if (r >= T.CLIFF0) {
        // the cliffs: a steep rise with ledges, its top line uneven
        const a = Math.atan2(z, x), wob = vnoise(a * 6, 0.5, 3) * 3 + vnoise(x * 0.15, z * 0.15, 4) * 2;
        const k = Math.min(1, (r - T.CLIFF0) / (T.CLIFF1 - T.CLIFF0));
        const ledge = Math.floor(k * 5) / 5; // (steps: the cliff is layered, not a smooth ramp)
        return T.G + Math.round((0.35 * k + 0.65 * ledge) * T.WALL + wob * Math.min(1, k * 2));
    }
    const H = T.HILL, dh = Math.hypot(x - H.x, z - H.z);
    if (dh < H.r) { const k = 1 - dh / H.r; return T.G + Math.round(H.h * Math.sqrt(k) * (0.85 + 0.3 * vnoise(x * 0.6, z * 0.6, 9))); }
    return T.G;
}

/** The block of a column's top (and just under it) — the meadow's skin, the hill's, the cliffs'. */
function topBlock(x, z, h, L) {
    const T = TUTORIAL, r = Math.hypot(x, z), H = T.HILL, dh = Math.hypot(x - H.x, z - H.z);
    if (r >= T.CLIFF0) {
        if (L === h) return hash(x, z, 1) < 0.55 ? BLOCK.GRASS : hash(x, z, 2) < 0.5 ? BLOCK.CS_MOSSY : BLOCK.GRAVEL; // (grass and moss on the ledges)
        return (L & 3) === 0 ? BLOCK.GRAVEL : hash(x, L, z) < 0.12 ? BLOCK.COBBLE : BLOCK.STONE; // (layered rock)
    }
    if (dh < H.r) {
        if (L === h) return dh > H.r - 1.5 ? BLOCK.GRASS : hash(x, z, 5) < 0.3 ? BLOCK.GRAVEL : BLOCK.DIRT;
        return L > h - 2 && dh > H.r - 2.5 ? BLOCK.DIRT : hash(x, L, z) < 0.15 ? BLOCK.GRAVEL : BLOCK.STONE;
    }
    if (L === h) {
        if (r < T.RING) return BLOCK.COBBLE;
        if (r > T.PATH[0] && r < T.PATH[1]) return BLOCK.PATH;
        return BLOCK.GRASS;
    }
    return L > h - 3 ? BLOCK.DIRT : BLOCK.STONE;
}

/** One chunk of the tutorial's land (the same object as Terrain._generateChunk makes). */
export function generateTutorialChunk(cx, cz) {
    const HEIGHT = MAX_LAYER - MIN_LAYER + 1;
    const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const top = new Int16Array(CHUNK * CHUNK);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    let maxTop = MIN_LAYER, minOpen = MAX_LAYER;
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, z = z0 + lz, h = tutorialHeight(x, z);
        for (let L = MIN_LAYER; L <= h; L++) {
            const t = L <= OLD_BEDROCK ? BLOCK.BEDROCK : L >= h - 4 ? topBlock(x, z, h, L) : BLOCK.STONE;
            blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = t;
        }
        top[lz * CHUNK + lx] = h;
        if (h > maxTop) maxTop = h;
        if (h + 1 < minOpen) minOpen = h + 1;
    }
    return { cx, cz, blocks, top, maxTop, modified: false, minOpen, sea: null, tutorial: true };
}

/** Is (x, z) on the open meadow (where the hero may walk, the zombies come)? */
export const onMeadow = (x, z) => Math.hypot(x, z) < TUTORIAL.MEADOW;
