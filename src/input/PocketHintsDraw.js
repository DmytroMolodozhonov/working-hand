/**
 * PocketHintsDraw.js — draws the hints of PocketHints.js on the camera window's 2D canvas (soft glow, a thin ring,
 * the picture of the thing from ItemIcons' cache, a little wand at the belt). The picture is mirrored like the skeleton
 * (a mirror, the way the player sees themself), the icons themselves are not.
 * Everything is cached: one glow sprite, the icons' images by their address (a few at most); nothing is made per frame.
 */
import { iconPx, IDS } from './PocketHints.js';

const IMG_MAX = 12;
const _imgs = new Map(); // address of an icon → Image
let _glow = null;

/** An icon's image, ready to draw (or null while it loads). Kept few: the oldest go. */
export function iconImage(url) {
    if (!url || typeof Image === 'undefined') return null;
    let im = _imgs.get(url);
    if (!im) {
        if (_imgs.size >= IMG_MAX) _imgs.delete(_imgs.keys().next().value);
        im = new Image();
        im.src = url;
        _imgs.set(url, im);
    }
    return im.complete && im.naturalWidth > 0 ? im : null;
}

function glowSprite() {
    if (_glow || typeof document === 'undefined') return _glow;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(190,230,255,0.85)');
    g.addColorStop(0.45, 'rgba(150,205,255,0.32)');
    g.addColorStop(1, 'rgba(150,205,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return (_glow = c);
}

/** One soft place: glow, ring, then what is in it. `px` — icon size (0: only the ring). */
function place(ctx, X, Y, px, a, glow, grey, img, empty, r) {
    ctx.globalAlpha = a;
    const gs = glowSprite();
    if (gs && glow > 0.03) { ctx.globalAlpha = Math.min(1, glow * 0.9); ctx.drawImage(gs, X - r * 1.9, Y - r * 1.9, r * 3.8, r * 3.8); }
    ctx.globalAlpha = a;
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.strokeStyle = grey ? '#9aa0a8' : '#cfe8ff';
    ctx.fillStyle = grey ? 'rgba(30,32,36,0.45)' : 'rgba(18,30,48,0.5)';
    ctx.beginPath();
    ctx.arc(X, Y, r, 0, Math.PI * 2);
    ctx.fill();
    if (empty) ctx.setLineDash([r * 0.5, r * 0.4]);
    ctx.stroke();
    if (empty) ctx.setLineDash([]);
    if (img && px > 0) {
        if (grey) ctx.filter = 'grayscale(1)';
        ctx.drawImage(img, X - px * 0.5 * 0.78, Y - px * 0.5 * 0.78, px * 0.78, px * 0.78);
        if (grey) ctx.filter = 'none';
    }
}

/** The small wand tucked at the belt: handle up, the tip down towards the thigh (away from the hand that takes it). */
function wandShape(ctx, X, Y, s, a, glow, grey, tipDir) {
    ctx.globalAlpha = a;
    const gs = glowSprite();
    if (gs && glow > 0.03) { ctx.globalAlpha = Math.min(1, glow * 0.9); ctx.drawImage(gs, X - s * 1.4, Y - s * 1.4, s * 2.8, s * 2.8); ctx.globalAlpha = a; }
    const hx = X - tipDir * s * 0.28, hy = Y - s * 0.62; // (the handle)
    const tx = X + tipDir * s * 0.34, ty = Y + s * 0.66; // (the tip)
    ctx.lineCap = 'round';
    ctx.strokeStyle = grey ? '#6c7078' : '#5b3b22';
    ctx.lineWidth = Math.max(1.5, s * 0.17);
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = grey ? '#a6abb3' : '#c79a62'; // (the lighter grain on it)
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.beginPath(); ctx.moveTo(hx + tipDir * s * 0.03, hy + s * 0.04); ctx.lineTo(tx - tipDir * s * 0.04, ty - s * 0.06); ctx.stroke();
    ctx.strokeStyle = grey ? '#cfd3d9' : '#e9d3a8'; // (the handle's band)
    ctx.lineWidth = Math.max(1.5, s * 0.2);
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + tipDir * s * 0.09, hy + s * 0.22); ctx.stroke();
    ctx.fillStyle = grey ? '#cfd3d9' : '#bfe6ff'; // (a glint at the tip)
    ctx.beginPath(); ctx.arc(tx, ty, Math.max(1, s * 0.07), 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'butt';
}

/**
 * Draw the hints (call after the skeleton, outside its mirror). `d`: {pocketUrl, purseUrl, cells: [bool…], next, leftHanded}.
 * `hints` — PocketHints after step(). Nothing drawn when it is faded out.
 */
export function drawPocketHints(ctx, W, H, hints, d) {
    if (hints.k <= 0.01) return;
    const T = hints.T;
    const px = iconPx(H, T || 0.3);
    const r = Math.max(4, (px || 0.07 * H) * 0.5 * 1.08);
    const I = hints.items, grey = hints.shut;
    ctx.save();
    const fade = hints.k;
    const X = (it) => (1 - it.x) * W, Y = (it) => it.y * H; // (like the skeleton: the picture is a mirror)
    for (const id of IDS) {
        const it = I[id];
        const a = it.a * fade;
        if (a < 0.02) continue;
        if (id === 'wand') { wandShape(ctx, X(it), Y(it), r * 1.4, a, it.glow, grey, d.leftHanded ? 1 : -1); continue; }
        const url = id === 'pocket' ? d.pocketUrl : d.purseUrl;
        const empty = id === 'pocket' && !d.pocketUrl;
        place(ctx, X(it), Y(it), px, empty ? a * 0.8 : a, it.glow, grey, iconImage(url), empty, id === 'purse' ? r * 0.82 : r);
        if (id === 'pocket' && d.cells && px) { // (the cells: a thin row under the pocket — filled ones lit, the next one marked)
            const n = d.cells.length, step = r * 0.46, x0 = X(it) - (n - 1) * step * 0.5, y0 = Y(it) + r * 1.32;
            ctx.globalAlpha = a * 0.9;
            for (let i = 0; i < n; i++) {
                ctx.fillStyle = d.cells[i] ? (grey ? '#b5b9bf' : '#e6f3ff') : 'rgba(150,170,190,0.28)';
                ctx.beginPath();
                ctx.arc(x0 + i * step, y0, i === d.next ? r * 0.2 : r * 0.14, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    ctx.restore();
}
