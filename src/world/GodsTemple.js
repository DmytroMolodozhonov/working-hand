/**
 * GodsTemple.js — the abandoned Temple of the Gods (the author: «На Венере можно будет найти храм —
 * заброшенный храм богов. Внутри будет библиотека…»).
 *
 * Pure and deterministic (no THREE: it runs in a web worker — temple.worker.js): from the seed the
 * same temple on every computer. It makes the temple's look as ready mesh arrays (positions, normals,
 * colours per material) and its solid parts as boxes; the THREE side is src/game/Temple.js.
 *
 * ── HOW TO PUT THE TEMPLE ON A PLANET (API) ──────────────────────────────────────────────────────
 *   game.temple.place({ x, y, z, rot })   (src/game/Temple.js)
 *     x, z — where the middle of the temple stands (world), y — the ground there (the foot of its
 *     front stairs; the floor is TEMPLE.RISE·K above it, the stone podium goes TEMPLE.DEPTH·K below,
 *     so uneven ground round it is hidden); rot 0…3 — the doors look to +z, +x, −z, −x.
 *     The footprint (for clearing trees / levelling): templeFootprint(spot) → {minX, maxX, minZ, maxZ}.
 *   templeSpot(seed, groundAt, {cx, cz, R}) → {x, y, z, rot} — ONE deterministic place for it on a
 *     planet's surface (groundAt(x, z) → height): the flattest of candidates round (cx, cz) within R.
 *   game.temple.remove() — takes it away (leaving the planet).
 *   game.temple.placeTest() — Creative on Earth: puts it on the test ground by the start (for checks
 *     and e2e — never in a normal game).
 * Everything solid (walls, columns, statues, shelves, the four pedestals) stops bodies, hands,
 * spells and sight. It is a gift of the gods: no spell breaks or moves any of it (`godGift`).
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Plan (local metres, before the scale K; the doors at +z, the floor y = 0):
 *   the stairs and the portico of six columns (two fallen) → the Hall of the Creator: a golden god
 *   on a high plinth, two rows of columns, a breach in the right wall with Venus's sand blown in,
 *   light falling through holes in the roof → on the left the Gallery of the Gods (six statues in
 *   their poses) → behind the golden god the Library: shelves of old books (some fallen, one stack
 *   toppled), cobwebs and dust, the god of Wisdom (a book, an owl) with two pedestals on each side,
 *   a scroll floating over each.
 */

import { createRng } from '../core/math.js';

export const TEMPLE = {
    K: 2.2, // game units per metre of the plan (the hero is ~4 units tall)
    RISE: 1.5, // m: the floor above the ground at the stairs' foot
    DEPTH: 9, // m: the podium goes this far below the floor (uneven ground hidden)
    X0: -33, X1: 19.5, Z0: -63.5, Z1: 18, // m: the footprint (local)
    HALL_H: 15, GAL_H: 10, LIB_H: 12,
    FAR: 520, // game units: beyond this it is not drawn
};

/** The four scrolls of the library's pedestals (the spells' names — taught by burning a scroll). */
export const TEMPLE_SCROLLS = ['CreatePlanet', 'EnlargePlanet', 'TerraformPlanet', 'LevitationSuperMaxima'];

/** Materials of the mesh arrays (Temple.js makes one THREE material for each). */
export const TEMPLE_MATS = ['stone', 'marble', 'gold', 'wood', 'sand', 'web', 'shaft'];

// ─── small affine maths (3×3 + translation, row-major) ───────────────────────────────────────
const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
function mul(A, B) { // A·B (apply B first)
    const o = new Array(12);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
        o[9 + r] = A[r * 3] * B[9] + A[r * 3 + 1] * B[10] + A[r * 3 + 2] * B[11] + A[9 + r];
    }
    return o;
}
const T = (x, y, z) => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];
const S = (s) => [s, 0, 0, 0, s, 0, 0, 0, s, 0, 0, 0];
function Rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c, 0, 0, 0]; }
function Ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c, 0, 0, 0]; }
function Rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1, 0, 0, 0]; }
const ap = (M, x, y, z) => [M[0] * x + M[1] * y + M[2] * z + M[9], M[3] * x + M[4] * y + M[5] * z + M[10], M[6] * x + M[7] * y + M[8] * z + M[11]];
const dirOf = (M, x, y, z) => [M[0] * x + M[1] * y + M[2] * z, M[3] * x + M[4] * y + M[5] * z, M[6] * x + M[7] * y + M[8] * z];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** A frame whose y axis is `d` (unit), placed at p. */
function along(p, d) {
    const y = norm(d);
    const ref = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const x = norm(cross(ref, y)), z = cross(x, y);
    return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2], p[0], p[1], p[2]];
}
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const tint = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

// ─── the mesh arrays ─────────────────────────────────────────────────────────────────────────
class Geo {
    constructor() { this.p = []; this.n = []; this.c = []; }
    tri(a, b, c, n, col) {
        this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        for (let i = 0; i < 3; i++) { this.n.push(n[0], n[1], n[2]); this.c.push(col[0], col[1], col[2]); }
    }
    quad(a, b, c, d, n, col) { this.tri(a, b, c, n, col); this.tri(a, c, d, n, col); }
}

class Builder {
    constructor(seed) {
        this.g = {};
        for (const m of TEMPLE_MATS) this.g[m] = new Geo();
        this.solids = []; // {x0,x1,y0,y1,z0,z1} (local metres, axis-aligned)
        this.rng = createRng(seed >>> 0);
    }
    /** A box w×h×d centred on M's origin; `skip` faces: 'b' bottom, 'k' back (−z). */
    box(mat, M, w, h, d, col, skip = '') {
        const G = this.g[mat], x = w / 2, y = h / 2, z = d / 2;
        const P = (a, b, c) => ap(M, a, b, c);
        const N = (a, b, c) => norm(dirOf(M, a, b, c));
        const top = tint(col, 1.08), side = col, dark = tint(col, 0.86);
        G.quad(P(-x, y, z), P(x, y, z), P(x, y, -z), P(-x, y, -z), N(0, 1, 0), top);
        if (!skip.includes('b')) G.quad(P(-x, -y, -z), P(x, -y, -z), P(x, -y, z), P(-x, -y, z), N(0, -1, 0), dark);
        G.quad(P(-x, -y, z), P(x, -y, z), P(x, y, z), P(-x, y, z), N(0, 0, 1), side);
        if (!skip.includes('k')) G.quad(P(x, -y, -z), P(-x, -y, -z), P(-x, y, -z), P(x, y, -z), N(0, 0, -1), dark);
        G.quad(P(x, -y, z), P(x, -y, -z), P(x, y, -z), P(x, y, z), N(1, 0, 0), side);
        G.quad(P(-x, -y, -z), P(-x, -y, z), P(-x, y, z), P(-x, y, -z), N(-1, 0, 0), dark);
    }
    /** An axis-aligned box by its corners (local), optionally solid. */
    abox(mat, x0, y0, z0, x1, y1, z1, col, solid = true, skip = '') {
        this.box(mat, T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), x1 - x0, y1 - y0, z1 - z0, col, skip);
        if (solid) this.solid(x0, y0, z0, x1, y1, z1);
    }
    solid(x0, y0, z0, x1, y1, z1, extra = null) {
        this.solids.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), ...(extra || {}) });
    }
    /** A (tapered) cylinder along M's y, centred; r0 at the bottom, r1 at the top. */
    cyl(mat, M, r0, r1, h, col, seg = 10, caps = true) {
        const G = this.g[mat], y0 = -h / 2, y1 = h / 2;
        for (let i = 0; i < seg; i++) {
            const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
            const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
            const am = (a0 + a1) / 2, n = norm(dirOf(M, Math.cos(am), (r0 - r1) / h, Math.sin(am)));
            const sh = tint(col, 0.9 + 0.12 * Math.cos(am - 0.8));
            G.quad(ap(M, c0 * r0, y0, s0 * r0), ap(M, c0 * r1, y1, s0 * r1), ap(M, c1 * r1, y1, s1 * r1), ap(M, c1 * r0, y0, s1 * r0), n, sh);
            if (caps && r1 > 0) G.tri(ap(M, 0, y1, 0), ap(M, c1 * r1, y1, s1 * r1), ap(M, c0 * r1, y1, s0 * r1), norm(dirOf(M, 0, 1, 0)), tint(col, 1.06));
            if (caps && r0 > 0) G.tri(ap(M, 0, y0, 0), ap(M, c0 * r0, y0, s0 * r0), ap(M, c1 * r0, y0, s1 * r0), norm(dirOf(M, 0, -1, 0)), tint(col, 0.8));
        }
    }
    /** An ellipsoid with radii rx, ry, rz round M's origin. */
    ell(mat, M, rx, ry, rz, col, seg = 10, rings = 7) {
        const G = this.g[mat];
        const pt = (i, j) => {
            const th = (j / rings) * Math.PI, ph = (i / seg) * Math.PI * 2;
            const ux = Math.sin(th) * Math.cos(ph), uy = Math.cos(th), uz = Math.sin(th) * Math.sin(ph);
            return { p: ap(M, ux * rx, uy * ry, uz * rz), n: norm(dirOf(M, ux / rx, uy / ry, uz / rz)), uy };
        };
        for (let j = 0; j < rings; j++) {
            for (let i = 0; i < seg; i++) {
                const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
                const n = norm(add(add(a.n, b.n), add(c.n, d.n)));
                const sh = tint(col, 0.88 + 0.16 * ((a.uy + c.uy) / 2 + 1) / 2);
                if (j > 0) G.tri(a.p, b.p, c.p, n, sh);
                if (j < rings - 1) G.tri(a.p, c.p, d.p, n, sh);
            }
        }
    }
    /** A ring round M's y axis (in its xz plane). */
    torus(mat, M, R, r, col, seg = 20, tube = 5) {
        const G = this.g[mat];
        const pt = (i, j) => {
            const a = (i / seg) * Math.PI * 2, b = (j / tube) * Math.PI * 2;
            const cx = Math.cos(a), cz = Math.sin(a);
            const nx = cx * Math.cos(b), ny = Math.sin(b), nz = cz * Math.cos(b);
            return { p: ap(M, cx * R + nx * r, ny * r, cz * R + nz * r), n: norm(dirOf(M, nx, ny, nz)) };
        };
        for (let i = 0; i < seg; i++) {
            for (let j = 0; j < tube; j++) {
                const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
                G.quad(a.p, d.p, c.p, b.p, a.n, col);
            }
        }
    }
    /** A limb from a to b (world points of the statue), radii ra → rb, with a round joint at a. */
    limb(mat, a, b, ra, rb, col, joint = true) {
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = len(d);
        if (l < 1e-4) return;
        const mid = add(a, d, 0.5);
        this.cyl(mat, along(mid, d), ra, rb, l, col, 9, false);
        if (joint) this.ell(mat, T(a[0], a[1], a[2]), ra, ra, ra, col, 8, 5);
    }
    /** A gable (triangular prism): base w along x at y=0, apex at y=h, depth d along z, centred on M. */
    gable(mat, M, w, h, d, col, cut = 0) {
        const G = this.g[mat], x = w / 2, z = d / 2;
        const A = (sx, sz) => ap(M, sx * x, 0, sz * z), P = (sz) => ap(M, cut, h, sz * z);
        G.tri(A(-1, 1), A(1, 1), P(1), norm(dirOf(M, 0, 0, 1)), col);
        G.tri(A(1, -1), A(-1, -1), P(-1), norm(dirOf(M, 0, 0, -1)), tint(col, 0.85));
        G.quad(A(1, 1), A(1, -1), P(-1), P(1), norm(dirOf(M, h, x, 0)), tint(col, 1.04));
        G.quad(A(-1, -1), A(-1, 1), P(1), P(-1), norm(dirOf(M, -h, x, 0)), tint(col, 0.94));
    }
    /** A thin sheet (cobweb, a page) — a triangle fan from p over the points. */
    fan(mat, p, pts, col) {
        const G = this.g[mat];
        for (let i = 0; i + 1 < pts.length; i++) {
            const n = norm(cross([pts[i][0] - p[0], pts[i][1] - p[1], pts[i][2] - p[2]], [pts[i + 1][0] - p[0], pts[i + 1][1] - p[1], pts[i + 1][2] - p[2]]));
            G.tri(p, pts[i], pts[i + 1], n, col);
        }
    }
}

// ─── the stone of the temple: a pale rose travertine with dark-red veins (not the castles' stone) ──
const STONE = hex(0xc9a48c), STONE_D = hex(0x9c7a68), TRIM = hex(0x7d5a4e), FLOOR = hex(0xb39582), FLOOR_B = hex(0x8f7466);
const MARBLE = hex(0xece6dc), GOLD = hex(0xfff4dc), SAND = hex(0xb48a62), WOOD = hex(0x5b3a24), WOOD_D = hex(0x3c2616);
const CRACK = hex(0x3d2a24), PARCH = hex(0xe8d6a8), WEB = hex(0xffffff), SHAFT = hex(0xffe2a8);
const LEATHER = [0x5a1e14, 0x6b3a1c, 0x2c3a24, 0x23304a, 0x4a2b4a, 0x7a5a2a, 0x3a2418, 0x612a2a, 0x2a4a4a, 0x50442c].map(hex);

/** Statue poses (angles in radians). Inspired by the classical ones (the Artemision god hurling his
 * thunderbolt, Apollo Belvedere having let his arrow fly, Discobolus, Atlas holding the sky…). */
const POSES = {
    creator: { robe: 1, crown: 1, cape: 1, lArm: [1.25, 0.75, 0.35], rArm: [0.9, 0.55, 0.9], lLeg: [0.05, 0.04, 0.05], rLeg: [-0.05, 0.04, 0.05], head: [0, -0.22], beard: 1 },
    wisdom: { robe: 1, laurel: 1, beard: 1, lArm: [0.95, 0.12, 0.85], rArm: [1.5, 0.35, 1.1], lLeg: [0.05, 0.06, 0.05], rLeg: [-0.08, 0.06, 0.1], head: [0.1, 0.18] },
    thunder: { lArm: [1.45, 0.9, 0.05], rArm: [0.4, 1.35, 1.6], lLeg: [0.55, 0.22, 0.1], rLeg: [-0.5, 0.18, 0.3], twist: -0.2, head: [0.45, 0], beard: 1 },
    sea: { lArm: [0.15, 0.55, 1.75], rArm: [1.0, 0.45, 1.35], lLeg: [0.12, 0.08, 0.25], rLeg: [-0.05, 0.05, 0], tilt: 0.06, beard: 1, crown: 1 },
    archer: { lArm: [1.25, 0.95, 0.05], rArm: [0.15, 0.32, 0.25], lLeg: [0.1, 0.12, 0.05], rLeg: [-0.2, 0.06, 0.35], twist: 0.25, head: [0.55, 0], tilt: -0.05 },
    beauty: { robe: 1, lArm: [0.25, 0.12, 1.9], rArm: [0.35, 0.18, 0.4], lLeg: [0.18, 0.02, 0.35], rLeg: [-0.05, 0.08, 0], tilt: 0.08, head: [-0.25, 0.15], laurel: 1 },
    messenger: { lArm: [2.5, 0.2, 0.2], rArm: [-0.7, 0.3, 0.6], lLeg: [0.9, 0.05, 1.2], rLeg: [-0.6, 0.05, 0.25], lean: 0.12, head: [0, -0.35], wings: 1 },
    atlas: { kneel: 1, lArm: [2.6, 0.6, 1.1], rArm: [2.6, 0.6, 1.1], lLeg: [1.5, 0.15, 1.6], rLeg: [-0.1, 0.12, 1.75], lean: 0.25, head: [0, 0.35], beard: 1 },
    discus: { lArm: [0.5, 0.25, 1.4], rArm: [-1.2, 0.9, 0.1], lLeg: [0.2, 0.1, 0.9], rLeg: [0.85, 0.05, 1.1], lean: 0.65, twist: 0.7, head: [0.6, 0.3] },
};

/**
 * A statue: a figure in a pose, height H (m), standing on (x, y, z) facing yaw (0: +z).
 * Returns its bounds (for its solid box).
 * @param o {mat, col, pose, props:[…], brokenArm}
 */
function statue(B, x, y, z, yaw, H, o) {
    const P = POSES[o.pose], mat = o.mat, col = o.col;
    const W = mul(T(x, y, z), mul(Ry(yaw), S(H)));
    B.unit = H;
    // the skeleton in the figure's own frame (units of H, feet at 0, facing +z, its left at +x)
    const pelvis = [0, 0.52, 0];
    const Rp = Ry(0);
    const Rt = mul(Ry(P.twist || 0), mul(Rx(P.lean || 0), Rz(P.tilt || 0)));
    const at = (R, base, v) => add(base, dirOf(R, v[0], v[1], v[2]));
    const shoulder = (s) => at(Rt, pelvis, [s * 0.125, 0.285, 0]);
    const neck = at(Rt, pelvis, [0, 0.33, 0]);
    const headR = mul(Rt, mul(Ry((P.head || [0, 0])[0]), Rx((P.head || [0, 0])[1])));
    const headC = at(headR, neck, [0, 0.075, 0.005]);
    const arm = (s, a) => {
        const [flex, abd, elbow] = a;
        const Ru = mul(Rt, mul(Rz(s * abd), Rx(-flex)));
        const sh = shoulder(s), el = at(Ru, sh, [0, -0.18, 0]);
        const Rf = mul(Ru, Rx(-elbow));
        const wr = at(Rf, el, [0, -0.155, 0]);
        return { sh, el, wr, Rf, hand: at(Rf, wr, [0, -0.045, 0]) };
    };
    const leg = (s, a) => {
        const [flex, abd, knee] = a;
        const hip = at(Rp, pelvis, [s * 0.09, -0.02, 0]);
        const Rth = mul(Rp, mul(Rz(s * abd), Rx(-flex)));
        const kn = at(Rth, hip, [0, -0.245, 0]);
        const Rs = mul(Rth, Rx(knee));
        const an = at(Rs, kn, [0, -0.235, 0]);
        let f = dirOf(Rs, 0, 0, 1);
        f = norm([f[0], Math.min(f[1], 0) - 0.1, f[2]]);
        return { hip, kn, an, toe: add(an, f, 0.12) };
    };
    const L = { l: arm(1, P.lArm), r: arm(-1, P.rArm), ll: leg(1, P.lLeg), rl: leg(-1, P.rLeg) };
    // stand it on the base: the lowest foot (or a knee) on y = 0
    let low = Infinity;
    for (const g of [L.ll, L.rl]) low = Math.min(low, g.an[1] - 0.035, g.toe[1] - 0.02, g.kn[1] - 0.04);
    const lift = -low;
    const up = (p) => [p[0], p[1] + lift, p[2]];
    const F = mul(W, T(0, lift, 0)); // figure frame with the lift
    const w = (p) => ap(W, p[0], p[1] + lift, p[2]);
    const r = (k) => k; // (radii are in units of H: W scales them)
    // torso, hips, head
    const chest = mul(F, mul(T(...at(Rt, pelvis, [0, 0.2, 0])), Rt));
    B.ell(mat, chest, 0.135, 0.15, 0.08, col);
    B.ell(mat, mul(F, mul(T(...at(Rt, pelvis, [0, 0.08, 0.005])), Rt)), 0.115, 0.11, 0.075, col);
    B.ell(mat, mul(F, T(...pelvis)), 0.125, 0.075, 0.08, col);
    B.limb(mat, w(neck), w(at(Rt, pelvis, [0, 0.37, 0])), 0.04 * H, 0.038 * H, col, false);
    const head = mul(F, mul(T(...headC), headR));
    B.ell(mat, head, 0.055, 0.068, 0.06, col);
    B.ell(mat, mul(head, T(0, -0.005, 0.055)), 0.012, 0.02, 0.014, col, 6, 4); // (the nose)
    if (P.beard) B.ell(mat, mul(head, T(0, -0.055, 0.035)), 0.045, 0.05, 0.035, tint(col, 0.95));
    B.ell(mat, mul(head, T(0, 0.025, -0.012)), 0.058, 0.05, 0.06, tint(col, 0.97)); // (the hair)
    if (P.crown) {
        B.torus(mat, mul(head, T(0, 0.045, -0.005)), 0.056, 0.008, col, 16, 4);
        for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; B.cyl(mat, mul(head, mul(T(Math.cos(a) * 0.056, 0.072, Math.sin(a) * 0.056 - 0.005), Rz(0))), 0.008, 0, 0.05, col, 4, false); }
    }
    if (P.laurel) for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; B.ell(mat, mul(head, mul(T(Math.cos(a) * 0.058, 0.03, Math.sin(a) * 0.058 - 0.008), Ry(-a))), 0.006, 0.01, 0.018, tint(col, 0.92), 5, 3); }
    if (P.wings) for (const s of [1, -1]) B.ell(mat, mul(head, mul(T(s * 0.06, 0.03, -0.01), mul(Rz(-s * 0.6), Ry(s * 0.3)))), 0.008, 0.045, 0.025, col, 6, 4);
    // arms and legs
    for (const k of ['l', 'r']) {
        const a = L[k];
        B.ell(mat, mul(F, T(...a.sh)), 0.05, 0.045, 0.05, col);
        if (o.brokenArm === k) { B.limb(mat, w(a.sh), w(at(Rt, a.sh, [0, -0.06, 0])), 0.042 * H, 0.04 * H, tint(col, 0.9)); continue; }
        B.limb(mat, w(a.sh), w(a.el), 0.042 * H, 0.034 * H, col);
        B.limb(mat, w(a.el), w(a.wr), 0.032 * H, 0.024 * H, col);
        B.ell(mat, mul(F, mul(T(...a.hand), a.Rf)), 0.022, 0.045, 0.012, col, 7, 5);
    }
    for (const k of ['ll', 'rl']) {
        const g = L[k];
        B.limb(mat, w(g.hip), w(g.kn), 0.062 * H, 0.045 * H, col);
        B.limb(mat, w(g.kn), w(g.an), 0.044 * H, 0.028 * H, col);
        const mid = add(g.an, [g.toe[0] - g.an[0], g.toe[1] - g.an[1], g.toe[2] - g.an[2]], 0.5);
        B.ell(mat, mul(F, along(mid, [g.toe[0] - g.an[0], g.toe[1] - g.an[1], g.toe[2] - g.an[2]])), 0.03, 0.075, 0.022, col, 7, 5);
    }
    // a robe: from the waist to the feet, wide round the stance
    if (P.robe) {
        const fy = Math.min(L.ll.an[1], L.rl.an[1]) - 0.03;
        const top = 0.6, spread = Math.abs(L.ll.an[0] - L.rl.an[0]);
        const cx = (L.ll.an[0] + L.rl.an[0]) / 2, cz = (L.ll.an[2] + L.rl.an[2]) / 2;
        const h = top - fy;
        B.cyl(mat, mul(F, T(cx * 0.5, fy + h / 2, cz * 0.5)), 0.17 + spread * 0.4, 0.125, h, col, 14);
        const rb = 0.17 + spread * 0.4, rt = 0.125;
        for (let i = 0; i < 9; i++) { // (its folds: ribs on the cloth, running down from the waist)
            const a = (i / 9) * Math.PI * 2 + 0.3, ca = Math.cos(a), sa = Math.sin(a);
            const lo = [cx * 0.5 + ca * rb * 0.93, fy + 0.01, cz * 0.5 + sa * rb * 0.93], hi = [cx * 0.5 + ca * rt * 0.9, top - 0.04, cz * 0.5 + sa * rt * 0.9];
            B.limb(mat, ap(F, ...lo), ap(F, ...hi), 0.02 * B.unit, 0.008 * B.unit, tint(col, 0.94), false);
        }
        if (P.cape) { // a mantle falling from the shoulders behind, wide at the hem
            const sl = L.l.sh, sr = L.r.sh;
            const G = B.g[mat];
            const q = (p) => ap(F, ...p);
            const back = -0.09, hem = fy + 0.02;
            const pts = [[sr[0] - 0.02, sr[1], sr[2] + back], [sl[0] + 0.02, sl[1], sl[2] + back], [0.3, hem, back - 0.2], [-0.3, hem, back - 0.2]];
            const n = norm(dirOf(F, 0, 0.2, -1));
            G.quad(q(pts[0]), q(pts[1]), q(pts[2]), q(pts[3]), n, tint(col, 0.9));
            G.quad(q(pts[3]), q(pts[2]), q(pts[1]), q(pts[0]), norm(dirOf(F, 0, -0.2, 1)), tint(col, 0.8));
        }
        B.box(mat, mul(F, mul(T(...at(Rt, pelvis, [0, 0.2, 0.06])), mul(Rt, Rz(0.7)))), 0.06, 0.42, 0.03, tint(col, 0.97)); // (the mantle over a shoulder)
    } else B.box(mat, mul(F, T(0, 0.47, 0)), 0.27, 0.1, 0.17, tint(col, 0.97)); // (a loincloth)
    // what it holds
    const handW = (k) => w(L[k].hand);
    for (const pr of o.props || []) {
        const hd = L[pr.hand || 'r'];
        const HF = mul(F, mul(T(...hd.hand), hd.Rf));
        const pm = pr.mat || mat, pc = pr.col || col;
        if (pr.k === 'orb') B.ell(pm, mul(HF, T(0, -0.06, 0.03)), 0.07, 0.07, 0.07, pc, 14, 10);
        else if (pr.k === 'book') { // an open book held in the palm
            const M = mul(HF, mul(T(0, -0.02, 0.06), Rx(-1.2)));
            B.box(pm, mul(M, mul(T(-0.05, 0, 0), Rz(0.2))), 0.1, 0.012, 0.13, pc);
            B.box(pm, mul(M, mul(T(0.05, 0, 0), Rz(-0.2))), 0.1, 0.012, 0.13, pc);
        } else if (pr.k === 'scroll') B.cyl(pm, mul(HF, mul(T(0, -0.03, 0), Rz(Math.PI / 2))), 0.018, 0.018, 0.2, pc, 8);
        else if (pr.k === 'staff' || pr.k === 'trident') { // a long shaft through the fist, its foot on the ground
            const hw = handW(pr.hand || 'r'), foot = [hw[0], y + 0.02, hw[2]];
            const tip = add(foot, [0, 1, 0], (hw[1] - y) + 0.45 * H);
            B.limb(pm, foot, tip, 0.014 * H, 0.014 * H, pc, false);
            if (pr.k === 'trident') {
                const M = mul(T(...tip), Ry(yaw));
                B.box(pm, M, 0.16 * H, 0.012 * H, 0.012 * H, pc);
                for (const sx of [-1, 0, 1]) B.cyl(pm, mul(M, T(sx * 0.075 * H, 0.06 * H, 0)), 0.01 * H, 0, 0.13 * H, pc, 5);
            }
        } else if (pr.k === 'bolt') { // a thunderbolt: a zigzag
            let p = [0, -0.02, 0];
            for (let i = 0; i < 4; i++) { const q = add(p, [i % 2 ? 0.04 : -0.04, -0.07, 0]); B.limb(pm, ap(HF, ...p), ap(HF, ...q), 0.012 * H, 0.008 * H, pc); p = q; }
        } else if (pr.k === 'bow') {
            const M = mul(HF, T(0, -0.02, 0));
            for (let i = 0; i < 6; i++) {
                const a0 = -1.1 + (i / 6) * 2.2, a1 = -1.1 + ((i + 1) / 6) * 2.2;
                B.limb(pm, ap(M, 0, Math.sin(a0) * 0.22, -Math.cos(a0) * 0.08 + 0.08), ap(M, 0, Math.sin(a1) * 0.22, -Math.cos(a1) * 0.08 + 0.08), 0.008 * H, 0.008 * H, pc, false);
            }
        } else if (pr.k === 'discus') B.cyl(pm, mul(HF, mul(T(0, -0.04, 0.02), Rx(Math.PI / 2))), 0.06, 0.06, 0.018, pc, 14);
        else if (pr.k === 'globe') { // a sphere on the shoulders (Atlas)
            const c = up(at(Rt, pelvis, [0, 0.55, -0.06]));
            B.ell(pm, mul(W, T(c[0], c[1], c[2])), 0.24, 0.24, 0.24, pc, 16, 12);
            for (let i = 0; i < 3; i++) B.torus(pm, mul(W, mul(T(c[0], c[1], c[2]), mul(Rx(0.4 + i * 0.6), Rz(i * 0.9)))), 0.242, 0.006, tint(pc, 0.85), 24, 3);
        } else if (pr.k === 'owl') { // an owl on the shoulder: the bird of wisdom
            const s = L[pr.hand === 'l' ? 'l' : 'r'].sh;
            const M = mul(F, T(s[0], s[1] + 0.07, s[2]));
            B.ell(pm, M, 0.045, 0.06, 0.045, pc, 10, 7);
            B.ell(pm, mul(M, T(0, 0.075, 0.005)), 0.04, 0.035, 0.038, pc, 10, 7);
            for (const sx of [-1, 1]) {
                B.ell(pm, mul(M, T(sx * 0.016, 0.08, 0.035)), 0.013, 0.013, 0.008, tint(pc, 1.1), 6, 4);
                B.cyl(pm, mul(M, mul(T(sx * 0.025, 0.115, 0), Rz(-sx * 0.3))), 0.008, 0, 0.025, pc, 4, false);
            }
            B.cyl(pm, mul(M, mul(T(0, 0.068, 0.04), Rx(Math.PI / 2 + 0.4))), 0.006, 0, 0.018, tint(pc, 0.8), 4, false);
        } else if (pr.k === 'halo') { // a sun of rays behind the head
            const c = up(at(headR, headC, [0, 0.01, -0.07]));
            const M = mul(W, mul(T(c[0], c[1], c[2]), Rx(Math.PI / 2)));
            B.torus(pm, M, 0.12, 0.008, pc, 24, 4);
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2, l = i % 2 ? 0.08 : 0.14;
                B.box(pm, mul(M, mul(Ry(-a), T(0.12 + l / 2, 0, 0))), l, 0.006, 0.014, pc);
            }
        }
    }
    // its bounds (for the solid box), in the world of the plan
    const pts = [L.l.hand, L.r.hand, L.ll.toe, L.rl.toe, headC, L.l.el, L.r.el, L.ll.kn, L.rl.kn].map(w);
    let x0 = x - 0.2 * H, x1 = x + 0.2 * H, z0 = z - 0.2 * H, z1 = z + 0.2 * H, y1 = y;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); y1 = Math.max(y1, p[1]); }
    return { x0, x1, z0, z1, y0: y, y1 };
}

/** The statue's solid: the body's core (arms reaching out are not a wall). */
function statueSolid(B, x, y, z, H, bb, wide = 0.22) {
    const r = H * wide;
    B.solid(Math.max(bb.x0, x - r), y, Math.max(bb.z0, z - r), Math.min(bb.x1, x + r), bb.y1, Math.min(bb.z1, z + r), { statue: true });
}

/**
 * A wall of ashlar blocks along x (axis 'x': from a to b at z0..z1) or along z, from y0 to y1,
 * with openings [{a0, a1, y0, y1}] (along its length) and a broken top (rag: m it may lose).
 */
function wall(B, axis, a0, a1, t0, t1, y0, y1, holes = [], rag = 0, solid = true) {
    const rng = B.rng;
    const course = 0.75;
    const inHole = (a, y) => holes.some((h) => a > h.a0 && a < h.a1 && y > (h.y0 ?? -1) && y < h.y1);
    const ragAt = (a) => rag > 0 ? rag * (0.5 + 0.5 * Math.sin(a * 0.37 + t0)) * (0.6 + 0.4 * Math.sin(a * 1.3)) : 0;
    let row = 0;
    for (let y = y0; y < y1 - 0.01; y += course, row++) {
        const yh = Math.min(y1, y + course);
        let a = a0 - ((row % 2) ? 0.6 : 0);
        while (a < a1) {
            const bl = 1.2 + rng() * 0.8;
            const s = Math.max(a0, a), e = Math.min(a1, a + bl);
            a += bl;
            if (e - s < 0.05) continue;
            const m = (s + e) / 2;
            if (inHole(m, (y + yh) / 2)) continue;
            if (yh > y1 - ragAt(m) && y > y1 - 4) continue; // (the top broken off)
            const k = 0.9 + rng() * 0.16, c = rng() < 0.08 ? tint(STONE_D, k) : tint(STONE, k);
            const gap = 0.03;
            if (axis === 'x') B.abox('stone', s + gap, y, t0, e - gap, yh - gap, t1, c, false, 'b');
            else B.abox('stone', t0, y, s + gap, t1, yh - gap, e - gap, c, false, 'b');
        }
    }
    // a mortar core behind the blocks (the gaps never show through)
    const core = (s, e, ya, yb) => {
        if (e - s < 0.05 || yb - ya < 0.05) return;
        if (axis === 'x') B.abox('stone', s, ya, t0 + 0.08, e, yb, t1 - 0.08, TRIM, false, 'b');
        else B.abox('stone', t0 + 0.08, ya, s, t1 - 0.08, yb, e, TRIM, false, 'b');
        if (!solid) return;
        if (axis === 'x') B.solid(s, ya, t0, e, yb, t1); else B.solid(t0, ya, s, t1, yb, e);
    };
    // the solid parts: full height between the openings, over and under each opening
    const cuts = [...holes].sort((p, q) => p.a0 - q.a0);
    let s = a0;
    for (const h of cuts) {
        core(s, h.a0, y0, y1 - rag * 0.6);
        if ((h.y0 ?? y0) > y0) core(h.a0, h.a1, y0, h.y0);
        if (h.y1 < y1 - rag) core(h.a0, h.a1, h.y1, y1 - rag);
        s = h.a1;
    }
    core(s, a1, y0, y1 - rag * 0.6);
}

/** A column (base, fluted shaft, capital) standing at x, z, height h; broken: only up to `stump`. */
function column(B, x, z, h, r, stump = 0, col = STONE) {
    const top = stump || h;
    B.abox('stone', x - r * 1.3, 0, z - r * 1.3, x + r * 1.3, 0.5, z + r * 1.3, TRIM, false);
    B.cyl('stone', T(x, 0.6, z), r * 1.15, r * 1.05, 0.2, col, 14);
    B.cyl('stone', T(x, 0.5 + (top - 0.5 - (stump ? 0 : 1)) / 2 + 0.2, z), r, r * 0.9, top - 0.7 - (stump ? 0 : 1), col, 14);
    for (let i = 0; i < 12; i++) { // (its flutes: thin darker ribs)
        const a = (i / 12) * Math.PI * 2;
        const ht = top - 0.9 - (stump ? 0 : 1);
        B.box('stone', mul(T(x + Math.cos(a) * r * 0.93, 0.7 + ht / 2, z + Math.sin(a) * r * 0.93), Ry(-a)), 0.05, ht, 0.12, tint(col, 0.9));
    }
    if (!stump) {
        B.cyl('stone', T(x, h - 0.85, z), r * 0.9, r * 1.3, 0.5, col, 14);
        B.abox('stone', x - r * 1.45, h - 0.6, z - r * 1.45, x + r * 1.45, h, z + r * 1.45, tint(col, 1.04), false);
    } else { // a jagged broken top
        for (let i = 0; i < 5; i++) {
            const a = B.rng() * Math.PI * 2;
            B.box('stone', mul(T(x + Math.cos(a) * r * 0.4, top + 0.1, z + Math.sin(a) * r * 0.4), mul(Ry(a), Rz(0.3))), r * 0.8, 0.4 + B.rng() * 0.4, r * 0.6, tint(col, 0.95));
        }
    }
    B.solid(x - r * 1.05, 0, z - r * 1.05, x + r * 1.05, top, z + r * 1.05);
}

/** Drums of a fallen column lying from (x, z) in direction a. */
function fallenColumn(B, x, z, a, r, n) {
    let d = r * 1.6;
    for (let i = 0; i < n; i++) {
        const l = 1.6 + B.rng() * 0.6;
        const cx = x + Math.cos(a) * (d + l / 2), cz = z + Math.sin(a) * (d + l / 2);
        const roll = (B.rng() - 0.5) * 0.4;
        B.cyl('stone', mul(T(cx, r * 0.95, cz), mul(Ry(-a), mul(Rz(Math.PI / 2 + roll * 0.2), Ry(roll)))), r, r * 0.95, l, tint(STONE, 0.95 + B.rng() * 0.08), 14);
        B.solid(cx - r, 0, cz - r, cx + r, r * 1.9, cz + r);
        d += l + 0.1 + B.rng() * 0.5;
        a += (B.rng() - 0.5) * 0.25;
    }
}

/** A heap of broken stones round (x, z). */
function rubble(B, x, z, R, n, y = 0) {
    for (let i = 0; i < n; i++) {
        const a = B.rng() * Math.PI * 2, d = Math.sqrt(B.rng()) * R;
        const s = 0.3 + B.rng() * 0.9 * (1 - d / R * 0.6);
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        B.box('stone', mul(T(px, y + s * 0.35, pz), mul(Ry(B.rng() * 3), mul(Rx((B.rng() - 0.5) * 0.6), Rz((B.rng() - 0.5) * 0.6)))), s * 1.3, s * 0.8, s, tint(STONE, 0.85 + B.rng() * 0.2));
        if (s > 0.85) B.solid(px - s * 0.5, y, pz - s * 0.5, px + s * 0.5, y + s * 0.65, pz + s * 0.5);
    }
}

/** A drift of sand: a low mound (walked over). */
function drift(B, x, z, rx, rz, h, a = 0) {
    B.ell('sand', mul(T(x, 0, z), Ry(a)), rx, h, rz, tint(SAND, 0.95 + B.rng() * 0.1), 14, 6);
}

/** Cracks running over a wall face (axis 'x': the face at z = t, looking toward +n). */
function cracks(B, axis, t, n, a, y, steps) {
    let p = [a, y];
    for (let i = 0; i < steps; i++) {
        const q = [p[0] + (B.rng() - 0.5) * 1.2, p[1] - 0.4 - B.rng() * 0.8];
        const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], l = Math.hypot(q[0] - p[0], q[1] - p[1]), ang = Math.atan2(q[0] - p[0], q[1] - p[1]);
        if (axis === 'x') B.box('stone', mul(T(m[0], m[1], t + n * 0.02), Rz(-ang)), 0.06, l, 0.03, CRACK);
        else B.box('stone', mul(T(t + n * 0.02, m[1], m[0]), Rx(ang)), 0.03, l, 0.06, CRACK);
        p = q;
    }
}

/** A cobweb in a corner: strands and a faint sheet. */
function cobweb(B, c, u, v, s) {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI / 2;
        pts.push(add(c, add(u.map((k) => k * Math.cos(a) * s), v.map((k) => k * Math.sin(a) * s))));
    }
    B.fan('web', c, pts, WEB);
    for (let ring = 1; ring <= 3; ring++) {
        const k = ring / 3.5;
        for (let i = 0; i < 6; i++) B.limb('web', add(c, add(u.map((x) => x * Math.cos((i / 6) * Math.PI / 2) * s * k), v.map((x) => x * Math.sin((i / 6) * Math.PI / 2) * s * k))), add(c, add(u.map((x) => x * Math.cos(((i + 1) / 6) * Math.PI / 2) * s * k), v.map((x) => x * Math.sin(((i + 1) / 6) * Math.PI / 2) * s * k))), 0.008, 0.008, WEB, false);
    }
}

/** A bookcase: a frame and shelves of books, `len` along x (rotated by yaw), facing +z (or both sides). */
function bookcase(B, M, len0, h, d, both, fallen = 0) {
    const rng = B.rng;
    const n = 5;
    B.box('wood', mul(M, T(-len0 / 2 + 0.06, h / 2, 0)), 0.12, h, d, WOOD);
    B.box('wood', mul(M, T(len0 / 2 - 0.06, h / 2, 0)), 0.12, h, d, WOOD);
    B.box('wood', mul(M, T(0, h - 0.05, 0)), len0, 0.1, d + 0.05, WOOD_D);
    if (!both) B.box('wood', mul(M, T(0, h / 2, -d / 2 + 0.03)), len0, h, 0.05, WOOD_D);
    for (let i = 0; i < n; i++) {
        const y = 0.1 + i * (h - 0.2) / n;
        B.box('wood', mul(M, T(0, y, 0)), len0 - 0.1, 0.06, d, WOOD);
        for (const side of both ? [1, -1] : [1]) {
            let x = -len0 / 2 + 0.15;
            while (x < len0 / 2 - 0.2) {
                const bw = 0.05 + rng() * 0.08, bh = 0.24 + rng() * 0.2, bd = Math.min(d / (both ? 2 : 1) - 0.05, 0.22 + rng() * 0.1);
                if (rng() < fallen + 0.12) { x += bw + rng() * 0.25; continue; } // (a gap: taken or fallen)
                const lean = rng() < 0.08 ? (rng() < 0.5 ? -1 : 1) * (0.3 + rng() * 0.3) : 0;
                const c = tint(LEATHER[(rng() * LEATHER.length) | 0], 0.75 + rng() * 0.35);
                const zc = side * (d / 2 - bd / 2 - 0.02) * (both ? 1 : 0) + (both ? 0 : d / 2 - bd / 2 - 0.08);
                B.box('wood', mul(M, mul(T(x + bw / 2 + (lean ? Math.sign(lean) * bh * 0.15 : 0), y + 0.03 + bh / 2 * Math.cos(lean), zc), Rz(-lean))), bw, bh, bd, c, 'bk');
                x += bw + (lean ? 0.12 : 0.004);
            }
        }
    }
}

/** Books lying on the floor round (x, z) (fallen from the shelves). */
function fallenBooks(B, x, z, R, n) {
    for (let i = 0; i < n; i++) {
        const a = B.rng() * Math.PI * 2, d = Math.sqrt(B.rng()) * R;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        const c = tint(LEATHER[(B.rng() * LEATHER.length) | 0], 0.7 + B.rng() * 0.3);
        if (B.rng() < 0.3) { // lying open, its pages up
            const M = mul(T(px, 0.03, pz), Ry(B.rng() * 6));
            B.box('wood', mul(M, T(-0.11, 0, 0)), 0.22, 0.03, 0.3, c);
            B.box('wood', mul(M, T(0.11, 0, 0)), 0.22, 0.03, 0.3, c);
            B.box('wood', mul(M, mul(T(-0.1, 0.03, 0), Rz(0.08))), 0.2, 0.025, 0.28, PARCH);
            B.box('wood', mul(M, mul(T(0.1, 0.03, 0), Rz(-0.08))), 0.2, 0.025, 0.28, PARCH);
        } else B.box('wood', mul(T(px, 0.04 + (i % 3) * 0.02, pz), mul(Ry(B.rng() * 6), Rz((B.rng() - 0.5) * 0.15))), 0.2, 0.07, 0.3, c);
    }
}

/**
 * The whole temple: {mats: {stone: {pos, nor, col}, …}, solids, pedestals, statues, shafts, spots}
 * (local metres). ~50–100 ms of work: made in a worker (temple.worker.js), never in a frame.
 */
export function templePlan(seed = 1) {
    const B = new Builder(((seed * 2654435761) ^ 0x7e3b1e5) >>> 0);
    const rng = B.rng;
    const { X0, X1, Z0, Z1, HALL_H, GAL_H, LIB_H, RISE, DEPTH } = TEMPLE;
    // ── the podium and its stairs ──
    const SZ = 14.5; // the podium's front edge (stairs beyond)
    B.abox('stone', X0, -DEPTH, Z0, X1, 0, SZ, FLOOR_B);
    for (let i = 0; i < 6; i++) { // (six steps down to the ground at the front)
        const y = -(i + 1) * RISE / 6, z = SZ + i * 0.55;
        B.abox('stone', -18, -DEPTH, z, 18, y + RISE / 6, z + 0.55, tint(STONE, 0.95 + (i % 2) * 0.05));
    }
    // floor tiles (some cracked or missing) inside the rooms and the portico
    const tiles = (x0, x1, z0, z1, s) => {
        for (let x = x0; x < x1 - 0.01; x += s) {
            for (let z = z0; z < z1 - 0.01; z += s) {
                if (rng() < 0.06) continue;
                const k = ((Math.round(x / s) + Math.round(z / s)) % 2 ? 0.92 : 1.02) * (0.94 + rng() * 0.1);
                B.abox('stone', x + 0.03, 0, z + 0.03, Math.min(x1, x + s) - 0.03, 0.05, Math.min(z1, z + s) - 0.03, tint(FLOOR, k), false, 'b');
            }
        }
    };
    tiles(-16, 16, -32, 2, 2); tiles(-30, -17.6, -32, 2, 2); tiles(-16, 16, -60, -33.6, 2); tiles(-18, 18, 3.6, 14, 2);
    // ── the walls ──
    const H = HALL_H;
    // the front wall with the great doorway
    wall(B, 'x', -17.6, 17.6, 2, 3.6, 0, H, [{ a0: -3.5, a1: 3.5, y1: 10 }], 1.2);
    wall(B, 'x', -31.6, -17.6, 2, 3.6, 0, GAL_H, [], 0.8);
    // the hall's back wall (the library's front), its door behind the golden god
    wall(B, 'x', -17.6, 17.6, -33.6, -32, 0, H, [{ a0: -2.6, a1: 2.6, y1: 7 }], 0.6);
    wall(B, 'x', -31.6, -17.6, -33.6, -32, 0, GAL_H, [], 0.6);
    // the right wall: a breach (fallen in) at z −14…−5
    wall(B, 'z', -32, 2, 16, 17.6, 0, H, [{ a0: -14, a1: -5, y0: 1.2, y1: H + 1 }], 2);
    // the left wall between the hall and the gallery: three arches
    wall(B, 'z', -32, 2, -17.6, -16, 0, H, [{ a0: -22, a1: -17, y1: 7 }, { a0: -12.5, a1: -8.5, y1: 7 }, { a0: -4, a1: 0, y1: 7 }], 0.8);
    wall(B, 'z', -32, 2, -31.6, -30, 0, GAL_H, [], 1);
    // the library
    wall(B, 'z', -61.6, -33.6, 16, 17.6, 0, LIB_H, [], 0.8);
    wall(B, 'z', -61.6, -33.6, -17.6, -16, 0, LIB_H, [], 0.8);
    wall(B, 'x', -17.6, 17.6, -61.6, -60, 0, LIB_H, [], 0.5);
    // a cornice band round the hall
    for (const [a, b, c, d] of [[-16, 16, 1.6, 2], [-16, 16, -32, -31.6]]) B.abox('stone', a, H - 2.2, c, b, H - 1.8, d, TRIM, false);
    for (const [c, d] of [[-16, -15.6], [15.6, 16]]) B.abox('stone', c, H - 2.2, -32, d, H - 1.8, 2, TRIM, false);
    // breach rubble: inside and out, sand blown in through it
    rubble(B, 14, -9.5, 4.5, 60); rubble(B, 19.5, -9.5, 3, 30, 0);
    drift(B, 12, -9, 6, 4.5, 0.55, 0.3); drift(B, 6, -12, 4, 3, 0.3, 1);
    // ── the roofs (slabs with holes where they fell in; light falls through) ──
    const roof = (x0, x1, z0, z1, y, holes, sz = 4) => {
        for (let x = x0; x < x1 - 0.01; x += sz) {
            for (let z = z0; z < z1 - 0.01; z += sz) {
                const xe = Math.min(x1, x + sz), ze = Math.min(z1, z + sz);
                const cx = (x + xe) / 2, cz = (z + ze) / 2;
                if (holes.some((h) => cx > h[0] && cx < h[1] && cz > h[2] && cz < h[3])) continue;
                B.abox('stone', x, y, z, xe, y + 0.8, ze, tint(STONE_D, 0.9 + rng() * 0.12));
                B.abox('stone', x + 0.2, y + 0.8, z + 0.2, xe - 0.2, y + 1.0, ze - 0.2, tint(TRIM, 0.95 + rng() * 0.1), false); // (the tiles on top)
            }
        }
    };
    const hallHoles = [[-4, 4, -20, -16], [4, 16, -16, -4], [-12, -4, -8, -4]];
    roof(-17.6, 17.6, -33.6, 3.6, H, hallHoles);
    roof(-31.6, -17.6, -33.6, 3.6, GAL_H, [[-31.6, -17.6, -16, -12]]);
    const libHoles = [[-4, 4, -52, -48], [8, 12, -40, -36]];
    roof(-17.6, 17.6, -61.6, -33.6, LIB_H, libHoles);
    // rubble under the holes (the roof that fell)
    rubble(B, -8, -6, 3, 26); rubble(B, -27, -14, 2.5, 18); rubble(B, 10, -38, 2.2, 14);
    // shafts of dim light through the holes
    const shafts = [];
    const shaft = (x, z, top, w, d) => {
        shafts.push({ x, z, top, w, d });
        const lean = 0.18;
        const a = [x - lean * top, 0.05, z - lean * top * 0.4], b = [x, top, z];
        const dv = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        B.cyl('shaft', along(add(a, dv, 0.5), dv), w * 0.62, w * 0.5, len(dv), SHAFT, 12, false);
    };
    shaft(0, -18, H, 3.4, 3); shaft(9, -9, H, 4, 4); shaft(-8, -6, H, 2.6, 2); shaft(-24, -14, GAL_H, 3, 2.4); shaft(0, -50, LIB_H, 3.2, 3); shaft(10, -38, LIB_H, 2.2, 2);
    // ── the portico: six columns (two broken), the beam, the gable ──
    const PZ = 11;
    const xs = [-15, -9, -3, 3, 9, 15];
    for (const x of xs) {
        if (x === 9) { column(B, x, PZ, H, 1, 3.2); fallenColumn(B, x, PZ, 0.5, 1, 4); continue; }
        if (x === -15) { column(B, x, PZ, H, 1, 7.5); fallenColumn(B, x - 1, PZ + 1, 2.3, 1, 2); continue; }
        column(B, x, PZ, H, 1);
    }
    B.abox('stone', -12, H, PZ - 1.4, 6, H + 1.6, PZ + 1.4, STONE); // (the beam — broken over the fallen ones)
    B.abox('stone', -12, H + 1.6, PZ - 1.5, 6, H + 2, PZ + 1.5, TRIM, false);
    B.abox('stone', -6, H, 3.6, 6, H + 0.8, PZ - 1.4, STONE_D); // (the portico's ceiling: what is left of it)
    B.gable('stone', T(-3, H + 2, PZ), 18, 4.2, 2.6, STONE, 1.5);
    rubble(B, 12, PZ + 2, 3.5, 30); rubble(B, -16, PZ + 3, 2.5, 18);
    drift(B, 0, 3, 7, 3.2, 0.45); drift(B, -10, 8, 5, 3, 0.35, 0.5); drift(B, 13, 6, 5, 4, 0.5, 0.2);
    // cracks over the walls
    for (let i = 0; i < 6; i++) cracks(B, 'x', 3.6, 1, -14 + i * 5 + rng() * 2, 12 - rng() * 3, 6 + (rng() * 5 | 0));
    for (let i = 0; i < 6; i++) cracks(B, 'z', 16, -1, -30 + i * 5 + rng() * 2, 13 - rng() * 3, 5 + (rng() * 5 | 0));
    for (let i = 0; i < 5; i++) cracks(B, 'x', -60, 1, -14 + i * 7, 10 - rng() * 2, 6);
    // ── the Hall of the Creator: columns, the golden god ──
    for (const z of [-4, -11, -18, -25]) {
        for (const x of [-11, 11]) {
            if (x === 11 && z === -11) { column(B, x, z, H, 0.9, 2.2); fallenColumn(B, x, z, 2.7, 0.9, 5); continue; }
            column(B, x, z, H, 0.9);
        }
    }
    // the plinth (three tiers), the god of gold upon it
    const GZ = -23;
    B.abox('marble', -5, 0, GZ - 4.5, 5, 1, GZ + 4.5, tint(MARBLE, 0.92));
    B.abox('marble', -4, 1, GZ - 3.5, 4, 2.2, GZ + 3.5, MARBLE);
    B.abox('gold', -4.1, 2.2, GZ - 3.6, 4.1, 2.45, GZ + 3.6, GOLD, false);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; B.ell('gold', T(Math.cos(a) * 4.4, 1.6, GZ + Math.sin(a) * 4.4 * 0.9), 0.12, 0.12, 0.12, GOLD, 6, 4); }
    const creator = statue(B, 0, 2.45, GZ, 0, 10.5, { pose: 'creator', mat: 'gold', col: GOLD, props: [{ k: 'orb', hand: 'r' }, { k: 'halo' }] });
    statueSolid(B, 0, 2.45, GZ, 10.5, creator, 0.2);
    B.solid(-5, 0, GZ - 4.5, 5, 2.45, GZ + 4.5, { godGift: true });
    drift(B, -6, GZ + 5, 3, 2, 0.25);
    // ── the Gallery of the Gods ──
    const gods = [
        { pose: 'thunder', z: -26, props: [{ k: 'bolt', hand: 'r' }] },
        { pose: 'sea', z: -19, props: [{ k: 'trident', hand: 'r' }] },
        { pose: 'archer', z: -12, props: [{ k: 'bow', hand: 'l' }], brokenArm: null },
        { pose: 'beauty', z: -5, props: [], brokenArm: 'r' },
        { pose: 'messenger', z: 1.5 - 2.5, props: [{ k: 'staff', hand: 'r' }] },
    ];
    const statues = [{ kind: 'creator', x: 0, y: 2.45, z: GZ, H: 10.5, gold: true }];
    for (const gd of gods) {
        const x = -27.4, base = 1.4;
        B.abox('marble', x - 1.6, 0, gd.z - 1.6, x + 1.6, base, gd.z + 1.6, tint(MARBLE, 0.88));
        B.abox('marble', x - 1.75, base, gd.z - 1.75, x + 1.75, base + 0.18, gd.z + 1.75, tint(MARBLE, 0.95), false);
        const bb = statue(B, x, base + 0.18, gd.z, Math.PI / 2, 4.4, { pose: gd.pose, mat: 'marble', col: tint(MARBLE, 0.95 + rng() * 0.05), props: gd.props, brokenArm: gd.brokenArm });
        B.solid(x - 1.6, 0, gd.z - 1.6, x + 1.6, base + 0.18, gd.z + 1.6);
        statueSolid(B, x, base + 0.18, gd.z, 4.4, bb);
        statues.push({ kind: gd.pose, x, y: base + 0.18, z: gd.z, H: 4.4 });
    }
    B.ell('marble', mul(T(-23.5, 0.18, -3), Rz(1.4)), 0.15, 0.6, 0.15, tint(MARBLE, 0.9)); // (the goddess's broken arm on the floor)
    // Atlas at the gallery's end, holding the sky; and the discus thrower in the middle
    B.abox('marble', -26.8, 0, -31.5, -20.8, 1.0, -27.5, tint(MARBLE, 0.88));
    const atlas = statue(B, -23.8, 1.0, -29.5, 0, 4.6, { pose: 'atlas', mat: 'marble', col: MARBLE, props: [{ k: 'globe' }] });
    statueSolid(B, -23.8, 1.0, -29.5, 4.6, atlas, 0.3);
    statues.push({ kind: 'atlas', x: -23.8, y: 1, z: -29.5, H: 4.6 });
    B.abox('marble', -22.6, 0, -9.2, -19.6, 1.0, -6.2, tint(MARBLE, 0.9));
    const disc = statue(B, -21.1, 1.0, -7.7, -Math.PI / 2, 4.2, { pose: 'discus', mat: 'marble', col: MARBLE, props: [{ k: 'discus', hand: 'r' }] });
    statueSolid(B, -21.1, 1.0, -7.7, 4.2, disc);
    statues.push({ kind: 'discus', x: -21.1, y: 1, z: -7.7, H: 4.2 });
    drift(B, -29, -30, 3, 2.5, 0.35); drift(B, -24, 0, 3.5, 2, 0.3); drift(B, -26, -14, 3, 2.5, 0.35);
    // ── the Library ──
    const WZ = -55.5;
    B.abox('marble', -3, 0, WZ - 2.5, 3, 1.6, WZ + 2.5, tint(MARBLE, 0.9));
    B.abox('gold', -3.1, 1.6, WZ - 2.6, 3.1, 1.75, WZ + 2.6, GOLD, false);
    const wis = statue(B, 0, 1.75, WZ, 0, 6.6, { pose: 'wisdom', mat: 'marble', col: tint(MARBLE, 0.98), props: [{ k: 'book', hand: 'l', mat: 'wood', col: PARCH }, { k: 'owl', hand: 'r', col: tint(MARBLE, 0.92) }] });
    statueSolid(B, 0, 1.75, WZ, 6.6, wis);
    B.solid(-3, 0, WZ - 2.5, 3, 1.75, WZ + 2.5);
    statues.push({ kind: 'wisdom', x: 0, y: 1.75, z: WZ, H: 6.6 });
    // scrolls at the god's feet
    for (let i = 0; i < 5; i++) B.cyl('wood', mul(T(-1.2 + i * 0.55, 1.85, WZ + 1.8), Rz(Math.PI / 2 + (rng() - 0.5) * 0.3)), 0.08, 0.08, 0.7, PARCH, 8);
    // the pedestals: two on each side of the god of Wisdom (placed by Temple.js — the Creative ones)
    const pedestals = [-9.6, -5.6, 5.6, 9.6].map((x, i) => ({ x, z: WZ + 2.2, spell: TEMPLE_SCROLLS[i] }));
    // bookcases along the walls and in stacks (the middle aisle free)
    for (let z = -58.5; z < -36; z += 5.2) {
        bookcase(B, mul(T(15.3, 0, z + 2.5), Ry(-Math.PI / 2)), 5, 5, 0.9, false, 0.1);
        bookcase(B, mul(T(-15.3, 0, z + 2.5), Ry(Math.PI / 2)), 5, 5, 0.9, false, 0.12);
        B.solid(14.8, 0, z, 16, 5, z + 5); B.solid(-16, 0, z, -14.8, 5, z + 5);
    }
    for (const z of [-38, -42.5, -47]) {
        for (const [x0, x1] of [[-13.5, -7.5], [7.5, 13.5]]) {
            const cx = (x0 + x1) / 2;
            if (x0 < 0 && z === -42.5) { // toppled: lying on its side, its books spilled
                bookcase(B, mul(T(cx, 0.5, z + 0.9), Rx(-1.45)), 6, 4.6, 1.1, true, 0.6);
                fallenBooks(B, cx, z + 3.5, 2.6, 40);
                B.solid(x0, 0, z - 0.2, x1, 1.2, z + 4.8);
                continue;
            }
            bookcase(B, T(cx, 0, z), 6, 4.6, 1.1, true, 0.15);
            B.solid(x0, 0, z - 0.6, x1, 4.6, z + 0.6);
        }
    }
    fallenBooks(B, 8, -44, 3, 22); fallenBooks(B, -14, -55, 2, 14); fallenBooks(B, 13, -52, 2, 12); fallenBooks(B, 0, -40, 2.5, 8);
    // reading tables in the aisle, open books on them
    for (const [x, z] of [[-4, -41], [4, -44]]) {
        B.abox('wood', x - 1, 1.5, z - 2, x + 1, 1.62, z + 2, WOOD);
        for (const [lx, lz] of [[-0.85, -1.85], [0.85, -1.85], [-0.85, 1.85], [0.85, 1.85]]) B.abox('wood', x + lx - 0.08, 0, z + lz - 0.08, x + lx + 0.08, 1.5, z + lz + 0.08, WOOD_D, false);
        B.solid(x - 1, 0, z - 2, x + 1, 1.62, z + 2);
        const M = mul(T(x, 1.66, z + (rng() - 0.5)), Ry(rng() - 0.5));
        B.box('wood', mul(M, mul(T(-0.22, 0, 0), Rz(0.1))), 0.42, 0.04, 0.6, PARCH);
        B.box('wood', mul(M, mul(T(0.22, 0, 0), Rz(-0.1))), 0.42, 0.04, 0.6, PARCH);
        B.cyl('wood', T(x + 0.6, 1.85, z - 1.2), 0.07, 0.06, 0.4, tint(PARCH, 1.05), 8); // (a candle burnt out long ago)
    }
    drift(B, 0, -50, 4, 3, 0.3); drift(B, 10, -38, 2.5, 2, 0.25); drift(B, 0, -36, 3, 2, 0.2);
    // cobwebs: in the library's corners, between the shelves, under the beams
    const lx0 = -16, lx1 = 16, lz0 = -60, lz1 = -33.6, LH = LIB_H;
    cobweb(B, [lx0, LH, lz0], [1, 0, 0], [0, 0, 1], 3); cobweb(B, [lx1, LH, lz0], [-1, 0, 0], [0, 0, 1], 3);
    cobweb(B, [lx0, LH, lz1], [1, 0, 0], [0, 0, -1], 2.5); cobweb(B, [lx1, LH, lz1], [-1, 0, 0], [0, 0, -1], 2.5);
    cobweb(B, [lx0, 0.1, lz0], [1, 0, 0], [0, 1, 0], 1.6); cobweb(B, [lx1, 0.1, lz0], [-1, 0, 0], [0, 1, 0], 1.6);
    for (const z of [-38, -47]) for (const x of [-13.4, 13.4]) cobweb(B, [x, 4.5, z + 0.6], [-Math.sign(x), 0, 0], [0, -1, 0], 1.2);
    for (const x of [-15.2, 15.2]) for (const z of [-41, -51]) cobweb(B, [x, 5, z], [0, 0, 1], [0, -1, 0], 1.0);
    cobweb(B, [-16, H, -32], [1, 0, 0], [0, 0, 1], 2.5); cobweb(B, [16, H, 2], [-1, 0, 0], [0, 0, -1], 2.5);
    cobweb(B, [-30, GAL_H, -32], [1, 0, 0], [0, 0, 1], 2); cobweb(B, [-30, GAL_H, 2], [1, 0, 0], [0, 0, -1], 2);
    // dust: a grey film low over the library floor
    for (let i = 0; i < 18; i++) drift(B, -14 + rng() * 28, -59 + rng() * 25, 1 + rng() * 2, 1 + rng() * 2, 0.06, rng() * 3);
    // ── the arrays ──
    const mats = {};
    for (const m of TEMPLE_MATS) {
        const G = B.g[m];
        mats[m] = { pos: new Float32Array(G.p), nor: new Float32Array(G.n), col: new Float32Array(G.c) };
    }
    return {
        mats,
        solids: B.solids,
        pedestals,
        statues,
        shafts,
        // places for a look (local metres): {x, y, z, look: [x, y, z]}
        spots: {
            entrance: { x: 12, y: 9, z: 44, look: [-4, 6, 0] },
            creator: { x: 6, y: 4, z: -4, look: [0, 9, GZ] },
            gallery: { x: -20, y: 3.5, z: 0.5, look: [-26, 3, -18] },
            library: { x: 0, y: 3.6, z: -37, look: [0, 3.5, WZ] },
            scrolls: { x: -4.2, y: 1.7, z: WZ + 5.6, look: [-8.6, 1.2, WZ + 2.2] },
        },
        rooms: [ // the inside (for the sound: echo inside, wind outside)
            { x0: -16, x1: 16, z0: -32, z1: 2 }, { x0: -30, x1: -17.6, z0: -32, z1: 2 }, { x0: -16, x1: 16, z0: -60, z1: -33.6 },
        ],
    };
}

/** Local → world (rot: 0…3 quarter turns; the doors look +z, +x, −z, −x). */
export function templeToWorld(spot, lx, ly, lz) {
    const K = TEMPLE.K, r = ((spot.rot || 0) % 4 + 4) % 4;
    const x = lx * K, z = lz * K;
    const wx = r === 0 ? x : r === 1 ? z : r === 2 ? -x : -z;
    const wz = r === 0 ? z : r === 1 ? -x : r === 2 ? -z : x;
    return { x: spot.x + wx, y: spot.y + TEMPLE.RISE * K + ly * K, z: spot.z + wz };
}

/** World → local (the inverse of templeToWorld). */
export function templeToLocal(spot, wx, wy, wz) {
    const K = TEMPLE.K, r = ((spot.rot || 0) % 4 + 4) % 4;
    const x = (wx - spot.x) / K, z = (wz - spot.z) / K;
    const lx = r === 0 ? x : r === 1 ? -z : r === 2 ? -x : z;
    const lz = r === 0 ? z : r === 1 ? x : r === 2 ? -z : -x;
    return { x: lx, y: (wy - spot.y) / K - TEMPLE.RISE, z: lz };
}

/** The world box of a local box. */
export function solidToWorld(spot, b) {
    const a = templeToWorld(spot, b.x0, b.y0, b.z0), c = templeToWorld(spot, b.x1, b.y1, b.z1);
    return { minX: Math.min(a.x, c.x), maxX: Math.max(a.x, c.x), minY: a.y, maxY: c.y, minZ: Math.min(a.z, c.z), maxZ: Math.max(a.z, c.z) };
}

/** The temple's footprint on the ground (world; with the stairs). */
export function templeFootprint(spot) {
    const T0 = TEMPLE;
    return solidToWorld(spot, { x0: T0.X0, x1: T0.X1, y0: -T0.DEPTH, y1: 0, z0: T0.Z0, z1: T0.Z1 });
}

/**
 * ONE place for the temple on a planet, from the seed alone: of candidates round (cx, cz) within R
 * the one where the ground under the footprint is the flattest. groundAt(x, z) → height.
 * → {x, y, z, rot} (y: the ground at the stairs' foot — the lowest ground under it, so it never floats).
 */
export function templeSpot(seed, groundAt, { cx = 0, cz = 0, R = 600, tries = 24 } = {}) {
    const rng = createRng(((seed * 40503) ^ 0x5eed7e) >>> 0);
    let best = null;
    for (let i = 0; i < tries; i++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * R;
        const s = { x: Math.round(cx + Math.cos(a) * d), z: Math.round(cz + Math.sin(a) * d), y: 0, rot: (rng() * 4) | 0 };
        const f = templeFootprint(s);
        let lo = Infinity, hi = -Infinity, front = 0;
        for (let u = 0; u <= 4; u++) for (let v = 0; v <= 4; v++) {
            const h = groundAt(f.minX + (f.maxX - f.minX) * u / 4, f.minZ + (f.maxZ - f.minZ) * v / 4);
            lo = Math.min(lo, h); hi = Math.max(hi, h);
        }
        const st = templeToWorld(s, 0, 0, TEMPLE.Z1 - 1); front = groundAt(st.x, st.z);
        const score = hi - lo;
        if (!best || score < best.score) best = { score, x: s.x, z: s.z, rot: s.rot, y: Math.max(front, hi - TEMPLE.RISE * TEMPLE.K * 0.9) };
    }
    return { x: best.x, y: best.y, z: best.z, rot: best.rot };
}
