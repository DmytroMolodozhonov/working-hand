/**
 * WhirlpoolFx.js — how a whirlpool looks on the sea (Whirlpool.js decides where they are).
 *
 * One flat disc on the water, drawn by a shader — seen from a ship's mast, from the shore or from the air:
 *   the arms: foam spiralling in (logarithmic spirals, five arms, tightening towards the eye, torn by noise);
 *   the eye: a dark sinking funnel in the middle — deep blue-black, a bright thin rim where the water falls over its edge;
 *   the throat: the whole disc tilts in colour towards the eye (darker, bluer), the rim of the disc is a ring of churned white water that fades into the sea;
 *   the spray: a ring of mist and droplets thrown up where the arms meet the rim (the water spells' shared spray pool — one draw call), and now and then a big plume at the eye.
 * One draw call per whirlpool (≤ MAX near), one shared geometry and material kind, made at the loading screen (Game.prewarm samples it).
 */
import * as THREE from 'three';
import { WHIRL } from '../world/TornadoWeather.js';

export const WHIRL_FX = { MAX: 2 };

let _disc = null;
const disc = () => _disc || (_disc = (() => { const g = new THREE.CircleGeometry(1, 96); g.rotateX(-Math.PI / 2); g.userData = { shared: true }; return g; })());

const NOISE = /* glsl */ `
float wH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wH(i), wH(i + vec2(1.0, 0.0)), f.x), mix(wH(i + vec2(0.0, 1.0)), wH(i + vec2(1.0, 1.0)), f.x), f.y); }
float wF(vec2 p) { return wN(p) * 0.55 + wN(p * 2.1 + 7.3) * 0.3 + wN(p * 4.3 - 3.1) * 0.15; }
`;

function whirlMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uK: { value: 1 }, uSpin: { value: 1 }, uLight: { value: 1 }, uEye: { value: 0.16 } },
        vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
uniform float uTime, uK, uSpin, uLight, uEye;
varying vec2 vP;
${NOISE}
void main() {
    float r = length(vP), a = atan(vP.y, vP.x);
    if (r > 1.0) discard;
    float s = uSpin;
    // five arms of foam spiralling in, tightening to the eye, torn by noise, turning faster near the eye
    float turn = uTime * (1.2 + 2.6 * (1.0 - r)) * s;
    float arm = sin(a * 5.0 + log(r + 0.04) * 8.5 * s - turn);
    float torn = wF(vec2(a * 2.0 - uTime * 0.8 * s, r * 11.0 - uTime * 0.6));
    float foam = smoothstep(0.25, 0.9, arm * 0.55 + torn * 0.9 - 0.12) * smoothstep(uEye, uEye + 0.18, r);
    // finer streaks round the eye
    float fine = wF(vec2(a * 12.0 - uTime * 3.0 * s, r * 30.0 - uTime * 1.5));
    foam = max(foam, 0.5 * smoothstep(0.62, 0.9, fine) * (1.0 - smoothstep(0.1, 0.6, r)));
    // the eye: a dark sinking funnel, a bright thin lip where the water falls over its edge
    float eye = 1.0 - smoothstep(uEye * 0.55, uEye, r);
    float lip = smoothstep(0.035, 0.0, abs(r - uEye)) * (0.6 + 0.4 * wN(vec2(a * 6.0 + uTime * 2.0 * s, 3.0)));
    // the throat: the water darkens and blues towards the eye; the outer rim a ring of churned white fading into the sea
    float throat = 1.0 - smoothstep(uEye, 0.85, r);
    float rim = smoothstep(0.1, 0.0, abs(r - 0.9 - 0.04 * sin(a * 7.0 + uTime))) * (0.5 + 0.5 * torn);
    vec3 deep = mix(vec3(0.03, 0.09, 0.14), vec3(0.0, 0.01, 0.03), eye);
    vec3 water = mix(vec3(0.1, 0.32, 0.4), deep, throat * 0.9);
    vec3 col = mix(water, vec3(0.93, 0.97, 1.0), max(max(foam * 0.9, rim), lip)) * uLight;
    float alpha = (0.55 * (1.0 - smoothstep(0.88, 1.0, r)) + 0.5 * foam + 0.8 * rim + 0.9 * lip + 0.95 * eye) * uK;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.96));
}`,
    });
}

export class WhirlpoolFx {
    constructor(scene, spray = null) {
        this.scene = scene;
        this.spray = spray;
        this.slots = [];
        for (let i = 0; i < WHIRL_FX.MAX; i++) {
            const mesh = new THREE.Mesh(disc(), whirlMaterial());
            mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 1;
            mesh.userData.keep = true;
            scene.add(mesh);
            this.slots.push({ mesh, id: null, sprayT: 0, plumeT: 0 });
        }
    }

    /** Draw `list` ([{id, x, z, k, spin}] nearest first) at the sea's level `seaY`; `light` 0…1. */
    update(dt, t, list, seaY, light = 1) {
        const n = Math.min(WHIRL_FX.MAX, list.length);
        for (let i = 0; i < WHIRL_FX.MAX; i++) {
            const S = this.slots[i], w = i < n ? list[i] : null;
            if (!w || w.k <= 0.01) { S.mesh.visible = false; S.id = null; continue; }
            S.id = w.id;
            S.mesh.visible = true;
            const R = WHIRL.PULL * 0.42 * (0.45 + 0.55 * w.k); // the picture: the foam's reach (the pull itself reaches farther)
            S.mesh.position.set(w.x, seaY + 0.28, w.z);
            S.mesh.scale.setScalar(R);
            const u = S.mesh.material.uniforms;
            u.uTime.value = t; u.uK.value = Math.min(1, w.k * 1.3); u.uSpin.value = w.spin; u.uLight.value = light; u.uEye.value = Math.max(0.1, WHIRL.R / R * 0.55);
            // the spray thrown up along the rim, a plume at the eye now and then
            if (this.spray && w.k > 0.3) {
                S.sprayT += dt * 90 * w.k;
                while (S.sprayT >= 1) {
                    S.sprayT -= 1;
                    const a = Math.random() * Math.PI * 2, r = R * (0.55 + Math.random() * 0.4);
                    const x = w.x + Math.cos(a) * r, z = w.z + Math.sin(a) * r;
                    const sw = (7 + Math.random() * 8) * w.spin;
                    this.spray.add(x, seaY + 0.4, z, -Math.sin(a) * sw - Math.cos(a) * 2, 2 + Math.random() * 5, Math.cos(a) * sw - Math.sin(a) * 2, 0.08 + Math.random() * 0.1, 1.4);
                }
                S.plumeT -= dt;
                if (S.plumeT <= 0) {
                    S.plumeT = 0.5 + Math.random() * 1.2;
                    for (let k = 0; k < 10; k++) {
                        const a = Math.random() * Math.PI * 2, r = Math.random() * WHIRL.R * 0.5;
                        this.spray.add(w.x + Math.cos(a) * r, seaY + 0.3, w.z + Math.sin(a) * r, Math.cos(a) * 2.5, 9 + Math.random() * 9, Math.sin(a) * 2.5, 0.15 + Math.random() * 0.15, 2);
                    }
                }
            }
        }
    }

    samples() { const s = this.slots[0]; return [new THREE.Mesh(s.mesh.geometry, s.mesh.material)]; }
    dispose() { for (const S of this.slots) { this.scene.remove(S.mesh); S.mesh.material.dispose(); } this.slots.length = 0; }
}
