/**
 * GrassAtlas.js — the painted look of every grass, herb, bush and little thing on the ground (GrassSpecies.js): one 1024² texture,
 * painted once at loading on a canvas with paths and gradients (no loop over pixels), kept for the whole game. Each kind has its
 * own drawing — tapered curved blades with a lighter midrib, dark at the root and sunlit at the tip; and its own head: timothy's
 * dense cylinder, feather grass's silver plumes, foxtail's soft brush, cattail's brown cigar, reed's purple panicle, quaking
 * grass's hanging hearts, foxtail barley's pink awns… Bushes are domes of veined leaves (with hips, berries, blossoms); the
 * litter four looks each (pebbles, dung, leaves, mushrooms, twigs and cones, a molehill).
 * The colours are their own (natural, a little muted); the land's colour tints them in the shader by each kind's `tint`.
 * Seeded randomness: the same picture on every computer and every start.
 */
import * as THREE from 'three';
import { ATLAS, GRASSES, CARPETS, BUSHES, FLOWERS } from './GrassSpecies.js';

let _tex = null;

function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;

/** A tapered, curved blade from (x, y) — length L px, leaning `lean` (rad from upright), bending `curl` (rad over its length). */
function blade(ctx, R, x, y, L, lean, curl, w, base, tip, rib = true) {
    const N = 7, left = [], right = [];
    let px = x, py = y, a = lean;
    const pts = [[px, py]];
    for (let i = 1; i <= N; i++) { a += curl / N; px += Math.sin(a) * L / N; py -= Math.cos(a) * L / N; pts.push([px, py]); }
    for (let i = 0; i <= N; i++) {
        const t = i / N, [qx, qy] = pts[i], [nx, ny] = pts[Math.min(N, i + 1)], [ox, oy] = pts[Math.max(0, i - 1)];
        let dx = nx - ox, dy = ny - oy; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const half = w * 0.5 * (1 - t) ** 0.7 * (1 - 0.15 * Math.sin(t * 9 + R()));
        left.push([qx - dy * half, qy + dx * half]); right.push([qx + dy * half, qy - dx * half]);
    }
    const g = ctx.createLinearGradient(x, y, pts[N][0], pts[N][1]);
    g.addColorStop(0, base); g.addColorStop(0.6, tip); g.addColorStop(1, tip);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(left[0][0], left[0][1]);
    for (const p of left) ctx.lineTo(p[0], p[1]);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath(); ctx.fill();
    if (rib && w > 2.6) { // the midrib: a faint lighter line (the blade is folded, not flat)
        ctx.strokeStyle = 'rgba(235,240,200,0.1)'; ctx.lineWidth = Math.max(0.5, w * 0.12);
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < N; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
    return pts[N];
}

/** A thin stem (a culm) from (x, y) to the head, a little curved; returns its top. */
function stem(ctx, x, y, L, lean, curl, col, w = 1.3) {
    let px = x, py = y, a = lean;
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, py);
    for (let i = 0; i < 8; i++) { a += curl / 8; px += Math.sin(a) * L / 8; py -= Math.cos(a) * L / 8; ctx.lineTo(px, py); }
    ctx.stroke();
    return [px, py, a];
}

/** A tuft's blades: n blades fanning from a root spread over `spread` px round the cell's foot. */
// (the author 21.11: «больше похоже на детскую графику, а не на серьёзную» — so: many more and thinner blades, muted natural colours,
// dry straw-coloured and yellowed blades among the green, broken tips, the back of the tuft darker than its front, and — in grain() —
// a mottled grain on every blade and the tuft's own shade at its foot)
function tuft(ctx, R, n, Lmin, Lmax, w, hue, sat, light, spread = 34, fan = 0.55, curl = 0.5) {
    n = Math.round(n * 2.4); w *= 0.55; sat *= 1.05; light *= 1.18;
    for (let i = 0; i < n; i++) {
        const back = i < n * 0.45; // (the first drawn are behind: darker, in the tuft's own shade)
        const t = R(), x = 64 + (t - 0.5) * spread * (0.6 + 0.4 * R()), lean = (t - 0.5) * 2 * fan + (R() - 0.5) * 0.35;
        let L = Lmin + (Lmax - Lmin) * R() ** 0.8, c = curl;
        const dry = R() < 0.04, broken = R() < 0.06; // (a few dry blades only: a living meadow, not a trampled one)
        if (broken) { L *= 0.55; c *= 2.2; }
        const h = dry ? 52 + R() * 10 : hue + 4 + (R() - 0.5) * 12, sa = dry ? 0.32 : sat * (0.95 + 0.35 * R());
        const l = (dry ? 0.5 : light + (R() - 0.5) * 0.12) * (back ? 0.72 : 1);
        // root dark and cool, the middle its colour, the tip a little paler and yellowed (sun-bleached), as real blades
        blade(ctx, R, x, 256, L, lean, Math.sign(lean || 1) * c * (0.4 + R()), w * (0.6 + 0.7 * R()), hsl(h - 4, sa * 0.9, l * 0.45), hsl(dry ? h : h + 2 + R() * 5, sa * (dry ? 1 : 0.95), l * (0.95 + R() * 0.12)), !back);
    }
}

/** The finish of a cell (grasses, carpets, bushes): a mottled grain on everything painted and the shade at the plant's foot. */
function grain(ctx, R, foot = 0.45) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    // (the author 21.11: «трава кажется грязной» — the grain is now a faint living sheen, not dark specks; the foot's shade a soft green dusk)
    for (let i = 0; i < 900; i++) {
        const d = R() < 0.4;
        ctx.fillStyle = d ? `rgba(20,50,15,${0.04 + R() * 0.06})` : `rgba(230,250,200,${0.05 + R() * 0.08})`;
        ctx.fillRect(R() * 128, R() * 256, 1, 1 + R() * 3);
    }
    const g = ctx.createLinearGradient(0, 256, 0, 256 * (1 - foot));
    g.addColorStop(0, 'rgba(14,40,12,0.32)'); g.addColorStop(0.5, 'rgba(14,40,12,0.08)'); g.addColorStop(1, 'rgba(14,40,12,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 256);
    ctx.restore();
}

/** Little spikelets stacked into a dense spike (timothy, foxtail, couch grass): from the top (x, y) down `len` px. */
function spike(ctx, R, x, y, a, len, w, col, dark, fluff = 0) {
    const dx = -Math.sin(a), dy = Math.cos(a);
    for (let i = 0; i < len; i += 1.6) {
        const t = i / len, r = w * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)));
        const cx = x + dx * i, cy = y + dy * i;
        ctx.fillStyle = R() < 0.3 ? dark : col;
        ctx.beginPath(); ctx.ellipse(cx + (R() - 0.5) * r, cy, r * 0.55, 1.6, a, 0, Math.PI * 2); ctx.fill();
        if (fluff) { ctx.strokeStyle = 'rgba(245,240,215,0.35)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (R() - 0.5) * fluff * 2, cy + (R() - 0.5) * fluff); ctx.stroke(); }
    }
}

/** A panicle: branching fine stalks with tiny spikelets (bentgrass, millet, reed, oat). */
function panicle(ctx, R, x, y, a, len, spread, col, seedCol, droop = 0, seeds = 3, seedR = 1.2) {
    for (let k = 0; k < 9; k++) {
        const t = k / 9, bx = x - Math.sin(a) * -len * t * 0.2, by = y + len * t;
        const side = k % 2 ? 1 : -1, bl = spread * (1 - t * 0.6) * (0.6 + 0.5 * R());
        const ex = bx + side * bl, ey = by - bl * 0.5 + droop * bl;
        ctx.strokeStyle = col; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo((bx + ex) / 2, by - bl * 0.4, ex, ey); ctx.stroke();
        for (let s = 0; s < seeds; s++) {
            const u = 0.4 + 0.6 * (s + 1) / seeds;
            ctx.fillStyle = seedCol;
            ctx.beginPath(); ctx.ellipse(bx + (ex - bx) * u, by + (ey - by) * u - bl * 0.15 * Math.sin(u * Math.PI), seedR, seedR * 1.8, side * 0.8 + droop, 0, Math.PI * 2); ctx.fill();
        }
    }
}

/** Fine silky hairs from a point (feather grass's awn, a plume). */
function hairs(ctx, R, x, y, n, L, a, spread, col, w = 0.6) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    for (let i = 0; i < n; i++) {
        const b = a + (R() - 0.5) * spread, l = L * (0.6 + 0.4 * R());
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.sin(b) * l * 0.5 + (R() - 0.5) * 6, y - Math.cos(b) * l * 0.5, x + Math.sin(b + 0.4) * l, y - Math.cos(b + 0.4) * l);
        ctx.stroke();
    }
}

/** A leaf: an ellipse with a point, a gradient from its base and a vein. */
function leaf(ctx, R, x, y, len, wid, a, light, dark, vein = true) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, 0, -len); g.addColorStop(0, dark); g.addColorStop(1, light);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(wid, -len * 0.25, wid * 0.9, -len * 0.75, 0, -len);
    ctx.bezierCurveTo(-wid * 0.9, -len * 0.75, -wid, -len * 0.25, 0, 0); ctx.fill();
    if (vein) { ctx.strokeStyle = 'rgba(255,255,220,0.25)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len * 0.92); ctx.stroke(); }
    ctx.restore();
}

const PAINT = {
    bluegrass(ctx, R) {
        tuft(ctx, R, 22, 110, 230, 4.2, 98, 0.45, 0.42, 52, 0.5, 0.6);
        for (let i = 0; i < 3; i++) { const [x, y, a] = stem(ctx, 50 + i * 14, 256, 200 + R() * 40, (R() - 0.5) * 0.4, (R() - 0.5) * 0.5, hsl(85, 0.35, 0.38)); panicle(ctx, R, x, y, a, 34, 12, hsl(80, 0.3, 0.45), hsl(90, 0.3, 0.55), 0.2, 2, 1); }
    },
    fescue(ctx, R) {
        tuft(ctx, R, 40, 90, 170, 1.8, 150, 0.22, 0.48, 30, 0.75, 0.9); // (fine, bluish, a round tussock)
        for (let i = 0; i < 2; i++) { const [x, y, a] = stem(ctx, 56 + i * 16, 256, 180 + R() * 30, (R() - 0.5) * 0.5, 0.3, hsl(70, 0.25, 0.5)); panicle(ctx, R, x, y, a, 24, 7, hsl(60, 0.25, 0.55), hsl(45, 0.3, 0.6), 0.3, 2, 0.9); }
    },
    timothy(ctx, R) {
        tuft(ctx, R, 14, 90, 175, 4.5, 95, 0.4, 0.4, 44, 0.16, 0.12); // (upright)
        for (let i = 0; i < 4; i++) { const [x, y, a] = stem(ctx, 44 + i * 12, 256, 170 + R() * 60, (R() - 0.5) * 0.35, (R() - 0.5) * 0.3, hsl(80, 0.32, 0.42), 1.5); spike(ctx, R, x, y, a, 36 + R() * 14, 5.5, hsl(75, 0.28, 0.5), hsl(60, 0.25, 0.38), 1.5); }
    },
    feather(ctx, R) {
        tuft(ctx, R, 26, 60, 120, 1.6, 70, 0.25, 0.5, 28, 0.6, 0.8);
        for (let i = 0; i < 6; i++) { // the long silver awns, flowing to one side
            const [x, y, a] = stem(ctx, 50 + i * 6, 256, 110 + R() * 30, (R() - 0.3) * 0.4, 0.2, hsl(55, 0.25, 0.55), 1);
            hairs(ctx, R, x, y, 36, 110 + R() * 30, a + 0.5, 0.45, 'rgba(232,230,214,0.28)', 0.5);
        }
    },
    foxtail(ctx, R) {
        tuft(ctx, R, 14, 70, 150, 4.8, 100, 0.42, 0.4, 40, 0.5, 0.5);
        for (let i = 0; i < 3; i++) { const [x, y, a] = stem(ctx, 48 + i * 16, 256, 160 + R() * 50, (R() - 0.5) * 0.4, 0.25, hsl(85, 0.3, 0.42), 1.5); spike(ctx, R, x, y, a, 30 + R() * 10, 7, hsl(95, 0.18, 0.62), hsl(280, 0.15, 0.45), 4); }
    },
    couch(ctx, R) {
        tuft(ctx, R, 14, 90, 180, 5, 105, 0.3, 0.42, 44, 0.14, 0.1); // (stiff, upright)
        for (let i = 0; i < 3; i++) { // an ear like wheat's, spikelets alternating
            const [x, y, a] = stem(ctx, 48 + i * 15, 256, 170 + R() * 40, (R() - 0.5) * 0.35, 0.2, hsl(80, 0.3, 0.45), 1.4);
            for (let k = 0; k < 8; k++) { ctx.fillStyle = hsl(70, 0.3, 0.5 + R() * 0.08); ctx.beginPath(); ctx.ellipse(x + (k % 2 ? 3 : -3), y + k * 5.5, 2.4, 4.2, k % 2 ? 0.45 : -0.45, 0, Math.PI * 2); ctx.fill(); }
        }
    },
    sedge(ctx, R) {
        tuft(ctx, R, 18, 120, 230, 5, 110, 0.42, 0.3, 40, 0.85, 1.1); // (dark, stiff, keeled — arching out)
        for (let i = 0; i < 2; i++) { const [x, y, a] = stem(ctx, 58 + i * 12, 256, 200, (R() - 0.5) * 0.25, 0.1, hsl(90, 0.3, 0.3), 1.6); spike(ctx, R, x, y, a, 18, 4, hsl(30, 0.35, 0.3), hsl(20, 0.3, 0.2)); spike(ctx, R, x + 4, y + 26, a + 0.3, 12, 3.5, hsl(70, 0.35, 0.35), hsl(60, 0.3, 0.25)); }
    },
    cattail(ctx, R) {
        tuft(ctx, R, 9, 170, 250, 7, 95, 0.32, 0.38, 26, 0.08, 0.06); // (straight swords)
        for (let i = 0; i < 2; i++) {
            const [x, y, a] = stem(ctx, 58 + i * 12, 256, 230, (R() - 0.5) * 0.1, 0.05, hsl(85, 0.3, 0.4), 2.2);
            const g = ctx.createLinearGradient(x - 5, 0, x + 5, 0); g.addColorStop(0, '#3b2414'); g.addColorStop(0.45, '#7a4e2c'); g.addColorStop(1, '#2d1a0e');
            ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x - 4.5, y + 8, 9, 40, 4.5); ctx.fill();
            ctx.strokeStyle = hsl(60, 0.25, 0.45); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y - 6); ctx.stroke(); // the thin tip above the cigar
        }
    },
    reed(ctx, R) {
        tuft(ctx, R, 10, 90, 200, 6, 92, 0.3, 0.42, 30, 0.6, 0.5); // (broad leaves standing out from the stalk)
        const [x, y, a] = stem(ctx, 64, 256, 205, 0.05, 0.1, hsl(60, 0.25, 0.48), 2.4);
        for (let k = 0; k < 7; k++) leaf(ctx, R, x - Math.sin(a) * (40 + k * 22), y + 40 + k * 22, 60, 5, (k % 2 ? 1 : -1) * (0.9 + R() * 0.3), hsl(95, 0.3, 0.48), hsl(90, 0.3, 0.32), false);
        for (let i = 0; i < 40; i++) hairs(ctx, R, x, y + 4 + R() * 30, 1, 30 + R() * 16, a + 0.9, 1.6, `rgba(${120 + R() * 30 | 0},${80 + R() * 20 | 0},${90 + R() * 30 | 0},0.6)`, 0.9); // (the purple-brown plume, bowing)
    },
    bent(ctx, R) {
        tuft(ctx, R, 26, 80, 150, 2.4, 88, 0.35, 0.44, 40, 0.6, 0.7);
        for (let i = 0; i < 5; i++) { const [x, y, a] = stem(ctx, 40 + i * 12, 256, 160 + R() * 50, (R() - 0.5) * 0.5, 0.2, hsl(20, 0.25, 0.42), 0.8); panicle(ctx, R, x, y, a, 40, 18, 'rgba(150,80,70,0.7)', 'rgba(170,90,80,0.8)', 0.1, 4, 0.8); } // (a reddish cloud)
    },
    cocksfoot(ctx, R) {
        tuft(ctx, R, 14, 90, 180, 5, 120, 0.3, 0.4, 44, 0.55, 0.5);
        for (let i = 0; i < 3; i++) {
            const [x, y, a] = stem(ctx, 46 + i * 16, 256, 180 + R() * 40, (R() - 0.5) * 0.4, 0.2, hsl(110, 0.25, 0.4), 1.4);
            for (let k = 0; k < 4; k++) { const cx = x + (k % 2 ? 7 : -6), cy = y + k * 10; ctx.fillStyle = hsl(95, 0.25, 0.45); ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = hsl(280, 0.18, 0.4); ctx.beginPath(); ctx.arc(cx + 1, cy - 1, 2, 0, Math.PI * 2); ctx.fill(); }
        }
    },
    smallreed(ctx, R) {
        tuft(ctx, R, 18, 110, 200, 3.6, 70, 0.35, 0.45, 40, 0.15, 0.12); // (an upright sheaf)
        for (let i = 0; i < 4; i++) { const [x, y, a] = stem(ctx, 46 + i * 12, 256, 190 + R() * 40, (R() - 0.5) * 0.3, 0.15, hsl(45, 0.35, 0.5), 1.2); spike(ctx, R, x, y, a, 50, 6, hsl(45, 0.45, 0.62), hsl(35, 0.4, 0.48), 3); } // (golden narrow plumes)
    },
    matgrass(ctx, R) { tuft(ctx, R, 46, 70, 150, 1.4, 75, 0.2, 0.52, 26, 0.9, 1.2); }, // (wiry, grey-green, a stiff bristly mat)
    wildoat(ctx, R) {
        tuft(ctx, R, 12, 80, 160, 4.4, 80, 0.32, 0.45, 40, 0.5, 0.4);
        for (let i = 0; i < 3; i++) { const [x, y, a] = stem(ctx, 50 + i * 14, 256, 190 + R() * 30, (R() - 0.5) * 0.3, 0.2, hsl(55, 0.3, 0.52), 1.2); panicle(ctx, R, x, y, a, 50, 16, hsl(55, 0.3, 0.55), hsl(50, 0.45, 0.62), 1.2, 2, 2.4); } // (drooping spikelets)
    },
    quaking(ctx, R) {
        tuft(ctx, R, 14, 60, 120, 3.4, 95, 0.35, 0.44, 36, 0.5, 0.4);
        for (let i = 0; i < 3; i++) {
            const [x, y, a] = stem(ctx, 48 + i * 15, 256, 160 + R() * 40, (R() - 0.5) * 0.4, 0.2, hsl(80, 0.25, 0.45), 0.9);
            for (let k = 0; k < 7; k++) { // little hanging hearts on hair-thin stalks
                const ex = x + (R() - 0.5) * 30, ey = y + R() * 30;
                ctx.strokeStyle = 'rgba(90,100,60,0.6)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
                ctx.fillStyle = R() < 0.5 ? hsl(70, 0.25, 0.55) : hsl(20, 0.35, 0.45);
                ctx.beginPath(); ctx.ellipse(ex, ey + 4, 3.4, 4.6, 0, 0, Math.PI * 2); ctx.fill();
            }
        }
    },
    foxbarley(ctx, R) {
        tuft(ctx, R, 14, 60, 120, 3, 85, 0.3, 0.44, 36, 0.5, 0.5);
        for (let i = 0; i < 4; i++) { const [x, y, a] = stem(ctx, 46 + i * 12, 256, 140 + R() * 40, (R() - 0.5) * 0.4, 0.3, hsl(60, 0.25, 0.48), 0.9); hairs(ctx, R, x, y + 10, 30, 46, a + 0.3, 1.0, 'rgba(220,140,170,0.55)', 0.7); } // (the long pink awns)
    },
    harestail(ctx, R) {
        tuft(ctx, R, 14, 40, 90, 3.2, 85, 0.25, 0.5, 36, 0.6, 0.5);
        for (let i = 0; i < 4; i++) {
            const [x, y] = stem(ctx, 44 + i * 13, 256, 110 + R() * 40, (R() - 0.5) * 0.4, 0.2, hsl(70, 0.2, 0.55), 1);
            const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 9); g.addColorStop(0, '#fffdf4'); g.addColorStop(1, 'rgba(225,220,200,0.6)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 6.5, 10, 0, 0, Math.PI * 2); ctx.fill(); // (the soft white oval)
        }
    },
    millet(ctx, R) {
        tuft(ctx, R, 16, 80, 160, 4.6, 105, 0.38, 0.38, 44, 0.5, 0.5);
        for (let i = 0; i < 3; i++) { const [x, y, a] = stem(ctx, 46 + i * 16, 256, 180 + R() * 40, (R() - 0.5) * 0.4, 0.2, hsl(95, 0.3, 0.4), 0.8); panicle(ctx, R, x, y, a, 46, 24, 'rgba(110,130,70,0.6)', 'rgba(150,165,100,0.85)', 0.2, 2, 1.1); }
    },
    elephant(ctx, R) { tuft(ctx, R, 14, 160, 250, 9, 100, 0.42, 0.36, 50, 0.6, 1.0); }, // (broad arching blades)
    moonsedge(ctx, R) {
        for (let i = 0; i < 18; i++) { const t = (i + R()) / 18; blade(ctx, R, 64 + (t - 0.5) * 40, 256, 120 + R() * 100, (t - 0.5) * 1.4, (t - 0.5) * 1.2, 4.5, hsl(200, 0.4, 0.25), hsl(175, 0.6, 0.62)); }
        for (let i = 0; i < 14; i++) { ctx.fillStyle = 'rgba(170,255,250,0.85)'; ctx.beginPath(); ctx.arc(30 + R() * 68, 30 + R() * 110, 1.2 + R() * 1.4, 0, Math.PI * 2); ctx.fill(); } // (glowing droplets on the tips)
    },
    // —— the carpets (the lower square: x 0…128, y 128…256) ——
    sward(ctx, R) { // dense, straight, edge to edge — standing like a brush; a few taller stalks and seed heads above the line
        tuft(ctx, R, 64, 150, 245, 3.2, 96, 0.44, 0.46, 136, 0.06, 0.08);
        for (let i = 0; i < 7; i++) { const [x, y, a] = stem(ctx, 8 + R() * 112, 256, 230 + R() * 20, (R() - 0.5) * 0.08, (R() - 0.5) * 0.1, hsl(75, 0.28, 0.45), 1); spike(ctx, R, x, y, a, 14 + R() * 10, 2.6, hsl(65, 0.25, 0.52), hsl(50, 0.25, 0.4)); }
    },
    turf(ctx, R) { tuft(ctx, R, 70, 60, 125, 3.4, 92, 0.42, 0.44, 136, 0.1, 0.12); }, // (a dense short sward, edge to edge: the cards side by side read as a lawn)
    clover(ctx, R) {
        tuft(ctx, R, 22, 40, 90, 2.6, 95, 0.36, 0.42, 120, 0.4, 0.4); // (the grass the clover grows among)
        for (let i = 0; i < 16; i++) {
            const x = 10 + R() * 108, y = 160 + R() * 86;
            ctx.strokeStyle = hsl(100, 0.3, 0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (R() - 0.5) * 6, 256); ctx.stroke();
            for (let k = 0; k < 3; k++) { const b = k * 2.094 + R(); const cx = x + Math.cos(b) * 5, cy = y + Math.sin(b) * 3.6; ctx.fillStyle = hsl(105 + R() * 15, 0.26, 0.3 + R() * 0.08); ctx.beginPath(); ctx.ellipse(cx, cy, 4.8, 3.6, b, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(210,225,200,0.28)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, cy, 2.4, b + 2.4, b + 3.9); ctx.stroke(); }
        }
        for (let i = 0; i < 3; i++) { const x = 20 + R() * 88, y = 140 + R() * 40, c = R() < 0.5 ? [250, 245, 240] : [215, 120, 160]; for (let k = 0; k < 22; k++) { ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.9)`; ctx.beginPath(); ctx.ellipse(x + (R() - 0.5) * 10, y + (R() - 0.5) * 10, 1.4, 3, R() * 3, 0, Math.PI * 2); ctx.fill(); } }
    },
    moss(ctx, R) {
        for (let i = 0; i < 26; i++) { const x = R() * 128, y = 200 + R() * 50, r = 8 + R() * 16; const g = ctx.createRadialGradient(x, y - r * 0.4, 1, x, y, r); g.addColorStop(0, hsl(85, 0.5, 0.42)); g.addColorStop(1, hsl(100, 0.45, 0.18)); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, Math.PI, 0); ctx.fill(); }
        for (let i = 0; i < 300; i++) { ctx.fillStyle = hsl(80 + R() * 30, 0.5, 0.3 + R() * 0.25, 0.8); ctx.fillRect(R() * 128, 190 + R() * 66, 1.2, 1.2); }
        for (let i = 0; i < 18; i++) { const x = R() * 128, y = 190 + R() * 40; ctx.strokeStyle = 'rgba(160,110,60,0.7)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x, y); ctx.stroke(); ctx.fillStyle = '#8a5a2a'; ctx.fillRect(x - 0.8, y - 2, 1.6, 2.6); } // (the spore capsules)
    },
    herbs(ctx, R) {
        for (let k = 0; k < 7; k++) leaf(ctx, R, 40, 254, 50 + R() * 20, 11, -1.3 + k * 0.42, hsl(105, 0.3, 0.42), hsl(105, 0.3, 0.24)); // (a plantain's rosette)
        const [x, y] = stem(ctx, 40, 250, 90, 0.05, 0, hsl(90, 0.25, 0.3), 1.4); spike(ctx, R, x, y, 0, 30, 3.4, hsl(60, 0.2, 0.42), hsl(45, 0.25, 0.3));
        const [yx, yy] = stem(ctx, 92, 256, 110, -0.05, 0.05, hsl(100, 0.25, 0.4), 1.3); // yarrow: feathery leaves, a flat white umbel
        for (let k = 0; k < 6; k++) hairs(ctx, R, yx, 256 - k * 14, 6, 14, k % 2 ? 1.2 : -1.2, 0.5, hsl(100, 0.3, 0.38), 1.2);
        for (let k = 0; k < 26; k++) { ctx.fillStyle = 'rgba(250,248,238,0.95)'; ctx.beginPath(); ctx.arc(yx + (R() - 0.5) * 22, yy + (R() - 0.5) * 6, 2.1, 0, Math.PI * 2); ctx.fill(); }
    },
    fern(ctx, R) {
        for (let f = 0; f < 6; f++) { // fronds arching out, leaflets in pairs getting smaller to the tip
            const a0 = (f / 5 - 0.5) * 2.2;
            let px = 64, py = 256, a = a0 * 0.4;
            for (let k = 0; k < 14; k++) {
                const step = 9 - k * 0.3; a += a0 * 0.06; px += Math.sin(a) * step; py -= Math.cos(a) * step;
                const l = 26 * (1 - k / 15);
                leaf(ctx, R, px, py, l, 3.4, a + 1.35, hsl(110, 0.42, 0.42), hsl(110, 0.42, 0.24), false);
                leaf(ctx, R, px, py, l, 3.4, a - 1.35, hsl(110, 0.42, 0.42), hsl(110, 0.42, 0.24), false);
            }
        }
    },
    // —— the bushes (the lower square) ——
    hazel(ctx, R) { bushDome(ctx, R, 100, 0.33, 0.36, 18, 9); },
    dogrose(ctx, R) {
        bushDome(ctx, R, 110, 0.35, 0.33, 12, 6);
        for (let i = 0; i < 12; i++) { const x = 20 + R() * 88, y = 150 + R() * 90; ctx.fillStyle = '#b8231a'; ctx.beginPath(); ctx.ellipse(x, y, 3.2, 4.6, R(), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,220,200,0.6)'; ctx.fillRect(x - 1, y - 2.5, 1.2, 1.2); } // hips
        for (let i = 0; i < 6; i++) { const x = 20 + R() * 88, y = 145 + R() * 80; for (let k = 0; k < 5; k++) { ctx.fillStyle = 'rgba(240,160,190,0.95)'; ctx.beginPath(); ctx.arc(x + Math.cos(k * 1.26) * 3.5, y + Math.sin(k * 1.26) * 3.5, 3, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#f2d24a'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill(); } // blossoms
    },
    blueberry(ctx, R) {
        bushDome(ctx, R, 120, 0.42, 0.3, 7, 4);
        for (let i = 0; i < 20; i++) { const x = 14 + R() * 100, y = 170 + R() * 80; ctx.fillStyle = '#2c3570'; ctx.beginPath(); ctx.arc(x, y, 2.8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(180,190,230,0.55)'; ctx.beginPath(); ctx.arc(x - 0.9, y - 0.9, 1, 0, Math.PI * 2); ctx.fill(); }
    },
    juniper(ctx, R) {
        const body = ctx.createLinearGradient(30, 0, 100, 0); body.addColorStop(0, hsl(150, 0.3, 0.1)); body.addColorStop(0.6, hsl(140, 0.3, 0.2)); body.addColorStop(1, hsl(150, 0.3, 0.09));
        ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(64, 132); ctx.quadraticCurveTo(118, 220, 108, 254); ctx.lineTo(20, 254); ctx.quadraticCurveTo(10, 220, 64, 132); ctx.fill(); // (the dense dark body of a juniper's cone)
        for (let i = 0; i < 2600; i++) { const t = R(), x = 64 + (R() - 0.5) * 100 * (1 - t * 0.8), y = 252 - t * 118; ctx.strokeStyle = hsl(140 + R() * 25, 0.32, 0.14 + R() * 0.24); ctx.lineWidth = 1; const a = R() * 6.28; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4); ctx.stroke(); }
        for (let i = 0; i < 14; i++) { const x = 20 + R() * 88, y = 150 + R() * 96; ctx.fillStyle = '#4a5f8c'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(210,220,240,0.5)'; ctx.beginPath(); ctx.arc(x - 0.6, y - 0.7, 0.9, 0, Math.PI * 2); ctx.fill(); }
    },
};

/** A bush's dome of leaves: dark deep inside, lit at the edges and on top; `n` leaves, hue/sat/light, leaf length and width. */
function bushDome(ctx, R, hue, sat, light, len, wid) {
    const g = ctx.createRadialGradient(64, 210, 10, 64, 210, 70); g.addColorStop(0, hsl(hue, sat, light * 0.35)); g.addColorStop(1, hsl(hue, sat, light * 0.5, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(64, 205, 58, 50, 0, 0, Math.PI * 2); ctx.fill(); // (the shade inside the bush)
    for (let i = 0; i < 520; i++) {
        const a = R() * Math.PI * 2, rr = Math.sqrt(R());
        const x = 64 + Math.cos(a) * 58 * rr, y = 205 + Math.sin(a) * 50 * rr;
        if (y > 254) continue;
        const lit = 0.5 + 0.5 * (-(y - 205) / 50 * 0.6 + rr * 0.5); // (top and edge lighter)
        leaf(ctx, R, x, y, len * (0.7 + 0.5 * R()), wid * (0.7 + 0.5 * R()), a + Math.PI / 2 + (R() - 0.5), hsl(hue + (R() - 0.5) * 12, sat, light * (0.7 + 0.6 * lit)), hsl(hue, sat, light * 0.45), i % 3 === 0);
    }
    ctx.strokeStyle = 'rgba(70,50,30,0.8)'; ctx.lineWidth = 2; // a few twigs showing at the foot
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(64 + (i - 2) * 6, 256); ctx.lineTo(64 + (i - 2) * 14, 230); ctx.stroke(); }
}

/** The litter (cell 29 pebbles / dung, 30 leaves / mushrooms, 31 twigs / molehill): four looks each in a 2 × 2 of 64 px quarters. */
function paintLitter(ctx, R, cell, top) {
    for (let q = 0; q < 4; q++) {
        ctx.save(); ctx.translate((q % 2) * 64, (top ? 0 : 128) + Math.floor(q / 2) * 64);
        ctx.beginPath(); ctx.rect(0, 0, 64, 64); ctx.clip();
        LITTER_PAINT[cell][top ? 0 : 1](ctx, R, q);
        ctx.restore();
    }
}
const LITTER_PAINT = {
    29: [
        (ctx, R) => { for (let i = 0; i < 3 + R() * 4; i++) { const x = 12 + R() * 40, y = 12 + R() * 40, r = 4 + R() * 8; const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 1, x, y, r); const l = 0.35 + R() * 0.3; g.addColorStop(0, hsl(30, 0.08, l + 0.2)); g.addColorStop(1, hsl(30, 0.1, l * 0.55)); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.6 + R() * 0.3), R() * 3, 0, Math.PI * 2); ctx.fill(); } },
        (ctx, R) => { // dung: a cowpat's rings or a horse's balls, dark and glossy at the middle, dried pale at the rim, a few straws
            if (R() < 0.6) { for (let k = 0; k < 4; k++) { const r = 24 - k * 5; ctx.fillStyle = hsl(30, 0.3, 0.16 + k * 0.035); ctx.beginPath(); ctx.ellipse(32 + (R() - 0.5) * 3, 32 + (R() - 0.5) * 3, r, r * 0.8, R(), 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = 'rgba(255,250,220,0.15)'; ctx.beginPath(); ctx.ellipse(28, 28, 5, 3, 0.5, 0, Math.PI * 2); ctx.fill(); }
            else for (let k = 0; k < 6; k++) { const x = 18 + R() * 28, y = 18 + R() * 28; const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 7); g.addColorStop(0, '#6a5230'); g.addColorStop(1, '#2e2210'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); }
            ctx.strokeStyle = 'rgba(200,180,110,0.7)'; ctx.lineWidth = 0.8; for (let k = 0; k < 5; k++) { const x = 12 + R() * 40, y = 12 + R() * 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (R() - 0.5) * 14, y + (R() - 0.5) * 14); ctx.stroke(); }
        },
    ],
    30: [
        (ctx, R) => { for (let i = 0; i < 6; i++) { const hue = 15 + R() * 40; leaf(ctx, R, 10 + R() * 44, 10 + R() * 44, 16 + R() * 10, 6 + R() * 3, R() * 6.28, hsl(hue, 0.6, 0.45), hsl(hue - 8, 0.55, 0.25)); } },
        (ctx, R, q) => { // a few mushrooms seen from the side: a cap, its gills' shade, a pale stem
            const red = q === 1; for (let i = 0; i < 2 + (q % 2); i++) { const x = 16 + i * 16 + R() * 6, h = 18 + R() * 16, w = 9 + R() * 6; ctx.fillStyle = '#efe6d2'; ctx.fillRect(x - 2.5, 64 - h, 5, h); const capY = 64 - h; ctx.fillStyle = red ? '#c42a1e' : hsl(28, 0.5, 0.32 + R() * 0.1); ctx.beginPath(); ctx.ellipse(x, capY, w, w * 0.6, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = 'rgba(60,40,20,0.5)'; ctx.fillRect(x - w, capY, w * 2, 2); if (red) for (let k = 0; k < 5; k++) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + (R() - 0.5) * w * 1.4, capY - R() * w * 0.4, 1.3, 0, Math.PI * 2); ctx.fill(); } }
        },
    ],
    31: [
        (ctx, R, q) => { ctx.lineCap = 'round'; for (let i = 0; i < 3; i++) { ctx.strokeStyle = hsl(28, 0.35, 0.22 + R() * 0.1); ctx.lineWidth = 2 + R() * 2; const x = 6 + R() * 50, y = 6 + R() * 50, a = R() * 6.28, l = 20 + R() * 26; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); } if (q > 1) for (let i = 0; i < 2; i++) { const x = 16 + R() * 32, y = 16 + R() * 32; ctx.save(); ctx.translate(x, y); ctx.rotate(R() * 6.28); for (let k = 0; k < 7; k++) { ctx.fillStyle = hsl(25, 0.45, 0.22 + (k % 2) * 0.08); ctx.beginPath(); ctx.ellipse(0, -8 + k * 2.6, 4.5 - Math.abs(k - 3) * 0.6, 1.8, 0, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); } },
        (ctx, R) => { const g = ctx.createRadialGradient(28, 26, 2, 32, 32, 30); g.addColorStop(0, '#6a4a2c'); g.addColorStop(0.7, '#3e2a18'); g.addColorStop(1, 'rgba(50,35,20,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill(); for (let k = 0; k < 40; k++) { ctx.fillStyle = hsl(28, 0.35, 0.15 + R() * 0.25); ctx.fillRect(10 + R() * 44, 10 + R() * 44, 2 + R() * 3, 2 + R() * 2); } }, // a molehill's crumbly earth
    ],
};


/** A blossom seen a little from the side: petals round a centre, each petal shaded from its base, a darker centre with a highlight. */
function blossom(ctx, R, x, y, n, len, wid, col, dark, centre, tilt = 0.55, cup = 0) {
    for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + R() * 0.3;
        ctx.save(); ctx.translate(x, y); ctx.scale(1, tilt); ctx.rotate(a);
        const g = ctx.createLinearGradient(0, 0, 0, -len); g.addColorStop(0, dark); g.addColorStop(0.4, col); g.addColorStop(1, col);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(wid, -len * 0.3, wid * (1 - cup), -len * 0.95, 0, -len); ctx.bezierCurveTo(-wid * (1 - cup), -len * 0.95, -wid, -len * 0.3, 0, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0, -len * 0.15); ctx.lineTo(0, -len * 0.8); ctx.stroke();
        ctx.restore();
    }
    if (centre) { const g = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, len * 0.35); g.addColorStop(0, centre[0]); g.addColorStop(1, centre[1]); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, len * 0.32, len * 0.32 * tilt, 0, 0, Math.PI * 2); ctx.fill(); }
}
/** A flower's stem with a couple of leaves; returns its top. */
function flowerStem(ctx, R, x, L, lean, leafCol) {
    const [tx, ty, a] = stem(ctx, x, 256, L, lean, (R() - 0.5) * 0.3, 'hsl(100,32%,30%)', 1.6);
    for (let k = 0; k < 2; k++) leaf(ctx, R, x + Math.sin(lean) * L * (0.2 + 0.25 * k), 256 - L * (0.2 + 0.25 * k), 18 + R() * 10, 4, (k ? 1 : -1) * (0.9 + R() * 0.4), leafCol, 'hsl(105,30%,22%)');
    return [tx, ty, a];
}
const FLOWER_PAINT = {
    poppy(ctx, R) { tuft(ctx, R, 6, 40, 90, 2.6, 100, 0.4, 0.42, 60, 0.5, 0.4); for (let i = 0; i < 3; i++) { const [x, y] = flowerStem(ctx, R, 40 + i * 24, 150 + R() * 70, (R() - 0.5) * 0.4, 'hsl(100,35%,38%)'); blossom(ctx, R, x, y, 4, 15, 13, '#d8281c', '#7a120c', ['#2a1810', '#100806'], 0.6, 0.1); } },
    cornflower(ctx, R) { tuft(ctx, R, 6, 40, 90, 2.4, 100, 0.35, 0.42, 60, 0.5, 0.4); for (let i = 0; i < 3; i++) { const [x, y] = flowerStem(ctx, R, 40 + i * 24, 140 + R() * 70, (R() - 0.5) * 0.4, 'hsl(140,18%,45%)'); blossom(ctx, R, x, y, 9, 11, 3.6, '#4a72e0', '#26388a', ['#3a2a6a', '#201640'], 0.6, -0.3); } },
    buttercup(ctx, R) { tuft(ctx, R, 6, 30, 80, 2.4, 100, 0.4, 0.42, 60, 0.5, 0.4); for (let i = 0; i < 4; i++) { const [x, y] = flowerStem(ctx, R, 32 + i * 20, 110 + R() * 70, (R() - 0.5) * 0.5, 'hsl(100,35%,38%)'); blossom(ctx, R, x, y, 5, 8, 6, '#f6d22a', '#b88a10', ['#e8b820', '#a07010'], 0.6, 0.2); ctx.fillStyle = 'rgba(255,255,230,0.6)'; ctx.fillRect(x - 3, y - 4, 2, 1.4); } },
    daisy(ctx, R) { tuft(ctx, R, 6, 30, 80, 2.4, 100, 0.4, 0.42, 60, 0.5, 0.4); for (let i = 0; i < 3; i++) { const [x, y] = flowerStem(ctx, R, 40 + i * 24, 130 + R() * 80, (R() - 0.5) * 0.4, 'hsl(100,35%,38%)'); blossom(ctx, R, x, y, 16, 13, 2.4, '#f8f6ee', '#c8c4b8', ['#f6d040', '#c08a10'], 0.55); } },
    clover(ctx, R) { tuft(ctx, R, 8, 30, 70, 2.4, 100, 0.4, 0.42, 70, 0.5, 0.4); for (let i = 0; i < 4; i++) { const [x, y] = flowerStem(ctx, R, 30 + i * 22, 90 + R() * 60, (R() - 0.5) * 0.5, 'hsl(110,30%,36%)'); for (let k = 0; k < 30; k++) { const a = R() * 6.28, rr = R() * 9; ctx.fillStyle = `hsl(${325 + R() * 15},${55 + R() * 15}%,${55 + R() * 20}%)`; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9, 1.6, 3.4, a, 0, Math.PI * 2); ctx.fill(); } } },
    bellflower(ctx, R) {
        tuft(ctx, R, 6, 40, 90, 2.4, 100, 0.35, 0.42, 60, 0.5, 0.4);
        for (let i = 0; i < 2; i++) { const [x, y, a] = flowerStem(ctx, R, 50 + i * 28, 170 + R() * 50, (R() - 0.5) * 0.3, 'hsl(100,30%,36%)');
            for (let k = 0; k < 4; k++) { const bx = x + (k % 2 ? 9 : -7), by = y + k * 16; ctx.strokeStyle = 'hsl(100,30%,30%)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - Math.sin(a) * k * 16, y + k * 16); ctx.quadraticCurveTo(bx, by - 6, bx, by); ctx.stroke();
                const g = ctx.createLinearGradient(bx - 6, 0, bx + 6, 0); g.addColorStop(0, '#5a3a9a'); g.addColorStop(0.5, '#9a7ae0'); g.addColorStop(1, '#4a2c86'); ctx.fillStyle = g;
                ctx.beginPath(); ctx.moveTo(bx - 3, by); ctx.quadraticCurveTo(bx - 7, by + 10, bx - 8, by + 14); ctx.lineTo(bx - 4, by + 12); ctx.lineTo(bx, by + 15); ctx.lineTo(bx + 4, by + 12); ctx.lineTo(bx + 8, by + 14); ctx.quadraticCurveTo(bx + 7, by + 10, bx + 3, by); ctx.closePath(); ctx.fill(); } }
    },
    hawkweed(ctx, R) { tuft(ctx, R, 6, 30, 70, 2.4, 100, 0.4, 0.42, 60, 0.5, 0.4); for (let i = 0; i < 3; i++) { const [x, y] = flowerStem(ctx, R, 40 + i * 24, 140 + R() * 70, (R() - 0.5) * 0.4, 'hsl(100,30%,38%)'); blossom(ctx, R, x, y, 14, 10, 2.8, '#f08a22', '#a0400c', ['#d06010', '#803008'], 0.6); } },
    moonbloom(ctx, R) { for (let i = 0; i < 3; i++) { const [x, y] = flowerStem(ctx, R, 40 + i * 24, 140 + R() * 70, (R() - 0.5) * 0.4, 'hsl(190,40%,34%)'); blossom(ctx, R, x, y, 6, 13, 7, '#9ff6ff', '#2a80a0', ['#ffffff', '#80e8ff'], 0.6, 0.1); } },
};

/** The atlas texture (made on the first call: ~0.1 s at the loading screen; the same thereafter). */
export function grassAtlas() {
    if (_tex) return _tex;
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!cv) return null;
    cv.width = ATLAS.W; cv.height = ATLAS.H;
    const ctx = cv.getContext('2d');
    for (const k of [...GRASSES, ...CARPETS, ...BUSHES]) {
        const c = k.cell % ATLAS.COLS, r = Math.floor(k.cell / ATLAS.COLS);
        ctx.save(); ctx.translate(c * ATLAS.CW, r * ATLAS.CH);
        ctx.beginPath(); ctx.rect(0, 0, ATLAS.CW, ATLAS.CH); ctx.clip();
        const R = rng(1000 + k.cell * 7919);
        PAINT[k.id]?.(ctx, R);
        if (k.id !== 'moonsedge') grain(ctx, R, k.r ? 0.3 : k.per ? 0.6 : 0.45);
        ctx.restore();
    }
    for (const k of FLOWERS) {
        const c = k.cell % ATLAS.COLS, r = Math.floor(k.cell / ATLAS.COLS);
        ctx.save(); ctx.translate(c * ATLAS.CW, r * ATLAS.CH);
        ctx.beginPath(); ctx.rect(0, 0, ATLAS.CW, ATLAS.CH); ctx.clip();
        const R = rng(3000 + k.cell * 131);
        FLOWER_PAINT[k.id]?.(ctx, R);
        if (!k.glow) grain(ctx, R, 0.4);
        ctx.restore();
    }
    for (const cell of [29, 30, 31]) for (const top of [true, false]) {
        const c = cell % ATLAS.COLS, r = Math.floor(cell / ATLAS.COLS);
        ctx.save(); ctx.translate(c * ATLAS.CW, r * ATLAS.CH);
        paintLitter(ctx, rng(5000 + cell * 31 + (top ? 0 : 7)), cell, top);
        ctx.restore();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.premultiplyAlpha = true; // (mipmaps average the colour with its alpha: no dark rim round the blades far away — the shader divides it back)
    tex.userData = { ...(tex.userData || {}), keep: true };
    return (_tex = tex);
}
