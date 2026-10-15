/**
 * WandAim.js — where the wand (or the bare hand) points, for spells cast «вверх» or «на себя»
 * («Wind Impulse», «Invisibility»). The pure checks are exported for the tests.
 *
 * Can a tracked hand really turn the wand back at its own chest? The camera sees the hand from
 * the front: a hand turned back at the body is seen from its back, foreshortened, the fingers
 * hidden behind the palm — MediaPipe loses the wand's direction there more often than not. So
 * «на себя» is accepted when it is seen, and «палочку вверх» (always seen well) does the same.
 */

import * as THREE from 'three';

/** The wand (or the hand) points up: this much of its direction goes up. */
export const UP_K = 0.6;
/** … at the caster's own body: the angle's cosine between the wand and the way to the chest. */
export const SELF_K = 0.7;

export const pointsUp = (dir) => !!dir && dir.y >= UP_K;

export function pointsAtSelf(origin, dir, chest) {
    if (!origin || !dir || !chest) return false;
    const to = new THREE.Vector3().subVectors(chest, origin);
    const d = to.length();
    if (d < 0.05) return true;
    return d < 1.2 && to.divideScalar(d).dot(dir) >= SELF_K;
}

/** The hand that casts (the wand's, else a raised one) and where it points: {side, origin, dir} | null. */
export function castingHand(game) {
    const ch = game.character;
    if (!ch) return null;
    const pref = game.magicHand || game.lastMagicHand || 'right';
    const side = game.wandSide?.() || (ch.isArmRaised(pref) ? pref : ['right', 'left'].find((s) => ch.isArmRaised(s)));
    if (!side) return null;
    const dir = new THREE.Vector3();
    const origin = game.wandSide?.() === side && game.wandMagic?.tip ? game.wandMagic.tip(new THREE.Vector3(), dir) : null;
    if (!origin) return { side, origin: ch.getHandWorldPosition(side, new THREE.Vector3()), dir: ch.getHandDirection(side, new THREE.Vector3()) };
    return { side, origin, dir };
}

/** The wand points up, or at its owner. */
export function aimedUpOrSelf(game, hand = castingHand(game)) {
    if (!hand) return false;
    if (pointsUp(hand.dir)) return true;
    const chest = game.character.group.position.clone().add(new THREE.Vector3(0, 0.9, 0)); // (the chest: Combat.center is at +0.6)
    return pointsAtSelf(hand.origin, hand.dir, chest);
}
