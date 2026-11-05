/**
 * BackpackModel.js — the backpack in the hands and on the back: an ordinary leather one and the golden MAGIC one.
 *
 * (The author: «Рюкзак — текстура примитивная. Ворота у короля нарисованы красиво, почему не всегда так?» — the same way as the gates:
 *  textures are drawn once on a canvas — leather with grain, wrinkles, scuffs, a stitched border; gold with a brocade, a rune ring,
 *  beads — and every backpack is a little different: the leather's tone, the side pockets, the straps, the buckles, how worn it is.)
 *
 * Measures stay what they were (the body 0.7 × 0.85 × 0.35, the carrying loop on top at y ≈ 0.5, the front at +z): the hold pose
 * (`HOLD.backpack` in Items.js) and the place on the back (`_placeBackpack`) depend on them.
 * Cheap: unit geometries are shared (scaled, never one per size), textures and materials are cached and bounded
 * (the leather colour snaps to LEATHER, so there are a dozen materials at most, however many colours chests roll).
 */

import * as THREE from 'three';

/** Leather tones a backpack can have (a chest's random colour snaps to the nearest). */
export const LEATHER = [0x7a4a24, 0x5e3a1c, 0x8c5a2a, 0x4a3a2c, 0x6b4a34, 0x3f4f36, 0x5a3030, 0x35445e, 0x7a6a3c, 0x4e2e4a, 0x6a6a62, 0x9a6a3a];
export const GOLD = 0xe0b43c;

/** The nearest tone of LEATHER (so the material cache stays small). */
export function leatherOf(color) {
    const c = new THREE.Color(color ?? LEATHER[0]);
    let best = LEATHER[0], bd = Infinity;
    for (const h of LEATHER) {
        const k = new THREE.Color(h), d = (k.r - c.r) ** 2 + (k.g - c.g) ** 2 + (k.b - c.b) ** 2;
        if (d < bd) { bd = d; best = h; }
    }
    return best;
}

/** 0…1 from a uid (the same backpack always looks the same). */
export function look01(uid, salt = 0) {
    let h = 2166136261 ^ salt;
    for (const ch of String(uid ?? 'x')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
}

function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// ------------------------------------------------------------------ textures (drawn once)
const _tex = {};
function canvasTex(name, S, draw) {
    if (_tex[name] !== undefined) return _tex[name];
    if (typeof document === 'undefined') return (_tex[name] = null);
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    if (!g) return (_tex[name] = null);
    draw(g, S, rng(name.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7)));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.userData = { shared: true };
    return (_tex[name] = t);
}

/** Leather: pale (the tone comes from the material colour), pores, creases, scuffs, darker edges. */
function leatherBase(g, S, r, panel) {
    g.fillStyle = '#d9d0c4'; g.fillRect(0, 0, S, S);
    const lg = g.createLinearGradient(0, 0, S, S);
    lg.addColorStop(0, 'rgba(255,248,235,0.18)'); lg.addColorStop(1, 'rgba(40,25,10,0.2)');
    g.fillStyle = lg; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) { // pores: tiny dark dimples with a light rim
        const x = r() * S, y = r() * S, rad = 0.6 + r() * 1.3;
        g.fillStyle = `rgba(40,25,10,${0.08 + r() * 0.14})`;
        g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill();
        g.fillStyle = `rgba(255,245,225,${0.04 + r() * 0.08})`;
        g.beginPath(); g.arc(x + 0.8, y + 0.8, rad * 0.7, 0, 6.3); g.fill();
    }
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) { // creases from use: long soft curves
        const x = r() * S, y = r() * S, len = 30 + r() * 80, bend = (r() - 0.5) * 30, a = r() * 3.14;
        g.strokeStyle = `rgba(30,18,6,${0.1 + r() * 0.14})`; g.lineWidth = 0.8 + r() * 1.6;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len / 2 + bend, y + Math.sin(a) * len / 2, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
        g.strokeStyle = 'rgba(255,240,215,0.08)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(x + 1.2, y + 1.2); g.quadraticCurveTo(x + Math.cos(a) * len / 2 + bend + 1.2, y + Math.sin(a) * len / 2 + 1.2, x + Math.cos(a) * len + 1.2, y + Math.sin(a) * len + 1.2); g.stroke();
    }
    for (let i = 0; i < 14; i++) { // scuffs: pale rubbed patches
        const x = r() * S, y = r() * S, rad = 6 + r() * 18;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(255,235,205,${0.12 + r() * 0.16})`); gr.addColorStop(1, 'rgba(255,235,205,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill();
    }
    for (let i = 0; i < 5; i++) { // dark stains
        const x = r() * S, y = r() * S, rad = 8 + r() * 22;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(30,15,5,${0.1 + r() * 0.12})`); gr.addColorStop(1, 'rgba(30,15,5,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill();
    }
    const edge = (x0, y0, x1, y1) => { const e = g.createLinearGradient(x0, y0, x1, y1); e.addColorStop(0, 'rgba(20,10,0,0.42)'); e.addColorStop(1, 'rgba(20,10,0,0)'); g.fillStyle = e; };
    edge(0, 0, 0, 20); g.fillRect(0, 0, S, 20); edge(0, S, 0, S - 20); g.fillRect(0, S - 20, S, 20);
    edge(0, 0, 20, 0); g.fillRect(0, 0, 20, S); edge(S, 0, S - 20, 0); g.fillRect(S - 20, 0, 20, S);
    if (panel) { // a stitched border: dashes with a shadow under each
        const m = 17;
        const dash = (x0, y0, x1, y1) => {
            const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 9);
            for (let i = 0; i <= n; i++) {
                const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, vx = (x1 - x0) / Math.max(1, n) * 0.55, vy = (y1 - y0) / Math.max(1, n) * 0.55;
                g.strokeStyle = 'rgba(20,10,0,0.55)'; g.lineWidth = 2.6;
                g.beginPath(); g.moveTo(x + 0.9, y + 1.1); g.lineTo(x + vx + 0.9, y + vy + 1.1); g.stroke();
                g.strokeStyle = '#e8d8a8'; g.lineWidth = 1.7;
                g.beginPath(); g.moveTo(x, y); g.lineTo(x + vx, y + vy); g.stroke();
            }
        };
        dash(m, m, S - m, m); dash(m, S - m, S - m, S - m); dash(m, m, m, S - m); dash(S - m, m, S - m, S - m);
        g.strokeStyle = 'rgba(20,10,0,0.3)'; g.lineWidth = 1.2; g.strokeRect(m - 5.5, m - 5.5, S - 2 * m + 11, S - 2 * m + 11); // the pressed line round the stitches
    }
}

/** A gold brocade: a lattice of diamonds with four-petal flowers, beads, a soft shine (drawn once). */
function goldBase(g, S, r, emblem) {
    const lg = g.createLinearGradient(0, 0, S, S);
    lg.addColorStop(0, '#f6dc7e'); lg.addColorStop(0.5, '#d9a93a'); lg.addColorStop(1, '#a8761c');
    g.fillStyle = lg; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2200; i++) { // fine metallic grain
        g.fillStyle = r() < 0.5 ? `rgba(255,243,180,${0.05 + r() * 0.1})` : `rgba(90,55,5,${0.05 + r() * 0.1})`;
        g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 1.5);
    }
    const step = S / 5;
    g.lineWidth = 2.2;
    for (let k = -5; k <= 10; k++) { // the diamond lattice (a dark groove and a bright edge beside it)
        for (const [dx, col] of [[0, 'rgba(110,70,10,0.75)'], [2.3, 'rgba(255,238,160,0.7)']]) {
            g.strokeStyle = col;
            g.beginPath(); g.moveTo(k * step + dx, 0); g.lineTo(k * step + S + dx, S); g.stroke();
            g.beginPath(); g.moveTo(k * step + dx, S); g.lineTo(k * step + S + dx, 0); g.stroke();
        }
    }
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { // in every diamond: a four-petal flower and a bead
        const cx = (i + 0.5) * step + (j % 2 ? step / 2 : 0) - step / 2 + step / 2, cy = (j + 0.5) * step;
        for (const ox of [0, -S, S]) {
            const x = cx + ox;
            g.fillStyle = 'rgba(120,76,10,0.7)';
            for (let p = 0; p < 4; p++) { g.save(); g.translate(x, cy); g.rotate(p * Math.PI / 2); g.beginPath(); g.ellipse(0, -7, 3.6, 7.2, 0, 0, 6.3); g.fill(); g.restore(); }
            g.fillStyle = 'rgba(255,240,170,0.85)';
            for (let p = 0; p < 4; p++) { g.save(); g.translate(x - 0.8, cy - 0.8); g.rotate(p * Math.PI / 2); g.beginPath(); g.ellipse(0, -6.6, 2, 5.4, 0, 0, 6.3); g.fill(); g.restore(); }
            g.fillStyle = '#7a2a1a'; g.beginPath(); g.arc(x, cy, 2.4, 0, 6.3); g.fill(); // a ruby bead
            g.fillStyle = 'rgba(255,200,180,0.8)'; g.beginPath(); g.arc(x - 0.7, cy - 0.8, 0.9, 0, 6.3); g.fill();
        }
    }
    const sh = g.createLinearGradient(0, 0, S, 0); // a shine band slanted across
    sh.addColorStop(0.2, 'rgba(255,255,255,0)'); sh.addColorStop(0.4, 'rgba(255,250,215,0.28)'); sh.addColorStop(0.6, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(0, 0, S, S);
    if (emblem) { // a rune ring with a star in the middle, beads round the edge
        const c = S / 2;
        g.fillStyle = 'rgba(70,30,60,0.88)'; g.beginPath(); g.arc(c, c, S * 0.36, 0, 6.3); g.fill();
        for (const [rad, w, col] of [[S * 0.36, 3, '#ffe9a0'], [S * 0.3, 1.6, '#b98a22'], [S * 0.22, 1.4, '#ffe9a0']]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(c, c, rad, 0, 6.3); g.stroke(); }
        g.strokeStyle = '#ffe9a0'; g.lineWidth = 2;
        for (let i = 0; i < 12; i++) { // runes between the two outer rings: little strokes and hooks
            const a = i / 12 * 6.283, x = c + Math.cos(a) * S * 0.33, y = c + Math.sin(a) * S * 0.33;
            g.save(); g.translate(x, y); g.rotate(a + 1.57);
            g.beginPath(); g.moveTo(0, -5); g.lineTo(0, 5); if (i % 3 === 0) { g.moveTo(0, -5); g.lineTo(4, -1); } else if (i % 3 === 1) { g.moveTo(-3.5, 1); g.lineTo(0, -3); g.lineTo(3.5, 1); } else { g.moveTo(-3, -2); g.lineTo(3, 2); }
            g.stroke(); g.restore();
        }
        g.fillStyle = '#ffe9a0'; g.beginPath(); // an eight-point star
        for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283 - 1.57, rad = i % 2 ? S * 0.07 : S * 0.2; g.lineTo(c + Math.cos(a) * rad, c + Math.sin(a) * rad); }
        g.closePath(); g.fill();
        g.fillStyle = '#7a2a1a'; g.beginPath(); g.arc(c, c, S * 0.045, 0, 6.3); g.fill();
        for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283; g.fillStyle = '#fff2b8'; g.beginPath(); g.arc(c + Math.cos(a) * S * 0.43, c + Math.sin(a) * S * 0.43, 2.2, 0, 6.3); g.fill(); }
    }
    g.strokeStyle = 'rgba(80,45,5,0.8)'; g.lineWidth = 7; g.strokeRect(3.5, 3.5, S - 7, S - 7); // a framing band
    g.strokeStyle = 'rgba(255,238,160,0.8)'; g.lineWidth = 2; g.strokeRect(9, 9, S - 18, S - 18);
}

const T = {
    leather: () => canvasTex('leather', 256, (g, S, r) => leatherBase(g, S, r, false)),
    panel: () => canvasTex('panel', 256, (g, S, r) => leatherBase(g, S, r, true)),
    gold: () => canvasTex('gold', 256, (g, S, r) => goldBase(g, S, r, false)),
    emblem: () => canvasTex('emblem', 256, (g, S, r) => goldBase(g, S, r, true)),
};

// ------------------------------------------------------------------ materials and shapes (shared)
const _m = new Map();
function lam(key, color, map = null, extra = {}) {
    if (!_m.has(key)) { const m = new THREE.MeshLambertMaterial({ color, map, ...extra }); m.userData.shared = true; _m.set(key, m); }
    return _m.get(key);
}
function std(key, color, opts) {
    if (!_m.has(key)) { const m = new THREE.MeshStandardMaterial({ color, ...opts }); m.userData.shared = true; _m.set(key, m); }
    return _m.get(key);
}
const _geo = {};
const geo = (k, make) => _geo[k] || (_geo[k] = Object.assign(make(), { userData: { shared: true } }));
const UNIT = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const CYL = () => geo('cyl', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
const HALF = () => geo('half', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, false, 0, Math.PI)); // a half-cylinder: the rounded top of a flap
const STUD = () => geo('stud', () => new THREE.SphereGeometry(0.5, 7, 5));

function part(g, geometry, material, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
}
const bx = (g, mat, w, h, d, x, y, z, rx, ry, rz) => part(g, UNIT(), mat, w, h, d, x, y, z, rx, ry, rz);
const rv = (g, mat, r, x, y, z) => part(g, STUD(), mat, r, r, r * 0.7, x, y, z); // a rivet / a bead

/** A box whose big faces (±z) carry the panel and the rest the plain leather. */
function faced(g, side, face, w, h, d, x, y, z) {
    const m = new THREE.Mesh(UNIT(), [side, side, side, side, face, face]);
    m.scale.set(w, h, d); m.position.set(x, y, z);
    g.add(m);
    return m;
}

/** The backpack. `it`: {color, uid, magic}. */
export function backpackModel(it) {
    return it?.magic ? magicModel(it) : leatherModel(it || {});
}

function leatherModel(it) {
    const g = new THREE.Group();
    const tone = leatherOf(it.color);
    const kk = String(tone);
    const body = lam('L' + kk, tone, T.leather()), face = lam('P' + kk, tone, T.panel());
    const dark = lam('D' + kk, new THREE.Color(tone).multiplyScalar(0.62).getHex(), T.leather());
    const darkFace = lam('DP' + kk, new THREE.Color(tone).multiplyScalar(0.62).getHex(), T.panel());
    const strapC = [0x2a1a10, 0x4a3320, 0x1f2a22][Math.floor(look01(it.uid, 1) * 3)];
    const strap = lam('S' + strapC, strapC, T.leather());
    const brass = std('brass', 0xcaa23a, { metalness: 0.85, roughness: 0.38 });
    const iron = std('ironB', 0x555a62, { metalness: 0.9, roughness: 0.45 });
    const metal = look01(it.uid, 2) < 0.4 ? iron : brass;
    const sidePockets = Math.floor(look01(it.uid, 3) * 3); // 0 none, 1 one, 2 both
    const rolled = look01(it.uid, 4) < 0.5; // a bedroll strapped under the flap

    faced(g, body, face, 0.7, 0.85, 0.35, 0, 0, 0); // the sack
    faced(g, dark, darkFace, 0.74, 0.14, 0.39, 0, -0.39, 0); // the reinforced bottom
    // the flap: a slab with a rounded top edge, over the mouth
    faced(g, dark, darkFace, 0.72, 0.26, 0.04, 0, 0.3, 0.19);
    part(g, UNIT(), dark, 0.72, 0.1, 0.38, 0, 0.45, 0.01);
    part(g, HALF(), dark, 0.14, 0.72, 0.38, 0, 0.455, 0.01, 0, 0, Math.PI / 2); // rounded roof of the mouth
    // the front pocket: a stitched patch with its own little flap and a clasp
    faced(g, body, face, 0.5, 0.3, 0.1, 0, -0.14, 0.2);
    faced(g, dark, darkFace, 0.52, 0.1, 0.115, 0, -0.04, 0.21);
    bx(g, metal, 0.07, 0.07, 0.03, 0, -0.06, 0.275);
    rv(g, metal, 0.03, -0.2, -0.04, 0.275); rv(g, metal, 0.03, 0.2, -0.04, 0.275);
    // two straps over the flap, each with a buckle
    for (const sx of [-0.2, 0.2]) {
        bx(g, strap, 0.07, 0.62, 0.02, sx, 0.15, 0.215);
        bx(g, metal, 0.1, 0.07, 0.035, sx, 0.0, 0.23);
        bx(g, strap, 0.015, 0.04, 0.04, sx, 0.0, 0.232);
        rv(g, metal, 0.025, sx, 0.4, 0.228); rv(g, metal, 0.025, sx, 0.28, 0.228);
        bx(g, strap, 0.06, 0.1, 0.02, sx, -0.12, 0.217); // the tail of the strap
    }
    // side pockets (a tall one for a bottle) — by the backpack
    for (let s = 0; s < sidePockets; s++) {
        const sx = s ? 0.4 : -0.4;
        faced(g, body, body, 0.1, 0.4, 0.26, sx, -0.2, 0);
        bx(g, dark, 0.11, 0.05, 0.27, sx, 0.0, 0);
        rv(g, metal, 0.03, sx + (s ? 0.055 : -0.055), -0.02, 0.1);
    }
    if (rolled) { // the bedroll under the bottom
        const roll = lam('R' + kk, 0x7a7466, T.leather());
        part(g, CYL(), roll, 0.14, 0.78, 0.14, 0, -0.5, 0.05, 0, 0, Math.PI / 2);
        for (const x of [-0.22, 0.22]) bx(g, strap, 0.04, 0.15, 0.16, x, -0.5, 0.05);
    }
    // the back: two shoulder straps and the padded back (toward the body when worn)
    const pad = lam('B' + kk, 0x2c2218, T.leather());
    bx(g, pad, 0.6, 0.72, 0.05, 0, -0.02, -0.2);
    for (const sx of [-0.2, 0.2]) { bx(g, strap, 0.08, 0.7, 0.03, sx, 0.0, -0.235); rv(g, metal, 0.025, sx, 0.3, -0.255); }
    // the carrying loop on top (the hand hooks its fingers into it)
    bx(g, strap, 0.24, 0.045, 0.045, 0, 0.545, 0);
    bx(g, strap, 0.035, 0.1, 0.045, -0.105, 0.5, 0); bx(g, strap, 0.035, 0.1, 0.045, 0.105, 0.5, 0);
    return g;
}

function magicModel(it) {
    const g = new THREE.Group();
    const gold = std('gold', GOLD, { map: T.gold(), metalness: 0.78, roughness: 0.34, emissive: 0x6a4210, emissiveMap: T.gold(), emissiveIntensity: 0.35 });
    const goldFace = std('goldFace', GOLD, { map: T.emblem(), metalness: 0.78, roughness: 0.34, emissive: 0x6a4210, emissiveMap: T.emblem(), emissiveIntensity: 0.4 });
    const trim = std('goldTrim', 0xf0cf6a, { metalness: 0.9, roughness: 0.28 });
    const velvet = lam('velvet', 0x5a1f4a, T.leather());
    const strap = lam('velvetStrap', 0x3a1030, T.leather());
    const gem = std('gem', 0xd02050, { metalness: 0.2, roughness: 0.12, emissive: 0xc01040, emissiveIntensity: 0.9 });
    const gem2 = std('gem2', 0x4f8cff, { metalness: 0.2, roughness: 0.12, emissive: 0x2050e0, emissiveIntensity: 0.8 });

    const gf = (w, h, d, x, y, z, face = gold) => faced(g, gold, face, w, h, d, x, y, z);
    gf(0.7, 0.85, 0.35, 0, 0, 0, goldFace); // the sack: brocade with a rune ring on its face
    gf(0.74, 0.12, 0.39, 0, -0.395, 0, gold); // the heavy base
    bx(g, trim, 0.76, 0.03, 0.41, 0, -0.33, 0); // gold piping above the base
    // the flap: velvet-lined, gold edged, rounded roof
    bx(g, velvet, 0.68, 0.3, 0.04, 0, 0.3, 0.185);
    bx(g, trim, 0.72, 0.03, 0.06, 0, 0.145, 0.195);
    bx(g, trim, 0.03, 0.3, 0.06, -0.355, 0.3, 0.195); bx(g, trim, 0.03, 0.3, 0.06, 0.355, 0.3, 0.195);
    bx(g, gold, 0.72, 0.1, 0.38, 0, 0.45, 0.01);
    part(g, HALF(), gold, 0.14, 0.72, 0.38, 0, 0.455, 0.01, 0, 0, Math.PI / 2);
    // the clasp: a big star plate with a ruby, two sapphires at the sides, beads round it
    bx(g, trim, 0.13, 0.13, 0.03, 0, 0.17, 0.225).rotation.z = Math.PI / 4;
    rv(g, gem, 0.075, 0, 0.17, 0.245);
    for (const sx of [-0.27, 0.27]) { rv(g, trim, 0.07, sx, 0.2, 0.215); rv(g, gem2, 0.045, sx, 0.2, 0.232); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; rv(g, trim, 0.022, Math.cos(a) * 0.1, 0.17 + Math.sin(a) * 0.1, 0.235); }
    // the corners: gold caps on the bottom, beads down the sides
    for (const sx of [-0.375, 0.375]) { bx(g, trim, 0.05, 0.14, 0.42, sx, -0.395, 0); for (let k = 0; k < 5; k++) rv(g, trim, 0.025, sx, -0.25 + k * 0.17, 0.18); }
    // a pocket in velvet and gold
    bx(g, velvet, 0.4, 0.2, 0.08, 0, -0.2, 0.2);
    bx(g, trim, 0.42, 0.025, 0.1, 0, -0.095, 0.2); bx(g, trim, 0.42, 0.025, 0.1, 0, -0.305, 0.2);
    rv(g, gem2, 0.04, 0, -0.2, 0.25);
    // the back: velvet padding and shoulder straps with gold buckles
    bx(g, velvet, 0.6, 0.72, 0.05, 0, -0.02, -0.2);
    for (const sx of [-0.2, 0.2]) { bx(g, strap, 0.08, 0.7, 0.03, sx, 0.0, -0.235); bx(g, trim, 0.1, 0.06, 0.04, sx, 0.28, -0.25); }
    // the carrying loop: a gold ring-handle
    bx(g, trim, 0.24, 0.045, 0.045, 0, 0.545, 0);
    bx(g, trim, 0.035, 0.1, 0.045, -0.105, 0.5, 0); bx(g, trim, 0.035, 0.1, 0.045, 0.105, 0.5, 0);
    if (it?.uid) g.userData.magicPack = true;
    return g;
}
