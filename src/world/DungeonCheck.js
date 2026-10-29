/**
 * DungeonCheck.js — checks a built dungeon against the REAL blocks of a world (the benches and the tests): every chest has room (nothing
 * solid in its box, a floor under it), can be walked to from the way in (a flood fill over standing places: a floor to stand on, four blocks of
 * air over it, steps up of one block, drops of up to three), and nothing of the dungeon leaves its cell. Pure (a TerrainData in, numbers out).
 */

import { isSolid } from './Terrain.js';
import { DUNGEON, KINDS } from './DungeonRules.js';

const HEAD = 4; // blocks of air a standing hero needs (3.5 m)
const CHEST = { W: 1.875, D: 1.275 }; // half the chest's width / depth (Chest.js: scale 3)

/** Make the land of a dungeon (its chunks) so that `data.get` answers. */
export function makeLand(data, def, CHUNK = 16) {
    const g = (v) => Math.floor(v / CHUNK);
    for (let cz = g(def.z0 - 2); cz <= g(def.z1 + 2); cz++) for (let cx = g(def.x0 - 2); cx <= g(def.x1 + 2); cx++) data.chunk(cx, cz);
}

const solidAt = (data, x, L, z) => isSolid(data.get(Math.round(x), L, Math.round(z)));

/** Is (x, S, z) a place to stand: a floor at layer S, HEAD blocks of air over it? */
export function standable(data, x, S, z) {
    if (!solidAt(data, x, S, z)) return false;
    for (let L = S + 1; L <= S + HEAD; L++) if (solidAt(data, x, L, z)) return false;
    return true;
}

/** Flood fill from the way in: Map key → floor layer for every standing place reached (within `box`). */
export function reach(data, from, box, limit = 400000) {
    const seen = new Map(), key = (x, z, S) => ((x + 32768) * 65536 + (z + 32768)) * 256 + (S + 64);
    const q = [];
    const S0 = from.S;
    q.push([Math.round(from.x), Math.round(from.z), S0]);
    seen.set(key(q[0][0], q[0][1], S0), 1);
    for (let i = 0; i < q.length && q.length < limit; i++) {
        const [x, z, S] = q[i];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < box.x0 || nx > box.x1 || nz < box.z0 || nz > box.z1) continue;
            for (const dS of [1, 0, -1, -2, -3]) {
                const nS = S + dS;
                if (!standable(data, nx, nS, nz)) continue;
                if (dS === 1 && solidAt(data, x, S + HEAD + 1, z)) continue; // (a low ceiling over the step up)
                const k = key(nx, nz, nS);
                if (seen.has(k)) break;
                seen.set(k, 1);
                q.push([nx, nz, nS]);
                break;
            }
        }
    }
    return { cells: q, seen, key };
}

/** The rectangle of a chest (centre x, z, facing a) as sample points. */
function chestPoints(c) {
    const out = [], s = Math.sin(c.a), co = Math.cos(c.a);
    for (let w = -CHEST.W; w <= CHEST.W + 1e-6; w += 0.5) for (let d = -CHEST.D; d <= CHEST.D + 1e-6; d += 0.5) {
        // the chest's front is +Z locally = (sin a, cos a); across is (cos a, −sin a)
        out.push([c.x + w * co + d * s, c.z - w * s + d * co]);
    }
    return out;
}

/**
 * Check one dungeon. Returns {problems: [..], chests: n, reached: n, cells: n, stats}. `problems` is empty when all is well.
 * The land is made on the way (`makeLand`).
 */
export function checkDungeon(data, def) {
    makeLand(data, def);
    const problems = [], b = def.ready();
    const C = DUNGEON.CELL, cx0 = def.gx * C, cz0 = def.gz * C;
    // inside its own cell
    for (const q of b.parts) {
        if (q.x0 < cx0 || q.x1 > cx0 + C - 1 || q.z0 < cz0 || q.z1 > cz0 + C - 1) { problems.push(`part leaves its cell: x ${q.x0}…${q.x1} z ${q.z0}…${q.z1}`); break; }
    }
    // inside its footprint (what Dungeons.js checked the land for): under the ground u ±(W+3), v from −24 to LEN+3; on the ground ±(zone + blend)
    {
        const K = KINDS[def.type], toLocal = (x, z) => { const dx = x - def.x, dz = z - def.z; const r = def.rot; return r === 0 ? [dx, dz] : r === 1 ? [dz, -dx] : r === 2 ? [-dx, -dz] : [-dz, dx]; };
        let umax = 0, vmin = 1e9, vmax = -1e9;
        for (const q of b.parts) for (const [x, z] of [[q.x0, q.z0], [q.x1, q.z1], [q.x0, q.z1], [q.x1, q.z0]]) { const [u, v] = toLocal(x, z); umax = Math.max(umax, Math.abs(u)); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
        if (K.under) { if (umax > K.W + 3 || vmax > K.LEN + 3 || vmin < -24) problems.push(`leaves its footprint: u ±${umax}, v ${vmin}…${vmax} (W ${K.W}, LEN ${K.LEN})`); }
        else if (umax > K.zone + DUNGEON.BLEND || vmax > K.zone + DUNGEON.BLEND || vmin < -(K.zone + DUNGEON.BLEND)) problems.push(`leaves its land: u ±${umax}, v ${vmin}…${vmax} (zone ${K.zone})`);
    }
    // the way in
    const e = b.entrance, S0 = Math.round(e.y + 0.5);
    // (the way in is looked for round the nominal point: a prop may stand on it)
    let start = null;
    for (let r = 0; r <= 6 && !start; r++) for (let dx = -r; dx <= r && !start; dx++) for (let dz = -r; dz <= r && !start; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const dS of [0, 1, -1]) if (standable(data, Math.round(e.x) + dx, S0 + dS, Math.round(e.z) + dz)) { start = { x: Math.round(e.x) + dx, z: Math.round(e.z) + dz, S: S0 + dS }; break; }
    }
    if (!start) { problems.push(`the way in is not standable near ${e.x},${S0},${e.z}`); start = { x: e.x, z: e.z, S: S0 }; }
    const box = { x0: def.x0 - 4, x1: def.x1 + 4, z0: def.z0 - 4, z1: def.z1 + 4 };
    const R = reach(data, start, box);
    let reached = 0;
    b.chests.forEach((c, i) => {
        const S = Math.round(c.y + 0.5);
        // room
        if (!solidAt(data, c.x, S, c.z)) problems.push(`chest ${i} (${c.room}) has no floor at ${c.x},${S},${c.z}`);
        for (const [x, z] of chestPoints(c)) {
            for (const L of [S + 1, S + 2]) if (solidAt(data, x, L, z)) { problems.push(`chest ${i} (${c.room}) inside block ${data.get(Math.round(x), L, Math.round(z))} at ${x.toFixed(1)},${L},${z.toFixed(1)} (chest ${c.x},${S},${c.z})`); return; }
        }
        // walkable to: some reached standing place within 3 blocks of its front on its floor (±1)
        const fx = c.x + Math.sin(c.a) * 2.5, fz = c.z + Math.cos(c.a) * 2.5;
        let ok = false;
        for (let dx = -2; dx <= 2 && !ok; dx++) for (let dz = -2; dz <= 2 && !ok; dz++) for (const dS of [0, 1, -1]) if (R.seen.has(R.key(Math.round(fx) + dx, Math.round(fz) + dz, S + dS))) ok = true;
        if (ok) reached++; else problems.push(`chest ${i} (${c.room}) cannot be walked to (${c.x},${S},${c.z})`);
    });
    return { problems, chests: b.chests.length, reached, cells: R.cells.length, parts: b.parts.length };
}
