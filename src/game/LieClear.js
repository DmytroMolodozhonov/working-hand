/**
 * LieClear.js — a body knocked down lies stretched out along the ground, head and arms 3 m from the feet. Thrown into a
 * crater, a ditch or against a house it may lie with its head (or its legs) IN the wall: the author saw «NPC проваливаются
 * под землю» after Bombardo. The host slides such a body away from the wall — never through it — until it lies clear.
 */

/** Sample points along the body (fraction of its length) and across it (m). */
const ALONG = [0.25, 0.5, 0.75, 1], ACROSS = [0, -0.6, 0.6];

/**
 * Which way (unit x, z) the body must slide to come out of a wall, or null if it lies clear.
 * `solid(ix, iz, layer)` — is the block there solid; feet (fx, fy, fz) = the body's feet on the floor;
 * (ax, az) = unit direction from the feet to the head along the ground; len = its length (m).
 */
export function lieClearPush(solid, fx, fy, fz, ax, az, len) {
    const layer = Math.round(fy + 0.5) + 1; // (the layer just over the floor, where a lying body is)
    const n = Math.hypot(ax, az);
    if (n < 1e-6) return null;
    ax /= n; az /= n;
    let hit = 0, near = 1;
    for (const k of ALONG) for (const w of ACROSS) {
        const x = fx + ax * len * k - az * w, z = fz + az * len * k + ax * w;
        if (solid(Math.round(x), Math.round(z), layer)) { hit++; near = Math.min(near, k); }
    }
    return hit ? { x: -ax, z: -az, near } : null; // (away from the wall = back along the body: toward the feet's side)
}
