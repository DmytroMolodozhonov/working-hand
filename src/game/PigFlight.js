/**
 * PigFlight.js — pigs have wings: how a pig takes off, flies and lands.
 *
 * A frightened pig (somebody running at it, a blow, a blast, a spell's push…)
 * runs a step, beats its wings and climbs, flies off a good distance and comes
 * down somewhere safe (grass, not water, not in a castle) with its wings spread,
 * then folds them. A short hop-flight takes it over a river. Now and then a
 * whole herd migrates: high over the world, in a loose V behind its leader, to
 * a new place far away (a rare sight: pigs flying over).
 *
 * In the air it is still a creature: a blow, a stunning spell, ice, Leviosa…
 * and it folds its wings and falls (Animals.js drops it: `a.fly = null`, the
 * body physics takes over); if it comes to itself high enough it opens its
 * wings again and flies on.
 *
 * It never flies through the ground, trees or houses: it keeps above the
 * highest thing under its way for the next seconds, and a step that would go
 * into something is not taken (it climbs first).
 *
 * Pure flight logic (no game objects): the world is given as
 *   W.floor(x, z)        → the top of whatever is there (ground, tree, roof, deck)
 *   W.landOk(x, z)       → can a pig land there (dry grass, outside castles)
 *   W.pickLanding(x, z, r) → a good landing spot near (x, z) or null
 * Animals.js owns when and why; this file owns how.
 */

/** Flight numbers (m, s, m/s; the world's metres: the hero is ~4.6 m tall, a pig ~1.5 m). */
export const FLY = {
    SPEED: 9, // fleeing
    MIGRATE: 11.5, // a migrating flock
    HOP: 6, // a hop over a river
    CLIMB: 5.5, // m/s up at most
    SINK: 4, // m/s down at most (landing: slower near the ground)
    TURN: 1.5, // rad/s
    FLEE_ALT: [9, 15], // m above the ground
    MIGRATE_ALT: [42, 54],
    HOP_ALT: 3.5,
    FOLLOW_ALT: 7,
    FLEE_DIST: [35, 60],
    HOP_MAX: 22,
    CLEAR: 2.5, // m kept above whatever is under the way ahead
    LOOK: 2.2, // s of the way ahead checked
    MAX_T: 80, // s: a flight that found nowhere to land comes down where it can
    RECOVER_H: 3, // m: a pig that comes to itself higher than this opens its wings
    MIG_EVERY: [300, 600], // s between migrations (± a random part)
    MIG_DIST: [170, 260],
    BASE: 0.5, // the animal's position is this far above its feet' ground
};

const rr = (lo, hi, rnd) => lo + rnd() * (hi - lo);
const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

/**
 * Start a flight. kind: 'flee' | 'hop' | 'migrate' | 'follow'.
 * dest {x, z}: where to land (already a good spot); opts: {lead, slot: [side, back], alt, air}
 * (air: it is already in the air — a pig that comes to itself while falling, a flock that appears in the sky).
 */
export function takeOff(a, kind, dest, opts = {}, rnd = Math.random) {
    const alt = opts.alt ?? (kind === 'migrate' ? rr(...FLY.MIGRATE_ALT, rnd) : kind === 'hop' ? FLY.HOP_ALT : kind === 'follow' ? FLY.FOLLOW_ALT : rr(...FLY.FLEE_ALT, rnd));
    const speed = kind === 'migrate' ? FLY.MIGRATE : kind === 'hop' ? FLY.HOP : FLY.SPEED;
    a.fly = {
        kind, mode: opts.air ? 'cruise' : 'up', tx: dest.x, tz: dest.z, alt, speed,
        spd: opts.air ? speed * 0.8 : 0, vy: 0, t: 0, glide: false, glideT: rr(1.5, 3, rnd),
        lead: opts.lead ?? null, slot: opts.slot || null, home: opts.home || null,
    };
    a.airborne = false; // (the wings hold it: no falling while it flies)
    if (a.vel) a.vel.set(0, 0, 0);
    a.spd = 0;
    return a.fly;
}

/** The highest floor along the way from (x, z) in direction (dx, dz) for `len` metres (and right here). */
export function floorAhead(W, x, z, dx, dz, len, n = 6) {
    let top = W.floor(x, z);
    for (let i = 1; i <= n; i++) {
        const k = len * i / n;
        top = Math.max(top, W.floor(x + dx * k, z + dz * k));
    }
    return top;
}

/**
 * One step of a flight (dt s). Moves a.group (position, yaw) and sets a.bank / a.pitch,
 * a.flyCode (what the wings do: 1 beat, 2 glide, 3 landing). Returns 'landed' when its feet
 * are on the ground at the spot, else null.
 * `leader` (optional): the flock's leader animal, flown after (its place in the V).
 */
export function stepFlight(a, dt, W, leader = null, rnd = Math.random) {
    const f = a.fly;
    const p = a.group.position;
    f.t += dt;
    const slow = a.slowK ?? 1;
    // a flock: its own place behind the leader (a loose V) while the leader flies on
    let chase = false;
    if (leader && leader.fly && leader.fly.mode !== 'down' && f.slot) {
        const ly = leader.group.rotation.y;
        const fx = -Math.sin(ly), fz = -Math.cos(ly); // the leader's forward
        const [side, back] = f.slot;
        f.tx = leader.group.position.x - fx * back + fz * side * -1;
        f.tz = leader.group.position.z - fz * back + fx * side;
        f.alt = leader.fly.alt + back * 0.08;
        chase = true;
    } else if (f.lead != null && leader && leader.fly && leader.fly.mode === 'down' && f.slot) {
        // the leader comes down: each lands at its own place beside the leader's spot
        f.tx = leader.fly.tx + f.slot[0] * 1.6; f.tz = leader.fly.tz + f.slot[1] * 1.2;
        const s = W.pickLanding(f.tx, f.tz, 8);
        if (s) { f.tx = s.x; f.tz = s.z; }
        f.lead = null; f.slot = null;
    } else if (f.lead != null && (!leader || !leader.fly)) {
        // (the leader fell or was taken away: it goes on alone to the flock's spot)
        f.lead = null;
        f.slot = null;
    }
    if (f.t > FLY.MAX_T && f.mode === 'cruise' && !chase) {
        // too long in the air (nowhere to land there): down where it is, or back home
        const s = W.pickLanding(p.x, p.z, 40) || (f.home && W.pickLanding(f.home.x, f.home.z, 20));
        if (s) { f.tx = s.x; f.tz = s.z; }
        f.t = FLY.MAX_T * 0.5;
    }
    let dx = f.tx - p.x, dz = f.tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-3) { dx /= dist; dz /= dist; } else { dx = -Math.sin(a.group.rotation.y); dz = -Math.cos(a.group.rotation.y); }
    const floorHere = W.floor(p.x, p.z);
    const hAbove = p.y - FLY.BASE - floorHere;
    const floorT = W.floor(f.tx, f.tz);

    // --- the wanted speed and height
    let want, wantY;
    if (f.mode === 'up') {
        // a short run and strong wing beats: it climbs, hardly forward yet
        want = f.speed * Math.min(0.45, 0.15 + f.t * 0.4);
        wantY = floorHere + FLY.BASE + f.alt + 1;
        if (hAbove >= Math.min(f.alt, 3.5) || f.t > 3) f.mode = 'cruise';
    } else if (f.mode === 'cruise') {
        want = chase ? Math.max(f.speed * 0.6, Math.min(f.speed * 1.35, f.speed + (dist - 2) * 0.6)) : f.speed;
        const ahead = floorAhead(W, p.x, p.z, dx, dz, Math.max(6, a.fly.spd * FLY.LOOK));
        wantY = Math.max(ahead + FLY.CLEAR + FLY.BASE, floorHere + FLY.BASE + f.alt);
        // near the spot: down in a long glide (from higher up it starts farther off)
        const glideDist = Math.max(4, (p.y - floorT - FLY.BASE) * 1.7 + 3);
        if (!chase && !f.hold && dist < glideDist) { // (hold: it keeps flying — the Pegasus round an attacker)
            if (W.landOk(f.tx, f.tz)) f.mode = 'down';
            else { const s = W.pickLanding(f.tx, f.tz, 25); if (s) { f.tx = s.x; f.tz = s.z; } else if (f.home) { f.tx = f.home.x; f.tz = f.home.z; } }
        }
    } else {
        // 'down': slower and lower towards the spot, the wings spread wide; never into a tree on the way
        want = Math.max(0.8, Math.min(f.speed * 0.7, dist * 0.9));
        const ahead = dist > 2 ? floorAhead(W, p.x, p.z, dx, dz, Math.min(dist, 8), 4) : floorHere;
        const path = floorT + FLY.BASE + Math.max(0, dist - 1.2) * 0.55;
        wantY = Math.max(path, dist > 2 ? ahead + FLY.BASE + 0.8 : floorHere + FLY.BASE);
        // (it went off, or something new is on the spot: up and round again)
        if (dist > 40) f.mode = 'cruise';
    }
    want *= slow;

    // --- turning (it banks into a turn) and its speed
    const yaw = Math.atan2(-dx, -dz);
    const dy = wrap(yaw - a.group.rotation.y);
    const rate = (f.mode === 'down' && dist < 3 ? 0.6 : FLY.TURN) * dt;
    const turn = Math.max(-rate, Math.min(rate, dy));
    a.group.rotation.y += turn;
    a.bank = (a.bank || 0) + (Math.max(-0.6, Math.min(0.6, (turn / Math.max(dt, 1e-3)) * 0.45)) - (a.bank || 0)) * Math.min(1, dt * 3);
    if (dist > 4) want *= 0.55 + 0.45 * Math.max(0, Math.cos(dy)); // (round a sharp turn slower)
    const acc = want > f.spd ? 4 : 5;
    f.spd += Math.max(-acc * dt, Math.min(acc * dt, want - f.spd));

    // --- up / down
    const vyWant = Math.max(-(f.mode === 'down' ? Math.min(FLY.SINK, 0.8 + hAbove * 0.6) : FLY.SINK), Math.min(FLY.CLIMB, (wantY - p.y) * 1.4));
    f.vy += (vyWant - f.vy) * Math.min(1, dt * 3);
    let ny = p.y + f.vy * dt;

    // --- forward, never into something: a step into a wall / a tree / a hill is not taken (it climbs)
    const fx = -Math.sin(a.group.rotation.y), fz = -Math.cos(a.group.rotation.y);
    let step = f.spd * dt;
    if (f.mode === 'down' && step > dist) step = dist;
    const nx = p.x + fx * step, nz = p.z + fz * step;
    const nFloor = W.floor(nx, nz);
    if (nFloor + FLY.BASE > ny - 0.05 && !(f.mode === 'down' && dist < 0.8)) {
        f.spd *= 0.5;
        f.vy = Math.max(f.vy, FLY.CLIMB * 0.8);
        ny = Math.max(ny, p.y + f.vy * dt);
    } else { p.x = nx; p.z = nz; }
    const under = W.floor(p.x, p.z) + FLY.BASE;
    if (ny < under) { ny = under; f.vy = Math.max(0, f.vy); }
    p.y = ny;

    // --- how the body is held: nose up climbing / flaring to land, a little down in a dive
    const flare = f.mode === 'down' && hAbove < 3 ? 0.35 : 0;
    a.pitch = (a.pitch || 0) + (Math.max(-0.3, Math.min(0.35, f.vy * 0.06)) + flare - (a.pitch || 0)) * Math.min(1, dt * 3);

    // --- the wings: beating to climb or keep up, gliding in between
    if (f.mode === 'cruise') {
        f.glideT -= dt;
        if (f.glideT <= 0) { f.glide = !f.glide && f.vy < 1 && !chase; f.glideT = f.glide ? rr(1.2, 2.6, rnd) : rr(1.6, 3.2, rnd); }
        if (f.vy > 1.2) f.glide = false;
    } else f.glide = false;
    a.flyCode = f.mode === 'down' ? 3 : f.glide ? 2 : 1;

    if (f.mode === 'down' && dist < 0.9 && p.y - under < 0.08) return 'landed';
    return null;
}

/**
 * A new place for a migrating herd: far off, the way going over (near) the player when the
 * herd is not far from them — so somebody may see pigs flying over. from/me: {x, z}.
 */
export function pickMigration(from, me, rnd = Math.random) {
    let dx = me.x - from.x, dz = me.z - from.z;
    let L = Math.hypot(dx, dz);
    if (L < 1) { const a = rnd() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); L = 1; }
    dx /= L; dz /= L;
    // (not right over the head every time: a little to one side)
    const turn = (rnd() - 0.5) * 0.5;
    const c = Math.cos(turn), s = Math.sin(turn);
    const ux = dx * c - dz * s, uz = dx * s + dz * c;
    const d = Math.max(rr(...FLY.MIG_DIST, rnd), L + 90);
    return { x: from.x + ux * d, z: from.z + uz * d };
}

/** A place in a loose V behind the leader for the i-th of a flock (i ≥ 1): [side, back] in metres. */
export function flockSlot(i, rnd = Math.random) {
    const rank = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
    return [side * (rank * 3.4 + (rnd() - 0.5) * 1.2), rank * 3.8 + (rnd() - 0.5) * 1.5];
}

/**
 * What the wings do, every frame, on every computer (from a.flyCode: 0 on the ground,
 * 1 beating, 2 gliding, 3 landing — spread wide, 4 falling — folded). Sets
 * a.wingOpen (0 folded … 1 spread), a.flapA (the up/down angle), a.flapFlex (the wing tips bend),
 * a.tuck (the legs in flight). On the ground a folded wing twitches now and then.
 */
export function wingTick(a, dt, rnd = Math.random) {
    const code = (a.flyCode || 0) & 7;
    const flying = code >= 1 && code <= 3;
    if (!flying && code !== 4) {
        a.twitchT = (a.twitchT ?? rr(4, 14, rnd)) - dt;
        if (a.twitchT <= 0) { a.twitchT = rr(6, 20, rnd); a.twitch = rr(0.4, 0.9, rnd); }
    }
    if (a.twitch > 0) a.twitch -= dt;
    const twitch = !flying && code !== 4 && a.twitch > 0;
    const openWant = flying ? 1 : twitch ? 0.14 : 0;
    a.wingOpen = (a.wingOpen || 0) + (openWant - (a.wingOpen || 0)) * Math.min(1, dt * (openWant > (a.wingOpen || 0) ? 7 : 3.5));
    const amp = code === 1 ? 0.85 : code === 3 ? 0.45 : code === 2 ? 0.04 : twitch ? 0.35 : 0;
    const freq = code === 1 ? 3.2 : code === 3 ? 4.2 : twitch ? 6 : 1;
    const base = code === 2 ? 0.14 : code === 3 ? 0.3 : 0.05;
    a.flapAmp = (a.flapAmp || 0) + (amp - (a.flapAmp || 0)) * Math.min(1, dt * 5);
    a.flapPh = ((a.flapPh || 0) + dt * freq * Math.PI * 2) % (Math.PI * 200);
    a.flapA = base + a.flapAmp * Math.sin(a.flapPh);
    a.flapFlex = -Math.cos(a.flapPh) * a.flapAmp * 0.7; // (the tips lag behind the beat)
    a.tuck = (a.tuck || 0) + ((flying ? 1 : 0) - (a.tuck || 0)) * Math.min(1, dt * 4);
}
