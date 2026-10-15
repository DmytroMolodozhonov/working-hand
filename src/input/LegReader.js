/**
 * LegReader.js — what the legs do, from the camera's knees and ankles.
 *
 * Per leg: is it lifted (the knee up towards the hip, or the heel kicked up
 * behind), is the foot planted, and three counters that only ever grow:
 *   lifts  — the leg went up, plants — it came down again,
 *   strokes — a lift and a plant within 2.5 s (one paddling stroke).
 * Counters (not one-frame events) are safe when the game repeats a pose result
 * for several frames (PoseSmoother) — the reader takes the difference.
 *
 * Image y grows downwards. Every person stands differently and real thighs are
 * long (a standing knee is ~0.9 torso below the hip, not 0.5), so a lift is
 * measured from THIS person's own standing knee (learned while they stand): the
 * knee coming up a third of a torso from there is a lift — or simply up near the
 * hip. The camera's jitter is smoothed, and the thresholds have a gap between
 * "up" and "down", so a shaking knee does not count twice.
 * Seen only down to the hips (a close camera, the knees below the picture):
 * the knees are taken as down while they are out of the picture, and a knee
 * lifted into the picture is a lift — the same counters.
 * Pure (Node-testable).
 */

export const LEGS = {
    UP: 0.26, // knee this far below the hip (in torso lengths) or less: lifted, whoever it is
    DOWN: 0.40, // … this far or more (and back near the standing knee): down again (hysteresis)
    LIFT: 0.3, // up from the person's own standing knee by this much (torso lengths): lifted
    DROP: 0.15, // … back within this much of it: down
    HEEL: 0.25, // the shin looks this short (the foot kicked up behind)
    VIS: 0.3, // a knee seen at least this sure (a real camera's legs are seldom more sure than 0.5)
    OUT: 0.97, // a knee estimated this low in the picture: below its edge (seen to the hips only)
    STROKE_MS: 2500, // (a slow stroke still pushes the water)
    SEEN_MS: 500,
};

export class LegReader {
    constructor() {
        this.L = { left: this._leg(), right: this._leg() };
        this.seenAt = -1e9;
        this.hipsOnly = false;
        this._last = null;
    }

    _leg() { return { up: false, heel: false, below: 0.5, f: null, base: null, shin: 0, lifts: 0, plants: 0, strokes: 0, liftAt: 0 }; }

    /**
     * @param {Array} lm pose landmarks (33)
     * @returns {{seen: boolean, hipsOnly: boolean, left: object, right: object}} each leg: {up, heel, planted, below, raise, lift (torso lengths up from the standing knee), lifts, plants, strokes, liftAt}
     */
    read(lm, now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
        if (lm && lm !== this._last && lm[23] && lm[11]) {
            this._last = lm;
            const T = Math.abs((lm[23].y + lm[24].y) / 2 - (lm[11].y + lm[12].y) / 2) || 0.3;
            let outs = 0;
            for (const [side, hip, knee, ankle] of [['left', 23, 25, 27], ['right', 24, 26, 28]]) {
                const S = this.L[side], k = lm[knee], h = lm[hip], a = lm[ankle];
                if (!h || (h.visibility ?? 1) < LEGS.VIS) continue;
                let raw;
                if (k && (k.visibility ?? 1) >= LEGS.VIS && k.y < 1.02) raw = (k.y - h.y) / T;
                else if (!k || k.y > LEGS.OUT) { raw = Math.max(S.base ?? 0.9, 0.9); outs++; } // (below the picture: down)
                else continue; // (in the picture but hidden: nothing known)
                this.seenAt = now;
                // a little smoothing against the jitter (a fast real lift still gets through in 2–3 frames)
                S.below = S.f == null ? raw : S.f + (raw - S.f) * 0.6;
                S.f = S.below;
                const wasUp = S.up || S.heel;
                // the standing knee: quick to learn lower, slow to believe a higher one (that may be a lift starting)
                if (!S.up) S.base = S.base == null ? Math.max(raw, LEGS.DOWN) : S.base + (S.below - S.base) * (S.below > S.base ? 0.25 : 0.01);
                const base = Math.max(LEGS.DOWN + 0.05, S.base ?? 0.5);
                if (!S.up && (S.below < LEGS.UP || S.below < base - LEGS.LIFT)) S.up = true;
                else if (S.up && S.below > LEGS.DOWN && S.below > base - LEGS.DROP) S.up = false;
                // the heel kicked up behind: the shin looks short while the knee stays down
                S.heel = false;
                if (!S.up && a && k && (k.visibility ?? 1) >= LEGS.VIS && k.y < 1.02 && (a.visibility ?? 1) > 0.5) S.heel = (a.y - k.y) / T < LEGS.HEEL;
                const isUp = S.up || S.heel;
                if (isUp && !wasUp) { S.lifts++; S.liftAt = now; }
                if (!isUp && wasUp) { S.plants++; if (now - S.liftAt < LEGS.STROKE_MS) S.strokes++; }
            }
            this.hipsOnly = outs > 0;
        }
        const out = (S) => {
            const base = Math.max(LEGS.DOWN + 0.05, S.base ?? 0.5);
            return { up: S.up || S.heel, heel: S.heel, planted: !(S.up || S.heel) && S.below > LEGS.DOWN, below: S.below, raise: Math.max(0, Math.min(1, (base - S.below) / LEGS.LIFT)), lift: base - S.below, lifts: S.lifts, plants: S.plants, strokes: S.strokes, liftAt: S.liftAt };
        };
        return { seen: now - this.seenAt < LEGS.SEEN_MS, hipsOnly: this.hipsOnly, left: out(this.L.left), right: out(this.L.right) };
    }
}
