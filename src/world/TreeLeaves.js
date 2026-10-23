/**
 * TreeLeaves.js — the pictures on the trees' leaf cards (TreeBuild.js): one sprig per kind, side by side in
 * one picture (an atlas: one material for every tree). Each sprig is a stalk from the card's bottom middle up
 * to its top with its leaves along it, as real ones:
 *  oak — lobed leaves in bunches; birch — small toothed leaves on a thin hanging twig; spruce — a flat bough
 *  of short needles with side shoots; cherry — clusters of five-petalled blossom with a few young leaves;
 *  dark oak — the oak's lobed leaves, darker and denser.
 * Drawn on any 2D context (a page's canvas or an OffscreenCanvas in a worker); the gaps stay clear (alpha).
 */
import { treeRandom, ATLAS_CELLS } from './TreeBuild.js';

export const LEAF_ATLAS = { CELL: 256, KINDS: ATLAS_CELLS };

const rgb = (h, k = 1) => `rgb(${Math.min(255, ((h >> 16) & 255) * k) | 0},${Math.min(255, ((h >> 8) & 255) * k) | 0},${Math.min(255, (h & 255) * k) | 0})`;

/** A leaf's outline at (x, y) pointing at angle a: polar shape r(t) along its length. */
function leafPath(ctx, x, y, a, L, Wd, shape) {
    ctx.beginPath();
    const n = 28;
    for (let i = 0; i <= n; i++) {
        const t = i / n; // 0 at the stalk, 1 at the tip, then back along the other side
        const side = i <= n / 2 ? 1 : -1, u = i <= n / 2 ? t * 2 : (1 - t) * 2;
        let w = Math.sin(Math.PI * Math.pow(u, 0.8)) * Wd;
        if (shape === 'lobed') w *= 0.72 + 0.38 * Math.abs(Math.sin(u * Math.PI * 3.5)); // (the oak's rounded lobes)
        if (shape === 'toothed') w *= 0.92 + 0.08 * ((i % 2) ? 1 : -1); // (the birch's teeth)
        if (shape === 'needle') w = Wd * (1 - u * 0.6);
        const px = u * L, py = w * side;
        const X = x + Math.cos(a) * px - Math.sin(a) * py, Y = y + Math.sin(a) * px + Math.cos(a) * py;
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.closePath();
}

function leaf(ctx, rnd, x, y, a, L, Wd, shape, base, vein = true) {
    leafPath(ctx, x, y, a, L, Wd, shape);
    const k = 0.8 + rnd() * 0.4;
    // lighter towards the light side, a little darker at the stalk
    const g = ctx.createLinearGradient(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.addColorStop(0, rgb(base, k * 0.8));
    g.addColorStop(1, rgb(base, k * 1.12));
    ctx.fillStyle = g;
    ctx.fill();
    if (vein && L > 14) {
        ctx.strokeStyle = rgb(base, k * 1.35);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * L * 0.85, y + Math.sin(a) * L * 0.85); ctx.stroke();
    }
}

/** A curved stalk from (x0, y0) up; returns points along it. */
function stalk(ctx, rnd, x0, y0, x1, y1, bend, w, colour) {
    const pts = [];
    const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
    for (let i = 0; i <= 20; i++) {
        const t = i / 20, u = 1 - t;
        pts.push([u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * y0 + 2 * u * t * my + t * t * y1]);
    }
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    for (let i = 0; i < 20; i++) {
        ctx.lineWidth = w * (1 - i / 24);
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
    }
    return pts;
}

/** One kind's sprig in its cell (ox: the cell's left edge; the card's bottom is the cell's bottom). */
function sprig(ctx, kind, ox, S) {
    const rnd = treeRandom(4242 + kind * 77);
    const cx = ox + S / 2, by = S - 4;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, 0, S, S); ctx.clip();
    if (kind === 0 || kind === 4) {
        // oak: side twigs off the stalk, each ending in a rosette of lobed leaves (as oak leaves grow, bunched at the tips)
        const base = kind === 4 ? 0x44762f : 0x58a03b;
        const main = stalk(ctx, rnd, cx, by, cx + (rnd() - 0.5) * 30, 26, (rnd() - 0.5) * 40, 4, '#4a3626');
        const rosette = (x, y, a0, n, L) => {
            for (let j = 0; j < n; j++) {
                const a = a0 + (j - (n - 1) / 2) * (2.4 / n) + (rnd() - 0.5) * 0.3;
                const l = L * (0.75 + rnd() * 0.4);
                leaf(ctx, rnd, x, y, a, l, l * 0.36, 'lobed', base + (rnd() < 0.4 ? 0x0a1004 : 0) - (rnd() < 0.3 ? 0x081002 : 0));
            }
        };
        const twigs = kind === 4 ? 9 : 8;
        for (let t = 0; t < twigs; t++) {
            const i = 3 + Math.round((t / twigs) * 16);
            const [x, y] = main[i];
            const dir = t % 2 ? 1 : -1;
            const ex = x + dir * (40 + rnd() * 45), ey = y - 20 - rnd() * 40;
            stalk(ctx, rnd, x, y, ex, ey, dir * 8, 2, '#4a3626');
            rosette(ex, ey, Math.atan2(ey - y, ex - x) - 0.2 * dir, 5 + (rnd() < 0.5 ? 1 : 0), 30);
        }
        rosette(main[20][0], main[20][1], -Math.PI / 2, 6, 32);
    } else if (kind === 1) {
        // birch: a thin twig, small toothed leaves alternating, lots of them
        const base = 0x4c8232;
        const main = stalk(ctx, rnd, cx, by, cx + (rnd() - 0.5) * 50, 8, (rnd() - 0.5) * 60, 3, '#5a4a3e');
        for (let i = 2; i <= 20; i++) {
            const [x, y] = main[i];
            for (const side of [-1, 1]) {
                if (rnd() < 0.15) continue;
                const a = -Math.PI / 2 + side * (0.6 + rnd() * 0.6);
                const L = 28 + rnd() * 14;
                leaf(ctx, rnd, x, y, a, L, L * 0.4, 'toothed', base + (rnd() < 0.3 ? 0x101400 : 0));
            }
        }
        // side twigs
        for (let s = 0; s < 4; s++) {
            const [x, y] = main[4 + s * 4];
            const dir = s % 2 ? 1 : -1;
            const tw = stalk(ctx, rnd, x, y, x + dir * (70 + rnd() * 25), y - 40 - rnd() * 30, dir * 10, 2, '#5a4a3e');
            for (let i = 3; i <= 20; i += 2) for (const side of [-1, 1]) leaf(ctx, rnd, tw[i][0], tw[i][1], -Math.PI / 2 + dir * 0.6 + side * 0.7, 24 + rnd() * 10, 10, 'toothed', base);
        }
    } else if (kind === 2) {
        // spruce: a flat bough of short dense needles, with side shoots
        const base = 0x2f6a3a;
        const shoot = (x0, y0, x1, y1, w, nl) => {
            const pts = stalk(ctx, rnd, x0, y0, x1, y1, (rnd() - 0.5) * 20, w, '#5a3f2c');
            for (let i = 1; i <= 20; i++) {
                const [x, y] = pts[i];
                const d = [pts[Math.min(20, i + 1)][0] - pts[i - 1][0], pts[Math.min(20, i + 1)][1] - pts[i - 1][1]];
                const ang = Math.atan2(d[1], d[0]);
                for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
                    const a = ang + side * (0.75 + rnd() * 0.5) - 0.25 * side;
                    leaf(ctx, rnd, x, y, a, nl * (0.8 + rnd() * 0.4) * (1 - i / 34), 2.2, 'needle', base + (rnd() < 0.4 ? 0x0a1408 : 0), false);
                }
            }
            return pts;
        };
        const main = shoot(cx, by, cx + (rnd() - 0.5) * 20, 10, 5, 26);
        for (let s = 0; s < 5; s++) {
            const [x, y] = main[3 + s * 3];
            const dir = s % 2 ? 1 : -1;
            shoot(x, y, x + dir * (100 - s * 10), y - 45 - rnd() * 20, 2.5, 20);
        }
    } else if (kind >= 5) {
        // the apple trees: oval glossy leaves in bunches of 4–6 on short spurs; the golden one's leaves are gold,
        // lighter at their edges (it is a magic tree: the light seems to come from inside them)
        const gold = kind === 6;
        const base = gold ? 0xe0a82a : 0x4f8a34;
        const main = stalk(ctx, rnd, cx, by, cx + (rnd() - 0.5) * 30, 20, (rnd() - 0.5) * 40, 4, gold ? '#7a4a1a' : '#4a3426');
        for (let t = 0; t < 9; t++) {
            const i = 3 + Math.round((t / 9) * 16);
            const [x, y] = main[i];
            const dir = t % 2 ? 1 : -1;
            const ex = x + dir * (30 + rnd() * 45), ey = y - 15 - rnd() * 35;
            stalk(ctx, rnd, x, y, ex, ey, dir * 6, 2, gold ? '#7a4a1a' : '#4a3426');
            const n = 4 + Math.floor(rnd() * 3);
            for (let j = 0; j < n; j++) {
                const a = Math.atan2(ey - y, ex - x) + (j - (n - 1) / 2) * 0.55 + (rnd() - 0.5) * 0.3;
                const L = 30 + rnd() * 14;
                leaf(ctx, rnd, ex, ey, a, L, L * 0.42, 'toothed', base + (rnd() < 0.4 ? (gold ? 0x141000 : 0x0a1206) : 0));
                if (gold && rnd() < 0.6) {
                    // (a bright rim: the gold glints)
                    leafPath(ctx, ex, ey, a, L * 0.9, L * 0.3, 'toothed');
                    ctx.strokeStyle = 'rgba(255,240,160,0.75)';
                    ctx.lineWidth = 1.2;
                    ctx.stroke();
                }
            }
        }
        for (let j = 0; j < 5; j++) leaf(ctx, rnd, main[20][0], main[20][1] + 8, -Math.PI / 2 + (j - 2) * 0.5, 34, 14, 'toothed', base);
    } else {
        // cherry: clusters of five-petalled blossom, a few young bronze-green leaves
        const main = stalk(ctx, rnd, cx, by, cx + (rnd() - 0.5) * 30, 18, (rnd() - 0.5) * 40, 3, '#5a3a36');
        const flower = (x, y, r) => {
            const k = 0.9 + rnd() * 0.15, ph = rnd() * 6.28;
            for (let p = 0; p < 5; p++) {
                const a = ph + (p / 5) * Math.PI * 2;
                ctx.fillStyle = rgb(rnd() < 0.55 ? 0xf7a8c6 : 0xffcadd, k);
                ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, r * 0.4, a, 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = '#e88aac';
            ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, Math.PI * 2); ctx.fill();
        };
        for (let i = 3; i <= 20; i += 2) {
            const [x, y] = main[i];
            if (rnd() < 0.2) leaf(ctx, rnd, x, y, -Math.PI / 2 + (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.4), 24, 8, 'toothed', 0x8a9a4a);
            const n = 3 + Math.floor(rnd() * 3);
            for (let j = 0; j < n + 4; j++) flower(x + (rnd() - 0.5) * (60 + i * 6), y + (rnd() - 0.5) * 40, 12 + rnd() * 7);
        }
        for (let j = 0; j < 6; j++) flower(main[20][0] + (rnd() - 0.5) * 50, main[20][1] + (rnd() - 0.3) * 30, 12 + rnd() * 5);
    }
    ctx.restore();
}

/** The whole atlas: every kind's sprig, side by side (CELL × KINDS by CELL), on a clear background. */
export function drawLeafAtlas(ctx, S = LEAF_ATLAS.CELL) {
    ctx.clearRect(0, 0, S * LEAF_ATLAS.KINDS, S);
    for (let k = 0; k < LEAF_ATLAS.KINDS; k++) sprig(ctx, k, k * S, S);
}

/**
 * The atlas's pixels ready for a texture: the clear pixels take the colour of the nearest leaf (still clear),
 * so far away — where the picture is shrunk and pixels mix — a leaf's edge never darkens towards black.
 * → Uint8Array RGBA (width × height), not premultiplied.
 */
export function bleedLeafPixels(img, width, height) {
    const src = img, out = new Uint8Array(src.length);
    out.set(src);
    const filled = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) if (src[i * 4 + 3] > 8) filled[i] = 1;
    let front = [];
    for (let i = 0; i < width * height; i++) if (filled[i]) front.push(i);
    // grow the colours outwards, a ring at a time
    for (let pass = 0; pass < 24 && front.length; pass++) {
        const next = [];
        for (const i of front) {
            const x = i % width, y = (i / width) | 0;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                const j = ny * width + nx;
                if (filled[j]) continue;
                filled[j] = 1;
                out[j * 4] = out[i * 4]; out[j * 4 + 1] = out[i * 4 + 1]; out[j * 4 + 2] = out[i * 4 + 2]; out[j * 4 + 3] = 0;
                next.push(j);
            }
        }
        front = next;
    }
    // what is left: each cell's average leaf colour
    const S = height;
    for (let k = 0; k * S < width; k++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = 0; y < S; y++) for (let x = k * S; x < (k + 1) * S; x++) { const i = (y * width + x) * 4; if (src[i + 3] > 128) { r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; } }
        if (!n) continue;
        for (let y = 0; y < S; y++) for (let x = k * S; x < (k + 1) * S; x++) { const j = y * width + x; if (!filled[j]) { out[j * 4] = r / n; out[j * 4 + 1] = g / n; out[j * 4 + 2] = b / n; out[j * 4 + 3] = 0; } }
    }
    return out;
}
