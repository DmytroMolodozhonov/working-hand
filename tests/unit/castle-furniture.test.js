/**
 * The castles' rooms furnished (world generation 8, CastleFurniture.js; FURNISH_FROM_GEN): the author, after taking a kingdom —
 * «комнаты ПУСТЫЕ… Должна быть БОЛЬШАЯ КОРОЛЕВСКАЯ СПАЛЬНЯ… Больше сундуков разных — на 5–10 сундуков больше».
 * Measured on the real blocks of the world (TerrainData.get); the same castles of the same seed without it are the «before».
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, WORLD_GEN, FURNISH_FROM_GEN } from '../../src/world/Terrain.js';
import { MIN_ITEMS } from '../../src/world/CastleFurniture.js';
import { treasureShares, TREASURE } from '../../src/game/CastleTreasure.js';

const SEEDS = [20261015, 7, 99];
const make = (seed, furnish) => { const d = new TerrainData(); d.generate({ seed, mountains: true, seas: true, lush: true, slopes: true, wizHuts: true, furnish }); return d; };
const castlesOf = (d, R = 2) => { const out = []; for (let gz = -R; gz <= R; gz++) for (let gx = -R; gx <= R; gx++) { const c = d.castles.cellOf(gx, gz); if (c) out.push(c); } return out; };
const worlds = new Map();
const world = (seed, furnish) => { const k = seed + ':' + furnish; if (!worlds.has(k)) worlds.set(k, make(seed, furnish)); return worlds.get(k); };
/** The test thresholds (a thing counts once; a table with its benches three), by purpose. */
const AT_LEAST = { kitchen: 12, dining: 10, armoury: 12, treasury: 6, storeroom: 15, chapel: 10, library: 14, bedroom: 9, king: 12, guardroom: 12, gallery: 12, barracks: 6 };
const rectOf = (r) => ({ x0: Math.floor(r.x0), x1: Math.floor(r.x1), z0: Math.floor(r.z0), z1: Math.floor(r.z1) });
const inRect = (r, x, z, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

test('the world version: new worlds are generation 8, furnished; FURNISH_FROM_GEN is the one number; thresholds cover every kind', () => {
    assert.ok(WORLD_GEN >= FURNISH_FROM_GEN);
    assert.equal(FURNISH_FROM_GEN, 8);
    for (const k of Object.keys(AT_LEAST)) assert.ok(MIN_ITEMS[k] >= AT_LEAST[k] - 2, k); // (the generator fills up to its own minimum)
});

test('old worlds (not furnished) stay as they were: the same castle, its village and its chests — no looks, no counts, the old hall', () => {
    for (const seed of SEEDS) {
        const A = castlesOf(world(seed, false)), B = castlesOf(world(seed, true));
        assert.deepEqual(A.map((c) => c.id), B.map((c) => c.id));
        A.forEach((a, i) => {
            const b = B[i];
            // everything else of the castle is generated as before (the castle's own random numbers go on as they were)
            for (const k of ['x', 'z', 'F', 'rot', 'style', 'name', 'king', 'population', 'knights', 'color', 'stone', 'zone', 'gate', 'houses', 'stalls', 'fields', 'pens', 'graves', 'posts', 'market', 'walls', 'inner']) {
                assert.deepEqual(a[k], b[k], `${a.id} ${k}`);
            }
            const at = (c) => c.wallWalk.map((id) => [c.nodes[id].x, c.nodes[id].z]); // (the node numbers differ: the king's two rooms are one)
            assert.deepEqual(at(a), at(b), `${a.id} the wall walk`);
            assert.ok(a.chests.every((c) => c.look === undefined && c.flavor === undefined), `${a.id} old chests carry no look`);
            assert.ok(a.rooms.every((r) => r.items === undefined), `${a.id} old rooms are not counted`);
            assert.ok(!a.parts.some((p) => p.k === 3 && p.cells.some((_, j) => j % 4 === 3 && (p.cells[j] === 1 || p.cells[j] === 2))), `${a.id} no half blocks of furniture in an old castle`);
            // the old hall: the old keep depth
            const th = a.rooms.find((r) => r.kind === 'throne');
            const bh = b.rooms.find((r) => r.kind === 'throne');
            assert.equal(th.z1 - th.z0 + th.x1 - th.x0, bh.z1 - bh.z0 + bh.x1 - bh.x0, `${a.id} the hall is as long as it was (the keep only grows behind it)`);
        });
    }
});

test('determinism: the same seed, the same castle, the same rooms, blocks and chests', () => {
    const a = castlesOf(make(SEEDS[0], true)), b = castlesOf(make(SEEDS[0], true));
    assert.equal(JSON.stringify(a.map((c) => [c.parts, c.chests, c.rooms, c.beds, c.nodes, c.edges])), JSON.stringify(b.map((c) => [c.parts, c.chests, c.rooms, c.beds, c.nodes, c.edges])));
});

test('furnished rooms: no room of a castle is empty — things by its purpose; none in a library chest', () => {
    const seen = new Set();
    for (const seed of SEEDS) for (const c of castlesOf(world(seed, true))) {
        for (const r of c.rooms) {
            if (!AT_LEAST[r.kind]) continue;
            seen.add(r.kind);
            assert.ok(r.items >= AT_LEAST[r.kind], `${c.id} ${r.kind}: ${r.items} things (at least ${AT_LEAST[r.kind]})`);
        }
        const lib = c.rooms.filter((r) => r.kind === 'library');
        for (const ch of c.chests) for (const r of lib) assert.ok(!(inRect(rectOf(r), ch.x, ch.z) && Math.abs(ch.y - r.y) < 2), `${c.id}: a chest in the library`);
    }
    for (const k of ['kitchen', 'dining', 'armoury', 'treasury', 'storeroom', 'chapel', 'library', 'bedroom', 'king', 'gallery', 'barracks']) assert.ok(seen.has(k), `${k} seen`);
});

test('the king\'s chamber: one big room (13 × 11 at the least), 8 high, a royal bed, at least 3 chests — the king\'s own carved one among them', () => {
    for (const seed of SEEDS) {
        const d = world(seed, true);
        for (const c of castlesOf(d)) {
            const kings = c.rooms.filter((r) => r.kind === 'king');
            assert.equal(kings.length, 1, `${c.id} one king's chamber`);
            const r = kings[0], R = rectOf(r);
            const w = R.x1 - R.x0 + 1, h = R.z1 - R.z0 + 1;
            assert.ok(Math.max(w, h) >= 13 && Math.min(w, h) >= 11, `${c.id} chamber ${w}×${h}`);
            // 8 high: air up to the ceiling over a free cell of its way through, the ceiling over it
            const floorL = Math.round(r.y + 0.5); // (the layer of its floor)
            const mid = c.nodes.find((n) => n.tag === 'room:king');
            assert.ok(mid, `${c.id} the way into the chamber`);
            const mx = Math.round(mid.x), mz = Math.round(mid.z);
            for (let L = floorL + 1; L <= floorL + 8; L++) assert.equal(d.get(mx, L, mz), 0, `${c.id} head room at ${L - floorL}`);
            assert.notEqual(d.get(mx, floorL + 9, mz), 0, `${c.id} the ceiling`);
            // the royal bed: the king's sleeping place is in it
            const bed = c.beds.find((b) => b.room === 'king');
            assert.ok(bed && inRect(R, Math.round(bed.x), Math.round(bed.z)), `${c.id} the king's bed in his chamber`);
            // chests in it, the king's own among them
            const mine = c.chests.filter((ch) => inRect(R, Math.floor(ch.x), Math.floor(ch.z)) && Math.abs(ch.y - r.y) < 2);
            assert.ok(mine.length >= 3, `${c.id} chests in the chamber: ${mine.length}`);
            assert.ok(mine.some((ch) => ch.room === 'king' && ch.look === 'rich'), `${c.id} the king's own chest`);
            // a bed of silk: the king's bed is 5 wide — its coverlet blocks (castle's colour) are over the frame
            let bedBlocks = 0;
            for (let x = R.x0; x <= R.x1; x++) for (let z = R.z0; z <= R.z1; z++) if (d.get(x, floorL + 6, z) !== 0) bedBlocks++; // (the canopy)
            assert.ok(bedBlocks >= 30, `${c.id} the canopy over the bed: ${bedBlocks}`);
        }
    }
});

test('chests: 5–10 more than the empty castle (small +5, large +10), of different looks and holdings, the king\'s fortune shared among them', () => {
    const looks = new Set(), flavors = new Set();
    const byStyle = {};
    for (const seed of SEEDS) {
        const A = castlesOf(world(seed, false)), B = castlesOf(world(seed, true));
        A.forEach((a, i) => {
            const b = B[i];
            const more = b.chests.length - a.chests.length;
            assert.ok(more >= 5 && more <= 10, `${a.id} (${a.style}): ${a.chests.length} → ${b.chests.length}`);
            (byStyle[a.style] || (byStyle[a.style] = [])).push(more);
            for (const ch of b.chests) { if (ch.look) looks.add(ch.look); if (ch.flavor) flavors.add(ch.flavor); }
            // the fortune is one: shares add up (castle-treasure.test.js rules), every chest at least MIN_CHEST
            const t = treasureShares(b);
            let sum = t.purse;
            for (const ch of b.chests) { const v = t.byId.get(ch.id); assert.ok(v >= TREASURE.MIN_CHEST, `${ch.id} share ${v}`); sum += v; }
            assert.equal(sum, t.fortress ?? t.fortune, `${b.id} the shares add up`);
            // the king's treasury keeps the lion's share
            const share = (rooms) => b.chests.filter((ch) => rooms.includes(ch.room)).reduce((s, ch) => s + t.byId.get(ch.id), 0);
            assert.ok(share(['treasury']) > share(['bedroom', 'barracks', 'kitchen', 'armoury', 'storeroom']), `${b.id} the treasury is the richest`);
        });
    }
    const avg = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    if (byStyle.compact && byStyle.grand) assert.ok(avg(byStyle.grand) > avg(byStyle.compact), 'a larger castle has more');
    for (const k of ['plain', 'rich', 'iron', 'painted', 'crate']) assert.ok(looks.has(k), `look ${k}`);
    for (const k of ['food', 'clothes', 'arms', 'scrolls']) assert.ok(flavors.has(k), `holding ${k}`);
});

test('chests stand on the floor of their room, in the open: nothing in the cell, a floor under it', () => {
    for (const seed of SEEDS) {
        const d = world(seed, true);
        for (const c of castlesOf(d)) for (const ch of c.chests) {
            const fl = Math.round(ch.y + 0.5);
            const x = Math.round(ch.x), z = Math.round(ch.z);
            assert.notEqual(d.get(x, fl, z), 0, `${ch.id} floor`);
            assert.equal(d.get(x, fl + 1, z), 0, `${ch.id} (${ch.room}/${ch.look}) stands in the open: ${d.get(x, fl + 1, z)} at ${x},${fl + 1},${z}`);
            assert.ok(ch.scale >= 1.6 && ch.scale <= 3, `${ch.id} size ${ch.scale}`);
        }
    }
});

test('furniture is an obstacle that the ways avoid: every walking node of the keep on free floor with the head room of a hat, the ways 3 wide, every room reached from the gate', () => {
    for (const seed of SEEDS) {
        const d = world(seed, true);
        for (const c of castlesOf(d)) {
            const free = (x, z, floorL) => { for (let L = floorL + 1; L <= floorL + 5; L++) if (d.get(x, L, z) !== 0) return false; return true; };
            const rooms = c.rooms.filter((r) => AT_LEAST[r.kind]); // (the throne room is as it was: its pillars stand on the old ways)
            for (const n of c.nodes) {
                if (!n.tag || !n.tag.startsWith('room:')) continue;
                const fl = Math.round(n.y + 0.5), x = Math.round(n.x), z = Math.round(n.z);
                assert.notEqual(d.get(x, fl, z), 0, `${c.id} node ${n.tag} floor`);
                assert.ok(free(x, z, fl), `${c.id} node ${n.tag} at ${x},${fl},${z} is inside a thing`);
            }
            // the edges inside a room: 3 wide (every cell of the 3 × 3 round a point of the way is free)
            const byId = new Map(c.nodes.map((n) => [n.id, n]));
            for (const [a, b] of c.edges) {
                const A = byId.get(a), B = byId.get(b);
                if (Math.abs(A.y - B.y) > 0.6) continue; // (a stair)
                const len = Math.hypot(B.x - A.x, B.z - A.z);
                for (let t = 0; t <= len; t += 1) {
                    const x = A.x + (B.x - A.x) * (len ? t / len : 0), z = A.z + (B.z - A.z) * (len ? t / len : 0);
                    const room = rooms.find((r) => inRect(rectOf(r), Math.round(x), Math.round(z), -2) && Math.abs(r.y - A.y) < 1.5);
                    if (!room) continue;
                    const fl = Math.round(A.y + 0.5);
                    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
                        assert.ok(free(Math.round(x) + dx, Math.round(z) + dz, fl), `${c.id} ${room.kind}: the way is blocked at ${Math.round(x) + dx},${fl},${Math.round(z) + dz}`);
                    }
                }
            }
            // one graph: from the gate every room of the keep
            const adj = new Map(c.nodes.map((n) => [n.id, []]));
            for (const [a, b] of c.edges) { adj.get(a).push(b); adj.get(b).push(a); }
            const gate = c.nodes.find((n) => n.tag === 'gateOut');
            const seen = new Set([gate.id]);
            const q = [gate.id];
            while (q.length) { const u = q.pop(); for (const v of adj.get(u)) if (!seen.has(v)) { seen.add(v); q.push(v); } }
            for (const n of c.nodes) if (n.tag && n.tag.startsWith('room:')) assert.ok(seen.has(n.id), `${c.id} ${n.tag} cannot be reached from the gate`);
        }
    }
});

test('the keep goes 4 further back; the throne room, its throne and its gate are as before', () => {
    for (const seed of SEEDS) {
        const A = castlesOf(world(seed, false)), B = castlesOf(world(seed, true));
        A.forEach((a, i) => {
            const b = B[i];
            const ka = a.keep, kb = b.keep;
            assert.equal(Math.round((kb.x1 - kb.x0) + (kb.z1 - kb.z0)) - Math.round((ka.x1 - ka.x0) + (ka.z1 - ka.z0)), 4, `${a.id} the keep`);
            assert.deepEqual(a.throne && [a.throne.x, a.throne.z], b.throne && [b.throne.x, b.throne.z], `${a.id} the throne stands where it did`);
            assert.deepEqual(a.throneGate, b.throneGate, `${a.id} the gate of the hall`);
        });
    }
});
