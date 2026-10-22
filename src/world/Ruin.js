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
import { isEnchanted, enchantMayBreak } from './EnchantedStone.js';

export const RUIN = {
    DEEP: 28, // blocks: how deep under the place the caves cave in
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

/** A column with enchanted stone the breaker may not break here (EnchantedStone.js): it stands whole. */
function enchantedHolds(data, x, z, top, base) {
    if (enchantMayBreak(data, x, z)) return false;
    for (let L = top; L > base - 3; L--) if (isEnchanted(data.get(x, L, z))) return true;
    return false;
}

/** Water in this column or within 2 columns of it, at the ground's level or just above it. */
function nearWater(data, x, z, g) {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (dx * dx + dz * dz > 5) continue;
        for (let L = g - 1; L <= g + 2; L++) if (data.get(x + dx, L, z + dz) === BLOCK.WATER) return true;
    }
    return false;
}

/**
 * The hollows of a column between layers L0 and its top: caves, tunnels, the space under
 * an overhang — air with rock (or anything solid) both under and over it.
 * @returns {Array<{F: number, C: number}>} F: the floor's layer, C: the ceiling's lowest layer
 */
export function hollows(data, x, z, L0, top) {
    const out = [];
    let F = null, wet = false;
    for (let L = L0; L <= top; L++) {
        const t = data.get(x, L, z);
        if (t === BLOCK.AIR || t === BLOCK.WATER) {
            if (F === null) { if (L > L0 && isSolid(data.get(x, L - 1, z))) { F = L - 1; wet = false; } else continue; }
            if (t === BLOCK.WATER) wet = true;
        } else if (F !== null) {
            if (!wet) out.push({ F, C: L }); // (a flooded cave stays as it is)
            F = null;
        }
    }
    return out;
}

const deepFrom = (data, cy, floor) => Math.max(floor - 1, Math.round(cy + 1.5) - RUIN.DEEP); // (from the bedrock up)

/** The ragged edge of a circle of `radius` at the column (x, z) (in 2×2 patches). */
const raggedR = (x, z, radius) => radius * (1 - RUIN.EDGE + 2 * RUIN.EDGE * hash01(x >> 1, 7, z >> 1, 3));

/** Is the column (x, z) inside the ragged circle of `radius` round (cx, cz)? (as ruinColumns takes it) */
export function inRuin(x, z, cx, cz, radius) {
    return Math.hypot(x - cx, z - cz) <= raggedR(x, z, radius);
}

/** The columns of the area: [x, z, e] (e: 0 at the centre, 1 at the edge). */
export function ruinColumns(cx, cz, radius = RUIN.RADIUS) {
    const out = [];
    const R = radius * (1 + RUIN.EDGE);
    const x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), z0 = Math.floor(cz - R), z1 = Math.ceil(cz + R);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, z - cz);
        const r = raggedR(x, z, radius); // (ragged, in 2×2 patches)
        if (d > r) continue;
        out.push([x, z, d / r]);
    }
    return out;
}

/**
 * The built blocks the area holds now (to see them crack while the ground shakes).
 * @returns {Array<[number, number, number, number]>} [x, L, z, type] (at most `max`, spread over the area)
 */
export function ruinSample(data, cx, cz, radius = RUIN.RADIUS, max = 400, cy = null) {
    const floor = (data.bedrockTop ?? MIN_LAYER) + 1;
    const all = [];
    for (const [x, z] of ruinColumns(cx, cz, radius)) {
        const top = data.topLayer(x, z);
        const g = groundTop(data, x, z, top, floor) ?? floor - 1;
        for (let L = top; L > g; L--) { const t = data.get(x, L, z); if (built(t) && !light(t)) all.push([x, L, z, t]); }
        // a cave's ceiling cracks too (stones and dust fall from it)
        if (cy != null) for (const { C } of hollows(data, x, z, deepFrom(data, cy, floor), top)) all.push([x, C, z, data.get(x, C, z)]);
    }
    if (all.length <= max) return all;
    const step = all.length / max, out = [];
    for (let i = 0; i < max; i++) out.push(all[Math.floor(i * step)]);
    return out;
}

/**
 * Bring everything built in the area down (changes the data).
 * `ring` {inner, full}: only the band between the circle of `inner` (it came down already — or the
 * caster's island) and this one, as a wave rolling outwards does it («Circle Attack», «Inspirius»);
 * the stubs and the sinking are reckoned from the whole circle (`full`), and the ground heaves up
 * in a ridge at the band's outer edge (the earth thrown up by the wave).
 * @returns {{removed: Array, rubble: Array, falls: Array, sunk: number}}  (sunk: blocks of ground gone)
 *   removed [x, L, z, type] — the blocks that came down (from where they stood),
 *   rubble [x, L, z, type] — the heaps where they lie now, falls — Collapse.js pieces
 */
export function ruinArea(data, cx, cy, cz, radius = RUIN.RADIUS, hold = null, ring = null) {
    const floor = (data.bedrockTop ?? MIN_LAYER) + 1;
    const cols = ruinColumns(cx, cz, radius);
    const removed = [], rubble = [], heavy = [];
    const dips = [], caveRubble = [], ridge = [];
    for (let [x, z, e] of cols) {
        if (hold && hold(x, null, z)) continue; // (a house's sphere of protection holds: HouseWards.js)
        if (ring) {
            if (ring.inner > 0 && inRuin(x, z, cx, cz, ring.inner)) continue; // (done already / the island)
            if (e > 0.82 && hash01(x, 5, z, 17) < 0.4) ridge.push([x, z]); // (the wave's crest)
            e = Math.min(1, Math.hypot(x - cx, z - cz) / (ring.full || radius));
        }
        const top = data.topLayer(x, z);
        const g = groundTop(data, x, z, top, floor);
        const base = g ?? floor - 1;
        if (enchantedHolds(data, x, z, top, base)) continue; // (the enchanted stone holds the whole column — EnchantedStone.js)
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
            if (!light(t)) { n++; heavy.push(isEnchanted(t) ? BLOCK.COBBLE : t); } // (broken enchanted stone lies as plain rubble)
        }
        // the ground sinks a little (not under water, never down to the bedrock; a river's or a
        // lake's bank holds: the water keeps its shape instead of spilling over the sunk grass)
        if (g != null && g - 2 > floor && !nearWater(data, x, z, g)) {
            const s = e < 0.85 ? 1 + (e < 0.45 && hash01(x, 3, z, 13) < 0.4 ? 1 : 0) : 0;
            if (s > 0) {
                const hi = Math.max(g, data.topLayer(x, z));
                for (let L = g - s + 1; L <= hi; L++) data.set(x, L - s, z, data.get(x, L, z));
                for (let L = hi - s + 1; L <= hi; L++) data.set(x, L, z, BLOCK.AIR);
                for (let i = 0; i < s; i++) dips.push({ x, y: g - s + i, z });
            }
        }
        // the caves under it cave in: their ceilings break off and lie on their floors
        caveIn(data, x, z, e, deepFrom(data, cy, floor), removed, caveRubble);
        // how much of it lies here as rubble (it lands on this column or a neighbour)
        const k = Math.min(RUIN.RUBBLE_MAX, Math.round(n * RUIN.RUBBLE * (0.5 + hash01(x, 4, z, 14))));
        for (let i = 0; i < k; i++) {
            const t = heavy[heavy.length - 1 - i] ?? BLOCK.COBBLE;
            const dx = Math.floor(hash01(x, i, z, 15) * 3) - 1, dz = Math.floor(hash01(x, i, z, 16) * 3) - 1;
            rubble.push([x + dx, z + dz, t]);
        }
    }
    data._flood?.(dips); // (a dip next to a lake or the sea fills with its water)
    // the wave's crest: the ground is thrown up one block (never on water, never under a sphere)
    const heaved = [];
    for (const [x, z] of ridge) {
        const g = groundTop(data, x, z, data.topLayer(x, z), floor);
        if (g == null || g !== data.topLayer(x, z) || nearWater(data, x, z, g)) continue;
        if (data.get(x, g + 1, z) !== BLOCK.AIR) continue;
        data.set(x, g + 1, z, data.get(x, g, z));
        heaved.push([x, g + 1, z]);
    }
    // the heaps (after everything came down and sank: they lie on what is left)
    const out = [];
    for (const [x, z, t] of rubble) {
        if (hold && hold(x, null, z)) continue;
        const L = data.topLayer(x, z) + 1;
        if (L <= floor || data.get(x, L, z) !== BLOCK.AIR) continue;
        data.set(x, L, z, t);
        out.push([x, L, z, t]);
    }
    out.push(...caveRubble);
    // the rest of what hangs at the edge falls down
    const falls = collapseAfter(data, cx, cy, cz, radius * (1 + RUIN.EDGE), ring?.inner > 0 ? ring.inner * (1 - RUIN.EDGE) : 0); // (a band: only the new band)
    return { removed, rubble: out, falls, sunk: dips.length, heaved };
}

/**
 * A column's caves cave in (changes the data): 3–6 blocks of every ceiling break off
 * (more in the middle; a thin ceiling comes down whole — the cave opens to the sky)
 * and lies as a heap of broken stones on the cave's floor (a bigger one: the cave fills up).
 */
function caveIn(data, x, z, e, L0, removed, rubble) {
    const top = data.topLayer(x, z);
    const list = hollows(data, x, z, L0, top);
    if (!list.length) return;
    const heaps = [];
    for (const { F, C } of list) {
        let th = 0;
        while (C + th <= top && isSolid(data.get(x, C + th, z)) && data.get(x, C + th, z) !== BLOCK.BEDROCK) th++;
        let k = e > 0.85 ? 1 : 3 + Math.floor(hash01(x, C, z, 31) * 3) + (e < 0.5 ? 1 : 0);
        if (th <= k + 1) k = th; // (a thin roof: all of it)
        const fell = [];
        for (let L = C; L < C + k; L++) {
            const t = data.get(x, L, z);
            if (!isSolid(t) || t === BLOCK.BEDROCK || t === BLOCK.ICE_SHAPE) break;
            data.set(x, L, z, BLOCK.AIR);
            removed.push([x, L, z, t]);
            if (!light(t)) fell.push(t);
        }
        // (broken rock takes more room than whole rock: the heap is bigger than what fell)
        const n = Math.min(C - F - 1, Math.round(fell.length * (1.3 + 0.5 * hash01(x, F, z, 32))));
        const types = [];
        for (let i = 0; i < n; i++) types.push(fell[i] ?? BLOCK.COBBLE);
        heaps.push({ C, types });
    }
    // the stones lie on whatever is under them now (a lower cave's floor if its ceiling went too)
    for (const { C, types } of heaps) {
        for (const t of types) {
            const L = data.floorBelow(x, z, C - 1) + 1;
            if (L >= C || data.get(x, L, z) !== BLOCK.AIR) break;
            const stone = isGround(t) && hash01(x, L, z, 33) < 0.5 ? BLOCK.COBBLE : t; // (broken rock)
            data.set(x, L, z, stone);
            rubble.push([x, L, z, stone]);
        }
    }
}
