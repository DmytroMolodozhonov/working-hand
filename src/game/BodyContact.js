/**
 * BodyContact.js — players are solid: one hero's body never goes into another's.
 *
 * Seen from above, a hero is a capsule (a line with a round cap at each end):
 *   - standing, it lies across the shoulders — the round part is half the depth of
 *     the head (1.2 m), the ends reach the outer side of a hanging arm (0.9 m from
 *     the middle);
 *   - lying flat (flying like Superman, lying in a bed, knocked down), it runs along
 *     the body from the legs to the head.
 * A rider's body is the horse under them (from the hooves up to the rider's head).
 * Two bodies touch only where their heights overlap too, so a flyer passes over a head.
 *
 * A body goes from where it stood last frame to where it wants to be in short steps,
 * so a fast run, a gallop or a flight can't jump through somebody in one frame: it
 * stops against them and slides along.
 */

/** The hero (sizes from Character.js, metres from the body origin). */
export const HERO = {
    R: 0.6, // the round part: half the head's depth
    SHOULDER: 0.3, // + R = 0.9: the outer side of a hanging arm
    TOP: 2.85, // the top of the hair above the origin
    FEET: 2.0, // the soles below it (PLAYER_GROUND_OFFSET)
    CROUCH_FEET: 1.0, // crouching: the legs fold, the body is 1 m lower
    HEAD: 2.2, // lying flat: from the origin to the head ...
    LEGS: 1.4, // ... and to the legs
    FLAT: 0.65, // half the thickness of a lying body
};

/** A horse, in its own size (Animals.js: the body 0.75 × 1.7, the head 1.6 forward). */
export const MOUNT = { FRONT: 1.2, BACK: 0.5, R: 0.42 };

export const STEP = 0.3; // the longest move checked at once
export const TELEPORT = 8; // a longer jump in one frame is a teleport (respawn, a bed): no path to check

const EPS = 1e-9;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * A hero's body. (x, y, z): the body origin; yaw: where it faces; up: the world direction
 * of the body's own "up" ({x:0, y:1, z:0} standing; tilted when flying or lying).
 */
export function heroBody(x, y, z, yaw, up = null, crouch = false, out = {}) {
    const ux = up ? up.x : 0, uy = up ? up.y : 1, uz = up ? up.z : 0;
    if (Math.hypot(ux, uz) >= 0.5) {
        // lying / flying: from the legs to the head
        out.ax = x - ux * HERO.LEGS; out.az = z - uz * HERO.LEGS;
        out.bx = x + ux * HERO.HEAD; out.bz = z + uz * HERO.HEAD;
    } else {
        // standing: across the shoulders (the body's right is (cos yaw, −sin yaw))
        const sx = Math.cos(yaw) * HERO.SHOULDER, sz = -Math.sin(yaw) * HERO.SHOULDER;
        out.ax = x - sx; out.az = z - sz;
        out.bx = x + sx; out.bz = z + sz;
    }
    out.r = HERO.R;
    out.top = y + Math.max(HERO.TOP * uy, HERO.FLAT);
    out.bottom = y - Math.max((crouch ? HERO.CROUCH_FEET : HERO.FEET) * uy, HERO.FLAT);
    return out;
}

/** A horse (at x, z, its hooves at `ground`) with a rider whose head is at `top`. */
export function mountBody(x, ground, z, yaw, size, top, out = {}) {
    const fx = -Math.sin(yaw) * size, fz = -Math.cos(yaw) * size;
    out.ax = x + fx * MOUNT.FRONT; out.az = z + fz * MOUNT.FRONT;
    out.bx = x - fx * MOUNT.BACK; out.bz = z - fz * MOUNT.BACK;
    out.r = MOUNT.R * size;
    out.bottom = ground;
    out.top = top;
    return out;
}

/**
 * How deep body `a` is in body `b`, and which way `a` gets out:
 * out.depth (≤ 0: they don't touch) and the unit direction (out.nx, out.nz).
 * When the two lines cross, `a` goes out away from b's middle; on the very same spot,
 * along `fallback` ({x, z}; each computer picks the opposite one, so the two part).
 */
export function contact(a, b, fallback = null, out = {}) {
    out.depth = 0; out.nx = 1; out.nz = 0;
    if (a.top <= b.bottom || b.top <= a.bottom) return out; // one above the other
    // the closest points of the two lines (a: P(s), b: Q(t))
    const d1x = a.bx - a.ax, d1z = a.bz - a.az, d2x = b.bx - b.ax, d2z = b.bz - b.az;
    const rx = a.ax - b.ax, rz = a.az - b.az;
    const A = d1x * d1x + d1z * d1z, E = d2x * d2x + d2z * d2z, F = d2x * rx + d2z * rz;
    let s = 0, t = 0;
    if (A <= EPS && E <= EPS) { s = 0; t = 0; }
    else if (A <= EPS) { s = 0; t = clamp01(F / E); }
    else {
        const C = d1x * rx + d1z * rz;
        if (E <= EPS) { t = 0; s = clamp01(-C / A); }
        else {
            const B = d1x * d2x + d1z * d2z, den = A * E - B * B;
            s = den > EPS ? clamp01((B * F - C * E) / den) : 0;
            t = (B * s + F) / E;
            if (t < 0) { t = 0; s = clamp01(-C / A); }
            else if (t > 1) { t = 1; s = clamp01((B - C) / A); }
        }
    }
    let nx = a.ax + d1x * s - (b.ax + d2x * t), nz = a.az + d1z * s - (b.az + d2z * t);
    let d = Math.hypot(nx, nz);
    const need = a.r + b.r;
    if (d >= need) return out;
    if (d > 1e-6) { out.nx = nx / d; out.nz = nz / d; out.depth = need - d; return out; }
    // the lines cross: out away from the other's middle
    nx = (a.ax + a.bx - b.ax - b.bx) / 2; nz = (a.az + a.bz - b.az - b.bz) / 2;
    d = Math.hypot(nx, nz);
    if (d > 1e-4) { out.nx = nx / d; out.nz = nz / d; }
    else if (fallback && Math.hypot(fallback.x, fallback.z) > 1e-6) { const f = Math.hypot(fallback.x, fallback.z); out.nx = fallback.x / f; out.nz = fallback.z / f; }
    out.depth = need; // (another pass finishes the job if the cross needs more)
    return out;
}

const _me = {}, _c = {};

/**
 * Moves a body from `from` ({x, z}: where it stood, clear of everybody; null = no path,
 * just get out) to `to` ({x, z}), in steps no longer than STEP, keeping it out of all
 * `others` (bodies with an optional `fallback` direction). bodyAt(x, z, out) builds the
 * moving body at a place. Returns where it ends up: out {x, z, hit}.
 */
export function moveSolid(from, to, bodyAt, others, out = {}) {
    let x = to.x, z = to.z, n = 1, dx = 0, dz = 0;
    if (from) {
        const mx = to.x - from.x, mz = to.z - from.z, dist = Math.hypot(mx, mz);
        if (dist <= TELEPORT) {
            n = Math.max(1, Math.ceil(dist / STEP));
            x = from.x; z = from.z;
            dx = mx / n; dz = mz / n;
        }
    }
    out.hit = false;
    for (let i = 0; i < n; i++) {
        x += dx; z += dz;
        for (let pass = 0; pass < 4; pass++) {
            let pushed = false;
            for (const o of others) {
                const c = contact(bodyAt(x, z, _me), o, o.fallback, _c);
                if (c.depth <= 0) continue;
                x += c.nx * (c.depth + 1e-4);
                z += c.nz * (c.depth + 1e-4);
                pushed = out.hit = true;
            }
            if (!pushed) break;
        }
    }
    out.x = x; out.z = z;
    return out;
}
