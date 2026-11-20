/** Player falls: half the former damage, with room to step down deliberately.
 * Entry speed is captured at the edge, so stopping one's legs in midair cannot undo a run.
 * Six metres is the upper limit of the careful-step allowance, never a cliff immunity.
 */
export const PLAYER_FALL = { DAMAGE_K: 0.5, WALK_SPEED: 3.2, CAREFUL_DROP: 6, MIN_DROP: 0.3 };

export function fallEntry({ grounded, jumping, knocked, vy, speed }) {
    return { entrySpeed: speed, careful: !!grounded && !jumping && !knocked && vy <= 0 && speed <= PLAYER_FALL.WALK_SPEED };
}

export function playerFallDamage(height, landing = {}, forced = false) {
    if (landing.soft || !Number.isFinite(height) || height <= 3.5) return 0;
    if (!forced && landing.careful && height <= PLAYER_FALL.CAREFUL_DROP) return 0;
    return Math.round((height - 3.5) * 2) * PLAYER_FALL.DAMAGE_K;
}
