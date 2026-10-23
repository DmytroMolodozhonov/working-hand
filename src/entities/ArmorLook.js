/**
 * ArmorLook.js — armour and robes on a hero (a VoxelCharacter: me and the other players) and
 * as things (in the hand, on the ground). Boxes from code, like the clothes (Appearance.js).
 *
 * The worn code (ArmorTypes.wornCode): {h, c, l, r} — 0 nothing, 1 plain steel, 2 magic
 * (a faint blue glow), 3 named (magic with gold), r: the robe (1 plain, 2 magic: a faint
 * violet glow), rc its colour. The helmet goes on the head, the breastplate on the body with
 * plates on the shoulders and the arms, the greaves on the legs, the robe over everything
 * down to the knees with a pointed hood (not under a helmet).
 */

import * as THREE from 'three';
import { addBodyGlow } from '../fx/EnchantGlow.js';

const STEEL = 0xb8c2cc, STEEL_DARK = 0x8a94a0, STEEL_MAGIC = 0xcfdcff, GOLD = 0xd4af37, LEATHER = 0x5a3a1e;

const _mats = new Map();
/** A shared material: plain steel, magic (glows a little), gold, cloth. */
function mat(color, glow = 0) {
    const key = color + ':' + glow;
    let m = _mats.get(key);
    if (!m) {
        m = new THREE.MeshLambertMaterial({ color, emissive: glow ? new THREE.Color(glow) : 0x000000, emissiveIntensity: glow ? 0.45 : 0 });
        m.userData.shared = true;
        _mats.set(key, m);
    }
    return m;
}
const box = (parent, w, h, d, m, x, y, z, list) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = true;
    b.userData.armor = true;
    parent.add(b);
    list?.push(b);
    return b;
};
/** The steel of a piece: plain, magic (a cold blue glow) or named (magic, gold trim). */
const steel = (code) => (code >= 2 ? mat(STEEL_MAGIC, 0x2f5fd0) : mat(STEEL));
const trim = (code) => (code === 3 ? mat(GOLD, 0x6a4a00) : code === 2 ? mat(0x9fc4ff, 0x3a6ae0) : mat(STEEL_DARK));

// ------------------------------------------------------------------ the pieces (parts)
/** A helmet round a head box 1.2 (its middle at 0): the crown, cheek and neck plates, a nasal. */
function helmetParts(p, code, list) {
    const s = steel(code), t = trim(code);
    box(p, 1.44, 0.5, 1.44, s, 0, 0.45, 0, list); // the crown (over the hair)
    box(p, 0.12, 0.85, 1.36, s, 0.7, 0.0, 0.04, list); // cheek plates
    box(p, 0.12, 0.85, 1.36, s, -0.7, 0.0, 0.04, list);
    box(p, 1.44, 0.85, 0.12, s, 0, 0.0, 0.7, list); // the neck guard (back)
    box(p, 1.46, 0.1, 1.46, t, 0, 0.22, 0, list); // the rim
    box(p, 0.14, 0.55, 0.1, t, 0, 0.0, -0.74, list); // the nasal (the face stays open)
    if (code >= 2) box(p, 0.12, 0.28, 0.9, t, 0, 0.82, 0.05, list); // a crest
    if (code === 3) box(p, 0.16, 0.5, 0.5, mat(0xb0202a), 0, 1.0, 0.25, list); // a plume
}

/** A breastplate round the body box 1.2×1.5×0.8 (torso space), the pauldrons on the shoulders. */
function chestParts(ch, p, code, list) {
    const s = steel(code), t = trim(code);
    box(p, 1.32, 1.3, 0.12, s, 0, 0.08, -0.46, list); // front
    box(p, 1.32, 1.3, 0.1, s, 0, 0.08, 0.46, list); // back
    box(p, 0.1, 1.3, 0.92, s, 0.66, 0.08, 0, list); // sides
    box(p, 0.1, 1.3, 0.92, s, -0.66, 0.08, 0, list);
    box(p, 0.9, 0.16, 0.9, t, 0, 0.78, 0, list); // the gorget
    box(p, 1.36, 0.14, 0.96, t, 0, -0.6, 0, list); // the belt edge
    box(p, 0.5, 0.3, 0.06, t, 0, 0.35, -0.53, list); // a ridge on the front
    for (const sx of [-1, 1]) box(p, 0.6, 0.3, 0.66, t, sx * 0.76, 0.66, 0, list); // pauldrons
    // the arms: plates on the upper arm and the forearm (the hands stay bare)
    for (const [a, e] of [[ch.leftArmAnchor, ch.leftElbowAnchor], [ch.rightArmAnchor, ch.rightElbowAnchor]]) {
        if (a) box(a, 0.48, 0.48, (ch.BONE_LENGTH_UPPER || 1) * 0.8, s, 0, 0, (ch.BONE_LENGTH_UPPER || 1) * 0.5, list);
        if (e) box(e, 0.44, 0.44, (ch.BONE_LENGTH_LOWER || 1) * 0.7, s, 0, 0, (ch.BONE_LENGTH_LOWER || 1) * 0.4, list);
    }
}

/** Greaves on a leg pivot (the leg 0.5 thick hangs down to −1.95): thigh, knee, shin, sabaton. */
function legParts(p, code, list) {
    const s = steel(code), t = trim(code);
    box(p, 0.6, 0.85, 0.6, s, 0, -0.5, 0, list);
    box(p, 0.64, 0.22, 0.68, t, 0, -1.0, -0.02, list); // the knee cop
    box(p, 0.58, 0.68, 0.58, s, 0, -1.45, 0, list);
    box(p, 0.6, 0.24, 0.8, s, 0, -1.82, -0.08, list); // the sabaton
}

/** A robe over everything to the knees; a pointed hood unless a helmet is on. */
function robeParts(ch, code, color, hood, list) {
    const magic = code >= 2;
    const cloth = mat(color || 0x2c3e7a, magic ? 0x3a1a6a : 0);
    const edge = magic ? mat(0xe8d07a, 0x6a5200) : mat(new THREE.Color(color || 0x2c3e7a).multiplyScalar(0.7).getHex());
    const T = ch.torso;
    box(T, 1.34, 1.56, 0.94, cloth, 0, 0.02, 0, list); // over the body
    box(T, 1.38, 1.5, 1.0, cloth, 0, -1.48, 0, list); // the long skirt (to the knees)
    box(T, 0.12, 2.9, 0.04, edge, 0, -0.68, -0.51, list); // the front edge
    box(T, 1.42, 0.12, 1.04, edge, 0, -2.2, 0, list); // the hem
    if (magic) for (const [x, y] of [[-0.4, 0.3], [0.35, -0.2], [-0.3, -1.1], [0.42, -1.6], [0.1, 0.55]]) box(T, 0.12, 0.12, 0.02, mat(0xfff0a0, 0xc0a020), x, y, -0.5, list); // little stars
    for (const e of [ch.leftElbowAnchor, ch.rightElbowAnchor]) if (e) box(e, 0.56, 0.56, 0.4, cloth, 0, 0, (ch.BONE_LENGTH_LOWER || 1) * 0.75, list); // wide cuffs
    if (hood && ch.head) {
        box(ch.head, 1.5, 0.12, 1.5, edge, 0, 0.62, 0, list); // the brim
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.66, 1.4, 6), cloth);
        cone.position.set(0, 1.35, 0.12); cone.rotation.x = 0.18; cone.castShadow = true; cone.userData.armor = true;
        ch.head.add(cone); list.push(cone);
    }
}

/**
 * The High Mage's suit (robe code 4): a long coat of midnight blue to the shins, gold everywhere —
 * the edges, a broad belt with a sapphire, a high collar, shoulder mantles, gold patterns on the
 * chest and the skirt (chevrons, a sun, stripes), runes that glow pale blue, and a cloak down the
 * back. No hat: the head stays bare (a helmet may be worn over it).
 */
const ARCH = { cloth: 0x15183f, deep: 0x0d0f2c, gold: 0xe7c25a, goldGlow: 0x7a5400, rune: 0x9fe8ff, runeGlow: 0x3aa8e0, gem: 0x2a6cff };
function archmageParts(ch, list) {
    const T = ch.torso;
    const cloth = mat(ARCH.cloth, 0x0a0c30), deep = mat(ARCH.deep), gold = mat(ARCH.gold, ARCH.goldGlow), rune = mat(ARCH.rune, ARCH.runeGlow), gem = mat(ARCH.gem, 0x1a3ad0);
    box(T, 1.36, 1.58, 0.96, cloth, 0, 0.02, 0, list); // the coat over the body
    box(T, 1.42, 1.9, 1.04, cloth, 0, -1.68, 0, list); // the long skirt (to the shins)
    // gold: the front edges, the hem (two bands), the belt with a sapphire, the high collar
    for (const sx of [-1, 1]) box(T, 0.1, 3.4, 0.04, gold, sx * 0.14, -0.9, -0.53, list);
    box(T, 1.46, 0.12, 1.08, gold, 0, -2.6, 0, list);
    box(T, 1.46, 0.06, 1.08, gold, 0, -2.38, 0, list);
    box(T, 1.42, 0.2, 1.02, gold, 0, -0.66, 0, list);
    box(T, 0.26, 0.26, 0.06, gem, 0, -0.66, -0.54, list);
    box(T, 1.0, 0.32, 1.0, deep, 0, 0.9, 0.04, list); // the collar…
    box(T, 1.04, 0.06, 1.04, gold, 0, 1.05, 0.04, list); // …its gold rim
    // the shoulder mantles with gold edges
    for (const sx of [-1, 1]) {
        box(T, 0.62, 0.22, 1.02, deep, sx * 0.62, 0.74, 0, list);
        box(T, 0.64, 0.06, 1.04, gold, sx * 0.62, 0.62, 0, list);
    }
    // the chest: gold chevrons and a sun with rays
    for (let k = 0; k < 3; k++) for (const sx of [-1, 1]) box(T, 0.34, 0.06, 0.03, gold, sx * 0.3, 0.42 - k * 0.2, -0.5, list).rotation.z = sx * 0.5;
    box(T, 0.22, 0.22, 0.03, gold, 0, -0.18, -0.5, list);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; box(T, 0.04, 0.14, 0.03, gold, Math.sin(a) * 0.2, -0.18 + Math.cos(a) * 0.2, -0.5, list).rotation.z = -a; }
    // the skirt: gold stripes and diamonds, glowing runes between them
    for (const x of [-0.5, -0.28, 0.28, 0.5]) box(T, 0.05, 1.5, 0.03, gold, x, -1.6, -0.54, list);
    for (const [x, y] of [[-0.39, -1.1], [0.39, -1.1], [-0.39, -1.9], [0.39, -1.9]]) box(T, 0.12, 0.12, 0.03, gold, x, y, -0.54, list).rotation.z = Math.PI / 4;
    for (const [x, y] of [[-0.39, -1.5], [0.39, -1.5], [-0.5, 0.1], [0.5, 0.1], [0, -2.15]]) box(T, 0.1, 0.18, 0.02, rune, x, y, -0.55, list);
    // runes round the hem, on the sides
    for (const sx of [-1, 1]) for (const y of [-1.3, -1.9]) box(T, 0.02, 0.18, 0.1, rune, sx * 0.72, y, 0, list);
    // the cloak: from the shoulders down the back, gold-edged, runes along it
    box(T, 1.5, 3.6, 0.06, deep, 0, -1.0, 0.56, list);
    box(T, 1.54, 0.1, 0.08, gold, 0, -2.8, 0.56, list);
    for (const sx of [-1, 1]) box(T, 0.06, 3.6, 0.08, gold, sx * 0.75, -1.0, 0.56, list);
    for (const y of [-1.0, -1.6, -2.2]) box(T, 0.14, 0.2, 0.02, rune, 0, y, 0.6, list);
    // a great gold star on the back of the cloak, a ring round it, gold chevrons below
    box(T, 0.22, 0.22, 0.02, gold, 0, 0.05, 0.6, list).rotation.z = Math.PI / 4;
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, r = k % 2 ? 0.26 : 0.34; box(T, 0.06, r, 0.02, gold, Math.sin(a) * r * 0.75, 0.05 + Math.cos(a) * r * 0.75, 0.6, list).rotation.z = -a; }
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; box(T, 0.05, 0.05, 0.02, rune, Math.sin(a) * 0.5, 0.05 + Math.cos(a) * 0.5, 0.6, list); }
    for (let k = 0; k < 2; k++) for (const sx of [-1, 1]) box(T, 0.4, 0.06, 0.02, gold, sx * 0.24, -0.62 - k * 0.22, 0.6, list).rotation.z = -sx * 0.45;
    // the sleeves: wide cuffs, gold bands
    for (const e of [ch.leftElbowAnchor, ch.rightElbowAnchor]) {
        if (!e) continue;
        const L = (ch.BONE_LENGTH_LOWER || 1);
        box(e, 0.6, 0.6, 0.44, cloth, 0, 0, L * 0.74, list);
        box(e, 0.64, 0.64, 0.08, gold, 0, 0, L * 0.96, list);
    }
    for (const a of [ch.leftArmAnchor, ch.rightArmAnchor]) if (a) box(a, 0.5, 0.5, (ch.BONE_LENGTH_UPPER || 1) * 0.8, cloth, 0, 0, (ch.BONE_LENGTH_UPPER || 1) * 0.5, list);
}

/**
 * Dress a VoxelCharacter in its armour / robe (call again whenever it changes; null takes
 * everything off). The parts follow the head, the body, the arms and the legs.
 */
export function dressArmor(ch, code) {
    for (const m of ch._armorParts || []) { m.parent?.remove(m); m.geometry?.dispose(); }
    ch._armorParts = [];
    const c = code || {};
    ch.armorWorn = { helmet: c.h | 0, chest: c.c | 0, legs: c.l | 0, robe: c.r | 0 };
    const list = ch._armorParts;
    if (c.h && ch.head) helmetParts(ch.head, c.h, list);
    if (c.c && ch.torso) chestParts(ch, ch.torso, c.c, list);
    if (c.l) for (const p of [ch.leftLegPivot, ch.rightLegPivot]) if (p) legParts(p, c.l, list);
    if (c.r === 4 && ch.torso) archmageParts(ch, list);
    else if (c.r && ch.torso) robeParts(ch, c.r, c.rc, !c.h, list);
    // (first person: what is on the head is not seen from inside — as the head itself; on the
    // torso it is seen looking down, as the torso is: Character.setFirstPerson)
    const layer = ch._fpv ? 1 : 0;
    for (const m of list) if (m.parent === ch.head) m.layers.set(layer);
    if (c.e > 0) addBodyGlow(ch, c.e - 1, list); // (enchanted on the pentagram: a faint rune shell — EnchantGlow.js)
    ch.refreshDarkArmor?.(); // (чёрная магия: трещины на новых доспехах)
}

// ------------------------------------------------------------------ as things
/**
 * A piece / a robe as a thing (lying, in the hand: it hangs from the fist by the leather
 * loop on its top). The same size as worn.
 */
export function armorItemModel(it) {
    const g = new THREE.Group();
    const code = it.named ? 3 : it.magic ? 2 : 1;
    const loop = (y) => box(g, 0.08, 0.16, 0.24, mat(LEATHER), 0, y, 0); // (a loop to carry it by)
    if (it.archmage) {
        // (the High Mage's suit, hanging by its collar: midnight blue, gold, glowing runes)
        const cloth = mat(ARCH.cloth, 0x0a0c30), gold = mat(ARCH.gold, ARCH.goldGlow), rune = mat(ARCH.rune, ARCH.runeGlow);
        box(g, 1.3, 1.9, 0.2, cloth, 0, -0.1, 0);
        box(g, 1.4, 0.12, 0.24, gold, 0, -1.02, 0);
        box(g, 1.36, 0.16, 0.24, gold, 0, 0.1, 0); // the belt
        box(g, 0.22, 0.22, 0.06, mat(ARCH.gem, 0x1a3ad0), 0, 0.1, -0.13);
        for (const sx of [-1, 1]) box(g, 0.08, 1.9, 0.04, gold, sx * 0.14, -0.1, -0.11);
        for (const [x, y] of [[-0.4, 0.45], [0.4, 0.45], [-0.4, -0.5], [0.4, -0.5]]) box(g, 0.1, 0.16, 0.04, rune, x, y, -0.12);
        box(g, 0.8, 0.2, 0.32, gold, 0, 0.92, 0); // the collar
        loop(1.08);
        return g;
    }
    if (it.kind === 'robe') {
        const cloth = mat(it.color || 0x2c3e7a, it.magic ? 0x3a1a6a : 0);
        box(g, 1.2, 1.6, 0.18, cloth, 0, 0, 0); // hanging by its collar
        box(g, 1.3, 0.12, 0.22, it.magic ? mat(0xe8d07a, 0x6a5200) : cloth, 0, -0.78, 0);
        box(g, 0.5, 0.16, 0.3, cloth, 0, 0.82, 0); // the collar / the hood folded
        if (it.magic) for (const [x, y] of [[-0.3, 0.3], [0.3, -0.2], [0, -0.5]]) box(g, 0.1, 0.1, 0.04, mat(0xfff0a0, 0xc0a020), x, y, -0.1);
        loop(0.98);
        return g;
    }
    if (it.piece === 'helmet') { helmetParts(g, code, null); loop(0.78); }
    else if (it.piece === 'chest') {
        const s = steel(code), t = trim(code);
        box(g, 1.32, 1.3, 0.12, s, 0, 0, -0.46); box(g, 1.32, 1.3, 0.1, s, 0, 0, 0.46);
        box(g, 0.1, 1.3, 0.92, s, 0.66, 0, 0); box(g, 0.1, 1.3, 0.92, s, -0.66, 0, 0);
        box(g, 0.9, 0.16, 0.9, t, 0, 0.7, 0); box(g, 0.5, 0.3, 0.06, t, 0, 0.27, -0.53);
        for (const sx of [-1, 1]) box(g, 0.6, 0.3, 0.66, t, sx * 0.76, 0.58, 0);
        loop(0.86);
    } else {
        // the two greaves side by side, strapped together at the top
        for (const sx of [-1, 1]) { const p = new THREE.Group(); p.position.set(sx * 0.34, 0.95, 0); g.add(p); legParts(p, code, null); }
        box(g, 1.0, 0.1, 0.2, mat(LEATHER), 0, 0.9, 0);
        loop(1.04);
    }
    return g;
}
