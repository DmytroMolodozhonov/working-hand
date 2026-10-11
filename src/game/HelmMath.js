/**
 * HelmMath.js — the ship's wheel turned by hands (pure, Node-testable).
 *
 * Helm-local frame: x = starboard, y = up, looking forward (−z) as the helmsman
 * does. A hand holding the wheel sits at a polar angle on the rim (0 = top,
 * + = clockwise as the helmsman sees it). The wheel follows the hands: each
 * held hand wants the wheel at (its angle when it took hold) + (how far the hand
 * has gone round since). A moving ship's rudder pushes back, so the wheel turns
 * slower the faster the ship goes, and with no hands it eases back to the middle.
 */

import { HELM_LOCK } from './ShipTypes.js';

export const HELM = {
    GRAB_R: 0.45, CLOSE_CURL: 0.55, OPEN_CURL: 0.35, RELEASE_CURL: 0.28, RELEASE_MS: 160, CLOSE_WINDOW_MS: 900,
    LOCK: HELM_LOCK, MAX_RATE: 2.4, SLIP: 0.9, RETURN: 0.04,
};

/** The polar angle of a point in the wheel's plane (0 = top, + = clockwise for the helmsman). */
export const polar = (x, y) => Math.atan2(x, y);

/** Keep an angle continuous across ±π. */
export function unwrap(prev, a) {
    let d = a - prev;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return prev + d;
}

/** How far a point (helm-local) is from the band where hands hold the wheel (the rim out to the handles). */
export function rimDist(x, y, z, rimR, handleR) {
    const r = Math.hypot(x, y);
    const radial = r < rimR ? rimR - r : r > handleR ? r - handleR : 0;
    return Math.hypot(radial, z);
}

/**
 * The wheel after dt with these holds [{a0, w0, a}] at a ship speed (m/s).
 */
export function steer(wheel, holds, dt, speed) {
    if (!holds.length) return wheel - Math.sign(wheel) * Math.min(Math.abs(wheel), HELM.RETURN * Math.abs(speed) * dt);
    let want = 0;
    for (const h of holds) want += h.w0 + (h.a - h.a0);
    want /= holds.length;
    const rate = HELM.MAX_RATE / (1 + Math.abs(speed) / 4);
    const next = wheel + Math.max(-rate * dt, Math.min(rate * dt, want - wheel));
    return Math.max(-HELM.LOCK, Math.min(HELM.LOCK, next));
}
