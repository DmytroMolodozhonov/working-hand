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
    CHANCE: 0.5, // per cave cell (90 m): a system starts there (was 0.28: «caves are really rare» — the author; the old ones stay, new ones join them)
    // more caves, their mouths in the side of a hill or a mountain («caves in the hills too, half as many
    // again» — the author): the cells past CHANCE, this many more of them, where a hillside rises (hillMouth)
    HILL_CHANCE: 0.5,
    APRON: 4.2, // m round a mouth: bare stone and scree, not grass (seen from afar)
    MIN_SPAWN: 150, // m: no mouth nearer the spawn (the creative test cave aside)
    KEEP_SPAWN: 80, // m: a natural cave never reaches the spawn's ground
    STEP: 3, // m per tunnel segment
    R_MIN: 2.9, R_MAX: 4.1, // tunnel radius (6–8 m wide and as high; now and then wider)
    FLOOR_MIN: -12.5, // the lowest a tunnel's middle goes (bedrock at −17)
    JAG: 0.3, // how ragged the rock is (a part of the radius, by 3D noise)
    ROOF: 2, // layers of ground always left over a tunnel (but at the mouth)
    // how high (the author: «the ceilings higher» — the tunnels ~35 % higher, the halls too):
    UP: 0.31, // a tunnel's roof: r / √UP over its middle (was 0.8 — 1.12 r; its floor, 0.79 r under it, as it was)
    WALL: 5, // layers a chamber is high at its wall (was 4)
    HALL: 1.35, // its middle: this much higher than it was (c.h)
    ROOM: 4, // layers of air always over a chamber's mounds (was 3: lower than the hero)
    REACH: 150, // m a system may reach from its cell
    MAIN_CHEST: 0.45, CHAMBER_CHEST: 0.06, // chances of a chest (4 times fewer than there were)
};

const TAU = Math.PI * 2;

/** Integer lattice hash → [−1, 1). */
function hash3(x, y, z, seed) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(seed | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967296) * 2 - 1;
}

/** Smooth 3D value noise in [−1, 1] (ragged rock, patches of earth and gravel). */
export function noise3(x, y, z, seed = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fx = x - xi, fy = y - yi, fz = z - zi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    const l = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
    return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

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
    const s = { id, test, segs: [], chambers: [], chests: [], start, seed: Math.floor(rng() * 1e9) };
    let branches = test ? 5 : 2 + Math.floor(rng() * 3);
    const deepest = { y: Infinity, at: null };

    const chamber = (x, y, z, end, big = false) => {
        const r = big ? 13 + rng() * 6 : (end ? 7 : 5.5) + rng() * (test ? 5.5 : 4.5); // (a dead end opens into a bigger one)
        const F = Math.round(y - 2.9);
        const roof = Math.min(H(Math.round(x), Math.round(z)) - CAVES.ROOF - F, big ? 13 + Math.round(rng() * 4) : 7 + Math.round(rng() * 4));
        if (roof < (big ? 10 : 6)) return null; // (too near the ground above)
        // (none under water or a village: the rock there is never carved — its chest would sit in stone)
        // (rings of points no more than 3 m apart: even a narrow river is caught)
        const R = Math.max(r, end ? 8 : 0) * 1.35 + 1;
        if (blocked(x, z)) return null;
        for (const q of [R * 0.4, R * 0.75, R]) {
            const n = Math.ceil((TAU * q) / 3);
            for (let k = 0; k < n; k++) if (blocked(x + Math.cos((k / n) * TAU) * q, z + Math.sin((k / n) * TAU) * q)) return null;
        }
        // (its wall wobbles: a ragged hall, not a drum — the main chamber stays round for its crystals)
        const c = { x, z, F, r, h: roof, end, from: null, w1: 0.12 + rng() * 0.1, p1: rng() * TAU, w2: 0.06 + rng() * 0.06, p2: rng() * TAU };
        s.chambers.push(c);
        return c;
    };

    const worm = (x, y, z, yaw, steps, goal, open, entryPitch, r0 = 0, minL = undefined) => {
        let last = null, r = r0 || CAVES.R_MIN + rng() * (CAVES.R_MAX - CAVES.R_MIN), wide = 0;
        for (let i = 0; i < steps; i++) {
            yaw += (rng() - 0.5) * 0.55 + (rng() < 0.08 ? (rng() - 0.5) * 1.8 : 0);
            r = Math.max(CAVES.R_MIN, Math.min(CAVES.R_MAX, r + (rng() - 0.5) * 0.4));
            if (rng() < 0.07) wide = 1.2 + rng(); // (now and then a wider stretch)
            wide *= 0.75;
            const pitch = open > 0 ? entryPitch : y > goal + 1.5 ? -0.3 - rng() * 0.22 : (rng() - 0.5) * 0.25;
            const nx = x + Math.cos(pitch) * Math.cos(yaw) * CAVES.STEP;
            const nz = z + Math.cos(pitch) * Math.sin(yaw) * CAVES.STEP;
            let ny = y + Math.sin(pitch) * CAVES.STEP;
            if (open <= 0) {
                if (blocked(nx, nz)) break; // (a dead end before the water / the village)
                ny = Math.min(ny, H(Math.round(nx), Math.round(nz)) - CAVES.ROOF - r); // (never opens the ground above)
            }
            ny = Math.max(ny, CAVES.FLOOR_MIN + r);
            s.segs.push({ ax: x, ay: y, az: z, bx: nx, by: ny, bz: nz, r: r + wide, open: open > 0, minL: open > 0 ? minL : undefined });
            last = { x: nx, y: ny, z: nz, px: x, pz: z };
            x = nx; y = ny; z = nz;
            open--;
            if (y < deepest.y) { deepest.y = y; deepest.at = last; }
            const far = Math.hypot(x - start.x, z - start.z) > 20;
            if (far && rng() < (test ? 0.12 : 0.06)) { const c = chamber(x, y, z, false); if (c) c.from = { x: last.px, z: last.pz }; }
            if (far && branches > 0 && i > 3 && rng() < 0.08) {
                branches--;
                const turn = (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 0.9);
                worm(x, y, z, yaw + turn, 12 + Math.floor(rng() * 22), goal + (rng() - 0.5) * 6, 0, 0);
            }
        }
        // the end: a dead end, often a chamber (where the rock allows: a step or two back from the water)
        if (last && (rng() < 0.6 || test)) {
            const mine = s.segs.length - 1;
            for (let b = 0; b < 4 && mine - b >= 0; b++) {
                const g = s.segs[mine - b];
                const c = chamber(g.bx, g.by, g.bz, true);
                if (c) { c.from = { x: g.ax, z: g.az }; break; }
            }
        }
        return last;
    };

    const goal = CAVES.FLOOR_MIN + 2 + rng() * 6;
    const r0 = CAVES.R_MIN + 0.4 + rng() * 0.6;
    const y0 = start.ground + 0.79 * r0 + 0.5; // (its floor on the ground at the mouth)
    // (a mouth in a hillside: its floor level with the ground outside — no ditch dug out into the meadow)
    const minL = start.pitch > -0.2 ? Math.round(start.ground) + 1 : undefined;
    const end = worm(start.x, y0, start.z, start.yaw, test ? 70 : 38 + Math.floor(rng() * 22), goal, start.open ?? 3, start.pitch, r0, minL);
    // a great hall deep down (the test cave always; others now and then)
    if (test || rng() < 0.35) {
        const deep = s.segs.filter((g) => g.by < goal + 3 && Math.hypot(g.bx - start.x, g.bz - start.z) > 30);
        for (let t = 0; t < 8 && deep.length; t++) {
            const g = deep[Math.floor(rng() * deep.length)];
            if (chamber(g.bx, g.by, g.bz, false, true)) break;
        }
    }
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
    main.r = Math.max(main.r, 8); // (room to walk round its chest — and its crystals, if any)
    main.w1 = main.w2 = 0; // (round: its crystals grow out of its wall)
    // (a higher chamber over its middle would make a ledge where its chest stands: none there)
    s.chambers = s.chambers.filter((c) => c === main || c.F <= main.F || Math.hypot(c.x - main.x, c.z - main.z) > chamberReach(c) + 3.5);
    // a chest's spot: flat floor all under it — no higher chamber's floor reaching over it
    const clear = (c, x, z) => s.chambers.every((o) => o === c || o.F <= c.F || Math.hypot(o.x - x, o.z - z) > chamberReach(o) + 3.5);
    s.kx = Math.round(main.x); s.kz = Math.round(main.z); s.F = main.F; s.r = Math.floor(main.r);
    s.ex = Math.round(main.from ? main.from.x : main.x + 1); s.ez = Math.round(main.from ? main.from.z : main.z);
    // chests are rare: the main chamber holds one about every other cave, another chamber now and
    // then (the creative test cave: always, and more — to try things out)
    if (test || rng() < CAVES.MAIN_CHEST) s.chests.push({ x: s.kx + 0.5, y: main.F, z: s.kz + 0.5, a: Math.atan2(s.ex - s.kx, s.ez - s.kz), main: true });
    for (const c of s.chambers) {
        if (c === main || s.chests.length >= (test ? 4 : 2)) continue;
        if (Math.hypot(c.x - start.x, c.z - start.z) < 25 || rng() > (test ? 0.8 : CAVES.CHAMBER_CHEST)) continue;
        // (a chest is 3.6 × 2.4 m: well clear of the ragged wall, its front towards the hall)
        const a = rng() * TAU, d = rng() * Math.max(0, c.r * (1 - c.w1 - c.w2 - 0.08) - 3.4);
        const x = Math.round(c.x + Math.cos(a) * d), z = Math.round(c.z + Math.sin(a) * d);
        const ch = { x: x + 0.5, y: c.F, z: z + 0.5, a: d > 1 ? Math.atan2(c.x - x, c.z - z) : rng() * TAU };
        if (s.chests.some((o) => Math.hypot(o.x - ch.x, o.z - ch.z) < 6) || !clear(c, ch.x, ch.z)) continue; // (not two side by side where chambers meet)
        s.chests.push(ch); // (the floor stays flat under it, see carveColumn)
    }
    // bounds
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const g of s.segs) {
        const r = g.r * (1 + CAVES.JAG);
        x0 = Math.min(x0, g.ax - r, g.bx - r); x1 = Math.max(x1, g.ax + r, g.bx + r);
        z0 = Math.min(z0, g.az - r, g.bz - r); z1 = Math.max(z1, g.az + r, g.bz + r);
    }
    for (const c of s.chambers) { const r = chamberReach(c); x0 = Math.min(x0, c.x - r); x1 = Math.max(x1, c.x + r); z0 = Math.min(z0, c.z - r); z1 = Math.max(z1, c.z + r); }
    Object.assign(s, { x0, x1, z0, z1 });
    return s;
}

/** The lowest layer a system may carve in a column for its chambers' floors to stay whole (−∞: any). */
export function chamberFloor(s, x, z) {
    let keep = -Infinity;
    if (x < s.x0 - 1 || x > s.x1 + 1 || z < s.z0 - 1 || z > s.z1 + 1) return keep;
    for (const c of s.chambers) if (Math.hypot(x - c.x, z - c.z) <= chamberReach(c)) keep = Math.max(keep, c.F + 1);
    return keep;
}

/** The farthest a chamber's ragged wall reaches from its middle. */
const chamberReach = (c) => c.r * (1 + (c.w1 || 0) + (c.w2 || 0) + (c.w1 ? 0.08 : 0));

/** The parts of a system reaching into a box (a chunk): the same system, fewer parts to look at. */
export function systemIn(s, x0, z0, x1, z1) {
    const segs = s.segs.filter((g) => { const r = g.r * (1 + CAVES.JAG); return Math.max(g.ax, g.bx) + r >= x0 && Math.min(g.ax, g.bx) - r <= x1 && Math.max(g.az, g.bz) + r >= z0 && Math.min(g.az, g.bz) - r <= z1; });
    const chambers = s.chambers.filter((c) => { const r = chamberReach(c); return c.x + r >= x0 && c.x - r <= x1 && c.z + r >= z0 && c.z - r <= z1; });
    return { ...s, segs, chambers, x0: Math.max(s.x0, x0 - 1), x1: Math.min(s.x1, x1 + 1), z0: Math.max(s.z0, z0 - 1), z1: Math.min(s.z1, z1 + 1), all: s.chambers };
}

/** The mouth of a natural system in a cave cell: in a hillside if there is one (facing into it). null: none here. */
export function caveMouth(rng, gx, gz, cell, H, blocked) {
    for (let t = 0; t < 10; t++) {
        const x = gx * cell + 10 + rng() * (cell - 20), z = gz * cell + 10 + rng() * (cell - 20);
        if (Math.hypot(x, z) < CAVES.MIN_SPAWN || blocked(x, z)) continue;
        const ix = Math.round(x), iz = Math.round(z);
        const h = H(ix, iz);
        const sx = H(ix + 4, iz) - H(ix - 4, iz), sz = H(ix, iz + 4) - H(ix, iz - 4);
        if (Math.hypot(sx, sz) >= 2) return { x, ground: h, z, yaw: Math.atan2(sz, sx), pitch: -0.12, open: 3 }; // into the hill
        return { x, ground: h - 0.6, z, yaw: rng() * TAU, pitch: -0.5, open: 3 }; // a sloping hole down
    }
    return null;
}

/**
 * The mouth of a hill cave: in the side of a hill or a mountain that rises steeply (a dark opening
 * in the slope, walked into level — a short cutting, then the tunnel goes on under the rock).
 * The steepest of a few spots in the cell; null: no such hillside there.
 */
export function hillMouth(rng, gx, gz, cell, H, blocked) {
    let best = null;
    for (let t = 0; t < 30; t++) {
        const x = gx * cell + 10 + rng() * (cell - 20), z = gz * cell + 10 + rng() * (cell - 20);
        if (Math.hypot(x, z) < CAVES.MIN_SPAWN || blocked(x, z)) continue;
        const ix = Math.round(x), iz = Math.round(z);
        const h = H(ix, iz);
        const sx = H(ix + 4, iz) - H(ix - 4, iz), sz = H(ix, iz + 4) - H(ix, iz - 4), sl = Math.hypot(sx, sz);
        if (sl < 2) continue;
        const ux = sx / sl, uz = sz / sl;
        // (the hill goes on rising into it: rock enough over the tunnel a few steps in)
        const rise = Math.min(H(Math.round(x + ux * 8), Math.round(z + uz * 8)), H(Math.round(x + ux * 14), Math.round(z + uz * 14))) - h;
        if (rise < 5 || blocked(x + ux * 14, z + uz * 14)) continue;
        if (!best || sl > best.sl) best = { x, z, ground: h, yaw: Math.atan2(uz, ux), sl };
    }
    return best && { x: best.x, ground: best.ground, z: best.z, yaw: best.yaw, pitch: -0.05, open: 2 };
}

/**
 * Which layers of a column a system carves: calls `out(L0, L1, open)` for each carved run.
 * (TerrainData clips them to the column and keeps a roof unless `open`.) `floorKeep`: the lowest
 * layer it may carve — another system's chamber floor here stays whole (see chamberFloor).
 */
export function carveColumn(s, x, z, out, floorKeep = -Infinity) {
    if (x < s.x0 - 1 || x > s.x1 + 1 || z < s.z0 - 1 || z > s.z1 + 1) return;
    // a chamber's floor stays whole (a tunnel passing under it does not break through)
    let own = -Infinity;
    for (const c of s.chambers) if (Math.hypot(x - c.x, z - c.z) <= chamberReach(c)) own = Math.max(own, c.F + 1);
    const clip = (keep) => (keep === -Infinity ? out : (a, b, open, extra) => { if (b >= keep) out(Math.max(a, keep), b, open, extra); });
    const put = clip(Math.max(own, floorKeep)), room = clip(own); // (tunnels keep any system's floors; chambers their own)
    for (const g of s.segs) {
        const r = g.r, R = r * (1 + CAVES.JAG);
        if (x < Math.min(g.ax, g.bx) - R || x > Math.max(g.ax, g.bx) + R || z < Math.min(g.az, g.bz) - R || z > Math.max(g.az, g.bz) + R) continue;
        const up = g.open || s.lair ? 0.8 : CAVES.UP; // (the mouth as it was: the hillside over it untouched; a dragons' lair is its own)
        const lo = Math.max(Math.floor(Math.min(g.ay, g.by) - R), g.minL ?? -Infinity), hi = Math.ceil(Math.max(g.ay, g.by) + Math.max(R * 1.15, R / Math.sqrt(up) + 0.5));
        const dx = g.bx - g.ax, dy = g.by - g.ay, dz = g.bz - g.az, len2 = dx * dx + dy * dy + dz * dz || 1;
        let a = null, e = null;
        for (let L = lo; L <= hi + 1; L++) {
            let inside = false, was = false;
            if (L <= hi) {
                const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (L - g.ay) * dy + (z - g.az) * dz) / len2));
                const px = g.ax + dx * t - x, py = g.ay + dy * t - L, pz = g.az + dz * t - z;
                // (an oval: the floor walkable — 0.79 r under its middle; the roof high over the head —
                // CAVES.UP, it was 0.8; ragged by noise — looked up only near the rock's face)
                const h2 = px * px + pz * pz;
                const d2 = h2 + (py > 0 ? py * py * 1.6 : py * py * up), d1 = py > 0 ? d2 : h2 + py * py * 0.8;
                const lo = r * (1 - CAVES.JAG), hi = r * (1 + CAVES.JAG);
                let rr = 0;
                const within = (q) => q <= lo * lo || (q < hi * hi && q <= (rr || (rr = r * (1 + CAVES.JAG * noise3(x / 3.3, L / 3.3, z / 3.3, s.seed)))) ** 2);
                inside = within(d2); was = within(d1);
            }
            // (what it carved before: as it was; the higher roof over it — `extra`: TerrainData carves
            // it only where rock stays over it, never into another cave's mouth or the open air)
            if (was && a === null) a = L;
            if (!was && a !== null) { put(a, L - 1, g.open); a = null; }
            const more = inside && !was;
            if (more && e === null) e = L;
            if (!more && e !== null) { put(e, L - 1, g.open, true); e = null; }
        }
    }
    for (const c of s.chambers) {
        const d = Math.hypot(x - c.x, z - c.z);
        const a = Math.atan2(z - c.z, x - c.x);
        const R = c.r * (1 + (c.w1 || 0) * Math.sin(3 * a + (c.p1 || 0)) + (c.w2 || 0) * Math.sin(7 * a + (c.p2 || 0)) + (c.w1 ? 0.08 * noise3(x / 2.5, c.F, z / 2.5, s.seed) : 0));
        if (d > R) continue;
        // a dome, WALL high at its wall; its roof ragged (hanging rock); its floor uneven — mounds of
        // rock, rising to the wall, always with room to walk over them (the main chamber's and the
        // floor under a chest stay flat). Its roof never comes through the ground above (ROOF).
        const k = 1 - (d * d) / (R * R), n = 1.6 * noise3(x / 3, c.F + 7, z / 3, s.seed + 1);
        const was = c.F + Math.max(4, Math.round(4 + (c.h - 4) * k + n)); // (its roof as it was)
        const W = s.lair ? 4 : CAVES.WALL, h = s.lair ? c.h : c.h * CAVES.HALL;
        const top = Math.max(was, c.F + Math.max(W, Math.round(W + (h - W) * k + n)));
        let floor = c.F + 1;
        if (c.w1 && !s.chests.some((ch) => Math.hypot(x - ch.x, z - ch.z) < 3.2)) {
            floor += Math.max(0, Math.min(top - c.F - (s.lair ? 3 : CAVES.ROOM), Math.round(1.8 * noise3(x / 3.5, c.F - 5, z / 3.5, s.seed + 2) + 2 * (d / R) ** 3 - 0.4)));
        }
        if (floor <= was) room(floor, was, false); // (a higher chamber's floor stays whole over it: a ledge)
        if (top > was) room(Math.max(floor, was + 1), top, false, true); // (higher — where rock stays over it)
    }
}
