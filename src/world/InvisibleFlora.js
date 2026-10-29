/**
 * InvisibleFlora.js — «Трава Беслана»: a plant of the invisible world (pure, no THREE — a terrain worker can make it too).
 *
 * Only a hero who sees the invisible (SecondSight.js) sees it; it is drawn by BeslanGrass.js, one mesh per chunk, and nothing
 * else of the game knows about it (no collision: it is grass — a hand passes through it and plucks it).
 *
 * What it is: not a reed, though it is built a little like one — thin jointed stems, long ribbon leaves that arch and droop at
 * their tips, and at the top of each stem a feathery plume (a central spike with drooping side spikelets, like pampas grass):
 * pale aqua-white, with violet tips, glowing (the plume and the leaf edges carry `glow`). Low tufts (0.6–1.4 m) and tall ones
 * (2.2–3.6 m) grow in drifts; by the water and in damp low meadows they grow thicker.
 *
 * The same arrays as FloraBuild.buildFlora gives (pos, nor, col, sway, glow), so a tuft is one more kind of geometry.
 */
import { BLOCK, CHUNK, MIN_LAYER } from './Terrain.js';
import { hashLand } from './Landscape.js';

export const BESLAN = {
    SEED: 7311, // added to the world's seed: the places are the world's own
    DENSITY: 0.012, // tufts a block on the average (× the drift's thickness 0.15…1.9)
    TALL_SHARE: 0.28, // of the tufts: tall ones
    LOW: [0.6, 1.4], TALL: [2.2, 3.6], // m
    WATER_BONUS: 2.4, // × near the water
    FAR: 85, // m: farther than this a tuft is not drawn (BeslanGrass.js)
    MAX_TUFTS: 24, // a chunk (CHUNK² blocks) has at most so many
};

const TAU = Math.PI * 2;

/** Drifts: thick patches and bare ones (smooth over ~14 m). */
function drift(x, z, seed) {
    const X = x / 14, Z = z / 14, ix = Math.floor(X), iz = Math.floor(Z), fx = X - ix, fz = Z - iz;
    const u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
    const a = hashLand(ix, iz, seed), b = hashLand(ix + 1, iz, seed), c = hashLand(ix, iz + 1, seed), d = hashLand(ix + 1, iz + 1, seed);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

const _buf = { pos: null, nor: null, col: null, sway: null, glow: null, cap: 0 };

/**
 * A ribbon of three-vertex rows (left edge, rib, right edge) written as triangles: `rows`: [{ p: [x, y, z], n: [nx, nz] (the horizontal sideways), hw (half width),
 * cE (edge colour), cM (rib colour), g (glow 0…1), sw (sway) }]. The rib is lighter and glows more than the edges, so a leaf reads as a leaf, not a flat tape.
 */
function strip(w, rows, rib = true) {
    for (let i = 0; i + 1 < rows.length; i++) {
        const a = rows[i], b = rows[i + 1];
        const L0 = [a.p[0] - a.n[0] * a.hw, a.p[1], a.p[2] - a.n[1] * a.hw], R0 = [a.p[0] + a.n[0] * a.hw, a.p[1], a.p[2] + a.n[1] * a.hw];
        const L1 = [b.p[0] - b.n[0] * b.hw, b.p[1], b.p[2] - b.n[1] * b.hw], R1 = [b.p[0] + b.n[0] * b.hw, b.p[1], b.p[2] + b.n[1] * b.hw];
        const v = (q, r, c, gl) => w.vert(q[0], q[1], q[2], c[0], c[1], c[2], r.sw, gl);
        if (!rib) { // (a thin blade: two triangles, the colour of its middle)
            v(L0, a, a.cM, a.g); v(R0, a, a.cM, a.g); v(R1, b, b.cM, b.g);
            v(L0, a, a.cM, a.g); v(R1, b, b.cM, b.g); v(L1, b, b.cM, b.g);
            continue;
        }
        v(L0, a, a.cE, a.g * 0.5); v(a.p, a, a.cM, a.g); v(L1, b, b.cE, b.g * 0.5);
        v(a.p, a, a.cM, a.g); v(b.p, b, b.cM, b.g); v(L1, b, b.cE, b.g * 0.5);
        v(a.p, a, a.cM, a.g); v(R0, a, a.cE, a.g * 0.5); v(b.p, b, b.cM, b.g);
        v(R0, a, a.cE, a.g * 0.5); v(R1, b, b.cE, b.g * 0.5); v(b.p, b, b.cM, b.g);
    }
}

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul3 = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

/**
 * One tuft written into the arrays (a writer `w` = { vert(x, y, z, r, g, b, sway, glow) }), rooted at (x, y, z), `H` tall. Pure.
 * `rnd(i)` gives the tuft's own numbers in 0…1.
 */
export function writeTuft(w, x, y, z, H, rnd) {
    const tallK = H > 2 ? 1 : 0, stems = tallK ? 2 + Math.floor(rnd(1) * 2) : 3 + Math.floor(rnd(1) * 3);
    for (let s = 0; s < stems; s++) {
        const a = rnd(10 + s) * TAU, spread = 0.05 + 0.2 * rnd(20 + s) * (1 + 0.6 * tallK);
        const h = H * (0.72 + 0.4 * rnd(30 + s));
        const bx = x + Math.cos(a) * spread * 0.4, bz = z + Math.sin(a) * spread * 0.4;
        const lean = (0.04 + 0.12 * rnd(40 + s)) * h, dx = Math.cos(a), dz = Math.sin(a);
        const tone = 0.85 + 0.3 * rnd(50 + s);
        const wd = 0.009 + 0.006 * tallK;
        // the stem: three joints, a thin ribbon seen from every side (two crossed), deep teal at the root, pale aqua at the top
        const J = 3, pts = [];
        for (let j = 0; j <= J; j++) { const t = j / J; pts.push([bx + dx * lean * t * t, y + h * t, bz + dz * lean * t * t, t]); }
        for (let face = 0; face < 2; face++) {
            const fa = face * Math.PI / 2, sx = Math.cos(fa) * -dz + Math.sin(fa) * dx, sz = Math.cos(fa) * dx + Math.sin(fa) * dz;
            strip(w, pts.map(([px, py, pz, t]) => ({ p: [px, py, pz], n: [sx, sz], hw: wd * (1 - 0.5 * t), cE: mul3(lerp3([0.05, 0.36, 0.42], [0.3, 0.8, 0.82], t), tone), cM: mul3(lerp3([0.12, 0.55, 0.58], [0.55, 0.98, 0.95], t), tone), g: 0.05 + 0.2 * t, sw: py - y })), false);
        }
        // the ribbon leaves: two from the lower stem, arching out and drooping at the tip; a lighter glowing rib, deeper edges, a pale tip
        for (let l = 0; l < 2; l++) {
            const la = a + (l ? 2.4 : -0.5) + rnd(70 + s + l) * 1.4, ldx = Math.cos(la), ldz = Math.sin(la);
            const base = 0.1 + 0.22 * rnd(80 + s + l), L = h * (0.36 + 0.3 * rnd(90 + s + l)), W = 0.05 + 0.025 * tallK + 0.02 * rnd(95 + s + l);
            const y0 = y + h * base, rows = [], N = 4;
            for (let j = 0; j <= N; j++) {
                const t = j / N, out = L * 0.86 * (1 - Math.pow(1 - t, 1.7));
                const up = L * 0.52 * Math.sin(t * Math.PI * 0.72) - L * 0.62 * t * t * t;
                const taper = Math.max(0.03, Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + 0.86 * t)), 0.7)); // (a blade: widest below the middle, a fine point)
                rows.push({ p: [bx + ldx * out, y0 + up, bz + ldz * out], n: [-ldz, ldx], hw: W * taper, cE: mul3(lerp3([0.06, 0.4, 0.46], [0.2, 0.7, 0.78], t), tone), cM: mul3(lerp3([0.25, 0.85, 0.82], [0.7, 1, 0.97], t), tone), g: 0.3 + 0.6 * t, sw: y0 + up - y });
            }
            strip(w, rows);
        }
        // the plume at the top: along a central spike, fine spikelets spring out all round (the golden angle) and droop — long at the base of the plume, short at its tip;
        // aqua-white at the base, lilac to violet at the tip
        const tx = pts[J][0], ty = pts[J][1], tz = pts[J][2];
        const PL = (0.22 + 0.16 * rnd(100 + s)) * Math.min(2.2, 0.6 + H * 0.5), spikes = 18;
        for (let q = 0; q < spikes; q++) {
            const t = q / (spikes - 1), ang = a + q * 2.399963, sdx = Math.cos(ang), sdz = Math.sin(ang);
            const sy = ty + PL * 1.3 * t, len = PL * (0.5 - 0.32 * t) + 0.05;
            const hw = 0.03 + 0.02 * (1 - t), nx = -sdz, nz = sdx, rows = [];
            for (let j = 0; j <= 2; j++) {
                const u = j / 2;
                rows.push({ p: [tx + dx * 0.05 * t + sdx * len * u, sy + len * 0.3 * Math.sin(u * 2.4) - len * 0.4 * u * u, tz + dz * 0.05 * t + sdz * len * u], n: [nx, nz], hw: hw * (1 - 0.8 * u), cE: lerp3([0.45, 0.82, 0.9], [0.58, 0.45, 0.95], u), cM: lerp3([0.72, 0.98, 0.95], [0.74, 0.62, 1], u), g: 0.8 + 0.2 * u, sw: sy - y + len * 0.3 });
            }
            strip(w, rows, false);
        }
        // the central spike (a taller, brighter blade)
        const cl = PL * 1.45, rows = [];
        for (let j = 0; j <= 2; j++) { const u = j / 2; rows.push({ p: [tx + dx * 0.05 * u, ty + cl * u, tz + dz * 0.05 * u], n: [-dz, dx], hw: 0.026 * (1 - 0.8 * u), cE: lerp3([0.55, 0.88, 0.92], [0.62, 0.5, 1], u), cM: lerp3([0.8, 1, 0.98], [0.8, 0.7, 1], u), g: 1, sw: ty - y + cl * u }); }
        strip(w, rows, false);
    }
}

/**
 * The tufts of a chunk (node-testable; `c`: a chunk of TerrainData — blocks, top, cx, cz). `seed`: the world's seed.
 * `gone`: a Set of 'x,z' of the plucked tufts (skipped).
 * → { pos, nor, col, sway, glow, count, verts, spots, box } (box: [minx, miny, minz, maxx, maxy, maxz] | null).
 */
export function buildBeslan(seed, c, gone = null) {
    const B = c.blocks, x0 = c.cx * CHUNK, z0 = c.cz * CHUNK, S = (seed | 0) + BESLAN.SEED;
    const MAXV = BESLAN.MAX_TUFTS * 2200;
    if (_buf.cap < MAXV) {
        _buf.pos = new Float32Array(MAXV * 3); _buf.nor = new Float32Array(MAXV * 3); _buf.col = new Float32Array(MAXV * 3);
        _buf.sway = new Float32Array(MAXV); _buf.glow = new Float32Array(MAXV); _buf.cap = MAXV;
    }
    const P = _buf.pos, N = _buf.nor, C = _buf.col, Sw = _buf.sway, G = _buf.glow;
    let v = 0, count = 0;
    const spots = [];
    const w = {
        vert(x, y, z, r, g, b, s, gl) {
            if (v >= _buf.cap) return;
            P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z; N[v * 3] = 0; N[v * 3 + 1] = 1; N[v * 3 + 2] = 0;
            C[v * 3] = r; C[v * 3 + 1] = g; C[v * 3 + 2] = b; Sw[v] = s; G[v] = gl; v++;
        },
    };
    for (let lz = 0; lz < CHUNK && count < BESLAN.MAX_TUFTS; lz++) {
        for (let lx = 0; lx < CHUNK && count < BESLAN.MAX_TUFTS; lx++) {
            const col = lz * CHUNK + lx, L = c.top[col];
            if (L < MIN_LAYER + 1) continue;
            const i = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
            if (B[i] !== BLOCK.GRASS) continue;
            const above = B[i + CHUNK * CHUNK];
            if (above !== BLOCK.AIR && above !== undefined) continue;
            const x = x0 + lx, z = z0 + lz;
            let p = BESLAN.DENSITY * (0.15 + 1.75 * drift(x, z, S));
            // by the water: a lower neighbour that is water within 3 blocks (the same chunk only — cheap)
            let wet = false;
            for (let d = -3; d <= 3 && !wet; d += 3) for (let e = -3; e <= 3 && !wet; e += 3) {
                const nx = lx + d, nz = lz + e;
                if (nx < 0 || nz < 0 || nx >= CHUNK || nz >= CHUNK) continue;
                const nl = c.top[nz * CHUNK + nx], ni = ((nl - MIN_LAYER) * CHUNK + nz) * CHUNK + nx;
                if (B[ni] === BLOCK.WATER || B[ni] === BLOCK.SAND) wet = true;
            }
            if (wet) p *= BESLAN.WATER_BONUS;
            if (hashLand(x, z, S + 1) >= p) continue;
            if (gone && gone.has(x + ',' + z)) continue; // (plucked: it grows back in a while — BeslanGrass.js)
            const tall = hashLand(x, z, S + 2) < BESLAN.TALL_SHARE;
            const [a, b] = tall ? BESLAN.TALL : BESLAN.LOW;
            const H = a + (b - a) * hashLand(x, z, S + 3);
            const ox = x + (hashLand(z, x, S + 4) - 0.5) * 0.8, oz = z + (hashLand(x + 9, z - 4, S + 5) - 0.5) * 0.8;
            writeTuft(w, ox, L - 0.5, oz, H, (k) => hashLand(x * 31 + k, z * 17 - k, S + 6 + k));
            spots.push({ x: ox, y: L - 0.5, z: oz, h: H, key: x + ',' + z });
            count++;
        }
    }
    let ax = Infinity, ay = Infinity, az = Infinity, bx = -Infinity, by = -Infinity, bz = -Infinity;
    for (let i = 0; i < v * 3; i += 3) {
        const x = P[i], y = P[i + 1], z = P[i + 2];
        if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y; if (z < az) az = z; if (z > bz) bz = z;
    }
    return { pos: P.slice(0, v * 3), nor: N.slice(0, v * 3), col: C.slice(0, v * 3), sway: Sw.slice(0, v), glow: G.slice(0, v), count, verts: v, spots, box: v ? [ax, ay, az, bx, by, bz] : null };
}
