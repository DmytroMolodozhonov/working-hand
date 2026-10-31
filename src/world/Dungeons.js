/**
 * Dungeons.js — where the dungeons of the wild are (the author: «Игрок гуляет по миру и может найти ДАНЖ»): ruins on the ground
 * and halls under it. Kinds and numbers: DungeonRules.js; the blocks: DungeonBuild.js.
 *
 *  - A cell of DUNGEON.CELL m holds at most one (DUNGEON.CHANCE), on dry, level-enough ground, never on another site's land,
 *    never in the sea or a lake, never near the spawn, and ALWAYS inside its own cell (so two dungeons never grow into each other).
 *  - A ruin levels its ground (like a castle: the land of `zone`, then a short slope); an underground dungeon levels only a yard
 *    before its entrance (a stair leads down from there) — the rest of the land above it is as it was.
 *  - Deciding a cell is cheap (a few height samples); the blocks (`parts`) and the chests are built the first time somebody
 *    asks for them (a terrain worker asking for its chunk; the game asking for the chests): `def.ready`.
 *
 * The record has the shape of the arenas' (DuelArenas.js): landAt / near / partsForChunk the castles' way (Sites.js).
 * Pure and deterministic (Node-testable, no THREE): the same seed gives the same dungeons on every computer and in the workers.
 * (Imports Terrain.js through DungeonBuild.js for BLOCK: never read BLOCK at the top level here.)
 */

import { createRng } from '../core/math.js';
import { offEarth } from './Planets.js';
import { DUNGEON, KINDS, pickKind, chestCount } from './DungeonRules.js';
import { buildDungeon } from './DungeonBuild.js';

const key = (gx, gz) => gx * 65536 + gz;

/** World x/z of a local point of a frame at (X, Z) turned by rot·90° (as Castles.Plan.wx/wz). */
const wx = (X, rot, u, v) => X + (rot === 0 ? u : rot === 1 ? -v : rot === 2 ? -u : v);
const wz = (Z, rot, u, v) => Z + (rot === 0 ? v : rot === 1 ? u : rot === 2 ? -v : -u);

/** One dungeon: the cheap record at once, the blocks and the chests on demand. */
export class DungeonSite {
    constructor(f) {
        this.f = f; // (the plain record: what the terrain workers send to the main thread — DungeonIndex.adopt)
        Object.assign(this, f);
        this.kind = 'dungeon';
        this._byChunk = new Map();
        this._built = null;
    }

    /** Build now (once): `parts`, `chests`, `entrance`, `rooms`. */
    ready() {
        if (!this._built) {
            this._built = buildDungeon(this);
            this._partsList = this._built.parts;
        }
        return this._built;
    }

    get isBuilt() { return !!this._built; }
    get parts() { return this.ready().parts; }
    get chests() { return this.ready().chests; }
    get entrance() { return this.ready().entrance; }
}

export class DungeonIndex {
    /**
     * @param {number} seed
     * @param {Function} raw  the world's height field (without the sites' levelled land); `raw.water`/`raw.sea` after a call
     * @param {(x:number, z:number, r:number) => boolean} busy  another site's land lies within `r` of a point
     */
    constructor(seed, raw, busy) {
        this.seed = seed; this.raw = raw; this.busy = busy;
        this.cells = new Map(); // cell key → site or null
        this._last = null;
    }

    cellOf(gx, gz) {
        const k = key(gx, gz);
        let s = this.cells.get(k);
        if (s === undefined) { s = this._decide(gx, gz); this.cells.set(k, s); }
        return s;
    }

    /**
     * Cells the terrain workers decided (sent with a castle cell's sites: terrain.worker.js 'site'): [{gx, gz, f}] — `f` the record or null.
     * The main thread then never has to decide them itself (that asks the neighbouring sites, which is a long job).
     */
    adopt(list) {
        for (const e of list || []) { const k = key(e.gx, e.gz); if (!this.cells.has(k)) this.cells.set(k, e.f ? new DungeonSite(e.f) : null); }
    }

    /** Are the four cells of a castle cell (480 m) known already? */
    has4(gx, gz) {
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (!this.cells.has(key(gx * 2 + i, gz * 2 + j))) return false;
        return true;
    }

    /** The four cells of a castle cell, as plain records for the main thread. */
    export4(gx, gz) {
        const out = [];
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const s = this.cellOf(gx * 2 + i, gz * 2 + j); out.push({ gx: gx * 2 + i, gz: gz * 2 + j, f: s ? s.f : null }); }
        return out;
    }

    /** A dry, level-enough ground for a ruin of half-size `zone` at (X, Z): its floor layer, or null. */
    _ground(X, Z, zone, spread) {
        const raw = this.raw, hs = [];
        const m = zone + DUNGEON.BLEND + 2, step = zone > 20 ? 9 : 5;
        for (let dz = -m; dz <= m; dz += step) for (let dx = -m; dx <= m; dx += step) {
            const h = raw(X + dx, Z + dz);
            if (raw.water || raw.sea) { this._why = 'water'; return null; }
            if (h > 52 || h < 1) { this._why = 'height'; return null; }
            hs.push(h);
        }
        hs.sort((a, b) => a - b);
        if (hs[Math.floor(hs.length * 0.92)] - hs[Math.floor(hs.length * 0.08)] > spread + 2) { this._why = 'steep'; return null; }
        return Math.max(1, Math.round(hs[hs.length >> 1]));
    }

    /** Optional bench counter (`index.stats = {}`): why the spots of the ground ruins fail. Off in the game. */
    _count(why) { if (this.stats) this.stats[why] = (this.stats[why] || 0) + 1; }

    _decide(gx, gz) {
        const C = DUNGEON.CELL;
        if (offEarth((gx + 1) * C)) return null;
        const rng = createRng((Math.imul(this.seed, 2654435761) ^ Math.imul(gx, 40503) ^ Math.imul(gz, 92821) ^ 0x6d19e) >>> 0);
        rng(); // (the first draw of a fresh generator is the least mixed)
        const chance = rng(), under = rng() < DUNGEON.UNDER_SHARE;
        if (chance > DUNGEON.CHANCE * (under ? 1 : DUNGEON.GROUND_BOOST)) return null; // (same draws in the same order: the old dungeons stay where they were, the ruins only get more)
        const kindId = pickKind(under, rng(), rng());
        const K = KINDS[kindId];
        const seed = Math.floor(rng() * 1e9);
        const want = chestCount(kindId, rng());
        const x0 = gx * C, z0 = gz * C;
        const tries = DUNGEON.TRIES * (K.size === 'L' ? 3 : K.size === 'M' ? 2 : 1); // (the great ones need more room: they look longer for it)
        for (let t = 0; t < tries; t++) {
            if (!under) {
                const m = K.zone + DUNGEON.BLEND + DUNGEON.MARGIN, span = C - 2 * m;
                const X = Math.round(x0 + m + rng() * span), Z = Math.round(z0 + m + rng() * span), rot = Math.floor(rng() * 4);
                if (Math.hypot(X, Z) < DUNGEON.MIN_SPAWN + K.zone) { this._count('spawn'); continue; }
                if (this.busy(X, Z, K.zone + DUNGEON.BLEND + 4)) { this._count('busy'); continue; }
                const F = this._ground(X, Z, K.zone, K.spread);
                if (F == null) { this._count(this._why); continue; }
                const R = K.zone + DUNGEON.BLEND;
                return new DungeonSite({
                    id: 'dg' + gx + '_' + gz, gx, gz, type: kindId, under: false, magic: K.magic, size: K.size, name: K.name, seed, want,
                    x: X, z: Z, F, rot, cx: X, cz: Z, zone: K.zone, land: F,
                    x0: X - R, x1: X + R, z0: Z - R, z1: Z + R,
                });
            }
            // under the ground: the entrance E, the whole inside the cell (the footprint: u ±W, v from −24 (the yard) to LEN)
            const rot = Math.floor(rng() * 4), W = K.W + 3, L = K.LEN + 3;
            const X = Math.round(x0 + DUNGEON.MARGIN + rng() * (C - 2 * DUNGEON.MARGIN)), Z = Math.round(z0 + DUNGEON.MARGIN + rng() * (C - 2 * DUNGEON.MARGIN));
            const cs = [[-W, -24], [W, -24], [-W, L], [W, L]].map(([u, v]) => [wx(X, rot, u, v), wz(Z, rot, u, v)]);
            const bx0 = Math.min(...cs.map((c) => c[0])), bx1 = Math.max(...cs.map((c) => c[0]));
            const bz0 = Math.min(...cs.map((c) => c[1])), bz1 = Math.max(...cs.map((c) => c[1]));
            if (bx0 < x0 + DUNGEON.MARGIN || bx1 > x0 + C - DUNGEON.MARGIN || bz0 < z0 + DUNGEON.MARGIN || bz1 > z0 + C - DUNGEON.MARGIN) continue;
            const midU = 0, midV = L / 2, mx = wx(X, rot, midU, midV), mz = wz(Z, rot, midU, midV);
            if (Math.hypot(mx, mz) < DUNGEON.MIN_SPAWN + L / 2) continue;
            if (this.busy(mx, mz, Math.hypot(W, L / 2) + 10)) continue;
            // the yard before the entrance: dry, level
            const F = this._ground(X, Z, DUNGEON.PAD, 3);
            if (F == null || F - K.depth < -8) continue; // (the floor stays well above the bedrock)
            // the rooms: dry, with rock over them (the ground there not lower than the roof's top)
            const need = F - K.depth + 8, run = 2 * K.depth + 2;
            let ok = true;
            for (let v = run; v <= L && ok; v += 6) for (let u = -W; u <= W; u += 6) {
                const h = this.raw(wx(X, rot, u, v), wz(Z, rot, u, v));
                if (this.raw.water || this.raw.sea || h < need) { ok = false; break; }
            }
            if (!ok) continue;
            return new DungeonSite({
                id: 'dg' + gx + '_' + gz, gx, gz, type: kindId, under: true, magic: false, size: K.size, name: K.name, seed, want,
                x: X, z: Z, F: F - K.depth, land: F, rot, cx: X, cz: Z, zone: DUNGEON.PAD, // (F: the floor of the rooms; land: the yard's ground)
                x0: bx0, x1: bx1, z0: bz0, z1: bz1,
            });
        }
        return null;
    }

    /** Dungeons whose land or walls reach within `r` of a point. */
    near(x, z, r = 0) {
        const out = [];
        if (offEarth(x - r)) return out;
        const C = DUNGEON.CELL;
        const g0x = Math.floor((x - r) / C), g1x = Math.floor((x + r) / C);
        const g0z = Math.floor((z - r) / C), g1z = Math.floor((z + r) / C);
        for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
            const s = this.cellOf(gx, gz);
            if (s && x + r >= s.x0 && x - r <= s.x1 && z + r >= s.z0 && z - r <= s.z1) out.push(s);
        }
        return out;
    }

    /**
     * The nearest ruin ON THE GROUND among the cells already known (never decides a cell: cheap, safe in the frame) — for the journal.
     * @returns {{site: DungeonSite, d: number, dx: number, dz: number}|null}
     */
    nearestRuin(x, z) {
        let best = null;
        for (const s of this.cells.values()) {
            if (!s || s.under) continue;
            const d = Math.hypot(s.x - x, s.z - z);
            if (!best || d < best.d) best = { site: s, d, dx: s.x - x, dz: s.z - z };
        }
        return best;
    }

    /** The dungeon of an id «dg<gx>_<gz>» (or null). */
    byId(id) {
        const m = /^dg(-?\d+)_(-?\d+)$/.exec(id);
        return m ? this.cellOf(+m[1], +m[2]) : null;
    }

    landAt(ix, iz) {
        const C = DUNGEON.CELL, gx = Math.floor(ix / C), gz = Math.floor(iz / C);
        let c = this._last;
        if (!c || c.gx !== gx || c.gz !== gz) c = this._last = { gx, gz, s: this.cellOf(gx, gz) };
        const s = c.s;
        if (!s) return null;
        const d = Math.max(Math.abs(ix - s.cx), Math.abs(iz - s.cz));
        const B = DUNGEON.BLEND;
        if (d > s.zone + B) return null;
        const w = d <= s.zone ? 1 : 1 - (d - s.zone) / B;
        return { castle: { id: s.id, kind: 'dungeon', F: s.land, dungeon: true }, w: w * w * (3 - 2 * w) };
    }

    partsForChunk(cx, cz, CHUNK) {
        const x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = x0 + CHUNK - 1, z1 = z0 + CHUNK - 1;
        const out = [];
        const C = DUNGEON.CELL, gx = Math.floor((x0 + CHUNK / 2) / C), gz = Math.floor((z0 + CHUNK / 2) / C);
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
