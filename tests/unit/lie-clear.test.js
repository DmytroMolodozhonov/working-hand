// A knocked-down body lying with its head in a crater wall slides out of it (LieClear.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lieClearPush } from '../../src/game/LieClear.js';

test('clear ground: nothing to do', () => {
    assert.equal(lieClearPush(() => false, 0, 0, 0, 1, 0, 3.4), null);
});

test('a wall where the head lies: pushed back along the body, away from the wall', () => {
    const wall = (ix) => ix >= 3; // (a wall from x = 3 on)
    const p = lieClearPush((ix) => wall(ix), 0, 0, 0, 1, 0, 3.4);
    assert.ok(p && p.x < -0.99 && Math.abs(p.z) < 1e-6, JSON.stringify(p));
});

test('a wall beyond the body\'s length does not move it', () => {
    assert.equal(lieClearPush((ix) => ix >= 6, 0, 0, 0, 1, 0, 3.4), null);
});

test('only the layer over the floor counts (a roof high over the body is not a wall)', () => {
    assert.equal(lieClearPush((ix, iz, layer) => layer > 3, 0, 0, 0, 0, 1, 3.4), null);
});
