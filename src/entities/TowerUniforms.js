/**
 * TowerUniforms.js — a PREVIEW (not connected): how the wizard TOWER's people could look — five uniforms for the students (the tower needs ONE uniform type, not the
 * wanderers' five costumes) and three looks for the Head of the tower (the Master, Jovalilius Pravdius Notan). For the villager model: flat-coloured boxes (VillagerModel's `b`
 * format), a robe of layered prisms with a hem band, rank stripes on the cuffs. Kinds: student 'u1'…'u5', master 'm1'…'m3'.
 * Measures as VillagerOutfits: torso 1.2 × 1.5 × 0.8 (y 0 in the middle, front −z), the head 0…1.2, the arm hangs along −y.
 */

import * as THREE from 'three';

const GOLD = 0xe0b43c, GOLD_DARK = 0xa8841f;
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const bx = (B, w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => B.push(w, h, d, x, y, z, c, rx, ry, rz);

export const STUDENT_UNIFORMS = ['u1', 'u2', 'u3', 'u4', 'u5'];
export const MASTER_LOOKS = ['m1', 'm2', 'm3'];
export const UNIFORM_RU = {
    u1: 'Академическая мантия', u2: 'Жилет и школьная роба', u3: 'Плащ-накидка', u4: 'Кафтан на пуговицах', u5: 'Рабочая роба с фартуком',
    m1: 'Верховный маг', m2: 'Белый мудрец', m3: 'Звёздный владыка',
};

const SPEC = {
    // robe colour, trim, hat, hat kind, hem y, layers, flare
    u1: { robe: 0x24408a, trim: 0xe8e8f4, hat: 0x1c3070, hatKind: 'wizard', hem: -2.1, N: 5, flare: 0.5 },
    u2: { robe: 0x2a2e3a, trim: 0xb02a30, hat: 0x2a2e3a, hatKind: 'mortar', hem: -1.9, N: 4, flare: 0.35 },
    u3: { robe: 0x6a4a2a, trim: 0x3f6b3a, hat: 0x3f6b3a, hatKind: 'wizard', hem: -2.0, N: 5, flare: 0.45 },
    u4: { robe: 0x4a2a7a, trim: GOLD, hat: 0x3a1f66, hatKind: 'beret', hem: -2.15, N: 5, flare: 0.4 },
    u5: { robe: 0x7a6a52, trim: 0x4a3a2a, hat: 0x5a4a38, hatKind: 'floppy', hem: -1.95, N: 4, flare: 0.4 },
    m1: { robe: 0x3a1d5e, trim: GOLD, hat: 0x2a1450, hatKind: 'wizardTall', hem: -2.35, N: 6, flare: 0.8 },
    m2: { robe: 0xf0ece0, trim: GOLD, hat: 0xf0ece0, hatKind: 'hoodcrown', hem: -2.35, N: 6, flare: 0.8 },
    m3: { robe: 0x1c2064, trim: 0xe8c25a, hat: 0x1c2064, hatKind: 'crescent', hem: -2.35, N: 6, flare: 0.85 },
};

/** Fill the look of a tower wizard in a uniform. */
export function uniformLook(L, kind) {
    const S = SPEC[kind];
    L.uniform = kind;
    L.dressColor = S.robe; L.shirt = S.robe; L.pants = shade(S.robe, 0.6);
    L.trim = S.trim; L.accent = S.trim;
    L.hatColor = S.hat; L.hat = S.hatKind;
    if (kind[0] === 'm') { L.beard = 'sage'; L.hair = 'long'; L.hairColor = 0xe8e4dc; L.female = false; }
}

/** The body. */
export function uniformBody(L, B) {
    const k = L.uniform, S = SPEC[k], rc = L.dressColor, tr = L.trim;
    const top = -0.6, h = (top - S.hem) / S.N;
    bx(B, 1.3, 1.5, 0.9, 0, 0.04, 0, rc);
    for (let i = 0; i < S.N; i++) { const t = (i + 0.5) / S.N; bx(B, 1.34 + t * S.flare, h + 0.02, 0.96 + t * S.flare * 0.55, 0, top - (i + 0.5) * h, 0, i % 2 ? shade(rc, 0.9) : rc); }
    for (let q = -2; q <= 2; q++) if (k[0] !== 'm' || Math.abs(q) === 2) bx(B, 0.06, (top - S.hem) * 0.9, 0.04, q * 0.26, (top + S.hem) / 2, -(0.52 + S.flare * 0.27), shade(rc, 0.72));
    const hb = k[0] === 'm' ? 0.34 : 0.2, wb = 1.34 + S.flare + 0.04, db = 0.96 + S.flare * 0.55 + 0.04;
    bx(B, wb, hb, db, 0, S.hem + hb / 2, 0, k === 'm2' ? GOLD : tr);
    bx(B, wb + 0.03, 0.05, db + 0.03, 0, S.hem + hb + 0.02, 0, k === 'u2' ? 0xffffff : GOLD);
    bx(B, 1.36, 0.16, 0.94, 0, -0.62, 0, shade(rc, 0.55)); bx(B, 0.22, 0.2, 0.05, 0, -0.62, -0.48, GOLD);
    switch (k) {
        case 'u1': // an academic robe: a white yoke and collar, a house crest on the chest
            bx(B, 1.4, 0.34, 1.0, 0, 0.72, 0, 0xe8e8f4); bx(B, 0.4, 0.16, 0.06, 0, 0.7, -0.5, 0xd8d8e8);
            bx(B, 0.4, 0.46, 0.05, 0.3, 0.2, -0.46, 0xe8e8f4); bx(B, 0.28, 0.34, 0.06, 0.3, 0.2, -0.5, 0x24408a); bx(B, 0.12, 0.12, 0.06, 0.3, 0.2, -0.54, GOLD, 0, 0, Math.PI / 4);
            break;
        case 'u2': // a vest over a white shirt with a tie, a pleated knee-length robe
            bx(B, 1.3, 1.5, 0.9, 0, 0.04, 0, 0xf2efe6); bx(B, 0.5, 1.4, 0.06, 0, 0.1, -0.46, 0xf2efe6);
            for (const sx of [-1, 1]) bx(B, 0.46, 1.4, 0.06, sx * 0.4, 0.1, -0.47, 0x2a2e3a);
            bx(B, 0.16, 1.0, 0.07, 0, 0.1, -0.5, 0xb02a30); bx(B, 0.2, 0.18, 0.08, 0, 0.62, -0.5, 0xb02a30);
            for (const y of [0.36, 0.02, -0.3]) bx(B, 0.08, 0.08, 0.05, 0.52, y, -0.5, 0xd8c070);
            bx(B, 1.4, 0.3, 1.0, 0, 0.72, 0, 0xf2efe6);
            break;
        case 'u3': // a capelet over a tunic: a short cape to the elbows, a wooden clasp, a wand loop on the belt
            bx(B, 1.7, 0.7, 1.15, 0, 0.5, 0, 0x3f6b3a); bx(B, 1.76, 0.1, 1.2, 0, 0.16, 0, 0x2a4a2a); for (let q = -2; q <= 2; q++) bx(B, 0.14, 0.5, 0.06, q * 0.3, 0.3, -0.62, 0x35603a);
            bx(B, 0.16, 0.16, 0.08, 0, 0.76, -0.6, 0x8a6a3a); bx(B, 0.1, 0.5, 0.1, 0.5, -0.82, -0.44, 0x5a3a1e, 0, 0, 0.1);
            break;
        case 'u4': // a double-breasted coat: two rows of gold buttons, a stand collar, shoulder tabs
            bx(B, 1.34, 1.5, 0.94, 0, 0.04, 0, rc); bx(B, 0.9, 0.34, 0.9, 0, 0.8, 0, shade(rc, 0.78));
            for (const sx of [-1, 1]) for (const y of [0.5, 0.2, -0.1, -0.4]) bx(B, 0.09, 0.09, 0.05, sx * 0.22, y, -0.5, GOLD);
            bx(B, 0.08, 1.5, 0.04, 0, 0.04, -0.49, shade(rc, 0.7));
            for (const sx of [-1, 1]) bx(B, 0.5, 0.1, 0.3, sx * 0.62, 0.74, 0, GOLD);
            break;
        case 'u5': // a work robe: a leather apron with pockets and tools, ink stains
            bx(B, 0.96, 2.0, 0.06, 0, -0.55, -0.5, 0x6a4a2a); bx(B, 0.12, 0.5, 0.05, -0.34, 0.56, -0.46, 0x6a4a2a); bx(B, 0.12, 0.5, 0.05, 0.34, 0.56, -0.46, 0x6a4a2a);
            bx(B, 0.5, 0.34, 0.06, 0, -0.4, -0.54, 0x5a3a1e); bx(B, 0.06, 0.4, 0.05, 0.14, -0.3, -0.58, 0xd8c070); bx(B, 0.1, 0.1, 0.05, -0.12, -0.34, -0.58, 0x2a2a6a);
            bx(B, 0.18, 0.18, 0.05, 0.5, 0.4, -0.5, 0x2a2a6a, 0, 0, 0.3);
            break;
        case 'm1': // the High Mage: a heavy mantle with an ermine collar, a gold-embroidered front, a long cape, a chain with a medallion
            bx(B, 1.9, 0.5, 1.3, 0, 0.74, 0.02, 0xf4f2ec); for (let q = -4; q <= 4; q++) bx(B, 0.1, 0.16, 0.03, q * 0.2, 0.58, -0.64, 0x111111);
            bx(B, 0.3, 2.3, 0.05, 0, -0.5, -0.5, GOLD); for (const sx of [-1, 1]) bx(B, 0.06, 2.2, 0.04, sx * 0.34, -0.5, -0.5, GOLD_DARK);
            bx(B, 1.5, 2.9, 0.08, 0, -0.9, 0.6, 0x2a1450, 0.04); bx(B, 1.54, 0.08, 0.12, 0, -2.3, 0.62, GOLD);
            for (const sx of [-1, 1]) { bx(B, 0.9, 0.34, 1.0, sx * 0.8, 0.62, 0, shade(rc, 1.2), 0, 0, sx * 0.16); bx(B, 0.16, 0.16, 0.08, sx * 0.55, 0.78, -0.58, GOLD); }
            bx(B, 0.34, 0.34, 0.06, 0, 0.1, -0.54, GOLD, 0, 0, Math.PI / 4); bx(B, 0.14, 0.14, 0.06, 0, 0.1, -0.58, 0xd02050, 0, 0, Math.PI / 4);
            for (let i = 0; i < 8; i++) bx(B, 0.07, 0.07, 0.03, -0.55 + i * 0.16, -1.2 - (i % 2) * 0.3, -0.62, 0xfff2a0, 0, 0, Math.PI / 4);
            break;
        case 'm2': // the White Sage: white and gold, a gold collar rising behind the head, a sash with a sun, hanging sleeves
            bx(B, 1.4, 0.42, 1.0, 0, 0.74, 0, GOLD); bx(B, 1.0, 1.1, 0.12, 0, 1.2, 0.5, GOLD); bx(B, 0.7, 0.8, 0.1, 0, 1.3, 0.56, 0xfff2c0);
            bx(B, 0.5, 2.3, 0.05, 0, -0.5, -0.5, GOLD); bx(B, 0.3, 2.3, 0.06, 0, -0.5, -0.54, 0xf8f4e8);
            bx(B, 0.36, 0.36, 0.06, 0, 0.1, -0.56, 0xffd860, 0, 0, Math.PI / 4); for (let q = 0; q < 8; q++) bx(B, 0.07, 0.24, 0.04, Math.cos(q * 0.785) * 0.32, 0.1 + Math.sin(q * 0.785) * 0.32, -0.6, 0xffd860, 0, 0, q * 0.785 + 1.57);
            bx(B, 1.5, 2.6, 0.08, 0, -0.8, 0.58, 0xe8e0d0, 0.03);
            break;
        case 'm3': // the Star Lord: a midnight robe sprinkled with stars, a high pointed collar, a crescent moon clasp, a flowing cape
            bx(B, 1.9, 0.4, 1.3, 0, 0.74, 0.02, 0x14184a); for (const sx of [-1, 1]) bx(B, 0.4, 1.0, 0.14, sx * 0.62, 1.2, 0.46, 0x14184a, 0, 0, sx * -0.2);
            bx(B, 1.6, 3.0, 0.08, 0, -0.9, 0.6, 0x0e1038, 0.04); for (let i = 0; i < 26; i++) { const a = i * 2.39; bx(B, 0.08, 0.08, 0.03, Math.cos(a) * 0.6, 1.2 - ((i * 0.37) % 3.3), 0.65, 0xfff2a0, 0, 0, Math.PI / 4); }
            for (let i = 0; i < 20; i++) { const a = i * 2.1; bx(B, 0.08, 0.08, 0.03, Math.cos(a) * 0.52, 0.4 - ((i * 0.31) % 2.4), -0.5 - ((i * 0.37) % 0.12), 0xfff2a0, 0, 0, Math.PI / 4); }
            bx(B, 0.36, 0.36, 0.06, 0, 0.12, -0.56, 0xe8c25a, 0, 0, Math.PI / 4); bx(B, 0.3, 0.3, 0.08, 0.06, 0.16, -0.6, 0x1c2064, 0, 0, Math.PI / 4);
            break;
        default: break;
    }
}

/** Sleeves: a cuff in the trim colour, rank stripes, and the uniform's own sleeve. */
export function uniformSleeve(L, B) {
    const k = L.uniform, rc = L.dressColor, tr = L.trim;
    if (L.sleeves === 'rolled') { bx(B, 0.46, 0.07, 0.46, 0, -0.43, 0, tr); return; } // (a short rolled sleeve: only a thin trim band at the elbow)
    if (k === 'u5') { bx(B, 0.46, 0.5, 0.46, 0, -0.5, 0, shade(rc, 0.95)); bx(B, 0.44, 0.1, 0.44, 0, -0.76, 0, shade(rc, 0.8)); return; } // rolled sleeves
    if (k === 'u2') { bx(B, 0.46, 0.14, 0.46, 0, -0.94, 0, 0xf2efe6); return; }
    bx(B, k[0] === 'm' ? 0.7 : 0.58, k[0] === 'm' ? 0.46 : 0.3, k[0] === 'm' ? 0.7 : 0.58, 0, -0.92, 0, shade(rc, 0.9)); bx(B, k[0] === 'm' ? 0.72 : 0.6, 0.07, k[0] === 'm' ? 0.72 : 0.6, 0, -0.76, 0, tr);
    if (k === 'u1' || k === 'u3' || k === 'u4') bx(B, 0.6, 0.05, 0.6, 0, -0.86, 0, tr); // a rank stripe
    if (k === 'm1' || k === 'm2' || k === 'm3') for (let i = 0; i < 3; i++) bx(B, 0.72, 0.05, 0.72, 0, -0.86 - i * 0.08, 0, GOLD);
}

/** Head-dress for the kinds that are not a wizard hat (the head is y 0…1.2). */
export function uniformHeadwear(L, B) {
    const c = L.hatColor;
    switch (L.hat) {
        case 'mortar': // an academic cap: a flat square board on a small crown with a tassel
            bx(B, 1.3, 0.3, 1.3, 0, 1.3, 0, c); bx(B, 1.9, 0.08, 1.9, 0, 1.5, 0, shade(c, 0.85)); bx(B, 0.14, 0.14, 0.14, 0, 1.58, 0, GOLD); bx(B, 0.06, 0.5, 0.06, 0.8, 1.3, 0, 0xb02a30); bx(B, 0.14, 0.14, 0.14, 0.8, 1.02, 0, 0xb02a30);
            break;
        case 'beret': // a soft round cap tilted to one side with a gold pin
            bx(B, 1.5, 0.2, 1.5, 0, 1.28, 0, c); bx(B, 1.34, 0.22, 1.34, 0.1, 1.46, 0, shade(c, 1.08)); bx(B, 0.12, 0.2, 0.12, 0.1, 1.64, 0, shade(c, 0.8)); bx(B, 0.14, 0.14, 0.06, -0.5, 1.3, -0.74, GOLD, 0, 0, Math.PI / 4);
            break;
        case 'floppy': // a soft floppy hat with a bent crown and a leather band
            bx(B, 1.8, 0.07, 1.8, 0, 1.24, 0, c); bx(B, 1.3, 0.3, 1.3, 0, 1.4, 0, c); bx(B, 1.0, 0.24, 1.0, 0.1, 1.64, 0.05, shade(c, 0.95)); bx(B, 0.7, 0.2, 0.7, 0.3, 1.82, 0.12, shade(c, 0.9)); bx(B, 1.34, 0.1, 1.34, 0, 1.3, 0, 0x4a3a2a);
            break;
        case 'hoodcrown': // a white hood with a gold circlet and a sun disc
            bx(B, 1.5, 1.4, 0.2, 0, 0.62, 0.7, c); for (const sx of [-1, 1]) bx(B, 0.2, 1.3, 1.5, sx * 0.72, 0.62, 0.06, c);
            bx(B, 1.5, 0.3, 1.5, 0, 1.3, 0.04, c); bx(B, 1.36, 0.14, 1.36, 0, 1.18, -0.02, GOLD); for (let i = 0; i < 5; i++) bx(B, 0.14, 0.34, 0.14, -0.5 + i * 0.25, 1.4, -0.66, GOLD);
            bx(B, 0.3, 0.3, 0.06, 0, 1.18, -0.72, 0xfff2c0, 0, 0, Math.PI / 4);
            break;
        case 'crescent': // a wide-brimmed tall hat is the wizard's own; this one: a dark cap with a gold crescent crown
            bx(B, 1.4, 0.4, 1.4, 0, 1.3, 0, c); bx(B, 1.1, 0.3, 1.1, 0, 1.6, 0.04, shade(c, 1.1)); bx(B, 0.8, 0.3, 0.8, 0, 1.86, 0.1, shade(c, 1.2));
            bx(B, 0.14, 0.7, 0.2, -0.3, 2.2, 0, GOLD, 0, 0, 0.3); bx(B, 0.14, 0.5, 0.2, 0.0, 2.34, 0, GOLD); bx(B, 0.14, 0.7, 0.2, 0.3, 2.2, 0, GOLD, 0, 0, -0.3); bx(B, 0.4, 0.14, 0.2, 0, 1.98, 0, GOLD);
            bx(B, 1.44, 0.1, 1.44, 0, 1.16, 0, GOLD);
            break;
        default: break;
    }
}
