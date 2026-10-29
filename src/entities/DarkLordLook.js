/**
 * DarkLordLook.js — the true dark mage's outfit (DarkLord.js, robe code 5 in the worn code): it REPLACES the clothes and the robe.
 * Black-violet cloth with folds and frayed edges, a ragged cloak down the back with runes stitched along it, a high collar, a belt and straps,
 * a deep hood whose shadow hides the face (nobody sees the eyes). The hands stay bare (the fingers are the game).
 *
 * Cheap by the project's rules: every part of one material under one parent is merged into ONE mesh (`mergeParts`), the cloth texture is made
 * once, the materials are shared. Built only when the worn code changes (never in the frame). Measures are the hero's own (torso 1.2 × 1.5 × 0.8,
 * head 1.2, a leg 0.5 thick down to −1.95, the face to −z — the same as the robe in ArmorLook.js).
 */

import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

const _mats = new Map();
let _clothTex = null;

/** The cloth: dark folds (vertical bands) with a fine weave and a few threadbare patches. Made once; null where there is no canvas. */
function clothTexture() {
    if (_clothTex !== null) return _clothTex || null;
    if (typeof document === 'undefined') { _clothTex = false; return null; }
    const W = 64, H = 128, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), img = g.createImageData(W, H);
    let s = 20260;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const fold = 0.5 + 0.5 * Math.sin(x * 0.62 + Math.sin(y * 0.05) * 1.6) * Math.sin(x * 0.17 + 1.3);
        const weave = ((x + y) & 1) * 0.05 + rnd() * 0.07;
        const worn = rnd() < 0.012 ? 0.35 : 0;
        const v = 0.62 + 0.28 * fold + weave - worn;
        const i = (y * W + x) * 4;
        img.data[i] = 255 * Math.min(1, v * 0.98); img.data[i + 1] = 255 * Math.min(1, v * 0.96); img.data[i + 2] = 255 * Math.min(1, v * 1.04); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    _clothTex = new THREE.CanvasTexture(cv);
    _clothTex.wrapS = _clothTex.wrapT = THREE.RepeatWrapping;
    _clothTex.magFilter = THREE.NearestFilter;
    _clothTex.userData = { shared: true };
    return _clothTex;
}

function mat(color, { glow = 0, map = false, basic = false, alpha = 1 } = {}) {
    const key = `${color}|${glow}|${map ? 1 : 0}|${basic ? 1 : 0}|${alpha}`;
    let m = _mats.get(key);
    if (!m) {
        const o = { color };
        if (map) o.map = clothTexture();
        if (basic) m = new THREE.MeshBasicMaterial({ ...o, transparent: alpha < 1, opacity: alpha, side: THREE.DoubleSide, depthWrite: alpha >= 1 });
        else m = new THREE.MeshLambertMaterial({ ...o, emissive: glow ? new THREE.Color(glow) : 0x000000, emissiveIntensity: glow ? 0.9 : 0 });
        m.userData.shared = true;
        _mats.set(key, m);
    }
    return m;
}

const CLOTH = 0x2a2236, CLOTH_DEEP = 0x1a1424, LINING = 0x2c1346, LEATHER = 0x1a1210, METAL = 0x3a3440, RUNE = 0x9a5cff, RUNE_GLOW = 0x6a1fd0;

/** Parts to merge: (parent, material) → [{geo, pos, rot}]. */
class Batch {
    constructor() { this.map = new Map(); }
    add(parent, m, geo, x, y, z, rx = 0, ry = 0, rz = 0) {
        if (!parent) return;
        let e = this.map.get(parent);
        if (!e) this.map.set(parent, (e = new Map()));
        let L = e.get(m);
        if (!L) e.set(m, (L = []));
        L.push({ geo, pos: [x, y, z], rot: [rx, ry, rz] });
    }
    box(parent, m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { this.add(parent, m, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz); }
    flush(list, shadow = true) {
        for (const [parent, byMat] of this.map) {
            for (const [m, parts] of byMat) {
                const mesh = new THREE.Mesh(mergeParts(parts), m);
                mesh.castShadow = shadow && !m.transparent;
                mesh.userData.armor = true;
                parent.add(mesh);
                list.push(mesh);
                for (const p of parts) p.geo.dispose();
            }
        }
    }
}

/** A rune stitched on cloth: two or three small strokes (a pseudo-letter), placed on a plane facing ±z at (x, y). */
function rune(B, parent, m, x, y, z, k, s = 1) {
    const strokes = [[[0, 0, 0.05, 0.22], [0.1, 0.06, 0.05, 0.14]], [[0, 0, 0.05, 0.2], [0, 0.1, 0.18, 0.05]], [[-0.06, 0, 0.05, 0.2], [0.06, 0, 0.05, 0.2], [0, 0.1, 0.16, 0.04]], [[0, 0, 0.18, 0.05], [0, 0.07, 0.05, 0.16]]][k % 4];
    for (const [dx, dy, w, h] of strokes) B.box(parent, m, w * s, h * s, 0.02, x + dx * s, y + dy * s, z);
}

/**
 * The outfit on a hero (`ch`: a VoxelCharacter; `list`: where the meshes are kept so dressArmor can take them off). `hood`: false under a helmet
 * (the helmet is on the head — the hood is not drawn; the cloak and the clothes still are).
 */
export function lordParts(ch, list, hood = true) {
    const T = ch.torso, B = new Batch();
    const cloth = mat(CLOTH, { map: true }), deep = mat(CLOTH_DEEP, { map: true }), lining = mat(LINING, { glow: 0x180830 }), leather = mat(LEATHER), metal = mat(METAL, { glow: 0x100818 });
    const rune_ = mat(RUNE, { glow: RUNE_GLOW });
    const LU = ch.BONE_LENGTH_UPPER || 1, LL = ch.BONE_LENGTH_LOWER || 1;

    // --- the body: a dark tunic, a high stand-up collar, a belt with a clasp and crossed straps, a tabard hanging to the knees
    B.box(T, cloth, 1.34, 1.58, 0.94, 0, 0.02, 0);
    B.box(T, deep, 1.12, 0.46, 1.06, 0, 0.9, 0.02); // the collar (high, round the neck)
    B.box(T, deep, 0.9, 0.3, 0.1, 0, 1.05, -0.5); // …its front peak
    B.box(T, leather, 1.4, 0.2, 1.0, 0, -0.62, 0); // the belt
    B.box(T, metal, 0.26, 0.26, 0.06, 0, -0.62, -0.53); // …a clasp
    B.box(T, rune_, 0.08, 0.08, 0.03, 0, -0.62, -0.57);
    for (const sx of [-1, 1]) B.box(T, leather, 0.12, 1.7, 0.05, sx * 0.3, 0.1, -0.5, 0, 0, -sx * 0.52); // straps crossing the chest
    B.box(T, deep, 0.92, 1.9, 0.08, 0, -1.55, -0.5, 0.03); // the tabard in front…
    B.box(T, cloth, 1.4, 1.4, 1.02, 0, -1.5, 0); // …over the skirt of the tunic (to the knees)
    for (const [i, x] of [-0.6, -0.3, 0, 0.3, 0.6].entries()) B.box(T, deep, 0.26, 0.5 + (i % 2) * 0.28, 0.06, x, -2.22 - (i % 2) * 0.1, -0.5); // a ragged hem
    for (let i = 0; i < 4; i++) rune(B, T, rune_, -0.36 + i * 0.24, -1.7 + (i % 2) * 0.22, -0.55, i);
    B.box(T, rune_, 0.72, 0.03, 0.03, 0, -2.12, -0.55); // a thread along the hem

    // --- the shoulders: a mantle, torn at the edge, with a clasp chain
    for (const sx of [-1, 1]) {
        B.box(T, cloth, 0.78, 0.26, 1.1, sx * 0.72, 0.8, 0.02, 0, 0, sx * 0.22);
        B.box(T, deep, 0.52, 0.16, 1.14, sx * 0.98, 0.58, 0.02, 0, 0, sx * 0.5);
        for (let i = 0; i < 3; i++) B.box(T, deep, 0.1, 0.2 + i * 0.05, 0.1, sx * (0.74 + i * 0.2), 0.52 - i * 0.12, -0.5 + i * 0.5);
    }
    B.box(T, metal, 0.9, 0.06, 0.06, 0, 0.78, -0.52);

    // --- the cloak down the back: strips fanned out, every one of its own length, the lining violet; runes stitched in rows
    const N = 7;
    for (let i = 0; i < N; i++) {
        const u = i / (N - 1) - 0.5, len = 3.0 + ((i * 5) % 7) * 0.12 + (i % 2 ? 0.18 : 0), x = u * 1.62;
        const rz = u * 0.16, rx = 0.05 + Math.abs(u) * 0.05;
        B.box(T, deep, 0.27, len, 0.07, x, 0.68 - len / 2, 0.58 + Math.abs(u) * 0.08, rx, 0, rz);
        B.box(T, lining, 0.2, len - 0.1, 0.03, x, 0.64 - len / 2, 0.55 + Math.abs(u) * 0.08, rx, 0, rz); // the lining seen through the gaps
    }
    for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) rune(B, T, rune_, -0.54 + i * 0.36 + (r % 2) * 0.1, -0.2 - r * 0.62, 0.64 + Math.abs(-0.54 + i * 0.36) * 0.07, r + i, 1.1);
    B.box(T, rune_, 1.2, 0.03, 0.03, 0, -2.85, 0.68); // a stitched line near the hem
    B.box(T, rune_, 0.5, 0.5, 0.02, 0, 0.08, 0.66, 0, 0, Math.PI / 4); // a big diamond sigil between the shoulders
    B.box(T, deep, 0.34, 0.34, 0.03, 0, 0.08, 0.665, 0, 0, Math.PI / 4);

    // --- the arms: wide sleeves, leather bracers, the hands bare
    for (const a of [ch.leftArmAnchor, ch.rightArmAnchor]) if (a) B.box(a, cloth, 0.52, 0.52, LU * 0.82, 0, 0, LU * 0.5);
    for (const e of [ch.leftElbowAnchor, ch.rightElbowAnchor]) {
        if (!e) continue;
        B.box(e, cloth, 0.5, 0.5, LL * 0.6, 0, 0, LL * 0.34);
        B.box(e, deep, 0.62, 0.62, LL * 0.34, 0, 0, LL * 0.72); // the wide cuff…
        B.box(e, leather, 0.54, 0.54, 0.16, 0, 0, LL * 0.9); // …a bracer
        B.box(e, rune_, 0.58, 0.04, 0.04, 0, 0.27, LL * 0.92);
        for (const sx of [-1, 1]) B.box(e, deep, 0.1, 0.4, 0.16, sx * 0.26, -0.3, LL * 0.9); // frayed ends
    }

    // --- the legs: dark trousers tucked into tall boots
    for (const p of [ch.leftLegPivot, ch.rightLegPivot]) {
        if (!p) continue;
        B.box(p, cloth, 0.6, 1.1, 0.6, 0, -0.55, 0);
        B.box(p, deep, 0.62, 0.9, 0.62, 0, -1.4, 0);
        B.box(p, leather, 0.66, 0.1, 0.66, 0, -1.04, 0);
        B.box(p, leather, 0.62, 0.34, 0.86, 0, -1.8, -0.1); // the boot's foot
        B.box(p, metal, 0.4, 0.06, 0.06, 0, -1.2, -0.32);
    }

    // --- the hood: a deep shell round the head, a peak that droops back, a cowl round the neck; the face is lost in its shadow
    const H = hood ? ch.head : null;
    if (H) {
        B.box(H, deep, 1.58, 0.16, 1.66, 0, 0.66, 0.04); // the crown
        B.box(H, cloth, 1.58, 1.5, 0.16, 0, 0.0, 0.8); // the back
        for (const sx of [-1, 1]) B.box(H, cloth, 0.16, 1.46, 1.64, sx * 0.8, 0.0, 0.0); // the sides
        B.box(H, deep, 1.5, 0.2, 0.62, 0, 0.6, -0.8, 0.22); // the brim over the brow
        for (const sx of [-1, 1]) B.box(H, deep, 0.14, 0.96, 0.6, sx * 0.78, -0.02, -0.7, 0, sx * 0.2); // the side flaps in front of the ears
        B.box(H, cloth, 1.6, 0.6, 1.5, 0, -0.78, 0.1); // the cowl
        B.box(H, rune_, 1.0, 0.03, 0.03, 0, 0.72, -1.0); // a stitched line on the brim
        for (const sx of [-1, 1]) rune(B, H, rune_, sx * 0.5, 0.68, -1.06, sx > 0 ? 1 : 2, 0.9);
        const cone = new THREE.ConeGeometry(0.56, 1.2, 6);
        B.add(H, deep, cone, 0, 1.2, 0.5, 0.65, 0, 0); // the peak, bent back
        // the shadow: a soft black veil over the face, inside the brim (the face is never seen — only that something looks out)
        const veil = new THREE.PlaneGeometry(1.2, 1.3);
        B.add(H, mat(0x000000, { basic: true, alpha: 0.9 }), veil, 0, -0.05, -0.64, 0, Math.PI, 0);
        const eyes = new THREE.PlaneGeometry(0.62, 0.07);
        B.add(H, mat(0xb06bff, { basic: true, alpha: 0.85 }), eyes, 0, 0.08, -0.65, 0, Math.PI, 0); // two faint violet glints deep in the hood
    }
    B.flush(list);
}

/** Samples for compiling the shaders while loading: a hero dressed in it (Game.prewarm). */
export function lordSamples() {
    const T = new THREE.Group();
    const ch = { torso: T, head: new THREE.Group(), leftArmAnchor: new THREE.Group(), rightArmAnchor: new THREE.Group(), leftElbowAnchor: new THREE.Group(), rightElbowAnchor: new THREE.Group(), leftLegPivot: new THREE.Group(), rightLegPivot: new THREE.Group() };
    for (const k of Object.keys(ch)) if (k !== 'torso') T.add(ch[k]);
    const list = [];
    lordParts(ch, list, true);
    return [T];
}
