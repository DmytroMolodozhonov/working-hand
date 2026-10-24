/**
 * Jerk.js — a sharp jerk of the hand (pure maths): it ends a duel or puts out
 * a held «Protection». Shared by Duel.js and Combat.js.
 */

/**
 * A real sharp jerk of the hand (it ends / gives up a duel) — not a small move,
 * not the camera's jitter: within 0.3 s the hand went far (≥ 1.4 m of the hero's
 * size — about 45 cm of a real arm: the hero's arm is ~3× longer), fast, and
 * along one line (a straight throw, not shaking), and not in one jump of a
 * single picture (a tracking glitch). `list`: [{t (s), x, y, z}] body-relative.
 */
export const JERK = { WINDOW: 0.3, DIST: 1.4, STRAIGHT: 0.75, MIN_SPAN: 0.08, ONE_STEP: 0.7 };
export function sharpJerk(list, J = JERK) {
    if (!list || list.length < 3) return false;
    const last = list[list.length - 1];
    for (let i = 0; i < list.length - 2; i++) {
        const o = list[i];
        const span = last.t - o.t;
        if (span > J.WINDOW || span < J.MIN_SPAN) continue;
        const dist = Math.hypot(last.x - o.x, last.y - o.y, last.z - o.z);
        if (dist < J.DIST) continue;
        let path = 0, biggest = 0;
        for (let k = i + 1; k < list.length; k++) {
            const a = list[k - 1], b = list[k];
            const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
            path += d;
            biggest = Math.max(biggest, d);
        }
        if (dist / path < J.STRAIGHT) continue; // (shaking about)
        if (biggest > dist * J.ONE_STEP) continue; // (one picture's jump: the camera lost the hand)
        return true;
    }
    return false;
}
