/**
 * WandModel.js — the ten wands, drawn "like the gates" (docs/rules/texture-style.md): wood with grain, rings and knots drawn once on a canvas
 * (the wood's own colour tints it), a leather-wrapped grip with stitching, engraved gold collars, carved spirals, rune bands, faceted crystals.
 *
 * Measures stay what they were (the wand lies along +Y: the handle from 0 to 0.2, the shaft to ~0.62, the tip at `userData.tipY` — the hold pose
 * and the spell's origin depend on them). Cheap: unit geometries are built once and shared; textures (4) are drawn once; materials are cached by
 * colour; no per-wand geometry (`userData.shared`, so `disposeModel` leaves them).
 */

import * as THREE from 'three';

function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// ------------------------------------------------------------------ textures (once; none without a document — tests)
const _tex = {};
function tex(name, w, h, draw, seed) {
    if (_tex[name] !== undefined) return _tex[name];
    if (typeof document === 'undefined') return (_tex[name] = null);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (!g) return (_tex[name] = null);
    draw(g, w, h, rng(seed));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return (_tex[name] = t);
}

/** Wood: pale base, long grain lines (along v), growth rings, a few knots with swirls, pores, a worn sheen. */
const woodTex = () => tex('wood', 64, 256, (g, W, H, r) => {
    g.fillStyle = '#d8c3a0'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) { // grain: wavering long lines, dark and light
        const x = r() * W, a = 0.04 + r() * 0.12, ph = r() * 6.3;
        g.strokeStyle = r() < 0.65 ? `rgba(60,35,12,${0.12 + r() * 0.22})` : `rgba(255,240,205,${0.1 + r() * 0.14})`; g.lineWidth = 0.6 + r() * 1.4;
        g.beginPath(); for (let y = 0; y <= H; y += 8) g.lineTo(x + Math.sin(y * 0.03 + ph) * 2.2 * a * 10, y); g.stroke();
    }
    for (let i = 0; i < 4; i++) { // knots: dark swirl
        const x = r() * W, y = r() * H, rad = 3 + r() * 4;
        for (let k = 3; k > 0; k--) { g.strokeStyle = `rgba(50,28,8,${0.2 + 0.1 * k})`; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, rad * k * 0.5, rad * k * 1.2, 0, 0, 6.3); g.stroke(); }
    }
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(40,22,6,${0.08 + r() * 0.14})`; g.fillRect(r() * W, r() * H, 1, 1 + r() * 3); }
    const sh = g.createLinearGradient(0, 0, W, 0); sh.addColorStop(0.15, 'rgba(255,255,255,0)'); sh.addColorStop(0.3, 'rgba(255,245,220,0.22)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fillRect(0, 0, W, H);
}, 31);

/** Bark: rough, deep vertical cracks and lichen-like pale flecks (the knotted branch). */
const barkTex = () => tex('bark', 64, 256, (g, W, H, r) => {
    g.fillStyle = '#cdb89a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) { const x = r() * W, y = r() * H, l = 20 + r() * 70; g.strokeStyle = `rgba(35,20,8,${0.25 + r() * 0.3})`; g.lineWidth = 1 + r() * 1.8; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 3, y + l / 3, x - 3, y + l * 0.66, x + 1, y + l); g.stroke(); g.strokeStyle = 'rgba(255,240,210,0.18)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x + 1.6, y); g.bezierCurveTo(x + 4.6, y + l / 3, x - 1.4, y + l * 0.66, x + 2.6, y + l); g.stroke(); }
    for (let i = 0; i < 160; i++) { g.fillStyle = r() < 0.5 ? `rgba(230,225,200,${0.1 + r() * 0.2})` : `rgba(30,18,6,${0.1 + r() * 0.2})`; g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 2); }
}, 32);

/** Leather wrap: diagonal bands with stitched edges, pores, wear. */
const wrapTex = () => tex('wrap', 64, 128, (g, W, H, r) => {
    g.fillStyle = '#c9b79c'; g.fillRect(0, 0, W, H);
    for (let k = -H; k < W + H; k += 16) { // diagonal strips of leather: a dark seam and a light edge each
        g.strokeStyle = 'rgba(25,12,2,0.55)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(k, 0); g.lineTo(k + H * 0.55, H); g.stroke();
        g.strokeStyle = 'rgba(255,236,200,0.28)'; g.lineWidth = 1; g.beginPath(); g.moveTo(k + 2, 0); g.lineTo(k + 2 + H * 0.55, H); g.stroke();
    }
    for (let i = 0; i < 700; i++) { const x = r() * W, y = r() * H; g.fillStyle = `rgba(30,16,4,${0.08 + r() * 0.16})`; g.beginPath(); g.arc(x, y, 0.5 + r(), 0, 6.3); g.fill(); }
}, 33);

/** Rune band: gold-on-dark glyphs round a collar (the glyphs sit side by side along u). */
const runeTex = () => tex('rune', 128, 32, (g, W, H, r) => {
    g.fillStyle = '#2a1a0c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#e8c25a'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
        const cx = i * 16 + 8, k = Math.floor(r() * 4);
        g.beginPath(); g.moveTo(cx, 6); g.lineTo(cx, 26);
        if (k === 0) { g.moveTo(cx, 6); g.lineTo(cx + 5, 12); } else if (k === 1) { g.moveTo(cx - 4, 20); g.lineTo(cx, 12); g.lineTo(cx + 4, 20); } else if (k === 2) { g.moveTo(cx - 4, 10); g.lineTo(cx + 4, 20); } else { g.moveTo(cx - 4, 16); g.lineTo(cx + 4, 16); }
        g.stroke();
    }
    g.strokeStyle = 'rgba(232,194,90,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 2); g.lineTo(W, 2); g.moveTo(0, H - 2); g.lineTo(W, H - 2); g.stroke();
}, 34);

// ------------------------------------------------------------------ materials / geometries (shared, bounded)
const _m = new Map();
const mkey = (k, make) => { if (!_m.has(k)) { const m = make(); m.userData.shared = true; _m.set(k, m); } return _m.get(k); };
const woodMat = (color, t = woodTex(), k = 0.55) => mkey(`w${color}:${t ? t.uuid : 0}:${k}`, () => new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(k), map: t }));
const goldMat = () => mkey('gold', () => new THREE.MeshStandardMaterial({ color: 0xe0b43c, metalness: 0.88, roughness: 0.3 }));
const crystalMat = (color) => mkey('cr' + color, () => new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.12, emissive: color, emissiveIntensity: 0.65, flatShading: true }));
const glowMat = (color) => mkey('gl' + color, () => new THREE.MeshBasicMaterial({ color }));
const _geo = {};
const geo = (k, make) => _geo[k] || (_geo[k] = Object.assign(make(), { userData: { shared: true } }));
const part = (g, geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
    g.add(m);
    return m;
};

const HANDLE = () => geo('handle', () => new THREE.CylinderGeometry(0.035, 0.04, 0.2, 10));
const SHAFT = () => geo('shaft', () => new THREE.CylinderGeometry(0.016, 0.03, 0.42, 10));
const RING = (r) => geo('ring' + r, () => new THREE.TorusGeometry(r, 0.0065, 5, 12));
const COLLAR = (r, h) => geo(`col${r}:${h}`, () => new THREE.CylinderGeometry(r, r * 1.06, h, 12));
const KNOT = () => geo('knot', () => new THREE.SphereGeometry(0.03, 8, 6));
const BALL = (r) => geo('ball' + r, () => new THREE.SphereGeometry(r, 8, 6));
const CRYSTAL = () => geo('crystal', () => { const g = new THREE.CylinderGeometry(0.0, 0.03, 0.1, 6, 1); return g; });
const OCTA = (r) => geo('octa' + r, () => new THREE.OctahedronGeometry(r));
const PRONG = () => geo('prong', () => new THREE.CylinderGeometry(0.004, 0.011, 0.085, 5));
const MOON = () => geo('moon', () => new THREE.TorusGeometry(0.05, 0.008, 5, 14, Math.PI * 1.25));
/** A spiral ridge round the shaft: a helix tube, built once. */
const SPIRAL = () => geo('spiral', () => {
    const pts = [];
    for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * Math.PI * 2 * 4.5, r = 0.031 - 0.014 * t; pts.push(new THREE.Vector3(Math.cos(a) * r, 0.2 + t * 0.4, Math.sin(a) * r)); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.0055, 5, false);
});

/** The plain wooden wand (no metal, no light): a turned handle and a tapering shaft. */
function plainWand(g) {
    const wood = woodMat(0x6b4423, woodTex(), 0.9), dark = woodMat(0x4a2e17, woodTex(), 0.9);
    part(g, HANDLE(), dark, 0, 0.1, 0);
    part(g, COLLAR(0.039, 0.02), wood, 0, 0.2, 0);
    part(g, SHAFT(), wood, 0, 0.41, 0);
    for (const y of [0.04, 0.16]) part(g, RING(0.037), dark, 0, y, 0, Math.PI / 2); // turned grooves
    g.userData.tipY = 0.62;
    return g;
}

/** A wand of design `it.model` (0…9) in the wood colour `it.color`. */
export function wandModel(it) {
    const g = new THREE.Group();
    if (it.plain) return plainWand(g);
    const col = new THREE.Color(it.color ?? 0x8b5a2b);
    const m = it.model ?? 0;
    const wood = woodMat(col.getHex(), m === 3 || m === 8 ? barkTex() : woodTex());
    const woodDark = woodMat(col.getHex(), woodTex(), 0.4);
    const light = woodMat(col.clone().lerp(new THREE.Color(0xffffff), 0.35).getHex(), woodTex(), 0.95);
    const gold = goldMat();
    const tipC = col.clone().lerp(new THREE.Color(0xffffff), 0.5).getHex();
    const gem = crystalMat(tipC);
    // the handle: a leather-wrapped grip on designs 1 and 6, plain wood otherwise; a gold cap on every third
    const grip = m === 1 || m === 6 ? woodMat(col.getHex(), wrapTex(), 0.7) : wood;
    part(g, HANDLE(), grip, 0, 0.1, 0);
    part(g, COLLAR(0.04, 0.025), woodDark, 0, 0.0, 0); // the butt cap
    if (m % 3 === 0) { part(g, COLLAR(0.045, 0.03), gold, 0, 0.21, 0); part(g, RING(0.046), gold, 0, 0.226, 0, Math.PI / 2); part(g, RING(0.046), gold, 0, 0.196, 0, Math.PI / 2); }
    if (m === 1 || m === 6) { part(g, COLLAR(0.046, 0.022), light, 0, 0.05, 0); part(g, COLLAR(0.046, 0.022), light, 0, 0.155, 0); for (const y of [0.05, 0.155]) part(g, RING(0.047), gold, 0, y + 0.014, 0, Math.PI / 2); }
    // the shaft
    part(g, SHAFT(), m === 4 ? light : wood, 0, 0.41, 0);
    if (m === 2 || m === 7) for (let i = 0; i < 6; i++) { part(g, RING(0.026), gold, 0, 0.26 + i * 0.06, 0, Math.PI / 2); if (i % 2 === 0) part(g, RING(0.0265), gold, 0, 0.275 + i * 0.06, 0, Math.PI / 2); }
    if (m === 3 || m === 8) for (let i = 0; i < 3; i++) part(g, KNOT(), wood, (i - 1) * 0.004, 0.3 + i * 0.11, 0, 0, i, 0, 1, 0.8, 1);
    if (m === 5) part(g, SPIRAL(), light, 0, 0, 0); // a carved ridge winding up
    if (m === 8) { part(g, COLLAR(0.031, 0.05), woodMat(0xffffff, runeTex(), 1), 0, 0.27, 0); part(g, RING(0.032), gold, 0, 0.245, 0, Math.PI / 2); part(g, RING(0.032), gold, 0, 0.295, 0, Math.PI / 2); }
    if (m === 7) part(g, MOON(), gold, 0, 0.215, 0, Math.PI / 2, 0, 0.6); // a crescent guard
    // the tip
    if (m === 4 || m === 9) {
        if (m === 9) for (let i = 0; i < 3; i++) part(g, PRONG(), gold, Math.cos(i * 2.094) * 0.02, 0.645, Math.sin(i * 2.094) * 0.02, Math.sin(i * 2.094) * 0.35, 0, -Math.cos(i * 2.094) * 0.35);
        part(g, CRYSTAL(), gem, 0, 0.66, 0);
        part(g, CRYSTAL(), gem, 0, 0.62, 0, Math.PI);
        part(g, OCTA(0.012), glowMat(0xffffff), 0, 0.64, 0);
    } else if (m === 6) {
        part(g, PRONG(), wood, 0.02, 0.65, 0, 0, 0, -0.4);
        part(g, PRONG(), wood, -0.02, 0.65, 0, 0, 0, 0.4);
        part(g, BALL(0.014), gem, 0, 0.665, 0);
    } else {
        part(g, COLLAR(0.019, 0.02), gold, 0, 0.61, 0);
        part(g, BALL(0.017), glowMat(tipC), 0, 0.63, 0);
        part(g, BALL(0.024), crystalMat(tipC), 0, 0.63, 0);
    }
    g.userData.tipY = 0.65;
    return g;
}
