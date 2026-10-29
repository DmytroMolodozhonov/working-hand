/**
 * Jump.js — the hero's jump and the hero's gravity (pure numbers, Node-testable).
 *
 * ГРАВИТАЦИЯ ГЕРОЯ — ОДНО МЕСТО: `character.gravityK` (множитель, 1 = Земля). Его же читают
 * `game.gravityK` (геттер/сеттер в Game.js). Падение, прыжок и ходьба героя берут только его:
 *   game.gravityK = 0.38;   // Марс: прыжок выше и дольше в воздухе, падение медленнее
 *   game.gravityK = 0.17;   // Луна
 *   game.gravityK = 2.5;    // Юпитер (смягчённо): прыжка почти нет, ходьба медленнее и тяжелее
 *   game.gravityK = 1;      // назад на Землю
 * (Планета выставляет его, когда герой на ней оказывается, и возвращает 1, когда улетает.)
 *
 * The jump: the legs push the body off the ground with a speed that comes from how hard the
 * person really jumped (JumpReader strength 0..1). On Earth the strongest jump is 1.6 units (the hero is ~3.5 units tall, a block is 1: a step is 1.05 and the air adds JUMP_ASSIST 0.3 — 2 blocks are jumped onto, 3 never; it was 2.4 before
 * ). The same push under a weaker pull goes higher and stays
 * longer in the air; under a stronger one the legs barely lift the body (over ~2g: almost no jump).
 */

export const G = 20;              // the hero's gravity on Earth (units / s²)
export const JUMP_H = { MIN: 0.5, MAX: 1.6 }; // jump height on Earth (units) for strength 0 … 1 (see JUMP_ASSIST)
export const JUMP_ASSIST = 0.3;  // in the air the body gets up onto an edge this much higher than a step (units): the edge is caught, not bumped

/** The legs' take-off speed (units / s) for this strength under this gravity. */
export function jumpSpeed(strength, gravityK = 1) {
    const k = Math.max(0.05, gravityK || 1);
    const s = Math.max(0, Math.min(1, strength || 0));
    const h = JUMP_H.MIN + (JUMP_H.MAX - JUMP_H.MIN) * s;
    const v = Math.sqrt(2 * G * h); // (the speed the legs give on Earth)
    // a heavy body: the same legs give it less speed (over ~2g almost none)
    return v * (k > 1 ? Math.max(0, 1 - (k - 1) * 0.45) : 1);
}

/** How high (units) a jump of this strength goes under this gravity. */
export function jumpHeight(strength, gravityK = 1) {
    const v = jumpSpeed(strength, gravityK);
    return (v * v) / (2 * G * Math.max(0.05, gravityK || 1));
}

/** Walking speed under this gravity (heavy: slower; light: as on Earth). */
export function walkK(gravityK = 1) {
    return gravityK > 1 ? 1 / (1 + (gravityK - 1) * 0.4) : 1;
}

/** How much lower the body stands under a heavy pull (the knees give a little; units). */
export function heavySink(gravityK = 1) {
    return gravityK > 1 ? Math.min(0.35, (gravityK - 1) * 0.2) : 0;
}

const FAN = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]; // (rays round where the body faces, radians: up to 80° to either side)

/**
 * A jump right in front of a ledge (up to two blocks, room on its top): the speed (units / s, {x, z}) the legs push the body
 * onto it with, or null when there is nothing to jump onto. A fan of rays round the facing (a ledge at a slant or at a corner
 * touches the body too); the push goes towards the ledge's cell. T: terrain (topLayer, floorBelow, solidIn); feet: the feet's y.
 */
export function ledgePush(T, x, z, feet, yaw, radius = 0.48) {
    for (const off of FAN) {
        const a = yaw + off, fx = -Math.sin(a), fz = -Math.cos(a);
        for (let d = radius + 0.1; d <= radius + 1.3; d += 0.2) {
            const ix = Math.round(x + fx * d), iz = Math.round(z + fz * d);
            if (ix === Math.round(x) && iz === Math.round(z)) continue;
            const L = T.floorBelow ? T.floorBelow(ix, iz, Math.floor(feet + 3.5)) : T.topLayer(ix, iz);
            const h = L - 0.5 - feet;
            if (h < 0.3 || h > 2.4) continue; // (the strongest jump still falls short of three blocks)
            if (T.solidIn && T.solidIn(ix, iz, L + 1, L + 4)) break; // (a wall, no room on its top: the next ray)
            const dx = ix - x, dz = iz - z, dl = Math.hypot(dx, dz) || 1;
            return { x: dx / dl * 3, z: dz / dl * 3 };
        }
    }
    return null;
}
