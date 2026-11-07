/**
 * RainSummon.js — «Let it rain»: the calling of a storm (the author 07.11: «анимация этого заклинания ужасная. Просто какой-то луч и всё… вдохновиться To the Sun»).
 * The model is SunBeam.js: a beam that FOLLOWS the wand, a big picture in the sky, a ring of shock, shafts down to the ground — here for rain.
 *
 * Phases (~9 s; every computer plays it from the cast packet, the real rain — Storm.js — begins by itself and takes over):
 *   0 – 0.7 s   a column of silver-blue light shoots up from the wand (one shader on two shared cylinders: ragged edge, hot core, veins, a pulse running up,
 *               droplets rising along it), a flash and a ring of spray at the caster's feet;
 *   0.5 – 3.5 s the CLOUDS GATHER: a dark swirling deck forms over the caster (a flat disc growing from 12 m to ~110 m, turning slowly, its rim lit by the beam);
 *               a ring of shock rolls out over the sky as the beam meets it; the first flashes crackle inside it;
 *   2.8 – 8 s   the DOWNPOUR: curtains of rain fall out of the deck to the ground (streaked strips turned to the camera), bolts strike far off with thunder,
 *               the air shakes a little, drops splash round the caster; the beam thins away.
 * In HELL (`blood`): the same, but the clouds are black-crimson, the beam and the curtains blood red — and the rain it brings puts nothing out (RainDouse.js).
 * Made once (shaders compiled with the rest — `sampleModels`); every shape is shared; particles come from the shared pools; no light is made (lightFlash is the shared one).
 */
import * as THREE from 'three';
import { castingHand } from '../game/WandAim.js';

const DUR = 9;
const SKY = 70; // m above the hand: the deck
const SHAFTS = 9, SHAFT_T = 6.5;
const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _vel = new THREE.Vector3();

const NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += vn(p) * a; p = p * 2.03 + 11.7; a *= 0.5; } return s; }`;

// the column: ragged, trembling, hot core, veins running up, a pulse
const BEAM_VS = `
uniform float uTime, uTremble, uYs;
varying vec3 vN, vV;
varying float vY, vA;
${NOISE}
void main() {
    vec3 p = position;
    float a = atan(p.z, p.x), along = p.y * uYs;
    float j = (vn(vec2(along * 0.35 - uTime * 9.0, a * 2.0)) - 0.5) * uTremble * (0.35 + 0.65 * smoothstep(0.0, 30.0, along));
    p.xz += normalize(p.xz + 1e-5) * j;
    vY = along; vA = a;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
}`;
const BEAM_FS = `
uniform float uTime, uOpacity, uWhite;
uniform vec3 uCol, uHot;
varying vec3 vN, vV;
varying float vY, vA;
${NOISE}
void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float ragged = vn(vec2(vA * 5.0 + vY * 0.02, vY * 0.22 - uTime * 7.0));
    float body = pow(f, 1.55 - 0.55 * ragged);
    float core = pow(f, 4.5 - 1.5 * uWhite);
    float vein = smoothstep(0.58, 0.92, vn(vec2(vA * 9.0, vY * 0.05 - uTime * 14.0)));
    float pulse = 0.82 + 0.18 * sin(vY * 0.22 - uTime * 12.0);
    float drops = smoothstep(0.8, 0.97, vn(vec2(vA * 14.0, vY * 0.45 - uTime * 18.0))) * 0.5; // (droplets running up the light)
    vec3 col = mix(uCol, uHot, clamp(core * (0.7 + 0.5 * uWhite) + uWhite * 0.3, 0.0, 1.0)) + uHot * (vein * 0.4 + drops) * body;
    float a = (body * 0.42 + core * 0.8 + vein * body * 0.45 + drops * body) * pulse * smoothstep(0.0, 2.5, vY);
    gl_FragColor = vec4(col, clamp(a * uOpacity, 0.0, 1.0));
}`;

// the cloud deck: a flat disc, swirling round its middle, dark and heavy, the rim lit; NORMAL blending (dark clouds, not light)
const FLAT_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const DECK_FS = `
uniform float uTime, uOpacity, uFlash;
uniform vec3 uCloud, uRim;
varying vec2 vUv;
${NOISE}
void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q);
    if (r > 1.0) discard;
    float a = atan(q.y, q.x);
    float sw = a + (1.0 - r) * 3.2 - uTime * 0.35;                       // (the swirl: turns faster near the middle)
    vec2 pp = vec2(cos(sw), sin(sw)) * r * 3.4;
    float n = fbm(pp * 1.4 + uTime * 0.05) * 0.75 + fbm(pp * 3.1 - uTime * 0.12) * 0.35;
    float dens = smoothstep(0.18, 0.78, n + (1.0 - r) * 0.5);
    float edge = 1.0 - smoothstep(0.62, 1.0, r + (n - 0.5) * 0.3);        // (ragged, soft rim)
    float eye = smoothstep(0.0, 0.2, r);                                   // (a little hollow at the very centre: the beam goes through)
    vec3 col = mix(uCloud * 0.55, uCloud * 1.35, n);
    col += uRim * pow(smoothstep(0.35, 0.95, r), 2.0) * (0.25 + 0.5 * vn(vec2(a * 4.0, uTime * 0.6)));
    col += uRim * uFlash * (0.5 + 0.5 * vn(vec2(a * 3.0 + uTime * 6.0, r * 5.0))) * (1.0 - r);   // (flashes inside the cloud)
    gl_FragColor = vec4(col, clamp(dens * edge * eye * uOpacity, 0.0, 1.0));
}`;

// a ring of shock over the sky
const RING_FS = `
uniform float uOpacity;
uniform vec3 uCol;
varying vec2 vUv;
void main() {
    float r = length(vUv - 0.5) * 2.0;
    float edge = smoothstep(0.90, 0.975, r) * (1.0 - smoothstep(0.975, 1.0, r));
    float trail = smoothstep(0.55, 0.97, r) * smoothstep(0.55, 0.97, r) * 0.04;
    gl_FragColor = vec4(mix(uCol, vec3(1.0), edge * 0.7), (edge + trail * (1.0 - edge)) * uOpacity * step(r, 1.0));
}`;

// a curtain of rain falling to the ground: streaks running down, thin and dense, soft edges
const SHAFT_VS = `
uniform float uSlant;
varying vec2 vUv;
void main() { vUv = uv; vec3 p = position; p.x += (1.0 - uv.y) * uSlant; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const SHAFT_FS = `
uniform float uTime, uOpacity, uSeed;
uniform vec3 uCol;
varying vec2 vUv;
${NOISE}
void main() {
    float x = (vUv.x - 0.5) * 2.0;
    float soft = (1.0 - smoothstep(0.55, 1.0, abs(x)));
    float s1 = smoothstep(0.55, 0.9, vn(vec2(x * 38.0 + uSeed, vUv.y * 5.0 + uTime * 9.0)));
    float s2 = smoothstep(0.62, 0.92, vn(vec2(x * 71.0 + uSeed * 2.0, vUv.y * 9.0 + uTime * 14.0)));
    float mist = 0.25 + 0.3 * vn(vec2(x * 3.0 + uSeed, vUv.y * 2.0 + uTime * 1.2));
    float top = smoothstep(1.0, 0.82, vUv.y) * smoothstep(0.0, 0.1, vUv.y);        // (born in the cloud, dies in the splash)
    gl_FragColor = vec4(uCol, clamp((s1 * 0.8 + s2 * 0.55 + mist * 0.35) * soft * top * uOpacity, 0.0, 1.0));
}`;

let _geo = null;
function geos() {
    if (_geo) return _geo;
    const column = (r) => { const g = new THREE.CylinderGeometry(r * 1.25, r, SKY, 22, 14, true); g.translate(0, SKY / 2, 0); g.userData.shared = true; return g; };
    const circle = new THREE.CircleGeometry(1, 56); circle.rotateX(Math.PI / 2); circle.userData.shared = true;
    const plane = new THREE.PlaneGeometry(1, 1); plane.translate(0, -0.5, 0); plane.userData.shared = true;
    _geo = { outer: column(1.8), inner: column(0.5), circle, plane };
    return _geo;
}

const shader = (vs, fs, uniforms, add = true) => {
    const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
    m.userData.shared = true;
    return m;
};

const WATER = { col: [0.45, 0.72, 1.0], hot: [0.92, 0.98, 1.0], cloud: [0.2, 0.25, 0.33], rim: [0.55, 0.72, 1.0], rain: [0.7, 0.82, 0.95], spark: [0xbfe6ff, 0xffffff, 0x8fc4ff], ring: [0.6, 0.8, 1.0] };
const BLOOD = { col: [0.85, 0.08, 0.1], hot: [1.0, 0.7, 0.6], cloud: [0.2, 0.04, 0.05], rim: [1.0, 0.25, 0.2], rain: [0.75, 0.08, 0.1], spark: [0xff4a3a, 0xffb0a0, 0xc01818], ring: [1.0, 0.3, 0.25] };

export class RainSummon {
    constructor(game) {
        this.game = game;
        this.t = -1;
        this.follow = null;
        this.blood = false;
        this._flash = 0; this._bolt = 0; this._drops = 0; this._shaftT = -1; this._ringT = [-1, -1];
        const G = geos();
        const v3 = (c) => new THREE.Vector3(c[0], c[1], c[2]);
        this.group = new THREE.Group(); this.group.visible = false;
        const beamMat = (white) => shader(BEAM_VS, BEAM_FS, { uTime: { value: 0 }, uOpacity: { value: 0 }, uWhite: { value: white }, uTremble: { value: 0.3 }, uYs: { value: SKY }, uCol: { value: v3(WATER.col) }, uHot: { value: v3(WATER.hot) } });
        this.outerMat = beamMat(0); this.innerMat = beamMat(1);
        this.outer = new THREE.Mesh(G.outer, this.outerMat); this.inner = new THREE.Mesh(G.inner, this.innerMat);
        for (const m of [this.outer, this.inner]) { m.frustumCulled = false; m.renderOrder = 7; this.group.add(m); }
        game.scene.add(this.group);
        // the sky: the deck, two rings of shock
        this.sky = new THREE.Group(); this.sky.visible = false;
        this.deckMat = shader(FLAT_VS, DECK_FS, { uTime: { value: 0 }, uOpacity: { value: 0 }, uFlash: { value: 0 }, uCloud: { value: v3(WATER.cloud) }, uRim: { value: v3(WATER.rim) } }, false);
        this.deck = new THREE.Mesh(G.circle, this.deckMat); this.deck.frustumCulled = false; this.deck.renderOrder = 5;
        this.sky.add(this.deck);
        this.rings = [0, 1].map(() => {
            const m = new THREE.Mesh(G.circle, shader(FLAT_VS, RING_FS, { uOpacity: { value: 0 }, uCol: { value: v3(WATER.ring) } }));
            m.visible = false; m.frustumCulled = false; m.renderOrder = 6; this.sky.add(m);
            return m;
        });
        game.scene.add(this.sky);
        // the curtains of the downpour
        this.shaftGroup = new THREE.Group(); this.shaftGroup.visible = false;
        this.shafts = Array.from({ length: SHAFTS }, (_, i) => {
            const mat = shader(SHAFT_VS, SHAFT_FS, { uTime: { value: 0 }, uOpacity: { value: 0 }, uSeed: { value: i * 7.31 }, uSlant: { value: 0 }, uCol: { value: v3(WATER.rain) } });
            const m = new THREE.Mesh(G.plane, mat); m.frustumCulled = false; m.renderOrder = 6; this.shaftGroup.add(m);
            return { mesh: m, dx: 0, dz: 0, delay: 0 };
        });
        game.scene.add(this.shaftGroup);
        this._at = new THREE.Vector3();
    }

    sampleModels() {
        const G = geos();
        const out = [new THREE.Mesh(G.outer, this.outerMat), new THREE.Mesh(G.circle, this.deckMat), new THREE.Mesh(G.circle, this.rings[0].material), new THREE.Mesh(G.plane, this.shafts[0].mesh.material)];
        for (const m of out) m.scale.setScalar(0.01);
        return out;
    }

    _palette(blood) {
        const P = blood ? BLOOD : WATER;
        this.blood = blood; this._P = P;
        const set = (u, c) => u.value.set(c[0], c[1], c[2]);
        for (const m of [this.outerMat, this.innerMat]) { set(m.uniforms.uCol, P.col); set(m.uniforms.uHot, P.hot); }
        set(this.deckMat.uniforms.uCloud, P.cloud); set(this.deckMat.uniforms.uRim, P.rim);
        for (const r of this.rings) set(r.material.uniforms.uCol, P.ring);
        for (const s of this.shafts) set(s.mesh.material.uniforms.uCol, P.rain);
    }

    /** The spell at `origin` (the hand); `by`/`side`: whose wand the beam follows; `blood`: cast in hell. */
    cast(origin, by = null, side = null, blood = false) {
        const g = this.game;
        this._palette(blood);
        this.t = 0;
        this.follow = by && side ? { by, side } : null;
        this.group.position.copy(origin); this.group.quaternion.identity(); this.group.visible = true;
        this._at.copy(origin); // (the clouds gather over the place of the cast)
        this.sky.position.set(origin.x, origin.y + SKY, origin.z); this.sky.visible = true;
        g.ships?.pin(this.group, () => this.t >= 0 && this.group.visible);
        this._shaftT = -1; this._ringT = [-1, -1]; this._flash = 0; this._bolt = 1.2;
        g.fx?.lightFlash?.(origin, blood ? 0xff4a3a : 0x9fd4ff, 5, 0.6, 50);
        const fx = g.fx, S = this._P.spark;
        if (fx) for (let i = 0; i < 56; i++) { // a ring of spray along the ground from the feet
            const a = (i / 56) * Math.PI * 2;
            fx.spark(_a.set(origin.x, origin.y - 1.7, origin.z), S[i % 3], 0.14, _vel.set(Math.cos(a) * 5.5, 0.5, Math.sin(a) * 5.5), 0.9);
        }
    }

    _followWand() {
        const g = this.game, f = this.follow;
        if (!f) return;
        let o = null, d = null;
        if (f.by === g.localId || f.by === 'local') { const h = castingHand(g); if (h) { o = h.origin; d = h.dir; } }
        else { const h = g.handPose?.(f.by, f.side); if (h) { o = h.origin; d = h.dir; } }
        if (!o || !d) return;
        _p.copy(o); _d.copy(d).normalize();
        if (_d.y < 0.3) _d.y = 0.3; // (the beam goes up into the clouds, never across)
        _d.normalize();
        this.group.position.lerp(_p, 0.85);
        _q.setFromUnitVectors(UP, _d);
        this.group.quaternion.slerp(_q, 0.5);
    }

    update(dt) {
        this._updateRings(dt);
        this._updateShafts(dt);
        if (this.t < 0) { if (this._shaftT < 0 && this._ringT[0] < 0 && this._ringT[1] < 0) this.sky.visible = false; return; }
        this.t += dt;
        const t = this.t, g = this.game, fx = g.fx, P = this._P;
        if (t > DUR) { this.t = -1; this.group.visible = false; this.follow = null; this.deckMat.uniforms.uOpacity.value = 0; this.deck.visible = false; return; }
        this._followWand();
        // the beam: shoots up, holds, thins away (the real rain takes over)
        const up = Math.min(1, t / 0.7), fadeB = t < 5 ? 1 : Math.max(0, (7 - t) / 2);
        const w = (1 + Math.sin(t * 9) * 0.05) * (1 - 0.5 * Math.max(0, (t - 4) / 3));
        this.outer.scale.set(w, up, w); this.inner.scale.set(w, up, w);
        for (const m of [this.outerMat, this.innerMat]) { const u = m.uniforms; u.uTime.value = t; u.uYs.value = SKY * up; u.uTremble.value = 0.25; }
        this.outerMat.uniforms.uOpacity.value = 0.55 * fadeB; this.innerMat.uniforms.uOpacity.value = 0.7 * fadeB;
        this.group.visible = fadeB > 0.01;
        // the deck of clouds: gathers over the place of the cast (the sky group keeps its own place)
        const grow = Math.max(0, Math.min(1, (t - 0.5) / 3));
        const ease = 1 - Math.pow(1 - grow, 2);
        this.deck.visible = grow > 0;
        this.deck.scale.setScalar(12 + 100 * ease);
        this.deck.rotation.y = 0;
        const fadeD = t < DUR - 2 ? 1 : Math.max(0, (DUR - t) / 2);
        this._flash = Math.max(0, this._flash - dt * 3.5);
        const du = this.deckMat.uniforms;
        du.uTime.value = t; du.uOpacity.value = Math.min(1, grow * 1.4) * 0.92 * fadeD; du.uFlash.value = this._flash;
        // the beam meets the cloud: the first ring of shock (and the second as the deck is whole)
        if (t > 0.6 && this._ringT[0] < 0 && !this._r0) { this._r0 = true; this._ringT[0] = 0; this.rings[0].visible = true; this._shake(0.18); }
        if (t > 3 && !this._r1) { this._r1 = true; this._ringT[1] = 0; this.rings[1].visible = true; this._shake(0.3); g.sound?.playThunder?.(0.7); this._flash = 1; }
        if (t < 0.05) { this._r0 = false; this._r1 = false; }
        // the downpour: curtains of rain fall out of the deck
        if (t > 2.8 && this._shaftT < 0 && !this._rainStarted) { this._rainStarted = true; this._startShafts(); }
        if (t < 0.05) this._rainStarted = false;
        if (!fx) return;
        // droplets rising along the beam, sparks off the wand
        this._drops += dt * 50 * fadeB;
        _d.set(0, 1, 0).applyQuaternion(this.group.quaternion);
        while (this._drops >= 1) {
            this._drops -= 1;
            const s = Math.random() * SKY * up, a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 1.6;
            _a.copy(this.group.position).addScaledVector(_d, s); _a.x += Math.cos(a) * r; _a.z += Math.sin(a) * r;
            fx.spark(_a, P.spark[(Math.random() * 3) | 0], 0.09 + Math.random() * 0.12, _vel.set(Math.cos(a) * 0.7, 2 + Math.random() * 4, Math.sin(a) * 0.7), 0.9 + Math.random());
        }
        // bolts inside the gathering cloud, then striking the ground far off with thunder
        this._bolt -= dt;
        if (this._bolt <= 0 && t > 1.6) {
            this._bolt = 0.5 + Math.random() * 1.1;
            this._flash = 1;
            const cx = this._at.x + (Math.random() - 0.5) * 120, cz = this._at.z + (Math.random() - 0.5) * 120, top = this._at.y + SKY - 3;
            fx.lightFlash?.(_a.set(cx, top - 4, cz), this.blood ? 0xff6a50 : 0xcfe0ff, 5, 0.2, 160);
            if (t > 3 && Math.random() < 0.55) {
                const gy = this._at.y - 1.5;
                this._b2 = this._b2 || new THREE.Vector3();
                fx.straightBeam?.(_a.set(cx, top, cz), this._b2.set(cx + (Math.random() - 0.5) * 8, gy, cz + (Math.random() - 0.5) * 8), 0.14, this.blood ? 0xff9a80 : 0xe8f2ff, 0.9, 0.16, null, THREE.AdditiveBlending);
                setTimeout(() => this.game.sound?.playThunder?.(0.3 + Math.random() * 0.4), 350 + Math.random() * 700);
            }
        }
        // splashes round the caster once the rain is coming
        if (t > 3.2 && Math.random() < dt * 40) {
            const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 10, p = this._at;
            fx.spark(_a.set(p.x + Math.cos(a) * r, p.y - 1.8, p.z + Math.sin(a) * r), P.spark[0], 0.06, _vel.set(0, 1.5 + Math.random(), 0), 0.3);
        }
    }

    _shake(k) { const c = this.game.camera?.position, fx = this.game.fx; if (!c || !fx) return; fx.shake = Math.max(fx.shake, k * Math.max(0, 1 - Math.hypot(c.x - this._at.x, c.z - this._at.z) / 200)); }

    _startShafts() {
        const at = this._at, hh = Math.max(25, SKY + 2);
        this._shaftT = 0;
        this.shafts.forEach((s, i) => {
            const a = (i / SHAFTS) * Math.PI * 2 + Math.random() * 0.7, rad = 4 + Math.random() * 70;
            s.dx = at.x + Math.cos(a) * rad; s.dz = at.z + Math.sin(a) * rad;
            const w = 16 + Math.random() * 26; s.delay = Math.random() * 1.4;
            s.mesh.position.set(s.dx, at.y + SKY - 2, s.dz);
            s.mesh.scale.set(w, hh, 1);
            s.mesh.material.uniforms.uSlant.value = (Math.random() - 0.5) * 6;
        });
        this.shaftGroup.visible = true;
    }

    _updateShafts(dt) {
        if (this._shaftT < 0) return;
        this._shaftT += dt;
        if (this._shaftT > SHAFT_T) { this._shaftT = -1; this.shaftGroup.visible = false; return; }
        const cam = this.game.camera?.position;
        for (const s of this.shafts) {
            const e = this._shaftT - s.delay;
            const o = e < 0 ? 0 : Math.min(1, e / 0.8) * (this._shaftT > SHAFT_T - 2 ? Math.max(0, (SHAFT_T - this._shaftT) / 2) : 1);
            const u = s.mesh.material.uniforms;
            u.uOpacity.value = 0.55 * o; u.uTime.value = this._shaftT;
            s.mesh.visible = o > 0.01;
            if (cam) s.mesh.rotation.y = Math.atan2(cam.x - s.dx, cam.z - s.dz);
        }
    }

    _updateRings(dt) {
        for (let i = 0; i < 2; i++) {
            if (this._ringT[i] < 0) continue;
            this._ringT[i] += dt;
            const a = this._ringT[i] / 2.4, m = this.rings[i];
            if (a >= 1) { this._ringT[i] = -1; m.visible = false; continue; }
            m.scale.setScalar(6 + (i ? 150 : 110) * (1 - Math.pow(1 - a, 2.2)));
            m.material.uniforms.uOpacity.value = Math.pow(1 - a, 1.8) * (i ? 0.55 : 0.4);
        }
    }

    dispose() {
        const sc = this.game.scene;
        sc.remove(this.group); sc.remove(this.sky); sc.remove(this.shaftGroup);
        for (const m of [this.outerMat, this.innerMat, this.deckMat, ...this.rings.map((r) => r.material), ...this.shafts.map((s) => s.mesh.material)]) m.dispose();
    }
}
