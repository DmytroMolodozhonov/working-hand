/**
 * Slow.js — «Даст» (Dust): sand in the eyes and the joints slows any creature
 * down for a while. Every creature (zombies, animals, villagers, knights…)
 * keeps `slowT` (seconds left); the player's own is in Combat.slowLeft.
 */

export const SLOW = {
    TIME: 5, // s
    SCALE: 0.4, // speed while slowed
};

/** How fast this creature may move now (1 = normal). */
export function slowFactor(o) {
    return o && o.slowT > 0 ? SLOW.SCALE : 1;
}

/** Time passes: the sand falls off. */
export function tickSlow(o, dt) {
    if (o && o.slowT > 0) o.slowT = Math.max(0, o.slowT - dt);
}
