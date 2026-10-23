/**
 * CoinScale.js — how much gold the world spawns (the author: «сократить количество золота во всех сундуках и вообще
 * во всей игре на 40 %»): every rule that says how many coins a chest, a knight, a king, a wizard, a ship or a dragon's
 * hoard holds is cut by 40 % (× 0.6) — each for its own place, the proportions between them as they were. One number:
 * change it here. Pure.
 */

export const COIN_K = 0.6;

/** A number of coins cut by 40 % (at least 1 for something that was at least 1). */
export const scaleCoins = (n) => (n > 0 ? Math.max(1, Math.round(n * COIN_K)) : 0);

/** A [min, max] range of coins cut by 40 %. */
export const scaleRange = ([a, b]) => [scaleCoins(a), scaleCoins(b)];
