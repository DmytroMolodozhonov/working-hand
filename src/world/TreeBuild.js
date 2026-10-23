/**
 * TreeBuild.js — the new trees (the author: «деревья не будут просто блоками, квадратными. Они будут
 * извивающимися, с большими ветками всевозможными»; and after the first try: «зелёные шары… не похоже на
 * дерево. Я думал, ветки красивые… проработка»).
 *
 * Grown the way real trees grow (the Weber–Penn recipe: a trunk, its limbs, their branches, each with its
 * own length, angle off its parent, turn round it, bend and pull of light or weight), from the descriptions
 * of real trees:
 *  - oak (Quercus robur): a short thick trunk splitting into crooked spreading limbs, a broad irregular crown;
 *  - birch (Betula pendula): a slim white trunk to the top, limbs arching up, thin twigs hanging down,
 *    an open oval crown; black cracks on the bark low down;
 *  - spruce (Picea abies): a narrow cone, near-level boughs whose tips turn up, the lower ones sag, their
 *    branchlets hang;
 *  - cherry (Prunus serrulata): a short trunk opening into a vase of limbs, a flat wide crown of blossom;
 *  - dark oak: an old massive oak, gnarled and twisted.
 * The leaves are cards — each a sprig of drawn leaves (TreeLeaves.js draws them) — set along the thin
 * branches, so the crown is a lace of leaves with the sky through it, not a ball.
 *
 * Plain arrays, no THREE: the terrain workers can make them too. Everything comes from the kind and the
 * variant (the same tree on every computer); a world tree is one of VARIANTS shapes of its kind, turned,
 * scaled and tinted on its own.
 *
 * Sizes from the world's measures (block 1 m, the hero ~3.5 m): taller than the old block trees (9–12 m) —
 * the author: «деревья должны быть реально выше персонажа… чтобы ветки не задевали» — and no leaf and no
 * branch but the trunk lower than TREE_SIZES.clear (5 m and more): the hero walks under the crowns.
 */

export const TREE_GEN = { VARIANTS: 12, KINDS: 5 };

/** Per kind: height H, crown width W, trunk diameter D at the ground (m, [min, max]), the clear height under the crown. */
export const TREE_SIZES = [
    { name: 'Дуб', H: [14, 18], W: [12, 16], D: [0.9, 1.2], clear: 5.2 },
    { name: 'Берёза', H: [15, 19], W: [6, 8.5], D: [0.45, 0.6], clear: 5.8 },
    { name: 'Ель', H: [19, 25], W: [8, 10.5], D: [0.6, 0.85], clear: 5.0 },
    { name: 'Вишня', H: [9, 11.5], W: [10, 13], D: [0.5, 0.7], clear: 4.8 },
    { name: 'Тёмный дуб', H: [15, 19], W: [14, 18], D: [1.1, 1.4], clear: 5.2 },
    // the apple trees (Animals.js: not of the forest — kinds 5 and 6 never come out of the world's recipe): low and wide,
    // as a real apple tree is, the apples hanging within a raised hand's reach (2.9–4.4 m), the leaves a little higher
    { name: 'Яблоня', H: [7.5, 9], W: [8, 10], D: [0.45, 0.6], clear: 3.9 },
    { name: 'Золотая яблоня', H: [8.5, 10], W: [9, 11], D: [0.6, 0.75], clear: 3.9 },
];
/** The cells of the leaf atlas (TreeLeaves.js): one per kind, the apple trees' two, and a plain one for the bark. */
export const ATLAS_CELLS = 8;
/** The atlas's plain cell: the bark (one material for the whole tree — one draw). */
export const BARK_CELL = 7;
const BARK_U = (BARK_CELL + 0.5) / ATLAS_CELLS;

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const BARK = [hex(0x5e4632), hex(0xe9e6de), hex(0x4f3a2b), hex(0x5b3330), hex(0x3a2c22), hex(0x5a4030), hex(0x9a6a2a)];
const BARK_DARK = hex(0x2b2724); // (the birch's black cracks)

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

// ---------------------------------------------------------------- vectors (plain arrays: no THREE)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** a rotated round the unit axis k by angle t (Rodrigues). */
function rot(a, k, t) {
    const c = Math.cos(t), s = Math.sin(t), kd = dot(k, a) * (1 - c), kx = cross(k, a);
    return [a[0] * c + kx[0] * s + k[0] * kd, a[1] * c + kx[1] * s + k[1] * kd, a[2] * c + kx[2] * s + k[2] * kd];
}
const perp = (d) => unit(Math.abs(d[1]) < 0.9 ? cross(d, [0, 1, 0]) : cross(d, [1, 0, 0]));

// ---------------------------------------------------------------- a growing mesh
class Part {
    constructor(uv = false) { this.p = []; this.c = []; this.s = []; this.i = []; this.n = []; this.uv = uv ? [] : null; }
    get count() { return this.p.length / 3; }
    vert(x, y, z, n, col, sway, u = 0, v = 0) {
        this.p.push(x, y, z); this.n.push(n[0], n[1], n[2]); this.c.push(col[0], col[1], col[2]); this.s.push(sway);
        if (this.uv) this.uv.push(u, v);
        return this.count - 1;
    }
    tri(a, b, c) { this.i.push(a, b, c); }
    finish() {
        const n = this.count;
        return {
            pos: new Float32Array(this.p), nor: new Float32Array(this.n), col: new Float32Array(this.c), sway: new Float32Array(this.s),
            uv: this.uv ? new Float32Array(this.uv) : null, index: n > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i), count: n,
        };
    }
}

/**
 * Per kind, per level (0 trunk, 1 limbs, 2 branches): how they grow. down: angle off the parent (rad);
 * rotate: the turn round the parent from one child to the next (phyllotaxis); n: children; from: where
 * along the parent the children start (0..1); ratio: a child's length to its parent's; curve: bend over
 * the stem (rad), curveV: random bend; trop: pull up (+) or down (−) per metre; seg / sides: rings and
 * sides of its tube; rr: its radius to the parent's there.
 */
const SPEC = [
    // oak: a short trunk, 5–7 crooked spreading limbs, branches all over them
    { split: [0.3, 0.36], shape: 'round', leafSize: 1.7, leafPer: 12, leaves1: 6,
        L: [{ seg: 12, sides: 10, curveV: 0.3 },
            { n: [4, 6], from: 0.75, down: [0.4, 0.75], rotate: 2.4, ratio: 0.7, curve: -0.5, curveV: 0.45, trop: 0.03, seg: 9, sides: 7, rr: 0.7 },
            { n: [9, 11], from: 0.2, down: [0.6, 1.0], rotate: 2.4, ratio: 0.5, curve: -0.3, curveV: 0.5, trop: 0.02, seg: 5, sides: 4, rr: 0.55 }] },
    // birch: a slim trunk to the top, limbs arching up, hanging twigs
    { split: [0.92, 0.95], shape: 'flame', leafSize: 1.4, leafPer: 10, leaves1: 3, hang: 0.9,
        L: [{ seg: 14, sides: 9, curveV: 0.12 },
            { n: [10, 13], from: 0.36, down: [0.6, 0.85], rotate: 2.4, ratio: 0.5, curve: 0.35, curveV: 0.3, trop: 0.03, seg: 7, sides: 5, rr: 0.4 },
            { n: [4, 5], from: 0.25, down: [0.7, 1.1], rotate: 2.4, ratio: 0.55, curve: 0.9, curveV: 0.3, trop: -0.22, seg: 5, sides: 3, rr: 0.5 }] },
    // spruce: a straight trunk to the tip, whorls of near-level boughs, tips turned up, branchlets hanging
    { split: [0.97, 0.99], shape: 'cone', leafSize: 1.9, leafPer: 6, leaves1: 11, needles: true,
        L: [{ seg: 14, sides: 9, curveV: 0.05 },
            { n: [28, 34], from: 0.24, down: [1.45, 1.65], rotate: 2.4, ratio: 0.3, curve: -0.35, curveV: 0.15, trop: -0.02, seg: 6, sides: 4, rr: 0.3 },
            { n: [4, 6], from: 0.2, down: [0.95, 1.2], rotate: Math.PI, ratio: 0.45, curve: 0.25, curveV: 0.2, trop: -0.12, seg: 3, sides: 3, rr: 0.5 }] },
    // cherry: a short trunk, a vase of 4–5 limbs, a flat wide top of blossom
    { split: [0.3, 0.36], shape: 'vase', leafSize: 1.4, leafPer: 10, leaves1: 5,
        L: [{ seg: 10, sides: 8, curveV: 0.35 },
            { n: [4, 5], from: 0.95, down: [0.6, 0.85], rotate: 2.4, ratio: 0.95, curve: -0.55, curveV: 0.35, trop: 0.0, seg: 9, sides: 6, rr: 0.7 },
            { n: [7, 9], from: 0.3, down: [0.55, 0.95], rotate: 2.4, ratio: 0.45, curve: -0.3, curveV: 0.4, trop: 0.01, seg: 5, sides: 4, rr: 0.55 }] },
    // dark oak: an old massive oak, twisted, more limbs
    { split: [0.28, 0.34], shape: 'round', leafSize: 1.8, leafPer: 12, leaves1: 6, gnarl: 1,
        L: [{ seg: 12, sides: 11, curveV: 0.45 },
            { n: [5, 7], from: 0.75, down: [0.5, 0.9], rotate: 2.4, ratio: 0.72, curve: -0.6, curveV: 0.6, trop: 0.01, seg: 9, sides: 7, rr: 0.6 },
            { n: [9, 11], from: 0.2, down: [0.6, 1.05], rotate: 2.4, ratio: 0.48, curve: -0.35, curveV: 0.6, trop: 0.01, seg: 5, sides: 4, rr: 0.55 }] },
    // apple tree: a short crooked trunk forking low into spreading limbs, a round dome of leaves, the branch ends drooping with fruit
    { split: [0.28, 0.32], shape: 'round', leafSize: 1.15, leafPer: 10, leaves1: 6, gnarl: 0.5, low: 1.6,
        L: [{ seg: 10, sides: 9, curveV: 0.35 },
            { n: [5, 6], from: 0.7, down: [0.7, 1.0], rotate: 2.4, ratio: 0.9, curve: -0.4, curveV: 0.45, trop: 0.01, seg: 8, sides: 6, rr: 0.66 },
            { n: [8, 10], from: 0.2, down: [0.6, 1.0], rotate: 2.4, ratio: 0.5, curve: 0.2, curveV: 0.45, trop: -0.02, seg: 5, sides: 4, rr: 0.55 }] },
    // the golden apple tree: the same, mightier and more twisted
    { split: [0.27, 0.31], shape: 'round', leafSize: 1.25, leafPer: 11, leaves1: 6, gnarl: 0.9, low: 1.6,
        L: [{ seg: 11, sides: 10, curveV: 0.4 },
            { n: [6, 7], from: 0.7, down: [0.7, 1.0], rotate: 2.4, ratio: 0.9, curve: -0.45, curveV: 0.5, trop: 0.01, seg: 8, sides: 7, rr: 0.66 },
            { n: [8, 10], from: 0.2, down: [0.6, 1.0], rotate: 2.4, ratio: 0.5, curve: 0.2, curveV: 0.5, trop: -0.02, seg: 5, sides: 4, rr: 0.55 }] },
];

/** How long a limb is by where it starts on the trunk (0 low … 1 high): the crown's outline. */
function shapeRatio(shape, t) {
    switch (shape) {
        case 'cone': return 0.08 + 0.92 * Math.pow(1 - t, 1.15); // (long low, short high)
        case 'flame': return t <= 0.7 ? 0.35 + 0.65 * (t / 0.7) : 0.35 + 0.65 * ((1 - t) / 0.3);
        case 'vase': return 1;
        default: return 0.7 + 0.3 * Math.sin(Math.PI * Math.min(1, t)); // round
    }
}

const range = (rnd, [a, b]) => a + (b - a) * rnd();

/**
 * One tree of a kind and variant → {wood, leaf, info}. wood: the trunk and branches (pos, nor, col, sway,
 * index); leaf: the leaf cards (with uv: TreeLeaves.js's picture). info: height, the box, the crown (centre,
 * radii, `spheres` [x, y, z, r] round the leaf clusters — hits), the trunk (axis points, radii: collision),
 * joints (every branch's start and how far it is from its parent's axis — tests), the lowest leaf.
 * far: the simple shape for far away (the trunk, the limbs, a few big cards).
 */
export function buildTree(kind, variant, { far = false } = {}) {
    kind = Math.max(0, Math.min(6, kind | 0));
    variant |= 0;
    const rnd = treeRandom(0x9e3779b1 ^ (kind * 7919 + variant * 104729));
    const S = TREE_SIZES[kind], P = SPEC[kind];
    // every tree its own (the author: «некоторые деревья могут быть тонкими, некоторые очень толстыми… крона
    // разнообразная»): young and slim, grown, or old and thick; the crown round, tall, spreading or lopsided
    const age = variant % 3; // 0 grown, 1 young (slim), 2 old (thick)
    const girth = [1, 0.7, 1.4][age] * (0.92 + 0.16 * rnd());
    const FORMS = P.shape === 'cone' ? ['cone', 'slim', 'broad'] : ['round', 'tall', 'spread', 'lopsided'];
    const form = FORMS[(variant * 7 + (variant >> 2)) % FORMS.length];
    const fH = (form === 'tall' || form === 'slim' ? 1.1 : form === 'spread' ? 0.92 : 1) * [1, 0.95, 1.1][age];
    const fW = (form === 'tall' || form === 'slim' ? 0.75 : form === 'spread' || form === 'broad' ? 1.22 : 1) * [1, 0.85, 1.15][age];
    const dens = 0.9 + 0.3 * rnd() + (age === 2 ? 0.1 : 0);
    const lopA = rnd() * Math.PI * 2;
    const H = range(rnd, S.H) * fH, W = range(rnd, S.W) * fW, R0 = range(rnd, S.D) / 2 * girth;
    const wood = new Part(true), leaf = new Part(true);
    const joints = [], spheres = [];
    const barkC = BARK[kind];
    const sway = (y) => { const t = Math.max(0, y - 2) / H; return Math.min(1, t * t * 1.4); };
    const clear = S.clear;
    // the crown's middle (for the leaves' light: lit as a round mass from outside)
    const crownC = [0, P.shape === 'cone' ? clear + (H - clear) * 0.4 : (clear + H) / 2 + 0.6, 0];
    const crownR = Math.max(W / 2, (H - clear) / 2);
    let lowest = Infinity;

    // ---- one stem: points bent along, a tube round them, its children, its leaves
    const stems = [];
    const grow = (level, start, dir, length, radius, parentPath = null) => {
        const spec = P.L[level];
        const seg = far ? Math.max(2, Math.ceil(spec.seg / 3)) : spec.seg;
        const sides = far ? (level === 0 ? 5 : 3) : spec.sides;
        const pts = [start], radii = [radius];
        let d = dir.slice(), p = start.slice();
        const bendAxis = perp(d);
        const gn = (P.gnarl || 0) * (level < 2 ? 1 : 0.4);
        for (let k = 1; k <= seg; k++) {
            const t = k / seg;
            // bend: the stem's own curve and a random wobble
            const c = (spec.curve || 0) / seg + (rnd() - 0.5) * 2 * (spec.curveV || 0) / Math.sqrt(seg) * (1 + gn);
            d = unit(rot(d, k % 3 === 0 ? perp(d) : bendAxis, c));
            if (level === 0) d = unit(add(d, [0, 0.35 + (P.gnarl ? 0 : 0.25), 0])); // (a trunk keeps upright overall)
            // light pulls branches up, weight pulls thin twigs down
            if (spec.trop) d = unit(add(d, [0, spec.trop * (length / seg) * (level === 2 ? 1 + 2 * t : 1), 0]));
            p = add(p, mul(d, length / seg));
            // nothing but the trunk comes down into the walking space
            if (level > 0 && k > 1 && p[1] < clear + 0.2 && p[1] < start[1] + 0.3) { p[1] = clear + 0.2; d = unit([d[0], Math.max(d[1], 0.15), d[2]]); }
            pts.push(p);
            const taper = level === 0 ? Math.pow(1 - t * 0.82, 1.1) : 1 - t * 0.88;
            radii.push(Math.max(level === 0 ? 0.05 : 0.012, radius * taper));
        }
        const stem = { level, pts, radii, length };
        stems.push(stem);
        tube(stem, sides, level === 0 ? (P.gnarl ? 0.18 : 0.05) : 0);
        if (parentPath) {
            const j = distToPath(start, parentPath.pts);
            joints.push({ level, at: start, parentR: radiusAt(parentPath, j.at), d: j.d });
        }
        // children
        const next = P.L[level + 1];
        if (next && !(far && level === 1)) {
            const nk = Math.round(range(rnd, next.n) * (level === 1 ? dens : 1));
            let turn = rnd() * Math.PI * 2;
            for (let i = 0; i < nk; i++) {
                const along = next.from + (1 - next.from) * ((i + 0.3 + rnd() * 0.4) / nk);
                const at = pointAt(stem, along);
                if (level === 0 && at.p[1] < (P.low ?? (kind === 3 ? 2.4 : kind === 1 || kind === 2 ? clear : 3.8))) continue;
                turn += next.rotate + (rnd() - 0.5) * 0.5;
                const down = range(rnd, next.down) * (level === 0 ? (form === 'tall' ? 0.7 : form === 'spread' ? 1.25 : 1) : 1);
                // the child's direction: off the parent by `down`, turned round it by `turn`
                let cd = rot(at.d, rot(perp(at.d), at.d, turn), down);
                if (level === 0 && P.shape === 'vase') cd = unit(add(cd, [0, 0.55, 0]));
                let L = length * next.ratio * (level === 0 ? shapeRatio(P.shape, (at.p[1] - clear) / Math.max(1, H - clear)) : (1 - along * 0.55));
                if (level === 0) L *= (P.shape === 'cone' ? W / 2 : P.shape === 'vase' ? W / 2 * 0.95 : P.shape === 'flame' ? W / 2 * 1.3 : W / 2 * 1.0) / (length * next.ratio) * (0.85 + rnd() * 0.3);
                if (kind === 2 && level === 0) cd = unit([cd[0], -0.05 - 0.25 * (1 - (at.p[1] - clear) / (H - clear)) + rnd() * 0.08, cd[2]]); // (spruce boughs: level, the low ones sagging)
                // (lopsided: the limbs on one side, towards the light, longer than the others)
                if (level === 0 && form === 'lopsided') L *= 1 + 0.4 * (cd[0] * Math.cos(lopA) + cd[2] * Math.sin(lopA));
                grow(level + 1, at.p, cd, Math.max(0.6, L), Math.max(0.02, at.r * next.rr * (0.85 + rnd() * 0.3)), stem);
            }
            // the oaks and the cherry: a leader goes on up from the fork and fills the crown's top
            if (level === 0 && !P.needles && kind !== 1 && !far) {
                const at = pointAt(stem, 0.999), up = unit(add(at.d, [(rnd() - 0.5) * 0.3, 1.2, (rnd() - 0.5) * 0.3]));
                const L = Math.max(2, (H - at.p[1]) * (form === 'spread' ? 0.55 : 0.75));
                grow(1, at.p, up, L, at.r * 0.62, stem);
            }
        }
        // leaves: along the thin branches (and the ends of the limbs)
        if (level === P.L.length - 1 || level === 1) addLeaves(stem, level);
    };

    const radiusAt = (stem, at) => { const i = Math.min(stem.radii.length - 2, Math.floor(at)), t = at - i; return stem.radii[i] + (stem.radii[i + 1] - stem.radii[i]) * t; };
    const pointAt = (stem, f) => {
        const u = Math.max(0, Math.min(0.999, f)) * (stem.pts.length - 1), i = Math.floor(u), t = u - i;
        const a = stem.pts[i], b = stem.pts[i + 1];
        return { p: add(a, mul(sub(b, a), t)), d: unit(sub(b, a)), r: stem.radii[i] + (stem.radii[i + 1] - stem.radii[i]) * t };
    };

    // the bark colour of a point (birch: white with black cracks low down and dark marks across)
    const barkAt = (level, r, s, y) => {
        if (kind === 1) {
            const h = Math.sin(r * 12.9898 + s * 78.233 + variant * 3.1 + level * 5.3) * 43758.5453, f = h - Math.floor(h);
            if (level === 0 && ((y < 1.2 + f * 1.5 && f < 0.55) || f < 0.14)) return BARK_DARK;
            if (level > 0 && f < 0.3) return [0.42, 0.4, 0.38];
        }
        const k = 0.88 + 0.12 * Math.sin(r * 1.7 + s * 2.3 + variant) - (level === 2 ? 0.08 : 0);
        return [barkC[0] * k, barkC[1] * k, barkC[2] * k];
    };

    function tube(stem, sides, twist) {
        const { pts, radii, level } = stem;
        const first = wood.count;
        let N = perp(unit(sub(pts[1], pts[0])));
        const lobes = 4 + (variant % 3), lph = variant * 1.3;
        for (let r = 0; r < pts.length; r++) {
            const T = unit(sub(pts[Math.min(pts.length - 1, r + 1)], pts[Math.max(0, r - 1)]));
            N = unit(sub(N, mul(T, dot(N, T))));
            const B = cross(T, N);
            const y = pts[r][1];
            for (let s = 0; s < sides; s++) {
                const a = (s / sides) * Math.PI * 2 + twist * r;
                // the trunk's foot flares into root buttresses
                const flare = level === 0 ? 1 + (P.gnarl ? 1.0 : 0.7) * Math.exp(-Math.max(0, y) / 0.8) * (0.5 + 0.5 * Math.cos(lobes * a + lph)) : 1;
                const n = add(mul(N, Math.cos(a)), mul(B, Math.sin(a)));
                const q = add(pts[r], mul(n, radii[r] * flare));
                wood.vert(q[0], q[1], q[2], n, barkAt(level, r, s, q[1]), sway(q[1]), BARK_U, 0.5);
            }
            if (r > 0) {
                const a0 = first + (r - 1) * sides, b0 = first + r * sides;
                for (let s = 0; s < sides; s++) { const s1 = (s + 1) % sides; wood.tri(a0 + s, b0 + s, b0 + s1); wood.tri(a0 + s, b0 + s1, a0 + s1); }
            }
        }
        // the tip closed with a point
        const e = pts[pts.length - 1], T = unit(sub(e, pts[pts.length - 2])), tip = add(e, mul(T, radii[radii.length - 1] * 1.5));
        const c = wood.vert(tip[0], tip[1], tip[2], T, barkAt(level, pts.length, 0, tip[1]), sway(tip[1]), BARK_U, 0.5);
        const b0 = first + (pts.length - 1) * sides;
        for (let s = 0; s < sides; s++) wood.tri(b0 + s, c, b0 + (s + 1) % sides);
    }

    // ---- leaf cards: a sprig of leaves each (its stalk at the card's bottom middle, the leaves up along it)
    const cardTint = 0.9 + rnd() * 0.15;
    function addLeaves(stem, level) {
        const n = far ? 2 : Math.round((level === 1 ? P.leaves1 : P.leafPer) * dens);
        let size0 = P.leafSize * (far ? 2.6 : 1) * (level === 1 ? 1.15 : 1);
        if (P.needles) size0 *= Math.max(0.4, Math.min(1, (level === 1 ? stem.length : stem.length * 2.2) / 3.2)); // (short boughs up top: small sprays — the cone)
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (let i = 0; i < n; i++) {
            const f = level === 1 ? (P.needles ? 0.2 + 0.8 * ((i + rnd() * 0.7) / n) : 0.55 + 0.45 * ((i + rnd()) / n)) : 0.15 + 0.85 * ((i + rnd() * 0.6) / n);
            const at = pointAt(stem, f);
            if (at.p[1] < clear + 0.3) continue;
            const size = size0 * (0.75 + rnd() * 0.5);
            // the sprig's direction: out from the branch, round it, the way the kind holds its leaves
            const side = rot(perp(at.d), at.d, rnd() * Math.PI * 2);
            let up;
            if (P.needles) up = unit(add(at.d, [(rnd() - 0.5) * 0.4, (rnd() - 0.6) * 0.3, (rnd() - 0.5) * 0.4])); // (spruce: along the bough, flat)
            else if (P.hang) up = unit(add(mul(side, 0.45), [0, -P.hang, 0])); // (birch: hanging sprays)
            else up = unit(add(mul(at.d, 0.6), add(mul(side, 0.7), [0, 0.25, 0])));
            let across = cross(up, P.needles ? [0, 1, 0] : side);
            across = len(across) < 0.1 ? perp(up) : unit(across);
            if (P.needles) across = unit(rot(across, up, (rnd() - 0.5) * 0.7));
            if (P.needles && i % 3 === 2 && level === 2) { up = unit(add(mul(at.d, 0.3), [0, -1, 0])); across = perp(up); } // (a branchlet hanging)
            const base = at.p;
            let top = add(base, mul(up, size));
            if (P.hang && top[1] < clear + 0.3) continue;
            if (top[1] < clear + 0.3) continue;
            const hw = size * (P.needles ? 0.62 : 0.5);
            const c0 = add(base, mul(across, -hw)), c1 = add(base, mul(across, hw)), c2 = add(top, mul(across, hw)), c3 = add(top, mul(across, -hw));
            const mid = add(base, mul(up, size * 0.5));
            // lit as a round crown: the normal points out from the crown's middle (soft, no flat cards)
            const out = unit(sub(mid, crownC)), fn = unit(cross(across, up));
            const nrm = unit(add(add(mul(out, 0.6), [0, 0.65, 0]), mul(fn, dot(fn, out) >= 0 ? 0.15 : -0.15))); // (up-ish: the sun lights the whole crown, the lower part a little less)
            // darker inside the crown, lighter at its top and edge
            const outF = Math.min(1, len(sub(mid, crownC)) / crownR);
            const sh = cardTint * (kind === 3 || kind === 6 ? 0.82 + 0.14 * outF : 0.7 + 0.26 * outF + 0.08 * Math.max(0, nrm[1]));
            const col = [sh, sh, sh];
            const flip = rnd() < 0.5; // (the picture mirrored: not every sprig the same)
            // (the atlas: one cell per kind — TreeLeaves.js)
            const uL = (kind + (flip ? 0.995 : 0.005)) / ATLAS_CELLS, uR = (kind + (flip ? 0.005 : 0.995)) / ATLAS_CELLS;
            const v0 = leaf.vert(c0[0], c0[1], c0[2], nrm, col, sway(c0[1]), uL, 0);
            leaf.vert(c1[0], c1[1], c1[2], nrm, col, sway(c1[1]), uR, 0);
            leaf.vert(c2[0], c2[1], c2[2], nrm, col, sway(c2[1]) + 0.15, uR, 1);
            leaf.vert(c3[0], c3[1], c3[2], nrm, col, sway(c3[1]) + 0.15, uL, 1);
            leaf.tri(v0, v0 + 1, v0 + 2); leaf.tri(v0, v0 + 2, v0 + 3);
            for (const c of [c0, c1, c2, c3]) if (c[1] < lowest) lowest = c[1];
            sx += mid[0]; sy += mid[1]; sz += mid[2]; cnt++;
        }
        if (cnt && level === P.L.length - 1) spheres.push([sx / cnt, sy / cnt, sz / cnt, Math.max(0.8, stem.length * 0.45 + size0 * 0.4)]);
    }

    // ---- the trunk: up from under the ground, leaning and winding a little
    const la = rnd() * 6.28;
    const lean = rot([0, 1, 0], [Math.cos(la), 0, Math.sin(la)], (P.gnarl ? 0.1 : 0.05) * rnd());
    const trunkLen = H * range(rnd, P.split) + 0.5;
    grow(0, [0, -0.5, 0], lean, trunkLen, R0);
    const trunk = stems[0];

    const w = wood.finish(), l = leaf.finish();
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const a of [w.pos, l.pos]) for (let q = 0; q < a.length; q += 3) {
        if (a[q] < box[0]) box[0] = a[q]; if (a[q + 1] < box[1]) box[1] = a[q + 1]; if (a[q + 2] < box[2]) box[2] = a[q + 2];
        if (a[q] > box[3]) box[3] = a[q]; if (a[q + 1] > box[4]) box[4] = a[q + 1]; if (a[q + 2] > box[5]) box[5] = a[q + 2];
    }
    const foot = pointAt(trunk, 1.7 / trunkLen);
    // the apple trees: where the apples hang — under the branches' ends, all round, within a raised hand's reach
    const apples = [];
    if (kind >= 5 && !far) {
        const bins = new Array(14).fill(0), cand = [];
        for (const st of stems) {
            if (st.level < 1) continue;
            for (let f = 0.35; f <= 1; f += 0.16) {
                const at = pointAt(st, f), y = at.p[1] - 0.32;
                if (y < 2.9 || y > 4.4 || Math.hypot(at.p[0], at.p[2]) < 1.2) continue;
                cand.push([at.p[0], y, at.p[2], st.level]);
            }
        }
        // (spread round the crown: the fewest apples on a side first)
        for (let i = 0; i < cand.length && apples.length < 22; i++) {
            const k = Math.floor(rnd() * cand.length), c = cand[k];
            const b = Math.floor(((Math.atan2(c[2], c[0]) + Math.PI) / (Math.PI * 2)) * 14) % 14;
            if (bins[b] > Math.min(...bins) + 1) continue;
            if (apples.some((a) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]) < 0.55)) continue;
            bins[b]++;
            apples.push([c[0], c[1], c[2]]);
        }
    }
    const info = {
        apples,
        kind, variant, H: box[4], W: Math.max(box[3] - box[0], box[5] - box[2]), R0, box,
        crown: { c: crownC, rx: (box[3] - box[0]) / 2, ry: (box[4] - clear) / 2, lowest },
        spheres,
        trunk: { pts: trunk.pts, radii: trunk.radii, foot: [foot.p[0], foot.p[2]], r: foot.r },
        joints, verts: w.count + l.count, cards: l.count / 4,
    };
    return { wood: w, leaf: l, info };
}

/** Distance from a point to a polyline, and where along it (segments + fraction). */
function distToPath(p, pts) {
    let best = Infinity, at = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], ab = sub(pts[k + 1], a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
        const d = len(sub(p, add(a, mul(ab, t))));
        if (d < best) { best = d; at = k + t; }
    }
    return { d: best, at };
}

/** Every variant of every kind, near and far. */
export function* allTreeShapes() {
    for (let k = 0; k < TREE_GEN.KINDS; k++) for (let v = 0; v < TREE_GEN.VARIANTS; v++) { yield [k, v, false]; yield [k, v, true]; }
}
