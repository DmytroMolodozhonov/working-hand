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
${NOISE}
void main() {
    vUv = uv;
    float u = uv.y;
    vec3 p = position;
    // the wall is no smooth pipe: it bulges and pinches, the bulges climbing and turning (mist torn by the wind)
    float ang = uv.x * 6.2832;
    // (no regular rings: the author saw «труба», and the even ripples read as a coiled spring — only noise, two sizes)
    float bulge = spF(vec2(ang * 1.2 + uTime * 0.8 * uSpin, u * 7.0 - uTime * 0.9)) - 0.5;
    float lump = spF(vec2(ang * 3.1 - uTime * 1.3 * uSpin, u * 17.0 - uTime * 1.7)) - 0.5;
    p.xz *= 1.0 + (0.55 * bulge + 0.3 * lump) * (0.4 + 0.6 * (1.0 - u));
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
    // condensation: long streaks wound steeply round the tube (spiralling up fast), billows climbing, a darker core seen through
    vec2 q = vec2(vUv.x * 9.0 + u * 4.0 * uSpin - uTime * 1.3 * uSpin, u * 5.0 - uTime * 1.1);
    float streak = spF(q) * 0.6 + spF(vec2(vUv.x * 23.0 - uTime * 2.2 * uSpin, u * 3.0 - uTime * 0.7)) * 0.4;
    float billow = spF(vec2(vUv.x * 4.0 + uTime * 0.2, u * 9.0 - uTime * 1.6));
    float bands = smoothstep(0.3, 0.8, streak) * (0.6 + 0.6 * billow);
    // a tube of mist: thicker seen edge-on
    float a = mix(0.35, 0.92, pow(vRim, 1.2)) * (0.6 + 0.55 * bands);
    a *= smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.86, 1.0, u)); // (the foot torn into spray; the top melts into the cloud)
    a *= uK;
    vec3 low = vec3(0.78, 0.82, 0.86), high = vec3(0.32, 0.35, 0.39);
    vec3 col = mix(low, high, smoothstep(0.1, 0.9, u)) * (0.68 + 0.42 * bands) * uLight;
    col = mix(col * 0.72, col, pow(vRim, 0.6)); // (the core darker where we see through the tube)
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

let _sheathGeo = null;
/** The spray sheath at the foot: a flared skirt of mist, wide at the sea (SHEATH.R0 m) and narrowing up to the funnel. */
function sheathGeometry() {
    if (_sheathGeo) return _sheathGeo;
    const pts = [];
    for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push(new THREE.Vector2(16 * (1 - u) ** 1.6 + 5.5 * u, u * 26)); }
    _sheathGeo = new THREE.LatheGeometry(pts, 48);
    return _sheathGeo;
}
function sheathMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uK: { value: 1 }, uSpin: { value: 1 }, uLight: { value: 1 } },
        vertexShader: /* glsl */ `
uniform float uTime, uSpin;
varying vec2 vUv; varying float vRim;
${NOISE}
void main() {
    vUv = uv;
    vec3 p = position;
    float ang = uv.x * 6.2832;
    p.xz *= 1.0 + 0.35 * (spF(vec2(ang * 1.5 - uTime * 1.6 * uSpin, uv.y * 4.0 - uTime * 1.2)) - 0.5);
    vec4 w = modelMatrix * vec4(p, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * vec3(position.x, 0.0, position.z));
    vRim = 1.0 - abs(dot(n, normalize(cameraPosition - w.xyz)));
    gl_Position = projectionMatrix * viewMatrix * w;
}`,
        fragmentShader: /* glsl */ `
uniform float uTime, uK, uSpin, uLight;
varying vec2 vUv; varying float vRim;
${NOISE}
void main() {
    float u = vUv.y;
    // spray boiling up and whirled round fast: puffs, streaks, ragged at the top
    float puff = spF(vec2(vUv.x * 12.0 - uTime * 2.6 * uSpin, u * 6.0 - uTime * 2.2));
    float fine = spF(vec2(vUv.x * 40.0 - uTime * 4.0 * uSpin, u * 14.0 - uTime * 3.0));
    float a = (0.25 + 0.75 * smoothstep(0.35, 0.8, puff * 0.7 + fine * 0.3)) * mix(0.35, 0.95, vRim);
    a *= smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.45 + 0.4 * puff, 1.0, u)) * uK;
    vec3 col = vec3(0.86, 0.92, 0.96) * (0.82 + 0.25 * fine) * uLight;
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
}`,
    });
}
function foamMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uK: { value: 1 }, uSpin: { value: 1 }, uLight: { value: 1 } },
        vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
uniform float uTime, uK, uSpin, uLight;
varying vec2 vP;
${NOISE}
void main() {
    float r = length(vP), a = atan(vP.y, vP.x);
    if (r > 1.0) discard;
    // the sea under it: foam spiralling in, a dark sinking eye, a churned ring at the edge
    float sp = sin(a * 5.0 + log(r + 0.02) * 9.0 * uSpin - uTime * 5.0 * uSpin);
    float n = spF(vec2(a * 3.0 - uTime * 2.0 * uSpin, r * 14.0));
    float foam = smoothstep(0.35, 0.95, sp * 0.6 + n * 0.8 - 0.1) * (1.0 - smoothstep(0.7, 1.0, r));
    float ring = smoothstep(0.1, 0.0, abs(r - 0.8 - 0.06 * sin(a * 3.0 + uTime))) * n;
    vec3 col = mix(vec3(0.05, 0.15, 0.2), vec3(0.93, 0.97, 1.0), max(foam, ring)) * uLight;
    float alpha = (0.4 * (1.0 - r) * smoothstep(0.0, 0.15, r) + 0.85 * foam + 0.7 * ring) * uK;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
}`,
    });
}
let _foamDisc = null;
const foamDisc = () => _foamDisc || (_foamDisc = (() => { const g = new THREE.CircleGeometry(1, 64); g.rotateX(-Math.PI / 2); return g; })());

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
            const sheath = new THREE.Mesh(sheathGeometry(), sheathMaterial()), foam = new THREE.Mesh(foamDisc(), foamMaterial());
            sheath.visible = foam.visible = false; sheath.frustumCulled = foam.frustumCulled = false;
            sheath.renderOrder = 4; foam.renderOrder = 1;
            scene.add(funnel); scene.add(cloud); scene.add(sheath); scene.add(foam);
            this.slots.push({ funnel, cloud, sheath, foam, id: null, sprayT: 0 });
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
            if (!sp || sp.k <= 0.01) { S.funnel.visible = S.cloud.visible = S.sheath.visible = S.foam.visible = false; S.id = null; continue; }
            S.id = sp.id;
            S.funnel.visible = S.cloud.visible = S.sheath.visible = S.foam.visible = true;
            // the spray sheath boiling at the foot, the foam spiralling on the sea under it (they follow the funnel's bent foot)
            const bx = sp.x - (wind?.x || 0) / wl * 0.6 * 30 * 0.92, bz = sp.z - (wind?.z || 0) / wl * 0.6 * 30 * 0.92;
            S.sheath.position.set(bx, seaY - 0.5, bz);
            S.sheath.scale.set(0.5 + 0.5 * sp.k, 0.3 + 0.7 * sp.k, 0.5 + 0.5 * sp.k);
            S.foam.position.set(bx, seaY + 0.3, bz);
            S.foam.scale.setScalar(14 + 22 * sp.k);
            for (const m of [S.sheath, S.foam]) { const u = m.material.uniforms; u.uTime.value = t; u.uK.value = Math.max(0, (sp.k - 0.15) / 0.85); u.uSpin.value = sp.spin; u.uLight.value = light; }
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
                S.sprayT += dt * 260 * sp.k;
                while (S.sprayT >= 1) {
                    S.sprayT -= 1;
                    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 12;
                    const x = bx + Math.cos(a) * r, z = bz + Math.sin(a) * r;
                    const sw = (12 + Math.random() * 12) * sp.spin, out = 3 + Math.random() * 5;
                    const vx = -Math.sin(a) * sw + Math.cos(a) * out, vz = Math.cos(a) * sw + Math.sin(a) * out;
                    const k = Math.random();
                    if (k < 0.3) this.spray.add(x, seaY + 0.5 + Math.random() * 6, z, vx * 0.45, 3 + Math.random() * 6, vz * 0.45, 2 + Math.random() * 3, 2.4, 1); // (big puffs of mist)
                    else if (k < 0.45) this.spray.add(x, seaY + 0.3, z, vx * 1.2, 10 + Math.random() * 12, vz * 1.2, 0.12 + Math.random() * 0.1, 2); // (thrown high)
                    else this.spray.add(x, seaY + 0.2, z, vx, 4 + Math.random() * 9, vz, 0.07 + Math.random() * 0.08, 1.3);
                }
            }
        }
    }

    /** For Game.prewarm: the meshes to draw once at the loading screen. */
    samples() { const s = this.slots[0]; return [s.funnel, s.cloud, s.sheath, s.foam].map((m) => new THREE.Mesh(m.geometry, m.material)); }
}
