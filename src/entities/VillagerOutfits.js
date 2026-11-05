/**
 * VillagerOutfits.js — five wizard costumes for the NPC wizards who are NOT of the tower: wanderers, the settlements' folk (`townwiz`) and a hamlet's wizard
 * (`mage`) — the author 06.11: «они не подойдут для башни магов, скорее для магов-странников, в городе или деревне; для башни нужны именно однотипные».
 * The tower's own (student, teacher, seller, master) keep the one uniform robe of VillagerModel. Drawn like the hero's mage costumes (MageOutfits.js: archmage, fire, druid,
 * frost, astrologer), but for the villager model — flat-coloured boxes merged into ONE shape with vertex colours (no textures there: FarShape), so the detail is many small
 * boxes: layered skirts, pleats, hem bands with stitched stars/flames/leaves/snow, fur tufts, antlers, ice shards.
 *
 * Measures (torso box 1.2 × 1.5 × 0.8, y 0 in its middle, the front −z; head box 1.2 from y 0 to 1.2; the arm hangs along −y, top +0.2, hand down to −1.35).
 * Pure: boxes are pushed as (w, h, d, x, y, z, colour, rx, ry, rz), as VillagerModel's `b`.
 */

import * as THREE from 'three';

export const OUTFIT_KINDS = ['archmage', 'fire', 'druid', 'frost', 'astrologer'];
export const OUTFIT_RU = { archmage: 'архимаг', fire: 'огненный маг', druid: 'друид', frost: 'маг льда', astrologer: 'звездочёт' };
export const OUTFIT_ROLES = new Set(['wanderer', 'townwiz', 'mage']); // (never the tower's student / teacher / seller / master)

const GOLD = 0xe0b43c, GOLD_DARK = 0xa8841f;
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const lite = (c, k) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();
const bx = (B, w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => B.push(w, h, d, x, y, z, c, rx, ry, rz);

const PALETTE = {
    archmage: { robe: [0x24408a, 0x2a2f7a, 0x1f3a66], trim: 0x1a1240, hat: 0x1c3070, accent: GOLD, hatKind: 'wizardWide' },
    fire: { robe: [0x8a2a20, 0x7a2418, 0x6a1c18], trim: 0x1a1214, hat: 0x6a1c18, accent: 0xff7a30, hatKind: 'cowl' },
    druid: { robe: [0x4a7a3a, 0x3f6b3a, 0x55803f], trim: 0x3a2412, hat: 0x3a7a2a, accent: 0xc9b27a, hatKind: 'wreath' },
    frost: { robe: [0xb8cce8, 0xc4d4ec, 0xaac0e0], trim: 0x3a5a9a, hat: 0x9fe8ff, accent: 0xffffff, hatKind: 'icecrown' },
    astrologer: { robe: [0x2c2f7a, 0x1f2866, 0x362a70], trim: 0x14143a, hat: 0x2c2f7a, accent: GOLD, hatKind: 'wizard' },
};

/** Fill the look of an outfit's wizard (colours, the hat); `pick` is the look's own deterministic chooser. */
export function outfitLook(L, kind, pick) {
    const P = PALETTE[kind];
    L.outfit = kind;
    L.dressColor = pick(P.robe);
    L.shirt = L.dressColor;
    L.pants = shade(L.dressColor, 0.6);
    L.trim = P.trim;
    L.accent = P.accent;
    L.hatColor = P.hat;
    L.hat = P.hatKind;
    if (kind === 'archmage' && !L.female) L.beard = 'long';
}

/** The body: shell, flared layered skirt with pleats, hem band, belt/sash, and the outfit's own details. */
export function outfitBody(L, B) {
    const kind = L.outfit, rc = L.dressColor, tr = L.trim, ac = L.accent;
    const hem = kind === 'fire' ? -1.75 : -2.15, N = kind === 'fire' ? 4 : 6, flare = kind === 'fire' ? 0.5 : kind === 'druid' ? 0.6 : 0.85;
    bx(B, 1.3, 1.5, 0.9, 0, 0.04, 0, rc); // the bodice wraps the torso
    bx(B, 0.7, 0.2, 0.7, 0, 0.78, 0, tr); // the collar
    // the skirt: layers, each wider and deeper, alternate tones; pleats down the front
    const top = -0.6, h = (top - hem) / N;
    for (let i = 0; i < N; i++) { const t = (i + 0.5) / N; bx(B, 1.34 + t * flare, h + 0.02, 0.96 + t * flare * 0.55, 0, top - (i + 0.5) * h, 0, i % 2 ? shade(rc, 0.88) : rc); }
    for (let k = -2; k <= 2; k++) bx(B, 0.06, (top - hem) * 0.9, 0.04, k * 0.26, (top + hem) / 2, -(0.52 + flare * 0.27), shade(rc, 0.7));
    // the hem band: the trim colour with stitched motifs (stars / flames / leaves / snow)
    const hb = 0.3, wb = 1.34 + flare + 0.04, db = 0.96 + flare * 0.55 + 0.04;
    bx(B, wb, hb, db, 0, hem + hb / 2, 0, tr);
    for (let k = -3; k <= 3; k++) {
        const x = k * (wb / 7.6), y = hem + hb / 2, z = -(db / 2 + 0.02);
        if (kind === 'fire') bx(B, 0.1, 0.2, 0.03, x, y, z, 0xff7a30, 0, 0, k % 2 ? 0.2 : -0.2);
        else if (kind === 'druid') bx(B, 0.1, 0.18, 0.03, x, y, z, 0x7ab84a, 0, 0, k % 2 ? 0.6 : -0.6);
        else if (kind === 'frost') bx(B, 0.14, 0.14, 0.03, x, y, z, 0xffffff, 0, 0, Math.PI / 4);
        else bx(B, 0.13, 0.13, 0.03, x, y, z, ac, 0, 0, Math.PI / 4);
    }
    bx(B, wb + 0.03, 0.05, db + 0.03, 0, hem + hb + 0.02, 0, kind === 'frost' ? 0xffffff : GOLD); // a line of piping (frost: a fur line)
    // the belt
    bx(B, 1.36, 0.16, 0.94, 0, -0.62, 0, 0x4a2c18); bx(B, 0.22, 0.2, 0.05, 0, -0.62, -0.48, kind === 'fire' ? 0xff7a30 : GOLD);
    switch (kind) {
        case 'archmage': // a cape down the back, a gold-edged mantle, a ruby at the throat
            bx(B, 1.4, 2.7, 0.08, 0, -0.9, 0.58, 0x2a1450, 0.04); bx(B, 1.44, 0.07, 0.12, 0, -2.25, 0.6, GOLD);
            for (const sx of [-1, 1]) { bx(B, 0.86, 0.3, 1.0, sx * 0.78, 0.66, 0, rc, 0, 0, sx * 0.16); bx(B, 0.9, 0.05, 1.04, sx * 0.78, 0.5, 0, GOLD); bx(B, 0.14, 0.14, 0.08, sx * 0.4, 0.75, -0.5, GOLD); }
            bx(B, 0.14, 0.14, 0.06, 0, 0.78, -0.52, 0xd02050, 0, 0, Math.PI / 4);
            break;
        case 'fire': // an open front of dark panels, a flame buckle, spiked shoulders, a hood drape
            bx(B, 0.5, 2.1, 0.06, 0, -0.5, -0.64, 0x1a1214); bx(B, 0.2, 0.3, 0.06, 0, -0.62, -0.56, 0xff7a30, 0, 0, Math.PI / 4);
            bx(B, 1.9, 0.4, 1.3, 0, 0.78, 0.04, shade(rc, 0.8));
            for (const sx of [-1, 1]) { bx(B, 0.8, 0.22, 0.9, sx * 0.84, 0.72, 0, 0x3a3a42, 0, 0, sx * 0.2); for (let k = 0; k < 3; k++) bx(B, 0.14, 0.4, 0.14, sx * (0.9 + k * 0.1), 0.92 + k * 0.1, -0.2 + k * 0.2, 0x3a3a42, 0, 0, -sx * 0.4); }
            break;
        case 'druid': // a bark mantle, a collar of leaves, a rope belt with hanging herbs
            bx(B, 1.9, 0.42, 1.3, 0, 0.7, 0.02, 0xb8a07a); for (const sx of [-1, 1]) bx(B, 0.7, 0.3, 1.1, sx * 0.9, 0.5, 0, 0xa8906a, 0, 0, sx * 0.3);
            for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; bx(B, 0.34, 0.06, 0.2, Math.cos(a) * 0.72, 0.98, Math.sin(a) * 0.5, i % 2 ? 0x5a9a3a : 0x3a7a2a, 0.5, -a, 0); }
            bx(B, 1.4, 0.1, 0.96, 0, -0.62, 0, 0xc9b27a); for (let i = 0; i < 3; i++) bx(B, 0.1, 0.5, 0.04, 0.5 + i * 0.08, -0.92, -0.52, i % 2 ? 0x5a9a3a : 0x3a7a2a);
            break;
        case 'frost': // a fur collar and fur line, crystals on the shoulders
            for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; bx(B, 0.4, 0.34, 0.4, Math.cos(a) * 0.74, 0.92, Math.sin(a) * 0.52, i % 2 ? 0xffffff : 0xe8eef8); }
            bx(B, 1.8, 0.26, 1.2, 0, 0.82, 0.02, 0xf4f8ff); bx(B, wb + 0.2, 0.22, db + 0.2, 0, hem + 0.12, 0, 0xf4f8ff);
            for (const sx of [-1, 1]) { bx(B, 0.3, 0.8, 0.3, sx * 0.9, 1.1, 0, 0x9fe8ff, 0, 0, -sx * 0.25); bx(B, 0.2, 0.5, 0.2, sx * 1.12, 0.96, -0.2, 0x7ad0f0, 0, 0, -sx * 0.6); }
            break;
        case 'astrologer': // a gold sash with a coin, stars sprinkled on the robe
            bx(B, 0.18, 2.0, 0.06, -0.15, 0.0, -0.66, GOLD, 0, 0, 0.55); bx(B, 0.34, 0.34, 0.06, 0.2, -0.3, -0.7, GOLD, 0, 0, Math.PI / 4);
            for (let i = 0; i < 16; i++) { const a = i * 2.4; bx(B, 0.07, 0.07, 0.03, Math.cos(a) * 0.5, 0.4 - (i % 8) * 0.34 - (i > 7 ? 0.1 : 0), -0.47 - (i % 8) * 0.045, 0xfff2a0, 0, 0, Math.PI / 4); }
            break;
        default: break;
    }
}

/** A wide bell cuff and the outfit's details on a sleeve (the arm hangs along −y; the plain sleeve boxes are already there). */
export function outfitSleeve(L, B) {
    const rc = L.dressColor, kind = L.outfit;
    bx(B, 0.62, 0.34, 0.62, 0, -0.9, 0, shade(rc, 0.9)); bx(B, 0.64, 0.07, 0.64, 0, -0.74, 0, L.trim);
    if (kind === 'frost') bx(B, 0.7, 0.2, 0.7, 0, -1.0, 0, 0xf4f8ff);
    else if (kind === 'fire') bx(B, 0.6, 0.26, 0.6, 0, -0.62, 0, 0x3a3a42);
    else bx(B, 0.66, 0.05, 0.66, 0, -1.05, 0, GOLD_DARK);
}

/** The outfit's own head-dress (the wizard hats are VillagerModel.hatParts; these three are plain boxes in head space: the head is y 0…1.2). */
export function outfitHeadwear(L, B) {
    const rc = L.dressColor;
    switch (L.hat) {
        case 'cowl': { // a pointed red cowl round the head with a dark opening
            const c = L.hatColor;
            bx(B, 1.52, 1.4, 0.2, 0, 0.62, 0.7, c); for (const sx of [-1, 1]) bx(B, 0.2, 1.3, 1.5, sx * 0.72, 0.62, 0.06, c);
            bx(B, 1.5, 0.3, 1.5, 0, 1.3, 0.04, c); bx(B, 1.2, 0.24, 0.2, 0, 1.18, -0.66, 0x1a1214);
            for (let i = 0; i < 3; i++) { const w = 1.3 - i * 0.38; bx(B, w, 0.26, w, 0, 1.55 + i * 0.2, 0.08 + i * i * 0.05, shade(c, 1 - i * 0.04)); } // (a peak no taller than a wizard's hat: they stand under the same ceilings)
            break;
        }
        case 'wreath': { // a wreath of leaves and a pair of antlers
            const g1 = 0x3a7a2a, g2 = 0x5a9a3a, wood = 0x7a5a38;
            bx(B, 1.34, 0.14, 1.34, 0, 1.2, 0, g1);
            for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; bx(B, 0.28, 0.06, 0.18, Math.cos(a) * 0.68, 1.27, Math.sin(a) * 0.68, i % 2 ? g2 : g1, 0.5, -a, 0); }
            for (const sx of [-1, 1]) { bx(B, 0.12, 0.7, 0.12, sx * 0.5, 1.6, 0, wood, 0, 0, -sx * 0.3); bx(B, 0.1, 0.4, 0.1, sx * 0.72, 1.72, -0.06, wood, 0, 0, -sx * 0.9); bx(B, 0.09, 0.32, 0.09, sx * 0.42, 1.88, 0, wood, 0, 0, sx * 0.5); }
            break;
        }
        case 'icecrown': { // a silver circlet with a crown of ice shards
            bx(B, 1.34, 0.12, 1.34, 0, 1.22, 0, 0xdfe8f8);
            for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, h = 0.4 + (i % 3) * 0.18; bx(B, 0.2, h, 0.2, Math.cos(a) * 0.55, 1.28 + h / 2, Math.sin(a) * 0.55, i % 2 ? 0x9fe8ff : 0x7ad0f0, Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); }
            break;
        }
        default: break;
    }
}
