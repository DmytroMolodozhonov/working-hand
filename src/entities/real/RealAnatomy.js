/**
 * RealAnatomy.js — the «Реалистичный» hero's body, head and hand as shapes (RealSdf): the muscles, the bones under
 * the skin, the joints. All sizes from RealRig.js (the world's metres, the standard hero's height and arms).
 *
 * The parts (`PART`) tell the mesh what each place is: the weights (which bones move it), the clothes (torso, arm,
 * leg, foot), the colours (lips, nails, the inside of the mouth).
 */
import { Shape, sphere, ellipsoid, cone, box, plane, bump, add, sub, mul, norm, cross, dot } from './RealSdf.js';
import { ANAT, Y, FINGERS, FINGER_NAMES, armRest, legRest, fingerRest, m4Apply, m4Dir } from './RealRig.js';

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
/** A box with soft chamfers whose OUTER half-sizes are `half` (the chamfer cut from them, not added). */
function rbox(c, half, frame, r, o) {
    return box(c, [Math.max(1e-3, half[0] - r), Math.max(1e-3, half[1] - r), Math.max(1e-3, half[2] - r)], frame, r, o);
}

/** A box along a limb from `a`, `len` long (its middle at a + u·len/2), `w` across the hinge, `d` the other way. */
function limbBox(a, u, frame, t0, t1, w, d, round, part, X, F) {
    const c = add(a, mul(u, (t0 + t1) / 2));
    return rbox(X(c), [(t1 - t0) / 2, w, d], F(frame), round, { part });
}

/**
 * The body: the standard hero's boxes (the same sizes and places), cut finer — the torso in three blocks (chest,
 * belly, pelvis) that bend on the spine, the shoulders' caps, a neck under the head, the elbow and the knee their own
 * blocks between the arm's and the leg's two, the feet in shoes (a sole, a toe cap). Soft chamfers on every edge; the
 * blocks melt only a little where they meet (the skin bends there without seams). No muscles — not a «real» body.
 * @param {number} neckShrink the body's neck a little thinner: hidden in the head's own.
 */
export function bodyShape(neckShrink = 0) {
    const torso = [], arms = [], legs = [], feet = [], cuts = [];
    const P = PART;
    const bx = (c, h, r = 0.06, part = P.torso, f = I3) => rbox(c, h, f, r, { part });
    // ---- the torso (the standard's 1.2 × 1.5 × 0.8 from 2.0 to 3.5) in three blocks
    torso.push(
        bx([0, Y(3.15), 0], [0.6, 0.35, 0.4], 0.07), // the chest
        bx([0, Y(2.6), 0], [0.57, 0.22, 0.38], 0.06), // the belly (a little narrower: the waist)
        bx([0, Y(2.2), 0], [0.59, 0.2, 0.39], 0.06), // the pelvis
    );
    // ---- the neck (under the head's block)
    torso.push(bx([0, Y(3.56), 0], [0.2 - neckShrink, 0.1, 0.18 - neckShrink], 0.05, P.neck));
    // the seam between the chest and the belly, the belt's line (a little cut in: the blocks read as blocks)
    cuts.push(bx([0, Y(2.82), 0], [0.7, 0.012, 0.5], 0.005), bx([0, Y(2.4), 0], [0.7, 0.01, 0.5], 0.005));
    // ---- the arms (A-pose: 45° down and out): the standard's 0.4 upper arm and 0.35 forearm, never longer than the game's
    const A = armRest(), u = A.u, ax = [Math.SQRT1_2, Math.SQRT1_2, 0], zb = [0, 0, 1];
    const af = [u, ax, zb];
    both(arms, (X, F) => {
        const S = A.S, E = A.E;
        return [
            rbox(X(S), [0.23, 0.23, 0.23], F(af), 0.07, { part: P.arm }), // the shoulder's cap
            limbBox(S, u, af, 0.0, 0.9, 0.2, 0.2, 0.05, P.arm, X, F),
            rbox(X(E), [0.12, 0.185, 0.185], F(af), 0.07, { part: P.arm }), // the elbow
            limbBox(E, u, af, 0.05, 0.86, 0.175, 0.175, 0.045, P.arm, X, F),
        ];
    });
    // ---- the legs: the standard's 0.5 legs, the knee its own block
    const L = legRest(), v = ANAT.legDir, lx = [1, 0, 0], lf = [v, lx, [0, 0, 1]];
    both(legs, (X, F) => {
        const H = L.Hj, K = L.K;
        return [
            limbBox(H, v, lf, -0.1, 0.88, 0.25, 0.25, 0.05, P.leg, X, F),
            rbox(X(K), [0.13, 0.255, 0.255], F(lf), 0.07, { part: P.leg }), // the knee
            limbBox(K, v, lf, 0.08, 0.86, 0.24, 0.24, 0.05, P.leg, X, F),
        ];
    });
    // ---- the feet: a shoe — the sole, the toe cap a little rounder
    both(feet, (X) => {
        const An = L.A;
        return [
            rbox(X([An[0], Y(0.13), An[2] - 0.06]), [0.26, 0.13, 0.32], I3, 0.05, { part: P.foot }),
            rbox(X([An[0], Y(0.1), An[2] - 0.3]), [0.255, 0.1, 0.12], I3, 0.07, { part: P.toe }),
        ];
    });
    return new Shape()
        .union(torso, 0.03)
        .union(arms, 0.04, 0.05)
        .union(legs, 0.04, 0.05)
        .union(feet, 0.02, 0.04)
        .cut(cuts, 0, 0.01)
        .inter([plane([0, -1, 0], -Y(0.0))], 0, 0.01); // (the soles flat on the floor)
}

// ================================================================== the head
/** The head's block (the OLD measures — RealRig.HEADX makes it the standard's 1.2 cube): hats and hair sit on it. */
export const HEAD_BOX = { c: [0, Y(4.175), 0.0], h: [0.205, 0.3, 0.245], r: 0.022 };
/** The head's block pushed out by t (a cap, hair, a hat, a helmet: blocks over the block). */
export function skullBox(t, o) { return rbox(HEAD_BOX.c, [HEAD_BOX.h[0] + t, HEAD_BOX.h[1] + t, HEAD_BOX.h[2] + t], I3, HEAD_BOX.r + t * 0.5, o); }

/**
 * The standard hero's head: its cube with soft edges, a nose block, small ears. The face is the standard's pixel face
 * (the look's eyes and mouth), PAINTED on the front by the shader and moving with the player's face (RealSkinMaterial
 * `uFace*`: blinking, looking, the brows, a smile, an open mouth, an «о») — no eyeballs, lips or teeth.
 * Sculpted in the head's OLD measures; RealRig.HEADX makes it the drawn head.
 */
export function headShape() {
    const P = PART;
    const skull = [skullBox(0, { part: P.head })];
    // the nose: the standard's 2 × 2 pixel nose (0.15 m) as a little block
    const nose = [rbox([0, Y(4.1375), -0.257], [0.026, 0.0375, 0.016], I3, 0.008, { part: P.nose })];
    const ears = [], earCuts = [];
    both(ears, (X) => [rbox(X([0.215, Y(4.16), 0.02]), [0.018, 0.045, 0.03], I3, 0.008, { part: P.ear })]);
    both(earCuts, (X) => [rbox(X([0.232, Y(4.16), 0.02]), [0.008, 0.025, 0.015], I3, 0.004, { part: P.ear })]);
    return new Shape()
        .union(skull, 0)
        .union(nose, 0.006, 0.01)
        .union(ears, 0.004, 0.008)
        .cut(earCuts, 0, 0.003);
}

// ================================================================== the hand (the right one, in its palm's space)
/**
 * The palm's space is the game's (SimplifiedHand: the palm a box 0.28 × 0.45 × 0.14 round its middle; y to the fingers,
 * −z the palm's face, the thumb at −x). Each primitive's `zone` = the finger's bone (fingerIndex·3 + joint) or 15 the palm.
 */
export function handShape() {
    const P = PART, palm = [], fingers = [], nails = [];
    palm.push(
        box([0.005, 0.0, 0.0], [0.105, 0.19, 0.036], I3, 0.034, { part: P.palm, zone: 15 }),
        ellipsoid([-0.072, -0.1, -0.03], [0.055, 0.1, 0.04], [norm([0.9, 0.42, 0]), norm([-0.42, 0.9, 0]), [0, 0, 1]], { part: P.palm, zone: 15 }), // the thumb's mound
        ellipsoid([0.095, -0.08, -0.024], [0.04, 0.12, 0.036], I3, { part: P.palm, zone: 15 }), // the little finger's side
        ellipsoid([0, 0.19, 0.008], [0.125, 0.04, 0.04], I3, { part: P.palm, zone: 15 }), // the knuckles' ridge
        cone([0, -0.19, 0], [0, -0.36, 0], 0.062, 0.058, { part: P.palm, zone: 16, flat: 0.74, flatAxis: [0, 0, 1] }), // the wrist
    );
    for (const f of ['index', 'middle', 'ring', 'pinky']) palm.push(sphere([FINGERS[f].x, 0.205, 0.024], 0.03, { part: P.palm, zone: 15 }));
    // the fingers: soft-chamfered blocks per bone (the world's style — no thin «real» fingers), as thick as the game's,
    // a little thinner to the tip, a flat nail on the last one
    FINGER_NAMES.forEach((f, fi) => {
        const c = FINGERS[f], seg = c.len / 3, R = fingerRest(f);
        const thumb = f === 'thumb';
        const r0 = thumb ? 0.05 : c.w * 0.54, r3 = thumb ? 0.04 : c.w * 0.45;
        for (let i = 0; i < 3; i++) {
            const M = R[i], at = (p) => m4Apply(M, p), dir = (p) => m4Dir(M, p);
            const ra = r0 + (r3 - r0) * (i / 2);
            const zone = fi * 3 + i;
            const f3 = [dir([1, 0, 0]), dir([0, 1, 0]), dir([0, 0, 1])];
            const y0 = i === 0 ? (thumb ? -0.03 : -0.035) : -ra * 0.25, y1 = seg + (i === 2 ? 0 : ra * 0.25);
            fingers.push(rbox(at([0, (y0 + y1) / 2, 0]), [ra, (y1 - y0) / 2, ra * 0.9], f3, ra * (i === 2 ? 0.75 : 0.55), { part: P.finger, zone }));
            if (i === 2) nails.push(rbox(at([0, seg * 0.66, ra * 0.82]), [ra * 0.7, seg * 0.3, 0.008], f3, 0.006, { part: P.nail, zone }));
        }
    });
    return new Shape()
        .union(palm, 0.03)
        .union(fingers, 0.012, 0.028)
        .union(nails, 0, 0.003);
}

/** The boxes the meshes are made in (the group's / the palm's space): [lo, hi]. */
export const BOUNDS = {
    body: [[-2.3, Y(-0.02), -0.8], [2.3, Y(3.84), 0.62]],
    head: [[-0.27, Y(3.5), -0.37], [0.27, Y(4.52), 0.32]], // (the old measures: HEADX makes them the drawn head)
    hand: [[-0.58, -0.37, -0.12], [0.22, 0.78, 0.12]],
};
export { dot, sub };
