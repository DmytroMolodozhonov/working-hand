/**
 * GhostCastle.js — where the Castle of Ghosts is (the author: «замок настоящих призраков… его нельзя найти, пока у игрока нет зрения невидимого — он даже не
 * генерируется в мире»). Numbers and the rules of the whole thing: game/GhostRules.js; the blocks of the castle: GhostBuild.js.
 *
 *  - A cell of GHOST_CASTLE.CELL m holds at most one (CHANCE: rare), on dry ground that is level enough, never on another site's land, never in the sea, a lake
 *    or a river, never near the world's start, and ALWAYS whole inside its own cell. The castle never changes the LAND (no `landAt`, no levelling): it stands on
 *    a black terrace of its own that is built UP from the ground (GHOST_CASTLE.PLINTH above the highest ground), and everything inside it — the basement, the
 *    crypt — lies above the ground, so nothing is cut out of the land and taking the castle away again leaves the land as it was.
 *  - `on` (a flag of the whole index): is the castle in the land of THIS computer? It is only while the hero sees the invisible (GhostCastleLife.js →
 *    TerrainData.setGhostSeen). While it is off `partsForChunk` gives nothing: no blocks, no collisions, nothing drawn — «пустое место». Every computer has its own
 *    flag: a friend who sees the invisible has the castle, one who does not, has not.
 *  - Deciding a cell takes a few hundred height samples and the neighbouring sites (a long job): with the workers on, the main thread NEVER decides a cell
 *    (`passive`): the workers decide and send the records (`adopt`; terrain.worker.js 'ghost'). The blocks (`parts`) and the chests are built the first time somebody
 *    asks for them (`ready()`), only when the castle is on.
 *
 * Pure and deterministic (Node-testable, no THREE): the same seed gives the same castles on every computer and in the workers.
 * (Imports Terrain.js through GhostBuild.js for BLOCK: never read BLOCK at the top level here.)
 */

import { createRng } from '../core/math.js';
import { offEarth } from './Planets.js';
import { GHOST_CASTLE as GC } from '../game/GhostRules.js';
import { buildGhostCastle } from './GhostBuild.js';

const key = (gx, gz) => gx * 65536 + gz;

/** One castle: the cheap record at once, the blocks and the chests on demand. */
export class GhostSite {
    constructor(f) {
        this.f = f; // (the plain record: what the terrain workers send to the main thread — GhostCastleIndex.adopt)
        Object.assign(this, f);
        this.kind = 'ghostcastle';
        this._byChunk = new Map();
        this._built = null;
        this.shown = false; // are the castle's blocks in the loaded chunks of THIS computer right now? (TerrainView.ghostSync)
    }

    /** Build now (once): `parts`, `chests`, `props`, `rooms`, `spots`, `entrance`. */
    ready() {
        if (!this._built) this._built = buildGhostCastle(this);
        return this._built;
    }

    get isBuilt() { return !!this._built || !!this.lite; }
    get parts() { return this.ready().parts; }
    // (the light part — what the game reads: the chests, the props, the rooms, the spots, the gate — comes from a worker with the record, `lite`: building the whole castle
    //  on the main thread, 100–250 ms, is for the rare cases that need the blocks themselves)
    get chests() { return (this.lite || this.ready()).chests; }
    get props() { return (this.lite || this.ready()).props; }
    get rooms() { return (this.lite || this.ready()).rooms; }
    get spots() { return (this.lite || this.ready()).spots; }
    get entrance() { return (this.lite || this.ready()).entrance; }
    get hasLite() { return !!this.lite || !!this._built; }

    /** Does the footprint (the walls, the terrace and the stair) cover the point? */
    covers(x, z, m = 0) { return x >= this.x0 - m && x <= this.x1 + m && z >= this.z0 - m && z <= this.z1 + m; }

    /** The keys of the chunks (CHUNK m) the castle touches, a margin of `m` chunks round it too (the faces on the borders). */
    chunkKeys(CHUNK, m = 1) {
        const out = [];
        for (let cz = Math.floor(this.z0 / CHUNK) - m; cz <= Math.floor(this.z1 / CHUNK) + m; cz++) for (let cx = Math.floor(this.x0 / CHUNK) - m; cx <= Math.floor(this.x1 / CHUNK) + m; cx++) out.push({ cx, cz });
        return out;
    }
}

export class GhostCastleIndex {
    /**
     * @param {number} seed
     * @param {Function} raw  the world's height field (without the sites' levelled land); `raw.water`/`raw.sea` after a call
     * @param {(x:number, z:number, r:number) => boolean} busy  another site's land lies within `r` of a point
     */
    constructor(seed, raw, busy) {
        this.seed = seed; this.raw = raw; this.busy = busy;
        this.cells = new Map(); // cell key → site or null
        this.on = false; // is the castle in this computer's land? (a seer's)
        this.passive = false; // the main thread with workers: never decides a cell itself (adopt only)
    }

    /** The site of a cell: made when asked (unless passive: then only what was adopted; undecided reads as none). */
    cellOf(gx, gz) {
        const k = key(gx, gz);
        let s = this.cells.get(k);
        if (s === undefined) {
            if (this.passive) return null;
            s = this._decide(gx, gz);
            this.cells.set(k, s);
        }
        return s;
    }

    has(gx, gz) { return this.cells.has(key(gx, gz)); }

    /** Cells the workers decided: [{gx, gz, f}] — `f` the record or null. */
    adopt(list) {
        const out = [];
        for (const e of list || []) {
            const k = key(e.gx, e.gz);
            if (this.cells.has(k)) {
                const have = this.cells.get(k);
                if (have && e.f?.lite && !have.lite) have.lite = e.f.lite; // (the light part came later: the hero got the sight after the cells were known)
                continue;
            }
            const s = e.f ? new GhostSite(e.f) : null;
            this.cells.set(k, s);
            if (s) out.push(s);
        }
        return out;
    }

    /** The records of the 3×3 cells round a point, for the main thread (what a worker answers to 'ghost'). */
    export9(x, z, lite = false) {
        const C = GC.CELL, gx0 = Math.floor(x / C), gz0 = Math.floor(z / C), out = [];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const s = this.cellOf(gx0 + dx, gz0 + dz);
            let f = s ? s.f : null;
            if (s && lite) { const b = s.ready(); f = { ...s.f, lite: { chests: b.chests, props: b.props, rooms: b.rooms, spots: b.spots, entrance: b.entrance } }; } // (what a hero who sees it needs: no blocks)
            out.push({ gx: gx0 + dx, gz: gz0 + dz, f });
        }
        return out;
    }

    /** Are the 3×3 cells round a point known (and, with `lite`, the light parts of their castles too)? */
    has9(x, z, lite = false) {
        const C = GC.CELL, gx0 = Math.floor(x / C), gz0 = Math.floor(z / C);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const k = key(gx0 + dx, gz0 + dz);
            if (!this.cells.has(k)) return false;
            if (lite) { const s = this.cells.get(k); if (s && !s.hasLite) return false; }
        }
        return true;
    }

    /**
     * A ground for the whole castle at (X, Z): { lo, hi } (the lowest and the highest ground layer under the terrace), or null. Never the open sea, never a deep
     * lake, never ground that differs by more than GHOST_CASTLE.SPREAD; a shallow lake or a river only wets the terrace's feet (the black terrace is built
     * over the water, a castle on a lake's island).
     */
    _ground(X, Z) {
        const raw = this.raw, H = GC.TERRACE + 6, step = 6;
        let lo = Infinity, hi = -Infinity;
        for (let dz = -H; dz <= H; dz += step) for (let dx = -H; dx <= H; dx += step) {
            const h = raw(X + dx, Z + dz);
            if (raw.sea || (raw.water > 4)) return null;
            if (h > GC.MAX_GROUND + GC.SPREAD || h < GC.MIN_GROUND) return null;
            if (h < lo) lo = h;
            if (h > hi) hi = h;
        }
        if (hi - lo > GC.SPREAD || hi > GC.MAX_GROUND) return null;
        return { lo, hi };
    }

    _decide(gx, gz) {
        const C = GC.CELL;
        if (offEarth((gx + 1) * C)) return null;
        const rng = createRng((Math.imul(this.seed, 2246822519) ^ Math.imul(gx, 374761393) ^ Math.imul(gz, 668265263) ^ 0x6c0571) >>> 0);
        rng(); // (the first draw of a fresh generator is the least mixed)
        if (rng() > GC.CHANCE) return null;
        const seed = Math.floor(rng() * 1e9);
        const x0 = gx * C, z0 = gz * C, m = GC.HALF + GC.MARGIN, span = C - 2 * m;
        for (let t = 0; t < GC.TRIES; t++) {
            const X = Math.round(x0 + m + rng() * span), Z = Math.round(z0 + m + rng() * span), rot = Math.floor(rng() * 4);
            if (Math.hypot(X, Z) < GC.MIN_SPAWN + GC.HALF) continue;
            if (this.busy(X, Z, GC.TERRACE + 24)) continue;
            const g = this._ground(X, Z);
            if (!g) continue;
            const F = g.hi + GC.PLINTH; // (the terrace's top layer: the courtyard's floor)
            return new GhostSite({
                id: 'gc' + gx + '_' + gz, gx, gz, seed, name: 'Замок призраков',
                x: X, z: Z, rot, F, lo: g.lo, hi: g.hi, cx: X, cz: Z, zone: GC.HALF,
                x0: X - GC.HALF, x1: X + GC.HALF, z0: Z - GC.HALF, z1: Z + GC.HALF,
                top: F + 1 + 80, // (the highest layer a spire may reach)
            });
        }
        return null;
    }

    /** The known sites whose footprint reaches within `r` of a point (the decided cells only when passive). */
    near(x, z, r = 0) {
        const out = [];
        if (offEarth(x - r)) return out;
        const C = GC.CELL;
        for (let gz = Math.floor((z - r) / C); gz <= Math.floor((z + r) / C); gz++) for (let gx = Math.floor((x - r) / C); gx <= Math.floor((x + r) / C); gx++) {
            const s = this.cellOf(gx, gz);
            if (s && s.covers(x, z, r)) out.push(s);
        }
        return out;
    }

    /** Every site decided so far. */
    list() { const out = []; for (const s of this.cells.values()) if (s) out.push(s); return out; }

    /** The castle of an id «gc<gx>_<gz>» (or null). */
    byId(id) {
        const m = /^gc(-?\d+)_(-?\d+)$/.exec(id);
        return m ? this.cellOf(+m[1], +m[2]) : null;
    }

    /** The castle whose footprint holds the point, when it is in the land (`on`); null otherwise. */
    insideAt(x, z, m = 0) {
        if (!this.on) return null;
        const C = GC.CELL, s = this.cellOf(Math.floor(x / C), Math.floor(z / C));
        return s && s.covers(x, z, m) ? s : null;
    }

    /** The parts of ONE castle that fall into a chunk, whether the castle is in the land or not (what TerrainData._ghostPatch needs to put it right). */
    partsForChunkOf(s, cx, cz, CHUNK) {
        const x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = x0 + CHUNK - 1, z1 = z0 + CHUNK - 1;
        if (s.x1 < x0 || s.x0 > x1 || s.z1 < z0 || s.z0 > z1) return [];
        const k = cx * 65536 + cz;
        let list = s._byChunk.get(k);
        if (!list) { list = s.parts.filter((q) => q.x1 >= x0 && q.x0 <= x1 && q.z1 >= z0 && q.z0 <= z1); s._byChunk.set(k, list); }
        return list;
    }

    /** The castle blocks that fall into a chunk (the `parts` lists of Sites.partsForChunk); nothing while the castle is not in the land. */
    partsForChunk(cx, cz, CHUNK) {
        if (!this.on) return [];
        const x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = x0 + CHUNK - 1, z1 = z0 + CHUNK - 1;
        const out = [];
        const C = GC.CELL, gx = Math.floor((x0 + CHUNK / 2) / C), gz = Math.floor((z0 + CHUNK / 2) / C);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const s = this.cellOf(gx + dx, gz + dz);
            if (!s || s.x1 < x0 || s.x0 > x1 || s.z1 < z0 || s.z0 > z1) continue;
            const k = cx * 65536 + cz;
            let list = s._byChunk.get(k);
            if (!list) {
                list = s.parts.filter((q) => q.x1 >= x0 && q.x0 <= x1 && q.z1 >= z0 && q.z0 <= z1);
                s._byChunk.set(k, list);
            }
            if (list.length) out.push(list);
        }
        return out;
    }
}
