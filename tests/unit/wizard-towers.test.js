import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, MAX_LAYER, CHUNK } from '../../src/world/Terrain.js';
import { CASTLE_CELL, BLEND } from '../../src/world/Castles.js';
import { LEVELS, TOWER_ZONE } from '../../src/world/WizardTowers.js';

const worlds = new Map();
function world(seed) {
    if (worlds.has(seed)) return worlds.get(seed);
    const t = new TerrainData();
    t.generate({ seed, mountains: true });
    worlds.set(seed, t);
    return t;
}
function towersOf(t, r = 8) {
    const out = [];
    for (let gz = -r; gz < r; gz++) for (let gx = -r; gx < r; gx++) { const c = t.towers.cellOf(gx, gz); if (c) out.push(c); }
    return out;
}
const nearest = (list) => list.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];

test('wizard towers: the same on every computer, one always near the spawn', () => {
    const a = new TerrainData(); a.generate({ seed: 4242, mountains: true });
    const b = new TerrainData(); b.generate({ seed: 4242, mountains: true });
    // b looks at cells in another order (first far away, then the spawn tower)
    b.towers.cellOf(7, 7); b.heightAt(3000, -3000);
    for (let gz = -7; gz <= 7; gz++) for (let gx = -7; gx <= 7; gx++) {
        const x = a.towers.cellOf(gx, gz), y = b.towers.cellOf(gx, gz);
        assert.equal(!!x, !!y);
        if (x) assert.deepEqual([x.id, x.x, x.z, x.parts.length, x.nodes.length, x.name, x.master], [y.id, y.x, y.z, y.parts.length, y.nodes.length, y.name, y.master]);
    }
    for (const seed of [4242, 12345, 1]) {
        const t = world(seed);
        const k = t.towers.spawnKey();
        assert.ok(k !== -1, `a spawn tower (seed ${seed})`);
        const gx = Math.round(k / 65536), gz = k - gx * 65536;
        const s = t.towers.cellOf(gx, gz);
        assert.ok(s, 'the spawn tower is built');
        const d = Math.hypot(s.x, s.z);
        assert.ok(d >= 358 && d <= 1400, `spawn tower at ${d}`);
    }
});

test('wizard towers: ONE in the world (the author), never on a castle, its land inside its own cell; an old world\'s others are lost', () => {
    for (const seed of [4242, 12345, 1]) {
        const t = world(seed);
        const towers = towersOf(t);
        assert.equal(towers.length, 1, `towers ${towers.length} (seed ${seed})`);
        assert.equal(towers[0], t.towers.only());
        assert.equal(towers[0].master, 'Джовалилиус Правдиус Нотан');
        // the towers old worlds had elsewhere: their saved edits are dropped, the one tower's are kept
        let lost = null;
        for (let gz = -8; gz < 8 && !lost; gz++) for (let gx = -8; gx < 8 && !lost; gx++) lost = t.towers.isLost(gx, gz);
        assert.ok(lost, `an old world had other towers (seed ${seed})`);
        const w0 = towers[0], cx = Math.round((lost.x0 + lost.x1) / 2), cz = Math.round((lost.z0 + lost.z1) / 2);
        const kept = t.towers.dropLostEdits([[cx, 5, cz, 0], [Math.round(w0.x), 5, Math.round(w0.z), 0]]);
        assert.deepEqual(kept, [[Math.round(w0.x), 5, Math.round(w0.z), 0]]);
        for (const w of towers) {
            assert.equal(t.castles.cellOf(w.gx, w.gz), null);
            const m = TOWER_ZONE + BLEND + 10;
            assert.ok(w.x - m >= w.gx * CASTLE_CELL && w.x + m <= (w.gx + 1) * CASTLE_CELL, 'inside the cell (x)');
            assert.ok(w.z - m >= w.gz * CASTLE_CELL && w.z + m <= (w.gz + 1) * CASTLE_CELL, 'inside the cell (z)');
            for (let dz = -TOWER_ZONE - BLEND; dz <= TOWER_ZONE + BLEND; dz += 12) for (let dx = -TOWER_ZONE - BLEND; dx <= TOWER_ZONE + BLEND; dx += 12) assert.equal(t.castles.landAt(w.x + dx, w.z + dz), null);
        }
    }
});

test('wizard tower: a round stone tower of 7 floors, 14 rooms, a door, lamps, a pointed roof under the sky limit', () => {
    const t = world(12345);
    const w = nearest(towersOf(t));
    const kinds = new Set(w.rooms.map((r) => r.kind));
    for (const k of ['vault', 'hall', 'shop', 'library', 'classroom', 'alchemy', 'dorm', 'study', 'observatory']) assert.ok(kinds.has(k), k);
    assert.ok(w.rooms.length >= 14);
    assert.equal(new Set(w.rooms.map((r) => r.l)).size, LEVELS.length, '7 floors');
    // the door: open air F+1 … F+5, the ground at F
    const door = w.nodes.find((n) => n.tag === 'towerGate');
    assert.equal(t.topLayer(Math.round(door.x), Math.round(door.z)), w.F);
    const din = w.nodes.find((n) => n.tag === 'towerIn');
    for (let L = w.F + 1; L <= w.F + 5; L++) assert.equal(t.get(Math.round((door.x + din.x) / 2), L, Math.round((door.z + din.z) / 2)), BLOCK.AIR, 'doorway');
    // (the tip at layer 56 — the world's old limit; the world is higher now, 120, for generation 5's mountains)
    const tip = Math.max(...w.parts.map((p) => p.L1));
    assert.ok(tip <= 56 && tip <= MAX_LAYER, `${tip}`);
    assert.equal(t.get(w.x, tip, w.z), BLOCK.ARCANE_LAMP_VIOLET, 'the crystal on the tip');
    assert.equal(t.get(w.x, tip - 8, w.z), BLOCK.ROOF_PURPLE, 'the pointed roof');
    // stone walls, lamps inside, no trees on the land
    let lamps = 0, leaves = 0;
    for (let dz = -18; dz <= 18; dz++) for (let dx = -18; dx <= 18; dx++) for (let L = -6; L <= 40; L++) {
        const b = t.get(w.x + dx, L, w.z + dz);
        if (b === BLOCK.ARCANE_LAMP) lamps++;
    }
    for (let dz = -TOWER_ZONE; dz <= TOWER_ZONE; dz += 3) for (let dx = -TOWER_ZONE; dx <= TOWER_ZONE; dx += 3) for (let L = 1; L <= 14; L++) if (t.get(w.x + dx, L, w.z + dz) === BLOCK.LEAVES) leaves++;
    assert.ok(lamps >= 30, `lamps ${lamps}`);
    assert.equal(leaves, 0);
    assert.ok(t.isSolidAt(w.x + 16, 3, w.z) || t.isSolidAt(w.x - 16, 3, w.z) || t.isSolidAt(w.x, 3, w.z + 16), 'the drum wall');
});

test('wizard tower: the furniture is there and nothing stands in the way (counter, beds, chests, dummies, cauldrons, books)', () => {
    for (const seed of [12345, 4242]) {
        const t = world(seed);
        for (const w of towersOf(t, 3).slice(0, 4)) {
            const tower = w.houses[w.houses.length - 1];
            assert.equal(tower.kind, 'tower');
            assert.equal(tower.bedSpots.length, 6, 'six beds');
            assert.equal(w.chests.filter((c) => c.room === 'vault').length, 3);
            assert.equal(w.chests.filter((c) => c.room === 'study').length, 1);
            assert.equal(w.dummies.length, 2);
            assert.equal(w.spots.filter((s) => s.kind === 'cauldron').length, 2);
            const st = w.stalls[0];
            assert.ok(st && st.frontNode != null && st.counter);
            const ctr = st.counter;
            assert.equal(t.get(ctr.x0, w.F + 1, ctr.z0), BLOCK.PLANKS_DARK, 'the scroll counter');
            let books = 0;
            for (let dz = -15; dz <= 15; dz++) for (let dx = -15; dx <= 15; dx++) for (let L = 8; L <= 13; L++) if (t.get(w.x + dx, L, w.z + dz) === BLOCK.BOOKS) books++;
            assert.ok(books >= 60, `books ${books}`);
            // beds (2.5 × 5.5) and chests are clear of the paths and inside the rooms
            const segs = w.edges.map(([a, b]) => [w.nodes[a], w.nodes[b]]).filter(([A, B]) => A.y === B.y);
            const segD = (x, z, A, B) => {
                const dx = B.x - A.x, dz = B.z - A.z, l2 = dx * dx + dz * dz;
                const k = l2 ? Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / l2)) : 0;
                return Math.hypot(x - A.x - dx * k, z - A.z - dz * k);
            };
            for (const b of tower.bedSpots) {
                assert.ok(Math.hypot(b.x - w.x, b.z - w.z) <= 10.5, 'bed inside the room');
                for (const [A, B] of segs) if (Math.abs(A.y - b.y) < 1) assert.ok(segD(b.x, b.z, A, B) >= 1.25, `bed clear of the path ${A.tag}-${B.tag}`);
                const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), sx = Math.cos(b.yaw), sz = -Math.sin(b.yaw);
                for (const l of [-2.6, 0, 2.6]) for (const s of [-1.1, 0, 1.1]) assert.equal(t.get(Math.round(b.x + fx * l + sx * s), Math.round(b.y + 1.5), Math.round(b.z + fz * l + sz * s)), BLOCK.AIR, 'bed space');
            }
            for (const c of w.chests) {
                assert.equal(t.get(Math.round(c.x), Math.round(c.y + 1.5), Math.round(c.z)), BLOCK.AIR, 'chest place is free');
                for (const [A, B] of segs) if (Math.abs(A.y - c.y) < 1) assert.ok(segD(c.x, c.z, A, B) >= 1.0, 'chest clear of the path');
            }
        }
    }
});

test('wizard tower: every path can be walked — the door, the spiral stair up to the study, the houses, the ring road', () => {
    for (const seed of [12345, 777]) {
        const t = world(seed);
        for (const w of towersOf(t, 4).slice(0, 3)) {
            const stand = (y) => Math.round(y + 1.5);
            const ok = (x, z, L) => {
                const ix = Math.round(x), iz = Math.round(z);
                const f = t.floorBelow(ix, iz, L);
                if (f < L - 2 || f > L) return 'no floor';
                if (t.solidIn(ix, iz, f + 1, f + 5)) return 'blocked';
                return null;
            };
            for (const n of w.nodes) assert.equal(ok(n.x, n.z, stand(n.y)), null, `${w.id} node ${n.id} ${n.tag}`);
            let stairs = 0;
            for (const [a, b] of w.edges) {
                const A = w.nodes[a], B = w.nodes[b];
                if (A.y !== B.y) { assert.equal(Math.abs(A.y - B.y), 1, 'a stair edge rises one step'); stairs++; continue; }
                const steps = Math.max(1, Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / 0.5));
                for (let i = 1; i < steps; i++) {
                    const f = i / steps;
                    assert.equal(ok(A.x + (B.x - A.x) * f, A.z + (B.z - A.z) * f, stand(A.y)), null, `${w.id} edge ${A.tag}-${B.tag}`);
                }
            }
            assert.equal(stairs, 6 * 7, `stair edges ${stairs}`); // (six flights of seven steps)
            const adj = new Map();
            for (const [a, b] of w.edges) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
            const start = w.nodes.find((n) => n.tag === 'towerGate').id;
            const seen = new Set([start]);
            const q = [start];
            while (q.length) for (const y of adj.get(q.pop()) || []) if (!seen.has(y)) { seen.add(y); q.push(y); }
            assert.equal(seen.size, w.nodes.length, `${w.id}: unreachable ${w.nodes.filter((n) => !seen.has(n.id)).map((n) => n.tag).join(',')}`);
            for (const tag of ['stall', 'room:study', 'room:dorm', 'room:vault', 'cauldron', 'telescope', 'home', 'gateOut', 'lectern']) assert.ok(w.nodes.some((n) => n.tag === tag), `${w.id} has ${tag}`);
        }
    }
});

test('wizards\' houses: 4–6 cottages with tall doors, chests, beds, joined to the ring road; no fields, no pens', () => {
    const t = world(4242);
    for (const w of towersOf(t, 3).slice(0, 4)) {
        const houses = w.houses.filter((h) => h.kind !== 'tower');
        assert.ok(houses.length >= 4 && houses.length <= 6, `houses ${houses.length}`);
        assert.equal(w.fields.length, 0); assert.equal(w.pens.length, 0);
        for (const h of houses) {
            assert.ok(h.wizard, 'a wizard lives here');
            assert.equal(h.doorRec.h, 6, 'a door for a pointed hat');
            for (let k = 0; k < 6; k++) assert.equal(t.get(Math.round(h.doorRec.x), Math.round(h.doorRec.y + 1.5) + k, Math.round(h.doorRec.z)), BLOCK.AIR, 'door opening');
            assert.ok(h.chests.length >= 1 && h.bedSpots.length >= 1);
            const linked = w.edges.some(([a, b]) => (a === h.doorNode || b === h.doorNode) && [a, b].some((x) => x !== h.doorNode && Math.min(Math.abs(Math.abs(w.nodes[x]._u) - 33), Math.abs(Math.abs(w.nodes[x]._v) - 33)) === 0));
            assert.ok(linked, 'the door path joins the ring road');
        }
    }
});

test('wizard tower: chunks get exactly its parts; building a tower cell is cheap', () => {
    const t = world(4242);
    const w = nearest(towersOf(t));
    const got = new Set();
    for (let cz = Math.floor((w.z - 90) / CHUNK); cz <= Math.floor((w.z + 90) / CHUNK); cz++) for (let cx = Math.floor((w.x - 90) / CHUNK); cx <= Math.floor((w.x + 90) / CHUNK); cx++) {
        for (const list of t.sites.partsForChunk(cx, cz, CHUNK)) for (const p of list) if (w.parts.includes(p)) got.add(p);
    }
    assert.equal(got.size, w.parts.length);
    // 64 tower cells (castles already known) in well under a frame budget each
    const u = new TerrainData(); u.generate({ seed: 99, mountains: true });
    for (let gz = -4; gz < 4; gz++) for (let gx = -4; gx < 4; gx++) u.castles.cellOf(gx, gz);
    u.towers.spawnKey();
    const t0 = performance.now();
    for (let gz = -4; gz < 4; gz++) for (let gx = -4; gx < 4; gx++) u.towers.cellOf(gx, gz);
    const ms = performance.now() - t0;
    assert.ok(ms < 400, `64 cells in ${ms.toFixed(1)} ms`); // (generous: the tests run side by side)
});

test('sites: one index for castles and towers (land, ids, the minimap with a 🧙)', () => {
    const t = world(4242);
    const w = nearest(towersOf(t));
    assert.equal(t.sites.byId(w.id), w);
    const c = t.castles.cellOf(...(() => { for (let gz = -3; gz <= 3; gz++) for (let gx = -3; gx <= 3; gx++) if (t.castles.cellOf(gx, gz)) return [gx, gz]; })());
    assert.equal(t.sites.byId(c.id), c);
    assert.equal(t.sites.landAt(w.x, w.z).castle, w);
    assert.equal(t.sites.byId('ww3_-2').kind, 'wander');
    const map = t.sites.nearestForMap({ x: w.x + 50, z: w.z });
    assert.ok(map.some((m) => m.icon === '🧙' && m.name === w.name));
});
