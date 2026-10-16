/**
 * BookPhysics.js — the book in the hands as a real thing (pure maths, no scene).
 *
 * Two halves on a hinge (the spine). Held by both hands at the outer edges of the
 * halves, the book is as open as the hands are apart: a hinge with two rigid
 * halves of width w whose free edges are d apart is open at φ = 2·asin(d / 2w).
 * Its pages look at the reader.
 *
 * A page is a sheet hinged at the spine. Its angle β about the spine goes from
 * βR = π/2 − φ/2 (lying on the right half) to βL = π/2 + φ/2 (on the left half).
 * Left alone it falls to the side it leans to (past the middle — over; before it —
 * back). A fingertip under its edge lifts it: the sheet rests on the finger (it
 * can't go through it) and follows it; once over the top it falls on by itself.
 */

import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** The reader's right in the view from `eye` to `at` (horizontal). */
export function viewRight(eye, at, out = new THREE.Vector3()) {
    const f = _a.subVectors(at, eye);
    out.set(-f.z, 0, f.x); // forward × up
    if (out.lengthSq() < 1e-8) out.set(1, 0, 0);
    return out.normalize();
}

/**
 * The book held by both hands at the outer edges of its halves.
 * @param {THREE.Vector3} pL  the grip of the hand on the reader's left
 * @param {THREE.Vector3} pR  the grip of the hand on the reader's right
 * @param {THREE.Vector3} eye  where the reader looks from
 * @param {number} w  a half's width (its hinge → its outer edge), world units
 * @param {object} [opts]
 *   Y: which way the hands hold the spine (the edges lie along their fingers; unit, the
 *      sign as before) — tilting the hands tilts the book; null / along the line between
 *      the hands: upright to the eye.
 *   gy: how high along the edges the hands hold them (the book's own y, world units: − lower).
 *   t: how far each half's hinge is from the middle of the spine (world units).
 * @returns {{pos: THREE.Vector3, quat: THREE.Quaternion, phi: number, d: number}}
 *   pos: the spine (the book's origin); quat: X from the left hand to the right one,
 *   Z towards the reader; phi: how far it is open (0 closed … π flat).
 */
export function frameFromHands(pL, pR, eye, w, out = {}, opts = {}) {
    const X = _a.subVectors(pR, pL);
    const d = X.length();
    const mid = _b.addVectors(pL, pR).multiplyScalar(0.5);
    const n = _c.subVectors(eye, mid);
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
    n.normalize();
    if (d < 1e-4) X.copy(viewRight(eye, mid, X)); else X.divideScalar(d);
    // upright to the eye: Z towards the reader, square to the line between the hands
    const Z = n.addScaledVector(X, -n.dot(X));
    if (Z.lengthSq() < 1e-6) Z.set(0, 1, 0).cross(X);
    Z.normalize();
    const Y = (out.Y || (out.Y = new THREE.Vector3())).crossVectors(Z, X);
    // the hands' own way: the spine along their fingers (square to the line between them);
    // the less they say (fingers along that line), the more it is upright to the eye
    if (opts.Y) {
        const yh = _d.copy(opts.Y).addScaledVector(X, -opts.Y.dot(X));
        const m = yh.length();
        Y.multiplyScalar(Math.max(0, 0.5 - m)).add(yh);
        Y.addScaledVector(X, -Y.dot(X));
        if (Y.lengthSq() < 1e-8) Y.crossVectors(Z, X);
        Y.normalize();
        Z.crossVectors(X, Y);
    }
    const t = opts.t || 0, gy = opts.gy || 0;
    const phi = openFor(d, w, t);
    out.phi = phi;
    out.d = d;
    out.pos = (out.pos || new THREE.Vector3()).copy(mid).addScaledVector(Z, -w * Math.cos(phi / 2)).addScaledVector(Y, -gy);
    out.quat = (out.quat || new THREE.Quaternion()).setFromRotationMatrix(_m.makeBasis(X, Y, Z));
    return out;
}

/** The outer edge of a half (at height gy) in the book's own frame (world units, as frameFromHands). */
export function edgeInBook(half, phi, w, gy = 0, t = 0, out = new THREE.Vector3()) {
    const sx = half === 'left' ? -1 : 1;
    return out.set(sx * (t + w * Math.sin(phi / 2)), gy, w * Math.cos(phi / 2));
}

/** A half's turn in the world: the book's turned about its spine (as BookModel.setBookAngle). */
export function halfQuat(bookQuat, half, phi, out = new THREE.Quaternion()) {
    const a = Math.PI / 2 - phi / 2;
    return out.setFromAxisAngle(_d.set(0, 1, 0), half === 'left' ? a : -a).premultiply(bookQuat);
}

/**
 * The book from one half held rigidly in a hand: that half's turn and where its outer
 * edge is (at height gy); the other half is wherever φ puts it.
 */
export function bookFromHalf(edge, hq, half, phi, w, gy = 0, t = 0, out = {}) {
    const a = Math.PI / 2 - phi / 2;
    out.quat = (out.quat || new THREE.Quaternion()).setFromAxisAngle(_d.set(0, 1, 0), half === 'left' ? -a : a).premultiply(hq);
    out.pos = (out.pos || new THREE.Vector3()).copy(edge).sub(edgeInBook(half, phi, w, gy, t, _c).applyQuaternion(out.quat));
    out.phi = phi;
    return out;
}

/** The book from one half held rigidly: that half's turn (hq) and where its hinge is (world). */
export function bookFromHinge(hinge, hq, half, phi, t = 0, out = {}) {
    const a = Math.PI / 2 - phi / 2;
    out.quat = (out.quat || new THREE.Quaternion()).setFromAxisAngle(_d.set(0, 1, 0), half === 'left' ? -a : a).premultiply(hq);
    out.pos = (out.pos || new THREE.Vector3()).copy(hinge).sub(_c.set(half === 'left' ? -t : t, 0, 0).applyQuaternion(out.quat));
    out.phi = phi;
    return out;
}

/** How far a book is open (φ) whose halves' outer edges are d apart (halves w wide, hinges t from the middle). */
export function openFor(d, w, t = 0) {
    return 2 * Math.asin(Math.max(0, Math.min(1, (d / 2 - t) / w)));
}

/**
 * An open book lying on an open palm (palm up): the spine along the palm (Y: wrist →
 * fingers), the pages away from the palm (F: where the palm looks), the back of the
 * spine on the palm's face (`lift` from P).
 */
export function frameOnPalm(P, Yp, F, lift, out = {}) {
    const Z = _a.copy(F).normalize();
    const Y = _b.copy(Yp).addScaledVector(Z, -Yp.dot(Z));
    if (Y.lengthSq() < 1e-8) Y.set(0, 0, 1).addScaledVector(Z, -Z.z);
    Y.normalize();
    const X = _c.crossVectors(Y, Z);
    out.pos = (out.pos || new THREE.Vector3()).copy(P).addScaledVector(Z, lift);
    out.quat = (out.quat || new THREE.Quaternion()).setFromRotationMatrix(_m.makeBasis(X, Y, Z));
    return out;
}

/**
 * The book held by one hand at the outer edge of one half (the other hand is free).
 * @param {THREE.Vector3} grip  the holding hand
 * @param {'left'|'right'} half  which half that hand holds (as the reader sees it)
 * @param {number} phi  how far it is open
 */
export function frameFromOneHand(grip, half, phi, eye, w, out = {}) {
    const X = viewRight(eye, grip, _a);
    const n = _c.subVectors(eye, grip);
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
    const Z = n.addScaledVector(X, -n.dot(X)).normalize();
    const Y = new THREE.Vector3().crossVectors(Z, X);
    const s = half === 'left' ? -1 : 1;
    out.phi = phi;
    // the held edge is at ±w·sin(φ/2) along X and w·cos(φ/2) towards the reader from the spine
    out.pos = (out.pos || new THREE.Vector3()).copy(grip).addScaledVector(X, -s * w * Math.sin(phi / 2)).addScaledVector(Z, -w * Math.cos(phi / 2));
    out.quat = (out.quat || new THREE.Quaternion()).setFromRotationMatrix(_m.makeBasis(X, Y, Z));
    return out;
}

/** The limits of a page's angle for a book open at φ. */
export function pageLimits(phi) {
    return { bR: Math.PI / 2 - phi / 2, bL: Math.PI / 2 + phi / 2 };
}

export const SHEET = {
    K: 22, // rad/s²: how hard a page falls to the side it leans to
    DAMP: 2.5, // 1/s
    FLICK: 9, // rad/s at most from a flick of the finger
};

/**
 * One page on its way over the spine. `dir` +1: lifted from the right half (forward),
 * −1: from the left half (back). step() returns 'left' / 'right' when it lands.
 */
export class PageSheet {
    constructor(dir, phi) {
        const { bR, bL } = pageLimits(phi);
        this.dir = dir;
        this.beta = dir > 0 ? bR : bL;
        this.omega = 0;
        this.finger = null; // the finger's angle the sheet rests on (null: let go)
        this.gap = 0; // at the catch the finger may be a little above the page: it lifts it from there
        this.landed = null;
        this._lastF = null;
    }

    /** The finger is under the sheet's edge at angle fBeta (or null: it let go). */
    touch(fBeta, dt) {
        if (fBeta == null) { this.finger = null; this._lastF = null; return; }
        // (the gap closes only when the finger itself comes down onto the page: a page never
        // rises by itself to a finger hovering over it)
        const g = this.dir > 0 ? Math.max(0, fBeta - this.beta) : Math.max(0, this.beta - fBeta);
        this.gap = this.finger == null ? g : Math.min(this.gap, g);
        // how fast the finger moves round the spine (for a flick)
        if (this._lastF != null && dt > 0) this.fingerOmega = (fBeta - this._lastF) / dt;
        this._lastF = fBeta;
        this.finger = fBeta;
    }

    step(dt, phi) {
        const { bR, bL } = pageLimits(phi);
        if (this.landed) return this.landed;
        // left alone it falls to the side it leans to
        this.omega += -SHEET.K * Math.cos(this.beta) * dt;
        this.omega *= Math.max(0, 1 - SHEET.DAMP * dt);
        this.beta += this.omega * dt;
        // the finger holds it up from under its edge (it can't go through the finger)
        if (this.finger != null) {
            const f = this.dir > 0 ? this.finger - this.gap : this.finger + this.gap;
            const fo = Math.max(-SHEET.FLICK, Math.min(SHEET.FLICK, this.fingerOmega || 0));
            if (this.dir > 0 && this.beta < f) { this.beta = f; this.omega = Math.max(this.omega, fo, 0); }
            if (this.dir < 0 && this.beta > f) { this.beta = f; this.omega = Math.min(this.omega, fo, 0); }
        }
        if (this.beta <= bR) { this.beta = bR; this.omega = 0; if (this.finger == null || this.dir < 0) this.landed = 'right'; }
        else if (this.beta >= bL) { this.beta = bL; this.omega = 0; if (this.finger == null || this.dir > 0) this.landed = 'left'; }
        return this.landed;
    }

    /** 0 on the right half … 1 on the left one. */
    progress(phi) {
        const { bR, bL } = pageLimits(phi);
        return bL - bR > 1e-4 ? (this.beta - bR) / (bL - bR) : 0;
    }
}

/**
 * The bend of a moving page: its free part lags behind (paper is soft), never
 * into the pages it lies on. Returns the angle the far edge lags by (rad).
 */
export function sheetLag(sheet, phi) {
    const { bR, bL } = pageLimits(phi);
    let lag = Math.max(-0.5, Math.min(0.5, (sheet.omega || 0) * 0.07));
    lag = Math.min(lag, sheet.beta - bR); // (not into the right pages)
    lag = Math.max(lag, sheet.beta - bL); // (nor into the left ones)
    return lag;
}
