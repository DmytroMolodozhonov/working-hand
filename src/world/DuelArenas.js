/**
 * DuelArenas.js — the duel arenas of the wizards (the author: «как ипподром раньше был»): an oval floor
 * and six rows of stands round it, all of the enchanted stone (EnchantedStone.js — a blast is, the stone
 * stays), two gates at the ends for the duellists, lamps on the gate pillars, and by the front gate the
 * place to sign up for a duel — a stone lectern with the book of duels.
 *
 * Where: beside every wizards' tower (ArenaIndex: on its own levelled land, ~130 m from the tower, its front
 * gate facing it) and, round (ARENA_ROUND), on the place a big settlement of wizards keeps for it near its
 * middle (WizardVillages: `def.arena`; ArenaIndex.ofVillage), its front gate to the town. Any other place:
 * `arenaSite(id, X, Z, F, rot, extra, dims)` + `ArenaIndex.add(def)` — the same record, the same game
 * (src/game/ArenaDuels.js).
 *
 * Pure data, deterministic from the seed (the terrain workers build the same arena on every computer);
 * its parts are the castles' kind (boxes k 0, discs k 1 — TerrainData._buildCastles). Rot-local
 * coordinates (Castles.Plan): the long axis is v, the front gate at −v.
 * (Imports Terrain.js for BLOCK: never read BLOCK at the top level here.)
 */

import { BLOCK } from './Terrain.js';
import { CASTLE_CELL, BLEND, Plan } from './Castles.js';
import { TOWER_ZONE } from './WizardTowers.js';

export const ARENA = {
    W: 13, // half-width of the floor (and the radius of its round ends)
    S: 13, // half-length of the straight part of the floor
    TIERS: 6, // rows of stands: each one block higher and STEP deeper than the one before
    STEP: 2,
    GATE: 2, // half-width of a gate (5 blocks)
    MARK: 11, // the duellists' marks: v = ±MARK
    ZONE: 46, // half-size of the levelled land (the desk outside the front gate is in it)
    AWAY: TOWER_ZONE + 46 + 26, // from the tower's middle to the arena's
    SEAT_GAP: 2.4, // m between two seats in a row
};
/**
 * The round arena of a big settlement of wizards (WizardVillages.ARENA_SPOT: a level field of r 22 kept for
 * it at the town's middle): a round floor, four rows, the marks closer.
 */
export const ARENA_ROUND = { W: 10, S: 0, TIERS: 4, STEP: 2, MARK: 8, ZONE: 0 };
const dims = (d) => ({ ...ARENA, ...d });

/** A stadium (a rectangle with round ends) of half-width r round the long axis (half-length A.S), layers l0…l1. */
function stadium(p, r, l0, l1, t, A = ARENA) {
    if (A.S > 0) p.box(-r, r, l0, l1, -A.S, A.S, t);
    p.cyl(0, -A.S, r, l0, l1, t);
    if (A.S > 0) p.cyl(0, A.S, r, l0, l1, t);
}

/**
 * The arena's blocks into plan `p` and its places (world points): the marks, the gates, the seats, the
 * desk. The floor is flush with the levelled land (layer −1), four blocks of enchanted stone thick.
 */
export function buildArena(p, d = ARENA) {
    const B = BLOCK, A = dims(d), T = A.TIERS;
    const OUT_W = A.W + T * A.STEP, END = A.S + OUT_W; // (the stands' outer half-width and end along v)
    const stadium_ = (r, l0, l1, t) => stadium(p, r, l0, l1, t, A);
    // the foundation and the floor: one slab under all of it (it holds the stands — nothing hangs)
    stadium_(OUT_W + 1, -4, -1, B.ENCHANTED);
    // the parapet round the top row (a block higher than it: to lean on)
    stadium_(OUT_W + 1, 0, T, B.ENCHANTED);
    stadium_(OUT_W, T, T + 6, B.AIR);
    // the stands: from the outer row in — each row one block lower and STEP nearer the floor (row k: layers 0…k−1)
    for (let k = T; k >= 1; k--) {
        stadium_(A.W + k * A.STEP, 0, k - 1, B.ENCHANTED_SEAT);
        stadium_(A.W + (k - 1) * A.STEP, k - 1, T + 6, B.AIR);
    }
    // the floor's signs (of the darker enchanted stone — a blast never breaks them either): a ring in the middle, the two marks
    p.cyl(0, 0, 4, -1, -1, B.ENCHANTED_SEAT);
    p.cyl(0, 0, 3, -1, -1, B.ENCHANTED);
    for (const s of [-1, 1]) p.box(-1, 1, -1, -1, s * A.MARK, s * A.MARK, B.ENCHANTED_SEAT);
    // the gates: through the stands at both ends, pillars and a lintel of the tower's stone, lamps
    const out = { gates: [] };
    for (const s of [-1, 1]) {
        p.box(-A.GATE, A.GATE, 0, T + 3, s * (A.S + A.W - 1), s * (END + 2), B.AIR);
        for (const su of [-1, 1]) {
            p.box(su * (A.GATE + 1), su * (A.GATE + 1), 0, T + 3, s * (END - 1), s * (END + 1), B.ENCHANTED);
            p.box(su * (A.GATE + 1), su * (A.GATE + 1), T + 4, T + 4, s * (END + 1), s * (END + 1), B.ARCANE_LAMP);
        }
        p.box(-A.GATE - 1, A.GATE + 1, T + 4, T + 4, s * (END - 1), s * END, B.ENCHANTED);
        p.box(0, 0, T + 5, T + 5, s * (END - 1), s * (END - 1), B.ARCANE_LAMP_VIOLET);
        out.gates.push({ out: p.pt(0, s * (END + 4)), in: p.pt(0, s * (A.S + A.W - 3)), mark: p.pt(0, s * A.MARK) });
    }
    // the place to sign up: a lectern with the book of duels by the front gate (outside, on the right)
    p.box(6, 7, 0, 1, -(END + 3), -(END + 3), B.ENCHANTED);
    p.box(6, 7, 2, 2, -(END + 3), -(END + 3), B.BOOKS);
    p.box(9, 9, 0, 3, -(END + 3), -(END + 3), B.ENCHANTED);
    p.box(9, 9, 4, 4, -(END + 3), -(END + 3), B.ARCANE_LAMP);
    p.box(5, 10, -1, -1, -(END + 5), -(END + 2), B.RUNE);
    const book = p.pt(6.5, -(END + 3), 3); // (its top: y = L(2) top)
    // (the steward's place: beside the gate's lane, outside — he is a living man of the tower, ArenaDuels.js; no blocks)
    out.desk = { book: { x: book.x, y: book.y + 0.5, z: book.z }, front: p.pt(6.5, -(END + 5)), stand: p.pt(4.5, -(END + 4)), yaw: p.yaw(Math.PI) };
    // the seats: along the middle of every row, never in the gates
    out.seats = [];
    for (let k = 1; k <= T; k++) {
        const r = A.W + (k - 1) * A.STEP + 1; // (the middle of row k)
        const len = 4 * A.S + 2 * Math.PI * r, n = Math.floor(len / A.SEAT_GAP);
        for (let i = 0; i < n; i++) {
            const d = (i + 0.5) * len / n;
            let u, v;
            if (d < 2 * A.S) { u = r; v = -A.S + d; } else if (d < 2 * A.S + Math.PI * r) { const a = (d - 2 * A.S) / r; u = r * Math.cos(a); v = A.S + r * Math.sin(a); } else if (d < 4 * A.S + Math.PI * r) { u = -r; v = A.S - (d - 2 * A.S - Math.PI * r); } else { const a = Math.PI + (d - 4 * A.S - Math.PI * r) / r; u = r * Math.cos(a); v = -A.S + r * Math.sin(a); }
            if (Math.abs(u) <= A.GATE + 1.5 && Math.abs(v) > A.S) continue; // (a gate)
            const q = p.pt(u, v, k); // (standing on row k: its top is layer k − 1)
            const side = Math.abs(v) <= A.S || Math.abs(u) >= Math.abs(Math.abs(v) - A.S); // (along the sides: a charge flies along v, never into them)
            // facing the floor: towards the nearest point of the floor's axis
            const cv = Math.max(-A.S, Math.min(A.S, v)), c = p.pt(0, cv, k);
            out.seats.push({ x: q.x, y: q.y, z: q.z, row: k, side, yaw: Math.atan2(-(c.x - q.x), -(c.z - q.z)) });
        }
    }
    return out;
}

/** An arena's record at (X, Z) on land levelled to F (`rot`: its front gate towards −v turned by rot·90°). */
export function arenaSite(id, X, Z, F, rot, extra = {}, d = ARENA) {
    const A = dims(d), OUT_W = A.W + A.TIERS * A.STEP;
    const p = new Plan(X, Z, F, rot);
    const out = buildArena(p, A);
    const c = p.pt(0, 0, 0);
    const def = {
        id, kind: 'arena', x: X, z: Z, F, rot, zone: A.ZONE, reach: Math.max(A.ZONE, OUT_W + 8), name: 'Арена дуэлей',
        centre: c, floorY: c.y, // (the floor's top: the duellists stand here)
        // the floor (local u ±W, v ±(S+W)) for «who is on it»: its axis and radius in world terms
        axis: { a: p.pt(0, -A.S), b: p.pt(0, A.S), r: A.W }, outer: OUT_W + 1,
        gates: out.gates, desk: out.desk, seats: out.seats,
        parts: p.parts, _byChunk: new Map(),
        ...extra,
    };
    return def;
}

/** Is (x, z) on the arena's floor (`pad` m in from its edge)? */
export function onArenaFloor(def, x, z, pad = 0) {
    const { a, b, r } = def.axis;
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
    return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) <= r - pad;
}

/** Is (x, z) within the arena's stands (the floor and the rows)? */
export function inArena(def, x, z) {
    const { a, b } = def.axis;
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
    return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) <= def.outer;
}

// the direction of the arena from its tower (+x, −x, +z, −z) → the plan's rot that turns its front gate (−v) to the tower
const DIRS = [[1, 0, 3], [-1, 0, 1], [0, 1, 0], [0, -1, 2]];

/** Level, dry ground for an arena at (X, Z)? → the height its land is levelled to (F), or null. (raw: the world's height field) */
function arenaGround(raw, X, Z) {
    let wet = 0, all = 0;
    const hs = [];
    const Z0 = ARENA.ZONE;
    for (let dz = -Z0; dz <= Z0; dz += 8) for (let dx = -Z0; dx <= Z0; dx += 8) {
        const h = raw(X + dx, Z + dz);
        all++;
        if (raw.water) { wet++; continue; }
        if (h > 26) return null;
        hs.push(h);
    }
    if (wet > all * 0.12 || hs.length < 10) return null;
    hs.sort((a, b) => a - b);
    if (hs[Math.floor(hs.length * 0.9)] - hs[Math.floor(hs.length * 0.1)] > 8) return null;
    return Math.max(0, Math.round(hs[hs.length >> 1])); // (the middle of its ground: a low hill levelled, never dug deep)
}

/**
 * The arenas of the world: one beside every wizards' tower (on the side with room in the tower's cell),
 * and any a settlement adds. landAt / partsForChunk the castles' way (Sites.js).
 */
export class ArenaIndex {
    constructor(seed, raw, towers, villages = null) {
        this.seed = seed; this.raw = raw; this.towers = towers; this.villages = villages;
        this.byVillage = new Map(); // settlement id → its round arena (WizardVillages: `def.arena`, its place)
        this.byTower = new Map(); // tower id → arena def or null
        this.extra = new Map(); // id → def (put by a settlement: `add`)
        this._last = null;
    }

    /** A settlement's own arena (the same record as arenaSite makes). */
    add(def) { this.extra.set(def.id, def); }

    /** The arena of a tower (made the first time it is asked; null: no room for one). */
    ofTower(t) {
        if (!t || t.kind !== 'tower') return null;
        if (this.byTower.has(t.id)) return this.byTower.get(t.id);
        let def = null;
        const x0 = t.gx * CASTLE_CELL, z0 = t.gz * CASTLE_CELL, need = ARENA.ZONE + BLEND + 4;
        // the side with the most room in the cell first (the same order on every computer)
        const order = DIRS.map((d) => ({ d, room: d[0] > 0 ? x0 + CASTLE_CELL - t.x : d[0] < 0 ? t.x - x0 : d[1] > 0 ? z0 + CASTLE_CELL - t.z : t.z - z0 }))
            .sort((a, b) => b.room - a.room || a.d[2] - b.d[2]);
        for (const away of [ARENA.AWAY, ARENA.AWAY + 30]) {
            for (const { d } of order) {
                const X = t.x + d[0] * away, Z = t.z + d[1] * away;
                if (X - need < x0 || X + need > x0 + CASTLE_CELL || Z - need < z0 || Z + need > z0 + CASTLE_CELL) continue;
                const F = arenaGround(this.raw, X, Z);
                if (F == null) continue;
                def = arenaSite('ar' + t.id, X, Z, F, d[2], { tower: t.id, towerAt: { x: t.x, z: t.z }, train: trainingField(t, d) });
                break;
            }
            if (def) break;
        }
        this.byTower.set(t.id, def);
        return def;
    }

    /**
     * The round arena at the middle of a big settlement (on the place it keeps for it: `vd.arena`), its front
     * gate to the settlement's road; the town's wizards come to it. (The land is the settlement's own.)
     */
    ofVillage(vd) {
        if (!vd?.arena) return null;
        if (this.byVillage.has(vd.id)) return this.byVillage.get(vd.id);
        const a = vd.arena;
        const def = arenaSite('ar' + vd.id, Math.round(a.x), Math.round(a.z), vd.F, ((vd.rot | 0) + 2) % 4, { tower: vd.id, village: true }, ARENA_ROUND);
        this.byVillage.set(vd.id, def);
        return def;
    }

    /** Arenas whose land reaches within `r` of a point (a tower's / a settlement's arena never leaves its cell). */
    near(x, z, r = 0) {
        const out = [], m = ARENA.ZONE + BLEND + r;
        const g0x = Math.floor((x - m) / CASTLE_CELL), g1x = Math.floor((x + m) / CASTLE_CELL);
        const g0z = Math.floor((z - m) / CASTLE_CELL), g1z = Math.floor((z + m) / CASTLE_CELL);
        for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
            const a = this.ofTower(this.towers.cellOf(gx, gz)) || (this.villages ? this.ofVillage(this.villages.cellOf(gx, gz)) : null);
            if (a && Math.max(Math.abs(a.x - x), Math.abs(a.z - z)) <= a.reach + BLEND + r) out.push(a);
        }
        for (const a of this.extra.values()) if (Math.max(Math.abs(a.x - x), Math.abs(a.z - z)) <= a.zone + BLEND + r) out.push(a);
        return out;
    }

    landAt(ix, iz) {
        // (asked for every column of the world: the tower of this column's cell, its arena — two map lookups)
        const gx = Math.floor(ix / CASTLE_CELL), gz = Math.floor(iz / CASTLE_CELL);
        let c = this._last;
        if (!c || c.gx !== gx || c.gz !== gz) c = this._last = { gx, gz, a: this.ofTower(this.towers.cellOf(gx, gz)) }; // (a settlement's arena: the settlement levels its land)
        let a = c.a;
        if (!a || Math.max(Math.abs(ix - a.x), Math.abs(iz - a.z)) > a.zone + BLEND) {
            a = null;
            for (const b of this.extra.values()) if (Math.max(Math.abs(ix - b.x), Math.abs(iz - b.z)) <= b.zone + BLEND) { a = b; break; }
            if (!a) return null;
        }
        const d = Math.max(Math.abs(ix - a.x), Math.abs(iz - a.z));
        const w = d <= a.zone ? 1 : 1 - (d - a.zone) / BLEND;
        return { castle: a, w: w * w * (3 - 2 * w) };
    }

    partsForChunk(cx, cz, CHUNK) {
        const x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = x0 + CHUNK - 1, z1 = z0 + CHUNK - 1;
        const out = [];
        for (const a of this.near(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK)) {
            const key = cx * 65536 + cz;
            let list = a._byChunk.get(key);
            if (!list) {
                list = a.parts.filter((q) => q.x1 >= x0 && q.x0 <= x1 && q.z1 >= z0 && q.z0 <= z1);
                a._byChunk.set(key, list);
            }
            if (list.length) out.push(list);
        }
        return out;
    }
}

/**
 * The empty field beside a tower where its wizards sometimes train (the author: «на пустом поле в стороне
 * от башни, без инфраструктуры»): across from the arena, on the tower's levelled land's edge (no trees there).
 */
function trainingField(t, d) {
    const k = TOWER_ZONE + 18;
    return { x: t.x - d[1] * k, z: t.z + d[0] * k, F: t.F };
}
