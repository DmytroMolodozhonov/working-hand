/**
 * HeadTurn.js — turning the view by turning the head («drifting» camera).
 *
 * The head turned past a small dead zone turns the body (and the view) at a speed
 * that grows with the turn. "Straight ahead" (the neutral) is learned slowly from
 * where the player really looks — the camera may stand beside the screen.
 *
 * The neutral learns ONLY while the head is inside the dead zone (the view isn't
 * being turned). It used to learn up to 0.3 rad away, i.e. also while the player
 * held a gentle turn: the neutral then crept after the turned head, the turn died
 * away in a few seconds, and "straight" stayed shifted to that side — the next
 * turns that way needed more and more head and crawled (the harder you tried, the
 * further it crept). Now a held turn never moves "straight", and it can't wander
 * further than a camera beside the screen could need.
 *
 * Inside the dead zone it learned from every frame: glances to one side (the minimap,
 * a thing in the hand) and the head passing through on its way out and back pulled
 * "straight" that way — after a long game a turn that way needed far more head. Now
 * "straight" is where the head RESTS most of the time (the most frequent still place
 * of the last minute): glances and the way through don't count.
 *
 * After a long game "straight" could still walk away step by step: a minute resting a little
 * right (reading a book in the hand, a slow lean) moved it there, and from there the next rest
 * a little further right was inside the dead zone again — and so on up to 0.5 rad. Looking
 * straight at the screen then turned the view all the time («кружится»), and it never came
 * back: "straight" learns only inside the dead zone, and the head at the screen was outside
 * it. Now "straight" stays nearer to the camera's straight than the dead zone is wide, so
 * the head at the screen never turns the view and is always learned back.
 * Pure logic, no THREE.
 */

export const HEAD_DEAD = 0.15; // rad of head turn that doesn't turn the view
// "straight" is never further than this from the camera's straight — less than HEAD_DEAD, so the
// head looking straight at the camera is always inside the dead zone (never turns the view)
export const NEUTRAL_MAX = 0.1;
const LEARN_RATE = 0.12; // per second
const MAX_SPEED = 2.2; // rad/s
const BIN = 0.02; // rad: the rest places are counted in steps this wide
const NB = Math.ceil(2 * (NEUTRAL_MAX + HEAD_DEAD) / BIN);
const MEMORY_S = 60; // s: older rests fade
const STILL = 0.3; // rad/s: the head slower than this is resting

/**
 * One frame. `st` = { neutral } (kept between frames), `headYaw` = the smoothed head
 * yaw (rad, + = left as the game counts it), `dt` in seconds.
 * Returns the body's turning speed (rad/s) and the head's yaw relative to "straight".
 */
export function headTurnStep(st, headYaw, dt) {
    if (!Number.isFinite(st.neutral)) st.neutral = 0;
    if (!Number.isFinite(headYaw) || !(dt > 0)) return { rate: 0, rel: 0 };
    let off = headYaw - st.neutral;
    const still = Number.isFinite(st.prev) && Math.abs(headYaw - st.prev) < STILL * dt;
    st.prev = headYaw;
    if (Math.abs(off) < HEAD_DEAD) {
        // the head resting here (not turning the view, not on its way): counted
        if (!st.hist || st.hist.length !== NB) { st.hist = new Float32Array(NB); st.total = 0; }
        const h = st.hist, fade = Math.exp(-dt / MEMORY_S);
        for (let i = 0; i < NB; i++) h[i] *= fade;
        st.total *= fade;
        if (still) {
            const i = Math.floor((headYaw + NEUTRAL_MAX + HEAD_DEAD) / BIN);
            if (i >= 0 && i < NB) { h[i] += dt; st.total += dt; }
        }
        // "straight" goes (slowly) to the most frequent rest place
        if (st.total > 1) {
            let m = 0;
            for (let i = 1; i < NB; i++) if (h[i] > h[m]) m = i;
            let w = 0, s = 0;
            for (let i = Math.max(0, m - 1); i <= Math.min(NB - 1, m + 1); i++) { w += h[i]; s += h[i] * ((i + 0.5) * BIN - NEUTRAL_MAX - HEAD_DEAD); }
            st.neutral += (s / w - st.neutral) * Math.min(1, dt * LEARN_RATE);
            st.neutral = Math.max(-NEUTRAL_MAX, Math.min(NEUTRAL_MAX, st.neutral));
        }
        off = headYaw - st.neutral;
    }
    const over = Math.abs(off) - HEAD_DEAD;
    const rate = over > 0 ? Math.sign(off) * Math.min(MAX_SPEED, over * 4) : 0;
    return { rate, rel: off };
}


/**
 * Lying (knocked down, in a bed): the head turns by itself, the body stays where it lies — and it
 * turns further than the real head (`k` 0 … 1: how much lying, blended so nothing jumps), so a
 * comfortable turn looks all round from the ground. Pure.
 */
export const LIE_GAIN = { yaw: 1.6, pitch: 1.3, yawMax: 1.7, pitchMax: 1.3 };
export function lyingHead(yaw, pitch, k) {
    k = Math.max(0, Math.min(1, k || 0));
    const c = (v, m) => Math.max(-m, Math.min(m, v));
    const y = yaw * (1 + (LIE_GAIN.yaw - 1) * k), p = pitch * (1 + (LIE_GAIN.pitch - 1) * k);
    return k > 0 ? { yaw: c(y, LIE_GAIN.yawMax), pitch: c(p, LIE_GAIN.pitchMax) } : { yaw: y, pitch: p };
}
