/** The main world's geography, sampled as continuous surfaces for Opushka. */
import { createHeightField } from '../src/world/Terrain.js';
import { SeaIndex } from '../src/world/Sea.js';
import { CAVES, CAVE_CELL, naturalCaveSystem, noise3, systemIn } from '../src/world/CaveSystems.js';
import { smoothstep } from '../src/core/math.js';

export const WATER_KIND = { NONE: 0, RIVER: 1, LAKE: 2, SEA: 3 };
export const OPUSHKA_SEED = 1337;
const TILE = 20;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const key = (x, z) => x + ',' + z;

export function geography(meadowHeight, seed = OPUSHKA_SEED) {
    // The creative preview places the coast within walking distance of its clearing.
    const sea = new SeaIndex(seed, { x: 0, z: -418 });
    const sample = createHeightField(seed, true, sea, false, true, true, true, true, (x, z, dist, land) => {
        const near = 1 - smoothstep(75, 200, dist);
        if (near === 1) return meadowHeight(x, z);
        const hills = land.height(x, z, dist);
        return Math.max(0.06, hills) * (1 - near) + meadowHeight(x, z) * near;
    });
    return sample;
}

/** Terrain triangles in the main grid go from northwest to southeast. */
export function heightTriangle(array, size, gx, gz) {
    const x = clamp(gx, 0, size - 1.000001), z = clamp(gz, 0, size - 1.000001);
    const i = Math.floor(x), j = Math.floor(z), a = j * size + i;
    const u = x - i, v = z - j;
    const sw = array[a + size], ne = array[a + 1];
    return u + v <= 1
        ? array[a] * (1 - u - v) + ne * u + sw * v
        : array[a + size + 1] * (u + v - 1) + ne * (1 - v) + sw * (1 - u);
}

export class OpushkaCaves {
    constructor(height, blocked, limit, seed = OPUSHKA_SEED) {
        this.height = height;
        this.systems = [];
        this.tiles = new Map();
        const cells = Math.ceil(limit / CAVE_CELL);
        const keep = (x, z) => Math.abs(x) > limit - 10 || Math.abs(z) > limit - 10
            || Math.hypot(x, z) < CAVES.KEEP_SPAWN || blocked(x, z);
        for (let gz = -cells; gz < cells; gz++) for (let gx = -cells; gx < cells; gx++) {
            const cave = naturalCaveSystem(gx, gz, seed, height, keep);
            if (cave) this.systems.push(cave);
        }
        for (const cave of this.systems) {
            for (let iz = Math.floor(cave.z0 / TILE); iz <= Math.floor(cave.z1 / TILE); iz++) {
                for (let ix = Math.floor(cave.x0 / TILE); ix <= Math.floor(cave.x1 / TILE); ix++) {
                    const x = ix * TILE, z = iz * TILE;
                    const part = systemIn(cave, x - 1, z - 1, x + TILE + 1, z + TILE + 1);
                    if (!part.segs.length && !part.chambers.length) continue;
                    const id = key(ix, iz);
                    if (!this.tiles.has(id)) this.tiles.set(id, { x, z, parts: [], low: Infinity, high: -Infinity });
                    const tile = this.tiles.get(id);
                    tile.parts.push(part);
                    tile.open ||= part.segs.some((seg) => !!seg.open);
                    for (const seg of part.segs) {
                        tile.low = Math.min(tile.low, seg.ay - seg.r * 1.75, seg.by - seg.r * 1.75);
                        tile.high = Math.max(tile.high, seg.ay + seg.r * 2.6, seg.by + seg.r * 2.6);
                    }
                    for (const c of part.chambers) {
                        tile.low = Math.min(tile.low, c.F - 2);
                        tile.high = Math.max(tile.high, c.F + c.h + 2);
                    }
                }
            }
        }
    }

    tile(x, z) { return this.tiles.get(key(Math.floor(x / TILE), Math.floor(z / TILE))); }

    /** Positive is rock. Its zero surface is used for both the mesh and movement. */
    density(x, y, z, tile = this.tile(x, z), h = this.height(x, z)) {
        const ground = h - y;
        if (!tile || y < tile.low || y > tile.high || ground < 0) return ground;
        let rock = ground;
        for (const part of tile.parts) {
            let rough;
            for (const g of part.segs) {
                const dx = g.bx - g.ax, dz = g.bz - g.az;
                const t = clamp(((x - g.ax) * dx + (z - g.az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
                const u = x - g.ax - t * dx, w = z - g.az - t * dz;
                const d = y - (g.ay + (g.by - g.ay) * t);
                const v = d * (d < 0 ? 1.24 : g.open ? 0.94 : Math.sqrt(CAVES.UP));
                const d2 = u * u + v * v + w * w;
                if (d2 >= (g.r + 0.4) ** 2) continue;
                rough ??= noise3(x * 0.30, y * 0.29, z * 0.30, part.seed) * 0.40;
                const air = g.r + rough - Math.sqrt(d2);
                // Retain a roof except at the open tunnel segments allowed by the shared recipe.
                rock = Math.min(rock, -Math.min(air, g.open ? y - (g.minL ?? -1e6) + 0.95 : ground - 1.8));
            }
            for (const c of part.chambers) {
                if (y < c.F - 1 || y > c.F + c.h) continue;
                const dx = x - c.x, dz = z - c.z;
                const d2 = dx * dx + dz * dz;
                if (d2 > (c.r * (1 + c.w1 + c.w2) + 0.8) ** 2) continue;
                rough ??= noise3(x * 0.30, y * 0.29, z * 0.30, part.seed) * 0.40;
                const a = Math.atan2(dz, dx);
                const wall = c.r * (1 + c.w1 * Math.sin(a * 3 + c.p1) + c.w2 * Math.sin(a * 5 + c.p2));
                const radial = Math.sqrt(d2);
                const floor = c.F + rough * 0.55;
                const roof = c.F + c.h * (0.58 + 0.42 * Math.sqrt(Math.max(0, 1 - (radial / wall) ** 2)));
                rock = Math.min(rock, -Math.min(wall + rough * 2 - radial, y - floor, roof - y, ground - 1.8));
            }
        }
        return rock;
    }

    /** Floor below a point in air; separate from the outdoor height used by plants and animals. */
    floor(x, z, y) {
        const h = this.height(x, z), tile = this.tile(x, z);
        if (!tile || y > h + 0.6 && this.density(x, h - 0.15, z, tile, h) >= 0) return h;
        let upper = Math.min(y + 0.1, h + 0.2);
        for (let lower = upper - 0.25; lower >= tile.low - 1; lower -= 0.25) {
            if (this.density(x, lower, z, tile, h) < 0) { upper = lower; continue; }
            let lo = lower, hi = upper;
            for (let i = 0; i < 5; i++) {
                const mid = (lo + hi) / 2;
                if (this.density(x, mid, z, tile, h) >= 0) lo = mid;
                else hi = mid;
            }
            return hi;
        }
        return h;
    }

    canStand(x, y, z, head = 1.7) {
        if (!this.tile(x, z)) return y >= this.height(x, z) - 0.42;
        return this.density(x, y + 0.42, z) <= 0 && this.density(x, y + head, z) <= 0;
    }
}

export const CAVE_TILE = TILE;
