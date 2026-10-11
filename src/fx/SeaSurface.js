/**
 * SeaSurface.js — the moving surface of the sea.
 *
 * One mesh of rings around the camera (dense near, sparse far) lies at the
 * water level; its vertex shader lifts every point by THE wave function of
 * src/world/Sea.js (the GLSL copy `waveGlsl()`), so what is drawn is exactly
 * what swimmers, boards and ships feel. The flat block water top of sea
 * columns is not drawn (Terrain skipSeaTop), this surface is.
 *
 * Where the waves are (the distance from the shore and the depth) comes from a
 * small texture around the player: R = shore distance + 32 (m), G = depth·15.
 * It is rebuilt in slices when the player has moved far, so nothing stalls.
 * The surface is only active when a sea is near.
 */

import * as THREE from 'three';
import { WATER_LEVEL_Y } from '../world/Terrain.js';
import { waveGlsl, seaDepth, waveAmp, WAVES } from '../world/Sea.js';

const TEX = 256; // texels per side
const TEXEL = 5; // m per texel → 1280 m covered
const SLICE = 4096; // texels computed per frame while rebuilding
const _v = new THREE.Vector3();

export class SeaSurface {
    constructor(game) {
        this.game = game;
        this.sea = game.sea;
        this.active = false;
        this.ready = false;
        this._checkT = 0;
        this.uniforms = {
            uTime: { value: 0 },
            uOrigin: { value: new THREE.Vector2(0, 0) },
            uTexSize: { value: TEX * TEXEL },
            uStorm: { value: 0 },
            uShore: { value: null },
            uShallow: { value: new THREE.Color(0x3fb7c9) },
            uDeep: { value: new THREE.Color(0x1d4f8f) },
        };
        this.data = new Uint8Array(TEX * TEX * 4);
        this.texture = new THREE.DataTexture(this.data, TEX, TEX, THREE.RGBAFormat);
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
        this.uniforms.uShore.value = this.texture;
        this._next = new Uint8Array(TEX * TEX * 4);
        this._job = null; // {ox, oz, i}
        this.mesh = new THREE.Mesh(this._geometry(Math.max(400, (game.world?.terrain?.viewDistance || 112) * 1.2)), this._material());
        this.mesh.name = 'sea';
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 1;
        this.mesh.visible = false;
        this.mesh.position.y = WATER_LEVEL_Y;
        game.scene.add(this.mesh);
    }

    /** Wave size at a shore distance (for tests and effects). */
    amp(s) { return waveAmp(s, this.sea?.storm || 0); }

    _geometry(R) {
        const SEG = 128;
        const radii = [0];
        for (let r = 2; r < R; r *= 1.06) radii.push(r);
        radii.push(R);
        const pos = new Float32Array(radii.length * SEG * 3);
        let k = 0;
        for (const r of radii) for (let j = 0; j < SEG; j++) {
            const a = j / SEG * Math.PI * 2;
            pos[k++] = Math.cos(a) * r; pos[k++] = 0; pos[k++] = Math.sin(a) * r;
        }
        const idx = [];
        for (let i = 0; i + 1 < radii.length; i++) for (let j = 0; j < SEG; j++) {
            const a = i * SEG + j, b = i * SEG + (j + 1) % SEG, c = (i + 1) * SEG + j, d = (i + 1) * SEG + (j + 1) % SEG;
            idx.push(a, c, b, b, c, d);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
        g.setIndex(idx);
        return g;
    }

    _material() {
        const mat = new THREE.MeshPhongMaterial({
            color: 0x2f7fd0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide,
            shininess: 90, specular: 0x9fd0ff,
        });
        const U = this.uniforms;
        mat.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, U);
            const common = `#include <common>
uniform float uTime;
uniform vec2 uOrigin;
uniform float uTexSize;
uniform float uStorm;
uniform sampler2D uShore;
varying float vSeaS;
varying float vSeaDepth;
varying vec3 vSeaWorld;
${waveGlsl()}
vec2 seaShoreAt(vec2 p) { vec4 c = texture2D(uShore, (p - uOrigin) / uTexSize + 0.5); return vec2(c.r * 255.0 - 32.0, c.g * 17.0); }
float seaH(vec2 p) { return seaWave(p, uTime, seaShoreAt(p).x, uStorm); }
`;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', common)
                .replace('#include <beginnormal_vertex>', `
                vec2 seaP = (modelMatrix * vec4(position, 1.0)).xz;
                float seaE = 0.6;
                float seaDx = seaH(seaP + vec2(seaE, 0.0)) - seaH(seaP - vec2(seaE, 0.0));
                float seaDz = seaH(seaP + vec2(0.0, seaE)) - seaH(seaP - vec2(0.0, seaE));
                vec3 objectNormal = normalize(vec3(-seaDx / (2.0 * seaE), 1.0, -seaDz / (2.0 * seaE)));
                #ifdef USE_TANGENT
                vec3 objectTangent = vec3( tangent.xyz );
                #endif`)
                .replace('#include <begin_vertex>', `
                vec2 seaSD = seaShoreAt(seaP);
                vSeaS = seaSD.x;
                vSeaDepth = seaSD.y;
                vec3 transformed = vec3(position);
                transformed.y += seaWave(seaP, uTime, seaSD.x, uStorm);
                vSeaWorld = vec3(seaP.x, transformed.y, seaP.y);`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform float uTime;
varying float vSeaS;
varying float vSeaDepth;
varying vec3 vSeaWorld;`)
                .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
                if (vSeaS < -3.0) discard;`)
                .replace('#include <color_fragment>', `#include <color_fragment>
                float seaK = clamp((vSeaDepth - 1.0) / 10.0, 0.0, 1.0);
                diffuseColor.rgb = mix(uShallow, uDeep, seaK);
                // foam: the little waves breaking on the sand, white caps on high crests out at sea
                float seaFoam = (1.0 - smoothstep(0.0, 6.0, vSeaS)) * smoothstep(0.35, 0.9, sin(${WAVES.shore.k.toFixed(4)} * vSeaS + ${WAVES.shore.omega.toFixed(7)} * uTime));
                seaFoam = max(seaFoam, smoothstep(0.55, 0.95, vSeaWorld.y - ${WATER_LEVEL_Y.toFixed(2)}) * 0.6);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.98, 1.0), seaFoam * 0.8);
                diffuseColor.a = mix(diffuseColor.a, 0.95, seaFoam * 0.6 + seaK * 0.12);`);
        };
        mat.customProgramCacheKey = () => 'sea-surface-v1';
        return mat;
    }

    /** Start rebuilding the shore texture around (x, z). */
    _startJob(x, z) {
        const ox = Math.round(x / TEXEL) * TEXEL, oz = Math.round(z / TEXEL) * TEXEL;
        this._job = { ox, oz, i: 0 };
    }

    _runJob(count) {
        const j = this._job;
        const half = TEX * TEXEL / 2;
        const sea = this.sea;
        const end = Math.min(TEX * TEX, j.i + count);
        for (; j.i < end; j.i++) {
            const tx = j.i % TEX, tz = (j.i / TEX) | 0;
            const x = j.ox - half + (tx + 0.5) * TEXEL, z = j.oz - half + (tz + 0.5) * TEXEL;
            const s = sea.s(x, z);
            const o = j.i * 4;
            this._next[o] = Math.max(0, Math.min(255, Math.round(s + 32)));
            this._next[o + 1] = Math.min(255, seaDepth(s) * 15);
            this._next[o + 2] = 0;
            this._next[o + 3] = 255;
        }
        if (j.i >= TEX * TEX) {
            this.data.set(this._next);
            this.texture.needsUpdate = true;
            this.uniforms.uOrigin.value.set(j.ox, j.oz);
            this._job = null;
            this.ready = true;
        }
    }

    update(dt, focus) {
        if (!this.sea) return;
        const g = this.game;
        this.uniforms.uTime.value = this.sea.time();
        this.uniforms.uStorm.value = this.sea.storm || 0;
        if ((this._checkT -= dt) <= 0) {
            this._checkT = 0.5;
            const view = g.world?.terrain?.viewDistance || 112;
            this.active = this.sea.index.near(focus.x, focus.z, view + 200).length > 0;
        }
        if (!this.active) { this.mesh.visible = false; return; }
        const o = this.uniforms.uOrigin.value;
        if (!this._job && (!this.ready || Math.hypot(focus.x - o.x, focus.z - o.y) > 128)) this._startJob(focus.x, focus.z);
        // the first time synchronously in big slices (the sea comes into view far away, fog hides it)
        if (this._job) this._runJob(this.ready ? SLICE : SLICE * 4);
        this.mesh.visible = this.ready;
        const cam = g.camera ? g.camera.getWorldPosition(_v) : focus;
        this.mesh.position.set(Math.round(cam.x / 2) * 2, WATER_LEVEL_Y, Math.round(cam.z / 2) * 2);
    }

    /** Build the texture now (tests, teleports). */
    flush(x, z) {
        if (!this.sea) return;
        this.active = true;
        this._startJob(x, z);
        this._runJob(TEX * TEX);
        this.mesh.visible = true;
    }

    dispose() {
        this.game.scene?.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.texture.dispose();
    }
}
