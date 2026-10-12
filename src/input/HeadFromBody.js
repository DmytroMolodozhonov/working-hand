/**
 * HeadFromBody.js — the head's turn read from the body net's own face points (the nose and both
 * ears) when the face net finds no face. Standing a step farther from the camera (seen down to the
 * knees) the face is too small for the face net and the head stopped turning the view — while the
 * body net still sees the nose and the ears.
 *
 *   yaw:   where the nose sits along the line between the ears, as a share of the ears' distance:
 *          a head turned by θ puts it at ≈ K·tan θ (the nose ~10 cm before the ears, the ears
 *          ~15 cm apart: K ≈ 0.7). The nose towards the picture's right = a turn to + (as the face
 *          net's yaw in PoseInterpreter);
 *   pitch: how far the nose is below the ears' line (the same scale): it rises when looking up.
 * While the face net sees the face too, a straight line from these numbers to its angles is fitted
 * (this person, this camera) — so stepping back doesn't jump the view. Never seen a face: the yaw as
 * is (Game's own «straight ahead» adapts), the pitch round where the player has been looking lately.
 */

const K = 0.7;
const MAX = 1.3; // rad: never more (a head in profile — the ears on top of each other)

/** y ≈ a + b·x over the latest samples (older ones fade). */
export class LineFit {
    constructor(b0) {
        this.b0 = b0;
        this.n = 0; this.sx = 0; this.sy = 0; this.sxx = 0; this.sxy = 0;
    }

    add(x, y, keep = 0.996) {
        this.n = this.n * keep + 1;
        this.sx = this.sx * keep + x;
        this.sy = this.sy * keep + y;
        this.sxx = this.sxx * keep + x * x;
        this.sxy = this.sxy * keep + x * y;
    }

    /** The line now ({a, b}), or null with too few samples. */
    line() {
        if (this.n < 8) return null;
        const n = this.n, v = n * this.sxx - this.sx * this.sx;
        let b = this.b0;
        // (the slope only from real turns: x spread > ~0.06; same sign, within ×0.5…×2 of the geometry)
        if (v > n * n * 0.0036) {
            const fit = (n * this.sxy - this.sx * this.sy) / v;
            if (fit * this.b0 > 0) b = Math.sign(this.b0) * Math.min(Math.abs(this.b0) * 2, Math.max(Math.abs(this.b0) * 0.5, Math.abs(fit)));
        }
        const a = Math.max(-0.4, Math.min(0.4, (this.sy - b * this.sx) / n));
        return { a, b };
    }
}

export class HeadFromBody {
    constructor() {
        this.yawFit = new LineFit(1);
        this.pitchFit = new LineFit(-1);
        this.pitchRest = null; // (no face ever: where the nose usually is — «looking straight»)
    }

    /**
     * The raw numbers from the body's points (lm: 33 pose points, aspect: the picture's width/height),
     * or null when the nose or the ears aren't really there.
     */
    read(lm, aspect = 4 / 3) {
        if (!lm || lm.length < 13) return null;
        const nose = lm[0], eL = lm[7], eR = lm[8], sL = lm[11], sR = lm[12];
        if (!nose || !eL || !eR || (nose.visibility ?? 1) < 0.4 || (eL.visibility ?? 1) < 0.15 || (eR.visibility ?? 1) < 0.15) return null;
        // (in pixels' shape: x stretched by the picture's width)
        const ex = (eL.x - eR.x) * aspect, ey = eL.y - eR.y;
        const len = Math.hypot(ex, ey);
        const shoulders = sL && sR ? Math.hypot((sL.x - sR.x) * aspect, sL.y - sR.y) : len * 3;
        // real ears: apart (not one point), above the shoulders, by the nose
        if (len < 0.05 * shoulders || len < 1e-3) return null;
        const mx = (eL.x + eR.x) / 2 * aspect, my = (eL.y + eR.y) / 2;
        if (sL && sR && my > Math.min(sL.y, sR.y)) return null;
        const nx = nose.x * aspect - mx, ny = nose.y - my;
        if (Math.hypot(nx, ny) > len * 2.5) return null;
        // the person's left ear is on the picture's right (not mirrored): along it = to the right
        const ux = ex / len, uy = ey / len;
        const along = (nx * ux + ny * uy) / len;
        const yaw = Math.max(-MAX, Math.min(MAX, Math.atan(along / K)));
        // the head's real width (the ears come closer as it turns): the nose below the ears' line
        const below = (-nx * uy + ny * ux) / (len / Math.max(0.25, Math.cos(yaw)));
        return { yaw, below };
    }

    /** Both nets see the head now: learn how these numbers map onto the face net's angles. */
    learn(raw, faceYaw, facePitch) {
        if (!raw || !Number.isFinite(faceYaw) || !Number.isFinite(facePitch)) return;
        this.yawFit.add(raw.yaw, faceYaw);
        this.pitchFit.add(raw.below / K, facePitch);
    }

    /** The head's {yaw, pitch} (rad, like the face net's) from the body's points alone. */
    estimate(raw, dt = 1 / 20) {
        if (!raw) return null;
        const y = this.yawFit.line();
        const yaw = y ? y.a + y.b * raw.yaw : raw.yaw;
        const x = raw.below / K;
        const p = this.pitchFit.line();
        let pitch;
        if (p) pitch = p.a + p.b * x;
        else {
            // never a face: «straight» is where the nose has been lately (~20 s), looking up = +
            this.pitchRest = this.pitchRest == null ? x : this.pitchRest + (x - this.pitchRest) * Math.min(1, dt / 20);
            pitch = Math.atan(this.pitchRest - x);
        }
        return { yaw: Math.max(-MAX, Math.min(MAX, yaw)), pitch: Math.max(-MAX, Math.min(MAX, pitch)) };
    }
}
