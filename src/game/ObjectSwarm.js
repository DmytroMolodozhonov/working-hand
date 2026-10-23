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
    SHIELD_R: 2.3,
    SHIELD_R2: 3.2,
    SHIELD_RINGS: 4,
    SHIELD_COLS: 12,
    SHIELD_CAP: 96,
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
/** The shield slot of block i (the first SHIELD_CAP): {ring 0…3, col 0…11, shell 0|1, r, y, ph}. null: it circles outside. */
export function shieldSlot(i, out = {}) {
    if (i >= SW.SHIELD_CAP) return null;
    const per = SW.SHIELD_RINGS * SW.SHIELD_COLS;
    const shell = i >= per ? 1 : 0;
    const s = ((shell ? i - per : i) * 5) % per;
    out.shell = shell;
    out.ring = s % SW.SHIELD_RINGS;
    out.col = Math.floor(s / SW.SHIELD_RINGS);
    out.r = shell ? SW.SHIELD_R2 : SW.SHIELD_R;
    out.y = -1.35 + out.ring * 1.2 + (shell ? 0.5 : 0);
    out.ph = (out.col + out.ring * 0.5 + (shell ? 0.25 : 0)) * (TAU / SW.SHIELD_COLS);
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

