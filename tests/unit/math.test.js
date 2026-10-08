import test from 'node:test';
import assert from 'node:assert/strict';
import { OneEuroFilter, createRng, createNoise2D, segmentSegmentDistSq, lerpAngle, wrapAngle, hashString } from '../../src/core/math.js';

test('seeded RNG is deterministic (same world for every player)', () => {
    const a = createRng(42), b = createRng(42), c = createRng(43);
    const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b), sc = Array.from({ length: 5 }, c);
    assert.deepEqual(sa, sb);
    assert.notDeepEqual(sa, sc);
    for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test('noise is deterministic and bounded', () => {
    const n1 = createNoise2D(7), n2 = createNoise2D(7);
    for (let i = 0; i < 100; i++) {
        const x = i * 0.37, z = i * 0.71;
        assert.equal(n1(x, z), n2(x, z));
        assert.ok(Math.abs(n1(x, z)) <= 1.0001);
    }
});

test('OneEuro filter smooths jitter but follows real motion', () => {
    const f = new OneEuroFilter(2.5, 4.0);
    let out = 0;
    // Jitter around 0.5
    for (let i = 0; i < 60; i++) out = f.filter(0.5 + (i % 2 ? 0.01 : -0.01), i / 30);
    assert.ok(Math.abs(out - 0.5) < 0.006, `jitter reduced, got ${out}`);
    // Fast move to 0.9 is followed within a few frames
    for (let i = 60; i < 66; i++) out = f.filter(0.9, i / 30);
    assert.ok(out > 0.85, `follows quickly, got ${out}`);
});

test('segment distance', () => {
    assert.equal(segmentSegmentDistSq([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]), 1);
    assert.equal(segmentSegmentDistSq([0, 0, 0], [2, 0, 0], [1, -1, 0], [1, 1, 0]), 0);
    assert.ok(Math.abs(segmentSegmentDistSq([0, 0, 0], [0, 0, 1], [3, 0, 2], [3, 0, 5]) - 10) < 1e-9);
});

test('angle helpers', () => {
    assert.ok(Math.abs(lerpAngle(3.1, -3.1, 0.5) - Math.PI) < 0.05);
    assert.ok(Math.abs(wrapAngle(Math.PI * 3) - Math.PI) < 1e-9);
    assert.equal(hashString('Карта 2'), hashString('Карта 2'));
});
