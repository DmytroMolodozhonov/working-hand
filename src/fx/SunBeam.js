/**
 * SunBeam.js — «To the Sun»: a golden beam from the raised hand into the sky, the clouds part round it in a widening bright ring, sun
 * rays pour down and the rain dies away. Everybody near sees it (the spell is sent to all).
 *
 * Made once (so the shaders are compiled with the rest — `sampleModels`), shown for ~6 s.
 *
 * The beam FOLLOWS the wand (the author: it used to stand where it was cast while the caster walked on): every frame it takes the
 * caster's wand tip and direction again — mine from `castingHand`, another player's from `game.handPose`. Against the black clouds of
 * the gargoyle ritual (SunContest.js) it is held and FIGHTS (the author: «как в дуэли: такой бабах, тучи сопротивляются»; the clash of
 * beams in Duel.js is the model — a bright heart at the meeting point, rings of the shock rolling out, sparks, the air trembling):
 *  - the BEAM itself is a column of white-gold light with a hot core, layers of glow, a trembling ragged edge, veins of light running up it
 *    and a travelling pulse (one shader on two shared cylinders — no single blot of a sprite), light-dust motes drifting along it;
 *  - at the CONTACT with the clouds (`contact`): a blinding heart with rays, rings of shock expanding over the sky (`shock`, called by the
 *    cloud deck in RitualFx so the rings and the deck's waves are the same moment), sparks flung out; the deck's own picture (tendrils,
 *    cracks, bolts, the golden rim) is the cloud shader, GargoyleRitual.js;
 *  - the BREAKTHROUGH (`burst`): a blinding flash, a ring of light over the whole sky, god-rays down to the ground, a shower of sparks.
 * One shared warm light (FireLights) for the caster's face, hands and the ground; every shape and material is made once; the particles come
 * from the shared pools. `fight(len, stress, o, d)` is kept alive by the caster's messages (a viewer's computer too).
 */

import * as THREE from 'three';
import { castingHand } from '../game/WandAim.js';

const DUR = 6.5;
const SKY = 70; // m above the hand: where the clouds open (the column's own length; `len` stretches it up to the cloud deck)
const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _vel = new THREE.Vector3();
const RINGS = 4, SHAFTS = 9, RING_T = 2.4, BURST_T = 3.6, SHAFT_T = 9;
const GOLD = 0xffd36b, WHITE = 0xfff4d0;

// ------------------------------------------------------------------ the shaders
const NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`;

// the column: a ragged, trembling edge, a hot core, veins of light running up, a pulse travelling up
const BEAM_VS = `
uniform float uTime, uTremble, uYs;
varying vec3 vN, vV;
varying float vY, vA;
${NOISE}
void main() {
    vec3 p = position;
    float a = atan(p.z, p.x);
    float along = p.y * uYs;
    float j = (vn(vec2(along * 0.35 - uTime * 9.0, a * 2.0)) - 0.5) * uTremble * (0.35 + 0.65 * smoothstep(0.0, 30.0, along));
    p.xz += normalize(p.xz + 1e-5) * j;
    vY = along; vA = a;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
}`;
const BEAM_FS = `
uniform float uTime, uOpacity, uWhite, uStress, uFlare;
varying vec3 vN, vV;
varying float vY, vA;
${NOISE}
void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float ragged = vn(vec2(vA * 5.0 + vY * 0.02, vY * 0.22 - uTime * 7.0));
    float body = pow(f, 1.55 - 0.55 * ragged);
    float core = pow(f, 4.5 - 1.5 * uWhite);
    float vein = smoothstep(0.58, 0.92, vn(vec2(vA * 9.0, vY * 0.05 - uTime * 14.0)));
    float pulse = 0.82 + 0.18 * sin(vY * 0.22 - uTime * 12.0) + 0.25 * uFlare;
    float fine = 0.88 + 0.12 * vn(vec2(vA * 31.0, vY * 0.7 - uTime * 30.0)); // (the grain of the light)
    vec3 gold = vec3(1.0, 0.70, 0.22), hot = vec3(1.0, 0.97, 0.84);
    vec3 col = mix(gold, hot, clamp(core * (0.7 + 0.5 * uWhite) + uWhite * 0.3, 0.0, 1.0));
    col += vec3(1.0, 0.86, 0.5) * vein * body * 0.55;
    float a = (body * 0.42 + core * 0.8 + vein * body * 0.5) * pulse * fine * (1.0 + 0.5 * uStress) * smoothstep(0.0, 2.5, vY);
    gl_FragColor = vec4(col, clamp(a * uOpacity, 0.0, 1.0));
}`;

// the heart at the clouds: a hot white core, a golden falloff, rays turning round it, breathing with the press of the clouds
const HEART_FS = `
uniform float uTime, uOpacity, uStress;
varying vec2 vUv;
${NOISE}
void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q), a = atan(q.y, q.x);
    float core = exp(-r * r * 22.0);
    float halo = exp(-r * 3.4) * (1.0 - smoothstep(0.7, 1.0, r));
    float rays = pow(0.5 + 0.5 * sin(a * 14.0 + uTime * 2.2 + vn(vec2(a * 2.0, uTime * 0.7)) * 5.0), 3.0) * exp(-r * 2.4) * (1.0 - smoothstep(0.85, 1.0, r));
    float rays2 = pow(0.5 + 0.5 * sin(a * 23.0 - uTime * 3.1 + 1.7), 5.0) * exp(-r * 3.4) * (1.0 - smoothstep(0.8, 1.0, r));
    float flick = 0.85 + 0.3 * vn(vec2(uTime * 14.0, 3.0)) + 0.15 * uStress;
    vec3 col = vec3(1.0, 0.7, 0.24) * (halo * 0.7 + rays * 0.9 + rays2 * 0.5) + vec3(1.0, 0.97, 0.86) * core * 1.5;
    float al = clamp((halo * 0.6 + core * 1.2 + rays * 0.7 + rays2 * 0.4) * flick, 0.0, 1.0);
    gl_FragColor = vec4(col, al * uOpacity);
}`;

// a ring of shock: soft, thin, bright on its outer edge
const RING_FS = `
uniform float uOpacity;
varying vec2 vUv;
void main() {
    float r = length(vUv - 0.5) * 2.0;
    float edge = smoothstep(0.90, 0.975, r) * (1.0 - smoothstep(0.975, 1.0, r));
    float trail = smoothstep(0.55, 0.97, r) * smoothstep(0.55, 0.97, r) * 0.03;
    vec3 col = mix(vec3(1.0, 0.72, 0.28), vec3(1.0, 0.97, 0.85), edge);
    gl_FragColor = vec4(col, (edge + trail * (1.0 - edge)) * uOpacity * step(r, 1.0));
}`;

// a shaft of the sun falling to the ground: soft edges, bright at the top, dust drifting, flicker
const SHAFT_VS = `
uniform float uSlant;
varying vec2 vUv;
void main() { vUv = uv; vec3 p = position; p.x += (1.0 - uv.y) * uSlant; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const SHAFT_FS = `
uniform float uTime, uOpacity, uSeed;
varying vec2 vUv;
${NOISE}
void main() {
    float x = (vUv.x - 0.5) * 2.0;
    float soft = exp(-x * x * 7.5) * (1.0 - smoothstep(0.78, 1.0, abs(x)));
    float along = pow(vUv.y, 0.8) * (1.0 - 0.12 * (1.0 - vUv.y));
    float streak = 0.72 + 0.28 * vn(vec2(x * 6.0 + uSeed, vUv.y * 2.0 - uTime * 0.6));
    float dust = smoothstep(0.78, 0.97, vn(vec2(x * 22.0 + uSeed, vUv.y * 38.0 + uTime * 1.3))) * 0.55;
    float flick = 0.88 + 0.12 * sin(uTime * 1.7 + uSeed * 9.0);
    vec3 col = mix(vec3(1.0, 0.78, 0.38), vec3(1.0, 0.96, 0.8), vUv.y);
    gl_FragColor = vec4(col, clamp((soft * streak + dust * soft) * along * flick * uOpacity, 0.0, 1.0));
}`;

let _geo = null;
/** The shapes every beam shares (made once). */
function geos() {
    if (_geo) return _geo;
    const column = (r) => { const g = new THREE.CylinderGeometry(r * 1.25, r, SKY, 22, 14, true); g.translate(0, SKY / 2, 0); g.userData.shared = true; return g; };
    const circle = new THREE.CircleGeometry(1, 48); circle.rotateX(Math.PI / 2); circle.userData.shared = true; // (lies flat, faces down)
    const plane = new THREE.PlaneGeometry(1, 1); plane.translate(0, -0.5, 0); plane.userData.shared = true; // (hangs from its top edge)
    _geo = { outer: column(2.1), inner: column(0.62), circle, plane };
    return _geo;
}

const shader = (vs, fs, uniforms) => {
    const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    m.userData.shared = true;
    return m;
};
const FLAT_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export class SunBeam {
    constructor(game) {
        this.game = game;
        this.t = -1;
        this.follow = null; // {by, side}: whose wand it follows
        this.len = SKY; // m: how long the beam is now
        this.fightAt = 0; // performance.now() of the last «it fights the clouds» message (it stays on while they keep coming)
        this.fightK = 0; // how hard the clouds press back (0…1)
        this.flare = 0; // 0…1: a bolt struck the beam — it flares up for an instant
        this._move = 0; // m/s of the beam's far end (how fast it is swung): the sparks fly harder
        this._burstT = -1; // s since the breakthrough (-1: none)
        this._shaftT = -1;
        this._dust = 0; this._spray = 0;
        const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const G = geos();
        this.group = new THREE.Group();
        this.group.visible = false;
        // ONE column of light from the hand: a wide ragged glow with a thin white-hot core inside it (shader, GargoyleRitual-style: made once)
        const beamMat = (white) => shader(BEAM_VS, BEAM_FS, { uTime: { value: 0 }, uOpacity: { value: 0 }, uWhite: { value: white }, uStress: { value: 0 }, uFlare: { value: 0 }, uTremble: { value: 0.3 }, uYs: { value: SKY } });
        this.outerMat = beamMat(0); this.innerMat = beamMat(1);
        this.outer = new THREE.Mesh(G.outer, this.outerMat);
        this.inner = new THREE.Mesh(G.inner, this.innerMat);
        for (const m of [this.outer, this.inner]) { m.frustumCulled = false; m.renderOrder = 7; this.group.add(m); }
        // the opening in the rain clouds: a bright widening ring and the sun's disc (the plain «To the Sun» in the rain)
        this.ringMat = add(0xffe08a, 0);
        this.ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 48), this.ringMat);
        this.ring.rotation.x = Math.PI / 2;
        this.ring.position.y = SKY;
        this.discMat = add(0xfff1b8, 0);
        this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), this.discMat);
        this.disc.rotation.x = Math.PI / 2;
        this.disc.position.y = SKY + 0.5;
        this.group.add(this.ring, this.disc);
        // sun rays slanting down out of the opening
        this.rayMat = add(0xffd36b, 0);
        const rayGeo = new THREE.PlaneGeometry(3, SKY * 1.1);
        rayGeo.translate(0, -SKY * 0.55, 0);
        this.rays = [];
        for (let i = 0; i < 10; i++) {
            const r = new THREE.Mesh(rayGeo, this.rayMat);
            const a = (i / 10) * Math.PI * 2;
            r.position.set(Math.cos(a) * 12, SKY, Math.sin(a) * 12);
            r.rotation.set(0, -a, 0);
            r.rotateX(0.18);
            this.rays.push(r);
            this.group.add(r);
        }
        game.scene.add(this.group);
        // the contact with the clouds (world space, flat, in the sky): the heart and the rings of shock
        this.contact = new THREE.Group();
        this.contact.visible = false;
        this.heartMat = shader(FLAT_VS, HEART_FS, { uTime: { value: 0 }, uOpacity: { value: 0 }, uStress: { value: 0 } });
        this.heart = new THREE.Mesh(G.circle, this.heartMat);
        this.heart.frustumCulled = false; this.heart.renderOrder = 8;
        this.contact.add(this.heart);
        this.rings = Array.from({ length: RINGS }, () => {
            const m = new THREE.Mesh(G.circle, shader(FLAT_VS, RING_FS, { uOpacity: { value: 0 } }));
            m.visible = false; m.frustumCulled = false; m.renderOrder = 8;
            this.contact.add(m);
            return { mesh: m, age: -1 };
        });
        game.scene.add(this.contact);
        // the sun's shafts of the breakthrough: each is a flat strip turned to the camera (a slant in the shader), one material each
        this.shaftGroup = new THREE.Group();
        this.shaftGroup.visible = false;
        this.shafts = Array.from({ length: SHAFTS }, (_, i) => {
            const mat = shader(SHAFT_VS, SHAFT_FS, { uTime: { value: 0 }, uOpacity: { value: 0 }, uSeed: { value: i * 7.31 }, uSlant: { value: 0 } });
            const m = new THREE.Mesh(G.plane, mat);
            m.frustumCulled = false; m.renderOrder = 6;
            this.shaftGroup.add(m);
            return { mesh: m, dx: 0, dz: 0, w: 10, delay: 0, h: 60 };
        });
        game.scene.add(this.shaftGroup);
        this._hit = new THREE.Vector3(); // where the beam meets the clouds now
        this._hitOk = false;
    }

    /** One of each look (Game.prewarm): the beam's column, the heart, a ring, a shaft — their shaders compiled with the rest. */
    sampleModels() {
        const G = geos();
        const out = [new THREE.Mesh(G.outer, this.outerMat), new THREE.Mesh(G.circle, this.heartMat), new THREE.Mesh(G.circle, this.rings[0].mesh.material), new THREE.Mesh(G.plane, this.shafts[0].mesh.material)];
        for (const m of out) m.scale.setScalar(0.01);
        return out;
    }

    /** The spell at `origin` (the hand); `by`/`side`: whose wand it follows from now on (none: it stands where it was cast). */
    cast(origin, by = null, side = null) {
        const g = this.game;
        this.t = 0;
        this.len = SKY;
        this.fightAt = 0;
        this.follow = by && side ? { by, side } : null;
        this.group.position.copy(origin);
        this.group.quaternion.identity();
        this.group.visible = true;
        // cast on a ship's deck: the beam stays on the deck as the ship sails on
        g.ships?.pin(this.group, () => this.t >= 0 && this.group.visible);
        // the rain stops (the clouds part); the storm clears over ~3 s
        if (g.storm) g.storm.clearSky();
        g.fx?.lightFlash?.(origin, 0xffe08a, 6, 0.6, 60);
        g.sound?.playMagic?.();
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2;
            g.fx?.spark(origin, i % 2 ? 0xffe08a : 0xffffff, 0.12, new THREE.Vector3(Math.cos(a) * 2, 4 + Math.random() * 6, Math.sin(a) * 2), 1.2);
        }
    }

    /** Is the beam held on the clouds of the ritual now (the caster's messages come)? */
    get fighting() { return this.t >= 0 && performance.now() - this.fightAt < 700; }

    /**
     * The beam fights the clouds: it is `len` m long (up to the deck), they press back with `stress` 0…1. Called by the caster's computer and by
     * its messages. `o`, `d`: the ray itself — taken when nobody's wand is followed (a viewer whose computer never saw the cast).
     */
    fight(len, stress, o = null, d = null) {
        this.fightAt = performance.now();
        this.fightK = stress;
        this.len = Math.max(8, Math.min(260, len));
        if (this.t < 0) { this.t = 1.2; this.group.visible = true; if (o) this.group.position.copy(o); }
        if (o && d && !this.follow) {
            this.group.position.copy(o);
            _q.setFromUnitVectors(UP, _d.copy(d).normalize());
            this.group.quaternion.copy(_q);
        }
    }

    /** A bolt struck the beam: it flares and the heart throws sparks (RitualFx asks, for everybody). */
    zap() { this.flare = 1; this._spray += 22; }

    /** A ring of shock rolls out from the heart (the cloud deck's own wave is the same moment). */
    shock(stress = 0) {
        const slot = this.rings.find((r) => r.age < 0) || this.rings.reduce((a, b) => (a.age > b.age ? a : b));
        slot.age = 0; slot.stress = stress; slot.size = 110;
        slot.mesh.visible = true;
        this._spray += 14 + 20 * stress;
        const fx = this.game.fx;
        if (fx && this._hitOk) fx.shake = Math.max(fx.shake, 0.12 + 0.2 * stress * this._near());
    }

    _near() { // 0…1: how close the heart is to the camera (the trembling is felt when the fight is near)
        const c = this.game.camera?.position;
        if (!c || !this._hitOk) return 0;
        return Math.max(0, 1 - Math.hypot(c.x - this._hit.x, c.z - this._hit.z) / 140);
    }

    /**
     * The clouds are broken at `at` (the place under the deck's hole), the deck at `deckY`, the ground at `groundY`: a blinding flash, a ring of
     * light over the sky and the sun's shafts down to the earth (every computer).
     */
    burst(at, deckY, groundY) {
        const g = this.game;
        this._burstT = 0; this._shaftT = 0;
        this.fightAt = 0; // (the struggle is over: the fight's own picture gives way to the flash)
        this.contact.position.set(at.x, deckY, at.z);
        this.contact.visible = true;
        const hh = Math.max(20, deckY - groundY);
        this.shafts.forEach((s, i) => {
            const a = (i / SHAFTS) * Math.PI * 2 + Math.random() * 0.6, rad = 6 + Math.random() * 62;
            s.dx = at.x + Math.cos(a) * rad; s.dz = at.z + Math.sin(a) * rad;
            s.w = 9 + Math.random() * 20; s.delay = Math.random() * 0.9; s.h = hh * 1.08;
            s.mesh.position.set(s.dx, deckY + 2, s.dz);
            s.mesh.scale.set(s.w, s.h, 1);
            s.mesh.material.uniforms.uSlant.value = (Math.random() - 0.5) * hh * 0.35;
        });
        this.shaftGroup.visible = true;
        const fx = g.fx;
        if (fx) {
            for (let i = 0; i < 160; i++) {
                const a = Math.random() * Math.PI * 2, sp = 18 + Math.random() * 40;
                _a.set(at.x + (Math.random() - 0.5) * 8, deckY + (Math.random() - 0.5) * 4, at.z + (Math.random() - 0.5) * 8);
                fx.spark(_a, i % 3 ? GOLD : WHITE, 0.2 + Math.random() * 0.4, _vel.set(Math.cos(a) * sp, (Math.random() - 0.6) * sp * 0.4, Math.sin(a) * sp), 1.6 + Math.random() * 1.6);
            }
            fx.shake = Math.max(fx.shake, 0.3 + 0.7 * this._nearPoint(at, 240));
        }
        g.sound?.playGargoyle?.(_a.set(at.x, deckY, at.z), 'sunBang', 1.5);
    }

    _nearPoint(p, r) {
        const c = this.game.camera?.position;
        return c ? Math.max(0, 1 - Math.hypot(c.x - p.x, c.z - p.z) / r) : 0;
    }

    /** The wand moved: the beam goes with it (a tip and a direction; the direction is kept in the upper half of the sky). */
    _followWand() {
        const g = this.game, f = this.follow;
        if (!f) return;
        let o = null, d = null;
        if (f.by === g.localId || f.by === 'local') {
            const h = castingHand(g);
            if (h) { o = h.origin; d = h.dir; }
        } else {
            const h = g.handPose?.(f.by, f.side);
            if (h) { o = h.origin; d = h.dir; }
        }
        if (!o || !d) return;
        _p.copy(o); _d.copy(d).normalize();
        if (_d.y < 0.05) _d.y = 0.05; // (a beam into the ground makes no sense: the lowest it goes is the horizon)
        _d.normalize();
        this.group.position.lerp(_p, 0.85);
        _q.setFromUnitVectors(UP, _d);
        this.group.quaternion.slerp(_q, 0.5);
    }

    update(dt) {
        this._updateBurst(dt);
        this._updateRings(dt);
        if (this.t < 0) { if (this._burstT < 0 && !this.rings.some((r) => r.age >= 0)) this.contact.visible = false; return; }
        this.t += dt;
        this._followWand();
        const fight = this.fighting;
        if (fight) this.t = Math.min(this.t, DUR - 1.6); // (held on the clouds: it does not fade while the struggle goes on)
        else if (this.fightAt) { this.fightAt = 0; this.len = SKY; this.t = Math.min(this.t, 3.2); this.fightK = 0; } // (the struggle is over: the beam opens up and fades as it always does)
        const t = this.t;
        if (t > DUR) { this.t = -1; this.group.visible = false; this.follow = null; this._hitOk = false; return; }
        const fadeOut = t > DUR - 1.5 ? (DUR - t) / 1.5 : 1;
        const k = this.fightK;
        // the beam shoots up in 0.6 s
        const up = Math.min(1, t / 0.6) * (this.len / SKY);
        const w = (1 + Math.sin(t * 9) * 0.05) * (fight ? 1 + 0.35 * k + 0.25 * this.flare : 1);
        this.flare = Math.max(0, this.flare - dt * 4);
        this.outer.scale.set(w, up, w); this.inner.scale.set(w * (1 + 0.4 * this.flare), up, w * (1 + 0.4 * this.flare));
        for (const m of [this.outerMat, this.innerMat]) {
            const u = m.uniforms;
            u.uTime.value = t; u.uStress.value = k; u.uFlare.value = this.flare; u.uYs.value = SKY * up;
            u.uTremble.value = fight ? 0.35 + 0.9 * k : 0.2;
        }
        this.outerMat.uniforms.uOpacity.value = (fight ? 0.85 : 0.55) * fadeOut;
        this.innerMat.uniforms.uOpacity.value = (fight ? 1.1 : 0.7) * fadeOut;
        // where it meets the clouds (world space)
        _d.set(0, 1, 0).applyQuaternion(this.group.quaternion);
        this._hit.copy(this.group.position).addScaledVector(_d, this.len);
        this._hitOk = fight;
        if (fight) this._fightFx(dt, t, k, fadeOut, _d);
        else {
            if (this._burstT < 0) this.heartMat.uniforms.uOpacity.value = 0;
            if (this._burstT < 0 && !this.rings.some((r) => r.age >= 0)) this.contact.visible = false;
        }
        this.ring.visible = this.disc.visible = !fight;
        for (const r of this.rays) r.visible = !fight;
        if (!fight) this._rainOpening(t, fadeOut);
        // sparkles round the caster
        if (Math.random() < dt * (fight ? 45 : 25)) {
            const p = this.group.position;
            const a = Math.random() * Math.PI * 2, d = Math.random() * 3;
            this.game.fx?.spark(_b.set(p.x + Math.cos(a) * d, p.y + Math.random() * 6, p.z + Math.sin(a) * d), 0xffe08a, 0.1, _vel.set(0, 3, 0), 1);
        }
    }

    /** The plain «To the Sun» in the rain: the clouds open — a ring widening to ~60 m, the sun's disc behind it, rays pouring down. */
    _rainOpening(t, fadeOut) {
        const open = Math.max(0, Math.min(1, (t - 0.5) / 2.5));
        const R = 4 + open * 60;
        this.ring.position.y = this.len; this.disc.position.y = this.len + 0.5;
        this.ring.scale.setScalar(R);
        this.ringMat.opacity = 0.75 * open * fadeOut;
        this.disc.scale.setScalar(4 + open * 14);
        this.discMat.opacity = 0.8 * open * fadeOut;
        const rays = Math.max(0, Math.min(1, (t - 1.2) / 1.5));
        this.rayMat.opacity = 0.22 * rays * fadeOut;
        this.rays.forEach((r, i) => {
            const a = (i / 10) * Math.PI * 2 + t * 0.15;
            r.position.set(Math.cos(a) * R * 0.5, this.len, Math.sin(a) * R * 0.5);
            r.rotation.set(0, -a, 0);
            r.rotateX(0.2);
        });
    }

    /** The fight on the clouds: the heart, the dust of light along the beam, the sparks of the meeting, the warm light of the caster. */
    _fightFx(dt, t, k, fadeOut, dir) {
        const g = this.game, fx = g.fx, h = this._hit;
        this.contact.position.copy(h);
        this.contact.visible = true;
        const pulse = 1 + 0.12 * Math.sin(t * (7 + 6 * k)) + 0.3 * this.flare;
        const R = (9 + 15 * k) * pulse;
        this.heart.scale.setScalar(R);
        this.heart.rotation.y = t * 0.25;
        const hu = this.heartMat.uniforms;
        hu.uTime.value = t; hu.uStress.value = k; hu.uOpacity.value = (0.75 + 0.25 * k) * fadeOut;
        if (!fx) return;
        // motes of light drifting along the whole beam (the shared spark pool — nothing new is made)
        this._dust += dt * (55 + 40 * k);
        while (this._dust >= 1) {
            this._dust -= 1;
            const s = Math.random() * this.len, a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 2.2;
            _a.copy(this.group.position).addScaledVector(dir, s);
            _a.x += Math.cos(a) * r; _a.z += Math.sin(a) * r;
            fx.spark(_a, Math.random() < 0.4 ? WHITE : GOLD, 0.1 + Math.random() * 0.16, _vel.set(Math.cos(a) * 0.8, 1.5 + Math.random() * 3.5, Math.sin(a) * 0.8), 1 + Math.random() * 1.1);
        }
        // sparks flung out of the meeting point, harder the closer the clouds are to breaking
        this._spray += dt * (30 + 55 * k);
        while (this._spray >= 1) {
            this._spray -= 1;
            const a = Math.random() * Math.PI * 2, sp = 7 + Math.random() * (14 + 16 * k);
            _a.set(h.x + Math.cos(a) * 2, h.y - 0.5, h.z + Math.sin(a) * 2);
            fx.spark(_a, Math.random() < 0.3 ? WHITE : Math.random() < 0.6 ? GOLD : 0xff9a2a, 0.16 + Math.random() * 0.3, _vel.set(Math.cos(a) * sp, -Math.random() * 6, Math.sin(a) * sp), 0.7 + Math.random() * 1.1);
        }
        // a sparse rain of light falls out of the clouds along the beam's end
        if (Math.random() < dt * 14) fx.spark(_a.set(h.x + (Math.random() - 0.5) * 30, h.y - 1, h.z + (Math.random() - 0.5) * 30), GOLD, 0.2, _vel.set(0, -8 - Math.random() * 8, 0), 1.6);
        // the caster's own light: warm on the face, the hands and the ground (the one shared light of FireLights — none is made)
        const p = this.group.position;
        g.fireLights?.want(p.x, p.y + 1.2, p.z, (3.2 + 2.8 * k + 2 * this.flare) * fadeOut);
        g.fireLights?.want(p.x + dir.x * 6, p.y + dir.y * 6 + 1, p.z + dir.z * 6, (2.2 + 2 * k) * fadeOut);
    }

    _updateRings(dt) {
        for (const r of this.rings) {
            if (r.age < 0) continue;
            r.age += dt;
            const a = r.age / RING_T;
            if (a >= 1) { r.age = -1; r.mesh.visible = false; continue; }
            r.mesh.scale.setScalar(5 + (r.size || 110) * (1 - Math.pow(1 - a, 2.2)) * (0.8 + 0.4 * (r.stress || 0)));
            r.mesh.material.uniforms.uOpacity.value = Math.pow(1 - a, 1.8) * (0.4 + 0.3 * (r.stress || 0));
        }
    }

    /** The breakthrough: the flash and the huge ring over the sky, then the shafts of the sun down to the earth. */
    _updateBurst(dt) {
        if (this._burstT >= 0) {
            this._burstT += dt;
            const a = this._burstT / BURST_T;
            if (a >= 1) { this._burstT = -1; this.heartMat.uniforms.uOpacity.value = 0; if (!this.rings.some((r) => r.age >= 0) && !this.fighting) this.contact.visible = false; }
            else {
                this.heart.scale.setScalar(30 + 220 * Math.pow(a, 0.6));
                this.heartMat.uniforms.uTime.value = this._burstT * 2; this.heartMat.uniforms.uStress.value = 1;
                this.heartMat.uniforms.uOpacity.value = Math.pow(1 - a, 1.4) * 1.3;
                const big = this.rings[0];
                if (big.age < 0 && this._burstT < 0.05) { big.age = 0; big.stress = 1; big.size = 330; big.mesh.visible = true; }
            }
        }
        if (this._shaftT >= 0) {
            this._shaftT += dt;
            if (this._shaftT > SHAFT_T) { this._shaftT = -1; this.shaftGroup.visible = false; return; }
            const cam = this.game.camera?.position;
            for (const s of this.shafts) {
                const e = this._shaftT - s.delay;
                const o = e < 0 ? 0 : Math.min(1, e / 0.7) * (e > SHAFT_T - 3.5 - s.delay ? Math.max(0, (SHAFT_T - this._shaftT) / 3.5) : 1);
                const u = s.mesh.material.uniforms;
                u.uOpacity.value = 0.62 * o; u.uTime.value = this._shaftT;
                s.mesh.visible = o > 0.01;
                if (cam) s.mesh.rotation.y = Math.atan2(cam.x - s.dx, cam.z - s.dz); // (a strip turned to the viewer: seen full from anywhere)
            }
        }
    }

    dispose() {
        const sc = this.game.scene;
        sc.remove(this.group); sc.remove(this.contact); sc.remove(this.shaftGroup);
        for (const m of [this.outerMat, this.innerMat, this.heartMat, ...this.rings.map((r) => r.mesh.material), ...this.shafts.map((s) => s.mesh.material)]) m.dispose();
    }
}
