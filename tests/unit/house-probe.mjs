// Measuring a house on its real blocks (the housebench tool and the house tests use it): the hero is ~3.5 m tall (4 free layers over the floor),
// «a way 3 wide» = a strip of 3 standable cells across (within one step of each other) with the cells in front or behind within one step.
// Furniture the game puts in later (the beds, the chests) is counted as standing there.
import { BLOCK } from '../../src/world/Terrain.js';
import { BIG_HOUSES } from '../../src/world/Castles.js';

export const OLD = { hut: [4, 4], cottage: [5, 4], longhouse: [6, 4], barn: [6, 5], manor: [6, 5], stone: [6, 5], brick: [6, 5], towerhouse: [4, 4] };
const GEN = 11;
const solid = (b) => b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.FLOWERS && b !== BLOCK.LANTERN;

/** Measure one house (a record of `def.houses`, the castle `c`) on the blocks of `d`. */
export function probe(get, house, size = null, debug = false) {
    const kind = house.kind;
    const sz = size || (BIG_HOUSES[kind]);
    const cx = house.c.x, cz = house.c.z, R = Math.max(sz.w, sz.d) + 2;
    const L0 = Math.round(house.doorRec ? house.doorRec.y + 1.5 : house.inside.y + 1.5);
    const blk = (x, L, z) => get(x, L, z);
    // the footprint: the depth runs from the door to the inside
    const depthX = house.doorRec ? Math.abs(house.inside.x - house.doorRec.x) > Math.abs(house.inside.z - house.doorRec.z) : false;
    const hx = (depthX ? sz.d : sz.w) - 1, hz = (depthX ? sz.w : sz.d) - 1; // (the cells inside the walls: ±(w − 1), ±(d − 1))
    const inside = (x, z) => Math.abs(x - cx) <= hx + 0.01 && Math.abs(z - cz) <= hz + 0.01;
    // standable surfaces: feet layer L (the block under them is solid), 4 free layers above
    const top = (x, z, near) => { // the standable layer closest to `near` in column (x, z) within ±1, or null
        for (const dy of [0, 1, -1]) { const L = near + dy; if (solid(blk(x, L - 1, z)) && !solid(blk(x, L, z)) && !solid(blk(x, L + 1, z)) && !solid(blk(x, L + 2, z)) && !solid(blk(x, L + 3, z))) return L; }
        return null;
    };
    const furn = [];
    for (const b of house.bedSpots) furn.push({ x: b.x, z: b.z, hx: 1.25, hz: 2.75, yaw: b.yaw, y: b.y });
    for (const ch of house.chests) furn.push({ x: ch.x, z: ch.z, hx: 0.65 * ch.scale, hz: 0.45 * ch.scale, yaw: ch.yaw + Math.PI, y: ch.y, chest: true });
    const onFurn = (x, z, y) => furn.some((f) => {
        if (Math.abs(f.y - y) > 3.5) return false;
        const dx = x - f.x, dz = z - f.z, s = Math.sin(f.yaw), c2 = Math.cos(f.yaw);
        const lx = dx * c2 - dz * s, lz = dx * s + dz * c2; // (the bed's own axes: z along the bed)
        const h = f.chest ? [f.hx, f.hz] : [f.hx, f.hz];
        return Math.abs(lx) < h[0] + 0.5 && Math.abs(lz) < h[1] + 0.5;
    });
    const cells = new Map(); // "x,z" → [layers standable]
    for (let x = Math.floor(cx) - R; x <= Math.floor(cx) + R; x++) for (let z = Math.floor(cz) - R; z <= Math.floor(cz) + R; z++) {
        const ls = [];
        if (!inside(x, z)) continue;
        for (let L = L0 - 1; L <= L0 + 20; L++) if (solid(blk(x, L - 1, z)) && !solid(blk(x, L, z)) && !solid(blk(x, L + 1, z)) && !solid(blk(x, L + 2, z)) && !solid(blk(x, L + 3, z)) && !onFurn(x, z, L - 1.5 + 0)) ls.push(L);
        if (ls.length) cells.set(x + ',' + z, ls);
    }
    const near = (x, z, L) => (cells.get(x + ',' + z) || []).filter((l) => Math.abs(l - L) <= 1);
    // a place the hero can stand and go on from, 3 wide: a straight strip of 3 cells at his height across, and the cells along it in front and behind
    // within one step (on a flat floor: the 3 × 3 free; on a stair 3 wide: the step row across, the steps above and below)
    const has = (x, z, L, dl = 0) => near(x, z, L).some((l) => Math.abs(l - L) <= dl);
    const wide = (x, z, L) => {
        for (const [ax, az] of [[1, 0], [0, 1]]) {
            const [px, pz] = [az, ax]; // (across)
            let ok = true;
            for (const t of [-1, 0, 1]) { if (!has(x + px * t, z + pz * t, L, 1)) { ok = false; break; } }
            if (ok && (has(x + ax, z + az, L, 1) || has(x - ax, z - az, L, 1))) return true;
        }
        return false;
    };
    // inside the walls: the cells of the floors (a wall's block is not standable; the cells under the roof are)
    const key = (x, z, L) => x + ',' + z + ',' + L;
    const start = [Math.round(house.inside.x), Math.round(house.inside.z), Math.round(house.inside.y + 1.5)];
    const seen = new Set(), q = [];
    const startL = near(start[0], start[1], start[2])[0];
    if (startL != null && wide(start[0], start[1], startL)) { q.push([start[0], start[1], startL]); seen.add(key(start[0], start[1], startL)); }
    while (q.length) {
        const [x, z, L] = q.pop();
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const l2 of near(x + a, z + b, L)) {
            if (seen.has(key(x + a, z + b, l2)) || !wide(x + a, z + b, l2)) continue;
            seen.add(key(x + a, z + b, l2)); q.push([x + a, z + b, l2]);
        }
    }
    const floors = new Map(); // layer → count of reachable wide cells
    for (const k of seen) { const L = Number(k.split(',')[2]); floors.set(L, (floors.get(L) || 0) + 1); }
    // all free cells (not only wide ones) inside the walls on each floor — the floor space
    const area = (L) => { let n = 0; for (const [k, ls] of cells) { const [x, z] = k.split(',').map(Number); if (ls.includes(L)) n++; } return n; };
    // to a bed or a chest the hero may go a few steps off the wide ways, through places two cells wide (his body, not his arms out)
    const near2 = new Map(seen.size ? [...seen].map((k) => [k, 0]) : []);
    const body = (x, z, L) => { for (const [a, b] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { let ok = true; for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (!has(x + a + i, z + b + j, L, 1)) { ok = false; break; } if (ok) return true; } return false; };
    for (let step = 1; step <= 4; step++) {
        for (const [k, dist] of [...near2]) {
            if (dist !== step - 1) continue;
            const [x, z, L] = k.split(',').map(Number);
            for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const l2 of near(x + a, z + b, L)) {
                const k2 = key(x + a, z + b, l2);
                if (!near2.has(k2) && body(x + a, z + b, l2)) near2.set(k2, step);
            }
        }
    }
    // can the hero stand on such a cell of the thing's floor and touch it (within an arm's reach of its edge, 2.6 m)?
    const reach = (f, r = 2.6) => {
        const L = Math.round(f.y + 1.5);
        const s = Math.sin(f.yaw), c2 = Math.cos(f.yaw);
        for (const k of near2.keys()) {
            const [kx, kz, kl] = k.split(',').map(Number);
            if (Math.abs(kl - L) > 2) continue;
            const dx = kx - f.x, dz = kz - f.z, lx = dx * c2 - dz * s, lz = dx * s + dz * c2;
            if (Math.hypot(Math.max(Math.abs(lx) - f.hx, 0), Math.max(Math.abs(lz) - f.hz, 0)) <= r) return true;
        }
        return false;
    };
    if (debug) { const U = house.up ? 10 : 1; for (let z = Math.floor(cz) - hz; z <= Math.floor(cz) + hz; z++) { let row = ''; for (let x = Math.floor(cx) - hx; x <= Math.floor(cx) + hx; x++) { const ls = cells.get(x + ',' + z) || []; const k = [...near2.keys()].find((q) => { const [a, b, c] = q.split(',').map(Number); return a === x && b === z && Math.abs(c - (ls[ls.length - 1] ?? 0)) <= 0; }); const inSeen = [...seen].some((q) => q.startsWith(x + ',' + z + ',')); row += inSeen ? 'W' : k ? 'n' : ls.length ? '.' : '#'; } console.log(row, z - cz); } }
    const beds = furn.filter((f) => !f.chest).map((f) => reach(f)), chests = furn.filter((f) => f.chest).map((f) => reach(f));
    const ground = near(start[0], start[1], start[2])[0] ?? L0;
    const upper = [...floors.keys()].filter((L) => L > ground + 4);
    return { kind, inner: [2 * sz.w - 1, 2 * sz.d - 1], floors: [...floors.entries()].sort((p, q2) => p[0] - q2[0]).map(([L, n]) => ({ L, wide: n })), groundArea: area(ground), upperArea: upper.length ? area(upper.sort((p1, q2) => (floors.get(q2) - floors.get(p1)))[0]) : 0, beds, chests, upstairs: upper.length > 0, rooms: house.rooms || [] };
}

