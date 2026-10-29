/**
 * ImperiusFlight.js — «Империус Максима»: flying a winged creature with one's own arms (pure; tests/unit/imperius-flight.test.js).
 *
 * The author: «чтобы лететь — размахивай руками (не как Fly, а прямо руками махать каждый раз; можно регулировать
 * полёт взмахами); дракону нужно немного разбежаться, чтобы взлететь. Книга просто летает (взмахи руками тоже).»
 *
 *  - A STROKE: both hands coming down together, fast, against the body (Character.handRelVelocity — the same speeds
 *    ArmPump reads for a runner's arms; here not in turn but together). Its strength is how fast they came down.
 *    A stroke pushes up and forward (each kind its own lift and thrust); strokes more often and harder — higher and
 *    faster. One hand alone, the arms pumping a run, a hand raised: no stroke.
 *  - Between the strokes the creature glides: the air holds it while it is fast (the wings spread — a slow sink), and it
 *    slows down by the air's drag. The arms DOWN (hanging): the wings folded — it drops steeply; low over the ground —
 *    it lands. The arms spread (a T) — a long glide.
 *  - Taking off: from the ground a stroke lifts a light flyer (the book, the owl, the phoenix, the winged pig) at once;
 *    a great one (the dragon, the Pegasus) must be running fast enough first (TAKEOFF of its top ground speed).
 *  - The head steers the height, as in «Flight» (Flight.steering: looking down — a dive): the head bowed — the nose goes down
 *    and it comes down, the steeper the more it is bowed (and gathers speed); the head up — it climbs on its own speed
 *    (and loses it); looking straight ahead — it keeps its height while it is fast (slow — it sinks: the air no longer holds it).
 *    Near the ground (FLARE m) a fast descent is checked — wings spread, it slows; at the ground it lands on its feet, unhurt
 *    (the ground, a roof, the water — the caller's floor).
 *  - The world is not gone through: the caller keeps it above the highest thing on its way (as PigFlight / DragonRide).
 */

/** A stroke: the hands' downward speed (m/s against the body). */
export const FLAP = {
    START: 2.0, // both hands down at least this fast (their mean): a stroke begins
    EACH: 0.9, // … and each hand at least this fast down (one hand alone is no stroke)
    END: 0.7, // the mean falls under this: the stroke is over — it counts
    FULL: 8, // m/s: a stroke this fast is a full one (strength 1)
    GAP: 0.18, // s at least between two strokes
};

/** The head's tilt (rad, + up; Game.smoothHead.pitch — the same as «Flight» reads) → the height. */
export const HEAD = {
    DEAD: 0.08, // rad: a nod this small is looking straight ahead
    FULL: 0.6, // rad of the head bowed (past DEAD): the steepest dive
    DIVE: 1.0, // rad: the steepest path down (~57°)
    CLIMB: 0.55, // rad: the steepest climb on its own speed
    RATE: 2.5, // 1/s: how fast the path follows the head
    FLARE: 3, // m over the ground: it slows its flight forward too (the wings spread for the landing)
    FLARE_VY: 2.0, // m/s: the speed down at the touch
    FLARE_K: 1.2, // m/s more down allowed for each m over the ground (a dive is checked from ~20 m: about 1.5 s to the touch)
    HOLD: 0.35, // of the top speed: faster than this, looking ahead, it keeps its height
};

/** The path's angle (rad, + up) the head asks for: 0 looking ahead, down to −DIVE bowed, up to CLIMB raised. */
export function headPath(pitch) {
    const a = Math.abs(pitch || 0) - HEAD.DEAD;
    if (!(a > 0)) return 0;
    const k = Math.min(1, a / (HEAD.FULL - HEAD.DEAD));
    return pitch < 0 ? -HEAD.DIVE * k : HEAD.CLIMB * k;
}

/**
 * The flyers: lift (m/s up a full stroke gives), thrust (m/s forward), top speeds, gravity, the glide's sink, the drag,
 * how fast it must run to take off (0: from the spot), its turn (× the body's turn) and the eyes' height (m).
 */
export const FLYERS = {
    dragon: { lift: 4.2, thrust: 4.5, maxUp: 10, maxFwd: 26, gravity: 9, sink: 2.4, drag: 0.08, takeoff: 4.2, turn: 0.75 },
    pegasus: { lift: 4.5, thrust: 3.5, maxUp: 9, maxFwd: 18, gravity: 9, sink: 2.2, drag: 0.12, takeoff: 3.6, turn: 1.1 },
    bookbird: { lift: 3.4, thrust: 2.2, maxUp: 7, maxFwd: 11, gravity: 6, sink: 1.5, drag: 0.35, takeoff: 0, turn: 1.6 },
    owl: { lift: 3.8, thrust: 3.0, maxUp: 8, maxFwd: 16, gravity: 7, sink: 1.3, drag: 0.2, takeoff: 0, turn: 1.5 },
    gargoyle: { lift: 5.0, thrust: 4.0, maxUp: 11, maxFwd: 24, gravity: 8, sink: 1.0, drag: 0.14, takeoff: 0, turn: 1.8 }, // (an infernal gargoyle: strong, quick — Gargoyles.js)
    spencer: { lift: 3.0, thrust: 3.2, maxUp: 7, maxFwd: 15, gravity: 6, sink: 1.2, drag: 0.22, takeoff: 0, turn: 1.9 }, // (a small songbird: quick to turn, not fast — SpencerBirds.js)
    phoenix: { lift: 4.0, thrust: 3.6, maxUp: 9, maxFwd: 22, gravity: 7, sink: 1.2, drag: 0.16, takeoff: 0, turn: 1.4 },
    pig: { lift: 3.4, thrust: 2.4, maxUp: 7, maxFwd: 11, gravity: 8, sink: 2.2, drag: 0.3, takeoff: 0, turn: 1.3 },
};

/** Reads the strokes from the two hands' speeds against the body (y up). */
export class FlapReader {
    constructor() { this.reset(); }
    reset() { this.on = false; this.peak = 0; this.since = 1; this.last = 0; }

    /** → the strength (0…1) of a stroke that just ended this frame, else 0. vL / vR: {y}, null — that hand is gone. */
    update(dt, vL, vR) {
        this.since += dt;
        if (!vL || !vR) { this.on = false; return 0; }
        const dL = -vL.y, dR = -vR.y, mean = (dL + dR) / 2;
        if (!this.on) {
            if (mean >= FLAP.START && dL >= FLAP.EACH && dR >= FLAP.EACH && this.since >= FLAP.GAP) { this.on = true; this.peak = mean; }
            return 0;
        }
        this.peak = Math.max(this.peak, mean);
        if (mean > FLAP.END) return 0;
        this.on = false;
        this.since = 0;
        return (this.last = strokeStrength(this.peak));
    }
}

/** How strong a stroke of this peak speed is (0.3 for a just-counted one … 1 for a full one). */
export function strokeStrength(peak) {
    return Math.max(0.3, Math.min(1, 0.3 + 0.7 * (peak - FLAP.START) / (FLAP.FULL - FLAP.START)));
}

/**
 * One frame of the flight. st: {air, vf (m/s forward), vy (m/s up)}; P: FLYERS[kind]; i: {stroke (0…1, 0: none),
 * arms: 'down' | 'spread' | '' , ground (m/s it runs on the ground now), alt (m above what is under it), pitch (the head's
 * tilt, rad, + up — HEAD)}.
 * → st (changed): `took` — it left the ground this frame, `landed` — it came down onto it.
 */
export function flyStep(st, P, i, dt) {
    st.took = false; st.landed = false;
    if (!st.air) {
        // on the ground: a stroke takes it up — a great one only running fast enough
        if (i.stroke > 0 && (i.ground || 0) >= P.takeoff) {
            st.air = true; st.took = true;
            st.vf = Math.max(i.ground || 0, P.thrust * i.stroke);
            st.vy = Math.min(P.maxUp, P.lift * (1 + i.stroke));
        } else { st.vf = i.ground || 0; st.vy = 0; }
        return st;
    }
    if (i.stroke > 0) {
        st.vy = Math.min(P.maxUp, Math.max(st.vy, 0) + P.lift * i.stroke);
        st.vf = Math.min(P.maxFwd, st.vf + P.thrust * i.stroke);
    }
    const path = headPath(i.pitch);
    const fast = Math.min(1, st.vf / (0.45 * P.maxFwd));
    const k = Math.min(1, HEAD.RATE * dt);
    if (path < 0 && i.arms !== 'down') {
        // the head bowed: the nose down — down along the path, steeper and faster the more it is bowed
        const sp = Math.max(st.vf, 0.5 * P.maxFwd);
        st.vy += (Math.sin(path) * sp * 1.2 - st.vy) * k;
        st.vf = Math.min(P.maxFwd * 1.25, st.vf + P.gravity * 0.5 * -Math.sin(path) * dt); // (a dive gathers speed)
    } else if (path > 0 && st.vf > 2 && !i.stroke) {
        // the head raised: up on its own speed — the speed spent on the height
        st.vy += (Math.sin(path) * st.vf * 0.8 - st.vy) * k;
        st.vf = Math.max(0, st.vf - P.gravity * 0.45 * Math.sin(path) * dt);
    } else if (!i.arms && st.vf >= HEAD.HOLD * P.maxFwd && !i.stroke && st.vy <= 0.5) {
        // looking straight ahead, fast: the wings hold it — it keeps its height
        st.vy += (0 - st.vy) * k;
    } else {
        st.vy -= P.gravity * dt;
        // the air holds wings spread while it is fast enough; folded (arms down) it drops
        const sink = i.arms === 'down' ? P.sink * 4 : i.arms === 'spread' ? P.sink * (1.6 - 0.8 * fast) : P.sink * (2.2 - 1.2 * fast);
        if (st.vy < -sink) st.vy += Math.min(-sink - st.vy, P.gravity * 2 * dt);
    }
    st.vf = Math.max(0, st.vf - st.vf * P.drag * dt * (i.arms === 'down' ? 2 : 1));
    // near the ground a fast descent is checked: the wings spread, it slows — it comes onto its feet, never crashes
    if (i.alt != null) {
        const lim = HEAD.FLARE_VY + HEAD.FLARE_K * Math.max(0, i.alt);
        if (st.vy < -lim) st.vy = -lim;
        if (i.alt < HEAD.FLARE && st.vy < 0) st.vf = Math.max(0, st.vf - st.vf * 0.8 * dt);
    }
    // down at the ground: it lands (the arms down, or simply coming down slowly there)
    if (i.alt != null && i.alt <= 0.35 && st.vy <= 0.5) { st.air = false; st.landed = true; st.vy = 0; st.vf = Math.min(st.vf, 2); }
    return st;
}

/** The arms' state for the glide: both hanging down / spread out like a T / neither. */
export function armsOf(ch) {
    if (!ch) return '';
    if (ch.isTPose?.() || ch.isArmsSpread?.()) return 'spread';
    const up = ch.isArmRaised?.('left') || ch.isArmRaised?.('right');
    return up ? '' : 'down';
}
