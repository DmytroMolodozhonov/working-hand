/**
 * FireSerpent.js — the fire serpent of «Let the Hellfire Come» (rules: FireSerpentRules.js).
 *
 * While my Hellfire burns, «Serpent» — out of the blaze a huge serpent of the fire itself rises (≈ 55 m of body, the head
 * held ~22 m up), its tail always in its fire: the blaze is where it lives (the wand steers the blaze, so the serpent crawls
 * after it). It writhes; «Атак» at someone — the head goes over, rears and strikes: a bite (−9) and the bitten burns; «Атак»
 * at a place — it goes there and ravages it low (trees, grass, everyone there burns); left alone it guards its master:
 * whoever really hurts him is bitten. Its head and the body lying on the ground are the Hellfire's own blaze (Hellfire._burn):
 * every creature burns as in that fire. «Firefighting» knocks it back, «Firefighting Maxima» held on it puts it out; cold and
 * water charges hurt it; the gods' spells end it. The Hellfire put out («стоп», no mana, water) — the serpent falls apart
 * into embers and steam. While it lives the Hellfire's drain is doubled (Hellfire._updateMine).
 *
 * The body: one tube whose rings sit on a spine computed here (FABRIK from the head, the tail held in the fire), drawn by
 * the video card (the rings' centres and frames are uniforms; the vertex shader places them) — a solid glowing core with
 * flowing flame-scales and an additive shell of licking flames; the head: an opening jaw with white-hot fangs, glowing
 * slit eyes, horns of flame, a glowing throat. Embers, sparks and smoke from the Hellfire's own particle pool.
 * The network: 'fs' ~10×/s (the anchor, the head, how grown, the jaw, the strength, the bite); every computer simulates
 * the body itself from these.
 */
import * as THREE from 'three';
import { SERPENT, serpentBlock, serpentHit, serpentRadius, serpentResponse } from './FireSerpentRules.js';
import { addDark } from './DarkMagic.js';
import { mergeParts } from '../core/MergeGeometry.js';

const N = SERPENT.SEGS;
const RAD = 18; // vertices round a ring
const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const r2 = (v) => Math.round(v * 100) / 100;

const FLAME = [0xffd25a, 0xffb030, 0xff9a1a, 0xff8000, 0xff6400, 0xf04a00, 0xd42a00];
const EMBER = [0xffe680, 0xffb030, 0xff6400];
const SMOKE = [0x4a4440, 0x57504b, 0x625a54];
const STEAM = [0xe8eef2, 0xd5dde2, 0xffffff];
const pick = (a) => a[(Math.random() * a.length) | 0];

// ------------------------------------------------------------------ the shader (made once, shared by every serpent)
const NOISE = `
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ return 0.55 * vn(p) + 0.3 * vn(p * 2.1 + 1.7) + 0.15 * vn(p * 4.3 + 3.1); }
`;
const VERT = `
${NOISE}
uniform float uTime; uniform float uShell;
#ifdef SPINE
uniform vec4 uC[${N}]; uniform vec3 uN[${N}]; uniform vec3 uB[${N}];
attribute float aRing; attribute float aAng;
#endif
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){
#ifdef SPINE
  int i = int(aRing + 0.5);
  vec4 c = uC[i];
  vec3 dir = uN[i] * cos(aAng) + uB[i] * sin(aAng);
  float r = c.w;
  vUv = vec2(aRing, aAng);
#else
  vec3 dir = normal;
  float r = 0.0;
  vUv = vec2(position.z * 0.9 + 40.0, atan(position.x, position.y));
#endif
  if (uShell > 0.0) {
    float f = fbm(vec3(vUv.x * 0.35 - uTime * 2.4, cos(vUv.y) * 1.3, sin(vUv.y) * 1.3 + uTime * 0.7));
#ifdef SPINE
    r *= 1.0 + uShell * (0.22 + 1.1 * f * f);
#else
    r = uShell * (0.12 + 0.5 * f * f);
#endif
  }
#ifdef SPINE
  vec3 p = c.xyz + dir * r;
#else
  vec3 p = position + dir * r;
#endif
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vV = -mv.xyz;
  vN = normalize(mat3(modelViewMatrix) * dir);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
${NOISE}
uniform float uTime; uniform float uHeat; uniform float uFade;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
vec3 ramp(float h){
  vec3 c = mix(vec3(0.28, 0.02, 0.0), vec3(0.95, 0.2, 0.0), smoothstep(0.05, 0.5, h));
  c = mix(c, vec3(1.0, 0.62, 0.12), smoothstep(0.45, 0.85, h));
  return mix(c, vec3(1.0, 0.96, 0.78), smoothstep(0.85, 1.3, h));
}
void main(){
  float u = vUv.x, a = vUv.y;
  vec3 q = vec3(u * 0.55 - uTime * 1.7, cos(a) * 1.4, sin(a) * 1.4);
  float n = fbm(q + vec3(0.0, 0.0, uTime * 0.4));
  float n2 = fbm(q * 2.6 + vec3(uTime * 0.9, 0.0, 0.0));
  // scales of flame: rows along the body, every other row shifted; their edges darker, their middles hotter
  float row = u * 1.7;
  vec2 sc = fract(vec2(a / 6.2831853 * 14.0 + 0.5 * floor(row), row));
  float seam = smoothstep(0.0, 0.2, min(min(sc.x, 1.0 - sc.x), sc.y));
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float heat = (0.3 + 0.7 * n + 0.35 * n2 - (1.0 - seam) * 0.38 + rim * 0.3) * uHeat;
  vec3 col = ramp(heat);
#ifdef SHELL
  float al = smoothstep(0.38, 0.9, n2 + rim * 0.55) * 0.6 * uFade;
  gl_FragColor = vec4(col * al, al);
#else
  gl_FragColor = vec4(col * (0.85 + 0.3 * n2), 1.0);
#endif
}`;

let _mats = null;
/** The three materials (body core, body shell of flames, the head's pieces) and their shared uniforms — made once. */
export function serpentMaterials() {
    if (_mats) return _mats;
    const shared = { uTime: { value: 0 } };
    const mk = (defs, extra, opts) => new THREE.ShaderMaterial({ defines: defs, uniforms: { ...extra, uTime: shared.uTime, uShell: { value: defs.SHELL ? 1 : 0 }, uHeat: { value: 1 }, uFade: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG, ...opts });
    _mats = {
        shared,
        core: (sp) => mk({ SPINE: 1 }, sp, {}),
        shell: (sp) => mk({ SPINE: 1, SHELL: 1 }, sp, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
        head: () => mk({}, {}, {}),
        headShell: () => mk({ SHELL: 1 }, {}, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    };
    return _mats;
}

let _tube = null;
/** The body's geometry: N rings × RAD vertices, only (ring, angle) — the video card places them. */
function tubeGeometry() {
    if (_tube) return _tube;
    const ring = new Float32Array(N * RAD), ang = new Float32Array(N * RAD), pos = new Float32Array(N * RAD * 3);
    for (let i = 0; i < N; i++) for (let j = 0; j < RAD; j++) { ring[i * RAD + j] = i; ang[i * RAD + j] = (j / RAD) * TAU; }
    const idx = [];
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < RAD; j++) {
        const a = i * RAD + j, b = i * RAD + ((j + 1) % RAD), c = a + RAD, d = b + RAD;
        idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRing', new THREE.BufferAttribute(ring, 1));
    g.setAttribute('aAng', new THREE.BufferAttribute(ang, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    g.userData.shared = true; // (every serpent's; never disposed)
    return (_tube = g);
}

let _headGeo = null;
/** The head's pieces (shared): the lower jaw, the fangs, the horns of flame, the eyes and their slits, the throat. */
function headGeometry() {
    if (_headGeo) return _headGeo;
    const jaw = new THREE.SphereGeometry(1, 16, 8, 0, TAU, Math.PI / 2, Math.PI / 2); // (the lower half: the jaw's bowl)
    const cone = new THREE.ConeGeometry(1, 1, 7);
    const fangsUp = [], fangsLow = [];
    for (const sx of [-1, 1]) {
        fangsUp.push({ geo: cone, pos: [sx * 0.62, -0.55, 1.85], rot: [Math.PI, 0, 0], scale: [0.17, 1.05, 0.17] }); // (the two great fangs, down)
        fangsUp.push({ geo: cone, pos: [sx * 0.85, -0.35, 1.1], rot: [Math.PI, 0, 0], scale: [0.1, 0.5, 0.1] });
        fangsLow.push({ geo: cone, pos: [sx * 0.55, 0.25, 1.75], scale: [0.11, 0.6, 0.11] });
        fangsLow.push({ geo: cone, pos: [sx * 0.8, 0.18, 1.0], scale: [0.08, 0.4, 0.08] });
    }
    const horns = [];
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) horns.push({ geo: cone, pos: [sx * (0.75 - k * 0.1), 0.9 - k * 0.05, -0.2 - k * 1.0], rot: [-1.9 + k * 0.12, 0, sx * (0.35 + k * 0.1)], scale: [0.32 - k * 0.06, 1.9 - k * 0.4, 0.32 - k * 0.06] });
    horns.push({ geo: cone, pos: [0, 1.0, 0.6], rot: [-1.6, 0, 0], scale: [0.22, 1.2, 0.5] }); // (the crest over the brow)
    const ridges = [];
    for (const sx of [-1, 1]) ridges.push({ geo: new THREE.SphereGeometry(1, 10, 6), pos: [sx * 0.72, 0.52, 1.05], scale: [0.36, 0.2, 0.85] }); // (the brows over the eyes)
    _headGeo = {
        jaw,
        fangsUp: mergeParts(fangsUp),
        fangsLow: mergeParts(fangsLow),
        horns: mergeParts([...horns, ...ridges]),
        eye: new THREE.SphereGeometry(0.3, 12, 8),
        slit: new THREE.BoxGeometry(0.07, 0.42, 0.06),
        throat: new THREE.SphereGeometry(1, 12, 8),
    };
    for (const k in _headGeo) _headGeo[k].userData.shared = true; // (every serpent's; never disposed)
    return _headGeo;
}

let _basic = null;
const basics = () => _basic || (_basic = {
    fang: new THREE.MeshBasicMaterial({ color: 0xfff1cc }),
    eye: new THREE.MeshBasicMaterial({ color: 0xfff6b0 }),
    slit: new THREE.MeshBasicMaterial({ color: 0x1a0300 }),
    throat: new THREE.MeshBasicMaterial({ color: 0xffd060, side: THREE.BackSide }),
});

// ------------------------------------------------------------------ one serpent (mine or another computer's)
class Serpent {
    constructor(sys, by, anchor) {
        this.sys = sys; this.by = by;
        this.id = 'fs:' + by;
        this.isFireSerpent = true;
        this.anchor = anchor.clone();
        this.head = anchor.clone();
        this.headT = anchor.clone(); // (where the head is going)
        this.p = Array.from({ length: N }, () => anchor.clone());
        this.r = new Float32Array(N);
        this.grow = 0; this.fade = 0; this.dead = false;
        this.hp = SERPENT.HP;
        this.jaw = 0; this.jawT = 0;
        this.mode = 'rise'; this.modeT = 0;
        this.target = null; // {k, id}
        this.point = null; // {x, y, z} a place to ravage
        this.biteCd = 0; this.burnT = 0; this.bodyI = 0;
        this.face = new THREE.Vector3(0, 0, 1);
        this.vel = new THREE.Vector3();
        this.surgeT = 0; this.pushT = 0;
        this.hissT = 0; this.wobble = Math.random() * 10;
        this._build();
    }

    _build() {
        const M = serpentMaterials(), g = this.sys.game;
        const spine = { uC: { value: Array.from({ length: N }, () => new THREE.Vector4()) }, uN: { value: Array.from({ length: N }, () => new THREE.Vector3(1, 0, 0)) }, uB: { value: Array.from({ length: N }, () => new THREE.Vector3(0, 0, 1)) } };
        this.spine = spine;
        this.coreMat = M.core(spine); this.shellMat = M.shell(spine);
        this.headMat = M.head(); this.headShellMat = M.headShell();
        const geo = tubeGeometry(), H = headGeometry(), B = basics();
        this.group = new THREE.Group();
        this.group.name = 'fireSerpent';
        const core = new THREE.Mesh(geo, this.coreMat), shell = new THREE.Mesh(geo, this.shellMat);
        core.frustumCulled = shell.frustumCulled = false;
        shell.renderOrder = 3;
        this.group.add(core, shell);
        // the head: its frame sits on the skull ring; z — forward, y — up
        const hd = this.headGroup = new THREE.Group();
        const horns = new THREE.Mesh(H.horns, this.headMat), hornsF = new THREE.Mesh(H.horns, this.headShellMat);
        hornsF.renderOrder = 3;
        const fu = new THREE.Mesh(H.fangsUp, B.fang);
        const throat = new THREE.Mesh(H.throat, B.throat); throat.scale.set(0.95, 0.6, 1.3); throat.position.set(0, -0.35, 0.6);
        hd.add(horns, hornsF, fu, throat);
        for (const sx of [-1, 1]) {
            const e = new THREE.Mesh(H.eye, B.eye); e.position.set(sx * 0.78, 0.32, 1.25); e.scale.set(1, 0.8, 1.1);
            const s = new THREE.Mesh(H.slit, B.slit); s.position.set(sx * 0.98, 0.32, 1.32); s.rotation.y = sx * 0.5;
            hd.add(e, s);
        }
        // the lower jaw: hinged at the back of the head
        const hinge = this.jawHinge = new THREE.Group();
        hinge.position.set(0, -0.35, -0.9);
        const jaw = new THREE.Mesh(H.jaw, this.headMat); jaw.scale.set(1.05, 0.55, 1.75); jaw.position.set(0, 0, 1.6);
        const jawF = new THREE.Mesh(H.jaw, this.headShellMat); jawF.scale.copy(jaw.scale); jawF.position.copy(jaw.position); jawF.renderOrder = 3;
        const fl = new THREE.Mesh(H.fangsLow, B.fang); fl.position.set(0, 0, 0.9);
        hinge.add(jaw, jawF, fl);
        hd.add(hinge);
        this.group.add(hd);
        for (const m of [...this.group.children, ...hd.children, ...hinge.children]) m.frustumCulled = false;
        g.scene?.add(this.group);
    }

    dispose() {
        this.group.removeFromParent();
        for (const m of [this.coreMat, this.shellMat, this.headMat, this.headShellMat]) m.dispose(); // (the geometries are shared)
    }

    /** How many rings are out of the fire now (the head first). */
    get out() { return Math.max(2, Math.round(N * clamp(this.grow, 0.04, 1))); }

    /** The point the head bites with (in front of the skull). */
    mouth(out) { return out.copy(this.p[N - 1]); }

    /** The body as one capsule for a charge (Duel._bodies): the neck to the snout. */
    bodyCapsule(e) {
        e.a.copy(this.p[Math.floor(N * 0.7)]); e.b.copy(this.p[N - 2]);
        e.r = SERPENT.R_BODY * 1.2;
        return e;
    }

    centre(out) { return out.copy(this.p[N - 4]); }

    // ---------------------------------------------------------------- the body (every computer)
    /** The spine: the head runs to `headT`, the body follows (FABRIK), the tail stays in the fire; writhing; on the ground. */
    step(dt, speed) {
        const g = this.sys.game, t = this.sys._t;
        // the head
        _a.subVectors(this.headT, this.head);
        const L = _a.length(), st = speed * dt;
        if (L > st) _a.multiplyScalar(st / L);
        this.head.add(_a);
        this.vel.copy(_a).divideScalar(Math.max(dt, 1e-4));
        const out = this.out, i0 = N - out;
        // (what is not out yet waits in the fire)
        for (let i = 0; i < i0; i++) this.p[i].copy(this.anchor);
        const p = this.p, seg = SERPENT.SEG_LEN;
        // writhing: a wave running down the body, sideways; the loose middle sags to the ground
        for (let i = i0 + 1; i < N - 1; i++) {
            const k = (i - i0) / Math.max(1, out - 1);
            _b.subVectors(p[i + 1], p[i - 1]);
            _c.crossVectors(_b, _up);
            if (_c.lengthSq() > 1e-6) _c.normalize();
            const w = Math.sin(i * 0.42 - t * 3.1 + this.wobble) * (0.9 + 1.4 * (1 - k)) * dt * (this.fade > 0 ? 0.3 : 1);
            p[i].addScaledVector(_c, w);
            if (k < 0.6) p[i].y -= 7 * dt * (1 - k / 0.6);
        }
        // FABRIK: from the head down, then from the fire up
        p[N - 1].copy(this.head);
        for (let i = N - 2; i >= i0; i--) {
            _b.subVectors(p[i], p[i + 1]);
            const l = _b.length() || 1;
            p[i].copy(p[i + 1]).addScaledVector(_b, seg / l);
        }
        p[i0].copy(this.anchor);
        for (let i = i0 + 1; i < N; i++) {
            _b.subVectors(p[i], p[i - 1]);
            const l = _b.length() || 1;
            if (l > seg) p[i].copy(p[i - 1]).addScaledVector(_b, seg / l);
        }
        // never under the ground
        const col = g.collision;
        for (let i = i0; i < N; i++) {
            const r = serpentRadius(i, N);
            const gy = col?.groundY ? col.groundY(p[i].x, p[i].z) : -Infinity;
            if (p[i].y < gy + r * 0.85) p[i].y = gy + r * 0.85;
        }
        this.head.copy(p[N - 1]);
        // the radii: it rises out of the fire, it collapses at the end
        const sc = (this.grow < 1 ? 0.35 + 0.65 * this.grow : 1) * (1 - 0.85 * this.fade) * (0.75 + 0.25 * this.hp / SERPENT.HP);
        for (let i = 0; i < N; i++) this.r[i] = i < i0 ? 0 : serpentRadius(i, N) * sc * (i === N - 1 ? 0.3 : 1) * (i - i0 < 3 ? (i - i0 + 1) / 4 : 1);
    }

    /** The uniforms (relative to the anchor: precise in far places too), the head's frame, the jaw. */
    draw(dt) {
        const g = this.sys.game, p = this.p, o = this.anchor;
        this.group.position.copy(o);
        this.group.updateMatrix();
        const C = this.spine.uC.value, Nn = this.spine.uN.value, Bb = this.spine.uB.value;
        // a frame carried along the spine without twisting (it starts upright at the tail)
        _c.set(0, 1, 0);
        for (let i = 0; i < N; i++) {
            const a = p[Math.max(0, i - 1)], b = p[Math.min(N - 1, i + 1)];
            _b.subVectors(b, a);
            if (_b.lengthSq() < 1e-8) _b.copy(this.face);
            _b.normalize();
            _c.addScaledVector(_b, -_c.dot(_b));
            if (_c.lengthSq() < 1e-6) _c.set(1, 0, 0).addScaledVector(_b, -_b.x);
            _c.normalize();
            Nn[i].copy(_c);
            Bb[i].crossVectors(_b, _c);
            C[i].set(p[i].x - o.x, p[i].y - o.y, p[i].z - o.z, this.r[i]);
        }
        // the head: on the skull ring, looking along the neck's end; upright
        _b.subVectors(p[N - 1], p[N - 4]);
        if (_b.lengthSq() > 1e-6) this.face.copy(_b.normalize());
        const sk = p[N - 3];
        _c.copy(_up).addScaledVector(this.face, -this.face.dot(_up));
        if (_c.lengthSq() < 1e-4) _c.set(1, 0, 0);
        _c.normalize();
        _d.crossVectors(_c, this.face);
        _m.makeBasis(_d, _c, this.face);
        const hd = this.headGroup;
        hd.quaternion.setFromRotationMatrix(_m);
        hd.position.set(sk.x - o.x, sk.y - o.y, sk.z - o.z);
        const hs = Math.max(0.01, this.r[N - 3] / (SERPENT.R_BODY * 1.1));
        hd.scale.setScalar(hs);
        hd.visible = this.grow > 0.6;
        // the jaw: snaps open before a bite, shut after; it breathes a little when idle
        this.jaw += (this.jawT - this.jaw) * Math.min(1, dt * 9);
        this.jawHinge.rotation.x = 0.08 + this.jaw * 0.85 + Math.sin(this.sys._t * 2.3 + this.wobble) * 0.04;
        // heat: weakened — darker embers
        const heat = (0.65 + 0.35 * this.hp / SERPENT.HP) * (1 - 0.6 * this.fade);
        for (const m of [this.coreMat, this.shellMat, this.headMat, this.headShellMat]) { m.uniforms.uHeat.value = heat; m.uniforms.uFade.value = 1 - this.fade; }
        this._particles(dt);
    }

    _particles(dt) {
        const P = this.sys.game.hellfire?.pool, S = this.sys;
        if (!P) return;
        const out = this.out, i0 = N - out, p = this.p;
        // embers rising off the body, flames licking off the back, sparks from the jaws, smoke from the head
        const n = S._n('ember', 90 * (1 - this.fade) + 160 * this.fade, dt, 14);
        for (let k = 0; k < n; k++) {
            const i = i0 + ((Math.random() * out) | 0), r = this.r[i];
            P.spawn(p[i].x + (Math.random() - 0.5) * r * 2, p[i].y + r * (0.3 + Math.random() * 0.7), p[i].z + (Math.random() - 0.5) * r * 2,
                (Math.random() - 0.5) * 1.5, 2 + Math.random() * 3, (Math.random() - 0.5) * 1.5, this.fade > 0 ? pick(EMBER) : pick(FLAME), 0.25 + Math.random() * 0.35 * r, 0.6 + Math.random() * 0.6, { shrink: 0.5, spin: 4 });
        }
        const h = p[N - 1];
        const sm = S._n('smoke', 10, dt, 3);
        for (let k = 0; k < sm; k++) P.spawn(h.x + (Math.random() - 0.5) * 2, h.y + 1.5, h.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5), 2.5 + Math.random() * 2, (Math.random() - 0.5), pick(SMOKE), 1.2 + Math.random(), 1.6, { shrink: -0.6, spin: 1 });
        if (this.jaw > 0.4) {
            const sp = S._n('spit', 60 * this.jaw, dt, 6);
            for (let k = 0; k < sp; k++) P.spawn(h.x, h.y, h.z, this.face.x * 8 + (Math.random() - 0.5) * 3, this.face.y * 8 + Math.random() * 2, this.face.z * 8 + (Math.random() - 0.5) * 3, pick(FLAME), 0.4 + Math.random() * 0.5, 0.5, { shrink: 0.8, spin: 6 });
        }
    }
}

// ------------------------------------------------------------------ the system
export class FireSerpent {
    constructor(game) {
        this.game = game;
        this.mine = null;
        this.remote = new Map(); // by -> Serpent
        this.log = [];
        this._t = 0; this._sendT = 0; this._sent = false;
        this._acc = { ember: 0, smoke: 0, spit: 0 };
        this._tmpE = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
    }

    get me() { return this.game.localId; }
    /** My serpent lives (the Hellfire's drain is doubled). */
    get alive() { return !!(this.mine && !this.mine.dead && this.mine.fade === 0); }

    _note(e) { this.log.push({ t: r2(this._t), ...e }); if (this.log.length > 60) this.log.shift(); }
    _n(key, rate, dt, max) { this._acc[key] = (this._acc[key] || 0) + rate * dt; const n = Math.min(max, Math.floor(this._acc[key])); this._acc[key] -= n; return n; }
    _hint(text, isFinal) { if (isFinal) this.game.hud?.setVoice?.(text, true); return null; }

    /** Every serpent (for charges, wizards, water): mine and the others'. */
    *all() { if (this.mine && !this.mine.dead) yield this.mine; for (const s of this.remote.values()) if (!s.dead) yield s; }
    targets() { return [...this.all()].filter((s) => s.fade === 0 && s.grow > 0.3); }
    byId(id) { for (const s of this.all()) if (s.id === id) return s; return null; }

    // ---------------------------------------------------------------- the words
    /** «Serpent» said. @returns the spell's name, or null */
    cast(isFinal = true) {
        const g = this.game, hf = g.hellfire, c = g.combat;
        if (this.mine && !this.mine.dead) { if (isFinal && this.mine.grow > 0.9) this._hint('🐍 Огненный змей уже здесь — «Атак» на цель, «стоп» гасит огонь вместе с ним', true); return null; }
        const s = hf?.state;
        const why = serpentBlock({ enabled: !!c?.enabled, mana: c?.fatigue ?? 0, fire: !!s && s.k < 0.5, alive: false });
        if (why === 'fire') return this._hint('🐍 Огненный змей рождается только из вашего <b>«Let the Hellfire Come»</b>: сначала вызовите адский огонь (не кольцом), потом крикните «Serpent»', isFinal);
        if (why === 'mana') return this._hint(`🐍 Змея из адского огня вызовет только тот, у кого <b>${SERPENT.NEED_MANA} маны</b> (у вас ${Math.floor(c.fatigue || 0)})`, isFinal);
        const tired = c?.check?.(SERPENT.NAME);
        if (tired) return this._hint(tired, true);
        c?.pay?.(SERPENT.NAME);
        // the dark: +10 (black magic — the author)
        if (g.dark) addDark(g.dark, SERPENT.DARK, 'cast');
        const sv = this.mine = new Serpent(this, this.me, this._anchorOf(s.c, _a));
        sv.face.copy(s.d).setY(0);
        if (sv.face.lengthSq() < 1e-4) sv.face.set(0, 0, 1);
        sv.face.normalize();
        this._note({ ev: 'cast' });
        const P = g.hellfire.pool;
        // the fire heaves up: a burst, the ground shakes, the roar
        g.fx?.lightFlash?.(s.c, 0xff5a1a, 14, 0.9, 80);
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 1.1);
        g.sound?.playInferno?.(); g.sound?.playRumble?.(s.c, g.character.group.position);
        if (P) for (let i = 0; i < 160; i++) { const a = Math.random() * TAU, v = 3 + Math.random() * 9; P.spawn(s.c.x, s.c.y, s.c.z, Math.cos(a) * v, 4 + Math.random() * 14, Math.sin(a) * v, pick(FLAME), 0.5 + Math.random() * 0.9, 0.8 + Math.random() * 0.6, { shrink: 0.6, spin: 5 }); }
        g.castleLife?.alarm?.(s.c, 'fire', this.me, 40); // (a horror: everyone near runs, the knights come)
        g.hud?.setVoice?.('🐍 <b>Огненный змей!</b> Он поднимается из адского огня. «Атак» на кого-то — укусит и подожжёт; на место — пойдёт туда и выжжет всё. Пока он жив, огонь тратит вдвое больше маны', true);
        this._send(true);
        return SERPENT.NAME;
    }

    /** Where the serpent's tail is: the blaze, on the ground. */
    _anchorOf(c, out) {
        const g = this.game;
        out.copy(c);
        const gy = g.collision?.groundY ? g.collision.groundY(c.x, c.z) : c.y - 1;
        out.y = Math.min(c.y, gy + 0.6);
        return out;
    }

    /** «Атак» with my serpent: the hand at someone — it strikes; at the ground — it ravages that place. true: obeyed. */
    attack(isFinal) {
        const s = this.mine, g = this.game;
        if (!s || s.dead || s.fade > 0) return false;
        const aim = g.duel?.pickSide?.(false);
        const t = aim?.t;
        if (t && t.kind !== 'b' && t.kind !== 'F' && !(t.kind === 'p' && t.id === this.me)) {
            s.target = { k: t.kind, id: t.id }; s.point = null; s.mode = 'strike'; s.modeT = 0;
            this._note({ ev: 'attack', k: t.kind, id: t.id });
            g.hud?.setVoice?.('🐍 Змей бросается на цель!', true);
            return true;
        }
        const o = new THREE.Vector3(), d = new THREE.Vector3();
        g.duel?._myRay?.(aim?.side || g.magicHand || g.lastMagicHand || 'right', o, d);
        const cell = g.builder?._hitCell?.(o, d, 80);
        if (cell?.point) {
            s.point = { x: cell.point.x, y: cell.point.y, z: cell.point.z }; s.target = null; s.mode = 'sweep'; s.modeT = 0;
            this._note({ ev: 'sweep' });
            g.hud?.setVoice?.('🐍 Змей ползёт туда и выжигает всё вокруг', true);
            return true;
        }
        if (isFinal) g.hud?.setVoice?.('✋ Направьте палочку на того, кого змею атаковать, или на место — и скажите «Атак»', true);
        return true; // (the word was his: never another spell's «Атак» meanwhile)
    }

    /** (my computer) Someone really hurt me: the serpent goes for him (the author: helpers defend their master). */
    masterHurt(byId) {
        const s = this.mine;
        if (!s || s.dead || s.fade > 0 || !byId || byId === this.me) return;
        if (s.mode === 'strike' && s.target) return; // (already at someone: it finishes)
        const ref = refOf(this.game, byId);
        if (!ref) return;
        s.target = ref; s.mode = 'strike'; s.modeT = 0; s.guard = true;
        this._note({ ev: 'guard', k: ref.k, id: ref.id });
    }

    // ---------------------------------------------------------------- the frame
    update(dt) {
        if (!(dt > 0)) return;
        this._t += dt;
        const g = this.game;
        serpentMaterials().shared.uTime.value = this._t;
        if (this.mine) this._updateMine(dt);
        for (const [by, s] of this.remote) {
            if (!s.dead && this._t - s.at > SERPENT.STALE && s.fade === 0) s.fade = 0.001;
            if (s.fade > 0) { s.fade += dt / SERPENT.FADE_S; if (s.fade >= 1) { s.dispose(); this.remote.delete(by); continue; } }
            s.grow = Math.min(1, s.grow + dt / SERPENT.GROW_S * 1.2);
            if (s.netAnchor) s.anchor.lerp(s.netAnchor, 1 - Math.exp(-dt * 8));
            s.step(dt, SERPENT.LUNGE);
            this._burnTick(s, dt);
            s.draw(dt);
        }
        if (g.authority) this._wizards(dt);
    }

    _updateMine(dt) {
        const g = this.game, s = this.mine, hf = g.hellfire?.state;
        // the fire out (stop, mana, water, the wand dropped, the caster down): the serpent falls apart
        if (s.fade === 0 && (!hf || s.hp <= 0)) this._die(s.hp <= 0 ? s.killedBy || 'water' : 'fire');
        if (s.fade > 0) {
            s.fade += dt / SERPENT.FADE_S;
            s.headT.y -= 6 * dt;
            s.step(dt, 4); s.draw(dt);
            if (s.fade >= 1) { s.dispose(); this.mine = null; this._send(false); }
            return;
        }
        this._anchorOf(hf.c, s.anchor);
        if (hf.k > 0.5) s.anchor.copy(g.character.group.position).addScaledVector(s.face, -3).setY(s.anchor.y); // (the fire gone into a ring: the serpent's tail stays near me)
        s.grow = Math.min(1, s.grow + dt / SERPENT.GROW_S);
        s.hp = Math.min(SERPENT.HP, s.hp + SERPENT.REGEN * dt);
        // water round its head (a river, water magic): it hisses and weakens
        const wet = g.hellfire._wet?.(s.p[N - 1], SERPENT.HEAD_FIRE_R) || 0;
        if (wet > 0) { s.hp -= 25 * wet * dt; s.killedBy = 'water'; }
        s.modeT += dt; s.biteCd -= dt;
        let speed = SERPENT.SPEED;
        const A = s.anchor, me = g.character.group.position;
        if (s.mode === 'rise') {
            s.headT.copy(A).addScaledVector(s.face, 5 * s.grow).setY(A.y + SERPENT.HEAD_H * s.grow);
            speed = 14;
            if (s.grow >= 1) { s.mode = 'idle'; s.modeT = 0; this._roar(s, 1); }
        } else if (s.mode === 'strike') {
            speed = this._strike(s, dt);
        } else if (s.mode === 'sweep') {
            const P = s.point;
            const a = s.modeT * 1.3;
            s.headT.set(P.x + Math.cos(a) * SERPENT.SWEEP_R, P.y + 3 + Math.sin(a * 2.3) * 1.2, P.z + Math.sin(a * 0.8) * SERPENT.SWEEP_R);
            s.jawT = 0.6;
            speed = 12;
            if (s.modeT > SERPENT.SWEEP_S) { s.mode = 'idle'; s.modeT = 0; s.jawT = 0; }
        }
        if (s.mode === 'idle') {
            // it rears over its fire, looking where the wand points, swaying — a living thing
            _a.copy(hf.d).setY(0);
            if (_a.lengthSq() < 1e-4) _a.copy(s.face).setY(0);
            _a.normalize();
            const t = this._t;
            s.headT.copy(A).addScaledVector(_a, 9).add(_b.set(Math.sin(t * 0.7 + s.wobble) * 3, SERPENT.HEAD_H + Math.sin(t * 1.1) * 1.5, Math.cos(t * 0.53 + s.wobble) * 3));
            s.jawT = Math.sin(t * 0.4) > 0.93 ? 0.7 : 0; // (now and then it opens its jaws and hisses)
            speed = 5;
            if (s.jawT > 0 && s.hissT <= 0) { s.hissT = 4; g.sound?.playInferno?.(); }
        }
        s.hissT -= dt;
        // the leash: it crawls only a short way from its fire; never through me
        _a.subVectors(s.headT, A).setY(0);
        if (_a.length() > SERPENT.LEASH) { _a.setLength(SERPENT.LEASH); s.headT.x = A.x + _a.x; s.headT.z = A.z + _a.z; }
        s.step(dt, speed);
        this._burnTick(s, dt);
        s.draw(dt);
        // the network
        this._sendT += dt;
        if (this._sendT >= SERPENT.SEND) { this._sendT = 0; this._send(true); }
        void me;
    }

    /** «Атак» on someone: over him, rear, lunge, bite, back up — again, while he is there and in reach. @returns the head's speed */
    _strike(s, dt) {
        const g = this.game;
        const tp = this._targetPoint(s.target, _c);
        if (!tp || s.modeT > 40) { s.mode = 'idle'; s.target = null; s.guard = false; s.jawT = 0; return 6; }
        _a.subVectors(tp, s.anchor).setY(0);
        if (_a.length() > SERPENT.LEASH + 10) { // (ran away beyond its reach: it gives up)
            if (s.modeT > 4) { s.mode = 'idle'; s.target = null; return 6; }
        }
        _b.subVectors(s.anchor, tp).setY(0);
        if (_b.lengthSq() < 1e-4) _b.set(1, 0, 0);
        _b.normalize();
        const head = s.p[N - 1];
        if (!s.lunge) {
            // rearing over it, the jaws opening
            s.headT.copy(tp).addScaledVector(_b, 6).setY(tp.y + 7);
            s.jawT = 0.45;
            if (head.distanceTo(s.headT) < 3 && s.biteCd <= 0) { s.lunge = 0.0001; s.jawT = 1; this._roar(s, 0.5); }
            return SERPENT.SPEED * 1.4;
        }
        // the lunge
        s.lunge += dt;
        s.headT.copy(tp);
        if (head.distanceTo(tp) < SERPENT.BITE_R || s.lunge > 0.9) {
            if (head.distanceTo(tp) < SERPENT.BITE_R + 0.8) this._bite(s, s.target, tp);
            s.lunge = 0; s.biteCd = SERPENT.BITE_EVERY; s.jawT = 0;
            s.headT.copy(tp).addScaledVector(_b, 8).setY(tp.y + 9); // (back up)
        }
        void g;
        return SERPENT.LUNGE;
    }

    _targetPoint(ref, out) {
        const g = this.game, duel = g.duel;
        if (!ref || !duel) return null;
        if (ref.k === 'p') {
            if (ref.id === this.me) return null;
            const r = g.remotes?.get(ref.id);
            return r && !r.dead ? out.copy(r.character?.group?.position || r.position).add(_d.set(0, -0.6, 0)) : null;
        }
        const e = duel._bodyOf?.(ref.k, ref.id, this._tmpE);
        return e ? out.copy(e.a).lerp(e.b, 0.5) : null;
    }

    /** The jaws close on `ref`: the bite (−BITE) and the fire on him; the host decides (players: their own computer). */
    _bite(s, ref, at) {
        const g = this.game;
        this._note({ ev: 'bite', k: ref.k, id: ref.id });
        g.fx?.lightFlash?.(at, 0xff7a1a, 8, 0.4, 30);
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.35);
        g.sound?.playInferno?.();
        const P = g.hellfire?.pool;
        if (P) for (let i = 0; i < 50; i++) P.spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 9, pick(FLAME), 0.3 + Math.random() * 0.5, 0.6, { shrink: 0.7, spin: 7 });
        if (g.authority || ref.k === 'p') this.applyBite(s.by, ref, at);
        else this._send(true, [ref.k, ref.id]); // (the host does it)
    }

    /** (the host — or my own computer for my body) A bite of `by`'s serpent lands on `ref`. */
    applyBite(by, ref, at) {
        const g = this.game;
        const dir = new THREE.Vector3(0, 0, 1);
        const s = by === this.me ? this.mine : this.remote.get(by);
        if (s) dir.copy(s.face).setY(0).normalize();
        const K = g.fireBoost?.(by) ?? 1;
        const dmg = SERPENT.BITE * K;
        if (ref.k === 'p' && ref.id === this.me) {
            // me (another's serpent): bitten and on fire
            if (g.combat?.enabled) g.combat.damage(dmg, by, SERPENT.NAME); else g.damageLocalPlayer?.(dmg);
            g.burning?.ignite('p', this.me, by, undefined, true);
            g.knockback?.add?.(_a.copy(dir).multiplyScalar(8).setY(3));
            g.hud?.setVoice?.(`🐍 Огненный змей укусил вас: −${Math.round(dmg)}`, true);
            return;
        }
        if (ref.k === 'p') { g.sync?.fireSerpentBite?.(ref.id, by); return; } // (their computer hurts and burns them: 'fsb' → onBite)
        if (!g.authority) return;
        g.servants?.damage?.(ref, dmg * (ref.k === 's' ? 2 : 1), dir, by, 'serpent', at ? { x: at.x, z: at.z, ref: { k: 'F', id: 'fs:' + by } } : null);
        if (ref.k !== 'G' && ref.k !== 'Y' && ref.k !== 'T' && ref.k !== 'f' && ref.k !== 'D') g.burning?.ignite(ref.k, ref.id, by, undefined, true);
    }

    /** What it touches burns: the head is a blaze, the body lying on the ground too (Hellfire._burn — every creature). */
    _burnTick(s, dt) {
        if (s.grow < 0.3) return;
        const hf = this.game.hellfire;
        if (!hf?._burn) return;
        s.burnT -= dt;
        if (s.burnT > 0) return;
        s.burnT = SERPENT.BURN_TICK;
        const k = 1 - s.fade;
        if (k < 0.3) return;
        const f = s._f || (s._f = { c: new THREE.Vector3(), R: 1, k: 0, vel: new THREE.Vector3(), pushT: 0, surgeT: 0, meT: 0, by: s.by });
        f.c.copy(s.p[N - 1]); f.R = SERPENT.HEAD_FIRE_R * k; f.vel.copy(s.vel);
        let hit = hf._burn(s.by, f, f.c);
        // a piece of the body on the ground (a different one every tick: all of it within a second or two)
        const out = s.out, i0 = N - out;
        s.bodyI = (s.bodyI + 7) % Math.max(1, out - 6);
        const i = i0 + s.bodyI;
        const gy = this.game.collision?.groundY ? this.game.collision.groundY(s.p[i].x, s.p[i].z) : -Infinity;
        if (s.p[i].y - gy < s.r[i] + 1.5) {
            const fb = s._fb || (s._fb = { c: new THREE.Vector3(), R: 1, k: 0, vel: new THREE.Vector3(), pushT: 1, surgeT: 0, meT: 0, by: s.by });
            fb.c.copy(s.p[i]); fb.R = SERPENT.BODY_FIRE_R * k;
            if (hf._burn(s.by, fb, fb.c)) hit = true;
        }
        if (hit && s === this.mine && this.game.hellfire.state) this.game.hellfire._worked(this.game.hellfire.state);
        // another's serpent on me: it burns me as its fire does (mine never does: I rule it)
        if (s !== this.mine) hf._burnMe?.(f, f.c, SERPENT.BURN_TICK);
    }

    _roar(s, k) {
        const g = this.game;
        g.sound?.playInferno?.();
        if (k >= 1) g.sound?.playRumble?.(s.p[N - 1], g.character.group.position);
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.3 * k);
    }

    /** It falls apart: embers, steam (water), the fire stays. */
    _die(why) {
        const s = this.mine;
        if (!s || s.fade > 0) return;
        s.fade = 0.001; s.mode = 'die'; s.jawT = 0.9;
        this._note({ ev: 'die', why });
        const g = this.game, P = g.hellfire?.pool;
        if (why === 'water' || why === 'cold') {
            if (P) for (let i = 0; i < N; i += 2) for (let k = 0; k < 4; k++) P.spawn(s.p[i].x, s.p[i].y, s.p[i].z, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, pick(STEAM), 1 + Math.random() * 1.2, 1.6, { shrink: -0.8, spin: 1 });
            g.hud?.setVoice?.('💨 Огненного змея погасили', true);
        } else if (why === 'gods') g.hud?.setVoice?.('✨ Божественная сила развеяла огненного змея', true);
        else if (why !== 'fire') g.hud?.setVoice?.('🐍 Огненный змей рассыпался', true);
        g.sound?.playRumble?.(s.p[N - 1], g.character.group.position);
        this._send(true);
    }

    // ---------------------------------------------------------------- water, charges
    /**
     * «Firefighting» (`dt` 0: a burst) / «Firefighting Maxima» (held `dt` s) on the serpent: `hit(c, r)` — is the point in the
     * water's cone. Mine loses its strength (Maxima puts it out in ~1.5 s); another's — its own computer does it (the spray is
     * seen there too). @returns true when the water reached a serpent (steam)
     */
    douse(hit, dt = 0) {
        let any = false;
        for (const s of this.all()) {
            if (s.fade > 0) continue;
            let on = false;
            for (let i = N - 1; i >= N - s.out && !on; i -= 3) on = hit(s.p[i], Math.max(0.5, s.r[i]));
            if (!on) continue;
            any = true;
            const P = this.game.hellfire?.pool, h = s.p[N - 1];
            if (P) for (let k = 0; k < 6; k++) P.spawn(h.x + (Math.random() - 0.5) * 3, h.y, h.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2, pick(STEAM), 1 + Math.random(), 1.2, { shrink: -0.7, spin: 1 });
            if (s !== this.mine) continue;
            s.hp -= dt > 0 ? SERPENT.DOUSE_RATE * dt : SERPENT.DOUSE_KNOCK;
            s.killedBy = 'water';
            if (!(dt > 0)) { this._note({ ev: 'doused', hp: r2(s.hp) }); s.headT.y += 4; } // (it rears back, hissing)
        }
        return any;
    }

    /** A duel charge reached a serpent (Duel._arrive): its owner's computer counts it. */
    boltHit(s, spell, by, divine = false) {
        if (!s || s.fade > 0) return;
        const h = serpentHit(spell, divine);
        this._note({ ev: 'bolt', spell, dmg: h.dmg, why: h.why });
        if (h.why === 'cold' || h.why === 'water') {
            const P = this.game.hellfire?.pool, c = s.p[N - 3];
            if (P) for (let k = 0; k < 14; k++) P.spawn(c.x, c.y, c.z, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, pick(STEAM), 1 + Math.random(), 1.3, { shrink: -0.7, spin: 1 });
        }
        if (s !== this.mine) return;
        s.hp = Math.min(SERPENT.HP, s.hp - h.dmg);
        if (h.dmg > 0) s.killedBy = h.why === 'gods' ? 'gods' : h.why === 'cold' ? 'cold' : 'water';
        // struck by someone: it answers him (one-on-one)
        if (h.dmg > 0 && by && by !== this.me && !(s.mode === 'strike' && s.target)) { const ref = refOf(this.game, by); if (ref) { s.target = ref; s.mode = 'strike'; s.modeT = 0; } }
    }

    // ---------------------------------------------------------------- the wizards (host)
    /** Wizards near a serpent: a weak one runs from it, a strong one turns and strikes it (cold) — WizardFight.threat. */
    _wizards(dt) {
        this._wizT = (this._wizT || 0) - dt;
        if (this._wizT > 0) return;
        this._wizT = 0.5;
        const L = this.game.castleLife, F = L?.wizards?.fight;
        if (!L?.targets) return;
        for (const s of this.targets()) {
            const h = s.p[N - 3];
            for (const v of L.targets(60) || []) {
                if (!v.wizard || v.dead || v.servantOf != null) continue;
                const dist = Math.hypot(v.x - h.x, v.z - h.z);
                const r = serpentResponse({ rank: v.rank, mana: v.mana, dist, hpK: (v.hp ?? 1) / (v.maxHp || v.hp || 1) });
                if (!r) continue;
                if (r === 'flee') { L.fear?.(v, h.x, h.z, 1, 0.5, { r: 14, big: true }); v.serpentFled = true; continue; }
                // (strong: if the serpent is the worst of his foes now — WizardFight.foeFirst — he strikes it)
                if (F?.helperFirst?.(v, { k: 'F', id: s.id, kind: 'serpent', dist })) F.threat(v, { k: 'F', id: s.id });
            }
        }
    }

    // ---------------------------------------------------------------- the network
    _send(on, bite = null) {
        const s = this.mine;
        if (!on || !s) { if (this._sent) this.game.sync?.fireSerpent?.(null); this._sent = false; return; }
        this._sent = true;
        const a = s.anchor, h = s.headT;
        const m = [r2(a.x), r2(a.y), r2(a.z), r2(h.x), r2(h.y), r2(h.z), r2(s.grow), r2(s.jawT), Math.round(s.hp), r2(s.fade)];
        this.game.sync?.fireSerpent?.(m, bite);
    }

    /** Another computer's serpent ('fs'). */
    onNet(msg) {
        if (!msg || !msg.by || msg.by === this.me) return;
        const m = msg.s;
        let s = this.remote.get(msg.by);
        if (!Array.isArray(m) || m.length < 10 || !m.every(Number.isFinite)) { if (s && s.fade === 0) s.fade = 0.001; return; }
        if (!s) {
            s = new Serpent(this, msg.by, _a.set(m[0], m[1], m[2]));
            s.grow = m[6];
            this.remote.set(msg.by, s);
            this.game.sound?.playInferno?.();
        }
        (s.netAnchor || (s.netAnchor = new THREE.Vector3())).set(m[0], m[1], m[2]);
        s.headT.set(m[3], m[4], m[5]);
        s.jawT = m[7]; s.hp = m[8];
        if (m[9] > 0 && s.fade === 0) s.fade = 0.001;
        s.at = this._t;
        // a bite asked of the host
        if (msg.b && Array.isArray(msg.b) && this.game.authority) this.applyBite(msg.by, { k: msg.b[0], id: msg.b[1] }, s.p[N - 1]);
    }

    /** ('fsb') `by`'s serpent bit me on its computer. */
    onBite(by) { this.applyBite(by, { k: 'p', id: this.me }, null); }

    /** A sample for Game.prewarm: the shaders compile on the loading screen. */
    sample() {
        const s = new Serpent(this, '__prewarm', new THREE.Vector3(0, -500, 0));
        s.grow = 1;
        s.group.removeFromParent();
        for (let i = 0; i < N; i++) s.p[i].set(0, -500 + i * 0.5, 0);
        s.r.fill(1);
        s.draw(0.016);
        return { group: s.group, dispose: () => s.dispose() };
    }

    clear() {
        if (this.mine) { this.mine.dispose(); this.mine = null; }
        for (const s of this.remote.values()) s.dispose();
        this.remote.clear();
    }
    dispose() { this.clear(); }
}

/** An attacker's id → a target {k, id} (a player, a castle person, a zombie, a sailor…), or null. */
export function refOf(g, id) {
    if (id == null) return null;
    if (g.remotes?.has?.(id)) return { k: 'p', id };
    if (g.castleLife?.byId?.get?.(id)) return { k: 'v', id };
    if (g.zombieById?.get?.(id)) return { k: 'z', id };
    if (g.ships?.crew?.byId?.get?.(id)) return { k: 'c', id };
    if (g.animals?.byId?.get?.(id)) return { k: 'a', id };
    return null;
}
