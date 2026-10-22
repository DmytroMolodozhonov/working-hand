/**
 * BumpRules.js — an accident is no blow (pure rules; BodyStrikes, CastleLife and CastleTalk use them).
 *   - a blow is MY hand's own movement (its speed in the world, not against the body's): a villager who
 *     walks into a still hand, or my elbow/forearm brushing past, only rests against it (collision);
 *   - a flick of one frame (tracking jitter) is no blow: the frame before must be moving into the body too;
 *   - my body walking into somebody carries the hand with it: only the hand's movement against my body counts;
 *   - a light knock is told off («Эй, осторожнее!»), only a hard blow or a second knock within 20 s angers them;
 *   - «извините» in 15 s calms the one I knocked.
 */

export const BUMP = { AGAIN_MS: 20000, SORRY_MS: 15000, SORRY_R: 14, MAX_SPEED: 45, SURE: 5, SOFT_PUSH: 0.01, MAX_HP_LOSS: 0.4 };

const _tmp = [0, 0, 0];

/**
 * Does a hand movement count as a blow? vel/prevVel: the hand's world velocity this frame and the one before (arrays [x,y,z]),
 * body: my own body's velocity, n: the surface normal (out of the body), min: the lowest speed.
 * @returns {number} the blow's speed (0: no blow)
 */
export function blowSpeed(vel, prevVel, body, n, min) {
    const dot = (v) => -(v[0] * n[0] + v[1] * n[1] + v[2] * n[2]);
    const s = dot(vel);
    if (!(s >= min) || s > BUMP.MAX_SPEED) return 0; // (too slow: a touch; too fast: the tracking jumped)
    if (s < BUMP.SURE && !(dot(prevVel) >= min * 0.5)) return 0; // (a slow flick of one frame is jitter; a fast swing at a low frame rate is a swing)
    _tmp[0] = vel[0] - body[0]; _tmp[1] = vel[1] - body[1]; _tmp[2] = vel[2] - body[2];
    if (!(dot(_tmp) >= min)) return 0; // (the hand only came along with my walking body)
    return s;
}

/** What a knock on a villager is: 'told' (a first light one), 'offended' (a second light one in time, no fight yet), 'fight'. */
export function knockOutcome({ hard, count, owner }) {
    if (hard) return 'fight';
    if (owner) return 'offended';
    return count <= 1 ? 'told' : 'fight';
}

const SORRY = /(^|[^а-яёa-z])(извин\S*|прост(и|ите|ь)|прошу прощени\S*|прощени\S*|сорри|sorry|pardon)([^а-яёa-z]|$)/i;
/** Did the player say sorry? */
export function isApology(text) { return SORRY.test(String(text || '')); }

/** One journal line for a counted blow on a villager. */
export function strikeLine({ kind, part, speed, hand, who, by, hard }) {
    return `удар ${kind || '?'} (${part || '?'}, рука ${hand || '?'}, ${Math.round(speed * 10) / 10} м/с${hard ? ', сильный' : ''}) → ${who} от ${by}`;
}

/** A line to the game's journal (console + server log), never to the screen. */
export function logLine(line) {
    console.info('[Удары]', line);
    try {
        if (typeof fetch !== 'function' || typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;
        fetch('/api/gamelog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: 'Удары', line: String(line) }) }).catch(() => {});
    } catch (_) { /* ignore */ }
}
