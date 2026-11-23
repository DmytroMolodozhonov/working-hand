import * as THREE from 'three';
import { CAVE_TILE, WATER_KIND } from './opushka-world.js';

const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const TETS = [[0, 1, 3, 7], [0, 3, 2, 7], [0, 2, 6, 7], [0, 6, 4, 7], [0, 4, 5, 7], [0, 5, 1, 7]];

// Cut a continuous rock/air surface. Every patch uses the same lattice and face diagonals.
export function caveGeometry(caves, tile) {
    const n = CAVE_TILE + 1, slab = n * n;
    const heights = new Float32Array(slab);
    let low = tile.low, high = tile.high;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        const h = caves.height(tile.x + x, tile.z + z);
        heights[z * n + x] = h;
        if (tile.open) { low = Math.min(low, h); high = Math.max(high, h); }
    }
    const y0 = Math.floor(low) - 1, rows = Math.ceil(high) + 2 - y0;
    const field = new Float32Array(rows * slab);
    for (let j = 0; j < rows; j++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        const i = z * n + x;
        const y = y0 + j, h = heights[i];
        field[j * slab + i] = !tile.open && y > h - 1.8 ? 1 : caves.density(tile.x + x, y, tile.z + z, tile, h);
    }
    const pos = [], indices = [], edge = new Map(), corners = new Int32Array(8);
    const point = (v) => [tile.x + v % n, y0 + Math.floor(v / slab), tile.z + Math.floor(v / n) % n];
    function vertex(a, b) {
        const id = Math.min(a, b) * field.length + Math.max(a, b);
        const existing = edge.get(id);
        if (existing !== undefined) return existing;
        const p = point(a), q = point(b);
        const t = field[a] / (field[a] - field[b]);
        const index = pos.length / 3;
        for (let k = 0; k < 3; k++) pos.push(p[k] + (q[k] - p[k]) * t);
        edge.set(id, index);
        return index;
    }
    function triangle(a, b, c, solid) {
        const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
        const x = pos[b * 3] - ax, y = pos[b * 3 + 1] - ay, z = pos[b * 3 + 2] - az;
        const u = pos[c * 3] - ax, v = pos[c * 3 + 1] - ay, w = pos[c * 3 + 2] - az;
        const inside = point(solid);
        const dot = (y * w - z * v) * (inside[0] - ax) + (z * u - x * w) * (inside[1] - ay) + (x * v - y * u) * (inside[2] - az);
        if (dot > 0) indices.push(a, c, b);
        else indices.push(a, b, c);
    }
    const solid = [], air = [];
    for (let j = 0; j < rows - 1; j++) for (let z = 0; z < n - 1; z++) for (let x = 0; x < n - 1; x++) {
        const i = j * slab + z * n + x;
        let inside = 0;
        for (let k = 0; k < 8; k++) {
            const [dx, dy, dz] = CORNERS[k];
            corners[k] = i + dx + dy * slab + dz * n;
            inside += field[corners[k]] > 0;
        }
        if (!inside || inside === 8) continue;
        for (const tet of TETS) {
            solid.length = air.length = 0;
            for (const k of tet) (field[corners[k]] > 0 ? solid : air).push(corners[k]);
            if (!solid.length || !air.length) continue;
            if (solid.length === 1 || air.length === 1) {
                const [one, other] = solid.length === 1 ? [solid[0], air] : [air[0], solid];
                triangle(vertex(one, other[0]), vertex(one, other[1]), vertex(one, other[2]), solid[0]);
            } else {
                const a = vertex(solid[0], air[0]), b = vertex(solid[0], air[1]);
                const c = vertex(solid[1], air[0]), d = vertex(solid[1], air[1]);
                triangle(a, b, c, solid[0]);
                triangle(b, d, c, solid[0]);
            }
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(indices);
    // Matching gradients on both sides of patch boundaries also keep the lighting continuous.
    const normals = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
        const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]], d = 0.15;
        const dx = caves.density(x - d, y, z) - caves.density(x + d, y, z);
        const dy = caves.density(x, y - d, z) - caves.density(x, y + d, z);
        const dz = caves.density(x, y, z - d) - caves.density(x, y, z + d);
        const len = Math.hypot(dx, dy, dz) || 1;
        normals.set([dx / len, dy / len, dz / len], i);
    }
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.computeBoundingSphere();
    return g;
}

export function terrainIndex(geometry, step, omit) {
    const p = geometry.attributes.position;
    const old = geometry.index.array;
    const indices = new old.constructor(old.length);
    let n = 0;
    for (let i = 0; i < old.length; i += 6) {
        const v = old[i];
        if (omit(p.getX(v) + step / 2, p.getZ(v) + step / 2)) continue;
        for (let j = 0; j < 6; j++) indices[n++] = old[i + j];
    }
    geometry.setIndex(new THREE.BufferAttribute(indices.subarray(0, n), 1));
}

/** Keep a little overlap under the banks. The real terrain clips the shoreline in the renderer. */
export function waterGeometry(lo, hi, step, kindAt, flowAt, skip = null) {
    const positions = [], hydro = [], indices = [];
    for (let z = lo; z < hi; z += step) for (let x = lo; x < hi; x += step) {
        if (skip?.(x + step / 2, z + step / 2)) continue;
        const kind = Math.max(kindAt(x, z), kindAt(x + step, z), kindAt(x, z + step), kindAt(x + step, z + step));
        if (!kind) continue;
        const flow = kind === WATER_KIND.RIVER ? flowAt(x + step / 2, z + step / 2) : [0, 0];
        const base = positions.length / 3;
        positions.push(x, 0, z, x, 0, z + step, x + step, 0, z, x + step, 0, z + step);
        for (let i = 0; i < 4; i++) hydro.push(kind, flow[0], flow[1]);
        indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('hydro', new THREE.Float32BufferAttribute(hydro, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
}
