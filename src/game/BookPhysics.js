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

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
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
 * @param {number} w  a half's width (spine → outer edge), world units
 * @returns {{pos: THREE.Vector3, quat: THREE.Quaternion, phi: number, d: number}}
 *   pos: the spine (the book's origin); quat: X from the left hand to the right one,
 *   Z towards the reader; phi: how far it is open (0 closed … π flat).
 */
export function frameFromHands(pL, pR, eye, w, out = {}) {
    const X = _a.subVectors(pR, pL);
    const d = X.length();
    const mid = _b.addVectors(pL, pR).multiplyScalar(0.5);
    const n = _c.subVectors(eye, mid);
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
    n.normalize();
    if (d < 1e-4) X.copy(viewRight(eye, mid, X)); else X.divideScalar(d);
    // Z: towards the reader, square to the line between the hands
    const Z = n.addScaledVector(X, -n.dot(X));
    if (Z.lengthSq() < 1e-6) Z.set(0, 1, 0).cross(X);
    Z.normalize();
    const Y = new THREE.Vector3().crossVectors(Z, X);
    const phi = 2 * Math.asin(Math.min(1, d / (2 * w)));
    out.phi = phi;
    out.d = d;
    out.pos = (out.pos || new THREE.Vector3()).copy(mid).addScaledVector(Z, -w * Math.cos(phi / 2));
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
        this.gap = 0; // at the catch the finger may be a little above the page: closed slowly
        this.landed = null;
        this._lastF = null;
    }

    /** The finger is under the sheet's edge at angle fBeta (or null: it let go). */
    touch(fBeta, dt) {
        if (fBeta == null) { this.finger = null; this._lastF = null; return; }
        if (this.finger == null) this.gap = this.dir > 0 ? Math.max(0, fBeta - this.beta) : Math.max(0, this.beta - fBeta);
        else this.gap = Math.max(0, this.gap - dt * 1.2);
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
