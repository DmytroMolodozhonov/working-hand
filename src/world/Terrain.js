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

import { createNoise2D, createRng, smoothstep } from '../core/math.js';
import { CastleIndex, testSeaCastleSpot } from './Castles.js';
import { TowerIndex } from './WizardTowers.js';
import { VillageIndex } from './WizardVillages.js';
import { SiteIndex } from './Sites.js';
import { SeaIndex, SEA, seaDepth } from './Sea.js';
import { CAVES, growCaveSystem, caveMouth, hillMouth, carveColumn, chamberFloor, systemIn, noise3 } from './CaveSystems.js';
import { LAIR, lairOf } from './DragonLairs.js';
import { IceCastleSite, ICE_BLOCK, PALACE_ICE, inIcePalace } from './IceCastle.js';
import { createLandscape, LUSH, KIND, BIOMES, hashLand, mesaRock, mixColour, MESA_SAND_COLOUR } from './Landscape.js';
import { PlanetRegistry, SPACE, slotAt, offEarth } from './Planets.js';
import { planetHeight, generatePlanetChunk, planetFaceColor } from './PlanetSurface.js';

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
    // the Ice Queen's palace (src/world/IceCastle.js) and the Ice Rod's ice (IceQueen.js): glacier ice,
    // glowing ice, the snowflake floor, deep blue ice — melted by fire, never by the sun
    ICE_WALL: 59, ICE_GLOW: 60, ICE_FLOOR: 61, ICE_DARK: 62,
    // other planets' ground (PlanetSurface.js): dust, rock, ice, the dark land — coloured by each planet's palette
    REGOLITH: 63, PLANET_ROCK: 64, PLANET_ICE: 65, PLANET_DARK: 66,
    // a terraformed planet's own life (PlanetSurface.js, «Terraform Planet»): its moss / grass, the trunks and
    // the crowns of its trees — coloured by that planet's palette (never the Earth's green)
    PLANET_GRASS: 67, PLANET_WOOD: 68, PLANET_LEAF: 69,
};
/** A block of another planet's ground (its colour comes from the planet: PlanetSurface.planetFaceColor). */
export const isPlanetBlock = (t) => t >= BLOCK.REGOLITH && t <= BLOCK.PLANET_LEAF;
/** The palace's / the Ice Rod's ice (melts in fire: IceQueen.melt). */
export const isPalaceIce = (t) => t >= BLOCK.ICE_WALL && t <= BLOCK.ICE_DARK;
/** Built by people (castles, villages): wrecking it is a crime there. */
export const isCastleBlock = (t) => t >= BLOCK.CS_GREY && t <= BLOCK.RUNE;
/** Surface pattern drawn by the voxel shader (0 = the usual pixel pattern). */
export const PATTERN = { NONE: 0, ASHLAR: 1, COBBLE: 2, BRICK: 3, PLANKS: 4, TILES: 5, CLOTH: 6, GOLD: 7, STRAW: 8, FURROWS: 9, BOOKS: 10, GLOW: 11, CRYSTAL: 12, RUNES: 13, GRASS: 14, GLACIER: 15, SNOWFLAKE: 16, SNOW: 17 };
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
/** A column's highest possible hollow (air under its top: caves, rooms, digging) rises to L. */
function hollowAt(c, col, L) {
    const h = c.hollow || (c.hollow = new Int16Array(CHUNK * CHUNK).fill(MIN_LAYER));
    if (L > h[col]) h[col] = L;
}
/** A tree's own blocks (its trunk and its leaves — not planks). */
const isTree = (t) => isLeaves(t) || t === BLOCK.WOOD || t === BLOCK.BIRCH || t === BLOCK.SPRUCE || t === BLOCK.CHERRY || t === BLOCK.DARK;
/** Burns (wood and leaves of every tree). */
export const isFlammable = (t) => isWood(t) || isLeaves(t) || t === BLOCK.THATCH || t === BLOCK.HAY || t === BLOCK.WHEAT || t === BLOCK.BOOKS || t === BLOCK.FENCE || t === BLOCK.VEG;
// ICE_SHAPE: solid space inside frozen water shapes (drawn by WaterMagic, not as cubes)

/** The sea's water where its side shows (a crater of «Бум» it poured into): the waving sea surface's shallow colour. */
export const SEA_WATER = 0x2b8f9e;
/** Water is not solid: you can see, walk and shoot through it. */
export const isSolid = (type) => type !== BLOCK.AIR && type !== BLOCK.WATER;
/** Blocks drawn as cubes (frozen water shapes are drawn as their own smooth shapes). */
const drawn = (type) => type !== BLOCK.AIR && type !== BLOCK.WATER && type !== BLOCK.ICE_SHAPE;
/** Daylight left at a darkness 0…15 (Minecraft's light levels: a step down is a fifth less). */
export const skyFactor = (dark) => (dark <= 0 ? 1 : Math.max(0.035, Math.pow(0.8, dark)));
const _sky = { light: null, queue: null, tops: null }; // (reused buffers of _skyLight)
const _mesh = { pad: null }; // (reused buffer of buildChunkArrays)
const _SKY_DX = [1, -1, 0, 0, 0, 0], _SKY_DY = [0, 0, 1, -1, 0, 0], _SKY_DZ = [0, 0, 0, 0, 1, -1]; // (the six neighbours, _skyLight)
// (reused buffers of _generateLush)
const _lush = { hh: null, flags: null, kinds: null, water: null, T: new Float32Array(32 * 32), fx: {}, fx2: {}, clim: {}, clim2: {}, w: new Float32Array(16), w2: new Float32Array(16), col3: {} };
/** Layers below the snow line where the snow lies in patches (generation 5): the higher, the more. */
export const SNOW_BAND = 8;
/**
 * Generation 5: is the top of a column snow? The snow line (Landscape.snowLine: lower in the cold,
 * ragged) moved by the ground itself — the snow lies lower on the shaded northern (−z) slopes and
 * in the hollows, higher on the sunny ones and the humps, and slides off steep rock (a cliff stays
 * bare well above the line). Below it, in a band of SNOW_BAND layers, patches: a few metres across
 * (`patch`, Landscape.snowPatch) and here and there a single block (`r`), more of them higher up.
 * `hh`: the heights round the column (row length P), `i` the column's own.
 */
export function snowAt(h, line, hh, i, P, slope, patch, r) {
    const north = Math.max(-3, Math.min(3, hh[i + P] - hh[i - P])); // (the ground rising to the south: the slope faces north)
    const hollow = Math.max(-2, Math.min(2, (hh[i + 1] + hh[i - 1] + hh[i + P] + hh[i - P]) / 4 - h));
    const s = h - line + 0.8 * north + 1.6 * hollow - (slope >= 3 ? 7 : slope === 2 ? 2 : 0);
    if (s >= 0) return true;
    if (s <= -SNOW_BAND) return false;
    return 0.8 * patch + 0.2 * r < 1.05 * smoothstep(0, 1, 1 + s / SNOW_BAND);
}
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
    [BLOCK.ICE_WALL]: 0x9fd6f2,
    [BLOCK.ICE_GLOW]: 0x9ee4ff,
    [BLOCK.ICE_FLOOR]: 0xc4e8fa,
    [BLOCK.ICE_DARK]: 0x5ea8d8,
    [BLOCK.REGOLITH]: 0x8a7f74,
    [BLOCK.PLANET_ROCK]: 0x6a6058,
    [BLOCK.PLANET_ICE]: 0xdedad2,
    [BLOCK.PLANET_DARK]: 0x4a4440,
    [BLOCK.PLANET_GRASS]: 0x3fa08a,
    [BLOCK.PLANET_WOOD]: 0x5a3a5a,
    [BLOCK.PLANET_LEAF]: 0x9a5ad0,
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
    [BLOCK.ICE_WALL]: PATTERN.GLACIER, [BLOCK.ICE_DARK]: PATTERN.GLACIER, [BLOCK.ICE_GLOW]: PATTERN.CRYSTAL, [BLOCK.ICE_FLOOR]: PATTERN.SNOWFLAKE, [BLOCK.SNOW]: PATTERN.SNOW,
});
/** Generation 5: the same, and the grass has its own (patches and shimmer of colour in the shader). */
const PATTERN_OF_LUSH = Object.assign({}, PATTERN_OF, { [BLOCK.GRASS]: 14 });
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
const GRASS_SIDE = 0x6b4a2a;
const SNOW_CAP = 0xe4ecf0, FROST = 0xd8e0e4; // (snow on a crown's top; a thin frost of snow on rock and grass) // dirt-coloured sides under a grass top

export const MIN_LAYER = -17; // the lowest layer: bedrock (indestructible); the deep sea's floor is at -16
/** Bedrock top of old worlds (generation 1, and every world without seas): lakes reach down to -7. */
export const OLD_BEDROCK = -9;
/**
 * World generation version. 1: the original worlds (no seas, bedrock at −9).
 * 2: seas (deep basins far from spawn), sea castles with ports, bedrock at −17.
 * 3: the creative test ground (a river by the pedestals, a castle close by — see TEST_RIVER).
 * A saved world and a guest keep the generation their world was made with.
 */
export const WORLD_GEN = 5;
// 5: the new landscape (src/world/Landscape.js): big mountain ranges with sharp snowy peaks, no flat
//    tops (the world is 120 layers high), kinds of land with their own grass and leaves, scarlet
//    canyons, emerald hills, moonlit groves, floating islands; flowers and tall grass (Flora.js).
//    A world made before keeps its generation (its saved changes lie on the land they were made on).
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

// (120 = room for generation 5's mountains — no ceiling they flatten against (Landscape.js) — and
// the floating islands; the wizards' tower reaches 56. Old worlds' mountains stay as they always
// were, capped at MOUNTAIN_TOP, so old worlds and saves are unchanged)
export const MAX_LAYER = 120;
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
export function createHeightField(seed, mountains, seas = null, test = false, lush = false) {
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
    // generation 5: the far land is the new landscape (Landscape.js); the spawn's land as it was
    const land = lush ? createLandscape(seed) : null;
    const fn = (ix, iz) => {
        fn.water = 0; fn.sea = false; fn.beach = false; fn.kind = KIND.LAND;
        fn.mesa = fn.emer = fn.moon = fn.fant = 0;
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
        let h;
        if (land && dist >= LUSH.FAR) {
            // (generation 5, far out: only the new landscape — the spawn's old hills not worked out)
            h = Math.round(land.height(ix, iz, dist));
            fn.kind = land.kind;
            fn.mesa = land.mesa; fn.emer = land.emer; fn.moon = land.moon; fn.fant = land.fant;
        } else {
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
            h = Math.min(Math.floor(cap), Math.floor(ridge * ridge * 30 * near * amp));
            if (land) {
                // (generation 5: the spawn's land melts into the new landscape)
                const lf = smoothstep(LUSH.NEAR, LUSH.FAR, dist);
                if (lf > 0) {
                    h = Math.round(h + (land.height(ix, iz, dist) - h) * lf);
                    if (lf > 0.5) fn.kind = land.kind;
                    fn.mesa = land.mesa; fn.emer = land.emer; fn.moon = land.moon; fn.fant = land.fant;
                }
            }
        }

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
        // (generation 5: the rivers further apart — the land between them wider)
        const rv = land ? Math.abs(rivers(ix / 380, iz / 380) + 0.16 * rivers(ix / 60 + 50, iz / 60 - 20)) : Math.abs(rivers(ix / 230, iz / 230) + 0.18 * rivers(ix / 45 + 50, iz / 45 - 20));
        const width = (land ? 0.022 : 0.032) * wet;
        if (rv < width * 3) {
            if (rv < width) {
                const depth = rv < width * 0.5 ? 2 : 1;
                fn.water = depth;
                return -depth;
            }
            // Valley sides rise gently from the banks
            h = Math.min(h, Math.floor(((rv - width) / (width * 2)) * 6));
        } else if (land && wet >= 1) {
            // (generation 5: through high land a river runs in a valley, its sides rising steeper
            // and steeper — not a slot cut straight down through a mountain)
            const e = rv - width * 3;
            h = Math.min(h, 6 + Math.floor(e * 110 + e * e * 2600));
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
    fn.water = 0; fn.sea = false; fn.beach = false; fn.kind = KIND.LAND;
    fn.land = land;
    if (!test) return fn;
    // the test ground's hill (with its cave, see TerrainData.caveOf)
    const hill = (ix, iz) => {
        let h = fn(ix, iz);
        hill.water = fn.water; hill.sea = fn.sea; hill.beach = fn.beach; hill.kind = fn.kind;
        hill.mesa = fn.mesa; hill.emer = fn.emer; hill.moon = fn.moon; hill.fant = fn.fant;
        const m = fn.water ? -Infinity : testHillHeight(ix, iz); // (the river keeps its bed: its water's top stays level, no raised channel)
        if (m > h) h = m;
        return h;
    };
    hill.water = 0; hill.sea = false; hill.beach = false; hill.kind = KIND.LAND;
    hill.land = land;
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
/** Generation 5's floating islands: at most one (with its small ones) per CELL×CELL m. */
export const ISLE = { CELL: 112, R_MIN: 6, R_MAX: 15 };
const ZONE_CX = Math.floor(SPACE.ZONE_X / CHUNK);
let _empty = null;
/** The one chunk of the empty far zone: bedrock at the bottom, air above. */
function emptyChunk() {
    if (_empty) return _empty;
    const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    blocks.fill(BLOCK.BEDROCK, 0, CHUNK * CHUNK);
    const top = new Int16Array(CHUNK * CHUNK).fill(MIN_LAYER);
    _empty = { cx: 0, cz: 0, blocks, top, maxTop: MIN_LAYER, modified: false, minOpen: MIN_LAYER + 1, sea: null, empty: true };
    return _empty;
}

export class TerrainData {
    /**
     * @param {number} [_size] ignored (the world is endless); kept for compatibility
     */
    constructor(_size) {
        this.chunks = new Map(); // key -> {cx, cz, blocks, top, maxTop, modified}
        this.dirtyChunks = new Set(); // chunk keys whose mesh must be rebuilt
        this.mapDirty = new Set(); // chunk keys changed since the minimap last looked (Hud.js)
        this.version = 0;
        this.seed = 1;
        this.mountains = false;
        this.heightAt = () => 0;
        this._last = null; // last chunk looked up (most queries hit the same one)
    }

    /** Set the world recipe. Chunks are generated lazily from it. */
    generate({ seed = 1, mountains = false, seas = false, test = false, deepCaves = false, lush = false } = {}) {
        this.seed = seed;
        this.mountains = mountains;
        this.lush = !!(mountains && lush); // (generation 5: the new landscape — Landscape.js)
        this.deepCaves = !!(mountains && deepCaves); // (generation 4: cave systems, not single chambers)
        this.test = !!(mountains && test); // (creative, generation 3: the test ground)
        // seas only in generation-2 worlds with land (old worlds stay exactly as they were)
        // (the creative test ground: a sea right by its castle's quay — the castle is placed first)
        const spot = mountains && seas && test ? testSeaCastleSpot(seed) : null;
        this.seas = mountains && seas ? new SeaIndex(seed, spot ? spot.shore : null) : null;
        this.bedrockTop = this.seas ? MIN_LAYER : OLD_BEDROCK;
        const raw = createHeightField(seed, mountains, this.seas, this.test, this.lush);
        this.rawHeight = raw; // (without the castles' levelled land: the globe seen from space — PlanetTextures.js)
        this.land = raw.land || null;
        this.castles = this.towers = this.villages = this.sites = this.iceCastle = null;
        if (mountains) {
            // castles and their villages, the wizards' towers stand on levelled land
            this.castles = new CastleIndex(seed, raw, this.seas, this.test);
            this.towers = new TowerIndex(seed, raw, this.castles);
            // the wizards' settlements (WizardVillages.js): in cells with neither a castle nor a tower
            this.villages = new VillageIndex(seed, raw, this.castles, this.towers);
            // the one Ice Castle of the world (IceCastle.js): generation 5 and the creative test ground
            const busy = (x, z) => { const ix = Math.round(x), iz = Math.round(z); return !!(this.castles.landAt(ix, iz) || this.towers.landAt(ix, iz) || this.villages.landAt(ix, iz)); };
            const ice = this.lush || this.test ? new IceCastleSite(seed, raw, busy, this.test ? { x: TEST_CAVE.X - 6, z: TEST_CAVE.Z - 4 } : null) : null;
            const idx = this.sites = new SiteIndex(this.castles, this.towers, ice, this.villages);
            this.iceCastle = ice;
            const fn = (ix, iz) => {
                let h = raw(ix, iz), wet = raw.water, sea = raw.sea, beach = raw.beach; // (read before landAt: finding a site re-samples raw)
                const kind = raw.kind;
                const mesa = raw.mesa, emer = raw.emer, moon = raw.moon, fant = raw.fant;
                // (the Ice Castle's mountain: its peak, crags, the gorge, the ledge — IceCastle.shapeAt)
                fn.iceRock = false;
                if (ice) { const m = ice.shapeAt(ix, iz, h); if (ice.lifted) { h = m; wet = 0; sea = false; beach = false; fn.iceRock = true; } }
                const land = idx.landAt(ix, iz);
                fn.sea = sea; fn.beach = beach; fn.kind = kind;
                fn.mesa = mesa; fn.emer = emer; fn.moon = moon; fn.fant = fant;
                if (land && land.side === 'sea') {
                    // beyond a sea castle's quay: the sea (dug deep in the harbour)
                    const k = land.castle.port;
                    const d = Math.max(sea ? wet : 0, land.harbour ? k.depth : 0, 1);
                    fn.water = d; fn.sea = true; fn.beach = false;
                    return -d;
                }
                if (!land || (land.w < 1 && wet)) { fn.water = wet; return h; } // (rivers keep their banks)
                fn.water = 0; fn.sea = false;
                if (land.w >= 1) { fn.beach = false; fn.kind = KIND.LAND; }
                const F = land.castle.F;
                return land.w >= 1 ? F : Math.round(F + (h - F) * (1 - land.w));
            };
            fn.water = 0; fn.sea = false; fn.beach = false; fn.kind = KIND.LAND; fn.iceRock = false;
            fn.mesa = fn.emer = fn.moon = fn.fant = 0;
            this.heightAt = fn;
        } else this.heightAt = raw;
        // the other planets' surfaces: far regions of this same world, each by its own recipe (Planets.js)
        this.planets = this.planets && this.planets.seed === (seed | 0) ? this.planets : new PlanetRegistry(seed);
        const earthH = this.heightAt, planets = this.planets;
        if (mountains) {
            const fn = (ix, iz) => {
                if (ix >= SPACE.ZONE_X) {
                    const def = planets.bySlot(slotAt(ix, iz));
                    if (def) {
                        const h = planetHeight(def, ix, iz);
                        fn.water = planetHeight.water; fn.sea = false; fn.beach = false; fn.kind = KIND.LAND;
                        fn.mesa = fn.emer = fn.moon = fn.fant = 0;
                        return h;
                    }
                }
                const h = earthH(ix, iz);
                fn.water = earthH.water; fn.sea = earthH.sea; fn.beach = earthH.beach; fn.kind = earthH.kind;
                fn.mesa = earthH.mesa; fn.emer = earthH.emer; fn.moon = earthH.moon; fn.fant = earthH.fant;
                return h;
            };
            fn.water = 0; fn.sea = false; fn.beach = false; fn.kind = KIND.LAND;
            fn.mesa = fn.emer = fn.moon = fn.fant = 0;
            fn.land = earthH.land;
            this.heightAt = fn;
        }
        this._caves = new Map();
        this._lairs = new Map(); // (dragons' lairs high in the mountains: DragonLairs.js)
        this._isles = new Map(); // (generation 5: the floating islands)
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
        // (the far zone between the planets — where a hero in space is kept, Space.js: nothing at all
        //  there, one shared empty chunk, never kept: a flight there makes no ground)
        if (!c && cx >= ZONE_CX && this.mountains && !this.planetOfChunk(cx, cz)) return emptyChunk();
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

    /** The planet whose surface a chunk is on (or null: the Earth). */
    planetOfChunk(cx, cz) {
        const x = cx * CHUNK;
        if (x + CHUNK <= SPACE.ZONE_X || !this.planets || !this.mountains) return null;
        return this.planets.bySlot(slotAt(x + CHUNK / 2, cz * CHUNK + CHUNK / 2));
    }

    /** The planets changed (a guest got the host's, a planet was made or terraformed): the worker's copy too. */
    setPlanets(json) {
        this.planets?.applyJSON(json);
        // (chunks of the planets made before: by the old recipe — made again when asked)
        for (const [k, c] of this.chunks) if (c.planet && !c.modified) this.chunks.delete(k);
        this._last = null;
    }

    _generateChunk(cx, cz) {
        const planet = this.planetOfChunk(cx, cz);
        if (planet) return generatePlanetChunk(cx, cz, planet, this.bedrockTop ?? OLD_BEDROCK);
        if (this.lush) return this._generateLush(cx, cz);
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

    /**
     * Generation 5 (Landscape.js): the ground of a chunk by its slopes and heights — bare rock on
     * cliffs and steep slopes, snow above the snow line (lower in the cold), alpine grass high up,
     * the scarlet canyons' sand and striped rock; every column's colours (its grass,
     * its leaves' tint, its rock) kept in the chunk for the mesher (faceColor).
     */
    _generateLush(cx, cz) {
        const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
        const top = new Int16Array(CHUNK * CHUNK);
        const x0 = cx * CHUNK, z0 = cz * CHUNK;
        const H = this.heightAt, land = this.land;
        const bedrock = this.bedrockTop ?? OLD_BEDROCK;
        const P = CHUNK + 2;
        const hh = _lush.hh || (_lush.hh = new Int16Array(P * P));
        const cols = CHUNK * CHUNK;
        const grass = new Int32Array(cols), leaf = new Int32Array(cols), leafK = new Uint8Array(cols), mesa = new Uint8Array(cols), bio = new Uint8Array(cols);
        const snowL = new Int16Array(cols); // (the snow line of each column: the snowy crowns and the frost, faceColor)
        const flags = _lush.flags || (_lush.flags = new Uint8Array(cols)); // 1 water, 2 sea, 4 beach
        const kinds = _lush.kinds || (_lush.kinds = new Uint8Array(cols));
        const fx = _lush.fx, clim = _lush.clim, w = _lush.w, col3 = _lush.col3;
        const water = _lush.water || (_lush.water = new Int16Array(cols));
        const iceR = _lush.iceR || (_lush.iceR = new Uint8Array(cols)); // (the Ice Castle's mountain: bare rock)
        let seaMask = null;
        for (let pz = 0; pz < P; pz++) {
            for (let px = 0; px < P; px++) {
                const x = x0 + px - 1, z = z0 + pz - 1;
                const h = H(x, z);
                hh[pz * P + px] = h;
                if (px === 0 || pz === 0 || px === P - 1 || pz === P - 1) continue;
                const col = (pz - 1) * CHUNK + (px - 1);
                water[col] = H.water;
                iceR[col] = H.iceRock ? 1 : 0;
                flags[col] = (H.water ? 1 : 0) | (H.sea ? 2 : 0) | (H.beach ? 4 : 0);
                kinds[col] = H.kind || 0;
                fx.mesa = H.mesa || 0; fx.emer = H.emer || 0; fx.moon = H.moon || 0; fx.fant = H.fant || 0;
                land.climate(x, z, clim);
                const spawn = 1 - smoothstep(60, 260, Math.sqrt(x * x + z * z));
                bio[col] = land.biomes(clim, w, spawn, fx);
                land.colours(x, z, h, w, clim, col3);
                grass[col] = col3.grass; leaf[col] = col3.leaf; leafK[col] = Math.round(col3.leafK * 255); mesa[col] = Math.round(col3.mesa * 255);
                _lush.T[col] = clim.T;
            }
        }
        let maxTop = 0;
        for (let lz = 0; lz < CHUNK; lz++) {
            for (let lx = 0; lx < CHUNK; lx++) {
                const col = lz * CHUNK + lx, x = x0 + lx, z = z0 + lz;
                const i0 = (lz + 1) * P + (lx + 1), h = hh[i0];
                const f = flags[col], wet = water[col], sea = f & 2, beach = f & 4, kind = kinds[col];
                if (sea) (seaMask ||= new Uint8Array(cols))[col] = 1;
                const slope = Math.max(Math.abs(hh[i0 + 1] - h), Math.abs(hh[i0 - 1] - h), Math.abs(hh[i0 + P] - h), Math.abs(hh[i0 - P] - h));
                const r = hashLand(x, z, this.seed + 5);
                // the top block
                let surf = BLOCK.GRASS, soil = BLOCK.DIRT, deep = 3;
                const snow = land.snowLine(x, z, _lush.T[col]);
                snowL[col] = Math.round(snow);
                const m = mesa[col] / 255;
                if (iceR[col] || this.iceCastle?.rocky(x, z)) {
                    // the Ice Castle's peak: no grass up there — snow where it can lie, bare rock and scree on the crags
                    // (snow in drifts, not speckles: clumps of 4 m, on the gentle ground; the crags bare)
                    const patch = hashLand(x >> 2, z >> 2, this.seed + 91);
                    if (slope <= 1 || (slope === 2 && patch < 0.6) || (slope === 3 && patch < 0.2)) { surf = BLOCK.SNOW; soil = BLOCK.STONE; deep = 1; }
                    else { surf = patch > 0.85 ? BLOCK.GRAVEL : BLOCK.STONE; soil = BLOCK.STONE; deep = 0; }
                } else if (h >= snow - SNOW_BAND - 6 && snowAt(h, snow, hh, i0, P, slope, land.snowPatch(x, z), r)) { surf = BLOCK.SNOW; soil = slope >= 2 ? BLOCK.STONE : BLOCK.DIRT; deep = 2; }
                else if (kind === KIND.MESA && r < smoothstep(0.15, 0.5, m) * 1.1) { /* (at its edge the scarlet sand and the grass mingle) */ surf = slope >= 2 ? BLOCK.STONE : r < 0.12 * (1 - m) + 0.05 ? BLOCK.GRASS : BLOCK.SAND; soil = surf === BLOCK.SAND ? BLOCK.SAND : BLOCK.STONE; deep = 2; }
                else if (slope >= 3 || (slope >= 2 && h > 24)) { surf = r < 0.12 ? BLOCK.GRAVEL : BLOCK.STONE; soil = BLOCK.STONE; deep = 0; }
                else if (h > 36 && r < smoothstep(36, 60, h) * 0.55) { surf = r < 0.06 ? BLOCK.GRAVEL : BLOCK.STONE; soil = BLOCK.STONE; }
                for (let L = MIN_LAYER; L <= h; L++) {
                    let type;
                    if (L <= bedrock) type = BLOCK.BEDROCK;
                    else if (wet && L === h) type = BLOCK.SAND;
                    else if (sea && L >= h - 3) type = BLOCK.SAND; // the seabed
                    else if (L === h && beach) type = BLOCK.SAND; // the beach
                    else if (L === h) type = surf;
                    else if (L >= h - deep && L >= h - 3) type = soil;
                    else if (L >= -1 && L <= 1 && h <= 6) type = BLOCK.DIRT;
                    else type = BLOCK.STONE;
                    blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = type;
                }
                for (let L = h + 1; L <= h + wet; L++) blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = BLOCK.WATER;
                top[col] = h;
                if (h > maxTop) maxTop = h;
            }
        }
        let minOpen = MAX_LAYER;
        for (let i = 0; i < top.length; i++) if (top[i] + 1 < minOpen) minOpen = top[i] + 1;
        const c = { cx, cz, blocks, top, maxTop, modified: false, minOpen, sea: seaMask, grass, leaf, leafK, mesa, bio, snowL, wet: flags };
        this._carveCaves(c); this._buildCastles(c); this._plantLush(c); this._floatIslands(c);
        c.wet = undefined;
        return c;
    }

    /**
     * The kind of land (BIOMES index) at a column, worked out from the recipe (for a tree whose
     * crown reaches into a chunk from its neighbour: the same answer whichever chunk asks).
     */
    biomeAt(x, z) {
        const c = this.chunks.get(chunkKey(x >> SHIFT, z >> SHIFT));
        if (c && c.bio) return c.bio[(z & MASK) * CHUNK + (x & MASK)];
        const H = this.heightAt, land = this.land;
        H(x, z);
        const fx = _lush.fx2;
        fx.mesa = H.mesa || 0; fx.emer = H.emer || 0; fx.moon = H.moon || 0; fx.fant = H.fant || 0;
        land.climate(x, z, _lush.clim2);
        return land.biomes(_lush.clim2, _lush.w2, 1 - smoothstep(60, 260, Math.sqrt(x * x + z * z)), fx);
    }

    /**
     * Generation 5: trees by the kind of land — forests, groves and clearings, single trees on the
     * meadows, autumn birches, pink cherries, spruces up the cold slopes. Only on ground that holds
     * the trunk (a 2×2 trunk on four columns of one height; the ground round it a step at most).
     */
    _plantLush(c) {
        const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK, C = 7;
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
        const H = this.heightAt, grove = this.land.grove;
        for (let gz = Math.floor((z0 - 5) / C); gz <= Math.floor((z0 + CHUNK + 4) / C); gz++) {
            for (let gx = Math.floor((x0 - 5) / C); gx <= Math.floor((x0 + CHUNK + 4) / C); gx++) {
                const tx = gx * C + 1 + Math.floor(hashLand(gz, gx, this.seed + 7) * (C - 2));
                const tz = gz * C + 1 + Math.floor(hashLand(gx + 911, gz - 37, this.seed + 8) * (C - 2));
                if (tx * tx + tz * tz < TREE_MIN_DIST * TREE_MIN_DIST) continue;
                const roll = hashLand(gx, gz, this.seed + 9);
                if (roll > 0.7) continue; // (cheap first: most cells hold no tree)
                const b = BIOMES[this.biomeAt(tx, tz)];
                if (roll > b.trees * grove(tx, tz)) continue;
                const h = H(tx, tz);
                if (h < 1 || H.water || H.beach || H.kind === KIND.MESA || H.iceRock) continue; // (the Ice Castle's mountain: bare rock)
                const kind = b.kinds[Math.floor(hashLand(gx * 3 + 1, gz * 5 + 2, this.seed + 13) * b.kinds.length)];
                if (h > LUSH.TREE_LINE + (kind === 2 ? 8 : 0)) continue;
                if (this.seas && this.seas.signedDist(tx, tz) > -SEA.BEACH - 6) continue;
                if (this.iceCastle?.rocky(tx, tz)) continue; // (the Ice Castle's peak: bare rock)
                if (this.sites && (this.sites.landAt(tx, tz) || this.sites.landAt(tx + 1, tz + 1))) continue;
                const wide = kind === 0 || kind === 4; // (oak and dark oak: a 2×2 trunk)
                let ok = true;
                for (let dz = -1; dz <= 2 && ok; dz++) for (let dx = -1; dx <= 2; dx++) {
                    const trunk = dx >= 0 && dz >= 0 && (wide ? dx <= 1 && dz <= 1 : dx === 0 && dz === 0);
                    const g = H(tx + dx, tz + dz);
                    if (H.water || (trunk ? g !== h : Math.abs(g - h) > 1)) { ok = false; break; }
                }
                if (!ok) continue;
                // (on grass: not in the snow, nor on the bare rock high up — the same rules as the
                // ground's, worked out from the recipe so every chunk the crown reaches agrees)
                if (h >= this.land.snowLine(tx, tz, this.land.climate(tx, tz, _lush.clim2).T) - 1) continue;
                if (h > 36 && hashLand(tx, tz, this.seed + 5) < smoothstep(36, 60, h) * 0.55) continue;
                this._tree(put, tx, tz, h, kind);
            }
        }
    }

    /**
     * Generation 5: the floating island of an island cell (or null) — mostly over the fantastic
     * lands, now and then anywhere far from the spawn; never over a castle, a village or a tower,
     * always high above the ground under it (a mountain never touches it). A main island and up to
     * two small ones beside it: grass on top, earth, then rock tapering down to a point.
     */
    islandOf(gx, gz) {
        if (!this.lush || offEarth((gx + 1) * ISLE.CELL)) return null; // (none over other planets)
        const m = this._isles || (this._isles = new Map());
        const key = gx * 100003 + gz;
        if (m.has(key)) return m.get(key);
        let isle = null;
        const S = this.seed, C = ISLE.CELL, H = this.heightAt;
        const x = Math.round((gx + 0.2 + 0.6 * hashLand(gx, gz, S + 301)) * C), z = Math.round((gz + 0.2 + 0.6 * hashLand(gz, gx, S + 302)) * C);
        if (x * x + z * z >= LUSH.ISLE_MIN * LUSH.ISLE_MIN) {
            H(x, z);
            const chance = 0.025 + 0.55 * ((H.moon || 0) + (H.emer || 0)) + 0.15 * (H.mesa || 0);
            const R = ISLE.R_MIN + Math.floor(hashLand(gx + 5, gz - 2, S + 303) * (ISLE.R_MAX - ISLE.R_MIN + 1));
            if (hashLand(gx - 9, gz + 4, S + 304) < chance && !(this.sites && this.sites.near(x, z, R * 2 + 40).length)) {
                // the highest ground under it and round it
                let g = 0;
                for (let k = 0; k < 13; k++) {
                    const a = k === 12 ? 0 : (k * TAU) / 12, rr = k === 12 ? 0 : R * 2.2;
                    g = Math.max(g, H(Math.round(x + Math.cos(a) * rr), Math.round(z + Math.sin(a) * rr)));
                }
                const Y = Math.min(Math.max(g + 24, 44) + Math.floor(hashLand(gx + 3, gz + 8, S + 305) * 22), MAX_LAYER - 16);
                if (Y - g >= 18) {
                    const parts = [{ x, z, r: R, Y }];
                    const n = Math.floor(hashLand(gx - 4, gz - 6, S + 306) * 3);
                    for (let k = 0; k < n; k++) {
                        const a = hashLand(gx + k, gz - k, S + 307) * TAU, d = R * (1.45 + 0.5 * hashLand(gx - k, gz + k, S + 308));
                        parts.push({ x: Math.round(x + Math.cos(a) * d), z: Math.round(z + Math.sin(a) * d), r: Math.max(3, Math.round(R * (0.3 + 0.2 * hashLand(k, gx, S + 309)))), Y: Y + Math.floor(hashLand(gz, k, S + 310) * 9) - 4 });
                    }
                    const reach = R * 2.6 + 6;
                    isle = { id: 'isle' + gx + '_' + gz, x, z, R, Y, parts, x0: x - reach, x1: x + reach, z0: z - reach, z1: z + reach, tree: R >= 8 };
                }
            }
        }
        m.set(key, isle);
        return isle;
    }

    /** The floating islands reaching within `r` of a point. */
    islandsNear(x, z, r) {
        const out = [];
        if (!this.lush || offEarth(x + r)) return out;
        const C = ISLE.CELL, R = r + ISLE.R_MAX * 2.6 + 6;
        for (let gz = Math.floor((z - R) / C); gz <= Math.floor((z + R) / C); gz++) {
            for (let gx = Math.floor((x - R) / C); gx <= Math.floor((x + R) / C); gx++) {
                const s = this.islandOf(gx, gz);
                if (s && x + r >= s.x0 && x - r <= s.x1 && z + r >= s.z0 && z - r <= s.z1) out.push(s);
            }
        }
        return out;
    }

    /** The highest thing at a column from the recipe: the ground or a floating island over it (fliers fly above). */
    skyTopAt(ix, iz) {
        let y = this.heightAt(ix, iz);
        if (this.lush) for (const s of this.islandsNear(ix, iz, 0)) for (const p of s.parts) {
            const dx = ix - p.x, dz = iz - p.z;
            if (dx * dx + dz * dz <= p.r * p.r * 1.6) y = Math.max(y, p.Y + 14); // (+ a tree on it)
        }
        return y;
    }

    /** The column of an island part at (x, z): [top, bottom] layers, or null (not under it). */
    _isleColumn(p, x, z) {
        const dx = x - p.x, dz = z - p.z;
        const wob = this.land.wobble(x, z);
        const rr = p.r * (1 + 0.2 * wob);
        const d2 = (dx * dx + dz * dz) / (rr * rr);
        if (d2 >= 1) return null;
        const k = 1 - d2;
        const topL = p.Y + Math.round(1.6 * k + 0.8 * wob);
        // the rock under it hangs down to a point (and a few spikes of rock lower still)
        const spike = hashLand(x >> 1, z >> 1, this.seed + 320) < 0.12 ? 2 + Math.floor(hashLand(x, z, this.seed + 321) * 4) : 0;
        const depth = 1 + Math.round(p.r * 1.15 * k * Math.sqrt(k) * (0.8 + 0.25 * this.land.wobble(z + 40, x - 40)) + spike * k);
        return [topL, topL - depth];
    }

    /** Generation 5: the floating islands' blocks in a chunk (and their trees). */
    _floatIslands(c) {
        const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
        const isles = this.islandsNear(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK * 0.75);
        if (!isles.length) return;
        const B = c.blocks;
        let bot = null;
        const lineAt = (x, z) => this.land.snowLine(x, z, this.land.climate(x, z, _lush.clim2).T);
        for (const s of isles) {
            for (const p of s.parts) {
                const ax = Math.max(x0, p.x - p.r * 1.3 - 1), bx = Math.min(x0 + CHUNK - 1, p.x + p.r * 1.3 + 1);
                const az = Math.max(z0, p.z - p.r * 1.3 - 1), bz = Math.min(z0 + CHUNK - 1, p.z + p.r * 1.3 + 1);
                if (ax > bx || az > bz) continue;
                const snow = p.Y >= lineAt(p.x, p.z);
                for (let z = Math.ceil(az); z <= bz; z++) for (let x = Math.ceil(ax); x <= bx; x++) {
                    const cl = this._isleColumn(p, x, z);
                    if (!cl) continue;
                    const [t, b] = cl;
                    const lx = x - x0, lz = z - z0, col = lz * CHUNK + lx;
                    for (let L = Math.max(b, MIN_LAYER + 1); L <= Math.min(t, MAX_LAYER); L++) {
                        B[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = L === t ? (snow ? BLOCK.SNOW : BLOCK.GRASS) : L >= t - 2 ? BLOCK.DIRT : BLOCK.STONE;
                    }
                    if (!bot) { bot = new Int16Array(CHUNK * CHUNK); bot.fill(32767); }
                    if (b < bot[col]) bot[col] = b;
                    if (t > c.top[col]) c.top[col] = t;
                    if (t > c.maxTop) c.maxTop = t;
                }
            }
            // a tree on the main island (its trunk on the island's middle)
            if (s.tree) {
                const p = s.parts[0], cl = this._isleColumn(p, p.x, p.z);
                if (cl && !(p.Y >= lineAt(p.x, p.z))) {
                    const b = BIOMES[this.biomeAt(p.x, p.z)];
                    const kinds = b.kinds.filter((k) => k !== 0 && k !== 4); // (a one-column trunk: the island's top is not quite flat)
                    const kind = kinds.length ? kinds[Math.floor(hashLand(p.x, p.z, this.seed + 330) * kinds.length)] : 1;
                    const put = (x, L, z, type, onlyAir) => {
                        const lx = x - x0, lz = z - z0;
                        if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || L > MAX_LAYER) return;
                        const i = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
                        if (onlyAir && B[i] !== BLOCK.AIR) return;
                        B[i] = type;
                        const col = lz * CHUNK + lx;
                        if (L > c.top[col]) c.top[col] = L;
                        if (L > c.maxTop) c.maxTop = L;
                    };
                    this._tree(put, p.x, p.z, cl[0], kind);
                }
            }
        }
        if (bot) { c.isleBot = bot; c.isle = true; }
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
                        if (t === BLOCK.AIR) hollowAt(c, col, L1); // (rooms: hollows under a roof)
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
        if (offEarth((gx + 1) * CAVE_CELL)) return null; // (the Earth's caves: never on other planets)
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
        } else {
            const h = hash01(gx * 7 + 3, gz * 13 + 5, this.seed + 101);
            if (h < CAVES.CHANCE) {
                const rng = createRng(((this.seed * 7919) ^ Math.imul(gx, 104729) ^ Math.imul(gz, 1299709) ^ 0xca7e) >>> 0);
                const m = caveMouth(rng, gx, gz, CAVE_CELL, top, blocked);
                if (m) s = growCaveSystem({ id: 'cv' + gx + '_' + gz, rng, start: m, H: top, blocked });
            } else if (h < CAVES.CHANCE + CAVES.HILL_CHANCE) {
                // (more caves: their mouths in a hillside — the ones before stay as they were)
                const rng = createRng(((this.seed * 7919) ^ Math.imul(gx, 104729) ^ Math.imul(gz, 1299709) ^ 0x4177) >>> 0);
                const m = hillMouth(rng, gx, gz, CAVE_CELL, top, blocked);
                if (m) s = growCaveSystem({ id: 'cvh' + gx + '_' + gz, rng, start: m, H: top, blocked });
            }
            // («caves 30 % more often» — the author): a cell left without one tries again — a hillside
            // first, else any mouth (the caves before stay as they were)
            if (!s && hash01(gx * 11 + 5, gz * 3 + 9, this.seed + 505) < CAVES.MORE_CHANCE) {
                const rng = createRng(((this.seed * 7919) ^ Math.imul(gx, 104729) ^ Math.imul(gz, 1299709) ^ 0x6a5e) >>> 0);
                const m = hillMouth(rng, gx, gz, CAVE_CELL, top, blocked) || caveMouth(rng, gx, gz, CAVE_CELL, top, blocked);
                if (m) s = growCaveSystem({ id: 'cvm' + gx + '_' + gz, rng, start: m, H: top, blocked });
            }
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

    /**
     * Generation 4: the dragons' lair of a lair cell (or null) — a huge cave high in a big mountain,
     * with a huge mouth in its side (DragonLairs.js).
     */
    lairOf(gx, gz) {
        if (!this.deepCaves || offEarth((gx + 1) * LAIR.CELL)) return null;
        const key = gx * 100003 + gz;
        const m = this._lairs || (this._lairs = new Map());
        if (m.has(key)) return m.get(key);
        const H = this.heightAt;
        const top = (x, z) => H(Math.round(x), Math.round(z));
        const blocked = (x, z) => { const ix = Math.round(x), iz = Math.round(z); H(ix, iz); return !!(H.water || H.sea || this.sites?.landAt(ix, iz)); };
        const s = lairOf(gx, gz, this.seed, top, blocked);
        m.set(key, s);
        return s;
    }

    /** The dragons' lairs whose hall or mouth is within `r` of a point (their systems; `.lair` is the lair). */
    lairsNear(x, z, r) {
        const out = [];
        if (!this.deepCaves || offEarth(x + r)) return out;
        const C = LAIR.CELL;
        for (let gz = Math.floor((z - r) / C); gz <= Math.floor((z + r) / C); gz++) {
            for (let gx = Math.floor((x - r) / C); gx <= Math.floor((x + r) / C); gx++) {
                const s = this.lairOf(gx, gz);
                if (s && Math.hypot(Math.max(s.x0 - x, 0, x - s.x1), Math.max(s.z0 - z, 0, z - s.z1)) <= r) out.push(s);
            }
        }
        return out;
    }

    /** Caves whose chamber (generation 4: any part of the system) is within `r` of a point. */
    cavesNear(x, z, r) {
        const out = [];
        if (offEarth(x + r)) return out;
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
        // (the dragons' lairs reaching into it: a great hall and its huge mouth)
        for (const s of this.lairsNear(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK)) {
            if (s.x1 >= x0 - 1 && s.x0 <= x0 + CHUNK && s.z1 >= z0 - 1 && s.z0 <= z0 + CHUNK) sys.push(systemIn(s, x0, z0, x0 + CHUNK - 1, z0 + CHUNK - 1));
        }
        if (!sys.length) return;
        const H = this.heightAt;
        for (let lz = 0; lz < CHUNK; lz++) {
            for (let lx = 0; lx < CHUNK; lx++) {
                const x = x0 + lx, z = z0 + lz;
                const col = lz * CHUNK + lx;
                if (c.wet) { if (c.wet[col] & 3) continue; } // (generation 5: the flags the ground was made with)
                else { H(x, z); if (H.water || H.sea) continue; }
                if (this.sites?.landAt(x, z)) continue;
                const top0 = c.top[col];
                let carved = false, hiCut = MIN_LAYER;
                let extra = null;
                const cut = (L0, L1, open, more) => {
                    if (more) { (extra || (extra = [])).push(L0, L1); return; } // (the higher roof: after all, below)
                    const hi = Math.min(L1, open ? top0 : top0 - CAVES.ROOF);
                    for (let L = Math.max(L0, MIN_LAYER + 1); L <= hi; L++) {
                        const i = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
                        const b = c.blocks[i];
                        if (b !== BLOCK.WATER && b !== BLOCK.BEDROCK && b !== BLOCK.AIR) { c.blocks[i] = BLOCK.AIR; carved = true; if (L < c.minOpen) c.minOpen = L; if (L > hiCut) hiCut = L; }
                    }
                };
                // (where systems cross, a chamber's floor stays whole under the other's tunnels too)
                let keep = -Infinity;
                if (sys.length > 1) for (const s of sys) keep = Math.max(keep, chamberFloor(s, x, z));
                for (const s of sys) carveColumn(s, x, z, cut, keep);
                // the higher roofs (CAVES.UP…): only where ROOF layers of rock stay over them — never into
                // another cave's mouth above, the open air or water (whatever order the caves come in)
                if (extra) for (let i = 0; i < extra.length; i += 2) {
                    let hi = extra[i + 1];
                    for (let L = extra[i]; L <= Math.min(extra[i + 1] + CAVES.ROOF, top0); L++) {
                        const b = c.blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx];
                        if (b === BLOCK.AIR || b === BLOCK.WATER) { hi = Math.min(hi, L - CAVES.ROOF - 1); break; }
                    }
                    if (hi >= extra[i]) cut(extra[i], hi, false);
                }
                if (carved) { (this._walls || (this._walls = [])).push(col); c.caved = true; hollowAt(c, col, hiCut); } // (its sky light: _skyLight)
                if (carved) {
                    let top = MIN_LAYER - 1;
                    for (let L = c.top[col]; L >= MIN_LAYER; L--) {
                        const b = c.blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx];
                        if (b !== BLOCK.AIR && b !== BLOCK.WATER) { top = L; break; }
                    }
                    c.top[col] = top;
                }
                // round a mouth: bare stone and scree instead of grass — the way in is seen from afar
                for (const s of sys) {
                    const m = s.start;
                    if (!m || s.lair || Math.hypot(x - m.x, z - m.z) > CAVES.APRON) continue;
                    const L = c.top[col], i = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
                    if (Math.abs(L - m.ground) > 4 || (c.blocks[i] !== BLOCK.GRASS && c.blocks[i] !== BLOCK.DIRT && c.blocks[i] !== BLOCK.SNOW)) continue;
                    c.blocks[i] = noise3(x / 2, L, z / 2, this.seed + 33) > 0.1 ? BLOCK.GRAVEL : BLOCK.STONE;
                    break;
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
                // (from just under the chunk's lowest hollow: all rock below touches no air)
                for (let L = Math.max(MIN_LAYER + 1, c.minOpen - 1); L < top - 2; L++) {
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
                        if (c.blocks[i] !== BLOCK.WATER) { c.blocks[i] = BLOCK.AIR; carved = true; if (L < c.minOpen) c.minOpen = L; hollowAt(c, col, L); }
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
            // (the bend is a step up and over, face to face — not corner to corner, which left a gap — and the
            // trunk goes on into the crown; only blocks under the crown's top are added: old worlds' heights stay)
            for (let L = h + 1; L <= h + 6; L++) put(tx + (L > h + 3 ? 1 : 0), L, tz, wood, false);
            put(tx + 1, h + 3, tz, wood, false);
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
        // (a gift of the gods — the Temple of the Gods' ground: no spell breaks or changes a block of it)
        if (this.godGiftAt && this.godGiftAt(ix, L, iz) && this.get(ix, L, iz) !== BLOCK.AIR) return;
        const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        if (c.empty) return; // (nothing is built in the empty zone between the planets)
        c.blocks[((L - MIN_LAYER) * CHUNK + (iz & MASK)) * CHUNK + (ix & MASK)] = type;
        c.modified = true;
        if (!drawn(type) && L < c.minOpen) c.minOpen = L;
        if (type !== BLOCK.AIR && L > c.maxTop) c.maxTop = L;
        if (type === BLOCK.ICE) this.version++;
        const col = (iz & MASK) * CHUNK + (ix & MASK), before = c.top[col];
        // (the column's top kept as it goes — not looked for from the sky down at every block: a ruin or a
        // house of thousands of blocks spent most of its time there)
        if (type !== BLOCK.AIR && type !== BLOCK.WATER) { if (L > before) c.top[col] = L; }
        else if (L === before) {
            let l = L - 1;
            while (l >= MIN_LAYER) { const b = c.blocks[((l - MIN_LAYER) * CHUNK + (iz & MASK)) * CHUNK + (ix & MASK)]; if (b !== BLOCK.AIR && b !== BLOCK.WATER) break; l--; }
            c.top[col] = l >= MIN_LAYER ? l : MIN_LAYER - 1;
        }
        // (a hollow: air let in under the top, or a roof put over the air)
        if (!drawn(type)) hollowAt(c, col, L);
        else if (c.top[col] > before + 1) hollowAt(c, col, c.top[col] - 1);
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
        const key = chunkKey(cx, cz), c = this.chunks.get(key);
        if (c) c.ver = (c.ver || 0) + 1; // (its blocks changed: the workers get it again — TerrainView._share)
        this.dirtyChunks.add(key);
        // Faces on chunk borders depend on the neighbour chunk too.
        const lx = ix & MASK, lz = iz & MASK;
        if (lx === 0) this.dirtyChunks.add(chunkKey(cx - 1, cz));
        if (lx === MASK) this.dirtyChunks.add(chunkKey(cx + 1, cz));
        if (lz === 0) this.dirtyChunks.add(chunkKey(cx, cz - 1));
        if (lz === MASK) this.dirtyChunks.add(chunkKey(cx, cz + 1));
        if (this.mapDirty.size < 64) this.mapDirty.add(chunkKey(cx, cz));
        this.version++;
    }

    /** Highest solid layer in a column (MIN_LAYER-1 if the column is empty). */
    topLayer(ix, iz) {
        const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        return c.top[(iz & MASK) * CHUNK + (ix & MASK)];
    }

    /** Is the top of this column a floating island (generation 5)? (Herds and zombies are not set down there.) */
    isIsland(ix, iz) {
        const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        if (!c.isleBot) return false;
        const col = (iz & MASK) * CHUNK + (ix & MASK);
        return c.isleBot[col] < 32767 && c.top[col] >= c.isleBot[col];
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
        // (the Ice Queen's palace: its dense ice breaks only in the heart of the blast — PALACE_ICE; the gods' «Бум»
        // carves with carveColumn, as through anything)
        const ip = this.iceCastle?.plan;
        const dense = ip && cx + radius >= ip.x0 && cx - radius <= ip.x1 && cz + radius >= ip.z0 && cz - radius <= ip.z1 ? ip : null;
        const d2 = r2 * PALACE_ICE.BLAST * PALACE_ICE.BLAST;
        for (let iz = z0; iz <= z1; iz++) {
            for (let ix = x0; ix <= x1; ix++) {
                const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
                const lx = ix & MASK, lz = iz & MASK;
                let touched = false;
                for (let L = L0; L <= L1; L++) {
                    const by = L - 1.0; // block centre y
                    const dx = ix - cx, dy = by - cy, dz = iz - cz;
                    const dd = dx * dx + dy * dy + dz * dz;
                    if (dd > r2) continue;
                    const idx = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
                    const type = c.blocks[idx];
                    if (type === BLOCK.AIR || type === BLOCK.BEDROCK || type === BLOCK.WATER) continue;
                    if (dense && dd > d2 && isPalaceIce(type) && inIcePalace(dense, ix, iz)) continue;
                    if (keep && keep(ix, by, iz)) continue; // (inside a house's sphere of protection)
                    if (this.godGiftAt && this.godGiftAt(ix, by, iz)) continue; // (a gift of the gods: the temple's ground)
                    c.blocks[idx] = BLOCK.AIR;
                    if (L < c.minOpen) c.minOpen = L;
                    hollowAt(c, lz * CHUNK + lx, L);
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

    /**
     * «Бум» (BoomCarve.js): one column of its crater — every block above `floorY` (a block's centre y) goes,
     * from the column's top down; bedrock, water and the gods' ground stay. `wet` gets [x, L, z] of the cells
     * opened at or under the sea's level (L ≤ 0) — the water may come in there. @returns how many went.
     */
    carveColumn(ix, iz, floorY, wet = null) {
        const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        if (c.empty) return 0;
        const lx = ix & MASK, lz = iz & MASK, col = lz * CHUNK + lx;
        const L0 = Math.max(MIN_LAYER + 1, Math.floor(floorY) + 2); // (centre y = L − 1 > floorY)
        let n = 0;
        for (let L = Math.min(MAX_LAYER, c.top[col]); L >= L0; L--) {
            const idx = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
            const t = c.blocks[idx];
            if (t === BLOCK.AIR || t === BLOCK.BEDROCK || (t === BLOCK.WATER && L <= 0)) continue; // (the sea's water stays: it pours in)
            if (this.godGiftAt && this.godGiftAt(ix, L - 1, iz)) continue; // (a gift of the gods: the temple's ground)
            c.blocks[idx] = BLOCK.AIR; // (a river's or a lake's water over the sea's level goes with the ground under it — none left hanging)
            if (L < c.minOpen) c.minOpen = L;
            if (wet && L <= 0) wet.push(ix, L, iz);
            n++;
        }
        if (n) {
            c.modified = true;
            this._refreshTop(c, lx, lz);
            if (c.top[col] >= L0) hollowAt(c, col, c.top[col]); // (the gods' ground left over the air)
            this._markDirty(ix, iz);
        }
        return n;
    }

    /** Water into an open cell (a flood: «Бум»'s crater under the sea's level); `sea`: the sea's own water (its column
     * marked as sea: the waving sea surface is drawn there, not a lake's flat top — skipSeaTop). */
    fillWater(ix, L, iz, sea = false) {
        if (L < MIN_LAYER || L > MAX_LAYER) return;
        const c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        if (c.empty) return;
        c.blocks[((L - MIN_LAYER) * CHUNK + (iz & MASK)) * CHUNK + (ix & MASK)] = BLOCK.WATER;
        if (sea && L <= 0) (c.sea || (c.sea = new Uint8Array(CHUNK * CHUNK)))[(iz & MASK) * CHUNK + (ix & MASK)] = 1;
        c.modified = true;
        if (L < c.minOpen) c.minOpen = L;
        this._markDirty(ix, iz);
    }

    /**
     * Holes dug next to / under water fill with water (up to the water level), all the way
     * through the hole (not only its cells beside the water). Returns the cells filled.
     */
    _flood(cells) {
        const W = BLOCK.WATER, filled = [];
        for (let pass = 0; pass < 64; pass++) {
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
                    filled.push([ix, L, iz]);
                    changed = true;
                }
            }
            if (!changed) break;
        }
        return filled;
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

    /**
     * Generation 5: a face's colour by the kind of land under it (−1: as in every world) — the
     * grass of its place (Landscape.colours, kept per column), the leaves' tint (autumn, the
     * moonlit groves…), the scarlet lands' striped rock and their sand.
     */
    _lushColour(type, ix, L, iz, isTop) {
        let c = this._meshChunk;
        if (!c || c.cx !== ix >> SHIFT || c.cz !== iz >> SHIFT) c = this.chunk(ix >> SHIFT, iz >> SHIFT);
        if (!c.grass) return -1;
        const col = (iz & MASK) * CHUNK + (ix & MASK);
        if (type === BLOCK.GRASS) {
            // (in steps of 4: a meadow of one colour is still one big quad; the shader's own
            // flecks and patches hide the steps; a side face carries the grass colour too — the
            // shader draws earth under a fringe of grass hanging over the edge)
            const g = c.grass[col];
            return ((((g >> 16) & 255) >> 2) << 18) | ((((g >> 8) & 255) >> 2) << 10) | (((g & 255) >> 2) << 2);
        }
        // under the snow line: snow on the crowns' tops (the spruces up the slopes) and a thin frost
        // of snow on the bare rock and the grass in patches — more of it the higher (as the patches
        // of snow blocks, snowAt; a block of snow itself is drawn as snow)
        if (isTop && c.snowL && (isLeaves(type) || type === BLOCK.STONE || type === BLOCK.GRAVEL || type === BLOCK.GRASS)) {
            const d = L - c.snowL[col];
            if (d > -SNOW_BAND - 6) {
                const k = Math.min(1, (d + SNOW_BAND + 6) / (SNOW_BAND + 4));
                let hsh = ((ix >> (isLeaves(type) ? 0 : 1)) * 73856093) ^ (L * 19349663) ^ ((iz >> (isLeaves(type) ? 0 : 1)) * 83492791);
                hsh = ((hsh ^ (hsh >>> 13)) >>> 0) % 1000 / 1000;
                if (hsh < k * (isLeaves(type) ? 0.85 : 0.45)) return this._jitter(isLeaves(type) ? SNOW_CAP : FROST, ix, L, iz, true, BLOCK.SNOW);
            }
        }
        if (isLeaves(type)) {
            const k = c.leafK[col];
            if (!k) return -1;
            const shade = this._shade(type, ix, L, iz), base = BASE_COLORS[type];
            const lum = (v) => ((v >> 16) & 255) * 0.3 + ((v >> 8) & 255) * 0.59 + (v & 255) * 0.11;
            const rel = lum(shade) / Math.max(1, lum(base)), t = c.leaf[col];
            const tinted = (Math.min(255, Math.round(((t >> 16) & 255) * rel)) << 16) | (Math.min(255, Math.round(((t >> 8) & 255) * rel)) << 8) | Math.min(255, Math.round((t & 255) * rel));
            return mixColour(shade, tinted, Math.round((k / 255) * 4) / 4);
        }
        const m = c.mesa[col];
        if (m > 40 && (type === BLOCK.STONE || type === BLOCK.SAND)) {
            const k = Math.round((m / 255) * 4) / 4; // (a few steps: the stripes still merge along a wall)
            if (type === BLOCK.STONE) return this._jitter(mesaRock(L, k, BASE_COLORS[BLOCK.STONE]), ix, L, iz, isTop, type);
            return this._jitter(mixColour(BASE_COLORS[BLOCK.SAND], MESA_SAND_COLOUR, k), ix, L, iz, isTop, type);
        }
        return -1;
    }

    /** One of a tree kind's shades (a few per kind so crowns and trunks don't look like plastic boxes). */
    _shade(type, ix, L, iz) {
        let k = ((ix >> 1) * 73856093) ^ (((L) >> 1) * 19349663) ^ ((iz >> 1) * 83492791);
        if (type === BLOCK.BIRCH) k = (ix * 73856093) ^ (L * 19349663) ^ (iz * 83492791); // birch: small dark marks
        k = ((k ^ (k >>> 13)) >>> 0) % 5;
        return SHADES[type][k];
    }

    /** A small brightness jitter: tops per 2×2 patch, sides per layer (rock strata; greedy meshing still merges runs). */
    _jitter(base, ix, L, iz, isTop, type) {
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

    /** Colour of a block face (deterministic per-block variation on mountains). */
    faceColor(type, ix, L, iz, isTop) {
        if (type >= BLOCK.REGOLITH && type <= BLOCK.PLANET_LEAF) return planetFaceColor(this.planets?.bySlot(slotAt(ix, iz)), type, ix, L, iz, isTop);
        if (this.lush) { const v = this._lushColour(type, ix, L, iz, isTop); if (v >= 0) return v; }
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
            // (houses and castles — and the houses made by magic, HouseMagic.js: their rooms as they are, whether
            // the chunk has caves or only its neighbour has: a house beside a cave is no cave)
            if ((k.caved || k.hollow) && (this.sites?.landAt(wx, wz) || this.litLand?.(wx, wz))) top = MIN_LAYER - 1;
            else if (k.isleBot && k.isleBot[(wz & MASK) * CHUNK + (wx & MASK)] < 32767) top = this._underIsle(k, wx & MASK, wz & MASK); // (under a floating island: the open sky)
            else if (top > MIN_LAYER && isTree(k.blocks[((top - MIN_LAYER) * CHUNK + (wz & MASK)) * CHUNK + (wx & MASK)])) {
                // (a tree's crown is no cave's roof: the daylight comes through the leaves to the ground)
                const kb = k.blocks, cb = (wz & MASK) * CHUNK + (wx & MASK);
                while (top > MIN_LAYER) { const b = kb[(top - MIN_LAYER) * CHUNK * CHUNK + cb]; if (b !== BLOCK.AIR && !isTree(b)) break; top--; }
            }
            tops[rz * RW + rx] = top;
            if (top > maxTop) maxTop = top;
        }
        // open: at or above the column's top, and light passes there (air, water)
        const open = (rx, L, rz) => { const t = tops[rz * RW + rx]; return L > t || (L === t && !drawn(blockAt(rx, L, rz))); };
        const DX = _SKY_DX, DY = _SKY_DY, DZ = _SKY_DZ;
        let tail = 0;
        // the hollows' cells next to the open air get the daylight
        for (let rz = 0; rz < RW; rz++) for (let rx = 0; rx < RW; rx++) {
            const wx = x0 + rx, wz = z0 + rz;
            const k = chunks[((wz >> SHIFT) - cz + 1) * 3 + ((wx >> SHIFT) - cx + 1)];
            if (!k.caved && !k.hollow) continue; // (no hollows there; a roof put over the air — eaves, a porch — is one)
            const top = tops[rz * RW + rx];
            const kb = k.blocks, cb = (wz & MASK) * CHUNK + (wx & MASK);
            // (only where hollows may be: above the chunk's lowest open layer, up to the column's highest
            // hollow — the solid rock of a tall mountain is not walked through layer by layer)
            const hi = k.hollow ? Math.min(top - 1, k.hollow[cb]) : top - 1;
            for (let L = Math.max(MIN_LAYER + 1, k.minOpen ?? MIN_LAYER); L <= hi; L++) {
                const t = kb[(L - MIN_LAYER) * CHUNK * CHUNK + cb];
                if (t !== BLOCK.AIR && t !== BLOCK.WATER && t !== BLOCK.ICE_SHAPE) continue; // (rock: drawn)
                const lit = (rx + 1 < RW && open(rx + 1, L, rz)) || (rx > 0 && open(rx - 1, L, rz)) || open(rx, L + 1, rz) || open(rx, L - 1, rz) ||
                    (rz + 1 < RW && open(rx, L, rz + 1)) || (rz > 0 && open(rx, L, rz - 1));
                if (lit) { const i = ((L - MIN_LAYER) * RW + rz) * RW + rx; light[i] = 14; queue[tail++] = i; }
            }
        }
        // …and it spreads into them, one less a block
        for (let head = 0; head < tail; head++) {
            const i = queue[head], v = light[i];
            if (v <= 1) continue;
            const rx = i % RW, rz = ((i - rx) / RW) % RW, L = Math.floor(i / (RW * RW)) + MIN_LAYER;
            for (let q = 0; q < 6; q++) {
                const nx = rx + DX[q], nz = rz + DZ[q], nL = L + DY[q];
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
        const Lmax = Math.min(MAX_LAYER, maxTop);
        for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
            const rx = lx + P, rz = lz + P, t = tops[rz * RW + rx];
            for (let L = MIN_LAYER; L <= Lmax; L++) {
                own[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = L <= MIN_LAYER || L >= t ? 0 : 15 - light[((L - MIN_LAYER) * RW + rz) * RW + rx];
            }
        }
        c.sky = own;
        return dark;
    }

    /** The ground's top under a floating island's column (the island's rock is not a cave's roof). */
    _underIsle(c, lx, lz) {
        const col = lz * CHUNK + lx;
        for (let L = Math.min(c.isleBot[col], c.top[col] + 1) - 1; L >= MIN_LAYER; L--) {
            const b = c.blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx];
            if (b !== BLOCK.AIR && b !== BLOCK.WATER) return L;
        }
        return MIN_LAYER - 1;
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
        const out = { ground: newBuffers(0), raised: newBuffers(1), water: newBuffers(2) };
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
        // (a terraformed planet's seas and lakes: its own colour — PlanetMagic.js; the Earth's water elsewhere)
        const pdef = c.planet ? this.planets?.get(c.planet) : null;
        const WATER_COL = pdef?.terraformed && pdef.ground?.sea != null ? pdef.ground.sea : BASE_COLORS[BLOCK.WATER];
        const SEA_WATER_COL = pdef ? WATER_COL : SEA_WATER; // (the sea's water seen from the side: the sea surface's colour)
        const below = lowest > MIN_LAYER ? BLOCK.STONE : BLOCK.AIR; // (all rock under `lowest`)
        const hid = this._hidden?.get(chunkKey(cx, cz)) || null; // (a falling piece not landed yet: not drawn there)
        // (a cave's dark: a face is as lit as the air in front of it — _skyLight; null: all lit)
        const sky = this._skyLight(cx, cz);
        this._meshChunk = c;
        const PAT = this.lush ? PATTERN_OF_LUSH : PATTERN_OF; // (generation 5: the grass gets its own look in the shader)
        // The blocks round the chunk in one padded box (gx, gz −1…CHUNK, gy −1…layers): the chunk's
        // own, its four neighbours' border columns for occlusion (not the corners: never looked at),
        // all rock under `lowest`, air above the world — read straight, no lookups in the sweeps.
        const PX = CHUNK + 2, PY = layers + 2, PXZ = PX * PX;
        const pad = _mesh.pad && _mesh.pad.length >= PXZ * PY ? _mesh.pad : (_mesh.pad = new Uint8Array(PXZ * PY));
        pad.fill(BLOCK.AIR, 0, PXZ * PY);
        pad.fill(below, 0, PXZ); // (gy = −1)
        const yTop = Math.min(layers, HEIGHT - G0 - 1); // (the highest gy inside the world)
        for (let gz = 0; gz < CHUNK; gz++) for (let gx = 0; gx < CHUNK; gx++) {
            let i = (G0 * CHUNK + gz) * CHUNK + gx, o = PXZ + (gz + 1) * PX + gx + 1;
            for (let gy = 0; gy <= yTop; gy++, i += CHUNK * CHUNK, o += PXZ) pad[o] = blocks[i];
        }
        if (hid) for (const i of hid) {
            const gx = i % CHUNK, gz = ((i - gx) / CHUNK) % CHUNK, gy = Math.floor(i / (CHUNK * CHUNK)) - G0;
            if (gy >= 0 && gy <= yTop) pad[(gy + 1) * PXZ + (gz + 1) * PX + gx + 1] = BLOCK.AIR;
        }
        for (const [nx, nz] of [[-1, 0], [CHUNK, 0], [0, -1], [0, CHUNK]]) {
            const n = this.chunk(cx + (nx < 0 ? -1 : nx >= CHUNK ? 1 : 0), cz + (nz < 0 ? -1 : nz >= CHUNK ? 1 : 0)), nb = n.blocks;
            for (let k = 0; k < CHUNK; k++) {
                const gx = nx === 0 ? k : nx, gz = nz === 0 ? k : nz;
                let i = (G0 * CHUNK + (gz & MASK)) * CHUNK + (gx & MASK), o = PXZ + (gz + 1) * PX + gx + 1;
                for (let gy = 0; gy <= yTop; gy++, i += CHUNK * CHUNK, o += PXZ) pad[o] = nb[i];
            }
        }

        const x = [0, 0, 0];
        const cc = [0, 0, 0];
        const AIR = BLOCK.AIR, WATER = BLOCK.WATER, ICE_SHAPE = BLOCK.ICE_SHAPE;
        const stride = [1, PXZ, PX]; // (x, y, z in the padded box)
        // Greedy meshing over the three axes (Mikola Lysenko's algorithm).
        for (let d = 0; d < 3; d++) {
            const u = (d + 1) % 3, v = (d + 2) % 3;
            const su = sizes[u], sv = sizes[v];
            const mask = new Int32Array(su * sv);
            const maskKind = new Int8Array(su * sv); // 0 ground, 1 raised, 2 water
            const maskDark = new Int8Array(su * sv); // 0 open sky … 15 deep in a cave
            const qx = d === 0 ? 1 : 0, qy = d === 1 ? 1 : 0, qz = d === 2 ? 1 : 0;
            const step = stride[d], ustep = stride[u], vstep = stride[v];
            for (x[d] = -1; x[d] < sizes[d];) {
                let n = 0;
                const aIn = x[d] >= 0;
                const bIn = x[d] + 1 < sizes[d];
                const base = PXZ + PX + 1 + x[d] * step;
                cc[d] = x[d];
                for (let j = 0; j < sv; j++) {
                    let ia = base + j * vstep;
                    for (let i = 0; i < su; i++, n++, ia += ustep) {
                        const aRaw = pad[ia];
                        const bRaw = pad[ia + step];
                        // (the usual case: rock against rock, air against air — no face)
                        const aOpen = aRaw === AIR || aRaw === WATER || aRaw === ICE_SHAPE, bOpen = bRaw === AIR || bRaw === WATER || bRaw === ICE_SHAPE;
                        if (aOpen === bOpen && aRaw !== WATER && bRaw !== WATER) { mask[n] = 0; maskKind[n] = 0; maskDark[n] = 0; continue; }
                        cc[u] = i; cc[v] = j;
                        const ax = cc[0], ay = cc[1], az = cc[2];
                        // Only emit faces whose solid block lies inside this chunk;
                        // neighbours outside it still occlude.
                        const a = aIn ? aRaw : AIR;
                        const b = bIn ? bRaw : AIR;
                        // Solid faces show wherever the neighbour is air or (see-through) water;
                        // water shows its surface only towards air.
                        let key = 0, kind = 0;
                        if (aIn && !aOpen && bOpen) {
                            const L = ay + lowest;
                            key = this.faceColor(a, x0 + ax, L, z0 + az, d === 1) + 1 + (PAT[a] || 0) * 0x1000000;
                            kind = L >= 1 ? 1 : 0;
                        } else if (bIn && !bOpen && aOpen) {
                            const L = ay + qy + lowest;
                            // skip the bottom of the bedrock layer
                            if (!(d === 1 && L === MIN_LAYER)) {
                                key = -(this.faceColor(b, x0 + ax + qx, L, z0 + az + qz, false) + 1 + (PAT[b] || 0) * 0x1000000);
                                kind = L >= 1 ? 1 : 0;
                            }
                        } else if (a === WATER && (bRaw === AIR || bRaw === ICE_SHAPE)) {
                            // (the sea's top is drawn by the moving wave surface instead)
                            if (!(skipSea && d === 1 && ay + lowest === 0 && c.sea[az * CHUNK + ax])) { key = (c.sea && c.sea[az * CHUNK + ax] ? SEA_WATER_COL : WATER_COL) + 1; kind = 2; }
                        } else if (b === WATER && (aRaw === AIR || aRaw === ICE_SHAPE)) {
                            const sx = ax + qx, sz = az + qz; // (the sea's water — a crater of «Бум» it poured into — in the sea's colour, not a lake's)
                            key = -((c.sea && sx >= 0 && sz >= 0 && sx < CHUNK && sz < CHUNK && c.sea[sz * CHUNK + sx] ? SEA_WATER_COL : WATER_COL) + 1); kind = 2;
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
        return { ground: finishBuffers(out.ground), raised: finishBuffers(out.raised), water: finishBuffers(out.water) };
    }
}

/**
 * A mesh's vertex buffers while it is built: typed arrays reused from chunk to chunk (no garbage, no
 * growing JS arrays); finishBuffers copies out exactly what was written.
 */
function newBuffers(slot) {
    const b = _quadBufs[slot] || (_quadBufs[slot] = { pos: new Float32Array(4096 * 12), nor: new Float32Array(4096 * 12), col: new Float32Array(4096 * 12), pat: new Float32Array(4096 * 4), sky: new Float32Array(4096 * 4), idx: new Uint32Array(4096 * 6), cap: 4096 });
    b.nv = 0; b.ni = 0; b.patterned = false;
    return b;
}
const _quadBufs = [];

function growBuffers(b) {
    const cap = b.cap * 2;
    const re = (a, n) => { const t = new a.constructor(cap * n); t.set(a); return t; };
    b.pos = re(b.pos, 12); b.nor = re(b.nor, 12); b.col = re(b.col, 12); b.pat = re(b.pat, 4); b.sky = re(b.sky, 4); b.idx = re(b.idx, 6);
    b.cap = cap;
}

/** The finished arrays of a mesh (positions, normals, colours, indices, patterns, skies). */
function finishBuffers(b) {
    const nv = b.nv;
    return {
        positions: b.pos.slice(0, nv * 3), normals: b.nor.slice(0, nv * 3), colors: b.col.slice(0, nv * 3),
        indices: nv <= 65535 ? Uint16Array.from(b.idx.subarray(0, b.ni)) : b.idx.slice(0, b.ni),
        patterns: b.pat.slice(0, nv), skies: b.sky.slice(0, nv), patterned: b.patterned,
    };
}

/**
 * A chunk's ground and raised faces as one mesh's arrays (one draw instead of two: the ground faces
 * cast the sun's shadow too — flat, at the foot of everything, they change nothing on screen).
 */
export function mergeBuffers(a, b) {
    if (!a.indices.length) return b;
    if (!b.indices.length) return a;
    const nv = a.positions.length / 3;
    const cat = (x, y) => { const t = new x.constructor(x.length + y.length); t.set(x); t.set(y, x.length); return t; };
    const n = nv + b.positions.length / 3;
    const idx = n <= 65535 ? new Uint16Array(a.indices.length + b.indices.length) : new Uint32Array(a.indices.length + b.indices.length);
    idx.set(a.indices);
    for (let i = 0; i < b.indices.length; i++) idx[a.indices.length + i] = b.indices[i] + nv;
    return {
        positions: cat(a.positions, b.positions), normals: cat(a.normals, b.normals), colors: cat(a.colors, b.colors),
        indices: idx, patterns: cat(a.patterns, b.patterns), skies: cat(a.skies, b.skies), patterned: a.patterned || b.patterned,
    };
}

/** Convert grid-space quad to world space and append it. */
function pushQuad(buf, origin, pos, du, dv, d, positive, color, drop = 0, pattern = 0, sky = 1) {
    if ((buf.nv >> 2) + 1 > buf.cap) growBuffers(buf);
    // grid -> world: x_w = gx - 0.5, y_w = gy - 1.5, z_w = gz - 0.5 (gx = origin + local)
    const base = buf.nv, P = buf.pos, N = buf.nor, C = buf.col;
    const px = origin[0] + pos[0] - 0.5, py = origin[1] + pos[1] - 1.5 - drop, pz = origin[2] + pos[2] - 0.5;
    const nx = d === 0 ? (positive ? 1 : -1) : 0, ny = d === 1 ? (positive ? 1 : -1) : 0, nz = d === 2 ? (positive ? 1 : -1) : 0;
    const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
    let o = base * 3;
    P[o] = px; P[o + 1] = py; P[o + 2] = pz;
    P[o + 3] = px + du[0]; P[o + 4] = py + du[1]; P[o + 5] = pz + du[2];
    P[o + 6] = px + du[0] + dv[0]; P[o + 7] = py + du[1] + dv[1]; P[o + 8] = pz + du[2] + dv[2];
    P[o + 9] = px + dv[0]; P[o + 10] = py + dv[1]; P[o + 11] = pz + dv[2];
    for (let k = 0; k < 4; k++, o += 3) {
        N[o] = nx; N[o + 1] = ny; N[o + 2] = nz;
        C[o] = r; C[o + 1] = g; C[o + 2] = b;
        buf.pat[base + k] = pattern;
        buf.sky[base + k] = sky;
    }
    buf.nv += 4;
    if (pattern) buf.patterned = true;
    // Winding: (u, v, d) is a right-handed cyclic triple, so u×v = +d.
    const I = buf.idx, i = buf.ni;
    if (positive) { I[i] = base; I[i + 1] = base + 1; I[i + 2] = base + 2; I[i + 3] = base; I[i + 4] = base + 2; I[i + 5] = base + 3; }
    else { I[i] = base; I[i + 1] = base + 2; I[i + 2] = base + 1; I[i + 3] = base; I[i + 4] = base + 3; I[i + 5] = base + 2; }
    buf.ni += 6;
}

/** Original mountain height (kept for tests / tools). */
export function mountainHeight(ix, iz, seed = 1) {
    return createHeightField(seed, true)(ix, iz);
}

// (the meshes round the player — class Terrain — are in TerrainView.js: this file has no THREE,
// so the world can be made in a web worker too — terrain.worker.js)
