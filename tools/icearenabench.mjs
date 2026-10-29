#!/usr/bin/env node
/**
 * icearenabench.mjs — the Ice Queen's great ice arena (src/world/IceCastle.js ICE_CASTLE.ARENA), on the REAL generated world, without the game.
 *   node tools/icearenabench.mjs [--seeds 12345,777,42] [--check] [--walk]
 * For each seed: the floor of the arena is read from the blocks (a cell is walkable if its floor is solid at the castle's layer F and the 3 layers over it
 * are air), then
 *   — how much of the clear disk (radius A) is floor, and where the walls / the hall / the spires stand;
 *   — the way from the hero's arrival (iceApproach: inside the gateway) to the palace gate, for a body of the ice giant's width (r 1.6, 6 blocks across);
 *   — every cell of the disk a giant can stand on is reached from the gateway (no pockets, no dead ends);
 *   — with --walk: giants (r 1.6) and snowmen (r 0.85) walk round the whole terrace with Pilot.js (the game's walking brain) — all arrive, nobody stands long.
 * tests/unit/ice-arena.test.js holds the same numbers.
 */
import { TerrainData, BLOCK } from '../src/world/Terrain.js';
import { iceLocal, iceApproach } from '../src/world/IceCastle.js';
import { simulate } from './pilotsim.mjs';

export const GIANT_R = 1.6, SNOWMAN_R = 0.85;

/** The world of a seed with the arena (the generation that has it). */
export function arenaWorld(seed) {
    const d = new TerrainData();
    d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, iceArena: true });
    return d;
}

/** A grid of the arena's floor, 1 m cells: ok[i][j] — a body can stand in cell (x0 + i, z0 + j). */
export function floorGrid(d, P, half = P.R + 4) {
    const F = P.F, n = half * 2 + 1;
    const x0 = Math.round(P.x) - half, z0 = Math.round(P.z) - half;
    const ok = Array.from({ length: n }, () => new Uint8Array(n));
    const solid = (x, L, z) => { const b = d.get(x, L, z); return b !== BLOCK.AIR && b !== BLOCK.WATER; };
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x = x0 + i, z = z0 + j;
        ok[i][j] = solid(x, F, z) && !solid(x, F + 1, z) && !solid(x, F + 2, z) && !solid(x, F + 3, z) ? 1 : 0;
    }
    return { ok, n, x0, z0, F, at: (x, z) => { const i = Math.round(x) - x0, j = Math.round(z) - z0; return i >= 0 && j >= 0 && i < n && j < n ? ok[i][j] : 0; } };
}

/** A body of radius r fits at (x, z): every cell within r of it is floor. */
export function fits(grid, x, z, r) {
    const R = Math.ceil(r);
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) if (dx * dx + dz * dz <= r * r + 0.3 && !grid.at(x + dx, z + dz)) return false;
    return true;
}

/** Breadth-first over the cells a body of radius r can stand in, from (sx, sz). → {seen: Set of 'i,j', count} */
export function reach(grid, sx, sz, r) {
    const key = (i, j) => i * grid.n + j;
    const seen = new Set();
    const fit = new Map();
    const can = (i, j) => { const k = key(i, j); let v = fit.get(k); if (v === undefined) { v = fits(grid, grid.x0 + i, grid.z0 + j, r); fit.set(k, v); } return v; };
    const si = Math.round(sx) - grid.x0, sj = Math.round(sz) - grid.z0;
    if (!can(si, sj)) return { seen, can, count: 0, key };
    const q = [[si, sj]];
    seen.add(key(si, sj));
    while (q.length) {
        const [i, j] = q.pop();
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + a, nj = j + b;
            if (ni < 0 || nj < 0 || ni >= grid.n || nj >= grid.n || seen.has(key(ni, nj)) || !can(ni, nj)) continue;
            seen.add(key(ni, nj)); q.push([ni, nj]);
        }
    }
    return { seen, can, count: seen.size, key };
}

/** Everything measured for a seed. */
export function measure(seed) {
    const d = arenaWorld(seed), P = d.iceCastle.plan;
    if (!P) return { seed, plan: null };
    const grid = floorGrid(d, P);
    const ap = iceApproach(P);
    const from = { x: ap.x, z: ap.z };
    const r6 = reach(grid, from.x, from.z, 3); // six blocks across: the widest way a giant needs
    const rg = reach(grid, from.x, from.z, GIANT_R + 0.4);
    const rs = reach(grid, from.x, from.z, SNOWMAN_R + 0.2);
    // the clear disk: every cell within A of the middle that is floor and not the palace itself (the hall, its spires and the crystals stand there)
    let disk = 0, giantOk = 0, giantReached = 0, snowReached = 0, snowOk = 0;
    const palace = (x, z) => Math.hypot(x - P.x, z - P.z) < 27; // (the palace's own ground: the hall, the podium, the spires)
    for (let i = 0; i < grid.n; i++) for (let j = 0; j < grid.n; j++) {
        const x = grid.x0 + i, z = grid.z0 + j;
        if (Math.hypot(x - P.x, z - P.z) > P.A || palace(x, z)) continue;
        disk++;
        if (rg.can(i, j)) { giantOk++; if (rg.seen.has(rg.key(i, j))) giantReached++; }
        if (rs.can(i, j)) { snowOk++; if (rs.seen.has(rs.key(i, j))) snowReached++; }
    }
    const gate = iceLocal(P, 0, 27); // (the yard before the palace's stair, 4 m from its first step: a 6-wide body fits there)
    const gi = Math.round(gate.x) - grid.x0, gj = Math.round(gate.z) - grid.z0;
    return { seed, plan: P, grid, from, disk, giantOk, giantReached, snowOk, snowReached,
        reaches6: r6.seen.has(r6.key?.(gi, gj)), reachesGiant: rg.seen.has(rg.key?.(gi, gj)), r6count: r6.count, d };
}

/** Giants and snowmen walk round the terrace with the game's walking brain. → pilotsim's result. */
export function walkRound(m, { giants = 2, snow = 6 } = {}) {
    const P = m.plan, grid = m.grid;
    const room = (r) => (x, z) => fits(grid, x, z, r);
    // (the walkers' own radius is the room's margin: one `room` for all, the widest — a snowman keeps off the walls as a giant does; honest for the worst case)
    const roomG = room(GIANT_R);
    const agents = [];
    const ring = (rad, k, n) => { const a = (k / n) * Math.PI * 2; const w = iceLocal(P, Math.sin(a) * rad, Math.cos(a) * rad); return { x: w.x, z: w.z, stop: 1.5 }; };
    const spawn = iceLocal(P, 0, P.A - 6);
    // (ring walks: consecutive points of a ring never cross the palace in the middle — the walkers' way round it is the sim's, not a pathfinder's)
    const lap = (rad, n, a0, dir) => Array.from({ length: n + 1 }, (_, k) => ring(rad, (a0 + dir * k + n * 4) % n, n));
    for (let i = 0; i < giants; i++) {
        const a0 = i % 2 ? 11 : 1; // (they start at the front, where the gateway is, and go round)
        const goals = [...lap(P.A - 12, 12, a0, i % 2 ? -1 : 1), ...lap(40, 8, i % 2 ? 7 : 1, i % 2 ? 1 : -1)];
        agents.push({ id: 'G' + i, x: spawn.x + (i - 0.5) * 6, z: spawn.z - 3, r: GIANT_R, speed: 3.4, goals });
    }
    for (let i = 0; i < snow; i++) {
        const a0 = (i % 3) + 11;
        const goals = lap(P.A - 10 - (i % 3) * 6, 12, a0, i % 2 ? -1 : 1);
        agents.push({ id: 'S' + i, x: spawn.x + (i - 3) * 3, z: spawn.z - 8, r: SNOWMAN_R, speed: 3.3, goals });
    }
    return simulate({ room: roomG, agents, seconds: 420 });
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const opt = (n, def) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : def; };
    const seeds = opt('seeds', '12345,777,42,2026').split(',').map(Number);
    let bad = 0;
    for (const seed of seeds) {
        const m = measure(seed);
        if (!m.plan) { console.log(`seed ${seed}: no castle`); bad++; continue; }
        const P = m.plan;
        const pc = (a, b) => (b ? (100 * a / b).toFixed(1) : '0') + '%';
        console.log(`seed ${seed}: castle at ${P.x},${P.z} F${P.F} R${P.R} A${P.A}; clear disk ${m.disk} cells: giants stand on ${pc(m.giantOk, m.disk)}, reach ${pc(m.giantReached, m.giantOk)}; snowmen reach ${pc(m.snowReached, m.snowOk)}; the way to the gate for a 6-wide body: ${m.reaches6 ? 'yes' : 'NO'}`);
        if (!m.reaches6 || m.giantReached < m.giantOk) bad++;
        if (args.includes('--walk')) {
            const r = walkRound(m);
            console.log(`   walk: arrived ${r.arrived}/${r.total}, deepest overlap ${r.deepestOverlap} m, longest stand ${r.maxStand} s, set back ${r.unsticks}`);
            if (r.arrived < r.total || r.maxStand > 12) bad++;
        }
    }
    if (args.includes('--check') && bad) { console.error('FAIL'); process.exit(1); }
}
