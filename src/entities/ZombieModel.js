/**
 * ZombieModel.js — the zombie's look, drawn from scratch (the author 19.11: «переделать полностью скин зомби с нуля… с хорошим
 * скином и другими анимациями… крутой зомби»). Pure THREE + a canvas (no canvas in Node — the tests — then plain colours).
 *
 * The body is the same size as it always was (so every blade, blast and hit test still lands where it did): head 1.2 over the
 * origin +2.1, torso 1.2 × 1.5 × 0.8, arms 1.2 long hanging from the shoulder at y 1.4, legs 1.2 long from the hips — but now
 * each part is a set of small boxes merged into ONE geometry with an atlas texture painted on a canvas once (rotten skin,
 * veins, bruises, stitches, torn clothes, blood, dirt…), so a zombie costs the same number of draw calls as before:
 *   head (skull + cheeks + nose + ears + hair + neck) + a loose JAW on its own hinge, torso, two arms (upper arm, then a
 *   forearm on an ELBOW with a clawed hand), two legs (thigh, then a shin on a KNEE with a boot).
 * Six looks (`zombieLook(id)`): the labourer, the hoodie, the clerk, the farmer, the rags, the miner — skin tone, clothes,
 * hair, wounds differ; the same zombie always looks the same (the seed is its look).
 * All geometry and textures are shared (cached by look); a zombie only owns four small materials (for the hit flash / ice tint).
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

export const ZOMBIE_LOOKS = 6;
/** Which of the looks this zombie wears (a number or a string id). */
export function zombieLook(id) {
    let h = 2166136261;
    const s = String(id);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % ZOMBIE_LOOKS;
}

// ------------------------------------------------------------------ the looks
const LOOKS = [
    { name: 'labourer', skin: '#7f9a6c', dark: '#4d6240', hair: '#2b2118', shirt: { kind: 'plaid', a: '#6a3b2a', b: '#3a2118' }, pants: '#2c3138', boots: '#3a2a1e', bone: 0, wound: 'ribs' },
    { name: 'hoodie', skin: '#8aa3a0', dark: '#4f6664', hair: '#171717', shirt: { kind: 'plain', a: '#55606b', b: '#2e353c' }, pants: '#2f4a73', boots: '#d9d9d2', bone: 1, wound: 'bite' },
    { name: 'clerk', skin: '#a3a56a', dark: '#6b6d3c', hair: null, shirt: { kind: 'shirt', a: '#cfcab7', b: '#7a1f1f' }, pants: '#262a31', boots: '#16110e', bone: 0, wound: 'jaw' },
    { name: 'farmer', skin: '#9b9a6f', dark: '#5f5f3f', hair: '#6b5a34', shirt: { kind: 'overalls', a: '#3f5f8a', b: '#a8352b' }, pants: '#3f5f8a', boots: '#5a4326', bone: 0, wound: 'scalp' },
    { name: 'rags', skin: '#7c8f84', dark: '#3f5148', hair: '#3a3a35', shirt: { kind: 'rags', a: '#6e6252', b: '#3b342b' }, pants: '#4a4036', boots: null, bone: 1, wound: 'ribs' },
    { name: 'miner', skin: '#8d7f62', dark: '#53482f', hair: '#201b16', shirt: { kind: 'vest', a: '#b6a02d', b: '#5d4f1c' }, pants: '#33322c', boots: '#2a2118', bone: 0, wound: 'bite' },
];

// ------------------------------------------------------------------ random + painting helpers
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const hex = (c) => c;
const mix = (a, b, k) => {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - k) + ((pb >> 16) & 255) * k), g = Math.round(((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k), bl = Math.round((pa & 255) * (1 - k) + (pb & 255) * k);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
};
const rgba = (c, a) => { const n = parseInt(c.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

// ------------------------------------------------------------------ atlas: which box face lies where on a part's texture
const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz']; // the order of THREE.BoxGeometry's faces: +x −x +y −y +z(front) −z(back)

/** Lays the faces of a list of boxes [{name, w, h, d}] on an S × S canvas, shelf by shelf. → {rects: {name: {face: [x,y,w,h]}}} */
function packAtlas(S, boxes) {
    for (let px = 90; px >= 24; px -= 4) {
        const rects = {};
        let x = 0, y = 0, rowH = 0, ok = true;
        for (const b of boxes) {
            const dims = { px: [b.d, b.h], nx: [b.d, b.h], py: [b.w, b.d], ny: [b.w, b.d], pz: [b.w, b.h], nz: [b.w, b.h] };
            rects[b.name] = {};
            for (const f of FACES) {
                const w = Math.max(6, Math.round(dims[f][0] * px)), h = Math.max(6, Math.round(dims[f][1] * px));
                if (x + w > S) { x = 0; y += rowH + 1; rowH = 0; }
                if (y + h > S) { ok = false; break; }
                rects[b.name][f] = [x, y, w, h];
                x += w + 1; rowH = Math.max(rowH, h);
            }
            if (!ok) break;
        }
        if (ok) return { S, rects };
    }
    throw new Error('zombie atlas does not fit');
}

/** A box geometry whose six faces show the atlas rects of `name`; at `pos` (the box's centre). */
function atlasBox(atlas, name, w, h, d, pos, rot = null) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, S = atlas.S, R = atlas.rects[name];
    for (let f = 0; f < 6; f++) {
        const [rx, ry, rw, rh] = R[FACES[f]];
        for (let k = 0; k < 4; k++) {
            const i = f * 4 + k, u = uv.getX(i), v = uv.getY(i);
            uv.setXY(i, (rx + u * rw) / S, 1 - (ry + (1 - v) * rh) / S);
        }
    }
    return { geo: g, pos, rot: rot || [0, 0, 0] };
}

// ------------------------------------------------------------------ the parts' boxes (the same list lays out the atlas and builds the geometry)
const HEAD_BOXES = [
    { name: 'skull', w: 1.16, h: 0.84, d: 1.14, at: [0, 0.17, 0] },
    { name: 'cheek', w: 1.0, h: 0.34, d: 1.0, at: [0, -0.3, 0.02] },
    { name: 'brow', w: 1.0, h: 0.12, d: 0.14, at: [0, 0.27, 0.58] },
    { name: 'nose', w: 0.2, h: 0.26, d: 0.18, at: [0, -0.02, 0.62] },
    { name: 'earL', w: 0.1, h: 0.34, d: 0.2, at: [-0.62, 0.02, -0.05] },
    { name: 'earR', w: 0.1, h: 0.26, d: 0.2, at: [0.62, -0.02, -0.05] },
    { name: 'neck', w: 0.46, h: 0.34, d: 0.42, at: [0, -0.62, -0.08] },
    { name: 'hairTop', w: 1.2, h: 0.1, d: 1.0, at: [0, 0.63, -0.08] },
    { name: 'hairBack', w: 1.2, h: 0.5, d: 0.12, at: [0, 0.3, -0.62] },
    { name: 'hairSide', w: 0.1, h: 0.4, d: 0.8, at: [-0.62, 0.34, -0.1] },
];
const JAW_BOXES = [
    { name: 'jaw', w: 0.92, h: 0.26, d: 0.96, at: [0, -0.13, 0.46] },
    { name: 'chin', w: 0.6, h: 0.12, d: 0.12, at: [0, -0.2, 0.96] },
];
const TORSO_BOXES = [
    { name: 'chest', w: 1.2, h: 0.96, d: 0.8, at: [0, 0.3, 0] },
    { name: 'belly', w: 1.02, h: 0.62, d: 0.72, at: [0, -0.5, 0] },
    { name: 'shoulderL', w: 0.4, h: 0.3, d: 0.6, at: [-0.66, 0.64, 0] },
    { name: 'shoulderR', w: 0.4, h: 0.3, d: 0.6, at: [0.66, 0.64, 0] },
    { name: 'collar', w: 0.7, h: 0.14, d: 0.5, at: [0, 0.8, 0.02] },
    { name: 'hem1', w: 0.34, h: 0.34, d: 0.04, at: [-0.34, -0.9, 0.38] },
    { name: 'hem2', w: 0.3, h: 0.46, d: 0.04, at: [0.04, -0.95, 0.38] },
    { name: 'hem3', w: 0.34, h: 0.28, d: 0.04, at: [0.38, -0.87, 0.38] },
    { name: 'hem4', w: 0.5, h: 0.38, d: 0.04, at: [-0.2, -0.92, -0.38] },
    { name: 'hem5', w: 0.4, h: 0.3, d: 0.04, at: [0.28, -0.88, -0.38] },
    { name: 'spine1', w: 0.14, h: 0.1, d: 0.1, at: [0, 0.52, -0.43] },
    { name: 'spine2', w: 0.14, h: 0.1, d: 0.1, at: [0, 0.22, -0.43] },
    { name: 'spine3', w: 0.14, h: 0.1, d: 0.1, at: [0, -0.1, -0.41] },
];
const ARM_BOXES = [
    { name: 'upper', w: 0.42, h: 0.62, d: 0.42, at: [0, 0.31, 0] },
    { name: 'cuff', w: 0.46, h: 0.08, d: 0.46, at: [0, 0.02, 0] },
];
const FORE_BOXES = [
    { name: 'elbow', w: 0.3, h: 0.16, d: 0.3, at: [0, -0.02, 0] },
    { name: 'fore', w: 0.34, h: 0.5, d: 0.34, at: [0, -0.28, 0] },
    { name: 'hand', w: 0.34, h: 0.2, d: 0.16, at: [0, -0.62, 0] },
    { name: 'f1', w: 0.06, h: 0.2, d: 0.06, at: [-0.12, -0.78, 0.04] },
    { name: 'f2', w: 0.06, h: 0.24, d: 0.06, at: [-0.04, -0.8, 0.04] },
    { name: 'f3', w: 0.06, h: 0.22, d: 0.06, at: [0.04, -0.79, 0.04] },
    { name: 'f4', w: 0.06, h: 0.18, d: 0.06, at: [0.12, -0.77, 0.04] },
    { name: 'thumb', w: 0.07, h: 0.14, d: 0.06, at: [0.2, -0.66, 0.07] },
];
const LEG_BOXES = [
    { name: 'thigh', w: 0.52, h: 0.64, d: 0.52, at: [0, 0.3, 0] },
    { name: 'knee', w: 0.46, h: 0.14, d: 0.46, at: [0, -0.02, 0.0] },
];
const SHIN_BOXES = [
    { name: 'shin', w: 0.44, h: 0.36, d: 0.44, at: [0, -0.18, 0] },
    { name: 'boot', w: 0.5, h: 0.22, d: 0.66, at: [0, -0.42, 0.08] },
    { name: 'sole', w: 0.5, h: 0.05, d: 0.7, at: [0, -0.555, 0.08] },
];

// (one texture and one atlas per BODY part — the head with its jaw, the torso, the arm with its forearm and hand, the leg with its shin and boot —
// so a zombie owns four materials; the geometries stay separate where a joint turns)
const ATLAS_BOXES = { head: [...HEAD_BOXES, ...JAW_BOXES], torso: TORSO_BOXES, arm: [...ARM_BOXES, ...FORE_BOXES], leg: [...LEG_BOXES, ...SHIN_BOXES] };
const ATLAS_SIZE = { head: 512, torso: 256, arm: 256, leg: 256 };
const ATLAS = {};
function atlasOf(part) {
    if (ATLAS[part]) return ATLAS[part];
    return (ATLAS[part] = packAtlas(ATLAS_SIZE[part], ATLAS_BOXES[part]));
}
const GEO_OF = { skull: ['head', HEAD_BOXES], jaw: ['head', JAW_BOXES], torso: ['torso', TORSO_BOXES], upper: ['arm', ARM_BOXES], fore: ['arm', FORE_BOXES], thigh: ['leg', LEG_BOXES], shin: ['leg', SHIN_BOXES] };

const GEO = {};
/** The merged, shared geometry of a jointed piece: skull, jaw, torso, upper, fore, thigh, shin. */
export function zombiePartGeo(piece) {
    if (GEO[piece]) return GEO[piece];
    const [atlasPart, boxes] = GEO_OF[piece];
    const at = atlasOf(atlasPart);
    const g = mergeParts(boxes.map((b) => atlasBox(at, b.name, b.w, b.h, b.d, b.at)));
    g.userData.shared = true; g.userData.keep = true;
    return (GEO[piece] = g);
}

// ------------------------------------------------------------------ painting
/** Fills a rect with a vertical gradient, then speckles it. */
function paintBase(ctx, r, c0, c1, R, speck = 1) {
    const [x, y, w, h] = r;
    const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
    const n = Math.round(w * h * 0.06 * speck);
    for (let i = 0; i < n; i++) {
        ctx.fillStyle = R() < 0.5 ? 'rgba(0,0,0,' + (0.04 + R() * 0.12) + ')' : 'rgba(255,255,255,' + (0.03 + R() * 0.08) + ')';
        const s = R() < 0.9 ? 1 : 2;
        ctx.fillRect(x + R() * w, y + R() * h, s, s);
    }
}
function blotch(ctx, x, y, rx, ry, color, a) {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    gr.addColorStop(0, rgba(color, a)); gr.addColorStop(1, rgba(color, 0));
    ctx.save(); ctx.translate(x, y); ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); ctx.translate(-x, -y);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function veins(ctx, r, R, color, n, a = 0.5) {
    const [x, y, w, h] = r;
    ctx.strokeStyle = rgba(color, a); ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
        let px = x + R() * w, py = y + R() * h;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let k = 0; k < 5; k++) { px += (R() - 0.5) * w * 0.25; py += (R() * 0.5 + 0.1) * h * 0.18; ctx.lineTo(Math.max(x, Math.min(x + w, px)), Math.min(y + h, py)); }
        ctx.stroke();
    }
}
function blood(ctx, r, R, n, color = '#5a0d0d') {
    const [x, y, w, h] = r;
    for (let i = 0; i < n; i++) {
        const px = x + R() * w, py = y + R() * h * 0.7, len = (0.1 + R() * 0.3) * h;
        ctx.fillStyle = rgba(color, 0.55 + R() * 0.35);
        ctx.fillRect(px, py, 1 + R() * 1.5, len);
        ctx.beginPath(); ctx.arc(px + 0.5, py + len, 1.4 + R(), 0, Math.PI * 2); ctx.fill();
        if (R() < 0.5) blotch(ctx, px, py, 3 + R() * 5, 3 + R() * 5, color, 0.5);
    }
}
function stitches(ctx, x0, y0, x1, y1, color = '#1b1410') {
    const n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 4));
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    const dx = (x1 - x0) / n, dy = (y1 - y0) / n, nx = -dy / Math.hypot(dx, dy) * 2.2, ny = dx / Math.hypot(dx, dy) * 2.2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(x0 + dx * i - nx, y0 + dy * i - ny); ctx.lineTo(x0 + dx * i + nx, y0 + dy * i + ny); ctx.stroke(); }
}
/** A ragged hole: what lies under (flesh, a rib cage, bare skin) shows through the cloth. */
function tear(ctx, cx, cy, rw, rh, R, under, edge = '#1a1410') {
    const pts = [];
    const n = 9;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, k = 0.6 + R() * 0.55; pts.push([cx + Math.cos(a) * rw * k, cy + Math.sin(a) * rh * k]); }
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.fillStyle = under; ctx.fill();
    ctx.strokeStyle = rgba(edge, 0.8); ctx.lineWidth = 1.5; ctx.stroke();
    blotch(ctx, cx, cy, rw * 0.9, rh * 0.9, '#000000', 0.25);
}
function edgeShade(ctx, r, a = 0.35) {
    const [x, y, w, h] = r;
    for (const [gx0, gy0, gx1, gy1, rx, ry, rw, rh] of [[x, 0, x + 8, 0, x, y, 8, h], [x + w, 0, x + w - 8, 0, x + w - 8, y, 8, h], [0, y, 0, y + 8, x, y, w, 8], [0, y + h, 0, y + h - 8, x, y + h - 8, w, 8]]) {
        const gr = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        gr.addColorStop(0, 'rgba(0,0,0,' + a + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.fillRect(rx, ry, rw, rh);
    }
}
function plaid(ctx, r, c1, c2, step) {
    const [x, y, w, h] = r;
    ctx.fillStyle = rgba(c2, 0.6);
    for (let i = 0; i < w; i += step) ctx.fillRect(x + i, y, Math.max(2, step * 0.3), h);
    for (let j = 0; j < h; j += step) ctx.fillRect(x, y + j, w, Math.max(2, step * 0.3));
    ctx.fillStyle = rgba('#000000', 0.18);
    for (let i = step / 2; i < w; i += step) ctx.fillRect(x + i, y, 1, h);
}
function fabric(ctx, r, base, dark, R) {
    paintBase(ctx, r, base, dark, R, 0.6);
    const [x, y, w, h] = r;
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
    for (let j = 0; j < h; j += 3) { ctx.beginPath(); ctx.moveTo(x, y + j + 0.5); ctx.lineTo(x + w, y + j + 0.5); ctx.stroke(); }
}
function dirt(ctx, r, R, n = 6, color = '#2a1f14') { const [x, y, w, h] = r; for (let i = 0; i < n; i++) blotch(ctx, x + R() * w, y + R() * h, 4 + R() * 12, 4 + R() * 12, color, 0.12 + R() * 0.2); }
function clipTo(ctx, r, fn) { ctx.save(); ctx.beginPath(); ctx.rect(r[0], r[1], r[2], r[3]); ctx.clip(); fn(); ctx.restore(); }
function teeth(ctx, x, y, w, h, R, n, color = '#cfc6a3') {
    const tw = w / n;
    for (let i = 0; i < n; i++) {
        if (R() < 0.12) continue; // a tooth lost
        ctx.fillStyle = mix(color, '#6b5a2e', R() * 0.5);
        const th = h * (0.7 + R() * 0.3);
        ctx.fillRect(x + i * tw + 0.5, y, Math.max(1, tw - 1), th);
    }
}

function paintPart(ctx, part, L, variant, R, atlasName = part) {
    const at = atlasOf(atlasName), rects = at.rects;
    const skin = L.skin, dark = L.dark;
    const skinFace = (r, tint = 0) => { paintBase(ctx, r, mix(skin, '#ffffff', 0.04 + tint), mix(skin, dark, 0.45), R); veins(ctx, r, R, mix(dark, '#2a1038', 0.5), 4, 0.35); dirt(ctx, r, R, 3, '#2a2416'); };
    if (part === 'head') {
        for (const f of FACES) {
            clipTo(ctx, rects.skull[f], () => skinFace(rects.skull[f]));
            clipTo(ctx, rects.cheek[f], () => skinFace(rects.cheek[f], -0.02));
            clipTo(ctx, rects.nose[f], () => skinFace(rects.nose[f], 0.02));
            clipTo(ctx, rects.neck[f], () => { skinFace(rects.neck[f], -0.04); veins(ctx, rects.neck[f], R, '#3a1f2f', 3, 0.5); });
            for (const e of ['earL', 'earR']) clipTo(ctx, rects[e][f], () => { skinFace(rects[e][f], 0.03); blotch(ctx, rects[e][f][0] + 4, rects[e][f][1] + 8, 6, 8, '#7a2020', 0.4); });
            for (const h of ['hairTop', 'hairBack', 'hairSide', 'brow']) clipTo(ctx, rects[h][f], () => {
                const r = rects[h][f];
                if (h === 'brow') { skinFace(r, -0.06); blotch(ctx, r[0] + r[2] / 2, r[1] + r[3] / 2, r[2] * 0.5, r[3] * 0.6, '#1c1020', 0.4); return; }
                if (L.hair) { paintBase(ctx, r, L.hair, mix(L.hair, '#000000', 0.5), R, 0.4); ctx.strokeStyle = rgba(mix(L.hair, '#ffffff', 0.25), 0.4); for (let i = 0; i < r[2] / 2; i++) { const px = r[0] + R() * r[2]; ctx.beginPath(); ctx.moveTo(px, r[1]); ctx.lineTo(px + (R() - 0.5) * 3, r[1] + r[3]); ctx.stroke(); } }
                else { skinFace(r, -0.08); blotch(ctx, r[0] + r[2] * 0.4, r[1] + r[3] * 0.5, r[2] * 0.3, r[3] * 0.4, '#4a1a1a', 0.5); }
            });
        }
        // the front of the skull: brow shadow, sunken sockets, a scab, a bruise
        const F = rects.skull.pz;
        clipTo(ctx, F, () => {
            blotch(ctx, F[0] + F[2] * 0.5, F[1] + F[3] * 0.18, F[2] * 0.45, F[3] * 0.1, '#1a1020', 0.3);
            for (const sx of [0.276, 0.724]) {
                const ex = F[0] + F[2] * sx, ey = F[1] + F[3] * 0.585;
                blotch(ctx, ex, ey, F[2] * 0.14, F[3] * 0.17, '#0a0610', 0.95);
                blotch(ctx, ex, ey + F[3] * 0.1, F[2] * 0.13, F[3] * 0.08, '#3a2a4a', 0.5); // the bag under the eye
            }
            blotch(ctx, F[0] + F[2] * 0.18, F[1] + F[3] * 0.25, 9, 6, '#4a1b46', 0.5); // a bruise
            if (L.wound === 'scalp') { tear(ctx, F[0] + F[2] * 0.7, F[1] + F[3] * 0.12, 10, 5, R, '#6b1414'); }
            blood(ctx, [F[0], F[1], F[2], F[3] * 0.8], R, 2);
            ctx.fillStyle = 'rgba(40,10,10,0.6)'; ctx.fillRect(F[0] + F[2] * 0.55, F[1] + F[3] * 0.62, 1, F[3] * 0.3); // a tear of blood from an eye
        });
        const T = rects.skull.py;
        clipTo(ctx, T, () => { if (!L.hair) { tear(ctx, T[0] + T[2] * 0.35, T[1] + T[3] * 0.5, T[2] * 0.25, T[3] * 0.2, R, '#7a2a24'); stitches(ctx, T[0] + T[2] * 0.15, T[1] + T[3] * 0.3, T[0] + T[2] * 0.85, T[1] + T[3] * 0.62); } });
        const Bk = rects.skull.nz;
        clipTo(ctx, Bk, () => { if (L.wound === 'scalp') { tear(ctx, Bk[0] + Bk[2] * 0.5, Bk[1] + Bk[3] * 0.4, 14, 10, R, '#5a1717'); } else stitches(ctx, Bk[0] + Bk[2] * 0.3, Bk[1] + Bk[3] * 0.2, Bk[0] + Bk[2] * 0.7, Bk[1] + Bk[3] * 0.7); });
        // the cheeks: the cracked lips, the upper teeth, the mouth cavity
        const C = rects.cheek.pz;
        clipTo(ctx, C, () => {
            blotch(ctx, C[0] + C[2] * 0.5, C[1] + C[3] * 0.62, C[2] * 0.36, C[3] * 0.3, '#14080a', 0.95);
            teeth(ctx, C[0] + C[2] * 0.2, C[1] + C[3] * 0.4, C[2] * 0.6, C[3] * 0.34, R, 9);
            ctx.fillStyle = '#4a1c1c'; ctx.fillRect(C[0] + C[2] * 0.18, C[1] + C[3] * 0.34, C[2] * 0.64, 2);
            blotch(ctx, C[0] + C[2] * 0.12, C[1] + C[3] * 0.5, 8, 10, dark, 0.5); blotch(ctx, C[0] + C[2] * 0.88, C[1] + C[3] * 0.5, 8, 10, dark, 0.5); // hollow cheeks
            blood(ctx, C, R, 2);
        });
        const N = rects.nose.pz;
        clipTo(ctx, N, () => { blotch(ctx, N[0] + N[2] * 0.3, N[1] + N[3] * 0.78, 3, 3, '#0c0508', 0.95); blotch(ctx, N[0] + N[2] * 0.7, N[1] + N[3] * 0.78, 3, 3, '#0c0508', 0.95); blotch(ctx, N[0] + N[2] * 0.5, N[1] + N[3] * 0.3, 6, 5, '#4d1a1a', 0.4); });
        for (const f of FACES) { const r = rects.skull[f]; clipTo(ctx, r, () => edgeShade(ctx, r, 0.18)); }
    } else if (part === 'jaw') {
        for (const f of FACES) { clipTo(ctx, rects.jaw[f], () => skinFace(rects.jaw[f], -0.02)); clipTo(ctx, rects.chin[f], () => skinFace(rects.chin[f], -0.04)); }
        const J = rects.jaw.pz;
        clipTo(ctx, J, () => { teeth(ctx, J[0] + J[2] * 0.15, J[1], J[2] * 0.7, J[3] * 0.5, R, 8, '#c3b88f'); blood(ctx, J, R, 3); });
        const Py = rects.jaw.py;
        clipTo(ctx, Py, () => { paintBase(ctx, Py, '#3a1316', '#140708', R); teeth(ctx, Py[0] + Py[2] * 0.12, Py[1] + Py[3] * 0.72, Py[2] * 0.76, Py[3] * 0.25, R, 10, '#c3b88f'); }); // inside the mouth, seen when it opens
        if (L.wound === 'jaw') clipTo(ctx, J, () => tear(ctx, J[0] + J[2] * 0.78, J[1] + J[3] * 0.6, 10, 6, R, '#6e1c1c'));
    } else if (part === 'torso') {
        const sh = L.shirt;
        const cloth = (r, back = false) => {
            fabric(ctx, r, sh.a, sh.b, R);
            if (sh.kind === 'plaid') plaid(ctx, r, sh.a, sh.b, 11);
            if (sh.kind === 'vest') { ctx.fillStyle = rgba('#d9d9c8', 0.55); ctx.fillRect(r[0] + r[2] * 0.12, r[1], 5, r[3]); ctx.fillRect(r[0] + r[2] * 0.88 - 5, r[1], 5, r[3]); ctx.fillRect(r[0], r[1] + r[3] * 0.62, r[2], 5); }
            if (sh.kind === 'overalls') { ctx.fillStyle = L.pants; ctx.fillRect(r[0] + r[2] * 0.2, r[1] + r[3] * 0.1, r[2] * 0.6, r[3] * 0.9); ctx.fillStyle = '#d6c060'; ctx.beginPath(); ctx.arc(r[0] + r[2] * 0.26, r[1] + r[3] * 0.14, 2.5, 0, 7); ctx.arc(r[0] + r[2] * 0.74, r[1] + r[3] * 0.14, 2.5, 0, 7); ctx.fill(); }
            if (sh.kind === 'shirt' && !back) { ctx.fillStyle = sh.b; ctx.beginPath(); ctx.moveTo(r[0] + r[2] * 0.47, r[1]); ctx.lineTo(r[0] + r[2] * 0.53, r[1]); ctx.lineTo(r[0] + r[2] * 0.56, r[1] + r[3] * 0.5); ctx.lineTo(r[0] + r[2] * 0.5, r[1] + r[3] * 0.58); ctx.lineTo(r[0] + r[2] * 0.44, r[1] + r[3] * 0.5); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.4)'; for (let i = 0; i < 4; i++) ctx.fillRect(r[0] + r[2] * 0.5 - 0.5, r[1] + r[3] * (0.66 + i * 0.08), 1.5, 1.5); }
            if (sh.kind === 'hoodie' || L.name === 'hoodie') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(r[0] + r[2] * 0.2, r[1] + r[3] * 0.62, r[2] * 0.6, r[3] * 0.3); }
            dirt(ctx, r, R, 7);
            blood(ctx, r, R, 3);
            edgeShade(ctx, r, 0.25);
        };
        for (const n of ['chest', 'belly', 'shoulderL', 'shoulderR', 'collar', 'hem1', 'hem2', 'hem3', 'hem4', 'hem5']) for (const f of FACES) clipTo(ctx, rects[n][f], () => cloth(rects[n][f], f === 'nz'));
        for (const n of ['spine1', 'spine2', 'spine3']) for (const f of FACES) clipTo(ctx, rects[n][f], () => paintBase(ctx, rects[n][f], '#d8d0b0', '#8a8060', R));
        // the wounds under torn cloth
        const Ch = rects.chest.pz, Be = rects.belly.pz;
        clipTo(ctx, Ch, () => {
            if (L.wound === 'ribs' || L.bone) {
                tear(ctx, Ch[0] + Ch[2] * 0.68, Ch[1] + Ch[3] * 0.45, Ch[2] * 0.2, Ch[3] * 0.26, R, '#5a1a1a');
                ctx.strokeStyle = '#dcd3b0'; ctx.lineWidth = 2.2;
                for (let i = 0; i < 3; i++) { const yy = Ch[1] + Ch[3] * (0.34 + i * 0.1); ctx.beginPath(); ctx.moveTo(Ch[0] + Ch[2] * 0.52, yy); ctx.quadraticCurveTo(Ch[0] + Ch[2] * 0.68, yy + 3, Ch[0] + Ch[2] * 0.84, yy - 2); ctx.stroke(); }
            } else if (L.wound === 'bite') {
                tear(ctx, Ch[0] + Ch[2] * 0.3, Ch[1] + Ch[3] * 0.55, Ch[2] * 0.14, Ch[3] * 0.16, R, '#6e1c1c');
                teeth(ctx, Ch[0] + Ch[2] * 0.2, Ch[1] + Ch[3] * 0.4, Ch[2] * 0.2, 4, R, 6, '#7a1818');
            } else tear(ctx, Ch[0] + Ch[2] * 0.25, Ch[1] + Ch[3] * 0.6, Ch[2] * 0.12, Ch[3] * 0.14, R, skin);
            tear(ctx, Ch[0] + Ch[2] * 0.16, Ch[1] + Ch[3] * 0.2, Ch[2] * 0.08, Ch[3] * 0.1, R, mix(skin, dark, 0.5));
        });
        clipTo(ctx, Be, () => { tear(ctx, Be[0] + Be[2] * 0.7, Be[1] + Be[3] * 0.6, Be[2] * 0.16, Be[3] * 0.22, R, mix(skin, dark, 0.4)); stitches(ctx, Be[0] + Be[2] * 0.1, Be[1] + Be[3] * 0.2, Be[0] + Be[2] * 0.4, Be[1] + Be[3] * 0.5, '#2a1a14'); ctx.fillStyle = '#2a2018'; ctx.fillRect(Be[0], Be[1] + Be[3] * 0.82, Be[2], Be[3] * 0.18); ctx.fillStyle = '#b9a45a'; ctx.fillRect(Be[0] + Be[2] * 0.45, Be[1] + Be[3] * 0.84, Be[2] * 0.1, Be[3] * 0.12); }); // a belt with a buckle
        const Cb = rects.chest.nz;
        clipTo(ctx, Cb, () => { tear(ctx, Cb[0] + Cb[2] * 0.4, Cb[1] + Cb[3] * 0.5, Cb[2] * 0.16, Cb[3] * 0.2, R, mix(skin, dark, 0.4)); });
    } else if (part === 'arm' || part === 'fore') {
        const sleeved = L.shirt.kind !== 'rags' && L.shirt.kind !== 'vest' && L.shirt.kind !== 'overalls';
        const sleeve = (r) => {
            fabric(ctx, r, L.shirt.a, L.shirt.b, R);
            if (L.shirt.kind === 'plaid') plaid(ctx, r, L.shirt.a, L.shirt.b, 11);
            dirt(ctx, r, R, 5); blood(ctx, r, R, 2); edgeShade(ctx, r, 0.25);
        };
        const names = part === 'arm' ? ['upper', 'cuff'] : ['elbow', 'fore', 'hand', 'f1', 'f2', 'f3', 'f4', 'thumb'];
        for (const n of names) for (const f of FACES) {
            const r = rects[n][f];
            clipTo(ctx, r, () => {
                const cloth = (part === 'arm' && sleeved) || (part === 'arm' && n === 'upper' && L.shirt.kind === 'overalls');
                if (cloth) sleeve(r); else { skinFace(r, -0.02); }
                if (part === 'fore' && n === 'fore') { veins(ctx, r, R, '#3a1f2f', 4, 0.6); if (L.bone) { ctx.fillStyle = '#d8d0b0'; ctx.fillRect(r[0] + r[2] * 0.3, r[1] + r[3] * 0.5, r[2] * 0.4, r[3] * 0.18); ctx.fillStyle = '#5a1a1a'; ctx.fillRect(r[0] + r[2] * 0.25, r[1] + r[3] * 0.46, r[2] * 0.5, 2); } else tear(ctx, r[0] + r[2] * 0.5, r[1] + r[3] * 0.55, r[2] * 0.22, r[3] * 0.12, R, '#6e2020'); }
                if (n.startsWith('f') && n.length === 2 || n === 'thumb') { ctx.fillStyle = '#d3c9a0'; ctx.fillRect(r[0], r[1] + r[3] * 0.78, r[2], r[3] * 0.22); } // the nails, long and yellow
                if (n === 'hand') { blood(ctx, r, R, 2); dirt(ctx, r, R, 3, '#1a1008'); }
                if (n === 'cuff') { ctx.fillStyle = rgba('#000000', 0.35); ctx.fillRect(r[0], r[1], r[2], r[3]); }
                edgeShade(ctx, r, 0.2);
            });
        }
    } else if (part === 'leg' || part === 'shin') {
        const pants = L.pants;
        const names = part === 'leg' ? ['thigh', 'knee'] : ['shin', 'boot', 'sole'];
        for (const n of names) for (const f of FACES) {
            const r = rects[n][f];
            clipTo(ctx, r, () => {
                if (n === 'boot') { if (L.boots) { paintBase(ctx, r, L.boots, mix(L.boots, '#000000', 0.5), R, 1.2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 4; i++) ctx.fillRect(r[0] + R() * r[2], r[1] + R() * r[3], 5, 1); dirt(ctx, r, R, 5, '#1a1208'); } else { skinFace(r, -0.05); ctx.fillStyle = '#d3c9a0'; ctx.fillRect(r[0], r[1] + r[3] * 0.85, r[2], r[3] * 0.15); } }
                else if (n === 'sole') { paintBase(ctx, r, '#171310', '#0b0907', R); }
                else if (n === 'shin' && !L.boots) { skinFace(r, -0.03); veins(ctx, r, R, '#3a1f2f', 3, 0.55); }
                else { fabric(ctx, r, pants, mix(pants, '#000000', 0.5), R); dirt(ctx, r, R, 6); blood(ctx, r, R, 1); if (n !== 'knee') { /* a patch */ } }
                edgeShade(ctx, r, 0.22);
            });
        }
        const T = part === 'leg' ? rects.thigh.pz : rects.shin.pz;
        clipTo(ctx, T, () => {
            tear(ctx, T[0] + T[2] * (part === 'leg' ? 0.35 : 0.6), T[1] + T[3] * (part === 'leg' ? 0.7 : 0.4), T[2] * 0.2, T[3] * 0.12, R, mix(skin, dark, 0.35));
            if (part === 'leg') { ctx.fillStyle = rgba('#000000', 0.3); ctx.fillRect(T[0], T[1] + T[3] * 0.92, T[2], T[3] * 0.08); }
            if (L.name === 'miner') { ctx.fillStyle = '#6d5e2a'; ctx.fillRect(T[0] + T[2] * 0.2, T[1] + T[3] * 0.78, T[2] * 0.6, T[3] * 0.18); }
        });
    }
}

const TEX = {};
/** The painted texture of a body part (head / torso / arm / leg) for a look (null without a canvas: the tests). Drawn once, cached. */
export function zombiePartTexture(part, look) {
    const key = part + look;
    if (key in TEX) return TEX[key];
    if (typeof document === 'undefined') return (TEX[key] = null);
    const S = ATLAS_SIZE[part];
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const L = LOOKS[look % ZOMBIE_LOOKS];
    const R = rng(look * 7919 + part.length * 131 + part.charCodeAt(0));
    ctx.fillStyle = L.skin; ctx.fillRect(0, 0, S, S);
    for (const sub of { head: ['head', 'jaw'], torso: ['torso'], arm: ['arm', 'fore'], leg: ['leg', 'shin'] }[part]) paintPart(ctx, sub, L, look, R, part);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.userData = { shared: true };
    return (TEX[key] = t);
}

/** What glows: only the eyes (an emissive map on the head, black elsewhere; a thrall of «Брейнрот» turns the emissive colour violet). */
export function zombieGlowTexture(look) {
    const key = 'glow' + look;
    if (key in TEX) return TEX[key];
    if (typeof document === 'undefined') return (TEX[key] = null);
    const S = 256, k = S / ATLAS_SIZE.head;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
    const F = atlasOf('head').rects.skull.pz.map((v) => v * k);
    for (const sx of [0.276, 0.724]) {
        const ex = F[0] + F[2] * sx, ey = F[1] + F[3] * 0.585;
        const gr = ctx.createRadialGradient(ex, ey, 0, ex, ey, F[2] * 0.1);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#ffd070'); gr.addColorStop(1, '#000000');
        ctx.fillStyle = gr; ctx.fillRect(ex - F[2] * 0.12, ey - F[2] * 0.12, F[2] * 0.24, F[2] * 0.24);
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.userData = { shared: true };
    return (TEX[key] = t);
}

const FALLBACK = { head: 0x8aa57a, torso: 0x5d4037, arm: 0x5d4037, leg: 0x2c3138 };
/** A fresh material for a part (a zombie owns its own: the red hit flash and the ice tint change its colour). */
export function zombieMaterial(part, look) {
    const map = zombiePartTexture(part, look);
    const m = new THREE.MeshLambertMaterial(map ? { map, color: 0xffffff } : { color: FALLBACK[part] });
    if (part === 'head') { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = zombieGlowTexture(look); if (!m.emissiveMap) m.emissive.setHex(0x000000); m.userData.glow = 0xffffff; }
    m.userData.origColor = map ? 0xffffff : FALLBACK[part];
    return m;
}

/** Paints all the textures of a look now (loading screen: no drawing in the middle of the game). */
export function prewarmZombieTextures() {
    for (let l = 0; l < ZOMBIE_LOOKS; l++) { for (const p of Object.keys(ATLAS_SIZE)) zombiePartTexture(p, l); zombieGlowTexture(l); }
}
export const ZOMBIE_LOOK_NAMES = LOOKS.map((l) => l.name);
void hex;
