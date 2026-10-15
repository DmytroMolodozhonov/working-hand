/**
 * StepReader.js — walking and running from the legs: steps on the spot.
 *
 * A step is a leg lifted (LegReader: the knee up, or the heel kicked up behind)
 * after the OTHER leg. One leg alone (a kick, the Earthquake stomp, a knee
 * shaking) is no step; both up at once (a jump, a squat, sitting) is no step;
 * while crouching nothing counts. So walking starts with the second leg — a
 * real walk at once, never a stray movement.
 *
 * How fast: the cadence (steps a second) and how high the legs go. Slow steps
 * walk (0), quick or high ones run (up to 1). Stopped stepping: it stops as soon
 * as the next step is clearly late (~1.5 of the last step's time), no coasting.
 *
 * Seen only down to the hips (a close camera): a knee lifted into the picture is
 * a lift (LegReader.hipsOnly) — the same steps. Legs not seen at all (or not
 * readable: both look up all the time), and no steps from the knees: the old
 * way, the body bobbing from the steps (the shoulders up and down). Legs seen
 * standing still: the shoulders' bob is NOT walking.
 * Pure (Node-testable).
 */

export const STEPS = {
    WALK_RATE: 1.4, // steps a second: a walk (intensity 0) up to this
    RUN_RATE: 3.2, // … a full run from this
    HIGH: 0.35, // high knees (the knee up past half a torso, to the hip at 0.9) add up to this to the intensity
    GAP_MS: 1500, // a step after this long: a new start (not a cadence)
    LATE: 1.5, // the next step later than this × the last step's time: stopped
    MIN_HOLD_MS: 350, // (but never sooner than this after a step)
    MAX_HOLD_MS: 1200, // (nor later than this — a leg held up long walks on, see below)
    BOB_FRAMES: 8,
};

export class StepReader {
    constructor() {
        this.lifts = { left: 0, right: 0 };
        this.lastSide = null;
        this.lastAt = -1e9;
        this.steps = []; // the last steps' times
        this.peak = 0; // how high the current lift went
        this.heights = [];
        this.walking = false;
        this.kneeStepAt = -1e9;
        this.intensity = 0;
        this.t = null;
        this.bob = [];
        this.crouchAt = -1e9;
        this.wasCrouching = false;
    }

    /**
     * @param {object|null} legs LegReader.read() result
     * @param {number|null} shoulderY the shoulders' height in the picture (for the bob fallback)
     * @param {boolean} crouching
     * @returns {{isRunning: boolean, runIntensity: number, steps: boolean}}
     */
    read(legs, shoulderY, crouching, now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
        const dt = this.t == null ? 1 / 30 : Math.min(0.2, Math.max(0, (now - this.t) / 1000));
        this.t = now;
        if (crouching !== this.wasCrouching) { this.crouchAt = now; this.wasCrouching = crouching; }
        const L = legs?.left, R = legs?.right;
        const bothUp = !!(L && R && L.up && R.up);
        let target = 0, moving = false;
        if (legs?.seen && L && R) {
            for (const [side, leg, other] of [['left', L, R], ['right', R, L]]) {
                const lifted = leg.lifts > this.lifts[side];
                this.lifts[side] = leg.lifts;
                if (!lifted || crouching || other.up) continue; // (one leg after the other only)
                if (this.lastSide === side) { this.lastAt = -1e9; this.steps.length = 0; this.walking = false; } // (the same leg again: a kick, a stomp)
                if (now - this.lastAt > STEPS.GAP_MS) this.steps.length = 0;
                else this.walking = true; // (the second leg: walking)
                if (this.steps.length && this.peak) { this.heights.push(this.peak); if (this.heights.length > 3) this.heights.shift(); }
                this.peak = 0;
                this.steps.push(now);
                if (this.steps.length > 4) this.steps.shift();
                this.lastSide = side;
                this.lastAt = now;
            }
            const cur = this.lastSide ? (this.lastSide === 'left' ? L : R) : null;
            if (cur?.up) this.peak = Math.max(this.peak, cur.heel ? 0.5 : (cur.lift ?? 0.5));
            if (this.walking && !crouching && !bothUp) {
                const n = this.steps.length;
                const last = n > 1 ? (this.steps[n - 1] - this.steps[0]) / (n - 1) : 700;
                const since = now - this.lastAt;
                const hold = Math.min(STEPS.MAX_HOLD_MS, Math.max(STEPS.MIN_HOLD_MS, last * STEPS.LATE));
                // (a slow high step: the leg still up walks on until it is put down)
                if (since < hold || (cur?.up && since < STEPS.GAP_MS)) {
                    moving = true;
                    const rate = 1000 / Math.max(last, since * 0.8); // (a late step slows the pace down)
                    const hs = this.heights.length ? this.heights.reduce((a, b) => a + b, 0) / this.heights.length : 0.5;
                    target = clamp01((rate - STEPS.WALK_RATE) / (STEPS.RUN_RATE - STEPS.WALK_RATE) + clamp01((hs - 0.5) / 0.4) * STEPS.HIGH);
                    this.kneeStepAt = now;
                } else { this.walking = false; this.steps.length = 0; }
            }
        }
        // the fallback: no legs to read (not seen; or both look up all the time — the knees at the hips,
        // seen badly; or a close camera with the knees below the picture) and no steps from the knees
        let bobbing = false;
        if (shoulderY != null) {
            this.bob.push(shoulderY);
            if (this.bob.length > STEPS.BOB_FRAMES) this.bob.shift();
        }
        const noLegs = !legs?.seen || bothUp || (legs.hipsOnly && !(L.up || R.up));
        if (!moving && noLegs && now - this.kneeStepAt > 1000 && now - this.crouchAt > 500 && this.bob.length >= 3) {
            let total = 0;
            for (let i = 1; i < this.bob.length; i++) total += Math.abs(this.bob[i] - this.bob[i - 1]);
            const k = clamp01((total - 0.02) / 0.13);
            if (k > 0.1) { bobbing = true; moving = true; target = k; }
        }
        // smoothing: quick to start and to slow down, never a long coast
        if (!moving) this.intensity = 0;
        else if (bobbing) this.intensity = target;
        else this.intensity += (target - this.intensity) * Math.min(1, dt * (target > this.intensity ? 6 : 8));
        return { isRunning: moving, runIntensity: moving ? this.intensity : 0, steps: moving && !bobbing };
    }
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
