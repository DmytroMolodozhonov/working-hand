/**
 * Avoid.js — walking past the others instead of into them (pure, Node-testable).
 *
 * A walker looks ahead along its way (further when it is big or quick): somebody standing or
 * walking there (a player, a mate, an animal, a monster) — it sees not only where they are but
 * where they will be when it comes up to them (their `vx, vz`), and steps round them early, on the
 * side with room. Two coming face to face both keep to the right, so they pass each other instead
 * of stepping the same way. No room on either side (a narrow spot) — it waits a moment for them to
 * move (Crowd.steer then looks for another way if it stays shut). Size counts: a spider, a dragon,
 * a cart is passed with a wide berth. Used by every walker through Crowd.steer; the sailors (in
 * their ship's frame) and living trees call it directly.
 */

/**
 * The way to step now.
 * p: {x, z} the walker; u: {x, z} unit direction to its goal; others: [{x, z, r?, vx?, vz?}] (r: body
 * radius; vx, vz: how it moves, m/s); opts: {r (own radius, 0.55), speed (own m/s, 1.6), look (m ahead,
 * 2.6), maxF (m: nobody beyond this counts — the goal is nearer), room(x, z) → can one stand there}.
 * Returns {x, z, wait, by} (x, z: the unit direction; wait: stand still a moment; by: who is in the way).
 */
export function avoidStep(p, u, others, opts = {}) {
    const R = opts.r ?? 0.55;
    const sp = Math.max(0.3, opts.speed ?? 1.6);
    // (looks further for a big one in the way — computed per other below — and when going fast)
    const look0 = Math.min((opts.look ?? 2.6) + Math.max(0, sp - 2.5) * 0.5, opts.maxF ?? Infinity);
    const room = opts.room || (() => true);
    const lx = -u.z, lz = u.x; // (the walker's left)
    let best = null;
    for (const o of others) {
        const or = o.r ?? 0.55;
        const dx = o.x - p.x, dz = o.z - p.z;
        const ovx = o.vx || 0, ovz = o.vz || 0;
        const clear = R + or + 0.25 + Math.min(0.6, or * 0.15); // (a big one: a wider berth)
        const look = Math.min(look0 + or * 0.8, opts.maxF ?? Infinity); // (one standing at its goal or past it: not in its way)
        // where will it be when I'm nearest to it (each going on as now; not further ahead than I look)
        const wx = ovx - u.x * sp, wz = ovz - u.z * sp; // (its way relative to mine)
        const w2 = wx * wx + wz * wz;
        let t = w2 > 1e-4 ? -(dx * wx + dz * wz) / w2 : 0;
        t = Math.max(0, Math.min(t, look / sp));
        const fx = dx + ovx * t, fz = dz + ovz * t; // (its place then, from where I stand now)
        const f = fx * u.x + fz * u.z;
        const fNow = dx * u.x + dz * u.z;
        // (already overlapping: only one in front of me matters — the one behind gets out itself)
        if (Math.max(f, fNow) <= 0.05 || Math.min(f, fNow) > look) continue;
        if (f <= 0.05 && Math.hypot(dx, dz) > R + or) continue;
        const lat = fx * lx + fz * lz;
        if (Math.abs(lat) >= clear) continue;
        const toward = (ovx * u.x + ovz * u.z) < -0.35 * sp; // (coming at me)
        const fk = Math.max(0.05, f);
        if (!best || fk < best.f) best = { o, f: fk, lat, clear, fx, fz, toward };
    }
    if (!best) return keepOff(p, u.x, u.z, u, others, R, null, room);
    const { o, lat, clear, fx, fz, toward } = best;
    // (pass on the side it isn't on; straight ahead of me, or coming at me — keep to the right,
    // as it does too: so the two pass, not both step the same way)
    const right = -1;
    const sides = toward && Math.abs(lat) < clear * 0.8 ? [right, -right]
        : lat > 0.15 ? [-1, 1] : lat < -0.15 ? [1, -1] : [right, -right];
    for (const side of sides) {
        const bx = p.x + fx + lx * side * clear * 1.15, bz = p.z + fz + lz * side * clear * 1.15;
        let ax = bx - p.x, az = bz - p.z;
        const al = Math.hypot(ax, az) || 1;
        ax /= al; az /= al;
        if (ax * u.x + az * u.z < -0.2) continue; // (not back the way it came)
        // (room on that side: the first steps and the way past it; the very spot beside it only when
        // the goal is further than it — a goal at its side, by a rail or a wall, is reached past it)
        const goalBeside = (opts.maxF ?? Infinity) < best.f + clear;
        if ((!goalBeside && !room(bx, bz)) || !room(p.x + ax * 0.8, p.z + az * 0.8) || !room(p.x + ax * Math.min(al, 1.4), p.z + az * Math.min(al, 1.4))) continue;
        // (not into another one standing just there, nor across another just beside my way)
        if (others.some((q) => q !== o && (Math.hypot(q.x - bx, q.z - bz) < R + (q.r ?? 0.55)
            || crosses(p, ax, az, Math.min(al, 1.6), q, R)))) continue;
        return keepOff(p, ax, az, u, others, R, o, room);
    }
    // a moving one already passing / going my way and nowhere to step aside: just slow behind it
    return { x: u.x, z: u.z, wait: true, by: o };
}

/**
 * Passing close by a big one (a cow, a cart, the spider, a dragon — beside it, just past it): lean
 * away from it so the shoulder doesn't brush it — it is given its room all the way past, not only
 * while it is ahead (where there's room for that).
 */
function keepOff(p, x, z, u, others, R, by, room) {
    let ox = 0, oz = 0;
    for (const q of others) {
        const qr = q.r ?? 0.55;
        if (qr < 0.95 || q.thing) continue; // (a thing: its walls stop one; a man's size: brushing past is fine — only a big body is given its room)
        const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz);
        const want = R + qr + 0.25 + Math.min(0.6, qr * 0.15);
        if (d >= want || d < 1e-3) continue;
        if ((-dx * x - dz * z) < -qr) continue; // (well behind me already)
        const k = (want - d) / want;
        ox += dx / d * k * 1.5; oz += dz / d * k * 1.5;
    }
    if (!ox && !oz) return { x, z, wait: false, by };
    let nx = x + ox, nz = z + oz;
    // (never back the way it came because of it: at most straight sideways)
    const back = nx * u.x + nz * u.z;
    if (back < 0) { nx -= back * u.x; nz -= back * u.z; }
    const l = Math.hypot(nx, nz);
    if (l < 1e-3 || !room(p.x + nx / l * 0.8, p.z + nz / l * 0.8)) return { x, z, wait: false, by };
    return { x: nx / l, z: nz / l, wait: false, by };
}

/** Does a step of `len` m from p along (ax, az) go into `q` (its body)? */
function crosses(p, ax, az, len, q, R) {
    const qx = q.x - p.x, qz = q.z - p.z;
    const f = qx * ax + qz * az;
    if (f < 0.1 || f > len) return false;
    return Math.abs(qx * -az + qz * ax) < R + (q.r ?? 0.55);
}
