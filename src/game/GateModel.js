/**
 * GateModel.js — the forged-iron gates of a castle's keep (world generation 14, GATE_METAL_FROM_GEN in Terrain.js).
 * The author: «ворота замка — не деревянные, а металлические». Two leaves of black forged iron: a frame of stiles and rails, a
 * grille of bars under spear points, a riveted iron plate below with a diagonal brace, long hinge straps, a lock plate and a ring.
 * Every gate is a little different (`vari` 0..3 from the castle's id): the tone of the iron, how much rust it has, where the rust
 * runs, how many bars, the spear points or knobs. Pieces of one material are ONE shape (one draw each — four a leaf); the shapes
 * are shared (the same unit boxes / rivets / cones), the iron texture is drawn once for each of the four variants.
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

export const GATE_VARIANTS = 4;

const _box = new THREE.BoxGeometry(1, 1, 1);
const _rivet = new THREE.SphereGeometry(0.065, 5, 3);
const _spear = new THREE.ConeGeometry(0.1, 0.42, 4);
const _knob = new THREE.SphereGeometry(0.13, 6, 4);
const _ring = new THREE.TorusGeometry(0.2, 0.04, 6, 16);
const _boss = new THREE.CylinderGeometry(0.16, 0.2, 0.09, 8);

const IRON = [0x34363b, 0x403b36, 0x2f353a, 0x463f3a]; // (blue-black, brown-black, slate, warm black)
const RUST = [0x42251a, 0x3a2111, 0x48290f, 0x331e0e]; // (dark, dull rust: the bright orange of a fresh patch looked like boards)
const RUST_AMOUNT = [0.45, 0.8, 0.3, 1];

const _mats = {};
const _tex = [];
const _geo = new Map(); // (the merged shapes of a leaf: the same for every gate of its look and size — at most 4 looks × 2 sizes × 2 hands × 5 shapes; shared, never disposed)
const merged = (key, parts) => { let g = _geo.get(key); if (!g) { g = mergeParts(parts); g.userData.shared = true; _geo.set(key, g); } return g; };

/** A small deterministic random (a gate's look comes from its variant and size, nothing else). */
function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The plate's texture: dark iron with grain, scratches, hammer dimples, seams and runs of rust (drawn once a variant). */
function plateTexture(vari) {
    if (_tex[vari] !== undefined) return _tex[vari];
    if (typeof document === 'undefined') return (_tex[vari] = null);
    const S = 256, c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const r = rng(1000 + vari);
    const base = new THREE.Color(IRON[vari]);
    g.fillStyle = '#' + base.getHexString();
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) { // grain: small flecks lighter and darker
        const l = r() < 0.5;
        g.fillStyle = l ? `rgba(120,125,135,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.1})`;
        g.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 2);
    }
    for (let i = 0; i < 70; i++) { // brushed scratches along the plate
        const x = r() * S, y = r() * S, len = 10 + r() * 60;
        g.strokeStyle = `rgba(170,175,185,${0.05 + r() * 0.12})`;
        g.lineWidth = 0.6 + r() * 0.6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y + len); g.stroke();
    }
    for (let i = 0; i < 38; i++) { // hammer dimples
        const x = r() * S, y = r() * S, rad = 3 + r() * 5;
        const gr = g.createRadialGradient(x - 1, y - 1, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.05)'); gr.addColorStop(1, 'rgba(150,155,165,0.14)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; // seams between the plates
    for (const y of [S * 0.34, S * 0.68]) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
    g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke();
    const rustC = new THREE.Color(RUST[vari]);
    const blotches = Math.round(8 + 14 * RUST_AMOUNT[vari]);
    for (let i = 0; i < blotches; i++) { // rust: soft blotches and runs below them
        const x = r() * S, y = r() * S * 0.8, rad = 8 + r() * 26;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(${rustC.r * 255 | 0},${rustC.g * 255 | 0},${rustC.b * 255 | 0},${0.5 + r() * 0.3})`);
        gr.addColorStop(1, 'rgba(110,60,25,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
        g.fillStyle = `rgba(${rustC.r * 255 | 0},${rustC.g * 255 | 0},${rustC.b * 255 | 0},0.35)`;
        g.fillRect(x + (r() - 0.5) * rad, y, 1.5 + r() * 2, rad * (1 + r() * 2.5));
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return (_tex[vari] = t);
}

function mats(vari) {
    return _mats[vari] || (_mats[vari] = {
        iron: new THREE.MeshStandardMaterial({ color: IRON[vari], metalness: 0.78, roughness: 0.52 }),
        steel: new THREE.MeshStandardMaterial({ color: 0x80858f, metalness: 0.92, roughness: 0.34 }), // (rivets, straps' edges: worn bright)
        rust: new THREE.MeshLambertMaterial({ color: RUST[vari] }),
        plate: new THREE.MeshStandardMaterial({ color: 0xffffff, map: plateTexture(vari), metalness: 0.7, roughness: 0.6 }),
    });
}

/**
 * One leaf of the gate, hung on a hinge group like every door (Doors.doorModel): `W` wide, `H` high, the hinge on the left
 * (right when `mirror`). Returns the same group as doorModel: userData { hinge, knob, knob2, mirror }.
 */
export function forgedGateModel({ mirror = false, w: W = 3, h: H = 7, vari = 0 } = {}) {
    vari = ((vari | 0) % GATE_VARIANTS + GATE_VARIANTS) % GATE_VARIANTS;
    const M = mats(vari), m = mirror ? -1 : 1;
    const r = rng(vari * 977 + Math.round(W * 10) * 31 + Math.round(H));
    const gk = `${vari}|${W}|${H}|${mirror ? 1 : 0}|`;
    const g = new THREE.Group();
    const hinge = new THREE.Group();
    hinge.position.set(-m * W / 2, 0, 0);
    g.add(hinge);
    const iron = [], steel = [], rust = [];
    // (x measured from the hinge edge 0 … W, put on the leaf's side by m)
    const box = (list, x0, x1, y0, y1, z0, z1, rz = 0) => list.push({ geo: _box, pos: [m * (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], rot: [0, 0, rz], scale: [x1 - x0, y1 - y0, z1 - z0] });
    const bolt = (x, y) => { for (const z of [-0.2, 0.2]) steel.push({ geo: _rivet, pos: [m * x, y, z], scale: [1, 1, 0.8] }); };
    const ST = 0.3, RAIL = 0.32, DEEP = 0.34; // stiles' width, rails' height, the frame's depth
    const yLow = H * 0.36, yMid = H * 0.68;
    // ---- the frame: stiles, top and bottom rails, two cross rails (their ends held by plates)
    box(iron, 0, ST, 0, H, -DEEP / 2, DEEP / 2); box(iron, W - ST, W, 0, H, -DEEP / 2, DEEP / 2);
    box(iron, ST, W - ST, H - RAIL, H, -DEEP / 2, DEEP / 2); box(iron, ST, W - ST, 0, RAIL, -DEEP / 2, DEEP / 2);
    for (const y of [yLow, yMid]) box(iron, ST, W - ST, y - 0.13, y + 0.13, -DEEP / 2 + 0.03, DEEP / 2 - 0.03);
    // ---- the grille: round-looking bars between the rails (a different number of them gate to gate), the middle ones with a ring boss
    const bars = Math.max(4, Math.round((W - 2 * ST - 0.3) / (0.4 + 0.05 * (vari % 2))));
    const gap = (W - 2 * ST) / (bars + 1);
    for (let k = 1; k <= bars; k++) {
        const x = ST + gap * k;
        box(iron, x - 0.055, x + 0.055, yMid + 0.13, H - RAIL, -0.055, 0.055);
        box(iron, x - 0.055, x + 0.055, yLow + 0.13, yMid - 0.13, -0.055, 0.055);
        if (vari % 2 === 0 || k % 2) steel.push({ geo: _spear, pos: [m * x, H - RAIL + 0.1 + 0.21 + 0.08, 0], rot: [0, Math.PI / 4, 0] }); // (spear points over the top rail)
        else steel.push({ geo: _knob, pos: [m * x, H - RAIL + 0.13, 0] });
        if (k % 2 === 0) steel.push({ geo: _boss, pos: [m * x, (yLow + yMid) / 2, 0.0], rot: [Math.PI / 2, 0, 0], scale: [0.6, 3, 0.6] }); // (a collar round the bar, once in two)
    }
    for (const x of [0, W - ST]) { // the stiles' finials
        steel.push({ geo: _knob, pos: [m * (x + ST / 2), H + 0.1, 0], scale: [1.1, 1.1, 1.1] });
        steel.push({ geo: _spear, pos: [m * (x + ST / 2), H + 0.42, 0], rot: [0, Math.PI / 4, 0], scale: [1.2, 1.3, 1.2] });
    }
    // ---- the plate under the lower cross rail: an iron sheet in the frame with a riveted border and a diagonal brace
    const plate = new THREE.Mesh(merged(gk + 'plate', [{ geo: _box, pos: [m * W / 2, (RAIL + yLow - 0.13) / 2, 0], scale: [W - 2 * ST + 0.04, yLow - 0.13 - RAIL, 0.12] }]), M.plate);
    plate.castShadow = true;
    hinge.add(plate);
    const py0 = RAIL, py1 = yLow - 0.13, ph = py1 - py0;
    const diagLen = Math.hypot(W - 2 * ST, ph), diagA = Math.atan2(ph, (W - 2 * ST) * (mirror ? -1 : 1));
    iron.push({ geo: _box, pos: [m * W / 2, (py0 + py1) / 2, 0], rot: [0, 0, diagA], scale: [diagLen * 0.97, 0.2, 0.3] });
    for (let t = 0.1; t < 0.95; t += 0.1) { // rivets down the brace
        const x = ST + (W - 2 * ST) * t, y = py0 + ph * t;
        bolt(x, y);
    }
    // ---- rivets along the stiles and rails (front and back)
    for (let y = 0.35; y < H - 0.2; y += 0.55) { bolt(ST / 2, y); bolt(W - ST / 2, y); }
    for (let x = ST + 0.4; x < W - ST - 0.2; x += 0.5) { bolt(x, RAIL / 2); bolt(x, H - RAIL / 2); }
    for (const y of [yLow, yMid]) for (let x = ST + 0.3; x < W - ST - 0.1; x += 0.6) bolt(x, y);
    // ---- hinge straps (three, long, with round ends) and the lock plate on the free edge
    for (const y of [H * 0.14, H * 0.52, H * 0.88]) {
        box(iron, 0, Math.min(W * 0.45, 1.5), y - 0.14, y + 0.14, -DEEP / 2 - 0.05, DEEP / 2 + 0.05);
        steel.push({ geo: _boss, pos: [m * Math.min(W * 0.45, 1.5), y, -DEEP / 2 - 0.06], rot: [Math.PI / 2, 0, 0], scale: [0.9, 0.6, 0.9] });
        steel.push({ geo: _boss, pos: [m * Math.min(W * 0.45, 1.5), y, DEEP / 2 + 0.06], rot: [Math.PI / 2, 0, 0], scale: [0.9, 0.6, 0.9] });
        bolt(0.35, y); bolt(Math.min(W * 0.45, 1.5) * 0.6, y);
    }
    const ly = H * 0.44;
    box(steel, W - ST - 0.3, W - 0.02, ly - 0.32, ly + 0.32, -DEEP / 2 - 0.03, DEEP / 2 + 0.03);
    box(iron, W - ST - 0.12, W - ST - 0.04, ly - 0.18, ly + 0.02, -DEEP / 2 - 0.05, DEEP / 2 + 0.05); // (the keyhole)
    // ---- rust: patches on the plate and the bars' feet, runs under the rivets (more or less by variant)
    const nRust = Math.round(3 + 6 * RUST_AMOUNT[vari]);
    for (let i = 0; i < nRust; i++) {
        const x0 = ST + r() * (W - 2 * ST - 0.6), y0 = py0 + r() * (ph - 0.5), w = 0.15 + r() * 0.45, h = 0.12 + r() * 0.35;
        for (const z of [-0.075, 0.075]) box(rust, x0, Math.min(W - ST, x0 + w), y0, Math.min(py1, y0 + h), z - 0.006, z + 0.006);
    }
    for (let i = 0; i < nRust; i++) { // runs: a thin streak hanging from a rail or a rivet
        const x = ST + 0.2 + r() * (W - 2 * ST - 0.4), len = 0.4 + r() * 1.3, y0 = r() < 0.5 ? yLow - 0.13 - len : yMid - 0.13 - len;
        for (const z of [-DEEP / 2 - 0.004, DEEP / 2 + 0.004]) box(rust, x, x + 0.04 + r() * 0.03, y0, y0 + len, z - 0.003, z + 0.003);
    }
    for (let i = 0; i < Math.round(3 + 4 * RUST_AMOUNT[vari]); i++) { // rust at the feet of the stiles
        const x = r() < 0.5 ? 0 : W - ST;
        box(rust, x, x + ST, 0, 0.15 + r() * 0.5, -DEEP / 2 - 0.004, DEEP / 2 + 0.004);
    }
    const mesh = (parts, mat, shadow, label) => { if (!parts.length) return; const o = new THREE.Mesh(merged(gk + label, parts), mat); o.castShadow = shadow; hinge.add(o); };
    mesh(iron, M.iron, true, 'iron');
    mesh(steel, M.steel, false, 'steel');
    mesh(rust, M.rust, false, 'rust');
    // ---- the ring handles (both faces; the hand takes the ring)
    const kx = m * (W - ST - 0.45), ky = H * 0.48, kz = DEEP / 2 + 0.16;
    mesh([{ geo: _ring, pos: [kx, ky, -kz], rot: [0, 0, 0] }, { geo: _ring, pos: [kx, ky, kz] },
        { geo: _boss, pos: [kx, ky + 0.2, -kz + 0.1], rot: [Math.PI / 2, 0, 0] }, { geo: _boss, pos: [kx, ky + 0.2, kz - 0.1], rot: [Math.PI / 2, 0, 0] }], M.iron, false, 'rings');
    const knob = new THREE.Object3D();
    knob.position.set(kx, ky, -kz);
    hinge.add(knob);
    const knob2 = new THREE.Object3D();
    knob2.position.set(kx, ky, kz);
    hinge.add(knob2);
    g.userData = { hinge, knob, knob2, mirror, forged: true };
    return g;
}

/** The gate's look (0…3) of a castle: from its id, so every client builds the same gate. */
export function gateVariant(id) {
    let h = 7;
    for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % GATE_VARIANTS;
}
