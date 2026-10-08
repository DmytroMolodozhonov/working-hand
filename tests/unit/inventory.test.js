import test from 'node:test';
import assert from 'node:assert/strict';
import { pocketStrike } from '../../src/game/Inventory.js';

const hist = (ys, step = 50) => ys.map((y, i) => ({ t: i * step, y }));
const at = (x, y) => ({ x, y, z: 0 });

test('pocket: a quick strike down onto the hip counts', () => {
    assert.ok(pocketStrike(hist([0.9, 0.8, 0.5, 0.2, 0.0]), at(0.7, 0.0), 1));
});

test('pocket: slowly lowering the hand (holding a sword down) does not', () => {
    assert.ok(!pocketStrike(hist([0.9, 0.85, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0], 120), at(0.7, 0.0), 1));
});

test('pocket: a hand hanging still does not; the other side does not', () => {
    assert.ok(!pocketStrike(hist([0, 0, 0, 0]), at(0.7, 0.0), 1));
    assert.ok(!pocketStrike(hist([0.9, 0.5, 0.0]), at(0.7, 0.0), -1));
});
