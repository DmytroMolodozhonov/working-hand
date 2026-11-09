/** Running in place also blocks back gestures, before the character has moved in the world. */
export const BACK_HOLD = 1;
export function backAllowed(game) {
    const ch = game.character;
    return !game.currentPose?.isRunning && !ch?.isRunning && !(ch?.stepping > 0.05)
        && !ch?.flying && !game.flight?.active && !game.combat?.dead && !game.combat?.immobile && !game.monster?.active;
}
