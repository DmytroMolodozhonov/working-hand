/**
 * FloraBuild.js — the tufts and flowers of one chunk as plain arrays (Flora.js draws them).
 * No THREE here: the terrain workers (terrain.worker.js) make them too, away from the drawing.
 */
import { BLOCK, CHUNK, MIN_LAYER, chunkKey } from './Terrain.js';
import { BIOMES, hashLand } from './Landscape.js';
import { shapeTop } from './BlockShapes.js';

const _buf = { pos: null, nor: null, col: null, sway: null, glow: null };

/**
 * The blades and flowers of a chunk (node-testable). Returns typed arrays (non-indexed triangles)
 * and `count` — how many tufts and flowers.
 */
export function buildFlora(data, c) {
    const seed = data.seed | 0, B = c.blocks, x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    const MAXV = CHUNK * CHUNK * 30; // (two tufts of five blades at most a block; a flower: 3 + 24)
    if (!_buf.pos || _buf.pos.length < MAXV * 3) {
        _buf.pos = new Float32Array(MAXV * 3); _buf.nor = new Float32Array(MAXV * 3); _buf.col = new Float32Array(MAXV * 3);
        _buf.sway = new Float32Array(MAXV); _buf.glow = new Float32Array(MAXV);
    }
    const P = _buf.pos, N = _buf.nor, C = _buf.col, S = _buf.sway, G = _buf.glow;
    let v = 0, count = 0;
    const hidden = data._hidden?.get(chunkKey(c.cx, c.cz)) || null;
    // one vertex: position, an upward normal (lit like the ground under it), colour, sway, glow
    const vert = (x, y, z, r, g, b, s, gl) => {
        P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
        N[v * 3] = 0; N[v * 3 + 1] = 1; N[v * 3 + 2] = 0;
        C[v * 3] = r; C[v * 3 + 1] = g; C[v * 3 + 2] = b;
        S[v] = s; G[v] = gl;
        v++;
    };
    for (let lz = 0; lz < CHUNK; lz++) {
        for (let lx = 0; lx < CHUNK; lx++) {
            const col = lz * CHUNK + lx, L = c.top[col];
            if (L < MIN_LAYER + 1) continue;
            const i = ((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx;
            if (B[i] !== BLOCK.GRASS || (hidden && hidden.has(i))) continue;
            const above = B[i + CHUNK * CHUNK];
            if (above !== BLOCK.AIR && above !== undefined) continue; // (snow, a slab, water on it)
            const x = x0 + lx, z = z0 + lz;
            const bio = BIOMES[c.bio ? c.bio[col] : 0];
            const r = hashLand(x, z, seed + 501);
            const fl = bio.flowers, tall = bio.tall;
            const sh = c.shape ? c.shape[i] : 0; // (a slab, a ramp — BlockShapes.js: the grass grows on its slope)
            const rootY = (px, pz) => (sh ? L - 1.58 + shapeTop(sh, px - x + 0.5, pz - z + 0.5) : L - 0.5);
            let y = L - 0.5; // (the block's top face)
            const g = c.grass ? c.grass[col] : 0x4caf50;
            const gr = ((g >> 16) & 255) / 255, gg = ((g >> 8) & 255) / 255, gb = (g & 255) / 255;
            if (r < fl[0] * (0.3 + 1.5 * patch(x - 77, z + 41, seed))) { // (flowers grow in drifts)
                // a flower: a thin stem and a small head of two crossed petals' quads
                const k = 1 + Math.floor(hashLand(x, z, seed + 502) * (fl.length - 1));
                const fc = fl[k], fr = ((fc >> 16) & 255) / 255, fg = ((fc >> 8) & 255) / 255, fb = (fc & 255) / 255;
                const ox = x + (hashLand(z, x, seed + 503) - 0.5) * 0.6, oz = z + (hashLand(x + 3, z - 5, seed + 504) - 0.5) * 0.6;
                y = rootY(ox, oz);
                const h = 0.32 + 0.35 * hashLand(x - 7, z + 2, seed + 505);
                const a = hashLand(x + 11, z, seed + 506) * Math.PI;
                const ca = Math.cos(a) * 0.035, sa = Math.sin(a) * 0.035;
                vert(ox - ca, y, oz - sa, gr * 0.6, gg * 0.6, gb * 0.6, 0, 0);
                vert(ox + ca, y, oz + sa, gr * 0.6, gg * 0.6, gb * 0.6, 0, 0);
                vert(ox, y + h, oz, gr * 0.9, gg * 0.9, gb * 0.9, h, 0);
                const gl = bio.glow ? 1 : 0, s = 0.09 + 0.05 * hashLand(x, z - 9, seed + 507), yh = y + h;
                // the head: an open blossom (four petals round the middle, seen from above as from
                // the side) — a flat star tilted a little towards the sun, and a small cross through it
                for (let q = 0; q < 4; q++) {
                    const b = a + q * Math.PI / 2, cb = Math.cos(b), sb = Math.sin(b);
                    const px = ox + cb * s * 1.6, pz = oz + sb * s * 1.6;
                    vert(ox, yh, oz, fr * 0.75, fg * 0.75, fb * 0.75, h, gl);
                    vert(ox - sb * s * 0.8 + cb * s * 0.5, yh + 0.03, oz + cb * s * 0.8 + sb * s * 0.5, fr, fg, fb, h + 0.05, gl);
                    vert(px, yh + 0.06, pz, fr, fg, fb, h + 0.08, gl);
                    vert(ox, yh, oz, fr * 0.75, fg * 0.75, fb * 0.75, h, gl);
                    vert(px, yh + 0.06, pz, fr, fg, fb, h + 0.08, gl);
                    vert(ox + sb * s * 0.8 + cb * s * 0.5, yh + 0.03, oz - cb * s * 0.8 + sb * s * 0.5, fr, fg, fb, h + 0.05, gl);
                }
                count++;
            } else {
                // tufts: blades leaning out from a root, of the land's height and colour — thicker and
                // taller in patches, thinner in others (one or two tufts a block)
                const pt = patch(x, z, seed), share = tall[0] * (0.35 + 1.1 * pt);
                const n = r < fl[0] + share * 0.45 ? 2 : r < fl[0] + share ? 1 : 0;
                for (let t = 0; t < n; t++) {
                    const k = hashLand(x + t * 7, z, seed + 511);
                    const H = (tall[1] + (tall[2] - tall[1]) * k * k) * (0.65 + 0.7 * patch(x + 50, z - 50, seed));
                    const ox = x + (hashLand(z, x + t, seed + 512) - 0.5) * 0.7, oz = z + (hashLand(x - 3, z + 5 + t, seed + 513) - 0.5) * 0.7;
                    y = rootY(ox, oz);
                    const tone = 0.88 + 0.28 * hashLand(x + 1, z + 1 + t, seed + 514);
                    const nb = 4 + (k > 0.5 ? 1 : 0);
                    for (let q = 0; q < nb; q++) {
                        const a = (hashLand(x + q * 17, z - q * 13 + t, seed + 515) * 0.6 + q / nb) * Math.PI * 2;
                        const w = 0.06 + 0.035 * hashLand(x - q, z + q, seed + 516);
                        const lean = 0.15 + 0.3 * hashLand(x + q, z + t, seed + 517);
                        const dx = Math.cos(a), dz = Math.sin(a), h = H * (0.65 + 0.45 * hashLand(q, x + z + t, seed + 518));
                        const bx = ox + dx * 0.06, bz = oz + dz * 0.06;
                        vert(bx - dz * w, y, bz + dx * w, gr * 0.7 * tone, gg * 0.74 * tone, gb * 0.7 * tone, 0, 0);
                        vert(bx + dz * w, y, bz - dx * w, gr * 0.7 * tone, gg * 0.74 * tone, gb * 0.7 * tone, 0, 0);
                        vert(bx + dx * lean * h, y + h, bz + dz * lean * h, Math.min(1, gr * 1.22 * tone), Math.min(1, gg * 1.16 * tone), Math.min(1, gb * 1.08 * tone), h, 0);
                    }
                    count++;
                }
            }
        }
    }
    // (its box: made here — in a worker, off the frame — not by a pass over every blade when it goes in)
    let ax = Infinity, ay = Infinity, az = Infinity, bx = -Infinity, by = -Infinity, bz = -Infinity;
    for (let i = 0; i < v * 3; i += 3) {
        const x = P[i], y = P[i + 1], z = P[i + 2];
        if (x < ax) ax = x;
        if (x > bx) bx = x;
        if (y < ay) ay = y;
        if (y > by) by = y;
        if (z < az) az = z;
        if (z > bz) bz = z;
    }
    return { pos: P.slice(0, v * 3), nor: N.slice(0, v * 3), col: C.slice(0, v * 3), sway: S.slice(0, v), glow: G.slice(0, v), count, verts: v, box: v ? [ax, ay, az, bx, by, bz] : null };
}

/** Patches of thicker, taller grass and of thinner (0…1, smooth over ~10 m; hashed lattice). */
function patch(x, z, seed) {
    const X = x / 9, Z = z / 9, ix = Math.floor(X), iz = Math.floor(Z), fx = X - ix, fz = Z - iz;
    const u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
    const a = hashLand(ix, iz, seed + 520), b = hashLand(ix + 1, iz, seed + 520), c = hashLand(ix, iz + 1, seed + 520), d = hashLand(ix + 1, iz + 1, seed + 520);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
