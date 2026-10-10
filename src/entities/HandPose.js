/**
 * HandPose.js — the whole hand as the camera network sees it (pure maths).
 *
 * The 21 hand points give the hand's full turn — up/down (bending the wrist),
 * left/right (to the thumb / to the little finger), and the roll of the palm —
 * and every joint of every finger. Points come in picture units (x across,
 * y down, z depth on the x scale: smaller = nearer the camera); `aspect` is the
 * picture's width / height, so that a turn looks the same in a wide picture.
 *
 * The person faces the camera (the picture is not mirrored): their left is the
 * picture's right. In the hero's own space (it looks along −Z, +X is its right,
 * +Y up) a picture point is (−x·aspect, −y, z·aspect).
 *
 * The hand's frame: X from the index knuckle to the little finger's, Y from the
 * wrist to the middle knuckle, Z = X × Y (for a right hand: out of the back of
 * the hand; for a left hand: out of the palm) — the same as on the hero's hands.
 */

import * as THREE from 'three';

export const FINGER_CHAINS = {
    thumb: [1, 2, 3, 4],
    index: [5, 6, 7, 8],
    middle: [9, 10, 11, 12],
    ring: [13, 14, 15, 16],
    pinky: [17, 18, 19, 20],
};

const _p = Array.from({ length: 21 }, () => new THREE.Vector3());
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

/** The 21 points in the hero's space (reused vectors). */
export function heroPoints(lm, aspect = 4 / 3, out = _p) {
    for (let i = 0; i < 21; i++) out[i].set(-lm[i].x * aspect, -lm[i].y, (lm[i].z || 0) * aspect);
    return out;
}

/**
 * The hand's frame in the hero's space.
 * @returns {{X: THREE.Vector3, Y: THREE.Vector3, Z: THREE.Vector3, quality: number}|null}
 *   quality 0…1: how well the knuckle line is seen (an edge-on hand: its turn about
 *   the fingers is a guess — then it is better held than followed).
 */
export function handFrame(lm, aspect = 4 / 3, out = {}) {
    if (!lm || lm.length < 21) return null;
    const P = heroPoints(lm, aspect);
    const Y = (out.Y || (out.Y = new THREE.Vector3())).subVectors(P[9], P[0]);
    const len = Y.length();
    if (len < 1e-5) return null;
    Y.divideScalar(len);
    const X = (out.X || (out.X = new THREE.Vector3())).subVectors(P[17], P[5]);
    const span = Math.hypot(X.x, X.y); // (as seen in the picture: depth is the network's guess)
    X.addScaledVector(Y, -X.dot(Y));
    if (X.lengthSq() < 1e-10) return null;
    X.normalize();
    const Z = (out.Z || (out.Z = new THREE.Vector3())).crossVectors(X, Y);
    // the knuckles of a real hand are ~0.45–0.6 of wrist→middle knuckle apart
    out.quality = Math.max(0, Math.min(1, (span / len - 0.12) / 0.3));
    return out;
}

/**
 * How much every joint is bent (rad, 0 = straight), from the points in 3D.
 * Fingers: [knuckle, middle joint, end joint]; the knuckle can bend a little
 * backwards (negative). spread: the finger's turn aside from straight on in the
 * palm's plane (+ towards the little finger). thumb: [base, middle, end].
 */
export function fingerJoints(lm, aspect = 4 / 3, side = 'right', out = {}) {
    if (!lm || lm.length < 21) return null;
    const P = heroPoints(lm, aspect);
    const fr = handFrame(lm, aspect, out._frame || (out._frame = {}));
    if (!fr) return null;
    // which way is the palm: a right hand's Z is the back, a left hand's the palm
    const palm = _d.copy(fr.Z).multiplyScalar(side === 'right' ? -1 : 1);
    for (const [name, [m, p1, p2, tip]] of Object.entries(FINGER_CHAINS)) {
        const j = out[name] || (out[name] = [0, 0, 0]);
        const b0 = _a.subVectors(P[m], P[0]).normalize();
        const b1 = _b.subVectors(P[p1], P[m]).normalize();
        // the knuckle: how far the first bone leaves the palm's plane towards the palm
        // (+; back is −) — its turn aside is the spread, below
        j[0] = name === 'thumb' ? Math.acos(Math.max(-1, Math.min(1, b0.dot(b1)))) : Math.atan2(b1.dot(palm), b1.dot(fr.Y));
        const b2 = _c.subVectors(P[p2], P[p1]).normalize();
        j[1] = Math.acos(Math.max(-1, Math.min(1, b1.dot(b2))));
        const b3 = _a.subVectors(P[tip], P[p2]).normalize();
        j[2] = Math.acos(Math.max(-1, Math.min(1, b2.dot(b3))));
        if (name !== 'thumb') {
            // aside in the palm's plane: the first bone against the hand's straight-on line
            const s = out.spread || (out.spread = {});
            const flat = _c.copy(b1).addScaledVector(fr.Z, -b1.dot(fr.Z));
            s[name] = flat.lengthSq() > 1e-8 ? Math.atan2(flat.dot(fr.X), flat.dot(fr.Y)) : 0;
        }
    }
    return out;
}

/** A turn that brings frame A to frame B: B·Aᵀ (both as [X Y Z] columns), as a matrix. */
export function frameMatrix(fr, out = new THREE.Matrix4()) {
    return out.makeBasis(fr.X, fr.Y, fr.Z);
}
