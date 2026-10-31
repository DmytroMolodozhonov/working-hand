/**
 * ScrollNet.js — a scroll opened in someone's hands, as the others see it (pure numbers, no THREE).
 *
 * Their computer tells the pose `sc: [hand, width]` (≤ ~10 times a second, only
 * while the scroll is open): `hand` — the second hand holding the other roller
 * (1 left, 2 right; the first fist is the one the scroll is held in, they know it from «ihold»),
 * `width` — how far the parchment is unrolled in hundredths of a metre (it is the hands' distance,
 * or the shrinking width while it rolls itself back). No text goes over the net: every computer
 * draws the same face from the item (kind, colours, ribbon) itself.
 */

export const NET = { MIN_MS: 100, STEP: 0.02, W_MIN: 0.12, W_MAX: 2.2 };

/** [hand, width in cm] or null. */
export function encode(otherSide, w) {
    if (otherSide !== 'left' && otherSide !== 'right') return null;
    const x = Number.isFinite(w) ? Math.max(NET.W_MIN, Math.min(NET.W_MAX, w)) : NET.W_MIN;
    return [otherSide === 'left' ? 1 : 2, Math.round(x * 100)];
}

/** → { other: 'left'|'right', w } or null for anything broken (a message from the net is never trusted). */
export function decode(st) {
    if (!Array.isArray(st) || st.length < 2) return null;
    const h = st[0] | 0, c = +st[1];
    if ((h !== 1 && h !== 2) || !Number.isFinite(c)) return null;
    return { other: h === 1 ? 'left' : 'right', w: Math.max(NET.W_MIN, Math.min(NET.W_MAX, c / 100)) };
}

/**
 * Rate limiter: the value to put in EVERY pose while the scroll is open (absent pose field = closed),
 * changed no more often than MIN_MS and only by a visible step.
 */
export class Throttle {
    constructor() { this.t = -1e9; this.last = null; }
    value(st, now) {
        if (!st) { this.last = null; this.t = -1e9; return undefined; }
        const l = this.last;
        if (!l) { this.last = st; this.t = now; return st; }
        const moved = l[0] !== st[0] || Math.abs(l[1] - st[1]) >= NET.STEP * 100;
        if (moved && now - this.t >= NET.MIN_MS) { this.last = st; this.t = now; }
        return this.last;
    }
}
