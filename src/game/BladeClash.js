/**
 * BladeClash.js — blade against blade (players fighting with swords / axes).
 *
 * Two blades never pass through each other: my blade is stopped on the other
 * one (and my hand with it), metal rings, sparks fly. Only a much stronger
 * blow (a fast swing, a heavier weapon) beats the other blade aside and goes
 * on to wound. Every computer stops its own player's blade, so the block is
 * the same for both fighters.
 *
 * Pure geometry here (arrays [x,y,z]) so it can be tested without a browser.
 */

import { segmentSegmentDistSq } from '../core/math.js';

export const BLADE_RADIUS = 0.09; // two blade half-thicknesses + a little air
export const OVERPOWER_RATIO = 1.8; // this much stronger to beat the other blade aside
export const OVERPOWER_MIN_SPEED = 9; // m/s at the tip

const _st = [0, 0];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : null; };

/**
 * Contact of my blade (a0→a1) with another blade (b0→b1).
 * `lastN` — the side my blade was on last frame (unit vector from the other
 * blade to mine), so a fast swing that jumped across the other blade within
 * one frame is still caught and put back on its own side.
 * @returns {{touch:boolean, n:number[]|null, depth:number, point:number[], d:number}}
 */
export function bladeContact(a0, a1, b0, b1, lastN = null, R = BLADE_RADIUS) {
    const d = Math.sqrt(segmentSegmentDistSq(a0, a1, b0, b1, _st));
    const pa = lerp3(a0, a1, _st[0]), pb = lerp3(b0, b1, _st[1]);
    const point = lerp3(pa, pb, 0.5);
    const rel = sub3(pa, pb);
    const interior = _st[0] > 0.02 && _st[0] < 0.98 && _st[1] > 0.02 && _st[1] < 0.98;
    if (lastN) {
        const along = dot3(rel, lastN);
        // crossed over (the closest points are inside both blades, my side flipped)
        if (along < R && (d < R || (interior && d < 0.4))) return { touch: true, n: lastN, depth: R - along, point, d };
    } else if (d < R) {
        const n = norm3(rel) || norm3(cross3(sub3(a1, a0), sub3(b1, b0))) || [0, 1, 0];
        return { touch: true, n, depth: R - d, point, d };
    }
    return { touch: false, n: norm3(rel), depth: 0, point, d };
}

/** How hard a blade pushes: tip speed, heavier weapons a bit more. */
export function bladePower(speed, mass = 1) {
    return speed * Math.sqrt(Math.max(0.3, mass));
}

/** My blow beats the other blade aside. */
export function overpowers(myPower, mySpeed, otherPower) {
    return mySpeed > OVERPOWER_MIN_SPEED && myPower > OVERPOWER_RATIO * Math.max(0.5, otherPower);
}
