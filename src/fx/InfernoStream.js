/**
 * InfernoStream.js — the «Инферно» flame stream: its rules (pure, Node-testable)
 * and its look.
 *
 *   The stream    comes out of the caster's hand and FOLLOWS that hand every
 *                 frame (on every computer: other players see it too). It grows
 *                 out to its full length in ~0.3 s and widens a little with distance.
 *   Mana          10 when it starts (Combat.SPELL_COST.Inferno), then DRAIN (3) a second
 *                 while it is held, and none comes back meanwhile (5 s held ≈ 10 + 15).
 *                 No mana left → it goes out (everywhere).
 *                 It lasts at most LIFE seconds; «стоп» puts it out sooner.
 *   Stopped by    - a raised «Protection» facing the flame (or a dome, a shield in the
 *                   hand): the flame splashes on it, the one behind it is not burnt;
 *                 - water: a water ball (held, flying or lying), the water of a
 *                   «Water Vortex» (round its caster, flying, a bubble), water blocks
 *                   (rivers, lakes, the sea): steam hisses there, nothing beyond burns;
 *                 - solid blocks (it spreads over the wall).
 *   Burns         every creature it reaches (players, zombies, villagers, knights,
 *                 wizards, animals, spiders, living trees…), trees and dry blocks
 *                 catch fire.
 *   It is NOT a duel spell: it never flies as a charge, it is a stream from the hand.
 */

export const INFERNO = {
    RANGE: 22, // m: the full length of the stream
    GROW: 0.3, // s to grow out to the full length
    LIFE: 5, // s at most while held
    DRAIN: 3, // mana a second while it is held (after the 10 to start it)
    SPEED: 19, // m/s of the flames along the stream
    R0: 0.3, // m: the stream's radius at the hand…
    SPREAD: 0.06, // …and how much wider it gets per metre
    STEP: 0.5, // m between the checks for water / walls along the stream
    BURN_TICK: 0.25, // s between burns of the things in the stream (trees, animals, villagers…)
    COUNT_AFTER: 0.6, // s: a stream held this long is a real «Инферно» — its first time counts for the mana (Mana.success)
};

/** The stream's length after `t` seconds (it grows out, quickly at first). */
export function infernoReach(t) {
    const k = Math.min(1, Math.max(0, t / INFERNO.GROW));
    return INFERNO.RANGE * (1 - (1 - k) * (1 - k));
}

/** The stream's radius `along` metres from the hand. */
export function flameRadius(along) {
    return INFERNO.R0 + INFERNO.SPREAD * Math.max(0, along);
}

/** Mana a held flame takes in `dt` seconds. */
export function infernoDrain(dt) {
    return INFERNO.DRAIN * Math.max(0, dt);
}

/**
 * Where the ray o + d·t (d unit) first enters a sphere (c, r), within [0, maxT].
 * null when it misses — or when the ray starts inside it (the flame comes out of it).
 */
export function raySphere(o, d, c, r, maxT = Infinity) {
    const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
    const cc = ox * ox + oy * oy + oz * oz - r * r;
    if (cc <= 0) return null;
    const b = ox * d.x + oy * d.y + oz * d.z;
    if (b > 0) return null; // going away
    const disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t >= 0 && t <= maxT ? t : null;
}

/** How far `p` is along the stream and from its axis: {along, off}. */
export function streamOffset(o, d, p) {
    const px = p.x - o.x, py = p.y - o.y, pz = p.z - o.z;
    const along = px * d.x + py * d.y + pz * d.z;
    const qx = px - d.x * along, qy = py - d.y * along, qz = pz - d.z * along;
    return { along, off: Math.sqrt(qx * qx + qy * qy + qz * qz) };
}

/** Is the point `p` (a body of radius `bodyR`) in a stream of length `len`? */
export function inStream(o, d, len, p, bodyR = 0.5) {
    const { along, off } = streamOffset(o, d, p);
    if (along < -bodyR || along > len + bodyR) return false;
    return off < flameRadius(Math.max(0, along)) + bodyR;
}

/**
 * Where the stream stops.
 * @param {{x,y,z}} o  the hand
 * @param {{x,y,z}} d  unit direction
 * @param {number} len  how long it is now
 * @param {object} w
 *   waters: [{x, y, z, r}]  water balls / vortex water / bubbles
 *   shields: [{x, y, z, r}] the bodies whose raised shield faces the flame (the shield
 *                           stands r metres in front of the centre)
 *   blockAt(x, y, z) → 'water' | 'solid' | null  (the world's blocks)
 * @returns {{t: number, by: null|'water'|'shield'|'solid'}}
 */
export function streamStop(o, d, len, w = {}) {
    let t = len, by = null;
    for (const s of w.waters || []) {
        const h = raySphere(o, d, s, s.r, t);
        if (h != null && h < t) { t = h; by = 'water'; }
    }
    for (const s of w.shields || []) {
        const { along, off } = streamOffset(o, d, s);
        if (along <= 0 || off > flameRadius(along) + 0.6) continue;
        const h = Math.max(0, along - (s.r ?? 0.8));
        if (h < t) { t = h; by = 'shield'; }
    }
    if (w.blockAt) {
        for (let s = INFERNO.STEP; s < t; s += INFERNO.STEP) {
            const b = w.blockAt(o.x + d.x * s, o.y + d.y * s, o.z + d.z * s);
            if (b === 'water' || b === 'solid') { t = s; by = b; break; }
        }
    }
    return { t, by };
}

const WHITE = [0xfffbe6, 0xfff2b0, 0xffe680];
const TONGUE = [0xffb030, 0xff8a1a, 0xff6400, 0xf04a00, 0xd42a00, 0xa81800];
const SMOKE = [0x6a625c, 0x5a524d, 0x7a726b]; // (grey: what burns smokes — not black blocks out of the flame itself)
const STEAM = [0xe8eef2, 0xd5dde2, 0xffffff];
const pick = (a) => a[(Math.random() * a.length) | 0];

/**
 * The look: a white-yellow core, orange / red tongues, dark smoke, embers, a
 * flickering glow. Pooled particles only (Effects pools): no allocation per frame.
 * Rates are per second; about 800 particles are alive while it burns.
 */
export class InfernoLook {
    constructor(fx) {
        this.fx = fx;
        this.acc = { core: 0, tongue: 0, smoke: 0, ember: 0, end: 0 };
        this.t = 0;
    }

    _n(key, rate, dt, max) {
        this.acc[key] += rate * dt;
        const n = Math.min(max, Math.floor(this.acc[key]));
        this.acc[key] -= n;
        return n;
    }

    /**
     * One frame of the stream from `o` along `d` (unit), `len` long; `end` says what stopped it.
     * `right` / `up` are unit vectors across the stream.
     */
    draw(dt, o, d, len, end, right, up) {
        const fx = this.fx;
        if (!fx || dt <= 0) return;
        this.t += dt;
        const V = INFERNO.SPEED;
        const life = Math.max(0.05, len / V);
        const flick = 0.75 + 0.25 * Math.sin(this.t * 37) * Math.sin(this.t * 23 + 1.3);
        const glow = fx.glow, smoke = fx.smoke, sparks = fx.sparks;
        // the hot core: white-yellow, narrow, fast
        for (let i = this._n('core', 260, dt, 12); i > 0; i--) {
            const a = Math.random() * 6.283, r = Math.random() * 0.06;
            const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
            const sp = V * (1.02 + Math.random() * 0.12);
            glow.spawn(
                o.x + right.x * ox + up.x * oy, o.y + right.y * ox + up.y * oy, o.z + right.z * ox + up.z * oy,
                d.x * sp + (right.x * ox + up.x * oy) * 4, d.y * sp + (right.y * ox + up.y * oy) * 4, d.z * sp + (right.z * ox + up.z * oy) * 4,
                pick(WHITE), 0.16 + Math.random() * 0.1, life * (0.45 + Math.random() * 0.25), { shrink: 0.6 / life, spin: 3 });
        }
        // the tongues: orange → red, they spread out and grow as they go
        for (let i = this._n('tongue', 420, dt, 16); i > 0; i--) {
            const a = Math.random() * 6.283, r = 0.08 + Math.random() * 0.12;
            const ca = Math.cos(a), sa = Math.sin(a);
            const sp = V * (0.88 + Math.random() * 0.2);
            const lat = INFERNO.SPREAD * sp * (0.6 + Math.random() * 0.9); // (the stream widens with distance)
            glow.spawn(
                o.x + (right.x * ca + up.x * sa) * r, o.y + (right.y * ca + up.y * sa) * r, o.z + (right.z * ca + up.z * sa) * r,
                d.x * sp + (right.x * ca + up.x * sa) * lat, d.y * sp + (right.y * ca + up.y * sa) * lat + 0.6, d.z * sp + (right.z * ca + up.z * sa) * lat,
                pick(TONGUE), (0.22 + Math.random() * 0.22) * flick, life * (0.8 + Math.random() * 0.2), { shrink: -1.6, spin: 7 });
        }
        // smoke: only where the flame meets something and burns it (a wall, a shield…), rising
        // softly from above the flame there — a fire smokes from what burns, not from its middle
        if (end && end !== 'water') {
            const R = flameRadius(len);
            for (let i = this._n('smoke', 14, dt, 2); i > 0; i--) {
                const s = len * (0.9 + Math.random() * 0.1);
                smoke.spawn(o.x + d.x * s + (Math.random() - 0.5) * R, o.y + d.y * s + R + 0.3 + Math.random() * 0.3, o.z + d.z * s + (Math.random() - 0.5) * R,
                    (Math.random() - 0.5) * 0.5, 1.0 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5,
                    pick(SMOKE), 0.25 + Math.random() * 0.2, 1.4 + Math.random() * 0.8, { shrink: -0.9, spin: 0.8 });
            }
        }
        // embers: tiny bright bits flying off and falling
        for (let i = this._n('ember', 40, dt, 3); i > 0; i--) {
            const s = len * Math.random() * 0.8;
            const sp = V * (0.4 + Math.random() * 0.4);
            sparks.spawn(o.x + d.x * s, o.y + d.y * s, o.z + d.z * s,
                d.x * sp + (Math.random() - 0.5) * 4, d.y * sp + Math.random() * 3, d.z * sp + (Math.random() - 0.5) * 4,
                Math.random() < 0.5 ? 0xffc040 : 0xff7a20, 0.05 + Math.random() * 0.04, 0.6 + Math.random() * 0.7, { shrink: 0.8, gravity: -7 });
        }
        // where it was stopped
        if (end) this._end(dt, o.x + d.x * len, o.y + d.y * len, o.z + d.z * len, d, end, right, up);
        // the flickering firelight halfway along the stream
        fx.lightFlash({ x: o.x + d.x * len * 0.4, y: o.y + d.y * len * 0.4, z: o.z + d.z * len * 0.4 }, 0xff7a2a, 1.6 + 1.1 * flick, 0.12, 16);
    }

    _end(dt, x, y, z, d, end, right, up) {
        const fx = this.fx;
        if (end === 'water') {
            // steam: white puffs rising and swelling, a few hot droplets
            for (let i = this._n('end', 70, dt, 5); i > 0; i--) {
                fx.smoke.spawn(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.6,
                    -d.x * 1.5 + (Math.random() - 0.5) * 2, 2 + Math.random() * 2.5, -d.z * 1.5 + (Math.random() - 0.5) * 2,
                    pick(STEAM), 0.3 + Math.random() * 0.3, 0.9 + Math.random() * 0.6, { shrink: -1.8, spin: 1 });
            }
            return;
        }
        // a shield or a wall: the flame splashes sideways over it
        const blue = end === 'shield';
        for (let i = this._n('end', blue ? 130 : 90, dt, 8); i > 0; i--) {
            const a = Math.random() * 6.283, ca = Math.cos(a), sa = Math.sin(a);
            const sp = 5 + Math.random() * 5;
            fx.glow.spawn(x - d.x * 0.15, y - d.y * 0.15, z - d.z * 0.15,
                (right.x * ca + up.x * sa) * sp - d.x * 2, (right.y * ca + up.y * sa) * sp - d.y * 2 + 0.8, (right.z * ca + up.z * sa) * sp - d.z * 2,
                blue && i % 3 === 0 ? 0x9fd8ff : pick(TONGUE), 0.2 + Math.random() * 0.2, 0.25 + Math.random() * 0.2, { shrink: -1, spin: 6 });
        }
    }
}
