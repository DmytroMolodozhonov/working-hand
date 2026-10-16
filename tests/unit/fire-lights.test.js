import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNearest } from '../../src/game/FireLights.js';

test('fire lights: the nearest fires keep the lights, fires side by side share one', () => {
    const slots = Array.from({ length: 3 }, () => ({}));
    let n = 0;
    for (const [x, d] of [[0, 10], [1, 9], [10, 5], [20, 30], [30, 1], [40, 7]]) n = pickNearest(slots, n, 3, x, 0, 0, 1, d);
    assert.equal(n, 3);
    assert.deepEqual(slots.map((s) => s.x), [30, 10, 40]);
    n = pickNearest(slots, n, 3, 30.5, 0, 0, 1.5, 1.2); // (next to the nearest: merges, the stronger wins)
    assert.equal(slots[0].p, 1.5);
});
