/**
 * HandRelease.js — when a held thing leaves the hand. Never by accident:
 *
 *  1) DropGate: the person clearly opens an OUTSTRETCHED hand — the arm stretched
 *     out in front (not hanging at the side), the fingers really open for a
 *     moment, the hand still (not in the middle of a swing), the palm not turned up
 *     (an apple on a flat palm, offered to a horse, stays on it);
 *  2) ThrowDetector: a real throw — a wind-up (the hand up by the head or behind the
 *     shoulder), a fast swing forward / down while the fingers still hold it, and
 *     the fingers opening at the end of the swing.
 *
 * A hand the camera lost never lets go (whatever its drawn fingers do); running,
 * crouching or turning never throw (the speeds are the hand's own, against the body).
 * Pure logic: the inputs come from Character.armState().
 */

export const DROP = {
    OPEN: 0.25, // fingers this open (tracked curl) …
    CLOSED: 0.5, // (a thing that came into an open hand: kept until the fingers closed this far once)
    HOLD_MS: 250, // … for this long
    REACH: 0.8, // the hand this far from the shoulder (× the arm's length): stretched out
    FORWARD: 0.5, // cos of the arm to the body's front
    LEVEL: -0.6, // the arm no more than ~37° below level (a hanging arm is not stretched out)
    STILL: 2.5, // m/s against the body
    PALM_UP: 0.6, // cos of the palm's face to up
};
export const THROW = {
    UP: 0.3, // wind-up: the hand this far above the shoulder …
    BACK: 0.1, // … or behind it (the body's space)
    DEPTH: 0.12, // (the camera's depth: the wrist this much further than the shoulder)
    WINDOW_MS: 900, // the swing must start this soon after the wind-up
    SPEED: 6, // m/s against the body …
    PER_KG: 0.3, // … a little more for heavier things (they leave the hand slower anyway)
    TRAVEL: 0.6, // the hand travels this far from the wind-up
    OPEN: 0.4, // the fingers let go
    HOLD: 0.5, // (they held the thing during the swing)
    LATE_MS: 450, // the fingers must open this soon after the fastest moment (the camera sees them open a little late)
    BEHIND: 0.4, // (the camera sees the wrist behind the shoulder: the real hand is this far behind it)
    END: 0.45, // the swing has ended: its speed fell below this share of the fastest (a hand lost in the blur)
};

/** The camera's depth says the wrist is behind the shoulder (pose z: bigger = further from the camera). */
export const poseBehind = (pose, side) => {
    const w = pose?.[side + 'Wrist'], s = pose?.[side + 'Shoulder'];
    return !!(w && s && (w.z || 0) - (s.z || 0) > THROW.DEPTH);
};

export class DropGate {
    constructor() { this.reset(true); }

    /** armed=false: the thing came into an open hand («Акцио», a slot) — kept until the hand has closed once. */
    reset(armed = true) { this.armed = armed; this.since = 0; }

    /**
     * @param {object} s  now (ms), curl (tracked 0..1), tracked, reach (|hand−shoulder| / arm length),
     *   forward (cos to the body's front), up (sin of the arm's elevation), speed (vs the body, m/s),
     *   palmUp (cos of the palm's face to up)
     * @returns {boolean} let go now
     */
    update({ now, curl, tracked, reach, forward, up = 0, speed = 0, palmUp = 0 }) {
        if (!tracked) { this.since = 0; return false; } // a lost hand never drops
        if (curl > DROP.CLOSED) this.armed = true;
        const opening = this.armed && curl < DROP.OPEN && reach > DROP.REACH && forward > DROP.FORWARD
            && up > DROP.LEVEL && speed < DROP.STILL && palmUp < DROP.PALM_UP;
        if (!opening) { this.since = 0; return false; }
        if (!this.since) this.since = now;
        return now - this.since >= DROP.HOLD_MS;
    }
}

export class ThrowDetector {
    constructor() { this.reset(); }

    reset() { this.cockAt = -1e9; this.cock = null; this.peak = null; this.held = false; this.back = false; this.seenHold = false; }

    /** The swing (peak) went forward/up, not down, strong enough, and has slowed down: its end. */
    blurred(speed) {
        const p = this.peak;
        const [x, y, z] = p.vRel;
        const fwd = -z, down = -y;
        return p.speed > (THROW.SPEED + 2) && fwd > 0 && fwd >= down * 1.2 && Math.hypot(x, y, z) > 0 && speed < p.speed * THROW.END;
    }

    /**
     * @param {object} s  now (ms); hand, shoulder, vRel: the body's space (x right, y up, z back),
     *   vWorld [x,y,z] (the hand's world speed); curl, tracked; behind (the camera sees the wrist
     *   behind the shoulder); weight (the thing's)
     * @returns {null|{speed:number, vRel:number[], vWorld:number[], at:number}} the throw, at the fingers' opening
     */
    update({ now, hand, shoulder, vRel, vWorld, curl, tracked, behind = false, weight = 1, blurOk = false }) {
        const speed = Math.hypot(vRel.x, vRel.y, vRel.z);
        if (!this.peak && (hand.y - shoulder.y > THROW.UP || hand.z - shoulder.z > THROW.BACK || behind)) {
            this.cockAt = now;
            if (!this.cock) { this.held = false; this.back = false; }
            // (the arm model always guesses the arm in front of the body: a wrist the camera saw
            // behind the shoulder is really back there — the swing starts from behind)
            if (behind) this.back = true;
            this.cock = { x: hand.x, y: hand.y, z: this.back ? Math.max(hand.z, shoulder.z + THROW.BEHIND) : hand.z };
        }
        if (this.cock && !this.peak && now - this.cockAt > THROW.WINDOW_MS) this.cock = null;
        if (!this.cock) return null;
        if (tracked && curl > THROW.HOLD) this.held = true; // (a real throw starts with the thing held)
        if (this.held && speed > THROW.SPEED + THROW.PER_KG * weight && (-vRel.z > 0 || vRel.y < 0)
            && Math.hypot(hand.x - this.cock.x, hand.y - this.cock.y, hand.z - this.cock.z) > THROW.TRAVEL
            && (!this.peak || speed > this.peak.speed)) this.peak = { speed, vRel: [vRel.x, vRel.y, vRel.z], vWorld: [...vWorld], at: now };
        if (!this.peak) return null;
        if (now - this.peak.at > THROW.LATE_MS) { this.reset(); return null; } // the fist kept hold: a chop, not a throw
        if (tracked && curl < THROW.OPEN) { const p = this.peak; this.reset(); return p; } // (a hand lost in the blur waits ≤450 ms)
        if (tracked && curl > THROW.HOLD) this.seenHold = true; // (seen still gripping after the swing: a chop)
        // the camera lost the hand in the swing's blur: a strong swing FORWARD (not down, as a blow is)
        // that has come to its end lets go — people throw this way and the fingers are rarely seen opening
        // (blurOk: things only — a sword's thrust forward must never throw it)
        if (blurOk && !tracked && !this.seenHold && this.blurred(speed)) { const p = this.peak; this.reset(); return p; }
        return null;
    }
}
