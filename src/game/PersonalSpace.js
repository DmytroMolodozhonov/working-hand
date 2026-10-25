/**
 * PersonalSpace.js — personal distances of people (pure, Node-testable). One place for all the numbers.
 *
 * The author: «когда я разговариваю с жителем или рыцарем, они стоят СЛИШКОМ БЛИЗКО к нему… и друг к другу тоже. Нужно расстояние минимум вдвое
 * больше». Before: a talker kept 1.9 m from the hero, followers stood 1.9 m apart on rings of 3.2 m (+1.8), standing bodies were pushed apart only
 * to the sum of their radii (+0.06 m). Now everything is doubled; scale: the hero ~3.5 m, a block 1 m, a man's body radius 0.5 m.
 */

export const SPACE = {
    TALK: 3.8, // m: a talker stands this far from the hero (was 1.9); eye to eye
    TALK_MIN: 1.9, // m: even a lover / best friend never nearer (half of the new, the old value)
    FOLLOW_ARC: 3.8, // m: followers on a ring are this far apart (was 1.9)
    FOLLOW_R0: 4.4, // m: the first ring round the hero (was 3.2)
    FOLLOW_STEP: 3.6, // m: the next ring is this much farther (was 1.8)
    STAND_GAP: 1.1, // m between two bodies' edges when both are standing in the open (was 0.06): centre to centre ≈ 2.1 m for two men
    STAND_PUSH: 0.45, // m/s: how fast a standing one drifts to this gap (gently, never a shove)
    STAND_RANGE: 3.4, // m: others farther than this (centres) are not looked at for the gap
    OPEN_ROOM: 1.6, // m: ground wider than this on both sides of the spot counts as open (not a doorway / stair / corridor)
};

/** How far a talker stands from the hero: friends and loved ones a little nearer (never under TALK_MIN); the king / a stranger — the full TALK. */
export function talkDistance(eff) {
    if (!eff) return SPACE.TALK;
    const warm = Math.max(0, Math.min(1, Math.max(eff.fr || 0, eff.lv || 0) / 100));
    return SPACE.TALK - (SPACE.TALK - SPACE.TALK_MIN) * 0.5 * warm; // (at most 25% nearer: 100/100 → 2.85 m)
}

/** The gap two bodies keep when both stand in the open; 0 extra when either one is moving / working a post / in a narrow place. */
export function standGap(a, b, open) {
    if (!open) return 0;
    if (a.moving || b.moving || a.post || b.post) return 0;
    return SPACE.STAND_GAP;
}
