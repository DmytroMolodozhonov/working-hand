/**
 * PocketHintsDraw.js - draws the hints of PocketHints.js on the camera window's 2D canvas: for every place a bright
 * outlined mark (a dark edge under a coloured line, a see-through fill) - yellow: the things' pocket (the next thing's
 * picture in it and the row of cells; the coins are taken at the same place), pink: the wand at the belt (a little wand
 * in it). No words (the author: «подписывать не нужно, достаточно значка»). The author: «видно очень плохо, почти не
 * видно» - the old thin pale rings were lost over the skeleton, so the colours are ones the skeleton never uses (green
 * bones, red joints, cyan hands).
 * Sizes follow the torso in the picture, but never below a few SCREEN pixels: the window is drawn at 320×240 and shown
 * smaller (`s` - canvas pixels per screen pixel). The picture is mirrored like the skeleton (a mirror, the way the
 * player sees themself), the icons themselves are not.
 * Everything is cached: the icons' images by their address (a few at most); nothing is made per frame.
 */
import { iconPx, IDS } from './PocketHints.js';

const IMG_MAX = 12;
const _imgs = new Map(); // address of an icon → Image

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

/** The marks' looks: line and fill (rgb for rgba()). Grey when shut (monster, still, dead, Imperius). */
export const HINT_STYLE = {
    pocket: { line: '#ffd400', fill: ['rgba(255,212,0,0.28)', 'rgba(255,212,0,0.58)'] },
    wand: { line: '#ff4fd8', fill: ['rgba(255,79,216,0.28)', 'rgba(255,79,216,0.58)'] },
};
const GREY = { line: '#b8bec8', fill: ['rgba(184,190,200,0.28)', 'rgba(184,190,200,0.4)'] };
const EDGE = 'rgba(0,0,0,0.85)';

/** The marks' sizes in torso heights (w, h) and their least size in screen pixels. */
// (narrow enough that the wand's and the things' marks never touch: their middles are only ~0.18 torso apart)
export const BOX = { pocket: [0.18, 0.17], wand: [0.09, 0.34] };
const BOX_MIN = { pocket: [12, 11], wand: [7, 16] };

function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** One mark: the see-through fill, a dark edge, the coloured line (thicker and fuller when the hand is coming to it). */
function mark(ctx, X, Y, w, h, a, glow, st, lw, dashed) {
    roundRect(ctx, X - w / 2, Y - h / 2, w, h, Math.min(w, h) * 0.3);
    ctx.globalAlpha = a;
    ctx.fillStyle = st.fill[glow > 0.5 ? 1 : 0];
    ctx.fill();
    if (dashed) ctx.setLineDash([lw * 2.2, lw * 1.6]);
    const l = lw * (1 + glow * 0.5);
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = l + lw * 1.4;
    ctx.stroke();
    ctx.strokeStyle = st.line;
    ctx.lineWidth = l;
    ctx.stroke();
    if (dashed) ctx.setLineDash([]);
}

/** The small wand tucked at the belt: handle up, the tip down towards the thigh (away from the hand that takes it). */
function wandShape(ctx, X, Y, len, a, grey, tipDir, s) {
    ctx.globalAlpha = a;
    const hx = X - tipDir * len * 0.14, hy = Y - len * 0.4; // (the handle)
    const tx = X + tipDir * len * 0.14, ty = Y + len * 0.4; // (the tip)
    ctx.lineCap = 'round';
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = Math.max(3.5 * s, len * 0.16);
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = grey ? '#d5d9df' : '#f3d9a4'; // (light wood: seen on the dark window)
    ctx.lineWidth = Math.max(2 * s, len * 0.09);
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = grey ? '#ffffff' : '#bfe6ff'; // (a glint at the tip)
    ctx.beginPath(); ctx.arc(tx, ty, Math.max(1.5 * s, len * 0.06), 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'butt';
}

/**
 * Draw the hints (call after the skeleton, outside its mirror). `d`: {pocketUrl, cells: [bool…], next, leftHanded}.
 * `hints` - PocketHints after step(). `s` - canvas pixels per screen pixel (the window is shown smaller than it is drawn).
 * Nothing drawn when it is faded out.
 */
export function drawPocketHints(ctx, W, H, hints, d, s = 1) {
    if (hints.k <= 0.01) return;
    s = Math.max(0.5, s || 1);
    const Tp = (hints.T || 0.3) * H; // (the torso's height, canvas pixels)
    const lw = Math.max(1.6 * s, Tp * 0.022);
    const I = hints.items, grey = hints.shut;
    ctx.save();
    const fade = hints.k;
    const X = (it) => (1 - it.x) * W, Y = (it) => it.y * H; // (like the skeleton: the picture is a mirror)
    for (const id of IDS) {
        const it = I[id];
        const a = it.a * fade;
        if (a < 0.02) continue;
        const st = grey ? GREY : HINT_STYLE[id];
        const w = Math.max(BOX_MIN[id][0] * s, BOX[id][0] * Tp), h = Math.max(BOX_MIN[id][1] * s, BOX[id][1] * Tp);
        const x = X(it), y = Y(it);
        const empty = id === 'pocket' && !d.pocketUrl;
        mark(ctx, x, y, w, h, empty ? a * 0.85 : a, it.glow, st, lw, empty);
        if (id === 'wand') { wandShape(ctx, x, y, h * 0.92, a, grey, d.leftHanded ? 1 : -1, s); continue; }
        const img = iconImage(d.pocketUrl);
        const px = Math.min(iconPx(H, hints.T || 0.3) || 0, Math.min(w, h) * 0.86);
        if (img && px > 0) {
            ctx.globalAlpha = a;
            if (grey) ctx.filter = 'grayscale(1)';
            ctx.drawImage(img, x - px / 2, y - px / 2, px, px);
            if (grey) ctx.filter = 'none';
        }
        if (d.cells && d.cells.length) { // (the cells: a row under the mark - filled ones lit, the next one bigger)
            const n = d.cells.length, rr = Math.max(1.6 * s, Tp * 0.018), step = Math.max(rr * 2.8, w / n);
            const x0 = x - (n - 1) * step * 0.5, y0 = y + h / 2 + lw * 1.5 + rr * 1.6;
            ctx.globalAlpha = a;
            for (let i = 0; i < n; i++) {
                const r = i === d.next ? rr * 1.45 : rr;
                ctx.beginPath();
                ctx.arc(x0 + i * step, y0, r, 0, Math.PI * 2);
                ctx.fillStyle = EDGE;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(x0 + i * step, y0, r * 0.7, 0, Math.PI * 2);
                ctx.fillStyle = d.cells[i] ? st.line : 'rgba(150,160,175,0.6)';
                ctx.fill();
            }
        }
    }
    ctx.restore();
}
