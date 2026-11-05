/**
 * SunkenSites.js — where the sea's bottom keeps its secrets (the sea update; the author: «затонувшие корабли, подводный храм с
 * сундуками»). Pure (Node-testable): the same places on every computer from the world's seed.
 *
 *   wreck   a ship long gone down (a pinnace, now and then a fluyt): lying on the sand heeled over, her masts broken, her sails
 *           rotted, holes stove in her side — her chests still in her (a captain's in his cabin): SunkenWorld.js / ShipModel 'sunk';
 *   temple  the temple of the sea's old faith, deep down (rare): steps, a colonnade half fallen, the cella with its glowing runes, the
 *           sea's guardian over the altar — the offerings in its chests (SeaTempleModel.js).
 * A place is tried in every CELL m (by a hash); it stays only where the sea is deep enough and its bottom flat enough under the whole
 * footprint (`siteFits` — the game asks the land, once it is made). Nothing here is saved: what was taken is (the opened chests).
 */
import { SHIP_CLASSES } from './ShipTypes.js';

/** The world's place hash (the same as Castles.hash01 — kept here: importing Castles alone breaks its own import order). */
export function hash01(a, b, seed) {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

export const SUNKEN = {
    // (the author 05.11: wrecks «в 2 раза реже, чем пещеры» — the caves are ~110 a km² of land (cave systems: one in ~9 of 10 cells of
    //  90 m); a wreck is tried ~36 times a km² of sea, ~half of them fit the bottom: it was ~1.7 tries a km², twenty times rarer)
    CELL: 150, // m: one place tried per cell
    WRECK: 0.8, // of the cells: a wreck tried
    TEMPLE: 0.0064, // of the cells: the temple tried (rare: as before, ~0.28 a km²)
    WRECK_DEPTH: 8, // m of water over the bottom at least
    TEMPLE_DEPTH: 13,
    FLAT: 4.5, // m: the bottom under the footprint may rise and fall this much at most
    NEAR: 230, // m: a site this near is raised (its model, its chests)
    FAR: 300, // m: one this far is put away
    HEEL: [0.22, 0.42], // rad: how far a wreck lies over
    BURY: 1.1, // m: a wreck's keel sunk into the sand
    TEMPLE_W: 22, TEMPLE_L: 32, // m: the temple's platform (its lowest step)
};

const TAU = Math.PI * 2;

/** The site tried in cell (gx, gz) of a world (seed), or null — before the water is checked (siteFits). */
export function sunkenSiteAt(gx, gz, seed) {
    const r = hash01(gx, gz, seed + 33101);
    const kind = r < SUNKEN.TEMPLE ? 'temple' : r < SUNKEN.TEMPLE + SUNKEN.WRECK ? 'wreck' : null;
    if (!kind) return null;
    const C = SUNKEN.CELL;
    const x = (gx + 0.2 + 0.6 * hash01(gx, gz, seed + 33102)) * C, z = (gz + 0.2 + 0.6 * hash01(gx, gz, seed + 33103)) * C;
    const id = (kind === 'temple' ? 'seaTemple:' : 'wreck:') + gx + ',' + gz;
    if (kind === 'temple') {
        // (turned by a quarter only: its walls and steps are the world's boxes, axis-aligned)
        return { id, kind, gx, gz, x, z, yaw: Math.floor(hash01(gx, gz, seed + 33104) * 4) * (Math.PI / 2) };
    }
    const k = hash01(gx, gz, seed + 33105);
    const cls = k < 0.72 ? 'pinnace' : 'fluyt';
    const side = hash01(gx, gz, seed + 33106) < 0.5 ? -1 : 1;
    const heel = SUNKEN.HEEL[0] + (SUNKEN.HEEL[1] - SUNKEN.HEEL[0]) * hash01(gx, gz, seed + 33107);
    return {
        id, kind, gx, gz, x, z, cls,
        yaw: hash01(gx, gz, seed + 33104) * TAU,
        roll: side * heel,
        pitch: (hash01(gx, gz, seed + 33108) - 0.5) * 0.12, // (bow or stern a little down in the sand)
        holes: 1 + Math.floor(hash01(gx, gz, seed + 33109) * 3), // (stove in by the rocks / the shot that sank her)
    };
}

/** Calls fn(site) for every site tried within r m of (x, z). */
export function sunkenSitesNear(x, z, r, seed, fn) {
    const C = SUNKEN.CELL;
    for (let gx = Math.floor((x - r) / C); gx <= Math.floor((x + r) / C); gx++) {
        for (let gz = Math.floor((z - r) / C); gz <= Math.floor((z + r) / C); gz++) {
            const s = sunkenSiteAt(gx, gz, seed);
            if (s && Math.hypot(s.x - x, s.z - z) <= r) fn(s);
        }
    }
}

/** The points of a site's footprint to check (world x, z): its middle, the corners, the ends of its long sides. */
export function footprint(site) {
    let hl, hw;
    if (site.kind === 'temple') { hl = SUNKEN.TEMPLE_L / 2; hw = SUNKEN.TEMPLE_W / 2; }
    else { const C = SHIP_CLASSES[site.cls]; hl = C.L / 2 - 2; hw = C.B / 2; }
    const c = Math.cos(site.yaw), s = Math.sin(site.yaw), out = [];
    for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const lx = a * hw, lz = b * hl;
        out.push({ x: site.x + lx * c + lz * s, z: site.z - lx * s + lz * c });
    }
    return out;
}

/**
 * Does the site lie here? `seaAt(x, z)` → {depth (m of water), floor (the bottom's y)} of the SEA (never a lake) or null.
 * All the footprint under deep enough water, the bottom flat enough. → {floor: the bottom's lowest y, top: its highest} | null.
 */
export function siteFits(site, seaAt) {
    const need = site.kind === 'temple' ? SUNKEN.TEMPLE_DEPTH : SUNKEN.WRECK_DEPTH;
    let lo = Infinity, hi = -Infinity;
    for (const p of footprint(site)) {
        const w = seaAt(p.x, p.z);
        if (!w || !(w.depth >= need)) return null;
        lo = Math.min(lo, w.floor); hi = Math.max(hi, w.floor);
    }
    return hi - lo <= SUNKEN.FLAT ? { floor: lo, top: hi } : null;
}
