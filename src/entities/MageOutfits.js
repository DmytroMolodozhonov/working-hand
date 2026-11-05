/**
 * MageOutfits.js — five DIFFERENT wizard costumes for the hero, drawn "like the gates" (docs/rules/texture-style.md). A PREVIEW only (not connected to the game).
 * Built the way that worked for the hero's wardrobe and armour: rounded prisms that WRAP the box limbs (nothing pokes out), stacked into a flared skirt, bell sleeves
 * and a bent cone hat; woven wool, velvet, gold thread, fur, bark and a star field drawn once on canvases.
 *
 *   archmage — a long deep-blue robe, gold stars on the hem, a cape, a wide-brimmed star hat, a long white beard;
 *   fire     — a short black-and-red coat open at the front, flame embroidery, a pointed cowl, spiked shoulders, a flame buckle;
 *   druid    — a green robe, a bark-leather mantle with a leaf collar, a rope belt, antlers on a wreath, no hat;
 *   frost    — a white-blue robe with a fur collar and fur cuffs, ice crystals on the shoulders, a crown of ice shards;
 *   astrologer — an indigo robe sprinkled with stars, a gold sash with a zodiac coin, a tall hat with a crescent moon.
 *
 * Measures: torso 1.2 × 1.5 × 0.8 (y 0 at its middle, the front −z), head box 1.2 (the hat sits on it at y 0.62), arms 0.4 / 0.35 thick (upper 1.0, forearm 0.9 along z).
 */

import * as THREE from 'three';
import { woolTex, velvetTex, leatherTex, threadTex } from './MageRobeLook.js';

const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const _tex = {};
function tex(name, w, h, draw, seed) {
    if (_tex[name] !== undefined) return _tex[name];
    if (typeof document === 'undefined') return (_tex[name] = null);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); if (!g) return (_tex[name] = null);
    draw(g, w, h, rng(seed));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return (_tex[name] = t);
}
/** A night sky on wool: a dark cloth with hundreds of tiny stars (some with rays), a few moons and constellations stitched in gold. */
const skyTex = () => tex('sky', 256, 256, (g, W, H, r) => {
    const base = woolTex(); if (base?.image) { g.drawImage(base.image, 0, 0, W, H); }
    g.fillStyle = 'rgba(8,10,40,0.55)'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) { const x = r() * W, y = r() * H, a = 0.4 + r() * 0.6; g.fillStyle = `rgba(255,248,210,${a})`; g.fillRect(x, y, 1 + (r() < 0.2), 1 + (r() < 0.2)); }
    for (let i = 0; i < 14; i++) { const x = r() * W, y = r() * H, l = 3 + r() * 4; g.strokeStyle = 'rgba(255,240,180,0.85)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - l, y); g.lineTo(x + l, y); g.moveTo(x, y - l); g.lineTo(x, y + l); g.stroke(); }
    for (let k = 0; k < 3; k++) { let x = r() * W, y = r() * H; g.strokeStyle = 'rgba(232,194,90,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 4; i++) { x += (r() - 0.3) * 30; y += (r() - 0.5) * 26; g.lineTo(x, y); g.fillStyle = '#e8c25a'; } g.stroke(); }
    const mx = 190, my = 60; g.fillStyle = '#f0d890'; g.beginPath(); g.arc(mx, my, 12, 0, 6.3); g.fill(); g.fillStyle = 'rgba(8,10,40,0.9)'; g.beginPath(); g.arc(mx + 6, my - 3, 10, 0, 6.3); g.fill();
}, 91);
/** Bark: deep vertical cracks, moss and pale lichen flecks. */
const barkTex = () => tex('bark2', 128, 128, (g, W, H, r) => {
    g.fillStyle = '#cdb89a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) { const x = r() * W, y = r() * H, l = 14 + r() * 50; g.strokeStyle = `rgba(35,20,8,${0.25 + r() * 0.3})`; g.lineWidth = 1 + r() * 1.8; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 3, y + l / 3, x - 3, y + l * 0.66, x + 1, y + l); g.stroke(); }
    for (let i = 0; i < 120; i++) { g.fillStyle = r() < 0.4 ? `rgba(70,110,50,${0.15 + r() * 0.2})` : r() < 0.5 ? `rgba(230,225,200,${0.1 + r() * 0.2})` : `rgba(30,18,6,${0.1 + r() * 0.2})`; g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 2); }
}, 92);
/** Fur: soft crossed tufts, bright tips, a darker root. */
const furTex = () => tex('fur', 128, 128, (g, W, H, r) => {
    g.fillStyle = '#d8dde6'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) { const x = r() * W, y = r() * H, a = r() * 6.3, l = 3 + r() * 6; g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.2 + r() * 0.3})` : `rgba(90,100,130,${0.1 + r() * 0.15})`; g.lineWidth = 0.8 + r(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
}, 93);

// ------------------------------------------------------------------ shapes and a builder
const _geo = {};
const geo = (k, make) => _geo[k] || (_geo[k] = Object.assign(make(), { userData: { shared: true } }));
const RBOX = () => geo('rbox', () => {
    const r = 0.2, w = 0.47, sh = new THREE.Shape();
    sh.moveTo(-w + r, -w); sh.lineTo(w - r, -w); sh.quadraticCurveTo(w, -w, w, -w + r); sh.lineTo(w, w - r); sh.quadraticCurveTo(w, w, w - r, w);
    sh.lineTo(-w + r, w); sh.quadraticCurveTo(-w, w, -w, w - r); sh.lineTo(-w, -w + r); sh.quadraticCurveTo(-w, -w, -w + r, -w);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.94, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 5 });
    g.rotateX(-Math.PI / 2); g.translate(0, -0.47, 0); g.computeVertexNormals();
    return g;
});
const BOX = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const BALL = () => geo('ball', () => new THREE.SphereGeometry(0.5, 10, 8));
const CONE = () => geo('cone', () => new THREE.ConeGeometry(0.5, 1, 8));
const OCTA = () => geo('octa', () => new THREE.OctahedronGeometry(0.5));
const TORUS = () => geo('torus', () => new THREE.TorusGeometry(0.5, 0.05, 6, 28));
const ARC = () => geo('arc', () => new THREE.TorusGeometry(0.5, 0.09, 8, 24, Math.PI * 1.25));
const DISK = () => geo('disk', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14));

class D {
    constructor(ch) { this.ch = ch; }
    lam(color, map = null, o = {}) { return new THREE.MeshLambertMaterial({ color, map, ...o }); }
    std(color, o) { return new THREE.MeshStandardMaterial({ color, ...o }); }
    put(parent, g, m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { const o = new THREE.Mesh(g, m); o.scale.set(w, h, d); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; parent.add(o); this.ch._armorParts.push(o); return o; }
    rb(p, m, w, h, d, x, y, z, rx, ry, rz) { return this.put(p, RBOX(), m, w, h, d, x, y, z, rx, ry, rz); }
    bx(p, m, w, h, d, x, y, z, rx, ry, rz) { return this.put(p, BOX(), m, w, h, d, x, y, z, rx, ry, rz); }
    ball(p, m, r, x, y, z) { return this.put(p, BALL(), m, r * 2, r * 2, r * 2, x, y, z); }
}
const tint = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const lite = (c, k) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();
const GOLD = () => ({ color: 0xe0b43c, metalness: 0.8, roughness: 0.32 });

/** The shared robe: a bodice that wraps the torso, a flared skirt of stacked prisms with pleats, a hem band of thread, bell sleeves on the arms, a belt. */
function robe(d, o) {
    const ch = d.ch, T = ch.torso, UP = ch.BONE_LENGTH_UPPER, LOW = ch.BONE_LENGTH_LOWER;
    const wool = d.lam(o.color, o.map || woolTex()), dark = d.lam(tint(o.color, 0.72), o.map || woolTex()), vel = d.lam(o.trim, velvetTex());
    const thread = d.lam(0xffffff, threadTex(o.motif), { alphaTest: 0.4, transparent: true });
    // the bodice and a collar
    d.rb(T, wool, 1.44, 1.72, 1.0, 0, 0.04, 0); d.rb(T, vel, 1.0, 0.24, 0.8, 0, 0.84, 0);
    // the skirt: layers of a trapezoid, each wider and deeper, to the hem; pleats down the front
    const N = o.layers, top = -0.62, bottom = o.hem, h = (top - bottom) / N;
    for (let i = 0; i < N; i++) { const t = (i + 0.5) / N; d.rb(T, i % 2 ? dark : wool, 1.46 + t * o.flare, h + 0.02, 1.0 + t * o.flare * 0.6, 0, top - (i + 0.5) * h, 0); }
    for (let k = -2; k <= 2; k++) d.bx(T, dark, 0.07, (top - bottom) * 0.92, 0.05, k * 0.28, (top + bottom) / 2, -(0.52 + o.flare * 0.3 * 0.5), 0, 0, k * 0.01);
    // the hem band: velvet with gold thread on its front and sides
    const hb = 0.4, wb = 1.46 + o.flare, db = 1.0 + o.flare * 0.6;
    d.rb(T, vel, wb + 0.02, hb, db + 0.02, 0, bottom + hb / 2, 0);
    for (const [w, dd, x, z, ry] of [[wb, 0, 0, -(db / 2 + 0.025), 0], [wb, 0, 0, db / 2 + 0.025, Math.PI], [db, 0, wb / 2 + 0.025, 0, Math.PI / 2], [db, 0, -(wb / 2 + 0.025), 0, -Math.PI / 2]]) d.bx(T, thread, w * 0.98, hb * 0.9, 0.02, x, bottom + hb / 2, z, 0, ry, 0);
    d.rb(T, d.std(...[GOLD().color, { metalness: 0.8, roughness: 0.32 }]), wb + 0.04, 0.05, db + 0.04, 0, bottom + hb + 0.02, 0);
    // a belt with a buckle
    const lea = d.lam(0x4a2c18, leatherTex());
    d.rb(T, lea, 1.5, 0.16, 1.04, 0, -0.58, 0); d.bx(T, d.std(...[GOLD().color, { metalness: 0.8, roughness: 0.32 }]), 0.26, 0.22, 0.06, 0, -0.58, -0.54);
    // sleeves: the arm wrapped, then three prisms widening toward the wrist, a velvet cuff with thread
    for (const [a, e] of [[ch.leftArmAnchor, ch.leftElbowAnchor], [ch.rightArmAnchor, ch.rightElbowAnchor]]) {
        d.rb(a, wool, 0.6, 1.0, 0.6, 0, 0, UP * 0.5, Math.PI / 2);
        for (let i = 0; i < 3; i++) { const w = 0.56 + i * 0.1 + o.bell * 0.1 * i; d.rb(e, i % 2 ? dark : wool, w, LOW * 0.3, w, 0, 0, LOW * (0.17 + i * 0.3), Math.PI / 2); }
        const cw = 0.56 + 0.2 + o.bell * 0.2;
        d.rb(e, vel, cw + 0.03, 0.2, cw + 0.03, 0, 0, LOW * 0.9, Math.PI / 2); d.bx(e, thread, cw, 0.02, 0.18, 0, cw / 2 + 0.02, LOW * 0.9);
    }
    return { wool, dark, vel, thread, lea };
}
/** A cone hat of stacked rounded layers, bent at the tip; a brim; a band with a buckle. */
function hat(d, o) {
    const H = d.ch.head, m = d.lam(o.color, woolTex()), band = d.lam(o.trim, velvetTex()), thread = d.lam(0xffffff, threadTex(o.motif), { alphaTest: 0.4, transparent: true });
    const gold = d.std(GOLD().color, { metalness: 0.8, roughness: 0.32 });
    if (o.brim) d.rb(H, m, o.brim, 0.08, o.brim * 0.96, 0, 0.64, 0, 0.03, 0, 0.02);
    const N = 9;
    for (let i = 0; i < N; i++) { const t = i / (N - 1), w = (1.52 - t * 1.36) * (o.slim || 1), y = 0.72 + i * (o.high / N); d.rb(H, m, w, o.high / N + 0.04, w, o.bend * t * t * 1.4, y, o.bend * 0.12 * t * t); }
    d.rb(H, band, 1.6, 0.22, 1.6, 0, 0.8, 0); d.bx(H, thread, 1.58, 0.2, 0.02, 0, 0.8, -0.81); d.bx(H, gold, 0.24, 0.24, 0.05, 0, 0.8, -0.84);
    return { m, band, gold };
}

const OUTFITS = {
    archmage(d) {
        const r = robe(d, { color: 0x24408a, trim: 0x1a1240, motif: 'star', layers: 6, hem: -2.2, flare: 0.9, bell: 1 });
        const { gold } = hat(d, { color: 0x1c3070, trim: 0x1a1240, motif: 'star', brim: 3.0, high: 2.8, bend: 0.5 });
        d.ball(d.ch.torso, d.std(0xd02050, { roughness: 0.2, emissive: 0xc01040, emissiveIntensity: 0.7 }), 0.1, 0, 0.82, -0.52);
        // a cape and a gold-edged mantle
        const cape = d.lam(0x2a1450, velvetTex()); d.rb(d.ch.torso, cape, 1.5, 2.8, 0.1, 0, -0.9, 0.6, 0.04); d.rb(d.ch.torso, d.std(GOLD().color, { metalness: 0.8, roughness: 0.32 }), 1.54, 0.07, 0.14, 0, -2.28, 0.62);
        for (const sx of [-1, 1]) { d.rb(d.ch.torso, r.wool, 0.9, 0.34, 1.04, sx * 0.8, 0.66, 0, 0, 0, sx * 0.16); d.ball(d.ch.torso, gold, 0.11, sx * 0.5, 0.78, -0.5); }
        // a long white beard of wool tufts
        const beard = d.lam(0xece8e0, woolTex()); for (let i = 0; i < 4; i++) d.rb(d.ch.head, beard, 0.9 - i * 0.16, 0.34, 0.3, 0, -0.5 - i * 0.28, -0.6 - i * 0.04);
    },
    fire(d) {
        const r = robe(d, { color: 0x8a2a20, trim: 0x2a0e10, motif: 'flame', layers: 4, hem: -1.7, flare: 0.5, bell: 0 });
        // an open front: two dark panels down the chest and skirt, a flame buckle
        const blk = d.lam(0x1a1214, velvetTex()); d.rb(d.ch.torso, blk, 0.5, 2.1, 0.06, 0, -0.55, -0.66); d.bx(d.ch.torso, d.lam(0xff7a30, null, { emissive: 0xff5a10, emissiveIntensity: 0.9 }), 0.2, 0.3, 0.06, 0, -0.58, -0.58, 0, 0, Math.PI / 4);
        // a pointed cowl: a hood of stacked layers drawn over the head, a peak bent back
        const m = d.lam(0x6a1c18, woolTex()), dk = d.lam(0x2a0e10, velvetTex());
        d.rb(d.ch.head, m, 1.52, 1.5, 1.5, 0, 0.08, 0.1); d.rb(d.ch.head, dk, 1.0, 1.1, 0.1, 0, 0.0, -0.66); // (the dark opening round the face)
        for (let i = 0; i < 6; i++) { const t = i / 5, w = 1.5 - t * 1.2; d.rb(d.ch.head, m, w, 0.34, w, 0, 0.9 + i * 0.3, 0.12 + t * t * 0.7); }
        d.rb(d.ch.torso, m, 1.9, 0.4, 1.3, 0, 0.78, 0.04);
        // spiked shoulders and bracers
        const iron = d.std(0x3a3a42, { metalness: 0.5, roughness: 0.4 });
        for (const sx of [-1, 1]) { d.rb(d.ch.torso, iron, 0.8, 0.22, 0.9, sx * 0.84, 0.72, 0, 0, 0, sx * 0.2); for (let k = 0; k < 3; k++) d.put(d.ch.torso, CONE(), iron, 0.14, 0.4, 0.14, sx * (0.9 + k * 0.1), 0.92 + k * 0.1, -0.2 + k * 0.2, 0, 0, -sx * 0.4); }
        for (const e of [d.ch.leftElbowAnchor, d.ch.rightElbowAnchor]) d.rb(e, iron, 0.58, 0.28, 0.58, 0, 0, d.ch.BONE_LENGTH_LOWER * 0.62, Math.PI / 2);
    },
    druid(d) {
        const r = robe(d, { color: 0x4a7a3a, trim: 0x3a2412, motif: 'leaf', layers: 5, hem: -2.1, flare: 0.6, bell: 0.4 });
        // a bark-leather mantle over the shoulders and a collar of leaves
        const bark = d.lam(0xb8a07a, barkTex()), leaf = d.lam(0x5a9a3a, woolTex()), leaf2 = d.lam(0x3a7a2a, woolTex());
        d.rb(d.ch.torso, bark, 1.9, 0.42, 1.3, 0, 0.7, 0.02); for (const sx of [-1, 1]) d.rb(d.ch.torso, bark, 0.7, 0.3, 1.1, sx * 0.9, 0.5, 0, 0, 0, sx * 0.3);
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; d.put(d.ch.torso, BOX(), i % 2 ? leaf : leaf2, 0.34, 0.06, 0.2, Math.cos(a) * 0.72, 0.98, Math.sin(a) * 0.5, 0.5, -a, 0); }
        // a rope belt with a knot and hanging herbs
        const rope = d.lam(0xc9b27a, woolTex()); d.rb(d.ch.torso, rope, 1.52, 0.12, 1.06, 0, -0.58, 0); d.ball(d.ch.torso, rope, 0.14, 0.1, -0.58, -0.56); for (let i = 0; i < 3; i++) d.bx(d.ch.torso, i % 2 ? leaf : leaf2, 0.1, 0.5, 0.04, 0.5 + i * 0.08, -0.9, -0.52);
        // a wreath of leaves with antlers
        const wood = d.lam(0x7a5a38, barkTex());
        d.rb(d.ch.head, leaf2, 1.46, 0.14, 1.46, 0, 0.56, 0);
        for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; d.put(d.ch.head, BOX(), i % 2 ? leaf : leaf2, 0.26, 0.05, 0.16, Math.cos(a) * 0.76, 0.62, Math.sin(a) * 0.76, 0.5, -a, 0); }
        for (const sx of [-1, 1]) { d.put(d.ch.head, CONE(), wood, 0.12, 0.9, 0.12, sx * 0.5, 1.05, 0, 0, 0, -sx * 0.3); d.put(d.ch.head, CONE(), wood, 0.1, 0.5, 0.1, sx * 0.72, 1.2, -0.06, 0, 0, -sx * 0.9); d.put(d.ch.head, CONE(), wood, 0.09, 0.4, 0.09, sx * 0.4, 1.4, 0.0, 0, 0, sx * 0.5); }
    },
    frost(d) {
        const r = robe(d, { color: 0xb8cce8, trim: 0x3a5a9a, motif: 'snow', layers: 6, hem: -2.2, flare: 0.8, bell: 0.8 });
        const fur = d.lam(0xffffff, furTex()), ice = d.std(0x9fe8ff, { roughness: 0.1, metalness: 0.1, emissive: 0x2a90c0, emissiveIntensity: 0.6, flatShading: true });
        // a fur collar of fluffy balls, fur cuffs and a fur hem line
        for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; d.ball(d.ch.torso, fur, 0.26, Math.cos(a) * 0.74, 0.94, Math.sin(a) * 0.52); }
        d.rb(d.ch.torso, fur, 1.8, 0.28, 1.2, 0, 0.82, 0.02);
        for (const e of [d.ch.leftElbowAnchor, d.ch.rightElbowAnchor]) d.rb(e, fur, 0.9, 0.18, 0.9, 0, 0, d.ch.BONE_LENGTH_LOWER * 0.98, Math.PI / 2);
        d.rb(d.ch.torso, fur, 2.4, 0.24, 1.62, 0, -1.86, 0);
        // crystals on the shoulders
        for (const sx of [-1, 1]) { d.put(d.ch.torso, OCTA(), ice, 0.3, 0.8, 0.3, sx * 0.9, 1.1, 0, 0, 0, -sx * 0.25); d.put(d.ch.torso, OCTA(), ice, 0.2, 0.5, 0.2, sx * 1.12, 0.96, -0.2, 0, 0, -sx * 0.6); }
        // a circlet with a crown of ice shards
        d.rb(d.ch.head, d.std(0xdfe8f8, { metalness: 0.7, roughness: 0.3 }), 1.46, 0.12, 1.46, 0, 0.62, 0);
        for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, h = 0.7 + (i % 3) * 0.3; d.put(d.ch.head, CONE(), ice, 0.2, h, 0.2, Math.cos(a) * 0.6, 0.68 + h / 2, Math.sin(a) * 0.6, Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); }
    },
    astrologer(d) {
        const sky = skyTex();
        const r = robe(d, { color: 0x2c2f7a, trim: 0x14143a, motif: 'star', layers: 6, hem: -2.2, flare: 0.8, bell: 1, map: sky });
        const g = d.std(GOLD().color, { metalness: 0.8, roughness: 0.32 });
        const { m } = hat(d, { color: 0x2c2f7a, trim: 0x14143a, motif: 'star', brim: 2.0, high: 3.0, bend: 0.2, slim: 0.9 });
        // a gold sash across the chest with a zodiac coin, a crescent moon on the hat, a star on its tip
        d.rb(d.ch.torso, g, 0.18, 2.0, 0.06, -0.15, 0.0, -0.64, 0, 0, 0.55); d.put(d.ch.torso, DISK(), g, 0.34, 0.06, 0.34, 0.2, -0.3, -0.7, Math.PI / 2);
        d.put(d.ch.head, ARC(), g, 0.9, 0.9, 1.4, 0, 1.55, -0.62, 0, 0, Math.PI * 0.6);
        d.put(d.ch.head, OCTA(), g, 0.24, 0.24, 0.24, 0.42, 3.55, 0.12);
        // a starry lining in the sleeves' cuffs and a few small stars on a cord
        for (let i = 0; i < 5; i++) d.put(d.ch.torso, OCTA(), g, 0.1, 0.1, 0.1, -0.5 + i * 0.25, -1.1 - (i % 2) * 0.1, -0.7);
    },
};

/** The five outfits' names (the preview's captions). */
export const OUTFIT_NAMES = { archmage: 'Архимаг', fire: 'Огненный маг', druid: 'Друид', frost: 'Маг льда', astrologer: 'Звездочёт' };

/** Dress a hero (a VoxelCharacter) in one of the five outfits. */
export function dressMage(ch, kind) {
    ch._armorParts = [];
    OUTFITS[kind](new D(ch));
    return ch;
}
