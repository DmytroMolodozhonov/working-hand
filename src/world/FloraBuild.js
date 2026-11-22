/**
 * FloraBuild.js — the living ground of one chunk as plain arrays (Flora.js draws them). No THREE here: the terrain workers
 * (terrain.worker.js) make it too, away from the drawing; the same seed gives the same meadow on every computer.
 *
 * The author 21.11: «трава должна быть отдельной крутой частью игры, а не фоном… 20 видов, сплошные отдельно, кусты… лужи, мелкие
 * элементы, какашки животных. Земля — не плоскость с травой… нет прямой травы, должна быть прямая, очень сплошная».
 * On every grass block in the open air (GrassSpecies.js has the kinds and where each grows):
 *   - the cover: the straight dense sward and the short turf where the land is a meadow, clover, moss, herbs, ferns in their
 *     patches — several low cards a block, so the cover runs on unbroken over the blocks' edges;
 *   - the tall grasses: twenty kinds, each where it belongs (the steppe's feather grass and wild oat, the water's sedge, reed and
 *     cattail, the woods' cocksfoot and small-reed, the cold uplands' mat-grass and fescue, the jungle's elephant grass…), growing in
 *     colonies (each kind's own patches, `colony` m), mixing at their edges;
 *   - the flowers of the land (as before: the stem and the open blossom; «Flourish» blossoms);
 *   - bushes now and then (hazel, dog-rose, blueberry, juniper) — in their own arrays: they cast a shadow;
 *   - the litter: pebbles, fallen leaves, twigs and cones, mushrooms, dung where herds graze, molehills;
 *   - puddles in the hollows (a list: Flora.js lays the water).
 * Every vertex: position, normal (up: a blade is lit like the ground it grows from), colour (the land's tint × the plant's own
 * tone), uv in the atlas (−1: no texture — the flowers' colour is their vertices'), sway (m above the root: how far it moves),
 * glow, and grow = (flex — how limp, rank — 0…1, which plants thin out first far away).
 */
import { BLOCK, CHUNK, MIN_LAYER, chunkKey } from './Terrain.js';
import { BIOMES, hashLand } from './Landscape.js';
import { shapeTop } from './BlockShapes.js';
import { GRASSES, CARPETS, BUSHES, LITTER, PUDDLES, cellUV, weightsByBiome } from './GrassSpecies.js';

/** («Flourish» on a meadow with no flowers of its own) the chance and the colours: poppy, cornflower, buttercup, daisy, clover, bellflower */
const BLOOM_FLOWERS = [1, 0xe8392c, 0x4f7fe0, 0xf5d23a, 0xf4f0e6, 0xd86aa8, 0x8a6ad8];

const W_GRASS = weightsByBiome(BIOMES, GRASSES), W_CARPET = weightsByBiome(BIOMES, CARPETS), W_BUSH = weightsByBiome(BIOMES, BUSHES), W_LITTER = weightsByBiome(BIOMES, LITTER);
const UV_GRASS = GRASSES.map((k) => cellUV(k.cell)), UV_CARPET = CARPETS.map((k) => cellUV(k.cell, k.id !== 'sward')) /* (the low ones are painted in the cell's lower square) */, UV_BUSH = BUSHES.map((k) => cellUV(k.cell, true));
const REF = [0x55 / 255, 0xa8 / 255, 0x43 / 255]; // (the meadow's grass: tint 1 — other lands tint relative to it)

/** A growable set of vertex arrays (reused between chunks: no garbage; finish() copies out exactly what was written). */
class Verts {
    constructor() { this.cap = 0; this.n = 0; this._grow(4096); }
    _grow(cap) {
        const re = (a, k) => { const t = new Float32Array(cap * k); if (a) t.set(a.subarray(0, this.n * k)); return t; };
        this.pos = re(this.pos, 3); this.nor = re(this.nor, 3); this.col = re(this.col, 3); this.uv = re(this.uv, 2);
        this.sway = re(this.sway, 1); this.glow = re(this.glow, 1); this.grow = re(this.grow, 2);
        this.cap = cap;
    }
    reset() { this.n = 0; this.ni = 0; this.done = 0; this.box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; }
    /** Indices (a card's 4 corners share their vertices: 4 a card instead of 6). */
    i3(a, b, c) {
        if (!this.idx || this.ni + 3 > this.idx.length) { const t = new Uint32Array(Math.max(8192, (this.idx?.length || 0) * 2)); if (this.idx) t.set(this.idx.subarray(0, this.ni)); this.idx = t; }
        this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c;
    }
    quad(a) { this.i3(a, a + 1, a + 2); this.i3(a, a + 2, a + 3); this.done = this.n; }
    /** The vertices pushed as loose triangles since the last indexed shape (the flowers): indexed in order. */
    seq() { for (let k = this.done; k + 2 < this.n; k += 3) this.i3(k, k + 1, k + 2); this.done = this.n; }
    v(x, y, z, r, g, b, u, w, s, gl, flex, rank, ny = 1) {
        if (this.n >= this.cap) this._grow(this.cap * 2);
        const n = this.n, B = this.box;
        this.pos[n * 3] = x; this.pos[n * 3 + 1] = y; this.pos[n * 3 + 2] = z;
        this.nor[n * 3] = 0; this.nor[n * 3 + 1] = ny; this.nor[n * 3 + 2] = ny === 1 ? 0 : Math.sqrt(Math.max(0, 1 - ny * ny));
        this.col[n * 3] = r; this.col[n * 3 + 1] = g; this.col[n * 3 + 2] = b;
        this.uv[n * 2] = u; this.uv[n * 2 + 1] = w;
        this.sway[n] = s; this.glow[n] = gl; this.grow[n * 2] = flex; this.grow[n * 2 + 1] = rank;
        if (x < B[0]) B[0] = x; if (y < B[1]) B[1] = y; if (z < B[2]) B[2] = z;
        if (x > B[3]) B[3] = x; if (y > B[4]) B[4] = y; if (z > B[5]) B[5] = z;
        this.n++;
    }
    finish(count) {
        const n = this.n;
        this.seq();
        const index = n <= 65535 ? Uint16Array.from(this.idx ? this.idx.subarray(0, this.ni) : []) : this.idx.slice(0, this.ni);
        return { index, pos: this.pos.slice(0, n * 3), nor: this.nor.slice(0, n * 3), col: this.col.slice(0, n * 3), uv: this.uv.slice(0, n * 2), sway: this.sway.slice(0, n), glow: this.glow.slice(0, n), grow: this.grow.slice(0, n * 2), count, verts: n, box: n ? this.box.slice() : null };
    }
}
const _main = new Verts(), _bush = new Verts();

/** A smooth noise 0…1 over `size` m (hashed lattice; each kind its own `salt`). */
function vnoise(x, z, size, seed) {
    const X = x / size, Z = z / size, ix = Math.floor(X), iz = Math.floor(Z), fx = X - ix, fz = Z - iz;
    const u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
    const a = hashLand(ix, iz, seed), b = hashLand(ix + 1, iz, seed), c = hashLand(ix, iz + 1, seed), d = hashLand(ix + 1, iz + 1, seed);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
/** Patches of thicker, taller grass and of thinner (0…1, smooth over ~10 m). */
const patch = (x, z, seed) => vnoise(x, z, 9, seed + 520);

/**
 * An upright card (a quad seen from both sides) rooted at (x, y, z), turned `a`, width w, height h; its top leaning (lx, lz) m;
 * uv rectangle q; tint (r, g, b); flex, rank. Its root sits a little in the ground (no gap under a blade on a slope).
 */
function card(V, x, y, z, a, w, h, lx, lz, q, r, g, b, flex, rank, glow = 0) {
    const ca = Math.cos(a) * w * 0.5, sa = Math.sin(a) * w * 0.5, y0 = y - 0.04, y1 = y + h;
    const [u0, v0, u1, v1] = q, base = V.n;
    V.v(x - ca, y0, z - sa, r, g, b, u0, v0, 0, glow, flex, rank);
    V.v(x + ca, y0, z + sa, r, g, b, u1, v0, 0, glow, flex, rank);
    V.v(x + ca + lx, y1, z + sa + lz, r, g, b, u1, v1, h, glow, flex, rank);
    V.v(x - ca + lx, y1, z - sa + lz, r, g, b, u0, v1, h, glow, flex, rank);
    V.quad(base);
}

/** A card lying on the ground (litter): centre (x, y, z), size s, turned a, uv q. */
function lie(V, x, y, z, a, s, q, r, g, b, rank) {
    const c = Math.cos(a) * s * 0.5, sn = Math.sin(a) * s * 0.5, yy = y + 0.025;
    const [u0, v0, u1, v1] = q;
    const P = [[x - c + sn, z - sn - c], [x + c + sn, z + sn - c], [x + c - sn, z + sn + c], [x - c - sn, z - sn + c]];
    const U = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const base = V.n;
    for (const k of [0, 3, 2, 1]) V.v(P[k][0], yy, P[k][1], r, g, b, U[k][0], U[k][1], 0, 0, 0, rank); // (wound to face up)
    V.quad(base);
}

/** A low mound (a molehill): a six-sided cone of crumbly earth, centre raised h. */
function mound(V, x, y, z, s, h, q, rank) {
    V.seq();
    const [u0, v0, u1, v1] = q, uc = (u0 + u1) / 2, vc = (v0 + v1) / 2, ru = (u1 - u0) / 2, rv = (v1 - v0) / 2;
    for (let k = 0; k < 6; k++) {
        const a0 = k / 6 * Math.PI * 2, a1 = (k + 1) / 6 * Math.PI * 2;
        V.v(x, y + h, z, 0.9, 0.9, 0.9, uc, vc, 0, 0, 0, rank, 1);
        V.v(x + Math.cos(a1) * s, y + 0.01, z + Math.sin(a1) * s, 0.75, 0.75, 0.75, uc + Math.cos(a1) * ru, vc + Math.sin(a1) * rv, 0, 0, 0, rank, 0.75);
        V.v(x + Math.cos(a0) * s, y + 0.01, z + Math.sin(a0) * s, 0.75, 0.75, 0.75, uc + Math.cos(a0) * ru, vc + Math.sin(a0) * rv, 0, 0, 0, rank, 0.75);
    }
    V.seq();
}

/** A quarter of a litter cell's square (4 looks): `low` the lower square. */
function quarter(cell, low, k) {
    const q = cellUV(cell, true), [u0, v0, u1, v1] = low ? q : [q[0], q[3], q[2], q[3] + (q[3] - q[1])];
    const hu = (u1 - u0) / 2, hv = (v1 - v0) / 2, c = k % 2, r = k >> 1;
    return [u0 + c * hu, v1 - (r + 1) * hv, u0 + (c + 1) * hu, v1 - r * hv];
}

/**
 * The living ground of a chunk (node-testable). Returns the main arrays (cover, grasses, flowers, litter), `bush` (bushes: their own
 * mesh, it casts a shadow), `puddles` (x, y, z, r each) and `count` (plants).
 */
export function buildFlora(data, c, opts = null) {
    // (worlds of generation 36+ have the forest's undergrowth — ForestFloor.js — and the banks' plants — ShoreFloor.js — as real models:
    // there the same kinds are not drawn twice — the reeds, cattails and sedge of the water's edge, and the forest's ferns, leaves,
    // twigs, mushrooms, hazel and blueberry)
    const under = !!(opts?.under ?? data.undergrowth);
    const seed = data.seed | 0, B = c.blocks, x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    const bloom = data._bloom?.get(chunkKey(c.cx, c.cz)) || null;
    const COLS = CHUNK * CHUNK;
    const hidden = data._hidden?.get(chunkKey(c.cx, c.cz)) || null;
    const V = _main, VB = _bush;
    V.reset(); VB.reset();
    const puddles = [];
    let count = 0;
    // the water near each column (within the chunk: 0 at the water's edge … 4 far) — the wet kinds grow only by it
    const top = c.top, wet = new Uint8Array(COLS).fill(4), isWater = new Uint8Array(COLS);
    for (let col = 0; col < COLS; col++) {
        const L = top[col];
        if (L >= MIN_LAYER && B[(L - MIN_LAYER) * COLS + col] === BLOCK.WATER) isWater[col] = 1;
        else if (L >= MIN_LAYER && B[(L + 1 - MIN_LAYER) * COLS + col] === BLOCK.WATER) isWater[col] = 1;
        if (c.sea && c.sea[col]) isWater[col] = 1;
    }
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
        if (!isWater[lz * CHUNK + lx]) continue;
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
            const x = lx + dx, z = lz + dz;
            if (x < 0 || z < 0 || x >= CHUNK || z >= CHUNK) continue;
            const d = Math.max(Math.abs(dx), Math.abs(dz)), k = z * CHUNK + x;
            if (d < wet[k]) wet[k] = d;
        }
    }

    const grow = (lx, lz, L, forceBloom) => {
        const col = lz * CHUNK + lx;
        if (L < MIN_LAYER + 1) return;
        const i = (L - MIN_LAYER) * COLS + col;
        if (B[i] !== BLOCK.GRASS || hidden?.has(i)) return;
        const above = B[i + COLS];
        if (above !== BLOCK.AIR && above !== undefined) return;
        const x = x0 + lx, z = z0 + lz;
        const bi = c.bio ? c.bio[col] : 0, bio = BIOMES[bi], forest = bio.id === 'forest';
        const bushW = (k, b) => (under && forest && SKIP_FOREST.has(BUSHES[k].id) ? 0 : W_BUSH[k][b]);
        const r = hashLand(x, z, seed + 501);
        const blooms = forceBloom || !!bloom?.has(col) || !!bloom?.has(COLS + i);
        const fl = blooms && !(bio.flowers?.length > 1) ? BLOOM_FLOWERS : bio.flowers, tall = bio.tall;
        const sh = c.shape ? c.shape[i] : 0; // (a slab, a ramp — BlockShapes.js: the grass grows on its slope)
        const rootY = (px, pz) => (sh ? L - 1.58 + shapeTop(sh, px - x + 0.5, pz - z + 0.5) : L - 0.5);
        const g = c.grass ? c.grass[col] : 0x4caf50;
        const gr = ((g >> 16) & 255) / 255, gg = ((g >> 8) & 255) / 255, gb = (g & 255) / 255;
        // the land's tint relative to the meadow's green (a golden steppe, an autumn, a moonlit teal colour their grass)
        // (only the hue, not the brightness, and gently: a golden steppe is a warmer green-gold, not orange paint)
        let tr = gr / REF[0], tg = gg / REF[1], tb = gb / REF[2];
        const tl = 0.3 * tr + 0.59 * tg + 0.11 * tb || 1;
        tr = Math.min(1.45, Math.max(0.7, tr / tl)); tg = Math.min(1.3, Math.max(0.75, tg / tl)); tb = Math.min(1.5, Math.max(0.55, tb / tl));
        const wd = wet[col], pt = patch(x, z, seed);
        const tintOf = (k, tone) => [(1 + (tr - 1) * k.tint) * tone, (1 + (tg - 1) * k.tint) * tone, (1 + (tb - 1) * k.tint) * tone];

        // —— the cover (the sward, the turf, clover, moss, herbs, ferns): the strongest kind of this spot fills it ——
        let best = -1, bw = 0;
        for (let k = 0; k < CARPETS.length; k++) {
            const K = CARPETS[k], base = W_CARPET[k][bi];
            if (!base || (under && forest && SKIP_FOREST.has(K.id))) continue;
            // (the straight sward holds the meadows; the others take their own patches: clover, moss, herbs in colonies, the short turf where the sward thins)
            const w = base * (K.id === 'sward' ? 0.75 + 0.6 * pt : K.id === 'turf' ? 0.45 : 0.15 + 1.6 * vnoise(x, z, K.colony, seed + 900 + k * 31) ** 3);
            if (w > bw) { bw = w; best = k; }
        }
        if (best >= 0) {
            const K = CARPETS[best], q = UV_CARPET[best];
            const per = K.per;
            for (let t = 0; t < per; t++) {
                const hr = hashLand(x * 3 + t, z * 5 - t, seed + 610);
                const ox = x + (hashLand(x + t * 13, z, seed + 611) - 0.5) * 0.9, oz = z + (hashLand(x, z + t * 17, seed + 612) - 0.5) * 0.9;
                const h = (K.h[0] + (K.h[1] - K.h[0]) * hr) * (0.75 + 0.5 * pt), w = K.w * (0.85 + 0.3 * hr);
                const tone = 0.82 + 0.22 * hashLand(x + t, z - t, seed + 613);
                const [cr, cg, cb] = tintOf(K, tone);
                const a = hashLand(x - t * 7, z + t * 3, seed + 614) * Math.PI;
                const y = rootY(ox, oz), rank = hashLand(x + 91 * t, z - 37, seed + 615) * 0.7; // (the cover thins out last)
                if (K.flat) { lie(V, ox, y, oz, a * 2, w * 1.6, q, cr, cg, cb, rank); continue; } // (moss lies on the ground)
                card(V, ox, y, oz, a, w, h, 0, 0, q, cr, cg, cb, K.flex, rank);
                if (K.id !== 'sward' || t === 0) card(V, ox, y, oz, a + Math.PI / 2, w, h, 0, 0, q, cr, cg, cb, K.flex, rank);
            }
        }

        // —— a flower (as before) ——
        if (blooms || r < fl[0] * (0.3 + 1.5 * patch(x - 77, z + 41, seed))) {
            const k = 1 + Math.floor(hashLand(x, z, seed + 502) * (fl.length - 1));
            const fc = fl[k], fr = ((fc >> 16) & 255) / 255, fg = ((fc >> 8) & 255) / 255, fb = (fc & 255) / 255;
            const ox = x + (hashLand(z, x, seed + 503) - 0.5) * 0.6, oz = z + (hashLand(x + 3, z - 5, seed + 504) - 0.5) * 0.6;
            const y = rootY(ox, oz);
            const h = 0.32 + 0.35 * hashLand(x - 7, z + 2, seed + 505);
            const a = hashLand(x + 11, z, seed + 506) * Math.PI;
            const ca = Math.cos(a) * 0.035, sa = Math.sin(a) * 0.035, rank = hashLand(x, z, seed + 508);
            V.seq();
            V.v(ox - ca, y, oz - sa, gr * 0.6, gg * 0.6, gb * 0.6, -1, -1, 0, 0, 0.6, rank);
            V.v(ox + ca, y, oz + sa, gr * 0.6, gg * 0.6, gb * 0.6, -1, -1, 0, 0, 0.6, rank);
            V.v(ox, y + h, oz, gr * 0.9, gg * 0.9, gb * 0.9, -1, -1, h, 0, 0.6, rank);
            const gl = bio.glow ? 1 : 0, s = 0.09 + 0.05 * hashLand(x, z - 9, seed + 507), yh = y + h;
            for (let q = 0; q < 4; q++) {
                const b = a + q * Math.PI / 2, cb = Math.cos(b), sb = Math.sin(b);
                const px = ox + cb * s * 1.6, pz = oz + sb * s * 1.6;
                V.v(ox, yh, oz, fr * 0.75, fg * 0.75, fb * 0.75, -1, -1, h, gl, 0.6, rank);
                V.v(ox - sb * s * 0.8 + cb * s * 0.5, yh + 0.03, oz + cb * s * 0.8 + sb * s * 0.5, fr, fg, fb, -1, -1, h + 0.05, gl, 0.6, rank);
                V.v(px, yh + 0.06, pz, fr, fg, fb, -1, -1, h + 0.08, gl, 0.6, rank);
                V.v(ox, yh, oz, fr * 0.75, fg * 0.75, fb * 0.75, -1, -1, h, gl, 0.6, rank);
                V.v(px, yh + 0.06, pz, fr, fg, fb, -1, -1, h + 0.08, gl, 0.6, rank);
                V.v(ox + sb * s * 0.8 + cb * s * 0.5, yh + 0.03, oz - cb * s * 0.8 + sb * s * 0.5, fr, fg, fb, -1, -1, h + 0.05, gl, 0.6, rank);
            }
            V.seq();
            count++;
        }

        // —— the tall grasses: the kind of this spot by its land, its water and its colonies ——
        const share = tall[0] * (0.45 + 1.2 * pt);
        const n = r < share * 0.5 ? 2 : r < share ? 1 : 0;
        for (let t = 0; t < n; t++) {
            let pick = -1, pw = 0;
            const roll = hashLand(x + t * 29, z - t * 11, seed + 700);
            let sum = 0;
            const ws = _ws;
            for (let k = 0; k < GRASSES.length; k++) {
                const K = GRASSES[k];
                let w = W_GRASS[k][bi];
                if (!w || (under && SKIP_SHORE.has(K.id))) { ws[k] = 0; continue; }
                if (K.wet >= 1) { if (wd > (K.near || 3)) { ws[k] = 0; continue; } w *= 3 - wd * 0.6; }
                else if (K.wet < 0 && wd <= 1) w *= 1 + K.wet; // (the dry kinds shun the water's edge)
                else if (K.wet > 0 && wd <= 2) w *= 1 + K.wet * 2;
                w *= 0.08 + vnoise(x, z, K.colony, seed + 800 + k * 53) ** 2.2 * 2; // (colonies: a kind holds its ground in patches)
                ws[k] = w; sum += w;
            }
            if (sum <= 0) continue;
            let acc = roll * sum;
            for (let k = 0; k < GRASSES.length; k++) { acc -= ws[k]; if (acc <= 0 && ws[k] > 0) { pick = k; pw = ws[k]; break; } }
            if (pick < 0) continue;
            const K = GRASSES[pick], q = UV_GRASS[pick];
            const k1 = hashLand(x + t * 7, z, seed + 511);
            const H = (K.h[0] + (K.h[1] - K.h[0]) * k1) * (0.75 + 0.5 * patch(x + 50, z - 50, seed)) * (pw > 0.6 ? 1.08 : 1);
            const ox = x + (hashLand(z, x + t, seed + 512) - 0.5) * 0.7, oz = z + (hashLand(x - 3, z + 5 + t, seed + 513) - 0.5) * 0.7;
            const y = rootY(ox, oz), tone = 0.82 + 0.24 * hashLand(x + 1, z + 1 + t, seed + 514);
            const [cr, cg, cb] = tintOf(K, tone);
            const a0 = hashLand(x + 17, z - 13 + t, seed + 515) * Math.PI, rank = hashLand(x - 5, z + 9 + t, seed + 516);
            const lean = (hashLand(x + 3, z + t, seed + 517) - 0.5) * 0.25 * H * K.flex, la = hashLand(x, z + t * 5, seed + 518) * Math.PI * 2;
            const w = K.w * (0.85 + 0.3 * k1) * (0.7 + 0.3 * Math.min(2, H));
            for (let s = 0; s < K.n; s++) card(V, ox, y, oz, a0 + s * Math.PI / K.n, w, H, Math.cos(la) * lean, Math.sin(la) * lean, q, cr, cg, cb, K.flex, rank, K.glow ? 1 : 0);
            count++;
        }

        // —— a bush (one candidate in each 5 × 5 m cell of the world, so bushes never crowd each other) ——
        if (((x % 5) + 5) % 5 === 2 && ((z % 5) + 5) % 5 === 2) {
            const roll = hashLand(x, z, seed + 950);
            let sum = 0;
            for (let k = 0; k < BUSHES.length; k++) sum += bushW(k, bi);
            const want = 0.09 * sum * (0.3 + 1.4 * vnoise(x, z, 23, seed + 951));
            if (roll < want && wd > 1) {
                let acc = hashLand(z, x, seed + 952) * sum, pick = 0;
                for (let k = 0; k < BUSHES.length; k++) { acc -= bushW(k, bi); if (acc <= 0) { pick = k; break; } }
                const K = BUSHES[pick], q = UV_BUSH[pick], hr = hashLand(x + 1, z, seed + 953);
                const R = K.r[0] + (K.r[1] - K.r[0]) * hr, H = K.h[0] + (K.h[1] - K.h[0]) * hr;
                const ox = x + (hashLand(x, z + 2, seed + 954) - 0.5) * 0.6, oz = z + (hashLand(x + 2, z, seed + 955) - 0.5) * 0.6;
                const y = rootY(ox, oz), tone = 0.85 + 0.25 * hashLand(x, z, seed + 956), [cr, cg, cb] = tintOf(K, tone);
                const a0 = hashLand(z + 3, x, seed + 957) * Math.PI;
                // the dome: three crossed cards through its middle and five around it leaning out — a body seen from every side
                for (let s = 0; s < 3; s++) card(VB, ox, y, oz, a0 + s * Math.PI / 3, R * 2, H, 0, 0, q, cr, cg, cb, K.flex, 0);
                for (let s = 0; s < 5; s++) {
                    const b = a0 + s * Math.PI * 2 / 5, px = ox + Math.cos(b) * R * 0.45, pz = oz + Math.sin(b) * R * 0.45;
                    card(VB, px, y, pz, b + Math.PI / 2, R * 1.3, H * 0.8, Math.cos(b) * R * 0.35, Math.sin(b) * R * 0.35, q, cr * 0.92, cg * 0.92, cb * 0.92, K.flex, 0);
                }
                count++;
            }
        }

        // —— the litter: the little things lying on the ground ——
        const lr = hashLand(x - 31, z + 47, seed + 980);
        let accL = 0;
        for (let k = 0; k < LITTER.length; k++) {
            const K = LITTER[k], w = W_LITTER[k][bi];
            if (!w || (under && forest && SKIP_FOREST.has(K.id))) continue;
            accL += K.share * w * (0.4 + 1.2 * vnoise(x, z, 13, seed + 981 + k * 7));
            if (lr >= accL) continue;
            const look = Math.floor(hashLand(x, z, seed + 982 + k) * 4), sz = K.size[0] + (K.size[1] - K.size[0]) * hashLand(z, x, seed + 983);
            const ox = x + (hashLand(x + 9, z, seed + 984) - 0.5) * 0.7, oz = z + (hashLand(x, z + 9, seed + 985) - 0.5) * 0.7;
            const y = rootY(ox, oz), a = hashLand(x + k, z - k, seed + 986) * Math.PI * 2, rank = hashLand(x + 4, z + 4, seed + 987) * 0.9;
            const q = quarter(K.cell, !!K.sub, look);
            if (K.kind === 'lie') lie(V, ox, y, oz, a, sz, q, 1, 1, 1, rank);
            else if (K.kind === 'mound') mound(V, ox, y, oz, sz * 0.5, sz * 0.32, q, rank);
            else { card(V, ox, y, oz, a, sz, sz * 0.9, 0, 0, q, 1, 1, 1, 0.05, rank); card(V, ox, y, oz, a + Math.PI / 2, sz, sz * 0.9, 0, 0, q, 1, 1, 1, 0.05, rank); }
            break;
        }

        // —— a puddle in a hollow: lower than three of its four neighbours, away from the real water ——
        if (wd >= 3 && !sh && lx > 0 && lz > 0 && lx < CHUNK - 1 && lz < CHUNK - 1) {
            const up = (top[col - 1] > L) + (top[col + 1] > L) + (top[col - CHUNK] > L) + (top[col + CHUNK] > L);
            if (up >= 3 && hashLand(x + 71, z - 71, seed + 990) < PUDDLES.SHARE) {
                const pr = PUDDLES.MIN_R + (PUDDLES.MAX_R - PUDDLES.MIN_R) * hashLand(x, z, seed + 991);
                puddles.push(x, L - 0.5, z, pr);
            }
        }
    };
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) grow(lx, lz, c.top[lz * CHUNK + lx], false);
    if (bloom) for (const key of bloom) {
        if (key < COLS) continue;
        const col = key % COLS, L = Math.floor(key / COLS) + MIN_LAYER - 1;
        if (L !== c.top[col]) grow(col % CHUNK, Math.floor(col / CHUNK), L, true);
    }
    const out = V.finish(count);
    out.bush = VB.n ? VB.finish(0) : null;
    out.puddles = new Float32Array(puddles);
    return out;
}
const _ws = new Float64Array(GRASSES.length);
const SKIP_SHORE = new Set(['cattail', 'reed', 'sedge']), SKIP_FOREST = new Set(['fern', 'leaves', 'twigs', 'mushroom', 'hazel', 'blueberry']);

/** Every ArrayBuffer of a buildFlora result (for a worker's transfer list). */
export function floraBuffers(out) {
    const list = [];
    for (const o of [out, out.bush]) if (o) for (const k of ['index', 'pos', 'nor', 'col', 'uv', 'sway', 'glow', 'grow']) list.push(o[k].buffer);
    if (out.puddles) list.push(out.puddles.buffer);
    return list;
}
