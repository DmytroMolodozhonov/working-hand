/**
 * SpiderLairs.js — where the giant spider lives (Spider.js).
 *
 * (the author: «Паучиха ночью спавнится. И она довольно редкая… Она спавнится в три раза реже, чем
 * спавнится замки. И она не нападает сама. Ее можно найти только и самим начать атаку.»)
 *
 *  - The same cells as the castles (CASTLE_CELL), but a cell holds a lair three times less often than
 *    it holds a castle (CASTLE_CHANCE / 3).
 *  - Only on the Earth, on the open dry land: never in the sea, a lake or a river, never in or by a
 *    cave, never on a castle's / a tower's land or in its village, never near the spawn.
 *
 * Pure and deterministic (Node-testable, no THREE): the same seed gives the same lairs on every computer.
 */

import { createRng } from '../core/math.js';
import { offEarth } from './Planets.js';

// (Castles.js is not imported: it would pull the whole terrain in a circle — the test checks these match it)
const CASTLE_CELL = 480, CASTLE_CHANCE = 0.92;

export const SPIDER_LAIR = {
    CELL: CASTLE_CELL, // m: at most one lair per cell (the castles' cells: Castles.CASTLE_CELL)
    CHANCE: CASTLE_CHANCE / 3, // three times rarer than castles (Castles.CASTLE_CHANCE)
    MIN_SPAWN: 320, // m: never nearer the world's spawn
    MARGIN: 40, // m from the cell's edge
    TRIES: 24, // spots tried in a cell for dry land away from caves
};

/**
 * The lair of a cell: {id, x, z} or null.
 * @param {number} gx  the cell
 * @param {number} gz
 * @param {number} seed  the world's seed
 * @param {(x:number, z:number) => boolean} blocked  no lair here (water, a castle or village…)
 */
export function spiderLairOf(gx, gz, seed, blocked) {
    const C = SPIDER_LAIR.CELL;
    if (offEarth((gx + 1) * C)) return null; // (the Earth only: Planets.js)
    const rng = createRng((Math.imul(seed, 2654435761) ^ Math.imul(gx, 40503) ^ Math.imul(gz, 92821) ^ 0x5b1d) >>> 0);
    rng(); // (the first draw of a fresh generator is the least mixed)
    if (rng() > SPIDER_LAIR.CHANCE) return null;
    const M = SPIDER_LAIR.MARGIN, span = C - 2 * M;
    for (let t = 0; t < SPIDER_LAIR.TRIES; t++) {
        const x = Math.round(gx * C + M + rng() * span), z = Math.round(gz * C + M + rng() * span);
        if (Math.hypot(x, z) < SPIDER_LAIR.MIN_SPAWN) continue;
        if (blocked(x, z)) continue;
        return { id: gx + ',' + gz, x, z };
    }
    return null;
}

/** The lairs within `r` of a point (into `out`); `lairOf(gx, gz)` gives a cell's lair (cached by the caller). */
export function spiderLairsNear(x, z, r, lairOf, out = []) {
    out.length = 0;
    if (offEarth(x - r)) return out;
    const C = SPIDER_LAIR.CELL;
    const g0x = Math.floor((x - r) / C), g1x = Math.floor((x + r) / C);
    const g0z = Math.floor((z - r) / C), g1z = Math.floor((z + r) / C);
    for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
        const L = lairOf(gx, gz);
        if (L && Math.hypot(L.x - x, L.z - z) <= r) out.push(L);
    }
    return out;
}
