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
import { SPACE } from '../world/Planets.js';
import { boomReach } from '../world/BoomCarve.js';
import { ULTRA_PARS, addUltraUniforms } from './UltraUniforms.js';

const BODIES = 8, RINGS = 8, CUTS = 3; // (what the water answers: bodies in it, rings running out from a splash; corridors of «Aquadivide» not drawn)
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
            uShallow: { value: new THREE.Color(0x3fc4c4) }, // (turquoise over the sand)
            uDeep: { value: new THREE.Color(0x0a3550) }, // (the open sea's body: deep blue-green, nearly black far down)
            uWind: { value: new THREE.Vector2(1, 0) }, // (the wind's direction: the small waves run with it — Game.wind)
            // what is in the water (SeaSurface.update): up to BODIES bodies {x, z, r, speed} and their headings, up to RINGS rings {x, z, age, k}
            uBodies: { value: Array.from({ length: BODIES }, () => new THREE.Vector4(0, 0, 0, -1)) },
            uBodyDir: { value: Array.from({ length: BODIES }, () => new THREE.Vector2(0, 1)) },
            uRings: { value: Array.from({ length: RINGS }, () => new THREE.Vector4(0, 0, -1, 0)) },
            // «Aquadivide» (WaterPart.js): up to CUTS corridors where the sheet is not drawn — {px, pz, ax, az} and {halfWidth, ahead, behind, on}
            uCutA: { value: Array.from({ length: CUTS }, () => new THREE.Vector4(0, 0, 1, 0)) },
            uCutB: { value: Array.from({ length: CUTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
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
        this.mesh.renderOrder = 0.9; // (before every other see-through thing: a steady order, no flicker against sails, glass, lakes)
        this.mesh.visible = false;
        this.mesh.position.y = WATER_LEVEL_Y;
        game.scene.add(this.mesh);
    }

    /**
     * A splash on the sea (a body falling in, a spell hitting the water, a thing thrown in): rings run out from (x, z) — `k` 0…1.5
     * how big. Every computer draws its own (Swimming, Boats… call it).
     */
    ring(x, z, k = 1) {
        const R = this.uniforms.uRings.value;
        let slot = R.find((r) => r.z < 0) || R.reduce((a, b) => (b.z > a.z ? b : a));
        slot.set(x, z, 0, Math.min(1.5, Math.max(0.2, k)));
    }

    /** What is in the water now: the swimmers, the boats, the ships — nearest the camera first (uniforms, no garbage). */
    _touches(dt) {
        const g = this.game, U = this.uniforms, me = g.character?.group?.position;
        for (const r of U.uRings.value) if (r.z >= 0) { r.z += dt; if (r.z > 5) r.z = -1; }
        const B = U.uBodies.value, D = U.uBodyDir.value;
        let n = 0;
        const wl = WATER_LEVEL_Y;
        const add = (x, z, r, vx, vz) => {
            if (n >= BODIES) return;
            const sp = Math.hypot(vx, vz);
            B[n].set(x, z, r, sp);
            if (sp > 0.05) D[n].set(vx / sp, vz / sp);
            n++;
        };
        // (a body counts while it is at the surface: swimming, wading, a boat's hull)
        const atSurface = (y, h) => y - h < wl + 0.6 && y > wl - 1.6;
        if (me && this.sea.s(me.x, me.z) > -2) {
            const feet = me.y - 2.0;
            if (atSurface(me.y - 0.8, 1.6) || (feet < wl + 0.3 && me.y > wl)) {
                const lp = this._lastMe || (this._lastMe = me.clone());
                const vx = (me.x - lp.x) / Math.max(dt, 1e-3), vz = (me.z - lp.z) / Math.max(dt, 1e-3);
                lp.copy(me);
                add(me.x, me.z, 0.55, Math.abs(vx) < 30 ? vx : 0, Math.abs(vz) < 30 ? vz : 0);
            } else this._lastMe = null;
        }
        for (const b of g.boats?.list?.values?.() || []) {
            if (b.st !== 'float' || !Number.isFinite(b.x)) continue;
            if (me && Math.hypot(b.x - me.x, b.z - me.z) > 220) continue;
            const u = b.u || 0;
            add(b.x, b.z, 1.4, -Math.sin(b.yaw) * u, -Math.cos(b.yaw) * u);
        }
        for (const s of g.ships?.awake || []) {
            const st = s.st;
            if (!st || (me && Math.hypot(st.x - me.x, st.z - me.z) > 400) || s.flooded) continue;
            const u = st.u || 0;
            add(st.x, st.z, (s.cls?.B || 12) * 0.5, -Math.sin(st.yaw) * u, -Math.cos(st.yaw) * u);
        }
        for (let i = n; i < BODIES; i++) B[i].w = -1;
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
            addUltraUniforms(shader);
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
uniform vec2 uOrigin;
uniform float uTexSize;
uniform sampler2D uShore;
uniform float uStorm;
uniform vec2 uWind;
uniform vec4 uBodies[${BODIES}];
uniform vec2 uBodyDir[${BODIES}];
uniform vec4 uRings[${RINGS}];
uniform vec4 uCutA[${CUTS}];
uniform vec4 uCutB[${CUTS}];
varying float vSeaS;
varying float vSeaDepth;
varying vec3 vSeaWorld;
${ULTRA_PARS}
// the small waves riding on the big ones: eight trains round the wind's direction (their slopes, analytic — no texture), the
// shorter ones faster and steeper; they fade with the distance (no shimmering far off)
vec2 seaRipples(vec2 p, float t, vec2 w, float amp, float dist) {
    vec2 sl = vec2(0.0);
    float a = 0.11, k = 0.35;
    for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float an = (fract(sin(fi * 12.9898) * 43758.5) - 0.5) * 1.9;
        vec2 d = vec2(w.x * cos(an) - w.y * sin(an), w.x * sin(an) + w.y * cos(an));
        float om = sqrt(9.81 * k);
        float ph = dot(p, d) * k - om * t + fi * 1.7;
        sl += d * cos(ph) * a * k * exp(-k * dist * 0.045); // (each train fades where it would be finer than a pixel: no grain far off)
        a *= 0.72; k *= 1.55;
    }
    return sl * amp;
}
float seaN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5), b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5);
    float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5), d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }`)
                .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
                // where the sea ends: looked up for THIS point (not interpolated across a big far triangle,
                // whose corners move as the surface follows the camera — that made the shore line jump and flicker)
                vec4 seaTex = texture2D(uShore, (vSeaWorld.xz - uOrigin) / uTexSize + 0.5);
                float seaS = seaTex.r * 255.0 - 32.0, seaDepth = seaTex.g * 17.0;
                if (seaS < -3.0) discard;
                for (int ci = 0; ci < ${CUTS}; ci++) { // the water stands aside (WaterPart.js): the corridor is not drawn
                    vec4 cA = uCutA[ci], cB = uCutB[ci];
                    if (cB.w > 0.5) {
                        vec2 cd = vSeaWorld.xz - cA.xy;
                        float cs = dot(cd, cA.zw), ct = -cd.x * cA.w + cd.y * cA.z;
                        if (cs > -cB.z && cs < cB.y && abs(ct) < cB.x) discard;
                    }
                }`)
                .replace('#include <color_fragment>', `#include <color_fragment>
                float seaK = clamp((seaDepth - 1.0) / 10.0, 0.0, 1.0);
                diffuseColor.rgb = mix(uShallow, uDeep, seaK);
                // foam: the little waves breaking on the sand, white caps on high crests out at sea
                float seaFoam = (1.0 - smoothstep(0.0, 6.0, seaS)) * smoothstep(0.35, 0.9, sin(${WAVES.shore.k.toFixed(4)} * seaS + ${WAVES.shore.omega.toFixed(7)} * uTime));
                seaFoam = max(seaFoam, smoothstep(0.55, 0.95, vSeaWorld.y - ${WATER_LEVEL_Y.toFixed(2)}) * 0.6 * smoothstep(0.5, 1.4, uStorm)); // (white crests only in a strong wind)
                // the wind (SeaWind.js, 10 levels → uStorm): from a fresh breeze white horses on the crests, torn into streaks by
                // the wind; in a gale and a storm the sea goes slate-grey and the foam lies in long bands
                float seaWind = clamp(uStorm, 0.0, 2.4);
                float seaOpen = smoothstep(20.0, 120.0, seaS);
                vec2 seaFp = vSeaWorld.xz * 0.35 + vec2(uTime * 0.6, uTime * 0.25);
                float seaStreak = seaN(seaFp) * 0.6 + seaN(seaFp * 2.7 + 13.0) * 0.4;
                float seaCrest = smoothstep(0.15, 0.6, (vSeaWorld.y - ${WATER_LEVEL_Y.toFixed(2)}) / (0.6 + seaWind * 0.8));
                seaFoam = max(seaFoam, seaOpen * smoothstep(0.05, 0.6, seaWind) * seaCrest * smoothstep(0.45, 0.8, seaStreak) * 0.85);
                // (foam is no flat white: it is torn into lacy patches and bubbles)
                vec2 seaLp = vSeaWorld.xz * 1.6 + vec2(uTime * 0.3, -uTime * 0.2);
                float seaLace = seaN(seaLp) * 0.55 + seaN(seaLp * 2.3 + 7.0) * 0.3 + seaN(seaLp * 5.1 - 3.0) * 0.15;
                seaFoam *= smoothstep(0.42, 0.7, seaLace + seaFoam * 0.2);
                float seaGrey = seaOpen * smoothstep(0.6, 2.0, seaWind) * 0.55;`)
                .replace('#include <fog_fragment>', `
                // ——— THE SEA'S OWN LIGHT (all qualities): the water's body, the sky in it, the sun, the foam ———
                {
                    float seaWL = ${WATER_LEVEL_Y.toFixed(2)};
                    vec3 sV = normalize(cameraPosition - vSeaWorld);
                    float sDist = length(cameraPosition - vSeaWorld);
                    vec3 sN0 = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
                    if (sN0.y < 0.0) sN0 = -sN0;
                    float sDet = 1.0 - smoothstep(60.0, 600.0, sDist);
                    vec2 sSl = seaRipples(vSeaWorld.xz, uTime, normalize(uWind + vec2(1e-4)), (0.55 + 0.6 * clamp(uStorm, 0.0, 2.0)) * sDet, sDist);
                    if (uUltraOn > 0.5) sSl += ultraRain(vSeaWorld.xz, uUltraTime) * 0.12 * uUltraWet;
                    // the water answers what is in it: rings running out from a splash; round a body a lap of little waves and a
                    // collar of foam; behind a moving one its wake — the V of a boat's (Kelvin's ~19°) and the churned white of its track
                    float sTouch = 0.0;
                    vec2 sP = vSeaWorld.xz;
                    for (int i = 0; i < ${RINGS}; i++) {
                        vec4 R = uRings[i];
                        if (R.z < 0.0) continue;
                        vec2 q = sP - R.xy; float d = length(q), front = 0.6 + R.z * 3.2;
                        float w = exp(-abs(d - front) * 1.6) * (1.0 - smoothstep(1.5, 4.5, R.z)) * R.w;
                        sSl += q / max(d, 1e-3) * cos((d - front) * 7.0) * w * 0.22;
                        sTouch += w * 0.35 * (1.0 - smoothstep(0.0, 1.2, R.z));
                    }
                    for (int i = 0; i < ${BODIES}; i++) {
                        vec4 B = uBodies[i];
                        if (B.w < 0.0) continue;
                        vec2 q = sP - B.xy; float d = length(q), e = max(0.0, d - B.z);
                        float sp = B.w;
                        // the lap round it
                        sSl += q / max(d, 1e-3) * sin(e * 5.5 - uTime * (4.0 + sp)) * exp(-e * 0.6) * (0.05 + 0.03 * min(sp, 4.0));
                        sTouch += exp(-e * (2.2 - min(sp, 6.0) * 0.18)) * (0.45 + 0.1 * min(sp, 5.0));
                        if (sp > 0.4) {
                            vec2 f = uBodyDir[i];
                            float along = -dot(q, f), lat = dot(q, vec2(-f.y, f.x));
                            if (along > 0.0) {
                                float reach = 14.0 + sp * 9.0 + B.z * 3.0;
                                float fade = exp(-along / reach);
                                float arm = abs(abs(lat) - along * 0.36 - B.z * 0.6);
                                float k = min(1.0, sp / 4.0);
                                sTouch += exp(-arm * 0.9) * fade * k * 0.8;
                                sTouch += exp(-abs(lat) / (B.z * 0.7 + 0.4)) * exp(-along / (6.0 + sp * 2.5 + B.z)) * k;
                                sSl += vec2(-f.y, f.x) * sign(lat) * cos(arm * 3.0 - uTime * 3.0) * exp(-arm * 0.7) * fade * k * 0.12;
                            }
                        }
                    }
                    // (the touch makes foam — torn by the lace like the rest)
                    seaFoam = max(seaFoam, clamp(sTouch, 0.0, 1.0) * smoothstep(0.25, 0.6, seaLace + 0.15));
                    vec3 sN = normalize(sN0 + vec3(-sSl.x, 0.0, -sSl.y));
                    vec3 sL = normalize(uUltraSunDir);
                    vec3 sSun = uUltraSunCol * uUltraSunVis;
                    vec3 sAmb = mix(uUltraHorizon, uUltraZenith, 0.5);
                    float sLight = clamp(dot(sAmb, vec3(0.3, 0.5, 0.2)) * 0.9 + dot(sSun, vec3(0.3, 0.5, 0.2)) * 0.45, 0.04, 1.0);
                    bool sUnder = cameraPosition.y < seaWL - 0.2;
                    if (!sUnder) {
                        // the water's body: turquoise over the sand, deepening to the open sea's blue-green; darker in a storm
                        float sDeepK = clamp((seaDepth - 0.5) / 9.0, 0.0, 1.0);
                        vec3 sBody = mix(uShallow, uDeep, sqrt(sDeepK));
                        sBody = mix(sBody, vec3(0.16, 0.22, 0.25), seaGrey);
                        sBody *= sLight;
                        // the light through the crests (seen against the sun the top of a wave glows green-blue)
                        float sCrest = clamp((vSeaWorld.y - seaWL) / (0.45 + 0.6 * uStorm), 0.0, 1.0);
                        float sBack = pow(max(dot(-sV, sL) * 0.5 + 0.5, 0.0), 3.0);
                        sBody += vec3(0.05, 0.42, 0.38) * sCrest * (0.35 + 0.9 * sBack) * dot(sSun, vec3(0.33)) * 0.55;
                        // the sky in it (Fresnel: a mirror at a glancing look, clear looking down)
                        float sF = 0.02 + 0.98 * pow(1.0 - clamp(dot(sN, sV), 0.0, 1.0), 5.0);
                        vec3 sR = reflect(-sV, sN); sR.y = abs(sR.y);
                        // (far off a sea mirrors the sky higher up than the bright horizon — the far faces of the waves tilt to it: the
                        //  far sea a deep blue under a pale horizon, not white)
                        sR.y = max(sR.y, 0.18 + 0.25 * smoothstep(80.0, 900.0, sDist)); sR = normalize(sR);
                        vec3 sSky = ultraSky(sR) * 0.78;
                        vec3 sCol = mix(sBody, sSky, clamp(sF * 0.85, 0.0, 0.5));
                        // the sun's path: a sharp glitter on every little wave and a broad sheen round it
                        vec3 sH = normalize(sL + sV);
                        float sNH = max(dot(sN, sH), 0.0);
                        sCol += sSun * (pow(sNH, 700.0) * 9.0 + pow(sNH, 90.0) * 0.45 + pow(sNH, 28.0) * 0.22 * (0.6 + 0.4 * seaN(vSeaWorld.xz * 2.5 + uTime))) * (1.0 - seaFoam); // (a broad shimmering path, sparkling — not a thin line)
                        // the foam: white, lit by the sky and the sun, a little blue in its shadow
                        vec3 sFoamC = vec3(0.92, 0.96, 1.0) * (sLight * 0.75 + 0.25 * dot(sSun, vec3(0.33)));
                        sCol = mix(sCol, sFoamC, clamp(seaFoam * 0.9, 0.0, 1.0));
                        gl_FragColor.rgb = sCol;
                        // over the sand the water is clear (the bottom seen through it), the open sea opaque; foam and the mirror opaque too
                        float sA = mix(0.42, 0.97, smoothstep(0.3, 6.0, seaDepth));
                        gl_FragColor.a = clamp(max(max(sA, sF * 0.9), seaFoam), 0.0, 1.0);
                    } else {
                        // seen from under the water: the sky only through Snell's window right above, the rest the surface's silver mirror
                        // of the dark water below
                        vec3 sUp = normalize(vSeaWorld - cameraPosition);
                        float sWin = smoothstep(0.6, 0.78, sUp.y);
                        vec3 sTint = vec3(0.04, 0.24, 0.3) * sLight;
                        vec3 sSkyW = ultraSky(normalize(vec3(sUp.x * 0.5, 1.0, sUp.z * 0.5))) * 1.1;
                        float sRip = seaN(vSeaWorld.xz * 0.8 + uTime * 0.4) * 0.5 + 0.5;
                        gl_FragColor.rgb = mix(sTint * (0.9 + 0.3 * sRip), sSkyW, sWin) + sSun * pow(max(dot(sUp, sL), 0.0), 60.0) * 1.5 * sWin;
                        gl_FragColor.a = 0.97;
                    }
                }
                #include <fog_fragment>`);
        };
        mat.customProgramCacheKey = () => 'sea-surface-v4';
        return mat; // (its own light now, every quality: the sky mirrored, the sun's path, the ripples — «Ультра» adds the rain's rings)
    }

    /** Start rebuilding the shore texture around (x, z). */
    _startJob(x, z) {
        const ox = Math.round(x / TEXEL) * TEXEL, oz = Math.round(z / TEXEL) * TEXEL;
        // «Бум»'s craters by the sea: the sea came into them — its waving surface is drawn there too (BoomCarve
        // marks those columns as sea; the crater's walls above the water hide it where there is none)
        const half = TEX * TEXEL / 2, patches = [];
        for (const e of this.game.explosions || []) {
            if (!e.boom) continue;
            const r = boomReach(e.r);
            if (Math.abs(e.p[0] - ox) > half + r || Math.abs(e.p[2] - oz) > half + r) continue;
            if (this.sea.s(e.p[0], e.p[2]) > -(r + 10)) patches.push(e.p[0], e.p[2], r);
        }
        this._job = { ox, oz, i: 0, patches };
    }

    /** Make the shore texture again where it is (the sea reached somewhere new: a crater of «Бум»), a little a frame. */
    refresh() {
        if (!this.sea || this._job) return;
        const o = this.uniforms.uOrigin.value;
        this._startJob(o.x, o.y);
    }

    /** Work on the shore texture: `count` texels at most, and no longer than `ms` (a fast flight: no spike). */
    _runJob(count, ms = Infinity) {
        const j = this._job;
        const half = TEX * TEXEL / 2;
        const sea = this.sea;
        const end = Math.min(TEX * TEX, j.i + count);
        const t0 = ms < Infinity ? performance.now() : 0;
        for (; j.i < end; j.i++) {
            if ((j.i & 31) === 31 && ms < Infinity && performance.now() - t0 > ms) break;
            const tx = j.i % TEX, tz = (j.i / TEX) | 0;
            const x = j.ox - half + (tx + 0.5) * TEXEL, z = j.oz - half + (tz + 0.5) * TEXEL;
            let s = sea.s(x, z);
            const P = j.patches;
            if (s < 6 && P?.length) for (let k = 0; k < P.length; k += 3) if (Math.hypot(x - P[k], z - P[k + 1]) < P[k + 2]) { s = 6; break; } // (a crater the sea filled: shallow sea)
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

    /** «Aquadivide»: the corridors where the sheet is not drawn (WaterPart.js): [{px, pz, ax, az, w, ahead, behind}], at most CUTS. */
    setCuts(list) {
        const A = this.uniforms.uCutA.value, B = this.uniforms.uCutB.value;
        for (let i = 0; i < CUTS; i++) {
            const c = list[i];
            if (c) { A[i].set(c.px, c.pz, c.ax, c.az); B[i].set(c.w / 2, c.ahead, c.behind, 1); } else B[i].w = 0;
        }
    }

    update(dt, focus) {
        if (!this.sea) return;
        // (space and the other planets — Space.js: no sea of the Earth's there)
        if (focus.x >= SPACE.ZONE_X || focus.y >= SPACE.FLOOR_Y) { this.mesh.visible = false; this.active = false; return; }
        const g = this.game;
        this.uniforms.uTime.value = this.sea.time();
        this.uniforms.uStorm.value = this.sea.storm || 0;
        if (g.wind && (g.wind.x || g.wind.z)) this.uniforms.uWind.value.set(g.wind.x, g.wind.z).normalize();
        this._touches(dt);
        if ((this._checkT -= dt) <= 0) {
            this._checkT = 0.5;
            const view = g.world?.terrain?.viewDistance || 112;
            this.active = this.sea.index.near(focus.x, focus.z, view + 200).length > 0;
        }
        if (!this.active) { this.mesh.visible = false; return; }
        const o = this.uniforms.uOrigin.value;
        if (!this._job && (!this.ready || Math.hypot(focus.x - o.x, focus.z - o.y) > 128)) this._startJob(focus.x, focus.z);
        // the first time in big slices (the sea comes into view far away, fog hides it)
        // (far from where the texture was made — a jump, or the sea out of sight a long flight: the old one
        // does not fit here; the sea waits the few frames its new one takes — made all at once it froze a frame ~25 ms)
        if (this._job && this.ready && Math.hypot(focus.x - o.x, focus.z - o.y) > TEX * TEXEL / 2 - 200) this.ready = false;
        if (this._job) this._runJob(this.ready ? SLICE : SLICE * 4, this.ready ? 2 : 4);
        // (once made, the surface never vanishes while the next texture is made: hidden, the sky showed through — swimming fast, a
        //  mermaid's 30 m/s, the sea blinked off and on; the author 05.11: «когда я плыву, у меня под водой мир мигает». The old
        //  texture a little out of place is not seen; only before the first one is the sea held back)
        if (this.ready) this._made = true;
        this.mesh.visible = this.ready || !!this._made;
        const cam = g.camera ? g.camera.getWorldPosition(_v) : focus;
        this.mesh.position.set(Math.round(cam.x / 2) * 2, WATER_LEVEL_Y, Math.round(cam.z / 2) * 2);
    }

    /**
     * A jump far away is coming (Space.js: the fall back into the Earth's air): the shore texture of that
     * place made ahead, a little a frame — on arrival nothing is left to make at once.
     */
    prepareAt(x, z, ms = 2) {
        if (!this.sea) return;
        const ox = Math.round(x / TEXEL) * TEXEL, oz = Math.round(z / TEXEL) * TEXEL, o = this.uniforms.uOrigin.value;
        if (this.ready && Math.hypot(ox - o.x, oz - o.y) < 128) return; // (made already)
        if (!this._job || Math.hypot(this._job.ox - ox, this._job.oz - oz) > 64) this._startJob(x, z);
        this._runJob(SLICE * 4, ms);
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
