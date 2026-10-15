/**
 * Flora.js — tall grass and flowers on the meadows of generation-5 worlds (the author: «трава
 * такая однотипная, зелёная, нету переливов… цветы, разная высота травы»).
 *
 * Each grass block in the open air may carry a tuft of blades or a flower — which, how tall and
 * what colour comes from the kind of land (Landscape.BIOMES: its `tall` and `flowers`) and a hash
 * of the column, so every computer sees the same meadow. Purely a look: they are not blocks, you
 * walk through them as through real grass; nothing collides with them. They follow the ground: when
 * a block under them is dug, burnt, flooded or built over, their chunk is made again (Terrain bumps
 * the chunk's `rev` whenever it rebuilds its mesh), so a flower never hangs in the air.
 *
 * Drawn only round the player (RADIUS): one merged mesh per chunk, built a couple per frame; the
 * blades sway in the wind in the vertex shader and shrink away towards the edge of the circle (no
 * popping). Night, caves, storms: lit like the rest of the open world (applySkyComp).
 */

import * as THREE from 'three';
import { BLOCK, CHUNK, MIN_LAYER, chunkKey } from './Terrain.js';
import { BIOMES, hashLand } from './Landscape.js';
import { applySkyComp } from './VoxelShading.js';

export const FLORA = {
    RADIUS: 70, // m round the player
    BUILD_PER_FRAME: 2, // chunks
    BUDGET_MS: 2.5,
};

const WIND = { time: { value: 0 } };

export class Flora {
    /** @param {import('./Terrain.js').Terrain} terrain */
    constructor(terrain) {
        this.terrain = terrain;
        this.data = terrain.data;
        this.radius = FLORA.RADIUS;
        this.material = this._material();
        this.group = new THREE.Group();
        this.group.name = 'flora';
        terrain.group.add(this.group);
        this.meshes = new Map(); // chunk key → { mesh, cx, cz, rev, chunk }
        this._center = { x: 1e9, z: 1e9 };
        this._t = 0;
        this.stats = { built: 0, blades: 0 };
    }

    _material() {
        const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
        const center = (this._centerU = { value: new THREE.Vector3() });
        const radius = (this._radiusU = { value: this.radius });
        m.onBeforeCompile = (shader) => {
            shader.uniforms.uWind = WIND.time;
            shader.uniforms.uFloraCenter = center;
            shader.uniforms.uFloraR = radius;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nattribute float sway;\nattribute float glow;\nvarying float vGlow;\nuniform float uWind;\nuniform vec3 uFloraCenter;\nuniform float uFloraR;')
                .replace('#include <begin_vertex>', `#include <begin_vertex>
vGlow = glow;
{
    // shrink away towards the edge of the drawn circle; sway in the wind (the tips most)
    vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
    float far = 1.0 - smoothstep(uFloraR * 0.72, uFloraR, distance(wp.xz, uFloraCenter.xz));
    transformed.y -= sway * (1.0 - far) * 1.2;
    float s = sway * sway;
    float w = sin(uWind * 1.7 + wp.x * 0.37 + wp.z * 0.21) + 0.45 * sin(uWind * 3.1 + wp.x * 1.3 - wp.z * 0.9);
    transformed.x += s * w * 0.07 * far;
    transformed.z += s * w * 0.045 * far;
}`);
            shader.fragmentShader = shader.fragmentShader
                // (a blade is lit like the ground it grows from, from either side — not dark from behind)
                .replace('( gl_FrontFacing ) ? vIndirectFront : vIndirectBack', 'vIndirectFront')
                .replace('( gl_FrontFacing ) ? vLightFront : vLightBack', 'vLightFront')
                .replace('#include <common>', '#include <common>\nvarying float vGlow;')
                .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 0.55; // (the moonlit groves\' flowers glow)');
        };
        m.customProgramCacheKey = () => 'flora';
        return applySkyComp(m);
    }

    /** @param {{x:number, z:number}} focus  the player */
    update(focus, all = false) {
        const now = performance.now();
        this._t += Math.min(0.1, (now - (this._last || now)) / 1000);
        this._last = now;
        WIND.time.value = this._t;
        if (!focus) return;
        this._centerU.value.set(focus.x, 0, focus.z);
        const R = this.radius, rc = Math.ceil(R / CHUNK) + 1;
        const ccx = Math.floor(focus.x / CHUNK), ccz = Math.floor(focus.z / CHUNK);
        // forget the chunks left behind
        for (const [key, e] of this.meshes) {
            if (this._chunkDist(e.cx, e.cz, focus) > R + CHUNK) { this._drop(key, e); }
        }
        // make the missing ones (nearest first) and the ones whose ground changed
        const want = [];
        for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
            const cx = ccx + dx, cz = ccz + dz;
            const d = this._chunkDist(cx, cz, focus);
            if (d > R) continue;
            const key = chunkKey(cx, cz);
            if (!this.data.hasChunk(cx, cz) || !this.terrain.meshes.has(key)) continue; // (its ground first)
            const e = this.meshes.get(key), c = this.data.chunk(cx, cz);
            if (e && e.rev === c.rev && e.chunk === c) continue;
            want.push({ key, cx, cz, d, c });
        }
        if (!want.length) return;
        want.sort((a, b) => a.d - b.d);
        const t0 = performance.now();
        let n = 0;
        for (const w of want) {
            this._build(w);
            n++;
            if (!all && (n >= FLORA.BUILD_PER_FRAME || performance.now() - t0 > FLORA.BUDGET_MS)) break;
        }
    }

    _chunkDist(cx, cz, p) {
        const x0 = cx * CHUNK - 0.5, z0 = cz * CHUNK - 0.5;
        const dx = Math.max(x0 - p.x, 0, p.x - (x0 + CHUNK)), dz = Math.max(z0 - p.z, 0, p.z - (z0 + CHUNK));
        return Math.sqrt(dx * dx + dz * dz);
    }

    _drop(key, e) {
        this.meshes.delete(key);
        this.group.remove(e.mesh);
        e.mesh.geometry.dispose();
    }

    /** The tufts and flowers of one chunk, in one mesh. */
    _build({ key, cx, cz, c }) {
        const old = this.meshes.get(key);
        if (old) this._drop(key, old);
        const geo = this.chunkGeometry(c);
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.frustumCulled = true;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.userData.isFlora = true;
        mesh.raycast = () => {}; // (not a thing to hit: spells and hands pass through grass)
        this.group.add(mesh);
        this.meshes.set(key, { mesh, cx, cz, rev: c.rev, chunk: c });
        this.stats.built++;
    }

    /** Geometry of a chunk's grass and flowers (pure: positions, colours, sway, glow). */
    chunkGeometry(c) {
        const out = buildFlora(this.data, c);
        this.stats.blades = out.count;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(out.pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(out.nor, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(out.col, 3));
        geo.setAttribute('sway', new THREE.BufferAttribute(out.sway, 1));
        geo.setAttribute('glow', new THREE.BufferAttribute(out.glow, 1));
        geo.computeBoundingSphere();
        return geo;
    }

    dispose() {
        for (const [key, e] of this.meshes) this._drop(key, e);
        this.material.dispose();
        this.terrain.group.remove(this.group);
    }
}

const _buf = { pos: null, nor: null, col: null, sway: null, glow: null };

/**
 * The blades and flowers of a chunk (node-testable). Returns typed arrays (non-indexed triangles)
 * and `count` — how many tufts and flowers.
 */
export function buildFlora(data, c) {
    const seed = data.seed | 0, B = c.blocks, x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    const MAXV = CHUNK * CHUNK * 30; // (two tufts of five blades at most a block; a flower: 3 + 24)
    if (!_buf.pos || _buf.pos.length < MAXV * 3) {
        _buf.pos = new Float32Array(MAXV * 3); _buf.nor = new Float32Array(MAXV * 3); _buf.col = new Float32Array(MAXV * 3);
        _buf.sway = new Float32Array(MAXV); _buf.glow = new Float32Array(MAXV);
    }
    const P = _buf.pos, N = _buf.nor, C = _buf.col, S = _buf.sway, G = _buf.glow;
    let v = 0, count = 0;
    const hidden = data._hidden?.get(chunkKey(c.cx, c.cz)) || null;
    // one vertex: position, an upward normal (lit like the ground under it), colour, sway, glow
    const vert = (x, y, z, r, g, b, s, gl) => {
        P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
        N[v * 3] = 0; N[v * 3 + 1] = 1; N[v * 3 + 2] = 0;
        C[v * 3] = r; C[v * 3 + 1] = g; C[v * 3 + 2] = b;
        S[v] = s; G[v] = gl;
        v++;
    };
    for (let lz = 0; lz < CHUNK; lz++) {
        for (let lx = 0; lx < CHUNK; lx++) {
            const col = lz * CHUNK + lx, L = c.top[col];
            if (L < MIN_LAYER + 1) continue;
            const i = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
            if (B[i] !== BLOCK.GRASS || (hidden && hidden.has(i))) continue;
            const above = B[i + CHUNK * CHUNK];
            if (above !== BLOCK.AIR && above !== undefined) continue; // (snow, a slab, water on it)
            const x = x0 + lx, z = z0 + lz;
            const bio = BIOMES[c.bio ? c.bio[col] : 0];
            const r = hashLand(x, z, seed + 501);
            const fl = bio.flowers, tall = bio.tall;
            const y = L - 0.5; // (the block's top face)
            const g = c.grass ? c.grass[col] : 0x4caf50;
            const gr = ((g >> 16) & 255) / 255, gg = ((g >> 8) & 255) / 255, gb = (g & 255) / 255;
            if (r < fl[0] * (0.3 + 1.5 * patch(x - 77, z + 41, seed))) { // (flowers grow in drifts)
                // a flower: a thin stem and a small head of two crossed petals' quads
                const k = 1 + Math.floor(hashLand(x, z, seed + 502) * (fl.length - 1));
                const fc = fl[k], fr = ((fc >> 16) & 255) / 255, fg = ((fc >> 8) & 255) / 255, fb = (fc & 255) / 255;
                const ox = x + (hashLand(z, x, seed + 503) - 0.5) * 0.6, oz = z + (hashLand(x + 3, z - 5, seed + 504) - 0.5) * 0.6;
                const h = 0.32 + 0.35 * hashLand(x - 7, z + 2, seed + 505);
                const a = hashLand(x + 11, z, seed + 506) * Math.PI;
                const ca = Math.cos(a) * 0.035, sa = Math.sin(a) * 0.035;
                vert(ox - ca, y, oz - sa, gr * 0.6, gg * 0.6, gb * 0.6, 0, 0);
                vert(ox + ca, y, oz + sa, gr * 0.6, gg * 0.6, gb * 0.6, 0, 0);
                vert(ox, y + h, oz, gr * 0.9, gg * 0.9, gb * 0.9, h, 0);
                const gl = bio.glow ? 1 : 0, s = 0.09 + 0.05 * hashLand(x, z - 9, seed + 507), yh = y + h;
                // the head: an open blossom (four petals round the middle, seen from above as from
                // the side) — a flat star tilted a little towards the sun, and a small cross through it
                for (let q = 0; q < 4; q++) {
                    const b = a + q * Math.PI / 2, cb = Math.cos(b), sb = Math.sin(b);
                    const px = ox + cb * s * 1.6, pz = oz + sb * s * 1.6;
                    vert(ox, yh, oz, fr * 0.75, fg * 0.75, fb * 0.75, h, gl);
                    vert(ox - sb * s * 0.8 + cb * s * 0.5, yh + 0.03, oz + cb * s * 0.8 + sb * s * 0.5, fr, fg, fb, h + 0.05, gl);
                    vert(px, yh + 0.06, pz, fr, fg, fb, h + 0.08, gl);
                    vert(ox, yh, oz, fr * 0.75, fg * 0.75, fb * 0.75, h, gl);
                    vert(px, yh + 0.06, pz, fr, fg, fb, h + 0.08, gl);
                    vert(ox + sb * s * 0.8 + cb * s * 0.5, yh + 0.03, oz - cb * s * 0.8 + sb * s * 0.5, fr, fg, fb, h + 0.05, gl);
                }
                count++;
            } else {
                // tufts: blades leaning out from a root, of the land's height and colour — thicker and
                // taller in patches, thinner in others (one or two tufts a block)
                const pt = patch(x, z, seed), share = tall[0] * (0.35 + 1.1 * pt);
                const n = r < fl[0] + share * 0.45 ? 2 : r < fl[0] + share ? 1 : 0;
                for (let t = 0; t < n; t++) {
                    const k = hashLand(x + t * 7, z, seed + 511);
                    const H = (tall[1] + (tall[2] - tall[1]) * k * k) * (0.65 + 0.7 * patch(x + 50, z - 50, seed));
                    const ox = x + (hashLand(z, x + t, seed + 512) - 0.5) * 0.7, oz = z + (hashLand(x - 3, z + 5 + t, seed + 513) - 0.5) * 0.7;
                    const tone = 0.88 + 0.28 * hashLand(x + 1, z + 1 + t, seed + 514);
                    const nb = 4 + (k > 0.5 ? 1 : 0);
                    for (let q = 0; q < nb; q++) {
                        const a = (hashLand(x + q * 17, z - q * 13 + t, seed + 515) * 0.6 + q / nb) * Math.PI * 2;
                        const w = 0.06 + 0.035 * hashLand(x - q, z + q, seed + 516);
                        const lean = 0.15 + 0.3 * hashLand(x + q, z + t, seed + 517);
                        const dx = Math.cos(a), dz = Math.sin(a), h = H * (0.65 + 0.45 * hashLand(q, x + z + t, seed + 518));
                        const bx = ox + dx * 0.06, bz = oz + dz * 0.06;
                        vert(bx - dz * w, y, bz + dx * w, gr * 0.7 * tone, gg * 0.74 * tone, gb * 0.7 * tone, 0, 0);
                        vert(bx + dz * w, y, bz - dx * w, gr * 0.7 * tone, gg * 0.74 * tone, gb * 0.7 * tone, 0, 0);
                        vert(bx + dx * lean * h, y + h, bz + dz * lean * h, Math.min(1, gr * 1.22 * tone), Math.min(1, gg * 1.16 * tone), Math.min(1, gb * 1.08 * tone), h, 0);
                    }
                    count++;
                }
            }
        }
    }
    return { pos: P.slice(0, v * 3), nor: N.slice(0, v * 3), col: C.slice(0, v * 3), sway: S.slice(0, v), glow: G.slice(0, v), count, verts: v };
}

/** Patches of thicker, taller grass and of thinner (0…1, smooth over ~10 m; hashed lattice). */
function patch(x, z, seed) {
    const X = x / 9, Z = z / 9, ix = Math.floor(X), iz = Math.floor(Z), fx = X - ix, fz = Z - iz;
    const u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
    const a = hashLand(ix, iz, seed + 520), b = hashLand(ix + 1, iz, seed + 520), c = hashLand(ix, iz + 1, seed + 520), d = hashLand(ix + 1, iz + 1, seed + 520);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
