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

import { ARENA_MODES, arenaPose } from './ArenaPoses.js';
import { COMMAND_MODES, commandPose } from './CommandPoses.js';
import { EMOTIONS, newFace, easeFace, quantFace, faceKey } from './Emotions.js';
import { pickGesture, gesturePose, GESTURES } from './Gestures.js';
import * as THREE from 'three';
import { FarShape } from '../core/FarShape.js';
import { SKIN_TONES } from './Appearance.js';
import { GAITS, styleOf, gaitPose, wizardPose, idleShift } from './MoveStyle.js';
import { slopeLean } from '../game/HillWay.js';

// (the wizards are appended: the look of every older role stays the same — its seed uses the index)
export const ROLES = ['builder', 'farmer', 'merchant', 'knight', 'king', 'student', 'teacher', 'seller', 'master', 'wanderer', 'townwiz', 'mage'];
export const WIZARD_LOOK_ROLES = new Set(['student', 'teacher', 'seller', 'master', 'wanderer', 'townwiz', 'mage']);
import { HAND, CHORE_HAND, KEEP_WAND, SIT_CHORES, PROPS, choreBody, carryBody, choreThings } from './ChoreAnim.js';

export const TOOLS = ['none', 'hammer', 'hoe', 'pitchfork', 'sword', 'bigsword', 'basket', 'pouch', 'wand', 'staff', 'longbow', 'bucket', 'rapier', 'cutlass', 'axe', 'pistol'];
export const MODES = ['idle', 'walk', 'run', 'sit', 'bow', 'talk', 'work', 'attack', 'block', 'flee', 'dead', 'cheer', 'climb', 'cast', 'practice', 'shield', 'offer', 'shoot', 'sleep', 'sleepMat', 'situp', 'flail', 'swim', 'paddle', 'brace', 'flinch', 'chore', 'ride', ...ARENA_MODES, ...COMMAND_MODES];
/** Lying asleep (on a bed / on a straw mat on the floor): see VillagerModel._updateSleep and src/game/NightLife.js. */
export const SLEEP_MODES = new Set(['sleep', 'sleepMat']);
const ARENA_SET = new Set(ARENA_MODES);
const COMMAND_SET = new Set(COMMAND_MODES);
/** Asleep the body lies with its middle at the group's place: the feet this far behind it (the head ahead, local +Z). */
export const SLEEP_HALF = 2.05;
/** How far up the tool the tip of a wand / a staff is (tool-local y). */
export const TIP_Y = { wand: 1.05, staff: 2.45 };
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
const _lodInv = new THREE.Matrix4(), _lodM = new THREE.Matrix4();
MAT.name = 'villager';
const HIT_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xff6060, emissive: 0x8a1010 });
// the night: a blanket over a sleeper, a straw mat under one on the floor, a watchman's torch (shared)
const WOOL = [0x8a2b2b, 0x2e4a7a, 0x6b5a3a, 0x3f6b3a, 0x7a6a5a, 0x5a3a6b, 0xb8a888].map((c) => new THREE.MeshLambertMaterial({ color: c }));
const STRAW_MAT = new THREE.MeshLambertMaterial({ color: 0xc8a85a });
const BLANKET_GEO = new THREE.BoxGeometry(2.15, 3.0, 0.24);
const STRAW_GEO = new THREE.BoxGeometry(2.3, 0.12, 4.6);
const TORCH_STICK = new THREE.BoxGeometry(0.14, 1.1, 0.14);
const TORCH_FLAME = new THREE.BoxGeometry(0.3, 0.42, 0.3);
const STICK_MAT = new THREE.MeshLambertMaterial({ color: 0x5a3a1e });
const FLAME_MAT = new THREE.MeshBasicMaterial({ color: 0xffb030 });
const EYE_GEO = new THREE.BoxGeometry(0.15, 0.12, 0.03);
const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0x7dff9a });
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
    const g = buildPart(L);
    g.userData.vkey = key;
    _geoCache.set(key, g);
    return g;
}

/**
 * The people using a cached shape (VillagerModel takes / gives back its parts' shapes): the last one gone —
 * a castle asleep, its people put away — the shape is given back and forgotten. Kept for ever, every look
 * of every castle flown over stayed with the video card (a long flight: hundreds of shapes).
 */
const _geoUsers = new Map();
function takeGeo(g) { if (g.userData.vkey) _geoUsers.set(g, (_geoUsers.get(g) || 0) + 1); return g; }
function giveGeo(g) {
    const n = (_geoUsers.get(g) || 0) - 1;
    if (n > 0) { _geoUsers.set(g, n); return; }
    _geoUsers.delete(g);
    if (g.userData.vkey && _geoCache.get(g.userData.vkey) === g) _geoCache.delete(g.userData.vkey);
    g.dispose();
}

/** A copy of a person's model (a body — Death.js) shares its shapes: taken for it, given back with it. */
export function holdShapes(obj) { obj.traverse((o) => { if (o.isMesh && o.geometry?.userData.vkey) takeGeo(o.geometry); }); }
export function releaseShapes(obj) { obj.traverse((o) => { if (o.isMesh && o.geometry?.userData.vkey) giveGeo(o.geometry); }); }

function buildPart(L) {
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
// magic steel (the king's set, the advisor's breastplate and greaves): a pale glowing blue, cyan runes
const MSTEEL = 0x8ec9f0, MSTEEL_LIGHT = 0xcfeeff, MSTEEL_DARK = 0x5f9bc4, RUNE = 0xe6fbff;
const VELVET = 0x6a1233, VELVET_DARK = 0x3d0a1f; // the advisor's office: deep burgundy velvet
const RUBY = 0xd0182a, WOOD = 0x8b5a2b, IRON = 0x6f7780, LEATHER = 0x5a3a1e;
const HAIR_COLORS = [0x2b1d14, 0x4a3728, 0x8b5a2b, 0xd9b46c, 0xa83e2a, 0x111111, 0x6b4a2b];
export const GREY_HAIR = 0xd8d6cf;
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
            L.magic = true; // the king always wears the full magic set (Armor.js: magic pieces)
            if (L.hair === 'spiky') L.hair = 'long';
            break;
        default:
            if (WIZARD_LOOK_ROLES.has(role)) wizardLook(L, r, pick);
            break;
    }
    return L;
}

/**
 * The steel / the plain robe gone («Disarmor», or taken off a dead body — Armor.js): a knight's and
 * the king's plates leave a padded gambeson (the king keeps his crown and his cape); a wizard's
 * plain robe leaves the shirt and the trousers under it (and no hat).
 */
export function strippedLook(L) {
    const S = { ...L };
    if (L.role === 'knight' || L.role === 'king') {
        S.unarmored = true;
        if (L.role === 'knight') { S.hat = 'none'; S.plume = false; }
        S.shirt = 0xcdbf98; S.pants = 0x5a4632; S.boots = 0x4a3020;
    } else if (L.advisor) {
        S.magicChest = false; S.magicLegs = false; // (his breastplate and greaves came off; the hat and the chain of office stay)
    } else if (L.wizard) {
        S.robeOff = true; S.dress = false; S.hat = 'none';
        S.shirt = 0xe8dcc0; S.pants = 0x4a3a2a;
    }
    return S;
}

/**
 * A wizard's rank (WizardAI.WIZ_RANKS) on his robe: the colour of its trim, stripes on the cuffs
 * (none — a beginner, 1 — an adept, 2 — a teacher, 3 — the Master), stars on the chest, the hat's band.
 */
export const RANK_TRIM = { novice: 0xd8d4c8, adept: 0xc8d4ea, teacher: 0xe0b84a, master: GOLD, elder: 0x7fe0c8 };
const RANK_LEVEL = { novice: 0, adept: 1, teacher: 2, master: 3, elder: 2 };

/** Wizards: a robe to the ground, a pointed hat, a wand (a wanderer: a staff), the Master — a long beard. */
function wizardLook(L, r, pick) {
    const role = L.role;
    L.wizard = true;
    L.dress = true;
    const robes = {
        student: [0x2c4f9e, 0x2f7a3e, 0x8e2b2b, 0xb8922a],
        teacher: [0x1f2f6b, 0x4b2a7a, 0x23364f, 0x5a2d82],
        seller: [0x6a2c91, 0x2b5f8e, 0x7a3b1f],
        master: [0x3a1d5e],
        wanderer: [0x6d6a62, 0x6b5640, 0x55584f],
        townwiz: [0x2f7f86, 0x3b4f8a, 0x5b3a7a, 0x6a4a2a, 0x2f5a3a, 0x7a2f4a], // (the settlements' folk: all colours)
        mage: [0x2b5f8e, 0x4b2a7a, 0x2f6b5a, 0x6b2f5a, 0x3d4a8a], // (a hamlet's wizard: Hamlets.js)
    }[role];
    L.dressColor = pick(robes);
    L.shirt = L.dressColor; // (the sleeves are the robe's)
    L.pants = shade(L.dressColor, 0.6);
    L.accent = role === 'master' ? GOLD : role === 'wanderer' ? 0x8a7a5a : role === 'student' ? 0xd8d4c8 : 0xc0c8d8;
    L.hatColor = role === 'student' ? shade(L.dressColor, 0.8) : role === 'wanderer' ? shade(L.dressColor, 0.85) : shade(L.dressColor, 0.9);
    L.hat = role === 'master' ? 'wizardTall' : role === 'wanderer' ? 'wizardWide' : 'wizard';
    L.tool = role === 'wanderer' ? 'staff' : 'wand';
    L.boots = pick([0x3a2a1a, 0x2b2b2b, 0x4a3020]);
    if (role === 'master') {
        // (the author: the Master — an old man with a long white beard down to the belt, as Dumbledore)
        L.female = false;
        L.hairColor = GREY_HAIR;
        L.beard = 'sage'; L.hair = 'long';
    } else if (role === 'wanderer' && !L.female && r() < 0.7) L.beard = 'long';
    else if (role === 'student') L.beard = 'none';
}

// ==================================================================== parts
/** Head pivot at the neck: the head box is 1.2³ centred at y 0.6, face at z −0.6. */
/** A skeleton's bones (Blackbeard.js: the black ship's crew) — pale bone and older, yellowed bone. */
export const BONE = 0xe2d9bf, BONE_OLD = 0xb3a682, BONE_HOLE = 0x0a0806;

/**
 * A skeleton's bones, each its own box list, in the frames of the person's joints: the skull (head pivot —
 * the jaw apart), the torso's bones (spine, five ribs, the breastbone, the shoulders; torso frame), the pelvis
 * (torso frame), an arm (shoulder frame: upper arm, forearm, hand), a thigh (hip frame), a shin with its foot
 * (knee frame). The black ship's crew is made of them (Blackbeard.js), and so are the dead «Alive» raises out
 * of a grave (Skeletons.js) — bone by bone, they come together one after another.
 */
export function skeletonBoneBoxes() {
    const L = (f) => { const B = []; f(B); return B; };
    return {
        skull: L((B) => {
            b(B, 1.08, 0.72, 1.14, 0, 0.78, 0.02, BONE);
            b(B, 0.96, 0.42, 1.0, 0, 0.34, -0.03, BONE);
            for (const sx of [-1, 1]) b(B, 0.3, 0.28, 0.05, sx * 0.24, 0.6, -0.55, BONE_HOLE);
            b(B, 0.12, 0.18, 0.05, 0, 0.36, -0.54, BONE_HOLE); // the nose
            b(B, 0.62, 0.11, 0.05, 0, 0.17, -0.53, 0xeee6cf);
            for (let i = 0; i < 4; i++) b(B, 0.025, 0.11, 0.055, -0.21 + i * 0.14, 0.17, -0.535, BONE_HOLE);
            b(B, 0.08, 0.3, 0.08, 0, -0.12, 0.08, BONE_OLD); // the neck's bones
        }),
        jaw: L((B) => b(B, 0.72, 0.2, 0.84, 0, 0.04, -0.06, BONE_OLD)),
        spine: L((B) => b(B, 0.18, 1.5, 0.18, 0, 0, 0.24, BONE_OLD)),
        ribs: [0, 1, 2, 3, 4].map((k) => L((B) => b(B, 1.0 - Math.abs(k - 1.5) * 0.08, 0.09, 0.72, 0, 0.52 - k * 0.18, 0, BONE))),
        breast: L((B) => b(B, 0.14, 0.8, 0.06, 0, 0.2, -0.37, BONE)),
        shoulders: L((B) => b(B, 1.36, 0.14, 0.3, 0, 0.66, 0.02, BONE)),
        pelvis: L((B) => b(B, 0.9, 0.3, 0.52, 0, -0.62, 0, BONE_OLD)),
        upperArm: L((B) => { b(B, 0.3, 0.26, 0.3, 0, 0.06, 0, BONE); b(B, 0.15, 0.6, 0.15, 0, -0.22, 0, BONE); b(B, 0.22, 0.16, 0.22, 0, -0.55, 0, BONE_OLD); }),
        forearm: L((B) => { b(B, 0.07, 0.56, 0.07, -0.05, -0.86, 0, BONE); b(B, 0.07, 0.56, 0.07, 0.05, -0.86, 0, BONE); }),
        hand: L((B) => { b(B, 0.26, 0.2, 0.18, 0, -1.16, 0, BONE); for (let i = 0; i < 4; i++) b(B, 0.045, 0.2, 0.045, -0.09 + i * 0.06, -1.34, -0.03, BONE_OLD); }),
        thigh: L((B) => b(B, 0.16, LEG_UP, 0.16, 0, -LEG_UP / 2, 0, BONE)),
        shin: L((B) => { b(B, 0.24, 0.18, 0.24, 0, -0.04, 0, BONE_OLD); b(B, 0.13, 0.66, 0.13, 0, -0.42, 0, BONE); b(B, 0.28, 0.12, 0.5, 0, -0.84, -0.08, BONE); }),
    };
}
const SKB = skeletonBoneBoxes();
/** One geometry (position, normal, vertex colour) of a box list — not cached here: the caller keeps it. */
export const boxesGeometry = (L) => buildPart(L);

/** A skull: the cranium, the cheekbones, a jaw, dark sockets (their green fire is its own mesh), the teeth. */
function skullBoxes(L, B) {
    B.push(...SKB.skull, ...SKB.jaw);
}

/** Does this look show a face that moves (not a closed helm, not a skull)? */
const hasFace = (L) => !L.skeleton && L.hat !== 'helm';

/**
 * The moving part of the face — the brows, the lids and the mouth — as boxes, for the face `f` (Emotions.quantFace: a few steps of each
 * number, so the shapes are cached and shared by everybody). The brows are two pieces (the inner end higher or lower = anger, sorrow);
 * the lid is a skin box over the top of the eye; the mouth is a middle and two corners (up = a smile), opened it shows the dark and the teeth.
 */
function faceBoxes(L, f) {
    const B = [];
    const s = L.skin, hc = L.hairColor;
    const browC = shade(hc === GREY_HAIR ? 0x8a8478 : hc, 0.85);
    const cl = (x, a, c) => Math.max(a, Math.min(c, x));
    for (const sx of [-1, 1]) {
        const up = f.brow.y + (sx > 0 ? f.brow.asym : -f.brow.asym) * 0.05;
        b(B, 0.17, 0.07, 0.04, sx * 0.2, 0.85 + up - f.brow.tilt * 0.07, -0.61, browC);
        b(B, 0.17, 0.07, 0.04, sx * 0.36, 0.85 + up + f.brow.tilt * 0.05, -0.61, browC);
        if (f.lid > 0.05) { const h = f.lid * 0.22; b(B, 0.28, h, 0.05, sx * 0.27, 0.77 - h / 2, -0.648, shade(s, 0.97)); }
    }
    const zM = L.beard === 'full' || L.beard === 'goatee' ? -0.67 : -0.61;
    const base = L.mouth === 'grin' ? 0.4 : L.mouth === 'calm' ? 0 : 0.2; // (the way he smiles at rest: his own)
    const cv = cl(f.mouth.curve + base, -1, 1), w = 0.3 * f.mouth.wide;
    const lip = L.female ? 0xa04a4a : 0x8a3a3a, y0 = 0.28;
    b(B, w * 0.6, 0.07, 0.04, 0, y0 - Math.max(0, cv) * 0.01, zM, lip);
    for (const sx of [-1, 1]) b(B, w * 0.24, 0.07, 0.04, sx * w * 0.4, y0 + cv * 0.06 + sx * f.mouth.asym * 0.03, zM, lip);
    if (f.mouth.open > 0.1) {
        const h = f.mouth.open * 0.16;
        b(B, w * 0.62, h, 0.045, 0, y0 - h / 2 + 0.02, zM - 0.003, 0x4a1414);
        if (f.mouth.open > 0.35) b(B, w * 0.5, 0.04, 0.05, 0, y0 + 0.03, zM - 0.006, 0xffffff);
    } else if (cv > 0.5 && L.mouth === 'grin') b(B, w * 0.45, 0.04, 0.05, 0, y0 + 0.04, zM - 0.004, 0xffffff);
    return B;
}

/** The face shapes in use are held once more (so a model that goes back to a face made a moment ago finds it); a few hundred at most. */
const _faceHold = new Map();
function faceGeo(boxes) {
    const g = partGeometry(boxes);
    const k = g.userData.vkey;
    if (!_faceHold.has(k)) {
        if (_faceHold.size >= 256) { for (const g2 of _faceHold.values()) giveGeo(g2); _faceHold.clear(); }
        takeGeo(g); _faceHold.set(k, g);
    }
    return g;
}

function headBoxes(L) {
    const B = [];
    const s = L.skin, hc = L.hairColor, cc = L.castleColor;
    if (L.skeleton) { skullBoxes(L, B); hatBoxes(L, B, cc); return B; }
    b(B, 1.2, 1.2, 1.2, 0, 0.6, 0, s);
    const helm = L.hat === 'helm', open = L.hat === 'openhelm';
    if (!helm) {
        // eyes, brows, nose, mouth
        for (const sx of [-1, 1]) {
            b(B, 0.26, 0.22, 0.04, sx * 0.27, 0.66, -0.61, 0xffffff);
            b(B, 0.13, 0.2, 0.05, sx * 0.23, 0.65, -0.615, L.eyes === 0x444444 ? 0x222222 : shade(L.eyes, 0.8));
            if (L.female) { b(B, 0.3, 0.05, 0.05, sx * 0.27, 0.78, -0.615, 0x222222); b(B, 0.18, 0.08, 0.03, sx * 0.4, 0.43, -0.605, 0xf08a8a); }
            if (!open) b(B, 0.08, 0.24, 0.18, sx * 0.63, 0.58, 0.05, shade(s, 0.92)); // ears
        }
        b(B, 0.16, 0.22, 0.1, 0, 0.5, -0.64, shade(s, 0.86)); // nose
        // (the brows, the lids and the mouth are the face overlay — faceBoxes: they move with what he feels)
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
        } else if (L.beard === 'long') {
            // a wizard's long beard down onto the chest
            b(B, 1.22, 0.42, 0.12, 0, 0.18, -0.6, bc);
            b(B, 0.9, 0.5, 0.14, 0, -0.25, -0.6, bc);
            b(B, 0.6, 0.45, 0.14, 0, -0.7, -0.62, bc);
            b(B, 0.3, 0.3, 0.12, 0, -1.05, -0.63, shade(bc, 0.95));
            b(B, 0.1, 0.55, 0.8, -0.62, 0.35, -0.15, bc); b(B, 0.1, 0.55, 0.8, 0.62, 0.35, -0.15, bc);
            b(B, 0.62, 0.12, 0.08, 0, 0.38, -0.67, shade(bc, 0.9));
        } else if (L.beard === 'sage') {
            // the Master's beard (as Dumbledore's): white, broad at the cheeks, down past the chest to the belt
            b(B, 1.22, 0.42, 0.12, 0, 0.18, -0.6, bc);
            b(B, 0.96, 0.55, 0.14, 0, -0.27, -0.6, bc);
            b(B, 0.78, 0.5, 0.14, 0, -0.78, -0.62, bc);
            b(B, 0.56, 0.5, 0.14, 0, -1.26, -0.64, shade(bc, 0.97));
            b(B, 0.34, 0.4, 0.12, 0, -1.7, -0.66, shade(bc, 0.94));
            b(B, 0.18, 0.12, 0.13, 0, -1.55, -0.72, 0xd8b04a); // (a little gold clasp near its end)
            b(B, 0.1, 0.55, 0.8, -0.62, 0.35, -0.15, bc); b(B, 0.1, 0.55, 0.8, 0.62, 0.35, -0.15, bc);
            b(B, 0.62, 0.12, 0.08, 0, 0.38, -0.67, shade(bc, 0.9));
        } else if (L.beard === 'blackbeard') {
            // Captain Black Moustache: a great black beard down onto the chest, plaited at the end with red
            // ribbons, and the moustache that gave him his name — thick, curled up at both ends
            b(B, 1.24, 0.5, 0.14, 0, 0.16, -0.6, bc);
            b(B, 1.06, 0.55, 0.16, 0, -0.32, -0.62, bc);
            b(B, 0.76, 0.5, 0.16, 0, -0.82, -0.63, bc);
            b(B, 0.1, 0.62, 0.86, -0.62, 0.34, -0.14, bc); b(B, 0.1, 0.62, 0.86, 0.62, 0.34, -0.14, bc);
            for (const sx of [-1, 1]) {
                b(B, 0.16, 0.42, 0.16, sx * 0.22, -1.25, -0.63, bc);
                b(B, 0.2, 0.08, 0.2, sx * 0.22, -1.08, -0.63, 0xb0202a);
                // the moustache: out to the side and curled up
                b(B, 0.42, 0.17, 0.12, sx * 0.24, 0.39, -0.69, bc, 0, 0, sx * 0.12);
                b(B, 0.3, 0.14, 0.12, sx * 0.55, 0.46, -0.69, bc, 0, 0, sx * 0.45);
                b(B, 0.13, 0.26, 0.12, sx * 0.72, 0.62, -0.69, bc);
                b(B, 0.16, 0.1, 0.12, sx * 0.66, 0.77, -0.69, bc);
            }
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
    hatBoxes(L, B, cc);
    return B;
}

/** Hats and helmets (on a head or on a skull). */
function hatBoxes(L, B, cc) {
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
        case 'tricorn': {
            // a pirate's three-cornered hat: the brim turned up on three sides, gold lace, a skull at the front
            b(B, 1.36, 0.42, 1.36, 0, 1.42, 0.04, hcol);
            b(B, 1.9, 0.08, 1.8, 0, 1.24, 0.04, shade(hcol, 0.9));
            for (const sx of [-1, 1]) {
                b(B, 1.12, 0.5, 0.1, sx * 0.48, 1.46, -0.62, hcol, 0, sx * 0.62, 0);
                b(B, 1.14, 0.06, 0.12, sx * 0.48, 1.72, -0.62, GOLD, 0, sx * 0.62, 0);
            }
            b(B, 1.7, 0.5, 0.1, 0, 1.46, 0.9, hcol);
            b(B, 1.72, 0.06, 0.12, 0, 1.72, 0.9, GOLD);
            b(B, 0.24, 0.24, 0.05, 0, 1.4, -0.72, 0xeee6cf);
            b(B, 0.06, 0.06, 0.03, -0.05, 1.44, -0.75, 0x111111); b(B, 0.06, 0.06, 0.03, 0.05, 1.44, -0.75, 0x111111);
            break;
        }
        case 'chancellor': { // the advisor's tall velvet cap: a gold band, a plume, a brooch
            b(B, 1.46, 0.3, 1.46, 0, 1.3, 0.02, hcol);
            b(B, 1.7, 0.46, 1.64, 0.04, 1.62, 0.04, hcol, 0, 0, -0.1);
            b(B, 1.5, 0.12, 1.5, 0, 1.17, 0.02, GOLD);
            b(B, 1.52, 0.05, 1.52, 0, 1.43, 0.02, GOLD_DARK);
            b(B, 0.22, 0.22, 0.05, -0.45, 1.2, -0.76, RUBY, 0, 0, Math.PI / 4);
            b(B, 0.1, 0.74, 0.3, 0.62, 2.0, 0.2, 0xf4f0ea, -0.45, 0, -0.5);
            b(B, 0.06, 0.5, 0.2, 0.7, 2.1, 0.28, shade(0xf4f0ea, 0.85), -0.45, 0, -0.55);
            break;
        }
        case 'chef': // a baker's tall white cap: a band and a puffed crown
            b(B, 1.36, 0.22, 1.36, 0, 1.2, 0, hcol);
            b(B, 1.5, 0.5, 1.5, 0, 1.55, 0, hcol);
            b(B, 1.3, 0.14, 1.3, 0, 1.86, 0, shade(hcol, 0.96));
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
            if (L.magic && !L.unarmored) { // under the crown: the magic helm (open face)
                b(B, 1.42, 0.14, 1.42, 0, 0.95, 0, MSTEEL_LIGHT);
                b(B, 0.12, 0.8, 0.9, -0.69, 0.5, 0.15, MSTEEL); b(B, 0.12, 0.8, 0.9, 0.69, 0.5, 0.15, MSTEEL);
                b(B, 1.38, 0.9, 0.12, 0, 0.5, 0.69, MSTEEL);
                b(B, 0.14, 0.5, 0.08, 0, 0.62, -0.68, MSTEEL_LIGHT);
                for (const sx of [-1, 1]) b(B, 0.05, 0.3, 0.2, sx * 0.76, 0.5, 0.15, RUNE);
            }
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
}

/**
 * A wizard's pointed hat in two parts (its own meshes, so it can bend): the brim and
 * the lower crown sit on the head (pivot at head y 1.22); the upper crown and the
 * bent tip hang on a joint above them and fold back when the hat meets a ceiling.
 * Returns {base, top, joint}: boxes relative to the pivot / to the joint.
 */
const HAT_PIVOT_Y = 1.22;
function hatParts(L) {
    const c = L.hatColor, band = L.role === 'master' ? GOLD : L.rank === 'teacher' || L.rank === 'adept' ? RANK_TRIM[L.rank] : shade(c, 0.6);
    const tall = L.hat === 'wizardTall', wide = L.hat === 'wizardWide';
    const base = [], top = [];
    const brim = wide ? 2.1 : 1.7, t1 = wide ? 0.26 : 0.3;
    b(base, brim, 0.06, brim, 0, 0.03, 0, shade(c, 0.85));
    b(base, 1.32, t1, 1.32, 0, 0.06 + t1 / 2, 0, c);
    b(base, 1.34, 0.08, 1.34, 0, 0.1, 0, band); // a band round it
    const joint = 0.06 + t1;
    const t2 = tall ? 0.36 : wide ? 0.24 : 0.28, t3 = tall ? 0.26 : wide ? 0.18 : 0.22;
    b(top, 0.95, t2, 0.95, 0, t2 / 2, 0.03, c);
    b(top, 0.6, t3, 0.6, 0, t2 + t3 / 2, 0.08, shade(c, 1.05));
    b(top, 0.3, 0.1, 0.36, 0, t2 + t3 + 0.04, 0.2, shade(c, 0.95)); // the tip, bent back
    if (tall) b(top, 0.16, 0.16, 0.16, 0, t2 + t3 + 0.04, 0.32, 0xfff2a0, Math.PI / 4, 0, Math.PI / 4); // a star on it
    else b(top, 0.16, 0.16, 0.05, 0.3, t2 * 0.5, -0.46, 0xe8e8ff, 0, 0, Math.PI / 4); // a little star on the front
    return { base, top, joint };
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
    if (L.skeleton) {
        // the spine, the ribs, the breastbone, the shoulders, the pelvis; rags of what he once wore
        B.push(...SKB.spine, ...SKB.ribs.flat(), ...SKB.breast, ...SKB.shoulders, ...SKB.pelvis);
        if (L.rags) {
            b(B, 1.12, 0.32, 0.8, 0, -0.42, 0, L.rags);
            b(B, 0.3, 0.9, 0.06, -0.38, 0.25, -0.4, L.rags, 0, 0, 0.35); // a torn strip over the ribs
            b(B, 0.24, 0.18, 0.05, 0.25, -0.62, -0.42, shade(L.rags, 0.7));
        }
        b(B, 1.0, 0.12, 0.6, 0, -0.66, 0, LEATHER); // the belt still holds
        return B;
    }
    if (L.coat) {
        // a pirate captain's long coat: open over a white shirt, gold lapels and buttons, a red sash, a
        // baldric across, the skirts down to the knees
        const c = L.coat;
        b(B, 1.26, 1.5, 0.86, 0, 0.05, 0, c);
        b(B, 0.36, 1.1, 0.03, 0, 0.28, -0.44, 0xf2ecd8);
        b(B, 0.3, 0.2, 0.06, 0, 0.62, -0.44, 0xffffff); // the jabot
        for (const sx of [-1, 1]) {
            b(B, 0.08, 1.42, 0.04, sx * 0.22, 0.05, -0.45, GOLD);
            for (const y of [0.45, 0.15, -0.15]) b(B, 0.08, 0.08, 0.03, sx * 0.32, y, -0.46, GOLD);
        }
        b(B, 1.3, 0.24, 0.9, 0, -0.55, 0, 0x8e1620); // the sash
        b(B, 0.24, 0.5, 0.1, 0.45, -0.8, -0.44, 0x8e1620);
        b(B, 1.34, 0.85, 0.94, 0, -1.08, 0.04, c); // the skirts
        b(B, 1.36, 0.06, 0.96, 0, -1.48, 0.04, GOLD);
        b(B, 0.16, 1.75, 0.05, 0, 0.02, -0.47, LEATHER, 0, 0, 0.62); // the baldric
        b(B, 0.12, 0.12, 0.52, -0.3, -0.52, -0.52, 0x3a2414); // a pistol in the sash
        b(B, 0.1, 0.1, 0.36, -0.3, -0.48, -0.86, IRON);
        return B;
    }
    if (L.unarmored || L.robeOff) { // (the steel / the robe gone: a padded gambeson / the shirt)
        b(B, 1.2, 1.5, 0.8, 0, 0, 0, L.shirt);
        if (L.unarmored) for (const y of [0.45, 0.1, -0.25]) b(B, 1.22, 0.05, 0.82, 0, y, 0, shade(L.shirt, 0.85)); // the quilting
        b(B, 0.4, 0.12, 0.04, 0, 0.66, -0.41, L.skin);
        belt();
        return B;
    }
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
        b(B, 1.2, 1.5, 0.8, 0, 0, 0, L.magic ? MSTEEL : STEEL);
        b(B, 1.12, 0.95, 0.08, 0, 0.18, -0.42, GOLD); // golden chest plate
        if (L.magic) for (const [x, y] of [[-0.4, 0.45], [0.4, 0.45], [-0.4, -0.05], [0.4, -0.05]]) b(B, 0.1, 0.1, 0.03, x, y, -0.47, RUNE, 0, 0, Math.PI / 4); // glowing runes
        b(B, 0.86, 0.06, 0.09, 0, -0.1, -0.43, GOLD_DARK);
        b(B, 0.34, 0.34, 0.04, 0, 0.25, -0.47, cc, 0, 0, Math.PI / 4); // castle emblem
        b(B, 0.12, 0.12, 0.04, 0, 0.25, -0.5, RUBY);
        b(B, 1.25, 0.55, 0.85, 0, -0.95, 0, cc); // surcoat skirt (inside the belt's faces: flush, they flickered)
        b(B, 1.3, 0.1, 0.9, 0, -1.2, 0, GOLD);
        b(B, 1.5, 0.32, 1.0, 0, 0.72, 0.02, 0xf4f2ec); // ermine mantle
        for (const [x, z] of [[-0.55, -0.51], [-0.2, -0.51], [0.2, -0.51], [0.55, -0.51], [-0.4, 0.53], [0.4, 0.53]]) b(B, 0.08, 0.14, 0.02, x, 0.7, z, 0x111111);
        b(B, 1.26, 0.16, 0.86, 0, -0.62, 0, GOLD_DARK); b(B, 0.2, 0.16, 0.04, 0, -0.62, -0.44, RUBY);
        for (const sx of [-1, 1]) b(B, 0.16, 0.16, 0.06, sx * 0.55, 0.62, -0.5, GOLD); // cape clasps
        return B;
    }
    if (L.advisor) { // the king's super-helper: a velvet tunic, a magic breastplate, the gold chain of office over it
        b(B, 1.2, 1.5, 0.8, 0, 0, 0, VELVET);
        if (L.magicChest) {
            b(B, 1.1, 0.95, 0.08, 0, 0.2, -0.43, MSTEEL); b(B, 1.1, 0.95, 0.08, 0, 0.2, 0.43, MSTEEL);
            b(B, 1.14, 0.08, 0.1, 0, 0.68, -0.43, MSTEEL_LIGHT); b(B, 1.14, 0.06, 0.1, 0, -0.26, -0.43, MSTEEL_DARK);
            for (const [x, y] of [[-0.3, 0.4], [0.3, 0.4], [0, 0.05]]) b(B, 0.1, 0.1, 0.03, x, y, -0.48, RUNE, 0, 0, Math.PI / 4);
        }
        b(B, 1.25, 0.55, 0.85, 0, -0.95, 0, VELVET_DARK); // tunic skirt
        b(B, 1.28, 0.1, 0.88, 0, -0.62, 0, GOLD_DARK); b(B, 0.2, 0.14, 0.04, 0, -0.62, -0.45, GOLD);
        for (const sx of [-1, 1]) { b(B, 0.1, 0.9, 0.08, sx * 0.4, 0.3, -0.52, GOLD, 0, 0, sx * -0.35); b(B, 0.1, 0.1, 0.1, sx * 0.55, 0.66, -0.52, GOLD); } // the chain
        b(B, 0.4, 0.1, 0.08, 0, -0.1, -0.54, GOLD); b(B, 0.26, 0.3, 0.06, 0, -0.32, -0.54, GOLD); b(B, 0.12, 0.12, 0.04, 0, -0.32, -0.58, RUBY); // the medallion
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
        if (L.apron != null) b(B, 0.9, L.dress ? 1.2 : 1.0, 0.05, 0, L.dress ? -1.15 : -0.45, -0.52, L.apron); // (a miller's / a keeper's apron over the overalls)
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
    } else if (L.wizard) { // a robe: a trimmed front, a sash, a star
        const rc = L.dressColor, tr = RANK_TRIM[L.rank] ?? L.accent;
        b(B, 1.26, 1.4, 0.86, 0, 0.05, 0, rc);
        b(B, 0.12, 1.42, 0.03, 0, 0.05, -0.44, tr);
        b(B, 0.56, 0.16, 0.08, 0, 0.72, -0.4, tr); // collar
        b(B, 1.3, 0.16, 0.9, 0, -0.62, 0, shade(rc, 0.7)); b(B, 0.18, 0.16, 0.04, 0, -0.62, -0.46, tr); // sash
        b(B, 0.2, 0.2, 0.03, 0.32, 0.32, -0.45, L.role === 'master' ? 0xfff2a0 : 0xe8e8ff, 0, 0, Math.PI / 4); // a star
        for (let i = 1; i < (RANK_LEVEL[L.rank] ?? 0); i++) b(B, 0.13, 0.13, 0.03, 0.32, 0.32 - i * 0.24, -0.45, tr, 0, 0, Math.PI / 4); // (a teacher: 2 stars, the Master: 3)
        if (L.magicRobe) { for (const [x, y] of [[-0.34, 0.45], [-0.3, -0.2], [0.36, -0.3], [0.1, 0.5]]) b(B, 0.14, 0.14, 0.03, x, y, -0.45, 0xbfe8ff, 0, 0, Math.PI / 4); b(B, 0.14, 1.42, 0.035, 0, 0.05, -0.445, 0xffe08a); } // a magic robe: pale stars, a gold front
        if (L.role === 'seller' || L.role === 'wanderer') { b(B, 0.3, 0.34, 0.2, -0.42, -0.84, -0.38, 0x8b5a2b); b(B, 0.2, 0.08, 0.22, -0.42, -0.66, -0.38, tr); } // a satchel of scrolls
    } else { // merchant: vest, gold trim, coin pouch
        const v = L.accent;
        b(B, 1.23, 1.3, 0.83, 0, 0.08, 0, v); // (a hair narrower than the belt: their faces were flush and flickered)
        b(B, 0.36, 1.3, 0.02, 0, 0.08, -0.425, L.shirt);
        b(B, 0.06, 1.3, 0.03, -0.21, 0.08, -0.43, GOLD); b(B, 0.06, 1.3, 0.03, 0.21, 0.08, -0.43, GOLD);
        for (const y of [0.4, 0.1, -0.2]) b(B, 0.07, 0.07, 0.03, 0, y, -0.44, GOLD);
        b(B, 0.5, 0.14, 0.06, 0, 0.7, -0.42, 0xffffff); // collar ruff
        if (!L.dress) belt(-0.62, LEATHER, GOLD);
        b(B, 0.34, 0.38, 0.22, 0.42, -0.84, -0.38, 0x8b5a2b); // coin pouch on the belt
        b(B, 0.22, 0.08, 0.24, 0.42, -0.64, -0.38, GOLD);
        b(B, 0.12, 0.12, 0.03, 0.42, -0.86, -0.5, GOLD);
        if (L.apron != null) { // a shopkeeper's apron over the vest (the baker, the innkeeper — Trades.js)
            const a = L.apron;
            b(B, 0.96, L.dress ? 2.1 : 1.35, 0.06, 0, L.dress ? -0.68 : -0.4, -0.47, a);
            b(B, 0.12, 0.42, 0.05, -0.34, 0.56, -0.46, a); b(B, 0.12, 0.42, 0.05, 0.34, 0.56, -0.46, a);
            b(B, 0.5, 0.3, 0.04, 0, -0.55, -0.51, shade(a, 0.9)); // pocket
        }
    }
    if (L.cross) { b(B, 0.1, 0.5, 0.05, 0, 0.12, -0.46, L.accent); b(B, 0.3, 0.1, 0.05, 0, 0.22, -0.46, L.accent); } // a priest's golden cross on the chest
    return B;
}

/** Shoulder pivot; the arm hangs along −Y (top +0.2, hand down to −1.35). side −1 = left. */
function armBoxes(L, side) {
    const B = [];
    if (L.skeleton) {
        B.push(...SKB.upperArm, ...SKB.forearm, ...SKB.hand);
        if (L.rags && side > 0) b(B, 0.38, 0.3, 0.38, 0, -0.05, 0, L.rags); // a torn sleeve
        return B;
    }
    if (L.coat) {
        b(B, 0.44, 1.0, 0.44, 0, -0.3, 0, L.coat);
        b(B, 0.58, 0.34, 0.58, 0, -0.86, 0, 0x8e1620); // the great cuff
        b(B, 0.6, 0.05, 0.6, 0, -0.7, 0, GOLD);
        b(B, 0.42, 0.12, 0.42, 0, -1.06, 0, 0xffffff); // lace
        b(B, 0.36, 0.3, 0.36, 0, -1.2, 0, L.skin);
        return B;
    }
    if ((L.role === 'knight' || L.role === 'king') && !L.unarmored) {
        const king = L.role === 'king';
        b(B, 0.42, 1.15, 0.42, 0, -0.375, 0, L.magic ? MSTEEL : STEEL);
        b(B, 0.62, 0.36, 0.64, side * 0.06, 0.17, 0, king ? GOLD : STEEL_LIGHT); // pauldron
        b(B, 0.56, 0.14, 0.58, side * 0.04, -0.06, 0, king ? GOLD_DARK : STEEL);
        b(B, 0.48, 0.18, 0.48, 0, -0.55, 0, king ? GOLD : STEEL_LIGHT); // elbow
        b(B, 0.5, 0.12, 0.5, 0, -0.92, 0, king ? GOLD : STEEL_DARK);
        b(B, 0.44, 0.42, 0.44, 0, -1.15, 0, L.magic ? MSTEEL_DARK : STEEL_DARK); // gauntlet
        if (L.magic) b(B, 0.1, 0.1, 0.03, 0, -0.55, -0.25, RUNE, 0, 0, Math.PI / 4);
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
    if (L.wizard && !L.robeOff) {
        b(B, 0.54, 0.2, 0.54, 0, -0.95, 0, shade(L.dressColor, 0.85)); // a wide robe cuff
        for (let i = 0; i < (RANK_LEVEL[L.rank] ?? 0); i++) b(B, 0.56, 0.05, 0.56, 0, -0.88 - i * 0.07, 0, RANK_TRIM[L.rank]); // his rank: stripes on the cuff
    }
    return B;
}

function thighBoxes(L) {
    const B = [];
    if (L.skeleton) {
        B.push(...SKB.thigh);
        if (L.rags) b(B, 0.46, 0.38, 0.46, 0, -0.18, 0, L.rags);
        return B;
    }
    if ((L.role === 'knight' || L.role === 'king') && !L.unarmored) {
        b(B, 0.5, LEG_UP, 0.5, 0, -LEG_UP / 2, 0, L.magic ? MSTEEL : STEEL);
        b(B, 0.56, 0.22, 0.58, 0, -0.92, -0.02, L.role === 'king' ? GOLD : STEEL_LIGHT);
        return B;
    }
    if (L.magicLegs) { // the advisor's magic greaves
        b(B, 0.5, LEG_UP, 0.5, 0, -LEG_UP / 2, 0, MSTEEL);
        b(B, 0.56, 0.22, 0.58, 0, -0.92, -0.02, MSTEEL_LIGHT);
        b(B, 0.1, 0.1, 0.03, 0, -0.5, -0.26, RUNE, 0, 0, Math.PI / 4);
        return B;
    }
    b(B, 0.5, LEG_UP, 0.5, 0, -LEG_UP / 2, 0, L.dress ? shade(L.dressColor, 0.6) : L.pants);
    return B;
}

/** Knee pivot; the shin + foot go down to −0.95 (= group y −1.95). */
function shinBoxes(L) {
    const B = [];
    if (L.skeleton) {
        B.push(...SKB.shin);
        return B;
    }
    if (L.coat) { // (tall black boots with wide tops)
        b(B, 0.5, 0.95, 0.56, 0, -0.47, -0.03, L.boots);
        b(B, 0.62, 0.22, 0.66, 0, -0.1, 0, shade(L.boots, 1.3));
        return B;
    }
    if ((L.role === 'knight' || L.role === 'king') && !L.unarmored) {
        const m = L.magic;
        b(B, 0.5, 0.62, 0.5, 0, -0.31, 0, m ? MSTEEL : STEEL);
        b(B, 0.54, 0.34, 0.66, 0, -0.78, -0.06, m ? MSTEEL_DARK : STEEL_DARK);
        b(B, 0.4, 0.14, 0.2, 0, -0.88, -0.44, m ? MSTEEL : STEEL);
        return B;
    }
    if (L.magicLegs) {
        b(B, 0.5, 0.62, 0.5, 0, -0.31, 0, MSTEEL);
        b(B, 0.54, 0.34, 0.66, 0, -0.78, -0.06, MSTEEL_DARK);
        b(B, 0.4, 0.14, 0.2, 0, -0.88, -0.44, MSTEEL_LIGHT);
        b(B, 0.1, 0.1, 0.03, 0, -0.3, -0.26, RUNE, 0, 0, Math.PI / 4);
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
        case 'bucket': // a wooden bucket of water, hanging from the hand by its bail (see HANGING)
            b(B, 0.05, 0.05, 0.5, 0, 0.02, 0, IRON);
            b(B, 0.05, 0.36, 0.05, 0, -0.16, -0.24, IRON); b(B, 0.05, 0.36, 0.05, 0, -0.16, 0.24, IRON);
            b(B, 0.5, 0.48, 0.5, 0, -0.56, 0, 0x8a5a2b);
            b(B, 0.54, 0.06, 0.54, 0, -0.42, 0, IRON); b(B, 0.54, 0.06, 0.54, 0, -0.72, 0, IRON);
            b(B, 0.42, 0.04, 0.42, 0, -0.34, 0, 0x6fb7e8);
            break;
        case 'basket': // hangs from the hand (see HANGING)
            b(B, 0.06, 0.06, 0.48, 0, 0.02, 0, WOOD);
            b(B, 0.06, 0.32, 0.06, 0, -0.14, -0.21, WOOD); b(B, 0.06, 0.32, 0.06, 0, -0.14, 0.21, WOOD);
            b(B, 0.46, 0.38, 0.6, 0, -0.5, 0, 0xb07d3a);
            b(B, 0.5, 0.08, 0.64, 0, -0.3, 0, WOOD);
            for (const [x, z, c] of [[-0.1, -0.15, 0xc0392b], [0.08, 0.12, 0xc0392b], [0.05, -0.05, 0x7cb342], [-0.08, 0.16, 0xf1c40f]]) b(B, 0.16, 0.16, 0.16, x, -0.25, z, c);
            break;
        case 'wand':
            // a handle, a slim shaft, a pale tip (the grip at the origin, the tip at TIP_Y.wand)
            b(B, 0.09, 0.3, 0.09, 0, 0.0, 0, 0x3a2414);
            b(B, 0.11, 0.05, 0.11, 0, 0.16, 0, GOLD_DARK);
            b(B, 0.06, 0.75, 0.06, 0, 0.55, 0, 0x6b4426);
            b(B, 0.07, 0.07, 0.07, 0, 0.96, 0, 0xe8e0c8);
            break;
        case 'wandMaster':
            b(B, 0.1, 0.3, 0.1, 0, 0.0, 0, 0x1c1410);
            b(B, 0.12, 0.05, 0.12, 0, 0.16, 0, GOLD);
            b(B, 0.06, 0.75, 0.06, 0, 0.55, 0, 0x2a1d2e);
            b(B, 0.1, 0.1, 0.1, 0, 0.97, 0, 0xc58bff, Math.PI / 4, 0, Math.PI / 4);
            break;
        case 'staff':
            b(B, 0.1, 2.4, 0.1, 0, 1.0, 0, 0x5a3a1e);
            b(B, 0.14, 0.12, 0.14, 0, 2.2, 0, 0x3a2414);
            b(B, 0.2, 0.2, 0.2, 0, 2.38, 0, 0x8fe3ff, Math.PI / 4, 0, Math.PI / 4);
            break;
        case 'longbow': {
            // a knight's bow: the grip in the fist, the stave up and down across the forearm (local Z),
            // the string behind it (towards the archer), an arrow on the string along the arm
            b(B, 0.1, 0.14, 0.24, 0, 0, 0, LEATHER);
            for (const s of [1, -1]) {
                b(B, 0.08, 0.08, 0.8, 0, 0, s * 0.5, WOOD);
                b(B, 0.07, 0.07, 0.62, 0, -0.12, s * 1.16, WOOD, s * 0.38, 0, 0); // (the limbs bend back to the archer)
                b(B, 0.08, 0.08, 0.08, 0, -0.24, s * 1.42, 0x3a2414);
            }
            b(B, 0.02, 0.02, 2.84, 0, -0.26, 0, 0xe8e0c8); // the string
            b(B, 0.04, 1.26, 0.04, 0.05, 0.37, 0, 0x8b6a3a); // the arrow
            b(B, 0.07, 0.14, 0.07, 0.05, 1.02, 0, IRON);
            b(B, 0.02, 0.24, 0.1, 0.05, -0.12, 0, 0xf2f2f2);
            break;
        }
        case 'rapier': // Captain Black Moustache's: a cup hilt, a long slim blade (he thrusts with it, parries spells with it)
            b(B, 0.14, 0.14, 0.14, 0, -0.26, 0, GOLD);
            b(B, 0.09, 0.36, 0.09, 0, -0.04, 0, 0x2a1a10);
            b(B, 0.36, 0.12, 0.36, 0, 0.19, 0, GOLD); // the cup
            b(B, 0.6, 0.06, 0.06, 0, 0.27, 0, GOLD_DARK); // the quillons
            b(B, 0.04, 0.42, 0.04, 0.19, 0.0, 0, GOLD); // the knuckle bow
            b(B, 0.06, 2.1, 0.04, 0, 1.32, 0, 0xe8eef4);
            b(B, 0.03, 0.2, 0.03, 0, 2.45, 0, 0xc8d0d8);
            break;
        case 'cutlass': // a sailor's short curved sabre
            b(B, 0.13, 0.13, 0.13, 0, -0.22, 0, IRON);
            b(B, 0.1, 0.32, 0.1, 0, -0.02, 0, LEATHER);
            b(B, 0.36, 0.1, 0.24, 0, 0.18, -0.04, 0x8a7a4a); // the shell guard
            b(B, 0.18, 0.75, 0.05, 0, 0.6, 0, 0xc8d0d8);
            b(B, 0.19, 0.55, 0.05, -0.05, 1.15, 0, 0xc8d0d8, 0, 0, 0.16);
            b(B, 0.1, 0.18, 0.05, -0.12, 1.46, 0, 0xc8d0d8, 0, 0, 0.5);
            break;
        case 'axe': // a boarding axe
            b(B, 0.1, 1.5, 0.1, 0, 0.5, 0, WOOD);
            b(B, 0.08, 0.5, 0.42, 0, 1.08, -0.24, 0x9aa3ad);
            b(B, 0.1, 0.2, 0.16, 0, 1.08, 0.1, IRON);
            break;
        case 'pistol': // a flintlock: the barrel along the hand's line
            b(B, 0.14, 0.4, 0.2, 0, -0.06, 0.06, WOOD, 0.35, 0, 0);
            b(B, 0.1, 0.8, 0.1, 0, 0.48, 0, IRON);
            b(B, 0.06, 0.18, 0.12, 0.07, 0.12, 0, GOLD_DARK);
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
const HANGING = new Set(['basket', 'pouch', 'bucket']);

// ==================================================================== model
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b2, t) => a + (b2 - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const POSE_KEYS = ['hx', 'hy', 'hz', 'headX', 'headY', 'headZ', 'aLX', 'aLZ', 'aRX', 'aRY', 'aRZ', 'wrist', 'lL', 'lR', 'kL', 'kR', 'block', 'cape', 'bounce'];
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

/** How many far copies may be built in one frame's time (each is a new geometry: a crowd at once was a 15 ms frame). */
const LOD_BUILD = { t: 0, n: 0, MAX: 3, WINDOW: 12 };
function lodBuildAllowed() {
    const now = performance.now();
    if (now - LOD_BUILD.t > LOD_BUILD.WINDOW) { LOD_BUILD.t = now; LOD_BUILD.n = 0; }
    return LOD_BUILD.n++ < LOD_BUILD.MAX;
}

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
        this.root.userData.vroot = true;
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
        // the moving face: one more small mesh on the head (its shape changes with the feeling; the cheap shared shapes — faceGeo)
        this._face = newFace();
        this._ftgt = newFace();
        this._faceMesh = null;
        this._faceKey = '';
        this._faceAt = 0;
        if (hasFace(look)) {
            const fq = quantFace(this._face);
            this._faceMesh = this._mesh(this.head, faceBoxes(look, fq), false);
            this._faceMesh.userData.noFar = true; // (drawn on its own near the hero: the one far shape would be made again at each look of the face)
            this._faceKey = faceKey(fq);
        }
        this._gest = null; this._gestT = 0; this._gestWait = 1 + (look.seed & 7) * 0.2; this._gestLast = null; this._gestId = null;
        this._grng = (((look.seed | 0) * 2654435761) >>> 0) || 1;
        // a wizard's pointed hat: its own two meshes (it folds back under a low ceiling)
        this.hat = null;
        this.hatTilt = 0;
        this._hatTarget = 0;
        if (String(look.hat).startsWith('wizard')) {
            const H = hatParts(look);
            this.hatPivot = new THREE.Object3D();
            this.hatPivot.position.set(0, HAT_PIVOT_Y, 0);
            this.head.add(this.hatPivot);
            this.hat = this._mesh(this.hatPivot, H.base);
            this.hatBend = new THREE.Object3D();
            // (the fold is at the front edge of the upper crown: the cloth falls back over it)
            this.hatBend.position.set(0, H.joint, -0.45);
            this.hatPivot.add(this.hatBend);
            this.hatTop = this._mesh(this.hatBend, H.top);
            this.hatTop.position.z = 0.45;
        }
        this.aimPitch = 0;
        this.castNow = false;
        this._flickT = 0;

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

        // a skeleton: green fire in its eye sockets (its own meshes — they glow in the dark, a blow's red flash leaves them)
        if (look.skeleton) for (const sx of [-1, 1]) { const e = new THREE.Mesh(EYE_GEO, EYE_MAT); e.position.set(sx * 0.24, 0.6, -0.585); this.head.add(e); }

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
        // asleep: how far lain down (0…1), the turn onto a side, when the next turn over comes
        this._lie = 0; this._roll = 0; this._rollTo = 0; this._rollT = 12 + ((look.seed >>> 3) % 30);
        this.blanket = null; this.mat = null; this.torch = null;
        // each moves in their own way: their walk; a wizard his stance, swing, shield… (MoveStyle.js — from the seed, the same everywhere)
        this._wiz = WIZARD_LOOK_ROLES.has(look.role);
        this.style = styleOf(look, this._wiz);
        this._fightT = 99;
        // a chore (Chores.js / ChoreAnim.js): its things on the ground, what is in the hand
        this.chore = null; this.choreSide = 0; this.choreBeat = null; this.choreNote = 0;
        this.props = new THREE.Group(); // (on the villager's own ground: y 0 = the feet)
        this.props.userData.farOne = true; // (a body's copy — Death.js — leaves the chore's things out)
        this.root.add(this.props);
        this._chores = {}; this._choreHands = {}; this._propMeshes = []; this._choreHand = null;
        this._lift = 0; this._legZ = 0;
    }

    /** The shape of a chore's thing (shared by everybody — the shape cache), in the villager's one material. */
    _propMesh(boxes) {
        const m = new THREE.Mesh(takeGeo(partGeometry(boxes)), MAT);
        m.castShadow = this._shadow;
        m.raycast = () => {}; // (a blow at the ladder is no blow at the man)
        this._propMeshes.push(m);
        return m;
    }

    /** Start / stop a chore: its things shown, the tool in the hand changed. */
    _setChore(key, side) {
        const was = this.chore;
        if (was && this._chores[was]) for (const o of this._chores[was].list) o.visible = false;
        if (this._choreHand) this._choreHand.visible = false;
        this._choreHand = null;
        this.chore = key; this.choreSide = side;
        this._lift = 0; this._legZ = 0;
        this.root.position.y = -VILLAGER_FOOT_OFFSET;
        this.leftLeg.rotation.z = this.rightLeg.rotation.z = 0;
        if (this.tool) this.tool.visible = true;
        if (!key) return;
        let set = this._chores[key];
        if (!set && PROPS[key]) {
            set = this._chores[key] = { parts: {}, list: [] };
            for (const [name, d] of Object.entries(PROPS[key])) {
                const o = this._propMesh(d.boxes);
                if (d.at) o.position.set(d.at[0], d.at[1], d.at[2]);
                (d.torso ? this.torso : this.props).add(o);
                set.parts[name] = o; set.list.push(o);
            }
        }
        if (set) for (const o of set.list) o.visible = true;
        const h = CHORE_HAND[key];
        if (h) {
            let o = this._choreHands[h];
            if (!o) {
                o = this._choreHands[h] = this._propMesh(HAND[h].boxes);
                if (HAND[h].hang) o.rotation.x = -REST_WRIST;
                this.handSlot.add(o);
            }
            o.visible = !(this.limbs && this.limbs.rightArm != null); // (no right arm — Dismember: nothing in it)
            this._choreHand = o;
        }
    }

    /** A burning torch in the left hand (the night watch). */
    setTorch(on) {
        if (!!this.torch === !!on) return;
        if (!on) { this.leftArm.remove(this.torch); this.torch = null; return; }
        const t = this.torch = new THREE.Group();
        const stick = new THREE.Mesh(TORCH_STICK, STICK_MAT);
        const flame = new THREE.Mesh(TORCH_FLAME, FLAME_MAT);
        flame.position.y = 0.7;
        t.add(stick, flame);
        t.position.set(0, -1.15, -0.25);
        t.rotation.x = -1.2; // (held up and forward when the arm is raised a little)
        this.leftArm.add(t);
    }

    _mesh(parent, boxes, shadow = true) {
        const m = new THREE.Mesh(takeGeo(partGeometry(boxes)), MAT);
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
            giveGeo(this.tool.geometry);
            this.tool = null;
        }
        this.toolKind = kind;
        if (kind === 'none') return;
        this.tool = new THREE.Mesh(takeGeo(partGeometry(toolBoxes(kind === 'wand' && this.look.role === 'master' ? 'wandMaster' : kind))), this._currentMat());
        this.tool.castShadow = this._shadow;
        if (HANGING.has(kind)) this.tool.rotation.x = -REST_WRIST; // hangs along the arm
        this.handSlot.add(this.tool);
        this._meshes.push(this.tool);
    }

    // ------------------------------------------------------------ materials
    _currentMat() { return this._flashT > 0 ? HIT_MAT : this._hl ? HL_MAT : MAT; }
    _applyMaterial() { const m = this._currentMat(); for (const o of this._meshes) o.material = m; if (this._lod) { this._lod.material = m; this._lodMat = m; } }

    // ------------------------------------------------------------ far away: one shape
    /**
     * Far from the player (CastleLife): the whole person is drawn as ONE shape, made again from the pose
     * each time the model is moved (far people move every 0.07–0.12 s anyway) — a village's sixty people
     * were ~500 draws (8–12 a person), the most of a frame's drawing near a castle. Not while something
     * of its own is on it (a torch, a blanket, a skeleton's eyes, a cut limb): then drawn as it is.
     */
    setFar(on) {
        if (on && (this.torch || this.blanket || this.mat || this.look.skeleton || this.limbs)) on = false;
        if (!on) {
            if (this._far) { this._far = false; this._one?.set(false); }
            return;
        }
        // (a crowd going far at once — a settlement woken, a flight over a town: its one-shape copies are made a few
        // a frame, the rest stay as they are a moment longer — the next look of CastleLife asks again)
        if (!this._one && !lodBuildAllowed()) return;
        this._far = true;
        // (the one shape is moved by the video card — FarShape: its parts are the bones; nothing remade on the processor
        // at each pose, as the old copy was — 10–22 ms frames when a town's people went far at once in flight)
        if (!this._one) { this._one = new FarShape(this.group, { cache: false }); this.group.userData.farRadius = 4.5; }
        if (!this._one.on) this._one.set(true); else this._one.check(); // (a tool taken, a red flash: the shape follows)
    }

    /** The far shape made again from the parts as they are posed now. */
    _refreshLod() {
        const ms = this._meshes;
        // the parts drawn now (hidden ones — a shield gone with the arm — are left out)
        const list = this._lodList || (this._lodList = []);
        list.length = 0;
        let nv = 0, ni = 0;
        for (const m of ms) {
            let o = m, shown = true;
            while (o && o !== this.root) { if (!o.visible) { shown = false; break; } o = o.parent; }
            if (!shown || o !== this.root) continue;
            list.push(m);
            nv += m.geometry.attributes.position.count;
            ni += m.geometry.index.count;
        }
        let lod = this._lod;
        const was = this._lodGeos || (this._lodGeos = []);
        let same = !!lod && was.length === list.length;
        for (let i = 0; same && i < list.length; i++) same = was[i] === list[i].geometry;
        if (!same) {
            was.length = 0;
            for (const m of list) was.push(m.geometry);
            const geo = new THREE.BufferGeometry();
            const pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage);
            const nor = new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage);
            const col = new Float32Array(nv * 3), idx = new Uint16Array(ni);
            let vo = 0, io = 0;
            for (const m of list) {
                const G = m.geometry, n = G.attributes.position.count, I = G.index.array;
                col.set(G.attributes.color.array, vo * 3);
                for (let i = 0; i < I.length; i++) idx[io++] = I[i] + vo;
                vo += n;
            }
            geo.setAttribute('position', pos);
            geo.setAttribute('normal', nor);
            geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
            geo.setIndex(new THREE.BufferAttribute(idx, 1));
            geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.4, 0), 4.5); // (a person, whatever the pose)
            if (lod) { lod.geometry.dispose(); lod.geometry = geo; } else {
                lod = this._lod = new THREE.Mesh(geo, this._lodMat = this._currentMat());
                lod.castShadow = false; // (far: no shadow — Shadows.js)
                lod.raycast = () => {}; // (the parts are what is hit)
                lod.userData.farOne = true; // (a copy of the person — a body, Death.js — leaves it out: its parts are shown)
                this.group.add(lod);
            }
        }
        // the parts' places relative to the person (the group), each vertex put there
        this.group.updateMatrixWorld(true);
        _lodInv.copy(this.group.matrixWorld).invert();
        const P = lod.geometry.attributes.position, N = lod.geometry.attributes.normal, pa = P.array, na = N.array;
        let vo = 0;
        for (const m of list) {
            const e = _lodM.multiplyMatrices(_lodInv, m.matrixWorld).elements;
            const G = m.geometry, sp = G.attributes.position.array, sn = G.attributes.normal.array, n = G.attributes.position.count;
            for (let i = 0; i < n; i++) {
                const k = i * 3, o = (vo + i) * 3, x = sp[k], y = sp[k + 1], z = sp[k + 2], a = sn[k], b = sn[k + 1], c = sn[k + 2];
                pa[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
                pa[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
                pa[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
                na[o] = e[0] * a + e[4] * b + e[8] * c;
                na[o + 1] = e[1] * a + e[5] * b + e[9] * c;
                na[o + 2] = e[2] * a + e[6] * b + e[10] * c;
            }
            vo += n;
        }
        P.needsUpdate = true;
        N.needsUpdate = true;
        // (its material as the parts' — set only when that changes: a blow's red tint on it — HurtFlash — stays)
        const mat = this._currentMat();
        if (this._lodMat !== mat) { this._lodMat = mat; lod.material = mat; }
        lod.visible = true;
        this.root.visible = false;
    }

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

    /** World position of the tip of a wand / a staff (else the hand). */
    getWandTip(out = new THREE.Vector3()) {
        const y = TIP_Y[this.toolKind];
        if (!this.tool || y == null) return this.getRightHandWorldPosition(out);
        this.tool.updateWorldMatrix(true, false);
        return this.tool.localToWorld(out.set(0, y, 0));
    }

    /** World direction the wand points (from the grip to the tip). */
    getWandDir(out = new THREE.Vector3()) {
        if (!this.tool) return out.set(-Math.sin(this.group.rotation.y), 0, -Math.cos(this.group.rotation.y));
        this.tool.updateWorldMatrix(true, false);
        const e = this.tool.matrixWorld.elements;
        return out.set(e[4], e[5], e[6]).normalize(); // (the tool's +Y axis)
    }

    /** Where the wand aims up / down (radians, + up) when casting. */
    setAim(pitch) { this.aimPitch = Math.max(-1.2, Math.min(1.2, pitch || 0)); }

    /** 0 = the hat stands up, 1 = it meets a ceiling and folds back. */
    setHatTilt(k) { this._hatTarget = k ? 1 : 0; }

    /** The bearing of the feeling and the gestures of the talk (state.emo: an emotion key; state.gctx: the situation; state.gest: a gesture to play now). */
    _feel(dt, state, mode, T) {
        const E = EMOTIONS[state.emo] || EMOTIONS.neutral, bd = E.body;
        T.headX += bd.headX; T.headZ += bd.headZ; T.hx += bd.lean;
        if (bd.shoulders) { T.aLZ -= bd.shoulders; T.aRZ += bd.shoulders; }
        if (state.gest !== this._gestId) {
            this._gestId = state.gest || null;
            const g = this._gestId && GESTURES[this._gestId];
            if (g) this._startGest(g);
        }
        if (!this._gest) {
            if (mode !== 'talk') return;
            this._gestWait -= dt;
            if (this._gestWait > 0) return;
            this._grng = (Math.imul(this._grng, 1664525) + 1013904223) >>> 0;
            const rnd = () => { this._grng = (Math.imul(this._grng, 1664525) + 1013904223) >>> 0; return this._grng / 4294967296; };
            const g = pickGesture({ ctx: state.gctx || 'answer', emo: state.emo || 'neutral', role: this.look.role, rng: rnd, last: this._gestLast, lively: 0.7 + (this.look.seed & 15) / 20 });
            if (!g) { this._gestWait = 0.8 + rnd() * 1.4; return; }
            this._startGest(g);
        }
        if (!this._gest) return;
        this._gestT += dt;
        const e = gesturePose(T, this._gest, this._gestT, E.amp, E.tempo);
        if (e <= 0 && this._gestT > 0.2) {
            this._gestLast = this._gest.id; this._gest = null;
            this._grng = (Math.imul(this._grng, 1664525) + 1013904223) >>> 0;
            this._gestWait = (0.5 + (this._grng / 4294967296) * 2.2) / (E.tempo || 1);
        }
    }

    /** A gesture begins — with a free hand: the sword hand and the shield arm do not wave. */
    _startGest(g) {
        const sword = this.toolKind && this.toolKind !== 'none' && !this._sheath;
        if (sword) {
            if (g.side === 'r') g = GESTURES[g.id.replace('_r_', '_l_')] || null;
            else if (g.side === 'b' && g.arm) g = null;
        }
        if (g && this.shield && g.side !== 'r' && g.arm) g = g.side === 'l' ? GESTURES[g.id.replace('_l_', '_r_')] : null;
        this._gest = g || null;
        this._gestT = 0;
    }

    /** The moving face: eased toward the feeling, the mouth working while he talks; a new shape only when a number moved a step (≤ 12 a second). */
    _faceStep(dt, state, mode, t) {
        const m = this._faceMesh;
        if (!m || !m.visible) return;
        const F = (EMOTIONS[state.emo] || EMOTIONS.neutral).face, g = this._ftgt;
        g.brow.y = F.brow.y; g.brow.tilt = F.brow.tilt; g.brow.asym = F.brow.asym;
        g.mouth.curve = F.mouth.curve; g.mouth.open = F.mouth.open; g.mouth.wide = F.mouth.wide; g.mouth.asym = F.mouth.asym; g.lid = F.lid;
        if (mode === 'talk' || state.talk) g.mouth.open = Math.max(F.mouth.open, Math.max(0, Math.sin(t * 10) + Math.sin(t * 6.3) * 0.6) * 0.55);
        easeFace(this._face, g, dt, 9);
        this._faceAt -= dt;
        if (this._faceAt > 0) return;
        this._faceAt = 0.08;
        const fq = quantFace(this._face), key = faceKey(fq);
        if (key === this._faceKey) return;
        const geo = takeGeo(faceGeo(faceBoxes(this.look, fq)));
        giveGeo(m.geometry);
        m.geometry = geo;
        this._faceKey = key;
    }

    /** Far from the hero the moving face is not drawn (a brow is a pixel at 40 m): the shape stays as it is. */
    faceOn(on) { const m = this._faceMesh; if (m && m.visible !== on) m.visible = on; }

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
        if (SLEEP_MODES.has(prev) && !SLEEP_MODES.has(mode)) this._leaveSleep();
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
        this.choreBeat = null;
        if (!(dt > 0)) dt = 0;
        if (dt > 0.25) dt = 0.25;
        const mode = MODES.includes(state.mode) ? state.mode : 'idle';
        const ck = state.chore || null;
        if (ck !== this.chore || (ck && (state.side | 0) !== this.choreSide)) this._setChore(ck, state.side | 0);
        if (mode !== this.mode) this._enterMode(mode);
        this._bare = !!state.bare; // (lying down on an order, in the open: no blanket, no mat)
        if (!!state.sheath !== !!this._sheath) { this._sheath = !!state.sheath; if (this.tool) this.tool.visible = !this._sheath; } // (the sword in its scabbard on an order)
        if (this._flashT > 0) { this._flashT -= dt; if (this._flashT <= 0) { this._flashT = 0; this._applyMaterial(); } }
        if (mode === 'dead') { this._updateDead(dt); return; }
        if (SLEEP_MODES.has(mode)) { this._updateSleep(dt, mode === 'sleepMat'); return; }

        this._t += dt;
        const t = this._t;
        let speed = state.speed;
        if (speed == null || !Number.isFinite(speed)) speed = DEFAULT_SPEED[mode] || 0;
        if (speed < 0) speed = 0;
        const T = this._tg, P = this._p;
        T.hx = 0; T.hy = 0; T.hz = 0; T.headX = 0; T.headZ = 0;
        T.headY = mode === 'idle' ? Math.sin(t * 0.45) * 0.25 : 0;
        T.aLX = 0; T.aLZ = -0.06; T.aRX = 0; T.aRY = 0; T.aRZ = 0.06; T.wrist = REST_WRIST;
        T.lL = 0; T.lR = 0; T.kL = 0; T.kR = 0; T.block = 0; T.cape = -0.1; T.bounce = 0;
        let rate = 10;
        let breathe = 0.015;

        // ---- legs: walk / run cycle
        const loco = mode !== 'sit' && mode !== 'ride' && mode !== 'bow' && mode !== 'sitCheer' && speed > 0.05;
        if (loco) {
            const G = GAITS[this.style.gait] || GAITS.plain;
            const gk = clamp01(1 - (speed - 2.5) / 2.5); // (the own walk shows at a walk; a run is a run for anybody)
            this._phase += dt * (2.0 + 2.4 * speed) * lerp(1, G.cad, gk);
            const amp = (Math.min(1, speed / 2.2) * 0.55 + clamp01((speed - 2.2) / 4) * 0.35) * lerp(1, G.amp, gk);
            const s = Math.sin(this._phase), c = Math.cos(this._phase);
            T.lL = s * amp; T.lR = -s * amp;
            T.kL = -Math.max(0, c) * amp * 1.5 - 0.05;
            T.kR = -Math.max(0, -c) * amp * 1.5 - 0.05;
            T.aLX = -s * amp * 0.9; T.aRX = s * amp * 0.9;
            T.hx = -0.2 * clamp01((speed - 2.5) / 3);
            if (state.slope) T.hx -= slopeLean(state.slope); // (uphill: the body leans into the hill; downhill a little back — HillWay.js)
            T.cape = -(0.14 + Math.min(0.5, speed * 0.1));
            if (mode === 'walk' || mode === 'run') gaitPose(T, this.style.gait, s, gk, t, this.toolKind === 'staff');
            rate = 28;
            breathe = 0;
        }

        // ---- upper body per mode (a wizard's own moves first — MoveStyle.wizardPose)
        const own = this._wiz ? wizardPose(this, T, mode, loco, dt, t) : 0;
        if (own) rate = own;
        else if (mode === 'idle' && !loco) idleShift(T, t, this.look.seed | 0);
        if (!own) switch (mode) {
            case 'talk':
                T.headX = Math.sin(t * 4.5) * 0.07 - 0.02;
                T.headZ = Math.sin(t * 1.3) * 0.05;
                if (!loco) { // (between the gestures — Gestures.js, _feel — the hands rest a little forward)
                    T.aRX = 0.3 + Math.sin(t * 1.3) * 0.05;
                    T.aLX = 0.22 + Math.sin(t * 1.1 + 1) * 0.05;
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
            case 'brace':
                // braced against a push (a skeleton on its deck: Sailors.BRACE): one foot forward, one back, knees
                // bent, crouched forward into it, the arms out for balance
                T.lL = 0.55; T.lR = -0.5; T.kL = -0.75; T.kR = -0.35;
                T.hx = -0.32; T.headX = 0.2;
                T.aLX = 0.7; T.aRX = 0.7; T.aLZ = -0.55; T.aRZ = 0.55;
                rate = 18; breathe = 0;
                break;
            case 'flinch':
                // startled (a spell flew past — Startle.js): knees bent, ducked forward, the arms up before the head
                T.kL = -0.7; T.kR = -0.6; T.lL = 0.25; T.lR = 0.15;
                T.hx = -0.35; T.headX = 0.25;
                T.aLX = 2.1; T.aRX = 1.7; T.aLZ = -0.45; T.aRZ = 0.35;
                rate = 30; breathe = 0;
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
            case 'climb': {
                // hands up on the edge, pulling in turns; legs kicking up the wall
                const c = Math.sin(t * 7);
                T.aLX = 2.7 + c * 0.35; T.aRX = 2.7 - c * 0.35;
                T.aLZ = -0.12; T.aRZ = 0.12;
                T.hx = -0.4; T.headX = 0.25;
                T.lL = 0.7 + c * 0.55; T.lR = 0.7 - c * 0.55;
                T.kL = -1.0 - Math.max(0, c) * 0.6; T.kR = -1.0 - Math.max(0, -c) * 0.6;
                T.wrist = -0.3;
                rate = 22;
                breathe = 0;
                break;
            }
            case 'bow':
                T.hx = -0.5; T.headX = -0.3;
                T.aLX = 0.45; T.aRX = 1.4; T.aRZ = -0.9;
                rate = 6;
                break;
            case 'cast': {
                // the wand arm points where the spell goes; the wand continues the forearm
                if (this.castNow) { this.castNow = false; this._flickT = 0.12; }
                T.aRX = Math.PI / 2 + this.aimPitch;
                T.aRZ = 0.05;
                T.wrist = -Math.PI - (this._flickT > 0 ? 0.3 : 0);
                T.aLX = 0.35; T.aLZ = -0.25;
                T.hx = -0.05;
                T.headX = -this.aimPitch * 0.5;
                rate = 30;
                break;
            }
            case 'shoot':
                // the bow arm straight out at the target, the other hand drawing the string back to the chin
                T.aRX = Math.PI / 2 + this.aimPitch; T.aRZ = 0.08;
                T.wrist = -Math.PI;
                T.aLX = Math.PI / 2 + this.aimPitch * 0.8 - 0.15; T.aLZ = -0.75;
                T.hx = -0.05; T.hy = 0.25;
                T.headX = -this.aimPitch * 0.5; T.headY = -0.2;
                rate = 20;
                break;
            case 'practice':
                // little circles and flicks of the wand (practising)
                T.aRX = 1.1 + 0.3 * Math.sin(t * 2.2);
                T.aRZ = -0.3 * Math.sin(t * 4.4);
                T.wrist = -Math.PI + 0.4;
                T.aLX = 0.3; T.aLZ = -0.15;
                T.headX = -0.2;
                rate = 18;
                break;
            case 'shield':
                // the free hand up in front: a shield of light before it
                T.aLX = Math.PI / 2; T.aLZ = 0.2;
                T.aRX = Math.PI / 2 + this.aimPitch; T.wrist = -Math.PI;
                rate = 30;
                break;
            case 'offer':
                // holding a scroll out to you
                T.aLX = 1.2; T.aLZ = 0.15;
                T.headX = 0.1;
                rate = 12;
                break;
            case 'situp':
                // sat up on the bed, legs over its side: a stretch, a yawn, rubbing the eyes
                T.lL = T.lR = Math.PI / 2; T.kL = T.kR = -Math.PI / 2;
                T.hx = 0.18; T.headX = -0.15 + Math.sin(t * 1.4) * 0.1;
                T.aLX = 2.4 + Math.sin(t * 2) * 0.2; T.aRX = 1.6; T.aLZ = -0.2; T.aRZ = 0.3; T.wrist = -1.6;
                rate = 6;
                break;
            case 'flail': {
                // held up in the air by «Вингардиум Левиоса» (Levitation.js): nothing under the
                // feet — each kind of person struggles in its own way
                const r = this.role;
                if (r === 'knight' || r === 'king') {
                    // a fighter: twists and pulls hard, the legs kicking for the ground
                    const c = Math.sin(t * 3.2), s2 = Math.sin(t * 1.7), l = Math.sin(t * 4);
                    T.hy = c * 0.45; T.hx = -0.15 + s2 * 0.15;
                    T.aRX = 1.4 + c * 0.6; T.aRZ = -0.4 - s2 * 0.3; T.aLX = 1.4 - c * 0.6; T.aLZ = 0.4 + s2 * 0.3;
                    T.lL = 0.5 * l; T.lR = -0.5 * l; T.kL = -0.4 - Math.max(0, l) * 0.6; T.kR = -0.4 - Math.max(0, -l) * 0.6;
                    T.headX = 0.2; T.headY = -c * 0.3;
                    rate = 14;
                } else if (WIZARD_LOOK_ROLES.has(r)) {
                    // a wizard: the wand arm out, jabbing about for a spell to get free; the other hand grabs the air
                    const l = Math.sin(t * 5);
                    T.aRX = 1.7 + Math.sin(t * 6) * 0.35; T.aRZ = Math.sin(t * 2.3) * 0.4; T.wrist = -Math.PI + Math.sin(t * 9) * 0.3;
                    T.aLX = 2.2 + Math.sin(t * 5 + 1) * 0.5; T.aLZ = -0.5;
                    T.lL = l * 0.4; T.lR = -l * 0.4; T.kL = -0.5; T.kR = -0.5;
                    T.headY = Math.sin(t * 2.5) * 0.5; T.headX = 0.15;
                    rate = 18;
                } else {
                    // anyone else: panic — the arms windmill over the head, the legs run on nothing, the head turns about
                    const a = t * 11, l = Math.sin(t * 9);
                    T.aLX = 2.3 + Math.sin(a) * 0.7; T.aRX = 2.3 + Math.sin(a + 2) * 0.7;
                    T.aLZ = -0.5 - Math.cos(a) * 0.3; T.aRZ = 0.5 + Math.cos(a + 2) * 0.3;
                    T.lL = l * 0.7; T.lR = -l * 0.7; T.kL = -0.3 - Math.max(0, l) * 1.1; T.kR = -0.3 - Math.max(0, -l) * 1.1;
                    T.headY = Math.sin(t * 3.3) * 0.5; T.headX = 0.25; T.hx = Math.sin(t * 4) * 0.1;
                    rate = 30;
                }
                breathe = 0;
                break;
            }
            case 'swim': {
                // in deep water (CreatureSwim.js): the breaststroke — both hands forward, out wide and
                // back; the legs kick; the body leans into the water, the chin up over it
                const c = Math.sin(t * 3.4), k = Math.sin(t * 6.8);
                T.aLX = T.aRX = 2.0 + c * 0.55;
                T.aLZ = -0.25 - Math.max(0, -c) * 0.7; T.aRZ = 0.25 + Math.max(0, -c) * 0.7;
                T.wrist = -0.4;
                T.lL = -0.35 + k * 0.4; T.lR = -0.35 - k * 0.4; T.kL = -0.5 - Math.max(0, k) * 0.5; T.kR = -0.5 - Math.max(0, -k) * 0.5;
                T.hx = -0.45; T.headX = 0.45;
                rate = 18; breathe = 0;
                break;
            }
            case 'paddle': {
                // floundering (in plates, or going under): the hands slap at the water in turns, the
                // legs kick hard, the head pulled back to keep the mouth out
                const a = t * 7.5, l = Math.sin(t * 9);
                T.aLX = 1.5 + Math.sin(a) * 0.8; T.aRX = 1.5 + Math.sin(a + Math.PI) * 0.8;
                T.aLZ = -0.6 - Math.cos(a) * 0.25; T.aRZ = 0.6 + Math.cos(a) * 0.25;
                T.wrist = -0.2;
                T.lL = l * 0.6; T.lR = -l * 0.6; T.kL = -0.4 - Math.max(0, l) * 0.8; T.kR = -0.4 - Math.max(0, -l) * 0.8;
                T.hx = -0.15; T.headX = 0.55; T.headY = Math.sin(t * 2.3) * 0.3;
                rate = 26; breathe = 0;
                break;
            }
            case 'ride':
                // in the saddle (Travelers.js riders): the thighs forward along the horse's sides, the shins
                // down by its belly, the hands low before the body on the reins; the body rocks with the walk
                T.lL = T.lR = 1.0; T.kL = T.kR = -1.25;
                T.hx = 0.1 + Math.sin(t * 6) * 0.03;
                T.aLX = T.aRX = 0.85; T.aLZ = -0.12; T.aRZ = 0.12;
                T.wrist = -0.5;
                T.headY = Math.sin(t * 0.4) * 0.25;
                rate = 8;
                break;
            case 'chore':
                rate = this.chore ? choreBody(this, this.chore, T, t, dt) : 10;
                break;
            case 'sit':
                T.lL = T.lR = Math.PI / 2; T.kL = T.kR = -Math.PI / 2;
                T.hx = 0.08;
                T.aLX = T.aRX = 0.7; T.aLZ = -0.25; T.aRZ = 0.25;
                T.headY = Math.sin(t * 0.3) * 0.2;
                T.wrist = -0.7;
                rate = 8;
                break;
            default:
                // the duel arena: a duellist's efforts, the crowd on the stands (ArenaPoses.js)
                if (COMMAND_SET.has(mode)) { // (an order of the player: a pose — src/entities/CommandPoses.js)
                    rate = commandPose(T, mode, t) || rate;
                    if (mode === 'attn' || mode === 'salute') breathe = 0.008;
                } else if (ARENA_SET.has(mode)) {
                    if (this.castNow) { this.castNow = false; this._flickT = 0.12; }
                    rate = arenaPose(T, mode, t, this.aimPitch, this._flickT > 0);
                    if (mode === 'sitCheer' || mode === 'winded' || mode === 'stagger' || mode === 'triumph' || mode === 'flourish') breathe = 0;
                }
                break;
        }
        // ---- what he feels shows in the bearing, and in the hands when he talks (Emotions.js, Gestures.js)
        if (!own && !loco && (mode === 'idle' || mode === 'talk')) this._feel(dt, state, mode, T);
        this._faceStep(dt, state, mode, t);
        if (this.chore && mode !== 'chore') carryBody(this, this.chore, T); // (a bucket, a sack carried home)
        if (this._lookYaw != null && mode !== 'bow' && mode !== 'flail' && mode !== 'chore') T.headY = this._lookYaw;
        if (this._flickT > 0) this._flickT -= dt;
        if (this.hat) {
            // the hat folds back under a low ceiling and stands up again (soft cloth)
            this.hatTilt += (this._hatTarget - this.hatTilt) * (1 - Math.exp(-6 * dt));
            // (soft cloth: the upper crown bends back and crumples down)
            this.hatBend.rotation.x = 1.1 * this.hatTilt;
            this.hatBend.scale.y = 1 - 0.25 * this.hatTilt;
        }
        if (breathe) { T.aLZ -= Math.sin(t * 2.2) * 0.02; T.aRZ += Math.sin(t * 2.2) * 0.02; }

        // ---- smooth toward the targets and apply
        const k = 1 - Math.exp(-rate * dt);
        const kh = 1 - Math.exp(-8 * dt); // the head turns at its own pace
        for (const key of POSE_KEYS) P[key] += (T[key] - P[key]) * (key === 'headY' ? kh : k);
        const choreSit = mode === 'chore' && SIT_CHORES.has(this.chore);
        this._apply(t, breathe, mode === 'sit' || mode === 'situp' || mode === 'ride' || mode === 'sitCheer' || choreSit);
        if (this.chore) this._choreAfter(t, dt, mode === 'chore');
    }

    /** A chore after the body is posed: up on the ladder, legs apart, the tool away, the things moving. */
    _choreAfter(t, dt, doing) {
        const k = 1 - Math.exp(-6 * dt);
        this._liftNow = (this._liftNow || 0) + ((doing ? this._lift : 0) - (this._liftNow || 0)) * k;
        this.root.position.y = -VILLAGER_FOOT_OFFSET + this._liftNow;
        const z = doing ? this._legZ : 0;
        this.leftLeg.rotation.z += (z - this.leftLeg.rotation.z) * k;
        this.rightLeg.rotation.z = -this.leftLeg.rotation.z;
        if (this.tool) this.tool.visible = !this._choreHand && KEEP_WAND.has(this.chore);
        if (doing) choreThings(this, this.chore, t, dt, _v);
    }

    // ------------------------------------------------------------- asleep
    _sleepProps(onMat) {
        if (!this.blanket) {
            this.blanket = new THREE.Mesh(BLANKET_GEO, WOOL[(this.look.seed >>> 9) % WOOL.length]);
            this.blanket.position.set(0, 1.55, -0.6); // (over the front of the body, the feet to the chest)
            this.blanket.castShadow = this._shadow;
            this.root.add(this.blanket);
            this.mat = new THREE.Mesh(STRAW_GEO, STRAW_MAT);
            this.mat.receiveShadow = true;
            this.group.add(this.mat);
        }
        this.blanket.visible = !this._bare;
        this.mat.visible = onMat && !this._bare;
        this.mat.position.set(0, -VILLAGER_FOOT_OFFSET + 0.06, 0);
        if (this.tool) this.tool.visible = false;
        if (this.shield) this.shield.visible = false;
        if (this.torch) this.torch.visible = false;
    }

    _leaveSleep() {
        this._lie = 0; this._roll = 0; this._rollTo = 0;
        this.root.rotation.set(0, 0, 0);
        this.root.position.set(0, -VILLAGER_FOOT_OFFSET, 0);
        if (this.blanket) { this.blanket.visible = false; this.mat.visible = false; this.blanket.scale.z = 1; }
        if (this.tool) this.tool.visible = true;
        if (this.shield) this.shield.visible = true;
        if (this.torch) this.torch.visible = true;
    }

    /**
     * Asleep: on the back under the blanket (the head at local +Z, the middle of the body at the
     * group's place), slow breathing; now and then turned over onto a side, the knees drawn up.
     */
    _updateSleep(dt, onMat) {
        this._sleepProps(onMat);
        this._t += dt;
        const t = this._t;
        this._lie = Math.min(1, this._lie + dt / 0.9);
        this._rollT -= dt;
        if (this._rollT <= 0) {
            this._rollT = 18 + Math.random() * 35;
            this._rollTo = this._rollTo !== 0 ? 0 : (Math.random() < 0.5 ? -1.2 : 1.2);
        }
        this._roll += (this._rollTo - this._roll) * (1 - Math.exp(-2.5 * dt));
        const e = this._lie * this._lie * (3 - 2 * this._lie);
        const side = Math.abs(Math.sin(this._roll));
        this.root.rotation.set(e * Math.PI / 2, this._roll * e, 0);
        this.root.position.set(0, -VILLAGER_FOOT_OFFSET + (0.45 + 0.3 * side) * e + (onMat ? 0.12 : 0), -SLEEP_HALF * e);
        const P = this._p;
        const f = 1 - Math.exp(-6 * dt);
        const to = (key, v) => { P[key] += (v - P[key]) * f; };
        to('hx', 0.1 * side); to('hy', 0); to('hz', 0); to('headX', 0.15); to('headY', this._roll * 0.15); to('headZ', 0);
        to('aLX', 0.25 + 0.5 * side); to('aLZ', -0.12); to('aRX', 0.25 + 0.5 * side); to('aRY', 0); to('aRZ', 0.12); to('wrist', REST_WRIST);
        to('lL', 0.55 * side); to('lR', 0.45 * side); to('kL', -0.8 * side); to('kR', -0.7 * side); to('block', 0); to('cape', -0.05); to('bounce', 0);
        const br = Math.sin(t * 1.25 + (this.look.seed % 7)); // (slow, deep breaths)
        this._apply(t, 0.025 * br, true);
        this.pelvis.position.y = VILLAGER_FOOT_OFFSET;
        this.torso.position.y = 0.75 + 0.03 * br;
        this.blanket.scale.z = 1 + 0.12 * br;
    }

    _apply(t, breathe, sitting) {
        const P = this._p;
        this.body.rotation.set(P.hx, P.hy, P.hz);
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
        to('hx', 0); to('hy', 0); to('hz', 0); to('headX', 0.1); to('headY', 0.35); to('headZ', 0);
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
        if (this._lod) { this._lod.geometry.dispose(); this._lod = null; }
        this._one?.dispose();
        if (!this._gone) { this._gone = true; for (const m of this._meshes) giveGeo(m.geometry); for (const m of this._propMeshes) giveGeo(m.geometry); } // (its shapes: given back once)
    }
}

/**
 * Sample villagers for the shader prewarm "zoo": every role, every tool,
 * the hit and highlight materials. Their geometries are private clones, so
 * the caller may dispose them freely.
 */
/** The materials a person is drawn with (its own, a red flash, a highlight) — their one-shape twins warmed (Game.prewarm). */
export function villagerMaterials() { return [MAT, HIT_MAT, HL_MAT]; }

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
