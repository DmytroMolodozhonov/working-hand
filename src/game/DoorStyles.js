/**
 * DoorStyles.js — what an ordinary door looks like and how much it takes (the author 19.11: «несколько типов дверей — для богатых домов, для бедных…,
 * чтобы она могла разрушаться… защёлка, чтобы игрок видел, закрыта дверь или на замке… разлеталась в щепки, или отлетал кусочек, если удар не сильный»).
 *
 * Four styles of the plain wooden door (the keep's forged gates, the iron doors, the ice and the ships' bulkheads keep their own models):
 *   poor     — rough boards nailed to two battens and a diagonal brace, a wooden thumb-latch with a leather loop, black strap hinges
 *   common   — a framed door with two sunk panels, an iron ring on a back-plate, small iron hinges
 *   rich     — dark polished wood, six raised panels with carved diamonds and brass studs, a brass lever on a plate, brass hinges
 *   banded   — planks held by three iron bands with rivets, a big iron ring, long strap hinges (barns, taverns, cellars)
 * Each is ONE picture (a 256×512 canvas drawn once: grain, boards, panels, nails, wear — texture-style.md) shared by every door of the style, tinted by the
 * wood (the leaf's `color` multiplies the pale picture); the hardware is merged shapes, the sliding bolt and its two coloured lamps are the only moving bits.
 *
 * THE LATCH (what the player reads): a brass barrel bolt on both faces above the handle — drawn back = the door is shut but NOT locked (a small GREEN dot
 * beside it), shot across into the keeper = LOCKED (a RED dot). No spell is needed to see it; «Алохомора» and the house's own lock slide it.
 *
 * Damage: each style holds so much (`hp`); a blast's wave gives it a share by distance (Doors.hurt): a light one knocks a CHUNK out of the leaf (a ragged hole
 * with splinters, a crack that spreads), a strong one shatters it into boards and splinters (Doors.shatter). The decals (cracks, holes) are shared pictures.
 *
 * Pure parts here (`styleOf`, `STYLES`, `chipSpot`, `hurtShare`) are Node-testable; the canvas pictures return null without a document.
 */
import * as THREE from 'three';

export const STYLES = {
    poor: { id: 'poor', label: 'Простая дверь', hp: 10, tint: 1, panelDark: 0.55 },
    common: { id: 'common', label: 'Обычная дверь', hp: 18, tint: 1, panelDark: 0.65 },
    rich: { id: 'rich', label: 'Дверь богатого дома', hp: 32, tint: 0.82, panelDark: 0.6 },
    banded: { id: 'banded', label: 'Дверь, окованная железом', hp: 44, tint: 0.9, panelDark: 0.6 },
};
export const STYLE_IDS = Object.keys(STYLES);

function hash01(s) {
    let h = 2166136261;
    const str = String(s);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
}

/** The style of a door record: its own `style`, else by its id (a village: most plain and poor ones, some rich), a bigger leaf is likelier rich. */
export function styleOf(d) {
    if (d?.style && STYLES[d.style]) return d.style;
    const r = hash01(d?.id ?? 'd'), big = (d?.w || 1.6) > 2.2;
    if (r < (big ? 0.12 : 0.3)) return 'poor';
    if (r < (big ? 0.5 : 0.78)) return 'common';
    if (r < (big ? 0.85 : 0.93)) return 'rich';
    return 'banded';
}

/** How much of its strength a blast takes from a door: dist (m) from the blast, radius. → 0 (nothing) … ≥ 1 (all of it: it bursts). Power 1 = «Бомбардо», 2 = «Максима». */
export function hurtShare(dist, radius, power = 1) {
    const reach = radius + 0.8;
    if (dist >= reach + 2.5) return 0;
    const k = Math.max(0, 1.5 - dist / reach); // (in the middle 1.5, at the edge 0.5, a little past it a crack)
    return Math.max(0, k * (power > 1 ? 1.7 : 1) * 0.9 - (dist >= reach ? 0.1 : 0));
}

/**
 * Where a chunk comes out of a leaf of w × h (m), by a hash `r` (0…1, ×3 used) and the side the blast is on (+1/−1 along the leaf: the chunk is on the blast's side):
 * → { x (0…w along the leaf from the hinge), y (0…h), r (the hole's radius, m) }.
 */
export function chipSpot(w, h, r1, r2, r3, side = 0) {
    const x = (0.18 + 0.64 * (side > 0 ? 0.5 + 0.5 * r1 : side < 0 ? 0.5 * r1 : r1)) * w;
    return { x, y: (0.12 + 0.76 * r2) * h, r: 0.22 + 0.22 * r3 };
}

// ------------------------------------------------------------------ the pictures
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

const _tex = {};
const _mats = new Map();
let _decal = null;

function grain(c, R, W, H, n, dark = 0.12) {
    for (let i = 0; i < n; i++) { // long fine vertical strokes
        const x = R() * W, y = R() * H, len = 14 + R() * 80;
        c.strokeStyle = R() < 0.6 ? `rgba(40,25,10,${dark * (0.4 + R())})` : `rgba(255,240,215,${dark * 0.8 * R()})`;
        c.lineWidth = 0.5 + R() * 0.9;
        c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + (R() - 0.5) * 3, y + len * 0.3, x + (R() - 0.5) * 3, y + len * 0.7, x + (R() - 0.5) * 2, y + len); c.stroke();
    }
}
function knot(c, R, x, y, r) {
    for (let k = 3; k >= 0; k--) { c.strokeStyle = `rgba(50,30,12,${0.18 + 0.1 * (3 - k)})`; c.lineWidth = 1.2; c.beginPath(); c.ellipse(x, y, r * (0.6 + k * 0.3), r * (0.9 + k * 0.5), 0, 0, 7); c.stroke(); }
    c.fillStyle = 'rgba(35,20,8,0.55)'; c.beginPath(); c.ellipse(x, y, r * 0.5, r * 0.8, 0, 0, 7); c.fill();
}
function bevel(c, x, y, w, h, d, sunk) { // a panel: light on one pair of edges, dark on the other (sunk: reversed)
    const hi = sunk ? 'rgba(20,10,0,0.5)' : 'rgba(255,245,225,0.55)', lo = sunk ? 'rgba(255,245,225,0.45)' : 'rgba(20,10,0,0.5)';
    c.fillStyle = hi; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w - d, y + d); c.lineTo(x + d, y + d); c.lineTo(x + d, y + h - d); c.lineTo(x, y + h); c.fill();
    c.fillStyle = lo; c.beginPath(); c.moveTo(x + w, y + h); c.lineTo(x, y + h); c.lineTo(x + d, y + h - d); c.lineTo(x + w - d, y + h - d); c.lineTo(x + w - d, y + d); c.lineTo(x + w, y); c.fill();
}
function stud(c, x, y, r, gold) {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    if (gold) { g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#d4a82a'); g.addColorStop(1, '#6a4c10'); } else { g.addColorStop(0, '#9a9aa2'); g.addColorStop(0.55, '#4a4a52'); g.addColorStop(1, '#1c1c20'); }
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
}
function nail(c, x, y) { stud(c, x, y, 2.6, false); c.fillStyle = 'rgba(120,60,20,0.35)'; c.fillRect(x - 1, y + 2, 2, 7); } // (a nail with a rust streak)

/** The picture of a style (256×512, pale: the wood's colour multiplies it), or null without a canvas. */
export function doorTexture(style) {
    if (_tex[style] !== undefined) return _tex[style];
    if (typeof document === 'undefined') return (_tex[style] = null);
    const W = 256, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), R = rng(7000 + STYLE_IDS.indexOf(style) * 131);
    const wash = (hex) => { c.fillStyle = hex; c.fillRect(0, 0, W, H); };
    if (style === 'poor') {
        wash('#c9c2b4');
        const xs = [0]; while (xs[xs.length - 1] < W - 24) xs.push(xs[xs.length - 1] + 38 + R() * 22); xs[xs.length - 1] = W; // (boards of different widths)
        for (let i = 0; i < xs.length - 1; i++) {
            const a = xs[i], b = xs[i + 1], tone = 0.78 + R() * 0.32;
            c.fillStyle = `rgba(${Math.round(210 * tone)},${Math.round(200 * tone)},${Math.round(180 * tone)},1)`; c.fillRect(a, 0, b - a, H);
            c.fillStyle = 'rgba(15,8,0,0.7)'; c.fillRect(a, 0, 2.5, H); // the gap between boards
            if (R() < 0.7) knot(c, R, a + (b - a) * (0.3 + R() * 0.4), 40 + R() * 430, 5 + R() * 5);
            if (R() < 0.45) { c.strokeStyle = 'rgba(25,12,0,0.55)'; c.lineWidth = 1.2; c.beginPath(); let y = R() * 300, x = a + (b - a) * R(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { y += 12 + R() * 22; x += (R() - 0.5) * 5; c.lineTo(x, y); } c.stroke(); } // (a crack in a board)
        }
        grain(c, R, W, H, 360, 0.16);
        c.fillStyle = 'rgba(70,55,35,0.9)'; // two battens and a diagonal brace (Z)
        for (const y of [60, H - 112]) { c.fillRect(0, y, W, 52); c.fillStyle = 'rgba(255,240,210,0.18)'; c.fillRect(0, y, W, 4); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, y + 48, W, 4); c.fillStyle = 'rgba(70,55,35,0.9)'; }
        c.save(); c.translate(W / 2, H / 2); c.rotate(Math.atan2(H - 172, W) * -1); c.fillRect(-W * 0.62, -22, W * 1.24, 44); c.fillStyle = 'rgba(255,240,210,0.16)'; c.fillRect(-W * 0.62, -22, W * 1.24, 3); c.restore();
        for (const y of [86, H - 86]) for (let x = 16; x < W; x += 34) nail(c, x + (R() - 0.5) * 3, y + (R() - 0.5) * 3);
        for (let k = 0; k < 5; k++) { const x = 10 + R() * 236; const g = c.createLinearGradient(0, 0, 0, 160); g.addColorStop(0, 'rgba(60,40,20,0.25)'); g.addColorStop(1, 'rgba(60,40,20,0)'); c.fillStyle = g; c.fillRect(x, H - 160, 6 + R() * 12, 160); } // (dirt running up from the sill)
    } else if (style === 'common') {
        wash('#d3c19f');
        grain(c, R, W, H, 480, 0.14);
        c.fillStyle = 'rgba(95,60,30,0.35)'; c.fillRect(0, 0, 30, H); c.fillRect(W - 30, 0, 30, H); // stiles
        for (const [y, h] of [[0, 28], [H / 2 - 14, 28], [H - 28, 28]]) c.fillRect(0, y, W, h); // rails
        for (const [y0, y1] of [[36, H / 2 - 22], [H / 2 + 22, H - 36]]) { // two sunk panels
            c.fillStyle = 'rgba(120,80,45,0.35)'; c.fillRect(38, y0, W - 76, y1 - y0);
            for (let i = 0; i < 90; i++) { c.strokeStyle = `rgba(40,25,10,${0.08 + R() * 0.12})`; c.lineWidth = 0.6; const x = 40 + R() * (W - 80); c.beginPath(); c.moveTo(x, y0 + 4); c.lineTo(x + (R() - 0.5) * 2, y1 - 4); c.stroke(); }
            bevel(c, 38, y0, W - 76, y1 - y0, 8, true);
        }
        for (const x of [30, W - 30]) { c.fillStyle = 'rgba(20,10,0,0.45)'; c.fillRect(x - 1, 0, 2, H); }
        knot(c, R, 14, 130 + R() * 200, 6); knot(c, R, W - 14, 250 + R() * 200, 5);
        for (const y of [0.18, 0.82]) for (const x of [30, W - 30]) stud(c, x, H * y, 3.2, false);
        const g = c.createLinearGradient(0, H - 120, 0, H); g.addColorStop(0, 'rgba(50,30,10,0)'); g.addColorStop(1, 'rgba(50,30,10,0.35)'); c.fillStyle = g; c.fillRect(0, H - 120, W, 120);
    } else if (style === 'rich') {
        wash('#b89a78');
        grain(c, R, W, H, 600, 0.12);
        const sh = c.createLinearGradient(0, 0, W, 0); sh.addColorStop(0, 'rgba(255,235,200,0.16)'); sh.addColorStop(0.5, 'rgba(255,235,200,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.2)'); c.fillStyle = sh; c.fillRect(0, 0, W, H); // the polish
        c.fillStyle = 'rgba(60,35,15,0.35)'; c.fillRect(0, 0, W, 20); c.fillRect(0, H - 20, W, 20); c.fillRect(0, 0, 20, H); c.fillRect(W - 20, 0, 20, H); c.fillRect(W / 2 - 7, 0, 14, H);
        const px = [28, W / 2 + 14], pw = W / 2 - 42, ph = (H - 40 - 24 * 2) / 3;
        for (let row = 0; row < 3; row++) for (const x of px) {
            const y = 20 + 12 + row * (ph + 24);
            c.fillStyle = 'rgba(95,60,32,0.4)'; c.fillRect(x, y, pw, ph);
            bevel(c, x, y, pw, ph, 9, false);
            c.fillStyle = 'rgba(70,40,18,0.3)'; c.fillRect(x + 13, y + 13, pw - 26, ph - 26); bevel(c, x + 13, y + 13, pw - 26, ph - 26, 4, true);
            // a carved diamond with a rosette
            const cx = x + pw / 2, cy = y + ph / 2;
            c.strokeStyle = 'rgba(255,235,200,0.5)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(cx, cy - ph * 0.32); c.lineTo(cx + pw * 0.3, cy); c.lineTo(cx, cy + ph * 0.32); c.lineTo(cx - pw * 0.3, cy); c.closePath(); c.stroke();
            c.strokeStyle = 'rgba(30,15,0,0.5)'; c.beginPath(); c.moveTo(cx + 1, cy - ph * 0.32 + 1); c.lineTo(cx + pw * 0.3 + 1, cy + 1); c.lineTo(cx + 1, cy + ph * 0.32 + 1); c.lineTo(cx - pw * 0.3 + 1, cy + 1); c.closePath(); c.stroke();
            for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.strokeStyle = 'rgba(255,235,200,0.35)'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); c.stroke(); }
            stud(c, cx, cy, 4.2, true);
            for (const [sx, sy] of [[x + 6, y + 6], [x + pw - 6, y + 6], [x + 6, y + ph - 6], [x + pw - 6, y + ph - 6]]) stud(c, sx, sy, 2.8, true);
        }
    } else { // banded
        wash('#c4b497');
        for (let x = 0; x < W; x += 42) { const tone = 0.82 + R() * 0.3; c.fillStyle = `rgba(${Math.round(205 * tone)},${Math.round(185 * tone)},${Math.round(150 * tone)},1)`; c.fillRect(x, 0, 42, H); c.fillStyle = 'rgba(20,10,0,0.55)'; c.fillRect(x, 0, 2, H); }
        grain(c, R, W, H, 420, 0.15);
        for (let i = 0; i < 3; i++) knot(c, R, 20 + R() * 216, 40 + R() * 430, 5 + R() * 4);
        for (const y of [H * 0.15, H * 0.5, H * 0.85]) { // the iron bands
            const g = c.createLinearGradient(0, y - 20, 0, y + 20); g.addColorStop(0, '#5c5c64'); g.addColorStop(0.4, '#34343a'); g.addColorStop(1, '#202024');
            c.fillStyle = g; c.fillRect(0, y - 20, W, 40);
            c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, y - 20, W, 2);
            for (let x = 12; x < W; x += 28) stud(c, x, y, 3.4, false);
            for (let k = 0; k < 14; k++) { c.fillStyle = `rgba(130,70,30,${0.1 + R() * 0.2})`; c.fillRect(R() * W, y - 20, 2 + R() * 5, 40); } // rust
        }
    }
    // the edges: a little darker, the leaf sits in space
    for (const [x0, y0, x1, y1] of [[0, 0, 12, 0], [W, 0, W - 12, 0], [0, 0, 0, 12], [0, H, 0, H - 12]]) {
        const g = c.createLinearGradient(x0, y0, x1 || x0 + 12, y1 || y0 + 12); g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g;
        c.fillRect(Math.min(x0, x1 || x0 + 12), Math.min(y0, y1 || y0 + 12), Math.abs((x1 || x0 + 12) - x0) || 12, Math.abs((y1 || y0 + 12) - y0) || 12);
    }
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4; t.userData = { shared: true };
    return (_tex[style] = t);
}

/** The leaf's six materials (a box: sides, top, bottom, front, back), shared by every door of a style and wood colour. */
export function leafMaterials(style, color) {
    const key = style + '|' + color;
    let m = _mats.get(key);
    if (m) return m;
    const k = STYLES[style]?.tint ?? 1, tint = new THREE.Color(color).multiplyScalar(k);
    const face = new THREE.MeshLambertMaterial({ color: tint, map: doorTexture(style) || null });
    const edge = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.55) });
    for (const x of [face, edge]) x.userData.shared = true;
    m = [edge, edge, edge, edge, face, face];
    _mats.set(key, m);
    return m;
}

/** The shared decals: cracks (three stages) and a splintered hole — drawn once. → { crack: [mat, mat, mat], hole: mat } (null without a canvas). */
export function damageDecals() {
    if (_decal !== null) return _decal;
    if (typeof document === 'undefined') return (_decal = undefined);
    const R = rng(991);
    const crack = [];
    for (let stage = 1; stage <= 3; stage++) {
        const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
        const c = cv.getContext('2d');
        const rr = rng(40 + stage); // (the same seed prefix: each stage grows the same cracks)
        const n = 2 + stage * 2;
        for (let i = 0; i < n; i++) {
            let x = 20 + rr() * 88, y = 30 + rr() * 196, a = rr() * 6.28;
            const len = 20 + stage * 18 + rr() * 30;
            c.lineWidth = 1 + (rr() < 0.3 ? 1 : 0); c.strokeStyle = 'rgba(18,8,0,0.85)';
            c.beginPath(); c.moveTo(x, y);
            for (let s = 0; s < len; s += 5) { a += (rr() - 0.5) * 1.0; x += Math.cos(a) * 5; y += Math.sin(a) * 5; c.lineTo(x, y); if (rr() < 0.12) { c.moveTo(x, y); a += 0.8; } }
            c.stroke();
            c.strokeStyle = 'rgba(255,235,200,0.35)'; c.lineWidth = 0.7; c.stroke();
        }
        const t = new THREE.CanvasTexture(cv); t.userData = { shared: true };
        const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); m.userData.shared = true;
        crack.push(m);
    }
    // a hole: a ragged dark gap with pale splintered wood round it and a few long splinters standing out
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d'), cx = 64, cy = 64;
    const ring = (r0, r1, fill, jag) => { c.fillStyle = fill; c.beginPath(); const N = 22; for (let i = 0; i <= N; i++) { const a = i / N * 6.2832, r = (i % 2 ? r0 : r1) * (0.8 + R() * jag); const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 1.15; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); c.fill(); };
    ring(34, 56, 'rgba(240,215,165,0.95)', 0.5); // (the pale torn wood)
    ring(24, 40, 'rgba(120,80,40,0.95)', 0.5);
    ring(14, 28, 'rgba(8,5,3,1)', 0.45); // (the gap: dark)
    for (let i = 0; i < 14; i++) { const a = R() * 6.28, r0 = 24 + R() * 10, L = 10 + R() * 18; c.strokeStyle = `rgba(250,225,175,${0.7 + R() * 0.3})`; c.lineWidth = 1.2 + R() * 1.6; c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a + (R() - 0.5) * 0.3) * (r0 + L), cy + Math.sin(a) * (r0 + L)); c.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.userData = { shared: true };
    const hole = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }); hole.userData.shared = true;
    return (_decal = { crack, hole });
}

/** The wood tones the splinters of a door are thrown in (its own colour, lighter and darker, and the pale heart of the wood). */
export function splinterColors(color) {
    const c = new THREE.Color(color);
    return [c.getHex(), c.clone().multiplyScalar(0.72).getHex(), c.clone().lerp(new THREE.Color(0xf0d9a8), 0.45).getHex(), 0xe8d0a0];
}
