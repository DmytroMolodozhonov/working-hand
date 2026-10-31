/**
 * GargoyleModel.js — the look of the infernal gargoyle (THREE; the rules are GargoyleRules.js).
 *
 * A real creature, not a heap of boxes: a hunched, heavy-chested body of red stone with a skull-like head (a brow ridge,
 * a short snout, a jaw that opens, fangs, two swept-back horns and two small brow horns, cheek spikes, ears), long arms
 * with three-clawed hands and a thumb, digitigrade legs with clawed toes and a heel spur, a tail with spikes and a spade tip,
 * a ridge of spikes down the back, and BAT WINGS: an arm, a forearm, a wrist with a hook and four jointed fingers, with a
 * scalloped leathery membrane between them that stretches and folds with the bones.
 *
 * The skin: ONE skeleton (46 bones, every part rigidly on its bone; the membrane's points on the finger bones), three
 * SkinnedMeshes — stone, glow (eyes, mouth and chest embers), membrane — so a gargoyle is 3 draws, and thirty are 90. Their
 * shapes (`high` near, `low` far) and materials are made once and shared by all (userData.shared); each gargoyle owns only its
 * bones. The stone has its own canvas texture (grain, mottling, cracks, chips) and a second one of smouldering orange veins
 * along the cracks (emissive: they glow at night); every gargoyle is a little different (size, tint, wing proportion, flap).
 *
 * Size (CLAUDE.md «размеры»): ~2.8 m from the toes to the horns' tips and ~4.5–5 m across the wings — a little smaller than
 * the hero (3.5–3.9 m), bigger than the owl (1.2 m) and the phoenix (2.4 m). The model's origin is its hip (the middle of the
 * body); the feet hang `HIP` m below it. Facing +Z.
 */

import * as THREE from 'three';

export const HIP = 1.25; // m: from the hip down to the soles (the bind pose)
export const MODEL_SCALE = 0.9; // × the table's numbers
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const rnd = (() => { let a = 0x9e3779b1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();

// ======================================================================= the skeleton
/** [name, parent, x, y, z] — joints in the bind pose (hip-origin); the left side (+x) is written once, `side()` mirrors it. */
const CENTER = [
    ['hip', null, 0, 0, 0], ['spine1', 'hip', 0, 0.22, 0.06], ['spine2', 'spine1', 0, 0.62, 0.12], ['neck', 'spine2', 0, 1.0, 0.22],
    ['head', 'neck', 0, 1.3, 0.34], ['jaw', 'head', 0, 1.28, 0.46],
    ['tail1', 'hip', 0, -0.1, -0.3], ['tail2', 'tail1', 0, -0.2, -0.75], ['tail3', 'tail2', 0, -0.35, -1.2], ['tail4', 'tail3', 0, -0.5, -1.65],
];
const SIDE = [
    ['shoulder', 'spine2', 0.62, 0.95, 0.08], ['elbow', 'shoulder', 0.72, 0.5, 0.12], ['hand', 'elbow', 0.74, 0.08, 0.34],
    ['wroot', 'spine2', 0.4, 1.02, -0.2], ['welbow', 'wroot', 0.85, 1.25, -0.45], ['wwrist', 'welbow', 1.55, 1.2, -0.1],
    ['thigh', 'hip', 0.3, -0.05, 0], ['knee', 'thigh', 0.36, -0.55, 0.3], ['ankle', 'knee', 0.36, -1.0, -0.05], ['toe', 'ankle', 0.36, -1.22, 0.22],
];
/** The four wing fingers (from the wrist): direction (x out, z back) and length. Every finger is two bones. */
const FINGERS = [
    { dir: [0.97, 0.04, -0.22], len: 1.15 }, { dir: [0.6, -0.02, -0.8], len: 1.55 }, { dir: [0.16, -0.05, -0.99], len: 1.7 }, { dir: [-0.34, -0.05, -0.94], len: 1.5 },
];
const WRIST = [1.55, 1.2, -0.1];
const fingerPt = (i, t) => { const f = FINGERS[i]; return [WRIST[0] + f.dir[0] * f.len * t, WRIST[1] + f.dir[1] * f.len * t, WRIST[2] + f.dir[2] * f.len * t]; };

export const BONE_NAMES = [];
const BONE_DEF = []; // [name, parent, x, y, z] in the order of the skeleton
for (const b of CENTER) BONE_DEF.push(b);
for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    for (const [n, p, x, y, z] of SIDE) BONE_DEF.push([n + tag, p === 'spine2' || p === 'hip' ? p : p + tag, s * x, y, z]);
    FINGERS.forEach((f, i) => {
        const a = fingerPt(i, 0), b = fingerPt(i, 0.5);
        BONE_DEF.push([`fa${i}${tag}`, 'wwrist' + tag, s * a[0], a[1], a[2]]);
        BONE_DEF.push([`fb${i}${tag}`, `fa${i}${tag}`, s * b[0], b[1], b[2]]);
    });
}
for (const b of BONE_DEF) BONE_NAMES.push(b[0]);
const IDX = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));
const POS = Object.fromEntries(BONE_DEF.map(([n, , x, y, z]) => [n, new THREE.Vector3(x, y, z)]));

/** A fresh set of bones (one gargoyle's own), in the bind pose. */
function makeBones() {
    const bones = BONE_DEF.map(([n]) => { const b = new THREE.Bone(); b.name = n; return b; });
    BONE_DEF.forEach(([n, p, x, y, z], i) => {
        if (!p) { bones[i].position.set(x, y, z); return; }
        const q = POS[p];
        bones[i].position.set(x - q.x, y - q.y, z - q.z);
        bones[IDX[p]].add(bones[i]);
    });
    return bones;
}

// ======================================================================= textures
let _tex = null;
/** The canvases: stone, its glowing veins (emissive), the membrane. null without a canvas (tests in node). */
export function gargoyleTextures() { return textures(); }
function textures() {
    if (_tex !== null) return _tex || null;
    if (typeof document === 'undefined') { _tex = false; return null; }
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const S = 256;
    const stone = mk(S, S), glow = mk(S, S);
    const x = stone.getContext('2d'), gx = glow.getContext('2d');
    if (!x || !gx) { _tex = false; return null; }
    // the red stone: a base, big mottling, then fine grain
    x.fillStyle = '#8c2418'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 46; i++) {
        const px = rnd() * S, py = rnd() * S, r = 18 + rnd() * 46, dark = rnd() < 0.5;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, dark ? 'rgba(52,14,10,0.42)' : 'rgba(170,70,44,0.30)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    for (let i = 0; i < 5200; i++) {
        const v = rnd();
        x.fillStyle = v < 0.45 ? `rgba(30,8,6,${0.12 + rnd() * 0.25})` : v < 0.8 ? `rgba(190,92,62,${0.08 + rnd() * 0.2})` : `rgba(255,150,100,${0.05 + rnd() * 0.1})`;
        const s = 1 + rnd() * 2.4;
        x.fillRect(rnd() * S, rnd() * S, s, s * (0.5 + rnd()));
    }
    // layers of the rock: faint strata
    for (let i = 0; i < 14; i++) {
        x.strokeStyle = `rgba(40,10,8,${0.08 + rnd() * 0.1})`; x.lineWidth = 1 + rnd() * 2;
        x.beginPath(); const y0 = rnd() * S; x.moveTo(0, y0);
        for (let px = 0; px <= S; px += 32) x.lineTo(px, y0 + (rnd() - 0.5) * 14);
        x.stroke();
    }
    // cracks: random walks that fork; a chip-light edge beside every crack; some of them smoulder (the glow canvas)
    gx.fillStyle = '#000'; gx.fillRect(0, 0, S, S);
    const crack = (px, py, ang, len, depth, vein) => {
        const pts = [[px, py]];
        for (let i = 0; i < len; i++) {
            ang += (rnd() - 0.5) * 0.9;
            px += Math.cos(ang) * 4; py += Math.sin(ang) * 4;
            pts.push([px, py]);
            if (depth < 2 && rnd() < 0.05) crack(px, py, ang + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6), 8 + (rnd() * 14) | 0, depth + 1, vein);
        }
        for (const off of [S, 0, -S]) for (const offY of [0, S, -S]) {
            const path = () => { x.beginPath(); pts.forEach(([a, b], k) => (k ? x.lineTo(a + off, b + offY) : x.moveTo(a + off, b + offY))); };
            x.strokeStyle = 'rgba(214,120,84,0.35)'; x.lineWidth = 3.2 - depth; path(); x.translate(1, 1); path(); x.stroke(); x.translate(-1, -1);
            x.strokeStyle = '#1c0605'; x.lineWidth = 2.2 - depth * 0.6; path(); x.stroke();
            if (vein) {
                gx.strokeStyle = 'rgba(255,92,18,0.9)'; gx.lineWidth = 1.4 - depth * 0.3; gx.shadowColor = '#ff7a20'; gx.shadowBlur = 6;
                gx.beginPath(); pts.forEach(([a, b], k) => (k ? gx.lineTo(a + off, b + offY) : gx.moveTo(a + off, b + offY))); gx.stroke();
                gx.shadowBlur = 0;
            }
        }
    };
    for (let i = 0; i < 16; i++) crack(rnd() * S, rnd() * S, rnd() * 6.28, 12 + (rnd() * 26) | 0, 0, rnd() < 0.55);
    // a few embers in pits
    for (let i = 0; i < 26; i++) { const px = rnd() * S, py = rnd() * S; gx.fillStyle = `rgba(255,${100 + (rnd() * 90) | 0},30,${0.35 + rnd() * 0.5})`; gx.beginPath(); gx.arc(px, py, 0.8 + rnd() * 1.6, 0, 6.3); gx.fill(); x.fillStyle = 'rgba(20,4,3,0.7)'; x.beginPath(); x.arc(px, py, 2 + rnd() * 2, 0, 6.3); x.fill(); }
    // the membrane: dark crimson leather, radial veins from the wrist (the middle), mottled, soot at the edge
    const mem = mk(256, 256), mx = mem.getContext('2d');
    mx.fillStyle = '#5a1410'; mx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) {
        const px = rnd() * 256, py = rnd() * 256, r = 14 + rnd() * 40;
        const g = mx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, rnd() < 0.5 ? 'rgba(30,6,6,0.4)' : 'rgba(150,50,36,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        mx.fillStyle = g; mx.fillRect(px - r, py - r, r * 2, r * 2);
    }
    for (let i = 0; i < 38; i++) {
        const a = (i / 38) * 6.283 + (rnd() - 0.5) * 0.1;
        mx.strokeStyle = `rgba(${150 + (rnd() * 60) | 0},48,34,${0.35 + rnd() * 0.3})`; mx.lineWidth = 0.8 + rnd() * 1.4;
        mx.beginPath(); let px = 128, py = 128, an = a; mx.moveTo(px, py);
        for (let k = 0; k < 14; k++) { an += (rnd() - 0.5) * 0.18; px += Math.cos(an) * 10; py += Math.sin(an) * 10; mx.lineTo(px, py); }
        mx.stroke();
    }
    for (let i = 0; i < 1800; i++) { mx.fillStyle = `rgba(${rnd() < 0.5 ? '20,4,4' : '190,80,60'},${0.05 + rnd() * 0.12})`; mx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2); }
    const T = (c, repeat) => { const t = new THREE.CanvasTexture(c); if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = 4; t.userData = { shared: true }; return t; };
    _tex = { stone: T(stone, true), glow: T(glow, true), mem: T(mem, false), canvases: { stone, glow, mem } };
    return _tex;
}

// ======================================================================= geometry builders
/** Parts of one shape being collected: positions, normals, uvs, colours, bone indices/weights. */
class Soup {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.si = []; this.sw = []; this.idx = []; }
    /** `geo` (already placed in the model's space), all on bone `bone` (or `weights(i)` → [[bone, w]…]). */
    add(geo, bone, tint = [1, 1, 1], uvScale = 1, weights = null, shade = true, rawUv = false) {
        const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
        const base = this.p.length / 3;
        const ou = rawUv ? 0 : rnd(), ov = rawUv ? 0 : rnd(), us = rawUv ? 1 : uvScale * (0.8 + rnd() * 0.5);
        for (let i = 0; i < pos.count; i++) {
            this.p.push(pos.getX(i), pos.getY(i), pos.getZ(i));
            const ny = nor ? nor.getY(i) : 0;
            this.n.push(nor ? nor.getX(i) : 0, ny, nor ? nor.getZ(i) : 1);
            this.uv.push(uv ? uv.getX(i) * us + ou : 0, uv ? uv.getY(i) * us + ov : 0);
            const lit = shade ? 0.66 + 0.34 * (ny * 0.5 + 0.5) : 1;
            const j = 0.94 + rnd() * 0.1;
            this.c.push(tint[0] * lit * j, tint[1] * lit * j, tint[2] * lit * j);
            const w = weights ? weights(i) : [[bone, 1]];
            for (let k = 0; k < 4; k++) { this.si.push(w[k] ? w[k][0] : 0); this.sw.push(w[k] ? w[k][1] : 0); }
        }
        if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(geo.index.array[i] + base);
        else for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
        geo.dispose();
    }
    build() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
        g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(this.si, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
        g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
        g.computeBoundingSphere();
        g.userData.shared = true;
        return g;
    }
}

const ball = (soup, bone, x, y, z, rx, ry, rz, o = {}) => {
    const g = new THREE.SphereGeometry(1, o.ws || 10, o.hs || 8);
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0)), _s.set(rx, ry, rz));
    g.applyMatrix4(_m);
    soup.add(g, IDX[bone], o.tint, o.uv || 1);
};
/** A tapered limb from a to b (radius ra → rb). */
const seg = (soup, bone, a, b, ra, rb, o = {}) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (len < 1e-4) return;
    const g = new THREE.CylinderGeometry(rb, ra, len, o.ws || 8, 1, !!o.open);
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    _m.compose(_v2.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q.setFromUnitVectors(UP, _v), _s.set(1, 1, 1));
    g.applyMatrix4(_m);
    soup.add(g, IDX[bone], o.tint, o.uv || 1);
};
/** A spike from `base` along `dir`. */
const spike = (soup, bone, base, dir, len, r, o = {}) => {
    const g = new THREE.ConeGeometry(r, len, o.ws || 6, 1);
    _v.set(dir[0], dir[1], dir[2]).normalize();
    _m.compose(_v2.set(base[0] + _v.x * len / 2, base[1] + _v.y * len / 2, base[2] + _v.z * len / 2), _q.setFromUnitVectors(UP, _v), _s.set(1, 1, 1));
    g.applyMatrix4(_m);
    soup.add(g, IDX[bone], o.tint || [1, 1, 1], o.uv || 1);
};
const DARK = [0.42, 0.26, 0.24], CLAW = [0.2, 0.15, 0.15], BONE = [1.7, 1.5, 1.2], HORN = [0.5, 0.36, 0.34];

/** The stone and glow parts. `hi`: the near shape with all the small things; false: the far one. */
function buildBody(hi) {
    const st = new Soup(), gl = new Soup();
    const W = hi ? 10 : 7, H = hi ? 8 : 5;
    // ---- the trunk: pelvis, belly, a barrel chest with ribs, the shoulders
    ball(st, 'hip', 0, 0, 0, 0.36, 0.28, 0.3, { ws: W, hs: H });
    ball(st, 'spine1', 0, 0.3, 0.07, 0.33, 0.3, 0.27, { ws: W, hs: H });
    ball(st, 'spine2', 0, 0.8, 0.14, 0.54, 0.44, 0.38, { ws: W + 2, hs: H + 1 });
    ball(st, 'spine2', 0.26, 0.82, 0.42, 0.25, 0.19, 0.13, { ws: W, hs: H }); // the chest plates
    ball(st, 'spine2', -0.26, 0.82, 0.42, 0.25, 0.19, 0.13, { ws: W, hs: H });
    ball(st, 'spine2', 0, 0.55, 0.42, 0.18, 0.2, 0.1, { ws: W, hs: H });
    if (hi) for (let i = 0; i < 4; i++) for (const s of [1, -1]) ball(st, 'spine1', s * 0.2, 0.18 + i * 0.1, 0.27 - i * 0.012, 0.2, 0.034, 0.05, { rz: s * 0.25, ws: 6, hs: 4, tint: [0.8, 0.7, 0.7] }); // the ribs
    // the cracked chest: an ember glows in it
    ball(gl, 'spine2', 0, 0.78, 0.35, 0.1, 0.13, 0.09, { ws: 8, hs: 6 });
    // ---- shoulders, neck, the back's ridge
    for (const s of [1, -1]) ball(st, s > 0 ? 'shoulderL' : 'shoulderR', s * 0.62, 0.95, 0.08, 0.25, 0.22, 0.24, { ws: W, hs: H });
    seg(st, 'neck', [0, 0.98, 0.2], [0, 1.33, 0.36], 0.23, 0.17, { ws: W });
    const spikes = hi ? 7 : 4;
    for (let i = 0; i < spikes; i++) {
        const t = i / (spikes - 1), y = 1.0 - t * 1.0, z = 0.06 - t * 0.3 - 0.12 * Math.sin(t * 3);
        spike(st, i < 4 ? 'spine2' : 'spine1', [0, y - 0.06, z - 0.1], [0, 0.8, -0.6], 0.2 - t * 0.07, 0.055 - t * 0.012, { tint: HORN, ws: 5 });
    }
    // ---- the head
    ball(st, 'head', 0, 1.42, 0.4, 0.24, 0.22, 0.27, { ws: W + 2, hs: H });
    ball(st, 'head', 0, 1.51, 0.52, 0.27, 0.07, 0.15, { ws: W, hs: 5, rx: -0.15 }); // the brow ridge
    ball(st, 'head', 0, 1.35, 0.64, 0.15, 0.12, 0.2, { ws: W, hs: H }); // the snout
    ball(st, 'head', 0, 1.3, 0.78, 0.09, 0.05, 0.07, { ws: 6, hs: 4, tint: DARK }); // the nose
    for (const s of [1, -1]) {
        ball(st, 'head', s * 0.21, 1.34, 0.48, 0.08, 0.1, 0.13, { ws: 6, hs: 5 }); // the cheek
        spike(st, 'head', [s * 0.2, 1.36, 0.46], [s * 0.9, -0.2, -0.5], 0.17, 0.05, { tint: HORN, ws: 5 }); // a cheek spike
        ball(st, 'head', s * 0.24, 1.46, 0.3, 0.025, 0.14, 0.09, { ws: 5, hs: 4, rz: -s * 0.5, tint: DARK }); // an ear fin
        // the horns: a chain curving up and back
        let p = [s * 0.14, 1.56, 0.34], d = [s * 0.5, 0.75, -0.25];
        for (let i = 0; i < (hi ? 5 : 3); i++) {
            const len = 0.17, r0 = 0.07 - i * 0.012, r1 = 0.07 - (i + 1) * 0.012;
            const nd = Math.hypot(d[0], d[1], d[2]);
            const q = [p[0] + d[0] / nd * len, p[1] + d[1] / nd * len, p[2] + d[2] / nd * len];
            seg(st, 'head', p, q, Math.max(0.012, r0), Math.max(0.008, r1), { tint: HORN, ws: 6 });
            p = q; d = [d[0] + s * 0.02, d[1] - 0.2, d[2] - 0.3];
        }
        spike(st, 'head', [s * 0.1, 1.56, 0.58], [s * 0.2, 0.7, 0.5], 0.13, 0.035, { tint: HORN, ws: 5 }); // a brow horn
        // the eyes (a glow) under the brow
        ball(gl, 'head', s * 0.115, 1.455, 0.63, 0.045, 0.035, 0.03, { ws: 7, hs: 5 });
    }
    // the jaw, the mouth (an ember in the throat) and the fangs
    ball(st, 'jaw', 0, 1.2, 0.62, 0.115, 0.05, 0.19, { ws: W, hs: 5 });
    ball(st, 'jaw', 0, 1.18, 0.78, 0.07, 0.045, 0.05, { ws: 6, hs: 4, tint: DARK });
    ball(gl, 'head', 0, 1.3, 0.6, 0.07, 0.04, 0.09, { ws: 6, hs: 4 });
    if (hi) {
        for (const s of [1, -1]) {
            spike(st, 'head', [s * 0.07, 1.285, 0.74], [0, -1, 0.1], 0.1, 0.022, { tint: BONE, ws: 5 });
            spike(st, 'head', [s * 0.12, 1.29, 0.62], [0, -1, 0], 0.06, 0.018, { tint: BONE, ws: 4 });
            spike(st, 'jaw', [s * 0.06, 1.22, 0.8], [0, 1, 0.1], 0.08, 0.02, { tint: BONE, ws: 5 });
            spike(st, 'jaw', [s * 0.1, 1.22, 0.68], [0, 1, 0], 0.05, 0.016, { tint: BONE, ws: 4 });
        }
    }
    // ---- the arms and hands
    for (const s of [1, -1]) {
        const T = s > 0 ? 'L' : 'R';
        const sh = [s * 0.62, 0.95, 0.08], el = [s * 0.72, 0.5, 0.12], wr = [s * 0.74, 0.08, 0.34];
        seg(st, 'shoulder' + T, sh, el, 0.17, 0.13, { ws: W });
        ball(st, 'elbow' + T, el[0], el[1], el[2], 0.14, 0.14, 0.14, { ws: 7, hs: 5 });
        if (hi) spike(st, 'elbow' + T, [el[0] + s * 0.1, el[1], el[2] - 0.05], [s * 0.7, 0.1, -0.7], 0.2, 0.05, { tint: HORN, ws: 5 }); // an elbow spur
        seg(st, 'elbow' + T, el, wr, 0.13, 0.095, { ws: W });
        ball(st, 'hand' + T, wr[0], wr[1], wr[2], 0.12, 0.1, 0.13, { ws: 8, hs: 6 });
        for (let k = 0; k < 3; k++) { // three long clawed fingers
            const a = (k - 1) * 0.3;
            const f0 = [wr[0] + s * Math.sin(a) * 0.1, wr[1] - 0.08, wr[2] + 0.07], f1 = [f0[0] + s * Math.sin(a) * 0.17, f0[1] - 0.17, f0[2] + 0.12];
            seg(st, 'hand' + T, f0, f1, 0.035, 0.026, { ws: 5 });
            spike(st, 'hand' + T, f1, [s * Math.sin(a) * 0.5, -0.8, 0.7], 0.15, 0.026, { tint: CLAW, ws: 5 });
        }
        seg(st, 'hand' + T, [wr[0] - s * 0.06, wr[1] - 0.02, wr[2] + 0.1], [wr[0] - s * 0.14, wr[1] - 0.1, wr[2] + 0.2], 0.03, 0.022, { ws: 5 }); // the thumb
        spike(st, 'hand' + T, [wr[0] - s * 0.14, wr[1] - 0.1, wr[2] + 0.2], [-s * 0.4, -0.6, 0.7], 0.11, 0.022, { tint: CLAW, ws: 5 });
        // ---- the legs: thigh, knee, shin back, ankle, the foot with three toes and a spur
        const th = [s * 0.3, -0.05, 0], kn = [s * 0.36, -0.55, 0.3], an = [s * 0.36, -1.0, -0.05], ball0 = [s * 0.36, -1.22, 0.22];
        ball(st, 'thigh' + T, th[0], -0.2, 0.08, 0.2, 0.34, 0.22, { ws: W, hs: H, rx: -0.3 });
        seg(st, 'thigh' + T, th, kn, 0.19, 0.12, { ws: W });
        ball(st, 'knee' + T, kn[0], kn[1], kn[2], 0.13, 0.13, 0.13, { ws: 7, hs: 5 });
        seg(st, 'knee' + T, kn, an, 0.12, 0.075, { ws: W });
        ball(st, 'ankle' + T, an[0], an[1], an[2], 0.085, 0.085, 0.085, { ws: 6, hs: 4 });
        seg(st, 'ankle' + T, an, ball0, 0.075, 0.07, { ws: 6 });
        ball(st, 'toe' + T, ball0[0], ball0[1] + 0.02, ball0[2] + 0.04, 0.1, 0.06, 0.13, { ws: 7, hs: 5 });
        for (let k = 0; k < 3; k++) {
            const a = (k - 1) * 0.42;
            spike(st, 'toe' + T, [ball0[0] + s * Math.sin(a) * 0.05, ball0[1] - 0.02, ball0[2] + 0.12], [s * Math.sin(a), -0.15, 1], 0.2, 0.034, { tint: CLAW, ws: 5 });
        }
        spike(st, 'ankle' + T, [an[0], an[1] + 0.05, an[2] - 0.05], [0, -0.3, -1], 0.17, 0.036, { tint: CLAW, ws: 5 }); // the heel spur
        // ---- the wing's bones
        const R = [s * 0.4, 1.02, -0.2], E = [s * 0.85, 1.25, -0.45], Wr = [s * WRIST[0], WRIST[1], WRIST[2]];
        seg(st, 'wroot' + T, R, E, 0.1, 0.075, { ws: 7 });
        ball(st, 'wroot' + T, R[0], R[1], R[2], 0.13, 0.13, 0.13, { ws: 7, hs: 5 });
        ball(st, 'welbow' + T, E[0], E[1], E[2], 0.085, 0.085, 0.085, { ws: 6, hs: 4 });
        seg(st, 'welbow' + T, E, Wr, 0.075, 0.055, { ws: 7 });
        ball(st, 'wwrist' + T, Wr[0], Wr[1], Wr[2], 0.09, 0.09, 0.09, { ws: 7, hs: 5 });
        spike(st, 'wwrist' + T, [Wr[0], Wr[1] + 0.04, Wr[2] + 0.04], [s * 0.2, 0.5, 1], 0.2, 0.035, { tint: CLAW, ws: 5 }); // the wrist hook
        FINGERS.forEach((f, i) => {
            const p0 = fingerPt(i, 0), p1 = fingerPt(i, 0.5), p2 = fingerPt(i, 1);
            const m = (p) => [s * p[0], p[1], p[2]];
            seg(st, `fa${i}${T}`, m(p0), m(p1), 0.045 - i * 0.003, 0.035 - i * 0.002, { ws: 5, tint: [0.7, 0.55, 0.52] });
            seg(st, `fb${i}${T}`, m(p1), m(p2), 0.035 - i * 0.002, 0.014, { ws: 5, tint: [0.7, 0.55, 0.52] });
            if (hi) spike(st, `fb${i}${T}`, m(p2), [s * f.dir[0], f.dir[1], f.dir[2]], 0.1, 0.02, { tint: CLAW, ws: 4 }); // a small claw at the tip
        });
    }
    // ---- the tail: tapering, spiked, a spade at the end
    const tp = [[0, -0.1, -0.3], [0, -0.2, -0.75], [0, -0.35, -1.2], [0, -0.5, -1.65], [0, -0.68, -2.05]];
    for (let i = 0; i < 4; i++) {
        seg(st, 'tail' + (i + 1), tp[i], tp[i + 1], 0.17 - i * 0.032, 0.14 - i * 0.032, { ws: 7 });
        if (hi) spike(st, 'tail' + (i + 1), [0, tp[i][1] + 0.1, tp[i][2] - 0.08], [0, 0.9, -0.5], 0.14 - i * 0.02, 0.04, { tint: HORN, ws: 5 });
    }
    {
        const g = new THREE.OctahedronGeometry(1, 0); // a leaf-shaped spade, flat
        _m.compose(_v.set(0, -0.75, -2.25), _q.setFromEuler(_e.set(0.22, 0, 0)), _s.set(0.24, 0.045, 0.34));
        g.applyMatrix4(_m);
        st.add(g, IDX.tail4, HORN, 1);
        const g2 = new THREE.OctahedronGeometry(1, 0);
        _m.compose(_v.set(0, -0.75, -2.25), _q.setFromEuler(_e.set(0.22, 0, Math.PI / 2)), _s.set(0.16, 0.04, 0.34));
        g2.applyMatrix4(_m);
        st.add(g2, IDX.tail4, HORN, 1);
    }
    return { stone: st.build(), glow: gl.build() };
}

/** The membrane of both wings: panels between the fingers, the arm and the body, the free edge scalloped. */
function buildMembrane(hi) {
    const me = new Soup();
    for (const s of [1, -1]) {
        const T = s > 0 ? 'L' : 'R';
        const mk = (p, w) => ({ p: [s * p[0], p[1], p[2]], w });
        const along = (i, t) => { // a point on finger i at t (0 wrist … 1 tip): skinned to its two bones
            const pt = fingerPt(i, t);
            const a = IDX[`fa${i}${T}`], b = IDX[`fb${i}${T}`];
            const wb = t <= 0.5 ? Math.min(1, Math.max(0, (t - 0.42) / 0.16)) : 1;
            return mk(pt, t === 0 ? [[IDX['wwrist' + T], 1]] : [[a, 1 - wb], [b, wb]]);
        };
        const W = mk(WRIST, [[IDX['wwrist' + T], 1]]);
        const R = mk([0.4, 1.02, -0.2], [[IDX['wroot' + T], 1]]);
        const E = mk([0.85, 1.25, -0.45], [[IDX['welbow' + T], 1]]);
        const Hh = mk([0.34, 0.05, -0.55], [[IDX.hip, 1]]); // where the membrane meets the body, at the hip
        const Hm = mk([0.4, 0.55, -0.3], [[IDX.spine1, 0.6], [IDX.spine2, 0.4]]); // …and along the flank
        const tris = [];
        const P = []; // [{p, w}] vertices; tris by index
        const vi = (v) => { P.push(v); return P.length - 1; };
        const fing = FINGERS.map((_, i) => [vi(along(i, 0.5)), vi(along(i, 1))]);
        const iW = vi(W), iR = vi(R), iE = vi(E), iH = vi(Hh), iM = vi(Hm);
        // between neighbouring fingers: the fan from the wrist, then the scalloped edge
        for (let i = 0; i < FINGERS.length - 1; i++) {
            const [a1, a2] = fing[i], [b1, b2] = fing[i + 1];
            const pa = P[a2].p, pb = P[b2].p;
            const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
            const wr = [s * WRIST[0], WRIST[1], WRIST[2]];
            const pull = 0.17 + 0.05 * (i % 2); // the scallop: the edge between two tips is drawn in towards the wrist
            const iMid = vi({ p: [mid[0] + (wr[0] - mid[0]) * pull, mid[1] + (wr[1] - mid[1]) * pull, mid[2] + (wr[2] - mid[2]) * pull], w: [[IDX[`fb${i}${T}`], 0.5], [IDX[`fb${i + 1}${T}`], 0.5]] });
            tris.push([iW, a1, b1], [a1, a2, iMid], [a1, iMid, b1], [b1, iMid, b2]);
        }
        const last = fing[FINGERS.length - 1];
        // the rear panel: from the last finger down to the body
        const lp = P[last[1]].p, bw = [Hh.p[0], Hh.p[1], Hh.p[2]];
        const iMidB = vi({ p: [(lp[0] + bw[0]) / 2 + (s * WRIST[0] - (lp[0] + bw[0]) / 2) * 0.12, (lp[1] + bw[1]) / 2, (lp[2] + bw[2]) / 2], w: [[IDX[`fb3${T}`], 0.55], [IDX.hip, 0.45]] });
        tris.push([iW, last[0], iM], [last[0], iMidB, iM], [last[0], last[1], iMidB], [iM, iMidB, iH], [iW, iM, iR], [iW, iR, iE]);
        // build one geometry for this wing: planar uv from the wrist
        const pos = [], nor = [], uv = [], idx = [];
        P.forEach((v) => { pos.push(...v.p); nor.push(0, 1, 0); uv.push((Math.abs(v.p[0]) - WRIST[0]) * 0.2 + 0.5, (v.p[2] - WRIST[2]) * 0.2 + 0.5); });
        for (const t of tris) idx.push(...t);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        const wt = P.map((v) => v.w);
        // each wing is subdivided once (a smoother bend): the midpoints of the edges take the mean of the weights
        const sub = hi ? subdivide(g, wt) : { geo: flat(g), weights: wt };
        me.add(sub.geo, 0, [1, 1, 1], 1, (i) => sub.weights[i], false, true);
    }
    const out = me.build();
    return out;
}

/** The far membrane: the same panels, not subdivided (with normals). */
function flat(g) { g.computeVertexNormals(); return g; }

/** One level of subdivision of a flat membrane (every triangle into four); the skin weights of the new points are the means. */
function subdivide(g, wt) {
    const pos = g.attributes.position, uv = g.attributes.uv, idx = g.index.array;
    const P = [], U = [], W = wt.map((w) => w.map((x) => [...x]));
    for (let i = 0; i < pos.count; i++) { P.push([pos.getX(i), pos.getY(i), pos.getZ(i)]); U.push([uv.getX(i), uv.getY(i)]); }
    const cache = new Map();
    const mid = (a, b) => {
        const k = a < b ? a + '_' + b : b + '_' + a;
        if (cache.has(k)) return cache.get(k);
        P.push([(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2, (P[a][2] + P[b][2]) / 2]);
        U.push([(U[a][0] + U[b][0]) / 2, (U[a][1] + U[b][1]) / 2]);
        const m = new Map();
        for (const [bo, w] of W[a]) m.set(bo, (m.get(bo) || 0) + w / 2);
        for (const [bo, w] of W[b]) m.set(bo, (m.get(bo) || 0) + w / 2);
        W.push([...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4));
        cache.set(k, P.length - 1);
        return P.length - 1;
    };
    const out = [];
    for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i], b = idx[i + 1], c = idx[i + 2];
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
    ng.setAttribute('uv', new THREE.Float32BufferAttribute(U.flat(), 2));
    ng.setIndex(out);
    ng.computeVertexNormals();
    // a slight bow of the surface (the membrane is not a flat sheet): the middle of every panel sags a little
    const pa = ng.attributes.position;
    for (let i = 0; i < pa.count; i++) {
        const wob = Math.sin(pa.getX(i) * 7.3 + pa.getZ(i) * 5.1) * 0.012;
        pa.setY(i, pa.getY(i) + wob);
    }
    ng.computeVertexNormals();
    const weights = W.map((w) => { const sum = w.reduce((q, x) => q + x[1], 0) || 1; return w.map(([bo, x]) => [bo, x / sum]); });
    return { geo: ng, weights };
}

// ======================================================================= shared things and the model
let _S = null;
/** The shapes and materials every gargoyle shares (made once; userData.shared — never disposed). */
function shared() {
    if (_S) return _S;
    const hi = buildBody(true), lo = buildBody(false);
    const mem = buildMembrane(true), memLo = buildMembrane(false);
    const tx = textures();
    const stoneMat = (tint) => {
        const m = new THREE.MeshLambertMaterial({ color: tint, vertexColors: true, map: tx?.stone || null, emissive: tx ? 0xffffff : 0x000000, emissiveMap: tx?.glow || null, emissiveIntensity: 0.9 });
        m.skinning = true; // (r128: the material's own switch — the video card moves it by the bones)
        m.userData.shared = true;
        return m;
    };
    const mats = [stoneMat(0xffffff), stoneMat(0xf0c8bc), stoneMat(0xffd6c0)];
    const glow = new THREE.MeshBasicMaterial({ color: 0xff7a1c });
    const membrane = new THREE.MeshLambertMaterial({ color: 0xffffff, map: tx?.mem || null, side: THREE.DoubleSide, emissive: 0x2a0402 });
    glow.skinning = membrane.skinning = true;
    glow.userData.shared = membrane.userData.shared = true;
    const bind = makeBones();
    bind[0].updateMatrixWorld(true);
    const inverses = bind.map((b) => new THREE.Matrix4().copy(b.matrixWorld).invert());
    _S = { hi, lo, mem, memLo, mats, glow, membrane, inverses };
    return _S;
}

/**
 * One gargoyle (origin at the hip, forward +Z). `variant`: 0…2 (the stone's tint). userData: bones by name, the meshes,
 * and `setLod(far)` swapping the shape. Pose it with poseGargoyle.
 */
export function gargoyleModel(variant = 0) {
    const S = shared();
    const g = new THREE.Group();
    g.name = 'gargoyle';
    const bones = makeBones();
    const skel = new THREE.Skeleton(bones, S.inverses.map((m) => m.clone()));
    g.add(bones[0]);
    const body = new THREE.SkinnedMesh(S.hi.stone, S.mats[variant % 3]);
    const glow = new THREE.SkinnedMesh(S.hi.glow, S.glow);
    const mem = new THREE.SkinnedMesh(S.mem, S.membrane);
    for (const m of [body, glow, mem]) { g.add(m); m.bind(skel, new THREE.Matrix4()); m.frustumCulled = false; }
    body.castShadow = true;
    const byName = {};
    bones.forEach((b) => { byName[b.name] = b; });
    g.userData = {
        model: 'gargoyle', bones, B: byName, skel, body, glow, mem, far: false, hip: bones[0],
        setLod(far) {
            if (far === this.far) return;
            this.far = far;
            body.geometry = far ? S.lo.stone : S.hi.stone;
            glow.geometry = far ? S.lo.glow : S.hi.glow;
            mem.geometry = far ? S.memLo : S.mem;
            body.castShadow = !far;
        },
    };
    return g;
}

/** Counts for the tests and the report: triangles of the near / far shapes. */
export function gargoyleStats() {
    const S = shared();
    const tri = (g) => g.index.count / 3;
    return { near: tri(S.hi.stone) + tri(S.hi.glow) + tri(S.mem), far: tri(S.lo.stone) + tri(S.lo.glow) + tri(S.memLo), bones: BONE_NAMES.length, draws: 3 };
}

// ======================================================================= pose
const lerp = (a, b, k) => a + (b - a) * k;

/** What each mode wants (the numbers the animation eases to). */
const MODES = {
    //          wing stroke amplitude / beat rate / fold,  body (pitch handled outside), arms forward, legs tucked (1) or hanging (0), jaw
    fly: { amp: 0.62, rate: 14, fold: 0.0, arms: 0.2, tuck: 0.9, jaw: 0.0 },
    glide: { amp: 0.12, rate: 3, fold: 0.0, arms: 0.1, tuck: 0.95, jaw: 0.0 },
    climb: { amp: 0.8, rate: 17, fold: 0.0, arms: 0.1, tuck: 0.6, jaw: 0.15 },
    hover: { amp: 0.72, rate: 13, fold: 0.0, arms: 0.7, tuck: 0.1, jaw: 0.1 },
    dive: { amp: 0.0, rate: 4, fold: 0.88, arms: 1.0, tuck: 1.0, jaw: 0.5 },
    bite: { amp: 0.7, rate: 14, fold: 0.0, arms: 1.0, tuck: 0.0, jaw: 0.8 },
    fall: { amp: 0.0, rate: 0, fold: 0.5, arms: 0.0, tuck: 0.4, jaw: 0.4 },
    stone: { amp: 0.0, rate: 0, fold: 0.7, arms: 0.2, tuck: 0.0, jaw: 0.0 },
};

/**
 * One pose from the mode and the state. a: {mode, ph (the wingbeat phase), t, bite (0…1 swipe), cur: eased numbers,
 * seed (0…6.28, makes each one different), span (wing proportion)}.
 */
export function poseGargoyle(model, a, dt) {
    const B = model.userData.B;
    const M = MODES[a.mode] || MODES.fly;
    const c = a.cur || (a.cur = { ...M });
    const k = Math.min(1, dt * 7);
    for (const key of ['amp', 'rate', 'fold', 'arms', 'tuck', 'jaw']) c[key] = lerp(c[key], M[key], k);
    a.t = (a.t || 0) + dt;
    a.ph = (a.ph || 0) + dt * c.rate;
    const ph = a.ph, F = c.fold, amp = c.amp;
    const up = Math.sin(ph);
    const sw = a.span || 1;
    for (const s of [1, -1]) {
        const T = s > 0 ? 'L' : 'R';
        const wr = B['wroot' + T], we = B['welbow' + T], ww = B['wwrist' + T];
        wr.rotation.set(0, s * (F * 1.05 - 0.1 * amp * up), s * (0.18 * (1 - F) + amp * up * 0.95 - F * 0.35));
        we.rotation.set(0, -s * F * 2.35, s * (amp * 0.5 * Math.sin(ph - 0.9)));
        ww.rotation.set(0, s * F * 1.15, s * (amp * 0.55 * Math.sin(ph - 1.6)));
        for (let i = 0; i < 4; i++) {
            const fa = B[`fa${i}${T}`], fb = B[`fb${i}${T}`];
            const lag = 2.3 + i * 0.15;
            fa.rotation.set(0, -s * F * (1.15 - i * 0.05) + s * (i - 1.5) * 0.04 * (1 - F), s * (amp * 0.55 * Math.sin(ph - lag) * sw - 0.05 * (1 - F)));
            fb.rotation.set(0, -s * F * 0.75, s * (amp * 0.5 * Math.sin(ph - lag - 0.8) * sw));
        }
        // arms: hang, or reach forward to grab
        const sh = B['shoulder' + T], el = B['elbow' + T], ha = B['hand' + T];
        const reach = c.arms, sway = Math.sin(a.t * 1.7 + a.seed + s) * 0.05;
        sh.rotation.set(-0.15 - 1.1 * reach + sway, -s * 0.12 * reach, s * 0.1);
        el.rotation.set(-0.35 - 0.5 * reach, 0, 0);
        const swipe = a.bite > 0 ? Math.sin(Math.PI * Math.min(1, a.bite)) : 0;
        ha.rotation.set(-0.2 + 0.7 * swipe, 0, -s * 0.15 * swipe);
        if (swipe) sh.rotation.x -= 0.6 * swipe;
        // legs: tucked back in flight, hanging, reaching to claw
        const th = B['thigh' + T], kn = B['knee' + T], an = B['ankle' + T], to = B['toe' + T];
        const tuck = c.tuck, claw = a.bite > 0 ? swipe : 0;
        th.rotation.set(0.15 + 0.95 * tuck - 0.9 * claw, 0, s * 0.05);
        kn.rotation.set(-0.3 - 0.9 * tuck + 0.3 * claw, 0, 0);
        an.rotation.set(0.4 * tuck, 0, 0);
        to.rotation.set(-0.25 * (1 - tuck) + 0.35 * claw, 0, 0);
    }
    // spine and head: the wingbeat heaves the chest; the head leads, looks at the victim; the jaw opens
    const heave = amp * 0.05 * Math.sin(ph - 0.6);
    B.spine1.rotation.set(-heave * 0.8, 0, 0);
    B.spine2.rotation.set(-heave * 0.6 - 0.1 * F, 0, 0);
    B.neck.rotation.set(0.1 + (a.look || 0) * 0 + 0.18 * F, (a.headYaw || 0) * 0.5, 0);
    B.head.rotation.set(-0.12 - 0.2 * F, (a.headYaw || 0) * 0.5, 0);
    const bite = a.bite > 0 ? Math.sin(Math.PI * Math.min(1, a.bite)) : 0;
    B.jaw.rotation.set(0.05 + c.jaw * 0.75 + bite * 0.5 + (a.snarl ? 0.15 * Math.sin(a.t * 9) : 0), 0, 0);
    // the tail whips behind it
    for (let i = 1; i <= 4; i++) B['tail' + i].rotation.set(-0.1 * (1 - c.tuck) + 0.1 * Math.sin(a.t * 2.4 - i * 0.7 + a.seed) + 0.04 * F, 0.22 * Math.sin(a.t * 1.7 - i * 0.9 + a.seed) * (1 + amp), 0);
}

// ======================================================================= measures
/** The body as a capsule (world): from the hip to the chest. */
export function gargoyleBody(g, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
    const m = g.model;
    m.updateWorldMatrix(true, false);
    const sc = m.scale.x || 1;
    out.a.set(0, -0.15, -0.12).applyMatrix4(m.matrixWorld);
    out.b.set(0, 0.95, 0.2).applyMatrix4(m.matrixWorld);
    out.r = 0.78 * sc * MODEL_SCALE; // (a heavy chest and the wings' roots: a charge or an arrow finds it where it looks big)
    return out;
}

/** Its middle (where spells and arrows are aimed). */
export function gargoyleCenter(g, out = new THREE.Vector3()) {
    const m = g.model;
    m.updateWorldMatrix(true, false);
    return out.set(0, 0.4, 0.05).applyMatrix4(m.matrixWorld);
}

const _cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
/** How far a point is from its body (≤ 0: inside). */
export function gargoyleDist(g, p) {
    const c = gargoyleBody(g, _cap);
    const ab = _v2.subVectors(c.b, c.a);
    const t = Math.max(0, Math.min(1, _v.subVectors(p, c.a).dot(ab) / ab.lengthSq()));
    return _v.copy(c.a).addScaledVector(ab, t).distanceTo(p) - c.r;
}

/** The model's size in metres: {height (toes to the horns' tips), span (wing tip to wing tip), depth}, spread in the bind pose. */
export function gargoyleSize() {
    const m = gargoyleModel(0);
    m.scale.setScalar(MODEL_SCALE);
    m.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const tmp = new THREE.Vector3();
    for (const sm of [m.userData.body, m.userData.mem]) {
        const pos = sm.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) { tmp.fromBufferAttribute(pos, i).multiplyScalar(MODEL_SCALE); box.expandByPoint(tmp); }
    }
    const size = box.getSize(new THREE.Vector3());
    return { height: size.y, span: size.x, depth: size.z, box };
}
