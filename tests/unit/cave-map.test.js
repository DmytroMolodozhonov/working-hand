/**
 * The cave map (CaveMap.js): the memory is kept compactly and comes back the same; the hero's eyes
 * open the tunnel they stand in, but never what is behind the rock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CaveMemory, CaveExplorer, CAVE_MAP, columnLook, WALL } from '../../src/game/CaveMap.js';

test('cave memory: saved and restored the same, with a limit', () => {
    const m = new CaveMemory();
    for (let i = -30; i < 30; i++) m.open(i * 3, -i * 5);
    m.addWay(10, 20); m.addWay(12, 21); // (the same way: once)
    m.walk(40.2, -7.8);
    const s = m.snapshot();
    const r = new CaveMemory();
    r.restore(s);
    for (let i = -30; i < 30; i++) assert.ok(r.has(i * 3, -i * 5));
    assert.ok(!r.has(1, 1));
    assert.equal(r.ways.length, 1);
    assert.ok(r.walked(40, -8) && r.has(40, -8) && !r.walked(41, -8), 'the trail kept');
    const big = new CaveMemory();
    for (let i = 0; i < CAVE_MAP.MAX_TILES + 50; i++) big.open(i * 8, 0);
    assert.equal(big.tiles.size, CAVE_MAP.MAX_TILES);
    assert.ok(JSON.stringify(big.snapshot()).length < 60000, 'small enough to save');
    assert.equal(new CaveMemory().snapshot(), null);
});

test('cave eyes: the tunnel is seen, the tunnel behind the rock is not', () => {
    // rock everywhere; a tunnel along x at z 0…3, another at z 8…11 behind 4 m of rock; floor at layer 0
    const d = {
        get: (x, L, z) => (L >= 1 && L <= 4 && ((z >= 0 && z <= 3) || (z >= 8 && z <= 11)) ? 0 : 3),
        hasChunk: () => true,
    };
    const m = new CaveMemory();
    const eyes = new CaveExplorer(m);
    for (let i = 0; i < 10; i++) eyes.step(d, 0, -0.5, 1.5); // (feet in layer 1)
    assert.ok(m.has(8, 1) && m.has(-8, 2), 'along the tunnel');
    assert.ok(m.has(0, 4), 'its wall');
    assert.ok(!m.has(0, 9) && !m.has(5, 10), 'not through the rock');
    assert.equal(columnLook(d, 0, 1, 1), 0);
    assert.equal(columnLook(d, 0, 6, 1), WALL);
});
