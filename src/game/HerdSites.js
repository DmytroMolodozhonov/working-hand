/**
 * Where herds live: the world is cut into small cells, and each cell has (or has not) one herd place, decided only by the world's
 * seed — the same on every computer and not depending on any animals around. The share of cells that have a herd is the density
 * (per area); the kind and the size of the herd come from the same hash. Animals.js wakes a place when a player comes near.
 */
import { CASTLE_CELL, hash01 } from '../world/Castles.js';
import { herdKind } from './Animals.js';

export const SITES = {
    CELL: CASTLE_CELL / 4, // m: 120 — a place per cell at most (a settlement sector of 480 m holds 16 cells)
    CHANCE: 0.6, // of the cells have a herd place: ~42 per km² (before the land is checked: grass only, no castles, water, islands)
    EDGE: 20, // m: a place keeps this far from its cell's border — two places are never closer than 40 m
    MIN: 2, MAX: 5, // heads
};

/** The herd place of the cell (gx, gz) in a world of this seed, or null. Pure: same input — same place. */
export function siteAt(gx, gz, seed) {
    if (hash01(gx, gz, seed + 9101) >= SITES.CHANCE) return null;
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
