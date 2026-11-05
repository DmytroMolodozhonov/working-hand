/**
 * TornadoSummonFx.js — the calling of «Tornado» (the author 05.11: «анимация вызова — какой-то луч, примитивный… чтобы небо
 * развернулось и так далее, чтобы реально эпично было»). Every computer plays it from the spell's packet; the spout itself comes down
 * at its end (OceanStorm.summon with a delay of DESCEND s).
 *
 *   0 – 2 s   the call: round the caster a spiral of wind goes up from the wand into the sky, a ring of dust and spray runs out from
 *             the feet; a low rumble swells (SeaSounds 'gale', the thunder far off);
 *   0.5 – 5   the sky turns: over the place a vast cloud vortex opens (up to RADIUS m) — dark spiral arms wheeling round an eye
 *             that glows from within, lightning flickering inside it (one shared light flash), its edge torn and ragged; the world
 *             darkens and it rains (Storm.start);
 *   2 – 6     the sea answers: under the eye the water begins to turn — a disc of foam spiralling in (its own shader on the water),
 *             a ring of spray racing round and closing in, bolts striking the sea round it;
 *   DESCEND   the funnel comes down out of the eye (WaterspoutFx — the spout of OceanStorm), the vortex cloud thins into the spout's
 *             own wall cloud over the next seconds.
 * Two meshes a calling (the cloud vortex, the foam disc), shared geometries, shaders compiled at the loading screen (samples()).
 */
import * as THREE from 'three';
import { WATER_LEVEL_Y } from '../world/Terrain.js';

export const TORNADO_FX = { DESCEND: 3.6, LIFE: 11, RADIUS: 170, HEIGHT: 120, MAX: 2 };

const NOISE = /* glsl */ `
float tH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(tH(i), tH(i + vec2(1.0, 0.0)), f.x), mix(tH(i + vec2(0.0, 1.0)), tH(i + vec2(1.0, 1.0)), f.x), f.y); }
float tF(vec2 p) { return tN(p) * 0.5 + tN(p * 2.03 + 3.1) * 0.3 + tN(p * 4.1 - 7.7) * 0.2; }
`;

let _disc = null;
const disc = () => _disc || (_disc = (() => { const g = new THREE.CircleGeometry(1, 72); g.rotateX(-Math.PI / 2); return g; })());

function cloudMat() {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uT: { value: 0 }, uOpen: { value: 0 }, uFade: { value: 1 }, uFlash: { value: 0 }, uLight: { value: 1 }, uSpin: { value: 1 } },
        vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
uniform float uT, uOpen, uFade, uFlash, uLight, uSpin;
varying vec2 vP;
${NOISE}
void main() {
    float r = length(vP), a = atan(vP.y, vP.x);
    if (r > uOpen) discard;
    // spiral arms wheeling in: a log spiral, turning faster near the eye
    float turn = uT * uSpin * (0.35 + 1.4 * (1.0 - r));
    float arm = sin(a * 3.0 + log(r + 0.03) * 7.0 * uSpin - turn * 3.0);
    vec2 q = vec2(a * 2.0 + turn, r * 9.0 - uT * 0.4);
    float lump = tF(q * 1.4) * 0.65 + tF(vP * 7.0 + uT * 0.05) * 0.35;
    float dense = smoothstep(-0.4, 0.9, arm + (lump - 0.5) * 1.6);
    // the edge torn and ragged as it opens; the eye clear
    float edge = 1.0 - smoothstep(uOpen * (0.72 + 0.18 * lump), uOpen, r);
    float eye = smoothstep(0.035, 0.11, r);
    float alpha = (0.45 + 0.5 * dense) * edge * eye * uFade;
    vec3 dark = vec3(0.09, 0.1, 0.13), mid = vec3(0.26, 0.29, 0.34);
    vec3 col = mix(dark, mid, dense * (0.6 + 0.4 * lump)) * uLight;
    // the eye glows from within; lightning lights the cloud's underside
    col += vec3(0.55, 0.68, 0.9) * (1.0 - smoothstep(0.03, 0.22, r)) * (0.5 + 0.5 * sin(uT * 3.0)) * 0.7;
    col += vec3(0.7, 0.8, 1.0) * uFlash * (0.4 + 0.6 * lump) * (1.0 - r);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.96));
}`,
    });
}

function foamMat() {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uT: { value: 0 }, uK: { value: 0 }, uSpin: { value: 1 }, uLight: { value: 1 } },
        vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
uniform float uT, uK, uSpin, uLight;
varying vec2 vP;
${NOISE}
void main() {
    float r = length(vP), a = atan(vP.y, vP.x);
    if (r > 1.0) discard;
    // foam spiralling in to the middle; the water darker in the middle (it sinks into a funnel)
    float sp = sin(a * 5.0 + log(r + 0.02) * 9.0 * uSpin - uT * 5.0 * uSpin);
    float n = tF(vec2(a * 3.0 - uT * 2.0 * uSpin, r * 14.0));
    float foam = smoothstep(0.35, 0.95, sp * 0.6 + n * 0.8 - 0.1) * (1.0 - smoothstep(0.7, 1.0, r));
    float ring = smoothstep(0.08, 0.0, abs(r - 0.85 + 0.15 * sin(uT * 0.7)));
    vec3 col = mix(vec3(0.06, 0.18, 0.24), vec3(0.92, 0.97, 1.0), foam) * uLight;
    float alpha = (0.35 * (1.0 - r) + 0.85 * foam + 0.6 * ring * n) * uK;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
}`,
    });
}

const _p = new THREE.Vector3(), _v = new THREE.Vector3();

export class TornadoSummonFx {
    /** game: the Game (its fx sparks, light flash, the storm, the sound, the spells' bolts). */
    constructor(game) {
        this.game = game;
        this.slots = [];
        for (let i = 0; i < TORNADO_FX.MAX; i++) {
            const cloud = new THREE.Mesh(disc(), cloudMat()), foam = new THREE.Mesh(disc(), foamMat());
            cloud.visible = foam.visible = false;
            cloud.frustumCulled = foam.frustumCulled = false;
            cloud.renderOrder = 2; foam.renderOrder = 1;
            game.scene.add(cloud); game.scene.add(foam);
            this.slots.push({ cloud, foam, on: false });
        }
    }

    samples() { const s = this.slots[0]; return [new THREE.Mesh(s.cloud.geometry, s.cloud.material), new THREE.Mesh(s.foam.geometry, s.foam.material)]; }

    /** A calling starts: from the caster at `from` (the wand), the spout's place `at` {x, z}. */
    start(from, at, spin = 1) {
        const S = this.slots.find((s) => !s.on) || this.slots[0];
        Object.assign(S, { on: true, t: 0, from: from.clone(), at: { x: at.x, z: at.z }, spin, bolts: 0, sparkT: 0 });
        S.cloud.visible = S.foam.visible = true;
        S.cloud.position.set(at.x, WATER_LEVEL_Y + TORNADO_FX.HEIGHT, at.z);
        S.cloud.scale.setScalar(TORNADO_FX.RADIUS);
        S.foam.position.set(at.x, WATER_LEVEL_Y + 0.35, at.z);
        S.foam.scale.setScalar(30);
        const g = this.game;
        g.storm?.start?.(new THREE.Vector3(at.x, 0, at.z), 30); // (the sky darkens, it rains — near: Storm.start)
        g.sound?.playSea?.(from, 'tail', 0.6);
        g.sound?.playThunder?.(0.5);
    }

    update(dt) {
        const g = this.game, fx = g.fx;
        const light = 1 - 0.7 * (g.world?.nightAmount || 0);
        let any = false;
        for (const S of this.slots) {
            if (!S.on) continue;
            any = true;
            S.t += dt;
            const t = S.t, cu = S.cloud.material.uniforms, fu = S.foam.material.uniforms;
            // the sky turns: the vortex opens, wheels, flickers; thins out at the end into the spout's own cloud
            cu.uT.value = t; cu.uSpin.value = S.spin; cu.uLight.value = light;
            cu.uOpen.value = Math.min(1, Math.max(0, (t - 0.4) / 3.2)) ** 0.7;
            cu.uFade.value = Math.max(0, Math.min(1, (TORNADO_FX.LIFE - t) / 4));
            cu.uFlash.value = Math.max(0, cu.uFlash.value - dt * 5);
            if (t > 1 && t < TORNADO_FX.LIFE - 2 && Math.random() < dt * 2.2) {
                cu.uFlash.value = 0.8 + Math.random() * 0.6;
                _p.set(S.at.x + (Math.random() - 0.5) * 80, S.cloud.position.y - 5, S.at.z + (Math.random() - 0.5) * 80);
                fx?.lightFlash?.(_p, 0xcfe0ff, 6, 0.25, 260);
                if (Math.random() < 0.5) setTimeout(() => g.sound?.playThunder?.(0.35), 300 + Math.random() * 700);
            }
            // the sea answers: the foam disc spins up, the spray ring closes in
            fu.uT.value = t; fu.uSpin.value = S.spin; fu.uLight.value = light;
            fu.uK.value = Math.max(0, Math.min(1, (t - 1.8) / 2)) * Math.max(0, Math.min(1, (TORNADO_FX.LIFE - t) / 3));
            S.foam.scale.setScalar(30 - Math.min(14, Math.max(0, t - 2) * 3));
            if (fx?.spark) {
                // the call: wind spiralling up from the wand (the first 2 s)
                S.sparkT += dt * 70;
                while (S.sparkT >= 1) {
                    S.sparkT -= 1;
                    if (t < 2.4) {
                        const a = t * 9 + Math.random() * 6.28, r = 0.6 + Math.random() * 1.6;
                        _p.set(S.from.x + Math.cos(a) * r, S.from.y + Math.random() * 2, S.from.z + Math.sin(a) * r);
                        _v.set(-Math.sin(a) * 9 * S.spin, 14 + Math.random() * 14, Math.cos(a) * 9 * S.spin);
                        fx.spark(_p, Math.random() < 0.3 ? 0xffffff : 0xb9cfe2, 0.12, _v, 1.5);
                        if (t < 1.2 && Math.random() < 0.4) { // (the ring of dust and spray from the feet)
                            const b = Math.random() * 6.28;
                            _p.set(S.from.x + Math.cos(b) * 0.8, S.from.y - 1.6, S.from.z + Math.sin(b) * 0.8);
                            _v.set(Math.cos(b) * 12, 1.5, Math.sin(b) * 12);
                            fx.spark(_p, 0xd8e2e8, 0.18, _v, 0.9);
                        }
                    }
                    // the spray racing round the place and closing in (from 2 s on)
                    if (t > 2 && t < TORNADO_FX.LIFE - 1) {
                        const b = Math.random() * 6.28, r = Math.max(6, 26 - (t - 2) * 4) * (0.85 + Math.random() * 0.3);
                        _p.set(S.at.x + Math.cos(b) * r, WATER_LEVEL_Y + 0.4, S.at.z + Math.sin(b) * r);
                        _v.set(-Math.sin(b) * 16 * S.spin - Math.cos(b) * 3, 2 + Math.random() * 6, Math.cos(b) * 16 * S.spin - Math.sin(b) * 3);
                        fx.spark(_p, Math.random() < 0.5 ? 0xffffff : 0xdff2ff, 0.16 + Math.random() * 0.1, _v, 1.4);
                    }
                }
            }
            // bolts into the sea round the place (only drawn: the storm's own bolts do the harm)
            if (t > 2.2 && S.bolts < 4 && Math.random() < dt * 1.4) {
                S.bolts++;
                const b = Math.random() * 6.28, r = 20 + Math.random() * 50;
                _p.set(S.at.x + Math.cos(b) * r, WATER_LEVEL_Y, S.at.z + Math.sin(b) * r);
                const sky = _v.copy(_p).add({ x: (Math.random() - 0.5) * 20, y: TORNADO_FX.HEIGHT - 10, z: (Math.random() - 0.5) * 20 });
                const sm = g.spells;
                if (sm?._jagged) for (let k = 0; k < 3; k++) sm._jagged(sky.clone(), _p.clone(), 16, 2.6 - k * 0.7, 0.4);
                fx?.lightFlash?.(_p, 0xdde8ff, 10, 0.35, 180);
                g.sound?.playThunder?.(0.7);
            }
            if (t >= TORNADO_FX.LIFE) { S.on = false; S.cloud.visible = S.foam.visible = false; }
        }
        return any;
    }
}
