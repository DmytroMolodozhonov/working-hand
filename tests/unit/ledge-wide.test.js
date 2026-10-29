import test from 'node:test';
import assert from 'node:assert/strict';
import { ledgeWide } from '../../src/game/HillWay.js';

// a floor map: height by "x,z"; everything else is ground at 0
const map = (cells) => (x, z) => cells[`${x},${z}`] ?? 0;
const block = (x0, z0, w, d, h) => { const o = {}; for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) o[`${x},${z}`] = h; return o; };

test('a post 1×1×3 is no ledge: villagers cannot climb it', () => {
    assert.equal(ledgeWide(map(block(5, 5, 1, 1, 3)), 5, 5, 1, 0, 3), false);
});
test('a fence one block thick is no ledge', () => {
    assert.equal(ledgeWide(map(block(5, 0, 1, 10, 3)), 5, 5, 1, 0, 3), false);
});
test('a pillar 2×1 is no ledge from the thin side', () => {
    assert.equal(ledgeWide(map(block(5, 5, 2, 1, 3)), 5, 5, 0, 1, 3), false);
});
test('a step two blocks high, wide and deep, is climbed', () => {
    assert.equal(ledgeWide(map(block(5, 0, 4, 10, 2)), 5, 5, 1, 0, 2), true);
});
test('a crater side: top goes on ahead and to the side — climbed', () => {
    assert.equal(ledgeWide(map(block(5, 3, 3, 3, 3)), 5, 4, 1, 0, 3), true);
});
test('the top that rises higher ahead is a wall, not a ledge', () => {
    assert.equal(ledgeWide(map({ ...block(5, 0, 1, 10, 2), ...block(6, 0, 1, 10, 6) }), 5, 5, 1, 0, 2), false);
});
