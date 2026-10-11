/**
 * SwimStroke.js — real arm strokes in front of the camera, and what they do to a swimmer.
 *
 * Nothing swims by itself: the body moves only because the player's arms pull the water.
 *
 *   pull   (crawl, one arm): the hand reaches forward / up (at least near the shoulder's
 *          height) and pulls down to the hip — fast enough, far enough.
 *   sweep  (breaststroke, both arms): the hands together in front of the chest spread
 *          wide out to the sides at once.
 *   double (dolphin / butterfly): both arms pull down together.
 *
 * Measured in the picture against the player's own arm length (aspect corrected), so the
 * distance to the camera does not matter. A stroke is a real movement of some size and
 * speed: MediaPipe's jitter (a few hundredths of an arm) never makes one, and a one-frame
 * glitch neither — the end of a stroke must hold for a moment.
 *
 * Pure logic (no THREE): Swimming.js feeds the pose and moves the body.
 */

export const STROKE = {
    START: -0.1, // a pull starts with the hand at least this high (× arm length above the shoulder)
    END: -0.6, // … and ends this low (the hand down at the hip)
    TRAVEL: 0.7, // the hand travels at least this far down
    MAX_TIME: 1.2, // s: a stroke takes no longer than this…
    MIN_SPEED: 1.0, // … and the hand goes down at least this fast (× arm length per second): not an arm lowered calmly
    HOLD: 0.05, // s: the end of a stroke holds this long (not a one-frame glitch)
    IN: 0.45, // breaststroke: both hands this close to the body's middle (× arm length)…
    OUT: 0.85, // … then both this far out to the sides
    SPREAD: 0.4, // each hand moved out at least this far
    FRONT: -0.5, // the hands in front of the chest: higher than this (× arm length from the shoulder)
    DOUBLE: 0.3, // s: both arms' pulls this close together = one dolphin pull
};

/** Arm length (in the picture) and the hand's place: up (+ above the shoulder), out (from the body's middle). */
export function armMetrics(pose, aspect = 1) {
    const a = aspect > 0 ? aspect : 1;
    const ls = pose.leftShoulder, rs = pose.rightShoulder;
    if (!ls || !rs || !pose.leftElbow || !pose.rightElbow || !pose.leftWrist || !pose.rightWrist) return null;
    const midX = (ls.x + rs.x) / 2 * a;
    const seg = (p, q) => Math.hypot((p.x - q.x) * a, p.y - q.y);
    const out = { len: 0 };
    for (const side of ['left', 'right']) {
        const s = pose[side + 'Shoulder'], e = pose[side + 'Elbow'], w = pose[side + 'Wrist'];
        if (![s.x, s.y, e.x, e.y, w.x, w.y].every(Number.isFinite)) return null;
        out.len = Math.max(out.len, seg(s, e) + seg(e, w));
        out[side] = { dy: s.y - w.y, dx: Math.abs(w.x * a - midX) };
    }
    return out;
}

export class StrokeDetector {
    constructor() {
        this.reset();
    }

    reset() {
        this.armLen = 0;
        this.t = 0;
        this.arms = { left: this._arm(), right: this._arm() };
        this.sweep = { hist: [], armed: true, lowAt: null };
        this.lastPull = { left: -9, right: -9 };
    }

    _arm() {
        return { hist: [], armed: true, lowAt: null };
    }

    /**
     * @param {number} dt
     * @param {object|null} pose  the camera pose (shoulders, elbows, wrists in the picture)
     * @returns {Array<{kind:'pull'|'sweep'|'double', side?:string, power:number}>} strokes finished now
     */
    update(dt, pose) {
        this.t += dt;
        const events = [];
        const m = pose ? armMetrics(pose, pose.aspect) : null;
        if (!m) { this.reset(); return events; } // (no arms seen: no stroke goes on)
        // the arm's length: the longest seen lately (an arm pointing at the camera looks short)
        this.armLen = Math.max(m.len, this.armLen * Math.exp(-0.05 * dt), 0.05);
        const L = this.armLen, t = this.t;

        for (const side of ['left', 'right']) {
            const A = this.arms[side];
            const u = m[side].dy / L;
            A.hist.push({ t, u });
            while (A.hist.length && t - A.hist[0].t > STROKE.MAX_TIME) A.hist.shift();
            if (u >= STROKE.START) { A.armed = true; A.lowAt = null; continue; } // reached forward again (recovery)
            if (!A.armed || u > STROKE.END) { A.lowAt = null; continue; }
            if (A.lowAt == null) A.lowAt = t;
            if (t - A.lowAt < STROKE.HOLD - 1e-6) continue;
            // where the hand reached forward within the stroke's time: far enough above, fast enough
            let speed = 0;
            for (const h of A.hist) {
                if (h.u < STROKE.START || h.u - u < STROKE.TRAVEL) continue;
                speed = Math.max(speed, (h.u - u) / Math.max(0.1, t - h.t));
            }
            if (speed < STROKE.MIN_SPEED) continue;
            const power = Math.max(0.5, Math.min(1.3, speed / 2));
            A.armed = false;
            A.lowAt = null;
            events.push({ kind: 'pull', side, power });
            const other = side === 'left' ? 'right' : 'left';
            if (t - this.lastPull[other] < STROKE.DOUBLE) events.push({ kind: 'double', power });
            this.lastPull[side] = t;
        }

        // Breaststroke: both hands from together in front to wide out
        const S = this.sweep;
        const lx = m.left.dx / L, rx = m.right.dx / L;
        // (together in front of the chest — not hanging along the body: lifting the arms sideways is no breaststroke)
        const inFront = lx <= STROKE.IN && rx <= STROKE.IN && m.left.dy / L > STROKE.FRONT && m.right.dy / L > STROKE.FRONT;
        S.hist.push({ t, lx, rx, inFront });
        while (S.hist.length && t - S.hist[0].t > STROKE.MAX_TIME) S.hist.shift();
        if (inFront) { S.armed = true; S.lowAt = null; }
        else if (S.armed && lx >= STROKE.OUT && rx >= STROKE.OUT) {
            if (S.lowAt == null) S.lowAt = t;
            if (t - S.lowAt >= STROKE.HOLD - 1e-6) {
                let start = null;
                for (const h of S.hist) if (h.inFront) start = h;
                if (start && lx - start.lx >= STROKE.SPREAD && rx - start.rx >= STROKE.SPREAD) {
                    const time = Math.max(0.1, t - start.t);
                    const power = Math.max(0.5, Math.min(1.3, (lx - start.lx + rx - start.rx) / 2 / time / 1.5));
                    S.armed = false;
                    S.lowAt = null;
                    events.push({ kind: 'sweep', power });
                }
            }
        } else S.lowAt = null;
        return events;
    }
}

export const SWIM = {
    DRAG: 0.9, // 1/s: the water slows the body down
    MAX_SPEED: 3.6, // m/s
    // push of one stroke (m/s), on top of the water / under it
    PULL: 1.3, SWEEP: 1.7, DOUBLE: 0.6,
    UNDER_PULL: 0.6, UNDER_SWEEP: 2.0, UNDER_DOUBLE: 1.4,
    BUOYANCY: 0.45, // m/s: under water without strokes the body floats up
    DIVE_LOOK: -0.35, // rad: looking down this much, a stroke on top of the water dives
    MAX_PITCH: 1.25, // rad: the steepest way up / down
    // the body's tilt from upright: treading water / swimming on top / under water
    TILT_IDLE: 0.45, TILT_SURFACE: 1.25, TILT_UNDER_IDLE: 0.9,
};

/** The swimmer's way through the water: speed along where the strokes push. */
export class SwimMotion {
    constructor() {
        this.reset();
    }

    reset() {
        this.speed = 0;
        this.pitch = 0; // the way of travel (+ up)
        this.tilt = SWIM.TILT_IDLE;
        this.sinceStroke = 99;
    }

    /** A stroke pushes the body forward (on top: the crawl and the breaststroke; under: the breaststroke and the dolphin). */
    stroke(ev, { under = false, look = 0 } = {}) {
        const k = under
            ? { pull: SWIM.UNDER_PULL, sweep: SWIM.UNDER_SWEEP, double: SWIM.UNDER_DOUBLE }
            : { pull: SWIM.PULL, sweep: SWIM.SWEEP, double: SWIM.DOUBLE };
        this.speed = Math.min(SWIM.MAX_SPEED, this.speed + (k[ev.kind] || 0) * (ev.power ?? 1));
        this.sinceStroke = 0;
        // on top of the water, looking down: this stroke takes the body under (a dive)
        if (!under && look < SWIM.DIVE_LOOK) this.pitch = Math.max(-SWIM.MAX_PITCH, Math.min(look, -0.5));
    }

    /**
     * @param {number} dt
     * @param {{under:boolean, look:number}} input  under the water? where the eyes look (rad, + up)
     * @returns {{forward:number, up:number, tilt:number}} horizontal speed along the body's front, vertical speed, body tilt
     */
    step(dt, { under = false, look = 0 } = {}) {
        this.sinceStroke += dt;
        this.speed *= Math.exp(-SWIM.DRAG * dt);
        if (this.speed < 0.02) this.speed = 0;
        const want = under ? Math.max(-SWIM.MAX_PITCH, Math.min(SWIM.MAX_PITCH, look)) : 0;
        // the way bends towards the look (under water) or slowly levels out (on top: a dive goes on a while)
        this.pitch += (want - this.pitch) * Math.min(1, dt * (under ? 2.5 : 0.6));
        const forward = this.speed * Math.cos(this.pitch);
        let up = this.speed * Math.sin(this.pitch);
        if (under) up += SWIM.BUOYANCY;
        else up = Math.min(0, up);
        // the body lies along its way: flat on top while swimming, upright treading water
        const moving = Math.min(1, this.speed / 1.2);
        const target = under
            ? SWIM.TILT_UNDER_IDLE + (Math.PI / 2 - this.pitch - SWIM.TILT_UNDER_IDLE) * moving
            : SWIM.TILT_IDLE + (SWIM.TILT_SURFACE - SWIM.TILT_IDLE) * moving - Math.min(0, this.pitch) * moving;
        this.tilt += (Math.max(0.3, Math.min(2.7, target)) - this.tilt) * Math.min(1, dt * 3);
        return { forward, up, tilt: this.tilt };
    }
}
