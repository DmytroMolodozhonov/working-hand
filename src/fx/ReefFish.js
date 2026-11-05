/**
 * ReefFish.js — the sea's fish: a hundred kinds (the author 05.11: «рыбы разные должны плавать… сделай 100 видов рыб. Они будут однотипны
 * с точки зрения логики, но разные с точки зрения текстур и красоты… магических рыбок»).
 *
 * Twenty real shapes of reef and open-sea fish (butterflyfish, angelfish, tang, clownfish, parrotfish, wrasse, grouper, barracuda,
 * sardine, tuna, boxfish, puffer, Moorish idol, triggerfish, chromis, snapper, lionfish, mandarinfish, mullet, cardinalfish), each in
 * five colourings — 100 kinds (FISH_SPECIES); ten of them magic: they glow in the dark water, brighter at night.
 * One shape for all (FISH_GEO: a body of elliptic rings, the forked/round tail, the dorsal and anal fins, the pectorals, the eyes),
 * one material, ONE draw for every fish: each instance carries its kind's proportions (aShape), colours (aCol1–3) and pattern (aPat) —
 * the video card bends it to the kind (deep and flat as a butterflyfish, long as a barracuda, round as a puffer), paints the pattern
 * (bands, stripes, spots, an eye-spot, two-tone, a maze of lines, saddles, a gradient…), beats the tail.
 * The logic is the same for all: schools (or pairs, or a lone big one) round a centre that wanders in the water near the player at
 * the kind's depth, turning together; a person near — they dart off. Scenery: no network (each computer its own fish), nothing harms.
 */
import * as THREE from 'three';

export const REEF = { SCHOOLS: 16, MAX: 520, R: 52, NEAR: 7 };

// [name, len m, height ×, width ×, tail ×, dorsal ×, school [min, max], depth [min, max] m, pattern, colours [back, belly, mark] for 5 kinds]
// (pattern: 0 counter-shaded, 1 vertical bands, 2 stripes along, 3 spots, 4 an eye-spot, 5 two-tone diagonal, 6 a maze of lines,
//  7 scales lit, 8 saddles on the back, 9 a gradient head → tail)
const ARCH = [
    ['рыба-бабочка', 0.2, 2.0, 0.45, 0.9, 1.4, [2, 4], [2, 14], 4, [['#f5d21b', '#fff6c8', '#1a1a1a'], ['#ffffff', '#f2f2f2', '#e8a215'], ['#f08a1c', '#ffe1a8', '#2b2b2b'], ['#ffe23a', '#fff8d8', '#2a62c8'], ['#f7f3e8', '#ffffff', '#c41f2b']]],
    ['рыба-ангел', 0.35, 2.3, 0.4, 1.1, 2.0, [1, 2], [3, 18], 2, [['#1c3fa8', '#3a6be0', '#ffd23a'], ['#ffd21e', '#ffe98a', '#2858c8'], ['#2a2a2a', '#5a5a5a', '#f7e05a'], ['#e6e6ea', '#ffffff', '#2a3b7a'], ['#7a2db8', '#b06ae8', '#ffcf3a']]],
    ['рыба-хирург', 0.3, 1.6, 0.5, 1.0, 1.0, [3, 9], [2, 12], 9, [['#2457d6', '#3b78f0', '#ffd52a'], ['#ffd81e', '#fff08a', '#ffffff'], ['#3a2f2a', '#5a4a40', '#ff8a1a'], ['#7fb2ff', '#c8e0ff', '#1a2a6a'], ['#f2f2f2', '#ffffff', '#2fa8e0']]],
    ['рыба-клоун', 0.12, 1.15, 0.7, 0.9, 1.0, [2, 5], [1, 8], 1, [['#ff7a14', '#ffa04a', '#ffffff'], ['#d23a10', '#e8642a', '#ffffff'], ['#2a1a14', '#4a2a1a', '#ffffff'], ['#ffb21e', '#ffd06a', '#ffffff'], ['#ff5a8a', '#ff9ab8', '#ffffff']]],
    ['рыба-попугай', 0.6, 1.1, 0.8, 1.0, 0.9, [2, 5], [3, 16], 7, [['#2fbf9e', '#7ee8c8', '#f06ab0'], ['#3a8ef0', '#8ac4ff', '#ffd23a'], ['#e05a8a', '#ffa0c0', '#3ad0c0'], ['#5ac83a', '#a8f08a', '#ff8a2a'], ['#8a5ad8', '#c0a0ff', '#3ae0e0']]],
    ['губан', 0.25, 0.8, 0.6, 0.9, 0.8, [2, 6], [2, 14], 2, [['#2a9a5a', '#7ad89a', '#ff6ab0'], ['#ff8a2a', '#ffc08a', '#3a6ae0'], ['#ffd23a', '#fff0a0', '#3ab0e0'], ['#d83a3a', '#ff8a8a', '#ffffff'], ['#3a5ad8', '#8aa8ff', '#ffe23a']]],
    ['групер', 0.95, 1.0, 1.0, 1.0, 1.0, [1, 1], [6, 22], 3, [['#6a4a32', '#a88a6a', '#2a1a10'], ['#b83a2a', '#e88a6a', '#3a6ad8'], ['#5a6a3a', '#9aaa7a', '#2a2a1a'], ['#2a3a5a', '#6a7a9a', '#e0e0ff'], ['#d8a83a', '#f0d88a', '#6a3a1a']]],
    ['барракуда', 1.3, 0.45, 0.5, 1.2, 0.8, [5, 12], [4, 20], 8, [['#7a8a9a', '#e8eef2', '#2a3a4a'], ['#5a7a6a', '#d8e8e0', '#1a2a20'], ['#8a8a7a', '#f2f0e0', '#3a3a2a'], ['#6a7aa8', '#e0e8ff', '#1a2a5a'], ['#9aa0a8', '#ffffff', '#4a5058']]],
    ['сардина', 0.15, 0.7, 0.55, 1.1, 0.7, [24, 40], [2, 20], 0, [['#3a6a9a', '#e8f2f8', '#8ab0d0'], ['#2a7a8a', '#e0f4f4', '#7ad0d0'], ['#4a5a8a', '#f0f0f8', '#9aa0d8'], ['#5a7a5a', '#eef4e8', '#a0c09a'], ['#2a4a7a', '#f2f6ff', '#6a8ad8']]],
    ['тунец', 0.85, 0.8, 0.8, 1.3, 0.8, [6, 14], [6, 22], 9, [['#1a2a5a', '#e8eef8', '#ffd23a'], ['#2a3a6a', '#f0f4ff', '#c0c8d8'], ['#1a3a4a', '#e0f0f0', '#3ad0a0'], ['#2a2a4a', '#f2f2ff', '#ff8a3a'], ['#203860', '#e8f0ff', '#8ac0ff']]],
    ['рыба-кузовок', 0.25, 1.0, 1.0, 0.7, 0.5, [1, 2], [2, 12], 3, [['#ffd21e', '#fff08a', '#1a1a1a'], ['#2a5ad8', '#8ab0ff', '#ffd23a'], ['#f2f2f2', '#ffffff', '#2a2a2a'], ['#ff8a2a', '#ffc08a', '#ffffff'], ['#6ad83a', '#b0f08a', '#1a3a1a']]],
    ['рыба-шар', 0.3, 1.15, 1.1, 0.7, 0.5, [1, 1], [2, 14], 3, [['#c8b88a', '#f2ead0', '#3a3020'], ['#7a8a5a', '#e0e8c8', '#2a3018'], ['#ffd23a', '#fff4c0', '#2a6ae0'], ['#8a6a5a', '#e8d8c8', '#ffffff'], ['#5a6a8a', '#d8e0f0', '#ffe23a']]],
    ['мавританский идол', 0.25, 2.4, 0.35, 0.9, 3.0, [1, 3], [3, 14], 1, [['#f2f2e8', '#ffffff', '#1a1a1a'], ['#ffe23a', '#fff6c0', '#1a1a1a'], ['#f2f2e8', '#ffffff', '#c83a2a'], ['#d8f0ff', '#ffffff', '#1a2a5a'], ['#ffd8a0', '#fff4e0', '#3a1a1a']]],
    ['спинорог', 0.4, 1.4, 0.6, 1.0, 1.2, [1, 2], [3, 16], 6, [['#3a6ad8', '#8ab0ff', '#ffd23a'], ['#2a2a2a', '#5a5a5a', '#ffffff'], ['#ffb03a', '#ffe0a0', '#3ad0e0'], ['#5ad08a', '#b0f0c8', '#ff6a8a'], ['#d85a3a', '#ffa08a', '#2a3a8a']]],
    ['хромис', 0.1, 1.2, 0.5, 1.1, 1.0, [12, 26], [1, 10], 0, [['#3ae0e0', '#a0ffff', '#2a8ad8'], ['#5ad83a', '#c0ffa0', '#2a8a3a'], ['#3a8aff', '#a0c8ff', '#1a3a8a'], ['#ffd23a', '#fff4a0', '#d88a1a'], ['#b03aff', '#e0a0ff', '#5a1a8a']]],
    ['луциан', 0.6, 1.0, 0.7, 1.1, 1.0, [4, 9], [4, 20], 2, [['#e83a3a', '#ffb0a0', '#ffd23a'], ['#f2c83a', '#fff0b0', '#3a8ae0'], ['#c84a6a', '#ffb0c8', '#ffffff'], ['#d87a3a', '#ffd0a0', '#3a2a1a'], ['#a8a0a0', '#ffffff', '#ffd23a']]],
    ['рыба-лев', 0.35, 1.0, 0.7, 1.0, 2.6, [1, 1], [3, 18], 1, [['#a8321e', '#ffd8c8', '#ffffff'], ['#5a2a1a', '#e8c8b0', '#f2e8d8'], ['#d8a83a', '#fff0d0', '#3a2010'], ['#3a1a3a', '#c8a8c8', '#ff8a3a'], ['#c83a6a', '#ffd0e0', '#ffffff']]],
    ['мандаринка', 0.09, 0.9, 0.8, 0.9, 1.3, [1, 2], [1, 8], 6, [['#1a6ad8', '#3a9aff', '#ff8a1a'], ['#2ad0a0', '#8affd8', '#ff3a8a'], ['#ff6a1a', '#ffa86a', '#3ad0ff'], ['#8a3ad8', '#c08aff', '#ffd23a'], ['#d8d83a', '#fff08a', '#2a5ad8']]],
    ['кефаль', 0.45, 0.6, 0.65, 1.1, 0.7, [6, 14], [1, 12], 2, [['#6a7a8a', '#eef2f4', '#3a4a5a'], ['#7a8a6a', '#f0f2e8', '#4a5a3a'], ['#5a6a7a', '#f2f6fa', '#2a3a4a'], ['#8a8a9a', '#ffffff', '#5a5a6a'], ['#6a7a7a', '#f0f8f8', '#3a5a5a']]],
    ['апогон', 0.1, 1.2, 0.6, 1.0, 1.2, [6, 16], [2, 14], 2, [['#ff8a6a', '#ffd0c0', '#a83a2a'], ['#f2e8c8', '#ffffff', '#3a3a3a'], ['#ffb03a', '#ffe0a0', '#6a3a1a'], ['#d8d0e8', '#ffffff', '#5a3a8a'], ['#ff6a8a', '#ffc0d0', '#ffffff']]],
];
// the magic kinds: one colouring of ten shapes glows (the author: «магических рыбок»)
const MAGIC = { 'рыба-бабочка': 3, 'рыба-ангел': 4, 'рыба-хирург': 3, 'рыба-попугай': 4, 'хромис': 4, 'мавританский идол': 3, 'рыба-лев': 3, 'мандаринка': 1, 'апогон': 3, 'тунец': 2 };
const ADJ = ['', 'золотистая', 'тёмная', 'лазурная', 'пёстрая'];
const MAGIC_ADJ = ['лунная', 'звёздная', 'призрачная', 'светлячковая'];

/** The hundred kinds: {id, name, arch, len, h, w, tail, dorsal, school, depth, pat, cols: [back, belly, mark] (THREE.Color), glow, magic}. */
export const FISH_SPECIES = (() => {
    const out = [];
    ARCH.forEach((a, ai) => {
        const [name, len, h, w, tail, dorsal, school, depth, pat, cols] = a;
        for (let v = 0; v < 5; v++) {
            const magic = MAGIC[name] === v;
            const altPat = v === 4 && pat !== 1 ? (pat + 3) % 10 : pat; // (one colouring with its own pattern)
            out.push({
                id: out.length, arch: ai,
                name: magic ? `${name} ${MAGIC_ADJ[ai % 4]}` : (ADJ[v] ? `${name} ${ADJ[v]}` : name),
                len: len * (0.9 + 0.05 * v), h, w, tail, dorsal, school, depth, pat: altPat,
                cols: cols[v].map((c) => new THREE.Color(c)), glow: magic ? 1 : 0, magic,
            });
        }
    });
    return out;
})();

// ------------------------------------------------------------------ the one shape
const _geo = { g: null };
/**
 * A fish 1 m long, its nose at −z, its tail at +z. Attributes: aPart (0 body, 1 tail, 2 dorsal, 3 anal, 4 pectorals, 5 eyes),
 * aUV (u: 0 nose … 1 tail; v: −1 belly … 1 back), aBase (where a fin meets the body, y).
 */
export function fishGeometry() {
    if (_geo.g) return _geo.g;
    const pos = [], nrm = [], part = [], uv = [], base = [], idx = [];
    const add = (x, y, z, nx, ny, nz, p, u, v, b) => { pos.push(x, y, z); nrm.push(nx, ny, nz); part.push(p); uv.push(u, v); base.push(b); return pos.length / 3 - 1; };
    // the body: rings of an ellipse, the profile of a fish (the head round, the deepest a third back, the caudal peduncle thin)
    const RINGS = 18, SIDES = 14;
    const H = (t) => (t < 0.32 ? Math.sin(Math.min(1, t / 0.32) * Math.PI / 2) ** 0.7 : 1 - 0.86 * ((t - 0.32) / 0.6) ** 1.2) * 0.16;
    const W = (t) => H(t) * 0.55;
    const Y = (t) => -0.01 * Math.sin(t * Math.PI); // (the belly a little lower than the back)
    for (let r = 0; r <= RINGS; r++) {
        const t = Math.min(0.92, r / RINGS * 0.92);
        const z = -0.5 + t * 1.0 / 0.92 * 0.92;
        for (let s = 0; s < SIDES; s++) {
            const a = (s / SIDES) * Math.PI * 2;
            const ca = Math.cos(a), sa = Math.sin(a);
            const h = Math.max(0.004, H(t)), w = Math.max(0.003, W(t));
            add(sa * w, Y(t) + ca * h, z, sa / w, ca / h, 0, 0, t, ca, 0);
        }
    }
    for (let r = 0; r < RINGS; r++) for (let s = 0; s < SIDES; s++) {
        const a = r * SIDES + s, b = r * SIDES + (s + 1) % SIDES, c = a + SIDES, d = b + SIDES;
        idx.push(a, b, c, b, d, c);
    }
    // the nose cap
    const nose = add(0, Y(0), -0.505, 0, 0, -1, 0, 0, 0, 0);
    for (let s = 0; s < SIDES; s++) idx.push(nose, (s + 1) % SIDES, s);
    const tz = -0.5 + 0.92; // the root of the tail
    // a fin: a fan of triangles from its root line, its own colours (part p), both sides (double-sided material)
    const fin = (p, pts) => { const i0 = pos.length / 3; for (const q of pts) add(q[0], q[1], q[2], q[3] ?? 1, 0, 0, p, q[4], q[5] ?? 0, q[6] ?? 0); for (let k = 1; k + 1 < pts.length; k++) idx.push(i0, i0 + k, i0 + k + 1); };
    // the tail: forked (a shape set by the kind's tail factor in the shader)
    fin(1, [[0, 0, tz - 0.02, 1, 0.92, 0], [0, 0.02, tz + 0.02, 1, 0.94, 0.3], [0, 0.16, tz + 0.2, 1, 1, 1], [0, 0.06, tz + 0.13, 1, 0.98, 0.4], [0, 0, tz + 0.1, 1, 0.97, 0], [0, -0.06, tz + 0.13, 1, 0.98, -0.4], [0, -0.16, tz + 0.2, 1, 1, -1], [0, -0.02, tz + 0.02, 1, 0.94, -0.3]]);
    // the dorsal fin: along the back from a quarter to three quarters
    const back = (t) => Y(t) + H(t);
    const dor = [];
    for (let k = 0; k <= 8; k++) { const t = 0.22 + k / 8 * 0.52; dor.push([0, back(t) - 0.005, -0.5 + t, 1, t, 0.9, back(t)]); }
    const dtop = [];
    for (let k = 8; k >= 0; k--) { const t = 0.22 + k / 8 * 0.52; dtop.push([0, back(t) + 0.06 + 0.035 * Math.sin(k / 8 * Math.PI) + (k % 2 ? 0.012 : 0), -0.5 + t + 0.04, 1, t, 1.5, back(t)]); }
    // (a strip of quads: the root and the top)
    { const i0 = pos.length / 3; for (const q of dor) add(q[0], q[1], q[2], 1, 0, 0, 2, q[4], q[5], q[6]); for (const q of dtop) add(q[0], q[1], q[2], 1, 0, 0, 2, q[4], q[5], q[6]); const n = dor.length; for (let k = 0; k < n - 1; k++) { const a = i0 + k, b = i0 + k + 1, c = i0 + 2 * n - 1 - k, d = i0 + 2 * n - 2 - k; idx.push(a, b, c, b, d, c); } }
    // the anal fin: under, behind the middle
    const belly = (t) => Y(t) - H(t);
    { const i0 = pos.length / 3; const n = 6; for (let k = 0; k < n; k++) { const t = 0.55 + k / (n - 1) * 0.25; add(0, belly(t) + 0.005, -0.5 + t, 1, 0, 0, 3, t, -0.9, belly(t)); } for (let k = n - 1; k >= 0; k--) { const t = 0.55 + k / (n - 1) * 0.25; add(0, belly(t) - 0.045 * Math.sin((k + 0.5) / n * Math.PI), -0.5 + t + 0.03, 1, 0, 0, 3, t, -1.5, belly(t)); } for (let k = 0; k < n - 1; k++) { const a = i0 + k, b = i0 + k + 1, c = i0 + 2 * n - 1 - k, d = i0 + 2 * n - 2 - k; idx.push(a, b, c, b, d, c); } }
    // the pectorals: two small fins behind the gills
    for (const sx of [-1, 1]) fin(4, [[sx * W(0.2) * 0.9, Y(0.2) - 0.02, -0.5 + 0.2, 0, 0.2, -0.2, 0], [sx * (W(0.2) + 0.06), Y(0.2) - 0.05, -0.5 + 0.3, 0, 0.3, -0.4, 0], [sx * (W(0.2) + 0.05), Y(0.2) + 0.01, -0.5 + 0.32, 0, 0.32, 0, 0]]);
    // the eyes: small discs on each side, a little forward and up
    for (const sx of [-1, 1]) {
        const t = 0.1, cy = Y(t) + H(t) * 0.25, cx = sx * W(t) * 0.98, cz = -0.5 + t;
        const i0 = add(cx + sx * 0.003, cy, cz, sx, 0, 0, 5, 0, 0, 0);
        const R = 0.022, N = 10;
        for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2; add(cx, cy + Math.cos(a) * R, cz + Math.sin(a) * R, sx, 0, 0, 5, 1, 0, 0); }
        for (let k = 0; k < N; k++) idx.push(i0, i0 + 1 + k, i0 + 1 + (k + 1) % N);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
    g.setAttribute('aUV', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.userData.shared = true;
    return (_geo.g = g);
}

const VS = `
uniform float uTime;
attribute float aPart; attribute vec2 aUV; attribute float aBase;
attribute vec4 aShape;   // height ×, width ×, tail ×, dorsal ×
attribute vec4 aSwim;    // phase, beat speed, length (m), the turn's bend
attribute vec3 aCol1; attribute vec3 aCol2; attribute vec3 aCol3;
attribute vec4 aPat;     // pattern, its frequency, glow, a seed
attribute vec4 aWorld;   // x, y, z, yaw
attribute float aPitch;
varying vec2 vUV; varying float vPart; varying vec3 vC1; varying vec3 vC2; varying vec3 vC3; varying vec4 vPat; varying vec3 vN; varying vec3 vView;
void main(){
  vec3 p = position;
  vec3 n = normal;
  float H = aShape.x, Wd = aShape.y;
  if (aPart < 0.5) { p.y *= H; p.x *= Wd; n = normalize(vec3(n.x / Wd, n.y / H, n.z)); }
  else if (aPart < 1.5) { float tz = 0.42; p.y *= aShape.z * (0.65 + 0.35 * H); p.z = tz + (p.z - tz) * (0.8 + 0.4 * aShape.z); }
  else if (aPart < 2.5) { p.y = aBase * H + (p.y - aBase) * aShape.w * (0.7 + 0.3 * H); }
  else if (aPart < 3.5) { p.y = aBase * H + (p.y - aBase) * (0.6 + 0.6 * aShape.w) * (0.7 + 0.3 * H); }
  else if (aPart < 4.5) { p.x *= Wd; p.y *= H; p.x += sign(p.x) * sin(uTime * 6.0 + aSwim.x) * 0.02; }
  else { p.y *= H; p.x *= Wd; }
  // the swimming: a wave down the body to the tail, stronger at the back; the turn bends it
  float back = smoothstep(-0.25, 0.45, p.z);
  float wave = sin(uTime * aSwim.y + aSwim.x - p.z * 7.0);
  p.x += (wave * 0.07 * back + aSwim.w * (p.z + 0.5) * (p.z + 0.5) * 0.25);
  p *= aSwim.z;
  // placed in the world: pitched, then turned
  float cp = cos(aPitch), sp = sin(aPitch);
  p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  n = vec3(n.x, n.y * cp - n.z * sp, n.y * sp + n.z * cp);
  float cy = cos(aWorld.w), sy = sin(aWorld.w);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  n = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
  vec4 wp = vec4(p + aWorld.xyz, 1.0);
  vec4 mv = viewMatrix * wp;
  vView = -mv.xyz; vN = normalize(mat3(viewMatrix) * n);
  vUV = aUV; vPart = aPart; vC1 = aCol1; vC2 = aCol2; vC3 = aCol3; vPat = aPat;
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform float uTime; uniform vec3 uLight; uniform vec3 uAmb; uniform vec3 uSunDir; uniform float uNight;
uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
varying vec2 vUV; varying float vPart; varying vec3 vC1; varying vec3 vC2; varying vec3 vC3; varying vec4 vPat; varying vec3 vN; varying vec3 vView;
float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float u = vUV.x, v = vUV.y;
  float pat = floor(vPat.x + 0.5), fq = vPat.y, seed = vPat.w;
  // counter-shading: the back dark, the belly pale
  vec3 col = mix(vC2, vC1, smoothstep(-0.55, 0.45, v));
  float mark = 0.0;
  if (pat == 1.0) { float b = abs(fract(u * fq + 0.15) - 0.5); mark = smoothstep(0.14, 0.1, b); col = mix(col, vec3(0.05), smoothstep(0.17, 0.14, b) * (1.0 - mark) * 0.8); }
  else if (pat == 2.0) { mark = smoothstep(0.08, 0.04, abs(fract(v * fq * 0.5 + 0.2) - 0.5)) * step(0.12, u); }
  else if (pat == 3.0) { vec2 c = vec2(u * fq * 2.2, v * fq * 0.8); vec2 f = fract(c) - 0.5; float r = 0.18 + 0.12 * h1(floor(c) + seed); mark = smoothstep(r, r - 0.06, length(f)); }
  else if (pat == 4.0) { vec2 e = vec2((u - 0.74) * 3.0, v - 0.35); float d = length(e); mark = smoothstep(0.24, 0.2, d); col = mix(col, vec3(1.0), smoothstep(0.3, 0.26, d) * (1.0 - mark)); }
  else if (pat == 5.0) { mark = step(0.0, v - (u - 0.5) * 2.2); }
  else if (pat == 6.0) { float m = sin(u * fq * 9.0 + sin(v * 7.0 + seed) * 2.5) * sin(v * fq * 3.0 + sin(u * 11.0) * 2.0); mark = smoothstep(0.25, 0.4, abs(m)); }
  else if (pat == 7.0) { vec2 c = vec2(u * 28.0, v * 9.0 + 0.5 * floor(u * 28.0)); vec2 f = fract(c); mark = 0.35 * smoothstep(0.35, 0.05, f.y) * smoothstep(0.0, 0.3, f.x); }
  else if (pat == 8.0) { mark = smoothstep(0.25, 0.4, v) * smoothstep(0.12, 0.05, abs(fract(u * fq * 0.7) - 0.5)); }
  else if (pat == 9.0) { mark = smoothstep(0.55, 0.9, u); }
  col = mix(col, vC3, clamp(mark, 0.0, 1.0));
  // the fins: thin, a touch see-through-looking (lighter, the mark colour at the edge), the rays
  if (vPart > 0.5 && vPart < 4.5) { float edge = vPart < 1.5 ? smoothstep(0.98, 1.0, u) : smoothstep(1.1, 1.5, abs(v)); col = mix(mix(col, vC1, 0.35), vC3, edge * 0.7); col *= 0.85 + 0.15 * sin((vPart < 1.5 ? v : u) * 60.0); }
  // the eye: dark, a bright ring
  if (vPart > 4.5) col = mix(vec3(0.02), vec3(0.95, 0.85, 0.4), smoothstep(0.55, 0.9, u));
  // the light: the sun through the water from above, the water's own all round, the shine of wet scales
  vec3 N = normalize(vN), V = normalize(vView);
  float lit = 0.55 + 0.45 * max(0.0, dot(N, normalize(mat3(viewMatrix) * uSunDir)));
  float spec = pow(max(0.0, dot(reflect(-normalize(mat3(viewMatrix) * uSunDir), N), V)), 24.0) * 0.35 * (1.0 - uNight);
  vec3 c = col * (uAmb + uLight * lit) + spec;
  // the magic ones glow: their pattern lights the dark water, breathing
  float glow = vPat.z * (0.55 + 0.45 * sin(uTime * 2.0 + seed * 6.0)) * (0.6 + 1.2 * uNight);
  c += (vC3 * 0.9 + vC1 * 0.3) * glow * (0.35 + 0.65 * clamp(mark, 0.0, 1.0));
  // the haze of the water
  float d = length(vView);
  c = mix(c, fogColor, smoothstep(fogNear, fogFar, d));
  gl_FragColor = vec4(c, 1.0);
}`;

const _col = new THREE.Color();

export class ReefFish {
    constructor(game) {
        this.game = game;
        this.t = 0;
        this.schools = [];
        const N = REEF.MAX;
        const g = fishGeometry().clone();
        g.instanceCount = 0;
        const attr = (name, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(N * k), k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
        this.A = { shape: attr('aShape', 4), swim: attr('aSwim', 4), c1: attr('aCol1', 3), c2: attr('aCol2', 3), c3: attr('aCol3', 3), pat: attr('aPat', 4), world: attr('aWorld', 4), pitch: attr('aPitch', 1) };
        this.U = { uTime: { value: 0 }, uLight: { value: new THREE.Color(0.9, 0.95, 0.95) }, uAmb: { value: new THREE.Color(0.35, 0.45, 0.5) }, uSunDir: { value: new THREE.Vector3(0.3, 1, 0.2).normalize() }, uNight: { value: 0 }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } };
        this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide }));
        this.mesh.frustumCulled = false;
        this.mesh.name = 'reefFish';
        game.scene?.add(this.mesh);
    }

    /** How many fish are drawn now. */
    get count() { return this.mesh.geometry.instanceCount; }

    sample() { const m = new THREE.Mesh(this.mesh.geometry, this.mesh.material); m.frustumCulled = false; return m; }

    /** A kind for a new school at depth `depth` m (weighted to the reef's small fish; the big ones rarer; the magic rare). */
    _kind(depth, deep) {
        for (let tries = 0; tries < 12; tries++) {
            const s = FISH_SPECIES[(Math.random() * FISH_SPECIES.length) | 0];
            if (depth < s.depth[0] - 1 || (s.depth[1] < 10 && deep > s.depth[1] + 4)) continue;
            if (s.magic && Math.random() > 0.35) continue;
            if (s.len > 0.8 && Math.random() > 0.5) continue;
            return s;
        }
        return FISH_SPECIES[40]; // (a sardine)
    }

    /**
     * The schools near `me`: kept round him in the water (a school too far — a new one somewhere else), wandering, darting off from a
     * person near; their fish written into the instances. `waterAt(x, z, y)` → {surface, bottom, depth} | null (the sea's).
     */
    update(dt, me, waterAt, day = 1, night = 0) {
        this.t += dt;
        const U = this.U;
        U.uTime.value = this.t;
        U.uNight.value = night;
        const fog = this.game.scene?.fog;
        if (fog) { U.fogColor.value.copy(fog.color); U.fogNear.value = fog.near; U.fogFar.value = fog.far; }
        U.uLight.value.setRGB(0.95, 0.98, 0.95).multiplyScalar(0.25 + 0.85 * day);
        U.uAmb.value.setRGB(0.3, 0.42, 0.5).multiplyScalar(0.3 + 0.7 * day);
        const sd = this.game.world?.sky?.uniforms?.uSunDir?.value;
        if (sd) U.uSunDir.value.copy(sd);
        let budget = 0;
        for (let k = 0; k < REEF.SCHOOLS; k++) {
            let S = this.schools[k];
            if (!S || Math.hypot(S.x - me.x, S.z - me.z) > REEF.R * 1.6) {
                const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * (REEF.R - 10);
                const x = me.x + Math.cos(a) * d, z = me.z + Math.sin(a) * d;
                const w = waterAt(x, z, null);
                if (!w || w.depth < 2) { this.schools[k] = null; continue; }
                const sp = this._kind(Math.max(0, w.surface - me.y), w.depth);
                const n = sp.school[0] + Math.floor(Math.random() * (sp.school[1] - sp.school[0] + 1));
                const lo = Math.max(w.bottom + 0.6, w.surface - sp.depth[1]), hi = Math.min(w.surface - 0.8, w.surface - sp.depth[0]);
                const y = hi > lo ? lo + Math.random() * (hi - lo) : w.bottom + 0.8 + Math.random() * Math.max(0.2, w.depth - 2);
                S = this.schools[k] = { sp, n, x, z, y, lo: w.bottom + 0.35, hi: w.surface - 0.35, yaw: Math.random() * 6.28, tx: x, tz: z, fast: 0, seed: Math.random() * 100, bend: 0, near: sp.len > 0.7 || sp.school[1] <= 2 ? 0 : 1 };
            }
            if (budget + S.n > REEF.MAX) S.n = Math.max(0, REEF.MAX - budget);
            budget += S.n;
            // wander; flee a person near
            const dm = Math.hypot(S.x - me.x, S.z - me.z, S.y - me.y);
            if (dm < REEF.NEAR + S.sp.len * 4) { S.fast = 1; const l = Math.hypot(S.x - me.x, S.z - me.z) || 1; S.tx = S.x + (S.x - me.x) / l * 18; S.tz = S.z + (S.z - me.z) / l * 18; }
            else if (Math.hypot(S.tx - S.x, S.tz - S.z) < 2.5) { const a = Math.random() * 6.28, r = 8 + 14 * Math.min(1, S.sp.len); S.tx = S.x + Math.cos(a) * r; S.tz = S.z + Math.sin(a) * r; }
            S.fast = Math.max(0, S.fast - dt * 0.35);
            const want = Math.atan2(-(S.tx - S.x), -(S.tz - S.z));
            let dy = want - S.yaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283;
            const turn = Math.max(-dt * 1.4, Math.min(dt * 1.4, dy)) * (1 + S.fast * 2);
            S.yaw += turn;
            S.bend += ((turn / Math.max(dt, 1e-3)) * 0.25 - S.bend) * Math.min(1, dt * 4);
            const speed = (0.6 + 1.6 * Math.min(1, S.sp.len)) * (1 + S.fast * 3);
            const nx = S.x - Math.sin(S.yaw) * speed * dt, nz = S.z - Math.cos(S.yaw) * speed * dt;
            const w = waterAt(nx, nz, S.y);
            if (w && w.depth >= 2) { S.lo = w.bottom + 0.35; S.hi = w.surface - 0.35; S.x = nx; S.z = nz; S.y = Math.max(w.bottom + 0.5 + S.sp.len * 0.3, Math.min(w.surface - 0.6, S.y + Math.sin(this.t * 0.3 + S.seed) * 0.15 * dt)); }
            else { S.yaw += 1.4; S.tx = S.x - (nx - S.x) * 10; S.tz = S.z - (nz - S.z) * 10; }
        }
        // the fish of each school round its centre (a tight shoal, a loose pair, a lone big one), each a little its own way
        const A = this.A;
        let n = 0;
        for (let k = 0; k < REEF.SCHOOLS; k++) {
            const S = this.schools[k];
            if (!S) continue;
            const sp = S.sp, L = sp.len;
            const spread = (0.6 + Math.sqrt(S.n) * L * 1.6) * (1 + S.fast * 0.8);
            const c = Math.cos(S.yaw), s = Math.sin(S.yaw);
            for (let i = 0; i < S.n && n < REEF.MAX; i++) {
                const a = i * 2.399 + S.seed, r = spread * Math.sqrt((i + 0.5) / S.n);
                const ox = Math.cos(a + this.t * 0.2) * r, oz = Math.sin(a + this.t * 0.2) * r * 1.6, oy = Math.sin(a * 1.7 + this.t * 0.7) * spread * 0.3;
                const k2 = 0.85 + ((i * 7) % 5) * 0.07;
                A.world.setXYZW(n, S.x + ox * c + oz * s, Math.max(S.lo, Math.min(S.hi, S.y + oy)), S.z - ox * s + oz * c, S.yaw + Math.sin(this.t * 1.1 + i) * 0.12);
                A.pitch.setX(n, Math.sin(this.t * 0.9 + i * 1.3) * 0.08);
                A.shape.setXYZW(n, sp.h, sp.w, sp.tail, sp.dorsal);
                A.swim.setXYZW(n, a * 3.1, (8 + 10 / Math.max(0.3, L)) * (1 + S.fast), L * k2, Math.max(-1.5, Math.min(1.5, S.bend)));
                _col.copy(sp.cols[0]); A.c1.setXYZ(n, _col.r, _col.g, _col.b);
                _col.copy(sp.cols[1]); A.c2.setXYZ(n, _col.r, _col.g, _col.b);
                _col.copy(sp.cols[2]); A.c3.setXYZ(n, _col.r, _col.g, _col.b);
                A.pat.setXYZW(n, sp.pat, sp.pat === 1 ? 3 + (sp.id % 3) : 4 + (sp.id % 5), sp.glow, sp.id * 0.37);
                n++;
            }
        }
        this.mesh.geometry.instanceCount = n;
        for (const a of Object.values(A)) { a.needsUpdate = true; a.clearUpdateRanges?.(); a.addUpdateRange?.(0, n * a.itemSize); }
    }

    /** Positions of the drawn fish (tests). */
    positions() { const out = [], W = this.A.world; for (let i = 0; i < this.count; i++) out.push(new THREE.Vector3(W.getX(i), W.getY(i), W.getZ(i))); return out; }

    dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.material.dispose(); }
}
