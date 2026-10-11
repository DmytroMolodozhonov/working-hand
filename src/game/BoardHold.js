/**
 * BoardHold.js — where a surfboard is when hands hold it (THREE math only).
 *
 * The board is rigid; only the hands move it:
 *  - two hands on its rails: the line between the grips follows the line between
 *    the hands; the free turn about that line is where gravity against the wrists
 *    settles it (the centre hangs low, flat palms hold it flat). It never goes
 *    through the body (pushed out in front), the ground or under the water's top.
 *  - one hand near the middle of a rail with the arm down at the side: carried
 *    UNDER THE ARM — the board on edge along the body, the hand on its lower rail,
 *    the upper rail under the armpit, the deck against the hip.
 *  - one hand elsewhere: it hangs from the hand; a long board's far end rests on
 *    the ground and drags behind.
 * Board-local frame: +X right, +Y deck normal, −Z the nose.
 */

import * as THREE from 'three';
import { SURF } from './BoardPhysics.js';

/** Half-width of the outline at local z (nose −L/2 … tail +L/2). */
export function halfWidth(z, L = SURF.L, W = SURF.W) {
    const t = Math.max(0, Math.min(1, (z + L / 2) / L));
    if (t < 0.65) { const a = (0.65 - t) / 0.65; return W / 2 * Math.sqrt(Math.max(0, 1 - a * a)); }
    const b = (t - 0.65) / 0.35;
    return W / 2 * (1 - 0.55 * b * b);
}

/** 48 outline points (x, z pairs): down the right rail from the nose, back up the left. */
export function railPoints(L = SURF.L, W = SURF.W) {
    const out = new Float32Array(96);
    for (let i = 0; i < 24; i++) {
        const z = -L / 2 + L * (i / 23);
        out[i * 2] = halfWidth(z, L, W); out[i * 2 + 1] = z;
        out[(47 - i) * 2] = -halfWidth(z, L, W); out[(47 - i) * 2 + 1] = z;
    }
    return out;
}
export const RAIL = railPoints();

/** The nearest point of the rail to a board-local point: {x, y: 0, z, d}. */
export function nearestRail(p, rail = RAIL, out = {}) {
    let best = Infinity;
    const n = rail.length / 2;
    for (let i = 0; i < n; i++) {
        const ax = rail[i * 2], az = rail[i * 2 + 1], bx = rail[((i + 1) % n) * 2], bz = rail[((i + 1) % n) * 2 + 1];
        const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((p.x - ax) * ex + (p.z - az) * ez) / l2));
        const x = ax + ex * t, z = az + ez * t;
        const d = Math.hypot(p.x - x, p.y, p.z - z);
        if (d < best) { best = d; out.x = x; out.z = z; }
    }
    out.y = 0; out.d = best;
    return out;
}

const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/** Sample points of the board (local): the rail and the centre line. */
const SAMPLES = (() => {
    const s = [];
    for (let i = 0; i < 48; i++) s.push(new THREE.Vector3(RAIL[i * 2], 0, RAIL[i * 2 + 1]));
    s.push(new THREE.Vector3(0, 0, -SURF.L / 2), new THREE.Vector3(0, 0, SURF.L / 2), new THREE.Vector3(0, 0, 0));
    return s;
})();

/**
 * Keep the board out of the body, the ground and the water (moves `pos`).
 * torso: {center, right, up, fwd (unit vectors), halfX, halfY, halfZ}
 */
function pushOut(pos, q, torso, floorY, surfaceY) {
    let push = 0, lift = 0;
    for (const s of SAMPLES) {
        const p = _e.copy(s).applyQuaternion(q).add(pos);
        if (torso) {
            const r = _d.subVectors(p, torso.center);
            const lx = r.dot(torso.right), ly = r.dot(torso.up), lz = r.dot(torso.fwd);
            if (Math.abs(lx) < torso.halfX && Math.abs(ly) < torso.halfY && lz < torso.halfZ && lz > -torso.halfZ) push = Math.max(push, torso.halfZ - lz);
        }
        const fy = floorY ? floorY(p.x, p.z) : -Infinity;
        lift = Math.max(lift, fy + SURF.T / 2 - p.y);
        const sy = surfaceY ? surfaceY(p.x, p.z) : null;
        if (sy != null) lift = Math.max(lift, sy - 0.1 - p.y); // (a board floats: it can't be pushed under)
    }
    if (push > 0 && torso) pos.addScaledVector(torso.fwd, push + 0.02);
    if (lift > 0) pos.y += lift;
    return { push, lift };
}

/**
 * Two hands on the rails.
 * @returns {{pos, quat, theta, drawA, drawB, slip}} drawA/B: where the drawn hands go; slip: 'A'|'B'|null
 */
export function solveTwoHands({ gA, gB, hA, hB, curlA = 1, curlB = 1, palmUpA = 0, palmUpB = 0, prevTheta = 0, torso = null, floorY = null, surfaceY = null }) {
    const la = _a.subVectors(gB, gA);
    const gl = la.length() || 1e-6;
    la.divideScalar(gl);
    const wa = _b.subVectors(hB, hA);
    const hl = wa.length() || 1e-6;
    wa.divideScalar(hl);
    const q1 = new THREE.Quaternion().setFromUnitVectors(la, wa);
    const gMid = _c.addVectors(gA, gB).multiplyScalar(0.5).clone();
    const hMid = new THREE.Vector3().addVectors(hA, hB).multiplyScalar(0.5);
    const kappa = 0.15 + 0.6 * Math.max(0, (palmUpA + palmUpB) / 2); // flat palms under it hold it flat
    let best = null;
    const tryTheta = (th) => {
        const q = _q2.setFromAxisAngle(wa, th).multiply(q1);
        const com = _d.copy(gMid).negate().applyQuaternion(q).add(hMid); // the centre (local 0)
        const n = _e.set(0, 1, 0).applyQuaternion(q);
        let score = com.y - kappa * n.y + 0.02 * Math.abs(th - prevTheta);
        if (torso) {
            // the body is in the way: the board turns until it clears it
            const pos = _p.copy(gMid).negate().applyQuaternion(q).add(hMid);
            let pen = 0;
            for (const s of SAMPLES) {
                const r = _d.copy(s).applyQuaternion(q).add(pos).sub(torso.center);
                const lx = r.dot(torso.right), ly = r.dot(torso.up), lz = r.dot(torso.fwd);
                if (Math.abs(lx) < torso.halfX && Math.abs(ly) < torso.halfY && Math.abs(lz) < torso.halfZ) pen += torso.halfZ - lz;
            }
            score += 4 * pen;
        }
        if (!best || score < best.score) best = { score, th, q: q.clone() };
    };
    for (let k = -6; k <= 6; k++) tryTheta(prevTheta + k * Math.PI / 18);
    for (let k = -5; k <= 5; k++) tryTheta(best.th + k * Math.PI / 180);
    const quat = best.q;
    const pos = gMid.clone().negate().applyQuaternion(quat).add(hMid);
    pushOut(pos, quat, torso, floorY, surfaceY);
    const drawA = gA.clone().applyQuaternion(quat).add(pos), drawB = gB.clone().applyQuaternion(quat).add(pos);
    const slip = Math.abs(hl - gl) > SURF.SLIP + 0.6 ? (curlA < curlB ? 'A' : 'B') : null;
    return { pos, quat, theta: best.th, drawA, drawB, slip };
}

/**
 * One hand. tuck: {out, fwd, up, hipCenter, halfX} — the body's side (outwards) when the arm hangs there:
 * the board goes under the arm. Otherwise it hangs from the hand and drags its far end on the ground.
 * @returns {{pos, quat, draw, mode: 'tuck'|'hang'}}
 */
export function solveOneHand({ g, h, tuck = null, trail = null, floorY = null, surfaceY = null, torso = null }) {
    if (tuck && Math.abs(g.z) < SURF.L * 0.28) {
        // on edge along the body: nose forward, the deck against the hip, the held rail at the bottom
        const Z = _a.copy(tuck.fwd).negate(); // local +Z (the tail) goes back
        let Y = _b.copy(tuck.out).multiplyScalar(-1); // the deck faces the body
        let X = _c.crossVectors(Y, Z);
        if ((g.x >= 0) !== (X.dot(UP) < 0)) { Y.negate(); X = _c.crossVectors(Y, Z); } // (the held rail down)
        const quat = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(X, Y, Z));
        const pos = g.clone().applyQuaternion(quat).negate().add(h);
        // the deck against the hip, never inside it
        if (tuck.hipCenter) {
            const off = _d.subVectors(pos, tuck.hipCenter).dot(tuck.out);
            const need = tuck.halfX + SURF.T / 2 + 0.04;
            if (off < need) pos.addScaledVector(tuck.out, need - off);
        }
        pushOut(pos, quat, null, floorY, surfaceY);
        return { pos, quat, draw: g.clone().applyQuaternion(quat).add(pos), mode: 'tuck' };
    }
    // hanging from the hand: the centre below the grip, or lying back to the ground
    const toFar = new THREE.Vector3(-g.x, 0, -g.z);
    const far = toFar.length() * 2 || SURF.L; // (the far end: as far again beyond the centre)
    toFar.normalize();
    const fy = floorY ? floorY(h.x, h.z) : -Infinity;
    const dy = Math.max(-1, Math.min(0, (fy + SURF.T / 2 - h.y) / far));
    const back = trail && trail.lengthSq() > 1e-6 ? _b.copy(trail).setY(0).normalize() : (torso ? _b.copy(torso.fwd).negate() : _b.set(0, 0, 1));
    const dir = _e.copy(back).multiplyScalar(Math.sqrt(Math.max(0, 1 - dy * dy))).add(_d.set(0, dy, 0)).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(toFar, dir);
    // the deck up as far as the turn allows
    const n = _a.set(0, 1, 0).applyQuaternion(quat);
    const roll = Math.atan2(-n.dot(_c.crossVectors(dir, UP).normalize()), n.y);
    if (Number.isFinite(roll) && _c.lengthSq() > 1e-6) quat.premultiply(_q.setFromAxisAngle(dir, roll));
    const pos = g.clone().applyQuaternion(quat).negate().add(h);
    pushOut(pos, quat, torso, floorY, surfaceY);
    return { pos, quat, draw: g.clone().applyQuaternion(quat).add(pos), mode: 'hang' };
}
