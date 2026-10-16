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
import { CHUNK, chunkKey } from './Terrain.js';
import { buildFlora } from './FloraBuild.js';
import { applySkyComp } from './VoxelShading.js';

export { buildFlora }; // (the blades themselves: FloraBuild.js — no THREE there, so a worker can make them too)

export const FLORA = {
    RADIUS: 70, // m round the player
    BUILD_PER_FRAME: 2, // chunks
    BUDGET_MS: 2.5,
};

const WIND = { time: { value: 0 } };

export class Flora {
    /** @param {import('./TerrainView.js').Terrain} terrain */
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
        // made by a terrain worker (a chunk as it was generated — the same blades as here): in now
        const T = this.terrain;
        if (T.floraAsync) {
            // (a few milliseconds a frame: in flight a whole row of chunks' grass came back at once)
            const done = T.takeFlora(), tb = performance.now();
            let k = 0;
            for (; k < done.length && (k === 0 || performance.now() - tb < FLORA.BUDGET_MS); k++) {
                const r = done[k];
                const w = want.find((x) => x.key === r.key);
                // (made from the chunk as it was changed here: only if it has not changed again since)
                if (w && (r.rev === undefined ? this._pristine(w) : r.rev === (w.c.rev || 0))) { this._build(w, r.out); want.splice(want.indexOf(w), 1); }
            }
            if (k < done.length) T.putBackFlora(done.slice(k));
        }
        if (!want.length) return;
        want.sort((a, b) => a.d - b.d);
        const t0 = performance.now();
        let n = 0;
        for (const w of want) {
            // (a worker makes its blades: untouched ground as generated, changed ground from this computer's data)
            if (!all && T.floraAsync) { T.askFlora(w.key, w.cx, w.cz, this._pristine(w) ? null : w.c); if (performance.now() - t0 > FLORA.BUDGET_MS) break; continue; }
            this._build(w);
            n++;
            if (!all && (n >= FLORA.BUILD_PER_FRAME || performance.now() - t0 > FLORA.BUDGET_MS)) break;
        }
    }

    /** A chunk as it was generated (nothing dug, built or falling there): a worker's copy is the same. */
    _pristine(w) {
        return !w.c.modified && !this.data._hidden?.has(w.key);
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
    _build({ key, cx, cz, c }, out = null) {
        const old = this.meshes.get(key);
        if (old) this._drop(key, old);
        const geo = this.chunkGeometry(c, out);
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
    chunkGeometry(c, out = null) {
        out = out || buildFlora(this.data, c);
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
