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
import { applyVoxelDetail } from './VoxelShading.js';

export const BLOCK = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SNOW: 4, BEDROCK: 5, WOOD: 6, LEAVES: 7, WATER: 8, SAND: 9, ICE: 10, ICE_SHAPE: 11,
    // five kinds of trees (oak = WOOD / LEAVES)
    BIRCH: 12, BIRCH_LEAVES: 13, SPRUCE: 14, SPRUCE_LEAVES: 15, CHERRY: 16, CHERRY_LEAVES: 17, DARK: 18, DARK_LEAVES: 19,
};
/** Tree kinds: trunk and leaf blocks. */
export const TREE_KINDS = [
    { name: 'Дуб', wood: BLOCK.WOOD, leaves: BLOCK.LEAVES },
    { name: 'Берёза', wood: BLOCK.BIRCH, leaves: BLOCK.BIRCH_LEAVES },
    { name: 'Ель', wood: BLOCK.SPRUCE, leaves: BLOCK.SPRUCE_LEAVES },
    { name: 'Вишня', wood: BLOCK.CHERRY, leaves: BLOCK.CHERRY_LEAVES },
    { name: 'Тёмный дуб', wood: BLOCK.DARK, leaves: BLOCK.DARK_LEAVES },
];
export const isWood = (t) => t === BLOCK.WOOD || t === BLOCK.BIRCH || t === BLOCK.SPRUCE || t === BLOCK.CHERRY || t === BLOCK.DARK;
export const isLeaves = (t) => t === BLOCK.LEAVES || t === BLOCK.BIRCH_LEAVES || t === BLOCK.SPRUCE_LEAVES || t === BLOCK.CHERRY_LEAVES || t === BLOCK.DARK_LEAVES;
/** Burns (wood and leaves of every tree). */
export const isFlammable = (t) => isWood(t) || isLeaves(t);
// ICE_SHAPE: solid space inside frozen water shapes (drawn by WaterMagic, not as cubes)

/** Water is not solid: you can see, walk and shoot through it. */
export const isSolid = (type) => type !== BLOCK.AIR && type !== BLOCK.WATER;
/** Blocks drawn as cubes (frozen water shapes are drawn as their own smooth shapes). */
const drawn = (type) => type !== BLOCK.AIR && type !== BLOCK.WATER && type !== BLOCK.ICE_SHAPE;
/** Top of the water surface (water fills layers up to 0, drawn a little lower than the ground). */
export const WATER_LEVEL_Y = -0.62;

const BASE_COLORS = {
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
};
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

export const MIN_LAYER = -9; // bedrock layer (indestructible); deep lakes reach down to -7
export const MAX_LAYER = 40;
export const CHUNK = 32;
const SHIFT = 5; // log2(CHUNK)
const MASK = CHUNK - 1;
const HEIGHT = MAX_LAYER - MIN_LAYER + 1;
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
export function createHeightField(seed, mountains) {
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
        fn.water = 0;
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
            cap = NEAR_CAP + (MAX_LAYER - 4 - NEAR_CAP) * far;
        }
        let h = Math.min(Math.floor(cap), Math.floor(ridge * ridge * 30 * near * amp));

        // Rivers and lakes (never in the original play area)
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
        // Lakes in low land
        if (h <= 1) {
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
    fn.water = 0;
    return fn;
}

/** Cheap deterministic hash → [0, 1). */
function hash01(a, b, seed) {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

const TREE_CELL = 12; // one possible tree per 12×12 m cell
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
    generate({ seed = 1, mountains = false } = {}) {
        this.seed = seed;
        this.mountains = mountains;
        this.heightAt = createHeightField(seed, mountains);
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
        for (let lz = 0; lz < CHUNK; lz++) {
            for (let lx = 0; lx < CHUNK; lx++) {
                const h = this.heightAt(x0 + lx, z0 + lz);
                const water = this.heightAt.water;
                const col = lz * CHUNK + lx;
                for (let L = MIN_LAYER; L <= h; L++) {
                    let type;
                    if (L === MIN_LAYER) type = BLOCK.BEDROCK;
                    else if (water && L === h) type = BLOCK.SAND;
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
        const c = { cx, cz, blocks, top, maxTop, modified: false };
        if (this.mountains) this._plantTrees(c);
        return c;
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
        if (type !== BLOCK.AIR && L > c.maxTop) c.maxTop = L;
        if (type === BLOCK.ICE) this.version++;
        this._refreshTop(c, ix & MASK, iz & MASK);
        this._markDirty(ix, iz);
    }

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

    /** World Y of the walkable surface at a world point. */
    surfaceY(x, z) {
        return this.topLayer(Math.round(x), Math.round(z)) - 0.5;
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
    removeSphere(cx, cy, cz, radius) {
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
                    c.blocks[idx] = BLOCK.AIR;
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
     * Greedy-mesh one chunk. Returns two vertex buffers: `ground` (faces of
     * blocks at or below layer 0 — receive shadows only, like the old plane) and
     * `raised` (mountains, trees — cast and receive shadows).
     */
    buildChunkArrays(cx, cz) {
        const c = this.chunk(cx, cz);
        const out = { ground: newBuffers(), raised: newBuffers(), water: newBuffers() };
        const x0 = cx * CHUNK, z0 = cz * CHUNK;
        // Only the layers that can hold faces of this chunk's blocks
        const layers = Math.min(MAX_LAYER, c.maxTop + 1) - MIN_LAYER + 1;
        const sizes = [CHUNK, layers, CHUNK];
        const origin = [x0, MIN_LAYER, z0];
        const blocks = c.blocks;
        // Fast access inside this chunk; neighbours only for border occlusion
        const at = (gx, gy, gz) => {
            if (gy < 0 || gy >= HEIGHT) return BLOCK.AIR;
            if (gx >= 0 && gx < CHUNK && gz >= 0 && gz < CHUNK) return blocks[(gy * CHUNK + gz) * CHUNK + gx];
            return this.get(x0 + gx, MIN_LAYER + gy, z0 + gz);
        };

        const x = [0, 0, 0];
        // Greedy meshing over the three axes (Mikola Lysenko's algorithm).
        for (let d = 0; d < 3; d++) {
            const u = (d + 1) % 3, v = (d + 2) % 3;
            const su = sizes[u], sv = sizes[v];
            const mask = new Int32Array(su * sv);
            const maskKind = new Int8Array(su * sv); // 0 ground, 1 raised, 2 water
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
                            const L = ay + MIN_LAYER;
                            key = this.faceColor(a, x0 + ax, L, z0 + az, d === 1) + 1;
                            kind = L >= 1 ? 1 : 0;
                        } else if (drawn(b) && !drawn(aRaw)) {
                            const L = ay + qy + MIN_LAYER;
                            // skip the bottom of the bedrock layer
                            if (!(d === 1 && L === MIN_LAYER)) {
                                key = -(this.faceColor(b, x0 + ax + qx, L, z0 + az + qz, false) + 1);
                                kind = L >= 1 ? 1 : 0;
                            }
                        } else if (a === BLOCK.WATER && (bRaw === BLOCK.AIR || bRaw === BLOCK.ICE_SHAPE)) {
                            key = BASE_COLORS[BLOCK.WATER] + 1; kind = 2;
                        } else if (b === BLOCK.WATER && (aRaw === BLOCK.AIR || aRaw === BLOCK.ICE_SHAPE)) {
                            key = -(BASE_COLORS[BLOCK.WATER] + 1); kind = 2;
                        }
                        mask[n] = key;
                        maskKind[n] = kind;
                    }
                }
                x[d]++;
                // Build quads from the mask.
                n = 0;
                for (let j = 0; j < sv; j++) {
                    for (let i = 0; i < su;) {
                        const col = mask[n];
                        if (col === 0) { i++; n++; continue; }
                        const kindC = maskKind[n];
                        let w = 1;
                        while (i + w < su && mask[n + w] === col && maskKind[n + w] === kindC) w++;
                        let h = 1, done = false;
                        for (; j + h < sv; h++) {
                            for (let k = 0; k < w; k++) {
                                const m = n + k + h * su;
                                if (mask[m] !== col || maskKind[m] !== kindC) { done = true; break; }
                            }
                            if (done) break;
                        }
                        const pos = [0, 0, 0]; pos[u] = i; pos[v] = j; pos[d] = x[d];
                        const du = [0, 0, 0]; du[u] = w;
                        const dv = [0, 0, 0]; dv[v] = h;
                        const target = kindC === 2 ? out.water : kindC === 1 ? out.raised : out.ground;
                        // The water surface sits a little below the ground around it
                        const drop = kindC === 2 && d === 1 && col > 0 ? 0.12 : 0;
                        pushQuad(target, origin, pos, du, dv, d, col > 0, Math.abs(col) - 1, drop);
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
    return { positions: [], normals: [], colors: [], indices: [] };
}

/** Convert grid-space quad to world space and append it. */
function pushQuad(buf, origin, pos, du, dv, d, positive, color, drop = 0) {
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
    }
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
    constructor(scene, { seed = 1, mountains = false, viewDistance = 112 } = {}) {
        this.scene = scene;
        this.data = new TerrainData();
        this.data.generate({ seed, mountains });
        this.material = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111 }));
        this.waterMaterial = new THREE.MeshPhongMaterial({
            vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
            shininess: 90, specular: 0x88bbff,
        });
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
        geo.setIndex(buf.indices);
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        mesh.geometry = geo;
        mesh.visible = true;
    }

    surfaceY(x, z) { return this.data.surfaceY(x, z); }
    topLayer(ix, iz) { return this.data.topLayer(ix, iz); }
    raycast(origin, dir, maxDist) { return this.data.raycast(origin, dir, maxDist); }
    removeSphere(x, y, z, r) { return this.data.removeSphere(x, y, z, r); }

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
