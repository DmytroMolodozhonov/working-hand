/**
 * Where herds live: the world is cut into small cells, and each cell has (or has not) one herd place, decided only by the world's
 * seed — the same on every computer and not depending on any animals around. The share of cells that have a herd is the density
 * (per area); the kind and the size of the herd come from the same hash. Animals.js wakes a place when a player comes near.
 */
import { CASTLE_CELL, hash01 } from '../world/Castles.js';
import { herdKind } from './Animals.js';

/**
 * HERD_DENSITY — herd places per km² (before the land is checked: grass only, no castles, water, islands, so on the real meadow
 * a bit fewer). The one knob for "more / fewer animals": change this number only (the most the grid holds is ~156). Was ~42
 * (a herd tried every ~48 s around the player); now about twice. The kinds split it as HERD_KINDS (cow 1.2 : pig 1.3 : sheep 2.4 : horse 1.4).
 */
export const HERD_DENSITY = 90;
export const SITES = {
    CELL: CASTLE_CELL / 6, // m: 80 — a place per cell at most (a settlement sector of 480 m holds 36 cells)
    EDGE: 20, // m: a place keeps this far from its cell's border — two places are never closer than 40 m
    MIN: 2, MAX: 5, // heads
};
/** The share of cells that have a herd place (follows HERD_DENSITY). */
const chance = () => Math.min(1, HERD_DENSITY * (SITES.CELL / 1000) ** 2);

/** The herd place of the cell (gx, gz) in a world of this seed, or null. Pure: same input — same place. */
export function siteAt(gx, gz, seed) {
    if (hash01(gx, gz, seed + 9101) >= chance()) return null;
    const C = SITES.CELL, E = SITES.EDGE;
    return {
        key: gx + ',' + gz, gx, gz,
        x: gx * C + E + hash01(gx, gz, seed + 9102) * (C - 2 * E),
        z: gz * C + E + hash01(gx, gz, seed + 9103) * (C - 2 * E),
        type: herdKind(hash01(gx, gz, seed + 9104)),
        n: SITES.MIN + Math.min(SITES.MAX - SITES.MIN, Math.floor(hash01(gx, gz, seed + 9105) * (SITES.MAX - SITES.MIN + 1))),
    };
}

/** Calls fn(site) for every herd place within r m of (x, z). */
export function sitesNear(x, z, r, seed, fn) {
    const C = SITES.CELL;
    for (let gx = Math.floor((x - r) / C); gx <= Math.floor((x + r) / C); gx++) {
        for (let gz = Math.floor((z - r) / C); gz <= Math.floor((z + r) / C); gz++) {
            const s = siteAt(gx, gz, seed);
            if (s && Math.hypot(s.x - x, s.z - z) <= r) fn(s);
        }
    }
}
