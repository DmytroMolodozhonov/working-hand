/**
 * JumpReader.js — a real jump, from the camera's body points.
 *
 * A jump is the WHOLE body going up in the picture at once: the hips, the shoulders and the
 * head together (image y goes down), fast, and higher than where this person stands — with the
 * feet seen, the ankles leave their place too. Then it comes back down (the landing).
 *
 * What is NOT a jump (each one is checked):
 *   a nod / the head tipped back      — only the head moves, the hips stay;
 *   leaning forward / back            — the shoulders go down or aside, the hips don't rise;
 *   standing up from a squat          — back up to the standing height only, never above it;
 *   steps on the spot, running        — the body bobs a little (well under the threshold), and
 *                                       the standing height is learned from the tops of the bobs;
 *   rising on tiptoe                  — slow (the standing height follows a slow rise);
 *   coming closer to / going away from the camera — the body grows / shrinks: the shoulders and
 *                                       the hips go apart / together, not up together (and the
 *                                       torso's length changes — everything is measured in it);
 *   a jerk of the camera, a lost pose — one frame only: a jump has to hold for two camera frames,
 *                                       and a gap in the pose starts the reading over.
 * Seen only down to the hips (the legs below the picture): the shoulders and the hips rising
 * together, with a stricter threshold.
 *
 * Strength 0..1: how fast and how high the body went up (a little hop — low, a real jump — high).
 * Counters (`jumps`, `lands`) only ever grow, as in LegReader: safe when a pose result is shown
 * for several frames — the game takes the difference.
 * `rise`: where the hips are now against their standing height (− = squatting: LedgeClimb tells a squat
 * from palms pressed down on an edge).
 * Pure (Node-testable).
 */

export const JUMP = {
    RISE: 0.11,       // the hips and the shoulders above the standing height (torso lengths): in the air
    RISE_HIPS: 0.2,   // … seen only down to the hips (no feet to confirm it)
    SPEED: 1.4,       // and going up at least this fast (torso lengths / s)
    SPEED_HIPS: 2.0,
    MATCH: 0.55,      // the shoulders' rise and the hips' rise within this share of each other
    SCALE: 0.15,      // the torso's length changed more than this (closer / further): not a jump
    SIDE: 1.0,        // the body moved sideways more than up (× the rise): not a jump
    ANKLE: 0.05,      // seen feet: the ankles up from their place at least this much (torso lengths)
    HOLD: 2,          // camera frames the body has to be up (a camera's jerk is one or two)
    SQUAT: 0.2,       // the body this far below the standing height (torso lengths): a squat — the standing height stays
    LAND: 0.07,       // back within this of the standing height: landed
    AIR_MAX: 1500,    // ms: no landing seen (the pose lost in the air) — taken as landed
    AGAIN: 250,       // ms after a landing before the next jump
    GAP: 250,         // ms without a pose: the reading starts over
    WIN: 300,         // ms of history (the push off the ground)
    V_MAX: 7,         // speed (torso lengths / s) of the strongest jump
    H_MAX: 0.9,       // rise (torso lengths) of the strongest jump
    VIS: 0.5,
};

const vis = (p) => !!p && (p.visibility ?? 1) >= JUMP.VIS && p.y > -0.05 && p.y < 0.985;

export class JumpReader {
    constructor() { this.reset(); this.jumps = 0; this.lands = 0; this.strength = 0; this.at = 0; this.rise = 0; }

    reset() {
        this.hist = [];
        this.base = null;  // the standing body: {hip, sh, T, ank, x}
        this.rise = 0;     // the body above (+) / below (−) the standing height now (torso lengths)
        this.air = false;
        this.up = 0;       // frames up so far
        this.seen = -1e9;
        this.landAt = this.landAt || -1e9;
        this._last = null;
    }

    /**
     * @param {Array} lm pose landmarks (33)
     * @param {number} now ms
     * @returns {{air: boolean, jumps: number, lands: number, strength: number, at: number}}
     */
    read(lm, now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
        if (lm && lm !== this._last) { this._last = lm; this._step(lm, now); }
        else if (!lm && this.air && now - this.at > JUMP.AIR_MAX) this._land(now);
        return { air: this.air, jumps: this.jumps, lands: this.lands, strength: this.strength, at: this.at, rise: this.rise };
    }

    _step(lm, now) {
        const ok = lm.length >= 29 && vis(lm[11]) && vis(lm[12]) && vis(lm[23]) && vis(lm[24]);
        if (!ok) { if (this.air && now - this.at > JUMP.AIR_MAX) this._land(now); return; }
        if (now - this.seen > JUMP.GAP) { const a = this.air; this.hist = []; this.base = null; this.up = 0; if (a) this._land(now); }
        this.seen = now;
        const hip = (lm[23].y + lm[24].y) / 2, sh = (lm[11].y + lm[12].y) / 2, x = (lm[23].x + lm[24].x + lm[11].x + lm[12].x) / 4;
        const T = Math.max(0.05, hip - sh);
        const feet = vis(lm[27]) && vis(lm[28]);
        const ank = feet ? (lm[27].y + lm[28].y) / 2 : null;
        const f = { t: now, hip, sh, T, x, ank };
        this.hist.push(f);
        while (this.hist.length > 2 && now - this.hist[0].t > JUMP.WIN) this.hist.shift();
        // speed up (torso lengths / s) over the last ~100 ms
        let v = 0;
        for (let i = this.hist.length - 2; i >= 0; i--) {
            const h = this.hist[i], dt = (now - h.t) / 1000;
            if (dt <= 0) continue;
            v = Math.max(v, (h.hip - hip) / T / dt);
            if (now - h.t > 110) break;
        }
        const B = this.base;
        if (!B) { this.base = { hip, sh, T, x, ank }; return; }
        if (feet && B.ank == null) B.ank = ank;
        const T0 = B.T;
        const rH = (B.hip - hip) / T0, rS = (B.sh - sh) / T0; // (+ = up)
        this.rise = rH; // (the hips over / under their standing height now: − a squat; leaning moves the shoulders only — LedgeClimb)

        if (this.air) {
            // the strength grows while the body still goes up (how high it went)
            this.strength = Math.max(this.strength, this._power(this.vPeak = Math.max(this.vPeak, v), Math.min(rH, rS)));
            if (rH < JUMP.LAND || now - this.at > JUMP.AIR_MAX) this._land(now);
            return;
        }

        const hipsOnly = !feet;
        const need = hipsOnly ? JUMP.RISE_HIPS : JUMP.RISE, speed = hipsOnly ? JUMP.SPEED_HIPS : JUMP.SPEED;
        const rise = Math.min(rH, rS);
        const match = Math.abs(rH - rS) <= JUMP.MATCH * Math.max(rH, rS);
        const sameSize = Math.abs(T / T0 - 1) <= JUMP.SCALE;
        const straight = Math.abs(x - B.x) / T0 <= JUMP.SIDE * Math.max(rise, 0.01);
        // the push that got it there: fast (the fastest moment of the last ~300 ms)
        let vPush = 0;
        for (let i = 1; i < this.hist.length; i++) {
            const a = this.hist[i - 1], b = this.hist[i], dt = (b.t - a.t) / 1000;
            if (dt > 0) vPush = Math.max(vPush, (a.hip - b.hip) / T0 / dt);
        }
        const feetOff = !feet || B.ank == null || (B.ank - ank) / T0 >= JUMP.ANKLE;
        const looks = rise >= need && match && sameSize && straight && vPush >= speed && feetOff && now - this.landAt > JUMP.AGAIN;
        this.up = looks ? this.up + 1 : 0;
        if (this.up >= JUMP.HOLD) {
            this.air = true;
            this.jumps++;
            this.at = now;
            this.vPeak = vPush;
            this.strength = this._power(vPush, rise);
            this.up = 0;
            return;
        }
        if (looks || this.up) return; // (maybe a jump starting: the standing height waits)
        // the standing body: quick to learn a higher one when the body is still (the top of a bob,
        // standing up straight), slow to believe a lower one (a squat is not the new standing)
        // (a body that stays another size — it came closer or went away — is learned anew)
        this.resize = Math.abs(T / T0 - 1) > 0.12 ? (this.resize || 0) + 1 : 0;
        if (this.resize >= 10) { this.base = { hip, sh, T, x, ank }; this.resize = 0; return; }
        const still = Math.abs(v) < 0.8;
        const k = (now1, then) => now1 < then ? (still ? 0.3 : 0.02) : ((now1 - then) / T0 < JUMP.SQUAT ? 0.01 : 0);
        B.hip += (hip - B.hip) * k(hip, B.hip);
        B.sh += (sh - B.sh) * k(sh, B.sh);
        B.T += (T - B.T) * 0.02;
        B.x += (x - B.x) * 0.2;
        if (feet) B.ank += (ank - B.ank) * k(ank, B.ank);
    }

    _power(v, rise) {
        const sv = Math.max(0, Math.min(1, (v - JUMP.SPEED) / (JUMP.V_MAX - JUMP.SPEED)));
        const sh = Math.max(0, Math.min(1, (rise - JUMP.RISE) / (JUMP.H_MAX - JUMP.RISE)));
        return Math.max(0.1, Math.min(1, (sv + sh) / 2));
    }

    _land(now) {
        this.air = false;
        this.lands++;
        this.landAt = now;
        this.up = 0;
    }
}
