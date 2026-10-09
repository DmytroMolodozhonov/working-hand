import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, BASE_COLORS, patternOf } from '../../src/world/Terrain.js';
import { CASTLE_CELL } from '../../src/world/Castles.js';

function world(seed) {
    const t = new TerrainData();
    t.generate({ seed, mountains: true });
    return t;
}

function castlesOf(t, n = 4) {
    const out = [];
    for (let gz = -3; gz <= 3 && out.length < n; gz++) for (let gx = -3; gx <= 3 && out.length < n; gx++) {
        const c = t.castles.cellOf(gx, gz);
        if (c) out.push(c);
    }
    return out;
}

test('castles: found often enough, every one different, the same on every computer', () => {
    const a = world(4242), b = world(4242);
    const ca = castlesOf(a, 50), cb = castlesOf(b, 50);
    // 7×7 cells of 480 m: several castles to find
    assert.ok(ca.length >= 8, `castles: ${ca.length}`);
    assert.deepEqual(ca.map((c) => [c.id, c.x, c.z, c.parts.length, c.name]), cb.map((c) => [c.id, c.x, c.z, c.parts.length, c.name]));
    const styles = new Set(ca.map((c) => c.style)), stones = new Set(ca.map((c) => c.stone));
    assert.ok(styles.size >= 2 && stones.size >= 2, 'different looks');
    for (const c of ca) {
        assert.ok(Math.hypot(c.x, c.z) > 300, 'not at the spawn');
        assert.ok(c.population >= 100 && c.population <= 1000, `population ${c.population}`);
        assert.ok(c.rooms.length >= 11, `rooms ${c.rooms.length}`);
        assert.ok(c.houses.length >= 20 && c.stalls.length >= 4 && c.chests.length >= 4);
        assert.ok(c.x >= c.gx * CASTLE_CELL && c.x < (c.gx + 1) * CASTLE_CELL);
    }
});

test('castles: stone walls stand on levelled ground, a throne of gold in the keep', () => {
    const t = world(12345);
    for (const c of castlesOf(t, 3)) {
        // the gate opening is clear, the wall beside it is stone
        assert.equal(t.topLayer(Math.round(c.gate.x), Math.round(c.gate.z)), c.F);
        const throneBelow = t.get(Math.round(c.throne.x), Math.round(c.throne.y + 1.5) - 1, Math.round(c.throne.z));
        assert.equal(throneBelow, BLOCK.GOLD, 'sits on a golden seat');
        // inside the keep's walls: a big hall (air) above the floor
        assert.equal(t.get(Math.round(c.throneFront.x), c.F + 3, Math.round(c.throneFront.z)), BLOCK.AIR);
        // no trees in the village
        let trees = 0;
        for (const h of c.houses.slice(0, 10)) for (let L = c.F + 1; L < c.F + 14; L++) if (t.get(Math.round(h.door.x), L, Math.round(h.door.z)) === BLOCK.LEAVES) trees++;
        assert.equal(trees, 0);
    }
});

test('castles: every path of the villagers can be walked (gate → throne, rooms, walls, market, houses, fields)', () => {
    for (const seed of [12345, 777]) {
        const t = world(seed);
        for (const c of castlesOf(t, 4)) {
            const stand = (y) => Math.round(y + 1.5);
            const ok = (x, z, L) => {
                const ix = Math.round(x), iz = Math.round(z);
                const f = t.floorBelow(ix, iz, L);
                if (f < L - 2 || f > L) return 'no floor';
                if (t.solidIn(ix, iz, f + 1, f + 5)) return 'blocked';
                return null;
            };
            for (const n of c.nodes) assert.equal(ok(n.x, n.z, stand(n.y)), null, `${c.id} node ${n.id} ${n.tag}`);
            for (const [a, b] of c.edges) {
                const A = c.nodes[a], B = c.nodes[b];
                if (A.y !== B.y) continue; // (stairs)
                const steps = Math.max(1, Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / 0.5));
                for (let i = 1; i < steps; i++) {
                    const f = i / steps;
                    assert.equal(ok(A.x + (B.x - A.x) * f, A.z + (B.z - A.z) * f, stand(A.y)), null, `${c.id} edge ${a}-${b}`);
                }
            }
            // everything can be reached from the gate
            const adj = new Map();
            for (const [a, b] of c.edges) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
            const start = c.nodes.find((n) => n.tag === 'gateOut').id;
            const seen = new Set([start]);
            const q = [start];
            while (q.length) for (const y of adj.get(q.pop()) || []) if (!seen.has(y)) { seen.add(y); q.push(y); }
            assert.equal(seen.size, c.nodes.length, `${c.id}: unreachable ${c.nodes.filter((n) => !seen.has(n.id)).map((n) => n.tag).join(',')}`);
            for (const tag of ['throneFront', 'market', 'stall', 'home', 'field', 'room:treasury', 'stairsTop', 'wallStairs', 'room:barracks', 'well']) {
                if (tag === 'room:barracks' && c.style === 'compact') continue;
                assert.ok(c.nodes.some((n) => n.tag === tag || n.tag.startsWith(tag)), `${c.id} has ${tag}`);
            }
        }
    }
});

test('castle blocks: colours and shader patterns for every new block', () => {
    for (const [name, id] of Object.entries(BLOCK)) {
        if (id === BLOCK.AIR || id === BLOCK.ICE_SHAPE) continue;
        assert.ok(BASE_COLORS[id] != null, `colour of ${name}`);
    }
    assert.ok(patternOf(BLOCK.CS_GREY) > 0 && patternOf(BLOCK.PLANKS) > 0 && patternOf(BLOCK.ROOF_RED) > 0 && patternOf(BLOCK.GRASS) === 0);
    const t = world(12345);
    const c = castlesOf(t, 1)[0];
    const a = t.buildChunkArrays(Math.floor(c.x / 32), Math.floor(c.z / 32));
    assert.ok(a.raised.patterned, 'castle faces carry their pattern');
    assert.equal(a.raised.patterns.length * 3, a.raised.positions.length);
});
