/**
 * CanaryModel.js — the look of the Canaries («Канарики», Canaries.js / CanaryRules.js): small, broad swamp people with huge arms, big
 * flat feet, a heavy brow, pointed ears and a crest of canary-yellow hair; dressed in patched hides edged with yellow feathers, a necklace
 * of bones, a belt with a pouch; mud on their legs and hems. Every one a little different: skin (olive, tan, ochre), hair and beard
 * (canary yellow, ginger, brown, grey; none / short / long / braided), tunic, face paint, scars, warts, a feather crest or a reed hat.
 *
 * Size: ~2.2 m with the crest (a hero is ~4.6 m from foot to crown), shoulders 1.0 m across, arms down to the knees. Feet at local y = 0,
 * the model looks along −Z. Built from swept ovals (limbs, trunk, head) with vertex-coloured mud, mottling and patches — ONE shared
 * material, so FarShape draws a whole camp in a few calls; shapes are cached per look (24 looks, made when first met).
 *
 *   userData: root, hips, torso, head, armL, armR (shoulder pivots), elbowL, elbowR, legL, legR (hip pivots), kneeL, kneeR, hold (where a boulder is held)
 *   poseCanary(model, a) — walk / carry / lift / windup / throw / shove / flinch / dead, all by angles (no clips).
 * Also here: the boulders (3 shapes, a big mossy rock ~1 m), the camp's props (hide tents, bone totems that mark the territory, a fire ring,
 * a bone pile, reeds) and the two things a canary leaves: «Кожа канарика» and «Кость».
 */
import * as THREE from 'three';
import { sweep, keys } from '../game/AnimalModels.js';
import { rng } from './PlantModels.js';

export const CANARY = { H: 2.2, LOOKS: 24, HIP: 0.9, SHOULDER: 1.5, HEAD_Y: 1.74 };
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
/** A smooth pseudo-random of a point (no random calls: every computer draws the same canary). */
const nz = (x, y, z, s = 0) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s * 4.1) * 43758.5453; return v - Math.floor(v); };

// ------------------------------------------------------------------ looks
export const SKINS = [0xc9a374, 0xb99968, 0xa9a468, 0xd2b283, 0x9d9362, 0xb58a5e];
export const HAIRS = [0xe8c92e, 0xe8c92e, 0xdcb824, 0xc8a020, 0xb85a22, 0x5a3c22, 0x9a9a92];
export const TUNICS = [0x5a6a34, 0x4a5a2a, 0x6a5030, 0x9a7a30, 0x56603a, 0x70602e];
/** The look of a canary from a number (the same everywhere). */
export function canaryLook(seed) {
    const r = rng((seed >>> 0) * 2654435761 + 17);
    const n = Math.floor(r() * CANARY.LOOKS);
    const l = rng(n * 977 + 5);
    const look = {
        n, skin: SKINS[Math.floor(l() * SKINS.length)], hair: HAIRS[Math.floor(l() * HAIRS.length)], tunic: TUNICS[Math.floor(l() * TUNICS.length)],
        beard: Math.floor(l() * 4), crest: Math.floor(l() * 3), paint: Math.floor(l() * 4), scar: l() < 0.35, warts: l() < 0.4, ears: 0.9 + l() * 0.4, trimC: l() < 0.7 ? 0xf2d33a : 0xe0e0d0,
        eye: [0x2a1c10, 0x4a3a18, 0x2a3a24][Math.floor(l() * 3)], pouch: l() < 0.7, fur: l() < 0.5, bones: 5 + Math.floor(l() * 5),
    };
    look.size = 0.94 + r() * 0.13; // (per canary: a little taller or shorter)
    return look;
}

// ------------------------------------------------------------------ material (one for all)
let _mat = null;
export function canaryMaterial() {
    if (!_mat) { _mat = new THREE.MeshLambertMaterial({ vertexColors: true }); _mat.name = 'canary'; }
    return _mat;
}
const _geos = new Map();
const cached = (key, make) => { let g = _geos.get(key); if (!g) { g = make(); g.userData.keep = true; _geos.set(key, g); } return g; };
const mesh = (parent, geo, x = 0, y = 0, z = 0, shadow = true) => { const m = new THREE.Mesh(geo, canaryMaterial()); m.position.set(x, y, z); m.castShadow = shadow; parent.add(m); return m; };
const group = (parent, name, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; };

/** A solid of one colour (vertex colours): an ellipsoid / a cone / a box, `mottle` for a hide's patchiness. */
function solid(kind, sx, sy, sz, col, { seg = 8, mottle = 0.12, seed = 1 } = {}) {
    let g;
    if (kind === 'cone') g = new THREE.ConeGeometry(1, 1, seg, 1);
    else if (kind === 'box') g = new THREE.BoxGeometry(1, 1, 1);
    else g = new THREE.SphereGeometry(1, seg, Math.max(4, seg - 2));
    g.scale(sx, sy, sz);
    const p = g.getAttribute('position'), c = [];
    for (let i = 0; i < p.count; i++) {
        const k = 1 + (nz(p.getX(i) * 20, p.getY(i) * 20, p.getZ(i) * 20, seed) - 0.5) * mottle * 2, shade = 0.86 + 0.14 * smooth(-sy, sy, p.getY(i));
        c.push(col[0] * k * shade, col[1] * k * shade, col[2] * k * shade);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.computeVertexNormals();
    return g;
}
/** A solid placed (translated / turned) — for merging small details into one geometry. */
function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = geo.clone();
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));
    return g;
}
/** Several geometries (position, normal, colour) as one. */
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

// ------------------------------------------------------------------ the canary
/** Builds one canary of a look (a Group; feet at y = 0). */
export function canaryModel(look) {
    const L = look, skin = hex(L.skin), hair = hex(L.hair), tun = hex(L.tunic), trim = hex(L.trimC);
    const dark = mul(skin, 0.7), key = 'cn' + L.n;
    const model = new THREE.Group(); model.name = 'canary';
    const root = group(model, 'root');
    const hips = group(root, 'hips', 0, CANARY.HIP, 0);

    // --- the skin's colouring: mottled, a little pink in the cheeks, mud up the legs, dirt in the creases
    const skinAt = (p, extra = 0) => {
        const m = 0.92 + 0.16 * nz(p.x * 7, p.y * 7, p.z * 7, 1);
        return mixc(mul(skin, m), hex(0x4a3a24), clamp01(extra));
    };

    // --- legs: short, thick, bowed; the knee on its pivot; big flat feet
    const legs = [];
    for (const s of [1, -1]) {
        const leg = group(hips, s > 0 ? 'legR' : 'legL', 0.22 * s, 0, 0);
        const thigh = cached(key + 'thigh', () => sweep([v3(0, 0.04, 0), v3(0.0, -0.22, -0.02), v3(0, -0.44, 0)], keys([[0, 0.17, 0.17, 0], [0.5, 0.18, 0.18, 0], [1, 0.14, 0.14, 0]]), {
            rings: 8, sides: 10, color: (t, a, p) => { const c = mixc(tun, skin, smooth(0.55, 1, t)); return mul(c, 0.9 + 0.2 * nz(p.x * 9, p.y * 9, p.z * 9, 2)); } }));
        mesh(leg, thigh);
        const knee = group(leg, s > 0 ? 'kneeR' : 'kneeL', 0, -0.44, 0);
        const shin = cached(key + 'shin', () => sweep([v3(0, 0, 0), v3(0, -0.2, 0.03), v3(0, -0.4, 0)], keys([[0, 0.135, 0.14, 0], [0.4, 0.15, 0.15, 0.01], [1, 0.1, 0.1, 0]]), {
            rings: 8, sides: 10, color: (t, a, p) => { const w = 0.5 + 0.5 * Math.sin(p.y * 40 + a * 3); return mixc(mixc(skin, hex(0x4a3a24), 0.18 + 0.1 * w), hex(0x3c2e1c), clamp01(t * t * 0.75)); } })); // (calves caked with mud)
        mesh(knee, shin);
        mesh(knee, cached(key + 'foot' + s, () => merge([
            solid('sphere', 0.15, 0.09, 0.27, mixc(skin, hex(0x4a3a24), 0.5), { seg: 8, seed: 5 }), // the broad flat foot
            ...[-0.07, 0, 0.07].map((tx) => placed(solid('sphere', 0.045, 0.045, 0.06, mixc(skin, hex(0x3c2e1c), 0.35), { seg: 6 }), tx * s, -0.01, -0.28)), // toes
            placed(solid('sphere', 0.13, 0.07, 0.09, mixc(skin, hex(0x3c2e1c), 0.5), { seg: 6 }), 0, 0.0, 0.18), // the heel
        ])), 0, -0.36, -0.07);
        legs.push({ leg, knee });
    }
    // --- the torso: a barrel — broad shoulders, a belly, a tunic of patched hides with a feathered hem
    const torso = group(hips, 'torso', 0, 0.02, 0);
    const trunk = cached(key + 'trunk', () => sweep([v3(0, 0, 0), v3(0, 0.3, 0), v3(0, 0.66, 0)], keys([[0, 0.31, 0.25, 0], [0.18, 0.34, 0.29, 0.02], [0.55, 0.39, 0.27, 0], [0.85, 0.44, 0.24, 0], [1, 0.3, 0.2, 0]]), {
        rings: 12, sides: 16, side: v3(1, 0, 0),
        color: (t, a, p) => {
            // patches of hides: blocks of slightly different tone; the hem darker with mud; skin shows at the chest in a V
            const patch = nz(Math.floor(p.x * 5.5), Math.floor(p.y * 6), Math.floor(p.z * 5.5), 7), c0 = mul(tun, 0.78 + 0.4 * patch);
            const front = Math.sin(a) < -0.2 ? 1 : 0; // (the chest side)
            const c1 = mixc(c0, hex(0x3c2e1c), clamp01(smooth(0.2, 0, t) * 0.45 + 0.1 * (1 - t)));
            return mixc(c1, skin, front * smooth(0.82, 0.98, t) * 0.9);
        },
        bump: (t, a) => 1 + 0.03 * Math.sin(t * 22 + a * 5) * Math.sin(a * 3 + t * 9) } )); // (creased hides)
    mesh(torso, trunk, 0, 0.0, 0);
    // the belly and chest read as muscle: pecs and a round belly
    mesh(torso, cached(key + 'belly', () => merge([
        placed(solid('sphere', 0.22, 0.2, 0.12, mixc(tun, hex(0x2c2418), 0.15), { seg: 8, seed: 11 }), 0, 0.2, -0.2),
    ])), 0, 0, 0);
    // belt, pouch, knife; the feathered hem (a fringe of yellow feathers and strips of hide)
    mesh(torso, cached(key + 'belt', () => {
        const parts = [];
        const ring = (y, rx, rz, h, col, n) => { for (let i = 0; i < n; i++) { const a = (i / n) * TAU; parts.push(placed(solid('box', 0.085, h, 0.05, col, { mottle: 0.1, seed: i }), Math.sin(a) * rx, y, Math.cos(a) * rz, 0, a, 0)); } };
        ring(0.1, 0.33, 0.27, 0.05, hex(0x3a2614), 18); // belt
        parts.push(placed(solid('box', 0.07, 0.07, 0.03, hex(0xc8b050), { seed: 3 }), 0, 0.1, -0.29)); // the buckle
        if (L.pouch) parts.push(placed(solid('sphere', 0.1, 0.12, 0.08, hex(0x5a3a1c), { seed: 4 }), 0.28, 0.0, -0.2), placed(solid('box', 0.11, 0.03, 0.09, hex(0x3a2614), { seed: 5 }), 0.28, 0.1, -0.2));
        parts.push(placed(solid('cone', 0.025, 0.14, 0.02, hex(0xd0d0c0), { seg: 4 }), -0.27, -0.03, -0.17, 0, 0, Math.PI)); // a bone knife
        // hem: strips of hide hanging, every third one a yellow feather
        for (let i = 0; i < 20; i++) {
            const a = (i / 20) * TAU, f = i % 3 === 0;
            parts.push(placed(solid(f ? 'cone' : 'box', f ? 0.03 : 0.07, f ? 0.12 : 0.1, 0.02, f ? trim : mul(tun, 0.7 + 0.3 * nz(i, 1, 2, 4)), { seg: 4, seed: i }), Math.sin(a) * 0.31, -0.03, Math.cos(a) * 0.26, 0.1, a, f ? Math.PI : 0));
        }
        return merge(parts);
    }), 0, 0, 0);
    // fur / feathers over the shoulders (some wear a fur collar of yellow plumes)
    mesh(torso, cached(key + 'collar', () => {
        const parts = [];
        const n = L.fur ? 16 : 11;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU, rr = 0.34 + 0.03 * Math.sin(i * 2);
            parts.push(placed(solid('cone', 0.05, L.fur ? 0.16 : 0.2, 0.025, L.fur ? mixc(hex(0x6a5030), hex(0x8a7048), nz(i, 2, 1, 5)) : trim, { seg: 4, seed: i }), Math.sin(a) * rr, 0.63, Math.cos(a) * (rr * 0.72), -0.45 * Math.cos(a), a, Math.sin(a) * 0.4));
        }
        return merge(parts);
    }), 0, 0, 0);
    // the necklace: a cord and a string of bones, teeth and a claw
    mesh(torso, cached(key + 'neckl', () => {
        const parts = [];
        const n = L.bones;
        for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n, a = (t - 0.5) * 2.5, kind = i % 3;
            const x = Math.sin(a) * 0.26, y = 0.62 - 0.13 * Math.cos(a * 0.9) , z = -0.19 - 0.03 * Math.cos(a);
            parts.push(placed(solid(kind === 1 ? 'cone' : 'sphere', 0.022, kind === 1 ? 0.09 : 0.06, 0.022, hex(kind === 2 ? 0xe8e0c8 : 0xdcd2b0), { seg: 5, seed: i }), x, y - 0.03, z, 0.2, 0, -a * 0.6 + (kind === 1 ? Math.PI : 0)));
            parts.push(placed(solid('box', 0.01, 0.04, 0.01, hex(0x3a2614), { seed: i }), x, y + 0.01, z, 0.1, 0, 0));
        }
        return merge(parts);
    }), 0, 0, 0);

    // --- arms: huge — a thick upper arm, a forearm with knotty muscles, a big fist
    const arms = [];
    for (const s of [1, -1]) {
        const arm = group(torso, s > 0 ? 'armR' : 'armL', 0.5 * s, 0.6, 0);
        mesh(arm, cached(key + 'shoulder', () => merge([placed(solid('sphere', 0.17, 0.15, 0.16, mixc(tun, hex(0x3a2614), 0.1), { seg: 8, seed: 6 }), 0, 0.01, 0)])));
        mesh(arm, cached(key + 'upper', () => sweep([v3(0, 0, 0), v3(0, -0.22, 0), v3(0, -0.44, 0)], keys([[0, 0.14, 0.14, 0], [0.35, 0.165, 0.16, 0], [0.7, 0.14, 0.14, 0], [1, 0.115, 0.115, 0]]), {
            rings: 8, sides: 10, color: (t, a, p) => { const c = skinAt(p); return mul(c, 0.94 + 0.1 * Math.sin(a * 2 + t * 5)); } })));
        const elbow = group(arm, s > 0 ? 'elbowR' : 'elbowL', 0, -0.44, 0);
        mesh(elbow, cached(key + 'fore', () => merge([
            sweep([v3(0, 0, 0), v3(0, -0.2, -0.01), v3(0, -0.4, 0)], keys([[0, 0.12, 0.12, 0], [0.3, 0.145, 0.14, 0], [1, 0.12, 0.11, 0]]), { rings: 8, sides: 10, color: (t, a, p) => { const w = 0.5 + 0.5 * Math.sin(p.y * 30 + a * 2); return mixc(skinAt(p), mul(skin, 0.75), w * 0.18); } }),
            // the wrist wrap of hide
            placed(solid('box', 0.135, 0.045, 0.125, mul(tun, 0.7), { seed: 8 }), 0, -0.36, 0),
        ])));
        const fist = mesh(elbow, cached(key + 'hand', () => merge([
            solid('sphere', 0.14, 0.12, 0.13, mixc(skin, dark, 0.2), { seg: 8, seed: 9 }), // the palm
            ...[-0.07, -0.025, 0.025, 0.07].map((fx) => placed(solid('sphere', 0.033, 0.05, 0.04, mixc(skin, dark, 0.25), { seg: 6 }), fx, -0.1, -0.06)), // fingers curled
            placed(solid('sphere', 0.04, 0.045, 0.045, mixc(skin, dark, 0.2), { seg: 6 }), s * 0.115, -0.03, -0.07), // the thumb
        ])), 0, -0.47, 0);
        void fist;
        arms.push({ arm, elbow });
    }

    // --- the head: big and round-ish, a heavy jaw, a flat broad nose, pointed ears
    const neck = mesh(torso, cached(key + 'neck', () => sweep([v3(0, 0, 0), v3(0, 0.1, 0)], keys([[0, 0.14, 0.13, 0], [1, 0.12, 0.12, 0]]), { rings: 3, sides: 10, color: (t, a, p) => skinAt(p) })), 0, 0.68, 0);
    void neck;
    const head = group(torso, 'head', 0, 0.82, -0.02);
    mesh(head, cached(key + 'skull', () => sweep([v3(0, -0.2, 0), v3(0, 0.02, 0), v3(0, 0.3, 0)], keys([
        [0, 0.07, 0.09, 0.03], [0.1, 0.15, 0.15, 0.01], [0.3, 0.215, 0.205, 0], [0.55, 0.235, 0.22, 0], [0.8, 0.2, 0.19, 0], [1, 0.07, 0.07, 0],
    ]), {
        rings: 12, sides: 16,
        color: (t, a, p) => {
            const c = skinAt(p, 0), front = Math.sin(a) < -0.4;
            const cheek = front ? smooth(0.2, 0.4, t) * smooth(0.6, 0.4, t) * 0.18 : 0;
            let col = mixc(c, hex(0xd0786a), cheek);
            const px = p.x;
            if (L.paint === 1 && front && Math.abs(Math.abs(px) - 0.1) < 0.025 && p.y > -0.02 && p.y < 0.12) col = mixc(col, hex(0x3a4a2a), 0.8); // war stripes of swamp mud
            if (L.paint === 2 && front && p.y > 0.04 && p.y < 0.09) col = mixc(col, hex(0xf2d33a), 0.85); // a yellow band across the eyes
            if (L.paint === 3 && front && Math.abs(px) < 0.035) col = mixc(col, hex(0xe8e0c8), 0.8); // a pale stripe down the nose
            return col;
        },
        bump: (t, a) => 1 + 0.05 * Math.exp(-(((t - 0.55) / 0.1) ** 2)) * Math.max(0, -Math.sin(a)) + 0.03 * Math.exp(-(((t - 0.15) / 0.1) ** 2)),
    })), 0, 0.1, 0);
    mesh(head, cached(key + 'face', () => {
        const p = [];
        const flesh = mixc(skin, hex(0xc0705a), 0.18);
        p.push(placed(solid('sphere', 0.07, 0.06, 0.07, mixc(skin, hex(0xb86050), 0.2), { seg: 8, seed: 12 }), 0, 0.07, -0.24)); // the nose: broad and flat
        p.push(placed(solid('sphere', 0.03, 0.03, 0.03, hex(0x3a2418), { seg: 5 }), 0.035, 0.05, -0.285), placed(solid('sphere', 0.03, 0.03, 0.03, hex(0x3a2418), { seg: 5 }), -0.035, 0.05, -0.285)); // nostrils
        p.push(placed(solid('box', 0.2, 0.05, 0.08, mul(skin, 0.82), { seed: 13 }), 0, 0.17, -0.19)); // the heavy brow ridge
        for (const s of [1, -1]) {
            p.push(placed(solid('sphere', 0.045, 0.034, 0.03, hex(0xeee6d0), { seg: 6 }), 0.085 * s, 0.13, -0.215)); // the eyeball
            p.push(placed(solid('sphere', 0.022, 0.024, 0.02, hex(L.eye), { seg: 5 }), 0.085 * s, 0.13, -0.236)); // the iris
            p.push(placed(solid('box', 0.05, 0.012, 0.03, mul(skin, 0.6), { seed: 2 }), 0.085 * s, 0.168, -0.22, 0.1, 0, -0.15 * s)); // the brow hair
            // ears: big, pointed, a pale inside
            p.push(placed(solid('cone', 0.075 * L.ears, 0.17 * L.ears, 0.03, mixc(skin, hex(0x8a6a48), 0.1), { seg: 5, seed: 3 }), 0.215 * s, 0.14, 0.0, 0.0, 0, -Math.PI / 2.3 * s));
            p.push(placed(solid('cone', 0.04 * L.ears, 0.1 * L.ears, 0.012, hex(0xc48a74), { seg: 4 }), 0.205 * s, 0.14, -0.022, 0.0, 0, -Math.PI / 2.3 * s));
            p.push(placed(solid('sphere', 0.02, 0.02, 0.02, hex(0xe8e0c8), { seg: 5 }), 0.225 * s, 0.06, 0.0)); // a bone earring
        }
        p.push(placed(solid('box', 0.12, 0.022, 0.03, hex(0x4a2418), { seed: 4 }), 0, -0.025, -0.215)); // the mouth: a wide line
        for (const s of [1, -1]) p.push(placed(solid('cone', 0.012, 0.04, 0.012, hex(0xf0ead6), { seg: 4 }), 0.045 * s, -0.01, -0.222, 0, 0, Math.PI)); // two small lower tusks
        if (L.scar) p.push(placed(solid('box', 0.01, 0.1, 0.01, mixc(skin, hex(0xb86050), 0.6), { seed: 5 }), -0.1, 0.1, -0.215, 0, 0, 0.5));
        if (L.warts) for (const [x, y] of [[0.05, 0.02], [-0.12, 0.0], [0.13, 0.06]]) p.push(placed(solid('sphere', 0.016, 0.016, 0.016, mixc(skin, hex(0x7a8a50), 0.5), { seg: 5 }), x, y, -0.225));
        void flesh;
        return merge(p);
    }), 0, 0.1, 0);
    // hair, beard and what sits on the head
    mesh(head, cached(key + 'hair', () => {
        const p = [], r = rng(L.n * 31 + 7);
        const hc = (i) => mul(hair, 0.85 + 0.3 * nz(i, 3, 5, 2));
        // short hair all over the crown, shaggy at the sides
        for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU, up = 0.1 + 0.2 * r(); p.push(placed(solid('cone', 0.05, 0.1 + 0.06 * r(), 0.04, hc(i), { seg: 4 }), Math.sin(a) * 0.17, 0.27 + up * 0.5, Math.cos(a) * 0.15, -0.3 * Math.cos(a), a, 0.3 * Math.sin(a))); }
        if (L.crest === 1 || L.crest === 0) { // a crest of yellow plumes: tall tufts from the brow to the nape
            for (let i = 0; i < 9; i++) { const z = -0.12 + i * 0.03, h = 0.16 + 0.1 * Math.sin((i / 8) * Math.PI); p.push(placed(solid('cone', 0.045, h, 0.025, mul(hex(0xf2d33a), 0.9 + 0.2 * nz(i, 1, 1, 8)), { seg: 4 }), (r() - 0.5) * 0.03, 0.4 + h * 0.4, z, -0.2 + i * 0.04, 0, (r() - 0.5) * 0.3)); }
        } else if (L.crest === 2) { // a reed hat: a wide cone woven of yellow-green straw
            p.push(placed(solid('cone', 0.34, 0.2, 0.34, hex(0xb8a850), { seg: 12, mottle: 0.2, seed: 9 }), 0, 0.4, 0));
            p.push(placed(solid('sphere', 0.34, 0.025, 0.34, hex(0x9a8a3c), { seg: 12, mottle: 0.15 }), 0, 0.3, 0));
        }
        // the beard
        const b = L.beard;
        if (b >= 1) for (let i = 0; i < (b === 1 ? 14 : 22); i++) { const a = (i / (b === 1 ? 14 : 22) - 0.5) * 2.5, len = b === 1 ? 0.08 : 0.16 + 0.1 * r(); p.push(placed(solid('cone', 0.03, len, 0.025, hc(i + 40), { seg: 4 }), Math.sin(a) * 0.14, -0.04 - len * 0.2, -0.17 - 0.03 * Math.cos(a), 0.15, a, Math.PI)); }
        if (b === 3) for (const s of [1, -1]) { for (let k = 0; k < 4; k++) p.push(placed(solid('sphere', 0.035, 0.05, 0.035, hc(k + 60), { seg: 5 }), 0.07 * s, -0.12 - k * 0.07, -0.18, 0, 0, 0)); p.push(placed(solid('box', 0.04, 0.015, 0.04, trim, { seed: 3 }), 0.07 * s, -0.4, -0.18)); }
        if (b >= 1) p.push(placed(solid('sphere', 0.1, 0.025, 0.04, hc(80), { seg: 6 }), 0, 0.0, -0.205)); // the moustache
        return merge(p);
    }), 0, 0.1, 0);

    // --- the boulder's place: held in front of the chest (moved by the pose)
    const hold = group(torso, 'hold', 0, 0.55, -0.55);

    Object.assign(model.userData, { root, hips, torso, head, armR: arms[0].arm, armL: arms[1].arm, elbowR: arms[0].elbow, elbowL: arms[1].elbow, legR: legs[0].leg, legL: legs[1].leg, kneeR: legs[0].knee, kneeL: legs[1].knee, hold, look: L });
    model.scale.setScalar(L.size);
    return model;
}

// ------------------------------------------------------------------ poses (angles only)
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
/**
 * Pose a canary. a = {walk (phase, rad), speed (0…1.4), mode, t (s in this mode), breath (s), look (head yaw, rad), lean}.
 * modes: 'idle' | 'walk' | 'run' | 'sit' | 'lift' (t: 0…LIFT_T) | 'carry' | 'windup' (0…WIND_T) | 'throw' (0…THROW_T) | 'shove' | 'flinch' | 'dead' | 'roar'.
 */
export const POSE_T = { LIFT: 0.95, WIND: 0.6, THROW: 0.42, SHOVE: 0.55, ROAR: 0.9, FLINCH: 0.4 };
export function poseCanary(m, a) {
    const U = m.userData, mode = a.mode || 'idle', t = a.t || 0, sp = a.speed || 0, w = a.walk || 0;
    const s = Math.sin(w), c = Math.cos(w), breath = Math.sin((a.breath || 0) * 2.2);
    let hipY = CANARY.HIP, hipRoll = 0, torsoPitch = 0, torsoYaw = 0, torsoRoll = 0, headYaw = a.look || 0, headPitch = 0;
    // arms: [shoulder x (forward/back), shoulder z (out), elbow x]
    let aR = [0, 0.12, -0.15], aL = [0, -0.12, -0.15];
    let legR = 0, legL = 0, kneeR = 0, kneeL = 0, rootPitch = 0, rootY = 0;
    let holdPos = [0, 0.55, -0.55], holdScale = 1;
    const stride = Math.min(1.4, sp);
    if (mode === 'walk' || mode === 'run' || mode === 'carry') {
        const k = mode === 'run' ? 1.25 : 1;
        legR = s * 0.6 * stride * k; legL = -s * 0.6 * stride * k;
        kneeR = Math.max(0, -c) * 0.7 * stride; kneeL = Math.max(0, c) * 0.7 * stride; // (a leg swinging forward folds its knee)
        hipRoll = Math.sin(w) * 0.09 * stride; // (the waddle: the whole body rocks side to side)
        hipY += Math.abs(Math.cos(w)) * 0.05 * stride - 0.02;
        torsoRoll = -hipRoll * 1.2; torsoYaw = s * 0.12 * stride;
        if (mode !== 'carry') { aR = [-s * 0.5 * stride * k, 0.14, -0.2 - 0.3 * (mode === 'run' ? 1 : 0)]; aL = [s * 0.5 * stride * k, -0.14, -0.2 - 0.3 * (mode === 'run' ? 1 : 0)]; }
        torsoPitch = mode === 'run' ? 0.18 : 0;
    }
    if (mode === 'idle' || mode === 'roar') {
        aR[0] += 0.04 * breath; aL[0] -= 0.04 * breath; torsoPitch += 0.015 * breath;
    }
    if (mode === 'carry' || mode === 'lift' || mode === 'windup' || mode === 'throw') {
        // the boulder: held at the chest in both hands, the arms round it
        const carryA = [-1.15, 0.5, -1.25];
        if (mode === 'carry') { aR = [carryA[0], -carryA[1] * 0.45, carryA[2]]; aL = [carryA[0], carryA[1] * 0.45, carryA[2]]; aR[1] = -0.35; aL[1] = 0.35; torsoPitch = -0.22; holdPos = [0, 0.5, -0.6]; }
        if (mode === 'lift') { // bends down, hands on the rock at the ground, then rises with it
            const k = ease(t / (POSE_T.LIFT * 0.45)), up = ease((t - POSE_T.LIFT * 0.45) / (POSE_T.LIFT * 0.55));
            const down = k * (1 - up);
            hipY = CANARY.HIP - 0.36 * down; torsoPitch = 0.85 * down - 0.22 * up; legR = -0.55 * down; legL = -0.55 * down; kneeR = 1.05 * down; kneeL = 1.05 * down;
            aR = [lerp(-0.7, carryA[0], up) - 0.5 * down, lerp(-0.2, -0.35, up), lerp(-0.3, carryA[2], up)]; aL = [aR[0], -aR[1], aR[2]];
            holdPos = [0, lerp(-0.7, 0.5, up), lerp(-0.55, -0.6, up)];
        }
        if (mode === 'windup') { // the boulder over the head and behind: the whole body bends back
            const k = ease(t / POSE_T.WIND);
            torsoPitch = lerp(-0.22, -0.55, k); hipY -= 0.04 * k; legR = 0.25 * k; legL = -0.35 * k; kneeL = 0.3 * k;
            aR = [lerp(carryA[0], -2.75, k), lerp(-0.35, -0.3, k), lerp(carryA[2], -0.5, k)]; aL = [aR[0], -aR[1], aR[2]];
            holdPos = [0, lerp(0.5, 1.05, k), lerp(-0.6, 0.12, k)];
        }
        if (mode === 'throw') { // the arms swing through, the body follows; the rock leaves at ~35% of the time
            const k = ease(t / POSE_T.THROW);
            torsoPitch = lerp(-0.55, 0.7, k); legR = lerp(0.25, -0.5, k); legL = lerp(-0.35, 0.35, k); kneeR = 0.4 * k;
            aR = [lerp(-2.75, -0.5, k), -0.3, lerp(-0.5, -0.15, k)]; aL = [aR[0], 0.3, aR[2]];
            holdPos = [0, lerp(1.05, 0.7, k), lerp(0.12, -0.9, k)];
            holdScale = k < 0.4 ? 1 : 0.0001; // (let go: the rock flies on its own)
        }
    }
    if (mode === 'shove') { // a haymaker with the right fist, the whole body in it
        const k = ease(t / POSE_T.SHOVE), back = Math.min(1, k * 2.5), fwd = ease((k - 0.4) / 0.6);
        torsoYaw = lerp(0, 0.7, back) - 1.1 * fwd; torsoPitch = 0.25 * fwd; aR = [lerp(0.3, -1.5, fwd) + 0.7 * (1 - fwd) * back, 0.2, lerp(-0.5, -0.1, fwd)]; aL = [-0.3, -0.3, -0.7];
        legR = -0.35 * fwd; legL = 0.3 * fwd;
    }
    if (mode === 'roar') { // chest out, arms wide, head back: «Грр!»
        const k = Math.sin(clamp01(t / POSE_T.ROAR) * Math.PI);
        torsoPitch = -0.3 * k; headPitch = -0.35 * k; aR = [-0.3 * k, 0.9 * k + 0.12, -0.6 * k]; aL = [-0.3 * k, -0.9 * k - 0.12, -0.6 * k];
    }
    if (mode === 'sit') { hipY = 0.46; legR = -1.35; legL = -1.35; kneeR = 1.3; kneeL = 1.3; torsoPitch = 0.12; aR = [-0.5, 0.2, -1.0]; aL = [-0.5, -0.2, -1.0]; }
    if (mode === 'flinch') { const k = Math.sin(clamp01(t / POSE_T.FLINCH) * Math.PI); torsoPitch = -0.3 * k; headPitch = -0.3 * k; aR = [-0.6 * k, 0.5 * k, -0.4]; aL = [-0.6 * k, -0.5 * k, -0.4]; hipY -= 0.05 * k; }
    if (mode === 'dead') { const k = ease(t / 0.8); rootPitch = -1.5 * k; rootY = 0.32 * k; aR = [-0.3, 0.9, -0.2]; aL = [-0.2, -0.9, -0.3]; legR = 0.15; legL = -0.1; kneeR = 0.25; kneeL = 0.1; headPitch = 0.15 * k; hipY = CANARY.HIP; }
    U.hips.position.y = hipY; U.hips.rotation.z = hipRoll;
    U.torso.rotation.set(torsoPitch, torsoYaw, torsoRoll);
    U.head.rotation.set(headPitch - torsoPitch * 0.4, headYaw - torsoYaw * 0.5, -torsoRoll * 0.5);
    U.armR.rotation.set(aR[0], 0, -aR[1]); U.armL.rotation.set(aL[0], 0, -aL[1]);
    U.elbowR.rotation.x = aR[2]; U.elbowL.rotation.x = aL[2];
    U.legR.rotation.x = legR; U.legL.rotation.x = legL; U.kneeR.rotation.x = kneeR; U.kneeL.rotation.x = kneeL;
    U.root.rotation.x = rootPitch; U.root.position.y = rootY;
    U.hold.position.set(holdPos[0], holdPos[1], holdPos[2]); U.hold.scale.setScalar(holdScale);
}

// ------------------------------------------------------------------ boulders
/** The shapes of a rock (3): a rounded, lumpy boulder ~1 m wide with a flat foot, mossy on top, dark and wet at the bottom, cracks. */
export function rockGeometry(v = 0) {
    return cached('rock' + (v % 3), () => {
        const g = new THREE.SphereGeometry(0.5, 22, 15), P = g.getAttribute('position'), c = [], r = rng(7000 + (v % 3) * 31);
        const sx = 1 + 0.12 * (v % 3), sz = 1.05 - 0.07 * (v % 3);
        for (let i = 0; i < P.count; i++) {
            let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
            const l = Math.hypot(x, y, z) || 1, n = nz(x * 5, y * 5, z * 5, v + 3), n2 = nz(x * 14, y * 14, z * 14, v + 9);
            let k = 1 + 0.18 * (n - 0.5) + 0.06 * (n2 - 0.5);
            k *= 1 - 0.1 * Math.max(0, Math.abs(Math.sin(x * 7 + v)) * Math.abs(Math.cos(z * 6)) - 0.7); // (flat faces and edges)
            x = x / l * 0.5 * k * sx; y = y / l * 0.5 * k; z = z / l * 0.5 * k * sz;
            if (y < -0.36) y = -0.36 + (y + 0.36) * 0.15; // (a flat foot: it rests)
            P.setXYZ(i, x, y, z);
        }
        g.computeVertexNormals();
        const N = g.getAttribute('normal');
        for (let i = 0; i < P.count; i++) {
            const x = P.getX(i), y = P.getY(i), z = P.getZ(i), up = N.getY(i);
            const grey = 0.5 + 0.18 * nz(x * 9, y * 9, z * 9, 1) + 0.06 * nz(x * 31, y * 31, z * 31, 2);
            let col = mixc([grey, grey * 0.99, grey * 0.94], hex(0x5a6a38), smooth(0.25, 0.8, up) * (0.45 + 0.45 * nz(x * 6, z * 6, 0, 4)) * 0.8); // moss on top
            col = mixc(col, hex(0x2c2a1e), smooth(-0.15, -0.36, y) * 0.65); // wet dark mud at the foot
            const crack = Math.abs(Math.sin(x * 11 + z * 7 + y * 5 + v)) < 0.035 ? 0.55 : 1; // (a few cracks)
            c.push(col[0] * crack, col[1] * crack, col[2] * crack);
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
        g.computeBoundingSphere();
        return g;
    });
}
export const ROCK_VARIANTS = 3;

// ------------------------------------------------------------------ the camp's props (one merged shape per camp kind; shared)
/** A hide tent (a cone of patched hides on poles with a yellow-feather fringe and a dark door), at (x, z), turned by yaw. */
function tent(x, z, yaw, r, h) {
    const parts = [], c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (px, py, pz) => [x + px * c + pz * s, py, z - px * s + pz * c];
    const hide = solid('cone', r, h, r, hex(0x8a7048), { seg: 10, mottle: 0.2, seed: 21 });
    const gg = hide.getAttribute('position'), cc = hide.getAttribute('color');
    for (let i = 0; i < gg.count; i++) { const patch = nz(Math.floor(gg.getX(i) * 4), Math.floor(gg.getY(i) * 4), Math.floor(gg.getZ(i) * 4), 8); const k = 0.75 + 0.5 * patch; cc.setXYZ(i, cc.getX(i) * k, cc.getY(i) * k * (patch > 0.8 ? 1.1 : 1), cc.getZ(i) * k); }
    parts.push(placed(hide, ...at(0, h / 2, 0)));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + yaw; parts.push(placed(solid('cone', 0.04, h * 0.55, 0.04, hex(0x5a3a1c), { seg: 4 }), x + Math.sin(a) * r * 0.2, h + h * 0.18, z + Math.cos(a) * r * 0.2, Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12)); } // poles crossing at the top
    parts.push(placed(solid('sphere', r * 0.22, h * 0.34, r * 0.1, hex(0x2a2014), { seg: 6 }), ...at(0, h * 0.2, -r * 0.93))); // the dark door
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; parts.push(placed(solid('cone', 0.05, 0.28, 0.02, hex(i % 2 ? 0xf2d33a : 0xe8c32a), { seg: 4 }), x + Math.sin(a) * r * 0.97, 0.22, z + Math.cos(a) * r * 0.97, 0, a, Math.PI)); } // feather fringe
    return parts;
}
/** A bone totem: a tall post with skulls and ribs and yellow feathers — the sign of a canary territory. */
function totem(x, z, yaw, seed) {
    const parts = [], r = rng(seed);
    parts.push(placed(solid('cone', 0.16, 3.4, 0.16, hex(0x5a3e22), { seg: 6, mottle: 0.25, seed: 30 }), x, 1.7, z));
    for (let k = 0; k < 3; k++) {
        const y = 1.2 + k * 0.85;
        parts.push(placed(solid('sphere', 0.2, 0.17, 0.19, hex(0xe0d8bc), { seg: 8, mottle: 0.15, seed: k }), x, y, z - 0.05 * Math.cos(yaw), 0, yaw, 0)); // a skull
        for (const s of [1, -1]) { parts.push(placed(solid('sphere', 0.05, 0.05, 0.03, hex(0x2a2218), { seg: 5 }), x + Math.cos(yaw) * 0.08 * s, y + 0.02, z - Math.sin(yaw) * 0.08 * s - 0.17)); } // eye sockets (rough)
        for (const s of [1, -1]) parts.push(placed(solid('cone', 0.03, 0.55, 0.03, hex(0xdcd2b0), { seg: 4 }), x + 0.3 * s, y - 0.2, z, 0, 0, -0.9 * s)); // ribs / crossed bones
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; parts.push(placed(solid('cone', 0.05, 0.5, 0.02, hex(i % 2 ? 0xf2d33a : 0xe8c32a), { seg: 4 }), x + Math.sin(a) * 0.2, 3.4 + 0.1 * r(), z + Math.cos(a) * 0.2, -Math.cos(a) * 0.5, a, Math.sin(a) * 0.5)); } // a crown of plumes
    return parts;
}
/** Where the camp's tents and totems stand (local, the fire at 0, 0) — the same numbers draw them and stop walkers: {tents: [{x, z, yaw, r, h}], totems: [{x, z, yaw}]}. */
export function campLayout(seed, R = 22) {
    return cached('campLayout' + (seed % 8) + ',' + R, () => {
        const r = rng(9000 + (seed % 8) * 13 + 1), tents = [], totems = [];
        const nt = 2 + Math.floor(r() * 2);
        for (let i = 0; i < nt; i++) { const a = (i / nt) * TAU + r(), d = 5 + r() * 2; tents.push({ x: Math.sin(a) * d, z: Math.cos(a) * d, yaw: a, r: 1.5 + 0.3 * r(), h: 2.2 + 0.4 * r() }); }
        for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; totems.push({ x: Math.sin(a) * R, z: Math.cos(a) * R, yaw: a }); }
        return { tents, totems, userData: { keep: true } };
    });
}
/** The camp's props (shape): tents round the middle, a fire ring of stones, a bone pile, racks with hides, reeds on the water side; totems at the edge of the territory. */
export function campGeometry(seed, R = 22) {
    return cached('camp' + (seed % 8), () => {
        const r = rng(9000 + (seed % 8) * 13), parts = [], lay = campLayout(seed, R);
        for (const t of lay.tents) parts.push(...tent(t.x, t.z, t.yaw, t.r, t.h));
        // the fire ring: stones round a pit of ash and charred logs
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; parts.push(placed(solid('sphere', 0.22, 0.14, 0.2, hex(0x6a6a62), { seg: 6, mottle: 0.25, seed: i }), Math.sin(a) * 1.0, 0.1, Math.cos(a) * 1.0, 0, a, 0)); }
        parts.push(placed(solid('sphere', 0.85, 0.04, 0.85, hex(0x2a2622), { seg: 10, mottle: 0.2 }), 0, 0.03, 0));
        for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.5; parts.push(placed(solid('cone', 0.07, 0.8, 0.07, hex(0x2e2218), { seg: 5 }), Math.sin(a) * 0.3, 0.2, Math.cos(a) * 0.3, 1.2, a, 0)); }
        // a bone pile
        const bx = -3 + r() * 6, bz = -4 - r() * 2;
        for (let i = 0; i < 16; i++) parts.push(placed(solid('cone', 0.04, 0.4 + 0.2 * r(), 0.04, hex(0xe0d8bc), { seg: 4 }), bx + (r() - 0.5) * 1.2, 0.12 + 0.1 * r(), bz + (r() - 0.5) * 1.2, r() * 2, r() * TAU, r() * 2));
        parts.push(placed(solid('sphere', 0.22, 0.18, 0.2, hex(0xe0d8bc), { seg: 8 }), bx, 0.2, bz)); // a skull on top
        // a drying rack: two forked posts, a pole and three hides
        const rx = 4 + r() * 2, rz = -2 + r() * 4;
        for (const s of [1, -1]) parts.push(placed(solid('cone', 0.06, 2.0, 0.06, hex(0x4a3018), { seg: 5 }), rx, 1.0, rz + 1.1 * s));
        parts.push(placed(solid('cone', 0.05, 2.4, 0.05, hex(0x4a3018), { seg: 5 }), rx, 1.95, rz, Math.PI / 2, 0, 0));
        for (let i = 0; i < 3; i++) parts.push(placed(solid('box', 0.04, 0.9, 0.55, mixc(hex(0x8a6a44), hex(0xa08050), r()), { mottle: 0.2, seed: 40 + i }), rx, 1.35, rz + (i - 1) * 0.65));
        // totems at the edge of the territory: four, with a gap to the water side
        lay.totems.forEach((t, i) => parts.push(...totem(t.x, t.z, t.yaw, 5000 + i)));
        return merge(parts);
    });
}
/** Reeds and cattails for the marsh round a camp (a tuft: thin blades with brown heads) — placed by the caller. */
export function reedGeometry() {
    return cached('reeds', () => {
        const parts = [], r = rng(4141);
        for (let i = 0; i < 9; i++) {
            const a = r() * TAU, d = r() * 0.35, h = 1.4 + 1.2 * r();
            parts.push(placed(solid('cone', 0.025, h, 0.025, mixc(hex(0x6a8a3a), hex(0x8a9a4a), r()), { seg: 4 }), Math.sin(a) * d, h / 2, Math.cos(a) * d, (r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25));
            if (i % 2) parts.push(placed(solid('sphere', 0.045, 0.16, 0.045, hex(0x5a3a1e), { seg: 5 }), Math.sin(a) * d + 0.0, h - 0.15, Math.cos(a) * d)); // a cattail
        }
        return merge(parts);
    });
}

// ------------------------------------------------------------------ what a canary leaves
let _hide = null, _bone = null;
/** «Кожа канарика»: a rough patch of hide with ragged edges, a yellow-feather fringe and stitches (~0.5 m). */
export function canaryHideModel() {
    if (!_hide) {
        const r = rng(333), nu = 8, nv = 8, pos = [], col = [], idx = [];
        for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) {
            const u = a / nu * 2 - 1, v = b / nv * 2 - 1, e = Math.abs(u) ** 3 + Math.abs(v) ** 3, rag = 1 - 0.12 * nz(a, b, 1, 2), sc = Math.max(0, 1 - e * 0.15) * rag;
            pos.push(u * 0.26 * sc, 0.02 + 0.03 * Math.sin(u * 5) * Math.cos(v * 4) + 0.02 * nz(a, b, 2, 3), v * 0.2 * sc);
            const k = 0.75 + 0.35 * nz(Math.floor(a / 2), Math.floor(b / 2), 5, 6);
            col.push(0.55 * k, 0.4 * k, 0.26 * k);
        }
        for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) { const i0 = a * (nv + 1) + b; idx.push(i0, i0 + 1, i0 + nv + 1, i0 + 1, i0 + nv + 2, i0 + nv + 1); }
        const base = new THREE.BufferGeometry();
        base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); base.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); base.setIndex(idx); base.computeVertexNormals();
        const fringe = [];
        for (let i = 0; i < 9; i++) fringe.push(placed(solid('cone', 0.025, 0.12, 0.01, hex(0xf2d33a), { seg: 4 }), -0.24 + i * 0.06, 0.04, 0.2 + 0.02 * r(), 1.4, 0, Math.PI));
        _hide = new THREE.Mesh(merge([base, ...fringe]), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    }
    const g = new THREE.Group(); g.add(_hide.clone()); return g;
}
/** «Кость»: a thigh bone with knobbed ends, a little yellowed (~0.5 m). */
export function boneModel() {
    if (!_bone) {
        const p = [], len = 0.5;
        const shaft = sweep([v3(0, 0, 0), v3(0, 0, -len)], keys([[0, 0.032, 0.032, 0], [0.25, 0.024, 0.024, 0], [0.75, 0.024, 0.024, 0], [1, 0.032, 0.032, 0]]), { rings: 6, sides: 8, side: v3(1, 0, 0), color: (t, a, q) => mul(hex(0xe6dcba), 0.9 + 0.12 * nz(q.x * 30, q.y * 30, q.z * 30, 3)) });
        p.push(shaft);
        for (const [z, s] of [[0.0, 1], [-len, -1]]) for (const x of [-0.028, 0.028]) p.push(placed(solid('sphere', 0.036, 0.034, 0.04, hex(0xeee4c4), { seg: 7, mottle: 0.1, seed: 5 }), x, 0, z + 0.015 * s));
        _bone = new THREE.Mesh(merge(p), new THREE.MeshLambertMaterial({ vertexColors: true }));
    }
    const g = new THREE.Group(); const m = _bone.clone(); m.position.z = 0.25; g.add(m); return g;
}

let _pebble = null;
/**
 * «Волшебный камушек» (what a canary now and then carries in its pouch: the price of the pentagram of absolute steadiness — FirmRules.js): a smooth, slightly
 * lumpy river-stone of dark slate-blue with veins of white quartz and fine speckles, flat on the underside; on its top a rune carved in a ring and glowing
 * amber from within (a ring of twelve points, a diamond in the middle, four spokes). ~0.25 m long (the item scale makes it a handful for the hero).
 * Two shared shapes: the stone (lit by the world) and the glowing rune (unlit, so it shines in the dark).
 */
export function magicPebbleModel() {
    if (!_pebble) {
        const RX = 0.125, RY = 0.085, RZ = 0.1;
        const stone = cached('pebble-stone', () => {
            const g = new THREE.SphereGeometry(1, 30, 22), P = g.getAttribute('position'), c = [];
            const base = hex(0x465068), light = hex(0x6a7590), quartz = hex(0xece6d6), warm = hex(0x7a6a58);
            for (let i = 0; i < P.count; i++) {
                const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
                const lump = 1 + 0.09 * (nz(x * 2.6, y * 2.6, z * 2.6, 1) - 0.5) + 0.05 * (nz(x * 6, y * 6, z * 6, 2) - 0.5);
                const flat = y < -0.55 ? 1 + (y + 0.55) * 0.5 : 1; // the underside rests flat
                P.setXYZ(i, x * RX * lump, Math.max(y * RY * lump * flat, -RY * 0.62), z * RZ * lump);
                const patch = nz(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4), 3); // big soft patches of tone
                let k = mixc(base, light, 0.25 + 0.55 * patch);
                if (nz(x * 5, y * 5, z * 5, 4) > 0.78) k = mixc(k, warm, 0.5); // rusty stain
                const vein = Math.abs(Math.sin(x * 7.5 + y * 4.2 - z * 3.1 + 2.2 * nz(x * 2, y * 2, z * 2, 5)));
                if (vein < 0.09) k = mixc(k, quartz, 0.85 - vein * 6); // a vein of quartz
                const sp = nz(x * 40, y * 40, z * 40, 6); // fine speckles
                const f = 0.9 + 0.2 * sp + 0.1 * smooth(-1, 1, y);
                c.push(k[0] * f, k[1] * f, k[2] * f);
            }
            g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
            g.computeVertexNormals();
            return g;
        });
        const rune = cached('pebble-rune', () => {
            const parts = [], top = (x, z) => RY * Math.sqrt(Math.max(0, 1 - (x / RX) ** 2 - (z / RZ) ** 2)) + 0.003;
            const dot = (x, z, s, col) => parts.push(placed(solid('sphere', s * 1.25, s * 0.55, s, col, { seg: 6, mottle: 0.06, seed: 9 }), x, top(x, z), z));
            const amber = hex(0xffb347), hot = hex(0xfff0c0);
            for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; dot(Math.cos(a) * 0.062, Math.sin(a) * 0.05, 0.0085, i % 3 ? amber : hot); } // the ring
            for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; for (const d of [0.02, 0.038]) dot(Math.cos(a) * d, Math.sin(a) * d * 0.8, 0.0065, amber); } // the spokes
            parts.push(placed(solid('box', 0.014, 0.005, 0.014, hot, { seg: 4, mottle: 0.03 }), 0, top(0, 0) + 0.002, 0, 0, Math.PI / 4, 0)); // the diamond
            return merge(parts);
        });
        const body = new THREE.Mesh(stone, new THREE.MeshLambertMaterial({ vertexColors: true }));
        const glow = new THREE.Mesh(rune, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
        body.castShadow = true;
        _pebble = { body, glow };
    }
    const g = new THREE.Group();
    g.add(_pebble.body.clone(), _pebble.glow.clone());
    g.children[0].position.y = 0.054; g.children[1].position.y = 0.054; // (rests on its flat side)
    return g;
}
