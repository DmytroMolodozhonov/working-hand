/**
 * LegReader.js — what the legs do, from the camera's knees and ankles.
 *
 * Per leg: is it lifted (the knee up towards the hip, or the heel kicked up
 * behind), is the foot planted, and three counters that only ever grow:
 *   lifts  — the leg went up, plants — it came down again,
 *   strokes — a lift and a plant within 1.2 s (one paddling stroke).
 * Counters (not one-frame events) are safe when the game repeats a pose result
 * for several frames (PoseSmoother) — the reader takes the difference.
 *
 * Image y grows downwards. A standing knee is about half a torso below the hip,
 * a lifted one comes up to the hip; a kicked-back heel comes up to the knee.
 * Pure (Node-testable).
 */

export const LEGS = {
    UP: 0.26, // knee this far below the hip (in torso lengths) or less: lifted
    DOWN: 0.40, // … this far or more: down again (hysteresis)
    HEEL: 0.25, // the shin looks this short (the foot kicked up behind)
    STROKE_MS: 2500, // (a slow stroke still pushes the water)
    SEEN_MS: 500,
};

export class LegReader {
    constructor() {
        this.L = { left: this._leg(), right: this._leg() };
        this.seenAt = -1e9;
        this._last = null;
    }

    _leg() { return { up: false, heel: false, below: 0.5, f: null, shin: 0, lifts: 0, plants: 0, strokes: 0, liftAt: 0 }; }

    /**
     * @param {Array} lm pose landmarks (33)
     * @returns {{seen: boolean, left: object, right: object}} each leg: {up, heel, planted, below, lifts, plants, strokes, liftAt}
     */
    read(lm, now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
        if (lm && lm !== this._last && lm[23] && lm[11]) {
            this._last = lm;
            const T = Math.abs((lm[23].y + lm[24].y) / 2 - (lm[11].y + lm[12].y) / 2) || 0.3;
            for (const [side, hip, knee, ankle] of [['left', 23, 25, 27], ['right', 24, 26, 28]]) {
                const S = this.L[side], k = lm[knee], h = lm[hip], a = lm[ankle];
                if (!k || !h || (k.visibility ?? 1) < 0.5 || (h.visibility ?? 1) < 0.5) continue;
                this.seenAt = now;
                const raw = (k.y - h.y) / T;
                S.below = S.f == null ? raw : S.f + (raw - S.f) * 0.6; // (a little smoothing against jitter)
                S.f = S.below;
                const wasUp = S.up || S.heel;
                if (!S.up && S.below < LEGS.UP) S.up = true;
                else if (S.up && S.below > LEGS.DOWN) S.up = false;
                // the heel kicked up behind: the shin looks short while the knee stays down
                S.heel = false;
                if (!S.up && a && (a.visibility ?? 1) > 0.5) S.heel = (a.y - k.y) / T < LEGS.HEEL;
                const isUp = S.up || S.heel;
                if (isUp && !wasUp) { S.lifts++; S.liftAt = now; }
                if (!isUp && wasUp) { S.plants++; if (now - S.liftAt < LEGS.STROKE_MS) S.strokes++; }
            }
        }
        const out = (S) => ({ up: S.up || S.heel, heel: S.heel, planted: !(S.up || S.heel) && S.below > LEGS.DOWN, below: S.below, lifts: S.lifts, plants: S.plants, strokes: S.strokes, liftAt: S.liftAt });
        return { seen: now - this.seenAt < LEGS.SEEN_MS, left: out(this.L.left), right: out(this.L.right) };
    }
}
