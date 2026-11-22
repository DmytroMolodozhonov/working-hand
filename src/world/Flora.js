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
import { applySkyComp, SKY_LIGHT } from './VoxelShading.js';
import { ULTRA } from '../fx/UltraUniforms.js';
import { CLOUD_SHADE_GLSL, addCloudUniforms } from './CloudShade.js';
import { grassAtlas } from './GrassAtlas.js';
import { TrampleField, TRAMPLE_GLSL } from './TrampleField.js';

export { buildFlora }; // (the blades themselves: FloraBuild.js — no THREE there, so a worker can make them too)

export const FLORA = {
    RADIUS: 56, // m round the player (21.11: 70 → 56 — the tall kinds past ~50 m are a few pixels; the triangles cost — creativebench)
    COVER_R: 32, // m: the dense cover (the sward, turf, clover, moss) — drawn this far, melting away towards it (creativebench: triangles)
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
        this.trample = new TrampleField();
        this.material = this._material();
        this.bushDepth = this._bushDepth();
        this.puddleMat = this._puddleMaterial();
        this.feet = null; // (Game: a function that hands every walker near the player to press(x, z, r, vx, vz) — TrampleField.js)
        this.group = new THREE.Group();
        this.group.name = 'flora';
        terrain.group.add(this.group);
        this.meshes = new Map(); // chunk key → { mesh, cx, cz, rev, chunk }
        this._center = { x: 1e9, z: 1e9 };
        this._t = 0;
        this.stats = { built: 0, blades: 0 };
    }

    _material() {
        // (the author 21.11: the grass a real part of the game — 20 painted kinds in one atlas, GrassAtlas.js; cards cut out by the picture's alpha)
        const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: grassAtlas(), alphaTest: 0.5 });
        const center = (this._centerU = { value: new THREE.Vector3() });
        const radius = (this._radiusU = { value: this.radius });
        const tr = this.trample.uniforms;
        m.onBeforeCompile = (shader) => {
            shader.uniforms.uWind = WIND.time;
            shader.uniforms.uCornerShade = SKY_LIGHT.shade;
            shader.uniforms.uGreenSat = SKY_LIGHT.greenSat;
            shader.uniforms.uAerial = SKY_LIGHT.aerial;
            addCloudUniforms(shader);
            shader.uniforms.uFloraCenter = center;
            shader.uniforms.uFloraR = radius;
            shader.uniforms.uUltraOn = ULTRA.on;
            shader.uniforms.uUltraTime = ULTRA.time;
            shader.uniforms.uSunDir = ULTRA.sunDir;
            shader.uniforms.uSunCol = ULTRA.sunCol;
            shader.uniforms.uSunVis = ULTRA.sunVis;
            shader.uniforms.uTrample = tr.tex;
            shader.uniforms.uTrampleO = tr.origin;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nattribute float sway;\nattribute float glow;\nattribute vec2 grow;\nvarying float vGlow;\nvarying float vBlade;\nvarying vec2 vFloraXZ;\nvarying vec3 vFloraView;\nuniform float uWind;\nuniform float uUltraOn;\nuniform float uUltraTime;\nuniform vec3 uFloraCenter;\nuniform float uFloraR;\n' + TRAMPLE_GLSL)
                .replace('#include <begin_vertex>', `#include <begin_vertex>
vGlow = glow;
vBlade = clamp(sway / max(0.25, sway + 0.25), 0.0, 1.0) * step(0.001, sway); // (0 at the root … towards 1 up the plant)
{
    vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vFloraXZ = wp.xz;
    float d = distance(wp.xz, uFloraCenter.xz);
    // far away the plants thin out by their rank (the cover last), then all shrink into the ground at the edge: no popping
    float far = 1.0 - smoothstep(uFloraR * 0.72, uFloraR, d);
    float keep = 1.0 - smoothstep(uFloraR * 0.3, uFloraR * 0.9, d) * 0.8, rank = grow.y;
    if (rank >= 2.0) { rank -= 2.0; keep = 1.0 - smoothstep(${(FLORA.COVER_R * 0.45).toFixed(1)}, ${(FLORA.COVER_R * 0.95).toFixed(1)}, d); } // (the cover: thinner and thinner, gone by COVER_R)
    if (rank > keep) far = 0.0;
    transformed.y -= sway * (1.0 - far) * 1.05;
    float flex = grow.x, s = sway * sway;
    // the wind: a steady sway and gusts rolling over the meadow in waves (stronger with «Ультра»); limp kinds most, reeds little
    float w = sin(uWind * 1.7 + wp.x * 0.37 + wp.z * 0.21) + 0.45 * sin(uWind * 3.1 + wp.x * 1.3 - wp.z * 0.9);
    w += 0.9 * pow(0.5 + 0.5 * sin(dot(wp.xz, vec2(0.11, 0.07)) - uWind * 1.1), 3.0);
    if (uUltraOn > 0.5) w = w * 0.6 + 1.6 * pow(0.5 + 0.5 * sin(dot(wp.xz, vec2(0.11, 0.07)) - uUltraTime * 1.25), 3.0);
    float bend = s * (0.04 + 0.1 * flex) * far;
    transformed.x += w * bend;
    transformed.z += w * bend * 0.65;
    // the walkers: pressed aside and flattened where someone goes (TrampleField.js), the tips most
    vec3 tp = trampleAt(wp.xz);
    float hk = min(sway, 1.4);
    transformed.xz += tp.xy * tp.z * hk * (0.35 + 0.55 * flex) * far;
    transformed.y -= tp.z * sway * (0.25 + 0.4 * flex);
    vFloraView = wp - cameraPosition;
}`);
            shader.fragmentShader = shader.fragmentShader
                // (a plant is lit like the ground it grows from, from either side — not dark from behind)
                .replace('( gl_FrontFacing ) ? vIndirectFront : vIndirectBack', 'vIndirectFront')
                .replace('( gl_FrontFacing ) ? vLightFront : vLightBack', 'vLightFront')
                .replace('#include <common>', '#include <common>\nvarying float vGlow;\nvarying float vBlade;\nvarying vec2 vFloraXZ;\nvarying vec3 vFloraView;\nuniform float uCornerShade;\nuniform float uGreenSat;\nuniform float uAerial;\nuniform vec3 uSunDir;\nuniform vec3 uSunCol;\nuniform float uSunVis;\n' + CLOUD_SHADE_GLSL)
                // the flowers (uv −1) have no picture: their colour is their vertices'
                .replace('#include <map_fragment>', `#ifdef USE_MAP
vec4 texelColor = vUv.x < 0.0 ? vec4(1.0) : texture2D(map, vUv);
texelColor.rgb /= max(texelColor.a, 0.004); // (the atlas is premultiplied: the true colour back, no black fringe)
texelColor = mapTexelToLinear(texelColor);
diffuseColor *= texelColor;
// (crisp edges at every distance: the alpha sharpened by its own screen-space change — the blades do not melt away with the mipmaps)
diffuseColor.a = vUv.x < 0.0 ? 1.0 : clamp((diffuseColor.a - 0.5) / max(fwidth(diffuseColor.a), 0.0001) + 0.5, 0.0, 1.0);
#endif`)
                .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= mix(0.8, 1.0, vBlade); // (deep in the tuft its own blades shade it — the picture has its own foot shade too)
diffuseColor.rgb *= mix(1.0, cloudShade(vFloraXZ), 0.75); // (a cloud's shadow passes over the grass with the ground under it)
{ float aer = smoothstep(30.0, 230.0, length(vFloraView)) * 0.42 * uAerial; float al = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(al) * vec3(0.84, 0.93, 1.1), aer); } // (the same air as over the land)`)
                .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vGlow * 0.55; // (the moonlit groves' flowers glow)
// the sun shining through the blades from behind (looking towards a low sun the meadow lights up gold-green at its tips)
float back = pow(max(dot(normalize(vFloraView), normalize(uSunDir)), 0.0), 5.0) * uSunVis * vBlade;
totalEmissiveRadiance += diffuseColor.rgb * uSunCol * back * 0.4;`);
        };
        m.extensions = { ...(m.extensions || {}), derivatives: true };
        m.customProgramCacheKey = () => 'flora-atlas';
        return applySkyComp(m);
    }

    /** The bushes' shadow: the same cut-out picture (a bush's shadow is leafy, not a box). */
    _bushDepth() {
        return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: grassAtlas(), alphaTest: 0.5, side: THREE.DoubleSide });
    }

    /** A puddle: dark water mirroring the sky, its soft edge; after rain (ULTRA.wet) it spreads to its full size, drying it shrinks. */
    _puddleMaterial() {
        const m = new THREE.MeshLambertMaterial({ color: 0x2c3a42, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        m.onBeforeCompile = (shader) => {
            shader.uniforms.uWet = ULTRA.wet;
            shader.uniforms.uZen = ULTRA.zenith;
            shader.uniforms.uHor = ULTRA.horizon;
            shader.uniforms.uSunDir = ULTRA.sunDir;
            shader.uniforms.uSunCol = ULTRA.sunCol;
            shader.uniforms.uSunVis = ULTRA.sunVis;
            shader.uniforms.uT = ULTRA.time;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nattribute vec2 pr;\nvarying vec2 vPr;\nvarying vec3 vPW;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPr = pr;\nvPW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nuniform float uWet;\nuniform vec3 uZen;\nuniform vec3 uHor;\nuniform vec3 uSunDir;\nuniform vec3 uSunCol;\nuniform float uSunVis;\nuniform float uT;\nvarying vec2 vPr;\nvarying vec3 vPW;')
                .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
    // the shore of the puddle wanders (not a circle); it fills after rain and shrinks as the land dries
    float a = atan(vPr.y, vPr.x), r = length(vPr);
    float edge = (0.5 + 0.5 * uWet) * (0.82 + 0.1 * sin(a * 3.0 + vPW.x) + 0.06 * sin(a * 7.0 + vPW.z));
    if (r > edge) discard;
    float rim = smoothstep(edge, edge - 0.18, r);
    vec3 V = normalize(vPW - cameraPosition);
    float fres = 0.25 + 0.75 * pow(1.0 - abs(V.y), 4.0);
    vec3 sky = mix(uHor, uZen, clamp(-V.y * 1.4, 0.0, 1.0));
    // rain rings on it while it rains
    vec2 cell = floor(vPW.xz * 2.0); float ph = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float ring = uWet * smoothstep(0.08, 0.0, abs(length(fract(vPW.xz * 2.0) - 0.5) - fract(uT * 0.8 + ph) * 0.5)) * (1.0 - fract(uT * 0.8 + ph));
    vec3 R = reflect(V, vec3(0.0, 1.0, 0.0));
    float glint = pow(max(dot(R, normalize(uSunDir)), 0.0), 220.0) * uSunVis * 3.0;
    totalEmissiveRadiance += sky * fres * 0.42 + uSunCol * glint + vec3(0.6) * ring * 0.25; // (a dark mirror: the sky in it is dimmer than the sky)
    diffuseColor.a = rim * (0.55 + 0.35 * fres);
}`);
        };
        m.customProgramCacheKey = () => 'flora-puddle';
        return m;
    }

    /** The shapes to compile on the loading screen (Game.prewarm): a card, a bush with its leafy shadow, a puddle. */
    sampleModels() {
        const g = new THREE.Group();
        const one = this.chunkGeometry(null, sampleOut());
        const a = new THREE.Mesh(one, this.material); a.receiveShadow = true; a.frustumCulled = false; g.add(a);
        const b = new THREE.Mesh(one, this.material); b.castShadow = true; b.receiveShadow = true; b.customDepthMaterial = this.bushDepth; b.frustumCulled = false; g.add(b);
        const p = new THREE.Mesh(this._puddleGeometry(new Float32Array([0, -1000, 0, 1])), this.puddleMat); p.receiveShadow = true; p.frustumCulled = false; g.add(p);
        g.position.y = -1000;
        return g;
    }

    /** One blade, to compile the shader on the loading screen (Game.prewarm): the first meadow made it in play. */
    sampleModel() { return this.sampleModels(); }

    /** @param {{x:number, z:number}} focus  the player */
    update(focus, all = false) {
        const now = performance.now();
        this._t += Math.min(0.1, (now - (this._last || now)) / 1000);
        this._last = now;
        WIND.time.value = this._t;
        if (!focus) return;
        // the walkers press the grass (TrampleField.js): the map follows the player, each walker near him presses under its feet
        const T0 = this.trample;
        T0.follow(focus.x, focus.z);
        this.feet?.(T0);
        T0.rise(Math.min(0.1, (now - (this._lastRise || now)) / 1000));
        this._lastRise = now;
        this._centerU.value.set(focus.x, 0, focus.z);
        const R = this.radius, rc = Math.ceil(R / CHUNK) + 1;
        const ccx = Math.floor(focus.x / CHUNK), ccz = Math.floor(focus.z / CHUNK);
        // forget the chunks left behind; the cover only in the chunks near the player
        for (const [key, e] of this.meshes) {
            const d = this._chunkDist(e.cx, e.cz, focus);
            if (d > R + CHUNK) { this._drop(key, e); continue; }
            if (e.cover) e.cover.visible = d < FLORA.COVER_R;
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
            // Keep edited floors clear while the replacement meadow is in flight.
            if (e && (c.modified || e.chunk !== c)) e.mesh.visible = false;
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
            if (!all && T.floraAsync) { T.askFlora(w.key, w.cx, w.cz, this._pristine(w) ? null : w.c, this.under); if (performance.now() - t0 > FLORA.BUDGET_MS) break; continue; }
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
        for (const m of [e.mesh, e.bush, e.puddles, e.cover]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    }

    /** The living ground of one chunk: the cover, grasses, flowers and litter in one mesh; the bushes in a second (it casts a shadow); the puddles in a third. */
    _build({ key, cx, cz, c }, out = null) {
        const old = this.meshes.get(key);
        if (old) this._drop(key, old);
        out = out || buildFlora(this.data, c, { under: this.under });
        const mk = (geo, mat) => {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.frustumCulled = true; mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
            mesh.userData.isFlora = true;
            mesh.raycast = () => {}; // (not a thing to hit: spells and hands pass through grass)
            this.group.add(mesh);
            return mesh;
        };
        const mesh = mk(this.chunkGeometry(c, out), this.material);
        let bush = null, puddles = null, cover = null;
        if (out.cover?.verts) { cover = mk(this.chunkGeometry(c, out.cover), this.material); cover.visible = this._chunkDist(cx, cz, this._centerU.value) < FLORA.COVER_R; }
        if (out.bush?.verts) { bush = mk(this.chunkGeometry(c, out.bush), this.material); bush.castShadow = true; bush.customDepthMaterial = this.bushDepth; }
        if (out.puddles?.length) puddles = mk(this._puddleGeometry(out.puddles), this.puddleMat);
        this.meshes.set(key, { mesh, bush, puddles, cover, cx, cz, rev: c.rev, chunk: c });
        this.stats.built++;
    }

    /** Geometry of a chunk's living ground (pure: positions, colours, atlas uv, sway, glow, flex/rank; indexed: a card is 4 vertices). */
    chunkGeometry(c, out = null) {
        out = out || buildFlora(this.data, c, { under: this.under });
        if (out.count) this.stats.blades = out.count;
        const geo = new THREE.BufferGeometry();
        if (out.index) geo.setIndex(new THREE.BufferAttribute(out.index, 1));
        geo.setAttribute('position', new THREE.BufferAttribute(out.pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(out.nor, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(out.col, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(out.uv || new Float32Array(out.verts * 2).fill(-1), 2));
        geo.setAttribute('sway', new THREE.BufferAttribute(out.sway, 1));
        geo.setAttribute('glow', new THREE.BufferAttribute(out.glow, 1));
        geo.setAttribute('grow', new THREE.BufferAttribute(out.grow || new Float32Array(out.verts * 2), 2));
        if (out.box) {
            const b = out.box;
            geo.boundingBox = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
            geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
        } else geo.computeBoundingSphere();
        return geo;
    }

    /** The puddles of a chunk (x, y, z, r each) as flat discs a hair over the ground; `pr` — the point's place in its puddle (−1…1). */
    _puddleGeometry(list) {
        const n = list.length / 4, SEG = 12, pos = new Float32Array(n * (SEG + 1) * 3), nor = new Float32Array(n * (SEG + 1) * 3), pr = new Float32Array(n * (SEG + 1) * 2), idx = [];
        for (let k = 0; k < n; k++) {
            const x = list[k * 4], y = list[k * 4 + 1] + 0.02, z = list[k * 4 + 2], r = list[k * 4 + 3], b = k * (SEG + 1);
            pos.set([x, y, z], b * 3); nor.set([0, 1, 0], b * 3);
            for (let s = 0; s < SEG; s++) {
                const a = s / SEG * Math.PI * 2, q = (b + 1 + s);
                pos.set([x + Math.cos(a) * r * 1.15, y, z + Math.sin(a) * r * 1.15], q * 3); nor.set([0, 1, 0], q * 3); pr.set([Math.cos(a) * 1.15, Math.sin(a) * 1.15], q * 2);
                idx.push(b, b + 1 + ((s + 1) % SEG), b + 1 + s);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setIndex(idx);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('pr', new THREE.BufferAttribute(pr, 2));
        geo.computeBoundingSphere();
        return geo;
    }

    dispose() {
        for (const [key, e] of this.meshes) this._drop(key, e);
        this.material.dispose(); this.bushDepth.dispose(); this.puddleMat.dispose(); this.trample.dispose();
        this.terrain.group.remove(this.group);
    }
}

/** One card, a flower's stem and a lying thing (Game.prewarm compiles the shaders from it). */
function sampleOut() {
    const pos = new Float32Array([0, 0, 0, 0.5, 0, 0, 0.5, 1, 0, 0, 1, 0]), uv = new Float32Array([0, 0, 0.1, 0, 0.1, 0.1, 0, 0.1]);
    return { index: new Uint16Array([0, 1, 2, 0, 2, 3]), pos, nor: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), col: new Float32Array(12).fill(0.7), uv, sway: new Float32Array([0, 0, 1, 1]), glow: new Float32Array(4), grow: new Float32Array(8), verts: 4, count: 0, box: [0, 0, 0, 0.5, 1, 0.1] };
}
