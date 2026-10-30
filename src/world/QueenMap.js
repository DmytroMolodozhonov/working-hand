/**
 * QueenMap.js — the Ice Queen's OWN MAP (worlds of generation QUEEN_MAP_FROM_GEN, the Creative test ground).
 *
 * The author: «Ледяную Королеву перенести на ДРУГУЮ карту, где будет только она — никакого дракона, паучихи и прочего, мешающего; только Королева и её
 * помощники (снеговики, ледяные великаны)… мир вокруг пустой, только небо, снег/лёд, горы-декорации за пределами арены».
 *
 * It is a far region of the very same voxel world (like the planets' surfaces — Planets.js, PlanetSurface.js), not a second world: walking, collisions,
 * blasts, building, the save and the network work there as at home. It lies in the far zone (x ≥ SPACE.ZONE_X − 64), where `offEarth` is true — so no
 * castle, tower, village, dungeon, cave, lair, island or ghost castle is ever made there, and the Earth's creatures (zombies, herds, book-birds, dragons,
 * the spider, travellers…) appear only round players for whom `earthly(p)` is true (it is not, there) — and in the gap between the planets' slots (Planets.js:
 * slots start at x = 253616), so no planet is there either. Its ground is a plain of snow with drifts, the Queen's palace on its arena mountain in the
 * middle (IceCastle.js, the same palace, the same arena), and a ring of decorative mountains rising to a wall at the rim of the map.
 *
 * Who is there: the hero (spawn «У Ледяной Королевы»), the Queen, her snowmen and ice giants, the friends who come. Nobody else.
 * The main map (the start ground) has neither the Queen nor the dragon: the world's Ice Castle IS this one in a world with a test ground of this generation.
 */

import { createNoise2D } from '../core/math.js';
import { ICE_CASTLE, IceCastleSite, iceCastlePlan } from './IceCastle.js';

export const QUEEN_MAP = {
    CX: 246528, CZ: 0, // m: the palace's middle (the far zone, in the gap before the first planet's slot; a whole number of chunks from the rim)
    HALF: 1408, // m: the map is a square this far each way from the middle (44 chunks); beyond it — nothing (a wall of mountains stands before it)
    GROUND: 22, // layers: the snowy plain
    RING0: 560, RING1: 1060, WALL0: 1020, WALL1: 1330, // m from the middle: where the foothills begin, where they are full, where the wall rises and is full
    PEAK: 84, // layers the foothills / crests rise over the plain
};

/** Is the column (x, z) on the Queen's map (`margin`: this many metres past its rim count too — the neighbours a chunk's ramps look at)? */
export const inQueenMap = (x, z, margin = 0) => x >= QUEEN_MAP.CX - QUEEN_MAP.HALF - margin && x < QUEEN_MAP.CX + QUEEN_MAP.HALF + margin && z >= QUEEN_MAP.CZ - QUEEN_MAP.HALF - margin && z < QUEEN_MAP.CZ + QUEEN_MAP.HALF + margin;
/** Is the chunk (cx, cz) (C m wide) on the Queen's map? The rim is on the chunks' edges: a chunk is wholly in or wholly out. */
export const queenChunk = (cx, cz, C = 32) => inQueenMap(cx * C, cz * C);

const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/**
 * The plain and the mountains round it (no palace): top layer at a column. `n` — a 2-D noise −1…1.
 * Flat snow with drifts near the middle, foothills from RING0, crests (ridged) over them, a full wall from WALL0 (the map's rim is never seen from the plain).
 */
export function queenBase(x, z, n) {
    const M = QUEEN_MAP, dx = x - M.CX, dz = z - M.CZ, d = Math.hypot(dx, dz);
    let h = M.GROUND + 1.6 * n(x / 60, z / 60) + 0.8 * n(x / 17 + 9, z / 17 - 4); // (drifts)
    const foot = smooth((d - M.RING0) / (M.RING1 - M.RING0));
    if (foot > 0) {
        const ridge = 1 - Math.abs(n(x / 150 + 31, z / 150 - 17)); // (1 along a crest)
        const rock = 0.5 + 0.5 * n(x / 70 - 5, z / 70 + 12);
        h += foot * (M.PEAK * (0.35 + 0.65 * ridge * ridge) + 10 * rock);
    }
    h += smooth((d - M.WALL0) / (M.WALL1 - M.WALL0)) * 40; // (the wall: the rim of the map is a range, not an edge)
    return Math.max(2, Math.min(116, Math.round(h)));
}

/** The one palace of a world with this map (the same plan as the arena palace elsewhere, set on the map's middle). */
export class IceCastleMapSite extends IceCastleSite {
    constructor(seed) {
        super(seed, () => 0, () => false, null, true);
        this.queen = true;
        this.mapNoise = createNoise2D((seed ^ 0x51a9e0) >>> 0);
    }

    get plan() {
        if (this._plan === undefined) this._plan = iceCastlePlan({ x: QUEEN_MAP.CX, z: QUEEN_MAP.CZ, F: ICE_CASTLE.PEAK_MIN, rot: 0, test: false, arena: true, map: true });
        return this._plan;
    }

    /** The top layer of the map's column (the plain, the foothills, the palace's mountain and its levelled terrace). */
    heightOf(ix, iz) {
        let h = queenBase(ix, iz, this.mapNoise);
        const m = this.shapeAt(ix, iz, h);
        if (this.lifted) h = m;
        if (this.landAt(ix, iz)) h = this.plan.F;
        return h;
    }
}
