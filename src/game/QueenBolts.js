/**
 * QueenBolts.js — the rules of the Ice Queen's far blows (pure numbers, no THREE: tests/unit/queen-bolts.test.js).
 *
 * The author: «когда Королева бьёт ледяным ударом должен быть ВИДЕН луч/снаряд, летящий от её посоха — с замахом, свечением, следом,
 * звуком; не "рисуется из ниоткуда". Траектория видна минимум 0,35 с, чтобы можно было уклониться/поставить щит; попадание считается
 * в момент прилёта; никаких попаданий сквозь стены — стена гасит снаряд (лёд крошится)».
 *
 * Every far blow of hers — the rod's freeze, the spikes, the blizzard's gust (and the shards, which were always shots) — leaves the
 * rod's crystal as something that FLIES; what it does to the target is done when it ARRIVES (a body in its way, the point it was
 * aimed at), never at the moment of the cast. The host launches it ({e:'fx', k:'bolt'}), every computer flies it the same way and
 * stops it at the same wall; the host decides the freeze, each computer its own spikes / gust (its shield, its health).
 */

export const BOLT = {
    SPEED_MIN: 24, // m/s
    SPEED_MAX: 56, // m/s (the far shot: ~40–60 — a fast bolt you still see)
    SEEN: 0.35, // s: the flight is visible at least this long (a near target: the bolt is slower)
    HIT_R: 1.5, // m: the bolt's reach round its path (+ the body's own radius)
    OVERSHOOT: 8, // m: a bolt that missed flies on this far past its mark, then fades
    GUST_SPEED: 46, // m/s: the front of the blizzard's gust
    GUST_LEN: 18, // m: how far the gust blows
    STEP: 0.5, // m: the walls are looked for this often along the flight (no tunnelling through a one-block wall)
    SPARKS: 5, // sparks of the trail per frame
};

/** How fast a bolt flies to a mark `d` m away: the whole flight is seen for SEEN s at least, and never faster than SPEED_MAX. */
export function boltSpeed(d) {
    return Math.max(BOLT.SPEED_MIN, Math.min(BOLT.SPEED_MAX, d / BOLT.SEEN));
}

/** Seconds of the flight to a mark d m away. */
export function boltFlight(d) { return d / boltSpeed(d); }

/**
 * Along the way from `o` in the unit direction `dir`, how far till the first wall (solid(x, y, z) → true), looked at every `step` m.
 * → the length to the wall (≤ len), or `len` if the way is clear. A wall in the very first metre (the rod's tip in the wall) stops it there.
 */
export function wallAlong(solid, o, dir, len, step = BOLT.STEP) {
    for (let s = step; s <= len + 1e-6; s += step) {
        if (solid(o.x + dir.x * s, o.y + dir.y * s, o.z + dir.z * s)) return Math.max(0, s - step);
    }
    return len;
}

/** The distance of a point from the segment a→b (the body in the bolt's path: it is hit when its middle is near the line it flew). */
export function segDist(a, b, p) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const L = abx * abx + aby * aby + abz * abz;
    let t = L > 1e-9 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / L : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y, dz = a.z + abz * t - p.z;
    return Math.hypot(dx, dy, dz);
}

/**
 * The gust: when its front reaches a body at `d` m along the blow (and within its cone) — seconds after the launch; Infinity: a wall
 * is nearer than the body, or it is beyond the gust's reach.
 */
export function gustArrives(d, wall) {
    if (d > BOLT.GUST_LEN || d > wall) return Infinity;
    return d / BOLT.GUST_SPEED;
}
