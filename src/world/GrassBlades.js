/**
 * GrassBlades.js — real grass near the player (the author 22.11: «трава выглядит как крест — плоская 2D-текстура, а не 3D-объект… разве не
 * придумали систему, когда одну траву видеокарта рисует, а всё остальное — её копии?»).
 *
 * One tuft is built once in 3D: nine curved blades, each a tapered strip of three segments and a pointed tip, leaning out and bending, with
 * its own normal (lit from its side: a blade has a bright and a shaded face), a height and a random share of its own. The video card draws
 * that one tuft thousands of times (instancing): each copy only says where it stands, how it is turned, how tall and wide, how limp, its
 * colour, its rank. One draw per chunk. In the vertex shader every blade bends in the wind (a sway and rolling gusts), bows under the
 * walkers (TrampleField — aside and flattened, standing up again), thins out by its rank beyond ~14 m and is gone by BLADES.R, where the
 * painted cards (Flora.js) carry the meadow on to the horizon. Far from the cards' crosses, near enough to look down on.
 * Lit like the rest: the sky's light, the sun with its shadows, the clouds' shadows, the air's haze; the sun shines through the tips from
 * behind.
 */
import * as THREE from 'three';
import { TRAMPLE_GLSL } from './TrampleField.js';
import { CLOUD_SHADE_GLSL, addCloudUniforms } from './CloudShade.js';
import { SKY_LIGHT, applySkyComp } from './VoxelShading.js';
import { ULTRA } from '../fx/UltraUniforms.js';

export const BLADES = {
    R: 20, // m: farther than this no 3D tuft (the cards go on)
    THIN: 13, // m: from here they thin out by rank
    N: 10, // blades a tuft (×3 tufts a block near the player)
    SEG: 2, // segments a blade (+ the tip)
    STRIDE: 12, // floats a tuft in the worker's list: x, y, z, yaw, h, w, flex, rank, r, g, b, kind
};

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let _tuft = null;
/** The one tuft (unit height 1, unit spread): positions, normals, bh (0 root … 1 tip), bv (the blade's own random). */
export function tuftGeometry() {
    if (_tuft) return _tuft;
    const R = rng(4711), pos = [], nor = [], bh = [], bv = [], idx = [];
    const { N, SEG } = BLADES;
    for (let b = 0; b < N; b++) {
        const ang = (b / N) * Math.PI * 2 + (R() - 0.5) * 0.7; // (round the root, not too even)
        const out = 0.02 + 0.12 * R(), lean = 0.04 + 0.26 * R(), curl = 0.08 + 0.4 * R(), hgt = 0.55 + 0.45 * R(), wid = 0.04 + 0.03 * R(), r = R(); // (mostly upright, a few arching out: a tuft, not a star)
        const dx = Math.cos(ang), dz = Math.sin(ang), sx = -dz, sz = dx; // (out from the middle; the blade's width across)
        const twist = (R() - 0.5) * 0.9;
        const base = pos.length / 3;
        let px = dx * out, py = 0, pz = dz * out, a = lean;
        for (let s = 0; s <= SEG; s++) {
            const t = s / (SEG + 1);
            const half = wid * (1 - t * 0.85) * 0.5;
            const tw = twist * t, cx = sx * Math.cos(tw) + dx * Math.sin(tw), cz = sz * Math.cos(tw) + dz * Math.sin(tw);
            // the face's normal: across the blade × along it, leaning up (soft light: a blade is thin, it lets light through)
            const ux = dx * Math.sin(a), uy = Math.cos(a), uz = dz * Math.sin(a);
            let nx = uy * cz, ny = uz * cx - ux * cz, nz = -uy * cx; // (cross(along, across))
            const nl = Math.hypot(nx, ny, nz) || 1; nx = nx / nl * 0.55; ny = ny / nl * 0.55 + 0.75; nz = nz / nl * 0.55;
            const ml = Math.hypot(nx, ny, nz); nx /= ml; ny /= ml; nz /= ml;
            pos.push(px - cx * half, py, pz - cz * half, px + cx * half, py, pz + cz * half);
            nor.push(nx, ny, nz, nx, ny, nz); bh.push(t * hgt, t * hgt); bv.push(r, r);
            const step = hgt / (SEG + 1);
            a += curl / (SEG + 1); px += dx * Math.sin(a) * step; py += Math.cos(a) * step; pz += dz * Math.sin(a) * step;
        }
        pos.push(px, py, pz); nor.push(dx * 0.3, 0.95, dz * 0.3); bh.push(hgt); bv.push(r);
        for (let s = 0; s < SEG; s++) { const q = base + s * 2; idx.push(q, q + 1, q + 3, q, q + 3, q + 2); }
        const q = base + SEG * 2; idx.push(q, q + 1, q + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('bh', new THREE.Float32BufferAttribute(bh, 1));
    g.setAttribute('bv', new THREE.Float32BufferAttribute(bv, 1));
    return (_tuft = g);
}

/** The blades' material (one for the whole world): instanced by hand (own attributes), bent, faded, lit. */
export function bladeMaterial(flora) {
    const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const tr = flora.trample.uniforms;
    m.onBeforeCompile = (shader) => {
        shader.uniforms.uWind = flora._windU;
        shader.uniforms.uFloraCenter = flora._centerU;
        shader.uniforms.uTrample = tr.tex; shader.uniforms.uTrampleO = tr.origin;
        shader.uniforms.uUltraOn = ULTRA.on; shader.uniforms.uUltraTime = ULTRA.time;
        shader.uniforms.uSunDir = ULTRA.sunDir; shader.uniforms.uSunCol = ULTRA.sunCol; shader.uniforms.uSunVis = ULTRA.sunVis;
        shader.uniforms.uAerial = SKY_LIGHT.aerial;
        addCloudUniforms(shader);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>
attribute float bh;
attribute float bv;
attribute vec4 iPos;
attribute vec4 iSize;
attribute vec4 iCol;
uniform float uWind;
uniform vec3 uFloraCenter;
uniform float uUltraOn;
uniform float uUltraTime;
varying vec3 vBladeCol;
varying float vBladeH;
varying vec3 vBladeW;
${TRAMPLE_GLSL}`)
            .replace('#include <beginnormal_vertex>', `vec3 objectNormal = vec3(normal.x * cos(iPos.w) - normal.z * sin(iPos.w), normal.y, normal.x * sin(iPos.w) + normal.z * cos(iPos.w));
#ifdef USE_TANGENT
vec3 objectTangent = vec3( tangent.xyz );
#endif`)
            .replace('#include <begin_vertex>', `
vec3 lp = position * vec3(iSize.y, iSize.x, iSize.y);
float cy = cos(iPos.w), sy = sin(iPos.w);
vec3 transformed = vec3(lp.x * cy - lp.z * sy, lp.y, lp.x * sy + lp.z * cy) + iPos.xyz;
{
    float d = distance(iPos.xz, uFloraCenter.xz);
    float keep = 1.0 - smoothstep(${BLADES.THIN.toFixed(1)}, ${BLADES.R.toFixed(1)}, d);
    float grow = iSize.w > keep ? 0.0 : smoothstep(0.0, 0.25, keep - iSize.w); // (thinning by rank, each tuft sinking smoothly — no pop)
    float hgt = lp.y;
    transformed.y = iPos.y + hgt * grow;
    float flex = iSize.z, s = bh * bh;
    float w = sin(uWind * 1.7 + iPos.x * 0.37 + iPos.z * 0.21 + bv * 2.0) + 0.45 * sin(uWind * 3.1 + iPos.x * 1.3 - iPos.z * 0.9);
    w += 0.9 * pow(0.5 + 0.5 * sin(dot(iPos.xz, vec2(0.11, 0.07)) - uWind * 1.1), 3.0);
    if (uUltraOn > 0.5) w = w * 0.6 + 1.6 * pow(0.5 + 0.5 * sin(dot(iPos.xz, vec2(0.11, 0.07)) - uUltraTime * 1.25), 3.0);
    float bend = s * iSize.x * (0.05 + 0.13 * flex) * grow;
    transformed.x += w * bend; transformed.z += w * bend * 0.65;
    vec3 tp = trampleAt(iPos.xz);
    transformed.xz += tp.xy * tp.z * s * iSize.x * (0.5 + 0.6 * flex) * grow;
    transformed.y -= tp.z * s * iSize.x * (0.35 + 0.35 * flex) * grow;
    // the colour: dark and cool at the root, the blade's own colour, a paler sunlit tip; one in sixteen a dry straw-coloured blade
    vec3 c = iCol.rgb * (0.92 + 0.2 * bv);
    if (bv > 0.94) c = mix(c, vec3(0.72, 0.64, 0.4), 0.7);
    vBladeCol = c * mix(0.62, 1.12, bh);
    vBladeH = bh;
    vBladeW = transformed - cameraPosition;
}`);
        shader.fragmentShader = shader.fragmentShader
            .replace('( gl_FrontFacing ) ? vIndirectFront : vIndirectBack', 'vIndirectFront')
            .replace('( gl_FrontFacing ) ? vLightFront : vLightBack', '( gl_FrontFacing ) ? vLightFront : vLightFront * 0.82')
            .replace('#include <common>', `#include <common>
varying vec3 vBladeCol;
varying float vBladeH;
varying vec3 vBladeW;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunVis;
uniform float uAerial;
${CLOUD_SHADE_GLSL}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= vBladeCol;
diffuseColor.rgb *= mix(1.0, cloudShade((vBladeW + cameraPosition).xz), 0.75);
{ float aer = smoothstep(18.0, 220.0, length(vBladeW)) * 0.55 * uAerial; float al = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(al) * vec3(0.84, 0.93, 1.1), aer); }`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float back = pow(max(dot(normalize(vBladeW), normalize(uSunDir)), 0.0), 5.0) * uSunVis * vBladeH;
totalEmissiveRadiance += diffuseColor.rgb * uSunCol * back * 0.5;`);
    };
    m.customProgramCacheKey = () => 'grass-blades';
    return applySkyComp(m);
}

/** A chunk's tufts as one instanced draw: `list` — the worker's Float32Array (BLADES.STRIDE floats a tuft). */
export function bladesGeometry(list, box) {
    const t = tuftGeometry(), g = new THREE.InstancedBufferGeometry();
    g.setIndex(t.index);
    for (const k of ['position', 'normal', 'bh', 'bv']) g.setAttribute(k, t.getAttribute(k));
    const buf = new THREE.InstancedInterleavedBuffer(list, BLADES.STRIDE, 1);
    g.setAttribute('iPos', new THREE.InterleavedBufferAttribute(buf, 4, 0));
    g.setAttribute('iSize', new THREE.InterleavedBufferAttribute(buf, 4, 4));
    g.setAttribute('iCol', new THREE.InterleavedBufferAttribute(buf, 4, 8));
    g.instanceCount = list.length / BLADES.STRIDE;
    if (box) { g.boundingBox = new THREE.Box3(new THREE.Vector3(box[0], box[1], box[2]), new THREE.Vector3(box[3], box[4] + 2, box[5])); g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere()); }
    g.userData.ownsList = true;
    return g;
}

/**
 * All the tufts near the player in ONE instanced draw: every ~0.2 s (or a step of 1.5 m) the chunks' lists are read and the tufts within
 * BLADES.R + 2 m copied into one buffer (a few thousand, a fraction of a millisecond); the video card draws the one tuft that many times.
 */
export class BladeField {
    constructor(flora) {
        this.flora = flora;
        this.cap = 12000;
        this.arr = new Float32Array(this.cap * BLADES.STRIDE);
        this.buf = new THREE.InstancedInterleavedBuffer(this.arr, BLADES.STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
        const t = tuftGeometry(), g = new THREE.InstancedBufferGeometry();
        g.setIndex(t.index);
        for (const k of ['position', 'normal', 'bh', 'bv']) g.setAttribute(k, t.getAttribute(k));
        g.setAttribute('iPos', new THREE.InterleavedBufferAttribute(this.buf, 4, 0));
        g.setAttribute('iSize', new THREE.InterleavedBufferAttribute(this.buf, 4, 4));
        g.setAttribute('iCol', new THREE.InterleavedBufferAttribute(this.buf, 4, 8));
        g.instanceCount = 0;
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // (it is always round the player)
        g.userData.keep = true;
        this.geo = g;
        this.mesh = new THREE.Mesh(g, bladeMaterial(flora));
        this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.castShadow = false; this.mesh.matrixAutoUpdate = false;
        this.mesh.name = 'grass-blades'; this.mesh.raycast = () => {};
        flora.group.add(this.mesh);
        this._at = { x: 1e9, z: 1e9 }; this._t = 0; this.dirty = true;
    }

    update(focus, dt) {
        this._t += dt;
        const moved = Math.hypot(focus.x - this._at.x, focus.z - this._at.z);
        if (!this.dirty && moved < 1.5 && this._t < 0.25) return;
        this._t = 0; this.dirty = false; this._at.x = focus.x; this._at.z = focus.z;
        const R = BLADES.R + 2, R2 = R * R, S = BLADES.STRIDE, A = this.arr;
        let n = 0;
        for (const e of this.flora.meshes.values()) {
            const L = e.tufts;
            if (!L || this.flora._chunkDist(e.cx, e.cz, focus) > R) continue;
            for (let o = 0; o < L.length && n < this.cap; o += S) {
                const dx = L[o] - focus.x, dz = L[o + 2] - focus.z;
                if (dx * dx + dz * dz > R2) continue;
                A.set(L.subarray(o, o + S), n * S); n++;
            }
        }
        this.geo.instanceCount = n;
        this.buf.updateRange = { offset: 0, count: n * S };
        this.buf.needsUpdate = true;
    }

    dispose() { this.flora.group.remove(this.mesh); this.mesh.material.dispose(); this.geo.dispose(); }
}