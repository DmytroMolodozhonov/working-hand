/**
 * Avoid.js — walking past the others instead of into them (pure, Node-testable).
 *
 * A walker looks a couple of metres ahead along its way: somebody standing or walking there (a
 * player, a mate, a creature) — it steps round them on the side with room (the right by default,
 * so two coming face to face pass each other); no room on either side (a narrow spot) — it waits
 * a moment for them to move. Used by the sailors (in their ship's frame) and the castle people.
 */

/**
 * The way to step now.
 * p: {x, z} the walker; u: {x, z} unit direction to its goal; others: [{x, z, r?}] (r: body radius);
 * opts: {r (own radius, 0.55), look (m ahead, 2.6), maxF (m: nobody beyond this counts — the goal is
 * nearer), room(x, z) → can one stand there}.
 * Returns {x, z, wait, by} (x, z: the unit direction; wait: stand still a moment; by: who is in the way).
 */
export function avoidStep(p, u, others, opts = {}) {
    const R = opts.r ?? 0.55, look = Math.min(opts.look ?? 2.6, opts.maxF ?? Infinity);
    const room = opts.room || (() => true);
    const lx = -u.z, lz = u.x; // (the walker's left)
    let best = null;
    for (const o of others) {
        const dx = o.x - p.x, dz = o.z - p.z;
        const f = dx * u.x + dz * u.z;
        if (f <= 0.05 || f > look) continue;
        const lat = dx * lx + dz * lz;
        const clear = R + (o.r ?? 0.55) + 0.25;
        if (Math.abs(lat) >= clear) continue;
        if (!best || f < best.f) best = { o, f, lat, clear };
    }
    if (!best) return { x: u.x, z: u.z, wait: false, by: null };
    const { o, lat, clear } = best;
    // (pass on the side it isn't on; straight ahead of me — keep to the right)
    const sides = lat > 0.15 ? [-1, 1] : lat < -0.15 ? [1, -1] : [-1, 1];
    for (const side of sides) {
        const bx = o.x + lx * side * clear * 1.15, bz = o.z + lz * side * clear * 1.15;
        let ax = bx - p.x, az = bz - p.z;
        const al = Math.hypot(ax, az) || 1;
        ax /= al; az /= al;
        if (!room(bx, bz) || !room(p.x + ax * 0.8, p.z + az * 0.8)) continue;
        // (not into another one standing just there)
        if (others.some((q) => q !== o && Math.hypot(q.x - bx, q.z - bz) < R + (q.r ?? 0.55))) continue;
        return { x: ax, z: az, wait: false, by: o };
    }
    return { x: u.x, z: u.z, wait: true, by: o };
}
