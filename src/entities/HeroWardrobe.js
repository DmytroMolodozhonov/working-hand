/**
 * HeroWardrobe.js — the ordinary hero's clothes, hair and hats, drawn "like the gates" (docs/rules/texture-style.md). NOT CONNECTED to the game yet
 * (the author: «продумай детально одежду героя, но не пушь в игру; отдай скриншоты»): `dressHero(ch, look)` is the new `Appearance.applyLook` body part;
 * tools/hero-wardrobe-screenshots.mjs draws it. The look keeps the same fields and numbers as Appearance.js (HAIR_STYLES, HATS, TOPS, BOTTOMS, SHOES),
 * the hidden ones (crown, helmet, plate, robe, steel) are not here.
 *
 * Measures: head box 1.2 (its middle at torso y 1.35, the face −z), torso 1.2 × 1.5 × 0.8, arms 0.4 / 0.35 thick (upper 1.0, forearm 0.9 long along z),
 * legs 0.5 × 1.95 hanging from y 0. Cloth is a thin shell a little bigger than the limb.
 * Cheap: unit geometries shared, textures drawn once (pale, tinted by the wearer's colour), the per-look materials are disposed on re-dressing.
 */

import * as THREE from 'three';

const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

// ------------------------------------------------------------------ textures (once, pale: the colour of the wearer tints them)
const _tex = {};
function tex(name, w, h, draw, seed = 1) {
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
const speck = (g, W, H, r, n, a = 0.1) => { for (let i = 0; i < n; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a * (0.5 + r())})` : `rgba(0,0,0,${a * (0.5 + r())})`; g.fillRect(r() * W, r() * H, 1 + r() * 1.5, 1 + r() * 1.5); } };
const edgeShade = (g, W, H, k = 0.3, s = 14) => {
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, s, 0, 0, W, s], [0, H, 0, H - s, 0, H - s, W, s], [0, 0, s, 0, 0, 0, s, H], [W, 0, W - s, 0, W - s, 0, s, H]]) {
        const e = g.createLinearGradient(x0, y0, x1, y1); e.addColorStop(0, `rgba(0,0,0,${k})`); e.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = e; g.fillRect(rx, ry, rw, rh);
    }
};
const stitch = (g, x0, y0, x1, y1, col = '#f0e6c8') => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 6)), vx = (x1 - x0) / n, vy = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
        const x = x0 + vx * i, y = y0 + vy * i;
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 0.7, y + 0.9); g.lineTo(x + vx * 0.55 + 0.7, y + vy * 0.55 + 0.9); g.stroke();
        g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + vx * 0.55, y + vy * 0.55); g.stroke();
    }
};

/** Cotton jersey: knit "V" columns, fuzz, pills, soft shading. */
const jersey = () => tex('jersey', 128, 128, (g, W, H, r) => {
    g.fillStyle = '#e6e2da'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) { g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2, y + 3); g.lineTo(x + 4, y); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.09)'; g.beginPath(); g.moveTo(x + 0.8, y); g.lineTo(x + 2.8, y + 3); g.lineTo(x + 4.8, y); g.stroke(); }
    speck(g, W, H, r, 500, 0.12);
}, 41);
/** Heavy knit (sweater, beanie): ribs with rounded stitches. */
const knit = () => tex('knit', 128, 128, (g, W, H, r) => {
    g.fillStyle = '#d8d3ca'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 8) { const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, 'rgba(0,0,0,0.3)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = gr; g.fillRect(x, 0, 8, H); }
    for (let y = 0; y < H; y += 6) { g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; for (let x = 0; x < W; x += 8) { g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x + 1.5, y + 5); g.moveTo(x + 4, y); g.lineTo(x + 6.5, y + 5); g.stroke(); } }
    speck(g, W, H, r, 300, 0.15);
}, 42);
/** Denim: diagonal twill in two tones, fade at the knees, thread. */
const denim = () => tex('denim', 128, 128, (g, W, H, r) => {
    g.fillStyle = '#c9ccd2'; g.fillRect(0, 0, W, H);
    for (let k = -H; k < W + H; k += 3) { g.strokeStyle = `rgba(30,40,70,${0.1 + 0.1 * ((k / 3) & 1)})`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(k, 0); g.lineTo(k + H, H); g.stroke(); }
    for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,40,0.1)'; g.fillRect(r() * W, r() * H, 1, 2 + r() * 2); }
}, 43);
/** Plain woven cotton / canvas (trousers, shirt). */
const weave = () => tex('weave', 128, 128, (g, W, H, r) => {
    g.fillStyle = '#e4e0d6'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + 0.04 * ((y >> 1) & 1)})`; g.fillRect(0, y, W, 1); }
    for (let x = 0; x < W; x += 2) { g.fillStyle = `rgba(255,255,255,${0.05 + 0.04 * ((x >> 1) & 1)})`; g.fillRect(x, 0, 1, H); }
    speck(g, W, H, r, 400, 0.1);
}, 44);
/** Leather: pores, creases, wear. */
const leather = () => tex('leather', 128, 128, (g, W, H, r) => {
    g.fillStyle = '#d6cbb9'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1300; i++) { const x = r() * W, y = r() * H, rad = 0.5 + r() * 1.2; g.fillStyle = `rgba(40,25,10,${0.08 + r() * 0.14})`; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,245,225,0.08)'; g.beginPath(); g.arc(x + 0.8, y + 0.8, rad * 0.7, 0, 6.3); g.fill(); }
    for (let i = 0; i < 12; i++) { const x = r() * W, y = r() * H, l = 18 + r() * 40; g.strokeStyle = `rgba(30,18,6,${0.1 + r() * 0.14})`; g.lineWidth = 0.8 + r(); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y + (r() - 0.5) * 14, x + l, y + (r() - 0.5) * 10); g.stroke(); }
    for (let i = 0; i < 7; i++) { const x = r() * W, y = r() * H, rad = 8 + r() * 16, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,235,205,0.16)'); gr.addColorStop(1, 'rgba(255,235,205,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill(); }
}, 45);
/** Felt (hats): fine fuzzy grain. */
const felt = () => tex('felt', 128, 128, (g, W, H, r) => {
    g.fillStyle = '#d9d4cc'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 3200; i++) { const x = r() * W, y = r() * H, a = r() * 6.3, l = 1 + r() * 3; g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.1 + r() * 0.12})` : `rgba(0,0,0,${0.08 + r() * 0.1})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
}, 46);
/** Hair: long soft strands with highlights, a sheen band (the colour tints it). */
const hairTex = () => tex('hair', 128, 128, (g, W, H, r) => {
    g.fillStyle = '#b9b4ac'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) { const x = r() * W, w = 0.8 + r() * 2.2; g.strokeStyle = r() < 0.55 ? `rgba(0,0,0,${0.1 + r() * 0.2})` : `rgba(255,255,255,${0.1 + r() * 0.22})`; g.lineWidth = w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 12, H * 0.33, x + (r() - 0.5) * 12, H * 0.66, x + (r() - 0.5) * 8, H); g.stroke(); }
    const sh = g.createLinearGradient(0, 0, 0, H); sh.addColorStop(0.1, 'rgba(255,255,255,0)'); sh.addColorStop(0.3, 'rgba(255,255,255,0.3)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fillRect(0, 0, W, H);
}, 47);

/** The front/back/side textures of the body (a pale base; the pattern rides on the colour). `t`: the top's number. */
function bodyFaces(t) {
    const make = (name, w, h, draw, seed) => tex(`top${t}${name}`, w, h, draw, seed);
    const base = (g, W, H, kind) => {
        const tx = kind === 'knit' ? knit() : kind === 'weave' ? weave() : jersey();
        if (tx?.image) { const p = g.createPattern(tx.image, 'repeat'); g.fillStyle = p; g.fillRect(0, 0, W, H); } else { g.fillStyle = '#ddd'; g.fillRect(0, 0, W, H); }
    };
    const kind = t === 6 || t === 3 ? 'knit' : t === 4 || t === 9 || t === 7 || t === 8 ? 'weave' : 'jersey';
    const front = make('f', 128, 160, (g, W, H, r) => {
        base(g, W, H, kind);
        if (t === 0) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.moveTo(40, 0); g.quadraticCurveTo(64, 34, 88, 0); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 7; g.beginPath(); g.moveTo(38, 0); g.quadraticCurveTo(64, 38, 90, 0); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 2; g.beginPath(); g.moveTo(38, 4); g.quadraticCurveTo(64, 42, 90, 4); g.stroke(); stitch(g, 12, 148, 116, 148); }
        if (t === 1) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 118, W, 42); for (let x = 2; x < W; x += 4) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 118, 1, 42); } g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 117, W, 2); }
        if (t === 3) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.moveTo(34, 0); g.lineTo(64, 70); g.lineTo(94, 0); g.lineTo(104, 0); g.lineTo(64, 90); g.lineTo(24, 0); g.fill(); }
        if (t === 4) { g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, H); g.stroke(); stitch(g, 58, 6, 58, 154); stitch(g, 70, 6, 70, 154); }
        if (t === 6) { for (let y = 8; y < H; y += 34) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, y, W, 14); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y + 14, W, 3); } g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, W, 14); g.fillRect(0, 146, W, 14); }
        if (t === 7) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(46, 0, 36, 26); for (let y = 2; y < 24; y += 5) { g.strokeStyle = '#e8d9b0'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(58, y); g.lineTo(70, y + 4); g.moveTo(70, y); g.lineTo(58, y + 4); g.stroke(); } g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 128, W, 4); stitch(g, 4, 146, 124, 146); }
        if (t === 8) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 14, H); g.fillRect(W - 14, 0, 14, H); }
        if (t === 9) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.moveTo(40, 0); g.lineTo(64, 26); g.lineTo(88, 0); g.lineTo(88, 2); g.lineTo(64, 30); g.lineTo(40, 2); g.fill(); g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 36; y < H; y += 24) { g.beginPath(); g.arc(64, y, 2.2, 0, 6.3); g.fill(); } g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(64, 28); g.lineTo(64, H); g.stroke(); }
        edgeShade(g, W, H, 0.34, 16);
        speck(g, W, H, r, 200, 0.12);
    }, 50 + t);
    const back = make('b', 128, 160, (g, W, H, r) => {
        base(g, W, H, kind);
        if (t === 1) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(20, 0, 88, 40); }
        if (t === 6) { for (let y = 8; y < H; y += 34) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, y, W, 14); } }
        if (t === 4 || t === 9) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, H); g.stroke(); stitch(g, 10, 20, 118, 20); }
        edgeShade(g, W, H, 0.34, 16);
    }, 60 + t);
    const side = make('s', 96, 160, (g, W, H, r) => {
        base(g, W, H, kind);
        if (t === 6) for (let y = 8; y < H; y += 34) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, y, W, 14); }
        if (t === 4 || t === 7 || t === 9) stitch(g, 10, 6, 10, 154);
        edgeShade(g, W, H, 0.3, 14);
    }, 70 + t);
    return { front, back, side };
}

// ------------------------------------------------------------------ shared shapes and a tiny builder
const _geo = {};
const geo = (k, make) => _geo[k] || (_geo[k] = Object.assign(make(), { userData: { shared: true } }));
const BOX = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const CYL = () => geo('cyl', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
const BALL = () => geo('ball', () => new THREE.SphereGeometry(0.5, 10, 8));
const CONE = () => geo('cone', () => new THREE.ConeGeometry(0.5, 1, 10));

class Dresser {
    constructor(ch) { this.ch = ch; this.mats = []; }
    mat(color, map = null, o = {}) {
        const m = new THREE.MeshLambertMaterial({ color, map, ...o });
        this.mats.push(m);
        return m;
    }
    std(color, o) { const m = new THREE.MeshStandardMaterial({ color, ...o }); this.mats.push(m); return m; }
    put(parent, geometry, material, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
        const m = new THREE.Mesh(geometry, material);
        m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
        m.castShadow = true; m.userData.shared = true;
        parent.add(m);
        this.ch._lookParts.push(m);
        return m;
    }
    box(parent, material, w, h, d, x, y, z, rx, ry, rz) { return this.put(parent, BOX(), material, w, h, d, x, y, z, rx, ry, rz); }
    cyl(parent, material, rx_, h, rz_, x, y, z, rx, ry, rz) { return this.put(parent, CYL(), material, rx_ * 2, h, rz_ * 2, x, y, z, rx, ry, rz); }
    ball(parent, material, r, x, y, z) { return this.put(parent, BALL(), material, r * 2, r * 2, r * 2, x, y, z); }
}

const darker = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const lighter = (c, k) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();

// ------------------------------------------------------------------ hair (8 styles)
function hair(D, look) {
    const H = D.ch.head, c = look.hairColor, ht = hairTex();
    const m = D.mat(c, ht), md = D.mat(darker(c, 0.75), ht);
    const cap = (w = 1.3, h = 0.34, y = 0.62) => D.box(H, m, w, h, w, 0, y, 0.02);
    const tuft = (x, y, z, w, h, d, ry = 0, rz = 0) => D.box(H, m, w, h, d, x, y, z, 0, ry, rz);
    switch (look.hair) {
        case 0: // short: a cap, a tousled fringe in three locks, side tufts, a short nape
            cap(); tuft(-0.4, 0.38, -0.64, 0.46, 0.34, 0.1, 0, 0.12); tuft(0.0, 0.42, -0.66, 0.42, 0.28, 0.1); tuft(0.42, 0.37, -0.64, 0.4, 0.34, 0.1, 0, -0.14);
            tuft(0.66, 0.2, 0.02, 0.1, 0.55, 1.0); tuft(-0.66, 0.2, 0.02, 0.1, 0.55, 1.0); tuft(0, 0.25, 0.64, 1.28, 0.62, 0.1);
            for (const sx of [-1, 1]) D.box(H, md, 0.1, 0.2, 0.2, sx * 0.66, -0.15, -0.35);
            break;
        case 1: // long: cap, a centre parting, long falls over the shoulders, front locks
            cap(1.32, 0.36); D.box(H, md, 0.06, 0.08, 1.2, 0, 0.8, 0);
            tuft(0, -0.2, 0.66, 1.34, 1.75, 0.16); for (const sx of [-1, 1]) { tuft(sx * 0.68, -0.05, 0.05, 0.14, 1.5, 1.2); tuft(sx * 0.56, 0.2, -0.62, 0.3, 0.7, 0.1, 0, sx * 0.08); tuft(sx * 0.72, -0.9, 0.1, 0.18, 0.45, 0.6, 0, sx * 0.05); }
            break;
        case 2: // bun: cap, a tied knot on top with a band and loose wisps
            cap(); tuft(0, 0.3, 0.64, 1.28, 0.55, 0.1); D.ball(H, m, 0.3, 0, 0.98, 0.15); D.cyl(H, D.mat(0x7a2a3a, jersey()), 0.19, 0.06, 0.19, 0, 0.8, 0.15); for (const sx of [-1, 1]) tuft(sx * 0.62, 0.3, 0.1, 0.1, 0.5, 0.9);
            break;
        case 3: // spiky crop: a cap and spikes of different lengths
            cap(1.28, 0.3, 0.6);
            for (let i = 0; i < 11; i++) { const a = i * 2.4, rr = 0.28 + (i % 4) * 0.12, h = 0.45 + (i % 3) * 0.14; const s = D.put(H, CONE(), m, 0.3, h, 0.3, Math.cos(a) * rr, 0.74 + h / 2, Math.sin(a) * rr, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); s.userData.shared = true; }
            tuft(0, 0.25, 0.64, 1.28, 0.6, 0.1); for (const sx of [-1, 1]) tuft(sx * 0.66, 0.25, 0.0, 0.1, 0.5, 1.0);
            break;
        case 4: // mohawk: shaved sides (a short stubble), a standing ridge of tapering spikes
            D.box(H, md, 1.24, 0.14, 1.24, 0, 0.62, 0.02);
            for (let i = 0; i < 7; i++) { const z = -0.5 + i * 0.17, h = 0.7 - Math.abs(i - 3) * 0.1; D.put(H, CONE(), m, 0.3, h, 0.34, 0, 0.7 + h / 2, z, 0, 0, 0); }
            D.box(H, m, 0.18, 0.5, 0.22, 0, 0.62, 0.66);
            break;
        case 5: break; // bald (a faint stubble shadow)
        case 6: // ponytail: cap, a tie, a swinging tail with a tuft
            cap(); tuft(0, 0.3, 0.64, 1.28, 0.55, 0.1); D.cyl(H, D.mat(0x2a2a30, jersey()), 0.16, 0.12, 0.16, 0, 0.35, 0.74);
            D.box(H, m, 0.3, 0.7, 0.3, 0, -0.05, 0.86, 0.12); D.box(H, m, 0.22, 0.5, 0.22, 0, -0.55, 0.92, 0.2); D.cone?.call?.(D);
            for (const sx of [-1, 1]) tuft(sx * 0.66, 0.25, 0.0, 0.1, 0.5, 1.0);
            break;
        default: // curls: a crown of round curls with spiral shading
            D.box(H, m, 1.22, 0.3, 1.22, 0, 0.6, 0.02);
            for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283, r2 = 0.56 + (i % 2) * 0.06; D.ball(H, i % 3 ? m : md, 0.26 + (i % 3) * 0.03, Math.cos(a) * r2, 0.6 + (i % 2) * 0.14, Math.sin(a) * r2 + 0.06); }
            for (let i = 0; i < 6; i++) D.ball(H, m, 0.28, (i % 3 - 1) * 0.36, 0.86, (Math.floor(i / 3) - 0.5) * 0.5 + 0.05);
    }
}

// ------------------------------------------------------------------ hats
function hat(D, look) {
    const H = D.ch.head, c = look.hatColor, ft = felt(), kn = knit(), lt = leather();
    const m = D.mat(c, ft), md = D.mat(darker(c, 0.6), ft), gold = D.std(0xe0b43c, { metalness: 0.85, roughness: 0.32 });
    switch (look.hat) {
        case 1: { // cap: panelled crown with a button and seams, a curved stitched visor, an eyelet row, a strap hole at the back
            const cr = D.mat(c, jersey());
            D.box(H, cr, 1.34, 0.32, 1.34, 0, 0.74, 0.02); D.box(H, cr, 1.26, 0.2, 1.26, 0, 0.94, 0.02);
            for (const a of [0, 1.57, 3.14, 4.71]) D.box(H, md, 0.04, 0.5, 1.3, 0, 0.82, 0.02, 0, a / 2, 0);
            D.ball(H, md, 0.09, 0, 1.06, 0.02);
            const visor = D.box(H, md, 1.1, 0.07, 0.62, 0, 0.66, -0.9, -0.12); D.box(H, D.mat(c, jersey()), 1.0, 0.05, 0.5, 0, 0.69, -0.88, -0.12);
            D.box(H, md, 1.36, 0.1, 0.06, 0, 0.62, -0.66);
            for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) D.ball(H, D.mat(darker(c, 0.5)), 0.022, x, 0.86, -0.69);
            D.box(H, md, 0.5, 0.1, 0.08, 0, 0.7, 0.68); D.box(H, D.mat(0x222222, lt), 0.1, 0.06, 0.1, 0, 0.7, 0.72);
            visor.userData.shared = true; break;
        }
        case 2: { // beanie: knitted ribs, a folded cuff, a pompom made of fluff balls
            const kc = D.mat(c, kn), kd = D.mat(darker(c, 0.82), kn);
            D.box(H, kd, 1.38, 0.3, 1.38, 0, 0.6, 0); D.box(H, kc, 1.3, 0.46, 1.3, 0, 0.9, 0.02); D.box(H, kc, 1.1, 0.18, 1.1, 0, 1.2, 0.02);
            for (let i = 0; i < 9; i++) { const a = i * 2.2; D.ball(H, i % 2 ? kc : kd, 0.12, Math.cos(a) * 0.12, 1.4 + (i % 3) * 0.05, Math.sin(a) * 0.12); }
            D.ball(H, kc, 0.2, 0, 1.42, 0); break;
        }
        case 3: { // wizard hat (simple)
            const wc = D.mat(c, ft);
            D.cyl(H, wc, 0.95, 0.07, 0.95, 0, 0.64, 0); D.put(H, CONE(), wc, 1.1, 1.7, 1.1, 0, 1.5, 0.08, 0.15, 0, 0.05);
            D.cyl(H, D.mat(darker(c, 0.5), ft), 0.58, 0.18, 0.58, 0, 0.78, 0); D.box(H, gold, 0.2, 0.2, 0.05, 0, 0.78, -0.58); break;
        }
        case 4: { // top hat: tall felt cylinder, a satin band with a buckle, a rolled brim
            D.cyl(H, m, 0.78, 0.07, 0.78, 0, 0.64, 0); D.cyl(H, m, 0.4, 0.07, 0.4, 0, 0.64, 0); // (the brim curls a little at the edges)
            D.cyl(H, m, 0.56, 0.96, 0.56, 0, 1.15, 0); D.cyl(H, D.mat(darker(c, 0.7), ft), 0.5, 0.05, 0.5, 0, 1.64, 0);
            D.cyl(H, D.mat(0x8e2b2b, jersey()), 0.58, 0.2, 0.58, 0, 0.82, 0); D.box(H, gold, 0.24, 0.24, 0.05, 0, 0.82, -0.58); D.box(H, D.mat(darker(c, 0.4)), 0.14, 0.14, 0.06, 0, 0.82, -0.6);
            for (const sx of [-1, 1]) D.cyl(H, m, 0.06, 0.07, 0.4, sx * 0.76, 0.7, 0, 0, 0, 0.5 * sx); break;
        }
        case 6: { // hood: a bunched hood round the face with a drape on the shoulders and stitched seams
            const hm = D.mat(c, jersey()), hd = D.mat(darker(c, 0.72), jersey());
            D.box(H, hm, 1.42, 0.26, 1.42, 0, 0.7, 0.04); for (const sx of [-1, 1]) D.box(H, hm, 0.14, 1.25, 1.3, sx * 0.7, 0.06, 0.08);
            D.box(H, hm, 1.42, 1.28, 0.14, 0, 0.04, 0.72); D.box(H, hd, 1.2, 0.18, 0.1, 0, 0.58, -0.7); for (const sx of [-1, 1]) D.box(H, hd, 0.1, 1.0, 0.1, sx * 0.64, -0.0, -0.7);
            D.put(D.ch.torso, BOX(), hm, 1.5, 0.45, 1.12, 0, 0.9, 0.1); D.put(D.ch.torso, BOX(), hd, 1.0, 0.36, 0.3, 0, 0.82, 0.62); break;
        }
        case 7: { // headband: a folded cloth with a knot at the back and two tails
            const bm = D.mat(c, jersey()); D.box(H, bm, 1.32, 0.2, 1.32, 0, 0.42, 0.01); D.box(H, D.mat(darker(c, 0.7), jersey()), 1.34, 0.04, 1.34, 0, 0.5, 0.01);
            D.box(H, bm, 0.22, 0.26, 0.22, 0, 0.42, 0.72); D.box(H, bm, 0.14, 0.7, 0.05, -0.1, 0.0, 0.8, 0.08, 0, 0.18); D.box(H, bm, 0.14, 0.55, 0.05, 0.1, 0.05, 0.8, 0.08, 0, -0.22); break;
        }
        case 8: { // cowboy: a wide brim curled at the sides, a creased crown, a leather band with a silver concho
            const cm = D.mat(c, lt);
            D.box(H, cm, 2.0, 0.07, 1.7, 0, 0.62, 0); for (const sx of [-1, 1]) D.box(H, cm, 0.4, 0.07, 1.7, sx * 0.9, 0.7, 0, 0, 0, sx * 0.45);
            D.box(H, cm, 1.5, 0.07, 0.3, 0, 0.66, -0.88, -0.2);
            D.box(H, cm, 1.1, 0.55, 1.1, 0, 0.94, 0); D.box(H, cm, 0.5, 0.2, 1.0, 0, 1.28, 0); for (const sx of [-1, 1]) D.box(H, md, 0.1, 0.4, 0.8, sx * 0.3, 1.18, 0.0, 0, 0, sx * 0.15);
            D.box(H, D.mat(0x3a2412, lt), 1.14, 0.14, 1.14, 0, 0.74, 0); D.cyl(H, D.std(0xd8dde6, { metalness: 0.9, roughness: 0.3 }), 0.1, 0.04, 0.1, 0, 0.74, -0.58, Math.PI / 2); break;
        }
        default: break;
    }
}

// ------------------------------------------------------------------ tops
function top(D, look) {
    const ch = D.ch, T = ch.torso, t = look.top | 0, c = look.topColor, f = bodyFaces(t);
    const sideM = D.mat(c, f.side), topM = D.mat(c, jersey());
    ch.body.material = [sideM, D.mat(c, f.side), topM, topM, D.mat(c, f.back), D.mat(c, f.front)];
    const cloth = t === 6 || t === 3 ? knit() : t === 4 || t === 9 || t === 7 || t === 8 ? weave() : jersey();
    const sl = D.mat(c, cloth), sd = D.mat(darker(c, 0.7), cloth);
    const UP = ch.BONE_LENGTH_UPPER, LOW = ch.BONE_LENGTH_LOWER;
    const long = [1, 4, 6, 7, 8, 9].includes(t), short = t === 0 || t === 3;
    for (const [a, e, sx] of [[ch.leftArmAnchor, ch.leftElbowAnchor, -1], [ch.rightArmAnchor, ch.rightElbowAnchor, 1]]) {
        const up = a.children.find((x) => x.isMesh && x.userData?.cloth !== 1);
        if (up) up.material = sl;
        const fore = e.children.find((x) => x.isMesh && x.userData?.cloth !== 1);
        if (fore) fore.material = long ? sl : D.mat(look.skin);
        // the sleeve's hem: a ribbed cuff (hoodie, sweater), a folded hem (T-shirt), a stitched cuff with a button (shirt, jacket)
        if (t === 0 || t === 3) { D.box(a, sd, 0.46, 0.46, 0.1, 0, 0, UP * 0.88); }
        if (t === 1 || t === 6) { D.box(e, D.mat(darker(c, 0.82), knit()), 0.4, 0.4, 0.14, 0, 0, 0.07); D.box(e, D.mat(darker(c, 0.82), knit()), 0.4, 0.4, 0.2, 0, 0, LOW * 0.96); }
        if (t === 4) { D.box(e, sd, 0.4, 0.4, 0.12, 0, 0, LOW * 0.95); D.ball(e, D.std(0xd4af37, { metalness: 0.8, roughness: 0.4 }), 0.03, sx * 0.0, 0.2, LOW * 0.9); }
        if (t === 9) { D.box(e, D.mat(0xf4f1ea, weave()), 0.4, 0.4, 0.2, 0, 0, LOW * 0.94); D.ball(e, D.mat(0xd8d4c8), 0.035, 0, 0.2, LOW * 0.92); }
        if (t === 7 || t === 8) { D.box(e, D.mat(0x5a3a1e, leather()), 0.4, 0.4, 0.16, 0, 0, LOW * 0.92); D.box(e, D.std(0xd4af37, { metalness: 0.8, roughness: 0.4 }), 0.3, 0.05, 0.05, 0, 0.19, LOW * 0.92); }
        if (t === 4 || t === 7) D.box(a, sd, 0.46, 0.14, 0.3, 0, 0.21, UP * 0.2); // shoulder yoke/seam
        // loose long sleeves for the hoodie / cloak / shirt: a thin shell a little over the arm
        if (t === 1) { D.box(a, sl, 0.46, 0.46, UP * 0.9, 0, 0, UP * 0.46); D.box(e, sl, 0.41, 0.41, LOW * 0.78, 0, 0, LOW * 0.4); }
        if (t === 8) { D.box(a, sl, 0.48, 0.48, UP * 0.9, 0, 0, UP * 0.46); D.box(e, sl, 0.43, 0.43, LOW * 0.8, 0, 0, LOW * 0.4); }
    }
    const wv = weave(), kn = knit(), lt = leather(), jr = jersey();
    const gold = D.std(0xd4af37, { metalness: 0.85, roughness: 0.34 });
    switch (t) {
        case 0: // T-shirt: a ribbed neck band, a hem band, a printed patch on the chest
            D.box(T, D.mat(darker(c, 0.82), kn), 0.7, 0.1, 0.86, 0, 0.74, 0); D.box(T, D.mat(darker(c, 0.85), jr), 1.24, 0.1, 0.86, 0, -0.72, 0);
            D.box(T, D.mat(lighter(c, 0.55), jr), 0.4, 0.4, 0.03, 0, 0.1, -0.42); D.ball(T, D.mat(darker(c, 0.5)), 0.08, 0, 0.1, -0.45); break;
        case 1: // hoodie: ribbed hem and cuffs, kangaroo pocket with stitched seams, hood bunched on the neck, drawstrings with aglets
            D.box(T, D.mat(darker(c, 0.82), kn), 1.26, 0.2, 0.86, 0, -0.68, 0);
            D.box(T, D.mat(darker(c, 0.9), jr), 0.86, 0.36, 0.06, 0, -0.34, -0.43); for (const sx of [-1, 1]) D.box(T, D.mat(darker(c, 0.7), jr), 0.1, 0.34, 0.07, sx * 0.4, -0.28, -0.43, 0, 0, sx * 0.4);
            D.box(T, D.mat(darker(c, 0.85), jr), 1.1, 0.34, 0.5, 0, 0.84, 0.3); D.box(T, D.mat(darker(c, 0.72), jr), 0.9, 0.3, 0.4, 0, 0.9, 0.5); D.cyl(T, D.mat(darker(c, 0.7), jr), 0.5, 0.3, 0.5, 0, 0.78, 0.0);
            for (const sx of [-1, 1]) { D.box(T, D.mat(0xeeeeee, wv), 0.04, 0.6, 0.04, sx * 0.14, 0.34, -0.43); D.box(T, D.mat(0xd8d8d8), 0.07, 0.1, 0.07, sx * 0.14, 0.02, -0.43); } break;
        case 3: // vest over a shirt: a white shirt collar and cuffs, a buttoned waistcoat with welt pockets and a back strap
            D.box(T, D.mat(0xf4f1ea, wv), 0.9, 0.24, 0.86, 0, 0.74, 0); for (const sx of [-1, 1]) D.box(T, D.mat(0xf4f1ea, wv), 0.34, 0.2, 0.06, sx * 0.2, 0.7, -0.42, 0.4, 0, sx * 0.5);
            for (let i = 0; i < 4; i++) D.ball(T, gold, 0.045, 0, 0.3 - i * 0.3, -0.42); for (const sx of [-1, 1]) D.box(T, D.mat(darker(c, 0.7), kn), 0.36, 0.07, 0.04, sx * 0.3, -0.22, -0.42);
            for (const sx of [-1, 1]) D.box(T, D.mat(0xf4f1ea, wv), 0.46, 0.46, UP * 0.9, 0, 0, 0).visible = false; break;
        case 4: // jacket: a stand collar, a zip with a pull, flap pockets, ribbed hem, a chest patch
            D.box(T, D.mat(darker(c, 0.78), wv), 1.0, 0.22, 0.9, 0, 0.78, 0); for (const sx of [-1, 1]) D.box(T, D.mat(darker(c, 0.7), wv), 0.3, 0.3, 0.08, sx * 0.34, 0.7, -0.42, 0.3, 0, sx * 0.4);
            D.box(T, D.mat(darker(c, 0.82), kn), 1.26, 0.2, 0.86, 0, -0.68, 0); D.box(T, D.std(0xb8bcc4, { metalness: 0.9, roughness: 0.35 }), 0.04, 0.18, 0.04, 0, 0.6, -0.43);
            for (const sx of [-1, 1]) { D.box(T, D.mat(darker(c, 0.85), wv), 0.34, 0.3, 0.06, sx * 0.34, -0.3, -0.43); D.box(T, D.mat(darker(c, 0.65), wv), 0.36, 0.08, 0.07, sx * 0.34, -0.17, -0.44); D.ball(T, gold, 0.03, sx * 0.34, -0.17, -0.48); } break;
        case 6: // striped sweater: a rolled crew neck, ribbed hem, elbow patches
            D.cyl(T, D.mat(darker(c, 0.85), kn), 0.42, 0.22, 0.34, 0, 0.8, 0); D.box(T, D.mat(darker(c, 0.82), kn), 1.26, 0.2, 0.86, 0, -0.68, 0);
            for (const [a, e] of [[ch.leftArmAnchor, ch.leftElbowAnchor], [ch.rightArmAnchor, ch.rightElbowAnchor]]) D.box(e, D.mat(0x6b4a2a, lt), 0.4, 0.2, 0.3, 0, 0.14, 0.18); break;
        case 7: // tunic with belt: laced neck, a wide leather belt with a buckle and pouch, trim along the hem
            D.box(T, D.mat(0x5a3a1e, lt), 1.26, 0.2, 0.86, 0, -0.34, 0); D.box(T, gold, 0.26, 0.2, 0.05, 0, -0.34, -0.44); D.box(T, D.mat(0x2a1a10), 0.14, 0.12, 0.06, 0, -0.34, -0.46);
            D.box(T, D.mat(0x6a4426, lt), 0.3, 0.3, 0.16, 0.55, -0.62, -0.38); D.box(T, D.mat(0x4a2c18, lt), 0.32, 0.1, 0.18, 0.55, -0.5, -0.38);
            D.box(T, D.mat(darker(c, 0.7), kn), 1.26, 0.12, 0.86, 0, -0.7, 0); D.box(T, D.mat(0xd8c9a0, wv), 0.2, 0.3, 0.05, 0, 0.62, -0.43); break;
        case 8: // cloak: a heavy cape with folds down the back, a hood roll, a gold clasp and chain on the chest
            D.box(T, D.mat(darker(c, 0.82), wv), 1.4, 2.5, 0.1, 0, -0.5, 0.5); for (let i = -2; i <= 2; i++) D.box(T, D.mat(darker(c, 0.7 + 0.04 * (i + 2)), wv), 0.18, 2.4, 0.16, i * 0.27, -0.5, 0.55);
            D.box(T, D.mat(darker(c, 0.85), wv), 1.5, 0.3, 1.0, 0, 0.82, 0.05); D.cyl(T, gold, 0.1, 0.05, 0.1, 0, 0.62, -0.46, Math.PI / 2); D.ball(T, gold, 0.045, -0.3, 0.55, -0.44); D.ball(T, gold, 0.045, 0.3, 0.55, -0.44); break;
        case 9: // shirt with a tie: a collar with a stand, a placket with buttons, a tie with a knot, a chest pocket
            D.box(T, D.mat(0xf4f1ea, wv), 0.76, 0.2, 0.86, 0, 0.76, 0); for (const sx of [-1, 1]) D.box(T, D.mat(0xf4f1ea, wv), 0.3, 0.22, 0.08, sx * 0.19, 0.7, -0.43, 0.35, 0, sx * 0.55);
            D.box(T, D.mat(c, jr), 0.17, 0.2, 0.08, 0, 0.62, -0.46); D.put(T, BOX(), D.mat(c, jr), 0.2, 1.0, 0.04, 0, 0.0, -0.45, 0, 0, 0); D.put(T, CONE(), D.mat(c, jr), 0.3, 0.2, 0.04, 0, -0.55, -0.45, 3.14);
            D.box(T, D.mat(0xeeeae0, wv), 0.3, 0.3, 0.04, -0.34, 0.1, -0.42); stitch; break;
        default: break; // (the plain shirt is just the body's texture)
    }
}

// ------------------------------------------------------------------ bottoms
function bottoms(D, look) {
    const ch = D.ch, b = look.bottom | 0, c = look.bottomColor, G = D.ch.group;
    const lg = [ch.leftLegPivot, ch.rightLegPivot];
    const cloth = b === 0 || b === 4 ? denim() : b === 7 ? jersey() : weave();
    const m = D.mat(c, cloth), md = D.mat(darker(c, 0.72), cloth), skin = D.mat(look.skin);
    const gold = D.std(0xd4af37, { metalness: 0.85, roughness: 0.34 }), lt = leather();
    const bare = b === 1 || b === 2 || b === 6;
    const sk = (b === 2 || b === 6) ? 0 : 1;
    for (const [p, sx] of [[lg[0], -1], [lg[1], 1]]) {
        const leg = p.children.find((x) => x.isMesh && x.userData?.cloth !== 1);
        if (leg) leg.material = bare ? skin : m; // (the skin shows under shorts / skirts / kilts)
        const len = b === 1 ? 0.78 : 1.95, y = b === 1 ? -0.39 : -0.975;
        if (b !== 2 && b !== 6) D.box(p, m, 0.54, len, 0.54, 0, y, 0);
        // seams, knee wear, cuffs
        if (b === 0 || b === 3 || b === 4 || b === 5 || b === 9) { D.box(p, md, 0.04, 1.9, 0.56, 0.0, -0.97, 0).visible = false; for (const z of [-1, 1]) D.box(p, md, 0.5, 0.02, 0.02, 0, -1.2, z * 0.27); }
        if (b === 0) { D.box(p, D.mat(lighter(c, 0.25), cloth), 0.46, 0.34, 0.03, 0, -1.2, -0.27); D.box(p, md, 0.3, 0.2, 0.02, sx * 0.12, -0.18, -0.275); D.ball(p, gold, 0.025, sx * 0.2, -0.1, -0.29); D.box(p, md, 0.56, 0.1, 0.56, 0, -1.9, 0); }
        if (b === 3) { D.box(p, md, 0.56, 0.06, 0.56, 0, -1.9, 0); D.box(p, D.mat(lighter(c, 0.3), cloth), 0.03, 1.6, 0.03, 0, -1.0, -0.275); } // a pressed crease down the front
        if (b === 4) { D.box(p, md, 0.34, 0.4, 0.14, sx * 0.0, -1.05, -0.3); D.box(p, D.mat(lighter(c, 0.2), cloth), 0.36, 0.12, 0.16, 0, -0.88, -0.3); D.ball(p, gold, 0.03, 0, -0.88, -0.38); D.box(p, md, 0.58, 0.14, 0.58, 0, -1.88, 0); }
        if (b === 5) { for (let i = 0; i < 6; i++) D.box(p, D.mat(lighter(c, 0.45), cloth), 0.56, 0.12, 0.56, 0, -0.3 - i * 0.3, 0); }
        if (b === 7) { D.box(p, D.mat(lighter(c, 0.1), jersey()), 0.52, 1.9, 0.52, 0, -0.975, 0); }
        if (b === 9) { D.box(p, m, 0.7, 1.4, 0.7, 0, -0.8, 0); D.box(p, md, 0.74, 0.16, 0.74, 0, -1.55, 0); D.box(p, md, 0.5, 0.12, 0.5, 0, -1.92, 0); }
        if (b === 1) { D.box(p, md, 0.56, 0.1, 0.56, 0, -0.78, 0); D.box(p, md, 0.3, 0.2, 0.02, sx * 0.12, -0.2, -0.275); }
    }
    // the waistband with a belt (jeans, trousers, cargo, shorts, wide trousers): leather, a metal buckle, loops
    if ([0, 1, 3, 4, 9, 5].includes(b)) {
        D.box(ch.torso, D.mat(darker(c, 0.82), cloth), 1.28, 0.22, 0.88, 0, -0.64, 0);
        D.box(ch.torso, D.mat(0x4a2c18, lt), 1.3, 0.14, 0.9, 0, -0.62, 0); D.box(ch.torso, gold, 0.22, 0.17, 0.04, 0, -0.62, -0.46); D.box(ch.torso, D.mat(0x1a1008), 0.1, 0.09, 0.05, 0, -0.62, -0.47);
        for (const x of [-0.5, -0.25, 0.25, 0.5]) D.box(ch.torso, md, 0.06, 0.26, 0.9, x, -0.64, 0);
    }
    // skirt / kilt: pleats in a ring round the hips with a hem band, a belt (the kilt: a sporran and a pin)
    if (b === 2 || b === 6) {
        const pleats = 18;
        for (let i = 0; i < pleats; i++) { const a = i / pleats * 6.283, r = 0.62 + (i % 2) * 0.03; D.put(G, BOX(), i % 2 ? m : md, 0.34, b === 2 ? 0.95 : 1.15, 0.05, Math.cos(a) * r, -0.45 - (b === 6 ? 0.1 : 0), Math.sin(a) * r * 0.8, 0, -a + 1.57, 0); }
        D.box(G, md, 1.3, 0.2, 0.9, 0, 0.1, 0); D.box(G, D.mat(0x4a2c18, lt), 1.32, 0.12, 0.92, 0, 0.0, 0); D.box(G, gold, 0.2, 0.15, 0.04, 0, 0.0, -0.47);
        if (b === 6) { D.box(G, D.mat(0x5a3a1e, lt), 0.34, 0.38, 0.12, 0, -0.42, -0.58); D.box(G, D.mat(0x2a1a10, lt), 0.38, 0.1, 0.14, 0, -0.2, -0.58); D.cyl(G, gold, 0.06, 0.04, 0.06, 0.4, -0.5, -0.5, Math.PI / 2); for (const sx of [-1, 1]) D.box(G, D.mat(darker(c, 0.5), cloth), 0.08, 1.0, 0.04, sx * 0.55, -0.45, -0.48); }
    }
}

// ------------------------------------------------------------------ shoes
function shoes(D, look) {
    const s = look.shoes | 0, c = look.shoesColor, lt = leather();
    if (s === 9) return;
    const m = D.mat(c, lt), md = D.mat(darker(c, 0.65), lt), sole = D.mat(s === 0 || s === 8 ? 0xf2f2ee : 0x2a2a2a, lt), lace = D.mat(0xf0ece2, weave());
    const gold = D.std(0xd4af37, { metalness: 0.85, roughness: 0.34 });
    for (const [p, sx] of [[D.ch.leftLegPivot, -1], [D.ch.rightLegPivot, 1]]) {
        const base = -1.95, z0 = -0.08;
        const body = (h, len = 0.7, w = 0.56) => D.box(p, m, w, h, len, 0, base + h / 2, z0);
        const soleB = (len = 0.74, h = 0.08, w = 0.6) => D.box(p, sole, w, h, len, 0, base + h / 2 - 0.02, z0);
        switch (s) {
            case 0: case 8: { // sneakers (low / high-top): a rubber sole with a stripe, a toe cap, tongue, laces, a heel tab, a side logo
                const h = s === 8 ? 0.62 : 0.3; body(h); soleB(); D.box(p, sole, 0.6, 0.07, 0.3, 0, base + 0.12, z0 - 0.44); D.box(p, md, 0.58, 0.04, 0.74, 0, base + 0.09, z0).visible = false;
                D.box(p, D.mat(0xffffff, lt), 0.5, 0.18, 0.04, 0, base + 0.2, z0 - 0.36); D.box(p, md, 0.5, 0.1, 0.28, 0, base + h + 0.02, z0 + 0.22); D.box(p, D.mat(lighter(c, 0.4), lt), 0.36, 0.06, 0.22, 0, base + h + 0.07, z0 - 0.12);
                for (let i = 0; i < 3; i++) D.box(p, lace, 0.3, 0.025, 0.04, 0, base + h + 0.1, z0 - 0.2 + i * 0.1); D.box(p, md, 0.1, 0.12, 0.05, 0, base + h, z0 + 0.38);
                for (const q of [-1, 1]) D.box(p, D.mat(lighter(c, 0.5)), 0.02, 0.1, 0.3, q * 0.29, base + 0.2, z0, 0, 0, 0);
                if (s === 8) { D.box(p, md, 0.58, 0.08, 0.58, 0, base + 0.58, z0 + 0.1); D.cyl(p, D.mat(0xeeeeee), 0.06, 0.02, 0.06, 0, base + 0.48, z0 - 0.3, Math.PI / 2); } break;
            }
            case 1: case 4: { // boots / rubber boots: a shaft, a heel, a cuff with a buckle strap (rubber: glossy, a seam and a tread)
                const rub = s === 4; const sm = rub ? D.std(c, { roughness: 0.25, metalness: 0.05 }) : m;
                D.box(p, sm, 0.58, 0.9, 0.58, 0, base + 0.45, 0.02); D.box(p, sm, 0.56, 0.26, 0.82, 0, base + 0.13, z0 - 0.04); soleB(0.86, 0.1, 0.62);
                D.box(p, rub ? sm : md, 0.64, 0.14, 0.64, 0, base + 0.92, 0.02); D.box(p, md, 0.5, 0.16, 0.2, 0, base + 0.15, z0 + 0.4);
                if (!rub) { D.box(p, D.mat(0x3a2412, lt), 0.62, 0.08, 0.62, 0, base + 0.7, 0.02); D.box(p, gold, 0.12, 0.1, 0.04, 0, base + 0.7, -0.3); for (let i = 0; i < 4; i++) D.ball(p, gold, 0.022, -0.2 + i * 0.13, base + 0.44, -0.3); }
                else { D.box(p, D.mat(lighter(c, 0.4)), 0.03, 0.8, 0.03, 0.3, base + 0.45, 0.02); for (const z of [-0.3, 0, 0.3]) D.box(p, D.mat(0x111111), 0.5, 0.03, 0.06, 0, base + 0.01, z + z0); } break;
            }
            case 2: { // sandals: a cork sole, crossed straps with buckles, an ankle strap
                D.box(p, D.mat(0xb9925a, lt), 0.58, 0.1, 0.8, 0, base + 0.05, z0); D.box(p, D.mat(0x6b4a2a, lt), 0.6, 0.04, 0.82, 0, base + 0.0, z0);
                for (const z of [-0.18, 0.08]) D.box(p, m, 0.58, 0.06, 0.1, 0, base + 0.15, z0 + z, 0.25); D.box(p, m, 0.5, 0.05, 0.1, 0, base + 0.15, z0 - 0.38); D.box(p, m, 0.08, 0.28, 0.08, 0, base + 0.28, z0 + 0.3); D.box(p, m, 0.58, 0.07, 0.08, 0, base + 0.42, z0 + 0.32); D.box(p, gold, 0.08, 0.1, 0.03, 0.28, base + 0.42, z0 + 0.32); break;
            }
            case 3: { // loafers: a polished upper with a stitched apron, a low heel, a penny strap
                body(0.28, 0.76, 0.56); soleB(0.8, 0.1, 0.6); D.box(p, md, 0.44, 0.04, 0.34, 0, base + 0.3, z0 - 0.16); D.box(p, md, 0.58, 0.18, 0.1, 0, base + 0.16, z0 + 0.38); D.box(p, D.mat(0xffffff, lt), 0.16, 0.03, 0.06, 0, base + 0.31, z0 - 0.2).visible = false;
                D.box(p, gold, 0.1, 0.04, 0.04, 0, base + 0.31, z0 - 0.14); break;
            }
            case 5: { // pointed shoes: a long upturned toe with a bell, a stitched seam
                body(0.26, 0.7, 0.56); soleB(0.74, 0.08, 0.6); D.box(p, m, 0.34, 0.16, 0.5, 0, base + 0.2, z0 - 0.5, -0.2); D.box(p, m, 0.18, 0.14, 0.3, 0, base + 0.32, z0 - 0.78, -0.5); D.ball(p, gold, 0.05, 0, base + 0.42, z0 - 0.9); D.box(p, md, 0.5, 0.04, 0.5, 0, base + 0.27, z0); break;
            }
            case 7: { // slippers: soft, fluffy rim and a toe puff
                D.box(p, D.mat(c, knit()), 0.58, 0.22, 0.78, 0, base + 0.11, z0); D.box(p, D.mat(lighter(c, 0.5), knit()), 0.6, 0.08, 0.62, 0, base + 0.26, z0 + 0.06); D.box(p, D.mat(darker(c, 0.6)), 0.6, 0.04, 0.8, 0, base + 0.01, z0); for (let i = 0; i < 6; i++) D.ball(p, D.mat(lighter(c, 0.55), knit()), 0.07, -0.2 + (i % 3) * 0.2, base + 0.3, z0 - 0.1 + Math.floor(i / 3) * 0.2); break;
            }
            default: body(0.25); soleB();
        }
    }
}

/** Dress a hero (a VoxelCharacter) in a look — the new Appearance.applyLook body part: hair, hat, top, bottoms, shoes. */
export function dressHero(ch, look) {
    for (const m of ch._lookParts || []) m.parent?.remove(m);
    for (const m of ch._wardrobeMats || []) m.dispose?.();
    ch._lookParts = [];
    const D = new Dresser(ch);
    ch._wardrobeMats = D.mats;
    const skin = D.mat(look.skin);
    ch.head.material = [skin, skin, skin, skin, skin, ch.head.material?.[5] || skin];
    if (look.faceMaterial) ch.head.material[5] = look.faceMaterial;
    const oldHair = ch.head.children.find((c) => c.isMesh && c.geometry?.parameters?.height === 0.4);
    if (oldHair) oldHair.visible = false;
    bottoms(D, look);
    top(D, look);
    shoes(D, look);
    hair(D, look);
    hat(D, look);
    return ch;
}
