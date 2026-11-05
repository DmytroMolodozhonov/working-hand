/**
 * KnightArmorLook.js — the hero's armour (helmet, breastplate, greaves), drawn "like the gates" (docs/rules/texture-style.md): brushed steel with scratches,
 * dents and bright edges drawn once on a canvas; real shapes (a domed helm with a brow band, cheek guards, a mail aventail; a cuirass with a ridge, a waist
 * of lames, layered pauldrons, couters and vambraces; cuisses, fan-shaped poleyns, greaves and segmented sabatons), rivets, leather straps and buckles.
 * NOT CONNECTED yet (the author: «хотя броня не совсем плохая, думаю, ты лучше» — a preview first): ArmorLook.dressArmor can call these three instead of its boxes.
 *
 * Same contract as ArmorLook's own pieces: `helmetParts(head, code, list, dk)`, `chestParts(ch, torso, code, list, dk)`, `legParts(pivot, code, list, dk)`;
 * code 1 plain steel, 2 magic (a cold blue glow), 3 named (magic with gold trim); `dk` — the dark mage's curse blackened it.
 * Measures as there: head box 1.2 (its middle at 0, the face −z), torso 1.2 × 1.5 × 0.8, upper arm 1.0 / forearm 0.9 along z, legs 0.5 wide hanging to −1.95.
 * Cheap: unit geometries shared, one steel texture and one mail texture drawn once, materials cached by (kind, code, dark), nothing per piece but scale.
 */

import * as THREE from 'three';

const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

// ------------------------------------------------------------------ textures (once; none without a document)
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

/** Brushed steel: pale base, long fine strokes along u, deep and bright scratches, dents (soft dark centre, bright rim), a bevel on every edge. */
const steelTex = () => tex('steel', 256, 128, (g, W, H, r) => {
    g.fillStyle = '#d6dae0'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 520; i++) { const y = r() * H, x = r() * W, l = 30 + r() * 120; g.strokeStyle = r() < 0.55 ? `rgba(255,255,255,${0.08 + r() * 0.2})` : `rgba(40,50,70,${0.06 + r() * 0.16})`; g.lineWidth = 0.5 + r() * 0.9; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 1.5); g.stroke(); }
    for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * H, l = 6 + r() * 26, a = (r() - 0.5) * 1.4; g.strokeStyle = `rgba(20,25,35,${0.25 + r() * 0.25})`; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x + 0.8, y + 0.8); g.lineTo(x + Math.cos(a) * l + 0.8, y + Math.sin(a) * l + 0.8); g.stroke(); }
    for (let i = 0; i < 9; i++) { const x = r() * W, y = r() * H, rad = 5 + r() * 12; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(30,40,60,0.25)'); gr.addColorStop(0.75, 'rgba(30,40,60,0.04)'); gr.addColorStop(1, 'rgba(255,255,255,0.22)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill(); }
    for (let i = 0; i < 4; i++) { const x = r() * W, y = r() * H, rad = 10 + r() * 20, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(90,60,30,0.18)'); gr.addColorStop(1, 'rgba(90,60,30,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill(); } // a trace of rust / heat tint
    const e = 7;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh, a] of [[0, 0, 0, e, 0, 0, W, e, 0.4], [0, H, 0, H - e, 0, H - e, W, e, 0.35]]) { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); }
}, 81);

/** Chain mail: interlocking rings with a dark centre and a bright rim. */
const mailTex = () => tex('mail', 96, 96, (g, W, H, r) => {
    g.fillStyle = '#4a4f58'; g.fillRect(0, 0, W, H);
    const s = 8;
    for (let y = 0; y < H + s; y += s / 2) for (let x = (Math.round(y / (s / 2)) % 2) * (s / 2); x < W + s; x += s) {
        g.strokeStyle = 'rgba(20,24,30,0.9)'; g.lineWidth = 1.8; g.beginPath(); g.arc(x + 0.7, y + 0.8, s * 0.42, 0, 6.3); g.stroke();
        g.strokeStyle = `rgba(${190 + r() * 40 | 0},${196 + r() * 40 | 0},${205 + r() * 40 | 0},0.9)`; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, s * 0.42, 0, 6.3); g.stroke();
    }
}, 82);

/** Leather (straps, belts): pores, creases, a stitched edge. */
const leatherTex = () => tex('aleather', 64, 64, (g, W, H, r) => {
    g.fillStyle = '#d6cbb9'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 500; i++) { const x = r() * W, y = r() * H; g.fillStyle = `rgba(40,25,10,${0.08 + r() * 0.14})`; g.beginPath(); g.arc(x, y, 0.5 + r() * 1.1, 0, 6.3); g.fill(); }
    for (let i = 0; i < 6; i++) { const x = r() * W, y = r() * H, l = 12 + r() * 26; g.strokeStyle = `rgba(30,18,6,${0.1 + r() * 0.14})`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 6); g.stroke(); }
    g.strokeStyle = 'rgba(20,10,0,0.5)'; g.lineWidth = 1.6; g.setLineDash([4, 3]); g.strokeRect(5, 6, W - 10, H - 12); g.strokeStyle = '#e8d8a8'; g.lineWidth = 1; g.strokeRect(4.5, 5.5, W - 9, H - 11); g.setLineDash([]);
}, 83);

/** A knight's surcoat (tabard): woven cloth in the house colours with a cross, a trim along the hem and a stitched edge. kind: 0 plain blue/white, 1 magic blue/silver, 2 named red/gold, 3 cursed black/grey. */
const TAB = [['#27478c', '#f0f0ea'], ['#1c3768', '#c9d8f4'], ['#8a2424', '#e8c25a'], ['#1c1c20', '#6a6a72']];
const tabardTex = (k) => tex('tabard' + k, 128, 192, (g, W, H, r) => {
    const [cloth, cross] = TAB[k];
    g.fillStyle = cloth; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(0,0,0,${0.06 + 0.04 * ((y >> 1) & 1)})`; g.fillRect(0, y, W, 1); }
    for (let x = 0; x < W; x += 2) { g.fillStyle = `rgba(255,255,255,${0.04 + 0.04 * ((x >> 1) & 1)})`; g.fillRect(x, 0, 1, H); }
    for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
    // the cross: wide arms, a thin outline and a highlight; stitched along its edge
    const cx = W / 2, cy = 70, a = 13;
    g.fillStyle = cross; g.fillRect(cx - a, cy - 46, a * 2, 110); g.fillRect(cx - 38, cy - a, 76, a * 2);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.strokeRect(cx - a, cy - 46, a * 2, 110); g.strokeRect(cx - 38, cy - a, 76, a * 2);
    g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(cx - a + 2, cy - 44, 3, 106);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, H - 22, W, 22); g.fillStyle = cross; g.fillRect(0, H - 20, W, 5); g.fillRect(0, H - 8, W, 2);
    for (let y = 8; y < H; y += 7) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(3, y, 1.6, 3); g.fillRect(W - 5, y, 1.6, 3); }
    const e = g.createLinearGradient(0, 0, 0, 18); e.addColorStop(0, 'rgba(0,0,0,0.35)'); e.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = e; g.fillRect(0, 0, W, 18);
}, 84 + k);

// ------------------------------------------------------------------ materials and shapes (shared, bounded)
const _m = new Map();
const mk = (k, make) => { if (!_m.has(k)) { const m = make(); m.userData.shared = true; _m.set(k, m); } return _m.get(k); };
/** The steel of a piece. code 1 plain, 2 magic (cool blue, a faint glow), 3 named; dk — blackened by the curse. */
const steel = (code, dk = false) => mk(`s${code}${dk ? 'd' : ''}`, () => new THREE.MeshStandardMaterial({
    color: dk ? 0x2e3036 : code >= 2 ? 0xdce6ff : 0xdde2ea, map: steelTex(), metalness: 0.3, roughness: 0.3, side: THREE.DoubleSide,
    emissive: code >= 2 && !dk ? 0x2f5fd0 : 0x000000, emissiveIntensity: code >= 2 ? 0.22 : 0,
}));
const darkSteel = (code, dk = false) => mk(`k${code}${dk ? 'd' : ''}`, () => new THREE.MeshStandardMaterial({ color: dk ? 0x1a1b1e : code >= 2 ? 0x9ab0dc : 0xa4aebc, map: steelTex(), metalness: 0.3, roughness: 0.38, side: THREE.DoubleSide, emissive: code >= 2 && !dk ? 0x1a3a90 : 0x000000, emissiveIntensity: code >= 2 ? 0.2 : 0 }));
/** The trim: dull brass on plain steel, bright blue-white on magic, gold on named. */
const trim = (code, dk = false) => mk(`t${code}${dk ? 'd' : ''}`, () => new THREE.MeshStandardMaterial(code === 3 ? { color: 0xe0b43c, metalness: 0.8, roughness: 0.32, emissive: 0x6a4a00, emissiveIntensity: 0.3 } : code === 2 ? { color: 0x9fc4ff, metalness: 0.6, roughness: 0.3, emissive: 0x3a6ae0, emissiveIntensity: 0.5 } : { color: dk ? 0x3a3a3e : 0xa88a4a, metalness: 0.7, roughness: 0.4 }));
const mail = (dk) => mk(`m${dk ? 'd' : ''}`, () => new THREE.MeshLambertMaterial({ color: dk ? 0x55565c : 0xffffff, map: mailTex(), side: THREE.DoubleSide }));
const tabard = (code, dk) => mk(`tb${code}${dk ? 'd' : ''}`, () => new THREE.MeshLambertMaterial({ map: tabardTex(dk ? 3 : code >= 3 ? 2 : code === 2 ? 1 : 0), side: THREE.DoubleSide }));
const strap = () => mk('strap', () => new THREE.MeshLambertMaterial({ color: 0x4a2c18, map: leatherTex(), side: THREE.DoubleSide }));
const rivetMat = (code, dk) => trim(code, dk);

const _geo = {};
const geo = (k, make) => _geo[k] || (_geo[k] = Object.assign(make(), { userData: { shared: true } }));
const BOX = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const CYL = () => geo('cyl', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1, true));
const FRONT = () => geo('front', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1, true, Math.PI / 2, Math.PI)); // the front half (−z)
const BACK = () => geo('back', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1, true, -Math.PI / 2, Math.PI));
const TAPER = () => geo('taper', () => new THREE.CylinderGeometry(0.5, 0.36, 1, 20, 1, true)); // wider on top (a thigh, a forearm)
const DOME = () => geo('dome', () => new THREE.SphereGeometry(0.5, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2));
const BALL = () => geo('ball', () => new THREE.SphereGeometry(0.5, 8, 6));
const SPIKE = () => geo('spike', () => new THREE.ConeGeometry(0.5, 1, 6));
const RING = () => geo('ring', () => new THREE.TorusGeometry(0.5, 0.04, 6, 24));
/** A rounded-corner prism (a rounded square in plan, height 1 along y, 1 × 1): armour must wrap the hero's BOXY limbs — round tubes left the box corners poking out. */
const RBOX = () => geo('rbox', () => {
    const r = 0.2, w = 0.47, sh = new THREE.Shape();
    sh.moveTo(-w + r, -w); sh.lineTo(w - r, -w); sh.quadraticCurveTo(w, -w, w, -w + r); sh.lineTo(w, w - r); sh.quadraticCurveTo(w, w, w - r, w);
    sh.lineTo(-w + r, w); sh.quadraticCurveTo(-w, w, -w, w - r); sh.lineTo(-w, -w + r); sh.quadraticCurveTo(-w, -w, -w + r, -w);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.94, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 5 });
    g.rotateX(-Math.PI / 2); g.translate(0, -0.47, 0);
    g.computeVertexNormals();
    return g;
});
const DISK = () => geo('disk', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14));

function put(parent, geometry, material, list, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.userData.armor = true; m.userData.shared = true;
    parent.add(m); list?.push(m);
    return m;
}
const bx = (p, mat, list, w, h, d, x, y, z, rx, ry, rz) => put(p, BOX(), mat, list, x, y, z, w, h, d, rx, ry, rz);
const rivet = (p, mat, list, r, x, y, z) => put(p, BALL(), mat, list, x, y, z, r, r, r);
/** A row of rivets along x. */
const rivets = (p, mat, list, r, n, x0, x1, y, z) => { for (let i = 0; i < n; i++) rivet(p, mat, list, r, x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1)), y, z); };

// ------------------------------------------------------------------ the helmet (round the head box 1.2, its middle at 0)
export function helmetParts(p, code, list, dk = false) {
    const s = steel(code, dk), d = darkSteel(code, dk), t = trim(code, dk), ml = mail(dk), lt = strap(), rm = rivetMat(code, dk);
    const rb = (m, w, h, dd, x, y, z, rx, ry, rz) => put(p, RBOX(), m, list, x, y, z, w, h, dd, rx, ry, rz);
    // a light open Norman cap: a close round skull that stops ABOVE the brows (the eyes and brows stay free — the author: «не нравится, что глаза закрыты»);
    // four rounded layers hug the box head and cover the hair, no brim; a thin brow band, a comb along the top
    rb(s, 1.46, 0.34, 1.46, 0, 0.52, 0); rb(s, 1.44, 0.2, 1.44, 0, 0.8, 0); rb(s, 1.2, 0.14, 1.2, 0, 0.96, 0); rb(s, 0.86, 0.1, 0.86, 0, 1.06, 0);
    rb(t, 1.5, 0.06, 1.5, 0, 0.35, 0);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; rivet(p, rm, list, 0.045, Math.cos(a) * 0.76, 0.35, Math.sin(a) * 0.76); }
    rb(d, 0.1, 0.1, 1.3, 0, 1.06, 0.04); // the comb
    if (code >= 2) bx(p, t, list, 0.05, 0.18, 0.8, 0, 1.16, 0.06, -0.05); // a thin fin
    // a Norman nasal bar: only from the nose bridge down (not between the eyes), and hinged cheek plates at the sides
    bx(p, s, list, 0.09, 0.34, 0.07, 0, -0.14, -0.78); bx(p, d, list, 0.13, 0.06, 0.08, 0, 0.04, -0.78);
    for (const sx of [-1, 1]) { rb(s, 0.1, 0.66, 0.6, sx * 0.74, -0.02, 0.12); rb(t, 0.12, 0.05, 0.62, sx * 0.74, -0.36, 0.12); rivet(p, rm, list, 0.06, sx * 0.8, 0.26, 0.2); bx(p, lt, list, 0.07, 0.5, 0.05, sx * 0.66, -0.42, -0.62, 0.15, 0, sx * 0.1); }
    // the camail: a mail hood hanging from the helm over the neck and the shoulders
    rb(ml, 1.4, 0.32, 1.38, 0, -0.64, 0.02); rb(ml, 1.56, 0.18, 1.1, 0, -0.84, 0.02);
    for (const sx of [-1, 1]) bx(p, lt, list, 0.07, 0.5, 0.05, sx * 0.66, -0.42, -0.62, 0.15, 0, sx * 0.1);
    if (code === 3) { // named: a plume of red horsehair on a gold socket
        put(p, DISK(), t, list, 0, 1.12, 0.05, 0.24, 0.12, 0.24);
        for (let i = 0; i < 6; i++) put(p, SPIKE(), mk('plume', () => new THREE.MeshLambertMaterial({ color: 0xb0202a, emissive: 0x300004 })), list, 0, 1.3 - i * 0.03, 0.12 + i * 0.12, 0.22, 0.6 - i * 0.05, 0.14, 0.5 + i * 0.1);
    }
}

// ------------------------------------------------------------------ the breastplate (torso space: body 1.2 × 1.5 × 0.8, y 0 at its middle, the front −z)
export function chestParts(ch, p, code, list, dk = false) {
    const s = steel(code, dk), d = darkSteel(code, dk), t = trim(code, dk), lt = strap(), ml = mail(dk), rm = rivetMat(code, dk);
    const rb = (m, w, h, dd, x, y, z, rx, ry, rz) => put(p, RBOX(), m, list, x, y, z, w, h, dd, rx, ry, rz);
    // the cuirass: a rounded shell round the whole torso, a ridge down the front, a rolled neck edge
    rb(s, 1.4, 1.0, 0.98, 0, 0.18, 0);
    bx(p, t, list, 0.07, 0.9, 0.07, 0, 0.2, -0.5);
    rb(t, 1.2, 0.07, 0.8, 0, 0.7, 0);
    // the surcoat: front and back panels in the house colours with a cross, hanging from the shoulders to the knees under the belt; mail skirt below
    const tb = tabard(code, dk);
    bx(p, tb, list, 0.86, 1.95, 0.04, 0, -0.35, -0.5); bx(p, tb, list, 0.86, 1.95, 0.04, 0, -0.35, 0.5);
    rb(ml, 1.1, 0.34, 0.82, 0, -1.55, 0);
    // the belt with a buckle and leather side straps
    bx(p, lt, list, 1.46, 0.14, 0.96, 0, -0.3, 0); bx(p, t, list, 0.26, 0.18, 0.06, 0, -0.3, -0.5); bx(p, d, list, 0.12, 0.1, 0.07, 0, -0.3, -0.52);
    for (const sx of [-1, 1]) { bx(p, lt, list, 0.07, 0.95, 0.9, sx * 0.72, 0.2, 0); bx(p, t, list, 0.12, 0.08, 0.1, sx * 0.72, 0.5, -0.46); bx(p, t, list, 0.12, 0.08, 0.1, sx * 0.72, 0.0, -0.46); }
    // the gorget: mail under two rounded lames
    rb(ml, 0.92, 0.2, 0.74, 0, 0.78, 0); rb(s, 1.0, 0.12, 0.8, 0, 0.8, 0); rb(d, 0.86, 0.12, 0.7, 0, 0.9, 0);
    // the pauldrons: a dome over each shoulder, three lames below it, a rim of rivets
    for (const sx of [-1, 1]) {
        const x = sx * 0.82;
        put(p, DOME(), s, list, x, 0.6, 0, 0.7, 0.42, 0.74, 0, 0, sx * 0.25);
        rb(t, 0.7, 0.05, 0.74, x, 0.6, 0, 0, 0, sx * 0.25);
        for (let i = 0; i < 2; i++) rb(i % 2 ? d : s, 0.62 - i * 0.02, 0.14, 0.76, x + sx * (0.04 + i * 0.03), 0.46 - i * 0.12, 0, 0, 0, sx * 0.25);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; rivet(p, rm, list, 0.04, x + Math.cos(a) * 0.36, 0.64, Math.sin(a) * 0.38); }
    }
    // the arms: a rerebrace on the upper arm, the couter (elbow cup with a spike), the vambrace on the forearm — rounded sleeves with edge bands
    const UP = ch.BONE_LENGTH_UPPER || 1, LOW = ch.BONE_LENGTH_LOWER || 1;
    for (const [a, e] of [[ch.leftArmAnchor, ch.leftElbowAnchor], [ch.rightArmAnchor, ch.rightElbowAnchor]]) {
        if (a) { put(a, RBOX(), s, list, 0, 0, UP * 0.42, 0.58, UP * 0.62, 0.58, Math.PI / 2); put(a, RBOX(), t, list, 0, 0, UP * 0.1, 0.6, 0.05, 0.6, Math.PI / 2); put(a, RBOX(), t, list, 0, 0, UP * 0.74, 0.6, 0.05, 0.6, Math.PI / 2); }
        if (e) {
            put(e, DOME(), s, list, 0, 0.06, 0, 0.56, 0.5, 0.56, Math.PI / 2); put(e, SPIKE(), t, list, 0, 0.34, 0, 0.1, 0.26, 0.1);
            put(e, RBOX(), s, list, 0, 0, LOW * 0.5, 0.5, LOW * 0.66, 0.5, Math.PI / 2); put(e, RBOX(), t, list, 0, 0, LOW * 0.86, 0.54, 0.05, 0.54, Math.PI / 2);
            bx(e, d, list, 0.1, 0.06, LOW * 0.5, 0, 0.27, LOW * 0.45);
        }
    }
    if (code === 3) { put(p, SPIKE(), t, list, 0, 0.32, -0.54, 0.2, 0.36, 0.04, Math.PI); bx(p, t, list, 0.3, 0.05, 0.04, 0, 0.42, -0.53); } // named: an embossed crest on the chest
    if (code >= 2) for (const sx of [-1, 1]) for (const y of [0.0, -0.16]) bx(p, t, list, 0.05, 0.1, 0.03, sx * 0.34, y, -0.5, 0, 0, 0.4 * sx); // glowing runes
}

// ------------------------------------------------------------------ the greaves (a leg pivot: the leg 0.5 thick hangs down to −1.95)
export function legParts(p, code, list, dk = false) {
    const s = steel(code, dk), d = darkSteel(code, dk), t = trim(code, dk), lt = strap(), rm = rivetMat(code, dk);
    const rb = (m, w, h, dd, x, y, z, rx, ry, rz) => put(p, RBOX(), m, list, x, y, z, w, h, dd, rx, ry, rz);
    // the cuisse: a rounded shell on the thigh with a rolled top
    rb(s, 0.66, 0.9, 0.66, 0, -0.52, 0); rb(t, 0.68, 0.06, 0.68, 0, -0.1, 0); bx(p, d, list, 0.06, 0.8, 0.06, 0, -0.52, -0.34);
    // the poleyn: a cup over the knee with a fan plate each side and a rivet
    put(p, DOME(), s, list, 0, -1.04, -0.1, 0.62, 0.5, 0.6, -Math.PI / 2 + 0.2);
    for (const sx of [-1, 1]) { rb(d, 0.12, 0.34, 0.4, sx * 0.34, -1.04, 0, 0, 0, sx * 0.15); rivet(p, rm, list, 0.05, sx * 0.4, -1.04, -0.1); }
    bx(p, t, list, 0.1, 0.06, 0.1, 0, -1.04, -0.38);
    // the greave: a shell on the shin with a ridge, edge bands, straps at the calf
    rb(s, 0.6, 0.76, 0.6, 0, -1.5, 0); rb(t, 0.62, 0.05, 0.62, 0, -1.12, 0); bx(p, t, list, 0.06, 0.7, 0.07, 0, -1.5, -0.31);
    for (const y of [-1.34, -1.66]) bx(p, lt, list, 0.64, 0.08, 0.64, 0, y, 0);
    bx(p, t, list, 0.1, 0.1, 0.05, 0, -1.34, -0.33);
    // the sabaton: segmented lames over the foot and a pointed toe
    for (let i = 0; i < 3; i++) bx(p, i % 2 ? d : s, list, 0.58 - i * 0.02, 0.1, 0.22, 0, -1.86 + i * 0.04, -0.16 - i * 0.2, 0.15 * i);
    bx(p, s, list, 0.52, 0.18, 0.26, 0, -1.84, 0.08); rb(s, 0.34, 0.16, 0.3, 0, -1.86, -0.74);
    bx(p, d, list, 0.54, 0.06, 0.78, 0, -1.94, -0.12);
    if (code >= 2) bx(p, t, list, 0.04, 0.5, 0.03, 0, -1.5, -0.34);
}
