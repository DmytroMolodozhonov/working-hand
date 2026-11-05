/**
 * FireSerpent.js — the fire serpent of «Let the Hellfire Come» (rules: FireSerpentRules.js).
 *
 * The author (05.11, about the first one: «полная фигня… почему-то прямо вверх идёт… должен быть прямо моим огнём… огромная змея,
 * как в сцене, где Волдеморт сражается с Дамблдором… больше раза в 3–5… лицо нормальное… он больше лежит, а не стоит… один раз вылез
 * из огня и продолжает быть огнём… потом сам живёт своей жизнью рядом с тобой… и ползает»).
 *
 * While my Hellfire burns, «Serpent» — out of the blaze a serpent of that same fire POURS: ~190 m of body, ~10 m through. It crawls
 * out once (the whole body slides out of the blaze in ~8 s, the tail last), then it is free: it lies on the ground and CRAWLS
 * round its master like a real snake — the head leads, waves run down the body, every ring follows the path the head took
 * (the path's history), only the neck rears and holds the head up, cobra-like, ~12 m. It wanders within ~36 m of me (never
 * over me), follows me when I go, rests and watches, hisses. «Атак» at someone — it crawls there, rears high and strikes: a
 * bite (−9) and the bitten burns; «Атак» at a place — it goes there and coils round it burning everything; it guards its
 * master: whoever really hurts him is bitten. What it touches burns as the Hellfire does (Hellfire._burn: every creature).
 * «Firefighting» knocks it back, «Firefighting Maxima» held on it puts it out; cold and water hurt it; the gods' spells end
 * it. The Hellfire put out («стоп», no mana, water) — it falls apart into embers and steam. While it lives the Hellfire's drain
 * is doubled (Hellfire._updateMine).
 *
 * The look — the Hellfire's own fire, no «skin»: the body is a tube placed by the video card (the rings' centres and frames
 * are uniforms) drawn ADDITIVELY like the Hellfire's flames — a dense glowing middle thinning to the edges, flowing fire, and a
 * shell of flame tongues licking UP off its back; over it the Hellfire's flame cubes (its own pool, the same colours: CORE /
 * FLAME / DEEP), embers and smoke stream off the whole body. The head — a viper's: a wide skull over the jaw muscles, a flat
 * crown, brow ridges over slit eyes, a narrowing snout with nostrils, a lower jaw on a hinge opening wide on curved fangs and
 * a white-hot throat — modelled as one shape (no boxes), of the same fire.
 * The network: 'fs' ~10×/s (the blaze it came from, where the neck rises, the head, the lift, the jaw, the strength); every
 * computer crawls the body itself from these (its own path history).
 */
import * as THREE from 'three';
import { SERPENT, serpentBlock, serpentHit, serpentRadius, serpentResponse } from './FireSerpentRules.js';
import { addDark } from './DarkMagic.js';
import { mergeParts } from '../core/MergeGeometry.js';
import { ParticlePool } from '../fx/Particles.js';

const N = SERPENT.SEGS;
const NB = N - SERPENT.NECK; // rings lying on the ground; the last of them (NB − 1) is where the neck rises: the «lead»
const SEG = SERPENT.SEG_LEN;
const BODY_LEN = (NB - 1) * SEG; // m of body on the ground
const NECK_LEN = SERPENT.NECK * SEG;
const HSTEP = 0.75, HCAP = 360; // the path's history: a point every 0.75 m (270 m kept: more than the body)
const RAD = 20; // vertices round a ring
const TAU = Math.PI * 2;
const HEAD_K = SERPENT.HEAD_LEN / 3.2; // the head's shape is ~3.2 long: its scale
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const r2 = (v) => Math.round(v * 100) / 100;

// the Hellfire's own colours (Hellfire.js): it is that fire
const CORE = [0xfffbe6, 0xfff2b0, 0xffe680, 0xffd25a];
const FLAME = [0xffb030, 0xff9a1a, 0xff8000, 0xff6400, 0xf04a00, 0xd42a00, 0xb81c00];
const DEEP = [0xd42a00, 0xa81800, 0x8a1000, 0xff4a00];
const EMBER = [0xffb030, 0xff8a1a, 0xff6400];
const SMOKE = [0x4a4440, 0x57504b, 0x625a54, 0x6a625c];
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
// (the group carries no rotation: «up» in its space is the world's up — the tongues of flame rise)
const VERT = `
${NOISE}
uniform float uTime; uniform float uShell;
#ifdef SPINE
uniform vec4 uC[${N}]; uniform vec3 uN[${N}]; uniform vec3 uB[${N}];
attribute float aRing; attribute float aAng;
#endif
varying vec3 vN; varying vec3 vV; varying vec3 vQ; varying float vTip; varying float vUpN;
void main(){
#ifdef SPINE
  int i = int(aRing + 0.5);
  vec4 c = uC[i];
  vec3 dir = uN[i] * cos(aAng) + uB[i] * sin(aAng);
  float r = c.w;
  vec3 p = c.xyz + dir * r;
  vQ = vec3(aRing * 1.1, cos(aAng) * 1.6, sin(aAng) * 1.6);
#else
  vec3 dir = normalize(normal);
  float r = 0.32;
  vec3 p = position;
  vQ = position * vec3(2.2, 2.6, 1.6) + vec3(0.0, 0.0, 30.0);
#endif
  vTip = 0.0;
  vUpN = normalize((modelMatrix * vec4(dir, 0.0)).xyz).y; // (how much this point of it faces the sky: its roundness)
  if (uShell > 0.0) {
    // tongues of flame: off the back and the flanks they rise (the world's up), along the body they flow to the tail
    float f = fbm(vQ * vec3(0.45, 0.9, 0.9) + vec3(uTime * 1.6, 0.0, -uTime * 2.3));
    float side = smoothstep(-0.45, 0.4, normalize((modelMatrix * vec4(dir, 0.0)).xyz).y);
    float tongue = (0.1 + 1.1 * f * f * f) * (0.35 + 0.65 * side);
    vTip = tongue;
    vec3 rise = normalize(vec3(modelMatrix[0][1], modelMatrix[1][1], modelMatrix[2][1])); // (the world's up in its own space)
    p += (dir * 0.35 + rise * 0.9 * side) * r * tongue;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vV = -mv.xyz;
  vN = normalize(mat3(modelViewMatrix) * dir);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
${NOISE}
uniform float uTime; uniform float uHeat; uniform float uFade;
varying vec3 vN; varying vec3 vV; varying vec3 vQ; varying float vTip; varying float vUpN;
vec3 ramp(float h){
  vec3 c = mix(vec3(0.35, 0.03, 0.0), vec3(1.0, 0.24, 0.0), smoothstep(0.08, 0.45, h));
  c = mix(c, vec3(1.0, 0.6, 0.1), smoothstep(0.42, 0.8, h));
  return mix(c, vec3(1.0, 0.95, 0.75), smoothstep(0.82, 1.25, h));
}
void main(){
  // the fire flows: to the tail and up, in two scales of flicker
  vec3 q = vQ * vec3(0.5, 0.75, 0.75) + vec3(uTime * 1.3, -uTime * 1.9, uTime * 0.5);
  float n = fbm(q);
  float n2 = fbm(q * 2.4 + vec3(0.0, -uTime * 3.1, 0.0));
  float facing = abs(dot(normalize(vN), normalize(vV)));
#ifdef SHELL
  // the tongues: hot at their roots, thin and red at their tips, torn by the noise
  float al = smoothstep(0.32, 0.75, n2 + n * 0.4) * (1.0 - smoothstep(0.4, 1.6, vTip)) * (0.35 + 0.65 * facing) * 0.75;
  al *= smoothstep(-0.2, 0.25, vUpN); // (none off its underside: no skirt of flame lying round it on the ground)
  vec3 col = ramp((0.55 + 0.6 * n - vTip * 0.35) * uHeat);
#else
  // the body: SOLID fire (the author 05.11: «змей не похож на змея» — a see-through glow had no shape): a body of living flame —
  // white-hot rivers of fire flowing along it to the tail between darker, cooler crusts of embers, the rim blazing (the flames on its
  // outline), the belly darker; it is its own light (no shading)
  float vein = smoothstep(0.45, 0.75, fbm(q * vec3(0.7, 1.6, 1.6) + vec3(n * 1.5, 0.0, 0.0)));
  float crust = smoothstep(0.5, 0.28, fbm(q * vec3(0.5, 2.2, 2.2) - vec3(uTime * 0.4, 0.0, 0.0)) + vein * 0.35);
  float rim = pow(1.0 - facing, 2.2);
#ifdef HEAD
  // the head: darker, deep red embers in its scales, the flames on its outline — its shape reads (the eyes and the throat blaze)
  float heat = 0.32 + 0.4 * vein + 0.15 * n2 - 0.3 * crust + 0.75 * rim;
#else
  float heat = 0.45 + 0.5 * vein + 0.2 * n2 - 0.35 * crust + 0.6 * rim;
#endif
  vec3 col = ramp(heat * uHeat) * (0.85 + 0.3 * n);
  col = mix(col, vec3(0.22, 0.03, 0.0), crust * 0.55 * (1.0 - rim));
  // round, not a ribbon: the back blazes, the flanks go deeper red, the belly into dark embers (its own light from within + the sky)
  col *= 0.5 + 0.62 * smoothstep(-0.7, 0.85, vUpN) + 0.25 * rim;
  float al = 1.0;
#endif
  al *= uFade;
#ifdef SHELL
  gl_FragColor = vec4(col * al * 1.15, al);
#elif defined(GLOW)
  // (the heart of the fire under its flames: smouldering embers — deep red, dark crusts, glowing cracks flowing along; much darker
  //  than the flames over it, so the fire has depth and the shape reads, as in the film)
  vec3 emb = mix(vec3(0.42, 0.06, 0.0), vec3(0.95, 0.3, 0.03), smoothstep(0.35, 0.8, vein + n2 * 0.3));
  emb += vec3(1.0, 0.45, 0.08) * smoothstep(0.78, 0.95, vein) * 0.6;
  emb *= 0.55 + 0.6 * smoothstep(-0.7, 0.85, vUpN) + 0.5 * rim;
  gl_FragColor = vec4(emb * (0.4 + 0.6 * uFade), 1.0);
#else
  gl_FragColor = vec4(col * (0.4 + 0.6 * uFade), 1.0);
#endif
}`;

let _mats = null;
/** The materials (body core, body tongues, the head's fire and its tongues) and their shared time — made once per serpent. */
export function serpentMaterials() {
    if (_mats) return _mats;
    const shared = { uTime: { value: 0 } };
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    const solid = { transparent: false, depthWrite: true, blending: THREE.NormalBlending };
    const mk = (defs, extra, o = add) => new THREE.ShaderMaterial({ defines: defs, uniforms: { ...extra, uTime: shared.uTime, uShell: { value: defs.SHELL ? 1 : 0 }, uHeat: { value: 1 }, uFade: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG, ...o });
    _mats = {
        shared,
        flames: (sp) => new THREE.ShaderMaterial({ uniforms: { ...sp, uTime: shared.uTime, uFade: { value: 1 }, uHeat: { value: 1 }, uHeadS: { value: 1 }, uHeadM: { value: new THREE.Matrix4() }, uJawM: { value: new THREE.Matrix4() } }, vertexShader: FL_VERT, fragmentShader: FL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
        core: (sp) => mk({ SPINE: 1, GLOW: 1 }, sp, solid),
        shell: (sp) => mk({ SPINE: 1, SHELL: 1 }, sp),
        head: () => mk({ HEAD: 1, GLOW: 1 }, {}, solid),
        headShell: () => mk({ SHELL: 1 }, {}),
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

/**
 * A viper's head out of a sphere (z — forward to the snout, y — up; length ~3.2, width ~2): `upper` — the skull: wide over the
 * jaw muscles at the back, narrowing to a rounded snout, a flat crown with brow ridges over the eyes, the cheeks bulging; else
 * the lower jaw: a narrow flat bowl, hinged at the back (its origin there).
 */
function viperShape(upper) {
    const g = upper ? new THREE.SphereGeometry(1, 36, 22) : new THREE.SphereGeometry(1, 28, 10, 0, TAU, Math.PI / 2, Math.PI / 2);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const t = (z + 1) / 2; // 0 the back of the skull … 1 the snout
        let w = (1 - 0.6 * smooth(0.28, 1, t)) * (0.8 + 0.2 * smooth(0, 0.3, t));
        let X, Y, Z = z * 1.6;
        if (upper) {
            w *= 1 + 0.08 * Math.exp(-((t - 0.25) ** 2) / 0.01) * (y < 0.2 ? 1 : 0.4); // (the cheeks: the venom glands)
            X = x * w;
            Y = y > 0 ? y * 0.44 * (1 - 0.4 * smooth(0.55, 1, t)) : y * 0.2;
            // the brow ridges over the eyes, a groove between them; the snout's tip turned up a little
            const ax = Math.abs(x);
            if (y > 0) Y += 0.11 * Math.exp(-((ax - 0.62) ** 2) / 0.025 - ((t - 0.6) ** 2) / 0.018) - 0.03 * Math.exp(-(x * x) / 0.02 - ((t - 0.55) ** 2) / 0.05);
            Y += 0.05 * smooth(0.85, 1, t);
        } else {
            X = x * w * 0.9;
            Y = y * 0.26 * (1 - 0.35 * smooth(0.6, 1, t));
            Z = z * 1.55 + 1.55 * 0.8; // (the hinge at its back: the origin)
        }
        P.setXYZ(i, X, Y, Z);
    }
    g.computeVertexNormals();
    return g;
}

let _headGeo = null;
/** The head's pieces (shared): the skull, the lower jaw, the fangs, the eyes and their slits, the nostrils, the throat. */
function headGeometry() {
    if (_headGeo) return _headGeo;
    const cone = new THREE.ConeGeometry(1, 1, 8);
    const fangsUp = [], teeth = [];
    for (const sx of [-1, 1]) {
        // two great curved fangs hanging from the front of the upper jaw (two cones: a curve), small ones behind
        fangsUp.push({ geo: cone, pos: [sx * 0.34, -0.2, 1.28], rot: [Math.PI - 0.25, 0, 0], scale: [0.075, 0.32, 0.075] });
        fangsUp.push({ geo: cone, pos: [sx * 0.34, -0.47, 1.36], rot: [Math.PI + 0.35, 0, 0], scale: [0.05, 0.26, 0.05] });
        for (let k = 0; k < 4; k++) fangsUp.push({ geo: cone, pos: [sx * (0.52 + k * 0.07), -0.14, 0.85 - k * 0.32], rot: [Math.PI, 0, 0], scale: [0.03, 0.12, 0.03] });
        for (let k = 0; k < 5; k++) teeth.push({ geo: cone, pos: [sx * (0.36 + k * 0.08), 0.08, 2.35 - k * 0.3], scale: [0.03, 0.12, 0.03] });
    }
    _headGeo = {
        skull: viperShape(true),
        jaw: viperShape(false),
        fangsUp: mergeParts(fangsUp),
        teeth: mergeParts(teeth),
        eye: new THREE.SphereGeometry(0.15, 14, 10),
        slit: new THREE.SphereGeometry(0.15, 10, 8),
        nostril: new THREE.SphereGeometry(0.06, 8, 6),
        throat: new THREE.SphereGeometry(1, 14, 10),
    };
    for (const k in _headGeo) _headGeo[k].userData.shared = true; // (every serpent's; never disposed)
    return _headGeo;
}

// ------------------------------------------------------------------ the flames (the author 05.11, a still of the film: «это всё ещё
// текстура, а я хочу именно из самого огня»): the body and the head are THOUSANDS of tongues of flame — soft billboards, each born on
// the body, rising, flaring and dying in its own rhythm (white-hot at its root, orange, red at its torn tip), all placed by the video
// card from the same spine (the body) and the head's frame (the head: its tongues sit on the viper's skull and jaw — the head is
// drawn by fire, its eyes blazing through). One draw for all of them.
const FL_RING = 44; // tongues round every ring of the body
const FL_HEAD = 1100, FL_JAW = 320; // on the skull, on the lower jaw
const FL_VERT = `
${NOISE}
uniform float uTime; uniform float uFade; uniform float uHeadS;
uniform vec4 uC[${N}]; uniform vec3 uN[${N}]; uniform vec3 uB[${N}];
uniform mat4 uHeadM; uniform mat4 uJawM;
attribute float aRing; attribute float aAng; attribute float aRad; attribute float aSeed; attribute float aKind; attribute vec3 aHead;
varying vec2 vUv; varying float vPh; varying float vSeed; varying float vHot;
void main(){
  float ph = fract(uTime * (0.85 + aSeed * 0.9) + aSeed * 7.13);
  vec3 c; float size; float hot;
  if (aKind < 0.5) {
    int i = int(aRing);
    int i1 = min(i + 1, ${N - 1});
    float fr = aRing - float(i); // (anywhere between two rings: no rows of flames, no comb)
    vec4 C = mix(uC[i], uC[i1], fr);
    if (uC[i].w < 0.05 || uC[i1].w < 0.05) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vUv = vec2(0.0); vPh = 1.0; vSeed = 0.0; vHot = 0.0; return; }
    float a = aAng + ph * 0.5;
    vec3 dir = normalize(mix(uN[i], uN[i1], fr)) * cos(a) + normalize(mix(uB[i], uB[i1], fr)) * sin(a);
    dir.y = max(dir.y, -0.15); // (all over it — its back, its flanks — but not into the ground)
    c = C.xyz + normalize(dir) * C.w * (0.85 + 0.35 * aRad); // (on its surface and just off it: in front of the embers)
    c.y += C.w * (0.05 + 0.9 * ph * ph); // (licking up off it)
    size = C.w * (0.9 + 0.7 * aSeed) * (0.5 + 0.6 * sin(min(1.0, ph * 1.4) * 3.1416 * 0.5 + 0.2));
    hot = 1.0 - aRad * 0.5;
  } else {
    mat4 M = aKind < 1.5 ? uHeadM : uJawM;
    c = (M * vec4(aHead, 1.0)).xyz;
    c.y += uHeadS * 0.12 * ph;
    size = uHeadS * (0.3 + 0.2 * aSeed) * (0.55 + 0.6 * sin(min(1.0, ph * 1.4) * 1.5708 + 0.2));
    hot = 0.7;
  }
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  mv.x += position.x * size;
  mv.y += (position.y + 0.25) * size * 1.6; // (tall: a flame is taller than wide, its root at the point)
  vUv = position.xy + 0.5; vPh = ph; vSeed = aSeed; vHot = hot;
  gl_Position = projectionMatrix * mv;
}`;
const FL_FRAG = `
${NOISE}
uniform float uTime; uniform float uFade; uniform float uHeat;
varying vec2 vUv; varying float vPh; varying float vSeed; varying float vHot;
vec3 ramp(float h){
  vec3 c = mix(vec3(0.5, 0.05, 0.0), vec3(1.0, 0.3, 0.02), smoothstep(0.1, 0.45, h));
  c = mix(c, vec3(1.0, 0.68, 0.18), smoothstep(0.45, 0.8, h));
  return mix(c, vec3(1.0, 0.95, 0.8), smoothstep(0.8, 1.15, h));
}
void main(){
  // a tongue of flame: wide at its root, licking up to a torn point, its edges eaten by the moving noise
  vec2 uv = vUv;
  float n = vn(vec3(uv.x * 3.0 + vSeed * 17.0, uv.y * 2.2 - uTime * 3.3, vSeed * 5.0));
  float n2 = vn(vec3(uv.x * 7.0 - vSeed * 9.0, uv.y * 5.0 - uTime * 5.1, 1.7));
  float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 0.7 * uv.y;
  float w = mix(0.95, 0.12, pow(uv.y, 0.8)); // (narrowing upward)
  float body = smoothstep(w, w * 0.25, abs(x)) * smoothstep(1.0, 0.55, uv.y + (n2 - 0.5) * 0.35) * smoothstep(0.0, 0.12, uv.y);
  float life = smoothstep(0.0, 0.12, vPh) * (1.0 - smoothstep(0.55, 1.0, vPh));
  float heat = (body * (0.95 - uv.y * 0.6) * (1.0 - vPh * 0.6) * vHot + 0.12) * uHeat;
  float al = body * life * uFade * 0.3;
  if (al < 0.004) discard;
  gl_FragColor = vec4(ramp(heat) * al, al);
}`;

let _flameGeo = null;
/** The tongues of flame: one quad, an instance per tongue — on the body (ring, angle, depth) and on the head (a point of the skull / jaw). */
function flameGeometry() {
    if (_flameGeo) return _flameGeo;
    const H = headGeometry();
    const nBody = N * FL_RING, n = nBody + FL_HEAD + FL_JAW;
    const ring = new Float32Array(n), ang = new Float32Array(n), rad = new Float32Array(n), seed = new Float32Array(n), kind = new Float32Array(n), head = new Float32Array(n * 3);
    const rng = (() => { let a = 1234567; return () => { a = (Math.imul(a, 1103515245) + 12345) >>> 0; return a / 4294967296; }; })();
    let k = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < FL_RING; j++, k++) { ring[k] = Math.min(N - 1.001, i + rng()); ang[k] = (j / FL_RING) * TAU + rng() * 0.4; rad[k] = 0.35 + 0.65 * rng(); seed[k] = rng(); }
    const fromShape = (geo, count, kd) => {
        const P = geo.attributes.position;
        for (let c = 0; c < count; c++, k++) {
            const v = (rng() * P.count) | 0;
            head[k * 3] = P.getX(v) * 1.06; head[k * 3 + 1] = P.getY(v) * 1.08; head[k * 3 + 2] = P.getZ(v) * 1.02; // (just off its surface: in front of the embers)
            kind[k] = kd; seed[k] = rng();
        }
    };
    fromShape(H.skull, FL_HEAD, 1);
    fromShape(H.jaw, FL_JAW, 2);
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.setIndex(q.index); g.setAttribute('position', q.attributes.position);
    const ia = (arr, sz) => new THREE.InstancedBufferAttribute(arr, sz);
    g.setAttribute('aRing', ia(ring, 1)); g.setAttribute('aAng', ia(ang, 1)); g.setAttribute('aRad', ia(rad, 1));
    g.setAttribute('aSeed', ia(seed, 1)); g.setAttribute('aKind', ia(kind, 1)); g.setAttribute('aHead', ia(head, 3));
    g.instanceCount = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    g.userData.shared = true; // (every serpent's; never disposed)
    return (_flameGeo = g);
}

let _basic = null;
const basics = () => _basic || (_basic = {
    fang: new THREE.MeshBasicMaterial({ color: 0xfff1cc }),
    eye: new THREE.MeshBasicMaterial({ color: 0xfff6b0 }),
    slit: new THREE.MeshBasicMaterial({ color: 0x1a0300 }),
    dark: new THREE.MeshBasicMaterial({ color: 0x3a0800 }),
    throat: new THREE.MeshBasicMaterial({ color: 0xffd060, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
});

// ------------------------------------------------------------------ one serpent (mine or another computer's)
class Serpent {
    constructor(sys, by, anchor) {
        this.sys = sys; this.by = by;
        this.id = 'fs:' + by;
        this.isFireSerpent = true;
        this.anchor = anchor.clone(); // the blaze it poured out of (its tail is there until all of it is out)
        this.lead = anchor.clone(); // where the neck rises off the ground (the body follows its path)
        this.leadT = anchor.clone(); // where it crawls
        this.head = anchor.clone(); // the head's middle
        this.headT = anchor.clone();
        this.p = Array.from({ length: N }, () => anchor.clone());
        this.r = new Float32Array(N);
        this.ys = new Float32Array(N).fill(NaN); // (the rings' heights, smoothed over the blocks' steps)
        this.hx = new Float32Array(HCAP); this.hz = new Float32Array(HCAP); this.h0 = 0; this.hn = 0;
        this._push(anchor.x, anchor.z);
        this.walked = 0; // m crawled: how much of it is out of the fire
        this.i0 = N; // (the first ring out of the fire)
        this.heading = 0; this.phase = Math.random() * TAU;
        this.lift = 0; this.liftT = SERPENT.CRAWL_LIFT;
        this.grow = 0; this.fade = 0; this.dead = false;
        this.hp = SERPENT.HP;
        this.jaw = 0; this.jawT = 0;
        this.mode = 'rise'; this.modeT = 0;
        this.target = null; // {k, id}
        this.point = null; // {x, y, z} a place to ravage
        this.biteCd = 0; this.burnT = 0; this.bodyI = 0;
        this.face = new THREE.Vector3(0, 0, 1); this.faceT = new THREE.Vector3(0, 0, 1);
        this.vel = new THREE.Vector3();
        this.hissT = 0; this.wobble = Math.random() * 10; this.restT = 0;
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
        const core = new THREE.Mesh(geo, this.coreMat);
        core.renderOrder = 3;
        core.scale.setScalar(1); // (its rings' radii are the body's: the flames grow off it)
        this.flameMat = M.flames(spine);
        const flames = this.flames = new THREE.Mesh(flameGeometry(), this.flameMat);
        flames.renderOrder = 5;
        this.group.add(core, flames);
        // the head: its middle at the head point; z — forward, y — up
        const hd = this.headGroup = new THREE.Group();
        const skull = new THREE.Mesh(H.skull, this.headMat);
        skull.renderOrder = 3;
        const fu = new THREE.Mesh(H.fangsUp, B.fang);
        const throat = new THREE.Mesh(H.throat, B.throat); throat.scale.set(0.55, 0.25, 1.1); throat.position.set(0, -0.12, 0.1); throat.renderOrder = 4;
        hd.add(skull, fu, throat);
        for (const sx of [-1, 1]) {
            // the eyes under the brow ridges, looking forward-sideways; a vertical slit of a pupil
            const e = new THREE.Mesh(H.eye, B.eye); e.position.set(sx * 0.58, 0.22, 0.45); e.scale.set(1.3, 1.1, 1.7);
            const s = new THREE.Mesh(H.slit, B.slit); s.position.set(sx * 0.74, 0.22, 0.5); s.scale.set(0.16, 1.0, 0.45); s.rotation.y = sx * 0.6;
            const n = new THREE.Mesh(H.nostril, B.dark); n.position.set(sx * 0.17, 0.16, 1.5); n.scale.set(1, 0.6, 1.4);
            hd.add(e, s, n);
        }
        // the lower jaw: hinged at the back of the head
        const hinge = this.jawHinge = new THREE.Group();
        hinge.position.set(0, -0.08, -1.28);
        const jaw = new THREE.Mesh(H.jaw, this.headMat);
        jaw.renderOrder = 3;
        const tl = new THREE.Mesh(H.teeth, B.fang);
        hinge.add(jaw, tl);
        hd.add(hinge);
        this.group.add(hd);
        for (const m of [...this.group.children, ...hd.children, ...hinge.children]) m.frustumCulled = false;
        g.scene?.add(this.group);
    }

    dispose() {
        this.group.parent?.remove(this.group); // (three r128 has no removeFromParent)
        for (const m of [this.coreMat, this.shellMat, this.headMat, this.headShellMat, this.flameMat]) m.dispose(); // (the geometries are shared)
    }

    /** The first ring out of the fire (rings before it are still in the blaze). */
    get out() { return N - this.i0; }

    /** The point the head bites with (its jaws' front). */
    mouth(out) { return out.copy(this.head).addScaledVector(this.face, SERPENT.HEAD_LEN * 0.42); }

    /** The body as one capsule for a charge (Duel._bodies): the neck to the snout — what one aims at. */
    bodyCapsule(e) {
        e.a.copy(this.lead); this.mouth(e.b);
        e.r = SERPENT.R_BODY * 1.1;
        return e;
    }

    centre(out) { return out.copy(this.head); }

    // ---------------------------------------------------------------- the path
    _push(x, z) {
        const k = (this.h0 + this.hn) % HCAP;
        this.hx[k] = x; this.hz[k] = z;
        if (this.hn < HCAP) this.hn++; else this.h0 = (this.h0 + 1) % HCAP;
    }
    _newest() { return (this.h0 + this.hn - 1) % HCAP; }

    /** The lead crawls to (gx, gz) at `speed`: it turns gradually and snakes from side to side — the waves run down the body. */
    crawl(dt, gx, gz, speed) {
        const L = this.lead, dx = gx - L.x, dz = gz - L.z, d = Math.hypot(dx, dz);
        if (d < 0.6 || speed <= 0) return 0;
        const want = Math.atan2(dx, dz);
        let dh = want - this.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const turn = Math.max(0.35, speed / SERPENT.TURN_R) * dt; // (wide curves: never tighter than TURN_R)
        this.heading += clamp(dh, -turn, turn);
        this.phase += dt * speed / 6.5; // (a wave ~40 m long)
        const sway = 0.62 * Math.min(1, d / 14) * (Math.abs(dh) > 1.2 ? 0.4 : 1);
        const th = this.heading + sway * Math.sin(this.phase);
        const st = Math.min(speed * dt, d);
        L.x += Math.sin(th) * st; L.z += Math.cos(th) * st;
        const k = this._newest();
        if (Math.hypot(L.x - this.hx[k], L.z - this.hz[k]) >= HSTEP) this._push(L.x, L.z);
        this.walked += st;
        return st;
    }

    // ---------------------------------------------------------------- the body (every computer)
    /** The rings: the body along the path behind the lead, on the ground; the neck an arch up to the head; the head to `headT`. */
    step(dt, headSpeed) {
        const g = this.sys.game, col = g.collision, p = this.p, t = this.sys._t;
        const gyAt = (x, z) => (col?.groundY ? col.groundY(x, z) : this.anchor.y);
        this.grow = Math.min(1, this.walked / BODY_LEN);
        // the body: ring NB−1 at the lead, every next one SEG further back along the path; what the path does not reach is still in the blaze
        const L = this.lead;
        let i = NB - 1, need = 0, acc = 0, px = L.x, pz = L.z;
        p[i].x = px; p[i].z = pz; i--; need = SEG;
        for (let n = this.hn - 1; n >= 0 && i >= 0; n--) {
            const k = (this.h0 + n) % HCAP, qx = this.hx[k], qz = this.hz[k];
            const l = Math.hypot(qx - px, qz - pz);
            while (i >= 0 && acc + l >= need) {
                const f = l > 1e-6 ? (need - acc) / l : 0;
                p[i].x = px + (qx - px) * f; p[i].z = pz + (qz - pz) * f;
                i--; need += SEG;
            }
            acc += l; px = qx; pz = qz;
        }
        this.i0 = i + 1; // (the rings 0…i are still in the fire)
        for (; i >= 0; i--) { p[i].x = this.anchor.x; p[i].z = this.anchor.z; }
        // the radii: it shrinks when weakened, collapses at the end; the end coming out of the fire tapers in
        const sc = (1 - 0.8 * this.fade) * (0.8 + 0.2 * this.hp / SERPENT.HP);
        const i0 = this.i0;
        for (let j = 0; j < N; j++) this.r[j] = j < i0 ? 0 : serpentRadius(j, N) * sc * (j - i0 < 4 ? (j - i0 + 1) / 5 : 1);
        // on the ground: the rings lie on it (half sunk — a river of fire), their heights smoothed over the blocks' steps
        const k6 = Math.min(1, dt * 7);
        for (let j = 0; j < NB; j++) {
            const yT = j < i0 ? this.anchor.y - 2 : gyAt(p[j].x, p[j].z) + this.r[j] * 0.85; // (lying ON the ground, a little sunk)
            this.ys[j] = Number.isFinite(this.ys[j]) && j >= i0 ? this.ys[j] + (yT - this.ys[j]) * k6 : yT;
            p[j].y = this.ys[j];
        }
        // the head goes to its target; the neck can reach so far from the lead
        _a.subVectors(this.headT, this.head);
        const Lh = _a.length(), st = headSpeed * dt;
        if (Lh > st) _a.multiplyScalar(st / Lh);
        this.head.add(_a);
        this.vel.copy(_a).divideScalar(Math.max(dt, 1e-4));
        const Ly = p[NB - 1].y;
        _b.set(this.head.x - L.x, this.head.y - Ly, this.head.z - L.z);
        const reach = NECK_LEN * 0.92;
        if (_b.length() > reach) { _b.setLength(reach); this.head.set(L.x + _b.x, Ly + _b.y, L.z + _b.z); }
        const hg = gyAt(this.head.x, this.head.z) + 2.5;
        if (this.head.y < hg) this.head.y = hg;
        // where it looks
        this.face.lerp(this.faceT, Math.min(1, dt * 5));
        if (this.face.lengthSq() < 1e-4) this.face.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        this.face.normalize();
        // the neck: a cubic arch from the lead (along the ground, the way it crawls) up to the back of the skull (along the look)
        _c.copy(this.head).addScaledVector(this.face, -SERPENT.HEAD_LEN * 0.36); // (the back of the skull)
        _d.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        const P0x = L.x, P0y = Ly, P0z = L.z;
        const P1x = L.x + _d.x * NECK_LEN * 0.3, P1y = Ly + 1, P1z = L.z + _d.z * NECK_LEN * 0.3;
        const P2x = _c.x - this.face.x * NECK_LEN * 0.3, P2y = _c.y - this.face.y * NECK_LEN * 0.3 - 3, P2z = _c.z - this.face.z * NECK_LEN * 0.3;
        for (let j = NB; j < N; j++) {
            const u = (j - NB + 1) / SERPENT.NECK, v = 1 - u;
            const b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
            p[j].set(b0 * P0x + b1 * P1x + b2 * P2x + b3 * _c.x, b0 * P0y + b1 * P1y + b2 * P2y + b3 * _c.y, b0 * P0z + b1 * P1z + b2 * P2z + b3 * _c.z);
            // (breathing: the neck sways a little)
            p[j].x += Math.sin(t * 1.3 + j * 0.5 + this.wobble) * 0.25 * u * (1 - this.fade);
        }
    }

    /** The uniforms (relative to the lead: precise in far places too), the head's frame, the jaw. */
    draw(dt) {
        const p = this.p, o = this.lead;
        this.group.position.copy(o);
        this.group.updateMatrix();
        const C = this.spine.uC.value, Nn = this.spine.uN.value, Bb = this.spine.uB.value;
        // a frame carried along the spine without twisting
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
        // the head: upright, along the look
        _c.copy(_up).addScaledVector(this.face, -this.face.dot(_up));
        if (_c.lengthSq() < 1e-4) _c.set(1, 0, 0);
        _c.normalize();
        _d.crossVectors(_c, this.face);
        _m.makeBasis(_d, _c, this.face);
        const hd = this.headGroup;
        hd.quaternion.setFromRotationMatrix(_m);
        hd.position.set(this.head.x - o.x, this.head.y - o.y, this.head.z - o.z);
        hd.scale.setScalar(HEAD_K * (1 - 0.7 * this.fade) * (0.85 + 0.15 * this.hp / SERPENT.HP) * Math.min(1, 0.3 + this.walked / 30));
        // the jaw: snaps open before a bite, shut after; it breathes a little
        this.jaw += (this.jawT - this.jaw) * Math.min(1, dt * 9);
        this.jawHinge.rotation.x = 0.04 + this.jaw * 0.9 + Math.sin(this.sys._t * 2.3 + this.wobble) * 0.03;
        // heat: weakened — darker
        const heat = (0.7 + 0.3 * this.hp / SERPENT.HP) * (1 - 0.6 * this.fade);
        for (const m of [this.coreMat, this.shellMat, this.headMat, this.headShellMat, this.flameMat]) { m.uniforms.uHeat.value = heat; m.uniforms.uFade.value = 1 - this.fade; }
        // the head's flames: on its skull and its jaw, wherever they are now
        hd.updateMatrix(); this.jawHinge.updateMatrix();
        const F = this.flameMat.uniforms;
        F.uHeadM.value.copy(hd.matrix);
        F.uJawM.value.multiplyMatrices(hd.matrix, this.jawHinge.matrix);
        F.uHeadS.value = hd.scale.x;
        this._particles(dt);
    }

    /** The Hellfire's own flame cubes off the whole body (its pool, its colours), embers, smoke; sparks from the jaws. */
    _particles(dt) {
        const S = this.sys, P = S.pool, fx = S.game.fx;
        if (!P) return;
        const p = this.p, i0 = this.i0, out = N - i0, live = 1 - this.fade;
        // flames: off the back and the flanks, rising and streaming back along the body
        const n = S._n('flame', (420 * live + 300 * this.fade) * out / N, dt, 24);
        for (let k = 0; k < n; k++) {
            const i = i0 + ((Math.random() * out) | 0), r = this.r[i];
            if (r < 0.3) continue;
            const a = Math.random() * TAU, ca = Math.cos(a), sa = Math.sin(a);
            const nx = this.spine.uN.value[i], bx = this.spine.uB.value[i];
            const ux = nx.x * ca + bx.x * sa, uy = Math.abs(nx.y * ca + bx.y * sa), uz = nx.z * ca + bx.z * sa; // (the upper side)
            const back = p[Math.max(0, i - 1)];
            const big = r / SERPENT.R_BODY;
            P.spawn(p[i].x + ux * r * 0.8, p[i].y + uy * r * 0.8, p[i].z + uz * r * 0.8,
                ux * 1.5 + (back.x - p[i].x) * 0.6, 3.5 + Math.random() * 5 * big, uz * 1.5 + (back.z - p[i].z) * 0.6,
                this.fade > 0 ? pick(EMBER) : Math.random() < 0.08 ? pick(CORE) : Math.random() < 0.7 ? pick(FLAME) : pick(DEEP),
                (0.6 + Math.random() * 1.1) * (0.4 + 0.6 * big), 0.4 + Math.random() * 0.35, { shrink: 1.1, spin: 6 });
        }
        // the head: a crown of flame streaming back off it
        const h = this.head, hn = S._n('head', 140 * live, dt, 10);
        for (let k = 0; k < hn; k++) {
            const s = SERPENT.HEAD_LEN * 0.4;
            P.spawn(h.x + (Math.random() - 0.5) * s, h.y + Math.random() * s * 0.35, h.z + (Math.random() - 0.5) * s,
                -this.face.x * 4 + (Math.random() - 0.5) * 2, 4 + Math.random() * 4, -this.face.z * 4 + (Math.random() - 0.5) * 2,
                Math.random() < 0.1 ? pick(CORE) : pick(FLAME), 0.7 + Math.random() * 1.1, 0.35 + Math.random() * 0.25, { shrink: 1.2, spin: 7 });
        }
        // embers flying up off it, smoke over it
        const em = S._n('ember', 30 * live, dt, 4);
        for (let k = 0; k < em; k++) {
            const i = i0 + ((Math.random() * out) | 0);
            P.spawn(p[i].x, p[i].y + this.r[i], p[i].z, (Math.random() - 0.5) * 4, 5 + Math.random() * 5, (Math.random() - 0.5) * 4, pick(EMBER), 0.3 + Math.random() * 0.25, 0.8 + Math.random() * 0.6, { shrink: 0.4, spin: 9 });
        }
        if (fx?.smoke) {
            const sm = S._n('smoke', 22 * live, dt, 3);
            for (let k = 0; k < sm; k++) {
                const i = i0 + ((Math.random() * out) | 0), r = this.r[i];
                fx.smoke.spawn(p[i].x + (Math.random() - 0.5) * r, p[i].y + r * 1.6 + Math.random() * 2, p[i].z + (Math.random() - 0.5) * r, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), pick(SMOKE), 1.6 + Math.random() * 1.6, 2.4, { shrink: -0.5, spin: 0.8 });
            }
        }
        if (this.jaw > 0.35) {
            const sp = S._n('spit', 80 * this.jaw, dt, 8);
            this.mouth(_e);
            for (let k = 0; k < sp; k++) P.spawn(_e.x, _e.y, _e.z, this.face.x * 14 + (Math.random() - 0.5) * 4, this.face.y * 14 + Math.random() * 3, this.face.z * 14 + (Math.random() - 0.5) * 4, Math.random() < 0.4 ? pick(CORE) : pick(FLAME), 0.6 + Math.random() * 0.8, 0.5, { shrink: 1, spin: 6 });
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
        this._acc = { flame: 0, head: 0, ember: 0, smoke: 0, spit: 0 };
        this._tmpE = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
        // its own pool of the Hellfire's flame cubes (the same material: no new shader; the Hellfire's own pool stays for its fire)
        this.pool = game.scene ? new ParticlePool(game.scene, { geometry: new THREE.BoxGeometry(1, 1, 1), capacity: 3000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }) : null;
    }

    get me() { return this.game.localId; }
    /** My serpent lives (the Hellfire's drain is doubled). */
    get alive() { return !!(this.mine && !this.mine.dead && this.mine.fade === 0); }

    _note(e) { this.log.push({ t: r2(this._t), ...e }); if (this.log.length > 60) this.log.shift(); }
    _n(key, rate, dt, max) { this._acc[key] = (this._acc[key] || 0) + rate * dt; const n = Math.min(max, Math.floor(this._acc[key])); this._acc[key] -= n; return n; }
    _hint(text, isFinal) { if (isFinal) this.game.hud?.setVoice?.(text, true); return null; }

    /** Every serpent (for charges, wizards, water): mine and the others'. */
    *all() { if (this.mine && !this.mine.dead) yield this.mine; for (const s of this.remote.values()) if (!s.dead) yield s; }
    targets() { return [...this.all()].filter((s) => s.fade === 0 && s.walked > 20); }
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
        // it pours out of the blaze away from me (the way the wand pointed), then curls round
        _b.copy(s.c).sub(g.character.group.position).setY(0);
        if (_b.lengthSq() < 1e-4) _b.copy(s.d).setY(0);
        if (_b.lengthSq() < 1e-4) _b.set(0, 0, 1);
        sv.heading = Math.atan2(_b.x, _b.z);
        sv.face.set(Math.sin(sv.heading), 0.3, Math.cos(sv.heading)).normalize(); sv.faceT.copy(sv.face);
        sv.curl = Math.random() < 0.5 ? 1 : -1;
        this._note({ ev: 'cast' });
        const P = this.pool;
        // the fire heaves up: a burst, the ground shakes, the roar
        g.fx?.lightFlash?.(s.c, 0xff5a1a, 18, 1, 90);
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 1.3);
        g.sound?.playInferno?.(); g.sound?.playRumble?.(s.c, g.character.group.position);
        if (P) for (let i = 0; i < 260; i++) { const a = Math.random() * TAU, v = 4 + Math.random() * 12; P.spawn(s.c.x, s.c.y, s.c.z, Math.cos(a) * v, 5 + Math.random() * 18, Math.sin(a) * v, Math.random() < 0.3 ? pick(CORE) : pick(FLAME), 0.8 + Math.random() * 1.6, 0.8 + Math.random() * 0.7, { shrink: 0.7, spin: 5 }); }
        g.castleLife?.alarm?.(s.c, 'fire', this.me, 60); // (a horror: everyone near runs, the knights come)
        g.hud?.setVoice?.('🐍 <b>Огненный змей!</b> Он выползает из адского огня и ползает рядом с вами. «Атак» на кого-то — укусит и подожжёт; на место — поползёт туда и выжжет всё. Пока он жив, огонь тратит вдвое больше маны', true);
        this._send(true);
        return SERPENT.NAME;
    }

    /** Where it pours out: the blaze, on the ground. */
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
            s.target = { k: t.kind, id: t.id }; s.point = null; s.mode = 'strike'; s.modeT = 0; s.lunge = 0;
            this._note({ ev: 'attack', k: t.kind, id: t.id });
            g.hud?.setVoice?.('🐍 Змей бросается на цель!', true);
            return true;
        }
        const o = new THREE.Vector3(), d = new THREE.Vector3();
        g.duel?._myRay?.(aim?.side || g.magicHand || g.lastMagicHand || 'right', o, d);
        const cell = g.builder?._hitCell?.(o, d, 120);
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
        s.target = ref; s.mode = 'strike'; s.modeT = 0; s.guard = true; s.lunge = 0;
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
            // (its lead crawls after the owner's — the same snaking, its own path)
            const sp = s.netLead ? Math.max(SERPENT.SPEED, s.lead.distanceTo(s.netLead) * 3) : 0;
            if (s.netLead) s.crawl(dt, s.netLead.x, s.netLead.z, sp);
            s.faceT.copy(s.headT).sub(s.head);
            if (s.faceT.lengthSq() < 4) s.faceT.copy(s.face);
            s.faceT.normalize();
            s.step(dt, SERPENT.LUNGE);
            this._burnTick(s, dt);
            s.draw(dt);
        }
        if (this.heldMe) this._heldMeStep(dt);
        this.pool?.update(dt);
        if (g.authority) this._wizards(dt);
    }

    _updateMine(dt) {
        const g = this.game, s = this.mine, hf = g.hellfire?.state;
        // the fire out (stop, mana, water, the wand dropped, the caster down): the serpent falls apart
        if (s.fade === 0 && (!hf || s.hp <= 0)) this._die(s.hp <= 0 ? s.killedBy || 'water' : 'fire');
        if (s.fade > 0) {
            s.fade += dt / SERPENT.FADE_S;
            s.headT.y -= 6 * dt; s.jawT = 0.5;
            s.step(dt, 4); s.draw(dt);
            if (s.fade >= 1) { s.dispose(); this.mine = null; this._send(false); }
            return;
        }
        s.hp = Math.min(SERPENT.HP, s.hp + SERPENT.REGEN * dt);
        // water round its head (a river, water magic): it hisses and weakens
        const wet = g.hellfire._wet?.(s.head, SERPENT.HEAD_FIRE_R) || 0;
        if (wet > 0) { s.hp -= 25 * wet * dt; s.killedBy = 'water'; }
        s.modeT += dt; s.biteCd -= dt; s.hissT -= dt;
        const me = g.character.group.position, L = s.lead, t = this._t;
        const fwdX = Math.sin(s.heading), fwdZ = Math.cos(s.heading);
        let crawl = SERPENT.SPEED, headSpeed = 14;
        const dMe = Math.hypot(me.x - L.x, me.z - L.z);
        if (s.mode === 'rise') {
            // it pours out of the blaze: fast, in a wide arc round it (the whole body comes out in GROW_S)
            crawl = BODY_LEN / SERPENT.GROW_S;
            const a = s.heading + s.curl * 0.3; // (out and away in a long gentle curve)
            s.leadT.set(L.x + Math.sin(a) * 40, 0, L.z + Math.cos(a) * 40);
            if (dMe < SERPENT.NEAR + 4) { _a.set(L.x - me.x, 0, L.z - me.z).setLength(SERPENT.NEAR + 30); s.leadT.set(me.x + _a.x, 0, me.z + _a.z); } // (never over me: away from me)
            s.liftT = SERPENT.CRAWL_LIFT;
            if (s.grow >= 1) { s.mode = 'idle'; s.modeT = 0; s.restT = 2.5; this._roar(s, 1); }
        } else if (s.mode === 'strike') {
            const r = this._strike(s, dt);
            crawl = r.crawl; headSpeed = r.head;
        } else if (s.mode === 'sweep') {
            // round the place, coiling, its jaws breathing fire low over it
            const P = s.point, a = s.modeT * 0.55 * (s.curl || 1);
            s.leadT.set(P.x + Math.cos(a) * SERPENT.SWEEP_R, 0, P.z + Math.sin(a) * SERPENT.SWEEP_R);
            crawl = SERPENT.SPEED * 1.8;
            s.liftT = 0.45; s.jawT = 0.6;
            s.faceT.set(P.x - s.head.x, P.y - s.head.y, P.z - s.head.z).normalize();
            if (Math.hypot(P.x - L.x, P.z - L.z) > SERPENT.SWEEP_R * 2.2) s.modeT = 0; // (still on its way: the time runs from its arrival)
            if (s.modeT > SERPENT.SWEEP_S) { s.mode = 'idle'; s.modeT = 0; s.jawT = 0; s.restT = 1.5; }
        }
        if (s.mode === 'idle') {
            // its own life round its master: crawls about (never over him, follows him when he goes), rests, raises its head and watches, hisses
            if (dMe > SERPENT.FOLLOW) { s.leadT.set(me.x - (me.x - L.x) / dMe * SERPENT.WANDER * 0.7, 0, me.z - (me.z - L.z) / dMe * SERPENT.WANDER * 0.7); crawl = SERPENT.SPEED * SERPENT.FOLLOW_K; s.restT = 0; }
            else if (s.restT > 0) { s.restT -= dt; crawl = 0; }
            else if (Math.hypot(s.leadT.x - L.x, s.leadT.z - L.z) < 4 || s.modeT > 14 || Math.hypot(s.leadT.x - me.x, s.leadT.z - me.z) > SERPENT.WANDER * 1.3) {
                // a new place to crawl to: round me, between NEAR and WANDER, ahead of it (it does not turn back on itself)
                const base = Math.atan2(L.x - me.x, L.z - me.z) + (s.curl || 1) * (0.7 + Math.random() * 0.8);
                const R = SERPENT.NEAR + 15 + Math.random() * (SERPENT.WANDER - SERPENT.NEAR - 15);
                s.leadT.set(me.x + Math.sin(base) * R, 0, me.z + Math.cos(base) * R);
                s.modeT = 0;
                if (Math.random() < 0.35) s.restT = 2 + Math.random() * 4;
                if (Math.random() < 0.2) s.curl = -(s.curl || 1);
            }
            // never through me: the lead goes round
            if (dMe < SERPENT.NEAR) { _a.set(L.x - me.x, 0, L.z - me.z).setLength(SERPENT.NEAR + 8); s.leadT.set(me.x + _a.x, 0, me.z + _a.z); crawl = Math.max(crawl, SERPENT.SPEED); }
            const resting = crawl === 0;
            s.liftT = resting ? 1 : SERPENT.CRAWL_LIFT;
            s.jawT = resting && Math.sin(t * 0.5 + s.wobble) > 0.9 ? 0.75 : 0; // (now and then it opens its jaws and hisses)
            if (s.jawT > 0 && s.hissT <= 0) { s.hissT = 5; g.sound?.playInferno?.(); }
            // it looks where it crawls; resting — round about, now at me, now away
            if (resting) { const la = s.heading + Math.sin(t * 0.4 + s.wobble) * 1.1; s.faceT.set(Math.sin(la), -0.05 + Math.sin(t * 0.7) * 0.1, Math.cos(la)).normalize(); }
            else s.faceT.set(fwdX, -0.12, fwdZ).normalize();
        }
        s.lift += (s.liftT - s.lift) * Math.min(1, dt * 2.2);
        s.crawl(dt, s.leadT.x, s.leadT.z, crawl);
        // the head: ahead of where the neck rises, raised by the lift, swaying (unless the strike leads it)
        if (s.mode !== 'strike' || !s.lunge) {
            const gy = g.collision?.groundY ? g.collision.groundY(L.x, L.z) : L.y;
            const sw = Math.sin(t * 0.9 + s.wobble) * 1.6;
            const ahead = NECK_LEN * (0.55 - 0.2 * Math.min(1, s.lift));
            s.headT.set(L.x + fwdX * ahead + fwdZ * sw, gy + SERPENT.HEAD_H * s.lift + Math.sin(t * 1.3) * 0.6, L.z + fwdZ * ahead - fwdX * sw);
            if (s.mode === 'strike' && s.reared) s.headT.copy(s.reared);
        }
        s.step(dt, headSpeed);
        this._burnTick(s, dt);
        s.draw(dt);
        // the network
        this._sendT += dt;
        if (this._sendT >= SERPENT.SEND) { this._sendT = 0; this._send(true); }
    }

    /** «Атак» on someone: it crawls up to him, rears high, lunges, bites, draws back — again, while he is there. @returns the speeds */
    _strike(s, dt) {
        const L = s.lead;
        // holding its prey up in the jaws / gulping it down — the head lifts, shakes, throws or swallows (the prey follows: _heldStep)
        if (s.held) return this._holdStrike(s, dt);
        // going on THROUGH what it struck: the head flies on beyond it, the fire burning what it passed
        if (s.thru) {
            s.thru.t += dt;
            s.headT.copy(s.thru.to);
            if (s.thru.t > 0.9 || s.head.distanceTo(s.thru.to) < 3) s.thru = null;
            return { crawl: SERPENT.SPEED, head: SERPENT.LUNGE };
        }
        const tp = this._targetPoint(s.target, _c);
        if (!tp || s.modeT > 45) { s.mode = 'idle'; s.target = null; s.guard = false; s.jawT = 0; s.lunge = 0; s.reared = null; return { crawl: SERPENT.SPEED, head: 10 }; }
        const dx = tp.x - L.x, dz = tp.z - L.z, d = Math.hypot(dx, dz) || 1;
        s.faceT.set(tp.x - s.head.x, tp.y - s.head.y, tp.z - s.head.z).normalize();
        const strikeAt = NECK_LEN * 0.62; // (the neck strikes from about here)
        if (!s.lunge) {
            // crawling up to it, then rearing: the head drawn back and high, the jaws opening
            s.leadT.set(tp.x - dx / d * strikeAt * 0.8, 0, tp.z - dz / d * strikeAt * 0.8);
            s.liftT = d < strikeAt * 1.6 ? 1.5 : SERPENT.CRAWL_LIFT;
            s.jawT = d < strikeAt * 1.6 ? 0.45 : 0;
            const gy = this.game.collision?.groundY ? this.game.collision.groundY(L.x, L.z) : L.y;
            (s.reared || (s.reared = new THREE.Vector3())).set(L.x + dx / d * 4, gy + SERPENT.HEAD_H * 1.5, L.z + dz / d * 4);
            if (d < strikeAt * 1.1 && s.head.distanceTo(s.reared) < 4 && s.biteCd <= 0) { s.lunge = 0.0001; s.jawT = 1; s.att = this._pickAttack(s.target); this._roar(s, 0.6); }
            return { crawl: d > strikeAt ? SERPENT.SPEED * 1.6 : 0, head: 16 };
        }
        // the lunge: the head flies at it
        s.lunge += dt;
        s.headT.copy(tp);
        s.mouth(_d);
        if (_d.distanceTo(tp) < SERPENT.BITE_R || s.lunge > 0.9) {
            const att = s.att || 'bite';
            if (_d.distanceTo(tp) < SERPENT.BITE_R + 2) {
                this._bite(s, s.target, tp, att);
                if (att === 'through') { _a.copy(s.face).setY(Math.max(-0.2, s.face.y)).normalize(); s.thru = { t: 0, to: tp.clone().addScaledVector(_a, SERPENT.THROUGH_ON) }; }
                else if (att === 'toss' || att === 'swallow') s.held = { ref: { ...s.target }, att, t: 0, dir: Math.random() < 0.5 ? 1 : -1 };
            }
            s.lunge = 0; s.biteCd = SERPENT.BITE_EVERY + (s.held ? SERPENT.LIFT_S + (s.att === 'swallow' ? SERPENT.GUT_S : 0) : 0); s.jawT = s.held ? 0.55 : 0;
        }
        return { crawl: 0, head: SERPENT.LUNGE };
    }

    /** Which attack this strike is (the author: «несколько видов атак»): bite / through / toss / swallow — grabbing only what it can lift. */
    _pickAttack(ref) {
        const A = SERPENT.ATTACKS, liftable = ref && (ref.k === 'p' || ref.k === 'v' || ref.k === 'c');
        let r = Math.random() * (A.bite + A.through + (liftable ? A.toss + A.swallow : 0));
        if ((r -= A.bite) < 0) return 'bite';
        if ((r -= A.through) < 0) return 'through';
        if ((r -= A.toss) < 0) return 'toss';
        return 'swallow';
    }

    /** (owner) The prey in its jaws: lifted high and shaken, then thrown aside — or gulped and slid down inside the fiery body. → speeds */
    _holdStrike(s, dt) {
        const H = s.held, L = s.lead, g = this.game;
        H.t += dt;
        const gy = g.collision?.groundY ? g.collision.groundY(L.x, L.z) : L.y;
        const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
        if (H.t < SERPENT.LIFT_S) {
            // up with it, high, shaking it (a dog with a rat)
            const sh = Math.sin(H.t * 22) * 2.2 * (1 - H.t / SERPENT.LIFT_S);
            s.headT.set(L.x + fx * 6 + fz * sh, gy + SERPENT.HEAD_H * 1.75, L.z + fz * 6 - fx * sh);
            s.faceT.set(fx, -0.25, fz).normalize(); s.jawT = 0.4;
        } else if (H.att === 'toss') {
            // the whip of the neck to the side — and it lets go
            s.headT.set(L.x + fx * 4 + fz * H.dir * 20, gy + SERPENT.HEAD_H * 1.2, L.z + fz * 4 - fx * H.dir * 20);
            s.faceT.set(fz * H.dir, 0.2, -fx * H.dir).normalize();
            if (!H.thrown && H.t > SERPENT.LIFT_S + 0.25) { H.thrown = true; s.jawT = 1; this._heldRelease(s, H, 'toss'); }
            if (H.t > SERPENT.LIFT_S + 0.8) s.held = null;
        } else {
            // the gulp: the head up, the jaws snapping shut, the throat working — the prey slides down inside the fire
            s.headT.set(L.x + fx * 3, gy + SERPENT.HEAD_H * 1.5, L.z + fz * 3);
            s.faceT.set(fx, 0.75, fz).normalize();
            s.jawT = H.t < SERPENT.LIFT_S + 0.5 ? 1 : 0.05;
            if (H.t > SERPENT.LIFT_S + SERPENT.GUT_S) { this._heldRelease(s, H, 'gut'); s.held = null; }
        }
        if (s.held) this._heldStep(s, H);
        return { crawl: 0, head: 20 };
    }

    /** Where a held prey is now (into `out`): in the jaws while lifted / thrown, then sliding down the rings inside the body. */
    _victimPos(s, H, t, out) {
        if (H.att === 'swallow' && t > SERPENT.LIFT_S * 0.85) {
            const u = Math.min(1, (t - SERPENT.LIFT_S * 0.85) / SERPENT.GUT_S), f = (N - 3) - u * SERPENT.GUT_RINGS;
            const i = Math.max(0, Math.floor(f)), k = f - i, a = s.p[i], b = s.p[Math.min(N - 1, i + 1)];
            return out.copy(a).lerp(b, k);
        }
        return s.mouth(out).addScaledVector(s.face, -2.5);
    }

    /** (host) A held castle person / sailor goes with the jaws (players hold themselves: _heldMeStep on their own computer). */
    _heldStep(s, H) {
        const g = this.game;
        if (H.ref.k === 'p' || !g.authority) return;
        const c = g.duel?._creature?.(H.ref.k, H.ref.id);
        if (!c || c.dead) { s.held = null; return; }
        this._victimPos(s, H, H.t, _e);
        c.carriedBy = 'fireSerpent';
        if (c.x !== undefined) { c.x = _e.x; c.z = _e.z; c.y = _e.y - 1.6; c.vy = 0; }
        c.model?.group?.position?.set(_e.x, _e.y + 0.35, _e.z);
        g.creatureImpact?.kinds?.[H.ref.k]?.hold?.(g, c, 0.5);
        c.stunT = Math.max(c.stunT || 0, 0.5);
        H.burnT = (H.burnT || 0) - 1 / 60;
        if (H.att === 'swallow' && H.t > SERPENT.LIFT_S) g.burning?.ignite(H.ref.k, H.ref.id, s.by, undefined, true, true); // (inside the fire: burning twice as hard)
    }

    /** (host) The held one let go: thrown (a flight: CreatureImpact) or fallen out of the body. */
    _heldRelease(s, H, how) {
        const g = this.game;
        if (H.ref.k === 'p' || !g.authority) return;
        const c = g.duel?._creature?.(H.ref.k, H.ref.id);
        if (!c) return;
        c.carriedBy = null;
        const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
        const v = how === 'toss' ? new THREE.Vector3(fz * H.dir * SERPENT.TOSS_V, SERPENT.TOSS_UP, -fx * H.dir * SERPENT.TOSS_V) : new THREE.Vector3((Math.random() - 0.5) * 4, 1, (Math.random() - 0.5) * 4);
        g.creatureImpact?.apply?.(c, { v, by: s.by, kind: 'spell', spell: 'Jolt', always: { down: 3 }, down: 3, toss: v.y, tumble: 1.2 });
        g.burning?.ignite(H.ref.k, H.ref.id, s.by, undefined, true);
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
    _bite(s, ref, at, att = 'bite') {
        const g = this.game;
        this._note({ ev: 'bite', k: ref.k, id: ref.id });
        g.fx?.lightFlash?.(at, 0xff7a1a, 8, 0.4, 30);
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.35);
        g.sound?.playInferno?.();
        const P = this.pool;
        if (P) for (let i = 0; i < 70; i++) P.spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 9, pick(FLAME), 0.3 + Math.random() * 0.5, 0.6, { shrink: 0.7, spin: 7 });
        if (g.authority || ref.k === 'p') this.applyBite(s.by, ref, at, att);
        else this._send(true, [ref.k, ref.id, att]); // (the host does it)
    }

    /** (the host — or my own computer for my body) A bite of `by`'s serpent lands on `ref`. */
    applyBite(by, ref, at, att = 'bite') {
        const g = this.game;
        const dir = new THREE.Vector3(0, 0, 1);
        const s = by === this.me ? this.mine : this.remote.get(by);
        if (s) dir.copy(s.face).setY(0).normalize();
        const K = g.fireBoost?.(by) ?? 1;
        const grab = att === 'toss' || att === 'swallow';
        const dmg = (grab ? SERPENT.GRAB_BITE : SERPENT.BITE) * K;
        const twice = att === 'through' || att === 'swallow'; // (through the fire / inside it: the fire on him twice as hard)
        if (ref.k === 'p' && ref.id === this.me) {
            // me (another's serpent): bitten and on fire — or seized in the jaws
            if (g.combat?.enabled) g.combat.damage(dmg, by, SERPENT.NAME); else g.damageLocalPlayer?.(dmg);
            g.burning?.ignite('p', this.me, by, undefined, true, twice);
            if (grab) { this._seizeMe(by, att); return; }
            g.knockback?.add?.(_a.copy(dir).multiplyScalar(att === 'through' ? 14 : 8).setY(att === 'through' ? 6 : 3));
            g.hud?.setVoice?.(att === 'through' ? `🐍 Огненный змей прошёл сквозь вас: −${Math.round(dmg)}, вы горите вдвойне` : `🐍 Огненный змей укусил вас: −${Math.round(dmg)}`, true);
            return;
        }
        if (ref.k === 'p') { g.sync?.fireSerpentBite?.(ref.id, by, att); return; } // (their computer hurts, burns, holds them: 'fsb' → onBite)
        if (!g.authority) return;
        g.servants?.damage?.(ref, dmg * (ref.k === 's' ? 2 : 1), dir, by, 'serpent', at ? { x: at.x, z: at.z, ref: { k: 'F', id: 'fs:' + by } } : null);
        if (ref.k !== 'G' && ref.k !== 'Y' && ref.k !== 'T' && ref.k !== 'f' && ref.k !== 'D') g.burning?.ignite(ref.k, ref.id, by, undefined, true, twice);
        // what it cannot lift (a zombie, a beast…): «toss» is a blow that flings it
        if (grab && ref.k !== 'v' && ref.k !== 'c') { const c = g.duel?._creature?.(ref.k, ref.id); if (c) g.creatureImpact?.apply?.(c, { v: new THREE.Vector3(dir.x * SERPENT.TOSS_V, SERPENT.TOSS_UP, dir.z * SERPENT.TOSS_V), by, kind: 'spell', spell: 'Jolt', always: { down: 3 }, down: 3, toss: SERPENT.TOSS_UP, tumble: 1 }); }
    }

    /** What it touches burns: the head is a blaze, the body lying on the ground too (Hellfire._burn — every creature). */
    _burnTick(s, dt) {
        if (s.walked < 10) return;
        const hf = this.game.hellfire;
        if (!hf?._burn) return;
        s.burnT -= dt;
        if (s.burnT > 0) return;
        s.burnT = SERPENT.BURN_TICK;
        const k = 1 - s.fade;
        if (k < 0.3) return;
        const f = s._f || (s._f = { c: new THREE.Vector3(), R: 1, k: 0, vel: new THREE.Vector3(), pushT: 0, surgeT: 0, meT: 0, by: s.by });
        f.c.copy(s.head); f.R = SERPENT.HEAD_FIRE_R * k; f.vel.copy(s.vel);
        let hit = hf._burn(s.by, f, f.c);
        // a piece of the body on the ground (a different one every tick: all of it within a second or two)
        const i0 = s.i0, out = N - i0;
        s.bodyI = (s.bodyI + 7) % Math.max(1, out - 2);
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
        if (k >= 1) g.sound?.playRumble?.(s.head, g.character.group.position);
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.3 * k);
    }

    /** It falls apart: embers, steam (water), the fire stays. */
    _die(why) {
        const s = this.mine;
        if (!s || s.fade > 0) return;
        s.fade = 0.001; s.mode = 'die'; s.jawT = 0.9;
        this._note({ ev: 'die', why });
        const g = this.game, P = this.pool;
        if (why === 'water' || why === 'cold') {
            if (P) for (let i = s.i0; i < N; i += 2) for (let k = 0; k < 6; k++) P.spawn(s.p[i].x, s.p[i].y, s.p[i].z, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, pick(STEAM), 2 + Math.random() * 2.5, 2, { shrink: -0.8, spin: 1 });
            g.hud?.setVoice?.('💨 Огненного змея погасили', true);
        } else if (why === 'gods') g.hud?.setVoice?.('✨ Божественная сила развеяла огненного змея', true);
        else if (why !== 'fire') g.hud?.setVoice?.('🐍 Огненный змей рассыпался', true);
        g.sound?.playRumble?.(s.head, g.character.group.position);
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
            let on = hit(s.head, SERPENT.HEAD_LEN * 0.4);
            for (let i = N - 1; i >= s.i0 && !on; i -= 2) on = hit(s.p[i], Math.max(0.5, s.r[i]));
            if (!on) continue;
            any = true;
            const P = this.pool, h = s.head;
            if (P) for (let k = 0; k < 10; k++) P.spawn(h.x + (Math.random() - 0.5) * 8, h.y, h.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2, pick(STEAM), 1 + Math.random(), 1.2, { shrink: -0.7, spin: 1 });
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
            const P = this.pool, c = s.head;
            if (P) for (let k = 0; k < 14; k++) P.spawn(c.x, c.y, c.z, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, pick(STEAM), 1 + Math.random(), 1.3, { shrink: -0.7, spin: 1 });
        }
        if (s !== this.mine) return;
        s.hp = Math.min(SERPENT.HP, s.hp - h.dmg);
        if (h.dmg > 0) s.killedBy = h.why === 'gods' ? 'gods' : h.why === 'cold' ? 'cold' : 'water';
        // struck by someone: it answers him (one-on-one)
        if (h.dmg > 0 && by && by !== this.me && !(s.mode === 'strike' && s.target)) { const ref = refOf(this.game, by); if (ref) { s.target = ref; s.mode = 'strike'; s.modeT = 0; s.lunge = 0; } }
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
            const h = s.head;
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
        const a = s.anchor, h = s.headT, L = s.lead;
        // [the blaze it came from, the head's target, how far it has crawled, the jaw, the strength, collapsing, where the neck rises]
        const m = [r2(a.x), r2(a.y), r2(a.z), r2(h.x), r2(h.y), r2(h.z), Math.round(s.walked), r2(s.jawT), Math.round(s.hp), r2(s.fade), r2(L.x), r2(L.z)];
        this.game.sync?.fireSerpent?.(m, bite);
    }

    /** Another computer's serpent ('fs'). */
    onNet(msg) {
        if (!msg || !msg.by || msg.by === this.me) return;
        const m = msg.s;
        let s = this.remote.get(msg.by);
        if (!Array.isArray(m) || m.length < 12 || !m.every(Number.isFinite)) { if (s && s.fade === 0) s.fade = 0.001; return; }
        if (!s) {
            s = new Serpent(this, msg.by, _a.set(m[0], m[1], m[2]));
            this.remote.set(msg.by, s);
            this.game.sound?.playInferno?.();
            // (it was already out when I came: its body lies along a line behind its lead — then it crawls on its own path)
            if (m[6] > 20) {
                const dx = m[10] - m[0], dz = m[11] - m[2], l = Math.hypot(dx, dz) || 1;
                s.hn = 0; s.h0 = 0;
                for (let k = Math.ceil(BODY_LEN / HSTEP) + 4; k >= 0; k--) s._push(m[10] - dx / l * k * HSTEP, m[11] - dz / l * k * HSTEP);
                s.lead.set(m[10], m[1], m[11]); s.head.set(m[3], m[4], m[5]);
                s.walked = Math.max(m[6], BODY_LEN); s.heading = Math.atan2(dx, dz);
            }
        }
        (s.netLead || (s.netLead = new THREE.Vector3())).set(m[10], 0, m[11]);
        s.headT.set(m[3], m[4], m[5]);
        s.jawT = m[7]; s.hp = m[8];
        if (m[9] > 0 && s.fade === 0) s.fade = 0.001;
        s.at = this._t;
        // a bite asked of the host
        if (msg.b && Array.isArray(msg.b) && this.game.authority) this.applyBite(msg.by, { k: msg.b[0], id: msg.b[1] }, s.mouth(_b), msg.b[2] || 'bite');
    }

    /** ('fsb') `by`'s serpent bit me on its computer. */
    onBite(by, att = 'bite') { this.applyBite(by, { k: 'p', id: this.me }, null, ['bite', 'through', 'toss', 'swallow'].includes(att) ? att : 'bite'); }

    /** Me seized in another's serpent's jaws (my computer holds my body: Game turns my own physics off while `holding`). */
    _seizeMe(by, att) {
        const g = this.game;
        if (this.heldMe || g.isDeadLocal) return;
        try { g.animals?.riding && g.animals.dismount?.(); } catch (_) { /* */ }
        try { g.dragonRide?.busy && g.dragonRide.stop?.('grab'); } catch (_) { /* */ }
        g.flight?.land?.('grab');
        this.heldMe = { by, att, t: 0, dir: Math.random() < 0.5 ? 1 : -1 };
        g.hud?.setVoice?.(att === 'swallow' ? '🐍 Огненный змей схватил вас и глотает! Вы горите внутри его огня' : '🐍 Огненный змей схватил вас в пасть!', true);
    }

    /** I am in its jaws / inside it: my body goes where the serpent has me; then thrown, or out through its fire. */
    get holding() { return !!this.heldMe; }
    _heldMeStep(dt) {
        const g = this.game, H = this.heldMe, s = this.remote.get(H.by);
        const me = g.character.group.position, ch = g.character;
        H.t += dt;
        if (!s || s.fade > 0 || g.isDeadLocal || g.combat?.dead) { this.heldMe = null; return; }
        const end = H.att === 'toss' ? SERPENT.LIFT_S + 0.25 : SERPENT.LIFT_S + SERPENT.GUT_S;
        if (H.t < end) { this._victimPos(s, H, H.t, _e); me.set(_e.x, _e.y, _e.z); ch.verticalVelocity = 0; return; }
        this.heldMe = null;
        if (H.att === 'toss') {
            // thrown aside — high and far (the fall hurts as any fall)
            const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
            ch.verticalVelocity = SERPENT.TOSS_UP; ch.jumpAir = true; ch.onGround = false;
            g.knockback?.add?.(_a.set(fz * H.dir * SERPENT.TOSS_V, 0, -fx * H.dir * SERPENT.TOSS_V));
            g.hud?.setVoice?.('🐍 Змей швырнул вас!', true);
        } else {
            // out through its side (it is fire, not flesh): falling, still burning
            const i = Math.max(0, N - 3 - SERPENT.GUT_RINGS), r = s.r[i] || SERPENT.R_BODY;
            me.set(s.p[i].x + (Math.random() - 0.5) * 2, s.p[i].y + r * 0.3, s.p[i].z + (Math.random() - 0.5) * 2);
            g.knockback?.add?.(_a.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10));
            g.burning?.ignite('p', this.me, H.by, undefined, true);
            g.hud?.setVoice?.('🐍 Вы выпали из огненного змея — горите!', true);
        }
    }

    /** A sample for Game.prewarm: the shaders compile on the loading screen. */
    sample() {
        const s = new Serpent(this, '__prewarm', new THREE.Vector3(0, -500, 0));
        s.group.parent?.remove(s.group); // (three r128 has no removeFromParent)
        for (let i = 0; i < N; i++) s.p[i].set(0, -500, i * 0.5);
        s.i0 = 0; s.r.fill(1);
        s.draw(0.016);
        this.pool?.clear?.();
        return { group: s.group, dispose: () => s.dispose() };
    }

    clear() {
        if (this.mine) { this.mine.dispose(); this.mine = null; }
        for (const s of this.remote.values()) s.dispose();
        this.remote.clear();
        this.pool?.clear?.();
    }
    dispose() { this.clear(); if (this.pool) { this.pool.mesh.parent?.remove(this.pool.mesh); this.pool.mesh.geometry.dispose(); this.pool.mesh.material.dispose(); this.pool = null; } }
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
