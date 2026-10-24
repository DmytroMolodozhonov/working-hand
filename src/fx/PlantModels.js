/**
 * PlantModels.js — the look of the plant creatures (PlantLife.js rules, Plants.js system) and of what they leave.
 *
 *   Телевильпин   a tall flower on a thorny, bending stem: dark-green serrated leaves edged red, a bloom of three rings of
 *                 curled petals (deep crimson at the heart → scarlet → hot orange at the rims, glowing), long hot stamens,
 *                 recurved green sepals. NOT a rose: the petals are narrow and pointed, the stem is armed with 30+ thorns.
 *   Плотоядная голова  a ribbed, blotched stem on gnarled roots; on top a trap of two clamshell lobes (green outside with
 *                 dark veins, wet crimson inside with pale veins and drops, a yellow lip, interlocking teeth, trigger hairs);
 *                 thin tendrils (vines) lashing from the stem — those are animated by the CPU each frame (VineSet), one draw.
 *   Items         «Листок телевильпина» (a red glowing leaf with a serrated edge and a bright midrib), «Головка плотоядной»
 *                 (a torn-off trap: two lobes, a cut stalk).
 * Everything is built once from shared shapes: a group merges its members into 2 shapes; sway is done by the video card
 * (a vertex shader with one shared clock), glow is a soft additive sprite (no light sources: the number of lights stays).
 */
import * as THREE from 'three';

// ------------------------------------------------------------------ small tools
export const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const hexRGB = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const lerpC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3();

/** Geometry assembled from tubes, surfaces and cones: position + colour (+ sway weight); normals computed at the end. */
class Builder {
    constructor() { this.p = []; this.c = []; this.s = []; this.i = []; }
    get n() { return this.p.length / 3; }
    vert(x, y, z, c, sw = 0) { this.p.push(x, y, z); this.c.push(c[0], c[1], c[2]); this.s.push(sw); return this.n - 1; }
    tri(a, b, c) { this.i.push(a, b, c); }
    /** A tube along `pts` (Vector3[]), radius r(t), colour col(t, around 0…1) → [r, g, b]; `ridge(t, around)` modulates the radius. */
    tube(pts, r, col, radial = 6, { ridge = null, swayH = 0, cap = true } = {}) {
        const n = pts.length, base = this.n;
        let prev = null;
        for (let k = 0; k < n; k++) {
            const t = k / (n - 1);
            const T = _w.copy(pts[Math.min(n - 1, k + 1)]).sub(pts[Math.max(0, k - 1)]).normalize();
            if (!prev) { const a = Math.abs(T.y) > 0.9 ? _v.set(1, 0, 0) : _v.set(0, 1, 0); prev = new THREE.Vector3().crossVectors(a, T).normalize(); }
            else { prev.addScaledVector(T, -prev.dot(T)).normalize(); }
            _n.copy(prev); _b.crossVectors(T, _n);
            for (let j = 0; j < radial; j++) {
                const a = j / radial, ang = a * Math.PI * 2;
                const rr = r(t) * (ridge ? ridge(t, a) : 1);
                const x = pts[k].x + (Math.cos(ang) * _n.x + Math.sin(ang) * _b.x) * rr;
                const y = pts[k].y + (Math.cos(ang) * _n.y + Math.sin(ang) * _b.y) * rr;
                const z = pts[k].z + (Math.cos(ang) * _n.z + Math.sin(ang) * _b.z) * rr;
                this.vert(x, y, z, col(t, a), swayH ? clamp01(y / swayH) ** 1.7 : 0);
            }
        }
        for (let k = 0; k < n - 1; k++) for (let j = 0; j < radial; j++) {
            const a = base + k * radial + j, b = base + k * radial + (j + 1) % radial, c = a + radial, d = b + radial;
            this.tri(a, c, b); this.tri(b, c, d);
        }
        if (cap) { const e = this.vert(pts[n - 1].x, pts[n - 1].y, pts[n - 1].z, col(1, 0), swayH ? clamp01(pts[n - 1].y / swayH) ** 1.7 : 0); for (let j = 0; j < radial; j++) this.tri(base + (n - 1) * radial + j, base + (n - 1) * radial + (j + 1) % radial, e); }
    }
    /** A surface grid (nu × nv points) from f(u, v) → {p:[x,y,z], c:[r,g,b]}; `flip` reverses the faces. */
    grid(nu, nv, f, { flip = false, swayH = 0 } = {}) {
        const base = this.n;
        for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) {
            const q = f(a / nu, b / nv);
            this.vert(q.p[0], q.p[1], q.p[2], q.c, swayH ? clamp01(q.p[1] / swayH) ** 1.7 : 0);
        }
        for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) {
            const i0 = base + a * (nv + 1) + b, i1 = i0 + 1, i2 = i0 + nv + 1, i3 = i2 + 1;
            if (flip) { this.tri(i0, i1, i2); this.tri(i1, i3, i2); } else { this.tri(i0, i2, i1); this.tri(i1, i2, i3); }
        }
    }
    /** A thorn / tooth: a cone from `at` along `dir`, base colour → tip colour. */
    cone(at, dir, len, r0, c0, c1, seg = 4, sw = 0) {
        const base = this.n;
        _n.set(0, 1, 0); if (Math.abs(dir.y) > 0.9) _n.set(1, 0, 0);
        const u = new THREE.Vector3().crossVectors(dir, _n).normalize(), w = new THREE.Vector3().crossVectors(dir, u).normalize();
        for (let j = 0; j < seg; j++) {
            const a = j / seg * Math.PI * 2;
            this.vert(at.x + (Math.cos(a) * u.x + Math.sin(a) * w.x) * r0, at.y + (Math.cos(a) * u.y + Math.sin(a) * w.y) * r0, at.z + (Math.cos(a) * u.z + Math.sin(a) * w.z) * r0, c0, sw);
        }
        const tip = this.vert(at.x + dir.x * len, at.y + dir.y * len, at.z + dir.z * len, c1, sw);
        for (let j = 0; j < seg; j++) this.tri(base + j, tip, base + (j + 1) % seg);
    }
    /** Another builder's content placed by a matrix. */
    add(o, m) {
        const base = this.n;
        for (let k = 0; k < o.p.length; k += 3) { _v.set(o.p[k], o.p[k + 1], o.p[k + 2]).applyMatrix4(m); this.p.push(_v.x, _v.y, _v.z); }
        this.c.push(...o.c); this.s.push(...o.s);
        for (const i of o.i) this.i.push(i + base);
    }
    geometry(swayH = 0) {
        if (swayH) { this.s = []; for (let k = 1; k < this.p.length; k += 3) this.s.push(clamp01(this.p[k] / swayH) ** 1.7); } // (every vertex sways by its height)
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
        g.setAttribute('sway', new THREE.Float32BufferAttribute(this.s, 1));
        g.setIndex(this.i);
        g.computeVertexNormals();
        g.userData.keep = true;
        return g;
    }
}

// ------------------------------------------------------------------ shared clock + materials
/** One clock for the swaying of every plant (Plants.update sets it). */
export const PLANT_CLOCK = { t: { value: 0 }, wind: { value: 1 }, glow: { value: 1 } };

/** Gives a material the sway of a plant: the video card bends each vertex by its `sway` weight (a stem bends more at the top). */
function swayify(mat, amp = 0.16) {
    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uPT = PLANT_CLOCK.t;
        sh.vertexShader = 'uniform float uPT;\nattribute float sway;\n' + sh.vertexShader.replace('#include <begin_vertex>',
            `#include <begin_vertex>
            float ph = position.x * 0.31 + position.z * 0.47;
            transformed.x += sway * ${amp.toFixed(3)} * sin(uPT * 1.3 + ph) * 3.0 + sway * 0.05 * sin(uPT * 3.1 + ph * 2.0);
            transformed.z += sway * ${amp.toFixed(3)} * cos(uPT * 1.1 + ph * 1.3) * 3.0;`);
    };
    mat.customProgramCacheKey = () => 'plantSway' + amp;
    return mat;
}

/** The glow is the surface's own colour (the petal's gradient keeps showing at night): emissive × vertex colour. */
function glowByColour(mat) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
        prev?.(sh, r);
        sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor;');
    };
    const key = mat.customProgramCacheKey;
    mat.customProgramCacheKey = () => (key ? key.call(mat) : '') + 'glowCol';
    return mat;
}

let _mats = null;
export function plantMaterials() {
    if (_mats) return _mats;
    _mats = {
        stem: swayify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide }), 0.05),
        petal: glowByColour(swayify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.9 }), 0.05)),
        head: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide }),
        headStem: swayify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide }), 0.0),
        vine: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
        glow: new THREE.PointsMaterial({ map: glowTexture(), color: 0xff3a1c, size: 3.4, sizeAttenuation: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
        item: glowByColour(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.7 })),
        itemHead: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide }),
    };
    return _mats;
}
let _glowTex = null;
function glowTexture() {
    if (_glowTex) return _glowTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    _glowTex = new THREE.CanvasTexture(c);
    _glowTex.colorSpace = THREE.SRGBColorSpace;
    return _glowTex;
}

// ================================================================== TELEWILPIN
const PET = { base: hexRGB(0x5a0612), mid: hexRGB(0xd0121f), rim: hexRGB(0xff5a1a), tip: hexRGB(0xffb040) };
const LEAF = { base: hexRGB(0x1d3a1c), mid: hexRGB(0x2f6a28), edge: hexRGB(0x9a1a1a) };

/** One petal: a narrow pointed blade that cups and curls out at the tip; `len`, `wid` in m, `cup` depth. Placed by the caller. */
function petalInto(B, len, wid, cup, curl, rnd) {
    const nu = 7, nv = 4, flutter = rnd() * 6;
    B.grid(nu, nv, (u, v) => {
        const s = v * 2 - 1;
        const w = wid * Math.pow(Math.sin(Math.PI * (0.1 + 0.8 * Math.pow(u, 0.8))), 0.85) * (1 - 0.1 * u);
        const x = s * w;
        const y = len * u;
        // cup: a bowl across, then the tip curls outward (-z), with a little ripple on the rim
        const z = -cup * (1 - s * s) * (1 - u) * 1.0 + curl * u * u * len + Math.sin(u * 9 + flutter) * 0.012 * Math.abs(s);
        const k = clamp01(u * 1.15), e = Math.abs(s);
        let c = k < 0.45 ? lerpC(PET.base, PET.mid, k / 0.45) : k < 0.85 ? lerpC(PET.mid, PET.rim, (k - 0.45) / 0.4) : lerpC(PET.rim, PET.tip, (k - 0.85) / 0.15);
        c = lerpC(c, PET.tip, e * e * u * 0.35); // (the rims burn brighter)
        const vein = 0.93 + 0.07 * Math.cos(s * 9); // (fine veins along the petal)
        return { p: [x, y, z], c: [c[0] * vein, c[1] * vein, c[2] * vein] };
    }, { swayH: 0 });
}

function leafInto(B, len, wid, droop, rnd) {
    const nu = 8, nv = 4, tooth = 0.07 + rnd() * 0.03;
    B.grid(nu, nv, (u, v) => {
        const s = v * 2 - 1;
        const jag = 1 + tooth * ((Math.round(u * 16) % 2) ? 1 : -1) * (Math.abs(s) > 0.5 ? 1 : 0.3); // (serrated)
        const w = wid * Math.sin(Math.PI * (0.06 + 0.9 * u)) * jag;
        const x = s * w, y = len * u;
        const z = -droop * u * u * len - Math.abs(s) * w * 0.35 + Math.abs(s) * 0.0;
        const rim = Math.abs(s) ** 2;
        let c = lerpC(LEAF.base, LEAF.mid, u * 0.8 + 0.1);
        c = lerpC(c, LEAF.edge, rim * 0.55);
        if (Math.abs(s) < 0.1) c = lerpC(c, hexRGB(0xc8e6a0), 0.3); // (the midrib)
        return { p: [x, y, z], c };
    });
}

/**
 * One telewilpin in its own space: the stem grows up the +y axis from the origin to ~`H` m. Returns {stem, petals, top, H}:
 * `stem` (stem + thorns + leaves + sepals, material `stem`) and `petals` (the bloom and stamens, glowing material `petal`).
 */
export function buildTelewilpin(seed = 1, H = 5.4) {
    const rnd = rng(seed * 7919 + 13);
    const stem = new Builder(), bloom = new Builder();
    // the stem: 9 points, a lazy S and a nod at the top
    const lean = rnd() * Math.PI * 2, amp = 0.35 + rnd() * 0.5, pts = [];
    for (let k = 0; k <= 9; k++) {
        const t = k / 9;
        pts.push(new THREE.Vector3(Math.sin(t * 3.1 + lean) * amp * t + Math.cos(lean) * t * t * 0.5, t * H, Math.cos(t * 2.4 + lean * 1.7) * amp * 0.7 * t + Math.sin(lean) * t * t * 0.5));
    }
    const curve = new THREE.CatmullRomCurve3(pts), spine = curve.getPoints(28);
    const SB = hexRGB(0x24401c), ST = hexRGB(0x3f6b2a), SR = hexRGB(0x7a1c1a);
    stem.tube(spine, (t) => 0.18 - 0.08 * t + (t < 0.06 ? (0.06 - t) * 1.2 : 0), (t, a) => { const c = lerpC(lerpC(SB, ST, t), SR, 0.18 + 0.15 * Math.sin(a * 12 + t * 8)); return c; }, 6, { swayH: H });
    // roots flaring at the foot
    for (let r = 0; r < 4; r++) {
        const a = r / 4 * Math.PI * 2 + rnd(), rp = [new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3), new THREE.Vector3(Math.cos(a) * 0.62, -0.05, Math.sin(a) * 0.62)];
        stem.tube(rp, (t) => 0.07 * (1 - t) + 0.02, () => SB, 5);
    }
    // thorns: pairs up the whole stem, pointing out and down, red-tipped, bigger low
    const at = new THREE.Vector3(), dir = new THREE.Vector3();
    for (let k = 0; k < 36; k++) {
        const t = 0.04 + 0.9 * (k / 36), q = curve.getPoint(t);
        const a = k * 2.399 + rnd();
        dir.set(Math.cos(a), 0.35 - 0.2 * rnd(), Math.sin(a)).normalize();
        at.copy(q).addScaledVector(dir, 0.07);
        const sz = 0.2 - 0.07 * t + rnd() * 0.05;
        stem.cone(at, dir, sz, 0.035, hexRGB(0x5a1a14), hexRGB(0xd01e1e), 4, clamp01(at.y / H) ** 1.7);
    }
    // leaves: 4, low on the stem, drooping, serrated, red-edged
    for (let l = 0; l < 4; l++) {
        const t = 0.1 + l * 0.14 + rnd() * 0.03, q = curve.getPoint(t), a = l * 1.9 + rnd();
        const lf = new Builder();
        leafInto(lf, 1.05 - 0.1 * l + rnd() * 0.2, 0.2 + rnd() * 0.05, 0.5 + rnd() * 0.3, rnd);
        const m = new THREE.Matrix4().compose(q, new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.0 - rnd() * 0.3, a, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
        stem.add(lf, m);
    }
    // the bloom sits on the top of the stem, nodding a little
    const top = spine[spine.length - 1].clone(), tilt = 0.1 + rnd() * 0.25, yawB = rnd() * 6.28;
    const place = (b, ringTilt, yaw, scaleY = 1) => new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromEuler(new THREE.Euler(ringTilt, yaw, 0, 'YXZ')), new THREE.Vector3(1, scaleY, 1));
    const lean2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yawB, 0, 'YXZ'));
    const layers = [
        { n: 9, len: 1.3, wid: 0.3, cup: 0.2, curl: 0.34, rise: 1.0, ph: 0 },
        { n: 8, len: 1.1, wid: 0.3, cup: 0.22, curl: 0.2, rise: 0.66, ph: 0.4 },
        { n: 7, len: 0.9, wid: 0.28, cup: 0.22, curl: 0.06, rise: 0.36, ph: 0.15 },
        { n: 5, len: 0.65, wid: 0.22, cup: 0.2, curl: 0, rise: 0.12, ph: 0.6 },
    ];
    for (const L of layers) for (let p = 0; p < L.n; p++) {
        const pb = new Builder();
        petalInto(pb, L.len * (0.92 + rnd() * 0.16), L.wid * (0.9 + rnd() * 0.2), L.cup, L.curl, rnd);
        const yaw = p / L.n * Math.PI * 2 + L.ph + rnd() * 0.15;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(L.rise, yaw, 0, 'YXZ'));
        // petals open from the top of the stem: tilted out by `rise`, the bloom as a whole nodding
        const m = new THREE.Matrix4().compose(top, lean2.clone().multiply(q), new THREE.Vector3(1, 1, 1));
        bloom.add(pb, m);
    }
    // a hot heart: long thin stamens with bright beads
    for (let s = 0; s < 11; s++) {
        const a = s / 11 * 6.28 + rnd(), r0 = 0.03 + rnd() * 0.07;
        const sp = [0, 1, 2, 3, 4].map((k) => { const t = k / 4; return new THREE.Vector3(Math.cos(a) * (r0 + t * 0.2), 0.05 + t * (0.5 + rnd() * 0.12), Math.sin(a) * (r0 + t * 0.2)).applyQuaternion(lean2).add(top); });
        bloom.tube(sp, (t) => 0.02 * (1 - t) + 0.008, (t) => lerpC(hexRGB(0xff7a20), hexRGB(0xffe070), t), 4);
        bloom.cone(sp[4], _w.set(0, 1, 0).applyQuaternion(lean2).clone(), 0.05, 0.03, hexRGB(0xffd060), hexRGB(0xffffff), 5);
    }
    // sepals: five long green spikes curling down under the bloom
    for (let s = 0; s < 5; s++) {
        const pb = new Builder();
        petalInto(pb, 0.55, 0.08, 0.02, -0.25, rnd);
        // recolour green with red tip
        for (let k = 0; k < pb.c.length; k += 3) { const t = pb.p[k + 1] / 0.55; const c = lerpC(hexRGB(0x2f5a22), hexRGB(0x8a1a16), clamp01(t * 1.3 - 0.2)); pb.c[k] = c[0]; pb.c[k + 1] = c[1]; pb.c[k + 2] = c[2]; }
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(2.35, s / 5 * 6.28 + 0.3, 0, 'YXZ'));
        stem.add(pb, new THREE.Matrix4().compose(top, lean2.clone().multiply(q), new THREE.Vector3(1, 1, 1)));
    }
    return { stem: stem.geometry(H), petals: bloom.geometry(H), top: top.clone().add(new THREE.Vector3(0, 0.3, 0)), H };
}

/** The glow sprite point of a bloom (where the group's Points put a halo). */
export const TELE_VARIANTS = 4;
const _teleCache = [];
export function telewilpinVariant(i) { return _teleCache[i] || (_teleCache[i] = buildTelewilpin(i + 1)); }

// ================================================================== CARNIVOROUS HEAD
export const HEAD = { LOBE_L: 3.0, LOBE_W: 1.25, LOBE_H: 0.85, STEM_H: 5.8 };
const G_OUT = hexRGB(0x3c7a2a), G_DARK = hexRGB(0x1d4018), G_VEIN = hexRGB(0x12300f), RED_IN = hexRGB(0x9c1226), RED_DEEP = hexRGB(0x5a0814), VEIN_IN = hexRGB(0xe0788a), LIP = hexRGB(0xd8d24a);

/** Width of the lobe at u (0 hinge … 1 tip): a rounded blade with a blunt point. */
const lobeW = (u) => HEAD.LOBE_W * Math.pow(Math.sin(Math.PI * (0.05 + 0.92 * Math.pow(u, 0.85))), 0.8);

/** One jaw of the trap: a clamshell from the hinge (origin, along +x) running along +z; open face down. `phase` shifts its teeth. */
export function buildLobe(seed = 1, phase = 0) {
    const rnd = rng(seed * 104729 + 7), B = new Builder();
    const dome = (u) => HEAD.LOBE_H * Math.pow(Math.sin(Math.PI * clamp01(u * 0.97 + 0.02)), 0.75) * (1 - 0.25 * u);
    const nu = 14, nv = 10;
    const veins = (u, s) => { const a = Math.abs(Math.sin((s * 3.2 + u * 2.4) * 3.1)); return a < 0.1 ? 1 : 0; };
    // outside: green, dark ribs fanning from the hinge, blotches
    B.grid(nu, nv, (u, v) => {
        const s = v * 2 - 1, w = lobeW(u), y = dome(u) * (1 - s * s), x = s * w, z = HEAD.LOBE_L * u;
        let c = lerpC(G_DARK, G_OUT, 0.4 + 0.5 * (1 - Math.abs(s)) * Math.sin(Math.PI * u));
        c = lerpC(c, G_VEIN, veins(u, s) * 0.55);
        c = lerpC(c, hexRGB(0x7b8a2a), clamp01(Math.sin(u * 13 + s * 7) * 0.4) * 0.25); // (blotches)
        c = lerpC(c, hexRGB(0x6a2a22), clamp01(Math.sin(u * 9 - s * 11) - 0.7) * 0.9); // (rusty spots)
        return { p: [x, y, z], c };
    }, { flip: true });
    // inside: wet crimson, pale veins, a deep throat at the hinge
    B.grid(nu, nv, (u, v) => {
        const s = v * 2 - 1, w = lobeW(u) * 0.96, y = dome(u) * (1 - s * s) * 0.9 - 0.04, x = s * w, z = HEAD.LOBE_L * u + 0.02;
        let c = lerpC(RED_DEEP, RED_IN, clamp01(u * 1.4));
        c = lerpC(c, VEIN_IN, veins(u, s) * 0.5 + 0.1 * Math.max(0, Math.sin(s * 14 + u * 3)) * u);
        return { p: [x, y, z], c };
    });
    // the lip: a rounded yellow rim along the whole edge
    const lip = [];
    for (let side = -1; side <= 1; side += 2) {
        const pts = [];
        for (let k = 0; k <= 16; k++) { const u = k / 16; pts.push(new THREE.Vector3(side * lobeW(u), -0.015, HEAD.LOBE_L * u)); }
        B.tube(pts, (t) => 0.05 * Math.sin(Math.PI * clamp01(t * 0.9 + 0.05)) + 0.015, (t) => lerpC(G_OUT, LIP, clamp01(t * 1.3)), 5, { cap: false });
        lip.push(pts);
    }
    // teeth: spiky cilia round the lip, curving in; the two jaws are offset by `phase` so they interlock
    for (let side = 0; side < 2; side++) for (let k = 0; k < 15; k++) {
        const u = (k + 0.5 + phase * 0.5) / 15.5; if (u > 0.98 || u < 0.08) continue;
        const sg = side ? 1 : -1, x = sg * lobeW(u), z = HEAD.LOBE_L * u;
        const len = 0.42 + 0.16 * Math.sin(Math.PI * u) + rnd() * 0.08;
        B.cone(new THREE.Vector3(x, -0.01, z), new THREE.Vector3(-sg * 0.28, -1, 0.1 * (rnd() - 0.5)).normalize(), len, 0.05, hexRGB(0xc9c24a), hexRGB(0xfff6c0), 4);
    }
    // the tip's hook and the trigger hairs inside
    B.cone(new THREE.Vector3(0, 0.02, HEAD.LOBE_L * 0.98), new THREE.Vector3(0, -0.4, 1).normalize(), 0.5, 0.06, LIP, hexRGB(0xfff6c0), 5);
    for (let h = 0; h < 6; h++) {
        const u = 0.3 + (h % 3) * 0.2, s = h < 3 ? -0.35 : 0.35;
        B.cone(new THREE.Vector3(s * lobeW(u), dome(u) * (1 - s * s) * 0.8, HEAD.LOBE_L * u), new THREE.Vector3(0, -1, 0.15), 0.45, 0.018, hexRGB(0xe8f0c0), hexRGB(0xffffff), 3);
    }
    // wet drops on the inside
    for (let d = 0; d < 8; d++) {
        const u = 0.2 + rnd() * 0.7, s = (rnd() - 0.5) * 1.2, y = dome(u) * (1 - s * s) * 0.9 - 0.08;
        const sph = new THREE.SphereGeometry(0.045 + rnd() * 0.03, 6, 4);
        const sb = new Builder();
        const pa = sph.attributes.position;
        for (let k = 0; k < pa.count; k++) sb.vert(pa.getX(k), pa.getY(k), pa.getZ(k), hexRGB(0xf0c8d0));
        for (let k = 0; k < sph.index.count; k++) sb.i.push(sph.index.array[k]);
        sph.dispose();
        B.add(sb, new THREE.Matrix4().makeTranslation(s * lobeW(u) * 0.9, y, HEAD.LOBE_L * u));
    }
    return B.geometry();
}

/** The stem of a head (ribbed, blotched, on gnarled roots, a collar of leaves under the trap), standing on +y; variant `seed`. */
export function buildHeadStem(seed = 1) {
    const rnd = rng(seed * 31337 + 5), B = new Builder(), H = HEAD.STEM_H;
    const lean = rnd() * 6.28, pts = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(new THREE.Vector3(Math.sin(t * 3.4 + lean) * 0.4 * t, t * H, Math.cos(t * 2.7 + lean) * 0.35 * t)); }
    const curve = new THREE.CatmullRomCurve3(pts), sp = curve.getPoints(36);
    const A = hexRGB(0x33200f), Bc = hexRGB(0x2c5a22), C = hexRGB(0x5f9a30);
    B.tube(sp, (t) => 0.66 - 0.3 * t + (t < 0.08 ? (0.08 - t) * 2.2 : 0), (t, a) => {
        let c = t < 0.1 ? lerpC(A, Bc, t / 0.1) : lerpC(Bc, C, clamp01((t - 0.1) / 0.8));
        c = lerpC(c, hexRGB(0x6a2a40), clamp01(Math.sin(a * 17 + t * 26) - 0.78) * 1.5); // (purple blotches)
        return c;
    }, 10, { ridge: (t, a) => 1 + 0.07 * Math.cos(a * Math.PI * 2 * 5) + 0.03 * Math.sin(t * 40) });
    // roots
    for (let r = 0; r < 7; r++) {
        const a = r / 7 * 6.28 + rnd() * 0.4, L = 1.3 + rnd() * 1.1;
        const rp = [new THREE.Vector3(Math.cos(a) * 0.3, 0.45, Math.sin(a) * 0.3), new THREE.Vector3(Math.cos(a) * L * 0.5, 0.25, Math.sin(a) * L * 0.5), new THREE.Vector3(Math.cos(a + 0.3) * L, -0.08, Math.sin(a + 0.3) * L)];
        B.tube(rp, (t) => 0.22 * (1 - t) + 0.03, (t) => lerpC(Bc, A, t), 6);
    }
    // thorny bristles
    for (let k = 0; k < 24; k++) { const t = 0.12 + 0.75 * rnd(), q = curve.getPoint(t), a = rnd() * 6.28; const d = new THREE.Vector3(Math.cos(a), 0.2, Math.sin(a)).normalize(); B.cone(q.clone().addScaledVector(d, 0.45 - 0.2 * t), d, 0.22, 0.04, hexRGB(0x244a1c), hexRGB(0xc0d070), 4); }
    // the collar: broad leaves flaring under the head
    const top = sp[sp.length - 1].clone();
    for (let l = 0; l < 7; l++) {
        const lf = new Builder();
        leafInto(lf, 1.5 + rnd() * 0.6, 0.35, 0.45, rnd);
        B.add(lf, new THREE.Matrix4().compose(top.clone().add(new THREE.Vector3(0, -0.25 - 0.15 * (l % 2), 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.15, l / 7 * 6.28 + rnd() * 0.3, 0, 'YXZ')), new THREE.Vector3(1, 1, 1)));
    }
    // lower leaves
    for (let l = 0; l < 4; l++) {
        const lf = new Builder(), q = curve.getPoint(0.18 + l * 0.05);
        leafInto(lf, 1.9, 0.4, 0.5, rnd);
        B.add(lf, new THREE.Matrix4().compose(q, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.95, l * 1.7 + rnd(), 0, 'YXZ')), new THREE.Vector3(1, 1, 1)));
    }
    return { geo: B.geometry(), top, curve };
}

let _bulge = null;
/** The swelling that slides down the stem while the meal is digested (shared). */
export function bulgeGeometry() {
    if (_bulge) return _bulge;
    _bulge = new THREE.SphereGeometry(0.62, 12, 9);
    const c = new Float32Array(_bulge.attributes.position.count * 3);
    for (let i = 0; i < c.length; i += 3) { c[i] = 0.5; c[i + 1] = 0.7; c[i + 2] = 0.25; }
    _bulge.setAttribute('color', new THREE.BufferAttribute(c, 3));
    _bulge.userData.keep = true;
    return _bulge;
}

// ------------------------------------------------------------------ the tendrils (animated on the CPU, one shape per head)
export const VINES = { N: 6, SEG: 12, RADIAL: 5 };
/**
 * The lashing tendrils of one head: a single geometry updated each frame. `set(i, base, target|null, t, reach)` writes vine i:
 * idle — a slow curling wave; with a target — a quick lash toward it that wraps at the end.
 */
export class VineSet {
    constructor(seed = 1) {
        const { N, SEG, RADIAL } = VINES, rnd = rng(seed * 977 + 3);
        this.N = N; this.phase = Array.from({ length: N }, () => rnd() * 6.28); this.len = Array.from({ length: N }, () => 2.6 + rnd() * 1.8);
        this.rad = Array.from({ length: N }, () => 0.13 + rnd() * 0.05);
        this.pos = new Float32Array(N * (SEG + 1) * RADIAL * 3);
        this.nrm = new Float32Array(this.pos.length);
        const col = new Float32Array(this.pos.length), idx = [];
        for (let v = 0; v < N; v++) for (let k = 0; k <= SEG; k++) {
            const t = k / SEG, c = lerpC(hexRGB(0x2a5a1c), hexRGB(0x9ad040), Math.pow(t, 1.5));
            for (let j = 0; j < RADIAL; j++) { const o = ((v * (SEG + 1) + k) * RADIAL + j) * 3; col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2]; }
        }
        for (let v = 0; v < N; v++) for (let k = 0; k < SEG; k++) for (let j = 0; j < RADIAL; j++) {
            const a = (v * (SEG + 1) + k) * RADIAL + j, b = (v * (SEG + 1) + k) * RADIAL + (j + 1) % RADIAL, c = a + RADIAL, d = b + RADIAL;
            idx.push(a, c, b, b, c, d);
        }
        this.geo = new THREE.BufferGeometry();
        this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
        this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        this.geo.setIndex(idx);
        this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 12);
        this.spine = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
    }
    /** Vine i from `base` (local point on the stem) outward at angle `yaw`; `target` (local point) or null; `t` seconds; `reach` 0…1 (how far it lashes). */
    set(i, base, yaw, target, t, reach, grip = 0) {
        const { SEG, RADIAL } = VINES, S = this.spine, L = this.len[i], ph = this.phase[i];
        const cx = Math.cos(yaw), sz = Math.sin(yaw);
        for (let k = 0; k <= SEG; k++) {
            const u = k / SEG;
            // the resting tendril: out from the stem, drooping, with a slow wave
            const out = L * 0.55 * Math.sin(u * 1.2), drop = -L * 0.35 * u * u;
            const w = Math.sin(t * 1.7 + ph + u * 4) * 0.28 * u, w2 = Math.cos(t * 1.3 + ph * 1.7 + u * 3.5) * 0.28 * u;
            const rx = base.x + cx * (out + w) - sz * w2 * L * 0.3, rz = base.z + sz * (out + w) + cx * w2 * L * 0.3, ry = base.y + drop + 0.25 * Math.sin(u * 3);
            if (target && reach > 0) {
                // toward the target: a curved arc that straightens as it reaches, a coil at the end when it grips
                const e = reach * (0.2 + 0.8 * u) * Math.min(1, u * 1.6), arc = Math.sin(u * Math.PI) * 0.9 * (1 - reach);
                const tx = mix(base.x, target.x, u), ty = mix(base.y, target.y, u) + arc * 1.2, tz = mix(base.z, target.z, u);
                const coil = grip * u * u * 0.35, ca = u * 14 + t * 6;
                S[k].set(mix(rx, tx, e) + Math.cos(ca) * coil, mix(ry, ty, e), mix(rz, tz, e) + Math.sin(ca) * coil);
            } else S[k].set(rx, ry, rz);
        }
        const o0 = i * (SEG + 1) * RADIAL * 3;
        let nx = 0, ny = 1, nz = 0;
        for (let k = 0; k <= SEG; k++) {
            const a = S[Math.max(0, k - 1)], b = S[Math.min(SEG, k + 1)];
            let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
            // a normal that stays smooth along the vine: project the last one off the tangent
            const d = nx * tx + ny * ty + nz * tz; nx -= tx * d; ny -= ty * d; nz -= tz * d;
            let nl = Math.hypot(nx, ny, nz); if (nl < 1e-4) { nx = 1; ny = 0; nz = 0; nl = 1; }
            nx /= nl; ny /= nl; nz /= nl;
            const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
            const r = this.rad[i] * (1 - 0.85 * (k / SEG)) + 0.012;
            for (let j = 0; j < RADIAL; j++) {
                const ang = j / RADIAL * 6.2832, c = Math.cos(ang), s = Math.sin(ang), o = o0 + (k * RADIAL + j) * 3;
                const ex = c * nx + s * bx, ey = c * ny + s * by, ez = c * nz + s * bz;
                this.pos[o] = S[k].x + ex * r; this.pos[o + 1] = S[k].y + ey * r; this.pos[o + 2] = S[k].z + ez * r;
                this.nrm[o] = ex; this.nrm[o + 1] = ey; this.nrm[o + 2] = ez;
            }
        }
    }
    /** The tip of vine i (local), after `set`. */
    tip(i, out) { return out.copy(this.spine[VINES.SEG]); }
    commit() { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true; }
    dispose() { this.geo.dispose(); }
}

// ================================================================== ITEMS (what the plants leave)
let _leafItem = null, _headItem = null;
/** «Листок телевильпина»: a red leaf that glows, serrated, a bright midrib, a short stalk (~0.5 m long). */
export function telewilpinLeafModel() {
    if (!_leafItem) {
        const B = new Builder(), rnd = rng(77);
        B.grid(24, 6, (u, v) => {
            const s = v * 2 - 1, jag = 1 + 0.2 * ((Math.round(u * 24) % 2) ? 1 : -0.6) * Math.abs(s);
            const w = 0.17 * Math.sin(Math.PI * (0.06 + 0.9 * u)) ** 0.9 * jag;
            const x = s * w, y = 0.07 + 0.42 * u, z = -0.07 * Math.abs(s) * (1 - u * 0.3) + 0.05 * u * u;
            let c = lerpC(hexRGB(0x7a0614), hexRGB(0xe8201c), clamp01(u * 1.2)); c = lerpC(c, hexRGB(0xff7a2a), Math.abs(s) ** 2 * u * 0.6);
            if (Math.abs(s) < 0.12) c = lerpC(c, hexRGB(0xffc060), 0.75); // (the glowing midrib)
            else if (Math.abs(Math.sin((u * 6 + Math.abs(s) * 2) * 3.1)) > 0.93) c = lerpC(c, hexRGB(0xff9a50), 0.5); // (side veins)
            return { p: [x, y, z], c };
        });
        B.tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.01, 0.05, 0.005), new THREE.Vector3(0, 0.1, 0)], (t) => 0.015, () => hexRGB(0x5a2018), 5);
        _leafItem = { geo: B.geometry() };
    }
    const g = new THREE.Group(), m = new THREE.Mesh(_leafItem.geo, plantMaterials().item);
    m.rotation.set(0, 0, 0); g.add(m);
    return g;
}

/** «Головка плотоядной»: a torn-off trap — two lobes half open, a ragged stalk, a drop of sap (~0.45 m). */
export function carnivoreHeadItemModel() {
    if (!_headItem) _headItem = { a: buildLobe(3, 0), b: buildLobe(4, 1) };
    const g = new THREE.Group(), mat = plantMaterials().itemHead, k = 0.085;
    const top = new THREE.Mesh(_headItem.a, mat), low = new THREE.Mesh(_headItem.b, mat);
    for (const m of [top, low]) { m.scale.setScalar(k); m.position.set(0, 0.04, -0.2); }
    top.rotation.x = -0.35; low.rotation.x = Math.PI - 0.35; low.position.y = 0.04;
    g.add(top, low);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x3f7a2a, roughness: 0.7 }));
    stalk.rotation.x = Math.PI / 2; stalk.position.set(0, 0.04, -0.26);
    g.add(stalk);
    const cut = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), new THREE.MeshStandardMaterial({ color: 0xb8d070, roughness: 0.5 }));
    cut.position.set(0, 0.04, -0.34); cut.rotation.y = Math.PI;
    g.add(cut);
    return g;
}

/** Samples for the shader warm-up (Game.prewarm): one of each material in a group. */
export function plantSamples() {
    const m = plantMaterials(), out = new THREE.Group(), tv = telewilpinVariant(0);
    out.add(new THREE.Mesh(tv.stem, m.stem), new THREE.Mesh(tv.petals, m.petal));
    out.add(new THREE.Mesh(buildLobe(1), m.head), new THREE.Mesh(buildHeadStem(1).geo, m.headStem), new THREE.Mesh(bulgeGeometry(), m.vine));
    const vs = new VineSet(1); out.add(new THREE.Mesh(vs.geo, m.vine));
    const p = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0], 3)), m.glow); out.add(p);
    out.add(telewilpinLeafModel(), carnivoreHeadItemModel());
    return out;
}

/** Several placed copies of shapes made one: [{geo, matrix}] → a geometry (position, normal, colour, sway). Used for a group of flowers. */
export function mergePlaced(list) {
    let nv = 0, ni = 0;
    for (const { geo } of list) { nv += geo.attributes.position.count; ni += geo.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), sway = new Float32Array(nv), idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    const nm = new THREE.Matrix3(), p = new THREE.Vector3(), n = new THREE.Vector3();
    let vo = 0, io = 0;
    for (const { geo, matrix } of list) {
        const P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.color, S = geo.attributes.sway;
        nm.getNormalMatrix(matrix);
        for (let k = 0; k < P.count; k++) {
            p.fromBufferAttribute(P, k).applyMatrix4(matrix); n.fromBufferAttribute(N, k).applyMatrix3(nm).normalize();
            const o = (vo + k) * 3;
            pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z; nor[o] = n.x; nor[o + 1] = n.y; nor[o + 2] = n.z;
            col[o] = C.getX(k); col[o + 1] = C.getY(k); col[o + 2] = C.getZ(k); sway[vo + k] = S.getX(k);
        }
        for (let k = 0; k < geo.index.count; k++) idx[io++] = geo.index.array[k] + vo;
        vo += P.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
}
