/**
 * VillagerModel.js — light voxel people for the castles: builders, farmers,
 * merchants, knights and kings.
 *
 * Same scale and frame as the player's VoxelCharacter: the group origin is the
 * hip point, the feet are at local y = −1.95, the top of a bare head at 2.7,
 * the model looks along −Z. Stand it on the ground the same way as the player:
 *     group.position.y = groundSurfaceY + VILLAGER_FOOT_OFFSET (+ a little)
 *
 * Built for crowds (~40 visible at once):
 *  - every body part is ONE mesh whose geometry is a merge of coloured boxes
 *    (vertex colours) — 8 meshes for a plain villager, ≤ 11 with tool, shield
 *    and cape;
 *  - ONE shared MeshLambertMaterial (vertex colours) for every villager, plus
 *    two shared variants for the hit flash and the highlight — no textures,
 *    no per-instance materials, a single shader program;
 *  - geometries are cached by their content: villagers that look alike (and
 *    all tools / shields of a colour) share the same BufferGeometry objects.
 */

import * as THREE from 'three';
import { SKIN_TONES } from './Appearance.js';

export const ROLES = ['builder', 'farmer', 'merchant', 'knight', 'king'];
export const TOOLS = ['none', 'hammer', 'hoe', 'pitchfork', 'sword', 'bigsword', 'basket', 'pouch'];
export const MODES = ['idle', 'walk', 'run', 'sit', 'bow', 'talk', 'work', 'attack', 'block', 'flee', 'dead', 'cheer'];
/** group.position.y = ground surface + this (feet at local −1.95). */
export const VILLAGER_FOOT_OFFSET = 1.95;
/** Sitting: group.position.y = seat top + this (thighs 0.5 thick; feet reach the floor for a seat 0.7 high). */
export const VILLAGER_SIT_OFFSET = 0.25;
export const DEFAULT_CASTLE_COLOR = 0x2f5fb3;
export const ATTACK_PERIOD = 0.6; // s, one sword swing
export const WORK_PERIOD = 0.9; // s, one hammer / hoe stroke

const LEG_UP = 1.0; // thigh length
const LEG_LOW = 0.95; // shin + foot
const REST_WRIST = -1.1; // tool tilt in the hand: forward and a little up
const DEFAULT_SPEED = { walk: 1.6, run: 5, flee: 5.5 };

// ================================================================ materials
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
MAT.name = 'villager';
const HIT_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xff6060, emissive: 0x8a1010 });
HIT_MAT.name = 'villager-hit';
const HL_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x303030 });
HL_MAT.name = 'villager-highlight';
export const VILLAGER_MATERIALS = { normal: MAT, hit: HIT_MAT, highlight: HL_MAT };

// ============================================================ merged boxes
// A part is a flat list of boxes: [w, h, d, x, y, z, colour, rx, ry, rz] × n
const STRIDE = 10;
function b(L, w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) { L.push(w, h, d, x, y, z, c, rx, ry, rz); }

const _unit = new THREE.BoxGeometry(1, 1, 1);
const U_POS = _unit.attributes.position.array;
const U_NOR = _unit.attributes.normal.array;
const U_IDX = _unit.index.array;
const U_V = U_POS.length / 3; // 24
const _geoCache = new Map();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

/** One BufferGeometry (position, normal, vertex colour) for a box list; cached by content. */
function partGeometry(L) {
    const key = L.join(',');
    const hit = _geoCache.get(key);
    if (hit) return hit;
    const n = L.length / STRIDE;
    const pos = new Float32Array(n * U_V * 3);
    const nor = new Float32Array(n * U_V * 3);
    const col = new Float32Array(n * U_V * 3);
    const idx = new Uint16Array(n * U_IDX.length);
    for (let i = 0; i < n; i++) {
        const o = i * STRIDE;
        _q.setFromEuler(_e.set(L[o + 7], L[o + 8], L[o + 9]));
        _m4.compose(_p.set(L[o + 3], L[o + 4], L[o + 5]), _q, _s.set(L[o], L[o + 1], L[o + 2]));
        _c.setHex(L[o + 6]);
        for (let j = 0; j < U_V; j++) {
            const k = (i * U_V + j) * 3;
            _p.fromArray(U_POS, j * 3).applyMatrix4(_m4).toArray(pos, k);
            _n.fromArray(U_NOR, j * 3).applyQuaternion(_q).toArray(nor, k);
            // a touch of fake ambient occlusion on the undersides
            const dark = U_NOR[j * 3 + 1] < -0.5 ? 0.8 : 1;
            col[k] = _c.r * dark; col[k + 1] = _c.g * dark; col[k + 2] = _c.b * dark;
        }
        for (let j = 0; j < U_IDX.length; j++) idx[i * U_IDX.length + j] = U_IDX[j] + i * U_V;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    _geoCache.set(key, g);
    return g;
}

// ================================================================== colours
const shade = (c, k) => {
    const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
    const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
    const bl = Math.min(255, Math.round((c & 255) * k));
    return (r << 16) | (g << 8) | bl;
};
const STEEL = 0xb8c2cc, STEEL_LIGHT = 0xdde3ea, STEEL_DARK = 0x7d8794;
const GOLD = 0xe2b33c, GOLD_DARK = 0xb8862a;
const RUBY = 0xd0182a, WOOD = 0x8b5a2b, IRON = 0x6f7780, LEATHER = 0x5a3a1e;
const HAIR_COLORS = [0x2b1d14, 0x4a3728, 0x8b5a2b, 0xd9b46c, 0xa83e2a, 0x111111, 0x6b4a2b];
const GREY_HAIR = 0xd8d6cf;
const EYE_COLORS = [0x3b6ea5, 0x5a3a1e, 0x2f6b3a, 0x444444];

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ===================================================================== look
/**
 * A deterministic look for an integer seed.
 * @param {number} seed
 * @param {string} role  one of ROLES
 * @param {boolean} [female]  undefined = decided by the seed (kings are men, knights mostly)
 * @param {{castleColor?: number}} [opts]
 */
export function villagerLook(seed, role = 'farmer', female, opts = {}) {
    if (!ROLES.includes(role)) role = 'farmer';
    const r = rng(((seed | 0) * 7919 + ROLES.indexOf(role) * 104729 + 12345) >>> 0);
    const pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
    if (female == null) female = role === 'king' ? false : role === 'knight' ? r() < 0.2 : r() < 0.45;
    female = !!female;
    const L = {
        seed: seed | 0, role, female,
        castleColor: opts.castleColor ?? DEFAULT_CASTLE_COLOR,
        skin: pick(SKIN_TONES),
        eyes: pick(EYE_COLORS),
        mouth: pick(['smile', 'smile', 'calm', 'grin']),
        hairColor: pick(HAIR_COLORS),
        hair: female ? pick(['long', 'bun', 'braids', 'ponytail']) : pick(['short', 'short', 'bald', 'spiky', 'long']),
        beard: 'none',
        hat: 'none', hatColor: 0x8e2b2b,
        shirt: 0xd8c3a0, pants: 0x5a4632, accent: 0x7a4a24, boots: pick([0x4a3020, 0x3a2a1a, 0x2b2b2b]),
        dress: false, dressColor: 0, sleeves: 'long',
        plume: false, shield: false, tool: 'none',
    };
    const oldK = role === 'king' ? 0.45 : 0.15;
    if (r() < oldK) L.hairColor = GREY_HAIR;
    if (!female) {
        const beardK = role === 'king' ? 0.8 : role === 'knight' ? 0.4 : 0.35;
        if (r() < beardK) L.beard = role === 'king' ? pick(['full', 'full', 'goatee']) : pick(['full', 'goatee', 'moustache']);
    }
    switch (role) {
        case 'builder':
            L.shirt = pick([0xd8c3a0, 0x6b7f99, 0xa0522d, 0xc9b28a, 0x8a9a5b]);
            L.pants = pick([0x5a4632, 0x3f4a5a, 0x6b5a3a]);
            L.accent = pick([0x7a4a24, 0x8b5a2b, 0x6b3e1e]); // leather apron
            L.sleeves = 'rolled';
            if (r() < 0.45) { L.hat = 'cap'; L.hatColor = pick([0xc0392b, 0x2c3e50, 0xd4a017, 0x8a6d4a]); }
            L.tool = 'hammer';
            if (female) { L.dress = r() < 0.7; L.dressColor = pick([0x6b5a3a, 0x7d6b9b, 0x5d7b5a]); }
            break;
        case 'farmer':
            L.shirt = pick([0xe8dcc0, 0x9bb06a, 0xc9a66b, 0x7d9bb8, 0xd98c5f]);
            L.pants = pick([0x6b5a3a, 0x4f6a8a, 0x5d6b3a]);
            L.accent = L.pants;
            if (r() < 0.75) { L.hat = 'straw'; L.hatColor = 0xe3c565; } else if (female) { L.hat = 'scarf'; L.hatColor = pick([0xc0392b, 0x2e86c1, 0xf1c40f, 0xe8e2d6]); }
            if (female) { L.dress = r() < 0.9; L.dressColor = pick([0x8e5a3a, 0x5d7b5a, 0x9b4a4a, 0x4f6a8a]); L.tool = pick(['basket', 'basket', 'hoe']); } else L.tool = pick(['hoe', 'pitchfork']);
            break;
        case 'merchant':
            L.shirt = pick([0xf2ecd8, 0xe8d8b0, 0xf4f0ea]);
            L.accent = pick([0x8e2b6b, 0x2b5f8e, 0x1f7a5a, 0xb03a2e, 0x6a3d9a]); // vest
            L.pants = pick([0x3a2f4a, 0x2c3e50, 0x4a3a2a]);
            if (r() < 0.55) { L.hat = 'beret'; L.hatColor = shade(L.accent, 0.7); }
            if (female) { L.dress = true; L.dressColor = L.accent; }
            L.boots = pick([0x5a2d0c, 0x2b2b2b]);
            break;
        case 'knight':
            L.hat = r() < 0.6 ? 'helm' : 'openhelm';
            L.plume = r() < 0.55;
            L.shield = r() < 0.6;
            L.tool = 'sword';
            L.boots = STEEL_DARK;
            break;
        case 'king':
            L.hat = 'crown';
            L.tool = 'bigsword';
            L.boots = STEEL_DARK;
            L.accent = 0xb0202a; // cape
            if (L.hair === 'spiky') L.hair = 'long';
            break;
    }
    return L;
}

// ==================================================================== parts
/** Head pivot at the neck: the head box is 1.2³ centred at y 0.6, face at z −0.6. */
function headBoxes(L) {
    const B = [];
    const s = L.skin, hc = L.hairColor, cc = L.castleColor;
    b(B, 1.2, 1.2, 1.2, 0, 0.6, 0, s);
    const helm = L.hat === 'helm', open = L.hat === 'openhelm';
    if (!helm) {
        // eyes, brows, nose, mouth
        const browC = shade(hc === GREY_HAIR ? 0x8a8478 : hc, 0.85);
        for (const sx of [-1, 1]) {
            b(B, 0.26, 0.22, 0.04, sx * 0.27, 0.66, -0.61, 0xffffff);
            b(B, 0.13, 0.2, 0.05, sx * 0.23, 0.65, -0.615, L.eyes === 0x444444 ? 0x222222 : shade(L.eyes, 0.8));
            b(B, 0.32, 0.07, 0.04, sx * 0.27, 0.85, -0.61, browC);
            if (L.female) { b(B, 0.3, 0.05, 0.05, sx * 0.27, 0.78, -0.615, 0x222222); b(B, 0.18, 0.08, 0.03, sx * 0.4, 0.43, -0.605, 0xf08a8a); }
            if (!open) b(B, 0.08, 0.24, 0.18, sx * 0.63, 0.58, 0.05, shade(s, 0.92)); // ears
        }
        b(B, 0.16, 0.22, 0.1, 0, 0.5, -0.64, shade(s, 0.86)); // nose
        const zM = L.beard === 'full' || L.beard === 'goatee' ? -0.67 : -0.61;
        if (L.mouth === 'grin') { b(B, 0.38, 0.13, 0.04, 0, 0.29, zM, 0x5a1f1f); b(B, 0.28, 0.05, 0.05, 0, 0.32, zM - 0.005, 0xffffff); }
        else if (L.mouth === 'calm') b(B, 0.28, 0.07, 0.04, 0, 0.28, zM, 0x8a3a3a);
        else { b(B, 0.3, 0.07, 0.04, 0, 0.27, zM, 0x8a3a3a); b(B, 0.07, 0.07, 0.04, -0.18, 0.31, zM, 0x8a3a3a); b(B, 0.07, 0.07, 0.04, 0.18, 0.31, zM, 0x8a3a3a); }
        // beard
        const bc = hc;
        if (L.beard === 'full') {
            b(B, 1.22, 0.42, 0.12, 0, 0.18, -0.6, bc);
            b(B, 0.8, 0.3, 0.12, 0, -0.08, -0.58, bc);
            b(B, 0.1, 0.55, 0.8, -0.62, 0.35, -0.15, bc); b(B, 0.1, 0.55, 0.8, 0.62, 0.35, -0.15, bc);
            b(B, 0.56, 0.1, 0.06, 0, 0.38, -0.67, shade(bc, 0.9));
        } else if (L.beard === 'goatee') {
            b(B, 0.38, 0.32, 0.1, 0, 0.12, -0.63, bc);
            b(B, 0.56, 0.1, 0.06, 0, 0.38, -0.665, bc);
        } else if (L.beard === 'moustache') {
            b(B, 0.56, 0.1, 0.08, 0, 0.38, -0.65, bc);
            b(B, 0.1, 0.16, 0.08, -0.28, 0.31, -0.65, bc); b(B, 0.1, 0.16, 0.08, 0.28, 0.31, -0.65, bc);
        }
    }
    // hair (not under a closed helmet; only what sticks out under an open one)
    const covered = helm || open;
    const top = () => { b(B, 1.28, 0.24, 1.28, 0, 1.2, 0.02, hc); b(B, 1.28, 0.14, 0.1, 0, 1.05, -0.62, hc); };
    const backShort = () => b(B, 1.28, 0.6, 0.16, 0, 0.92, 0.6, hc);
    if (!helm) {
        switch (L.hair) {
            case 'short':
                if (!covered) { top(); b(B, 0.1, 0.4, 0.9, -0.63, 0.98, 0.12, hc); b(B, 0.1, 0.4, 0.9, 0.63, 0.98, 0.12, hc); }
                backShort();
                break;
            case 'bald':
                b(B, 1.26, 0.3, 0.14, 0, 0.75, 0.6, hc);
                b(B, 0.1, 0.3, 0.6, -0.63, 0.75, 0.25, hc); b(B, 0.1, 0.3, 0.6, 0.63, 0.75, 0.25, hc);
                break;
            case 'spiky':
                if (!covered) { top(); for (const [x, z] of [[-0.35, -0.3], [0.35, -0.3], [0, 0.05], [-0.35, 0.4], [0.35, 0.4]]) b(B, 0.26, 0.3, 0.26, x, 1.42, z, hc); }
                backShort();
                break;
            case 'long':
                if (!covered) { top(); b(B, 0.1, 1.0, 1.0, -0.64, 0.65, 0.1, hc); b(B, 0.1, 1.0, 1.0, 0.64, 0.65, 0.1, hc); }
                if (L.female) b(B, 1.3, 1.7, 0.22, 0, 0.35, 0.62, hc); else b(B, 1.3, 1.3, 0.2, 0, 0.55, 0.62, hc);
                break;
            case 'bun':
                if (!covered) { top(); b(B, 0.5, 0.45, 0.5, 0, 1.4, 0.35, hc); }
                backShort();
                break;
            case 'braids':
                if (!covered) top();
                backShort();
                for (const sx of [-1, 1]) { b(B, 0.24, 1.1, 0.24, sx * 0.5, 0.05, 0.6, hc); b(B, 0.3, 0.1, 0.3, sx * 0.5, -0.45, 0.6, L.accent); }
                break;
            default: // ponytail
                if (!covered) top();
                backShort();
                b(B, 0.3, 1.0, 0.3, 0, 0.4, 0.8, hc);
                b(B, 0.34, 0.1, 0.34, 0, 0.85, 0.78, 0xc0392b);
                break;
        }
    }
    // hats and helmets
    const hcol = L.hatColor;
    switch (L.hat) {
        case 'straw': {
            b(B, 1.95, 0.08, 1.95, 0, 1.3, 0, hcol);
            b(B, 1.25, 0.36, 1.25, 0, 1.5, 0, hcol);
            b(B, 1.27, 0.12, 1.27, 0, 1.38, 0, 0x9b4a2a);
            b(B, 0.3, 0.05, 0.3, 0.7, 1.33, -0.6, shade(hcol, 0.8)); // frayed bits
            break;
        }
        case 'cap':
            b(B, 1.32, 0.3, 1.32, 0, 1.25, 0, hcol);
            b(B, 1.0, 0.07, 0.5, 0, 1.13, -0.85, shade(hcol, 0.7));
            b(B, 0.2, 0.1, 0.2, 0, 1.43, 0, shade(hcol, 0.7));
            break;
        case 'beret':
            b(B, 1.42, 0.24, 1.42, 0, 1.3, 0.05, hcol);
            b(B, 1.3, 0.1, 1.3, 0, 1.17, 0.02, GOLD);
            b(B, 0.08, 0.42, 0.22, 0.52, 1.5, 0.3, 0xf4f0ea, -0.4, 0, -0.25); // feather
            break;
        case 'scarf':
            b(B, 1.32, 0.35, 1.32, 0, 1.18, 0.02, hcol);
            b(B, 1.32, 0.9, 0.14, 0, 0.75, 0.63, hcol);
            b(B, 0.3, 0.26, 0.2, 0, 0.35, 0.72, shade(hcol, 0.8));
            break;
        case 'helm': {
            b(B, 1.36, 1.36, 1.36, 0, 0.62, 0, STEEL);
            b(B, 1.4, 0.12, 1.4, 0, 0.98, 0, STEEL_LIGHT); // brow band
            b(B, 1.0, 0.1, 0.04, 0, 0.72, -0.69, 0x15181c); // visor slit
            b(B, 0.1, 0.42, 0.04, 0, 0.42, -0.69, 0x15181c); // breathing slot
            for (const y of [0.5, 0.36]) for (const sx of [-1, 1]) b(B, 0.06, 0.06, 0.04, sx * 0.3, y, -0.69, 0x2a2f36); // breathing holes
            b(B, 0.16, 0.12, 1.3, 0, 1.35, 0, STEEL_LIGHT); // crest ridge
            b(B, 1.4, 0.1, 1.4, 0, -0.02, 0, STEEL_DARK); // bottom rim
            if (L.plume) { b(B, 0.2, 0.34, 0.85, 0, 1.55, 0.1, cc); b(B, 0.2, 0.6, 0.22, 0, 1.28, 0.74, cc); }
            break;
        }
        case 'openhelm':
            b(B, 1.38, 0.5, 1.38, 0, 1.1, 0, STEEL);
            b(B, 1.42, 0.12, 1.42, 0, 0.88, 0, STEEL_LIGHT);
            b(B, 0.12, 0.8, 0.9, -0.69, 0.5, 0.15, STEEL); b(B, 0.12, 0.8, 0.9, 0.69, 0.5, 0.15, STEEL);
            b(B, 1.38, 0.9, 0.12, 0, 0.5, 0.69, STEEL);
            b(B, 0.14, 0.5, 0.08, 0, 0.62, -0.68, STEEL_LIGHT); // nose guard
            b(B, 0.14, 0.12, 1.2, 0, 1.38, 0, STEEL_LIGHT);
            if (L.plume) { b(B, 0.2, 0.34, 0.85, 0, 1.58, 0.1, cc); b(B, 0.2, 0.6, 0.22, 0, 1.3, 0.74, cc); }
            break;
        case 'crown': {
            b(B, 1.1, 0.22, 1.1, 0, 1.5, 0, 0xa0101e); // velvet cap inside
            b(B, 1.34, 0.3, 1.34, 0, 1.33, 0, GOLD);
            b(B, 1.38, 0.06, 1.38, 0, 1.2, 0, GOLD_DARK);
            for (const [x, z] of [[-0.57, -0.57], [0.57, -0.57], [-0.57, 0.57], [0.57, 0.57], [0, -0.57], [0, 0.57], [-0.57, 0], [0.57, 0]]) {
                b(B, 0.2, 0.3, 0.2, x, 1.62, z, GOLD);
                b(B, 0.12, 0.12, 0.12, x, 1.82, z, x === 0 || z === 0 ? RUBY : GOLD);
            }
            b(B, 0.2, 0.16, 0.05, 0, 1.33, -0.68, RUBY);
            for (const sx of [-1, 1]) { b(B, 0.12, 0.12, 0.05, sx * 0.42, 1.33, -0.68, 0x2e86c1); b(B, 0.05, 0.16, 0.2, sx * 0.68, 1.33, 0, RUBY); }
            break;
        }
        default: break;
    }
    return B;
}

/** Torso box 1.2×1.5×0.8 centred at 0 (torso group at hip y 0.75). */
function bodyBoxes(L) {
    const B = [];
    const cc = L.castleColor;
    const belt = (y = -0.62, c = LEATHER, buckle = GOLD) => { b(B, 1.24, 0.16, 0.84, 0, y, 0, c); b(B, 0.2, 0.14, 0.04, 0, y, -0.43, buckle); };
    const dress = () => {
        const dc = L.dressColor;
        b(B, 1.38, 1.3, 0.98, 0, -1.3, 0, dc);
        b(B, 1.42, 0.12, 1.02, 0, -1.9, 0, shade(dc, 0.7));
        b(B, 1.26, 0.16, 0.86, 0, -0.62, 0, shade(dc, 0.75));
    };
    if (L.role === 'knight') {
        b(B, 1.2, 1.5, 0.8, 0, 0, 0, STEEL);
        b(B, 1.1, 0.85, 0.08, 0, 0.28, -0.42, STEEL_LIGHT); // chest plate
        b(B, 0.86, 0.16, 0.7, 0, 0.76, 0, STEEL_DARK); // gorget
        b(B, 1.24, 0.35, 0.84, 0, -0.85, 0, STEEL_DARK); // mail skirt
        b(B, 0.78, 1.75, 0.05, 0, -0.45, -0.46, cc); // tabard front
        b(B, 0.78, 1.6, 0.05, 0, -0.35, 0.43, cc); // and back
        b(B, 0.82, 0.08, 0.06, 0, -1.3, -0.46, GOLD);
        const em = cc === 0xffffff || cc === 0xf4f2ec ? 0xc0392b : 0xf4f2ec;
        b(B, 0.12, 0.5, 0.03, 0, -0.2, -0.49, em); b(B, 0.38, 0.12, 0.03, 0, -0.08, -0.49, em); // cross
        b(B, 1.26, 0.14, 0.88, 0, -0.62, 0, 0x4a3020); b(B, 0.2, 0.14, 0.04, 0, -0.62, -0.47, GOLD);
        if (L.female) b(B, 0.9, 0.3, 0.1, 0, 0.35, -0.47, STEEL_LIGHT);
        return B;
    }
    if (L.role === 'king') {
        b(B, 1.2, 1.5, 0.8, 0, 0, 0, STEEL);
        b(B, 1.12, 0.95, 0.08, 0, 0.18, -0.42, GOLD); // golden chest plate
        b(B, 0.86, 0.06, 0.09, 0, -0.1, -0.43, GOLD_DARK);
        b(B, 0.34, 0.34, 0.04, 0, 0.25, -0.47, cc, 0, 0, Math.PI / 4); // castle emblem
        b(B, 0.12, 0.12, 0.04, 0, 0.25, -0.5, RUBY);
        b(B, 1.26, 0.55, 0.86, 0, -0.95, 0, cc); // surcoat skirt
        b(B, 1.3, 0.1, 0.9, 0, -1.2, 0, GOLD);
        b(B, 1.5, 0.32, 1.0, 0, 0.72, 0.02, 0xf4f2ec); // ermine mantle
        for (const [x, z] of [[-0.55, -0.51], [-0.2, -0.51], [0.2, -0.51], [0.55, -0.51], [-0.4, 0.53], [0.4, 0.53]]) b(B, 0.08, 0.14, 0.02, x, 0.7, z, 0x111111);
        b(B, 1.26, 0.16, 0.86, 0, -0.62, 0, GOLD_DARK); b(B, 0.2, 0.16, 0.04, 0, -0.62, -0.44, RUBY);
        for (const sx of [-1, 1]) b(B, 0.16, 0.16, 0.06, sx * 0.55, 0.62, -0.5, GOLD); // cape clasps
        return B;
    }
    b(B, 1.2, 1.5, 0.8, 0, 0, 0, L.shirt);
    b(B, 0.4, 0.12, 0.04, 0, 0.66, -0.41, L.skin); // neckline
    if (L.dress) dress();
    if (L.role === 'builder') {
        const a = L.accent;
        b(B, 0.9, L.dress ? 2.1 : 1.45, 0.06, 0, L.dress ? -0.68 : -0.35, -0.44, a); // leather apron
        b(B, 0.12, 0.4, 0.05, -0.33, 0.56, -0.43, a); b(B, 0.12, 0.4, 0.05, 0.33, 0.56, -0.43, a);
        b(B, 0.5, 0.3, 0.04, 0, -0.55, -0.48, shade(a, 0.78)); // pocket
        b(B, 0.05, 0.28, 0.05, 0.14, -0.38, -0.49, 0xf1c40f); // a pencil
        b(B, 0.06, 0.06, 0.1, -0.12, -0.42, -0.5, IRON); // nails
        if (!L.dress) belt(-0.62, 0x4a3020, IRON);
    } else if (L.role === 'farmer') {
        if (L.dress) {
            b(B, 0.8, 1.1, 0.05, 0, -1.15, -0.51, 0xf2efe6); // white apron
        } else {
            const p = L.pants;
            b(B, 0.75, 0.6, 0.05, 0, 0.0, -0.42, p); // overall bib
            b(B, 0.1, 0.45, 0.05, -0.3, 0.5, -0.42, p); b(B, 0.1, 0.45, 0.05, 0.3, 0.5, -0.42, p);
            b(B, 0.08, 0.08, 0.03, -0.3, 0.28, -0.45, 0xd8c070); b(B, 0.08, 0.08, 0.03, 0.3, 0.28, -0.45, 0xd8c070);
            b(B, 1.22, 0.45, 0.82, 0, -0.55, 0, p); // the overalls' waist
            b(B, 0.22, 0.22, 0.03, -0.32, -0.55, -0.42, shade(p, 1.3)); // patch
        }
    } else { // merchant: vest, gold trim, coin pouch
        const v = L.accent;
        b(B, 1.24, 1.3, 0.84, 0, 0.08, 0, v);
        b(B, 0.36, 1.3, 0.02, 0, 0.08, -0.425, L.shirt);
        b(B, 0.06, 1.3, 0.03, -0.21, 0.08, -0.43, GOLD); b(B, 0.06, 1.3, 0.03, 0.21, 0.08, -0.43, GOLD);
        for (const y of [0.4, 0.1, -0.2]) b(B, 0.07, 0.07, 0.03, 0, y, -0.44, GOLD);
        b(B, 0.5, 0.14, 0.06, 0, 0.7, -0.42, 0xffffff); // collar ruff
        if (!L.dress) belt(-0.62, LEATHER, GOLD);
        b(B, 0.34, 0.38, 0.22, 0.42, -0.84, -0.38, 0x8b5a2b); // coin pouch on the belt
        b(B, 0.22, 0.08, 0.24, 0.42, -0.64, -0.38, GOLD);
        b(B, 0.12, 0.12, 0.03, 0.42, -0.86, -0.5, GOLD);
    }
    return B;
}

/** Shoulder pivot; the arm hangs along −Y (top +0.2, hand down to −1.35). side −1 = left. */
function armBoxes(L, side) {
    const B = [];
    if (L.role === 'knight' || L.role === 'king') {
        const king = L.role === 'king';
        b(B, 0.42, 1.15, 0.42, 0, -0.375, 0, STEEL);
        b(B, 0.62, 0.36, 0.64, side * 0.06, 0.17, 0, king ? GOLD : STEEL_LIGHT); // pauldron
        b(B, 0.56, 0.14, 0.58, side * 0.04, -0.06, 0, king ? GOLD_DARK : STEEL);
        b(B, 0.48, 0.18, 0.48, 0, -0.55, 0, king ? GOLD : STEEL_LIGHT); // elbow
        b(B, 0.5, 0.12, 0.5, 0, -0.92, 0, king ? GOLD : STEEL_DARK);
        b(B, 0.44, 0.42, 0.44, 0, -1.15, 0, STEEL_DARK); // gauntlet
        return B;
    }
    const sleeve = L.role === 'merchant' ? L.shirt : L.shirt;
    if (L.sleeves === 'rolled') {
        b(B, 0.42, 0.6, 0.42, 0, -0.1, 0, sleeve);
        b(B, 0.44, 0.14, 0.44, 0, -0.4, 0, shade(sleeve, 0.85));
        b(B, 0.36, 0.95, 0.36, 0, -0.875, 0, L.skin);
    } else {
        b(B, 0.4, 1.15, 0.4, 0, -0.375, 0, sleeve);
        b(B, 0.43, 0.12, 0.43, 0, -0.92, 0, L.role === 'merchant' ? 0xffffff : shade(sleeve, 0.8));
        b(B, 0.36, 0.4, 0.36, 0, -1.15, 0, L.skin);
    }
    if (L.role === 'merchant') b(B, 0.44, 0.08, 0.44, 0, 0.1, 0, L.accent); // vest shoulder
    return B;
}

function thighBoxes(L) {
    const B = [];
    if (L.role === 'knight' || L.role === 'king') {
        b(B, 0.5, LEG_UP, 0.5, 0, -LEG_UP / 2, 0, STEEL);
        b(B, 0.56, 0.22, 0.58, 0, -0.92, -0.02, L.role === 'king' ? GOLD : STEEL_LIGHT);
        return B;
    }
    b(B, 0.5, LEG_UP, 0.5, 0, -LEG_UP / 2, 0, L.dress ? shade(L.dressColor, 0.6) : L.pants);
    return B;
}

/** Knee pivot; the shin + foot go down to −0.95 (= group y −1.95). */
function shinBoxes(L) {
    const B = [];
    if (L.role === 'knight' || L.role === 'king') {
        b(B, 0.5, 0.62, 0.5, 0, -0.31, 0, STEEL);
        b(B, 0.54, 0.34, 0.66, 0, -0.78, -0.06, STEEL_DARK);
        b(B, 0.4, 0.14, 0.2, 0, -0.88, -0.44, STEEL);
        return B;
    }
    const legC = L.dress ? shade(L.dressColor, 0.6) : L.pants;
    if (L.female && L.dress) {
        b(B, 0.48, 0.73, 0.48, 0, -0.365, 0, legC);
        b(B, 0.52, 0.22, 0.6, 0, -0.84, -0.05, L.boots);
        return B;
    }
    b(B, 0.48, 0.6, 0.48, 0, -0.3, 0, legC);
    b(B, 0.54, 0.36, 0.62, 0, -0.77, -0.06, L.boots);
    b(B, 0.56, 0.1, 0.56, 0, -0.56, 0, shade(L.boots, 1.25));
    return B;
}

/** Cape pivot at the top of the back; hangs along −Y behind the body. */
function capeBoxes(L) {
    const B = [];
    const red = L.accent;
    b(B, 1.3, 2.35, 0.07, 0, -1.17, 0.04, red);
    b(B, 1.32, 0.14, 0.09, 0, -2.3, 0.04, L.castleColor);
    b(B, 0.08, 2.3, 0.09, -0.62, -1.17, 0.04, GOLD); b(B, 0.08, 2.3, 0.09, 0.62, -1.17, 0.04, GOLD);
    b(B, 0.5, 0.5, 0.03, 0, -0.9, 0.09, L.castleColor, 0, 0, Math.PI / 4); // emblem on the back
    b(B, 0.18, 0.18, 0.03, 0, -0.9, 0.11, GOLD);
    return B;
}

/** A heater shield; front faces −Z. */
function shieldBoxes(cc) {
    const B = [];
    b(B, 0.95, 1.1, 0.1, 0, 0.05, 0, cc);
    b(B, 0.68, 0.3, 0.1, 0, -0.62, 0, cc);
    b(B, 0.34, 0.22, 0.1, 0, -0.86, 0, cc);
    b(B, 1.05, 0.1, 0.14, 0, 0.62, 0, STEEL); // rim
    b(B, 0.08, 1.15, 0.14, -0.5, 0.05, 0, STEEL); b(B, 0.08, 1.15, 0.14, 0.5, 0.05, 0, STEEL);
    b(B, 0.08, 0.4, 0.14, -0.36, -0.6, 0, STEEL, 0, 0, -0.5); b(B, 0.08, 0.4, 0.14, 0.36, -0.6, 0, STEEL, 0, 0, 0.5);
    const em = cc === 0xffffff ? 0xc0392b : 0xf4f2ec;
    b(B, 0.14, 0.95, 0.04, 0, -0.05, -0.07, em); b(B, 0.62, 0.14, 0.04, 0, 0.15, -0.07, em); // cross
    b(B, 0.2, 0.2, 0.08, 0, 0.15, -0.1, GOLD); // boss
    b(B, 0.12, 0.5, 0.1, 0, 0.05, 0.1, LEATHER); // strap at the back
    return B;
}

/** Tools: the grip is at the origin, the tool goes along +Y. */
function toolBoxes(kind) {
    const B = [];
    switch (kind) {
        case 'hammer':
            b(B, 0.1, 1.0, 0.1, 0, 0.25, 0, WOOD);
            b(B, 0.24, 0.24, 0.6, 0, 0.78, -0.05, IRON);
            b(B, 0.27, 0.27, 0.08, 0, 0.78, -0.38, 0x9aa3ad);
            break;
        case 'hoe':
            b(B, 0.09, 2.3, 0.09, 0, 0.55, 0, WOOD);
            b(B, 0.14, 0.18, 0.14, 0, 1.68, 0, IRON);
            b(B, 0.46, 0.08, 0.42, 0, 1.68, -0.24, 0x9aa3ad);
            break;
        case 'pitchfork':
            b(B, 0.09, 2.3, 0.09, 0, 0.55, 0, WOOD);
            b(B, 0.5, 0.08, 0.08, 0, 1.72, 0, IRON);
            for (const x of [-0.22, 0, 0.22]) b(B, 0.05, 0.5, 0.05, x, 1.98, 0, 0x9aa3ad);
            break;
        case 'sword':
            b(B, 0.15, 0.15, 0.15, 0, -0.24, 0, GOLD);
            b(B, 0.1, 0.36, 0.1, 0, -0.02, 0, LEATHER);
            b(B, 0.56, 0.1, 0.14, 0, 0.2, 0, STEEL_DARK);
            b(B, 0.14, 1.3, 0.05, 0, 0.9, 0, 0xe4eaf0);
            b(B, 0.04, 1.1, 0.06, 0, 0.85, 0, 0xa8b2be);
            b(B, 0.08, 0.14, 0.05, 0, 1.62, 0, 0xe4eaf0);
            break;
        case 'bigsword':
            b(B, 0.2, 0.2, 0.2, 0, -0.42, 0, GOLD);
            b(B, 0.08, 0.08, 0.22, 0, -0.42, 0, RUBY);
            b(B, 0.12, 0.6, 0.12, 0, -0.05, 0, 0x7a1f1f);
            b(B, 0.9, 0.12, 0.18, 0, 0.3, 0, GOLD);
            b(B, 0.14, 0.24, 0.2, -0.45, 0.36, 0, GOLD); b(B, 0.14, 0.24, 0.2, 0.45, 0.36, 0, GOLD);
            b(B, 0.16, 0.16, 0.22, 0, 0.3, 0, RUBY);
            b(B, 0.2, 2.0, 0.06, 0, 1.38, 0, 0xeef2f6);
            b(B, 0.06, 1.7, 0.07, 0, 1.25, 0, 0xb8c2cc);
            b(B, 0.12, 0.18, 0.06, 0, 2.46, 0, 0xeef2f6);
            break;
        case 'basket': // hangs from the hand (see HANGING)
            b(B, 0.06, 0.06, 0.48, 0, 0.02, 0, WOOD);
            b(B, 0.06, 0.32, 0.06, 0, -0.14, -0.21, WOOD); b(B, 0.06, 0.32, 0.06, 0, -0.14, 0.21, WOOD);
            b(B, 0.46, 0.38, 0.6, 0, -0.5, 0, 0xb07d3a);
            b(B, 0.5, 0.08, 0.64, 0, -0.3, 0, WOOD);
            for (const [x, z, c] of [[-0.1, -0.15, 0xc0392b], [0.08, 0.12, 0xc0392b], [0.05, -0.05, 0x7cb342], [-0.08, 0.16, 0xf1c40f]]) b(B, 0.16, 0.16, 0.16, x, -0.25, z, c);
            break;
        case 'pouch':
            b(B, 0.16, 0.1, 0.14, 0, -0.1, 0, 0x6b3e1e);
            b(B, 0.2, 0.05, 0.18, 0, -0.14, 0, GOLD);
            b(B, 0.3, 0.32, 0.26, 0, -0.32, 0, 0x8b5a2b);
            b(B, 0.12, 0.12, 0.04, 0, -0.32, -0.14, GOLD);
            break;
        default: break;
    }
    return B;
}
const HANGING = new Set(['basket', 'pouch']);

// ==================================================================== model
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b2, t) => a + (b2 - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const POSE_KEYS = ['hx', 'hy', 'headX', 'headY', 'headZ', 'aLX', 'aLZ', 'aRX', 'aRY', 'aRZ', 'wrist', 'lL', 'lR', 'kL', 'kR', 'block', 'cape', 'bounce'];
const _v = new THREE.Vector3();
const _mA = new THREE.Matrix4();
const _mB = new THREE.Matrix4();
const _pA = new THREE.Vector3();
const _pB = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _sc = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _qShieldIdle = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
const _qIdent = new THREE.Quaternion();

export class VillagerModel {
    /**
     * @param {object} look  from villagerLook()
     * @param {{castleColor?: number, tool?: string, shield?: boolean, castShadow?: boolean}} [opts]
     */
    constructor(look, opts = {}) {
        look = { ...(look || villagerLook(0, 'farmer')) };
        if (opts.castleColor != null) look.castleColor = opts.castleColor;
        if (look.castleColor == null) look.castleColor = DEFAULT_CASTLE_COLOR;
        if (opts.shield != null) look.shield = !!opts.shield;
        this.look = look;
        this.role = look.role;
        this._shadow = opts.castShadow !== false;
        this._meshes = [];

        const g = this.group = new THREE.Group();
        g.name = 'villager';
        this.root = new THREE.Group(); // rotates around the feet (falling down)
        this.root.position.y = -VILLAGER_FOOT_OFFSET;
        g.add(this.root);
        this.pelvis = new THREE.Group();
        this.pelvis.position.y = VILLAGER_FOOT_OFFSET;
        this.root.add(this.pelvis);
        this.body = new THREE.Group(); // hip pivot: bending / twisting the upper body
        this.pelvis.add(this.body);
        this.torso = new THREE.Group();
        this.torso.position.y = 0.75;
        this.body.add(this.torso);
        this._mesh(this.torso, bodyBoxes(look));
        this.head = new THREE.Group();
        this.head.position.y = 0.75;
        this.torso.add(this.head);
        this._mesh(this.head, headBoxes(look));

        this.leftArm = new THREE.Group();
        this.leftArm.position.set(-0.8, 0.55, 0);
        this.torso.add(this.leftArm);
        this._mesh(this.leftArm, armBoxes(look, -1));
        this.rightArm = new THREE.Group();
        this.rightArm.position.set(0.8, 0.55, 0);
        this.torso.add(this.rightArm);
        this._mesh(this.rightArm, armBoxes(look, 1));
        this.handSlot = new THREE.Object3D();
        this.handSlot.position.set(0, -1.18, 0);
        this.handSlot.rotation.x = REST_WRIST;
        this.rightArm.add(this.handSlot);

        const leg = (x) => {
            const hip = new THREE.Group();
            hip.position.set(x, 0, 0);
            this.pelvis.add(hip);
            this._mesh(hip, thighBoxes(look));
            const knee = new THREE.Group();
            knee.position.y = -LEG_UP;
            hip.add(knee);
            this._mesh(knee, shinBoxes(look));
            return [hip, knee];
        };
        [this.leftLeg, this.leftKnee] = leg(-0.3);
        [this.rightLeg, this.rightKnee] = leg(0.3);

        this.cape = null;
        if (look.role === 'king') {
            this.cape = new THREE.Group();
            this.cape.position.set(0, 0.72, 0.42);
            this.torso.add(this.cape);
            this._mesh(this.cape, capeBoxes(look), false);
        }
        this.shield = null;
        if (look.shield) {
            this.shield = this._mesh(this.leftArm, shieldBoxes(look.castleColor));
            this.shield.position.set(-0.33, -0.78, 0);
            this.shield.quaternion.copy(_qShieldIdle);
        }

        this.tool = null;
        this.toolKind = 'none';
        this.setHeldTool(opts.tool ?? look.tool ?? 'none');

        // animation state
        this.mode = 'idle';
        this.attackPhase = 0;
        this.strikeNow = false;
        this.workPhase = 0;
        this.workStrikeNow = false;
        this._t = (look.seed | 0) * 0.37 % 10; // villagers do not breathe in sync
        this._phase = 0;
        this._atkT = 0;
        this._workT = 0;
        this._deadT = 0;
        this._deadDone = false;
        this._flashT = 0;
        this._hl = false;
        this._lookYaw = null;
        this._p = {};
        this._tg = {};
        for (const k of POSE_KEYS) { this._p[k] = 0; this._tg[k] = 0; }
        this._p.wrist = REST_WRIST;
        this._p.cape = -0.1;
    }

    _mesh(parent, boxes, shadow = true) {
        const m = new THREE.Mesh(partGeometry(boxes), MAT);
        m.castShadow = this._shadow && shadow;
        parent.add(m);
        this._meshes.push(m);
        return m;
    }

    get meshCount() { return this._meshes.length; }

    // ---------------------------------------------------------------- tools
    /** 'none'|'hammer'|'hoe'|'pitchfork'|'sword'|'bigsword'|'basket'|'pouch' */
    setHeldTool(kind) {
        if (!TOOLS.includes(kind)) kind = 'none';
        if (kind === this.toolKind && (this.tool || kind === 'none')) return;
        if (this.tool) {
            this.handSlot.remove(this.tool);
            this._meshes.splice(this._meshes.indexOf(this.tool), 1);
            this.tool = null;
        }
        this.toolKind = kind;
        if (kind === 'none') return;
        this.tool = new THREE.Mesh(partGeometry(toolBoxes(kind)), this._currentMat());
        this.tool.castShadow = this._shadow;
        if (HANGING.has(kind)) this.tool.rotation.x = -REST_WRIST; // hangs along the arm
        this.handSlot.add(this.tool);
        this._meshes.push(this.tool);
    }

    // ------------------------------------------------------------ materials
    _currentMat() { return this._flashT > 0 ? HIT_MAT : this._hl ? HL_MAT : MAT; }
    _applyMaterial() { const m = this._currentMat(); for (const o of this._meshes) o.material = m; }

    /** Short red tint (~0.15 s) — shared material, nothing is cloned. */
    flashHit(seconds = 0.15) { this._flashT = seconds; this._applyMaterial(); }

    setHighlighted(on) { this._hl = !!on; this._applyMaterial(); }

    // --------------------------------------------------------------- queries
    /** Centre of the head in world space. */
    getHeadWorldPosition(out = new THREE.Vector3()) {
        this.head.updateWorldMatrix(true, false);
        return this.head.localToWorld(out.set(0, 0.6, 0));
    }

    getRightHandWorldPosition(out = new THREE.Vector3()) {
        return this.handSlot.getWorldPosition(out);
    }

    /** Turn the head toward a world point (yaw only, ±70°); null = look ahead again. */
    lookAt(worldPos) {
        if (!worldPos) { this._lookYaw = null; return; }
        this.group.updateWorldMatrix(true, false);
        _v.copy(worldPos);
        this.group.worldToLocal(_v);
        if (_v.x * _v.x + _v.z * _v.z < 1e-6) return;
        const lim = 70 * Math.PI / 180;
        this._lookYaw = Math.max(-lim, Math.min(lim, Math.atan2(-_v.x, -_v.z)));
    }

    // ------------------------------------------------------------ animation
    _enterMode(mode) {
        const prev = this.mode;
        this.mode = mode;
        if (mode === 'attack') { this._atkT = 0; this.attackPhase = 0; }
        if (mode === 'work') this._workT = 0;
        if (mode === 'dead') { this._deadT = 0; this._deadDone = false; }
        if (prev === 'dead') {
            this._deadDone = false;
            this.root.rotation.set(0, 0, 0);
            this.root.position.y = -VILLAGER_FOOT_OFFSET;
            this.leftLeg.rotation.z = this.rightLeg.rotation.z = 0;
        }
    }

    /**
     * @param {number} dt  seconds
     * @param {{speed?: number, mode?: string}} state  speed in m/s along the ground
     */
    update(dt, state = {}) {
        this.strikeNow = false;
        this.workStrikeNow = false;
        if (!(dt > 0)) dt = 0;
        if (dt > 0.25) dt = 0.25;
        const mode = MODES.includes(state.mode) ? state.mode : 'idle';
        if (mode !== this.mode) this._enterMode(mode);
        if (this._flashT > 0) { this._flashT -= dt; if (this._flashT <= 0) { this._flashT = 0; this._applyMaterial(); } }
        if (mode === 'dead') { this._updateDead(dt); return; }

        this._t += dt;
        const t = this._t;
        let speed = state.speed;
        if (speed == null || !Number.isFinite(speed)) speed = DEFAULT_SPEED[mode] || 0;
        if (speed < 0) speed = 0;
        const T = this._tg, P = this._p;
        T.hx = 0; T.hy = 0; T.headX = 0; T.headZ = 0;
        T.headY = mode === 'idle' ? Math.sin(t * 0.45) * 0.25 : 0;
        T.aLX = 0; T.aLZ = -0.06; T.aRX = 0; T.aRY = 0; T.aRZ = 0.06; T.wrist = REST_WRIST;
        T.lL = 0; T.lR = 0; T.kL = 0; T.kR = 0; T.block = 0; T.cape = -0.1; T.bounce = 0;
        let rate = 10;
        let breathe = 0.015;

        // ---- legs: walk / run cycle
        const loco = mode !== 'sit' && mode !== 'bow' && speed > 0.05;
        if (loco) {
            this._phase += dt * (2.0 + 2.4 * speed);
            const amp = Math.min(1, speed / 2.2) * 0.55 + clamp01((speed - 2.2) / 4) * 0.35;
            const s = Math.sin(this._phase), c = Math.cos(this._phase);
            T.lL = s * amp; T.lR = -s * amp;
            T.kL = -Math.max(0, c) * amp * 1.5 - 0.05;
            T.kR = -Math.max(0, -c) * amp * 1.5 - 0.05;
            T.aLX = -s * amp * 0.9; T.aRX = s * amp * 0.9;
            T.hx = -0.2 * clamp01((speed - 2.5) / 3);
            T.cape = -(0.14 + Math.min(0.5, speed * 0.1));
            rate = 28;
            breathe = 0;
        }

        // ---- upper body per mode
        switch (mode) {
            case 'talk':
                T.headX = Math.sin(t * 4.5) * 0.07 - 0.02;
                T.headZ = Math.sin(t * 1.3) * 0.05;
                if (!loco) {
                    T.aRX = 0.55 + Math.sin(t * 3.1) * 0.3;
                    T.aRZ = -0.15 + Math.sin(t * 1.7) * 0.12;
                    T.aLX = 0.2 + Math.max(0, Math.sin(t * 1.9 + 1)) * 0.45;
                    T.aLZ = 0.1 * Math.sin(t * 1.1);
                }
                break;
            case 'work': {
                const prev = this._workT;
                this._workT += dt;
                const cyc = (x) => Math.floor(x / WORK_PERIOD + 0.3); // hit at phase 0.7
                if (cyc(this._workT) > cyc(prev)) this.workStrikeNow = true;
                const p = this.workPhase = (this._workT / WORK_PERIOD) % 1;
                const u = p < 0.55 ? ease(p / 0.55) : p < 0.7 ? 1 - ease((p - 0.55) / 0.15) : 0;
                const twoHands = this.toolKind === 'hoe' || this.toolKind === 'pitchfork';
                T.aRX = lerp(0.55, twoHands ? 1.7 : 2.1, u);
                T.wrist = lerp(-2.1, -1.3, u);
                if (twoHands) {
                    T.aLX = T.aRX * 0.95; T.aLZ = 0.35; T.aRZ = -0.3;
                    T.hx = -0.2 - (1 - u) * 0.25;
                } else {
                    T.aLX = 0.75; T.aLZ = 0.3; T.aRZ = -0.1;
                    T.hx = -0.15 - (1 - u) * 0.12;
                }
                T.headX = -0.25;
                rate = 50;
                break;
            }
            case 'attack': {
                const prev = this._atkT;
                this._atkT += dt;
                const cyc = (x) => Math.floor(x / ATTACK_PERIOD + 0.5); // strike at phase 0.5
                if (cyc(this._atkT) > cyc(prev)) this.strikeNow = true;
                const p = this.attackPhase = (this._atkT / ATTACK_PERIOD) % 1;
                let arm, wr, tw, z;
                if (p < 0.4) { const e = ease(p / 0.4); arm = lerp(0.3, 2.7, e); wr = lerp(-1.1, -1.6, e); tw = lerp(0, 0.3, e); z = lerp(0.06, 0.3, e); }
                else if (p < 0.55) { const e = (p - 0.4) / 0.15; arm = lerp(2.7, 0.5, e); wr = lerp(-1.6, -2.4, e); tw = lerp(0.3, -0.3, e); z = lerp(0.3, -0.35, e); }
                else { const e = ease((p - 0.55) / 0.45); arm = lerp(0.5, 0.3, e); wr = lerp(-2.4, -1.1, e); tw = lerp(-0.3, 0, e); z = lerp(-0.35, 0.06, e); }
                T.aRX = arm; T.wrist = wr; T.hy = tw; T.aRZ = z;
                T.hx = p > 0.4 && p < 0.7 ? -0.15 : -0.05;
                if (this.shield) { T.block = 0.45; T.aLX = 0.6; T.aLZ = 0.25; } else { T.aLX = 0.5; T.aLZ = -0.2; }
                rate = 60;
                break;
            }
            case 'block':
                T.aRX = 1.25; T.aRZ = -0.45; T.wrist = -1.25;
                if (this.shield) { T.block = 1; T.aLX = 0.9; T.aLZ = 0.5; } else { T.aLX = 1.0; T.aLZ = 0.3; }
                T.hx = -0.08;
                rate = 16;
                break;
            case 'cheer':
                T.aLX = 2.85 + Math.sin(t * 9) * 0.2; T.aRX = 2.85 - Math.sin(t * 9) * 0.2;
                T.aLZ = -0.35; T.aRZ = 0.35;
                T.headX = 0.15;
                if (!loco) T.bounce = Math.abs(Math.sin(t * 6.5)) * 0.3;
                rate = 25;
                break;
            case 'flee':
                T.aLX = 2.6 + Math.sin(this._phase) * 0.3; T.aRX = 2.6 - Math.sin(this._phase) * 0.3;
                T.aLZ = -0.3; T.aRZ = 0.3;
                T.headY = Math.sin(t * 3) * 0.3;
                T.wrist = -0.4;
                break;
            case 'bow':
                T.hx = -0.5; T.headX = -0.3;
                T.aLX = 0.45; T.aRX = 1.4; T.aRZ = -0.9;
                rate = 6;
                break;
            case 'sit':
                T.lL = T.lR = Math.PI / 2; T.kL = T.kR = -Math.PI / 2;
                T.hx = 0.08;
                T.aLX = T.aRX = 0.7; T.aLZ = -0.25; T.aRZ = 0.25;
                T.headY = Math.sin(t * 0.3) * 0.2;
                T.wrist = -0.7;
                rate = 8;
                break;
            default: break;
        }
        if (this._lookYaw != null && mode !== 'bow') T.headY = this._lookYaw;
        if (breathe) { T.aLZ -= Math.sin(t * 2.2) * 0.02; T.aRZ += Math.sin(t * 2.2) * 0.02; }

        // ---- smooth toward the targets and apply
        const k = 1 - Math.exp(-rate * dt);
        const kh = 1 - Math.exp(-8 * dt); // the head turns at its own pace
        for (const key of POSE_KEYS) P[key] += (T[key] - P[key]) * (key === 'headY' ? kh : k);
        this._apply(t, breathe, mode === 'sit');
    }

    _apply(t, breathe, sitting) {
        const P = this._p;
        this.body.rotation.set(P.hx, P.hy, 0);
        this.torso.position.y = 0.75 + (breathe ? Math.sin(t * 2.2) * breathe : 0);
        this.head.rotation.set(P.headX, P.headY, P.headZ);
        this.leftArm.rotation.set(P.aLX, 0, P.aLZ);
        this.rightArm.rotation.set(P.aRX, P.aRY, P.aRZ);
        this.handSlot.rotation.x = P.wrist;
        this.leftLeg.rotation.x = P.lL;
        this.rightLeg.rotation.x = P.lR;
        this.leftKnee.rotation.x = P.kL;
        this.rightKnee.rotation.x = P.kR;
        if (this.cape) this.cape.rotation.x = P.cape + Math.sin(t * 2.3) * 0.04 - P.hx * 0.6;
        if (this.shield) this._placeShield(P.block);
        // keep the lower foot on the ground (legs swinging would otherwise lift the body)
        let y = VILLAGER_FOOT_OFFSET;
        if (!sitting) {
            const dl = LEG_UP * Math.cos(P.lL) + LEG_LOW * Math.cos(P.lL + P.kL);
            const dr = LEG_UP * Math.cos(P.lR) + LEG_LOW * Math.cos(P.lR + P.kR);
            y = Math.max(dl, dr);
        }
        this.pelvis.position.y = y + P.bounce;
    }

    _placeShield(k) {
        const s = this.shield;
        _pA.set(-0.33, -0.78, 0);
        _qA.copy(_qShieldIdle);
        if (k > 0.001) {
            // in front of the chest, facing forward, whatever the arm does
            this.leftArm.updateMatrix();
            _mA.copy(this.leftArm.matrix).invert();
            _mB.compose(_pB.set(-0.32, 0.05, -1.05), _qIdent, _one);
            _mA.multiply(_mB).decompose(_pB, _qB, _sc);
            _pA.lerp(_pB, k);
            _qA.slerp(_qB, k);
        }
        s.position.copy(_pA);
        s.quaternion.copy(_qA);
    }

    _updateDead(dt) {
        if (this._deadDone) return;
        this._deadT += dt;
        const k = Math.min(1, this._deadT / 0.6);
        const e = 1 - Math.cos(k * Math.PI / 2); // accelerates like a fall
        this.root.rotation.x = e * Math.PI / 2; // on the back (head toward +Z)
        this.root.position.y = -VILLAGER_FOOT_OFFSET + e * 0.5;
        const P = this._p;
        const f = k >= 1 ? 1 : 1 - Math.exp(-10 * dt);
        const to = (key, v) => { P[key] += (v - P[key]) * f; };
        to('hx', 0); to('hy', 0); to('headX', 0.1); to('headY', 0.35); to('headZ', 0);
        to('aLX', 0.15); to('aLZ', -1.25); to('aRX', 0.15); to('aRY', 0); to('aRZ', 1.25); to('wrist', REST_WRIST);
        to('lL', 0); to('lR', 0); to('kL', 0); to('kR', 0); to('block', 0); to('cape', -0.05); to('bounce', 0);
        this._apply(this._t, 0, true);
        this.pelvis.position.y = VILLAGER_FOOT_OFFSET;
        this.leftLeg.rotation.z = -0.12 * e;
        this.rightLeg.rotation.z = 0.12 * e;
        if (k >= 1) this._deadDone = true;
    }

    get isDeadDone() { return this._deadDone; }

    /** Removes the model from its parent. Shared geometry / materials stay alive. */
    dispose() {
        this.group.parent?.remove(this.group);
    }
}

/**
 * Sample villagers for the shader prewarm "zoo": every role, every tool,
 * the hit and highlight materials. Their geometries are private clones, so
 * the caller may dispose them freely.
 */
export function prewarmVillagers() {
    const out = [];
    const add = (v) => { out.push(v.group); return v; };
    ROLES.forEach((role, i) => add(new VillagerModel(villagerLook(i + 1, role, false), { shield: role === 'knight' })));
    add(new VillagerModel(villagerLook(11, 'farmer', true), { tool: 'pitchfork' }));
    add(new VillagerModel(villagerLook(12, 'farmer', true), { tool: 'basket' })).flashHit(1e9);
    add(new VillagerModel(villagerLook(13, 'merchant', true), { tool: 'pouch' })).setHighlighted(true);
    for (const g of out) g.traverse((o) => { if (o.isMesh) o.geometry = o.geometry.clone(); });
    return out;
}
