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
 *   the cloud        cloudSlot(i), cloudCenter(head, body, n, gy) — lifted things hang (a lattice) where the wand shows;
 *   the shield       a dome before the hero: DOME slots, domeOffset(i, yaw), domeAngles, domeCovers(n, alive, yaw, bearing),
 *                    domeBreak(...) — which things a blow breaks; farOffset(j, angle, t) — the ones without a slot wait far outside;
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
    DOME_RC: 5, // m: the dome's radius of curvature (4–6 m)
    DOME_D: 3.6, // m: the apex in front of the hero
    DOME_GAP: 1.4, // m: the second layer is this much nearer to him
    DOME_PITCH: 1.25, // m between two slots along the surface (1 m things: 0.25 m of air)
    DOME_SPAN: 0.75, // rad: half the dome's width as seen from its centre (~7 m wide)
    EYE_Y: 2.15, EYE_CLEAR: 2.4, // m: the eyes over the hip; no dome block nearer to them than this
    FAR_R: 7.5, // m: where the things without a slot wait
    CLOUD_DX: 1.5, CLOUD_DY: 1.3, // m: the cloud's lattice
    SHIELD_IN: 1.6, // 1/s
    DOME_LAG: 6, // 1/s: how fast the dome follows the hero's turning
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

// ------------------------------------------------------------------ the cloud (lifted, hanging)
/**
 * A lifted thing first just HANGS: the swarm is a cloud over the place the wand shows (the author: «подняться и висеть, как под Левиосой
 * Максима»), turning into a funnel only when the hand goes round. Things sit in a lattice (1.5 m in plan, 1.3 m up, every other
 * layer half a step aside), the nearest to the middle first — thing i has the same place whatever the others do; they bob a little and
 * turn about the vertical axis only, so two neighbours never touch.
 */
const CLOUD = [];
for (let iy = -4; iy <= 4; iy++) for (let ix = -5; ix <= 5; ix++) for (let iz = -5; iz <= 5; iz++) {
    const st = (iy & 1) ? 0.75 : 0;
    const x = ix * SW.CLOUD_DX + st, z = iz * SW.CLOUD_DX + st, y = iy * SW.CLOUD_DY;
    CLOUD.push({ x, y, z, r: Math.hypot(x, y * 1.15, z) });
}
CLOUD.sort((a, b) => a.r - b.r || a.y - b.y || a.x - b.x || a.z - b.z);
CLOUD.length = SW.MAX_THINGS + 8;

/** Place of thing i in the cloud (offsets from its middle): {x, y, z}. */
export function cloudSlot(i, out = {}) {
    const c = CLOUD[Math.min(i, CLOUD.length - 1)];
    out.x = c.x; out.y = c.y; out.z = c.z;
    return out;
}
/** How far from its middle a cloud of n things reaches (m). */
export const cloudHalf = (n) => (n > 0 ? CLOUD[Math.min(n, CLOUD.length) - 1].r + 0.6 : 0);

/**
 * Where the middle of the cloud hangs: where the wand shows (`head`), over the ground (its lowest thing 1.2 m up) and not on the hero
 * (its edge ≥ 1.5 m from his body). gy: the ground's height there. → out {x, y, z}
 */
export function cloudCenter(head, body, n, gy, out = {}) {
    const half = cloudHalf(n), halfY = half / 1.15;
    out.x = head.x; out.z = head.z;
    out.y = Math.max(head.y, gy + 1.2 + halfY);
    const dx = head.x - body.x, dz = head.z - body.z, d = Math.hypot(dx, dz), need = half + 1.5;
    if (d < need) {
        const ux = d > 1e-3 ? dx / d : 0, uz = d > 1e-3 ? dz / d : 1;
        out.x = body.x + ux * need; out.z = body.z + uz * need;
    }
    return out;
}

// ------------------------------------------------------------------ the shield: a dome of things before the hero
/**
 * «Shield»: a convex dome like a shield held before the hero — a cap of a sphere of radius DOME_RC whose middle is behind him, its
 * apex DOME_D m in front, ~7 m wide and ~5.7 m high (the hero is 3.5 m). Two layers (the second — every other row and column of the same angles — DOME_GAP m nearer to him). Each thing
 * has a slot of its own on the surface, a pitch of DOME_PITCH (1.25 m) along the surface: 0.25 m of air between neighbours, and the
 * cubes are turned along the surface — they never touch (tests/unit/ground-vortex.test.js: SAT on every pair). The slots stand still
 * relative to the hero (they turn with his yaw, with a lag). Things beyond the slots wait far outside (FAR_R…), never in the dome.
 */
function buildDome() {
    const slots = [];
    const R = SW.DOME_RC, dTh = SW.DOME_PITCH / R;
    const th0 = Math.asin(-1.5 / R), thTop = Math.asin(3.2 / R);
    const rows = Math.floor((thTop - th0) / dTh + 0.05) + 1;
    for (let r = 0; r < rows; r++) {
        const th = th0 + r * dTh, rho = R * Math.cos(th);
        const cols = Math.floor((2 * SW.DOME_SPAN * rho) / SW.DOME_PITCH + 1e-9) + 1;
        const dPh = SW.DOME_PITCH / rho;
        for (let c = 0; c < cols; c++) {
            const ph = (c - (cols - 1) / 2) * dPh;
            // the front layer: the whole cap; the layer behind (DOME_GAP nearer): the same angles, every other row and column — its
            // slots lie closer together on the smaller sphere, so only a quarter of them fit with air between
            for (let layer = 0; layer < 2; layer++) {
                if (layer && (r % 2 || c % 2)) continue;
                const Rl = R - layer * SW.DOME_GAP;
                if (layer) { // (not right before his eyes: the camera is 2.15 m over the hip)
                    const ex = Rl * Math.cos(th) * Math.sin(ph), ey = Rl * Math.sin(th) - SW.EYE_Y, ez = Rl * Math.cos(th) * Math.cos(ph) - (R - SW.DOME_D);
                    if (Math.hypot(ex, ey, ez) < SW.EYE_CLEAR) continue;
                }
                slots.push({
                    layer, row: r, col: c, ph, th, R: Rl,
                    x: Rl * Math.cos(th) * Math.sin(ph), y: Rl * Math.sin(th), z: Rl * Math.cos(th) * Math.cos(ph) - (R - SW.DOME_D),
                    key: layer * 1000 + Math.hypot(ph * 2, th - 0.2),
                });
            }
        }
    }
    slots.sort((a, b) => a.key - b.key);
    return slots;
}
export const DOME = buildDome();
export const domeSlot = (i) => DOME[i] || null;

/** Thing i's place in the dome, from the hero's hip: the hero faces yaw ψ (forward = (sin ψ, cos ψ)). → {x, y, z} | null */
export function domeOffset(i, yaw, out = {}) {
    const s = DOME[i];
    if (!s) return null;
    const sn = Math.sin(yaw), cs = Math.cos(yaw);
    out.x = s.x * cs + s.z * sn;
    out.y = s.y;
    out.z = -s.x * sn + s.z * cs;
    return out;
}
/** The way a dome cube is turned: yaw (about the vertical) and pitch. */
export const domeAngles = (i, yaw, out = {}) => { const s = DOME[i]; out.yaw = yaw + s.ph; out.pitch = s.th; return out; };

/** Where a thing that has no slot waits: far outside, on rings 7.5 m and more from the hero (j = its number among those). */
export function farOffset(j, angle, t, out = {}) {
    const per = 34, m = Math.floor(j / per), k = j % per, r = SW.FAR_R + m * 1.5;
    const a = (k / per) * TAU + m * 0.6 + angle * 0.4;
    out.x = Math.cos(a) * r; out.z = Math.sin(a) * r;
    out.y = 0.6 + m * 1.35 + 0.15 * Math.sin(t * 1.6 + j);
    return out;
}

const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
/** The bearing of the way the hero faces (atan2(dz, dx)). */
const faceBearing = (yaw) => Math.PI / 2 - yaw;

/** Blocks of the front layer first, within `arc` of the blow's bearing: indices. */
export function domeFacing(n, alive, yaw, bearing, arc = SW.COVER_ARC, out = []) {
    out.length = 0;
    const rel = wrap(bearing - faceBearing(yaw)); // (the dome's φ is to the right: a blow at rel hits the slot with φ = −rel)
    for (let i = 0; i < Math.min(n, DOME.length); i++) {
        if (!alive(i)) continue;
        if (Math.abs(wrap(DOME[i].ph + rel)) <= arc) out.push(i);
    }
    return out;
}

/** Does the dome stand in the way of a blow from this bearing (≥ COVER_NEED things of ≥ 2 rows facing it)? */
export function domeCovers(n, alive, yaw, bearing) {
    const f = domeFacing(n, alive, yaw, bearing, SW.COVER_ARC, []);
    if (f.length < SW.COVER_NEED) return false;
    const rows = new Set();
    for (const i of f) rows.add(DOME[i].layer * 100 + DOME[i].row);
    return rows.size >= 2;
}

/** The things a blow takes: the front layer's facing it, the nearest to the middle of the blow first. `want` of them. */
export function domeBreak(n, alive, yaw, bearing, want) {
    const f = domeFacing(n, alive, yaw, bearing, SW.COVER_ARC * 2.2, []);
    const rel = wrap(bearing - faceBearing(yaw));
    f.sort((a, b) => (DOME[a].layer - DOME[b].layer) || (Math.abs(wrap(DOME[a].ph + rel)) - Math.abs(wrap(DOME[b].ph + rel))) || a - b);
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

 *   cloud ↔ funnel the swarm hangs as a cloud; only a hand really going round (RING_RATE for RING_ON_T) winds it into the funnel round the hero;
 *                  it is a cloud again after RING_OFF_T of calm.
 *   the head       the train's head follows the wand with a lag (HEAD_LAG 1/s): no teleport.
 */
export const INTENT = {
    CALM_RATE: 0.12, CALM_SPEED: 0.5, CALM_TIME: 0.7,
    LEAD_WINDOW: 0.5, LEAD_ANGLE: 0.3, LEAD_STRAIGHT: 0.7,
    LEAVE_RATE: 0.3, LEAVE_TIME: 0.4,
    JERK: { WINDOW: 0.3, DIST: 2.2, STRAIGHT: 0.85, MIN_SPAN: 0.1, ONE_STEP: 0.6 },
    HOLD: 0.15, HOLD_ANGLE: 0.35, JERK_GAP: 0.9,
    HEAD_LAG: 4,
    RING_RATE: 0.3, RING_ON_T: 0.35, RING_OFF_T: 0.8, // the hand going round (turns/s) for RING_ON_T → the funnel; calm for RING_OFF_T → the cloud again
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
        this.ring = false; this.ringOn = 0; this.ringOff = 0;
        this.calm = 0; this.leave = 0;
        this.aims = []; // [{t, x, y, z}]
        this.pending = null; // a throw waiting to be confirmed: {t, x, y, z}
        this.lastSalvo = -9;
    }

    /** @returns {boolean} a salvo goes now */
    step(t, dt, rate, speed, aim, jerkList = null, sharp = null, canFire = true) {
        const r = Math.abs(rate);
        if (r >= INTENT.RING_RATE) { this.ringOn += dt; this.ringOff = 0; } else { this.ringOn = 0; if (r < INTENT.CALM_RATE) this.ringOff += dt; }
        if (!this.ring && this.ringOn >= INTENT.RING_ON_T) { this.ring = true; this.ringOff = 0; }
        else if (this.ring && this.ringOff >= INTENT.RING_OFF_T) this.ring = false;
        // the wand's way over the last LEAD_WINDOW s
        this.aims.push({ t, x: aim.x, y: aim.y, z: aim.z });
        while (this.aims.length && t - this.aims[0].t > INTENT.LEAD_WINDOW) this.aims.shift();
        if (!this.train) {
            if (this.ring) this.calm = 0;
            else if (r < INTENT.CALM_RATE && speed < INTENT.CALM_SPEED) this.calm += dt; else this.calm = 0;
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
