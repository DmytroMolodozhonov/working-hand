/**
 * MageRobeLook.js — the wizard's robe on a hero, drawn "like the gates" (docs/rules/texture-style.md): woven wool with folds, a velvet hem band
 * embroidered in gold thread (stars, moons, runes — flames for red robes), bell sleeves with embroidered cuffs, a leather belt with a buckle,
 * a pouch and a vial, a velvet collar and lapels, a pointed hat with a wavy brim, a band and a gem.
 *
 * Measures are the hero's own (torso 1.2 × 1.5 × 0.8 at y 0.75, head box 1.2, forearm 0.35 thick, the front is −z): the robe is a close
 * fit (the author: «великоваты костюмы» — so it hugs the body and flares only a little at the hem).
 * Cheap: unit geometries are built once and shared; the textures are drawn once on a canvas (none without a document — tests);
 * materials are cached by colour. `tier` 0 simple, 1 middle (gold piping, lapels, belt kit), 2 strong (cape, sash with a gem, gold ring on the hat).
 */

import * as THREE from 'three';

const GOLD = 0xe0b43c;

function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// ------------------------------------------------------------------ textures (once)
const _tex = {};
function canvasTex(name, w, h, draw, seed, alpha = false) {
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
    t.userData = { shared: true, alpha };
    return (_tex[name] = t);
}

/** Woven wool: pale base (the cloth colour tints it), weft and warp threads, twill, fibres, pills, worn and stained patches. */
function woolTex() {
    return canvasTex('wool', 256, 256, (g, S, _h, r) => {
        g.fillStyle = '#dcd7cd'; g.fillRect(0, 0, S, S);
        for (let y = 0; y < S; y += 2) { g.fillStyle = `rgba(30,25,15,${0.07 + 0.05 * ((y >> 1) & 1)})`; g.fillRect(0, y, S, 1); }
        for (let x = 0; x < S; x += 2) { g.fillStyle = `rgba(255,250,240,${0.05 + 0.05 * ((x >> 1) & 1)})`; g.fillRect(x, 0, 1, S); }
        g.lineWidth = 1;
        for (let k = -S; k < S; k += 6) { g.strokeStyle = 'rgba(20,15,5,0.09)'; g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke(); }
        for (let i = 0; i < 2600; i++) { const x = r() * S, y = r() * S, a = r() * 6.3, l = 1.5 + r() * 4; g.strokeStyle = r() < 0.5 ? `rgba(255,248,230,${0.1 + r() * 0.18})` : `rgba(25,18,8,${0.08 + r() * 0.14})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
        for (let i = 0; i < 40; i++) { const x = r() * S, y = r() * S, rad = 1 + r() * 1.6; g.fillStyle = `rgba(240,235,220,${0.35 + r() * 0.3})`; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill(); g.fillStyle = 'rgba(20,10,0,0.25)'; g.beginPath(); g.arc(x + 0.8, y + 0.9, rad * 0.8, 0, 6.3); g.fill(); }
        for (let i = 0; i < 9; i++) { const x = r() * S, y = r() * S, rad = 14 + r() * 34, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(255,245,225,${0.12 + r() * 0.14})`); gr.addColorStop(1, 'rgba(255,245,225,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill(); }
        for (let i = 0; i < 5; i++) { const x = r() * S, y = r() * S, rad = 8 + r() * 20, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(40,25,10,${0.12 + r() * 0.12})`); gr.addColorStop(1, 'rgba(40,25,10,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill(); }
    }, 11);
}

/** Velvet pile with a soft sheen. */
function velvetTex() {
    return canvasTex('velvet', 128, 128, (g, S, _h, r) => {
        g.fillStyle = '#c9c0c8'; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 1800; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,240,255,${0.05 + r() * 0.1})` : `rgba(10,0,10,${0.06 + r() * 0.12})`; g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
        const sh = g.createLinearGradient(0, 0, S, S); sh.addColorStop(0.3, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.16)'); sh.addColorStop(0.7, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fillRect(0, 0, S, S);
    }, 12);
}

/** Leather with pores, creases and a stitched border. */
function leatherTex() {
    return canvasTex('leather', 128, 128, (g, S, _h, r) => {
        g.fillStyle = '#d6cbb9'; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 1400; i++) { const x = r() * S, y = r() * S, rad = 0.5 + r() * 1.2; g.fillStyle = `rgba(40,25,10,${0.08 + r() * 0.14})`; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,245,225,0.08)'; g.beginPath(); g.arc(x + 0.8, y + 0.8, rad * 0.7, 0, 6.3); g.fill(); }
        for (let i = 0; i < 14; i++) { const x = r() * S, y = r() * S, l = 20 + r() * 40; g.strokeStyle = `rgba(30,18,6,${0.1 + r() * 0.14})`; g.lineWidth = 0.8 + r(); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y + (r() - 0.5) * 14, x + l, y + (r() - 0.5) * 10); g.stroke(); }
        g.strokeStyle = 'rgba(20,10,0,0.5)'; g.lineWidth = 2.2; g.setLineDash([5, 4]); g.strokeRect(10, 14, S - 20, S - 28);
        g.strokeStyle = '#e8d8a8'; g.lineWidth = 1.5; g.strokeRect(9.5, 13.5, S - 19, S - 27); g.setLineDash([]);
    }, 13);
}

/** Gold thread on a transparent ground: stitched lines and motifs (the band under it is velvet). Each thread has a shadow and a highlight. */
function threadTex(motif) {
    return canvasTex('thread-' + motif, 512, 96, (g, W, H, r) => {
        const thread = (fn) => {
            g.save(); g.translate(1.2, 1.4); g.strokeStyle = g.fillStyle = 'rgba(40,20,0,0.65)'; fn(); g.restore();
            g.strokeStyle = g.fillStyle = '#e8c25a'; fn();
            g.save(); g.translate(-0.7, -0.8); g.strokeStyle = g.fillStyle = 'rgba(255,244,190,0.75)'; g.lineWidth = 0.9; fn(); g.restore();
        };
        for (const y of [8, H - 8, 15, H - 15]) thread(() => { const edge = y < 12 || y > H - 12; g.lineWidth = edge ? 2.6 : 1.4; g.setLineDash(edge ? [] : [5, 3]); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.setLineDash([]); });
        const star = (cx, cy, R, n) => thread(() => { g.lineWidth = 1.6; g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * 6.283 - 1.57, rr = i % 2 ? R * 0.42 : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.stroke(); g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1; });
        const moon = (cx, cy, R) => thread(() => { g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0.6, 5.7); g.arc(cx + R * 0.45, cy, R * 0.8, 5.2, 1.1, true); g.closePath(); g.stroke(); g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1; });
        const rune = (cx, cy, h, k) => thread(() => { g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy - h); g.lineTo(cx, cy + h); if (k === 0) { g.moveTo(cx, cy - h); g.lineTo(cx + h * 0.6, cy - h * 0.2); } else if (k === 1) { g.moveTo(cx - h * 0.5, cy + h * 0.2); g.lineTo(cx, cy - h * 0.5); g.lineTo(cx + h * 0.5, cy + h * 0.2); } else if (k === 2) { g.moveTo(cx - h * 0.5, cy - h * 0.3); g.lineTo(cx + h * 0.5, cy + h * 0.3); } else { g.moveTo(cx - h * 0.5, cy); g.lineTo(cx + h * 0.5, cy); } g.stroke(); });
        const flame = (cx, cy, h) => thread(() => { g.lineWidth = 1.8; g.beginPath(); g.moveTo(cx, cy + h); g.bezierCurveTo(cx - h * 0.9, cy + h * 0.2, cx - h * 0.2, cy - h * 0.2, cx, cy - h); g.bezierCurveTo(cx + h * 0.1, cy - h * 0.2, cx + h * 0.9, cy + h * 0.2, cx, cy + h); g.stroke(); g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1; });
        const step = 64;
        for (let i = 0; i < W / step; i++) {
            const cx = i * step + step / 2, cy = H / 2;
            if (motif === 'flame') { flame(cx, cy, i % 2 ? 15 : 19); thread(() => { g.beginPath(); g.arc(cx + 32, cy, 3.2, 0, 6.3); g.fill(); }); }
            else { if (i % 2) moon(cx, cy, 15); else star(cx, cy, 17, 8); for (const d of [-1, 1]) rune(cx + d * 32, cy, 9, (i + (d > 0 ? 1 : 0)) % 4); }
        }
    }, motif === 'flame' ? 14 : 15, true);
}

// ------------------------------------------------------------------ materials and shapes (shared)
const _m = new Map();
function lam(key, o) {
    if (!_m.has(key)) { const m = new THREE.MeshLambertMaterial(o); m.userData.shared = true; _m.set(key, m); }
    return _m.get(key);
}
const _tint = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const goldMat = () => { if (!_m.has('gold')) { const m = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.32 }); m.userData.shared = true; _m.set('gold', m); } return _m.get('gold'); };
const _geo = {};
const geo = (k, make) => _geo[k] || (_geo[k] = Object.assign(make(), { userData: { shared: true } }));
const BOX = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const TORUS = () => geo('torus', () => new THREE.TorusGeometry(1, 0.03, 6, 40));

/** Textured material with a repeat (a material per colour + repeat; colours are few). */
function cloth(color, tex, rx, ry, extra = {}) {
    const key = `c${color}:${tex ? tex.uuid : 0}:${rx}:${ry}:${extra.emissive || 0}${extra.alphaTest ? 'a' : ''}${extra.side ? 's' : ''}`;
    if (!_m.has(key)) {
        let map = null;
        if (tex) { map = tex.clone(); map.needsUpdate = true; map.repeat.set(rx, ry); map.userData = { shared: true }; }
        const m = new THREE.MeshLambertMaterial({ color, map, side: extra.side ? THREE.DoubleSide : THREE.FrontSide, emissive: extra.emissive || 0x000000, emissiveIntensity: extra.emissive ? 0.4 : 0, transparent: !!extra.alphaTest, alphaTest: extra.alphaTest || 0 });
        m.userData.shared = true;
        _m.set(key, m);
    }
    return _m.get(key);
}

/**
 * A surface of revolution with soft folds, built once per shape: profile(t) → [radius, y] for t 0 (bottom) … 1 (top); `folds` — creases
 * around, `depth` — how deep (less toward the top). Unit-sized: the meshes scale it.
 */
function folded(key, profile, folds, depth, seg, rows, seed) {
    return geo(key, () => {
        const g = new THREE.CylinderGeometry(1, 1, 1, seg, rows, true), p = g.attributes.position, r = rng(seed);
        const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), t = y + 0.5;
            const [rad, yy] = profile(t);
            const f = 1 + depth * (1 - t * 0.7) * (Math.sin(a * folds + ph[0]) * 0.6 + Math.sin(a * (folds * 2 + 1) + ph[1]) * 0.25 + Math.sin(a * 3 + ph[2]) * 0.4);
            p.setXYZ(i, Math.cos(a) * rad * f, yy, Math.sin(a) * rad * f);
        }
        g.computeVertexNormals();
        return g;
    });
}

const SKIRT = () => folded('skirt', (t) => [0.8 + 0.2 * (1 - t) ** 1.2, -2.2 + t * 1.55], 11, 0.05, 48, 20, 21);
const HEM = () => folded('hem', (t) => [1.0 + 0.004, -2.2 + t * 0.34], 11, 0.05, 48, 2, 21); // (the same folds as the skirt: it lies right on it)
const BODICE = () => folded('bodice', (t) => [0.78 + 0.06 * Math.sin(t * 3.1), -0.85 + t * 1.75], 9, 0.02, 32, 6, 24);
const COLLAR = () => folded('collar', (t) => [0.52 + 0.24 * t, 0.78 + t * 0.3], 7, 0.03, 24, 2, 25);
const SLEEVE = () => folded('sleeve', (t) => [0.2 + 0.2 * t ** 1.4, t], 6, 0.06, 20, 6, 26); // (along z later: radius grows toward the wrist)
const CUFF = () => folded('cuff', (t) => [0.4 + 0.004, 0.82 + t * 0.18], 6, 0.06, 20, 1, 26);

function bent(key, make) { return geo(key, make); }
const BRIM = () => bent('brim', () => {
    const g = new THREE.CylinderGeometry(1.0, 1.04, 0.05, 40, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), rr = Math.hypot(x, z), a = Math.atan2(z, x); p.setY(i, p.getY(i) + (rr > 0.45 ? (rr - 0.45) * (Math.sin(a * 3 + 0.6) * 0.1 - 0.06) : 0)); }
    g.computeVertexNormals();
    return g;
});
/** A pointed hat cone of height 1 (scaled): the tip bends back and aside. */
const CONE = () => bent('cone', () => {
    const g = new THREE.ConeGeometry(0.5, 1, 24, 14, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), t = y + 0.5; p.setX(i, p.getX(i) + t * t * 0.42); p.setY(i, y - t * t * 0.12); }
    g.computeVertexNormals();
    return g;
});

function put(parent, geometry, material, list, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.userData.armor = true; m.userData.shared = true;
    parent.add(m); list?.push(m);
    return m;
}
const bx = (p, mat, list, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => put(p, BOX(), mat, list, x, y, z, w, h, d, rx, ry, rz);

/** Is the colour reddish (flames instead of stars on the embroidery)? */
const isRed = (c) => { const k = new THREE.Color(c); return k.r > k.g * 1.5 && k.r > k.b * 1.5; };

/**
 * The robe on a hero. `code` 1 plain / 2 magic (a faint violet glow), `color` the cloth colour, `hood` — a hat unless a helmet is on, `list` — the parts
 * (ArmorLook removes them on the next dressing; shared geometries and materials are not disposed: `userData.shared`).
 */
export function mageRobeParts(ch, code, color, hood, list, tier = 0) {
    const magic = code >= 2;
    const base = color || 0x2c3e7a;
    const glow = magic ? 0x3a1a6a : 0;
    const wool = cloth(base, woolTex(), 3, 4, { side: true, emissive: glow });
    const velvetC = _tint(base, 0.45) === 0 ? 0x1a1038 : new THREE.Color(base).lerp(new THREE.Color(0x2a1850), 0.6).multiplyScalar(0.75).getHex();
    const velvet = cloth(velvetC, velvetTex(), 1, 1, { side: true });
    const gold = goldMat();
    const motif = isRed(base) ? 'flame' : 'star';
    const T = ch.torso, LOW = ch.BONE_LENGTH_LOWER || 1;

    // the robe: skirt, close bodice, folds; the embroidered hem band (velvet under, gold thread over) and gold piping
    put(T, SKIRT(), wool, list, 0, 0, 0, 1, 1, 0.76);
    put(T, BODICE(), wool, list, 0, 0, 0, 1, 1, 0.74);
    const hemH = 1;
    put(T, HEM(), velvet, list, 0, 0, 0, 1.0, hemH, 0.76);
    put(T, HEM(), cloth(0xffffff, threadTex(motif), 1, 1, { alphaTest: 0.4, side: true }), list, 0, 0, 0, 1.006, hemH, 0.766);
    if (tier >= 1) for (const y of [-2.2, -1.86]) put(T, TORUS(), gold, list, 0, y, 0, 1.0, 1.0 * 0.76, 1.0, Math.PI / 2);
    // the collar and lapels
    put(T, COLLAR(), velvet, list, 0, 0, -0.02, 1, 1, 0.8);
    if (tier >= 1) for (const sx of [-1, 1]) {
        bx(T, velvet, list, 0.3, 0.9, 0.05, sx * 0.22, 0.2, -0.45, 0, 0, -sx * 0.14);
        bx(T, gold, list, 0.04, 0.9, 0.06, sx * 0.36, 0.2, -0.46, 0, 0, -sx * 0.14);
    }
    // the belt: leather with a gold buckle, a pouch and a vial (middle and strong robes), a gem on a strong one
    const lea = cloth(0x4a2c18, leatherTex(), 4, 1);
    put(T, TORUS(), lea, list, 0, -0.62, 0, 0.7, 0.7 * 0.78, 0.9, Math.PI / 2).scale.z = 3.2;
    bx(T, gold, list, 0.24, 0.2, 0.06, 0, -0.62, -0.5);
    bx(T, cloth(0x2a1a10, null, 1, 1), list, 0.14, 0.12, 0.07, 0, -0.62, -0.52);
    if (tier >= 1) {
        const pouch = cloth(0x5a3a20, leatherTex(), 1, 1);
        bx(T, pouch, list, 0.3, 0.3, 0.16, 0.5, -0.86, -0.3, 0, 0.5, 0);
        bx(T, cloth(0x3a2412, leatherTex(), 1, 1), list, 0.32, 0.1, 0.18, 0.5, -0.74, -0.3, 0, 0.5, 0);
        put(T, geo('vial', () => new THREE.CylinderGeometry(0.07, 0.09, 0.26, 8)), lam('vial', { color: 0x6bd0ff, emissive: 0x2a90c0, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }), list, -0.52, -0.9, -0.28);
    }
    if (tier >= 2) {
        put(T, geo('gem', () => new THREE.OctahedronGeometry(0.1)), lam('gemR', { color: 0xd02050, emissive: 0xc01040, emissiveIntensity: 0.9 }), list, 0, -0.62, -0.56);
        const cape = cloth(_tint(velvetC, 0.9), velvetTex(), 1, 1, { side: true });
        bx(T, cape, list, 1.3, 3.0, 0.05, 0, -0.7, 0.5, 0.05); // a cape down the back
        bx(T, gold, list, 1.34, 0.08, 0.07, 0, -2.18, 0.52);
        for (const sx of [-1, 1]) { put(T, geo('stud', () => new THREE.SphereGeometry(0.09, 8, 6)), gold, list, sx * 0.4, 0.78, -0.38); }
    }
    // the shoulders and the upper arms are covered too (the shirt must not poke out): a mantle over each shoulder, a loose sleeve on the arm
    const UP = ch.BONE_LENGTH_UPPER || 1;
    for (const [a, sx] of [[ch.leftArmAnchor, -1], [ch.rightArmAnchor, 1]]) {
        bx(T, wool, list, 0.62, 0.34, 0.9, sx * 0.76, 0.62, 0, 0, 0, sx * 0.12);
        if (!a) continue;
        const us = put(a, SLEEVE(), wool, list, 0, 0, 0, 1.25, UP * 1.0, 1.25);
        us.rotation.x = Math.PI / 2; us.position.z = 0;
    }
    // bell sleeves on the forearms, an embroidered cuff and a gold edge at the wrist
    for (const e of [ch.leftElbowAnchor, ch.rightElbowAnchor]) {
        if (!e) continue;
        const sl = put(e, SLEEVE(), wool, list, 0, 0, 0, 1, 1, 1); // radius grows toward z = LOW: made by rotating the unit shape onto z
        sl.rotation.x = Math.PI / 2; sl.scale.set(1.3, LOW * 0.98, 1.3); sl.position.z = 0;
        const cf = put(e, CUFF(), velvet, list, 0, 0, 0, 1, 1, 1);
        cf.rotation.x = Math.PI / 2; cf.scale.set(1.3, LOW * 0.98, 1.3); cf.position.z = 0;
        const th = put(e, CUFF(), cloth(0xffffff, threadTex(motif), 1, 1, { alphaTest: 0.4, side: true }), list, 0, 0, 0, 1.01, 1, 1.01);
        th.rotation.x = Math.PI / 2; th.scale.set(1.315, LOW * 0.98, 1.315); th.position.z = 0;
        if (tier >= 1) put(e, TORUS(), gold, list, 0, 0, LOW * 0.98, 0.4, 0.4, 0.4);
    }
    // the hat
    const H = ch.head;
    if (hood && H) {
        const hatC = cloth(_tint(base, 0.85), woolTex(), 2, 2, { side: true, emissive: glow });
        const high = 1.6 + 0.35 * tier;
        put(H, BRIM(), hatC, list, 0, 0.64, 0, 1.45, 1, 1.45, 0.04, 0, 0.03);
        put(H, CONE(), hatC, list, -0.02, 0.64 + high / 2, 0.04, 1.4, high, 1.4);
        const BAND = geo('hband', () => new THREE.CylinderGeometry(0.56, 0.6, 0.2, 28, 1, true));
        put(H, BAND, velvet, list, 0, 0.78, 0, 1.25, 1, 1.25);
        put(H, BAND, cloth(0xffffff, threadTex(motif), 2, 1, { alphaTest: 0.4, side: true }), list, 0, 0.78, 0, 1.265, 1, 1.265);
        bx(H, gold, list, 0.2, 0.2, 0.05, 0, 0.78, -0.78);
        bx(H, lam(tier >= 2 ? 'gemR' : 'gemB', tier >= 2 ? { color: 0xd02050, emissive: 0xc01040, emissiveIntensity: 0.9 } : { color: 0x4f8cff, emissive: 0x2a60e0, emissiveIntensity: 0.7 }), list, 0.11, 0.11, 0.06, 0, 0.78, -0.8);
        if (tier >= 2) put(H, TORUS(), gold, list, 0, 0.66, 0, 1.4, 1.4, 1.4, Math.PI / 2);
        put(H, geo('stud', () => new THREE.SphereGeometry(0.09, 8, 6)), gold, list, 0.56, 0.64 + 0.88 * high - 0.3, 0.04);
    }
}
