/**
 * TreeBuild.js — the new trees (the author: «деревья не будут просто блоками, квадратными. Они будут
 * извивающимися, с большими ветками всевозможными… Круглые»). One tree = a winding, tapering trunk with
 * root flares, big branches that bend and split again (2–3 levels), and a round crown of leaf clumps
 * (a slightly bumpy sphere each, lighter on top and darker inside); the spruce has drooping tiers of
 * boughs with a ragged edge instead.
 *
 * Plain arrays, no THREE: the terrain workers can make them too. Everything comes from the kind and the
 * variant number (the same tree on every computer); a world tree is one of VARIANTS shapes of its kind,
 * turned, scaled and tinted on its own (Trees.js).
 *
 * Sizes from the world's measures (block 1 m, the hero ~3.5 m tall): the old block trees were 9–12 m
 * high with 5–8 m crowns; these are a bit taller on average (the author: «деревья должны быть реально
 * выше персонажа… чтобы ветки не задевали»), and nothing but the trunk comes lower than TREE_SIZES.clear
 * (5 m and more above the ground) — the hero walks under the crowns.
 */

export const TREE_GEN = { VARIANTS: 8, KINDS: 5 };

/**
 * Per kind (0 oak, 1 birch, 2 spruce, 3 cherry, 4 dark oak): height H, crown width W, trunk diameter at
 * the ground D (m, [min, max] over the variants) and the clear height under the crown (the lowest leaf).
 */
export const TREE_SIZES = [
    { name: 'Дуб', H: [13, 17], W: [9.5, 12.5], D: [0.85, 1.15], clear: 5.4 },
    { name: 'Берёза', H: [14, 18.5], W: [5.5, 7.5], D: [0.5, 0.65], clear: 6.2 },
    { name: 'Ель', H: [16, 23], W: [6, 8.5], D: [0.6, 0.85], clear: 5.2 },
    { name: 'Вишня', H: [10.5, 13], W: [9.5, 12], D: [0.55, 0.75], clear: 4.9 },
    { name: 'Тёмный дуб', H: [14, 18], W: [11, 14], D: [1.05, 1.3], clear: 5.4 },
];

// bark and leaf colours by kind (0..1 rgb)
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const BARK = [hex(0x6b4a2e), hex(0xe6e1d6), hex(0x5a3d29), hex(0x6a3a34), hex(0x3d2b1d)];
const BARK_DARK = hex(0x2a2522); // (the birch's black strips)
const LEAF = [hex(0x3d8a30), hex(0x86b845), hex(0x3a7444), hex(0xf0a2c6), hex(0x2c5a24)];

/** A small seeded random (mulberry32). */
export function treeRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------- unit spheres (icosahedron, subdivided)
const _ico = [];
function icosphere(level) {
    if (_ico[level]) return _ico[level];
    const t = (1 + Math.sqrt(5)) / 2;
    let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const norm = (p) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; };
    v = v.map(norm);
    for (let s = 0; s < level; s++) {
        const mid = new Map(), nf = [];
        const m = (a, b) => {
            const k = a < b ? a * 1000 + b : b * 1000 + a;
            if (!mid.has(k)) { v.push(norm([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2])); mid.set(k, v.length - 1); }
            return mid.get(k);
        };
        for (const [a, b, c] of f) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
        f = nf;
    }
    return (_ico[level] = { v, f });
}

// ---------------------------------------------------------------- a growing mesh
class Part {
    constructor() { this.p = []; this.c = []; this.s = []; this.i = []; this.n = new Map(); }
    get count() { return this.p.length / 3; }
    vert(x, y, z, col, sway, n = null) { this.p.push(x, y, z); this.c.push(col[0], col[1], col[2]); this.s.push(sway); if (n) this.n.set(this.count - 1, n); return this.count - 1; }
    tri(a, b, c) { this.i.push(a, b, c); }
    /** Typed arrays, smooth normals from the faces round each point. */
    finish() {
        const pos = new Float32Array(this.p), n = this.count, nor = new Float32Array(n * 3), I = this.i;
        for (let k = 0; k < I.length; k += 3) {
            const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
            const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
            const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const q of [a, b, c]) { nor[q] += nx; nor[q + 1] += ny; nor[q + 2] += nz; }
        }
        for (const [k, v] of this.n) { nor[k * 3] = v[0]; nor[k * 3 + 1] = v[1]; nor[k * 3 + 2] = v[2]; } // (a clump: lit as a round cloud)
        for (let q = 0; q < nor.length; q += 3) {
            const l = Math.hypot(nor[q], nor[q + 1], nor[q + 2]) || 1;
            nor[q] /= l; nor[q + 1] /= l; nor[q + 2] /= l;
        }
        return { pos, nor, col: new Float32Array(this.c), sway: new Float32Array(this.s), index: n > 65535 ? new Uint32Array(I) : new Uint16Array(I), count: n };
    }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Catmull-Rom through the control points: n points along. */
function smoothPath(ctrl, n) {
    const out = [];
    const P = (i) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
    for (let k = 0; k < n; k++) {
        const u = (k / (n - 1)) * (ctrl.length - 1), i = Math.min(ctrl.length - 2, Math.floor(u)), t = u - i;
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), t2 = t * t, t3 = t2 * t;
        out.push([0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
    return out;
}

/**
 * A tube along points with radii (rings of `sides`, frames carried along so it doesn't twist by itself),
 * closed with a point at its end. radiusMod(ring, angle) shapes a ring (the root flares); colour(ring,
 * side, y) and sway(y) per point.
 */
function tube(part, pts, radii, sides, colour, sway, { radiusMod = null, twist = 0, cap = true } = {}) {
    const first = part.count;
    let T = unit(sub(pts[1], pts[0]));
    let N = Math.abs(T[1]) < 0.9 ? unit(cross(T, [0, 1, 0])) : unit(cross(T, [1, 0, 0]));
    for (let r = 0; r < pts.length; r++) {
        const p = pts[r];
        const Tn = unit(sub(pts[Math.min(pts.length - 1, r + 1)], pts[Math.max(0, r - 1)]));
        N = unit(sub(N, mul(Tn, dot(N, Tn)))); T = Tn;
        const B = cross(T, N);
        for (let s = 0; s < sides; s++) {
            const a = (s / sides) * Math.PI * 2 + twist * r;
            const rr = radii[r] * (radiusMod ? radiusMod(r, a) : 1);
            const d = add(mul(N, Math.cos(a) * rr), mul(B, Math.sin(a) * rr));
            const q = add(p, d);
            part.vert(q[0], q[1], q[2], colour(r, s, q[1]), sway(q[1]));
        }
        if (r > 0) {
            const a0 = first + (r - 1) * sides, b0 = first + r * sides;
            for (let s = 0; s < sides; s++) {
                const s1 = (s + 1) % sides;
                part.tri(a0 + s, b0 + s, b0 + s1);
                part.tri(a0 + s, b0 + s1, a0 + s1);
            }
        }
    }
    if (cap) {
        const e = pts[pts.length - 1], tip = add(e, mul(T, radii[radii.length - 1] * 1.2));
        const c = part.vert(tip[0], tip[1], tip[2], colour(pts.length - 1, 0, tip[1]), sway(tip[1]));
        const b0 = first + (pts.length - 1) * sides;
        for (let s = 0; s < sides; s++) part.tri(b0 + s, c, b0 + (s + 1) % sides);
    }
}

/** A leaf clump: a sphere (bumpy, squashed a little), lighter on top and outside, darker inside. */
function clump(part, c, r, level, rnd, base, crownC, crownR, sway, squash = 0.85) {
    const { v, f } = icosphere(level);
    const first = part.count;
    const k1 = [rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3], k2 = [rnd() * 9 - 4.5, rnd() * 9 - 4.5, rnd() * 9 - 4.5], ph = rnd() * 6.28;
    const tint = 0.92 + rnd() * 0.16;
    for (const d of v) {
        const bump = 1 + 0.13 * Math.sin(dot(d, k1) + ph) + 0.07 * Math.sin(dot(d, k2) * 1.7 + ph * 2);
        const x = c[0] + d[0] * r * bump, y = c[1] + d[1] * r * bump * squash, z = c[2] + d[2] * r * bump;
        // light: from above, and the outside of the crown brighter than its middle
        const out = Math.min(1, Math.hypot(x - crownC[0], (y - crownC[1]) * 1.2, z - crownC[2]) / crownR);
        const sh = tint * (0.62 + 0.24 * (d[1] * 0.5 + 0.5) + 0.26 * out);
        part.vert(x, y, z, [Math.min(1, base[0] * sh), Math.min(1, base[1] * sh), Math.min(1, base[2] * sh)], sway(y), unit([d[0] * squash, d[1], d[2] * squash]));
    }
    for (const [a, b, cc] of f) part.tri(first + a, first + b, first + cc);
}

/** Distance from a point to a polyline (for the tests: a branch starts inside its parent). */
function distToPath(p, pts) {
    let best = Infinity, at = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], ab = sub(pts[k + 1], a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
        const d = len(sub(p, add(a, mul(ab, t))));
        if (d < best) { best = d; at = k + t; }
    }
    return { d: best, at };
}

const range = (rnd, [a, b]) => a + (b - a) * rnd();

/**
 * One tree of a kind and variant: {wood, leaf} geometry arrays (pos, nor, col, sway, index), and its
 * `info`: height, crown (centre, radii, its clumps as spheres [x, y, z, r] for hits), the trunk (its
 * axis and radii: the collision), the lowest leaf, joints (every branch's start and its parent's
 * radius there — the tests), the box. `far`: the simple shape for far away (≤ 200 points).
 */
export function buildTree(kind, variant, { far = false } = {}) {
    kind = Math.max(0, Math.min(4, kind | 0));
    const rnd = treeRandom(0x9e3779b1 ^ (kind * 7919 + (variant | 0) * 104729 + (far ? 0 : 0)));
    const S = TREE_SIZES[kind];
    const H = range(rnd, S.H), W = range(rnd, S.W), R0 = range(rnd, S.D) / 2;
    const wood = new Part(), leaf = new Part();
    const joints = [], spheres = [];
    const sides = far ? 5 : kind === 4 ? 10 : 8;
    // sway: nothing at the foot, the top of the crown most (Trees.js: in the vertex shader)
    const sway = (y) => { const t = Math.max(0, y - 2.5) / H; return Math.min(1, t * t * 1.3); };
    const barkC = BARK[kind];
    const bark = (stripe) => (r, s, y) => {
        if (kind === 1 && stripe) {
            // the birch: white with black strips across, here and there
            const h = Math.sin(r * 12.9898 + s * 78.233 + variant * 3.1) * 43758.5453;
            if (h - Math.floor(h) < 0.22 && y > 0.4) return BARK_DARK;
        }
        const k = 0.9 + 0.1 * Math.sin(r * 1.7 + s * 2.3 + variant);
        return [barkC[0] * k, barkC[1] * k, barkC[2] * k];
    };
    const leafBase = LEAF[kind].map((v, j) => Math.min(1, v * (0.93 + 0.14 * rnd()) + (j === 0 && kind === 3 ? 0.03 * rnd() : 0)));

    // ---- the trunk: a winding line (lean and twist), thinner up; its foot flares into roots
    const trunkTop = kind === 1 ? H * 0.82 : kind === 2 ? H : kind === 3 ? H * 0.42 : H * 0.55;
    const wind = kind === 4 ? 0.55 : kind === 3 ? 0.45 : kind === 2 ? 0.12 : kind === 1 ? 0.22 : 0.35;
    const nCtrl = 3 + Math.floor(rnd() * 4); // (3–6 control points)
    const leanA = rnd() * Math.PI * 2, lean = (kind === 2 ? 0.02 : 0.05) * rnd();
    const ctrl = [[0, -0.6, 0]];
    for (let k = 1; k <= nCtrl; k++) {
        const t = k / nCtrl, y = trunkTop * t;
        const wob = wind * Math.sin(t * Math.PI) * (0.6 + rnd());
        const a = leanA + (rnd() - 0.5) * 2.4 + t * (kind === 4 ? 2.2 : 0.8);
        ctrl.push([Math.cos(leanA) * lean * y + Math.cos(a) * wob, y, Math.sin(leanA) * lean * y + Math.sin(a) * wob]);
    }
    ctrl[1] = [ctrl[1][0] * 0.4, ctrl[1][1], ctrl[1][2] * 0.4]; // (the foot stands straight on the ground)
    const rings = far ? 4 : kind === 2 ? 9 : 10;
    const trunk = smoothPath(ctrl, rings);
    const topR = kind === 2 ? 0.06 : kind === 1 ? R0 * 0.45 : R0 * 0.55;
    const trunkR = trunk.map((p, i) => R0 + (topR - R0) * Math.pow(i / (rings - 1), 0.85));
    const lobes = 3 + Math.floor(rnd() * 3), lph = rnd() * 6.28, flare = kind === 4 ? 0.9 : kind === 2 ? 0.45 : 0.6;
    tube(wood, trunk, trunkR, sides, bark(true), sway, {
        twist: kind === 4 ? 0.12 : 0.03,
        radiusMod: (r, a) => { const y = trunk[r][1]; return 1 + flare * Math.exp(-Math.max(0, y) / 0.9) * (0.55 + 0.45 * Math.cos(lobes * a + lph)); },
        cap: true,
    });
    const at = (y) => { // the trunk's axis point at a height
        for (let i = 1; i < trunk.length; i++) if (trunk[i][1] >= y) { const t = (y - trunk[i - 1][1]) / (trunk[i][1] - trunk[i - 1][1] || 1); return { p: lerp(trunk[i - 1], trunk[i], t), r: trunkR[i - 1] + (trunkR[i] - trunkR[i - 1]) * t }; }
        return { p: trunk[trunk.length - 1], r: trunkR[trunkR.length - 1] };
    };
    // root flares: short bent roots going out and down from the foot
    if (!far) {
        const nr = kind === 4 ? 5 : kind === 1 ? 3 : 4;
        for (let k = 0; k < nr; k++) {
            const a = lph + (k / nr) * Math.PI * 2 + (rnd() - 0.5) * 0.6, L = R0 * (2.2 + rnd() * 1.4);
            const s = at(0.5).p, d = [Math.cos(a), 0, Math.sin(a)];
            const pts = [s, add(s, [d[0] * L * 0.45, 0.05 - 0.25 * 0.5, d[2] * L * 0.45]), add(s, [d[0] * L, -0.75, d[2] * L])];
            const rr = R0 * (0.42 + rnd() * 0.12);
            tube(wood, pts, [rr, rr * 0.6, rr * 0.2], 5, bark(false), sway);
            joints.push({ at: s, parentR: at(0.5).r, d: 0 });
        }
    }

    const branch = (pts, r0, r1, sideN, parentPts, parentR) => {
        const radii = pts.map((_, i) => r0 + (r1 - r0) * (i / (pts.length - 1)));
        tube(wood, pts, radii, sideN, bark(true), sway);
        const j = distToPath(pts[0], parentPts);
        joints.push({ at: pts[0], parentR, d: j.d });
    };

    let crown;
    if (kind === 2) {
        // ---- the spruce: drooping tiers of boughs, ragged at the edge, smaller up to the tip
        const tiers = far ? 5 : 10 + Math.floor(rnd() * 3);
        const segs = far ? 6 : 11;
        const bottom = S.clear + 1.0; // (the lowest tier's edge droops to S.clear)
        const top = H - 0.8;
        const Rb = W / 2;
        let lowest = Infinity;
        for (let k = 0; k < tiers; k++) {
            const t = k / (tiers - 1), y = bottom + (top - bottom) * Math.pow(t, 0.92);
            const R = Math.max(0.5, Rb * Math.pow(1 - t, 0.95) * (0.9 + rnd() * 0.18) + 0.35);
            const droop = Math.min(1.3, 0.45 + R * 0.25), thick = 0.55 + R * 0.16;
            const ax = at(y), ph = rnd() * 6.28;
            const ring = (rf, dy, shade, ragged) => {
                const ids = [];
                for (let s = 0; s < segs; s++) {
                    const a = (s / segs) * Math.PI * 2 + ph;
                    const edge = ragged ? 0.82 + 0.3 * Math.abs(Math.sin(a * 2.5 + ph * 3)) + 0.08 * rnd() : 1;
                    const rr = ax.r * 0.8 + (R - ax.r * 0.8) * rf * edge;
                    const x = ax.p[0] + Math.cos(a) * rr, z = ax.p[2] + Math.sin(a) * rr;
                    const yy = y + dy * (ragged ? edge : 1);
                    const sh = shade * (0.94 + 0.12 * rnd());
                    ids.push(leaf.vert(x, yy, z, [leafBase[0] * sh, leafBase[1] * sh, leafBase[2] * sh], sway(yy)));
                    if (yy < lowest) lowest = yy;
                }
                return ids;
            };
            const lid = (ra, rb, flip) => { for (let s = 0; s < segs; s++) { const s1 = (s + 1) % segs; if (flip) { leaf.tri(ra[s], ra[s1], rb[s1]); leaf.tri(ra[s], rb[s1], rb[s]); } else { leaf.tri(ra[s], rb[s1], ra[s1]); leaf.tri(ra[s], rb[s], rb[s1]); } } };
            const lift = 0.25 + R * 0.12; // (a tier rises a little at the trunk, then droops out to its edge)
            const inT = ring(0, lift, 0.8, false), midT = ring(0.55, lift * 0.3 - droop * 0.25, 1.0, false), outE = ring(1, -droop, 1.18, true);
            const midB = ring(0.55, lift * 0.3 - droop * 0.25 - thick, 0.62, false), inB = ring(0, -thick * 0.6, 0.5, false);
            lid(inT, midT, false); lid(midT, outE, false); lid(outE, midB, false); lid(midB, inB, false);
            spheres.push([ax.p[0], y - droop * 0.4, ax.p[2], Math.max(0.6, R * 0.85)]);
            joints.push({ at: ax.p, parentR: ax.r, d: 0 });
        }
        // the tip: a little cone of needles
        const tp = at(top).p, tipIds = [], segsT = far ? 5 : 7;
        for (let s = 0; s < segsT; s++) { const a = (s / segsT) * Math.PI * 2; tipIds.push(leaf.vert(tp[0] + Math.cos(a) * 0.45, top - 0.2, tp[2] + Math.sin(a) * 0.45, mul(leafBase, 1.1), sway(top))); }
        const tipTop = leaf.vert(tp[0], H + 0.6, tp[2], mul(leafBase, 1.2), 1);
        for (let s = 0; s < segsT; s++) leaf.tri(tipIds[s], tipTop, tipIds[(s + 1) % segsT]);
        crown = { c: [0, (bottom + H) / 2, 0], rx: Rb, ry: (H - S.clear) / 2, lowest };
    } else {
        // ---- the broad-leaved trees: a round crown of clumps, each one held by a branch from a limb
        const ry = kind === 1 ? (H - S.clear) * 0.5 : kind === 3 ? (H - S.clear) * 0.48 : (H - S.clear) * 0.5;
        const rx = W / 2;
        const cy = H - ry;
        const tp = trunk[trunk.length - 1];
        const cc = [tp[0] * 0.6, cy, tp[2] * 0.6];
        const K = far ? 4 : kind === 1 ? 11 + Math.floor(rnd() * 3) : 11 + Math.floor(rnd() * 4);
        const clumps = [];
        const ga = Math.PI * (3 - Math.sqrt(5)), off = rnd() * 6.28;
        for (let k = 0; k < K; k++) {
            // spread over the crown (golden angle round, from low to high), the outer ones bigger
            const u = (k + 0.5) / K, yy = kind === 3 ? 0.55 - 1.15 * u : 0.85 - 1.7 * u; // (the cherry: a flatter, wider dome)
            const ring = Math.sqrt(Math.max(0, 1 - yy * yy));
            const a = off + k * ga;
            const f = 0.68 + rnd() * 0.2;
            let p = [cc[0] + Math.cos(a) * ring * rx * f, cc[1] + yy * ry * f, cc[2] + Math.sin(a) * ring * rx * f];
            let r = Math.max(1.0, Math.min(rx, ry) * (kind === 1 ? 0.3 + rnd() * 0.12 : 0.34 + rnd() * 0.14));
            if (far) r *= 1.35;
            // nothing lower than the clear height (the hero walks under it)
            if (p[1] - r * 0.85 < S.clear) p[1] = S.clear + r * 0.85;
            if (p[1] + r * 0.85 > H) { r = Math.max(0.9, (H - S.clear) / 2 / 0.85 * 0.9); p[1] = Math.min(p[1], H - r * 0.85); }
            clumps.push({ p, r, a });
        }
        // one or two big ones in the middle fill the crown
        clumps.push({ p: [cc[0], cc[1] + ry * 0.25, cc[2]], r: Math.min(rx, ry) * (far ? 0.7 : 0.5), a: 0, inner: true });
        // the limbs: big branches out of the trunk, each feeding the clumps on its side
        const nL = far ? 0 : kind === 4 ? 5 + Math.floor(rnd() * 2) : kind === 1 ? 3 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 3);
        const limbs = [];
        for (let k = 0; k < nL; k++) {
            const a = off + (k / nL) * Math.PI * 2 + (rnd() - 0.5) * 0.8;
            const y0 = kind === 1 ? trunkTop * (0.62 + 0.3 * (k / nL)) : Math.max(4.6, trunkTop * (0.7 + 0.3 * rnd()));
            limbs.push({ a, y0, kids: [] });
        }
        for (const c of clumps) {
            if (c.inner || !limbs.length) continue;
            let best = limbs[0], bd = 9;
            for (const L of limbs) { const d = Math.abs(Math.atan2(Math.sin(c.a - L.a), Math.cos(c.a - L.a))); if (d < bd) { bd = d; best = L; } }
            best.kids.push(c);
        }
        for (const L of limbs) {
            if (!L.kids.length) continue;
            const s = at(L.y0);
            // where the limb goes: towards its clumps, a bit inside them
            let m = [0, 0, 0];
            for (const c of L.kids) m = add(m, c.p);
            m = mul(m, 1 / L.kids.length);
            const out = sub(m, s.p);
            const end = add(s.p, mul(out, 0.62));
            if (end[1] < S.clear + 0.5) end[1] = S.clear + 0.5;
            const mid = add(lerp(s.p, end, 0.5), [(rnd() - 0.5) * 0.8, (kind === 3 ? -0.2 : 0.5) + rnd() * 0.5, (rnd() - 0.5) * 0.8]);
            const pts = smoothPath([s.p, mid, end], 6);
            const lr = s.r * (kind === 4 ? 0.6 : 0.5) * (0.85 + rnd() * 0.2);
            branch(pts, lr, lr * 0.55, kind === 4 ? 7 : 6, trunk, s.r);
            // the twigs: from along the limb out to each clump (a fork on the way for the far ones)
            for (const c of L.kids) {
                const j = distToPath(c.p, pts), i0 = Math.max(2, Math.min(pts.length - 1, Math.round(j.at)));
                const st = pts[i0], toC = sub(c.p, st);
                const tEnd = add(st, mul(toC, 0.85));
                const tMid = add(lerp(st, tEnd, 0.5), [(rnd() - 0.5) * 0.6, 0.2 + rnd() * 0.4, (rnd() - 0.5) * 0.6]);
                const tw = smoothPath([st, tMid, tEnd], 4);
                const pr = lr + (lr * 0.55 - lr) * (i0 / (pts.length - 1));
                branch(tw, pr * 0.6, pr * 0.25, 5, pts, pr);
                // a third level: a short spur off the twig, into the clump
                if (len(toC) > 2.2 && rnd() < 0.7) {
                    const sp = tw[1], dir = unit(add(sub(c.p, sp), [(rnd() - 0.5) * 2, 0.6, (rnd() - 0.5) * 2]));
                    const spEnd = add(sp, mul(dir, Math.min(1.8, c.r * 0.8)));
                    branch([sp, lerp(sp, spEnd, 0.5), spEnd], pr * 0.25, pr * 0.1, 4, tw, pr * 0.45);
                }
            }
        }
        let lowest = Infinity;
        for (const c of clumps) {
            clump(leaf, c.p, c.r, far ? 0 : 1, rnd, leafBase, cc, Math.max(rx, ry), sway);
            spheres.push([c.p[0], c.p[1], c.p[2], c.r]);
        }
        for (let q = 1; q < leaf.p.length; q += 3) if (leaf.p[q] < lowest) lowest = leaf.p[q];
        crown = { c: cc, rx, ry, lowest };
    }

    const w = wood.finish(), l = leaf.finish();
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const a of [w.pos, l.pos]) for (let q = 0; q < a.length; q += 3) {
        box[0] = Math.min(box[0], a[q]); box[1] = Math.min(box[1], a[q + 1]); box[2] = Math.min(box[2], a[q + 2]);
        box[3] = Math.max(box[3], a[q]); box[4] = Math.max(box[4], a[q + 1]); box[5] = Math.max(box[5], a[q + 2]);
    }
    const foot = at(1.2);
    const info = {
        kind, variant, H, W, R0, box,
        crown, spheres,
        trunk: { pts: trunk, radii: trunkR, top: trunkTop, foot: [foot.p[0], foot.p[2]], r: foot.r },
        joints, verts: w.count + l.count,
    };
    return { wood: w, leaf: l, info };
}

/** Every variant of every kind, near and far (Trees.js caches them; the tests look at them all). */
export function* allTreeShapes() {
    for (let k = 0; k < TREE_GEN.KINDS; k++) for (let v = 0; v < TREE_GEN.VARIANTS; v++) { yield [k, v, false]; yield [k, v, true]; }
}
