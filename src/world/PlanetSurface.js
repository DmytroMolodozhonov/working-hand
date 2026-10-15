/**
 * PlanetSurface.js — the ground of the other planets (Planets.js: each rocky body has a slot of the
 * voxel world far out, x ≥ SPACE.ZONE_X). TerrainData makes a chunk there by this recipe instead of the
 * Earth's: in the terrain worker like every chunk, deterministic from the planet's seed (the same
 * ground on every computer). Pure (no THREE).
 *
 *   Moon     grey regolith, craters big and small, dark flat «seas» (maria), soft hills
 *   Mercury  darker, craters everywhere, long cliffs (scarps)
 *   Mars     rust-red dust, scattered rocks, dunes, flat-topped mesas, white polar caps
 *   Venus    dark orange basalt, «pancake» lava domes, lava flows, rolling highlands
 *   Pluto    white nitrogen-ice plains cut into cells, blocky water-ice mountains, dark red tholin land
 * No grass, no trees, no water (until a planet is terraformed: `def.terraformed` — the planet spells'
 * session grows its own grass / water / trees here; a simple start is below).
 * Longitude runs along x: the ground is seamless right round the planet (blended over the last 2 km).
 */

import { BLOCK, CHUNK, MIN_LAYER, MAX_LAYER } from './Terrain.js';
import { createNoise2D, smoothstep } from '../core/math.js';
import { slotRect } from './Planets.js';
import { venusTempleSite, templeGround, TEMPLE_FLAT } from './GodsTemple.js';

const SEAM = 2000; // m of blending at the seam round the planet

function hash(a, b, s) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

const _recipes = new Map(); // planet seed + look → its noises (a handful of planets: never grows much)

/** The noises of one planet (made once). */
function recipe(def) {
    const key = `${def.id}:${def.seed}`;
    let r = _recipes.get(key);
    if (r) return r;
    const s = def.seed | 0;
    r = { n1: createNoise2D(s ^ 0x51ed), n2: createNoise2D(s ^ 0x2ab7), n3: createNoise2D(s ^ 0x7f4a), n4: createNoise2D(s ^ 0x1c93), rect: slotRect(def), g: def.ground || {} };
    if (_recipes.size > 64) _recipes.clear();
    _recipes.set(key, r);
    return r;
}

/** Craters of one size class round a column: the summed bowl (−) and rim (+) heights. */
function craters(u, v, cell, s, chance, depthK) {
    const gx = Math.floor(u / cell), gz = Math.floor(v / cell);
    let h = 0, inside = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const cx = gx + dx, cz = gz + dz;
        if (hash(cx, cz, s) > chance) continue;
        const ox = (cx + 0.2 + 0.6 * hash(cx, cz, s + 1)) * cell, oz = (cz + 0.2 + 0.6 * hash(cx, cz, s + 2)) * cell;
        const r = cell * (0.12 + 0.3 * hash(cx, cz, s + 3));
        const d = Math.hypot(u - ox, v - oz) / r;
        if (d > 1.5) continue;
        const depth = r * 0.28 * depthK;
        if (d < 1) { h += depth * (d * d - 1); inside = Math.max(inside, 1 - d); }
        else h += depth * 0.35 * Math.max(0, 1 - (d - 1) / 0.5) ** 2;
    }
    craters.inside = inside;
    return h;
}

/**
 * The height (top solid layer) of a planet's column and what lies on top: sets planetHeight.top
 * (BLOCK of the top), .dark (a dark region), .ice (an ice region), .water (layers of water: terraformed).
 */
export function planetHeight(def, x, z) {
    const R = recipe(def), rect = R.rect, W = rect.w;
    let u = x - rect.cx;
    const v = z - rect.cz;
    if (u > W / 2) u -= W; else if (u < -W / 2) u += W;
    // (seamless round the planet: over the last 2 km before the seam the ground melts into what lies
    //  just past it — the same ground one turn further)
    const t = smoothstep(W / 2 - SEAM, W / 2, u);
    const site = templeSiteOf(def); // (Venus: the Gods' temple — its ground levelled; GodsTemple.js)
    let h = column(def, R, u, v);
    if (t > 0) {
        const top = _c.top, dark = _c.dark, ice = _c.ice;
        h = h + (column(def, R, u - W, v) - h) * t;
        if (t < 0.5) { _c.top = top; _c.dark = dark; _c.ice = ice; }
    }
    if (site && Math.abs(x - site.x) < TEMPLE_FLAT.R + TEMPLE_FLAT.BLEND && Math.abs(z - site.z) < TEMPLE_FLAT.R + TEMPLE_FLAT.BLEND) {
        h = templeGround(site, x, z, h);
        if (Math.hypot(x - site.x, z - site.z) < TEMPLE_FLAT.R) _c.dark = 0; // (no lava flow across the temple's ground)
    }
    let water = 0, top = _c.top;
    if (def.terraformed) {
        // (the start of a terraformed planet: grass on the land, water in the low places — the planet spells
        //  session gives each its own look)
        if (h < 1) { water = Math.min(6, Math.round(1 - h)); top = BLOCK.SAND; }
        else if (!_c.ice) top = BLOCK.GRASS;
    }
    if (_c.dark && top === BLOCK.REGOLITH) top = BLOCK.PLANET_DARK;
    planetHeight.top = top; planetHeight.dark = _c.dark; planetHeight.ice = _c.ice; planetHeight.water = water;
    return Math.max(MIN_LAYER + 3, Math.min(MAX_LAYER - 12, Math.round(h)));
}
const _c = { top: 0, dark: 0, ice: 0 };

/**
 * Where the Gods' temple stands (only on Venus — the planet made with the world, not a new one): {x, z, F, y, rot}
 * or null. Made once per planet (FLYMAX.TEMPLE_HOOK points here; Temple.js puts the temple there).
 */
export function templeSiteOf(def) {
    if (!def || def.id !== 'venus' || def.look !== 'venus') return null;
    const R = recipe(def);
    if (R.temple === undefined) {
        R.temple = null; // (while it is being found: the raw ground)
        const rect = R.rect, W = rect.w;
        R.temple = venusTempleSite(def, rect, (x, z) => {
            let u = x - rect.cx;
            if (u > W / 2) u -= W; else if (u < -W / 2) u += W;
            return Math.round(column(def, R, u, z - rect.cz));
        });
    }
    return R.temple;
}

/** One column's height by the planet's look (u along the longitude, v north–south, metres from the centre). */
function column(def, R, u, v) {
    const g = R.g, rect = R.rect;
    const N = (n, f) => n(u * f, v * f);
    let h = 0, top = BLOCK.REGOLITH, dark = 0, ice = 0;
    const hills = g.hills || 0.5;
    // soft rolling ground
    h += (N(R.n1, 1 / 140) * 7 + N(R.n2, 1 / 47) * 2.5) * hills + 4;
    const look = def.look;
    if (look === 'moon' || look === 'mercury' || look === 'rock') {
        // dark «seas»: low, flat
        if (g.maria) {
            const m = N(R.n3, 1 / 900);
            if (m > 0.12) { const k = smoothstep(0.12, 0.3, m); h = h * (1 - 0.7 * k) - 3 * k; dark = k > 0.5 ? 1 : 0; }
        }
        const s = def.seed | 0, ck = g.craters || 1;
        h += craters(u, v, 340, s + 11, 0.35 * ck, 1.0);
        h += craters(u, v, 90, s + 23, 0.45 * ck, 1.0);
        h += craters(u, v, 26, s + 37, 0.55 * ck, 0.8);
        if (g.scarps) {
            // long cliffs: the ground steps up along a winding line
            const c = N(R.n4, 1 / 600);
            h += smoothstep(-0.02, 0.02, c) * 9 * g.scarps;
        }
    } else if (look === 'mars') {
        const m = N(R.n3, 1 / 520);
        if (g.mesas && m > 0.28) h += Math.min(16, Math.floor(smoothstep(0.28, 0.36, m) * 16 / 4) * 4) * g.mesas; // (flat tops, stepped sides)
        if (g.dunes) {
            const d = Math.sin(u / 11 + N(R.n2, 1 / 90) * 4) * 0.5 + 0.5;
            const field = smoothstep(-0.1, 0.25, -m) * g.dunes;
            h += d * d * 3 * field;
        }
        h += craters(u, v, 220, (def.seed | 0) + 5, 0.2, 0.7);
        dark = N(R.n4, 1 / 700) > 0.3 ? 1 : 0;
        if (g.caps && Math.abs(v) > rect.h * 0.42) { ice = 1; top = BLOCK.PLANET_ICE; }
    } else if (look === 'venus') {
        // «pancake» lava domes: wide flat-topped rounds
        if (g.domes) {
            const cell = 180, gx = Math.floor(u / cell), gz = Math.floor(v / cell), s = (def.seed | 0) + 41;
            for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                const cx = gx + dx, cz = gz + dz;
                if (hash(cx, cz, s) > 0.4) continue;
                const ox = (cx + 0.5) * cell + (hash(cx, cz, s + 1) - 0.5) * cell * 0.5, oz = (cz + 0.5) * cell + (hash(cx, cz, s + 2) - 0.5) * cell * 0.5;
                const r = 24 + 40 * hash(cx, cz, s + 3), d = Math.hypot(u - ox, v - oz);
                if (d < r * 1.25) h = Math.max(h, 4 + (8 + 6 * hash(cx, cz, s + 4)) * smoothstep(r * 1.25, r * 0.95, d));
            }
        }
        h += N(R.n3, 1 / 800) * 10;
        if (g.flows) dark = Math.abs(N(R.n4, 1 / 160)) < 0.06 * g.flows ? 1 : 0;
    } else if (look === 'pluto') {
        const p = N(R.n3, 1 / 1100);
        if (g.plains && p < -0.05) {
            // the nitrogen-ice plain: flat, cut into cells by shallow troughs
            const k = smoothstep(-0.05, -0.15, p);
            h = h * (1 - k) + 1 * k;
            const cu = u / 60, cv = v / 60, fx = cu - Math.floor(cu), fz = cv - Math.floor(cv);
            if (k > 0.6 && (Math.min(fx, 1 - fx) < 0.04 || Math.min(fz, 1 - fz) < 0.04)) h -= 1;
            if (k > 0.3) { ice = 1; top = BLOCK.PLANET_ICE; }
        } else if (g.mountains && p > 0.22) {
            // blocky mountains of water ice
            const k = smoothstep(0.22, 0.4, p);
            h += Math.floor((14 + 30 * Math.abs(N(R.n2, 1 / 70))) * k / 3) * 3;
            if (k > 0.4) { ice = 1; top = BLOCK.PLANET_ICE; }
        } else dark = N(R.n4, 1 / 400) > -0.1 ? 1 : 0; // (the dark red tholin land)
        h += craters(u, v, 160, (def.seed | 0) + 9, 0.15, 0.6);
    }
    _c.top = top; _c.dark = dark; _c.ice = ice;
    return h;
}
planetHeight.top = 63; // (BLOCK.REGOLITH: Terrain.js is still loading here)
planetHeight.water = 0;

/** A chunk of a planet's ground, in the very format of TerrainData's chunks. */
export function generatePlanetChunk(cx, cz, def, bedrock) {
    const HEIGHT = MAX_LAYER - MIN_LAYER + 1; // (read here: Terrain.js imports this module)
    const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const top = new Int16Array(CHUNK * CHUNK);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const P = CHUNK + 2;
    const hh = new Int16Array(P * P), tops = new Uint8Array(P * P), wat = new Uint8Array(P * P);
    for (let pz = 0; pz < P; pz++) for (let px = 0; px < P; px++) {
        const i = pz * P + px;
        hh[i] = planetHeight(def, x0 + px - 1, z0 + pz - 1);
        tops[i] = planetHeight.top; wat[i] = planetHeight.water;
    }
    const s = def.seed | 0;
    let maxTop = 0;
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
        const i0 = (lz + 1) * P + lx + 1, h = hh[i0];
        const slope = Math.max(Math.abs(hh[i0 + 1] - h), Math.abs(hh[i0 - 1] - h), Math.abs(hh[i0 + P] - h), Math.abs(hh[i0 - P] - h));
        let surf = tops[i0];
        if (slope >= 3 && surf !== BLOCK.PLANET_ICE) surf = BLOCK.PLANET_ROCK; // (bare rock on the steep sides)
        const col = lz * CHUNK + lx;
        for (let L = MIN_LAYER; L <= h; L++) {
            let type;
            if (L <= bedrock) type = BLOCK.BEDROCK;
            else if (L === h) type = surf;
            else if (L >= h - 2 && surf !== BLOCK.PLANET_ROCK) type = surf === BLOCK.GRASS ? BLOCK.DIRT : surf === BLOCK.PLANET_ICE ? BLOCK.PLANET_ICE : BLOCK.REGOLITH;
            else type = BLOCK.PLANET_ROCK;
            blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = type;
        }
        let ht = h;
        for (let L = h + 1; L <= h + wat[i0]; L++) blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = BLOCK.WATER;
        // scattered boulders (Mars most of all): a rock or two on the dust
        const g = def.ground || {};
        const rk = (g.rocks || 0.15) * 0.012;
        if (!wat[i0] && slope < 2 && hash(x0 + lx, z0 + lz, s + 99) < rk && h + 2 <= MAX_LAYER) {
            blocks[((h + 1 - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = BLOCK.PLANET_ROCK;
            ht = h + 1;
            if (hash(x0 + lx, z0 + lz, s + 98) < 0.3) { blocks[((h + 2 - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = BLOCK.PLANET_ROCK; ht = h + 2; }
        }
        top[col] = ht;
        if (ht + wat[i0] > maxTop) maxTop = ht + wat[i0];
    }
    let minOpen = MAX_LAYER;
    for (let i = 0; i < top.length; i++) if (top[i] + 1 < minOpen) minOpen = top[i] + 1;
    return { cx, cz, blocks, top, maxTop, modified: false, minOpen, sea: null, planet: def.id };
}

const _col = { r: 0, g: 0, b: 0 };
/** The colour of a planet block's face (its planet's palette, a little jitter like the Earth's rock). */
export function planetFaceColor(def, type, ix, L, iz, isTop) {
    const g = def?.ground || {};
    let base = type === BLOCK.PLANET_ICE ? g.ice ?? 0xdedad2 : type === BLOCK.PLANET_DARK ? g.dark ?? 0x4a4440 : type === BLOCK.PLANET_ROCK ? g.rock ?? 0x6a6058 : g.dust ?? 0x8a7f74;
    if (type === BLOCK.REGOLITH && !isTop) base = mix(base, g.rock ?? 0x6a6058, 0.35);
    let h = isTop ? ((ix >> 1) * 73856093) ^ (L * 19349663) ^ ((iz >> 1) * 83492791) : (L * 19349663) ^ (type * 83492791);
    h = (h ^ (h >>> 13)) >>> 0;
    const j = ((h % 1000) / 1000 - 0.5) * (type === BLOCK.PLANET_ICE ? 0.06 : 0.14);
    _col.r = Math.min(255, Math.max(0, ((base >> 16) & 255) * (1 + j)));
    _col.g = Math.min(255, Math.max(0, ((base >> 8) & 255) * (1 + j)));
    _col.b = Math.min(255, Math.max(0, (base & 255) * (1 + j)));
    return ((_col.r & 255) << 16) | ((_col.g & 255) << 8) | (_col.b & 255);
}

function mix(a, b, k) {
    const r = ((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k, g = ((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k, bl = (a & 255) * (1 - k) + (b & 255) * k;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
