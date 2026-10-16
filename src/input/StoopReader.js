/**
 * StoopReader.js — how far the person bends down (0 standing … 1 bent low), from the camera.
 *
 * The shoulders go down in the picture when the person bends forward or bends the knees, and
 * stay where they were when only the head looks down (so looking at the hands is no stoop).
 * Measured against the person's own standing height in the picture (the highest the shoulders
 * have been lately — a person stepping nearer or farther is learned again slowly), in shoulder
 * widths (the same at any distance from the camera). A little bob of a walk on the spot is no stoop.
 * Pure logic (no THREE).
 */

export const STOOP = {
    DEAD: 0.12, // shoulder widths the shoulders may drop without a stoop (a walk's bob, jitter)
    FULL: 0.4, // …more than DEAD by this: bent fully (the hero 1 m lower)
    TAU: 0.15, // s: the shoulders' height smoothed this much
    UP: 3, // 1/s: the standing height follows a taller stance this fast
    LEARN: 0.4, // 1/s: …and a lower one while standing (another place before the camera)
    LEARN_BENT: 0.02, // 1/s: …while bent (a long low tunnel is not forgotten)
};

export class StoopReader {
    constructor() { this.reset(); }

    reset() {
        this.y = null; // the shoulders' height (smoothed, image y — down is more)
        this.base = null; // …standing
        this.at = 0;
        this.value = 0;
    }

    /**
     * @param {Array|null} lm  pose landmarks (11, 12 — the shoulders)
     * @param {number} now  ms
     * @returns {number} 0…1
     */
    read(lm, now = performance.now()) {
        const ls = lm?.[11], rs = lm?.[12];
        if (!ls || !rs || (ls.visibility ?? 1) < 0.5 || (rs.visibility ?? 1) < 0.5) return this.value;
        const dt = this.at ? Math.min(0.5, Math.max(0, (now - this.at) / 1000)) : 0;
        this.at = now;
        const sw = Math.max(0.05, Math.abs(ls.x - rs.x));
        const y = (ls.y + rs.y) / 2;
        if (this.y == null) { this.y = this.base = y; return (this.value = 0); }
        this.y += (y - this.y) * Math.min(1, dt / STOOP.TAU);
        const drop = (this.y - this.base) / sw;
        const v = Math.max(0, Math.min(1, (drop - STOOP.DEAD) / STOOP.FULL));
        if (this.y < this.base) this.base += (this.y - this.base) * Math.min(1, dt * STOOP.UP);
        else this.base += (this.y - this.base) * Math.min(1, dt * (v > 0.05 ? STOOP.LEARN_BENT : STOOP.LEARN));
        return (this.value = v);
    }
}
