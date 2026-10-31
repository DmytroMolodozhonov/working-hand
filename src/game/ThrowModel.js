/**
 * ThrowModel.js — how a hand lets a thing go, as a person's hand does: a real throw (any — overhand, from the chest,
 * underhand, sidearm, a lob, down at the feet) or a calm opening of the hand. Pure logic (no THREE): tests and
 * tools/throwbench.mjs drive it with synthetic human kinematics.
 *
 * The author: «человек замахнулся, кинул — а предмет просто упал вниз»; «чтобы НИКОГДА больше не было, что человек
 * отпустил кисть, а ничего не получилось». What did that:
 *   1) the old gates looked at the hand NOW — but the camera and its filters deliver the opening of the fingers late
 *      (50–150 ms + one or two pictures), and by then the hand has already stopped: a throw that was not recognised
 *      as one fell through to the «opened outstretched hand» gate, which waits for a STILL hand and lets the thing
 *      drop at ≤ 2 m/s — «упал вниз»;
 *   2) a throw had to start with a wind-up behind the shoulder / by the head (a throw from the chest, underhand, a
 *      sidearm flick never counted), and its speed was read from a heavily smoothed velocity (lerp 0.3 a frame).
 *
 * Here every hand keeps a ring buffer (~0.7 s) of what the game saw: the hand in the body's space, in the world, the
 * fingers' closure, whether the camera saw the hand. The decision comes from SEVERAL signs together (the fingers
 * opening by an amplitude from a closed grip — not a fixed level — and staying open a camera picture or more; the
 * hand's speed and travel; the arm's pose for a calm opening), and its MOMENT is found back in the buffer: where the
 * fingers began to open (30% of the way). The thing leaves the hand with the hand's velocity of that moment
 * (regression over ~80 ms around it), the fastest within a few tens of ms — the fingers let go at the peak.
 *
 * States per hand: held → (moving: windup/accelerating) → release → flight, or held → open → drop.
 * A hand the camera lost: in a fast swing — a throw (the swing's peak, ≤ 6 pictures of loss); at rest — nothing,
 * the thing stays in the hand (the author: «предмет выпадает, только если человек явно разжал руку»).
 * Thresholds adapt to the player's own hand: the closed and open curl of THIS hand are learnt as it plays.
 */

export const RELEASE = {
    BUF_MS: 700, // the buffer's length
    VEL_WIN_MS: 110, // the velocity: a least-squares line through the hand's positions over this window (centred)
    OPEN_WIN_MS: 900, // the fingers were closed on the thing within this long before they opened …
    CLOSED_MIN: 0.48, // … this closed at least (or the learnt closed level − 0.25, the lower)
    DROP_MIN: 0.22, // the fingers opened by at least this from that grip (an amplitude: a pinch seen half open lets nothing go)
    OPEN_FRAC: 0.42, // «open» — this share of the way from the learnt open curl to the learnt closed one …
    OPEN_LO: 0.24, OPEN_HI: 0.5, // … bounded
    OPEN_REL: 0.35, // … or this far below the grip the fingers had a moment ago
    CONFIRM_MS: 35, // open for this long — and at least CONFIRM_CAM camera pictures (a throw)
    CONFIRM_CAM: 1.0,
    DROP_CONFIRM_MS: 80, // a calm opening: a little longer (no speed backs it up)
    DROP_CONFIRM_CAM: 1.3,
    REL_LEVEL: 0.3, // the thing slips when the fingers are this share of the way open
    PEAK_POST_MS: 25, // (the travel is counted up to this after the release)
    // the fingers are seen opening later than the hand is seen moving: the opening is caught on the first picture past
    // it and blended in over half a picture, the hand's velocity is a centred line (tools/throwbench.mjs: 15 ms + ~½ picture)
    CURL_LAG_MS: 10, CURL_LAG_CAM: 0,
    // …and the hand's own position comes through the wrist's 1€ filter and the blend between pictures ~40 ms later still:
    // its velocity at the release is read that much later in the buffer (throwbench: the direction's error 10° → 2–3°)
    POS_LAG_MS: 25,
    FAST: 6, FAST_WIN_MS: 60, // (a hand this fast: its speed read on a shorter line)
    TRACE_MAX: 1.7, TRACE_MIN: 0.5, // (the filter's cut given back: at most this much; only a swing this fast in the picture, per s)
    GAP_WIN_K: 1.6, // (the swing's peak in a gap: found on a wider line)
    VEL_WIN_CAM: 1.6, // (the velocity's window: at least this many camera pictures — the blend's steps averaged out)
    THROW_MIN: 2.4, // m/s against the body (game metres: the hero is 3.5 m tall): slower is a drop from a moving hand
    TRAVEL_MIN: 0.25, // m the hand travelled over the last TRAVEL_MS (a real move, not a tremble)
    TRAVEL_MS: 300,
    GAIN: 1.35, // the thing leaves faster than the wrist moves (the wrist's and fingers' flick at the end)
    ARM_MASS: 1.2, // kg-ish: the arm and the thing share the swing's energy — a heavy thing goes slower
    V_MAX: 30, // m/s: the fastest a light thing (≤ 0.2 kg) can be thrown (game metres)
    AIM_MAX: 10 * Math.PI / 180, // at most this much the flight is bent towards where the thrower looks
    AIM_UP: 0.12, // (one aims a little above the eyes)
    LOST_GAP_MS: 70, // no hand from the camera this long — it is lost
    LOST_CAM: 6, // a lost hand counts as a throw only within this many camera pictures …
    LOST_MAX_MS: 400, // … and at most this long
    BLUR_SPEED: 5, // the swing in which the camera lost the hand: this fast (m/s against the body) …
    BLUR_TRAVEL: 0.5, // … this long …
    BLUR_END: 0.55, // … and over (the speed fell below this share of its peak)
    BLUR_WAIT_CAM: 3, // … and the hand still not back for this many camera pictures
    LATE_MS: 360, // the fingers seen opening this soon after a hard swing ended: let go at its peak …
    LATE_SPEED: 3.5, // … a swing this fast (m/s against the body)
    DEFER_MS: 220, // (a hand still speeding up when the fingers are seen opening: waited for this long at most)
    LATE_KEEP: 0.8, // … the hand slower than this share of it when the fingers are seen open
    SHAPE_FWD: 0.25, SHAPE_UP: 0.4, DOWN_SPEED: 5, // a throw goes forward (this share of its speed) or up (a lob) — not down and back along the body
    // a calm opening lets go only from a free hand: held out, not hanging, palm not up (an apple on a flat palm stays)
    REACH: 0.6, FORWARD: 0.2, LEVEL: -0.75, PALM_UP: 0.6,
    HELD_MS: 400, // in the hand at least this long (taken just now: the fingers still closing)
    THROW_HELD_MS: 250, // (a throw: this long)
    LEARN: 0.02, // how fast the closed / open levels of this hand are learnt (per camera picture)
};

/**
 * Is this hand velocity (body space: z back) a throw's — forward, or up (a lob, a toss)? An arm lowered to the side as
 * the fingers relax goes down and BACK: that lets nothing fly (the author: «предмет выпадает, только если человек явно
 * разжал вытянутую руку или по-настоящему бросил»). A throw at the feet goes down AND forward.
 */
export function throwShape(v, speed) {
    const R = RELEASE;
    return speed > 0 && (-v.z >= R.SHAPE_FWD * speed || v.y >= R.SHAPE_UP * speed
        // (sideways — a sidearm let go late: across, not falling)
        || (Math.abs(v.x) >= 0.6 * speed && v.y >= -0.5 * speed)
        // (slammed straight down at the feet: hard, and not swinging back to the side)
        || (-v.y >= 0.8 * speed && v.z <= 0.3 * speed && speed >= R.DOWN_SPEED));
}

/** The fastest a thing of `m` kg can leave the hand (the arm's energy shared with the thing). */
export function speedCap(m) {
    const R = RELEASE;
    return R.V_MAX * Math.sqrt((R.ARM_MASS + 0.2) / (R.ARM_MASS + Math.max(0.01, m)));
}

/** The share of the hand's speed a thing of `m` kg keeps (momentum: the arm and the thing swing together) × the flick. */
export function massGain(m) {
    const R = RELEASE;
    return R.GAIN * Math.sqrt(R.ARM_MASS / (R.ARM_MASS + Math.max(0.01, m)));
}

/**
 * How each kind of thing flies, bounces, slides, rolls and swims. shape: 'round' rolls, 'long' spins end over end
 * when thrown and slides lengthwise, 'flat' flutters and slides flat, 'soft' plops and stays.
 *  e — restitution (how much of the speed into a surface comes back), mu — sliding friction, roll — rolling resistance,
 *  float — it floats in water (otherwise it sinks slowly), len — its length (m, spin from the flick)
 */
export const ITEM_PHYS = {
    apple: { shape: 'round', e: 0.38, mu: 0.4, roll: 0.06, float: true, len: 0.35 },
    redApple: { shape: 'round', e: 0.38, mu: 0.4, roll: 0.06, float: true, len: 0.35 },
    goldenApple: { shape: 'round', e: 0.35, mu: 0.4, roll: 0.06, float: false, len: 0.35 },
    baksadi_pear: { shape: 'round', e: 0.3, mu: 0.45, roll: 0.09, float: true, len: 0.4 },
    azure_berry: { shape: 'round', e: 0.3, mu: 0.4, roll: 0.08, float: true, len: 0.15 },
    crystal: { shape: 'round', e: 0.45, mu: 0.3, roll: 0.12, float: false, len: 0.4 },
    dragonEgg: { shape: 'round', e: 0.25, mu: 0.4, roll: 0.05, float: false, len: 0.7 },
    brightCore: { shape: 'round', e: 0.4, mu: 0.3, roll: 0.08, float: false, len: 0.3 },
    magicPebble: { shape: 'round', e: 0.5, mu: 0.45, roll: 0.15, float: false, len: 0.2 },
    flask: { shape: 'round', e: 0.3, mu: 0.3, roll: 0.07, float: true, len: 0.45 },
    potion: { shape: 'round', e: 0.3, mu: 0.3, roll: 0.07, float: true, len: 0.45 },
    cheese: { shape: 'round', e: 0.12, mu: 0.6, roll: 0.3, float: true, len: 0.4 },
    wand: { shape: 'long', e: 0.3, mu: 0.45, float: true, len: 0.75 },
    iceRod: { shape: 'long', e: 0.35, mu: 0.15, float: true, len: 2.2 },
    hammer: { shape: 'long', e: 0.15, mu: 0.6, float: false, len: 0.9 },
    bone: { shape: 'long', e: 0.35, mu: 0.5, float: true, len: 0.7 },
    logs: { shape: 'long', e: 0.2, mu: 0.6, float: true, len: 1.2 },
    arrows: { shape: 'long', e: 0.2, mu: 0.5, float: true, len: 1.0 },
    bow: { shape: 'long', e: 0.3, mu: 0.5, float: true, len: 1.6 },
    frost_shard: { shape: 'long', e: 0.4, mu: 0.1, float: true, len: 0.5 },
    book: { shape: 'flat', e: 0.12, mu: 0.65, float: true, len: 0.6 },
    scroll: { shape: 'long', e: 0.2, mu: 0.4, roll: 0.1, float: true, len: 0.7 }, // (rolls on its axis, flutters in the air)
    coins: { shape: 'soft', e: 0.08, mu: 0.8, float: false, len: 0.35 }, // (a pouch of coins: plops down with a clink)
    shield: { shape: 'flat', e: 0.2, mu: 0.55, float: true, len: 1.4 },
    glass: { shape: 'flat', e: 0.25, mu: 0.25, float: false, len: 0.5 },
    armor: { shape: 'flat', e: 0.1, mu: 0.7, float: false, len: 1.0 },
    robe: { shape: 'soft', e: 0.02, mu: 0.9, float: true, len: 1.0 },
    backpack: { shape: 'soft', e: 0.05, mu: 0.8, float: true, len: 0.8 },
};
const SOFT = { shape: 'soft', e: 0.05, mu: 0.85, float: true, len: 0.4 }; // bread, meat, herbs, feathers, wool…
const FLAT_LIGHT = { shape: 'flat', e: 0.05, mu: 0.8, float: true, len: 0.5 };
export function physOf(kind) {
    return ITEM_PHYS[kind] || (/feather|leaf|frond|grass|herb|hide|web|wool/i.test(kind) ? FLAT_LIGHT : SOFT);
}

/**
 * The spin a thrown thing takes (world axis × rad/s; out = {x,y,z}): the wrist's own turn (palmSpin) plus, for a long
 * thing, the end-over-end turn of a flick (its tip outruns the hand: ω ≈ k·v/len about the axis across the flight);
 * a flat one (a book, a shield) spins about its face like a thrown disc; a soft one barely turns.
 */
export function spinFor(kind, vel, palm, out = { x: 0, y: 0, z: 0 }) {
    const P = physOf(kind);
    const vx = vel.x, vy = vel.y, vz = vel.z, v = Math.hypot(vx, vy, vz);
    out.x = palm ? palm.x : 0; out.y = palm ? palm.y : 0; out.z = palm ? palm.z : 0;
    if (P.shape === 'soft') { out.x *= 0.3; out.y *= 0.3; out.z *= 0.3; return out; }
    if (v < 1) return out;
    // the axis across the flight, level: (vz, 0, −vx) / |·| — a forward throw turns end over end, tip over
    const hx = Math.hypot(vx, vz);
    const ax = hx > 1e-3 ? vz / hx : 1, az = hx > 1e-3 ? -vx / hx : 0;
    const k = P.shape === 'long' ? 0.55 : P.shape === 'flat' ? 0.25 : 0.35;
    const w = Math.min(28, (k * v) / Math.max(0.2, P.len));
    if (P.shape === 'flat') { out.y += w * 1.2; out.x += ax * w * 0.2; out.z += az * w * 0.2; } // (a disc's spin about up)
    else { out.x += ax * w; out.z += az * w; } // (tip over, the way it flies)
    return out;
}

/** Turn unit vector `d` towards unit `aim` by at most `max` radians (in place; d, aim {x,y,z}). */
export function bendToward(d, aim, max) {
    const dot = Math.max(-1, Math.min(1, d.x * aim.x + d.y * aim.y + d.z * aim.z));
    const ang = Math.acos(dot);
    if (ang < 1e-5) return d;
    const t = Math.min(1, max / ang);
    // slerp
    const s = Math.sin(ang);
    const a = Math.sin((1 - t) * ang) / s, b = Math.sin(t * ang) / s;
    const x = d.x * a + aim.x * b, y = d.y * a + aim.y * b, z = d.z * a + aim.z * b;
    const l = Math.hypot(x, y, z) || 1;
    d.x = x / l; d.y = y / l; d.z = z / l;
    return d;
}

/**
 * The wrist as the camera saw it (raw) and as the game's filter passed it on (filtered), picture by picture, in the
 * picture's units — so the peak the filter cut off a sharp swing can be given back: ratio(t0, t1) = the raw swing's
 * fastest speed over the filtered one's in that time (1 when the hand is slow or nothing is known). Filled by
 * PoseService for each wrist; pure.
 */
export class WristTrace {
    constructor(n = 32) {
        this.n = n; this.len = 0; this.head = -1;
        this.buf = Array.from({ length: n }, () => ({ t: 0, rx: 0, ry: 0, fx: 0, fy: 0 }));
    }
    push(t, rx, ry, fx, fy) {
        if (!Number.isFinite(rx) || !Number.isFinite(fx)) return;
        this.head = (this.head + 1) % this.n;
        const e = this.buf[this.head];
        e.t = t; e.rx = rx; e.ry = ry; e.fx = fx; e.fy = fy;
        if (this.len < this.n) this.len++;
    }
    _at(i) { return this.buf[(this.head - i + this.n * 4) % this.n]; }
    /** The raw swing's peak speed over the filtered one's within [t0, t1] (speeds over two pictures: less noise). */
    ratio(t0, t1, minSpeed = 0.5) {
        let rMax = 0, fMax = 0;
        for (let i = 0; i + 2 < this.len; i++) {
            const a = this._at(i), b = this._at(i + 2);
            if (a.t < t0) break;
            if (a.t > t1 + 60) continue;
            const dt = (a.t - b.t) / 1000;
            if (!(dt > 0)) continue;
            rMax = Math.max(rMax, Math.hypot(a.rx - b.rx, a.ry - b.ry) / dt);
            fMax = Math.max(fMax, Math.hypot(a.fx - b.fx, a.fy - b.fy) / dt);
        }
        if (fMax < minSpeed || rMax <= fMax) return 1; // (a slow hand: the noise would only add)
        return Math.min(RELEASE.TRACE_MAX, rMax / fMax);
    }
}

/** One hand's memory and decision. */
export class HandTrack {
    constructor(n = 96) {
        this.n = n;
        this.buf = Array.from({ length: n }, () => ({ t: 0, x: 0, y: 0, z: 0, wx: 0, wy: 0, wz: 0, yaw: 0, c: 0, seen: false }));
        this.closedRef = 0.82; // learnt: this hand's fist round a thing
        this.openRef = 0.1; // learnt: this hand's open fingers
        this._out = { act: null, why: null, at: 0, lag: 0, speed: 0, v: { x: 0, y: 0, z: 0 }, vRel: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 }, curl: 0, peak: 0, travel: 0, blur: false };
        this._v = { x: 0, y: 0, z: 0, wx: 0, wy: 0, wz: 0, n: 0 };
        this.reset();
    }

    /** A new thing in this hand (or the decision is over): forget the moves (not the learnt levels). */
    reset(armed = true) {
        this.len = 0; this.head = -1;
        this.armed = armed; // (a thing that came into an open hand: kept until the fingers closed on it once)
        this.openSince = -1; this.lostAt = -1; this.lostPeak = null; this.preLostCurl = 0;
        this.heldSince = -1; this.gap = null; this._deferSp = 0; // (this.trace: a WristTrace, set by the owner)
        this.state = 'held';
        this.camMs = 50;
    }

    _at(i) { return this.buf[(this.head - i + this.n * 4) % this.n]; } // i = 0: the newest

    /**
     * One frame. s: { t (ms), hand {x,y,z} (body space: x right, y up, z back), world {x,y,z}, yaw (the body's turn,
     * rad), curl (0 open … 1 fist, as tracked), seen (the camera has the hand now), fresh (a new camera picture this
     * frame), camMs (the camera's interval) }.
     */
    push(s) {
        this.head = (this.head + 1) % this.n;
        const e = this.buf[this.head];
        e.t = s.t; e.x = s.hand.x; e.y = s.hand.y; e.z = s.hand.z;
        e.wx = s.world.x; e.wy = s.world.y; e.wz = s.world.z; e.yaw = s.yaw || 0;
        e.c = s.curl; e.seen = !!s.seen;
        if (this.len < this.n) this.len++;
        if (s.camMs > 0) this.camMs = s.camMs;
        if (this.heldSince < 0) this.heldSince = s.t;
        // learn this hand's own closed and open levels (only from fresh pictures of a seen hand)
        if (s.seen && s.fresh) {
            const L = RELEASE.LEARN;
            if (s.curl > 0.55) this.closedRef += (Math.min(1, s.curl) - this.closedRef) * L;
            else if (s.curl < 0.3) this.openRef += (Math.max(0, s.curl) - this.openRef) * L;
            this.closedRef = Math.max(0.55, Math.min(1, this.closedRef));
            this.openRef = Math.max(0, Math.min(0.3, this.openRef));
        }
        if (s.seen && s.curl > Math.max(RELEASE.CLOSED_MIN, this.closedRef - 0.25)) this.armed = true;
    }

    /** The open level for THIS hand. */
    openLevel() {
        const R = RELEASE;
        return Math.max(R.OPEN_LO, Math.min(R.OPEN_HI, this.openRef + R.OPEN_FRAC * (this.closedRef - this.openRef)));
    }

    /**
     * The hand's velocity at time t (least squares over VEL_WIN_MS centred on t; the newest samples only on one side).
     * Fills this._v (body space x,y,z and world wx,wy,wz). Returns the speed (body space) or −1.
     */
    velAt(t, win = Math.max(RELEASE.VEL_WIN_MS, RELEASE.VEL_WIN_CAM * this.camMs)) {
        const h = win / 2;
        let n = 0, st = 0, stt = 0, sx = 0, sy = 0, sz = 0, stx = 0, sty = 0, stz = 0, swx = 0, swy = 0, swz = 0, stwx = 0, stwy = 0, stwz = 0;
        for (let i = 0; i < this.len; i++) {
            const e = this._at(i);
            if (e.t > t + h) continue;
            if (e.t < t - h) break;
            const dt = (e.t - t) / 1000;
            n++; st += dt; stt += dt * dt;
            sx += e.x; sy += e.y; sz += e.z; stx += dt * e.x; sty += dt * e.y; stz += dt * e.z;
            swx += e.wx; swy += e.wy; swz += e.wz; stwx += dt * e.wx; stwy += dt * e.wy; stwz += dt * e.wz;
        }
        const v = this._v;
        v.n = n;
        const den = n * stt - st * st;
        // (a slow computer draws few frames: the window holds too few of them — the chord between the frames either side of
        // t; only with none on a side, a wider window)
        if (n < 3 || den < 1e-9) {
            let a = null, b = null;
            for (let i = 0; i < this.len; i++) { const e = this._at(i); if (e.t > t) b = e; else { a = e; break; } }
            if (a && b && b.t - a.t >= 8 && b.t - a.t <= 3 * win) {
                const dt = (b.t - a.t) / 1000;
                v.x = (b.x - a.x) / dt; v.y = (b.y - a.y) / dt; v.z = (b.z - a.z) / dt;
                v.wx = (b.wx - a.wx) / dt; v.wy = (b.wy - a.wy) / dt; v.wz = (b.wz - a.wz) / dt; v.n = 2;
                return Math.hypot(v.x, v.y, v.z);
            }
            if (win < 400 && this.len >= 3) return this.velAt(t, win * 1.6);
        }
        if (n < 2 || den < 1e-9) { v.x = v.y = v.z = v.wx = v.wy = v.wz = 0; return -1; }
        v.x = (n * stx - st * sx) / den; v.y = (n * sty - st * sy) / den; v.z = (n * stz - st * sz) / den;
        v.wx = (n * stwx - st * swx) / den; v.wy = (n * stwy - st * swy) / den; v.wz = (n * stwz - st * swz) / den;
        return Math.hypot(v.x, v.y, v.z);
    }

    /** The sample nearest to time t. */
    _near(t) {
        let best = null, bd = Infinity;
        for (let i = 0; i < this.len; i++) { const e = this._at(i), d = Math.abs(e.t - t); if (d < bd) { bd = d; best = e; } if (e.t < t - 200) break; }
        return best;
    }

    /** How far the hand travelled (body space, path length) over [t0, t1]. */
    travel(t0, t1) {
        let d = 0, p = null;
        for (let i = this.len - 1; i >= 0; i--) {
            const e = this._at(i);
            if (e.t < t0 || e.t > t1) continue;
            if (p) d += Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
            p = e;
        }
        return d;
    }

    /**
     * The fastest moment within [t0, t1] (velocity regression each sample): {t, speed} into `out` and this._v holds its
     * velocity afterwards.
     */
    peakIn(t0, t1, out = { t: 0, speed: -1 }, wk = 1, shaped = false) {
        out.t = t0; out.speed = -1;
        const win = wk * Math.max(RELEASE.VEL_WIN_MS, RELEASE.VEL_WIN_CAM * this.camMs);
        for (let i = 0; i < this.len; i++) {
            const e = this._at(i);
            if (e.t > t1) continue;
            if (e.t < t0) break;
            const s = this.velAt(e.t, win);
            if (s > out.speed && (!shaped || throwShape(this._v, s))) { out.speed = s; out.t = e.t; }
        }
        if (out.speed >= 0) this.velAt(out.t);
        return out;
    }

    /**
     * Where (in time) the fingers began to let go: going back from now, the last time the curl was above the grip
     * level cHi − REL_LEVEL·(cHi − cNow). Linear between the two samples around it.
     */
    releaseTime(cHi, cNow, now) {
        const lvl = cHi - RELEASE.REL_LEVEL * (cHi - cNow);
        let later = null;
        for (let i = 0; i < this.len; i++) {
            const e = this._at(i);
            if (!e.seen) { later = null; continue; }
            if (e.c >= lvl) {
                if (!later) return e.t;
                const k = (e.c - lvl) / Math.max(1e-6, e.c - later.c);
                return e.t + k * (later.t - e.t) - RELEASE.CURL_LAG_MS - RELEASE.CURL_LAG_CAM * this.camMs;
            }
            later = e;
            if (now - e.t > RELEASE.OPEN_WIN_MS) break;
        }
        return now;
    }

    /** The highest curl seen within OPEN_WIN_MS (a seen hand). */
    _gripMax(now, before = Infinity) {
        let m = 0;
        for (let i = 0; i < this.len; i++) {
            const e = this._at(i);
            if (now - e.t > RELEASE.OPEN_WIN_MS) break;
            if (e.seen && e.t <= before && e.c > m) m = e.c;
        }
        return m;
    }

    /**
     * Fill the launch into `o` from the release moment tr: the hand's velocity there (the fastest within the camera's
     * grain), its position, the body's turn. Returns the speed against the body.
     */
    _launch(tr, now, o) {
        const R = RELEASE;
        o.cut = 1;
        const tv = tr + R.POS_LAG_MS; // (the hand's position timeline)
        const pk = this._pk || (this._pk = { t: 0, speed: -1 });
        pk.t = tv; pk.speed = this.velAt(tv);
        // (a fast hand: a shorter line — a sharp push from the chest peaks for ~0.1 s, the long line halves it; the camera's
        // noise is small against such a speed)
        if (pk.speed > R.FAST) { const s2 = this.velAt(tv, Math.max(R.FAST_WIN_MS, R.VEL_WIN_CAM * this.camMs * 0.75)); if (s2 > pk.speed) pk.speed = s2; else this.velAt(tv); }
        if (pk.speed < 0) this.velAt(now);
        const v = this._v;
        o.vRel.x = v.x; o.vRel.y = v.y; o.vRel.z = v.z;
        o.v.x = v.wx; o.v.y = v.wy; o.v.z = v.wz;
        o.speed = Math.max(0, pk.speed);
        // (the filter cut off the swing's peak: given back as the raw camera picture says — PoseService's wrist trace)
        if (this.trace && o.speed > R.FAST) {
            const k = this.trace.ratio(tv - R.POS_LAG_MS - 160, tv + 40, R.TRACE_MIN);
            if (k > 1) {
                const c = Math.cos(this._near(tv)?.yaw || 0), sn = Math.sin(this._near(tv)?.yaw || 0), d = k - 1;
                o.v.x += d * (o.vRel.x * c + o.vRel.z * sn); o.v.y += d * o.vRel.y; o.v.z += d * (-o.vRel.x * sn + o.vRel.z * c);
                o.vRel.x *= k; o.vRel.y *= k; o.vRel.z *= k; o.speed *= k; o.cut = k;
            }
        }
        const e = this._near(pk.speed >= 0 ? pk.t : tv) || this._at(0);
        o.pos.x = e.wx; o.pos.y = e.wy; o.pos.z = e.wz; o.yaw = e.yaw;
        o.at = tr; o.lag = now - tr;
        o.travel = this.travel(tv - R.TRAVEL_MS, tv + R.PEAK_POST_MS);
        return o.speed;
    }

    /**
     * Decide this frame. ctx: { t, arm {reach, forward, up, palmUp} (the arm now), weight (kg), strict (the leading
     * hand's wand: never let go by opening, never thrown from a hand the camera lost), blocked (a reason nothing may
     * leave the hand now: swimming, reading… — or null) }.
     * @returns {object|null} null — nothing; else {act:'throw'|'drop', why, at (ms), lag, speed, v (world velocity of the hand
     *   at release), vRel (body space), pos (the hand's world position at release), travel, curl, peak, blur}
     *   — or {act:null, why} when the fingers opened but it stays (for the journal).
     */
    decide(ctx) {
        const R = RELEASE, o = this._out;
        if (!this.len) return null;
        const e = this._at(0), t = ctx.t;
        o.act = null; o.why = null; o.blur = false; o.curl = e.c; o.peak = 0; o.late = 0;
        if (ctx.blocked) { this.openSince = -1; this.lostAt = -1; return null; }
        // ---- the camera lost the hand
        if (!e.seen) {
            if (this.lostAt < 0) { this.lostAt = t; this.preLostCurl = this._gripMax(t); this.lostPeak = null; }
            const lostFor = t - this.lostAt;
            const lostMax = Math.min(R.LOST_MAX_MS, R.LOST_CAM * this.camMs);
            const sp = this.velAt(t - R.VEL_WIN_MS / 2);
            if (lostFor <= lostMax + R.VEL_WIN_MS && sp >= 0 && (!this.lostPeak || sp > this.lostPeak.speed)) this.lostPeak = { speed: sp, t: t - R.VEL_WIN_MS / 2 - R.POS_LAG_MS }; // (kept in the fingers' timeline: _launch reads the hand POS_LAG later)
            this.openSince = -1;
            // a strong swing that has come to its end while the hand is lost: the fingers let go in it — a throw at its peak
            const p = this.lostPeak;
            if (!ctx.strict && this.armed && p && this.preLostCurl >= Math.max(R.CLOSED_MIN, this.closedRef - 0.3)
                && p.speed >= R.BLUR_SPEED && sp >= 0 && sp < p.speed * R.BLUR_END
                // (the camera gets its chance to see the hand again first: a punch with a thing in the fist comes back closed)
                && lostFor >= Math.min(lostMax, R.BLUR_WAIT_CAM * this.camMs) && lostFor <= lostMax + 120) {
                this._launch(this._gapPeak(this.lostAt, t).t, t, o);
                if (o.travel >= R.BLUR_TRAVEL && this._notABlow(o, ctx.weight) && throwShape(o.vRel, o.speed)) {
                    o.act = 'throw'; o.blur = true; o.peak = p.speed;
                    o.why = `бросок: кисть пропала в замахе (${Math.round(lostFor)} мс), пик ${p.speed.toFixed(1)} м/с`;
                    this.state = 'flight';
                    return o;
                }
            }
            return null;
        }
        // ---- the hand came back after a loss
        let back = false;
        if (this.lostAt >= 0) {
            const lostFor = t - this.lostAt, lostMax = Math.min(R.LOST_MAX_MS, R.LOST_CAM * this.camMs);
            const wasHeld = this.preLostCurl >= Math.max(R.CLOSED_MIN, this.closedRef - 0.3);
            const gk = this._gapPeak(this.lostAt, t);
            this.gap = { t0: this.lostAt, t1: t, peak: gk.speed >= 0 ? { t: gk.t, speed: gk.speed } : null, opened: this.preLostCurl - e.c >= 0.12 }; // (the fingers may be seen opening a little later)
            this.lostAt = -1;
            if (wasHeld && this.armed && e.c <= Math.max(this.openLevel(), this.preLostCurl - R.OPEN_REL) && this.preLostCurl - e.c >= R.DROP_MIN && lostFor <= lostMax * 1.5) {
                // came back open: it was let go in the loss — at the swing's peak, if there was a swing
                const gp0 = this.gap.peak;
                if (gp0 && gp0.speed >= R.THROW_MIN) {
                    this._launch(gp0.t, t, o);
                    if (!ctx.strict && o.speed >= R.THROW_MIN && throwShape(o.vRel, o.speed)) { o.act = 'throw'; o.blur = true; o.peak = gp0.speed; o.why = `бросок: кисть вернулась разжатой после пропажи ${Math.round(lostFor)} мс`; this.state = 'flight'; return o; }
                }
                back = true;
            }
        }
        // ---- the fingers opening
        const cHi = this._gripMax(t);
        // (open: below this hand's open level, or far enough below the grip it had — the hand's filter lets the
        // fingers' last bit of opening come slowly, a throw's fingers are open long before the curl says «0.2»)
        const lvl = Math.max(this.openLevel(), cHi - R.OPEN_REL);
        const opening = this.armed && e.c <= lvl && cHi >= Math.max(R.CLOSED_MIN, Math.min(this.closedRef - 0.25, 0.75)) && cHi - e.c >= R.DROP_MIN;
        const openAny = e.c <= lvl;
        if (!opening && !back) {
            this.openSince = -1; this._deferSp = 0;
            if (openAny && !this.armed) { o.why = 'вещь попала в раскрытую руку — сначала сожмите на ней пальцы'; return o; }
            if (openAny && cHi < Math.max(R.CLOSED_MIN, this.closedRef - 0.25)) { o.why = `пальцы не были сжаты на вещи перед разжатием (макс ${cHi.toFixed(2)})`; return o; }
            return null;
        }
        if (this.openSince < 0) this.openSince = t;
        const openFor = t - this.openSince;
        let tr = this.releaseTime(cHi, e.c, t);
        // (the fingers last seen closed before the camera lost the hand, seen open after it: they opened in the gap —
        // in a swing at its fastest moment, else in its middle)
        const gp = this.gap;
        if (gp && t - gp.t1 < R.OPEN_WIN_MS && tr >= gp.t0 - 120 && (tr <= gp.t1 + 20 || (gp.opened && tr <= gp.t1 + 60 + this.camMs))) {
            const gk = this._gapPeak(gp.t0, gp.t1); // (again: the hand's positions after the gap are in the buffer now)
            tr = gk.speed >= R.THROW_MIN ? gk.t : (gp.t0 + gp.t1) / 2;
        }
        this._launch(tr, t, o);
        o.peak = o.speed;
        // the hand still speeding up past the moment the fingers were seen opening (a short sharp push: the wrist's filter
        // shows the hand's move later than the fingers'): the thing is still in it — it goes at the end of the push. Wait
        // for that end (≤ DEFER_MS), then take the push's fastest moment.
        if (!ctx.strict) {
            const half = Math.max(R.VEL_WIN_MS, R.VEL_WIN_CAM * this.camMs) / 2;
            const cur = this.velAt(t - half * 0.5), curShape = throwShape(this._v, cur);
            if (cur >= R.THROW_MIN && curShape && cur > o.speed * 1.15 && t - tr < R.DEFER_MS) {
                if (cur >= (this._deferSp || 0) * 0.97) { this._deferSp = Math.max(this._deferSp || 0, cur); return null; } // (still rising)
            }
            if (this._deferSp) {
                const pk = this.peakIn(tr + R.POS_LAG_MS, t, this._pk4 || (this._pk4 = { t: 0, speed: -1 }), 1, true);
                if (pk.speed > o.speed * 1.15) { this._launch(pk.t - R.POS_LAG_MS, t, o); o.at = tr; o.lag = t - tr; o.peak = o.speed; }
                this._deferSp = 0;
            }
        }
        // (a thing taken a moment ago: the hand's move was the taking — a pouch's fingers often seen open as it comes in)
        let throwing = o.speed >= R.THROW_MIN && o.travel >= R.TRAVEL_MIN && t - this.heldSince >= R.THROW_HELD_MS && throwShape(o.vRel, o.speed);
        // the fingers seen opening a little after a hard swing that has just ended (blur: the camera reads the fingers late,
        // or keeps «seeing» them closed while the hand flies): nobody holds a thing through a hard swing to open the hand at
        // its stop — it went at the swing's fastest moment
        // (also a hand still slowing after it: the thing left at the peak, a hand that lets go while braking throws weakly
        // — people let go at the fastest moment)
        if (!ctx.strict && t - this.heldSince >= R.THROW_HELD_MS) {
            // (the fastest moment of a throw's shape: an overhand's follow-through goes down — the throw was before it)
            const pk = this.peakIn(tr + R.POS_LAG_MS - R.LATE_MS, tr + R.POS_LAG_MS, this._pk3 || (this._pk3 = { t: 0, speed: -1 }), 1, true);
            if (pk.speed >= R.LATE_SPEED && (o.speed < pk.speed * R.LATE_KEEP || !throwing) && pk.t < tr + R.POS_LAG_MS - 30) {
                const sp0 = o.speed;
                const late = this._late || (this._late = { act: null, why: null, at: 0, lag: 0, speed: 0, v: { x: 0, y: 0, z: 0 }, vRel: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 }, curl: 0, peak: 0, travel: 0, blur: false });
                this._launch(pk.t - R.POS_LAG_MS, t, late);
                if (late.travel >= R.BLUR_TRAVEL && throwShape(late.vRel, late.speed)) {
                    Object.assign(o.vRel, late.vRel); Object.assign(o.v, late.v); Object.assign(o.pos, late.pos);
                    o.speed = late.speed; o.yaw = late.yaw; o.at = late.at; o.lag = late.lag; o.travel = late.travel; o.peak = late.speed;
                    o.late = Math.round(tr - late.at + 0) || 0;
                    throwing = true;
                    o.why = `бросок: пальцы увидены раскрытыми через ${o.late} мс после пика замаха ${late.speed.toFixed(1)} м/с (рука уже ${sp0.toFixed(1)} м/с)`;
                }
            }
        }
        if (throwing && !ctx.strict) {
            if (openFor < Math.max(R.CONFIRM_MS, R.CONFIRM_CAM * this.camMs) && !back) { o.why = null; o.act = null; return null; }
            o.act = 'throw';
            if (!o.late) o.why = `бросок: пальцы раскрылись ${cHi.toFixed(2)}→${e.c.toFixed(2)}, скорость руки ${o.speed.toFixed(1)} м/с, путь ${o.travel.toFixed(2)} м`;
            this.state = 'flight';
            return o;
        }
        // a calm opening: only a free hand (held out, not hanging, palm not up), held long enough
        const a = ctx.arm || {};
        let why = null;
        if (ctx.strict) why = 'палочка в ведущей руке — только настоящий бросок';
        else if (t - this.heldSince < R.HELD_MS) why = 'вещь только что взята';
        else if (!(a.reach > R.REACH)) why = `рука прижата к телу (вытянута на ${(a.reach ?? 0).toFixed(2)} из ${R.REACH})`;
        else if (!(a.forward > R.FORWARD)) why = `рука не перед собой (${(a.forward ?? 0).toFixed(2)})`;
        else if (!(a.up > R.LEVEL)) why = 'рука висит вниз вдоль тела';
        else if (a.palmUp != null && !(a.palmUp < R.PALM_UP)) why = 'ладонь смотрит вверх — вещь лежит на ней';
        if (why) { o.why = why; return o; }
        if (openFor < Math.max(R.DROP_CONFIRM_MS, R.DROP_CONFIRM_CAM * this.camMs) && !back) return null;
        o.act = 'drop';
        o.why = `разжатие: пальцы ${cHi.toFixed(2)}→${e.c.toFixed(2)}, рука ${(a.reach ?? 0).toFixed(2)}, скорость ${o.speed.toFixed(1)} м/с`;
        this.state = 'drop';
        return o;
    }

    /**
     * The swing's fastest moment around a gap in the camera's sight of the hand [t0, t1] (the fingers' timeline): the
     * hand's positions there are read POS_LAG later; a little before the gap too (the blur starts at the peak).
     * Returns {t (the fingers' timeline), speed} (a shared object).
     */
    _gapPeak(t0, t1) {
        const R = RELEASE, g = this._gk || (this._gk = { t: 0, speed: -1 });
        const pk = this.peakIn(t0 - 40, t1 + R.POS_LAG_MS, this._pk2 || (this._pk2 = { t: 0, speed: -1 }), R.GAP_WIN_K); // (a wider line: the max of a noisy speed is biased up)
        g.t = pk.t - R.POS_LAG_MS; g.speed = pk.speed;
        return g;
    }

    /**
     * The swing of the last ~0.35 s as a throw (the leading hand's wand: its own strict detector decided; the flight
     * comes from here) — the fastest moment, read on a wider line.
     */
    swing(t) {
        const R = RELEASE, o = this._out;
        const pk = this.peakIn(t - 350, t, this._pk2 || (this._pk2 = { t: 0, speed: -1 }), R.GAP_WIN_K);
        this._launch(pk.speed >= 0 ? pk.t - R.POS_LAG_MS : t, t, o);
        o.act = 'throw'; o.blur = false; o.peak = o.speed; o.why = null; o.curl = this.len ? this._at(0).c : 0;
        return o;
    }

    /** A heavy thing swung down hard is a blow, not a throw (the camera lost the hand in it). */
    _notABlow(o, weight = 1) {
        const fwd = -o.vRel.z, down = -o.vRel.y;
        return fwd > 0 && fwd >= down * (weight < 1 ? 0.5 : 1.2);
    }
}

/**
 * The launch velocity in the world (out {x,y,z}) for a decision `o` of HandTrack:
 *  the hand's own velocity against the body, turned into the world, × massGain(m) (the flick, the thing's weight),
 *  bent towards where the thrower looks by ≤ AIM_MAX, limited to speedCap(m); plus the body's own motion (running,
 *  a horse, a ship: the world velocity of the hand minus its own motion against the body).
 * A drop (act 'drop'): the hand's world velocity as it is — the thing falls FROM the moving hand, never «from zero».
 * look: unit {x,y,z} where the eyes look (or null); yaw — the body's turn (rotation.y) at release.
 */
export function launchVelocity(o, m, look, out = { x: 0, y: 0, z: 0 }) {
    const R = RELEASE;
    // the hand's velocity against the body, in the world's axes (the body turned by yaw about up)
    const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0);
    const rx = o.vRel.x * c + o.vRel.z * s, ry = o.vRel.y, rz = -o.vRel.x * s + o.vRel.z * c;
    // the body's own motion (world hand velocity − its motion against the body)
    const bx = o.v.x - rx, by = o.v.y - ry, bz = o.v.z - rz;
    if (o.act !== 'throw') {
        out.x = o.v.x; out.y = o.v.y; out.z = o.v.z;
        const l = Math.hypot(out.x, out.y, out.z), cap = Math.min(6, speedCap(m));
        if (l > cap) { out.x *= cap / l; out.y *= cap / l; out.z *= cap / l; }
        return out;
    }
    const sp = Math.hypot(rx, ry, rz);
    if (sp < 1e-6) { out.x = bx; out.y = by; out.z = bz; return out; }
    const d = { x: rx / sp, y: ry / sp, z: rz / sp };
    if (look) {
        const lx = look.x, lz = look.z, lh = Math.hypot(lx, lz) || 1;
        const pitch = Math.asin(Math.max(-1, Math.min(1, look.y))) + R.AIM_UP;
        const aim = { x: (lx / lh) * Math.cos(pitch), y: Math.sin(pitch), z: (lz / lh) * Math.cos(pitch) };
        // (only towards a target in front of the throw: a throw back over the shoulder is not turned round)
        if (d.x * aim.x + d.y * aim.y + d.z * aim.z > 0.3) bendToward(d, aim, R.AIM_MAX);
    }
    const v = Math.min(speedCap(m), sp * massGain(m));
    out.x = d.x * v + bx; out.y = d.y * v + by; out.z = d.z * v + bz;
    return out;
}

/**
 * The launch point: the hand's position at release moved on along the flight for the time the decision took
 * (`lag` ms) — the thing has been flying meanwhile; gravity g (m/s²). out {x,y,z}.
 */
export function launchPoint(pos, vel, lagMs, g = 14, out = { x: 0, y: 0, z: 0 }) {
    const t = Math.max(0, Math.min(0.3, lagMs / 1000));
    out.x = pos.x + vel.x * t; out.y = pos.y + vel.y * t - 0.5 * g * t * t; out.z = pos.z + vel.z * t;
    return out;
}

/**
 * A thing touching a surface with normal n (unit) at velocity v (in place, {x,y,z}): restitution along the normal,
 * Coulomb friction along it (the tangential speed loses μ·(1+e)·|vn|), a round thing keeps rolling. Returns the
 * normal speed it came in with (for the sound / resting).
 */
export function bounce(v, n, P) {
    const vn = v.x * n.x + v.y * n.y + v.z * n.z;
    if (vn >= 0) return 0;
    const tx = v.x - vn * n.x, ty = v.y - vn * n.y, tz = v.z - vn * n.z;
    const tl = Math.hypot(tx, ty, tz);
    const mu = P.shape === 'round' ? Math.min(P.mu, 0.25) : P.mu;
    const loss = tl > 1e-6 ? Math.min(1, (mu * (1 + P.e) * -vn) / tl) : 1;
    const k = 1 - loss;
    v.x = tx * k - P.e * vn * n.x; v.y = ty * k - P.e * vn * n.y; v.z = tz * k - P.e * vn * n.z;
    return -vn;
}

/**
 * On the ground (level): the thing slides with friction μ·g, or rolls (round) with rolling resistance — horizontal
 * velocity (in place, {x,z}); returns true when it has stopped.
 */
export function groundSlide(v, P, g, dt) {
    const sp = Math.hypot(v.x, v.z);
    const dec = (P.shape === 'round' ? (P.roll ?? 0.06) : P.mu) * g * dt;
    if (sp <= dec || sp < 0.08) { v.x = 0; v.z = 0; return true; }
    const k = (sp - dec) / sp;
    v.x *= k; v.z *= k;
    return false;
}
