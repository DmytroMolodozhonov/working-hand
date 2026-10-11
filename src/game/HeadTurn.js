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
 * Pure logic, no THREE.
 */

export const HEAD_DEAD = 0.15; // rad of head turn that doesn't turn the view
export const NEUTRAL_MAX = 0.5; // "straight" is never further than this from the camera's straight
const LEARN_RATE = 0.12; // per second
const MAX_SPEED = 2.2; // rad/s

/**
 * One frame. `st` = { neutral } (kept between frames), `headYaw` = the smoothed head
 * yaw (rad, + = left as the game counts it), `dt` in seconds.
 * Returns the body's turning speed (rad/s) and the head's yaw relative to "straight".
 */
export function headTurnStep(st, headYaw, dt) {
    if (!Number.isFinite(st.neutral)) st.neutral = 0;
    if (!Number.isFinite(headYaw) || !(dt > 0)) return { rate: 0, rel: 0 };
    let off = headYaw - st.neutral;
    if (Math.abs(off) < HEAD_DEAD) {
        st.neutral += off * Math.min(1, dt * LEARN_RATE);
        st.neutral = Math.max(-NEUTRAL_MAX, Math.min(NEUTRAL_MAX, st.neutral));
        off = headYaw - st.neutral;
    }
    const over = Math.abs(off) - HEAD_DEAD;
    const rate = over > 0 ? Math.sign(off) * Math.min(MAX_SPEED, over * 4) : 0;
    return { rate, rel: off };
}

