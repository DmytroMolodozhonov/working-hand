/**
 * Pilot.js — how a creature on foot chooses its way among the others (pure, Node-testable; the walking brain of every walker).
 *
 * The author: «хождение — постоянные проблемы: рыцари скапливаются возле меня, текстуры накладываются друг на друга, в узком проходе
 * башни все застревают… нужен очень умный алгоритм: обходы, никаких прикосновений».
 *
 * Why the old one (Avoid.js) failed: it looked at one other body ahead and stepped aside by a rule; two in a narrow place waited for each
 * other by timers (the tests: 170 s of standing in a corridor); bodies of a man's size were allowed to «brush»; nothing kept two apart once
 * they overlapped. What this does (the research: time-to-collision pedestrian models — Reciprocal Velocity Obstacles / ORCA (UNC GAMMA),
 * Karamouzas' predictive model; deadlocks in tight passages are what pure reactive avoidance cannot solve — they need a RIGHT OF WAY:
 * Cooperative-ORCA*, ORCA-MAPF, «situation agents» for narrow passages):
 *
 *   1. VELOCITY SAMPLING with time-to-collision (`choose`). Every step it tries ~45 velocities (15 headings round the wanted way × 3 speeds and
 *      «stand») and asks, for each: how soon would it hit each near body if both went on as now (a walking one is assumed to give way a little
 *      too — reciprocity; a standing one does not), does the wall allow it (the world's `room(x, z)` probed along the heading, shoulders too),
 *      how far is it from the way it wants and from the way it went the last step (no jitter), and — two met face to face — the RIGHT is
 *      preferred, so they pass instead of mirroring each other. A step into a body is never chosen while any other choice exists.
 *   2. RIGHT OF WAY IN A NARROW PLACE. Two heading at each other where the space between them is too narrow to pass (`narrowBetween`: the
 *      width of the walkable ground is measured sideways along the line between them) — this is seen BEFORE they meet: the one of lower priority
 *      (those on an order of the king first, then a fixed order by name) goes back along its own trail (the places it came by were free) to the
 *      nearest PASSING PLACE (a spot with room to stand aside), steps aside and holds until the other has passed. Those behind it, seeing it back
 *      out, do the same (a queue backs out like a train); the winner never waits. So a passage with traffic both ways is used by one stream at a time.
 *   3. QUEUES form by themselves: behind a slower one the speed matches (the time-to-collision with the leader is long only when slow).
 *   4. WHAT IS LEFT: a standing body in the way is asked to step aside (Crowd.askWay); stuck ~6 s — a squeeze past (smaller body); ~10 s —
 *      it is set on the nearest free place (`unstick`, the journal says so). A permanent stand is not possible.
 *   5. `separate(p, r, others)` — the hard guarantee under all of it: bodies never stay inside each other.
 *
 * `pilot(st, p, u, others, opts)` → { x, z, k } (the unit way and the share of full speed) or null (stand this step) or { unstick: {x, z} }.
 */

export const PILOT = {
    HORIZON: 3.0, // s: how far ahead a collision counts
    HARD: 0.5, // s: a collision sooner than this is not accepted while any other choice exists
    MARGIN: 0.14, // m: the clearance wanted between two bodies on top of their radii
    RANGE: 6, // m: others farther than this are not looked at
    CONFLICT: 11, // m: a head-on pair this near with no room to pass is a conflict
    NARROW: 2.4, // m: ground narrower than this (centre to centre of the walls) is a one-way place: a stream goes one way at a time
    LOCK_RANGE: 16, // m: how far the oncoming are looked for when a narrow place is ahead
    WAIT: 0.9, // s of not moving before yielding is thought of
    SQUEEZE: 6, // s: stuck so long — squeezes past (smaller body)
    UNSTICK: 10, // s: stuck so long — set on a free place
    SPEEDS: [1, 0.6, 0.3],
    ANGLES: [0, 14, -14, 28, -28, 45, -45, 65, -65, 90, -90, 120, -120, 160, -160],
};

const DEG = Math.PI / 180;
const ROT = PILOT.ANGLES.map((a) => ({ c: Math.cos(a * DEG), s: Math.sin(a * DEG), a }));
const BINS = 16;

const hashId = (id) => {
    if (typeof id === 'number') return Math.abs(id) % 1000003;
    const s = String(id ?? '');
    let h = 7;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 1000003;
};

/** The walker's own memory (fresh). */
export function newPilotState() {
    return {
        vx: 0, vz: 0, k: 1, lx: NaN, lz: NaN, still: 0, trail: [], trailX: NaN, trailZ: NaN, blocker: null,
        unstuck: 0, squeeze: 0, probe: null, probeAt: -9, plan: null, yielding: false, clear: 0, conflictT: 0, clock: 0, lockHold: false, nw: null,
    };
}

/** The time (≥ 0) a point with relative position d=(dx,dz) and relative velocity w meets the circle of radius R round the origin; Infinity: never. */
function ttc(dx, dz, wx, wz, R) {
    const c = dx * dx + dz * dz - R * R;
    const a = wx * wx + wz * wz;
    const b = dx * wx + dz * wz;
    if (c <= 0) return b > 0 ? 0 : Infinity; // (already inside: bad only while closing)
    if (a < 1e-6 || b <= 0) return Infinity;
    const disc = b * b - a * c;
    if (disc < 0) return Infinity;
    return (b - Math.sqrt(disc)) / a;
}

/** How far one can go along each of BINS headings (m): 0.5 / 0.9 / 1.4 (or 0). Cached a moment: the wall oracle is not free. */
function probeWalls(st, p, room, clock, r) {
    if (st.probe && clock - st.probeAt < 0.1 && Math.abs(p.x - st.probeX) < 0.2 && Math.abs(p.z - st.probeZ) < 0.2) return st.probe;
    const out = st.probe || (st.probe = new Float32Array(BINS));
    const side = Math.min(0.3, r * 0.6); // (the shoulder: the wall oracle is for a centre point — the walls of the world are blocks)
    for (let i = 0; i < BINS; i++) {
        const a = (i / BINS) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
        let free = 0;
        for (const L of [0.5, 0.9, 1.4]) {
            if (!room(p.x + dx * L, p.z + dz * L)) break;
            if (!room(p.x + dx * L - dz * side, p.z + dz * L + dx * side) || !room(p.x + dx * L + dz * side, p.z + dz * L - dx * side)) break;
            free = L;
        }
        out[i] = free;
    }
    st.probeAt = clock; st.probeX = p.x; st.probeZ = p.z;
    return out;
}

const binOf = (x, z) => ((Math.round(Math.atan2(z, x) / (Math.PI * 2) * BINS) % BINS) + BINS) % BINS;

/** The free width of the ground at (x, z) across the direction (ax, az): { left, right } (m to the wall each side, up to 2.4). */
export function spanAt(x, z, ax, az, room) {
    const lx = -az, lz = ax;
    let left = 0, right = 0;
    for (let s = 0.4; s <= 2.4; s += 0.4) { if (!room(x + lx * s, z + lz * s)) break; left = s; }
    for (let s = 0.4; s <= 2.4; s += 0.4) { if (!room(x - lx * s, z - lz * s)) break; right = s; }
    return { left, right, width: left + right };
}

/**
 * The narrow place straight ahead (a passage, a doorway, a stair): { mouth: m to where it begins, end: m to where it ends (as far as seen) } or null.
 * Looked at every 0.8 m for 8 m, while the way ahead is open; cached a moment.
 */
function narrowAhead(st, p, u, room) {
    const c = st.nw;
    if (c && st.clock - c.at < 0.35 && Math.abs(p.x - c.x) < 0.3 && Math.abs(p.z - c.z) < 0.3) return c.v;
    let mouth = null, end = null;
    for (let s = 0.8; s <= 8; s += 0.8) {
        const x = p.x + u.x * s, z = p.z + u.z * s;
        if (!room(x, z)) break;
        const w = spanAt(x, z, u.x, u.z, room).width;
        if (w < PILOT.NARROW) { if (mouth === null) mouth = s; end = s; } else if (mouth !== null) break;
    }
    const v = mouth === null ? null : { mouth, end };
    st.nw = { at: st.clock, x: p.x, z: p.z, v };
    return v;
}

/**
 * The right of way at a one-way place: do I wait outside it? Yes while a stream comes the other way through it (or is about to enter it) and
 * I am not already inside. The waiting is at 2–3.4 m from the mouth, so the ones coming out have room. → true: hold.
 */
function lockHold(st, p, u, near, me, speed, room) {
    const nw = narrowAhead(st, p, u, room);
    if (!nw || nw.mouth > 3.4) return false;
    const here = spanAt(p.x, p.z, u.x, u.z, room).width;
    if (here < PILOT.NARROW) return false; // (already inside: a conflict inside is the backing plan's)
    for (const n of near) {
        const f = n.dx * u.x + n.dz * u.z;
        if (f < nw.mouth - 0.6 || f > PILOT.LOCK_RANGE) continue;
        if (Math.abs(n.dx * -u.z + n.dz * u.x) > 1.6) continue;
        const toward = (n.ovx * u.x + n.ovz * u.z) < -0.3 * speed;
        const waits = n.o.pilot?.lockHold;
        if (!toward && !(waits && false)) continue;
        // (it is coming through: wait. If it is waiting too — facing me at the other mouth — the one of higher priority goes)
        return true;
    }
    for (const n of near) {
        if (!n.o.pilot?.lockHold) continue; // (both waiting at the two ends: the higher priority goes first)
        const f = n.dx * u.x + n.dz * u.z;
        if (f < nw.mouth || f > PILOT.LOCK_RANGE || Math.abs(n.dx * -u.z + n.dz * u.x) > 1.6) continue;
        const theirs = hashId(n.o.id ?? n.o.ref?.id) + (n.o.rank || 0) * 1e6;
        if (theirs > me) return true;
    }
    return false;
}

/**
 * Is the ground between p and q too narrow for the two bodies to pass (centres must be ≥ need apart across the way)? → the narrowest width (m) or Infinity.
 * (Looked at every 0.9 m along the line; the width across the line.)
 */
function narrowestBetween(p, q, room) {
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.5) return Infinity;
    const ax = dx / d, az = dz / d;
    let w = Infinity;
    for (let s = 0.6; s < d; s += 0.9) {
        const sp = spanAt(p.x + ax * s, p.z + az * s, ax, az, room);
        if (sp.width < w) w = sp.width;
    }
    return w;
}

/**
 * p: {x, z}; u: unit way to the goal; others: [{x, z, r, vx, vz, still?, ref?, id?, pilot?, rank?}] (the near ones); opts:
 * { r (own radius), speed (m/s), dt, maxF (m to the goal), room(x, z), id, rank (0…3: more = goes first), clock (s), askWay(o, p, u) }.
 */
export function pilot(st, p, u, others, opts) {
    const dt = opts.dt ?? 1 / 60;
    st.clock = opts.clock ?? (st.clock + dt);
    st.id = opts.id;
    const r = opts.r ?? 0.55;
    const speed = Math.max(0.3, opts.speed ?? 1.6);
    const room = opts.room || (() => true);
    const maxF = opts.maxF ?? Infinity;
    const me = hashId(opts.id) + (opts.rank || 0) * 1e6;
    // --- the near ones that matter
    const near = [];
    for (const o of others) {
        const or = o.r ?? 0.55;
        const dx = o.x - p.x, dz = o.z - p.z;
        const d2 = dx * dx + dz * dz, lim = PILOT.LOCK_RANGE + or;
        if (d2 > lim * lim) continue;
        const f = dx * u.x + dz * u.z;
        if (f > maxF + or + r + 0.4 && d2 > (r + or + 0.6) * (r + or + 0.6)) continue; // (beyond the goal: not in the way)
        const ovx = o.vx || 0, ovz = o.vz || 0;
        near.push({ o, dx, dz, d: Math.sqrt(d2), or, ovx, ovz, still: o.still ?? (ovx * ovx + ovz * ovz < 0.04), R: r + or + PILOT.MARGIN, close: d2 < (PILOT.RANGE + or) * (PILOT.RANGE + or), far: d2 > (PILOT.CONFLICT + or) * (PILOT.CONFLICT + or) });
    }
    // --- trail of crumbs (for backing out)
    if (!Number.isFinite(st.trailX) || Math.hypot(p.x - st.trailX, p.z - st.trailZ) > 0.9) {
        st.trail.push({ x: p.x, z: p.z });
        if (st.trail.length > 14) st.trail.shift();
        st.trailX = p.x; st.trailZ = p.z;
    }
    // --- how far it really moved (a stall detector independent of what the pilot meant)
    const moved = Number.isFinite(st.lx) ? Math.hypot(p.x - st.lx, p.z - st.lz) : speed * dt;
    st.lx = p.x; st.lz = p.z;
    const trying = maxF > 0.6 || st.plan;
    if (moved < speed * dt * 0.25 && trying) st.still += dt; else st.still = Math.max(0, st.still - dt * 2);
    st.unstuck = Math.max(0, st.unstuck - dt);
    // --- no one near: go (the common case — costs nothing)
    if (!near.length && !st.plan) {
        st.vx = u.x * speed; st.vz = u.z * speed; st.k = 1; st.blocker = null; st.squeeze = 0; st.yielding = false;
        return { x: u.x, z: u.z, k: 1 };
    }
    // --- the right of way at a narrow place (wait outside while a stream comes the other way through it)
    st.lockHold = false;
    if (!st.plan && maxF > 2.5 && lockHold(st, p, u, near, me, speed, room)) {
        st.lockHold = true; st.vx = 0; st.vz = 0; st.still = Math.max(0, st.still - dt * 3);
        // (it does not stand in the mouth: closer than 2 m it backs a step)
        const nw = narrowAhead(st, p, u, room);
        if (nw && nw.mouth < 1.8) return { x: -u.x, z: -u.z, k: 0.4, back: true };
        return null;
    }
    // --- a conflict in a narrow place: who gives way (seen before they meet)
    if (!st.plan) {
        const c = conflictOf(st, p, u, near, me, speed, room, r);
        if (c) st.plan = makePlan(st, p, u, c, room, r, near);
    }
    // --- a plan: back to a passing place, step aside, hold until the other has passed
    if (st.plan) {
        const out = runPlan(st, p, u, near, speed, room, r, opts, dt);
        if (out !== undefined) return out;
    }
    st.yielding = false;
    // --- the choice
    const res = choose(st, p, u, maxF, near, speed, room, r, opts, dt);
    if (res.best && !res.hard) {
        const sp = Math.hypot(res.best.vx, res.best.vz);
        st.vx = res.best.vx; st.vz = res.best.vz;
        const kWant = sp / speed;
        st.k = kWant < st.k ? kWant : st.k + (kWant - st.k) * Math.min(1, dt * 6);
        if (st.still < 0.3) st.squeeze = Math.max(0, st.squeeze - dt);
        if (res.blocker) st.blocker = res.blocker.o;
        if (st.still > PILOT.WAIT) {
            const s = stalled(st, p, u, near, res.blocker || nearestAhead(near, u), me, opts, room, r);
            if (s !== undefined) return s;
        }
        return { x: res.best.vx / sp, z: res.best.vz / sp, k: Math.max(0.25, Math.min(1, st.k)) };
    }
    // standing, or the only ways are hard: wait, and think of yielding
    st.vx = 0; st.vz = 0;
    if (res.blocker) st.blocker = res.blocker.o;
    const s = stalled(st, p, u, near, res.blocker || nearestAhead(near, u), me, opts, room, r);
    return s === undefined ? null : s;
}

/** The velocity sampling: { best: {vx, vz} | null (stand), hard, blocker }. */
function choose(st, p, u, maxF, near, speed, room, r, opts, dt) {
    const walls = probeWalls(st, p, room, st.clock, r);
    const vpx = u.x * speed, vpz = u.z * speed;
    const squeeze = st.squeeze > 0;
    let best = null, bestCost = Infinity, bestHard = true, blockerNow = null;
    const lastA = Math.atan2(st.vz, st.vx), lastMoving = st.vx * st.vx + st.vz * st.vz > 0.04;
    const nCand = ROT.length * PILOT.SPEEDS.length + 1;
    const close = near.filter((n) => n.close);
    const slowDown = maxF < 1.6 ? Math.max(0.35, maxF / 1.6) : 1; // (arriving: slower)
    for (let ci = 0; ci < nCand; ci++) {
        let vx, vz, rot = null;
        if (ci === nCand - 1) { vx = 0; vz = 0; }
        else {
            rot = ROT[ci % ROT.length];
            const f = PILOT.SPEEDS[(ci / ROT.length) | 0] * slowDown;
            const dx = u.x * rot.c - u.z * rot.s, dz = u.x * rot.s + u.z * rot.c;
            vx = dx * speed * f; vz = dz * speed * f;
        }
        let cost = 1.2 * Math.hypot(vx - vpx, vz - vpz) / speed;
        if (rot) {
            const len = Math.hypot(vx, vz), dxn = vx / len, dzn = vz / len;
            const free = walls[binOf(dxn, dzn)];
            const need = Math.min(0.9, len * 0.7 + 0.35);
            if (free < need) continue;
            if (free < 1.4) cost += (1 - free / 1.4) * 0.45;
            if (rot.a !== 0 && (dxn * u.x + dzn * u.z) < 0) cost += 0.7;
        }
        let hard = false, worst = null;
        const R0 = squeeze ? 0.8 : 1;
        for (let i = 0; i < close.length; i++) {
            const n = close[i];
            const R = n.R * R0;
            const t = ttc(n.dx, n.dz, vx - n.ovx, vz - n.ovz, R);
            if (t >= PILOT.HORIZON) continue;
            const w = n.still ? 1 : 0.7;
            const q = 1 - t / PILOT.HORIZON;
            cost += w * q * q * 4;
            if (t < PILOT.HARD) { hard = true; cost += 30; if (!worst || t < worst.t) worst = { t, n }; }
            if (t === 0) cost += 40;
        }
        if (rot && rot.a !== 0) {
            for (let i = 0; i < close.length; i++) {
                const n = close[i];
                if (n.still || (n.ovx * u.x + n.ovz * u.z) > -0.3 * speed) continue;
                const lat = n.dx * -u.z + n.dz * u.x;
                if (Math.abs(lat) < n.R + 0.3 && (n.dx * u.x + n.dz * u.z) > 0) { cost += rot.a < 0 ? -0.25 : 0.2; break; }
            }
        }
        if (lastMoving && vx * vx + vz * vz > 0.04) {
            let da = Math.abs(Math.atan2(vz, vx) - lastA);
            if (da > Math.PI) da = Math.PI * 2 - da;
            cost += 0.35 * da / Math.PI;
        }
        if (cost < bestCost) { bestCost = cost; best = ci === nCand - 1 ? null : { vx, vz }; bestHard = hard; blockerNow = worst?.n || null; }
    }
    return { best, hard: bestHard, blocker: blockerNow };
}

/** Is `n` coming at me along my way (head-on)? */
const headOn = (n, u, speed) => !n.still && (n.ovx * u.x + n.ovz * u.z) < -0.35 * speed && (n.dx * u.x + n.dz * u.z) > 0 && Math.abs(n.dx * -u.z + n.dz * u.x) < n.R + 0.7;

/** Two heading at each other where the ground is too narrow to pass: → { n, loser } or null. */
function conflictOf(st, p, u, near, me, speed, room, r) {
    for (const n of near) {
        if (!headOn(n, u, speed)) {
            // (one standing in a narrow way right ahead is a conflict too — but it is asked to step aside, not backed from)
            continue;
        }
        const need = r + n.or + 0.3;
        const w = narrowestBetween(p, { x: p.x + n.dx, z: p.z + n.dz }, room);
        if (w >= need + 0.1) continue;
        const theirs = hashId(n.o.id ?? n.o.ref?.id) + (n.o.rank || 0) * 1e6;
        // (one already backing out has the right of way over what is behind it: it must be given room — a queue backs out like a train)
        const theyYield = !!n.o.pilot?.yielding;
        const iYieldAlready = false;
        void iYieldAlready;
        const lower = theyYield ? true : (n.o.pilot?.plan ? false : (me < theirs || (me === theirs && String(n.o.id) > String(st.id || ''))));
        if (lower) return { n, loser: true, w };
    }
    return null;
}

/** The plan of the loser: back along the trail to the nearest passing place; the aim is where it holds. */
function makePlan(st, p, u, c, room, r, near) {
    const need = r + c.n.or + 0.45;
    // the passing place: a crumb (nearest first) where the way is wide enough for the other to go by
    let target = null;
    for (let i = st.trail.length - 1; i >= 0; i--) {
        const q = st.trail[i];
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < 0.6) continue;
        const sp = spanAt(q.x, q.z, u.x, u.z, room);
        if (sp.width >= need * 1.15 && (sp.left >= need * 0.5 || sp.right >= need * 0.5)) { target = { x: q.x, z: q.z, side: sp.left >= sp.right ? 1 : -1 }; break; }
    }
    // the here-and-now place may be wide enough already (it only needs to step aside)
    const here = spanAt(p.x, p.z, u.x, u.z, room);
    if (here.width >= need * 1.15 && !target) target = { x: p.x, z: p.z, side: here.left >= here.right ? 1 : -1 };
    if (!target) {
        // (no crumb is wide: all the way back — the farthest crumb; the other will come out the same way)
        const far = st.trail[0] || p;
        target = { x: far.x, z: far.z, side: 1, far: true };
    }
    return { target, ux: u.x, uz: u.z, phase: 'back', t0: st.clock, blocker: c.n.o, need, aside: 0 };
}

/** Executes the plan; undefined: the plan is over, choose as usual. */
function runPlan(st, p, u, near, speed, room, r, opts, dt) {
    const pl = st.plan;
    const age = st.clock - pl.t0;
    st.yielding = true;
    const bl = near.find((n) => n.o === pl.blocker || (n.o.ref && n.o.ref === pl.blocker.ref) || n.o.id === pl.blocker.id);
    // the other has passed (it is behind me now / far) → the plan is over
    const passed = !bl || (bl.dx * pl.ux + bl.dz * pl.uz) < -0.2 || bl.d > PILOT.CONFLICT + 2;
    if (pl.phase === 'hold') {
        if (passed) { pl.clear = (pl.clear || 0) + dt; if (pl.clear > 0.5) { st.plan = null; st.yielding = false; return undefined; } } else pl.clear = 0;
        if (age > 40) { st.plan = null; st.yielding = false; return undefined; }
        // (holding at the passing place: stepped aside to the wider side, then still; a little shift if a body presses)
        return null;
    }
    // back out (then step aside to the wider side, then hold)
    if (!pl.goal) pl.goal = pl.target;
    const tx = pl.goal.x, tz = pl.goal.z, d = Math.hypot(tx - p.x, tz - p.z);
    if (passed && age > 1) { st.plan = null; st.yielding = false; return undefined; }
    if (d < 0.2) {
        const sp0 = spanAt(p.x, p.z, pl.ux, pl.uz, room);
        if (sp0.width < pl.need * 1.1 && !pl.goal.far && !pl.asideDone) {
            // (not wide enough after all: the next crumb back)
            const i = st.trail.findIndex((q) => Math.hypot(q.x - pl.goal.x, q.z - pl.goal.z) < 0.05);
            const nxt = i > 0 ? st.trail[i - 1] : null;
            if (nxt) { pl.goal = { x: nxt.x, z: nxt.z }; return null; }
        }
        if (!pl.asideDone) {
            pl.asideDone = true;
            const sp = sp0;
            const side = sp.left >= sp.right ? 1 : -1;
            const room1 = side > 0 ? sp.left : sp.right;
            const step = Math.min(room1 - 0.1, pl.need * 0.9);
            if (step > 0.25) { pl.goal = { x: p.x - pl.uz * side * step, z: p.z + pl.ux * side * step }; pl.aside = 1; return null; }
        }
        pl.phase = 'hold'; pl.clear = 0;
        return null;
    }
    if (age > 25) { st.plan = null; st.yielding = false; return undefined; }
    // the sampler backs the walker toward the aim (round bodies behind it, walls, the others backing too)
    const ux = (tx - p.x) / d, uz = (tz - p.z) / d;
    const res = choose(st, p, { x: ux, z: uz }, d, near.filter((n) => n.dx * ux + n.dz * uz > -1 || n.d < n.R + 0.6), speed * 0.85, room, r, opts, dt);
    if (res.best && !res.hard) {
        const sp = Math.hypot(res.best.vx, res.best.vz);
        st.vx = res.best.vx; st.vz = res.best.vz;
        return { x: res.best.vx / sp, z: res.best.vz / sp, k: Math.max(0.3, Math.min(0.85, sp / speed)), back: true };
    }
    // (the way back is shut: those behind it must give way — they see it yielding and do — meanwhile it waits)
    st.vx = 0; st.vz = 0;
    if (st.still > PILOT.UNSTICK) { const to = freeSpot(p, u, near, opts, room, r); st.still = 0; if (to) return { x: u.x, z: u.z, k: 0, unstick: to }; }
    return null;
}

function nearestAhead(near, u) {
    let b = null, bf = Infinity;
    for (const n of near) {
        const f = n.dx * u.x + n.dz * u.z;
        if (f > -0.3 && f < bf && Math.abs(n.dx * -u.z + n.dz * u.x) < n.R + 0.6) { bf = f; b = n; }
    }
    return b;
}

/** Nothing moves: asking a standing one to step aside, squeezing, and finally being set on a free place. undefined = go on as chosen. */
function stalled(st, p, u, near, b, me, opts, room, r) {
    const t = st.still;
    if (b) st.blocker = b.o;
    if (b && b.still && t > 0.4 && opts.askWay) opts.askWay(b.o, p, u);
    // a mutual wait with someone who moves/waits and no narrow conflict was seen (open ground, a crowd): the lower priority backs a little
    if (b && t > PILOT.WAIT * 2 && !st.plan) {
        const theirs = hashId(b.o.id ?? b.o.ref?.id) + (b.o.rank || 0) * 1e6;
        if (me < theirs && st.trail.length > 1 && !b.still) {
            st.plan = makePlan(st, p, u, { n: b, w: 0 }, room, r, near);
            st.plan.target = backTarget(st, p, r, room, near) || st.plan.target;
            return null;
        }
    }
    if (t > PILOT.SQUEEZE && st.squeeze <= 0) st.squeeze = 2.5;
    if (t > PILOT.UNSTICK && st.unstuck <= 0) {
        const to = freeSpot(p, u, near, opts, room, r);
        st.unstuck = 4; st.still = 0;
        if (to) return { x: u.x, z: u.z, k: 0, unstick: to };
    }
    return undefined;
}

/** The way back along its own trail: the nearest crumb ≥ 1 m away that is free. */
function backTarget(st, p, r, room, near) {
    for (let i = st.trail.length - 1; i >= 0; i--) {
        const c = st.trail[i];
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < 1.0) continue;
        const ux = (c.x - p.x) / d, uz = (c.z - p.z) / d;
        if (!room(p.x + ux * 0.6, p.z + uz * 0.6)) continue;
        if (near.some((n) => Math.hypot(n.dx - ux * 0.6, n.dz - uz * 0.6) < n.R - 0.05)) continue;
        return { x: c.x, z: c.z, side: 1 };
    }
    return null;
}

/** The nearest place within 3 m where a body fits among the others. */
function freeSpot(p, u, near, opts, room, r) {
    let best = null, bs = Infinity;
    for (let d = 0.8; d <= 3; d += 0.6) for (let k = 0; k < 12; k++) {
        const a = k * Math.PI / 6, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        if (!room(x, z)) continue;
        if (near.some((n) => Math.hypot(n.dx - (x - p.x), n.dz - (z - p.z)) < n.or + r + 0.05)) continue;
        const score = d - ((x - p.x) * u.x + (z - p.z) * u.z) * 0.8;
        if (score < bs) { bs = score; best = { x, z }; }
    }
    return best;
}

/**
 * The push (m, {x, z}) that takes a body at p with radius r out of the bodies it overlaps. `share` of each overlap is its own to undo: all of it
 * for a body that cannot be moved (the player: o.fixed), half between two that move (the other undoes its half itself), more for one only standing.
 * Bodies never stay inside each other — this is the guarantee under everything else.
 */
export function separate(p, r, others, opts = {}) {
    let px = 0, pz = 0;
    const gap = opts.gap ?? 0.06;
    for (const o of others) {
        const or = o.r ?? 0.55;
        const dx = p.x - o.x, dz = p.z - o.z;
        const need = r + or + gap;
        const d2 = dx * dx + dz * dz;
        if (d2 >= need * need) continue;
        const d = Math.sqrt(d2);
        let nx, nz;
        if (d > 1e-3) { nx = dx / d; nz = dz / d; } else { const a = (hashId(opts.id) % 360) * DEG; nx = Math.cos(a); nz = Math.sin(a); }
        const pen = need - d;
        let share = o.fixed ? 1 : opts.fixed ? 0 : (o.soft === false ? 1 : 0.5);
        if (opts.yield) share = Math.max(share, 0.75);
        px += nx * pen * share; pz += nz * pen * share;
    }
    const m = Math.hypot(px, pz), cap = opts.cap ?? 0.3;
    if (m > cap) { px *= cap / m; pz *= cap / m; }
    return { x: px, z: pz };
}
