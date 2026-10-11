/**
 * Terrain.js — endless, destructible voxel terrain (ground + mountains).
 *
 * Coordinate system (kept identical to the original flat world):
 *   - columns are centred on integer x/z, a block spans [i-0.5, i+0.5]
 *   - block layer L spans y ∈ [L-1.5, L-0.5]  =>  layer 0 top surface is y = -0.5,
 *     exactly where the old ground plane was.
 *
 * The world has no edge. It is stored in 32×32 chunks that are generated
 * from the seed the first time something looks at them (same seed → same
 * world on every computer, so multiplayer and replayed explosions match).
 * Around spawn the world is the same as before (flat play area, mountains
 * further out); beyond it plains, mountain ranges and trees go on forever.
 *
 * Rendering (class Terrain) keeps meshes only for the chunks around the
 * player: missing ones are built nearest-first within a small time budget per
 * frame, far ones are unloaded, so flying anywhere never stalls the game.
 * Chunks are greedy-meshed, so a flat area costs a handful of quads.
 *
 * TerrainData has no DOM dependencies (unit-testable in Node).
 */

import * as THREE from 'three';
import { createNoise2D, createRng, smoothstep } from '../core/math.js';
import { applyVoxelDetail, applySkyComp } from './VoxelShading.js';
import { CastleIndex, testSeaCastleSpot } from './Castles.js';
import { TowerIndex } from './WizardTowers.js';
import { SiteIndex } from './Sites.js';
import { SeaIndex, SEA, seaDepth } from './Sea.js';
import { CAVES, growCaveSystem, caveMouth, carveColumn, chamberFloor, systemIn, noise3 } from './CaveSystems.js';

export const BLOCK = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SNOW: 4, BEDROCK: 5, WOOD: 6, LEAVES: 7, WATER: 8, SAND: 9, ICE: 10, ICE_SHAPE: 11,
    // five kinds of trees (oak = WOOD / LEAVES)
    BIRCH: 12, BIRCH_LEAVES: 13, SPRUCE: 14, SPRUCE_LEAVES: 15, CHERRY: 16, CHERRY_LEAVES: 17, DARK: 18, DARK_LEAVES: 19,
    // castles and villages (src/world/Castles.js): five kinds of castle stone and the rest
    CS_GREY: 20, CS_SAND: 21, CS_DARK: 22, CS_WHITE: 23, CS_MOSSY: 24, COBBLE: 25, BRICK: 26,
    PLANKS: 27, PLANKS_DARK: 28, ROOF_RED: 29, ROOF_BLUE: 30, ROOF_SLATE: 31, THATCH: 32,
    CARPET_RED: 33, GOLD: 34, FARMLAND: 35, WHEAT: 36, PATH: 37, CARPET_BLUE: 38, CARPET_GREEN: 39,
    LANTERN: 40, HAY: 41, CLOTH_WHITE: 42, BOOKS: 43, CLOTH_YELLOW: 44,
    // houses: fences, vegetable beds, flowers, whitewashed plaster
    FENCE: 45, VEG: 46, FLOWERS: 47, PLASTER: 48,
    // the wizards' tower and houses (src/world/WizardTowers.js): blue-grey arcane stone, a violet roof,
    // glowing crystal lamps, a violet carpet, potion shelves, runes in the floor
    ARCANE: 49, ARCANE_DARK: 50, ROOF_PURPLE: 51, ARCANE_LAMP: 52, ARCANE_LAMP_VIOLET: 53, CARPET_PURPLE: 54, POTION: 55, RUNE: 56,
    // underground (generation 4 caves): gravel and dark deep stone in the rock round the caves
    GRAVEL: 57, DEEPSTONE: 58,
};
/** Built by people (castles, villages): wrecking it is a crime there. */
export const isCastleBlock = (t) => t >= BLOCK.CS_GREY && t <= BLOCK.RUNE;
/** Surface pattern drawn by the voxel shader (0 = the usual pixel pattern). */
export const PATTERN = { NONE: 0, ASHLAR: 1, COBBLE: 2, BRICK: 3, PLANKS: 4, TILES: 5, CLOTH: 6, GOLD: 7, STRAW: 8, FURROWS: 9, BOOKS: 10, GLOW: 11, CRYSTAL: 12, RUNES: 13 };
const PATTERN_OF = {};
/** Tree kinds: trunk and leaf blocks. */
export const TREE_KINDS = [
    { name: 'Дуб', wood: BLOCK.WOOD, leaves: BLOCK.LEAVES },
    { name: 'Берёза', wood: BLOCK.BIRCH, leaves: BLOCK.BIRCH_LEAVES },
    { name: 'Ель', wood: BLOCK.SPRUCE, leaves: BLOCK.SPRUCE_LEAVES },
    { name: 'Вишня', wood: BLOCK.CHERRY, leaves: BLOCK.CHERRY_LEAVES },
    { name: 'Тёмный дуб', wood: BLOCK.DARK, leaves: BLOCK.DARK_LEAVES },
];
export const isWood = (t) => t === BLOCK.WOOD || t === BLOCK.BIRCH || t === BLOCK.SPRUCE || t === BLOCK.CHERRY || t === BLOCK.DARK || t === BLOCK.PLANKS || t === BLOCK.PLANKS_DARK;
export const isLeaves = (t) => t === BLOCK.LEAVES || t === BLOCK.BIRCH_LEAVES || t === BLOCK.SPRUCE_LEAVES || t === BLOCK.CHERRY_LEAVES || t === BLOCK.DARK_LEAVES;
/** Burns (wood and leaves of every tree). */
export const isFlammable = (t) => isWood(t) || isLeaves(t) || t === BLOCK.THATCH || t === BLOCK.HAY || t === BLOCK.WHEAT || t === BLOCK.BOOKS || t === BLOCK.FENCE || t === BLOCK.VEG;
// ICE_SHAPE: solid space inside frozen water shapes (drawn by WaterMagic, not as cubes)

/** Water is not solid: you can see, walk and shoot through it. */
export const isSolid = (type) => type !== BLOCK.AIR && type !== BLOCK.WATER;
/** Blocks drawn as cubes (frozen water shapes are drawn as their own smooth shapes). */
const drawn = (type) => type !== BLOCK.AIR && type !== BLOCK.WATER && type !== BLOCK.ICE_SHAPE;
/** Daylight left at a darkness 0…15 (Minecraft's light levels: a step down is a fifth less). */
export const skyFactor = (dark) => (dark <= 0 ? 1 : Math.max(0.035, Math.pow(0.8, dark)));
const _sky = { light: null, queue: null, tops: null }; // (reused buffers of _skyLight)
/** Top of the water surface (water fills layers up to 0, drawn a little lower than the ground). */
export const WATER_LEVEL_Y = -0.62;

export const BASE_COLORS = {
    [BLOCK.GRASS]: 0x4CAF50, // identical to the old ground plane
    [BLOCK.DIRT]: 0x7a5230,
    [BLOCK.STONE]: 0x8a8a8a,
    [BLOCK.SNOW]: 0xf2f6f8,
    [BLOCK.BEDROCK]: 0x3b3b3b,
    [BLOCK.WOOD]: 0x8B4513, // same colours as the trees near spawn
    [BLOCK.LEAVES]: 0x228B22,
    [BLOCK.WATER]: 0x2f7fd0,
    [BLOCK.SAND]: 0xd6c48a,
    [BLOCK.ICE]: 0xc9ecff,
    [BLOCK.BIRCH]: 0xe6e0cf,
    [BLOCK.BIRCH_LEAVES]: 0x8fcf4a,
    [BLOCK.SPRUCE]: 0x5a3a1e,
    [BLOCK.SPRUCE_LEAVES]: 0x1f5a35,
    [BLOCK.CHERRY]: 0x6b2f2a,
    [BLOCK.CHERRY_LEAVES]: 0xf2a7c3,
    [BLOCK.DARK]: 0x3e2716,
    [BLOCK.DARK_LEAVES]: 0x2d4f1e,
    [BLOCK.CS_GREY]: 0x9a9893,
    [BLOCK.CS_SAND]: 0xcdb27f,
    [BLOCK.CS_DARK]: 0x575a60,
    [BLOCK.CS_WHITE]: 0xe2ddd0,
    [BLOCK.CS_MOSSY]: 0x7f8a72,
    [BLOCK.COBBLE]: 0x828079,
    [BLOCK.BRICK]: 0xa8553c,
    [BLOCK.PLANKS]: 0xb07c45,
    [BLOCK.PLANKS_DARK]: 0x6e4a2a,
    [BLOCK.ROOF_RED]: 0xa63a2c,
    [BLOCK.ROOF_BLUE]: 0x3b5b9a,
    [BLOCK.ROOF_SLATE]: 0x4a505c,
    [BLOCK.THATCH]: 0xc9a54e,
    [BLOCK.CARPET_RED]: 0xb3202c,
    [BLOCK.GOLD]: 0xe8b830,
    [BLOCK.FARMLAND]: 0x5e3f22,
    [BLOCK.WHEAT]: 0xd8b84a,
    [BLOCK.PATH]: 0xa89068,
    [BLOCK.CARPET_BLUE]: 0x2f4fa8,
    [BLOCK.CARPET_GREEN]: 0x2f7a3e,
    [BLOCK.LANTERN]: 0xffd36b,
    [BLOCK.HAY]: 0xd9b444,
    [BLOCK.CLOTH_WHITE]: 0xf0ece2,
    [BLOCK.BOOKS]: 0x7a4a2a,
    [BLOCK.CLOTH_YELLOW]: 0xe9c43a,
    [BLOCK.FENCE]: 0x8a6238,
    [BLOCK.VEG]: 0x4e9a35,
    [BLOCK.FLOWERS]: 0xd9548c,
    [BLOCK.PLASTER]: 0xe8e0cc,
    [BLOCK.ARCANE]: 0x56597f,
    [BLOCK.ARCANE_DARK]: 0x3b3d5c,
    [BLOCK.ROOF_PURPLE]: 0x5b2d8e,
    [BLOCK.ARCANE_LAMP]: 0x8fe3ff,
    [BLOCK.ARCANE_LAMP_VIOLET]: 0xc58bff,
    [BLOCK.CARPET_PURPLE]: 0x6a2c91,
    [BLOCK.POTION]: 0x5dff8a,
    [BLOCK.RUNE]: 0x2e3150,
    [BLOCK.GRAVEL]: 0x8b8580,
    [BLOCK.DEEPSTONE]: 0x56575e,
};
Object.assign(PATTERN_OF, {
    [BLOCK.CS_GREY]: PATTERN.ASHLAR, [BLOCK.CS_SAND]: PATTERN.ASHLAR, [BLOCK.CS_DARK]: PATTERN.ASHLAR, [BLOCK.CS_WHITE]: PATTERN.ASHLAR,
    [BLOCK.CS_MOSSY]: PATTERN.COBBLE, [BLOCK.COBBLE]: PATTERN.COBBLE, [BLOCK.PATH]: PATTERN.COBBLE, [BLOCK.BRICK]: PATTERN.BRICK,
    [BLOCK.PLANKS]: PATTERN.PLANKS, [BLOCK.PLANKS_DARK]: PATTERN.PLANKS, [BLOCK.FENCE]: PATTERN.PLANKS,
    [BLOCK.ROOF_RED]: PATTERN.TILES, [BLOCK.ROOF_BLUE]: PATTERN.TILES, [BLOCK.ROOF_SLATE]: PATTERN.TILES,
    [BLOCK.THATCH]: PATTERN.STRAW, [BLOCK.HAY]: PATTERN.STRAW, [BLOCK.WHEAT]: PATTERN.STRAW,
    [BLOCK.CARPET_RED]: PATTERN.CLOTH, [BLOCK.CARPET_BLUE]: PATTERN.CLOTH, [BLOCK.CARPET_GREEN]: PATTERN.CLOTH, [BLOCK.CLOTH_WHITE]: PATTERN.CLOTH, [BLOCK.CLOTH_YELLOW]: PATTERN.CLOTH,
    [BLOCK.GOLD]: PATTERN.GOLD, [BLOCK.FARMLAND]: PATTERN.FURROWS, [BLOCK.BOOKS]: PATTERN.BOOKS, [BLOCK.LANTERN]: PATTERN.GLOW,
    [BLOCK.ARCANE]: PATTERN.ASHLAR, [BLOCK.ARCANE_DARK]: PATTERN.ASHLAR, [BLOCK.ROOF_PURPLE]: PATTERN.TILES,
    [BLOCK.ARCANE_LAMP]: PATTERN.CRYSTAL, [BLOCK.ARCANE_LAMP_VIOLET]: PATTERN.CRYSTAL, [BLOCK.CARPET_PURPLE]: PATTERN.CLOTH,
    [BLOCK.POTION]: PATTERN.GLOW, [BLOCK.RUNE]: PATTERN.RUNES, [BLOCK.GRAVEL]: PATTERN.COBBLE,
});
/** The shader pattern of a block type. */
export const patternOf = (t) => PATTERN_OF[t] || 0;
// a few shades per kind so crowns and trunks don't look like plastic boxes
const SHADES = {
    [BLOCK.WOOD]: [0x8B4513, 0x7a3d12, 0x8f5020, 0x80461a, 0x8B4513],
    [BLOCK.LEAVES]: [0x2e8b2e, 0x267a26, 0x3a9a35, 0x2f7f3a, 0x449e3c],
    [BLOCK.BIRCH]: [0xe6e0cf, 0xdcd6c4, 0x2b2b2b, 0xe9e4d6, 0xd8d2bf],
    [BLOCK.BIRCH_LEAVES]: [0x8fcf4a, 0x9ad655, 0x84c241, 0xa5dc62, 0x8bc94a],
    [BLOCK.SPRUCE]: [0x5a3a1e, 0x4f3219, 0x613f21, 0x55371c, 0x5a3a1e],
    [BLOCK.SPRUCE_LEAVES]: [0x1f5a35, 0x1a4f2e, 0x24653b, 0x1d5532, 0x2a6e40],
    [BLOCK.CHERRY]: [0x6b2f2a, 0x5f2925, 0x73352f, 0x662c28, 0x6b2f2a],
    [BLOCK.CHERRY_LEAVES]: [0xf2a7c3, 0xf7b9cf, 0xe993b3, 0xfcc6d9, 0xee9fbd],
    [BLOCK.DARK]: [0x3e2716, 0x352113, 0x452c19, 0x3a2414, 0x3e2716],
    [BLOCK.DARK_LEAVES]: [0x2d4f1e, 0x26441a, 0x335822, 0x2a4a1c, 0x385e26],
};
const GRASS_SIDE = 0x6b4a2a; // dirt-coloured sides under a grass top

export const MIN_LAYER = -17; // the lowest layer: bedrock (indestructible); the deep sea's floor is at -16
/** Bedrock top of old worlds (generation 1, and every world without seas): lakes reach down to -7. */
export const OLD_BEDROCK = -9;
/**
 * World generation version. 1: the original worlds (no seas, bedrock at −9).
 * 2: seas (deep basins far from spawn), sea castles with ports, bedrock at −17.
 * 3: the creative test ground (a river by the pedestals, a castle close by — see TEST_RIVER).
 * A saved world and a guest keep the generation their world was made with.
 */
export const WORLD_GEN = 4;
// 4: caves as in Minecraft (src/world/CaveSystems.js): winding, branching, deep, chests in their chambers.
// 3: a creative world has a test ground — a river right past the pedestals and a castle close by.

/** The creative test ground's river (generation 3): it winds east–west just past the pedestals. */
export const TEST_RIVER = { Z: -34, HALF: 3.5, WIND: 4 };
/**
 * …and a rocky mountain to the left of the pedestals with a cave in it: a stone cliff towards
 * them with the cave's mouth at its foot, crags, gullies and a few peaks of different height behind.
 */
export const TEST_CAVE = { X: -88, Z: 22, R: 44, H: 34, r: 8 };

/** The rim of the test mountain in direction `a` (radians from +x). */
const testRim = (a) => TEST_CAVE.R * (1 + 0.1 * Math.sin(3 * a + 1.3) + 0.07 * Math.sin(5 * a + 0.4) + 0.04 * Math.sin(11 * a + 2.1));
const hillNoise = createNoise2D(0x7e57);
// (its peaks: x, z from the centre, radius, height share)
const TEST_PEAKS = [[-6, -4, 30, 1], [42, 0, 22, 0.75], [10, 16, 20, 0.72], [-20, 18, 18, 0.6], [6, -20, 16, 0.55], [-26, -12, 16, 0.5]];

/** The mountain itself (no scree): its edge ragged in plan — spurs, bays — not a drawn circle; low foothills round it. */
function testMountain(ix, iz) {
    const T = TEST_CAVE, dx = ix - T.X, dz = iz - T.Z, d = Math.hypot(dx, dz);
    if (d > T.R * 1.65) return -1;
    const n = (s, o = 0) => hillNoise(dx / s + o, dz / s - o);
    const a = Math.atan2(dz, dx), front = smoothstep(0.45, 0.85, Math.cos(a));
    const rr = testRim(a) + 3.5 * n(5.5, 3) + 1.5 * n(2.3, 9);
    // foothills: rolling ground that fades into the meadow (none in front of the cliff: the way in)
    const out = d - rr;
    const foot = out < 16 ? Math.round((1 - front) * (2.8 * (1 - Math.max(0, out) / 16) ** 1.5 + 1.3 * n(6.5, 21))) : -1;
    const w = 22 - 19 * front; // (a 3 m cliff towards the pedestals, slopes elsewhere)
    const k = Math.min(1, (rr - d) / w);
    if (k <= 0) return foot > 0 ? foot : -1;
    let peak = 0.32;
    for (const [px, pz, pr, ph] of TEST_PEAKS) peak = Math.max(peak, ph * (1 - Math.hypot(dx - px, dz - pz) / pr));
    const ridges = 1 - Math.abs(n(11)); // (sharp ridges where it crosses 0, gullies between)
    const crags = 0.6 * n(5.3, 7) + 0.3 * n(2.6, 13); // (rough rock)
    const s = peak * (0.78 + 0.3 * ridges) + 0.12 * crags;
    return Math.max(foot, Math.round(T.H * Math.pow(k, 0.6) * s));
}

/** The test cave's mouth: at the cliff's foot (where the rock rises), facing the pedestals. */
let _testMouth = null;
export const testCaveMouth = () => {
    if (_testMouth) return _testMouth;
    let x = Math.round(TEST_CAVE.X + TEST_CAVE.R * 1.65);
    while (x > TEST_CAVE.X && testMountain(x, TEST_CAVE.Z) < 6) x--;
    return (_testMouth = { x: x + 1.5, z: TEST_CAVE.Z });
};

/** Rubble fallen from the cliff, piled either side of the cave's mouth (0: none here). */
export function testScree(ix, iz) {
    const m = testCaveMouth(), ex = ix - m.x, ez = iz - m.z;
    if (ex < -3 || ex > 9 || Math.abs(ez) < 2.6 || Math.abs(ez) > 10) return 0; // (the way in stays clear)
    const r = Math.hypot(ex * 0.9, (Math.abs(ez) - 2.6) * 1.1);
    return Math.max(0, Math.round(2.6 * (1 - r / 8) + 0.9 * hillNoise(ix / 1.7 + 40, iz / 1.7)));
}

/** The test mountain's height at a column (−1 outside it). */
export function testHillHeight(ix, iz) {
    const h = testMountain(ix, iz), sc = testScree(ix, iz);
    return sc > h ? sc : h;
}

// (56 = room for the wizards' tower with its pointed roof; mountains stay as they always were,
// capped at MOUNTAIN_TOP, so old worlds and saves are unchanged)
export const MAX_LAYER = 56;
export const MOUNTAIN_TOP = 36;
export const CHUNK = 32;
const SHIFT = 5; // log2(CHUNK)
const MASK = CHUNK - 1;
const HEIGHT = MAX_LAYER - MIN_LAYER + 1;
const TAU = Math.PI * 2;
const NEAR_CAP = 22; // mountains around spawn: as high as they always were

/** Numeric key of a chunk (fast Map lookups). */
export function chunkKey(cx, cz) {
    return (cx + 0x8000) * 0x10000 + (cz + 0x8000);
}

/**
 * Height field of the world (top solid layer of a column, before explosions).
 * Within ~130 m of spawn this is exactly the original creative world.
 * Further out there are rivers and lakes: the returned function also sets
 * `fn.water` = how many water layers sit on that column (0 = dry).
 */
export function createHeightField(seed, mountains, seas = null, test = false) {
    if (!mountains) {
        const flat = () => 0;
        flat.water = 0;
        return flat;
    }
    const noise = createNoise2D(seed);
    const noise2 = createNoise2D(seed ^ 0x9e3779b9);
    const region = createNoise2D(seed ^ 0x2c1b3c6d);
    const lakes = createNoise2D(seed ^ 0x6a09e667);
    const rivers = createNoise2D(seed ^ 0x3c6ef372);
    const fn = (ix, iz) => {
        fn.water = 0; fn.sea = false; fn.beach = false;
        // the creative test ground's river: water just past the pedestals, a valley through the hills
        let rcap = Infinity;
        if (test) {
            const dz = Math.abs(iz - (TEST_RIVER.Z + TEST_RIVER.WIND * Math.sin(ix / 23)));
            if (dz < TEST_RIVER.HALF) {
                const depth = dz < TEST_RIVER.HALF * 0.55 ? 2 : 1;
                fn.water = depth;
                return -depth;
            }
            if (dz < TEST_RIVER.HALF + 10) rcap = Math.floor((dz - TEST_RIVER.HALF) * 0.8);
        }
        const dist = Math.sqrt(ix * ix + iz * iz);
        const near = smoothstep(38, 70, dist); // flat play area around spawn
        if (near <= 0) return 0;
        const n = 0.6 * noise(ix / 46, iz / 46) + 0.3 * noise2(ix / 17, iz / 17) + 0.1 * noise(ix / 6 + 31, iz / 6 - 17);
        const ridge = Math.max(0, (n + 0.05) / 0.65);
        // Far away: wide plains alternate with big mountain ranges
        const far = smoothstep(130, 220, dist);
        let amp = 1, cap = NEAR_CAP;
        if (far > 0) {
            const r = region(ix / 260, iz / 260);
            amp = 1 + (0.12 + 1.3 * smoothstep(-0.25, 0.55, r) - 1) * far;
            cap = NEAR_CAP + (MOUNTAIN_TOP - NEAR_CAP) * far;
        }
        let h = Math.min(Math.floor(cap), Math.floor(ridge * ridge * 30 * near * amp));

        // The sea (generation 2): a deep basin; the land sinks gently to a sandy beach
        if (seas) {
            const s = seas.signedDist(ix, iz);
            if (s > -SEA.TAPER) {
                if (s > 0) {
                    const j = s > SEA.SHELF ? Math.round(noise(ix / 37 + 91, iz / 37 - 13) * 1.2) : 0;
                    const d = seaDepth(s, j);
                    fn.water = d; fn.sea = true;
                    return -d;
                }
                h = Math.min(h, seaLandCap(-s));
                fn.beach = s > -SEA.BEACH;
            }
        }

        // Rivers and lakes (never in the original play area)
        h = Math.min(h, rcap);
        const wet = smoothstep(95, 135, dist);
        if (wet <= 0) return h;
        // River: a winding band where the river noise crosses zero; it cuts a
        // valley (and a gorge through mountains). Beds deepen in steps of one
        // block so you can always walk in and out.
        const rv = Math.abs(rivers(ix / 230, iz / 230) + 0.18 * rivers(ix / 45 + 50, iz / 45 - 20));
        const width = 0.032 * wet;
        if (rv < width * 3) {
            if (rv < width) {
                const depth = rv < width * 0.5 ? 2 : 1;
                fn.water = depth;
                return -depth;
            }
            // Valley sides rise gently from the banks
            h = Math.min(h, Math.floor(((rv - width) / (width * 2)) * 6));
        }
        // Lakes in low land (not on a beach)
        if (h <= 1 && !fn.beach) {
            const ln = lakes(ix / 110, iz / 110) * wet;
            const d = (ln - 0.42) * 14;
            if (d > 0) {
                // shallow at the shore, deep enough to swim in the middle (up to 7 blocks)
                const depth = Math.min(7, 1 + Math.floor(d * 1.6));
                fn.water = depth;
                return -depth;
            }
        }
        return h;
    };
    fn.water = 0; fn.sea = false; fn.beach = false;
    if (!test) return fn;
    // the test ground's hill (with its cave, see TerrainData.caveOf)
    const hill = (ix, iz) => {
        let h = fn(ix, iz);
        hill.water = fn.water; hill.sea = fn.sea; hill.beach = fn.beach;
        const m = fn.water ? -1 : testHillHeight(ix, iz);
        if (m > h) h = m;
        return h;
    };
    hill.water = 0; hill.sea = false; hill.beach = false;
    return hill;
}

/** The highest the land may be `d` metres from a sea shore: a beach, then slopes up to the hills. */
export function seaLandCap(d) {
    if (d < SEA.BEACH) return Math.floor(d / 6);
    const e = d - SEA.BEACH;
    return 2 + Math.floor(e / 6 + (e * e) / 180);
}

/** Cheap deterministic hash → [0, 1). */
function hash01(a, b, seed) {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

const TREE_CELL = 12; // one possible tree per 12×12 m cell
const CAVE_CELL = 90; // at most one cave per 90×90 m
const TREE_MIN_DIST = 128; // trees closer to spawn are the original (instanced) ones

export class TerrainData {
    /**
     * @param {number} [_size] ignored (the world is endless); kept for compatibility
     */
    constructor(_size) {
        this.chunks = new Map(); // key -> {cx, cz, blocks, top, maxTop, modified}
        this.dirtyChunks = new Set(); // chunk keys whose mesh must be rebuilt
        this.version = 0;
        this.seed = 1;
        this.mountains = false;
        this.heightAt = () => 0;
        this._last = null; // last chunk looked up (most queries hit the same one)
    }

    /** Set the world recipe. Chunks are generated lazily from it. */
    generate({ seed = 1, mountains = false, seas = false, test = false, deepCaves = false } = {}) {
        this.seed = seed;
        this.mountains = mountains;
        this.deepCaves = !!(mountains && deepCaves); // (generation 4: cave systems, not single chambers)
        this.test = !!(mountains && test); // (creative, generation 3: the test ground)
        // seas only in generation-2 worlds with land (old worlds stay exactly as they were)
        // (the creative test ground: a sea right by its castle's quay — the castle is placed first)
        const spot = mountains && seas && test ? testSeaCastleSpot(seed) : null;
        this.seas = mountains && seas ? new SeaIndex(seed, spot ? spot.shore : null) : null;
        this.bedrockTop = this.seas ? MIN_LAYER : OLD_BEDROCK;
        const raw = createHeightField(seed, mountains, this.seas, this.test);
        this.castles = this.towers = this.sites = null;
        if (mountains) {
            // castles and their villages, the wizards' towers stand on levelled land
            this.castles = new CastleIndex(seed, raw, this.seas, this.test);
            this.towers = new TowerIndex(seed, raw, this.castles);
            const idx = this.sites = new SiteIndex(this.castles, this.towers);
            const fn = (ix, iz) => {
                const h = raw(ix, iz), wet = raw.water, sea = raw.sea, beach = raw.beach; // (read before landAt: finding a site re-samples raw)
                const land = idx.landAt(ix, iz);
                fn.sea = sea; fn.beach = beach;
                if (land && land.side === 'sea') {
                    // beyond a sea castle's quay: the sea (dug deep in the harbour)
                    const k = land.castle.port;
                    const d = Math.max(sea ? wet : 0, land.harbour ? k.depth : 0, 1);
                    fn.water = d; fn.sea = true; fn.beach = false;
                    return -d;
                }
                if (!land || (land.w < 1 && wet)) { fn.water = wet; return h; } // (rivers keep their banks)
                fn.water = 0; fn.sea = false;
                if (land.w >= 1) fn.beach = false;
                const F = land.castle.F;
                return land.w >= 1 ? F : Math.round(F + (h - F) * (1 - land.w));
            };
            fn.water = 0; fn.sea = false; fn.beach = false;
            this.heightAt = fn;
        } else this.heightAt = raw;
        this._caves = new Map();
        this.chunks.clear();
        this._last = null;
        this.version++;
    }

    // ------------------------------------------------------------ chunks
    chunk(cx, cz) {
        const last = this._last;
        if (last && last.cx === cx && last.cz === cz) return last;
        const key = chunkKey(cx, cz);
        let c = this.chunks.get(key);
        if (!c) {
            c = this._generateChunk(cx, cz);
            this.chunks.set(key, c);
        }
        this._last = c;
        return c;
    }

    hasChunk(cx, cz) {
        return this.chunks.has(chunkKey(cx, cz));
    }

    _generateChunk(cx, cz) {
        const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
        const top = new Int16Array(CHUNK * CHUNK);
        const x0 = cx * CHUNK, z0 = cz * CHUNK;
        const rng = createRng((this.seed ^ Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0);
        let maxTop = 0; // highest non-air layer (water included: it is drawn)
        const bedrock = this.bedrockTop ?? OLD_BEDROCK;
        let seaMask = null; // columns of sea water (drawn by the wave surface)
        for (let lz = 0; lz < CHUNK; lz++) {
            for (let lx = 0; lx < CHUNK; lx++) {
                const h = this.heightAt(x0 + lx, z0 + lz);
                const water = this.heightAt.water;
                const sea = this.heightAt.sea, beach = this.heightAt.beach;
                const rock = this.test && h > 0 ? this._testRock(x0 + lx, z0 + lz, h) : 0; // (the test mountain: bare stone, rubble)
                const col = lz * CHUNK + lx;
                if (sea) (seaMask ||= new Uint8Array(CHUNK * CHUNK))[col] = 1;
                for (let L = MIN_LAYER; L <= h; L++) {
                    let type;
                    if (L <= bedrock) type = BLOCK.BEDROCK;
                    else if (water && L === h) type = BLOCK.SAND;
                    else if (sea && L >= h - 3) type = BLOCK.SAND; // the seabed
                    else if (L === h && beach) type = BLOCK.SAND; // the beach
                    else if (rock && L >= 0) type = L < h ? BLOCK.STONE : rock === 2 ? BLOCK.GRAVEL : h >= 28 ? BLOCK.SNOW : h < 14 && rng() < 0.25 ? BLOCK.GRAVEL : BLOCK.STONE;
                    else if (L === h) {
                        // snow only on the peaks (a few patches on the tips, solid higher up)
                        if (h >= 24 || (h >= 21 && rng() < smoothstep(21, 24, h))) type = BLOCK.SNOW;
                        else if (h >= 11 && rng() < smoothstep(11, 16, h)) type = BLOCK.STONE;
                        else type = BLOCK.GRASS;
                    } else if (L >= h - 2 && L >= 0) type = BLOCK.DIRT;
                    else if (L >= -1) type = BLOCK.DIRT;
                    else type = BLOCK.STONE;
                    blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = type;
                }
                for (let L = h + 1; L <= h + water; L++) blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = BLOCK.WATER;
                top[col] = h;
                if (h > maxTop) maxTop = h;
            }
        }
        // the lowest layer that is not solid rock (meshing skips the solid rock below it)
        let minOpen = MAX_LAYER;
        for (let i = 0; i < top.length; i++) if (top[i] + 1 < minOpen) minOpen = top[i] + 1;
        const c = { cx, cz, blocks, top, maxTop, modified: false, minOpen, sea: seaMask };
        if (this.mountains) { this._carveCaves(c); this._buildCastles(c); this._plantTrees(c); }
        return c;
    }

    /** Castle, village and market blocks that fall into this chunk. */
    _buildCastles(c) {
        const lists = this.sites.partsForChunk(c.cx, c.cz, CHUNK);
        if (!lists.length) return;
        const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
        const blocks = c.blocks;
        let maxTop = c.maxTop, minOpen = c.minOpen;
        for (const list of lists) {
            for (const p of list) {
                const ax = Math.max(p.x0, x0), bx = Math.min(p.x1, x0 + CHUNK - 1);
                const az = Math.max(p.z0, z0), bz = Math.min(p.z1, z0 + CHUNK - 1);
                const L0 = Math.max(p.L0, MIN_LAYER + 1), L1 = Math.min(p.L1, MAX_LAYER);
                if (ax > bx || az > bz || L0 > L1) continue;
                const t = p.t;
                const cyl = p.k === 1 || p.k === 2; // (2: a sector of a ring — the tower's spiral stair)
                const r2 = cyl ? p.r * p.r + p.r * 0.6 : 0, h2 = cyl && p.hr >= 0 ? p.hr * p.hr + p.hr * 0.6 : -1;
                for (let z = az; z <= bz; z++) {
                    for (let x = ax; x <= bx; x++) {
                        if (cyl) {
                            const d2 = (x - p.cx) * (x - p.cx) + (z - p.cz) * (z - p.cz);
                            if (d2 > r2 || d2 <= h2) continue;
                            if (p.k === 2) {
                                let a = Math.atan2(z - p.cz, x - p.cx) - p.a0w;
                                a -= Math.floor(a / TAU) * TAU;
                                if (a >= p.span) continue;
                            }
                        }
                        const col = (z - z0) * CHUNK + (x - x0);
                        for (let L = L0; L <= L1; L++) blocks[(L - MIN_LAYER) * CHUNK * CHUNK + col] = t;
                    }
                }
                if (t !== BLOCK.AIR) { if (L1 > maxTop) maxTop = L1; } else if (L0 < minOpen) minOpen = L0;
            }
        }
        c.maxTop = maxTop;
        c.minOpen = minOpen;
        for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) this._refreshTop(c, lx, lz);
    }

    /**
     * On the test mountain: 1 — a column of bare rock (a cliff, a steep or high slope, an outcrop),
     * 2 — rubble, 0 — grass (its lower slopes and foothills, as the meadow round it).
     */
    _testRock(x, z, h) {
        if (testHillHeight(x, z) !== h) return 0; // (not the mountain: the land round it)
        if (testScree(x, z) === h) return 2;
        const H = this.heightAt;
        const steep = Math.max(Math.abs(H(x + 1, z) - h), Math.abs(H(x - 1, z) - h), Math.abs(H(x, z + 1) - h), Math.abs(H(x, z - 1) - h));
        H(x, z); // (put its flags back)
        if (steep >= 2 || h >= 17) return 1;
        return hillNoise(x / 7 + 31, z / 7) > (h >= 10 ? -0.35 : 0.3) ? 1 : 0;
    }

    // ------------------------------------------------------------ caves
    /**
     * A cave (or none) for a CAVE_CELL×CAVE_CELL cell: a chamber inside a
     * mountain and a tunnel to it from the low ground at the mountain's foot.
     * Deterministic (the same on every computer for the seed).
     */
    caveOf(gx, gz) {
        const key = gx + ',' + gz;
        this._caves = this._caves || new Map();
        if (this._caves.has(key)) return this._caves.get(key);
        if (this.deepCaves) return this._systemOf(gx, gz, key);
        let cave = null;
        const H = this.heightAt;
        const T = TEST_CAVE;
        if (this.test && gx === Math.floor(T.X / CAVE_CELL) && gz === Math.floor(T.Z / CAVE_CELL)) {
            // the test ground's cave: its mouth at the hill's foot, towards the pedestals
            cave = { id: 'cvtest', kx: T.X, kz: T.Z, ex: T.X + T.R - 2, ez: T.Z, F: 0, r: T.r, test: true };
        } else if (hash01(gx * 7 + 3, gz * 13 + 5, this.seed + 101) < 0.6) {
            for (let t = 0; t < 8 && !cave; t++) {
                const kx = gx * CAVE_CELL + 12 + Math.floor(hash01(gx + t * 31, gz - t * 17, this.seed + 202) * (CAVE_CELL - 24));
                const kz = gz * CAVE_CELL + 12 + Math.floor(hash01(gz + t * 29, gx + t * 11, this.seed + 303) * (CAVE_CELL - 24));
                if (Math.hypot(kx, kz) < 150) continue; // not next to the spawn
                const hk = H(kx, kz);
                if (H.water || hk < 13) continue;
                // the way out: towards the lowest ground around
                let best = null;
                for (let a = 0; a < 8; a++) {
                    const dx = Math.cos(a * Math.PI / 4), dz = Math.sin(a * Math.PI / 4);
                    for (let d = 8; d <= 44; d++) {
                        const ex = Math.round(kx + dx * d), ez = Math.round(kz + dz * d);
                        const he = H(ex, ez);
                        if (H.water) break;
                        if (he <= hk - 9 && he >= 0) { if (!best || d < best.d) best = { d, ex, ez, he }; break; }
                    }
                }
                if (!best) continue;
                cave = { id: 'cv' + gx + '_' + gz, kx, kz, ex: best.ex, ez: best.ez, F: best.he, r: 6 + Math.floor(hash01(gx, gz, this.seed + 404) * 3) };
            }
        }
        this._caves.set(key, cave);
        return cave;
    }

    /**
     * Generation 4: the cave system starting in a cave cell (or null) — see CaveSystems.js.
     * The creative test ground's cave starts at its hill's foot, facing the pedestals.
     */
    _systemOf(gx, gz, key) {
        const H = this.heightAt;
        const top = (x, z) => H(Math.round(x), Math.round(z));
        const wet = (x, z) => { const ix = Math.round(x), iz = Math.round(z); H(ix, iz); return !!(H.water || H.sea || this.sites?.landAt(ix, iz)); };
        const blocked = (x, z) => wet(x, z) || Math.hypot(x, z) < CAVES.KEEP_SPAWN;
        const T = TEST_CAVE;
        let s = null;
        if (this.test && gx === Math.floor(T.X / CAVE_CELL) && gz === Math.floor(T.Z / CAVE_CELL)) {
            const m = testCaveMouth();
            s = growCaveSystem({ id: 'cvtest', test: true, rng: createRng((this.seed * 31 + 777) >>> 0), start: { x: m.x, ground: top(m.x, m.z), z: m.z, yaw: Math.PI, pitch: -0.04, open: 2 }, H: top, blocked: wet });
        } else if (hash01(gx * 7 + 3, gz * 13 + 5, this.seed + 101) < CAVES.CHANCE) {
            const rng = createRng(((this.seed * 7919) ^ Math.imul(gx, 104729) ^ Math.imul(gz, 1299709) ^ 0xca7e) >>> 0);
            const m = caveMouth(rng, gx, gz, CAVE_CELL, top, blocked);
            if (m) s = growCaveSystem({ id: 'cv' + gx + '_' + gz, rng, start: m, H: top, blocked });
        }
        this._caves.set(key, s);
        return s;
    }

    /**
     * Where a cave chest really stands (generation 4): a floor under it and nothing in the chest
     * (3.6 × 2.4 m, 2.1 m high, turned as it stands) — at its layer or a step from it; null: no room
     * (where two cave systems cross, one's floor may be the other's roof).
     */
    chestSpot(c) {
        const cos = Math.cos(c.a), sin = Math.sin(c.a);
        const fits = (y) => {
            if (this.get(Math.floor(c.x), y, Math.floor(c.z)) === BLOCK.AIR) return false;
            for (let lx = -1.8; lx <= 1.81; lx += 0.6) for (let lz = -1.2; lz <= 1.21; lz += 0.6) {
                const x = Math.round(c.x + lx * cos + lz * sin), z = Math.round(c.z - lx * sin + lz * cos);
                for (let L = y + 1; L <= y + 3; L++) if (this.get(x, L, z) !== BLOCK.AIR) return false;
            }
            return true;
        };
        for (const y of [c.y, c.y + 1, c.y - 1, c.y + 2, c.y - 2]) if (fits(y)) return y === c.y ? c : { ...c, y };
        return null;
    }

    /** Caves whose chamber (generation 4: any part of the system) is within `r` of a point. */
    cavesNear(x, z, r) {
        const out = [];
        if (this.deepCaves) {
            const R = r + CAVES.REACH;
            for (let gz = Math.floor((z - R) / CAVE_CELL); gz <= Math.floor((z + R) / CAVE_CELL); gz++) {
                for (let gx = Math.floor((x - R) / CAVE_CELL); gx <= Math.floor((x + R) / CAVE_CELL); gx++) {
                    const s = this.caveOf(gx, gz);
                    if (s && Math.hypot(Math.max(s.x0 - x, 0, x - s.x1), Math.max(s.z0 - z, 0, z - s.z1)) <= r) out.push(s);
                }
            }
            return out;
        }
        const g0x = Math.floor((x - r) / CAVE_CELL), g1x = Math.floor((x + r) / CAVE_CELL);
        const g0z = Math.floor((z - r) / CAVE_CELL), g1z = Math.floor((z + r) / CAVE_CELL);
        for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
            const c = this.caveOf(gx, gz);
            if (c && Math.hypot(c.kx - x, c.kz - z) <= r) out.push(c);
        }
        return out;
    }

    /** Generation 4: carve the cave systems reaching into a chunk (never under water, nor in a village). */
    _carveSystems(c) {
        const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK, R = CAVES.REACH;
        const sys = [];
        for (let gz = Math.floor((z0 - R) / CAVE_CELL); gz <= Math.floor((z0 + CHUNK + R) / CAVE_CELL); gz++) {
            for (let gx = Math.floor((x0 - R) / CAVE_CELL); gx <= Math.floor((x0 + CHUNK + R) / CAVE_CELL); gx++) {
                const s = this.caveOf(gx, gz);
                if (s && s.x1 >= x0 - 1 && s.x0 <= x0 + CHUNK && s.z1 >= z0 - 1 && s.z0 <= z0 + CHUNK) sys.push(systemIn(s, x0, z0, x0 + CHUNK - 1, z0 + CHUNK - 1));
            }
        }
        if (!sys.length) return;
        const H = this.heightAt;
        for (let lz = 0; lz < CHUNK; lz++) {
            for (let lx = 0; lx < CHUNK; lx++) {
                const x = x0 + lx, z = z0 + lz;
                const col = lz * CHUNK + lx;
                H(x, z);
                if (H.water || H.sea || this.sites?.landAt(x, z)) continue;
                const top0 = c.top[col];
                let carved = false;
                const cut = (L0, L1, open) => {
                    const hi = Math.min(L1, open ? top0 : top0 - CAVES.ROOF);
                    for (let L = Math.max(L0, MIN_LAYER + 1); L <= hi; L++) {
                        const i = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
                        const b = c.blocks[i];
                        if (b !== BLOCK.WATER && b !== BLOCK.BEDROCK && b !== BLOCK.AIR) { c.blocks[i] = BLOCK.AIR; carved = true; if (L < c.minOpen) c.minOpen = L; }
                    }
                };
                // (where systems cross, a chamber's floor stays whole under the other's tunnels too)
                let keep = -Infinity;
                if (sys.length > 1) for (const s of sys) keep = Math.max(keep, chamberFloor(s, x, z));
                for (const s of sys) carveColumn(s, x, z, cut, keep);
                if (carved) { (this._walls || (this._walls = [])).push(col); c.caved = true; } // (its sky light: _skyLight)
                if (carved) {
                    let top = MIN_LAYER - 1;
                    for (let L = c.top[col]; L >= MIN_LAYER; L--) {
                        const b = c.blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx];
                        if (b !== BLOCK.AIR && b !== BLOCK.WATER) { top = L; break; }
                    }
                    c.top[col] = top;
                }
            }
        }
    }

    /** The rock faces of a chunk's caves: patches of earth and gravel, dark deep stone low down. */
    _caveRock(c) {
        const cols = this._walls;
        this._walls = null;
        if (!cols) return;
        const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK, B = c.blocks;
        const at = (lx, L, lz) => (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK || L < MIN_LAYER || L > MAX_LAYER ? -1 : B[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx]);
        const done = new Set();
        for (const col of cols) {
            const cx = col % CHUNK, cz = (col - cx) / CHUNK;
            // the carved column and its neighbours: every stone touching the cave's air
            for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const lx = cx + ox, lz = cz + oz;
                if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK || done.has(lz * CHUNK + lx)) continue;
                done.add(lz * CHUNK + lx);
                const top = c.top[lz * CHUNK + lx];
                for (let L = MIN_LAYER + 1; L < top - 2; L++) {
                    const i = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
                    if (B[i] !== BLOCK.STONE) continue;
                    if (at(lx, L + 1, lz) !== BLOCK.AIR && at(lx, L - 1, lz) !== BLOCK.AIR && at(lx + 1, L, lz) !== BLOCK.AIR && at(lx - 1, L, lz) !== BLOCK.AIR && at(lx, L, lz + 1) !== BLOCK.AIR && at(lx, L, lz - 1) !== BLOCK.AIR) continue;
                    const x = x0 + lx, z = z0 + lz;
                    const n = noise3(x / 5, L / 4, z / 5, this.seed + 31);
                    if (n > 0.5) B[i] = BLOCK.DIRT;
                    else if (n < -0.52) B[i] = BLOCK.GRAVEL;
                    else if (L <= -8 + Math.round(2 * noise3(x / 9, 0, z / 9, this.seed + 32))) B[i] = BLOCK.DEEPSTONE;
                }
            }
        }
    }

    _carveCaves(c) {
        if (this.deepCaves) { this._carveSystems(c); this._caveRock(c); return; }
        const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
        const reach = 60;
        const caves = [];
        for (let gz = Math.floor((z0 - reach) / CAVE_CELL); gz <= Math.floor((z0 + CHUNK + reach) / CAVE_CELL); gz++) {
            for (let gx = Math.floor((x0 - reach) / CAVE_CELL); gx <= Math.floor((x0 + CHUNK + reach) / CAVE_CELL); gx++) {
                const cv = this.caveOf(gx, gz);
                if (cv) caves.push(cv);
            }
        }
        if (!caves.length) return;
        for (let lz = 0; lz < CHUNK; lz++) {
            for (let lx = 0; lx < CHUNK; lx++) {
                const x = x0 + lx, z = z0 + lz;
                const col = lz * CHUNK + lx;
                let carved = false;
                for (const cv of caves) {
                    // tunnel: E → K, 3 wide, 4 high; chamber: a dome around K
                    const sx = cv.kx - cv.ex, sz = cv.kz - cv.ez;
                    const len2 = sx * sx + sz * sz || 1;
                    const t = Math.max(0, Math.min(1, ((x - cv.ex) * sx + (z - cv.ez) * sz) / len2));
                    const dT = Math.hypot(x - (cv.ex + sx * t), z - (cv.ez + sz * t));
                    const dK = Math.hypot(x - cv.kx, z - cv.kz);
                    let hgt = 0;
                    if (dT <= 1.6) hgt = 4;
                    if (dK <= cv.r) hgt = Math.max(hgt, Math.round(3 + 3 * (1 - (dK * dK) / (cv.r * cv.r))));
                    if (!hgt) continue;
                    for (let L = cv.F + 1; L <= cv.F + hgt && L <= c.top[col]; L++) {
                        const i = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
                        if (c.blocks[i] !== BLOCK.WATER) { c.blocks[i] = BLOCK.AIR; carved = true; if (L < c.minOpen) c.minOpen = L; }
                    }
                }
                if (carved) {
                    c.caved = true;
                    // an opening on the slope can lower the column's top
                    let top = MIN_LAYER - 1;
                    for (let L = c.top[col]; L >= MIN_LAYER; L--) {
                        const b = c.blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx];
                        if (b !== BLOCK.AIR && b !== BLOCK.WATER) { top = L; break; }
                    }
                    c.top[col] = top;
                }
            }
        }
    }

    /** Voxel trees far from spawn (same shape and colours as the spawn trees). */
    _plantTrees(c) {
        const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
        const gx0 = Math.floor((x0 - 4) / TREE_CELL), gx1 = Math.floor((x0 + CHUNK + 3) / TREE_CELL);
        const gz0 = Math.floor((z0 - 4) / TREE_CELL), gz1 = Math.floor((z0 + CHUNK + 3) / TREE_CELL);
        const put = (x, L, z, type, onlyAir) => {
            const lx = x - x0, lz = z - z0;
            if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || L > MAX_LAYER) return;
            const i = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
            if (onlyAir && c.blocks[i] !== BLOCK.AIR) return;
            c.blocks[i] = type;
            const col = lz * CHUNK + lx;
            if (L > c.top[col]) c.top[col] = L;
            if (L > c.maxTop) c.maxTop = L;
        };
        for (let gz = gz0; gz <= gz1; gz++) {
            for (let gx = gx0; gx <= gx1; gx++) {
                if (hash01(gx, gz, this.seed) > 0.4) continue;
                const tx = gx * TREE_CELL + 2 + Math.floor(hash01(gz, gx, this.seed + 7) * (TREE_CELL - 6));
                const tz = gz * TREE_CELL + 2 + Math.floor(hash01(gx + 911, gz - 37, this.seed) * (TREE_CELL - 6));
                if (Math.hypot(tx, tz) < TREE_MIN_DIST) continue;
                if (this.seas && this.seas.signedDist(tx, tz) > -SEA.BEACH - 6) continue; // not on a beach (nor its crown)
                if (this.sites && (this.sites.landAt(tx, tz) || this.sites.landAt(tx + 1, tz + 1))) continue; // no trees in villages
                const h = this.heightAt(tx, tz);
                if (h < 0 || h > 8) continue;
                // Only on level dry ground (the 2×2 trunk and its surroundings)
                let flat = true;
                for (let dz = -1; dz <= 2 && flat; dz++) for (let dx = -1; dx <= 2; dx++) if (this.heightAt(tx + dx, tz + dz) !== h || this.heightAt.water) { flat = false; break; }
                if (!flat) continue;
                this._tree(put, tx, tz, h, Math.floor(hash01(gx * 3 + 1, gz * 5 + 2, this.seed + 13) * TREE_KINDS.length));
            }
        }
    }

    /** One tree of a kind (0 oak, 1 birch, 2 spruce, 3 cherry, 4 dark oak) on ground level h. */
    _tree(put, tx, tz, h, kind) {
        const { wood, leaves } = TREE_KINDS[kind];
        if (kind === 1) {
            // Birch: a slim white trunk, a light, small crown up high
            for (let L = h + 1; L <= h + 8; L++) put(tx, L, tz, wood, false);
            for (let L = h + 6; L <= h + 10; L++) {
                const r = L === h + 10 ? 0 : 1;
                for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) put(tx + dx, L, tz + dz, leaves, true);
                if (L >= h + 7 && L <= h + 8) for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) put(tx + dx, L, tz + dz, leaves, true);
            }
        } else if (kind === 2) {
            // Spruce: tall, a cone of dark needles
            for (let L = h + 1; L <= h + 10; L++) put(tx, L, tz, wood, false);
            for (let L = h + 3; L <= h + 12; L++) {
                const r = Math.max(0, Math.round((h + 12 - L) / 3));
                for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dz) <= r + 1) put(tx + dx, L, tz + dz, leaves, true);
            }
        } else if (kind === 3) {
            // Cherry: a low crooked trunk, a wide round pink crown
            for (let L = h + 1; L <= h + 5; L++) put(tx + (L > h + 3 ? 1 : 0), L, tz, wood, false);
            for (let L = h + 5; L <= h + 9; L++) {
                const r = L === h + 5 || L === h + 9 ? 2 : 3;
                for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= r * r + 1) put(tx + 1 + dx, L, tz + dz, leaves, true);
            }
        } else if (kind === 4) {
            // Dark oak: a thick 2×2 trunk, a big dark flat crown
            for (let L = h + 1; L <= h + 7; L++) for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) put(tx + dx, L, tz + dz, wood, false);
            for (let L = h + 7; L <= h + 10; L++) {
                const r = L === h + 10 ? 2 : 3;
                for (let dz = -r; dz < r + 2; dz++) for (let dx = -r; dx < r + 2; dx++) put(tx + dx, L, tz + dz, leaves, true);
            }
        } else {
            // Oak (the original voxel tree)
            for (let L = h + 1; L <= h + 6; L++) for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) put(tx + dx, L, tz + dz, wood, false);
            for (let L = h + 6; L <= h + 11; L++) {
                for (let dz = -2; dz < 4; dz++) for (let dx = -2; dx < 4; dx++) put(tx + dx, L, tz + dz, leaves, true);
            }
        }
    }

    /** Drop generated-but-untouched chunks far from (cx, cz); they regenerate identically. */
    evictFar(cx, cz, radius) {
        for (const [key, c] of this.chunks) {
            if (c.modified) continue;
            if (Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz)) > radius) {
                this.chunks.delete(key);
                if (this._last === c) this._last = null;
            }
        }
    }

    // ------------------------------------------------------------ blocks
    inBounds(ix, L, iz) {
        return L >= MIN_LAYER && L <= MAX_LAYER;
    }

    get(ix, L, iz) {
        if (L < MIN_LAYER || L > MAX_LAYER) return BLOCK.AIR;
        const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        return c.blocks[((L - MIN_LAYER) * CHUNK + (iz & MASK)) * CHUNK + (ix & MASK)];
    }

    set(ix, L, iz, type) {
        if (L < MIN_LAYER || L > MAX_LAYER) return;
        const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        c.blocks[((L - MIN_LAYER) * CHUNK + (iz & MASK)) * CHUNK + (ix & MASK)] = type;
        c.modified = true;
        if (!drawn(type) && L < c.minOpen) c.minOpen = L;
        if (type !== BLOCK.AIR && L > c.maxTop) c.maxTop = L;
        if (type === BLOCK.ICE) this.version++;
        this._refreshTop(c, ix & MASK, iz & MASK);
        this._markDirty(ix, iz);
    }

    /** Blocks of a falling piece (src/fx/FallingBlocks.js): in the data already, drawn when it lands. */
    hideCells(keys, show = false) {
        this._hidden = this._hidden || new Map();
        for (const k of keys) {
            const [x, L, z] = k.split(',').map(Number);
            if (L < MIN_LAYER || L > MAX_LAYER) continue;
            const ck = chunkKey(x >> SHIFT, z >> SHIFT);
            let s = this._hidden.get(ck);
            const i = ((L - MIN_LAYER) * CHUNK + (z & MASK)) * CHUNK + (x & MASK);
            if (show) { if (s) { s.delete(i); if (!s.size) this._hidden.delete(ck); } }
            else { if (!s) this._hidden.set(ck, s = new Set()); s.add(i); }
            this._markDirty(x, z);
        }
    }

    showCells(keys) { this.hideCells(keys, true); }

    _refreshTop(c, lx, lz) {
        let top = MIN_LAYER - 1;
        for (let L = Math.min(MAX_LAYER, c.maxTop); L >= MIN_LAYER; L--) {
            const b = c.blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx];
            if (b !== BLOCK.AIR && b !== BLOCK.WATER) { top = L; break; }
        }
        c.top[lz * CHUNK + lx] = top;
    }

    _markDirty(ix, iz) {
        const cx = ix >> SHIFT, cz = iz >> SHIFT;
        this.dirtyChunks.add(chunkKey(cx, cz));
        // Faces on chunk borders depend on the neighbour chunk too.
        const lx = ix & MASK, lz = iz & MASK;
        if (lx === 0) this.dirtyChunks.add(chunkKey(cx - 1, cz));
        if (lx === MASK) this.dirtyChunks.add(chunkKey(cx + 1, cz));
        if (lz === 0) this.dirtyChunks.add(chunkKey(cx, cz - 1));
        if (lz === MASK) this.dirtyChunks.add(chunkKey(cx, cz + 1));
        this.version++;
    }

    /** Highest solid layer in a column (MIN_LAYER-1 if the column is empty). */
    topLayer(ix, iz) {
        const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        return c.top[(iz & MASK) * CHUNK + (ix & MASK)];
    }

    /** Is this column sea water (a sea or a sea castle's harbour), as generated? */
    isSeaColumn(ix, iz) {
        const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        return !!(c.sea && c.sea[(iz & MASK) * CHUNK + (ix & MASK)]);
    }

    /** World Y of the walkable surface at a world point. */
    surfaceY(x, z) {
        return this.topLayer(Math.round(x), Math.round(z)) - 0.5;
    }

    /**
     * The highest solid layer at or below layer L in a column — the floor
     * under someone standing at L (under a ceiling, in a cave, in a house).
     */
    floorBelow(ix, iz, L) {
        const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        const col = (iz & MASK) * CHUNK + (ix & MASK);
        const top = c.top[col];
        if (L >= top) return top; // (open sky: the usual case)
        const base = (iz & MASK) * CHUNK + (ix & MASK);
        for (let l = Math.min(L, MAX_LAYER); l >= MIN_LAYER; l--) {
            const b = c.blocks[(l - MIN_LAYER) * CHUNK * CHUNK + base];
            if (b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.ICE_SHAPE) return l;
        }
        return MIN_LAYER - 1;
    }

    /** The lowest solid layer at or above L in a column, under its top (a ceiling, cave rock) — or Infinity. */
    ceilingAbove(ix, iz, L) {
        const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        const col = (iz & MASK) * CHUNK + (ix & MASK);
        const top = c.top[col];
        for (let l = Math.max(L, MIN_LAYER); l <= top; l++) {
            const b = c.blocks[(l - MIN_LAYER) * CHUNK * CHUNK + col];
            if (b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.ICE_SHAPE) return l;
        }
        return Infinity;
    }

    /** Is any solid block in layers L0…L1 of a column? */
    solidIn(ix, iz, L0, L1) {
        const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        const col = (iz & MASK) * CHUNK + (ix & MASK);
        const hi = Math.min(L1, c.top[col]);
        for (let l = Math.max(L0, MIN_LAYER); l <= hi; l++) {
            const b = c.blocks[(l - MIN_LAYER) * CHUNK * CHUNK + col];
            if (b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.ICE_SHAPE) return true;
        }
        return false;
    }

    /** Is the world-space point inside a solid block? (water is not solid) */
    isSolidAt(x, y, z) {
        const L = Math.floor(y + 1.5);
        return isSolid(this.get(Math.round(x), L, Math.round(z)));
    }

    /** Is the world-space point under water? */
    isWaterAt(x, y, z) {
        return this.get(Math.round(x), Math.floor(y + 1.5), Math.round(z)) === BLOCK.WATER;
    }

    /**
     * Nearest water surface to a point, searching `radius` m around it.
     * Returns {x, y, z, dist} (y = the water surface) or null.
     */
    findWaterSurface(x, z, radius) {
        const cx = Math.round(x), cz = Math.round(z);
        const r = Math.ceil(radius);
        let best = null, bestD = radius * radius;
        for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
                const ix = cx + dx, iz = cz + dz;
                const d2 = (ix - x) * (ix - x) + (iz - z) * (iz - z);
                if (d2 > bestD) continue;
                // the water surface is at layer 0 (or lower inside flooded craters)
                for (let L = 0; L >= MIN_LAYER + 1; L--) {
                    const b = this.get(ix, L, iz);
                    if (b === BLOCK.WATER) {
                        if (this.get(ix, L + 1, iz) === BLOCK.AIR) { best = { x: ix, y: L - 0.5 - 0.12, z: iz }; bestD = d2; }
                        break;
                    }
                    if (b !== BLOCK.AIR) break;
                }
            }
        }
        if (best) best.dist = Math.sqrt(bestD);
        return best;
    }

    /**
     * Remove every destructible block whose centre lies inside the sphere.
     * Returns removed blocks (for debris / network sync).
     */
    removeSphere(cx, cy, cz, radius, keep = null) {
        const removed = [];
        const r2 = radius * radius;
        const x0 = Math.floor(cx - radius), x1 = Math.ceil(cx + radius);
        const z0 = Math.floor(cz - radius), z1 = Math.ceil(cz + radius);
        const L0 = Math.max(MIN_LAYER + 1, Math.floor(cy - radius + 1.5));
        const L1 = Math.min(MAX_LAYER, Math.ceil(cy + radius + 1.5));
        for (let iz = z0; iz <= z1; iz++) {
            for (let ix = x0; ix <= x1; ix++) {
                const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
                const lx = ix & MASK, lz = iz & MASK;
                let touched = false;
                for (let L = L0; L <= L1; L++) {
                    const by = L - 1.0; // block centre y
                    const dx = ix - cx, dy = by - cy, dz = iz - cz;
                    if (dx * dx + dy * dy + dz * dz > r2) continue;
                    const idx = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
                    const type = c.blocks[idx];
                    if (type === BLOCK.AIR || type === BLOCK.BEDROCK || type === BLOCK.WATER) continue;
                    if (keep && keep(ix, by, iz)) continue; // (inside a house's sphere of protection)
                    c.blocks[idx] = BLOCK.AIR;
                    if (L < c.minOpen) c.minOpen = L;
                    removed.push({ x: ix, y: by, z: iz, type });
                    touched = true;
                }
                if (touched) {
                    c.modified = true;
                    this._refreshTop(c, lx, lz);
                    this._markDirty(ix, iz);
                }
            }
        }
        if (removed.length) this._flood(removed);
        return removed;
    }

    /** Holes dug next to / under water fill with water (up to the water level). */
    _flood(cells) {
        const W = BLOCK.WATER;
        for (let pass = 0; pass < 8; pass++) {
            let changed = false;
            for (const b of cells) {
                const L = Math.round(b.y + 1);
                if (L > 0) continue;
                const ix = b.x, iz = b.z;
                if (this.get(ix, L, iz) !== BLOCK.AIR) continue;
                if (this.get(ix, L + 1, iz) === W || this.get(ix + 1, L, iz) === W || this.get(ix - 1, L, iz) === W ||
                    this.get(ix, L, iz + 1) === W || this.get(ix, L, iz - 1) === W) {
                    const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
                    c.blocks[((L - MIN_LAYER) * CHUNK + (iz & MASK)) * CHUNK + (ix & MASK)] = W;
                    this._markDirty(ix, iz);
                    changed = true;
                }
            }
            if (!changed) break;
        }
    }

    /**
     * Voxel DDA ray cast. Returns {x,y,z,dist} of the first solid hit or null.
     * origin/dir are plain objects or THREE.Vector3 (dir normalised).
     */
    raycast(origin, dir, maxDist) {
        // Shift so block (i, L, k) occupies the unit cube [i-0.5, i+0.5] etc.
        let x = origin.x + 0.5, y = origin.y + 1.5, z = origin.z + 0.5;
        let ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
        const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
        const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
        const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
        let tMaxX = dir.x !== 0 ? ((dir.x > 0 ? ix + 1 - x : x - ix) * tDeltaX) : Infinity;
        let tMaxY = dir.y !== 0 ? ((dir.y > 0 ? iy + 1 - y : y - iy) * tDeltaY) : Infinity;
        let tMaxZ = dir.z !== 0 ? ((dir.z > 0 ? iz + 1 - z : z - iz) * tDeltaZ) : Infinity;
        let t = 0;
        for (let i = 0; i < 1024 && t <= maxDist; i++) {
            if (isSolid(this.get(ix, iy, iz))) {
                return { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t, dist: t };
            }
            if (tMaxX < tMaxY && tMaxX < tMaxZ) { ix += stepX; t = tMaxX; tMaxX += tDeltaX; }
            else if (tMaxY < tMaxZ) { iy += stepY; t = tMaxY; tMaxY += tDeltaY; }
            else { iz += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; }
        }
        return null;
    }

    /** Colour of a block face (deterministic per-block variation on mountains). */
    faceColor(type, ix, L, iz, isTop) {
        let base = BASE_COLORS[type] ?? 0xff00ff;
        if (type === BLOCK.GRASS && !isTop) base = GRASS_SIDE;
        if (L <= 0 && type === BLOCK.GRASS) return base; // flat ground: exact original colour
        if (type === BLOCK.WATER || type === BLOCK.ICE) return base;
        if (SHADES[type]) {
            // a few shades per tree so crowns don't look like one plastic box
            let k = ((ix >> 1) * 73856093) ^ (((L) >> 1) * 19349663) ^ ((iz >> 1) * 83492791);
            if (type === BLOCK.BIRCH) k = (ix * 73856093) ^ (L * 19349663) ^ (iz * 83492791); // birch: small dark marks
            k = ((k ^ (k >>> 13)) >>> 0) % 5;
            return SHADES[type][k];
        }
        // Small brightness jitter so mountains don't look like plastic. Sides vary
        // per layer (rock strata) so greedy meshing can still merge long runs;
        // tops vary per 2×2 patch.
        let h = isTop
            ? ((ix >> 1) * 73856093) ^ (L * 19349663) ^ ((iz >> 1) * 83492791)
            : (L * 19349663) ^ (type * 83492791);
        h = (h ^ (h >>> 13)) >>> 0;
        const j = ((h % 1000) / 1000 - 0.5) * 0.12;
        const r = Math.min(255, Math.max(0, ((base >> 16) & 255) * (1 + j)));
        const g = Math.min(255, Math.max(0, ((base >> 8) & 255) * (1 + j)));
        const b = Math.min(255, Math.max(0, (base & 255) * (1 + j)));
        return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
    }

    /**
     * Sky light round a chunk with caves (as in Minecraft): 15 in the open air; in the rock's
     * hollows (a cave, a tunnel) the daylight comes in only through their openings, one less a
     * block — a few steps past the mouth it is dark. Villages and castles keep their own light.
     * Returns (x, L, z) → darkness 0 (open) … 15 for the chunk and the cells round it, or null
     * (no cave here or next door: all lit). Also keeps the chunk's own cells in c.sky (skyAt).
     */
    _skyLight(cx, cz) {
        const c = this.chunk(cx, cz);
        let any = false;
        for (let dz = -1; dz <= 1 && !any; dz++) for (let dx = -1; dx <= 1 && !any; dx++) if (this.chunk(cx + dx, cz + dz).caved) any = true;
        if (!any) { c.sky = null; return null; }
        const P = 15, RW = CHUNK + 2 * P, x0 = cx * CHUNK - P, z0 = cz * CHUNK - P;
        const chunks = [];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) chunks.push(this.chunk(cx + dx, cz + dz));
        const N = RW * RW * HEIGHT;
        if (!_sky.light || _sky.light.length < N) { _sky.light = new Uint8Array(N); _sky.queue = new Int32Array(N); _sky.tops = new Int16Array(RW * RW); }
        const light = _sky.light, queue = _sky.queue, tops = _sky.tops;
        light.fill(0, 0, N);
        const blockAt = (rx, L, rz) => {
            const wx = x0 + rx, wz = z0 + rz;
            const k = chunks[((wz >> SHIFT) - cz + 1) * 3 + ((wx >> SHIFT) - cx + 1)];
            return k.blocks[((L - MIN_LAYER) * CHUNK + (wz & MASK)) * CHUNK + (wx & MASK)];
        };
        let maxTop = MIN_LAYER;
        for (let rz = 0; rz < RW; rz++) for (let rx = 0; rx < RW; rx++) {
            const wx = x0 + rx, wz = z0 + rz;
            const k = chunks[((wz >> SHIFT) - cz + 1) * 3 + ((wx >> SHIFT) - cx + 1)];
            let top = k.top[(wz & MASK) * CHUNK + (wx & MASK)];
            if (k.caved && this.sites?.landAt(wx, wz)) top = MIN_LAYER - 1; // (houses and castles: their rooms as they are)
            tops[rz * RW + rx] = top;
            if (top > maxTop) maxTop = top;
        }
        // open: at or above the column's top, and light passes there (air, water)
        const open = (rx, L, rz) => { const t = tops[rz * RW + rx]; return L > t || (L === t && !drawn(blockAt(rx, L, rz))); };
        const D = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        let tail = 0;
        // the hollows' cells next to the open air get the daylight
        for (let rz = 0; rz < RW; rz++) for (let rx = 0; rx < RW; rx++) {
            const wx = x0 + rx, wz = z0 + rz;
            if (!chunks[((wz >> SHIFT) - cz + 1) * 3 + ((wx >> SHIFT) - cx + 1)].caved) continue; // (no hollows there)
            const top = tops[rz * RW + rx];
            for (let L = MIN_LAYER + 1; L < top; L++) {
                if (drawn(blockAt(rx, L, rz))) continue;
                let lit = false;
                for (const [dx, dy, dz] of D) {
                    const nx = rx + dx, nz = rz + dz, nL = L + dy;
                    if (nx < 0 || nz < 0 || nx >= RW || nz >= RW) continue;
                    if (open(nx, nL, nz)) { lit = true; break; }
                }
                if (lit) { const i = ((L - MIN_LAYER) * RW + rz) * RW + rx; light[i] = 14; queue[tail++] = i; }
            }
        }
        // …and it spreads into them, one less a block
        for (let head = 0; head < tail; head++) {
            const i = queue[head], v = light[i];
            if (v <= 1) continue;
            const rx = i % RW, rz = ((i - rx) / RW) % RW, L = Math.floor(i / (RW * RW)) + MIN_LAYER;
            for (const [dx, dy, dz] of D) {
                const nx = rx + dx, nz = rz + dz, nL = L + dy;
                if (nx < 0 || nz < 0 || nx >= RW || nz >= RW || nL <= MIN_LAYER || nL > MAX_LAYER) continue;
                if (nL >= tops[nz * RW + nx]) continue; // (the open air: lit anyway)
                const j = ((nL - MIN_LAYER) * RW + nz) * RW + nx;
                if (light[j] >= v - 1 || drawn(blockAt(nx, nL, nz))) continue;
                light[j] = v - 1;
                queue[tail++] = j;
            }
        }
        const dark = (wx, L, wz) => {
            const rx = wx - x0, rz = wz - z0;
            if (rx < 0 || rz < 0 || rx >= RW || rz >= RW || L <= MIN_LAYER || L > MAX_LAYER) return 0;
            if (L >= tops[rz * RW + rx]) return 0;
            return 15 - light[((L - MIN_LAYER) * RW + rz) * RW + rx];
        };
        // the chunk's own cells, kept (how dark it is where the player stands: skyAt)
        const own = c.sky && c.sky.length === CHUNK * CHUNK * HEIGHT ? c.sky : new Uint8Array(CHUNK * CHUNK * HEIGHT);
        for (let L = MIN_LAYER; L <= Math.min(MAX_LAYER, maxTop); L++) for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
            own[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = dark(cx * CHUNK + lx, L, cz * CHUNK + lz);
        }
        c.sky = own;
        return dark;
    }

    /** How much daylight reaches a point (1: the open sky … ~0.04: deep in a cave). */
    skyAt(x, y, z) {
        const ix = Math.round(x), iz = Math.round(z), L = Math.floor(y + 1.5);
        if (L < MIN_LAYER || L > MAX_LAYER) return 1;
        const c = this.chunks.get(chunkKey(ix >> SHIFT, iz >> SHIFT));
        if (c && c.sky === undefined) this._skyLight(ix >> SHIFT, iz >> SHIFT); // (not drawn yet: worked out now)
        if (!c?.sky) return 1;
        return skyFactor(c.sky[((L - MIN_LAYER) * CHUNK + (iz & MASK)) * CHUNK + (ix & MASK)]);
    }

    /**
     * Greedy-mesh one chunk. Returns two vertex buffers: `ground` (faces of
     * blocks at or below layer 0 — receive shadows only, like the old plane) and
     * `raised` (mountains, trees — cast and receive shadows).
     */
    buildChunkArrays(cx, cz) {
        const c = this.chunk(cx, cz);
        const out = { ground: newBuffers(), raised: newBuffers(), water: newBuffers() };
        const x0 = cx * CHUNK, z0 = cz * CHUNK;
        // Only the layers that can hold faces of this chunk's blocks: from just
        // below the lowest open (non-rock) layer here or next door, to the top
        let open = c.minOpen ?? MIN_LAYER;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) open = Math.min(open, this.chunk(cx + dx, cz + dz).minOpen ?? MIN_LAYER);
        const lowest = Math.max(MIN_LAYER, open - 1);
        const G0 = lowest - MIN_LAYER;
        const layers = Math.max(1, Math.min(MAX_LAYER, c.maxTop + 1) - lowest + 1);
        const sizes = [CHUNK, layers, CHUNK];
        const origin = [x0, lowest, z0];
        const blocks = c.blocks;
        const skipSea = !!(this.skipSeaTop && c.sea);
        const below = lowest > MIN_LAYER ? BLOCK.STONE : BLOCK.AIR; // (all rock under `lowest`)
        const hid = this._hidden?.get(chunkKey(cx, cz)) || null; // (a falling piece not landed yet: not drawn there)
        // (a cave's dark: a face is as lit as the air in front of it — _skyLight; null: all lit)
        const sky = this._skyLight(cx, cz);
        // Fast access inside this chunk; neighbours only for border occlusion
        const at = (gx, gy, gz) => {
            if (gy < 0) return below;
            if (gy + G0 >= HEIGHT) return BLOCK.AIR;
            if (gx >= 0 && gx < CHUNK && gz >= 0 && gz < CHUNK) {
                const i = ((gy + G0) * CHUNK + gz) * CHUNK + gx;
                return hid && hid.has(i) ? BLOCK.AIR : blocks[i];
            }
            return this.get(x0 + gx, lowest + gy, z0 + gz);
        };

        const x = [0, 0, 0];
        // Greedy meshing over the three axes (Mikola Lysenko's algorithm).
        for (let d = 0; d < 3; d++) {
            const u = (d + 1) % 3, v = (d + 2) % 3;
            const su = sizes[u], sv = sizes[v];
            const mask = new Int32Array(su * sv);
            const maskKind = new Int8Array(su * sv); // 0 ground, 1 raised, 2 water
            const maskDark = new Int8Array(su * sv); // 0 open sky … 15 deep in a cave
            const qx = d === 0 ? 1 : 0, qy = d === 1 ? 1 : 0, qz = d === 2 ? 1 : 0;
            for (x[d] = -1; x[d] < sizes[d];) {
                let n = 0;
                const aIn = x[d] >= 0;
                const bIn = x[d] + 1 < sizes[d];
                for (x[v] = 0; x[v] < sv; x[v]++) {
                    for (x[u] = 0; x[u] < su; x[u]++, n++) {
                        const ax = x[0], ay = x[1], az = x[2];
                        // Only emit faces whose solid block lies inside this chunk;
                        // neighbours outside it still occlude.
                        const aRaw = at(ax, ay, az);
                        const bRaw = at(ax + qx, ay + qy, az + qz);
                        const a = aIn ? aRaw : BLOCK.AIR;
                        const b = bIn ? bRaw : BLOCK.AIR;
                        // Solid faces show wherever the neighbour is air or (see-through) water;
                        // water shows its surface only towards air.
                        let key = 0, kind = 0;
                        if (drawn(a) && !drawn(bRaw)) {
                            const L = ay + lowest;
                            key = this.faceColor(a, x0 + ax, L, z0 + az, d === 1) + 1 + (PATTERN_OF[a] || 0) * 0x1000000;
                            kind = L >= 1 ? 1 : 0;
                        } else if (drawn(b) && !drawn(aRaw)) {
                            const L = ay + qy + lowest;
                            // skip the bottom of the bedrock layer
                            if (!(d === 1 && L === MIN_LAYER)) {
                                key = -(this.faceColor(b, x0 + ax + qx, L, z0 + az + qz, false) + 1 + (PATTERN_OF[b] || 0) * 0x1000000);
                                kind = L >= 1 ? 1 : 0;
                            }
                        } else if (a === BLOCK.WATER && (bRaw === BLOCK.AIR || bRaw === BLOCK.ICE_SHAPE)) {
                            // (the sea's top is drawn by the moving wave surface instead)
                            if (!(skipSea && d === 1 && ay + lowest === 0 && c.sea[az * CHUNK + ax])) { key = BASE_COLORS[BLOCK.WATER] + 1; kind = 2; }
                        } else if (b === BLOCK.WATER && (aRaw === BLOCK.AIR || aRaw === BLOCK.ICE_SHAPE)) {
                            key = -(BASE_COLORS[BLOCK.WATER] + 1); kind = 2;
                        }
                        mask[n] = key;
                        maskKind[n] = kind;
                        // the air the face looks into (a's face looks at b, b's at a)
                        maskDark[n] = sky && key && kind !== 2 ? (key > 0 ? sky(x0 + ax + qx, lowest + ay + qy, z0 + az + qz) : sky(x0 + ax, lowest + ay, z0 + az)) : 0;
                    }
                }
                x[d]++;
                // Build quads from the mask.
                n = 0;
                for (let j = 0; j < sv; j++) {
                    for (let i = 0; i < su;) {
                        const col = mask[n];
                        if (col === 0) { i++; n++; continue; }
                        const kindC = maskKind[n], darkC = maskDark[n];
                        let w = 1;
                        while (i + w < su && mask[n + w] === col && maskKind[n + w] === kindC && maskDark[n + w] === darkC) w++;
                        let h = 1, done = false;
                        for (; j + h < sv; h++) {
                            for (let k = 0; k < w; k++) {
                                const m = n + k + h * su;
                                if (mask[m] !== col || maskKind[m] !== kindC || maskDark[m] !== darkC) { done = true; break; }
                            }
                            if (done) break;
                        }
                        const pos = [0, 0, 0]; pos[u] = i; pos[v] = j; pos[d] = x[d];
                        const du = [0, 0, 0]; du[u] = w;
                        const dv = [0, 0, 0]; dv[v] = h;
                        const target = kindC === 2 ? out.water : kindC === 1 ? out.raised : out.ground;
                        // The water surface sits a little below the ground around it
                        const drop = kindC === 2 && d === 1 && col > 0 ? 0.12 : 0;
                        const code = Math.abs(col) - 1;
                        pushQuad(target, origin, pos, du, dv, d, col > 0, code & 0xffffff, drop, code >>> 24, skyFactor(darkC));
                        for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * su] = 0;
                        i += w; n += w;
                    }
                }
            }
        }
        return out;
    }
}

function newBuffers() {
    return { positions: [], normals: [], colors: [], indices: [], patterns: [], skies: [], patterned: false };
}

/** Convert grid-space quad to world space and append it. */
function pushQuad(buf, origin, pos, du, dv, d, positive, color, drop = 0, pattern = 0, sky = 1) {
    // grid -> world: x_w = gx - 0.5, y_w = gy - 1.5, z_w = gz - 0.5 (gx = origin + local)
    const base = buf.positions.length / 3;
    const px = origin[0] + pos[0] - 0.5, py = origin[1] + pos[1] - 1.5 - drop, pz = origin[2] + pos[2] - 0.5;
    const nx = d === 0 ? (positive ? 1 : -1) : 0, ny = d === 1 ? (positive ? 1 : -1) : 0, nz = d === 2 ? (positive ? 1 : -1) : 0;
    const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
    buf.positions.push(
        px, py, pz,
        px + du[0], py + du[1], pz + du[2],
        px + du[0] + dv[0], py + du[1] + dv[1], pz + du[2] + dv[2],
        px + dv[0], py + dv[1], pz + dv[2],
    );
    for (let k = 0; k < 4; k++) {
        buf.normals.push(nx, ny, nz);
        buf.colors.push(r, g, b);
        buf.patterns.push(pattern);
        buf.skies.push(sky);
    }
    if (pattern) buf.patterned = true;
    // Winding: (u, v, d) is a right-handed cyclic triple, so u×v = +d.
    if (positive) buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else buf.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

/** Original mountain height (kept for tests / tools). */
export function mountainHeight(ix, iz, seed = 1) {
    return createHeightField(seed, true)(ix, iz);
}

/**
 * Terrain = data + THREE meshes for the chunks around the player.
 * update(focus) streams chunks in and out; explosions rebuild only the
 * touched chunks, a couple per frame, so nothing ever causes a hitch.
 */
export class Terrain {
    constructor(scene, { seed = 1, mountains = false, seas = false, test = false, deepCaves = false, viewDistance = 112 } = {}) {
        this.scene = scene;
        this.data = new TerrainData();
        this.data.generate({ seed, mountains, seas, test, deepCaves });
        // the sea's top is drawn by the wave surface (src/fx/SeaSurface.js), not by flat block faces
        this.data.skipSeaTop = !!this.data.seas;
        this.material = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111 }));
        this.waterMaterial = applySkyComp(new THREE.MeshPhongMaterial({
            vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
            shininess: 90, specular: 0x88bbff,
        }));
        this.group = new THREE.Group();
        this.group.name = 'terrain';
        this.meshes = new Map(); // chunk key -> {ground, raised, cx, cz}
        this.pool = []; // unloaded mesh pairs, reused
        scene.add(this.group);
        this.viewDistance = viewDistance; // m
        this.budgetMs = 4; // per frame for building new chunks
        this.maxRebuildsPerFrame = 2;
        this._center = null;
        this._queue = [];
        this._frame = 0;
        this.stats = { built: 0, unloaded: 0, maxBuildMs: 0 };
        this.flushAround(0, 0);
    }

    get radiusChunks() {
        return Math.ceil(this.viewDistance / CHUNK);
    }

    /** Build every chunk around a point right now (loading screen). */
    flushAround(x, z) {
        this._center = null;
        this._plan(x, z);
        while (this._queue.length) this._load(this._queue.pop());
        this.data.dirtyChunks.clear();
    }

    /**
     * @param {{x:number, z:number}} [focus] player position (default: spawn)
     */
    update(focus) {
        this._frame++;
        const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
        this._plan(fx, fz);

        // 1) Chunks changed by explosions (only the ones we show)
        let n = 0;
        for (const key of this.data.dirtyChunks) {
            this.data.dirtyChunks.delete(key);
            const entry = this.meshes.get(key);
            if (!entry) continue;
            this._build(entry);
            if (++n >= this.maxRebuildsPerFrame) break;
        }

        // 2) New chunks, nearest first, within the time budget
        const t0 = performance.now();
        while (this._queue.length) {
            const job = this._queue.pop();
            if (this.meshes.has(job.key)) continue;
            this._load(job);
            if (performance.now() - t0 > this.budgetMs) break;
        }

        // 3) Forget far, untouched chunk data now and then (it regenerates identically)
        if (this._frame % 120 === 0) this.data.evictFar(Math.floor(fx / CHUNK), Math.floor(fz / CHUNK), this.radiusChunks + 4);
    }

    /** Recompute which chunks to show when the player enters another chunk. */
    _plan(x, z) {
        const ccx = Math.floor(x / CHUNK), ccz = Math.floor(z / CHUNK);
        const R = this.radiusChunks;
        if (this._center && this._center.cx === ccx && this._center.cz === ccz && this._center.R === R) return;
        this._center = { cx: ccx, cz: ccz, R };
        // Unload meshes out of range (one extra ring kept to avoid flicker at borders)
        for (const [key, e] of this.meshes) {
            const dx = e.cx - ccx, dz = e.cz - ccz;
            if (dx * dx + dz * dz > (R + 1.5) * (R + 1.5)) this._unload(key, e);
        }
        // Wanted chunks within a circle, nearest last (queue is popped from the end)
        const jobs = [];
        for (let dz = -R; dz <= R; dz++) {
            for (let dx = -R; dx <= R; dx++) {
                const d2 = dx * dx + dz * dz;
                if (d2 > (R + 0.5) * (R + 0.5)) continue;
                const cx = ccx + dx, cz = ccz + dz;
                const key = chunkKey(cx, cz);
                if (!this.meshes.has(key)) jobs.push({ key, cx, cz, d2 });
            }
        }
        jobs.sort((a, b) => b.d2 - a.d2);
        this._queue = jobs;
    }

    _load(job) {
        let entry = this.pool.pop();
        if (!entry) entry = { ground: this._makeMesh(false), raised: this._makeMesh(true), water: this._makeMesh(false, this.waterMaterial) };
        entry.cx = job.cx;
        entry.cz = job.cz;
        this.meshes.set(job.key, entry);
        this._build(entry);
    }

    _unload(key, entry) {
        this.meshes.delete(key);
        entry.ground.visible = false;
        entry.raised.visible = false;
        entry.water.visible = false;
        this.pool.push(entry);
        this.stats.unloaded++;
    }

    _build(entry) {
        const t0 = performance.now();
        const arrays = this.data.buildChunkArrays(entry.cx, entry.cz);
        this._fill(entry.ground, arrays.ground);
        this._fill(entry.raised, arrays.raised);
        this._fill(entry.water, arrays.water);
        const ms = performance.now() - t0;
        this.stats.built++;
        if (ms > this.stats.maxBuildMs) this.stats.maxBuildMs = ms;
    }

    _makeMesh(raised, material = this.material) {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
        if (material !== this.material) mesh.renderOrder = 1; // water after the ground under it
        mesh.receiveShadow = true;
        mesh.castShadow = raised;
        mesh.matrixAutoUpdate = false;
        mesh.userData.isTerrain = true;
        mesh.visible = false;
        this.group.add(mesh);
        return mesh;
    }

    _fill(mesh, buf) {
        // A fresh geometry each time: resizing attributes of an uploaded one is not allowed
        mesh.geometry.dispose();
        if (buf.indices.length === 0) {
            mesh.geometry = new THREE.BufferGeometry();
            mesh.visible = false;
            return;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
        // castle stone, planks, roof tiles... (always set: one shader for every chunk)
        geo.setAttribute('voxPat', new THREE.Float32BufferAttribute(buf.patterns, 1));
        geo.setAttribute('voxSky', new THREE.Float32BufferAttribute(buf.skies, 1)); // (daylight reaching it: a cave's dark)
        geo.setIndex(buf.indices);
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        mesh.geometry = geo;
        mesh.visible = true;
    }

    surfaceY(x, z) { return this.data.surfaceY(x, z); }
    topLayer(ix, iz) { return this.data.topLayer(ix, iz); }
    floorBelow(ix, iz, L) { return this.data.floorBelow(ix, iz, L); }
    solidIn(ix, iz, L0, L1) { return this.data.solidIn(ix, iz, L0, L1); }
    ceilingAbove(ix, iz, L) { return this.data.ceilingAbove(ix, iz, L); }
    blockAt(ix, L, iz) { return this.data.get(ix, L, iz); }
    raycast(origin, dir, maxDist) { return this.data.raycast(origin, dir, maxDist); }
    removeSphere(x, y, z, r, keep = null) { return this.data.removeSphere(x, y, z, r, keep); }

    dispose() {
        for (const e of [...this.meshes.values(), ...this.pool]) {
            e.ground.geometry.dispose();
            e.raised.geometry.dispose();
            e.water.geometry.dispose();
        }
        this.meshes.clear();
        this.pool = [];
        this.material.dispose();
        this.waterMaterial.dispose();
        this.scene.remove(this.group);
    }
}
