/**
 * AimHold.js — holding something at the hand's line the way «Вингардиум Левиоса» does (pure maths):
 * taken where it is (its angle to the hand's line is kept — no jump onto the line) and the camera's
 * glitches filtered out. Shared by Levitation.js and the «Bubble» of WaterVortex.js (a module of
 * its own: WaterVortex can't import Levitation — Levitation → Duel → … → WaterVortex).
 */

export const AIM = {
    GLITCH: 0.35, // rad in one frame: no real hand turns so fast — the camera lost the hand / the fingers for a moment
    GLITCH_T: 0.4, // s: such a jump is believed only if it lasts this long
};

/** A direction as yaw (around Y) and pitch (up +). */
function yawPitch(v) {
    return [Math.atan2(v.x, v.z), Math.asin(Math.max(-1, Math.min(1, v.y / (v.length() || 1))))];
}

/**
 * Where the thing was against the line of the hand when it was taken (yaw and pitch apart):
 * it is held there and moves as the hand turns — not snapped onto the hand's line (with a hand
 * or a wand pointing a little aside, that made it fly off for a moment).
 */
export function aimOffset(dir, to) {
    const [y0, p0] = yawPitch(dir), [y1, p1] = yawPitch(to);
    const dy = y1 - y0;
    return { dy: Math.atan2(Math.sin(dy), Math.cos(dy)), dp: p1 - p0 };
}

/**
 * The hand's direction without the camera's glitches (`st` keeps the state): a sudden jump —
 * the hand or the fingers lost for a moment — is not followed unless it lasts; a real turn
 * of the hand is smooth and goes through at once. Changes `dir` in place.
 */
export function steadyDir(st, dir, dt) {
    if (!st.dir) { st.dir = dir.clone(); st.held = 0; return dir; }
    if (st.dir.angleTo(dir) > AIM.GLITCH && st.held < AIM.GLITCH_T) {
        st.held += dt; // (a jump: wait and see if it lasts)
        return dir.copy(st.dir);
    }
    st.held = 0;
    st.dir.copy(dir);
    return dir;
}

/** The hand's direction turned by such an offset (out may be dir). */
export function applyAimOffset(dir, off, out) {
    if (!off) return out.copy(dir);
    const [y, p] = yawPitch(dir);
    const yy = y + off.dy, pp = Math.max(-1.45, Math.min(1.45, p + off.dp)), c = Math.cos(pp);
    return out.set(Math.sin(yy) * c, Math.sin(pp), Math.cos(yy) * c);
}
