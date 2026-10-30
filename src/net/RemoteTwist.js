/**
 * RemoteTwist.js — angles of another player's body, always the short way round.
 * The body (and so the legs) and the head come as separate angles; a human neck turns about ±120° from the chest, no more.
 * An angle that is stepped without wrapping at ±π spins the long way, and a body left behind by the head
 * showed the friend's legs «back to front» on a screen.
 */

export const TWIST = {
    MAX: 2.1, // rad (120°): the head turns this far from the chest; past it the body (and legs) follow
    LOG_GAP: 10, // s between two «legs back» lines per avatar
};

const TAU = Math.PI * 2;

/** An angle brought into [−π, π]. */
export function wrapPi(a) {
    if (!Number.isFinite(a)) return 0;
    a %= TAU;
    if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU;
    return a;
}

/** `cur` a part k of the way to `target`, along the short arc. */
export function stepAngle(cur, target, k) {
    return cur + wrapPi(target - cur) * k;
}

/**
 * The head's turn from the chest `head` and the body's turn `body` (both rotation.y): how much the body must turn
 * to bring the neck back inside its limit (0 when it is), and the head's turn after that.
 */
export function neckLimit(head, max = TWIST.MAX) {
    const t = wrapPi(head);
    const over = Math.abs(t) - max;
    if (over <= 0) return { turn: 0, head: t };
    const sign = t < 0 ? -1 : 1;
    return { turn: sign * over, head: sign * max };
}
