/**
 * WaterspoutFx.js — how a waterspout over the stormy sea looks (OceanStorm.js decides where they are).
 *
 * A real waterspout: a thin grey-white funnel of cloud hanging from a dark wall cloud down to the sea, bending with the wind and
 * snaking slowly; round its foot a ring of torn spray (the «spray vortex») racing round and thrown up. Drawn so:
 *   - the funnel: one shared lathe (64 rings × 40 round) bent and twisted on the GPU (vertex shader: the bend along the wind, a slow
 *     snaking, the spin — faster low down); its skin — condensation streaks wound round it, brighter at the rim (it is a tube of
 *     mist: seen edge-on thicker), darker up in the cloud, see-through at the very foot;
 *   - the wall cloud: a wide flattened disc of rolling dark cloud over it (its own noise, slowly turning);
 *   - the spray: WaterSpray droplets and mist puffs flung round and up from the foot (the pool is shared, one draw call);
 * one draw call per funnel and per cloud (≤ MAX spouts near), geometry and materials shared, made at the loading screen
 * (Game.prewarm samples it).
 */
import * as THREE from 'three';
import { OCEAN } from '../world/OceanWeather.js';

export const SPOUT_FX = { MAX: 3 };

let _geo = null, _cloudGeo = null;

/** The funnel's profile: radius (m) at height fraction u (0 the sea … 1 the cloud). */
export function funnelRadius(u) {
    const foot = 9 * Math.exp(-u * 22); // (the foot: the spray sheath widens it at the sea)
    const body = 4.5 + 5 * u * u; // (the funnel thickens upward)
    const top = 34 * Math.pow(Math.max(0, (u - 0.8) / 0.2), 2.2); // (it opens into the cloud)
    return foot + body + top;
}

function funnelGeometry() {
    if (_geo) return _geo;
    const R = 64, A = 40;
    const pos = new Float32Array((R + 1) * (A + 1) * 3), uv = new Float32Array((R + 1) * (A + 1) * 2);
    const idx = [];
    for (let i = 0; i <= R; i++) {
        const u = i / R, r = funnelRadius(u);
        for (let j = 0; j <= A; j++) {
            const a = j / A * Math.PI * 2, k = i * (A + 1) + j;
            pos[k * 3] = Math.cos(a) * r; pos[k * 3 + 1] = u * OCEAN.HEIGHT; pos[k * 3 + 2] = Math.sin(a) * r;
            uv[k * 2] = j / A; uv[k * 2 + 1] = u;
            if (i < R && j < A) { const b = k + A + 1; idx.push(k, b, k + 1, k + 1, b, b + 1); }
        }
    }
    _geo = new THREE.BufferGeometry();
    _geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    _geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    _geo.setIndex(idx);
    _geo.computeVertexNormals();
    _geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, OCEAN.HEIGHT / 2, 0), OCEAN.HEIGHT);
    return _geo;
}

function cloudGeometry() {
    if (_cloudGeo) return _cloudGeo;
    _cloudGeo = new THREE.CircleGeometry(1, 48, 0, Math.PI * 2);
    _cloudGeo.rotateX(Math.PI / 2); // (facing down: seen from under it)
    return _cloudGeo;
}

const NOISE = /* glsl */ `
float spH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float spN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(spH(i), spH(i + vec2(1.0, 0.0)), f.x), mix(spH(i + vec2(0.0, 1.0)), spH(i + vec2(1.0, 1.0)), f.x), f.y); }
float spF(vec2 p) { return spN(p) * 0.55 + spN(p * 2.1 + 7.3) * 0.3 + spN(p * 4.3 - 3.1) * 0.15; }
`;

function funnelMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uK: { value: 1 }, uBend: { value: new THREE.Vector2() }, uSpin: { value: 1 }, uSeed: { value: 0 }, uLight: { value: 1 } },
        vertexShader: /* glsl */ `
uniform float uTime, uK, uSpin, uSeed;
uniform vec2 uBend;
varying vec2 vUv;
varying float vRim;
varying vec3 vW;
void main() {
    vUv = uv;
    float u = uv.y;
    vec3 p = position;
    // the spin: faster low down, the mist wound round
    float spin = uTime * uSpin * (2.4 - 1.6 * u);
    float c = cos(spin), s = sin(spin);
    p.xz = mat2(c, -s, s, c) * p.xz;
    // thin while it is still forming / fading: the funnel reaches down as it grows
    float grow = smoothstep(1.0 - uK * 1.15, 1.0 - uK * 1.15 + 0.25, u);
    p.xz *= mix(0.25, 1.0, grow);
    // the bend along the wind (the foot lags), and a slow snaking
    float bend = (1.0 - u) * (1.0 - u);
    p.xz += uBend * bend * 30.0;
    p.x += sin(u * 5.0 + uTime * 0.35 + uSeed) * 6.0 * sin(u * 3.1415);
    p.z += cos(u * 4.0 + uTime * 0.28 + uSeed * 1.7) * 5.0 * sin(u * 3.1415);
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz;
    vec3 n = normalize(mat3(modelMatrix) * vec3(position.x, 0.0, position.z));
    vec3 v = normalize(cameraPosition - w.xyz);
    vRim = 1.0 - abs(dot(n, v));
    vRim *= grow;
    gl_Position = projectionMatrix * viewMatrix * w;
}`,
        fragmentShader: /* glsl */ `
uniform float uTime, uK, uSpin, uLight;
varying vec2 vUv;
varying float vRim;
varying vec3 vW;
${NOISE}
void main() {
    float u = vUv.y;
    // the streaks wound round the tube (spiralling up), torn by the noise
    vec2 q = vec2(vUv.x * 6.0 + u * 9.0 * uSpin - uTime * 0.9 * uSpin, u * 22.0 - uTime * 1.6);
    float streak = spF(q);
    float bands = smoothstep(0.35, 0.85, streak);
    // a tube of mist: thicker seen edge-on
    float a = mix(0.35, 0.92, pow(vRim, 1.2)) * (0.6 + 0.55 * bands);
    a *= smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.86, 1.0, u)); // (the foot torn into spray; the top melts into the cloud)
    a *= uK;
    vec3 low = vec3(0.78, 0.82, 0.86), high = vec3(0.32, 0.35, 0.39);
    vec3 col = mix(low, high, smoothstep(0.1, 0.9, u)) * (0.75 + 0.35 * bands) * uLight;
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
}`,
    });
}

function cloudMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uK: { value: 1 }, uLight: { value: 1 } },
        vertexShader: /* glsl */ `
varying vec2 vP;
void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
uniform float uTime, uK, uLight;
varying vec2 vP;
${NOISE}
void main() {
    float r = length(vP);
    float ang = atan(vP.y, vP.x);
    // the wall cloud turns slowly round the funnel; rolling lumps of cloud, ragged at its edge
    vec2 q = vec2(ang * 3.0 + uTime * 0.05 + r * 2.0, r * 6.0 - uTime * 0.12);
    float n = spF(q * 1.3) * 0.7 + spF(vP * 5.0 + uTime * 0.03) * 0.3;
    float edge = 1.0 - smoothstep(0.55 + 0.25 * n, 1.0, r);
    float a = edge * (0.55 + 0.4 * n) * uK;
    vec3 col = mix(vec3(0.13, 0.15, 0.18), vec3(0.3, 0.33, 0.37), n) * uLight;
    col *= 0.8 + 0.4 * smoothstep(0.0, 0.5, r); // (darkest in the middle, over the funnel)
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
}`,
    });
}

export class WaterspoutFx {
    constructor(scene, spray = null) {
        this.scene = scene;
        this.spray = spray; // WaterSpray (shared with the water spells) — the spray at the foot
        this.slots = [];
        for (let i = 0; i < SPOUT_FX.MAX; i++) {
            const funnel = new THREE.Mesh(funnelGeometry(), funnelMaterial());
            const cloud = new THREE.Mesh(cloudGeometry(), cloudMaterial());
            funnel.visible = cloud.visible = false;
            funnel.frustumCulled = false;
            cloud.renderOrder = 2; funnel.renderOrder = 3;
            funnel.userData.keep = cloud.userData.keep = true;
            scene.add(funnel); scene.add(cloud);
            this.slots.push({ funnel, cloud, id: null, sprayT: 0 });
        }
    }

    /**
     * Draw `spouts` ([{id, x, z, k, spin}] — OceanWeather.spoutsOf, nearest first), the sea at y = `seaY`; the wind `wind` {x, z};
     * `light` 0…1 (the night darker).
     */
    update(dt, t, spouts, seaY, wind, light = 1) {
        const n = Math.min(SPOUT_FX.MAX, spouts.length);
        const wl = Math.hypot(wind?.x || 0, wind?.z || 0) || 1;
        for (let i = 0; i < SPOUT_FX.MAX; i++) {
            const S = this.slots[i], sp = i < n ? spouts[i] : null;
            if (!sp || sp.k <= 0.01) { S.funnel.visible = S.cloud.visible = false; S.id = null; continue; }
            S.id = sp.id;
            S.funnel.visible = S.cloud.visible = true;
            S.funnel.position.set(sp.x, seaY, sp.z);
            const fu = S.funnel.material.uniforms;
            fu.uTime.value = t; fu.uK.value = sp.k; fu.uSpin.value = sp.spin; fu.uLight.value = light;
            fu.uSeed.value = (sp.born || 0) % 100;
            fu.uBend.value.set(-(wind?.x || 0) / wl * 0.6, -(wind?.z || 0) / wl * 0.6);
            const cr = 70 + 50 * sp.k;
            S.cloud.position.set(sp.x, seaY + OCEAN.HEIGHT * 0.97, sp.z);
            S.cloud.scale.set(cr, 1, cr);
            const cu = S.cloud.material.uniforms;
            cu.uTime.value = t; cu.uK.value = Math.min(1, sp.k * 1.4); cu.uLight.value = light;
            // the spray racing round the foot and thrown up
            if (this.spray && sp.k > 0.3) {
                S.sprayT += dt * 90 * sp.k;
                while (S.sprayT >= 1) {
                    S.sprayT -= 1;
                    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 7;
                    const x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r;
                    const sw = (10 + Math.random() * 8) * sp.spin, out = 2 + Math.random() * 3;
                    const vx = -Math.sin(a) * sw + Math.cos(a) * out, vz = Math.cos(a) * sw + Math.sin(a) * out;
                    if (Math.random() < 0.35) this.spray.add(x, seaY + 0.5 + Math.random() * 3, z, vx * 0.5, 2 + Math.random() * 3, vz * 0.5, 1.2 + Math.random() * 1.6, 1.6, 1);
                    else this.spray.add(x, seaY + 0.2, z, vx, 4 + Math.random() * 9, vz, 0.07 + Math.random() * 0.06, 1.2);
                }
            }
        }
    }

    /** For Game.prewarm: the meshes to draw once at the loading screen. */
    samples() { const s = this.slots[0]; return [new THREE.Mesh(s.funnel.geometry, s.funnel.material), new THREE.Mesh(s.cloud.geometry, s.cloud.material)]; }
}
