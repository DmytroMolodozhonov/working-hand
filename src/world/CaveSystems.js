/**
 * CaveSystems.js — caves as in Minecraft (generation 4 worlds): a mouth in a hillside (or a
 * sloping hole in flat ground), then tunnels that wind and go deep down, branch off, end in
 * dead ends, and open into chambers now and then — big enough to get lost in. Chests lie in
 * the chambers (the deepest dead-end chamber always has one, others now and then).
 *
 * Pure and deterministic (Node-testable, no THREE): the same seed gives the same caves on
 * every computer. TerrainData carves them chunk by chunk (see carveColumn).
 *
 * A system: {id, segs: [{ax, ay, az, bx, by, bz, r, open}], chambers: [{x, z, F, r, h}],
 * chests: [{x, y, z, a}], x0, x1, z0, z1 (its bounds), and — for the old single-chamber
 * API (chests, crystals) — kx, kz, F, r (its main chamber), ex, ez (where the tunnel comes in)}.
 */

export const CAVES = {
    CHANCE: 0.28, // per cave cell (90 m): a system starts there
    MIN_SPAWN: 150, // m: no mouth nearer the spawn (the creative test cave aside)
    KEEP_SPAWN: 80, // m: a natural cave never reaches the spawn's ground
    STEP: 3, // m per tunnel segment
    R_MIN: 1.7, R_MAX: 2.3, // tunnel radius
    FLOOR_MIN: -13, // the lowest a tunnel's middle goes (bedrock at −17)
    ROOF: 2, // layers of ground always left over a tunnel (but at the mouth)
    REACH: 150, // m a system may reach from its cell
};

const TAU = Math.PI * 2;

/**
 * Grow a cave system from its mouth.
 * @param {object} o
 * @param {string} o.id
 * @param {() => number} o.rng
 * @param {{x:number, y:number, z:number, yaw:number, pitch:number}} o.start  the mouth (y: the tunnel's middle)
 * @param {(x:number, z:number) => number} o.H  the ground's top layer at a column
 * @param {(x:number, z:number) => boolean} o.blocked  no cave here (water, a village…)
 * @param {boolean} [o.test]  the creative test cave (more branches, always chests)
 */
export function growCaveSystem({ id, rng, start, H, blocked, test = false }) {
    const s = { id, test, segs: [], chambers: [], chests: [], start };
    let branches = test ? 5 : 2 + Math.floor(rng() * 3);
    const deepest = { y: Infinity, at: null };

    const chamber = (x, y, z, end) => {
        const r = (end ? 5 : 3.5) + rng() * (test ? 3.5 : 3); // (a dead end opens into a bigger one)
        const F = Math.round(y - 1.8);
        const roof = Math.min(H(Math.round(x), Math.round(z)) - CAVES.ROOF - F, 5 + Math.round(rng() * 2));
        if (roof < 5) return null; // (too near the ground above)
        const c = { x, z, F, r, h: roof, end, from: null };
        s.chambers.push(c);
        return c;
    };

    const worm = (x, y, z, yaw, steps, goal, open, entryPitch) => {
        let last = null, r = CAVES.R_MIN + rng() * (CAVES.R_MAX - CAVES.R_MIN);
        for (let i = 0; i < steps; i++) {
            yaw += (rng() - 0.5) * 0.55 + (rng() < 0.08 ? (rng() - 0.5) * 1.8 : 0);
            r = Math.max(CAVES.R_MIN, Math.min(CAVES.R_MAX, r + (rng() - 0.5) * 0.3));
            const pitch = open > 0 ? entryPitch : y > goal + 1.5 ? -0.3 - rng() * 0.22 : (rng() - 0.5) * 0.25;
            const nx = x + Math.cos(pitch) * Math.cos(yaw) * CAVES.STEP;
            const nz = z + Math.cos(pitch) * Math.sin(yaw) * CAVES.STEP;
            let ny = y + Math.sin(pitch) * CAVES.STEP;
            if (open <= 0) {
                if (blocked(nx, nz)) break; // (a dead end before the water / the village)
                ny = Math.min(ny, H(Math.round(nx), Math.round(nz)) - CAVES.ROOF - r); // (never opens the ground above)
            }
            ny = Math.max(ny, CAVES.FLOOR_MIN + r);
            s.segs.push({ ax: x, ay: y, az: z, bx: nx, by: ny, bz: nz, r, open: open > 0 });
            last = { x: nx, y: ny, z: nz, px: x, pz: z };
            x = nx; y = ny; z = nz;
            open--;
            if (y < deepest.y) { deepest.y = y; deepest.at = last; }
            const far = Math.hypot(x - start.x, z - start.z) > 20;
            if (far && rng() < 0.06) { const c = chamber(x, y, z, false); if (c) c.from = { x: last.px, z: last.pz }; }
            if (far && branches > 0 && i > 3 && rng() < 0.08) {
                branches--;
                const turn = (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 0.9);
                worm(x, y, z, yaw + turn, 12 + Math.floor(rng() * 22), goal + (rng() - 0.5) * 6, 0, 0);
            }
        }
        // the end: a dead end, often a chamber
        if (last && (rng() < 0.6 || test)) { const c = chamber(last.x, last.y, last.z, true); if (c) c.from = { x: last.px, z: last.pz }; }
        return last;
    };

    const goal = CAVES.FLOOR_MIN + 2 + rng() * 6;
    const end = worm(start.x, start.y, start.z, start.yaw, test ? 60 : 38 + Math.floor(rng() * 22), goal, 5, start.pitch);
    // more branches from the main tunnel if it had none to give (a cave you can get lost in)
    for (let k = 0; branches > 0 && k < 3 && s.segs.length > 12; k++) {
        const g = s.segs[6 + Math.floor(rng() * (s.segs.length - 6))];
        branches--;
        worm(g.bx, g.by, g.bz, rng() * TAU, 12 + Math.floor(rng() * 20), goal + (rng() - 0.5) * 6, 0, 0);
    }
    if (s.segs.length < (test ? 1 : 18)) return null; // (a stub stopped by the water nearby: no cave)
    // the main chamber: the deepest dead end (a chest, maybe crystals)
    let main = s.chambers.filter((c) => c.end).sort((a, b) => a.F - b.F)[0] || s.chambers.slice().sort((a, b) => a.F - b.F)[0];
    if (!main && end) { main = chamber(end.x, end.y, end.z, true); if (main) main.from = { x: end.px, z: end.pz }; }
    if (!main) return null;
    main.r = Math.max(main.r, 6); // (room to walk round its chest — and its crystals, if any)
    s.kx = Math.round(main.x); s.kz = Math.round(main.z); s.F = main.F; s.r = Math.floor(main.r);
    s.ex = Math.round(main.from ? main.from.x : main.x + 1); s.ez = Math.round(main.from ? main.from.z : main.z);
    // chests: the main chamber's, and in other chambers away from the mouth now and then
    s.chests.push({ x: s.kx + 0.5, y: main.F, z: s.kz + 0.5, a: Math.atan2(s.ex - s.kx, s.ez - s.kz) });
    for (const c of s.chambers) {
        if (c === main || s.chests.length >= 4) continue;
        if (Math.hypot(c.x - start.x, c.z - start.z) < 25 || rng() > (test ? 0.8 : 0.5)) continue;
        const a = rng() * TAU, d = rng() * Math.max(0, c.r - 2);
        s.chests.push({ x: Math.round(c.x + Math.cos(a) * d) + 0.5, y: c.F, z: Math.round(c.z + Math.sin(a) * d) + 0.5, a: rng() * TAU });
    }
    // bounds
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const g of s.segs) {
        x0 = Math.min(x0, g.ax - g.r, g.bx - g.r); x1 = Math.max(x1, g.ax + g.r, g.bx + g.r);
        z0 = Math.min(z0, g.az - g.r, g.bz - g.r); z1 = Math.max(z1, g.az + g.r, g.bz + g.r);
    }
    for (const c of s.chambers) { x0 = Math.min(x0, c.x - c.r); x1 = Math.max(x1, c.x + c.r); z0 = Math.min(z0, c.z - c.r); z1 = Math.max(z1, c.z + c.r); }
    Object.assign(s, { x0, x1, z0, z1 });
    return s;
}

/** The mouth of a natural system in a cave cell: in a hillside if there is one (facing into it). null: none here. */
export function caveMouth(rng, gx, gz, cell, H, blocked) {
    for (let t = 0; t < 10; t++) {
        const x = gx * cell + 10 + rng() * (cell - 20), z = gz * cell + 10 + rng() * (cell - 20);
        if (Math.hypot(x, z) < CAVES.MIN_SPAWN || blocked(x, z)) continue;
        const ix = Math.round(x), iz = Math.round(z);
        const h = H(ix, iz);
        const sx = H(ix + 4, iz) - H(ix - 4, iz), sz = H(ix, iz + 4) - H(ix, iz - 4);
        // (y: the tunnel's middle — its floor then lies on the ground at the mouth)
        if (Math.hypot(sx, sz) >= 2) return { x, y: h + 2, z, yaw: Math.atan2(sz, sx), pitch: -0.12 }; // into the hill
        return { x, y: h + 1.6, z, yaw: rng() * TAU, pitch: -0.5 }; // a sloping hole down
    }
    return null;
}

/**
 * Which layers of a column a system carves: calls `out(L0, L1, open)` for each carved run.
 * (TerrainData clips them to the column and keeps a roof unless `open`.)
 */
export function carveColumn(s, x, z, out) {
    if (x < s.x0 - 1 || x > s.x1 + 1 || z < s.z0 - 1 || z > s.z1 + 1) return;
    // a chamber's floor stays whole (a tunnel passing under it does not break through)
    let keep = -Infinity;
    for (const c of s.chambers) if (Math.hypot(x - c.x, z - c.z) <= c.r) keep = Math.max(keep, c.F + 1);
    const put = keep === -Infinity ? out : (a, b, open) => { if (b >= keep) out(Math.max(a, keep), b, open); };
    for (const g of s.segs) {
        const r = g.r;
        if (x < Math.min(g.ax, g.bx) - r || x > Math.max(g.ax, g.bx) + r || z < Math.min(g.az, g.bz) - r || z > Math.max(g.az, g.bz) + r) continue;
        const lo = Math.floor(Math.min(g.ay, g.by) - r), hi = Math.ceil(Math.max(g.ay, g.by) + r);
        const dx = g.bx - g.ax, dy = g.by - g.ay, dz = g.bz - g.az, len2 = dx * dx + dy * dy + dz * dz || 1;
        let a = null;
        for (let L = lo; L <= hi + 1; L++) {
            let inside = false;
            if (L <= hi) {
                const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (L - g.ay) * dy + (z - g.az) * dz) / len2));
                const px = g.ax + dx * t - x, py = g.ay + dy * t - L, pz = g.az + dz * t - z;
                // (a little flatter than round: the floor walkable, the roof a little higher)
                inside = px * px + pz * pz + (py > 0 ? py * py * 1.6 : py * py * 0.8) <= r * r;
            }
            if (inside && a === null) a = L;
            if (!inside && a !== null) { put(a, L - 1, g.open); a = null; }
        }
    }
    for (const c of s.chambers) {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d > c.r) continue;
        out(c.F + 1, c.F + Math.max(3, Math.round(3 + (c.h - 3) * (1 - (d * d) / (c.r * c.r)))), false); // (a dome, 3 high at its wall)
    }
}
