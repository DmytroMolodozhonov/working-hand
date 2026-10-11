/**
 * Ruin.js — «Total Destruction»: everything built in an area falls apart by itself.
 *
 * No crater (that is Bombardo): the walls, towers, roofs and trees in the circle come
 * down, low stubs of walls stand here and there (taller towards the edge), the
 * broken stones lie in heaps of rubble on the ground, and the ground itself sinks a
 * little (1 block, at the middle sometimes 2). What is left hanging at the edge
 * (a roof whose walls are gone, a tree's crown) falls down (Collapse.js).
 *
 * Deterministic (hash of the block's place): the same ruins on every computer and
 * when a save replays it. Pure data (no three.js): works on a TerrainData.
 */

import { BLOCK, MIN_LAYER, isSolid, isLeaves } from './Terrain.js';
import { collapseAfter } from './Collapse.js';

export const RUIN = {
    RADIUS: 20, // m: 5× «Бомбардо Максима» (its crater is ~6 m): a castle's whole keep
    EDGE: 0.18, // the edge of the circle is ragged by this share of the radius
    RUBBLE: 0.3, // share of the fallen heavy blocks that lies as rubble
    RUBBLE_MAX: 3, // blocks: the highest heap in one column
};

/** Natural ground (as Collapse.js): it sinks, it is never «built». */
const GROUND = new Set();
function isGround(t) {
    if (!GROUND.size) for (const k of ['GRASS', 'DIRT', 'STONE', 'SNOW', 'SAND', 'ICE', 'BEDROCK', 'FARMLAND', 'PATH']) if (BLOCK[k] != null) GROUND.add(BLOCK[k]);
    return GROUND.has(t);
}
const built = (t) => isSolid(t) && t !== BLOCK.ICE_SHAPE && !isGround(t);
/** Light things never lie as rubble (they are crushed to nothing). */
const light = (t) => isLeaves(t) || t === BLOCK.WHEAT || t === BLOCK.FLOWERS || t === BLOCK.VEG || t === BLOCK.LANTERN ||
    t === BLOCK.CLOTH_WHITE || t === BLOCK.CLOTH_YELLOW || t === BLOCK.CARPET_RED || t === BLOCK.CARPET_BLUE || t === BLOCK.CARPET_GREEN ||
    t === BLOCK.CARPET_PURPLE || t === BLOCK.HAY || t === BLOCK.THATCH || t === BLOCK.ARCANE_LAMP || t === BLOCK.ARCANE_LAMP_VIOLET;

export function hash01(x, L, z, s = 0) {
    let h = Math.imul(x, 73856093) ^ Math.imul(L + s * 977, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(s, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The highest natural ground layer in a column (at or below `from`), or null. */
function groundTop(data, x, z, from, floor) {
    for (let L = from; L >= floor; L--) {
        const t = data.get(x, L, z);
        if (isGround(t)) return L;
    }
    return null;
}

/** The columns of the area: [x, z, e] (e: 0 at the centre, 1 at the edge). */
export function ruinColumns(cx, cz, radius = RUIN.RADIUS) {
    const out = [];
    const R = radius * (1 + RUIN.EDGE);
    const x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), z0 = Math.floor(cz - R), z1 = Math.ceil(cz + R);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, z - cz);
        const r = radius * (1 - RUIN.EDGE + 2 * RUIN.EDGE * hash01(x >> 1, 7, z >> 1, 3)); // (ragged, in 2×2 patches)
        if (d > r) continue;
        out.push([x, z, d / r]);
    }
    return out;
}

/**
 * The built blocks the area holds now (to see them crack while the ground shakes).
 * @returns {Array<[number, number, number, number]>} [x, L, z, type] (at most `max`, spread over the area)
 */
export function ruinSample(data, cx, cz, radius = RUIN.RADIUS, max = 400) {
    const floor = (data.bedrockTop ?? MIN_LAYER) + 1;
    const all = [];
    for (const [x, z] of ruinColumns(cx, cz, radius)) {
        const top = data.topLayer(x, z);
        const g = groundTop(data, x, z, top, floor) ?? floor - 1;
        for (let L = top; L > g; L--) { const t = data.get(x, L, z); if (built(t) && !light(t)) all.push([x, L, z, t]); }
    }
    if (all.length <= max) return all;
    const step = all.length / max, out = [];
    for (let i = 0; i < max; i++) out.push(all[Math.floor(i * step)]);
    return out;
}

/**
 * Bring everything built in the area down (changes the data).
 * @returns {{removed: Array, rubble: Array, falls: Array, sunk: number}}  (sunk: blocks of ground gone)
 *   removed [x, L, z, type] — the blocks that came down (from where they stood),
 *   rubble [x, L, z, type] — the heaps where they lie now, falls — Collapse.js pieces
 */
export function ruinArea(data, cx, cy, cz, radius = RUIN.RADIUS) {
    const floor = (data.bedrockTop ?? MIN_LAYER) + 1;
    const cols = ruinColumns(cx, cz, radius);
    const removed = [], rubble = [], heavy = [];
    const dips = [];
    for (const [x, z, e] of cols) {
        const top = data.topLayer(x, z);
        const g = groundTop(data, x, z, top, floor);
        const base = g ?? floor - 1;
        // a stub of a wall may stand: low in the middle, taller towards the edge
        const h1 = hash01(x, 1, z, 11), h2 = hash01(x, 2, z, 12);
        const keep = (h1 < 0.45 ? 1 : 0) + (h1 < 0.15 ? 1 : 0) + (e > 0.6 ? Math.floor(h2 * 5 * (e - 0.6) / 0.4) : 0);
        let n = 0;
        for (let L = top; L > base; L--) {
            const t = data.get(x, L, z);
            if (!built(t)) continue;
            if (L <= base + keep && !light(t)) continue; // (the stub)
            data.set(x, L, z, BLOCK.AIR);
            removed.push([x, L, z, t]);
            if (!light(t)) { n++; heavy.push(t); }
        }
        // the ground sinks a little (not under water, never down to the bedrock)
        if (g != null && g - 2 > floor && data.get(x, g + 1, z) !== BLOCK.WATER) {
            const s = e < 0.85 ? 1 + (e < 0.45 && hash01(x, 3, z, 13) < 0.4 ? 1 : 0) : 0;
            if (s > 0) {
                const hi = Math.max(g, data.topLayer(x, z));
                for (let L = g - s + 1; L <= hi; L++) data.set(x, L - s, z, data.get(x, L, z));
                for (let L = hi - s + 1; L <= hi; L++) data.set(x, L, z, BLOCK.AIR);
                for (let i = 0; i < s; i++) dips.push({ x, y: g - s + i, z });
            }
        }
        // how much of it lies here as rubble (it lands on this column or a neighbour)
        const k = Math.min(RUIN.RUBBLE_MAX, Math.round(n * RUIN.RUBBLE * (0.5 + hash01(x, 4, z, 14))));
        for (let i = 0; i < k; i++) {
            const t = heavy[heavy.length - 1 - i] ?? BLOCK.COBBLE;
            const dx = Math.floor(hash01(x, i, z, 15) * 3) - 1, dz = Math.floor(hash01(x, i, z, 16) * 3) - 1;
            rubble.push([x + dx, z + dz, t]);
        }
    }
    data._flood?.(dips); // (a dip next to a lake or the sea fills with its water)
    // the heaps (after everything came down and sank: they lie on what is left)
    const out = [];
    for (const [x, z, t] of rubble) {
        const L = data.topLayer(x, z) + 1;
        if (L <= floor || data.get(x, L, z) !== BLOCK.AIR) continue;
        data.set(x, L, z, t);
        out.push([x, L, z, t]);
    }
    // the rest of what hangs at the edge falls down
    const falls = collapseAfter(data, cx, cy, cz, radius * (1 + RUIN.EDGE));
    return { removed, rubble: out, falls, sunk: dips.length };
}
