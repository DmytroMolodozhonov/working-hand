/**
 * ObjectSwarm.js — the shared, pure (no THREE) logic of a SWARM of things circling a hero: «Ground Vortex» (blocks) and any
 * other spell that conducts many things (e.g. «Левиоса Максима» for objects). Pure maths, node-testable.
 *
 *   SWARM            the numbers (funnel, train, shield, volley, limits).
 *   a thing's slot   funnelSlot(i) / tumbleOf(i)  — stable by its index i (adding things never moves the others);
 *   the ring         ringOffset(i, angle, t, out)  — where thing i is round the hero (offsets from the hip) while the hand goes round;
 *                    the funnel's angle `angle` is integrated from the hand's turns (SwingMeter.rate × 2π, min SPIN_MIN);
 *   the train        trailPush(hist, now, x, y, z) every frame with the wand's head; trailAt(hist, now, i * TRAIN_STEP) is thing i's
 *                    place on the wand's trail (the helix round it is up to the caller: see GroundVortex._place);
 *   the volley       salvoVelocity(dir, seed, j) — the same flight on every computer; flyStep(p, v, dt);
 *   the shield       shieldSlot / shieldOffset (4 rings × 12 + a second shell, SHIELD_CAP things), shieldCovers(n, alive, angle, bearing),
 *                    blocksToBreak(n, alive, angle, bearing, want) — which things a blow breaks; blocksFacing;
 *   limits           SWARM.MAX_THINGS = 160, ring sizes: layerOf(i), blocksInRings(k).
 * The class that uses them keeps its own state (the things, mana, network): see GroundVortex.js.
 */

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const TAU = Math.PI * 2;

export const SWARM = {
    MAX_THINGS: 160,
    // the funnel
    LAYER_R0: 1.9, // m: the lowest ring
    LAYER_DR: 0.3, // m wider each ring up
    LAYER_DY: 0.7, // m higher each ring up
    LAYER_Y0: -1.5, // m below the hip (the hero's feet are 2 m under it)
    CAP0: 9, // blocks in the lowest ring
    CAP_DC: 2,
    SPIN_MIN: 1.4, // rad/s
    // the train
    TRAIN_CALM: 0.55, // s of a calm pointing hand before it goes
    TRAIN_IN: 1.5, // 1/s: how fast ring → train
    TRAIN_STEP: 0.018, // s of the wand's trail between two blocks
    TRAIN_REACH: 8, // m: the head ahead of the wand (shorter when something is in the way)
    TRAIN_R: 0.9, // m: the helix round the trail
    HIST_HZ: 40,
    HIST_N: 160,
    // the attack
    SPEED: 30, // m/s
    GRAV: 9, // m/s² (a thrown rock, not a bullet)
    VOLLEY: 36, // blocks a second
    SALVO: 12,
    STEER: 0.5, // rad/s the wand may bend a flying block
    FLIGHT_LIFE: 3.2,
    HIT_EVERY: 0.3, // s between two hits on the same victim
    KNOCK_WINDOW: 0.9,
    BODY_R: 0.5, // m: the block's reach
    // the shield
    SHIELD_MIN: 12,
    SHIELD_R: 2.5, // m: the inner shell (12 things a ring: 1.29 m between centres — a unit cube turned by the ring's 30° needs 1.23)
    SHIELD_R2: 3.8, // m: the outer shell (16 a ring: 1.48 m; 1.3 m of air-to-air from the inner one)
    SHIELD_RINGS: 4,
    SHIELD_COLS: 12,
    SHIELD_COLS2: 16,
    SHIELD_ROW: 1.2, // m between two rings (a thing is 1 m: 0.2 m of gap)
    SHIELD_CAP: 112, // 48 + 64
    SHIELD_IN: 2.2, // 1/s
    SHIELD_SPIN: 0.55,
    COVER_ARC: 0.44, // rad (25°): a block within this of the blow's bearing stands in its way
    COVER_NEED: 2,
    STALE: 1.6, // s without news and a far vortex is forgotten
    SEND: 0.1,
    // the end
    FALL_G: 22,
};

const SW = SWARM;

// ------------------------------------------------------------------ small maths
/** A stable pseudo-random number 0…1 from two integers. */
export function hash2(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ the funnel
/** The ring (layer) of block i, its index in the ring and the ring's size. */
export function layerOf(i) {
    let k = 0, left = i;
    for (;;) {
        const cap = SW.CAP0 + SW.CAP_DC * k;
        if (left < cap) return { k, j: left, cap };
        left -= cap;
        k++;
    }
}

/** Blocks the funnel holds in its first `k` rings. */
export const blocksInRings = (k) => k * SW.CAP0 + SW.CAP_DC * (k * (k - 1)) / 2;

/** The funnel slot of block i: {r (m from the axis), y (m above the hip), ph (the phase round the axis)}. */
export function funnelSlot(i, out = {}) {
    const { k, j, cap } = layerOf(i);
    out.k = k;
    out.r = SW.LAYER_R0 + SW.LAYER_DR * k + 0.18 * (hash2(i, 5) - 0.5);
    out.y = SW.LAYER_Y0 + SW.LAYER_DY * k + 0.22 * (hash2(i, 7) - 0.5);
    out.ph = (j / cap) * TAU + k * 0.7 + 0.25 * (hash2(i, 3) - 0.5);
    return out;
}

/** A block's own tumble: an axis (unit) and a speed (rad/s), a scale. */
export function tumbleOf(i, out = {}) {
    const a = hash2(i, 11) * TAU, z = hash2(i, 13) * 2 - 1, s = Math.sqrt(1 - z * z);
    out.ax = s * Math.cos(a); out.ay = z; out.az = s * Math.sin(a);
    out.w = (hash2(i, 17) - 0.5) * 5 + (hash2(i, 17) < 0.5 ? -0.8 : 0.8);
    out.s = 0.86 + 0.12 * hash2(i, 19);
    return out;
}

/** Where block i is in the ring formation round the body (`angle` — the vortex's turn, `t` — time for the bobbing). → {x, y, z} offsets. */
export function ringOffset(i, angle, t, out = {}, f = funnelSlot(i, _fs)) {
    const th = f.ph + angle * (1 + 0.04 * (f.k % 3)) - f.k * 0.13;
    out.x = Math.cos(th) * f.r;
    out.y = f.y + 0.14 * Math.sin(t * 2.3 + i * 1.7);
    out.z = Math.sin(th) * f.r;
    return out;
}
const _fs = {};

// ------------------------------------------------------------------ the shield
/**
 * The shield slot of thing i (the first SHIELD_CAP): {ring 0…3, col, cols, shell 0|1, r, y, ph}. null: it circles outside.
 * Two shells of 4 rings; things are cubes turned to face the middle (yaw only, full size): their centres are never nearer
 * than 1.2 m in a ring, 1.2 m between rings and 1.3 m between shells — they do not touch, they do not overlap (tests/unit/ground-vortex).
 */
export function shieldSlot(i, out = {}) {
    if (i >= SW.SHIELD_CAP) return null;
    const per1 = SW.SHIELD_RINGS * SW.SHIELD_COLS, per2 = SW.SHIELD_RINGS * SW.SHIELD_COLS2;
    const shell = i >= per1 ? 1 : 0;
    const per = shell ? per2 : per1;
    const s = ((shell ? i - per1 : i) * 5) % per; // (5 is coprime with 48 and with 64: every slot once, spread round)
    out.shell = shell;
    out.cols = shell ? SW.SHIELD_COLS2 : SW.SHIELD_COLS;
    out.ring = s % SW.SHIELD_RINGS;
    out.col = Math.floor(s / SW.SHIELD_RINGS);
    out.r = shell ? SW.SHIELD_R2 : SW.SHIELD_R;
    out.y = -1.35 + out.ring * SW.SHIELD_ROW + (shell ? 0.6 : 0);
    out.ph = (out.col + out.ring * 0.5) * (TAU / out.cols);
    return out;
}

/** Block i in the shield, round the body, the shield turned by `angle`: {x, y, z} or null. */
export function shieldOffset(i, angle, out = {}, s = shieldSlot(i, _ss)) {
    if (!s) return null;
    out.x = Math.cos(s.ph + angle) * s.r;
    out.y = s.y;
    out.z = Math.sin(s.ph + angle) * s.r;
    return out;
}
const _ss = {};

/** Blocks standing in the way of a blow coming from bearing `bearing` (rad, atan2(dz, dx) from the hero): indices. `alive(i)` → bool. */
export function blocksFacing(n, alive, angle, bearing, arc = SW.COVER_ARC, out = []) {
    out.length = 0;
    for (let i = 0; i < Math.min(n, SW.SHIELD_CAP); i++) {
        if (!alive(i)) continue;
        const s = shieldSlot(i, _ss);
        let d = Math.abs(((s.ph + angle - bearing) % TAU + TAU + Math.PI) % TAU - Math.PI);
        if (d <= arc + (s.shell ? 0.05 : 0)) out.push(i);
    }
    return out;
}

/** Does the shield stop a blow from this bearing (≥ COVER_NEED blocks of at least two rings facing it)? */
export function shieldCovers(n, alive, angle, bearing) {
    const f = blocksFacing(n, alive, angle, bearing, SW.COVER_ARC, []);
    if (f.length < SW.COVER_NEED) return false;
    const rings = new Set();
    for (const i of f) rings.add(shieldSlot(i, _ss).ring);
    return rings.size >= 2;
}

/** The blocks a blow takes: the ones facing it, the outer shell first, then the nearest in angle. `want` of them. */
export function blocksToBreak(n, alive, angle, bearing, want) {
    const f = blocksFacing(n, alive, angle, bearing, SW.COVER_ARC * 2.2, []);
    f.sort((a, b) => (shieldSlot(b, _ss).shell - shieldSlot(a, _ss).shell) || a - b);
    return f.slice(0, want);
}

// ------------------------------------------------------------------ the wand's trail
/** Where the trail was `tau` s ago: the history is [{t, x, y, z}…] oldest first. Writes into out. */
export function trailAt(hist, now, tau, out = {}) {
    const n = hist.length;
    if (!n) { out.x = out.y = out.z = 0; return out; }
    const t = now - tau;
    if (t <= hist[0].t) { out.x = hist[0].x; out.y = hist[0].y; out.z = hist[0].z; return out; }
    for (let i = n - 1; i > 0; i--) {
        const a = hist[i - 1], b = hist[i];
        if (t >= a.t) {
            const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
            out.x = a.x + (b.x - a.x) * u; out.y = a.y + (b.y - a.y) * u; out.z = a.z + (b.z - a.z) * u;
            return out;
        }
    }
    const l = hist[n - 1];
    out.x = l.x; out.y = l.y; out.z = l.z;
    return out;
}

/** Adds a point to the trail (at most HIST_HZ a second, HIST_N long). */
export function trailPush(hist, now, x, y, z) {
    const l = hist[hist.length - 1];
    if (l && now - l.t < 1 / SW.HIST_HZ) { l.x = x; l.y = y; l.z = z; return; }
    hist.push({ t: now, x, y, z });
    if (hist.length > SW.HIST_N) hist.shift();
}

// ------------------------------------------------------------------ the flight of a block
/** One step of a flying block: p, v are {x, y, z}; gravity SW.GRAV. */
export function flyStep(p, v, dt) {
    v.y -= SW.GRAV * dt;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
}

/** The velocity of the j-th block of a salvo aimed along unit d: a little spread, the same on every computer (seed). */
export function salvoVelocity(d, seed, j, out = {}) {
    const a = hash2(seed, j * 3 + 1) * TAU, r = 0.045 * Math.sqrt(hash2(seed, j * 3 + 2));
    // (a vector perpendicular to d)
    let px = -d.z, pz = d.x;
    const pl = Math.hypot(px, pz) || 1; px /= pl; pz /= pl;
    const qx = d.y * pz * -1, qy = d.z * px - d.x * pz, qz = d.y * px; // d × p (unnormalised: |d × p| ≈ 1 for unit d ⟂ p)
    out.x = (d.x + (px * Math.cos(a) + qx * Math.sin(a)) * r) * SW.SPEED;
    out.y = (d.y + (qy * Math.sin(a)) * r) * SW.SPEED;
    out.z = (d.z + (pz * Math.cos(a) + qz * Math.sin(a)) * r) * SW.SPEED;
    return out;
}


// ------------------------------------------------------------------ the hand's intent (no mode flips by accident)
/**
 * Numbers of the gestures (the author: «слишком легко перескакивает в другой режим»). One place for every swarm.
 *   ring → train   the hand has really stopped going round (rate < CALM_RATE and speed < CALM_SPEED for CALM_TIME) AND the wand is
 *                  being led one way: over the last LEAD_WINDOW s its direction turned ≥ LEAD_ANGLE rad, along a line (≥ LEAD_STRAIGHT).
 *   train → ring   only a really going-round hand: rate ≥ LEAVE_RATE for LEAVE_TIME (higher than the entry level: a hysteresis).
 *   salvo          a sharp throw (JERK: longer, faster, straighter than the duel's) AND the wand then keeps its way for HOLD s
 *                  (within HOLD_ANGLE of the throw): a flick that comes back, a shiver, a single jerk is ignored; JERK_GAP between two.
 *   the head       the train's head follows the wand with a lag (HEAD_LAG 1/s): no teleport.
 */
export const INTENT = {
    CALM_RATE: 0.12, CALM_SPEED: 0.5, CALM_TIME: 0.7,
    LEAD_WINDOW: 0.5, LEAD_ANGLE: 0.3, LEAD_STRAIGHT: 0.7,
    LEAVE_RATE: 0.3, LEAVE_TIME: 0.4,
    JERK: { WINDOW: 0.3, DIST: 2.2, STRAIGHT: 0.85, MIN_SPAN: 0.1, ONE_STEP: 0.6 },
    HOLD: 0.15, HOLD_ANGLE: 0.35, JERK_GAP: 0.9,
    HEAD_LAG: 4,
};

const angleBetween = (a, b) => Math.acos(clamp((a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z) || 1), -1, 1));

/**
 * Reads the hand: feed `step` every frame; it keeps `train` (bool) and says `salvo` once when a real throw is confirmed.
 * rate: the hand's turns a second (SwingMeter.rate), speed: m/s (SwingMeter.speed), aim: the wand's unit direction, jerkList: the
 * hand's samples [{t, x, y, z}] (body-relative), `sharp`: the function to read them (Jerk.sharpJerk).
 */
export class SwarmIntent {
    constructor() { this.reset(); }

    reset() {
        this.train = false;
        this.calm = 0; this.leave = 0;
        this.aims = []; // [{t, x, y, z}]
        this.pending = null; // a throw waiting to be confirmed: {t, x, y, z}
        this.lastSalvo = -9;
    }

    /** @returns {boolean} a salvo goes now */
    step(t, dt, rate, speed, aim, jerkList = null, sharp = null, canFire = true) {
        const r = Math.abs(rate);
        // the wand's way over the last LEAD_WINDOW s
        this.aims.push({ t, x: aim.x, y: aim.y, z: aim.z });
        while (this.aims.length && t - this.aims[0].t > INTENT.LEAD_WINDOW) this.aims.shift();
        if (!this.train) {
            if (r < INTENT.CALM_RATE && speed < INTENT.CALM_SPEED) this.calm += dt; else this.calm = 0;
            if (this.calm >= INTENT.CALM_TIME && this._led()) { this.train = true; this.leave = 0; }
        } else {
            if (r >= INTENT.LEAVE_RATE) this.leave += dt; else this.leave = 0;
            if (this.leave >= INTENT.LEAVE_TIME) { this.train = false; this.calm = 0; this.leave = 0; }
        }
        // the throw
        let fire = false;
        if (this.pending) {
            if (angleBetween(this.pending, aim) > INTENT.HOLD_ANGLE) this.pending = null; // (came back / shook: not a throw)
            else if (t - this.pending.t >= INTENT.HOLD) { this.pending = null; fire = canFire; this.lastSalvo = t; }
        } else if (canFire && jerkList && sharp && t - this.lastSalvo > INTENT.JERK_GAP && jerkList.length > 3 && r < INTENT.LEAVE_RATE && sharp(jerkList, INTENT.JERK)) {
            this.pending = { t, x: aim.x, y: aim.y, z: aim.z };
        }
        return fire;
    }

    /** Has the wand been led one way (a turn of ≥ LEAD_ANGLE along a line) for the whole window? */
    _led() {
        const a = this.aims;
        if (a.length < 4 || a[a.length - 1].t - a[0].t < INTENT.LEAD_WINDOW * 0.9) return false;
        const chord = angleBetween(a[0], a[a.length - 1]);
        if (chord < INTENT.LEAD_ANGLE) return false;
        let path = 0;
        for (let i = 1; i < a.length; i++) path += angleBetween(a[i - 1], a[i]);
        return chord / Math.max(path, 1e-6) >= INTENT.LEAD_STRAIGHT;
    }
}

/** The train's head follows the wand's with a lag: p ← p + (target − p)·(1 − e^(−HEAD_LAG·dt)). */
export function lagHead(p, target, dt) {
    const k = 1 - Math.exp(-INTENT.HEAD_LAG * Math.max(0, dt));
    p.x += (target.x - p.x) * k; p.y += (target.y - p.y) * k; p.z += (target.z - p.z) * k;
    return p;
}

// ------------------------------------------------------------------ things do not overlap (cheap)
/**
 * Pushes apart the things of a swarm that are nearer than `min` m (by a grid of cells `min` wide: each thing meets only the ones in the
 * neighbour cells — not n² pairs). `P`: [{x, y, z} | null] (moved in place), `iters` passes, `cell`: a reusable Map.
 * @returns {number} how many pairs were pushed in the last pass
 */
export function separate(P, min = 1.05, iters = 2, cell = new Map()) {
    let last = 0;
    for (let it = 0; it < iters; it++) {
        cell.clear();
        for (let i = 0; i < P.length; i++) {
            const p = P[i];
            if (!p) continue;
            const key = ((Math.floor(p.x / min) + 512) * 1024 + (Math.floor(p.y / min) + 512)) * 1024 + (Math.floor(p.z / min) + 512);
            const l = cell.get(key);
            if (l) l.push(i); else cell.set(key, [i]);
        }
        last = 0;
        for (let i = 0; i < P.length; i++) {
            const p = P[i];
            if (!p) continue;
            const cx = Math.floor(p.x / min), cy = Math.floor(p.y / min), cz = Math.floor(p.z / min);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
                const l = cell.get(((cx + dx + 512) * 1024 + (cy + dy + 512)) * 1024 + (cz + dz + 512));
                if (!l) continue;
                for (const j of l) {
                    if (j <= i) continue;
                    const q = P[j];
                    const ex = q.x - p.x, ey = q.y - p.y, ez = q.z - p.z, d2 = ex * ex + ey * ey + ez * ez;
                    if (d2 >= min * min) continue;
                    const d = Math.sqrt(d2) || 1e-4, push = (min - d) * 0.5;
                    const nx = d2 > 1e-8 ? ex / d : 0, ny = d2 > 1e-8 ? ey / d : 1, nz = d2 > 1e-8 ? ez / d : 0;
                    p.x -= nx * push; p.y -= ny * push; p.z -= nz * push;
                    q.x += nx * push; q.y += ny * push; q.z += nz * push;
                    last++;
                }
            }
        }
    }
    return last;
}
