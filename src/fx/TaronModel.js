/**
 * TaronModel.js — the look of the Tarons («Тароны», Taron.js / TaronRules.js): paunchy, fat, reddish men with horns, TWICE a man's size.
 *
 * Measures (m; the hero is ~3.5 m, eyes 3.4): feet at local y = 0, hips 2.0, the belly 3.4 m across, shoulders 4.6 (1.6 either side of the middle),
 * a short thick neck, the head 1.7 tall at 5.5, the horns reach 7.0. The legs are short and bowed, the arms thick (the fists hang at the knees).
 * Looks: red skin of five tones mottled with creases and sweat, a face swollen with fat (puffy cheeks and a double chin, small deep-set eyes under a
 * heavy brow, a pig-like nose with big nostrils, a wide mouth with lower tusks), three kinds of horns (short curved / thick stubs / wide ram-like),
 * four hairstyles, four scars, a nose ring now and then; a ragged loincloth with straps, a leather pauldron, iron bracers and belt plates (worn, rusty).
 * The weapon: a huge axe-hammer — a long haft with leather wraps, a broad notched blade on one side, a studded hammer block on the other, a spike on top.
 *
 * ONE shared material with colours in the vertices (FarShape bakes the whole Taron into a few draws); shapes are cached per look part.
 *   userData: root, hips, torso, head, jaw, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, hold (the right hand: the axe's grip), axe
 *   poseTaron(model, a) — idle / walk / windup / swing / recover / flinch / roar / dead, all by angles (no clips).
 */
import * as THREE from 'three';
import { sweep, keys } from '../game/AnimalModels.js';
import { TARON, taronLook } from '../game/TaronRules.js';

export const TARON_DIM = { HEIGHT: 7.0, HIP: 2.0, SHOULDER: 4.6, HEAD_Y: 5.5, BELLY: 3.4, HORN_TOP: 7.0, HAFT: 6.2 };
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const nz = (x, y, z, s = 0) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s * 4.1) * 43758.5453; return v - Math.floor(v); };
export const TARON_SKINS = [0xb8574a, 0xa84a3c, 0xc4665a, 0x9c4636, 0xb55f48];

let _mat = null;
export function taronMaterial() {
    if (!_mat) { _mat = new THREE.MeshLambertMaterial({ vertexColors: true }); _mat.name = 'taron'; }
    return _mat;
}
const _geos = new Map();
const cached = (key, make) => { let g = _geos.get(key); if (!g) { g = make(); g.userData.keep = true; _geos.set(key, g); } return g; };
const mesh = (parent, geo, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, taronMaterial()); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
const group = (parent, name, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; };

function solid(kind, sx, sy, sz, col, { seg = 8, mottle = 0.1, seed = 1 } = {}) {
    let g;
    if (kind === 'cone') g = new THREE.ConeGeometry(1, 1, seg, 1);
    else if (kind === 'box') g = new THREE.BoxGeometry(1, 1, 1);
    else g = new THREE.SphereGeometry(1, seg, Math.max(4, seg - 2));
    g.scale(sx, sy, sz);
    const p = g.getAttribute('position'), c = [];
    for (let i = 0; i < p.count; i++) {
        const k = 1 + (nz(p.getX(i) * 9, p.getY(i) * 9, p.getZ(i) * 9, seed) - 0.5) * mottle * 2, shade = 0.88 + 0.12 * smooth(-sy, sy, p.getY(i));
        c.push(col[0] * k * shade, col[1] * k * shade, col[2] * k * shade);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.computeVertexNormals();
    return g;
}
function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = geo.clone();
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));
    return g;
}
function merge(list) {
    const pos = [], nor = [], col = [], idx = [];
    for (const g of list) {
        const P = g.getAttribute('position'), N = g.getAttribute('normal'), C = g.getAttribute('color'), base = pos.length / 3;
        for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(C ? C.getX(i) : 1, C ? C.getY(i) : 1, C ? C.getZ(i) : 1); }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(base + i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeBoundingSphere();
    return g;
}
/** A geometry mirrored across X (the triangles turned back so the faces still look out). */
function mirrorX(g) {
    const m = g.clone();
    m.scale(-1, 1, 1);
    const ix = m.index;
    if (ix) for (let i = 0; i < ix.count; i += 3) { const b = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, b); }
    m.computeVertexNormals();
    return m;
}
/** Colours an extruded / lathe geometry by a function of the position (so metal gets rust and nicks). */
function paint(g, fn) {
    const p = g.getAttribute('position'), c = [];
    for (let i = 0; i < p.count; i++) { const k = fn(p.getX(i), p.getY(i), p.getZ(i)); c.push(k[0], k[1], k[2]); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return g;
}

const IRON = hex(0x6a6258), RUST = hex(0x7a4a2a), WOOD = hex(0x5a3c22), LEATHER = hex(0x3a2616), HORN = hex(0xd8cdb0), DARKHORN = hex(0x8a7c60);
const metal = (x, y, z, s) => mixc(mul(IRON, 0.8 + 0.4 * nz(x * 6, y * 6, z * 6, s)), RUST, clamp01(nz(x * 3, y * 3, z * 3, s + 3) * 0.9 - 0.25));

// ------------------------------------------------------------------ the axe-hammer
/** The weapon (a Group): the haft along +Y from the grip (y = 0 at the butt) up 6.2 m; a blade on +X, a hammer on −X, a spike on top. */
export function axeModel(variant = 0) {
    const g = new THREE.Group(); g.name = 'taronAxe';
    const H = TARON_DIM.HAFT;
    mesh(g, cached('axeHaft', () => sweep([v3(0, 0, 0), v3(0, H * 0.5, 0), v3(0, H, 0)], keys([[0, 0.17, 0.17, 0], [0.12, 0.13, 0.13, 0], [0.9, 0.12, 0.12, 0], [1, 0.14, 0.14, 0]]), {
        rings: 14, sides: 10, color: (t, a, p) => { const wrap = (t > 0.12 && t < 0.34) || (t > 0.55 && t < 0.66) ? 1 : 0; const w = mul(WOOD, 0.85 + 0.3 * nz(p.x * 20, p.y * 6, p.z * 20, 1)); return wrap ? mixc(w, LEATHER, 0.8 + 0.2 * Math.sin(p.y * 40)) : w; } })));
    // the head: a socket, the blade (a broad notched crescent), the hammer block with studs, a spike
    const headY = H - 0.9;
    mesh(g, cached('axeHead' + variant, () => {
        const parts = [];
        const bw = [2.3, 2.6, 2.0][variant], bh = [2.5, 2.2, 2.8][variant];
        const sh = new THREE.Shape();
        sh.moveTo(0.15, -0.55); sh.lineTo(bw * 0.45, -bh * 0.5 - 0.1); sh.quadraticCurveTo(bw * 1.08, -bh * 0.1, bw * 0.98, 0.1);
        sh.lineTo(bw * 0.9, 0.18); sh.lineTo(bw * 1.0, 0.34); // a notch in the edge
        sh.quadraticCurveTo(bw * 1.05, bh * 0.35, bw * 0.45, bh * 0.52 + 0.1); sh.lineTo(0.15, 0.55); sh.closePath();
        const bl = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 1, steps: 1 });
        bl.translate(0, 0, -0.1);
        parts.push(paint(bl, (x, y, z) => { const edge = smooth(bw * 0.6, bw * 1.0, x); return mixc(metal(x, y, z, 1), hex(0xb8b4aa), edge * 0.6); }));
        parts.push(placed(solid('box', 1.1, 0.95, 0.62, IRON, { seed: 3, mottle: 0.2 }), -0.62, 0, 0)); // the hammer block
        for (const [sy, sz] of [[0.28, 0.2], [-0.28, 0.2], [0.28, -0.2], [-0.28, -0.2]]) parts.push(placed(solid('cone', 0.12, 0.16, 0.12, hex(0x4a4640), { seg: 5 }), -1.2, sy, sz, 0, 0, Math.PI / 2)); // studs
        parts.push(placed(solid('box', 0.55, 1.1, 0.5, IRON, { seed: 5 }), 0, 0, 0)); // the socket
        parts.push(placed(solid('cone', 0.2, 1.1, 0.2, hex(0x8a8a84), { seg: 6 }), 0, 0.95 + bh * 0.05, 0)); // the spike on top
        const m = merge(parts.map((q) => (q.getAttribute('color') ? q : paint(q, () => IRON))));
        return m;
    }), 0, headY, 0);
    g.userData.length = H + 0.3;
    return g;
}

// ------------------------------------------------------------------ the Taron
export function taronModel(look) {
    const L = look || taronLook(1);
    const skin = hex(L.skin), skinKey = TARON_SKINS.indexOf(L.skin);
    const dark = mul(skin, 0.7), key = 'tr' + skinKey;
    const model = new THREE.Group(); model.name = 'taron';
    const root = group(model, 'root');
    const hips = group(root, 'hips', 0, TARON_DIM.HIP + 0.26, 0); // (the feet's soles sit at y = 0)
    const sk = (p, k = 0.1, s = 2) => mul(skin, 1 - k * 0.5 + k * nz(p.x * 3, p.y * 3, p.z * 3, s)); // mottled red hide

    // --- legs: short, thick, bowed; wide flat feet with blunt toes
    const legs = [];
    for (const s of [1, -1]) {
        const leg = group(hips, s > 0 ? 'legR' : 'legL', 0.85 * s, -0.1, 0);
        mesh(leg, cached(key + 'thigh', () => sweep([v3(0, 0.1, 0), v3(0.0, -0.5, -0.05), v3(0, -1.05, 0)], keys([[0, 0.62, 0.62, 0], [0.5, 0.58, 0.58, 0], [1, 0.46, 0.46, 0]]), {
            rings: 8, sides: 12, color: (t, a, p) => mixc(sk(p, 0.14, 4), hex(0x5a2a22), smooth(0.7, 1, t) * 0.2) })));
        const knee = group(leg, s > 0 ? 'kneeR' : 'kneeL', 0, -1.05, 0);
        mesh(knee, cached(key + 'shin', () => sweep([v3(0, 0, 0), v3(0, -0.45, 0.06), v3(0, -0.9, 0)], keys([[0, 0.44, 0.45, 0], [0.4, 0.5, 0.5, 0], [1, 0.34, 0.34, 0]]), {
            rings: 8, sides: 12, color: (t, a, p) => { const hair = 0.5 + 0.5 * Math.sin(p.y * 30 + a * 4); return mixc(sk(p, 0.14, 5), hex(0x3c1e18), 0.16 * hair + clamp01(t * t * 0.28)); } })));
        mesh(knee, cached(key + 'foot' + s, () => merge([
            solid('sphere', 0.5, 0.26, 0.82, mixc(skin, hex(0x3a1a14), 0.3), { seg: 8, seed: 5 }),
            ...[-0.3, -0.1, 0.1, 0.3].map((tx) => placed(solid('sphere', 0.13, 0.12, 0.17, mixc(skin, hex(0x2c1612), 0.4), { seg: 6 }), tx * s, -0.04, -0.78)),
            ...[-0.3, -0.1, 0.1, 0.3].map((tx) => placed(solid('cone', 0.05, 0.12, 0.05, hex(0x2a2018), { seg: 4 }), tx * s, -0.02, -0.96, -Math.PI / 2, 0, 0)), // blunt black claws
        ])), 0, -0.82, -0.18);
        legs.push({ leg, knee });
    }

    // --- the torso: a huge pear — wide belly hanging over the loincloth, sagging chest, broad sloping shoulders, creases
    const torso = group(hips, 'torso', 0, 0.1, 0);
    mesh(torso, cached(key + 'trunk' + L.belly.toFixed(1), () => sweep([v3(0, -0.1, 0), v3(0, 1.2, -0.1), v3(0, 2.7, 0)], keys([[0, 1.5, 1.2, 0], [0.22, 1.82 * L.belly, 1.7 * L.belly, -0.1], [0.5, 1.72, 1.4, 0], [0.78, 1.7, 1.15, 0], [1, 1.15, 0.85, 0]]), {
        rings: 16, sides: 20, side: v3(1, 0, 0),
        color: (t, a, p) => {
            const crease = Math.pow(Math.max(0, Math.sin(p.y * 7.5 + Math.sin(a * 2) * 0.8)), 6) * smooth(0.0, 0.5, t) * (1 - smooth(0.55, 0.8, t)); // belly folds
            const sweat = 0.04 * Math.sin(p.x * 11 + p.y * 7);
            const navel = Math.exp(-(p.x * p.x + (p.y - 0.75) * (p.y - 0.75)) * 28) * (Math.sin(a) < -0.2 ? 1 : 0);
            return mul(mixc(sk(p, 0.12, 6), hex(0x501e18), clamp01(crease * 0.5 + navel * 0.9)), 1 + sweat);
        },
        bump: (t, a) => 1 + 0.025 * Math.sin(t * 17 + a * 4) * Math.sin(a * 2 + t * 5) })), 0, 0, 0);
    // loincloth + straps + belt plates (garb 0…2)
    mesh(torso, cached('garb' + L.garb, () => {
        const parts = [];
        for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; parts.push(placed(solid('box', 0.36, 0.78, 0.07, mul(LEATHER, 0.8 + 0.5 * nz(i, 2, 3, 1)), { seed: i, mottle: 0.2 }), Math.sin(a) * 1.55, 0.05, Math.cos(a) * 1.3, 0.08, a, 0)); } // ragged hanging strips
        parts.push(placed(solid('box', 1.7, 0.2, 1.4, LEATHER, { seed: 8 }), 0, 0.5, 0)); // the belt (a flat band, thin)
        for (let i = 0; i < 9; i++) { const a = -1.3 + i * 0.33; parts.push(placed(solid('box', 0.22, 0.26, 0.06, L.garb === 2 ? hex(0x6a6258) : hex(0x5a4a30), { seed: i }), Math.sin(a) * 1.66, 0.5, -Math.cos(a) * 1.4 * 0.95, 0, -a, 0)); }
        parts.push(placed(solid('box', 0.38, 0.38, 0.1, hex(0x8a6a2a), { seed: 4 }), 0, 0.5, -1.45)); // a brass buckle
        // two crossing straps over the chest
        parts.push(placed(solid('box', 0.2, 2.35, 0.1, LEATHER, { seed: 9 }), -0.6, 1.9, -1.16, 0.16, 0, -0.7), placed(solid('box', 0.2, 2.35, 0.1, mul(LEATHER, 0.85), { seed: 10 }), 0.6, 1.9, -1.16, 0.16, 0, 0.7));
        return merge(parts);
    }), 0, 0, 0);

    // --- the neck and the head: swollen with fat
    const neck = group(torso, 'neck', 0, 2.55, -0.05);
    mesh(neck, cached(key + 'neck', () => sweep([v3(0, -0.3, 0), v3(0, 0.1, -0.05), v3(0, 0.5, -0.12)], keys([[0, 0.95, 0.85, 0], [1, 0.8, 0.75, 0]]), { rings: 5, sides: 14, color: (t, a, p) => sk(p, 0.12, 7) })), 0, 0, 0);
    const head = group(neck, 'head', 0, 0.35, -0.12);
    head.userData.pivot = true;
    const headKey = key + 'h' + L.scar + (L.tusks ? 't' : '') + (L.ring ? 'r' : '');
    mesh(head, cached(headKey, () => {
        const parts = [];
        const HS = skin, shade = mul(skin, 0.78), deep = mixc(skin, hex(0x2a0c0a), 0.6);
        // the skull and puffy cheeks (a wide soft oval), a heavy brow ridge
        parts.push(solid('sphere', 0.95, 0.88, 0.92, HS, { seg: 14, seed: 20, mottle: 0.08 }));
        parts.push(placed(solid('sphere', 0.52, 0.5, 0.48, mul(HS, 1.04), { seg: 10, seed: 21 }), 0.62, -0.28, -0.48), placed(solid('sphere', 0.52, 0.5, 0.48, mul(HS, 1.04), { seg: 10, seed: 22 }), -0.62, -0.28, -0.48)); // cheeks
        parts.push(placed(solid('sphere', 0.68, 0.46, 0.55, shade, { seg: 10, seed: 23 }), 0, -0.72, -0.35)); // the double chin
        parts.push(placed(solid('sphere', 0.5, 0.3, 0.4, mul(HS, 0.92), { seg: 8, seed: 24 }), 0, -1.0, -0.3));
        for (const sx of [1, -1]) parts.push(placed(solid('sphere', 0.5, 0.17, 0.3, shade, { seg: 8, seed: 25, mottle: 0.12 }), 0.38 * sx, 0.17, -0.78, 0.12, 0, -sx * 0.18)); // the brow ridge: two heavy arches (not a band)
        // small deep-set eyes (red-rimmed, a yellow glint), dark sockets
        for (const s of [1, -1]) {
            parts.push(placed(solid('sphere', 0.24, 0.16, 0.14, deep, { seg: 8 }), 0.4 * s, 0.05, -0.82));
            parts.push(placed(solid('sphere', 0.1, 0.085, 0.07, hex(0xd8b030), { seg: 6, mottle: 0.02 }), 0.4 * s, 0.05, -0.9));
            parts.push(placed(solid('sphere', 0.045, 0.06, 0.04, hex(0x1a0808), { seg: 5, mottle: 0 }), 0.4 * s, 0.05, -0.95)); // the pupil
            parts.push(placed(solid('sphere', 0.34, 0.1, 0.16, mul(HS, 0.72), { seg: 6 }), 0.4 * s, -0.12, -0.8)); // the eyebags
            // the ears: large, pointed back
            parts.push(placed(solid('cone', 0.22, 0.6, 0.12, mul(HS, 0.95), { seg: 5, seed: 30 }), 0.98 * s, 0.05, 0.1, 0, 0, -s * 1.15), placed(solid('sphere', 0.14, 0.2, 0.08, deep, { seg: 5 }), 0.93 * s, 0.0, 0.08));
        }
        // the pig-like nose: broad, with big nostrils, optionally ringed
        parts.push(placed(solid('sphere', 0.34, 0.26, 0.32, mul(HS, 1.08), { seg: 10, seed: 26 }), 0, -0.32, -0.96));
        for (const s of [1, -1]) parts.push(placed(solid('sphere', 0.085, 0.07, 0.1, deep, { seg: 6, mottle: 0 }), 0.12 * s, -0.37, -1.2));
        if (L.ring) { const rg = new THREE.TorusGeometry(0.15, 0.03, 6, 14); rg.rotateX(Math.PI / 2); parts.push(placed(paint(rg, () => hex(0xb8923a)), 0, -0.56, -1.12)); }
        // the wide mouth: a dark gash, thick lips, lower tusks
        parts.push(placed(solid('box', 0.9, 0.12, 0.26, deep, { seg: 4, mottle: 0.05 }), 0, -0.64, -0.82));
        parts.push(placed(solid('sphere', 0.5, 0.1, 0.18, mul(HS, 0.85), { seg: 8 }), 0, -0.72, -0.9)); // the lower lip
        if (L.tusks) for (const s of [1, -1]) parts.push(placed(solid('cone', 0.075, 0.38, 0.075, hex(0xeae0c4), { seg: 5, mottle: 0.04 }), 0.34 * s, -0.5, -0.98, 0.15, 0, -s * 0.12));
        // scars (a pale seam): 1 cheek, 2 brow, 3 chest is on the body (below)
        if (L.scar === 1) parts.push(placed(solid('box', 0.04, 0.5, 0.05, hex(0xd8a090), { mottle: 0 }), 0.7, -0.25, -0.72, 0.1, 0.4, 0.5));
        if (L.scar === 2) parts.push(placed(solid('box', 0.04, 0.4, 0.05, hex(0xd8a090), { mottle: 0 }), -0.45, 0.32, -0.84, 0, 0.3, -0.3));
        void dark;
        return merge(parts);
    }), 0, 0.5, 0);
    // jaw is the head's lower part: a small separate pivot lets the mouth open for the roar
    const jaw = group(head, 'jaw', 0, -0.55, -0.5);
    jaw.visible = false; // (the roar is a head tilt + the whole head; the jaw pivot is kept for the pose math)

    // horns (3 kinds), hair (4 kinds)
    mesh(head, cached('horns' + L.hornKind, () => {
        const parts = [];
        const path = [
            [v3(0, 0, 0), v3(0.25, 0.5, 0.05), v3(0.18, 1.0, -0.12)], // short curved
            [v3(0, 0, 0), v3(0.15, 0.3, 0), v3(0.12, 0.55, 0)], // thick stubs
            [v3(0, 0, 0), v3(0.55, 0.15, 0.1), v3(0.8, 0.7, -0.2), v3(0.55, 1.15, -0.45)], // wide ram-like
        ][L.hornKind];
        const w = [0.2, 0.3, 0.24][L.hornKind];
        const sw = sweep(path, keys([[0, w, w, 0], [0.5, w * 0.8, w * 0.8, 0], [1, w * 0.12, w * 0.12, 0]]), { rings: 10, sides: 8, color: (t, a, p) => mixc(DARKHORN, HORN, smooth(0.0, 1.0, t) * 0.8 + 0.1 * Math.sin(p.y * 28)) });
        parts.push(placed(sw, 0.6, 0.62, -0.1, 0, 0, -0.25), placed(mirrorX(sw), -0.6, 0.62, -0.1, 0, 0, 0.25));
        return merge(parts);
    }), 0, 0, 0);
    if (L.hair) mesh(head, cached('hair' + L.hair, () => {
        const parts = [], c = hex(0x1c1210);
        if (L.hair === 1) { parts.push(placed(solid('sphere', 0.26, 0.2, 0.26, c, { seg: 8, seed: 40 }), 0, 0.9, 0.12), placed(solid('cone', 0.2, 0.36, 0.2, c, { seg: 6 }), 0, 1.15, 0.12)); }
        if (L.hair === 2) for (const s of [1, -1]) for (let i = 0; i < 5; i++) parts.push(placed(solid('cone', 0.07, 0.4, 0.07, c, { seg: 4, seed: i }), 0.88 * s, 0.3 - i * 0.1, 0.25 + i * 0.05, 0.4, 0, -s * (1.1 + 0.1 * i)));
        if (L.hair === 3) for (let i = 0; i < 9; i++) parts.push(placed(solid('cone', 0.07, 0.34, 0.07, c, { seg: 4, seed: i }), 0, 0.88 - i * 0.04, 0.5 - i * 0.12, -0.2, 0, 0));
        return merge(parts);
    }), 0, 0, 0);
    // chest scar on the body
    if (L.scar === 3) mesh(torso, cached('chestScar', () => merge([placed(solid('box', 0.05, 0.9, 0.05, hex(0xd8a090), { mottle: 0 }), -0.4, 1.9, -1.12, 0.1, 0, 0.5)])), 0, 0, 0);
    // pauldron (garb ≥ 1): a leather-and-iron plate over the right shoulder with rivets
    if (L.garb >= 1) mesh(torso, cached('pauldron', () => merge([
        placed(solid('sphere', 0.95, 0.5, 0.85, mul(LEATHER, 1.1), { seg: 10, seed: 50 }), 1.75, 2.62, 0, 0, 0, -0.35),
        ...[0, 1, 2, 3, 4].map((i) => placed(solid('sphere', 0.07, 0.07, 0.07, hex(0x8a7a5a), { seg: 5 }), 1.2 + i * 0.28, 2.9 - Math.abs(i - 2) * 0.05, -0.55 + (i % 2) * 0.05)),
        placed(solid('box', 1.2, 0.18, 1.1, metal(0, 0, 0, 2), { seg: 4, seed: 51, mottle: 0.2 }), 1.75, 2.9, 0, 0, 0, -0.35),
    ])), 0, 0, 0);

    // --- arms: thick, hairy forearms, iron bracers (the bracers worn on the forearm), a fist the size of a head
    const arms = [];
    for (const s of [1, -1]) {
        const arm = group(torso, s > 0 ? 'armR' : 'armL', 1.55 * s, 2.35, 0);
        mesh(arm, cached(key + 'upper', () => sweep([v3(0, 0.1, 0), v3(0.0, -0.75, 0), v3(0, -1.5, 0)], keys([[0, 0.72, 0.72, 0], [0.3, 0.68, 0.68, 0], [0.7, 0.55, 0.55, 0], [1, 0.46, 0.46, 0]]), {
            rings: 8, sides: 12, color: (t, a, p) => sk(p, 0.14, 9) })));
        const elbow = group(arm, s > 0 ? 'elbowR' : 'elbowL', 0, -1.5, 0);
        mesh(elbow, cached(key + 'fore' + (L.garb === 2 ? 'b' : ''), () => {
            const parts = [sweep([v3(0, 0.1, 0), v3(0, -0.7, -0.04), v3(0, -1.4, 0)], keys([[0, 0.5, 0.5, 0], [0.4, 0.48, 0.48, 0], [1, 0.4, 0.4, 0]]), { rings: 7, sides: 12, color: (t, a, p) => mixc(sk(p, 0.14, 10), hex(0x3a140e), 0.18 * (0.5 + 0.5 * Math.sin(p.y * 35 + a * 5))) })];
            // iron bracers: bands with rivets, rust (all of them have at least a leather cuff)
            parts.push(placed(paint(new THREE.CylinderGeometry(0.5, 0.46, 0.55, 12, 1, true), (x, y, z) => L.garb === 2 ? metal(x, y, z, 6) : mul(LEATHER, 1 + 0.3 * nz(x * 8, y * 8, z * 8, 1))), 0, -0.9, 0));
            for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; parts.push(placed(solid('sphere', 0.045, 0.045, 0.045, hex(0x9a8a5a), { seg: 4 }), Math.sin(a) * 0.5, -0.7, Math.cos(a) * 0.5)); }
            return merge(parts);
        }), 0, 0, 0);
        // the fist: a block of knuckles with the thumb
        mesh(elbow, cached(key + 'fist' + s, () => merge([
            solid('sphere', 0.5, 0.42, 0.5, mul(skin, 0.95), { seg: 9, seed: 12 }),
            ...[-0.3, -0.1, 0.1, 0.3].map((fx, i) => placed(solid('sphere', 0.13, 0.16, 0.15, mul(skin, 0.9), { seg: 6, seed: i }), fx, -0.2, -0.38)),
            placed(solid('sphere', 0.14, 0.15, 0.22, mul(skin, 0.95), { seg: 6 }), 0.46 * s, -0.05, -0.1),
            placed(solid('sphere', 0.1, 0.1, 0.1, hex(0x3a1a14), { seg: 5 }), 0.2, -0.3, -0.5), // knuckle callus
        ])), 0, -1.55, 0);
        arms.push({ arm, elbow });
    }
    const hold = group(arms[0].elbow, 'hold', 0, -1.55, -0.15);
    const axe = axeModel(L.axe);
    // the haft crosses the fist, the head is up and forward: the axe rests on the shoulder when idle (pose turns it)
    axe.rotation.set(0, 0, 0);
    axe.position.set(0, -1.05, 0);
    hold.add(axe);
    model.scale.setScalar(L.size * 1.06); // (the 1.06 brings the average to the 7 m of the horns' tips)
    const U = model.userData;
    Object.assign(U, {
        root, hips, torso, neck, head, jaw, armR: arms[0].arm, armL: arms[1].arm, elbowR: arms[0].elbow, elbowL: arms[1].elbow, legR: legs[0].leg, legL: legs[1].leg, kneeR: legs[0].knee, kneeL: legs[1].knee, hold, axe, look: L,
        farRadius: 6,
    });
    model.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
    return model;
}

// ------------------------------------------------------------------ the pose
const lerp = (a, b, t) => a + (b - a) * t;
/**
 * Poses a Taron by angles. a: { mode, t (seconds in the state), p (0…1 progress of windup/swing/recover), walk (phase), speed (m/s), breath, side ('blade'|'hammer'), look (head yaw), dead (0…1 fall) }
 * Arm angles: rotation.x > 0 lifts the arm forward (the model looks along −Z); .z swings it out.
 */
export function poseTaron(m, a) {
    const U = m.userData, mode = a.mode || 'idle', p = clamp01(a.p || 0), sp = Math.min(1, (a.speed || 0) / TARON.WALK), w = a.walk || 0;
    const s = Math.sin(w), c = Math.cos(w), br = Math.sin((a.breath || 0) * 1.6);
    let rootY = 0, rootRoll = 0, rootPitch = 0, torsoYaw = 0, torsoPitch = 0, torsoRoll = 0, headYaw = a.look || 0, headPitch = 0;
    let aR = [0.35, 0.18, -0.45], aL = [0.5, -0.1, -0.5]; // [shoulder x, shoulder z, elbow x(bend)]
    let legR = 0, legL = 0, kneeR = 0, kneeL = 0;
    let axeRot = [-0.5, 0, 0.9]; // the haft over the shoulder when carried
    const sway = sp * 0.12;
    if (mode === 'walk' || mode === 'hunt') {
        // a heavy, rolling gait: weight shifts to the planted foot, the belly swings, each step drops the body a little
        legR = s * 0.5 * sp; legL = -s * 0.5 * sp; kneeR = Math.max(0, -c) * 0.55 * sp; kneeL = Math.max(0, c) * 0.55 * sp;
        rootY = -Math.abs(s) * 0.22 * sp; rootRoll = s * sway * 0.5; torsoRoll = -s * sway * 0.6; torsoYaw = s * 0.06 * sp; headPitch = Math.abs(s) * 0.03;
        aR = [0.35 + c * 0.05, 0.18, -0.55]; aL = [0.5 - s * 0.1, -0.1, -0.5];
        if (mode === 'hunt') { aR = [0.6, 0.18, -0.9]; aL = [0.75, -0.1, -0.85]; axeRot = [-1.0, 0, 0.35]; torsoPitch = 0.08; headPitch = 0.12; }
    } else if (mode === 'windup') {
        // the axe goes up and back over the shoulder, the body leans back and winds (seen: 0.9 s)
        const k = smooth(0, 1, p);
        const hammer = a.side === 'hammer';
        aR = [lerp(0.4, 2.7, k), lerp(0.18, hammer ? 0.9 : 0.1, k), lerp(-0.5, -0.6, k)]; aL = [lerp(0.5, 2.5, k), lerp(-0.1, hammer ? 0.5 : -0.15, k), lerp(-0.5, -0.8, k)];
        torsoPitch = -0.25 * k; torsoYaw = (hammer ? -0.7 : -0.1) * k; rootY = -0.15 * k; headPitch = -0.1 * k;
        legR = -0.2 * k; legL = 0.25 * k; kneeL = 0.2 * k;
        axeRot = [lerp(-0.5, hammer ? 0.0 : 0.5, k), hammer ? lerp(0, 0.8, k) : 0, lerp(0.9, hammer ? 1.5 : 0.2, k)];
    } else if (mode === 'swing') {
        // the blow: overhead (blade) comes down fast, or across from the side (hammer); eased in (heavy start, fast middle)
        const k = p * p * (3 - 2 * p), hammer = a.side === 'hammer';
        aR = [lerp(2.7, hammer ? 1.2 : 0.2, k), lerp(hammer ? 0.9 : 0.1, hammer ? -0.5 : 0.1, k), -0.35]; aL = [lerp(2.5, hammer ? 1.1 : 0.3, k), lerp(hammer ? 0.5 : -0.15, hammer ? -0.4 : -0.1, k), -0.4];
        torsoPitch = lerp(-0.25, 0.4, k); torsoYaw = hammer ? lerp(-0.7, 0.8, k) : lerp(-0.1, 0.05, k); rootY = lerp(-0.15, -0.35, k); headPitch = lerp(-0.1, 0.2, k);
        legR = lerp(-0.2, 0.35, k); legL = lerp(0.25, -0.1, k); kneeR = 0.25 * k;
        axeRot = [lerp(hammer ? 0.0 : 0.5, hammer ? -1.2 : -2.0, k), hammer ? lerp(0.8, -0.8, k) : 0, lerp(hammer ? 1.5 : 0.2, hammer ? 1.2 : 0.35, k)];
    } else if (mode === 'recover') {
        const k = smooth(0, 1, p);
        aR = [lerp(0.2, 0.4, k), 0.18, lerp(-0.35, -0.5, k)]; aL = [lerp(0.3, 0.5, k), -0.1, -0.5];
        torsoPitch = lerp(0.4, 0.05, k); torsoYaw = lerp(a.side === 'hammer' ? 0.8 : 0.05, 0, k); rootY = lerp(-0.35, 0, k) + br * 0.02; headPitch = lerp(0.2, 0, k);
        axeRot = [lerp(-1.8, -0.5, k), 0, lerp(0.35, 0.9, k)];
    } else if (mode === 'flinch') {
        const k = Math.sin(p * Math.PI);
        torsoPitch = -0.3 * k; headPitch = -0.35 * k; rootY = -0.1 * k; aR = [0.5 + 0.4 * k, 0.3, -0.5]; aL = [0.6 + 0.3 * k, -0.2, -0.5];
    } else if (mode === 'roar') {
        const k = smooth(0, 1, p);
        torsoPitch = -0.35 * k; headPitch = -0.55 * k; aR = [lerp(0.35, 1.9, k), 0.9 * k, -0.4]; aL = [lerp(0.5, 1.9, k), -0.9 * k, -0.4]; rootY = -0.1 * k;
        axeRot = [-0.5, 0, 0.9];
    } else if (mode === 'dead') {
        const k = smooth(0, 1, a.dead || 0);
        rootPitch = -1.55 * k; rootY = lerp(0, 1.0, k); aR = [lerp(0.35, 1.2, k), 0.5 * k, -0.2]; aL = [lerp(0.5, -0.6, k), -0.7 * k, -0.2]; legR = 0.2 * k; legL = -0.1 * k; headPitch = 0.2 * k;
        axeRot = [-0.5, 0, 0.9 + 0.6 * k];
    } else { // idle: breathing belly, slow head turns, the axe resting on the shoulder
        torsoPitch = br * 0.012; rootY = br * 0.03; headYaw += Math.sin((a.breath || 0) * 0.3) * 0.25; headPitch = Math.sin((a.breath || 0) * 0.45) * 0.05; torsoRoll = Math.sin((a.breath || 0) * 0.35) * 0.02;
    }
    U.root.position.y = rootY; U.root.rotation.set(rootPitch, 0, rootRoll);
    U.torso.rotation.set(torsoPitch, torsoYaw, torsoRoll);
    U.head.rotation.set(headPitch, headYaw, 0);
    U.armR.rotation.set(aR[0], 0, -aR[1]); U.elbowR.rotation.set(aR[2], 0, 0);
    U.armL.rotation.set(aL[0], 0, -aL[1]); U.elbowL.rotation.set(aL[2], 0, 0);
    U.legR.rotation.x = legR; U.legL.rotation.x = legL; U.kneeR.rotation.x = kneeR; U.kneeL.rotation.x = kneeL;
    U.axe.rotation.set(axeRot[0], axeRot[1], axeRot[2]);
    if (a.axeGone) U.axe.visible = false; else U.axe.visible = true;
}

/** Samples for the shader pre-warm (Game.prewarm): a Taron near and as one skinned shape. */
export function taronSamples() {
    const m = taronModel(taronLook(3)); poseTaron(m, { mode: 'walk', walk: 1, speed: 2 });
    return [m, taronModel(taronLook(9))];
}

// ------------------------------------------------------------------ what a Taron leaves (items)
let _axeItem = null, _iron = null, _stone = null;
/** «Топор-молот Тарона» as a thing in the hand (~0.55 m: the same axe-hammer, shrunk; the haft along +Y, centred). */
export function taronAxeItemModel() {
    if (!_axeItem) { const a = axeModel(1); a.scale.setScalar(0.085); a.position.y = -0.27; const g = new THREE.Group(); g.add(a); _axeItem = g; }
    return _axeItem.clone();
}
/** «Тароново железо»: a rough lump of dark rust-streaked iron (a hunk torn from a Taron's gear). */
export function taronIronModel() {
    if (!_iron) {
        const parts = [paint(placed(new THREE.IcosahedronGeometry(0.11, 1), 0, 0.09, 0, 0.3, 0.5, 0.1), (x, y, z) => metal(x * 7, y * 7, z * 7, 4)),
            paint(placed(new THREE.IcosahedronGeometry(0.07, 0), 0.1, 0.06, 0.03, 0.2, 0.1, 0.4), (x, y, z) => metal(x * 9, y * 9, z * 9, 5))];
        _iron = new THREE.Mesh(merge(parts), taronMaterial());
    }
    return _iron.clone();
}
/** «Красный камень»: a faceted dull-red stone with a glowing vein, like cooled underworld lava. */
export function redStoneModel() {
    if (!_stone) {
        const g = new THREE.OctahedronGeometry(0.1, 1);
        g.scale(1, 1.25, 0.9);
        paint(g, (x, y, z) => { const v = Math.exp(-Math.pow((x * 0.8 + z * 0.6) * 18, 2)); return mixc(mul(hex(0x7a1c14), 0.8 + 0.4 * nz(x * 20, y * 20, z * 20, 2)), hex(0xff6a2a), v * 0.8); });
        _stone = new THREE.Mesh(g, taronMaterial());
        _stone.position.y = 0.1;
    }
    const gr = new THREE.Group(); gr.add(_stone.clone()); return gr;
}
