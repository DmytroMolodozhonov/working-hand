/**
 * GargoyleRitual.js — what the ritual of the pentagram of the infernal gargoyles LOOKS like (THREE; the numbers are
 * GargoyleRules.js, the rules and the creatures are Gargoyles.js). Cheap by design (CLAUDE.md «Производительность»):
 *
 *  - the RING OF HELLFIRE: one open cylinder round the circle with a flame shader (a head of white-hot fire runs round and
 *    faster and faster, the wall of flame behind it grows, the colours go from white-yellow at the foot through orange and
 *    crimson to black smoke at the tips) + a glowing ring on the ground + embers (the shared spark pool) + ONE shared real
 *    light (`fireLights.want`: no light is made per ritual);
 *  - the STORM CLOUDS: two flat decks of black-crimson cloud (a noise shader, a lightning flash lights them from
 *    inside) over the place at SKY_H m, soft at the edge of SKY_R, and the world's own sky darkened (`skyDark` → Storm.update);
 *  - pooled: at most POOL rings, one pair of decks (the nearest ritual to the camera owns them); every shape and material
 *    is made once (in the constructor, compiled at prewarm: `sampleModels`), nothing is made at a ritual's start and nothing
 *    is kept after it.
 */

import * as THREE from 'three';
import { GARGOYLE, fireStrength, ringAngle, skyNow, skyReach } from './GargoyleRules.js';

const POOL = 3;
const WAVE_T = 2.4; // s a ring of shock takes to cross the sky
const _v = new THREE.Vector3();

const WALL_VS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// the wall of flame: u = round the ring, v = height (0 at the foot)
const WALL_FS = `
uniform float uTime, uStr, uHead;
varying vec2 vUv;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
    float a = vUv.x * 6.2831853;
    // the running head: how far BEHIND it this point is (0 … 2π), the flame is tallest at the head and trails off behind it
    float behind = mod(uHead - a, 6.2831853);
    float trail = exp(-behind * 0.7);
    float head = exp(-behind * 6.0);
    float n = vn(vec2(vUv.x * 46.0, vUv.y * 4.0 - uTime * 3.2)) * 0.6 + vn(vec2(vUv.x * 97.0 + 7.0, vUv.y * 9.0 - uTime * 5.5)) * 0.4;
    float tongues = vn(vec2(vUv.x * 21.0 - uTime * 0.9, uTime * 0.7));
    float height = uStr * (0.32 + 0.38 * trail + 0.55 * head) * (0.55 + 0.9 * tongues);
    float v = vUv.y;
    float body = smoothstep(height, height * 0.35, v + (n - 0.5) * 0.45 * height);
    float core = smoothstep(0.0, 0.14, v) * 0.5 + 0.5;
    float t = clamp(v / max(height, 0.05), 0.0, 1.0);
    vec3 hot = vec3(1.0, 0.92, 0.55), mid = vec3(1.0, 0.36, 0.06), cool = vec3(0.55, 0.05, 0.04), smoke = vec3(0.12, 0.01, 0.02);
    vec3 col = mix(hot, mid, smoothstep(0.0, 0.3, t));
    col = mix(col, cool, smoothstep(0.25, 0.7, t));
    col = mix(col, smoke, smoothstep(0.65, 1.0, t));
    col += vec3(1.0, 0.8, 0.5) * head * 0.8;
    float alpha = clamp(body * core * (0.55 + 0.45 * n) * min(1.0, uStr * 3.0), 0.0, 1.0);
    gl_FragColor = vec4(col * (1.0 + 0.6 * head), alpha);
}`;

const SKY_VS = `
varying vec2 vUv;
varying vec3 vW;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

// a deck of storm cloud: noise scrolling slowly, black with crimson underlight, lightning inside.
// Against the beam of «To the Sun» (the author: «тучи сопротивляются… я борюсь со ТЬМОЙ»): black tendrils reach in and wind round the beam,
// tear and close again; the deck is pressed into a whirl round it; rings of shock roll over the sky (uWaves); cracks of gold light open
// far from the contact and the clouds' own lightning strikes into the beam and dies in it (uBolt); the rim glows gold, and the hole
// grows with the chance (uStress); at the breakthrough (uBurst) a ring of light tears the whole deck apart.
const SKY_FS = `
uniform float uTime, uStr, uFlash, uSeed, uStress, uAct, uBolt, uBoltAng, uBoltSeed, uBurst;
uniform vec3 uCam, uHole, uWaves; // uHole: the beam's place in the deck (x, z) and the hole's radius; uStress 0…1 how hard the clouds press back; uAct 0…1 the struggle is on
varying vec2 vUv;
varying vec3 vW;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q);
    float edge = 1.0 - smoothstep(0.62, 1.0, r);
    vec2 dh = vW.xz - uHole.xy;
    float dist = length(dh);
    // the defence: the clouds draw in towards the beam and swirl round it (a lasting tightening: uStress grows with the struggle)
    float near = uAct * smoothstep(110.0, 6.0, dist);
    float swirl = near * (0.9 + 1.6 * uStress) * sin(uTime * 0.9);
    float cs = cos(swirl), sn = sin(swirl);
    vec2 wp = vW.xz - uHole.xy;
    wp = vec2(cs * wp.x - sn * wp.y, sn * wp.x + cs * wp.y) * (1.0 + near * (0.35 + 0.5 * uStress)) + uHole.xy;
    vec2 p = wp * 0.012 + vec2(uTime * 0.012, uSeed);
    float c = fbm(p) * 0.65 + fbm(p * 2.3 - uTime * 0.02) * 0.35;
    float dens = smoothstep(0.25, 0.8, c + 0.25 + near * (0.18 + 0.3 * uStress)) * edge;
    float under = fbm(p * 1.7 + 3.0);
    vec3 dark = vec3(0.025, 0.012, 0.018);
    vec3 red = vec3(0.42, 0.045, 0.05);
    vec3 gold = vec3(1.0, 0.78, 0.34);
    vec3 col = mix(dark, red, smoothstep(0.35, 0.95, under) * 0.55);
    // a flash lights the cloud from inside: the closer to the strike, the whiter-crimson
    col += vec3(1.0, 0.45, 0.4) * uFlash * (0.35 + 0.65 * fbm(p * 3.0 + 9.0));
    // the hole the beam burns: ragged, the clouds close in on it and let go again (it beats — deeply while the chance is low, hardly at the end),
    // it grows with the chance; a golden rim burning where the light bites
    float ang = atan(dh.y, dh.x);
    float rag = fbm(vec2(ang * 1.7, uTime * 0.9) + 5.0) - 0.5;
    float cyc = 0.5 + 0.5 * sin(uTime * (4.0 + 5.0 * uStress) + rag * 6.0);
    float beat = mix(0.28 + 0.72 * cyc, 0.84 + 0.16 * cyc, smoothstep(0.1, 0.8, uStress));
    float hr = uHole.z * (0.72 + 0.95 * uStress) * beat * (1.0 + rag * 0.7);
    float inside = 1.0 - smoothstep(hr * 0.55, hr, dist);
    float rim = smoothstep(hr * (1.6 + 0.9 * uStress), hr * 0.95, dist) * (1.0 - inside) * uAct;
    col = mix(col, gold, rim * (0.55 + 0.4 * uStress));
    col = mix(col, vec3(1.0, 0.95, 0.75), inside * uAct);
    float alpha = clamp(dens * uStr * 1.15, 0.0, 0.97);
    alpha = max(alpha * (1.0 - inside * uAct * 0.92), rim * 0.65 * uStr);
    if (uAct > 0.01) {
        // golden edges all over the pressed clouds as the chance grows (the dark glows from the inside)
        col += gold * smoothstep(hr * 4.0, hr, dist) * uStress * 0.28 * dens * uAct;
        // black tendrils reach in from the dark, wind round the beam, tear and close again
        float reach = smoothstep(hr * 2.6, hr * 0.15, dist);
        float tn = fbm(vec2(ang * 2.2 + swirl * 0.6 + uTime * 0.35, dist * 0.07 - uTime * (1.1 + uStress)));
        float tear = 0.5 + 0.5 * sin(uTime * 2.3 + ang * 3.0 + uSeed);
        float tend = smoothstep(0.5, 0.7, tn) * reach * (0.4 + 0.6 * uStress) * (0.3 + 0.7 * tear) * uAct;
        col = mix(col, vec3(0.008, 0.003, 0.006), tend);
        alpha = max(alpha, tend * 0.93 * uStr);
        // cracks of gold light far from the contact: they open and close (the sky is torn from afar)
        float ridge = abs(fbm(wp * 0.028 + 3.0) - 0.5);
        float crack = (1.0 - smoothstep(0.0, 0.026, ridge)) * smoothstep(hr * 1.3, hr * 3.0, dist) * (1.0 - smoothstep(hr * 5.0, hr * 9.5, dist));
        crack *= (0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 1.3 + ridge * 40.0 + uSeed))) * uAct * (0.35 + 0.65 * uStress);
        col = mix(col, gold, crack * 0.9);
        alpha = max(alpha, crack * 0.7 * uStr);
        // rings of shock rolling over the sky: the cloud is pushed apart and lit on the wave
        float wv = 0.0;
        for (int i = 0; i < 3; i++) {
            float a = uWaves[i];
            if (a >= 0.0) { float R = a * 170.0, w = 5.0 + 11.0 * a; float d = (dist - R) / w; wv += exp(-d * d) * (1.0 - a); }
        }
        alpha *= 1.0 - clamp(wv, 0.0, 1.0) * 0.55;
        col += gold * wv * 0.85;
        alpha = max(alpha, wv * 0.5 * uStr);
        // the cloud's own lightning: a jagged bolt runs into the beam from the dark and dies in it
        if (uBolt > 0.01) {
            vec2 dir = vec2(cos(uBoltAng), sin(uBoltAng));
            float len = 85.0;
            float along = dot(dh, dir) / len; // 1 at the far end, 0 at the beam
            float perp = dh.x * dir.y - dh.y * dir.x;
            float off = (fbm(vec2(along * 9.0, uBoltSeed)) - 0.5) * 34.0 * smoothstep(0.0, 0.5, along);
            float d = abs(perp - off);
            float inLen = step(0.0, along) * (1.0 - smoothstep(0.92, 1.0, along));
            float line = exp(-d * d / 0.9) * inLen;
            float glowL = exp(-d * d / 26.0) * inLen * 0.5;
            float die = smoothstep(0.0, 0.35, along); // (it fades into the beam)
            vec3 bc = mix(vec3(1.0, 0.92, 0.7), vec3(0.85, 0.75, 1.0), 0.5 * die);
            col += bc * (line * 1.5 + glowL) * uBolt * die;
            alpha = max(alpha, (line + glowL * 0.7) * uBolt * die * uStr);
        }
    }
    if (uBurst >= 0.0) {
        // the breakthrough: a ring of light bursts over the whole deck, the clouds are torn open from the middle in rays
        float R = uBurst * 470.0, fl = 1.0 - uBurst;
        float bd = (dist - R) / (16.0 + 46.0 * uBurst);
        float band = exp(-bd * bd);
        float rays = 0.5 + 0.5 * sin(ang * 17.0 + fbm(vec2(ang * 3.0, uSeed)) * 6.0);
        float lit = clamp(band * 0.95 + smoothstep(R, R * 0.15, dist) * fl * 0.8 * (0.55 + 0.45 * rays), 0.0, 1.0);
        col = mix(col, vec3(1.0, 0.92, 0.66), lit);
        alpha = max(alpha * (1.0 - smoothstep(R, 0.0, dist) * 0.85), band * 0.8 * uStr);
    }
    gl_FragColor = vec4(col, alpha);
}`;

let _scorchMat = null;
function scorchTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    if (!x) return null;
    // a ragged black stain: soot out from the middle in long fingers, charred cracks, a few embers in them
    const g = x.createRadialGradient(128, 128, 10, 128, 128, 126);
    g.addColorStop(0, 'rgba(6,2,3,0.96)'); g.addColorStop(0.55, 'rgba(10,4,4,0.9)'); g.addColorStop(0.85, 'rgba(14,6,5,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 46; i++) { // fingers of soot
        const a = r() * 6.283, len = 40 + r() * 60; x.strokeStyle = `rgba(8,3,3,${0.25 + r() * 0.4})`; x.lineWidth = 3 + r() * 9; x.beginPath(); x.moveTo(128, 128);
        let px = 128, py = 128, an = a; for (let k = 0; k < 6; k++) { an += (r() - 0.5) * 0.7; px += Math.cos(an) * len / 6; py += Math.sin(an) * len / 6; x.lineTo(px, py); } x.stroke();
    }
    for (let i = 0; i < 34; i++) { // ember cracks
        let px = 128 + (r() - 0.5) * 150, py = 128 + (r() - 0.5) * 150, an = r() * 6.28; x.strokeStyle = `rgba(255,${70 + (r() * 60) | 0},20,${0.25 + r() * 0.5})`; x.lineWidth = 0.8; x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 5; k++) { an += (r() - 0.5) * 1.2; px += Math.cos(an) * 6; py += Math.sin(an) * 6; x.lineTo(px, py); } x.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.userData = { shared: true }; return t;
}
function scorchMat() {
    if (_scorchMat) return _scorchMat;
    const tex = scorchTexture();
    _scorchMat = new THREE.MeshBasicMaterial({ color: tex ? 0xffffff : 0x0a0505, map: tex, transparent: true, opacity: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
    _scorchMat.userData.shared = true;
    return _scorchMat;
}

let _shared = null;
/** The shapes and materials every ritual shares (made once). */
function shared() {
    if (_shared) return _shared;
    const wallGeo = new THREE.CylinderGeometry(GARGOYLE.CIRCLE_R, GARGOYLE.CIRCLE_R, 5.2, 72, 8, true);
    wallGeo.translate(0, 2.6, 0);
    const ringGeo = new THREE.RingGeometry(GARGOYLE.CIRCLE_R - 0.7, GARGOYLE.CIRCLE_R + 0.7, 72, 1);
    ringGeo.rotateX(-Math.PI / 2);
    const discGeo = new THREE.CircleGeometry(GARGOYLE.SKY_R + 40, 40);
    discGeo.rotateX(-Math.PI / 2);
    const padGeo = new THREE.CircleGeometry(GARGOYLE.CIRCLE_R - 0.5, 48);
    padGeo.rotateX(-Math.PI / 2);
    for (const g of [wallGeo, ringGeo, discGeo, padGeo]) g.userData.shared = true;
    const wallMat = () => { const m = new THREE.ShaderMaterial({ vertexShader: WALL_VS, fragmentShader: WALL_FS, uniforms: { uTime: { value: 0 }, uStr: { value: 0 }, uHead: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }); m.userData.shared = true; return m; };
    const glowMat = () => { const m = new THREE.MeshBasicMaterial({ color: 0xff4a0e, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }); m.userData.shared = true; return m; };
    const skyMat = (seed) => { const m = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: { uTime: { value: 0 }, uStr: { value: 0 }, uFlash: { value: 0 }, uSeed: { value: seed }, uCam: { value: new THREE.Vector3() }, uHole: { value: new THREE.Vector3(0, 0, 0) }, uStress: { value: 0 }, uAct: { value: 0 }, uWaves: { value: new THREE.Vector3(-1, -1, -1) }, uBolt: { value: 0 }, uBoltAng: { value: 0 }, uBoltSeed: { value: 0 }, uBurst: { value: -1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }); m.userData.shared = true; return m; };
    const scorchGeo = new THREE.CircleGeometry(GARGOYLE.SCORCH_R, 40);
    scorchGeo.rotateX(-Math.PI / 2);
    scorchGeo.userData.shared = true;
    _shared = { wallGeo, ringGeo, discGeo, padGeo, scorchGeo, wallMat, glowMat, skyMat };
    return _shared;
}

export class RitualFx {
    constructor(game) {
        this.game = game;
        const S = shared();
        this.rings = [];
        const scene = game.scene;
        for (let i = 0; i < POOL; i++) {
            const wall = new THREE.Mesh(S.wallGeo, S.wallMat());
            const ring = new THREE.Mesh(S.ringGeo, S.glowMat());
            const pad = new THREE.Mesh(S.padGeo, S.glowMat());
            pad.position.y = 0.08; ring.position.y = 0.1;
            for (const m of [wall, ring, pad]) { m.visible = false; m.frustumCulled = false; m.renderOrder = 5; }
            scene?.add(wall, ring, pad);
            this.rings.push({ wall, ring, pad, used: null });
        }
        this.decks = [0, 1].map((i) => {
            const m = new THREE.Mesh(S.discGeo, S.skyMat(i * 17.3));
            m.visible = false; m.frustumCulled = false; m.renderOrder = 4;
            scene?.add(m);
            return m;
        });
        this.flash = 0;
        this._sky = 0;
        // the scorched ground of the spent pentagrams: a pool (the newest SCORCH_MAX; farther than 260 m not drawn)
        const sm = scorchMat();
        this.scorch = [];
        for (let i = 0; i < GARGOYLE.SCORCH_MAX; i++) {
            const m = new THREE.Mesh(S.scorchGeo, sm);
            m.visible = false; m.frustumCulled = false; m.renderOrder = 2;
            scene?.add(m);
            this.scorch.push({ mesh: m, born: -1, x: 0, y: 0, z: 0 });
        }
    }

    /** The ground of a spent pentagram goes black (it fades in over SCORCH_IN s; `instant`: a world loaded). The oldest mark is reused. */
    addScorch(x, y, z, instant = false) {
        if (this.scorch.some((q) => q.born >= 0 && Math.hypot(q.x - x, q.z - z) < 1)) return;
        let slot = this.scorch.find((q) => q.born < 0);
        if (!slot) slot = this.scorch.reduce((a, b) => (a.born < b.born ? a : b));
        slot.born = performance.now() - (instant ? GARGOYLE.SCORCH_IN * 1000 : 0); slot.x = x; slot.y = y; slot.z = z;
        slot.mesh.position.set(x, y + 0.07, z);
        slot.mesh.rotation.y = (x * 12.9898 + z * 78.233) % 6.28; // (each one lies differently)
    }

    scorchStep(camPos) {
        const now = performance.now();
        for (const q of this.scorch) {
            if (q.born < 0) { q.mesh.visible = false; continue; }
            const near = !camPos || Math.hypot(camPos.x - q.x, camPos.z - q.z) < 260;
            q.mesh.visible = near;
            if (near) { const k = Math.min(1, (now - q.born) / (GARGOYLE.SCORCH_IN * 1000)); q.mesh.scale.setScalar(0.5 + 0.5 * k); } // (the stain spreads out over SCORCH_IN s)
        }
    }

    /** One of each look (Game.prewarm): the flame wall, the glow, the cloud deck — their shaders compiled with the rest. */
    sampleModels() {
        const S = shared();
        const out = [];
        const w = new THREE.Mesh(S.wallGeo, S.wallMat()); w.scale.setScalar(0.01); out.push(w);
        out.push(new THREE.Mesh(S.ringGeo, S.glowMat()));
        out.push(new THREE.Mesh(S.scorchGeo, scorchMat()));
        const d = new THREE.Mesh(S.discGeo, S.skyMat(1)); d.scale.setScalar(0.01); out.push(d);
        return out;
    }

    _ring(r) {
        let slot = this.rings.find((q) => q.used === r);
        if (slot) return slot;
        slot = this.rings.find((q) => !q.used);
        if (!slot) return null;
        slot.used = r;
        return slot;
    }

    /** One frame for a ritual `r` ({c: Vector3, t: seconds since it began}): the fire, the embers, the light. */
    fire(r, dt, camPos) {
        const fx = this.game.fx;
        const k = fireStrength(r.t);
        const slot = this._ring(r);
        if (!slot) return;
        const c = r.c;
        const near = camPos ? Math.hypot(camPos.x - c.x, camPos.z - c.z) < 220 : true;
        const on = k > 0.003 && near;
        for (const m of [slot.wall, slot.ring, slot.pad]) { m.visible = on; m.position.x = c.x; m.position.z = c.z; }
        slot.wall.position.y = c.y; slot.ring.position.y = c.y + 0.1; slot.pad.position.y = c.y + 0.08;
        if (!on) { if (k <= 0.003 && r.t > 1) slot.used = null; return; }
        const u = slot.wall.material.uniforms;
        u.uTime.value = r.t; u.uStr.value = k; u.uHead.value = ringAngle(r.t) % (Math.PI * 2);
        const pulse = 0.75 + 0.25 * Math.sin(r.t * 9);
        slot.ring.material.opacity = Math.min(1, k * 1.3) * pulse;
        slot.pad.material.opacity = k * 0.22 * pulse;
        // the embers fly up from the flame, more and more
        if (fx && near) {
            const want = (3 + 16 * k) * dt * 60; // (embers per frame at 60 FPS: 3 growing to 19, whatever the frame's length)
            const n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
            const head = ringAngle(r.t);
            for (let i = 0; i < n; i++) {
                const a = Math.random() < 0.55 ? head - Math.random() * 1.6 : Math.random() * 6.2832;
                const rad = GARGOYLE.CIRCLE_R + (Math.random() - 0.5) * 0.8;
                _v.set(c.x + Math.cos(a) * rad, c.y + 0.3 + Math.random() * 1.6 * k, c.z + Math.sin(a) * rad);
                fx.spark(_v, Math.random() < 0.3 ? 0xffd070 : Math.random() < 0.6 ? 0xff6a1a : 0xc01a10, 0.07 + Math.random() * 0.12, new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.5 + Math.random() * 4.5 * k, (Math.random() - 0.5) * 1.5), 0.8 + Math.random() * 1.2);
            }
        }
        // the one shared light (FireLights): strong as the fire grows
        this.game.fireLights?.want(c.x, c.y + 1.8, c.z, 2.2 + 3.2 * k);
    }

    /** The sky for the ritual nearest to the camera; `list`: every live ritual. Also the darkness handed to Storm. */
    sky(list, dt, camPos) {
        let best = null, bestK = 0;
        for (const r of list) {
            const d = camPos ? Math.hypot(camPos.x - r.c.x, camPos.z - r.c.z) : 0;
            const k = skyNow(r) * skyReach(d);
            if (k > bestK) { bestK = k; best = r; }
        }
        const now = performance.now();
        this._sky += (bestK - this._sky) * Math.min(1, dt * 3);
        this.flash = Math.max(0, this.flash - dt * 3.2);
        if (!best || this._sky < 0.004) { for (const d of this.decks) d.visible = false; return; }
        const f = best.sunFx, live = !!f && f.on && now - f.at < 700 && f.d.y > 0.05;
        const S = this._sunStep(best, live, dt, now);
        this.decks.forEach((m, i) => {
            m.visible = true;
            m.position.set(best.c.x, best.c.y + GARGOYLE.SKY_H + i * 15, best.c.z);
            const u = m.material.uniforms;
            u.uTime.value = best.t * (1 + i * 0.5); u.uStr.value = skyNow(best) * (i ? 0.8 : 1); u.uFlash.value = this.flash;
            // the beam of «To the Sun» through this deck: where the ray crosses it (kept alive by the caster's messages, a fraction of a second old)
            u.uAct.value += ((live ? 1 : 0) - u.uAct.value) * Math.min(1, dt * (live ? 6 : 2.5));
            if (live) {
                const t = (m.position.y - f.o.y) / f.d.y;
                u.uHole.value.set(f.o.x + f.d.x * t, f.o.z + f.d.z * t, GARGOYLE.SUN.HOLE_R);
                u.uStress.value += (f.s - u.uStress.value) * Math.min(1, dt * 3);
                if (!i) best._hole = [u.uHole.value.x, u.uHole.value.y];
            } else if (best.broken && best._hole) u.uHole.value.set(best._hole[0], best._hole[1], GARGOYLE.SUN.HOLE_R);
            u.uWaves.value.set(S.waves[0], S.waves[1], S.waves[2]);
            u.uBolt.value = S.bolt; u.uBoltAng.value = S.boltAng; u.uBoltSeed.value = S.boltSeed;
            u.uBurst.value = S.burst;
        });
    }

    /**
     * The struggle's rhythm on this computer (a picture only — every computer keeps its own time from the same messages): rings of shock that
     * roll over the sky (and from the beam's heart: `SunBeam.shock`), the clouds' own bolts into the beam (with thunder), the moan of the
     * clouds, and — once they are broken — the age of the breakthrough. Returns the numbers the deck's shader takes.
     */
    _sunStep(r, live, dt, now) {
        const g = this.game;
        const S = r._sunSt || (r._sunSt = { waves: [-1, -1, -1], next: 0.3, bolt: 0, boltAng: 0, boltSeed: 0, boltT: 0.8, groanT: 1.2, thunderT: 0, burst: -1 });
        const f = r.sunFx, st = live ? f.s : 0;
        for (let i = 0; i < 3; i++) if (S.waves[i] >= 0) { S.waves[i] += dt / WAVE_T; if (S.waves[i] >= 1) S.waves[i] = -1; }
        S.bolt = Math.max(0, S.bolt - dt * 5.5);
        if (live) {
            const hole = _v.set(f.o.x + f.d.x * ((r.c.y + GARGOYLE.SKY_H - f.o.y) / f.d.y), r.c.y + GARGOYLE.SKY_H, f.o.z + f.d.z * ((r.c.y + GARGOYLE.SKY_H - f.o.y) / f.d.y));
            S.next -= dt;
            if (S.next <= 0) { // a ring of shock — faster and harder as the struggle grows
                S.next = 1.25 - 0.75 * st + Math.random() * 0.25;
                const k = S.waves.findIndex((a) => a < 0);
                if (k >= 0) S.waves[k] = 0;
                g.sun?.shock?.(st);
            }
            S.boltT -= dt;
            if (S.boltT <= 0) { // the clouds strike back: a bolt from the dark into the beam
                S.boltT = 0.55 + Math.random() * 1.5 - st * 0.45;
                S.bolt = 1; S.boltAng = Math.random() * 6.2832; S.boltSeed = Math.random() * 60;
                this.flash = Math.max(this.flash, 0.3 + 0.5 * st);
                g.sun?.zap?.();
                if (now - S.thunderT > 1800) { S.thunderT = now; g.sound?.playGargoyle?.(hole, 'thunder', 0.7 + 0.5 * st); }
            }
            S.groanT -= dt;
            if (S.groanT <= 0) { S.groanT = 3.6 + Math.random() * 1.6 - st * 1.2; g.sound?.playGargoyle?.(hole, 'groan', 0.55 + 0.6 * st); } // (the clouds «cry»)
        }
        // after the breakthrough: the age of the burst (0 … 1 over BURST_T) — the deck is torn apart from its middle
        if (r.broken) {
            const age = (now - (r.burstAt || (r.burstAt = now))) / 3600;
            S.burst = age < 1 ? age : -1;
        } else S.burst = -1;
        return S;
    }

    /** How dark the world's own sky is made over `camPos` (0 … 1, for Storm.update). */
    skyDark(list, camPos) {
        let k = 0;
        for (const r of list) k = Math.max(k, skyNow(r) * skyReach(Math.hypot(camPos.x - r.c.x, camPos.z - r.c.z)));
        return Math.min(0.88, k * 0.95);
    }

    /** A strike lights the clouds from inside. */
    bolt(strength = 1) { this.flash = Math.max(this.flash, strength); }

    /** A ritual is over: its ring goes back to the pool. */
    release(r) { const s = this.rings.find((q) => q.used === r); if (s) { s.used = null; for (const m of [s.wall, s.ring, s.pad]) m.visible = false; } }

    dispose() {
        const scene = this.game.scene;
        for (const s of this.rings) { for (const m of [s.wall, s.ring, s.pad]) { scene?.remove(m); m.material.dispose(); } }
        for (const d of this.decks) { scene?.remove(d); d.material.dispose(); }
        for (const q of this.scorch) scene?.remove(q.mesh);
        this.scorch = [];
        this.rings = []; this.decks = [];
    }
}
