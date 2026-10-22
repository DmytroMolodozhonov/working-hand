/**
 * UltraGrass.js — the soft lawn of «Ультра качество»: thousands of thin curved blades on every
 * grass block round the player (as in Minecraft's best shader packs), thick near, thinning out
 * smoothly further away; gusts of wind roll over them in waves, each blade flutters on its own,
 * the sun shines through them from behind, and they bend aside under the hero's feet.
 *
 * Purely a look (like Flora.js): not blocks, nothing collides with them, spells and hands pass through.
 * Cheap to draw: one blade shape (9 points) shared by all, drawn as instances — one draw call per
 * chunk (a fixed pool of chunk slots, made once: nothing piles up in a long game). A chunk's blades
 * are made a little a frame (a time budget); with the mode off nothing is made, drawn or updated.
 * The blades follow the ground: a chunk dug, burnt or built over (its `rev`) is made again.
 */
import * as THREE from 'three';
import { BLOCK, CHUNK, MIN_LAYER, chunkKey } from './Terrain.js';
import { hashLand } from './Landscape.js';
import { applySkyComp } from './VoxelShading.js';
import { ULTRA } from '../fx/UltraUniforms.js';

export const ULTRA_GRASS = {
    NEAR: 8, // m: full thickness up to here
    FAR: 30, // m: none beyond (the blades past ~25 m are a pixel or two: 34 m cost a fifth more vertices for nothing seen)
    PASSES: 4, // a chunk's blades in 4 even layers (so the near part of the list is an even, thinner lawn)
    PER_PASS: 2, // blades a block in each layer (8 a block near)
    SLOTS: 16, // chunks drawn at most (CHUNK = 32 m: all that touch the circle)
    BUDGET_MS: 1.5,
};
const CAP = CHUNK * CHUNK * ULTRA_GRASS.PASSES * ULTRA_GRASS.PER_PASS;
const SEG = 4; // the blade's segments (a gentle curve)

/** How thick the lawn is at a distance (0…1; the same in the shader). */
export function grassDensity(d) {
    const { NEAR, FAR } = ULTRA_GRASS;
    const t = Math.max(0, Math.min(1, (d - NEAR) / (FAR - NEAR)));
    return 1 + (0.1 - 1) * t * t * (3 - 2 * t);
}

/** The blade: x = side (−1…1), y = height share (0 root … 1 tip). */
function bladeShape() {
    const pos = [], idx = [];
    for (let s = 0; s < SEG; s++) { const t = s / SEG; pos.push(-1, t, 0, 1, t, 0); }
    pos.push(0, 1, 0);
    for (let s = 0; s < SEG - 1; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const a = (SEG - 1) * 2;
    idx.push(a, a + 1, SEG * 2);
    return { pos: new THREE.Float32BufferAttribute(pos, 3), idx: new THREE.Uint16BufferAttribute(idx, 1) };
}

export class UltraGrass {
    /** @param {import('./TerrainView.js').Terrain} terrain */
    constructor(terrain) {
        this.terrain = terrain;
        this.data = terrain.data;
        this.group = new THREE.Group();
        this.group.name = 'ultra-grass';
        this.group.visible = false;
        terrain.group.add(this.group);
        this.material = this._material();
        const shape = bladeShape();
        this.slots = [];
        for (let i = 0; i < ULTRA_GRASS.SLOTS; i++) this.slots.push(this._slot(shape));
        this.used = new Map(); // chunk key → slot
        this._job = null;
        this._cols = new Float32Array(CHUNK * CHUNK * 5); // (a chunk's grass columns: x, y, z, colour, height)
        this.stats = { built: 0, blades: 0 };
    }

    _slot(shape) {
        const geo = new THREE.InstancedBufferGeometry();
        geo.setIndex(shape.idx);
        geo.setAttribute('position', shape.pos);
        const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
        const b = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
        const c = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
        for (const at of [a, b, c]) at.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('iA', a);
        geo.setAttribute('iB', b);
        geo.setAttribute('iC', c);
        geo.instanceCount = 0;
        geo.userData.keep = true; // (the pool: never thrown away — Game.prewarm draws one blade of it)
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), CHUNK);
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.visible = false;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.raycast = () => {}; // (not a thing to hit)
        mesh.userData.isFlora = true;
        this.group.add(mesh);
        return { mesh, geo, a, b, c, key: null, cx: 0, cz: 0, rev: -1, chunk: null, n: 0, passEnd: new Int32Array(ULTRA_GRASS.PASSES) };
    }

    _material() {
        const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
        const R = (this._rangeU = { value: new THREE.Vector2(ULTRA_GRASS.NEAR, ULTRA_GRASS.FAR) });
        m.onBeforeCompile = (shader) => {
            shader.uniforms.uUltraTime = ULTRA.time;
            shader.uniforms.uUltraPlayer = ULTRA.player;
            shader.uniforms.uGrassR = R;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>
attribute vec4 iA; // root x, y, z; rank (0…1: which thinning hides it first)
attribute vec4 iB; // facing, height, width, lean
attribute vec3 iC; // colour
uniform float uUltraTime;
uniform vec3 uUltraPlayer;
uniform vec2 uGrassR;
float gT;`)
                .replace('#include <beginnormal_vertex>', `
gT = position.y;
vec3 gRoot = iA.xyz;
float gD = distance(gRoot.xz, cameraPosition.xz);
float gDens = mix(1.0, 0.1, smoothstep(uGrassR.x, uGrassR.y, gD));
float gKeep = smoothstep(iA.w, iA.w + 0.12, gDens) * (1.0 - smoothstep(uGrassR.y * 0.8, uGrassR.y, gD));
float gH = iB.y * gKeep;
vec2 gAcross = vec2(cos(iB.x), sin(iB.x));
vec2 gFwd = vec2(-gAcross.y, gAcross.x);
// the wind: gusts roll over the meadow in waves; each blade flutters on its own
float gGust = pow(0.5 + 0.5 * sin(dot(gRoot.xz, vec2(0.11, 0.07)) - uUltraTime * 1.25), 3.0);
float gFl = sin(uUltraTime * 2.6 + iA.w * 37.0 + gRoot.x * 0.8 + gRoot.z * 0.6);
vec2 gBend = gFwd * iB.w + vec2(0.84, 0.54) * (0.1 + 0.6 * gGust) + gFwd * gFl * 0.09 + vec2(0.54, -0.84) * gFl * 0.04;
// the feet push it aside
vec2 gAway = gRoot.xz - uUltraPlayer.xz;
float gPd = length(gAway);
float gPush = (1.0 - smoothstep(0.2, 0.85, gPd)) * (1.0 - step(1.6, abs(gRoot.y - uUltraPlayer.y)));
gBend += gAway / max(gPd, 1e-3) * gPush * 1.3;
float gBl = length(gBend);
if (gBl > 1.3) gBend *= 1.3 / gBl;
vec3 objectNormal = normalize(vec3(gFwd.x * 0.3 + gBend.x * 0.25, 1.0, gFwd.y * 0.3 + gBend.y * 0.25));
#ifdef USE_TANGENT
vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif`)
                .replace('#include <begin_vertex>', `
float gC = gT * gT;
vec3 transformed = gRoot + vec3(gAcross.x, 0.0, gAcross.y) * position.x * iB.z * (1.0 - gT * 0.8) + vec3(gBend.x, 0.0, gBend.y) * gC * gH;
transformed.y += gT * gH * (1.0 - 0.32 * min(1.0, dot(gBend, gBend)) * gT);`)
                .replace('#include <color_vertex>', 'vColor = iC * mix(0.48, 1.12, gT); // (dark at the root, in the lawn\'s own shade; light at the tip)')
                .replace('#include <lights_lambert_vertex>', `#include <lights_lambert_vertex>
#if NUM_DIR_LIGHTS > 0
{
    // the sun shines through the thin blades seen against it (warm, at the tips most)
    float gS = pow(max(dot(normalize(mvPosition.xyz), directionalLights[0].direction), 0.0), 3.0);
    vLightFront += directionalLights[0].color * vec3(1.0, 0.95, 0.65) * gS * gT * 0.6;
}
#endif`);
            shader.fragmentShader = shader.fragmentShader
                // (a blade is lit like the ground it grows from, from either side)
                .replace('( gl_FrontFacing ) ? vIndirectFront : vIndirectBack', 'vIndirectFront')
                .replace('( gl_FrontFacing ) ? vLightFront : vLightBack', 'vLightFront');
        };
        m.customProgramCacheKey = () => 'ultra-grass';
        return applySkyComp(m);
    }

    /** One blade to compile its shader on the loading screen (Game.prewarm). */
    sampleModel() {
        const s = this.slots[0];
        s.a.array.set([0, -1000, 0, 0]);
        s.b.array.set([0, 0.3, 0.04, 0.2]);
        s.c.array.set([0.3, 0.6, 0.2]);
        s.geo.instanceCount = 1;
        const m = new THREE.Mesh(s.geo, this.material);
        m.frustumCulled = false;
        return m;
    }

    setVisible(on) {
        this.group.visible = on;
        if (!on) { for (const s of this.slots) this._free(s); this._job = null; }
    }

    _free(s) {
        if (s.key) this.used.delete(s.key);
        s.key = null; s.chunk = null; s.rev = -1; s.n = 0;
        s.geo.instanceCount = 0;
        s.mesh.visible = false;
    }

    _chunkDist(cx, cz, p) {
        const x0 = cx * CHUNK - 0.5, z0 = cz * CHUNK - 0.5;
        const dx = Math.max(x0 - p.x, 0, p.x - (x0 + CHUNK)), dz = Math.max(z0 - p.z, 0, p.z - (z0 + CHUNK));
        return Math.sqrt(dx * dx + dz * dz);
    }

    /** @param {{x:number, y:number, z:number}} focus  the camera (the lawn is round it) */
    update(focus) {
        if (!this.group.visible || !focus) return;
        const R = ULTRA_GRASS.FAR;
        // let go of the chunks left behind; the ones whose ground changed are made again
        for (const s of this.slots) {
            if (!s.key) continue;
            const d = this._chunkDist(s.cx, s.cz, focus);
            const c = this.data.hasChunk(s.cx, s.cz) ? this.data.chunk(s.cx, s.cz) : null;
            if (d > R + 4 || !c) { if (this._job?.slot === s) this._job = null; this._free(s); continue; }
            if (this._job?.slot === s) continue; // (being made: it keeps what it showed)
            if ((c !== s.chunk || c.rev !== s.rev) && !this._job) { this._start(s, c); continue; }
            // (how much of its list is drawn: only the layers thick enough at its nearest point)
            const P = ULTRA_GRASS.PASSES, need = Math.min(P, Math.ceil((grassDensity(d) + 0.12) * P));
            s.geo.instanceCount = s.n ? s.passEnd[need - 1] : 0;
        }
        if (!this._job) {
            // the nearest chunk without its lawn
            const rc = Math.ceil(R / CHUNK) + 1, ccx = Math.floor(focus.x / CHUNK), ccz = Math.floor(focus.z / CHUNK);
            let best = null, bd = Infinity;
            for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
                const cx = ccx + dx, cz = ccz + dz, key = chunkKey(cx, cz);
                if (this.used.has(key)) continue;
                const d = this._chunkDist(cx, cz, focus);
                if (d > R || d >= bd) continue;
                if (!this.data.hasChunk(cx, cz) || !this.terrain.meshes.has(key)) continue; // (its ground first)
                best = { cx, cz, key }; bd = d;
            }
            const free = best && this.slots.find((s) => !s.key);
            if (free) {
                free.key = best.key; free.cx = best.cx; free.cz = best.cz;
                this.used.set(best.key, free);
                this._start(free, this.data.chunk(best.cx, best.cz));
            }
        }
        if (this._job) this._work(ULTRA_GRASS.BUDGET_MS);
    }

    _start(slot, c) {
        this._job = { slot, c, rev: c.rev, step: -1, p: 0, i: 0, n: 0, cols: 0 };
    }

    /** Make the job's blades for at most `ms` (a chunk takes a few frames). */
    _work(ms) {
        const j = this._job, s = j.slot, c = j.c, t0 = performance.now();
        const seed = this.data.seed | 0, x0 = c.cx * CHUNK, z0 = c.cz * CHUNK, COL = this._cols;
        if (j.step < 0) {
            // the chunk's grass blocks open to the sky
            const B = c.blocks, hidden = this.data._hidden?.get(chunkKey(c.cx, c.cz)) || null;
            let n = 0;
            for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
                const col = lz * CHUNK + lx, L = c.top[col];
                if (L < MIN_LAYER + 1) continue;
                const i = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
                if (B[i] !== BLOCK.GRASS || (hidden && hidden.has(i))) continue;
                const above = B[i + CHUNK * CHUNK];
                if (above !== BLOCK.AIR && above !== undefined) continue; // (snow, a slab, water on it)
                const x = x0 + lx, z = z0 + lz;
                COL[n * 5] = x; COL[n * 5 + 1] = L - 0.5; COL[n * 5 + 2] = z;
                COL[n * 5 + 3] = c.grass ? c.grass[col] : 0x4caf50;
                // (a soft lawn, taller in patches)
                COL[n * 5 + 4] = 0.26 + 0.36 * patch(x, z, seed);
                n++;
            }
            j.cols = n; j.step = 0;
            if (performance.now() - t0 > ms) return;
        }
        const A = s.a.array, Bb = s.b.array, C = s.c.array, P = ULTRA_GRASS.PASSES, K = ULTRA_GRASS.PER_PASS;
        let y0 = Infinity, y1 = -Infinity;
        while (j.p < P) {
            for (; j.i < j.cols; j.i++) {
                if ((j.i & 15) === 15 && performance.now() - t0 > ms) { j.y0 = Math.min(j.y0 ?? Infinity, y0); j.y1 = Math.max(j.y1 ?? -Infinity, y1); return; }
                const o = j.i * 5, x = COL[o], y = COL[o + 1], z = COL[o + 2], g = COL[o + 3], hb = COL[o + 4];
                const gr = ((g >> 16) & 255) / 255, gg = ((g >> 8) & 255) / 255, gb = (g & 255) / 255;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
                for (let k = 0; k < K; k++) {
                    const q = j.p * K + k, n = j.n;
                    const h1 = hashLand(x + q * 31, z - q * 17, seed + 601), h2 = hashLand(z + q * 13, x + q * 7, seed + 602);
                    const h3 = hashLand(x - q * 5, z + q * 23, seed + 603), h4 = hashLand(x + q * 3, z + q * 11, seed + 604);
                    A[n * 4] = x + h1 - 0.5; A[n * 4 + 1] = y; A[n * 4 + 2] = z + h2 - 0.5;
                    A[n * 4 + 3] = (j.p + h3) / P; // (its rank: the later layers thin out first)
                    Bb[n * 4] = h4 * Math.PI * 2;
                    Bb[n * 4 + 1] = hb * (0.65 + 0.8 * h3 * h1);
                    Bb[n * 4 + 2] = 0.035 + 0.03 * h2;
                    Bb[n * 4 + 3] = 0.12 + 0.3 * h1;
                    const tone = 0.82 + 0.34 * h2, dry = h4 > 0.9 ? 0.25 : 0; // (now and then a dry, yellowish blade)
                    C[n * 3] = Math.min(1, gr * tone * (1 + dry * 1.2) + dry * 0.12);
                    C[n * 3 + 1] = Math.min(1, gg * tone * (1 + dry * 0.3));
                    C[n * 3 + 2] = Math.min(1, gb * tone * (1 - dry * 0.4));
                    j.n++;
                }
            }
            s.passEnd[j.p] = j.n;
            j.p++; j.i = 0;
        }
        y0 = Math.min(y0, j.y0 ?? Infinity); y1 = Math.max(y1, j.y1 ?? -Infinity);
        // in: only what was filled goes to the graphics card
        for (const [at, w] of [[s.a, 4], [s.b, 4], [s.c, 3]]) { at.updateRange.offset = 0; at.updateRange.count = j.n * w; at.needsUpdate = true; }
        s.n = j.n; s.chunk = c; s.rev = c.rev;
        const bs = s.geo.boundingSphere;
        if (j.n) bs.center.set(x0 + CHUNK / 2 - 0.5, (y0 + y1) / 2 + 0.3, z0 + CHUNK / 2 - 0.5);
        bs.radius = CHUNK * 0.72 + (j.n ? (y1 - y0) / 2 + 1 : 0);
        s.mesh.visible = j.n > 0;
        this.stats.built++;
        this.stats.blades = j.n;
        this._job = null;
    }

    dispose() {
        for (const s of this.slots) s.geo.dispose();
        this.material.dispose();
        this.terrain.group.remove(this.group);
    }
}

/** Patches of taller and shorter lawn (0…1, smooth over ~7 m). */
function patch(x, z, seed) {
    const X = x / 7, Z = z / 7, ix = Math.floor(X), iz = Math.floor(Z), fx = X - ix, fz = Z - iz;
    const u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
    const a = hashLand(ix, iz, seed + 620), b = hashLand(ix + 1, iz, seed + 620), c = hashLand(ix, iz + 1, seed + 620), d = hashLand(ix + 1, iz + 1, seed + 620);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
