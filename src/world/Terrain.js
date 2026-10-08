/**
 * Terrain.js — destructible voxel terrain (ground + mountains).
 *
 * Coordinate system (kept identical to the original flat world):
 *   - columns are centred on integer x/z, a block spans [i-0.5, i+0.5]
 *   - block layer L spans y ∈ [L-1.5, L-0.5]  =>  layer 0 top surface is y = -0.5,
 *     exactly where the old ground plane was.
 *
 * Storage is a flat Uint8Array. Rendering uses greedy-meshed chunks, so a flat
 * area costs a handful of quads (looks exactly like the old plane) and only the
 * chunks touched by an explosion are rebuilt.
 *
 * This module has no DOM dependencies; the mesh builder needs THREE only for
 * BufferGeometry so the data part is unit-testable in Node.
 */

import * as THREE from 'three';
import { createNoise2D, createRng, smoothstep } from '../core/math.js';

export const BLOCK = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SNOW: 4, BEDROCK: 5 };

const BASE_COLORS = {
    [BLOCK.GRASS]: 0x4CAF50, // identical to the old ground plane
    [BLOCK.DIRT]: 0x7a5230,
    [BLOCK.STONE]: 0x8a8a8a,
    [BLOCK.SNOW]: 0xf2f6f8,
    [BLOCK.BEDROCK]: 0x3b3b3b,
};
const GRASS_SIDE = 0x6b4a2a; // dirt-coloured sides under a grass top

export const MIN_LAYER = -4; // bedrock layer (indestructible)
export const MAX_LAYER = 24;
export const CHUNK = 32;

export class TerrainData {
    /**
     * @param {number} size  world width/depth in blocks (columns -size/2 .. size/2-1)
     */
    constructor(size = 240) {
        this.size = size;
        this.half = size / 2;
        this.height = MAX_LAYER - MIN_LAYER + 1;
        this.blocks = new Uint8Array(size * size * this.height);
        this.topCache = new Int16Array(size * size);
        this.chunksPerSide = Math.ceil(size / CHUNK);
        this.dirtyChunks = new Set();
        this.version = 0;
    }

    inBounds(ix, L, iz) {
        return ix >= -this.half && ix < this.half && iz >= -this.half && iz < this.half &&
            L >= MIN_LAYER && L <= MAX_LAYER;
    }

    index(ix, L, iz) {
        return ((L - MIN_LAYER) * this.size + (iz + this.half)) * this.size + (ix + this.half);
    }

    get(ix, L, iz) {
        if (!this.inBounds(ix, L, iz)) return BLOCK.AIR;
        return this.blocks[this.index(ix, L, iz)];
    }

    set(ix, L, iz, type) {
        if (!this.inBounds(ix, L, iz)) return;
        this.blocks[this.index(ix, L, iz)] = type;
        this._refreshTop(ix, iz);
        this._markDirty(ix, iz);
    }

    _colIndex(ix, iz) {
        return (iz + this.half) * this.size + (ix + this.half);
    }

    _refreshTop(ix, iz) {
        let top = MIN_LAYER - 1;
        for (let L = MAX_LAYER; L >= MIN_LAYER; L--) {
            if (this.blocks[this.index(ix, L, iz)] !== BLOCK.AIR) { top = L; break; }
        }
        this.topCache[this._colIndex(ix, iz)] = top;
    }

    _markDirty(ix, iz) {
        const cx = Math.floor((ix + this.half) / CHUNK);
        const cz = Math.floor((iz + this.half) / CHUNK);
        this.dirtyChunks.add(cz * this.chunksPerSide + cx);
        // Faces on chunk borders depend on the neighbour chunk too.
        const lx = (ix + this.half) % CHUNK, lz = (iz + this.half) % CHUNK;
        if (lx === 0 && cx > 0) this.dirtyChunks.add(cz * this.chunksPerSide + cx - 1);
        if (lx === CHUNK - 1 && cx < this.chunksPerSide - 1) this.dirtyChunks.add(cz * this.chunksPerSide + cx + 1);
        if (lz === 0 && cz > 0) this.dirtyChunks.add((cz - 1) * this.chunksPerSide + cx);
        if (lz === CHUNK - 1 && cz < this.chunksPerSide - 1) this.dirtyChunks.add((cz + 1) * this.chunksPerSide + cx);
        this.version++;
    }

    /** Highest solid layer in a column (MIN_LAYER-1 if the column is empty). */
    topLayer(ix, iz) {
        if (ix < -this.half || ix >= this.half || iz < -this.half || iz >= this.half) return 0;
        return this.topCache[this._colIndex(ix, iz)];
    }

    /** World Y of the walkable surface at a world point. */
    surfaceY(x, z) {
        return this.topLayer(Math.round(x), Math.round(z)) - 0.5;
    }

    /** Is the world-space point inside a solid block? */
    isSolidAt(x, y, z) {
        const L = Math.floor(y + 1.5);
        return this.get(Math.round(x), L, Math.round(z)) !== BLOCK.AIR;
    }

    /** Fill flat ground plus optional mountains. */
    generate({ seed = 1, mountains = false } = {}) {
        const noise = createNoise2D(seed);
        const noise2 = createNoise2D(seed ^ 0x9e3779b9);
        const rng = createRng(seed ^ 0x51ed27);
        for (let iz = -this.half; iz < this.half; iz++) {
            for (let ix = -this.half; ix < this.half; ix++) {
                let h = 0;
                if (mountains) h = mountainHeight(ix, iz, noise, noise2);
                for (let L = MIN_LAYER; L <= h; L++) {
                    let type;
                    if (L === MIN_LAYER) type = BLOCK.BEDROCK;
                    else if (L === h) {
                        if (h >= 17) type = BLOCK.SNOW;
                        else if (h >= 11 && rng() < smoothstep(11, 16, h)) type = BLOCK.STONE;
                        else type = BLOCK.GRASS;
                    } else if (L >= h - 2 && L >= 0) type = BLOCK.DIRT;
                    else if (L >= -1) type = BLOCK.DIRT;
                    else type = BLOCK.STONE;
                    this.blocks[this.index(ix, L, iz)] = type;
                }
                this.topCache[this._colIndex(ix, iz)] = h;
            }
        }
        for (let i = 0; i < this.chunksPerSide * this.chunksPerSide; i++) this.dirtyChunks.add(i);
        this.version++;
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
        const touched = new Set();
        for (let iz = z0; iz <= z1; iz++) {
            for (let ix = x0; ix <= x1; ix++) {
                if (ix < -this.half || ix >= this.half || iz < -this.half || iz >= this.half) continue;
                for (let L = L0; L <= L1; L++) {
                    const by = L - 1.0; // block centre y
                    const dx = ix - cx, dy = by - cy, dz = iz - cz;
                    if (dx * dx + dy * dy + dz * dz > r2) continue;
                    const idx = this.index(ix, L, iz);
                    const type = this.blocks[idx];
                    if (type === BLOCK.AIR || type === BLOCK.BEDROCK) continue;
                    this.blocks[idx] = BLOCK.AIR;
                    removed.push({ x: ix, y: by, z: iz, type });
                    touched.add(ix + ',' + iz);
                }
            }
        }
        for (const key of touched) {
            const [ix, iz] = key.split(',').map(Number);
            this._refreshTop(ix, iz);
            this._markDirty(ix, iz);
        }
        return removed;
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
            if (this.get(ix, iy, iz) !== BLOCK.AIR) {
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
     * `raised` (mountains — cast and receive shadows).
     */
    buildChunkArrays(cx, cz) {
        const x0 = -this.half + cx * CHUNK, z0 = -this.half + cz * CHUNK;
        const x1 = Math.min(x0 + CHUNK, this.half), z1 = Math.min(z0 + CHUNK, this.half);
        const out = { ground: newBuffers(), raised: newBuffers() };
        const sizes = [x1 - x0, this.height, z1 - z0];
        const origin = [x0, MIN_LAYER, z0];
        const get = (p) => this.get(p[0], p[1], p[2]);

        // Greedy meshing over the three axes (Mikola Lysenko's algorithm).
        for (let d = 0; d < 3; d++) {
            const u = (d + 1) % 3, v = (d + 2) % 3;
            const x = [0, 0, 0];
            const q = [0, 0, 0]; q[d] = 1;
            const mask = new Int32Array(sizes[u] * sizes[v]);
            const maskLayer = new Int16Array(sizes[u] * sizes[v]);
            for (x[d] = -1; x[d] < sizes[d];) {
                let n = 0;
                for (x[v] = 0; x[v] < sizes[v]; x[v]++) {
                    for (x[u] = 0; x[u] < sizes[u]; x[u]++, n++) {
                        const pa = [origin[0] + x[0], origin[1] + x[1], origin[2] + x[2]];
                        const pb = [pa[0] + q[0], pa[1] + q[1], pa[2] + q[2]];
                        // Only emit faces whose solid block lies inside this chunk.
                        const aIn = x[d] >= 0;
                        const bIn = x[d] + 1 < sizes[d];
                        const a = aIn ? get(pa) : BLOCK.AIR;
                        const b = bIn ? get(pb) : BLOCK.AIR;
                        // Neighbours outside the chunk still occlude.
                        const aSolid = (a !== BLOCK.AIR);
                        const bSolid = (b !== BLOCK.AIR);
                        const aOcc = aSolid || (!aIn && get(pa) !== BLOCK.AIR);
                        const bOcc = bSolid || (!bIn && get(pb) !== BLOCK.AIR);
                        let key = 0, layer = 0;
                        if (aSolid && !bOcc) {
                            // +d face of block a
                            const col = this.faceColor(a, pa[0], pa[1], pa[2], d === 1);
                            key = (col + 1); layer = pa[1];
                        } else if (bSolid && !aOcc) {
                            // -d face of block b (skip bottom of bedrock layer)
                            if (!(d === 1 && pb[1] === MIN_LAYER)) {
                                const col = this.faceColor(b, pb[0], pb[1], pb[2], false);
                                key = -(col + 1); layer = pb[1];
                            }
                        }
                        mask[n] = key;
                        maskLayer[n] = layer;
                    }
                }
                x[d]++;
                // Build quads from the mask.
                n = 0;
                for (let j = 0; j < sizes[v]; j++) {
                    for (let i = 0; i < sizes[u];) {
                        const c = mask[n];
                        if (c === 0) { i++; n++; continue; }
                        const layerC = maskLayer[n];
                        const raisedC = layerC >= 1;
                        let w = 1;
                        while (i + w < sizes[u] && mask[n + w] === c && (maskLayer[n + w] >= 1) === raisedC) w++;
                        let h = 1, done = false;
                        for (; j + h < sizes[v]; h++) {
                            for (let k = 0; k < w; k++) {
                                const m = n + k + h * sizes[u];
                                if (mask[m] !== c || (maskLayer[m] >= 1) !== raisedC) { done = true; break; }
                            }
                            if (done) break;
                        }
                        const pos = [0, 0, 0]; pos[u] = i; pos[v] = j; pos[d] = x[d];
                        const du = [0, 0, 0]; du[u] = w;
                        const dv = [0, 0, 0]; dv[v] = h;
                        const target = raisedC ? out.raised : out.ground;
                        pushQuad(target, origin, pos, du, dv, d, c > 0, Math.abs(c) - 1);
                        for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * sizes[u]] = 0;
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
function pushQuad(buf, origin, pos, du, dv, d, positive, color) {
    // grid -> world: x_w = gx - 0.5, y_w = gy - 1.5, z_w = gz - 0.5 (gx = origin + local)
    const base = buf.positions.length / 3;
    const p = [origin[0] + pos[0] - 0.5, origin[1] + pos[1] - 1.5, origin[2] + pos[2] - 0.5];
    const corners = [
        p,
        [p[0] + du[0], p[1] + du[1], p[2] + du[2]],
        [p[0] + du[0] + dv[0], p[1] + du[1] + dv[1], p[2] + du[2] + dv[2]],
        [p[0] + dv[0], p[1] + dv[1], p[2] + dv[2]],
    ];
    const nrm = [0, 0, 0]; nrm[d] = positive ? 1 : -1;
    const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
    for (const c of corners) {
        buf.positions.push(c[0], c[1], c[2]);
        buf.normals.push(nrm[0], nrm[1], nrm[2]);
        buf.colors.push(r, g, b);
    }
    // Winding: (u, v, d) is a right-handed cyclic triple, so u×v = +d.
    if (positive) buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else buf.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

/** Mountain height field: flat play area around spawn, ranges further out. */
export function mountainHeight(ix, iz, noise, noise2) {
    const dist = Math.sqrt(ix * ix + iz * iz);
    const mask = smoothstep(38, 70, dist) * (1 - smoothstep(108, 119, Math.max(Math.abs(ix), Math.abs(iz))));
    if (mask <= 0) return 0;
    const n = 0.6 * noise(ix / 46, iz / 46) + 0.3 * noise2(ix / 17, iz / 17) + 0.1 * noise(ix / 6 + 31, iz / 6 - 17);
    const ridge = Math.max(0, (n + 0.05) / 0.65);
    const h = Math.floor(ridge * ridge * 30 * mask);
    return Math.min(MAX_LAYER - 2, h);
}

/**
 * Terrain = data + THREE meshes. Rebuilds at most `maxRebuildsPerFrame`
 * dirty chunks per frame so an explosion never causes a hitch.
 */
export class Terrain {
    constructor(scene, { size = 240, seed = 1, mountains = false } = {}) {
        this.scene = scene;
        this.data = new TerrainData(size);
        this.data.generate({ seed, mountains });
        this.material = new THREE.MeshPhongMaterial({ vertexColors: true });
        this.group = new THREE.Group();
        this.group.name = 'terrain';
        this.chunks = new Map(); // id -> {ground, raised}
        scene.add(this.group);
        this.maxRebuildsPerFrame = 2;
        this.flushAll();
    }

    flushAll() {
        const ids = [...this.data.dirtyChunks];
        this.data.dirtyChunks.clear();
        for (const id of ids) this._rebuild(id);
    }

    update() {
        let n = 0;
        for (const id of this.data.dirtyChunks) {
            this.data.dirtyChunks.delete(id);
            this._rebuild(id);
            if (++n >= this.maxRebuildsPerFrame) break;
        }
    }

    _rebuild(id) {
        const cps = this.data.chunksPerSide;
        const cx = id % cps, cz = Math.floor(id / cps);
        const arrays = this.data.buildChunkArrays(cx, cz);
        let entry = this.chunks.get(id);
        if (!entry) {
            entry = { ground: this._makeMesh(false), raised: this._makeMesh(true) };
            this.chunks.set(id, entry);
        }
        this._fill(entry.ground, arrays.ground);
        this._fill(entry.raised, arrays.raised);
    }

    _makeMesh(raised) {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = raised;
        mesh.matrixAutoUpdate = false;
        mesh.userData.isTerrain = true;
        this.group.add(mesh);
        return mesh;
    }

    _fill(mesh, buf) {
        const geo = mesh.geometry;
        if (buf.indices.length === 0) {
            mesh.visible = false;
            return;
        }
        mesh.visible = true;
        geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
        geo.setIndex(buf.indices);
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
    }

    surfaceY(x, z) { return this.data.surfaceY(x, z); }
    topLayer(ix, iz) { return this.data.topLayer(ix, iz); }
    raycast(origin, dir, maxDist) { return this.data.raycast(origin, dir, maxDist); }
    removeSphere(x, y, z, r) { return this.data.removeSphere(x, y, z, r); }

    dispose() {
        for (const { ground, raised } of this.chunks.values()) {
            ground.geometry.dispose();
            raised.geometry.dispose();
        }
        this.material.dispose();
        this.scene.remove(this.group);
    }
}
