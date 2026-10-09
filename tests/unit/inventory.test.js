import test from 'node:test';
import assert from 'node:assert/strict';
import { pocketStrike, behindBack } from '../../src/game/Inventory.js';

const hist = (ys, step = 50) => ys.map((y, i) => ({ t: i * step, y }));
const at = (x, y) => ({ x, y, z: 0 });

test('pocket: a quick strike down that stops on the hip counts', () => {
    assert.ok(pocketStrike(hist([1.0, 0.85, 0.45, 0.0, -0.05, -0.06]), at(0.7, -0.06), 1));
});

test('pocket: lowering a sword fast and letting it hang does not (no stop on the hip)', () => {
    assert.ok(!pocketStrike(hist([1.0, 0.75, 0.45, 0.15, -0.15]), at(0.7, -0.15), 1));
    // a small quick drop near the hip neither
    assert.ok(!pocketStrike(hist([0.3, 0.2, 0.0, -0.05, -0.05]), at(0.7, -0.05), 1));
});

test('back: over the shoulder and still counts; a fast overhead swing does not', () => {
    assert.ok(behindBack({ x: 0.4, y: 1.8, z: 0.1 }, 0.8));
    assert.ok(!behindBack({ x: 0.4, y: 1.8, z: 0.1 }, 6));
    assert.ok(!behindBack({ x: 0.4, y: 1.8, z: -0.9 }, 0.5)); // raised in front
    assert.ok(!behindBack({ x: 0.7, y: -0.5, z: 0 }, 0.2)); // hanging
});

test('pocket: slowly lowering the hand (holding a sword down) does not', () => {
    assert.ok(!pocketStrike(hist([0.9, 0.85, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0], 120), at(0.7, 0.0), 1));
});

test('pocket: a hand hanging still does not; the other side does not', () => {
    assert.ok(!pocketStrike(hist([0, 0, 0, 0]), at(0.7, 0.0), 1));
    assert.ok(!pocketStrike(hist([0.9, 0.5, 0.0]), at(0.7, 0.0), -1));
});
