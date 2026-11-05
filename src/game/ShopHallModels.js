/**
 * ShopHallModels.js — the show of the two big shops (ShopHalls.js): hundreds of small things on the shelves the keeper does not sell one by one,
 * drawn cheaply — a few InstancedMeshes for a whole hall (the author: «магазин будет упихан огромным количеством товаров»; CLAUDE.md:
 * «много одинаковых вещей — InstancedMesh»).
 *  - the potion hall: bottles of three shapes (a round flask, a square bottle, a squat jar) in many colours of glass, a cork in each, a paper
 *    label on some — 2–3 to a shelf cell, each a little different (size, turn, colour);
 *  - the scroll hall: rolled scrolls of parchment (a drawn texture: fibres, stains, a darker edge) lying in their pigeonholes, 3–5 to a hole in
 *    a little pile, their ends out, a coloured ribbon on each.
 * Shapes and materials are shared (made once); a hall's meshes are made when the hero comes near and disposed of (their instance buffers only)
 * when he goes away — ShopHallLife.
 */

import * as THREE from 'three';
import { createRng } from '../core/math.js';

let _shared = null;

/** A canvas of parchment: warm paper, fibres, faint stains, the edges darker. */
function parchmentTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const x = c.getContext('2d');
    const r = createRng(77);
    x.fillStyle = '#e8d6aa';
    x.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 900; i++) { // (the fibres)
        const v = 200 + Math.floor(r() * 50);
        x.fillStyle = `rgba(${v},${v - 18},${v - 60},${0.18 + r() * 0.2})`;
        x.fillRect(r() * 128, r() * 64, 1 + r() * 6, 1);
    }
    for (let i = 0; i < 7; i++) { // (stains)
        const g = x.createRadialGradient(0, 0, 0, 0, 0, 6 + r() * 12);
        g.addColorStop(0, 'rgba(150,110,60,0.22)'); g.addColorStop(1, 'rgba(150,110,60,0)');
        x.save(); x.translate(r() * 128, r() * 64); x.fillStyle = g; x.fillRect(-20, -20, 40, 40); x.restore();
    }
    for (let i = 0; i < 6; i++) { x.strokeStyle = `rgba(60,40,25,${0.15 + r() * 0.15})`; x.beginPath(); const y = 8 + r() * 48; x.moveTo(10, y); x.lineTo(118, y + r() * 2 - 1); x.stroke(); } // (lines of writing seen through)
    const e = x.createLinearGradient(0, 0, 0, 64);
    e.addColorStop(0, 'rgba(110,70,30,0.45)'); e.addColorStop(0.12, 'rgba(110,70,30,0)'); e.addColorStop(0.88, 'rgba(110,70,30,0)'); e.addColorStop(1, 'rgba(110,70,30,0.45)');
    x.fillStyle = e; x.fillRect(0, 0, 128, 64);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}

function lathe(points, seg) { return new THREE.LatheGeometry(points.map(([a, b]) => new THREE.Vector2(a, b)), seg); }

/** The shared shapes and materials (made once). */
export function hallShared() {
    if (_shared) return _shared;
    const flask = lathe([[0, 0], [0.09, 0.01], [0.15, 0.06], [0.17, 0.13], [0.15, 0.2], [0.09, 0.25], [0.045, 0.28], [0.045, 0.38], [0.055, 0.4], [0, 0.4]], 10);
    const bottle = lathe([[0, 0], [0.1, 0], [0.11, 0.02], [0.11, 0.26], [0.08, 0.31], [0.04, 0.34], [0.04, 0.44], [0.05, 0.46], [0, 0.46]], 4); // (four sides: a square bottle)
    const jar = lathe([[0, 0], [0.13, 0], [0.15, 0.03], [0.15, 0.17], [0.12, 0.2], [0.1, 0.21], [0.1, 0.24], [0, 0.24]], 9);
    const cork = new THREE.CylinderGeometry(0.04, 0.035, 0.07, 6); cork.translate(0, 0.035, 0);
    const label = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    const roll = new THREE.CylinderGeometry(0.1, 0.1, 0.82, 10); roll.rotateZ(Math.PI / 2);
    const ribbon = new THREE.CylinderGeometry(0.107, 0.107, 0.07, 10, 1, true); ribbon.rotateZ(Math.PI / 2);
    const paper = parchmentTexture();
    _shared = {
        shapes: [flask, bottle, jar], tops: [0.38, 0.44, 0.24], necks: [0.045, 0.04, 0.1], bellies: [0.165, 0.11, 0.15], bands: [[0.07, 0.14], [0.08, 0.2], [0.04, 0.14]],
        cork, label, roll, ribbon,
        glass: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0.05, emissive: 0x181018 }),
        corkMat: new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.95 }),
        labelMat: new THREE.MeshStandardMaterial({ color: 0xf0e2c0, roughness: 0.9, map: paper, side: THREE.DoubleSide }),
        paperMat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, map: paper }),
        ribbonMat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }),
    };
    return _shared;
}

const GLASS = [0xd23a4a, 0x3a7fd2, 0x3fc26a, 0x9b4fd2, 0xe0a23a, 0x2fc2c2, 0xe05ab0, 0x7a3a1a, 0xc8e05a, 0x5a3ad2, 0xf0f0ff, 0x1f7a4a];
const RIBBON = [0xb0242c, 0x2a4fb0, 0x2f8a3a, 0x7a2fb0, 0xd0a020, 0x202020, 0xe06a1a];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

/** The bottles of a potion hall's show: decor slots → a group of instanced meshes (or null). */
export function bottleShow(decor, seed = 1) {
    if (!decor?.length) return null;
    const S = hallShared(), r = createRng(seed >>> 0);
    const per = [[], [], []], corks = [], labels = [];
    for (const d of decor) {
        const n = 2 + (r() < 0.55 ? 1 : 0);
        for (let i = 0; i < n; i++) {
            const k = Math.floor(r() * 3), sc = 0.85 + r() * 0.45;
            const along = (i - (n - 1) / 2) * 0.3 + (r() - 0.5) * 0.08;
            // (along the shelf: across the face; a little back from its edge)
            const fx = d.face?.x || 0, fz = d.face?.z || 0;
            const x = d.x + fz * along - fx * (0.1 + r() * 0.12), z = d.z - fx * along - fz * (0.1 + r() * 0.12);
            const e = { x, y: d.y, z, k, sc, ry: r() * Math.PI * 2, col: GLASS[Math.floor(r() * GLASS.length)] };
            per[k].push(e);
            corks.push(e);
            if (r() < 0.5) labels.push(e);
        }
    }
    const g = new THREE.Group();
    per.forEach((list, k) => {
        if (!list.length) return;
        const m = new THREE.InstancedMesh(S.shapes[k], S.glass, list.length);
        list.forEach((e, i) => {
            m.setMatrixAt(i, _m.compose(_p.set(e.x, e.y, e.z), _q.setFromEuler(_e.set(0, e.ry, 0)), _s.set(e.sc, e.sc, e.sc)));
            m.setColorAt(i, _c.setHex(e.col));
        });
        g.add(m);
    });
    const ck = new THREE.InstancedMesh(S.cork, S.corkMat, corks.length);
    corks.forEach((e, i) => ck.setMatrixAt(i, _m.compose(_p.set(e.x, e.y + S.tops[e.k] * e.sc - 0.02, e.z), _q.identity(), _s.set(e.sc, e.sc, e.sc))));
    g.add(ck);
    if (labels.length) {
        const lb = new THREE.InstancedMesh(S.label, S.labelMat, labels.length);
        labels.forEach((e, i) => {
            const [b0, b1] = S.bands[e.k], rr = S.bellies[e.k] * e.sc * 1.04, hh = (b1 - b0) * e.sc;
            lb.setMatrixAt(i, _m.compose(_p.set(e.x, e.y + (b0 + b1) / 2 * e.sc, e.z), _q.setFromEuler(_e.set(0, e.ry, 0)), _s.set(rr, hh, rr)));
        });
        g.add(lb);
    }
    g.userData.instanced = true;
    return g;
}

/** The rolled scrolls of a scroll hall's pigeonholes: decor slots → a group (or null). */
export function scrollShow(decor, seed = 1) {
    if (!decor?.length) return null;
    const S = hallShared(), r = createRng(seed >>> 0);
    const rolls = [];
    for (const d of decor) {
        // a pile in the hole: a bottom row of 4, 3 in its hollows, now and then 2 more on top — the ends look out (a few stick out a little)
        const fx = d.face?.x || 0, fz = d.face?.z || 0, yaw = Math.atan2(-fz, fx);
        const rows = [4, 3, r() < 0.5 ? 2 : 0];
        rows.forEach((m, ri) => {
            for (let k = 0; k < m; k++) {
                if (r() < 0.08) continue; // (one taken: a gap)
                const across = (k - (m - 1) / 2) * 0.205 + (r() - 0.5) * 0.02;
                const out = (r() - 0.55) * 0.18;
                rolls.push({
                    x: d.x + fz * across + fx * out, z: d.z - fx * across + fz * out,
                    y: d.y + 0.1 + ri * 0.175, yaw: yaw + (r() - 0.5) * 0.12, sc: 0.9 + r() * 0.2, rib: RIBBON[Math.floor(r() * RIBBON.length)],
                });
            }
        });
    }
    const g = new THREE.Group();
    const pm = new THREE.InstancedMesh(S.roll, S.paperMat, rolls.length), rb = new THREE.InstancedMesh(S.ribbon, S.ribbonMat, rolls.length);
    rolls.forEach((e, i) => {
        _q.setFromEuler(_e.set(0, e.yaw, 0, 'YXZ'));
        pm.setMatrixAt(i, _m.compose(_p.set(e.x, e.y, e.z), _q, _s.set(e.sc, 1, 1)));
        pm.setColorAt(i, _c.setRGB(0.92 + (i % 5) * 0.02, 0.9, 0.85 - (i % 3) * 0.05));
        rb.setMatrixAt(i, _m.compose(_p.set(e.x, e.y, e.z), _q, _s.set(1, 1, 1)));
        rb.setColorAt(i, _c.setHex(e.rib));
    });
    g.add(pm, rb);
    g.userData.instanced = true;
    return g;
}

const _signs = new Map();

/** The painted plaque of a hall's sign (a canvas: the potion hall — a great flask of glowing brew; the scroll hall — an open scroll, a quill, a seal). */
function signTexture(kind) {
    if (_signs.has(kind)) return _signs.get(kind);
    if (typeof document === 'undefined') return null;
    const W = 512, H = kind === 'potions' ? 214 : 155;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d'), r = createRng(kind === 'potions' ? 3 : 4);
    const pot = kind === 'potions';
    // the board: painted wood, its grain, a worn edge
    x.fillStyle = pot ? '#2b1d3f' : '#e7d3a3';
    x.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) { x.strokeStyle = pot ? `rgba(90,60,120,${0.15 + r() * 0.2})` : `rgba(150,110,60,${0.12 + r() * 0.15})`; x.beginPath(); const y = r() * H; x.moveTo(0, y); x.bezierCurveTo(W * 0.3, y + r() * 6 - 3, W * 0.6, y + r() * 6 - 3, W, y + r() * 4 - 2); x.stroke(); }
    x.strokeStyle = '#d4a63a'; x.lineWidth = 6; x.strokeRect(9, 9, W - 18, H - 18);
    x.strokeStyle = 'rgba(255,230,150,0.6)'; x.lineWidth = 1.5; x.strokeRect(17, 17, W - 34, H - 34);
    if (pot) {
        // the flask: a round belly of glowing green, a neck, a cork, bubbles rising, a gleam
        const fx = 112, fy = 122;
        const g = x.createRadialGradient(fx - 14, fy - 10, 6, fx, fy, 60);
        g.addColorStop(0, '#d9ffb0'); g.addColorStop(0.45, '#4fe07a'); g.addColorStop(1, '#0d6a3a');
        x.fillStyle = '#cfe8ff'; x.beginPath(); x.arc(fx, fy, 62, 0, Math.PI * 2); x.fill();
        x.save(); x.beginPath(); x.arc(fx, fy, 56, 0, Math.PI * 2); x.clip(); x.fillStyle = g; x.fillRect(fx - 60, fy - 18, 120, 80); x.restore(); // (the brew: the lower part of the belly, a level surface)
        x.strokeStyle = 'rgba(220,255,200,0.9)'; x.lineWidth = 2; x.beginPath(); x.moveTo(fx - 53, fy - 18); x.lineTo(fx + 53, fy - 18); x.stroke();
        x.fillStyle = '#cfe8ff'; x.fillRect(fx - 15, fy - 100, 30, 46);
        x.fillStyle = '#8a5a32'; x.fillRect(fx - 18, fy - 112, 36, 18);
        x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); x.ellipse(fx - 28, fy - 22, 9, 20, -0.5, 0, Math.PI * 2); x.fill();
        for (let i = 0; i < 9; i++) { x.fillStyle = 'rgba(230,255,210,0.85)'; x.beginPath(); x.arc(fx - 30 + r() * 60, fy - 10 + r() * 50, 3 + r() * 5, 0, Math.PI * 2); x.fill(); }
        for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(255,240,170,${0.5 + r() * 0.5})`; const sx = 190 + r() * 300, sy = 30 + r() * 150; x.fillRect(sx, sy, 2, 2); }
    } else {
        // an open scroll: two rolled ends, lines of writing, a red seal on a ribbon; a quill across
        x.fillStyle = '#f6ead0'; x.fillRect(46, 34, 132, 92);
        for (const ex of [40, 180]) { x.fillStyle = '#d9c08a'; x.beginPath(); x.ellipse(ex, 80, 11, 50, 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#8a6a3a'; x.lineWidth = 2; x.stroke(); }
        x.strokeStyle = 'rgba(60,40,30,0.75)'; x.lineWidth = 2;
        for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(60, 50 + i * 12); x.lineTo(160 - r() * 30, 50 + i * 12); x.stroke(); }
        x.fillStyle = '#a3141c'; x.beginPath(); x.arc(150, 118, 14, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#c8242c'; x.beginPath(); x.arc(147, 115, 6, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#2a2a2a'; x.lineWidth = 3; x.beginPath(); x.moveTo(30, 140); x.lineTo(200, 20); x.stroke();
        x.fillStyle = '#f4f4f4'; x.beginPath(); x.moveTo(200, 20); x.quadraticCurveTo(160, 30, 120, 75); x.quadraticCurveTo(170, 55, 200, 20); x.fill();
    }
    // the words
    x.font = `bold ${pot ? 52 : 46}px Georgia, serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = pot ? '#f0c95a' : '#5a2a12';
    x.shadowColor = pot ? 'rgba(0,0,0,0.6)' : 'rgba(255,240,200,0.6)'; x.shadowBlur = 4;
    x.fillText(pot ? 'ЛАВКА' : 'ЛАВКА', 350, H * (pot ? 0.36 : 0.36));
    x.fillText(pot ? 'ЗЕЛИЙ' : 'СВИТКОВ', 350, H * (pot ? 0.68 : 0.7));
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    _signs.set(kind, t);
    return t;
}

/** The plaque before a hall's sign board (h.sign: its middle, the way it faces, its size). */
export function hallSign(h) {
    const s = h?.sign;
    if (!s) return null;
    const tex = signTexture(h.kind);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, color: 0xffffff }));
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = Math.atan2(s.face.x, s.face.z);
    m.userData.own = true; // (its geometry and material are its own: disposed with the show)
    return m;
}

/** Dispose of a show (its instance buffers; the shapes and materials are shared). */
export function disposeShow(g) {
    if (!g) return;
    g.parent?.remove(g);
    for (const m of g.children) {
        if (m.userData.own) { m.geometry.dispose(); m.material.dispose(); continue; } // (the sign's plaque; its painted texture is shared)
        m.dispose?.(); // (InstancedMesh.dispose: its instance attributes only)
    }
}

/** One of each for the shaders' warm-up (Game.prewarm). */
export function hallSamples() {
    const d = [{ x: 0, y: 0, z: 0, face: { x: 1, z: 0 } }];
    return [bottleShow(d, 1), scrollShow(d, 2), hallSign({ kind: 'potions', sign: { x: 0, y: 0, z: 0, face: { x: 0, z: 1 }, w: 1, h: 1 } })].filter(Boolean);
}
