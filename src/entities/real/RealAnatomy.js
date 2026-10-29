/**
 * RealAnatomy.js — the «Реалистичный» hero's body, head and hand as shapes (RealSdf): the muscles, the bones under
 * the skin, the joints. All sizes from RealRig.js (the world's metres, the standard hero's height and arms).
 *
 * The parts (`PART`) tell the mesh what each place is: the weights (which bones move it), the clothes (torso, arm,
 * leg, foot), the colours (lips, nails, the inside of the mouth).
 */
import { Shape, sphere, ellipsoid, cone, box, plane, etorus, bump, add, sub, mul, norm, cross, frameZ, dot } from './RealSdf.js';
import { ANAT, Y, FINGERS, FINGER_NAMES, PALM, armRest, legRest, fingerRest, m4Apply, m4Dir } from './RealRig.js';

export const PART = {
    torso: 1, neck: 2, arm: 3, leg: 4, foot: 5, toe: 6, head: 7, lip: 8, nail: 9, ear: 10, nose: 11, mouthIn: 12,
    palm: 13, finger: 14, lid: 15, glute: 16, teeth: 17, tongue: 18, eye: 19,
};

const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const mx = (p) => [-p[0], p[1], p[2]];
const mframe = (f) => f.map(mx);
/** The frame of a limb along `u` (rows: u, the hinge x, and their cross). */
const limbFrame = (u, x) => { const y = cross(u, x); return [u, x, y]; };

/** Both sides of a primitive made by `make(s)` (s = 1 the right, −1 the left; `X(p)` mirrors a point, `F(f)` a frame). */
function both(list, make) {
    for (const s of [1, -1]) {
        const X = s > 0 ? (p) => p : mx, F = s > 0 ? (f) => f : mframe;
        list.push(...[].concat(make(X, F, s)));
    }
}

// ================================================================== the body (torso, arms, legs, feet)
/** @param {number} neckShrink the body's neck a little thinner: hidden in the head's own (the head is a mesh of its own). */
export function bodyShape(neckShrink = 0.008) {
    const torso = [], arms = [], legs = [], feet = [], cuts = [];
    const P = PART;
    const e = (c, r, f = I3, part = P.torso) => ellipsoid(c, r, f, { part });
    // ---- the torso: pelvis, belly, waist, the rib cage, the chest
    torso.push(
        e([0, Y(2.42), 0.02], [0.4, 0.24, 0.24]),
        e([0, Y(2.6), -0.03], [0.32, 0.2, 0.2]),
        e([0, Y(2.84), 0.03], [0.3, 0.24, 0.205]),
        e([0, Y(3.12), 0.03], [0.37, 0.36, 0.255]),
        e([0, Y(3.38), 0.035], [0.4, 0.2, 0.235]),
        e([0, Y(2.86), -0.1], [0.2, 0.3, 0.12]), // (the belly's muscles)
    );
    both(torso, (X, F) => [
        e(X([0.16, Y(3.28), -0.13]), [0.16, 0.11, 0.075]), // the chest's muscle
        cone(X([0.07, Y(3.66), 0.07]), X([0.44, Y(3.57), 0.04]), 0.085, 0.085, { part: P.torso }), // the trapezius
        e(X([0.19, Y(3.3), 0.17]), [0.14, 0.17, 0.07]), // the shoulder blade
        e(X([0.27, Y(3.1), 0.08]), [0.1, 0.25, 0.16]), // the broad back muscle
        e(X([0.25, Y(2.62), 0.0]), [0.1, 0.16, 0.17]), // the flank
        ellipsoid(X([0.15, Y(2.27), 0.13]), [0.165, 0.2, 0.15], I3, { part: P.glute }),
        cone(X([0.04, Y(3.6), -0.12]), X([0.42, Y(3.62), -0.045]), 0.024, 0.022, { part: P.torso }), // the collarbone
    ]);
    // ---- the neck (thinner than the head's: the head's mesh covers it)
    torso.push(cone([0, Y(3.52), 0.04], [0, Y(3.86), 0.0], 0.148 - neckShrink, 0.13 - neckShrink, { part: P.neck }));
    // the spine's groove, the navel
    cuts.push(
        cone([0, Y(2.62), 0.25], [0, Y(3.0), 0.285], 0.016, 0.018, { part: P.torso }),
        cone([0, Y(3.0), 0.285], [0, Y(3.42), 0.272], 0.018, 0.014, { part: P.torso }),
        sphere([0, Y(2.72), -0.228], 0.014, { part: P.torso }),
    );
    // ---- the arms (A-pose: 45° down and out)
    const A = armRest(), u = A.u, ax = [Math.SQRT1_2, Math.SQRT1_2, 0], zb = [0, 0, 1];
    const af = [u, ax, zb];
    both(arms, (X, F) => {
        const S = A.S, E = A.E, W = A.W, at = (p, t, o = [0, 0, 0]) => X(add(add(p, mul(u, t)), o));
        return [
            ellipsoid(at(S, 0.06, [0, 0.04, 0]), [0.22, 0.15, 0.155], F(af), { part: P.arm }), // the deltoid
            cone(at(S, 0.05), at(E, -0.03), 0.125, 0.088, { part: P.arm }),
            ellipsoid(at(S, 0.55, [0, 0, -0.045]), [0.3, 0.085, 0.07], F(af), { part: P.arm }), // the biceps
            ellipsoid(at(S, 0.42, [0, 0, 0.05]), [0.33, 0.08, 0.072], F(af), { part: P.arm }), // the triceps
            sphere(at(E, 0), 0.07, { part: P.arm }),
            sphere(at(E, 0, [0, 0, 0.045]), 0.032, { part: P.arm }), // the point of the elbow
            cone(at(E, 0), at(W, 0), 0.09, 0.05, { part: P.arm, flat: 0.8, flatAxis: zb }),
            ellipsoid(at(E, 0.25), [0.3, 0.09, 0.068], F(af), { part: P.arm }), // the forearm's muscles
            ellipsoid(at(W, -0.01), [0.04, 0.052, 0.038], F(af), { part: P.arm }),
        ];
    });
    // ---- the legs
    const L = legRest(), v = ANAT.legDir, lx = norm(cross([0, 0, 1], v)), lf = [v, lx, [0, 0, 1]];
    both(legs, (X, F) => {
        const H = L.Hj, K = L.K, An = L.A, at = (p, t, o = [0, 0, 0]) => X(add(add(p, mul(v, t)), o));
        return [
            cone(at(H, 0), at(K, -0.05), 0.2, 0.112, { part: P.leg }),
            ellipsoid(at(H, 0.5, [0, 0, -0.07]), [0.42, 0.14, 0.12], F(lf), { part: P.leg }), // the quadriceps
            ellipsoid(at(K, -0.17, [-0.06, 0, -0.05]), [0.1, 0.07, 0.07], F(lf), { part: P.leg }), // its inner head over the knee
            ellipsoid(at(H, 0.45, [0, 0, 0.08]), [0.4, 0.12, 0.1], F(lf), { part: P.leg }), // the hamstrings
            ellipsoid(at(H, 0.28, [-0.08, 0, 0]), [0.3, 0.09, 0.12], F(lf), { part: P.leg }), // the inner thigh
            sphere(at(K, 0), 0.108, { part: P.leg }),
            sphere(at(K, 0, [0, 0.02, -0.098]), 0.05, { part: P.leg }), // the kneecap
            cone(at(K, 0), at(An, -0.03), 0.104, 0.062, { part: P.leg }),
            ellipsoid(at(K, 0.3, [-0.035, 0, 0.065]), [0.25, 0.062, 0.075], F(lf), { part: P.leg }), // the calf
            ellipsoid(at(K, 0.28, [0.035, 0, 0.06]), [0.24, 0.058, 0.07], F(lf), { part: P.leg }),
            ellipsoid(at(K, 0.35, [0.02, 0, -0.048]), [0.3, 0.045, 0.045], F(lf), { part: P.leg }), // along the shin bone
            sphere(at(An, 0, [-0.052, 0.012, 0]), 0.036, { part: P.leg }), // the ankle bones
            sphere(at(An, 0, [0.056, -0.004, 0.005]), 0.034, { part: P.leg }),
        ];
    });
    // ---- the feet
    both(feet, (X) => {
        const An = L.A, out = [];
        out.push(
            sphere(X([An[0], Y(0.085), An[2] + 0.09]), 0.085, { part: P.foot }), // the heel
            cone(X([An[0], Y(0.085), An[2] + 0.06]), X([An[0] - 0.005, Y(0.055), An[2] - 0.38]), 0.085, 0.066, { part: P.foot, flat: 0.62, flatAxis: [0, 1, 0] }),
            ellipsoid(X([An[0], Y(0.15), An[2] - 0.12]), [0.072, 0.07, 0.17], I3, { part: P.foot }), // the instep
            ellipsoid(X([An[0], Y(0.17), An[2]]), [0.07, 0.09, 0.08], I3, { part: P.foot }),
        );
        // the toes: the big one inside, the little ones shorter
        const tz = [0.135, 0.115, 0.1, 0.085, 0.07], tr = [0.031, 0.02, 0.019, 0.018, 0.016];
        for (let i = 0; i < 5; i++) {
            const x0 = An[0] - 0.058 + i * 0.031, z0 = An[2] - 0.37 + i * 0.012;
            out.push(cone(X([x0, Y(0.04), z0]), X([x0 + i * 0.004, Y(0.032), z0 - tz[i]]), tr[i] * 1.1, tr[i], { part: P.toe, flat: 0.8, flatAxis: [0, 1, 0] }));
        }
        return out;
    });
    return new Shape()
        .union(torso, 0.07)
        .union(arms, 0.045, 0.06)
        .union(legs, 0.05, 0.055)
        .union(feet, 0.03, 0.045)
        .cut(cuts, 0, 0.02)
        .inter([plane([0, -1, 0], -Y(0.0))], 0, 0.012); // (the soles flat on the floor)
}

// ================================================================== the head (with its neck)
/**
 * Sculpted, not stacked: one smooth skull–face–jaw, then pushed and pressed like clay (the brow's ridge, the sockets,
 * the cheekbones and the hollows under them, the mouth's mound, the chin, the jaw's corners, the temples), then the
 * nose, the lips, the lids round the eyeballs, the ears with their rims — and cut: the eyes' slits, the mouth, the
 * nostrils, the ears' hollows.
 */
export function headShape() {
    const P = PART, skull = [], lips = [], ears = [], neck = [], cuts = [], nose = [], lids = [], bumps = [], earCuts = [];
    const e = (c, r, part = P.head, f = I3) => ellipsoid(c, r, f, { part });
    const E = ANAT.eye;
    skull.push(
        e([0, Y(4.21), 0.03], [0.2, 0.25, 0.245]), // the skull
        e([0, Y(4.04), -0.06], [0.165, 0.21, 0.18]), // the face
        e([0, Y(3.92), -0.075], [0.14, 0.1, 0.155]), // the jaw
        e([0, Y(3.86), -0.19], [0.052, 0.04, 0.045]), // the chin
    );
    const bm = (c, sig, amp) => bumps.push(bump(c, sig, amp, I3, { part: P.head }));
    bm([0, Y(4.2), -0.225], [0.03, 0.025, 0.04], 0.018); // between the brows
    for (const sx of [1, -1]) {
        bm([0.075 * sx, Y(4.215), -0.205], [0.06, 0.018, 0.04], 0.026); // the brow's ridge
        bm([0.06 * sx, Y(4.33), -0.19], [0.06, 0.06, 0.06], 0.008); // the forehead's two mounds
        bm([0.085 * sx, Y(4.155), -0.2], [0.04, 0.03, 0.05], -0.01); // the socket
        bm([0.12 * sx, Y(4.07), -0.17], [0.035, 0.022, 0.05], 0.02); // the cheekbone
        bm([0.12 * sx, Y(3.98), -0.16], [0.03, 0.03, 0.05], -0.004); // the hollow under it
        bm([0.085 * sx, Y(4.0), -0.2], [0.035, 0.035, 0.04], 0.01); // the cheek
        bm([0.135 * sx, Y(3.92), 0.0], [0.03, 0.03, 0.03], 0.012); // the jaw's corner
        bm([0.175 * sx, Y(4.21), -0.1], [0.035, 0.035, 0.035], -0.012); // the temple
        bm([0.045 * sx, Y(3.96), -0.235], [0.008, 0.028, 0.02], -0.003); // the fold from the nose to the mouth
    }
    bm([0, Y(3.94), -0.22], [0.05, 0.04, 0.05], 0.02); // the mouth's mound
    bm([0, Y(3.86), -0.225], [0.03, 0.025, 0.03], 0.008); // the chin's point
    bm([0, Y(3.888), -0.235], [0.03, 0.01, 0.03], -0.006); // the dip under the lower lip
    bm([0, Y(3.962), -0.252], [0.006, 0.015, 0.02], -0.003); // the groove over the upper lip
    // the lids: skin round each eyeball (cut open below)
    both(lids, (X) => [sphere(X(E), ANAT.eyeR + 0.011, { part: P.lid })]);
    // the nose: a narrow bridge widening to the tip, the wings, the strip between the nostrils
    nose.push(
        cone([0, Y(4.19), -0.228], [0, Y(4.045), -0.272], 0.013, 0.021, { part: P.nose, flat: 0.8, flatAxis: [1, 0, 0] }),
        sphere([0, Y(4.03), -0.278], 0.019, { part: P.nose }),
        cone([0, Y(4.015), -0.278], [0, Y(3.995), -0.262], 0.008, 0.007, { part: P.nose }),
    );
    both(nose, (X) => [e(X([0.025, Y(4.003), -0.257]), [0.016, 0.014, 0.019], P.nose)]);
    // the lips: the upper one with its bow's middle, the fuller lower one
    lips.push(
        e([0, Y(3.938), -0.247], [0.05, 0.011, 0.014], P.lip),
        sphere([0, Y(3.935), -0.257], 0.008, { part: P.lip }),
        e([0, Y(3.912), -0.243], [0.045, 0.013, 0.016], P.lip),
    );
    // the ears: a thin shell, its rim, the lobe, the tragus; the hollow cut into it
    both(ears, (X, F) => {
        const n = norm([1, 0, -0.3]), up0 = [0, 0.97, 0.25], up = norm(sub(up0, mul(n, dot(up0, n)))), fw = cross(up, n);
        const fr = [fw, up, n], c = [0.205, Y(4.115), 0.04];
        const at = (a, b, k) => X(add(add(add(c, mul(fw, a)), mul(up, b)), mul(n, k)));
        return [
            ellipsoid(X(c), [0.055, 0.1, 0.012], F(fr), { part: P.ear }),
            etorus(at(0, 0.005, 0.004), 0.058, 0.102, 0.011, F(fr), { part: P.ear }),
            etorus(at(-0.006, -0.005, 0.006), 0.03, 0.058, 0.007, F(fr), { part: P.ear }),
            ellipsoid(at(0.005, -0.095, 0), [0.022, 0.026, 0.012], F(fr), { part: P.ear }),
            sphere(at(0.045, -0.02, 0.006), 0.011, { part: P.ear }),
        ];
    });
    both(earCuts, (X) => {
        const n = norm([1, 0, -0.3]), up0 = [0, 0.97, 0.25], up = norm(sub(up0, mul(n, dot(up0, n)))), fw = cross(up, n), c = [0.205, Y(4.115), 0.04];
        return [sphere(X(add(add(add(c, mul(fw, 0.012)), mul(up, -0.015)), mul(n, 0.027))), 0.026, { part: P.ear })];
    });
    // the neck: its muscles, the throat's ridge, the nape
    neck.push(
        cone([0, Y(3.48), 0.04], [0, Y(3.9), 0.0], 0.148, 0.13, { part: P.neck }),
        e([0, Y(3.74), -0.125], [0.025, 0.035, 0.02], P.neck),
        e([0, Y(3.75), 0.1], [0.12, 0.12, 0.08], P.neck),
    );
    both(neck, (X) => [cone(X([0.13, Y(4.0), 0.07]), X([0.035, Y(3.6), -0.1]), 0.035, 0.03, { part: P.neck })]);
    // cut away: the eyeballs' room, the eyes' slits (the outer corner a little higher), the nostrils
    const tilt = [[Math.cos(0.08), Math.sin(0.08), 0], [-Math.sin(0.08), Math.cos(0.08), 0], [0, 0, 1]];
    both(cuts, (X, F) => [
        ellipsoid(X([E[0], E[1] + 0.002, E[2] - 0.038]), [0.037, 0.0115, 0.04], F(tilt), { part: P.lid }),
        ellipsoid(X([0.012, Y(3.996), -0.27]), [0.0075, 0.005, 0.011], I3, { part: P.nose }),
    ]);
    const mouth = [
        ellipsoid([0, Y(3.925), -0.17], [0.055, 0.035, 0.065], I3, { part: P.mouthIn }),
        ellipsoid([0, Y(3.925), -0.255], [0.047, 0.0065, 0.03], I3, { part: P.mouthIn }),
    ];
    return new Shape()
        .union(skull, 0.08)
        .bumps(bumps)
        .union(neck, 0.06, 0.06)
        .union(lids, 0, 0.03)
        .union(nose, 0.02, 0.025)
        .union(lips, 0.006, 0.01)
        .union(ears, 0.008, 0.02)
        .cut(earCuts, 0, 0.006)
        .cut(cuts, 0, 0.007)
        .cut(mouth, 0.01, 0.004);
}

/** The teeth (two rows round the arc behind the lips) and the tongue. */
export function teethShape() {
    const up = [], lo = [], tongue = [];
    const C = [0, Y(3.925), -0.19];
    for (const [row, list, y] of [[0, up, 0.007], [1, lo, -0.009]]) {
        for (let i = -4; i <= 4; i++) {
            if (i === 0) continue;
            const a = (Math.abs(i) - 0.5) * 0.2 * Math.sign(i);
            const r = 0.046, c = [C[0] + Math.sin(a) * r, C[1] + y, C[2] - Math.cos(a) * r];
            const w = Math.abs(i) <= 2 ? 0.0085 : 0.0095;
            const f = frameZ([Math.sin(a), 0, -Math.cos(a)]);
            list.push(box(c, [w * (row ? 0.85 : 1), 0.0095 * (Math.abs(i) <= 2 ? 1 : 0.85), 0.006], [f[0], f[1], f[2]], 0.0025, { part: PART.teeth, zone: row }));
        }
    }
    tongue.push(ellipsoid([0, Y(3.905), -0.18], [0.038, 0.012, 0.05], I3, { part: PART.tongue }));
    return { teeth: new Shape().union(up, 0.003).union(lo, 0.003), tongue: new Shape().union(tongue, 0) };
}

// ================================================================== the hand (the right one, in its palm's space)
/**
 * The palm's space is the game's (SimplifiedHand: the palm a box 0.28 × 0.45 × 0.14 round its middle; y to the fingers,
 * −z the palm's face, the thumb at −x). Each primitive's `zone` = the finger's bone (fingerIndex·3 + joint) or 15 the palm.
 */
export function handShape() {
    const P = PART, palm = [], fingers = [], nails = [];
    palm.push(
        box([0.005, 0.0, 0.0], [0.105, 0.19, 0.028], I3, 0.032, { part: P.palm, zone: 15 }),
        ellipsoid([-0.072, -0.1, -0.03], [0.055, 0.1, 0.04], [norm([0.9, 0.42, 0]), norm([-0.42, 0.9, 0]), [0, 0, 1]], { part: P.palm, zone: 15 }), // the thumb's mound
        ellipsoid([0.095, -0.08, -0.024], [0.04, 0.12, 0.036], I3, { part: P.palm, zone: 15 }), // the little finger's side
        ellipsoid([0, 0.19, 0.008], [0.125, 0.04, 0.04], I3, { part: P.palm, zone: 15 }), // the knuckles' ridge
        cone([0, -0.19, 0], [0, -0.36, 0], 0.062, 0.058, { part: P.palm, zone: 16, flat: 0.74, flatAxis: [0, 0, 1] }), // the wrist
    );
    for (const f of ['index', 'middle', 'ring', 'pinky']) palm.push(sphere([FINGERS[f].x, 0.205, 0.024], 0.03, { part: P.palm, zone: 15 }));
    FINGER_NAMES.forEach((f, fi) => {
        const c = FINGERS[f], seg = c.len / 3, R = fingerRest(f);
        const thumb = f === 'thumb';
        const r0 = thumb ? 0.046 : c.w * 0.45, r3 = thumb ? 0.03 : c.w * 0.33;
        const rr = (t) => r0 + (r3 - r0) * t; // (thinner to the tip)
        for (let i = 0; i < 3; i++) {
            const M = R[i], at = (p) => m4Apply(M, p), dir = (p) => m4Dir(M, p);
            const t0 = i / 3, t1 = (i + 1) / 3;
            const ra = rr(t0), rb = rr(t1);
            const zone = fi * 3 + i;
            const flat = { part: P.finger, zone, flat: 0.86, flatAxis: dir([0, 0, 1]) };
            const y0 = i === 0 ? (thumb ? -0.02 : -0.03) : 0, y1 = i === 2 ? seg - rb * 0.9 : seg;
            fingers.push(cone(at([0, y0, 0]), at([0, y1, 0]), ra, i === 2 ? rb * 0.95 : rb, flat));
            if (i > 0) fingers.push(sphere(at([0, 0, 0.003]), ra * 1.06, { part: P.finger, zone })); // (the joint a little thicker)
            if (i === 2) {
                // the pad, the tip, the nail on the back
                const f3 = [dir([1, 0, 0]), dir([0, 1, 0]), dir([0, 0, 1])];
                fingers.push(ellipsoid(at([0, seg * 0.58, -rb * 0.22]), [rb * 0.98, seg * 0.42, rb * 0.82], f3, { part: P.finger, zone }));
                nails.push(ellipsoid(at([0, seg * 0.62, rb * 0.66]), [rb * 0.8, seg * 0.36, rb * 0.3], f3, { part: P.nail, zone }));
            }
        }
    });
    return new Shape()
        .union(palm, 0.03)
        .union(fingers, 0.006, 0.028)
        .union(nails, 0, 0.004);
}

/** The boxes the meshes are made in (the group's / the palm's space): [lo, hi]. */
export const BOUNDS = {
    body: [[-2.02, Y(-0.02), -0.62], [2.02, Y(3.9), 0.45]],
    head: [[-0.27, Y(3.5), -0.37], [0.27, Y(4.52), 0.32]],
    teeth: [[-0.065, Y(3.895), -0.26], [0.065, Y(3.945), -0.16]],
    tongue: [[-0.05, Y(3.88), -0.25], [0.05, Y(3.93), -0.13]],
    hand: [[-0.58, -0.37, -0.12], [0.22, 0.78, 0.12]],
};
export { dot, sub };
