// Lone wizards' houses (Hamlets.js 'magehut'): how roomy they are for the hero, measured on the real blocks.
//   node tools/hutbench.mjs [--gen 7|6] [--seeds 5]
// The hero is ~3.5 m tall (4 free layers over the floor) and ~2 blocks across with his arms, so «a way 3 wide» = a cell whose
// whole 3 × 3 neighbourhood is free. Furniture the game puts in later (the bed, the chests) is counted as standing there.
import { TerrainData, BLOCK } from '../src/world/Terrain.js';
import { WIZ_HUTS, WIZ_STAIR } from '../src/world/Castles.js';

const LEGACY = { cottage: { w: 5, d: 4 }, towerhouse: { w: 4, d: 4 } };
export const sizeOf = (kind) => WIZ_HUTS[kind] || LEGACY[kind];

const solid = (b) => b !== BLOCK.AIR && b !== BLOCK.WATER;

/** Measure one lone wizard's house (`def` of a 'magehut'). */
export function probe(d, def) {
    const house = def.houses[0], { w, d: dd } = sizeOf(house.kind), X = def.x, Z = def.z, F = def.F, rot = def.rot;
    const wx = (u, v) => X + (rot === 0 ? u : rot === 1 ? -v : rot === 2 ? -u : v);
    const wz = (u, v) => Z + (rot === 0 ? v : rot === 1 ? u : rot === 2 ? -v : -u);
    const toLot = (x, z) => { const dx = x - X, dz = z - Z; return rot === 0 ? [dx, dz] : rot === 1 ? [dz, -dx] : rot === 2 ? [-dx, -dz] : [-dz, dx]; };
    const blk = (u, L, v) => d.get(wx(u, v), L, wz(u, v));
    const HEAD = 4;
    const standable = (u, y, v) => { if (!solid(blk(u, y, v))) return false; for (let k = 1; k <= HEAD; k++) if (solid(blk(u, y + k, v))) return false; return true; };
    // things the game puts in later: the beds (2.5 × 5.5) and the chests (their width × 0.85 · scale deep)
    const furn = [];
    for (const b of house.bedSpots) { const [u, v] = toLot(b.x, b.z); furn.push([u - 1.25, u + 1.25, v - 2.75, v + 2.75, b.y]); }
    for (const c of house.chests) {
        const [u, v] = toLot(c.x, c.z), dx = -Math.sin(c.yaw), dz = -Math.cos(c.yaw), [fu, fv] = (() => { const [a, b] = toLot(X + dx, Z + dz); return [a, b]; })();
        const W = 1.25 * c.scale, D = 0.85 * c.scale, alongB = Math.abs(fv) > Math.abs(fu);
        furn.push(alongB ? [u - W / 2, u + W / 2, v - D / 2, v + D / 2, c.y] : [u - D / 2, u + D / 2, v - W / 2, v + W / 2, c.y]);
    }
    const floors = [{ name: 'ground', y: F, ly: F + 1 - 1.5 }];
    if (kindUp(house.kind)) floors.push({ name: 'upstairs', y: F + 1 + WIZ_HUTS[house.kind].up - 1, ly: F + 1 + WIZ_HUTS[house.kind].up - 1.5 });
    const out = { kind: house.kind, inner: [2 * w - 1, 2 * dd - 1], floors: [] };
    for (const fl of floors) {
        const cells = new Map();
        for (let u = -w + 1; u <= w - 1; u++) for (let v = -dd + 1; v <= dd - 1; v++) {
            const onFurn = furn.some((r) => Math.abs(r[4] - fl.ly) < 1 && u + 0.5 > r[0] && u - 0.5 < r[1] && v + 0.5 > r[2] && v - 0.5 < r[3]);
            cells.set(u + ',' + v, standable(u, fl.y, v) && !onFurn);
        }
        const onStair = (u, v) => kindUp(house.kind) && fl.name === 'ground' && u >= WIZ_STAIR.a0 && u <= WIZ_STAIR.a1 && v >= WIZ_STAIR.b0 && v <= WIZ_STAIR.b0 + WIZ_STAIR.n - 1;
        const free = (u, v) => cells.get(u + ',' + v) === true || onStair(u, v); // (the stair is walked on: a way beside it is a way)
        const pass = (u, v) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (!free(u + a, v + b)) return false; return true; };
        const reach = new Set(), q = [];
        let start = null;
        for (const [u, v] of fl.name === 'ground' ? [[0, -1], [0, 0], [0, -2]] : [[0, 3], [0, -2], [1, 1]]) if (pass(u, v)) { start = [u, v]; break; }
        if (start) { q.push(start); reach.add(start.join()); }
        while (q.length) {
            const [u, v] = q.pop();
            for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (u + a) + ',' + (v + b); if (!reach.has(k) && pass(u + a, v + b)) { reach.add(k); q.push([u + a, v + b]); } }
        }
        // (how far from the hero's standing place to the thing: to the edge of a bed or a chest, to the cell of the rest)
        const nearReach = (u, v, r) => { let best = 99; for (const k of reach) { const [a, b] = k.split(',').map(Number); const du = r ? Math.max(r[0] - a, 0, a - r[1]) : Math.abs(a - u), dv = r ? Math.max(r[2] - b, 0, b - r[3]) : Math.abs(b - v); best = Math.min(best, Math.hypot(du, dv)); } return best; };
        const targets = [];
        if (fl.name === 'ground') {
            for (const b of house.bedSpots) targets.push(['bed', ...toLot(b.x, b.z), furn.find((r) => Math.abs(r[4] - b.y) < 0.1)]);
            for (const c of house.chests) if (Math.abs(c.y - fl.ly) < 1) targets.push(['chest', ...toLot(c.x, c.z), furn.find((r) => Math.abs(r[4] - c.y) < 0.1 && Math.hypot(...[(r[0] + r[1]) / 2 - toLot(c.x, c.z)[0], (r[2] + r[3]) / 2 - toLot(c.x, c.z)[1]]) < 0.3)]);
            for (let u = -w + 1; u <= w - 1; u++) for (let v = -dd + 1; v <= dd - 1; v++) { const t = blk(u, F + 1, v); if (t === BLOCK.POTION) targets.push(['cauldron', u, v]); }
            if (kindUp(house.kind)) targets.push(['stair', WIZ_STAIR.a0 + 1, WIZ_STAIR.b0 - 1]);
        } else {
            for (const c of house.chests) if (Math.abs(c.y - fl.ly) < 1) targets.push(['chest', ...toLot(c.x, c.z), furn.find((r) => Math.abs(r[4] - c.y) < 0.1 && Math.hypot((r[0] + r[1]) / 2 - toLot(c.x, c.z)[0], (r[2] + r[3]) / 2 - toLot(c.x, c.z)[1]) < 0.3)]);
            targets.push(['stair top', WIZ_STAIR.a1 + 1, WIZ_STAIR.b0 + WIZ_STAIR.n - 2]);
        }
        const reached = targets.map(([n, u, v, r]) => [n, +nearReach(u, v, r).toFixed(1)]);
        const total = cells.size;
        const freeN = [...cells.values()].filter(Boolean).length;
        let ceil = 99;
        for (let u = -w + 1; u <= w - 1; u++) for (let v = -dd + 1; v <= dd - 1; v++) if (cells.get(u + ',' + v)) { let k = 1; while (k < 40 && (!solid(blk(u, fl.y + k, v)) || blk(u, fl.y + k, v) === BLOCK.LANTERN)) k++; ceil = Math.min(ceil, k - 1); }
        out.floors.push({ name: fl.name, cells: total, free: freeN, passable: [...cells.keys()].filter((k) => pass(...k.split(',').map(Number))).length, reachable: reach.size, ceiling: ceil, reached });
    }
    // the door: layers free over the doorstep and cells free across
    let dh = 0; while (dh < 12 && !solid(blk(0, F + 1 + dh, -dd))) dh++;
    let dw = 0; for (let u = -3; u <= 3; u++) if (!solid(blk(u, F + 1, -dd)) && !solid(blk(u, F + 2, -dd))) dw++;
    out.door = { h: dh, w: dw };
    // the stair of the tower house: walk the real blocks from the door's floor up (steps of at most 1 up or down, 4 free layers)
    if (kindUp(house.kind)) {
        const seen = new Set(), st = [[0, F, -1]]; let top = F;
        seen.add('0,' + F + ',-1');
        while (st.length) {
            const [u, y, v] = st.pop(); top = Math.max(top, y);
            for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) {
                const k = (u + a) + ',' + (y + dy) + ',' + (v + b);
                if (Math.abs(u + a) >= w || Math.abs(v + b) >= dd || seen.has(k) || !standable(u + a, y + dy, v + b)) continue;
                seen.add(k); st.push([u + a, y + dy, v + b]);
            }
        }
        out.climb = top - F; out.upReached = seen.has('0,' + (F + 1 + WIZ_HUTS[house.kind].up - 1) + ',3');
    }
    return out;
}
const kindUp = (k) => !!WIZ_HUTS[k]?.up;

if (process.argv[1] && process.argv[1].endsWith('hutbench.mjs')) {
    const arg = (n, dflt) => { const i = process.argv.indexOf('--' + n); return i < 0 ? dflt : process.argv[i + 1]; };
    const gen = +arg('gen', 7), seeds = +arg('seeds', 4);
    const seen = new Map();
    for (let s = 0; s < seeds; s++) {
        const d = new TerrainData();
        d.generate({ seed: 20261015 + s * 7919, mountains: true, seas: true, lush: true, slopes: gen >= 6, wizHuts: gen >= 7 });
        for (let gx = -4; gx < 4; gx++) for (let gz = -4; gz < 4; gz++) for (const h of d.hamlets.cellOf(gx, gz)) {
            if (h.type !== 'magehut') continue;
            const r = probe(d, h);
            if (!seen.has(r.kind)) seen.set(r.kind, r);
        }
    }
    for (const r of seen.values()) console.log(JSON.stringify(r, null, 1));
}
