/**
 * FaceTarget.js — the author's rule «лицом к цели» (pure, node-testable).
 *
 * A wizard (or any creature that casts or attacks) cannot cast or strike until it has turned fully
 * to its target: from the side or with its back — nothing. First it turns (at a limited speed: a
 * body, not a turret), then it casts / strikes. The target stepped aside while it was getting
 * ready — it waits for the turn again; the charge flies where the wand really points.
 *
 * Yaw as everywhere in the game: forward is (−sin yaw, −cos yaw).
 */

const DEG = Math.PI / 180;

/** How exactly the body has to face the target (horizontal angle, rad) and how fast bodies turn (rad/s). */
export const FACE = {
    SPELL: 13 * DEG,  // a wand spell (wizards: duel charges, «Джолт» at a creature, a spell back)
    ARROW: 13 * DEG,  // a bow
    MELEE: 25 * DEG,  // a sword / a fist (the swing itself sweeps an arc in front)
    BITE: 20 * DEG,   // the dragon's jaws
    BREATH: 15 * DEG, // the dragon's fire (then the head keeps it on the target)
    SHOT: 15 * DEG,   // the spider's poison / web from its mouth
    WIZARD_TURN: 4.2, // rad/s — a wizard turning to his foe (~240°/s: a half-turn takes ~0.75 s)
};

/** The yaw that looks from (x, z) at (tx, tz). */
export function yawTo(x, z, tx, tz) { return Math.atan2(-(tx - x), -(tz - z)); }

/** An angle into −π…π. */
export function wrapAngle(a) {
    a %= Math.PI * 2;
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    return a;
}

/** How far (rad, 0…π) the body looking along `yaw` from (x, z) is turned away from (tx, tz). */
export function facingError(yaw, x, z, tx, tz) {
    if (Math.hypot(tx - x, tz - z) < 1e-4) return 0;
    return Math.abs(wrapAngle(yawTo(x, z, tx, tz) - yaw));
}

/** Is the target in front, within `max` (rad)? — may it cast / strike now. */
export function facesTarget(yaw, x, z, tx, tz, max = FACE.SPELL) {
    return facingError(yaw, x, z, tx, tz) <= max;
}

/** Turn `yaw` towards `want` by at most `maxStep` rad (a limited speed: never an instant about-face). */
export function turnToward(yaw, want, maxStep) {
    const d = wrapAngle(want - yaw);
    return yaw + Math.max(-maxStep, Math.min(maxStep, d));
}
