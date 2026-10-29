/**
 * RealRig.js — the bones of the «Реалистичный» hero and their places at rest (no THREE: the worker builds the skin
 * against them, the game moves them).
 *
 * Sizes are the world's (a block is 1 m) and the standard hero's, measured on its model (Box3): the feet on the floor
 * (group y − 2.0), the eyes 4.15 m over them (the first-person camera — Character.getHeadPosition), the crown 4.48, the
 * arms as long as the hero's own (1.0 + 0.9 from the shoulder to the wrist: the hands go where the game puts them — the
 * grip, the wand, the blows), the hands as big as the hands the game holds things with (SimplifiedHand: palm
 * 0.28 × 0.45 × 0.14, fingers 0.32…0.52). The rest is a slim grown-up person's proportions (a 1.75 m man ×2.56):
 * shoulders 1.07 across, chest 0.82, waist 0.70, hips 0.87, neck 0.31, head 0.40 × 0.50 × 0.63.
 *
 * Space: the hero's group (x right, y up, z back — the hero faces −z). The rest pose is an «A»: the arms 45° down and
 * out (they never melt into the sides), the legs a little apart.
 */

/** Height over the floor → the group's y. */
export const FLOOR = -2.0;
export const Y = (h) => h + FLOOR;

const S2 = Math.SQRT1_2;
export const ANAT = {
    crown: 4.48, eyes: 4.15, chin: 3.83, neckBase: 3.6,
    shoulder: [0.55, Y(3.48), 0.02], // (the right one; the left is mirrored)
    armDir: [S2, -S2, 0], L1: 1.0, L2: 0.9,
    hip: [0.24, Y(2.26), 0.02],
    legDir: norm3([0.075, -1, 0]), Lth: 1.02, Lsh: 1.08,
    foot: 0.67, // (heel to toe)
    eye: [0.08, Y(4.15), -0.19], eyeR: 0.033,
    jaw: [0, Y(4.06), -0.02], // (the jaw's hinge, between the ears)
};
/** The hand the game holds things with (SimplifiedHand.js): its palm and fingers' places in the palm. */
export const PALM = { W: 0.28, H: 0.45, D: 0.14 };
export const FINGERS = {
    thumb: { x: -0.14, y: 0.10, z: 0.06, len: 0.52, w: 0.10, rot: [0.3, -0.4, 0.8] },
    index: { x: -0.09, y: 0.45, z: 0, len: 0.42, w: 0.08 },
    middle: { x: 0.00, y: 0.48, z: 0, len: 0.48, w: 0.08 },
    ring: { x: 0.09, y: 0.45, z: 0, len: 0.40, w: 0.075 },
    pinky: { x: 0.13, y: 0.40, z: 0, len: 0.32, w: 0.07 },
};
export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];

// ------------------------------------------------------------------ the bones
const NAMES = [
    'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
    'clavL', 'clavR', 'upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'twistL', 'twistR', 'handL', 'handR',
];
for (const s of ['L', 'R']) for (const f of FINGER_NAMES) for (let i = 0; i < 3; i++) NAMES.push(f + i + s);
NAMES.push('thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'toesL', 'toesR',
    'jaw', 'eyeL', 'eyeR', 'lidUpL', 'lidLoL', 'lidUpR', 'lidLoR', 'browInL', 'browOutL', 'browInR', 'browOutR',
    'cornerL', 'cornerR', 'lipUp', 'lipLo', 'cheekL', 'cheekR', 'nose');
export const BONE_NAMES = NAMES;
export const B = Object.fromEntries(NAMES.map((n, i) => [n, i]));
export const BONE_COUNT = NAMES.length;
export const fingerBone = (f, i, side) => B[f + i + (side === 'left' || side === 'L' ? 'L' : 'R')];

// ------------------------------------------------------------------ 4×4 matrices (column-major, as THREE's)
export function m4() { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
/** From a frame (axes x, y, z: the columns) and a place. */
export function m4Frame(x, y, z, p) {
    const m = new Float64Array(16);
    m[0] = x[0]; m[1] = x[1]; m[2] = x[2];
    m[4] = y[0]; m[5] = y[1]; m[6] = y[2];
    m[8] = z[0]; m[9] = z[1]; m[10] = z[2];
    m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1;
    return m;
}
export function m4T(x, y, z) { const m = m4(); m[12] = x; m[13] = y; m[14] = z; return m; }
export function m4Rx(a) { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
export function m4Ry(a) { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
export function m4Rz(a) { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
/** Euler 'XYZ' (THREE's default order). */
export function m4Euler(x, y, z) { return m4Mul(m4Mul(m4Rx(x), m4Ry(y)), m4Rz(z)); }
export function m4Mul(a, b) {
    const o = new Float64Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
}
/** The mirror through x = 0 (the left side from the right). */
export const MX = (() => { const m = m4(); m[0] = -1; return m; })();
export function m4MirrorX(m) { return m4Mul(m4Mul(MX, m), MX); }
export function m4Inv(m) {
    // (rigid: rotation + place)
    const o = m4();
    o[0] = m[0]; o[1] = m[4]; o[2] = m[8];
    o[4] = m[1]; o[5] = m[5]; o[6] = m[9];
    o[8] = m[2]; o[9] = m[6]; o[10] = m[10];
    o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]);
    o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]);
    o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
    return o;
}
export function m4Apply(m, p) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}
export function m4Dir(m, p) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
}

function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

// ------------------------------------------------------------------ the rest pose
/** The arm's frames at rest (the right one): z along the bone, x the elbow's hinge (the forearm bends forward). */
export function armRest() {
    const u = norm3(ANAT.armDir);
    const x = norm3(cross3(u, [0, 0, -1])); // (flexion: the forearm goes to the front, −z)
    const y = cross3(u, x);
    const S = ANAT.shoulder, E = add3(S, u, ANAT.L1), W = add3(E, u, ANAT.L2);
    const upper = m4Frame(x, y, u, S), fore = m4Frame(x, y, u, E), twist = m4Frame(x, y, u, add3(E, u, ANAT.L2 * 0.55));
    // the palm as the game's hand hangs on the forearm: the hand's group at the wrist, turned ¼ round x, the palm's middle 0.225 on
    const hand = m4Mul(m4Mul(m4Mul(fore, m4T(0, 0, ANAT.L2)), m4Rx(Math.PI / 2)), m4T(0, PALM.H / 2, 0));
    return { S, E, W, u, upper, fore, twist, hand };
}
/** A finger's three bones at rest in the PALM's space (the game's pivots: SimplifiedHand.createFinger). */
export function fingerRest(name) {
    const c = FINGERS[name], seg = c.len / 3;
    const base = m4Mul(m4T(c.x, c.y - PALM.H / 2, c.z), c.rot ? m4Euler(c.rot[0], c.rot[1], c.rot[2]) : m4());
    const b1 = m4Mul(base, m4T(0, seg, 0)), b2 = m4Mul(b1, m4T(0, seg, 0));
    return [base, b1, b2];
}
/** The leg's frames at rest (the right one): z down the bone, x the knee's hinge. */
export function legRest() {
    const v = ANAT.legDir;
    const x = norm3(cross3([0, 0, 1], v)); // (flexion: the shin goes back, +z)
    const y = cross3(v, x);
    const Hj = ANAT.hip, K = add3(Hj, v, ANAT.Lth), A = add3(K, v, ANAT.Lsh);
    const thigh = m4Frame(x, y, v, Hj), shin = m4Frame(x, y, v, K);
    const foot = m4T(A[0], A[1], A[2]);
    const ball = [A[0] + 0.01, Y(0.05), A[2] - 0.40];
    const toes = m4T(ball[0], ball[1], ball[2]);
    return { Hj, K, A, ball, thigh, shin, foot, toes };
}

/** Every bone's rest matrix in the group's space (index = B[name]). */
export function restPose() {
    const R = new Array(BONE_COUNT);
    const at = (h, z = 0.03) => m4T(0, Y(h), z);
    R[B.hips] = at(2.45, 0.02); R[B.spine] = at(2.72, 0.05); R[B.chest] = at(3.05, 0.04); R[B.upperChest] = at(3.35, 0.03);
    R[B.neck] = at(3.6, 0.04); R[B.head] = at(3.93, 0.02);
    const arm = armRest(), leg = legRest();
    const both = (nameR, nameL, m) => { R[B[nameR]] = m; R[B[nameL]] = m4MirrorX(m); };
    both('clavR', 'clavL', m4T(0.06, Y(3.56), -0.02));
    both('upperArmR', 'upperArmL', arm.upper); both('forearmR', 'forearmL', arm.fore); both('twistR', 'twistL', arm.twist);
    both('handR', 'handL', arm.hand);
    for (const f of FINGER_NAMES) {
        const fr = fingerRest(f);
        for (let i = 0; i < 3; i++) both(f + i + 'R', f + i + 'L', m4Mul(arm.hand, fr[i]));
    }
    both('thighR', 'thighL', leg.thigh); both('shinR', 'shinL', leg.shin); both('footR', 'footL', leg.foot); both('toesR', 'toesL', leg.toes);
    // the face: its bones at their places, turned as the head
    const E = ANAT.eye;
    R[B.jaw] = m4T(ANAT.jaw[0], ANAT.jaw[1], ANAT.jaw[2]);
    both('eyeR', 'eyeL', m4T(E[0], E[1], E[2]));
    both('lidUpR', 'lidUpL', m4T(E[0], E[1], E[2])); both('lidLoR', 'lidLoL', m4T(E[0], E[1], E[2]));
    both('browInR', 'browInL', m4T(0.045, Y(4.225), -0.245)); both('browOutR', 'browOutL', m4T(0.13, Y(4.225), -0.2));
    both('cornerR', 'cornerL', m4T(0.052, Y(3.925), -0.232));
    R[B.lipUp] = m4T(0, Y(3.94), -0.255); R[B.lipLo] = m4T(0, Y(3.91), -0.25);
    both('cheekR', 'cheekL', m4T(0.11, Y(4.0), -0.2));
    R[B.nose] = m4T(0, Y(4.0), -0.275);
    return R;
}
