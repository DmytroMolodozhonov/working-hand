/**
 * FloraModels.js — the look of the wild magic plants (MagicFlora.js rules, MagicFloraLife.js system).
 *
 *   Светлошляпка        a cluster of tall mushrooms on a mossy mound: pale blue-cream stems with a ring and a flared foot, domed
 *                       caps (the glowing part, picked by hand) — turquoise at the heart → violet at the rim, white warts, dark gills below.
 *   Исполинский папоротник  a scaly trunk with a crown of 9 arching fronds 4–5 m long (rachis + ~22 pairs of tapering leaflets each, a V-fold),
 *                       the young curled fiddleheads at its foot are picked.
 *   Лазурница           a dense berry bush: crooked branches, glossy teal-green leaves with a paler underside, clusters of dusky-blue berries
 *                       with a frosty bloom (picked).
 *   Солнечница          a tuft of slender stems with whorls of narrow leaves; each stem carries a daisy-like golden bloom (picked), warm glow.
 *   Хрустальник         a crystal tree of the cold north: a faceted ice-blue trunk, 6 crystal spires with striations, shards round its foot;
 *                       the hanging icicle-needles are picked.
 *
 * Built once from seeded randoms, merged into ONE body shape per kind × variant (instanced by MagicFloraLife — a plant is one matrix) and ONE
 * small shape for what is picked (instanced too). Sway is done by the video card (one shared clock), glow is the surface's own colour × an
 * emissive that rises at night — no light sources, no per-plant materials.
 */
import * as THREE from 'three';
import { rng } from './PlantModels.js';

export const FLORA_VARIANTS = 3;

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const hexRGB = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const lerpC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Geometry assembled from tubes, grids, cones and blobs: position + colour (+ sway weight); normals computed at the end. */
class Builder {
    constructor() { this.p = []; this.c = []; this.i = []; }
    get n() { return this.p.length / 3; }
    vert(x, y, z, c) { this.p.push(x, y, z); this.c.push(c[0], c[1], c[2]); return this.n - 1; }
    tri(a, b, c) { this.i.push(a, b, c); }
    /** A tube along `pts` ([x,y,z][]), radius r(t), colour col(t, around 0…1); `ridge(t, around)` modulates the radius. */
    tube(pts, r, col, radial = 6, { ridge = null, cap = true } = {}) {
        const n = pts.length, base = this.n;
        let N = null;
        for (let k = 0; k < n; k++) {
            const t = k / (n - 1);
            const T = unit(sub(pts[Math.min(n - 1, k + 1)], pts[Math.max(0, k - 1)]));
            if (!N) N = unit(cross(Math.abs(T[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], T));
            else { const d = N[0] * T[0] + N[1] * T[1] + N[2] * T[2]; N = unit(sub(N, mul(T, d))); }
            const Bn = cross(T, N);
            for (let j = 0; j < radial; j++) {
                const a = j / radial, ang = a * Math.PI * 2;
                const rr = r(t) * (ridge ? ridge(t, a) : 1);
                this.vert(pts[k][0] + (Math.cos(ang) * N[0] + Math.sin(ang) * Bn[0]) * rr, pts[k][1] + (Math.cos(ang) * N[1] + Math.sin(ang) * Bn[1]) * rr, pts[k][2] + (Math.cos(ang) * N[2] + Math.sin(ang) * Bn[2]) * rr, col(t, a));
            }
        }
        for (let k = 0; k < n - 1; k++) for (let j = 0; j < radial; j++) {
            const a = base + k * radial + j, b = base + k * radial + (j + 1) % radial, c = a + radial, d = b + radial;
            this.tri(a, c, b); this.tri(b, c, d);
        }
        if (cap) {
            const e = this.vert(pts[n - 1][0], pts[n - 1][1], pts[n - 1][2], col(1, 0));
            for (let j = 0; j < radial; j++) this.tri(base + (n - 1) * radial + j, e, base + (n - 1) * radial + (j + 1) % radial);
        }
    }
    /** A surface grid (nu × nv cells) from f(u, v) → {p:[x,y,z], c:[r,g,b]}. */
    grid(nu, nv, f, flip = false) {
        const base = this.n;
        for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) { const q = f(a / nu, b / nv); this.vert(q.p[0], q.p[1], q.p[2], q.c); }
        for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) {
            const i0 = base + a * (nv + 1) + b, i1 = i0 + 1, i2 = i0 + nv + 1, i3 = i2 + 1;
            if (flip) { this.tri(i0, i1, i2); this.tri(i1, i3, i2); } else { this.tri(i0, i2, i1); this.tri(i1, i2, i3); }
        }
    }
    /** A cone from `at` along unit `dir`, base colour → tip colour. */
    cone(at, dir, len, r0, c0, c1, seg = 5) {
        const base = this.n;
        const a0 = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const u = unit(cross(dir, a0)), w = unit(cross(dir, u));
        for (let j = 0; j < seg; j++) {
            const a = j / seg * Math.PI * 2;
            this.vert(at[0] + (Math.cos(a) * u[0] + Math.sin(a) * w[0]) * r0, at[1] + (Math.cos(a) * u[1] + Math.sin(a) * w[1]) * r0, at[2] + (Math.cos(a) * u[2] + Math.sin(a) * w[2]) * r0, c0);
        }
        const tip = this.vert(at[0] + dir[0] * len, at[1] + dir[1] * len, at[2] + dir[2] * len, c1);
        for (let j = 0; j < seg; j++) this.tri(base + j, tip, base + (j + 1) % seg);
    }
    /** An ellipsoid (a mound, a berry, a bud): colour col(nx, ny, nz) from the unit normal. */
    blob(cx, cy, cz, rx, ry, rz, col, seg = 8, rings = 5, y0 = -1) {
        const base = this.n;
        for (let a = 0; a <= rings; a++) {
            const v = mix(y0, 1, a / rings) * Math.PI / 2; // (−90° … +90°)
            for (let s = 0; s < seg; s++) {
                const th = s / seg * Math.PI * 2, nx = Math.cos(v) * Math.cos(th), nz = Math.cos(v) * Math.sin(th), ny = Math.sin(v);
                this.vert(cx + nx * rx, cy + ny * ry, cz + nz * rz, col(nx, ny, nz));
            }
        }
        for (let a = 0; a < rings; a++) for (let s = 0; s < seg; s++) {
            const i0 = base + a * seg + s, i1 = base + a * seg + (s + 1) % seg, i2 = i0 + seg, i3 = i1 + seg;
            this.tri(i0, i1, i2); this.tri(i1, i3, i2);
        }
    }
    geometry(swayH = 0) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
        if (swayH) {
            const s = [];
            for (let k = 1; k < this.p.length; k += 3) s.push(clamp01(this.p[k] / swayH) ** 1.7);
            g.setAttribute('sway', new THREE.Float32BufferAttribute(s, 1));
        }
        g.setIndex(this.i);
        g.computeVertexNormals();
        g.computeBoundingSphere();
        g.userData.keep = g.userData.shared = true;
        return g;
    }
}

// ------------------------------------------------------------------ shared clock + materials
/** One clock for the swaying and the glowing of every wild plant (MagicFloraLife.update sets it). */
export const FLORA_CLOCK = { t: { value: 0 }, glow: { value: 0.4 } };

function swayify(mat, amp) {
    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uFT = FLORA_CLOCK.t;
        sh.vertexShader = 'uniform float uFT;\nattribute float sway;\n' + sh.vertexShader.replace('#include <begin_vertex>',
            `#include <begin_vertex>
            #ifdef USE_INSTANCING
            vec4 wp = instanceMatrix * vec4(transformed, 1.0);
            float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17 + wp.x * 0.3 + wp.z * 0.45;
            #else
            float ph = position.x * 0.3 + position.z * 0.45;
            #endif
            transformed.x += sway * ${amp.toFixed(3)} * sin(uFT * 1.2 + ph) * 3.0 + sway * 0.03 * sin(uFT * 3.0 + ph * 2.0);
            transformed.z += sway * ${amp.toFixed(3)} * cos(uFT * 1.0 + ph * 1.3) * 3.0;`);
    };
    mat.customProgramCacheKey = () => 'floraSway' + amp;
    return mat;
}

/** The glow is the surface's own colour (the cap's gradient keeps showing at night): emissive × vertex colour × the shared glow. */
function glowByColour(mat, tint = 1) {
    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uFGlow = FLORA_CLOCK.glow;
        sh.fragmentShader = 'uniform float uFGlow;\n' + sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor * uFGlow * ' + tint.toFixed(2) + ';');
    };
    mat.customProgramCacheKey = () => 'floraGlow' + tint;
    return mat;
}

let _mats = null;
/** body: the plant itself; glow: what shines (picked parts, crystals). One of each, shared by every plant. */
export function floraMaterials() {
    if (_mats) return _mats;
    const side = THREE.DoubleSide;
    _mats = {
        body: swayify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, side }), 0.045),
        fern: swayify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, side }), 0.07),
        glowcap: glowByColour(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side, emissive: 0xffffff, emissiveIntensity: 1 }), 1.0),
        berry: glowByColour(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, side, emissive: 0x6a7cff, emissiveIntensity: 1 }), 0.25),
        bloom: glowByColour(swayify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side, emissive: 0xffc040, emissiveIntensity: 1 }), 0.05), 0.55),
        crystal: glowByColour(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.25, side, emissive: 0x7fc8ff, emissiveIntensity: 1 }), 0.4),
        shard: glowByColour(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.3, side, emissive: 0x9fdcff, emissiveIntensity: 1 }), 0.8),
        frond: glowByColour(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side, emissive: 0x6cff9a, emissiveIntensity: 1 }), 0.12),
    };
    return _mats;
}

// ================================================================== GLOWCAP (Светлошляпка)
const CAP = { heart: hexRGB(0xaaf6ff), mid: hexRGB(0x38c8d8), rim: hexRGB(0x7a4ee0), under: hexRGB(0x2a2058), wart: hexRGB(0xf4ffff) };
const STEM = { base: hexRGB(0x8a9a9c), top: hexRGB(0xdceaf0), ring: hexRGB(0xb8a8e8) };

/** One cap in its own space: radius 0.5, dome 0.34 high, flared edge, gills below, white warts (the picked shape; instances scale it). */
function glowcapShape() {
    const B = new Builder();
    const rnd = rng(77);
    const warts = [];
    for (let i = 0; i < 9; i++) warts.push([rnd() * Math.PI * 2, 0.15 + rnd() * 0.65, 0.025 + rnd() * 0.03]);
    // the dome: u from the centre (0) to the rim (1), around v
    B.grid(10, 18, (u, v) => {
        const a = v * Math.PI * 2, rr = 0.5 * u;
        const y = 0.34 * Math.cos(u * Math.PI / 2) ** 0.9 - 0.02 * u * u + 0.012 * Math.sin(a * 7) * u; // (a ruffled edge)
        let c = u < 0.5 ? lerpC(CAP.heart, CAP.mid, u / 0.5) : lerpC(CAP.mid, CAP.rim, (u - 0.5) / 0.5);
        for (const [wa, wu, wr] of warts) { const da = Math.abs(Math.atan2(Math.sin(a - wa), Math.cos(a - wa))) * u; if (Math.hypot(da, (u - wu) * 0.6) < wr * 3) c = lerpC(c, CAP.wart, 0.8); }
        return { p: [Math.cos(a) * rr, y, Math.sin(a) * rr], c };
    }, true);
    // the underside: gills, a dark ribbed disc
    B.grid(6, 18, (u, v) => {
        const a = v * Math.PI * 2, rr = 0.5 * (1 - u * 0.86);
        const y = -0.02 + 0.06 * u;
        const rib = 0.8 + 0.2 * Math.cos(a * 22);
        return { p: [Math.cos(a) * rr, y, Math.sin(a) * rr], c: shade(lerpC(CAP.rim, CAP.under, 0.55 + 0.4 * u), rib) };
    });
    return B.geometry();
}

function glowcapBody(v) {
    const B = new Builder(), rnd = rng(1000 + v * 31);
    // the mound: moss and dark soil, speckled
    B.blob(0, 0, 0, 1.25, 0.28, 1.15, (nx, ny, nz) => {
        const k = 0.75 + 0.25 * Math.sin(nx * 11 + nz * 7) * Math.cos(nz * 9 - nx * 5);
        return shade(lerpC(hexRGB(0x1e3a2c), hexRGB(0x4a7a58), clamp01(ny * 1.2 + 0.35)), k);
    }, 10, 3, 0);
    const picks = [], N = 6 + (v % 2);
    for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + rnd() * 0.7, d = i === 0 ? 0.1 : 0.45 + rnd() * 0.65;
        const x = Math.cos(a) * d, z = Math.sin(a) * d, h = i === 0 ? 1.45 + rnd() * 0.3 : 0.55 + rnd() * 0.85;
        const lean = [Math.cos(a) * (0.05 + rnd() * 0.18), 0, Math.sin(a) * (0.05 + rnd() * 0.18)];
        const pts = [];
        for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([x + lean[0] * t * t * h, 0.12 + h * t, z + lean[2] * t * t * h]); }
        const r0 = 0.09 + 0.05 * (h / 1.7);
        B.tube(pts, (t) => r0 * (1.0 - 0.45 * t) * (1 + 0.8 * Math.exp(-t * 9)), (t, ar) => lerpC(STEM.base, STEM.top, clamp01(t * 1.6 + 0.1 * Math.sin(ar * 12))), 7, { cap: false });
        // the ring (annulus) a third of the way down from the cap
        const rt = 0.72, rp = pts[Math.round(rt * 6)];
        B.grid(2, 10, (u, vv) => { const aa = vv * Math.PI * 2; const rr = r0 * 0.62 * (1.5 - 0.5 * u) * 1.5; return { p: [rp[0] + Math.cos(aa) * rr, rp[1] - u * 0.09, rp[2] + Math.sin(aa) * rr], c: lerpC(STEM.ring, STEM.top, u) }; });
        const top = pts[pts.length - 1];
        picks.push([top[0], top[1] - 0.02, top[2], 0.62 + (h / 1.7) * 0.75]); // (cap size by the stem's height)
    }
    // little buttons round the foot (not picked)
    for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2, d = 0.7 + rnd() * 0.7, h = 0.12 + rnd() * 0.18, x = Math.cos(a) * d, z = Math.sin(a) * d;
        B.tube([[x, 0.1, z], [x, 0.1 + h, z]], () => 0.025, () => STEM.top, 5);
        B.blob(x, 0.1 + h, z, 0.09, 0.07, 0.09, (nx, ny) => lerpC(CAP.mid, CAP.heart, clamp01(ny)), 7, 3, 0);
    }
    const g = B.geometry(2);
    g.userData.picks = picks;
    return g;
}

// ================================================================== GIANT FERN (Исполинский папоротник)
const FERN = { base: hexRGB(0x174a24), mid: hexRGB(0x2f7a38), tip: hexRGB(0x7ccd5a), rach: hexRGB(0x4a6a28), trunk: hexRGB(0x4a3424), trunk2: hexRGB(0x2c2018) };

function frondInto(B, rnd, o, ang, L, droop) {
    const out = [Math.cos(ang), 0, Math.sin(ang)];
    const side = unit(cross(out, [0, 1, 0]));
    const N = 14, pts = [];
    for (let k = 0; k <= N; k++) {
        const t = k / N;
        const b = 1.6 + droop * 0.5; // (up steeply, peak at ~0.55 of the way, the tip curling down: a fountain)
        pts.push([o[0] + out[0] * L * 0.78 * t, o[1] + L * (1.1 * b * t - b * t * t), o[2] + out[2] * L * 0.78 * t]);
    }
    B.tube(pts, (t) => 0.034 * (1 - 0.8 * t) + 0.004, (t) => lerpC(FERN.rach, FERN.mid, t), 4, { cap: false });
    const pairs = 22;
    for (let k = 0; k < pairs; k++) {
        const t = 0.1 + 0.88 * (k / (pairs - 1)), fi = t * N, i0 = Math.min(N - 1, Math.floor(fi)), f = fi - i0;
        const p = [mix(pts[i0][0], pts[i0 + 1][0], f), mix(pts[i0][1], pts[i0 + 1][1], f), mix(pts[i0][2], pts[i0 + 1][2], f)];
        const T = unit(sub(pts[i0 + 1], pts[i0]));
        const sd = unit(cross(T, [0, 1, 0]));
        const l = (0.28 + 0.9 * Math.sin(Math.PI * Math.pow(t, 0.75))) * (L / 4.5) * (0.92 + rnd() * 0.16);
        for (const s of [-1, 1]) {
            // a leaflet: out to the side, folded in a V, tipped forward, drooping a little at its end; wavy edge
            const dir = unit(add(add(mul(sd, s * 0.92), mul(T, 0.32)), [0, 0.28, 0]));
            const w = l * 0.19;
            const kc = clamp01(t * 1.1);
            B.grid(3, 1, (u, v) => {
                const edge = Math.sin(Math.PI * Math.pow(u, 0.7)) * w * (v === 0 ? 0 : 1);
                const q = add(add(p, mul(dir, u * l)), add(mul(T, edge * 0.8 * (v ? 1 : 0)), [0, -u * u * l * 0.28 - (v ? edge * 0.35 : 0), 0]));
                const c = lerpC(lerpC(FERN.base, FERN.mid, 0.4 + 0.6 * u), FERN.tip, kc * u * 0.7 + (v ? 0.08 : 0));
                return { p: q, c };
            }, s > 0);
        }
    }
}

function fiddlehead(B, o, h, rnd, scale = 1) {
    // a young frond: a stalk rising then a tight spiral
    const pts = [];
    for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        if (t < 0.45) pts.push([o[0], o[1] + h * (t / 0.45) * 0.62, o[2]]);
        else { const a = (t - 0.45) / 0.55 * Math.PI * 2.4, rr = h * 0.13 * (1 - (t - 0.45) / 0.55 * 0.8); pts.push([o[0] + Math.sin(a) * rr, o[1] + h * 0.62 + h * 0.13 - Math.cos(a) * rr, o[2]]); }
    }
    B.tube(pts, (t) => 0.034 * scale * (1 - 0.55 * t), (t) => lerpC(hexRGB(0x5a8a30), hexRGB(0xb8e070), t), 5);
}

let _fiddle = null;
function fernBody(v) {
    const B = new Builder(), rnd = rng(2000 + v * 53);
    const H = 0.7 + rnd() * 0.5;
    // the trunk: fibrous and scaly, thicker at the foot, with the leaf-scars
    const pts = [];
    for (let k = 0; k <= 6; k++) pts.push([Math.sin(k * 0.6 + v) * 0.05, H * k / 6, Math.cos(k * 0.5 + v) * 0.05]);
    B.tube(pts, (t) => 0.3 * (1 - 0.3 * t) * (1 + 0.5 * Math.exp(-t * 8)), (t, a) => shade(lerpC(FERN.trunk, FERN.trunk2, 0.5 + 0.5 * Math.sin(a * 16 + t * 20)), 0.85 + 0.2 * t), 9, { ridge: (t, a) => 1 + 0.12 * Math.sin(a * Math.PI * 2 * 5 + t * 14) });
    const nF = 9;
    for (let i = 0; i < nF; i++) {
        const ang = (i / nF) * Math.PI * 2 + rnd() * 0.5;
        frondInto(B, rnd, [0, H, 0], ang, 3.6 + rnd() * 1.5, 0.45 + rnd() * 0.45);
    }
    // the unfurling crown: a few young fronds standing up in the middle
    for (let i = 0; i < 3; i++) fiddlehead(B, [Math.cos(i * 2.1) * 0.12, H, Math.sin(i * 2.1) * 0.12], 1.0 + rnd() * 0.5, rnd, 1.1);
    // the picked fiddleheads round the foot of the trunk (within a raised hand's reach)
    const picks = [];
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.6 + rnd() * 0.6, d = 0.38 + rnd() * 0.15;
        picks.push([Math.cos(a) * d, 0.18 + rnd() * 0.5, Math.sin(a) * d, 1]);
    }
    const g = B.geometry(5);
    g.userData.picks = picks;
    return g;
}
function fernPick() {
    if (_fiddle) return _fiddle;
    const B = new Builder(), rnd = rng(9);
    fiddlehead(B, [0, 0, 0], 0.7, rnd, 1.3);
    // a little pair of unrolling leaflets on the stalk
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
        const y = 0.08 + k * 0.1, l = 0.14 - k * 0.025;
        B.grid(2, 1, (u, v) => ({ p: [s * u * l, y + u * 0.07 - u * u * 0.04, v * 0.035], c: lerpC(hexRGB(0x4a8a2c), hexRGB(0xa8dc68), u) }));
    }
    return (_fiddle = B.geometry());
}

// ================================================================== AZURE BERRY BUSH (Лазурница)
const LEAFB = { dark: hexRGB(0x1c4e4a), mid: hexRGB(0x2c7a6a), pale: hexRGB(0x6ab8a0), edge: hexRGB(0x5a3a78) };
const BERRY = { deep: hexRGB(0x1f2f8a), mid: hexRGB(0x3a58c8), bloom: hexRGB(0xaab8f0) };

function azureBody(v) {
    const B = new Builder(), rnd = rng(3000 + v * 71);
    const picks = [];
    const nB = 6 + (v % 2);
    for (let i = 0; i < nB; i++) {
        const ang = (i / nB) * Math.PI * 2 + rnd() * 0.6, spread = 0.5 + rnd() * 0.5, h = 1.15 + rnd() * 0.6;
        const out = [Math.cos(ang), 0, Math.sin(ang)];
        const pts = [];
        for (let k = 0; k <= 7; k++) { const t = k / 7; pts.push([out[0] * spread * t * t * 1.0 + Math.sin(t * 3 + i) * 0.06, 0.05 + h * (Math.pow(t, 0.85)), out[2] * spread * t * t * 1.0 + Math.cos(t * 3 + i) * 0.06]); }
        B.tube(pts, (t) => 0.06 * (1 - 0.8 * t) + 0.008, (t, a) => lerpC(hexRGB(0x3a2a24), hexRGB(0x6a4a38), t + 0.1 * Math.sin(a * 9)), 5);
        // leaves in pairs and a leaf at the tip along the branch
        for (let k = 2; k <= 7; k++) {
            const p = pts[k], T = unit(sub(pts[Math.min(7, k + 1)], pts[k - 1]));
            const sd = unit(cross(T, [0, 1, 0]));
            for (const s of [-1, 1]) for (let q = 0; q < 2; q++) {
                const lang = (rnd() - 0.5) * 0.9, dir = unit(add(add(mul(sd, s * Math.cos(lang)), mul(T, 0.55 + 0.4 * q)), [0, 0.1 + 0.3 * rnd(), 0]));
                const l = 0.34 + rnd() * 0.16, w = l * 0.36, nrm = unit(cross(dir, T));
                B.grid(3, 2, (u, vv) => {
                    const sw = (vv - 0.5) * 2, hw = Math.sin(Math.PI * Math.pow(u, 0.7)) * w;
                    const q2 = add(add(p, mul(dir, u * l)), add(mul(nrm, sw * hw), [0, -u * u * l * 0.25 - Math.abs(sw) * hw * 0.3, 0]));
                    let c = lerpC(LEAFB.dark, LEAFB.mid, 0.4 + 0.6 * u);
                    if (Math.abs(sw) < 0.15) c = lerpC(c, LEAFB.pale, 0.5); // (the midrib)
                    c = lerpC(c, LEAFB.edge, Math.abs(sw) ** 3 * 0.35);
                    return { p: q2, c };
                }, s > 0);
            }
        }
        // a berry cluster near the end of the branch, hanging in reach
        const kk = 5 + (i % 2), p = pts[kk];
        if (p[1] < 2.1 && picks.length < 9) picks.push([p[0] + out[0] * 0.14, p[1] - 0.18, p[2] + out[2] * 0.14, 1]);
    }
    // a few ground leaves round the foot
    for (let i = 0; i < 8; i++) {
        const a = rnd() * Math.PI * 2, l = 0.4 + rnd() * 0.3;
        B.grid(2, 1, (u, vv) => ({ p: [Math.cos(a) * (0.25 + u * l) + (vv - 0.5) * Math.sin(a) * 0.12, 0.08 + Math.sin(u * 2.4) * 0.1, Math.sin(a) * (0.25 + u * l) - (vv - 0.5) * Math.cos(a) * 0.12], c: lerpC(LEAFB.dark, LEAFB.mid, u) }));
    }
    const g = B.geometry(2);
    g.userData.picks = picks;
    return g;
}
let _berry = null;
function azurePick() {
    if (_berry) return _berry;
    const B = new Builder(), rnd = rng(31);
    B.tube([[0, 0.2, 0], [0.01, 0.12, 0.01], [0, 0.04, 0]], (t) => 0.012, () => hexRGB(0x4a6a30), 4);
    B.blob(0, 0.2, 0, 0.012, 0.012, 0.012, () => hexRGB(0x4a6a30), 5, 2, 0);
    const spots = [[0, 0, 0], [0.065, 0.03, 0.02], [-0.06, 0.05, 0.03], [0.02, 0.06, -0.06], [-0.03, 0.0, -0.05], [0.05, 0.01, -0.04]];
    for (const [x, y, z] of spots) {
        const r = 0.045 + rnd() * 0.012;
        B.blob(x, y, z, r, r * 0.95, r, (nx, ny, nz) => lerpC(lerpC(BERRY.deep, BERRY.mid, clamp01(ny * 0.7 + 0.4)), BERRY.bloom, clamp01(ny * 0.9 - 0.2) * 0.55 + 0.1 * Math.sin(nx * 9 + nz * 6)), 8, 5);
        B.blob(x, y + r * 0.93, z, r * 0.22, r * 0.12, r * 0.22, () => hexRGB(0x1a2050), 5, 2, 0); // (the crown of the berry)
    }
    return (_berry = B.geometry());
}

// ================================================================== SUN-HERB (Солнечница)
const SUN = { stem: hexRGB(0x5a8a30), leaf: hexRGB(0x78b040), petal0: hexRGB(0xffe070), petal1: hexRGB(0xff9a2a), disc: hexRGB(0x7a4a1a) };
function sunBody(v) {
    const B = new Builder(), rnd = rng(4000 + v * 29);
    const picks = [], N = 5 + (v % 3);
    for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + rnd() * 0.5, d = 0.05 + rnd() * 0.35, h = 0.75 + rnd() * 0.6;
        const out = [Math.cos(a), 0, Math.sin(a)], lean = 0.15 + rnd() * 0.3;
        const pts = [];
        for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([out[0] * (d + lean * t * t), 0.04 + h * t, out[2] * (d + lean * t * t)]); }
        B.tube(pts, (t) => 0.026 * (1 - 0.5 * t), (t) => lerpC(hexRGB(0x3a6a22), SUN.stem, t), 5, { cap: false });
        // whorls of narrow leaves up the stem
        for (let k = 1; k <= 5; k++) {
            const p = pts[k];
            for (let q = 0; q < 3; q++) {
                const ang2 = q * 2.09 + k * 0.9 + i, dir = unit([Math.cos(ang2) * 0.9, 0.25 - k * 0.04, Math.sin(ang2) * 0.9]), l = 0.3 - k * 0.025, w = 0.035;
                const nrm = unit(cross(dir, [0, 1, 0]));
                B.grid(3, 1, (u, vv) => ({ p: add(add(p, mul(dir, u * l)), add(mul(nrm, (vv - 0.5) * 2 * w * Math.sin(Math.PI * Math.pow(u, 0.7))), [0, -u * u * l * 0.3, 0])), c: lerpC(SUN.stem, SUN.leaf, u) }));
            }
        }
        const top = pts[6];
        picks.push([top[0], top[1] + 0.02, top[2], 0.9 + rnd() * 0.5]);
        // a bud and a sepal ring below the bloom
        B.blob(top[0], top[1] - 0.04, top[2], 0.03, 0.03, 0.03, () => hexRGB(0x5a8a30), 5, 2);
    }
    // grass-like leaves at the foot
    for (let i = 0; i < 9; i++) {
        const a = rnd() * Math.PI * 2, l = 0.35 + rnd() * 0.3;
        B.grid(3, 1, (u, vv) => ({ p: [Math.cos(a) * (0.05 + u * l * 0.9) + (vv - 0.5) * 0.03, 0.03 + Math.sin(u * 2.2) * l * 0.45, Math.sin(a) * (0.05 + u * l * 0.9)], c: lerpC(hexRGB(0x3a6a22), SUN.leaf, u) }));
    }
    const g = B.geometry(1.4);
    g.userData.picks = picks;
    return g;
}
let _bloom = null;
function sunPick() {
    if (_bloom) return _bloom;
    const B = new Builder();
    const n = 14, rl = 0.17;
    for (const [ring, lenK, tilt, wK] of [[0, 1, 0.1, 1], [1, 0.78, 0.35, 0.9]]) {
        for (let k = 0; k < n; k++) {
            const a = (k + ring * 0.5) / n * Math.PI * 2;
            B.grid(3, 1, (u, vv) => {
                const w = Math.sin(Math.PI * (0.12 + 0.82 * u) ** 1.0) * 0.032 * wK, s = (vv - 0.5) * 2;
                const rr = 0.04 + u * rl * lenK;
                const x = Math.cos(a) * rr - Math.sin(a) * s * w, z = Math.sin(a) * rr + Math.cos(a) * s * w;
                return { p: [x, 0.02 + u * tilt * 0.12 - ring * 0.012 - u * u * 0.025, z], c: lerpC(SUN.petal0, SUN.petal1, u * u * 0.9 + (1 - ring) * 0.1) };
            }, k % 2 === 0);
        }
    }
    B.blob(0, 0.03, 0, 0.055, 0.035, 0.055, (nx, ny, nz) => lerpC(SUN.disc, hexRGB(0xc88a2a), clamp01(0.5 + 0.5 * Math.sin(nx * 20 + nz * 17) * Math.cos(ny * 9))), 9, 3, 0);
    return (_bloom = B.geometry());
}

// ================================================================== FROST CRYSTAL TREE (Хрустальник)
const ICE = { deep: hexRGB(0x4aa8e8), mid: hexRGB(0x9ad8ff), pale: hexRGB(0xe8f8ff), white: hexRGB(0xffffff) };
function crystalInto(B, base, dir, len, r, rnd) {
    // a hexagonal prism with a pointed pyramid tip, faint striations along it
    const pts = [];
    for (let k = 0; k <= 4; k++) pts.push(add(base, mul(dir, len * 0.78 * k / 4)));
    B.tube(pts, (t) => r * (1 - 0.12 * t), (t, a) => { const stripe = 0.9 + 0.1 * Math.cos(a * 6 * Math.PI * 2); return shade(lerpC(ICE.deep, ICE.mid, clamp01(t * 1.2 + 0.1 * Math.sin(a * 40))), stripe); }, 6, { cap: false });
    B.cone(add(base, mul(dir, len * 0.78)), dir, len * 0.22, r * 0.88, ICE.mid, ICE.white, 6);
}
function frostBody(v) {
    const B = new Builder(), rnd = rng(5000 + v * 41);
    const H = 3.3 + rnd() * 1.5;
    // the trunk: a thick faceted spire, a little crooked
    const pts = [];
    for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push([Math.sin(t * 2.4 + v) * 0.12, H * 0.72 * t, Math.cos(t * 2.1 + v) * 0.12]); }
    B.tube(pts, (t) => 0.36 * (1 - 0.55 * t), (t, a) => shade(lerpC(ICE.deep, ICE.mid, clamp01(t * 1.1 + 0.08 * Math.sin(a * 30))), 0.88 + 0.12 * Math.cos(a * 6 * Math.PI * 2)), 6, { cap: false });
    B.cone(pts[5], [0, 1, 0], H * 0.3, 0.16, ICE.mid, ICE.white, 6);
    // the spires: outward and up, from three heights
    const picks = [];
    for (let i = 0; i < 7; i++) {
        const t = 0.25 + 0.6 * (i / 6), at = pts[Math.min(5, Math.round(t * 5))];
        const a = i * 2.4 + rnd() * 0.5, up = 0.55 + 0.6 * t, dir = unit([Math.cos(a) * (1.1 - 0.5 * t), up, Math.sin(a) * (1.1 - 0.5 * t)]);
        crystalInto(B, at, dir, 1.0 + (1 - t) * 1.1 + rnd() * 0.6, 0.12 + 0.06 * (1 - t), rnd);
        // an icicle needle hanging from the lower spires within a hand's reach
        if (i < 4) { const base = add(at, mul(dir, 0.55)); picks.push([base[0], Math.max(2.2, base[1] - 0.35), base[2], 1]); }
    }
    // shards round the foot
    for (let i = 0; i < 9; i++) {
        const a = rnd() * Math.PI * 2, d = 0.4 + rnd() * 0.9, dir = unit([Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45]);
        crystalInto(B, [Math.cos(a) * d, 0, Math.sin(a) * d], dir, 0.35 + rnd() * 0.55, 0.05 + rnd() * 0.04, rnd);
    }
    const g = B.geometry();
    g.userData.picks = picks;
    return g;
}
let _shard = null;
function frostPick() {
    if (_shard) return _shard;
    const B = new Builder();
    // an icicle needle hanging: a hexagonal prism pointing down, a bright tip
    const pts = [[0, 0.5, 0], [0, 0.34, 0], [0, 0.18, 0]];
    B.tube(pts, (t) => 0.034 * (1 - 0.25 * t), (t, a) => shade(lerpC(ICE.pale, ICE.mid, t), 0.9 + 0.1 * Math.cos(a * 6 * Math.PI * 2)), 6, { cap: false });
    B.cone([0, 0.18, 0], [0, -1, 0], 0.18, 0.03, ICE.mid, ICE.white, 6);
    B.cone([0, 0.5, 0], [0, 1, 0], 0.04, 0.034, ICE.pale, ICE.white, 6);
    return (_shard = B.geometry());
}

// ================================================================== the table
const BODY_BUILD = { glowcap: glowcapBody, giantfern: fernBody, azureberry: azureBody, sunherb: sunBody, frostcrystal: frostBody };
const PICK_BUILD = { glowcap: glowcapShape, giantfern: fernPick, azureberry: azurePick, sunherb: sunPick, frostcrystal: frostPick };
/** Which shared material draws the body / the picked part of each kind. */
export const FLORA_MATERIAL = {
    glowcap: { body: 'body', pick: 'glowcap' },
    giantfern: { body: 'fern', pick: 'frond' },
    azureberry: { body: 'body', pick: 'berry' },
    sunherb: { body: 'body', pick: 'bloom' },
    frostcrystal: { body: 'crystal', pick: 'shard' },
};
/** The picked part's size factor in the hand (the item model). */
const _body = new Map(), _pick = new Map();
/** The body shape of a kind and variant (made once, kept: 5 kinds × 3 variants — a fixed number). userData.picks: [x, y, z, scale][]. */
export function floraBody(kind, variant) {
    const key = kind + variant;
    let g = _body.get(key);
    if (!g) { g = BODY_BUILD[kind](variant); _body.set(key, g); }
    return g;
}
/** The shape of what is picked (one per kind). */
export function floraPick(kind) {
    let g = _pick.get(kind);
    if (!g) { g = PICK_BUILD[kind](); g.userData.keep = g.userData.shared = true; _pick.set(kind, g); }
    return g;
}
/** The picked part as an item in the hand / on the ground (a small group; its geometry and material are the shared ones). */
export function floraItemModel(kind) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(floraPick(kind), floraMaterials()[FLORA_MATERIAL[kind].pick]);
    const s = { glowcap: 0.34, giantfern: 0.42, azureberry: 1.1, sunherb: 1.3, frostcrystal: 0.5 }[kind] || 0.4;
    m.scale.setScalar(s);
    g.add(m);
    return g;
}
/** Everything built (the loading screen: Game.prewarm builds shapes and shaders for each kind). */
export function floraSamples() {
    const out = [];
    const M = floraMaterials();
    for (const kind of Object.keys(BODY_BUILD)) {
        const grp = new THREE.Group();
        grp.add(new THREE.Mesh(floraBody(kind, 0), M[FLORA_MATERIAL[kind].body]), new THREE.Mesh(floraPick(kind), M[FLORA_MATERIAL[kind].pick]));
        out.push(grp);
    }
    return out;
}
