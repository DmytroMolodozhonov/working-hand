import test from 'node:test';
import assert from 'node:assert/strict';
import { floorUnder } from '../../src/game/Levitation.js';

// A hall with a roof: the column's top (surfaceY) is the roof, the floor is the hall's floor.
const hall = { surfaceY: () => 14, groundY: () => 14, groundAt: (x, z, reach) => (reach < 14 ? 0 : 14) };

test('Levitation indoors: the floor under a thing is the hall floor, not the roof (no lift by the throne)', () => {
    assert.equal(floorUnder(hall, 0, 0, 3), 0);
});
test('Levitation: the roof is the floor only for a point above it', () => {
    assert.equal(floorUnder(hall, 0, 0, 20), 14);
});
test('Levitation: without a floor query it falls back to the surface', () => {
    assert.equal(floorUnder({ surfaceY: () => 5 }, 0, 0, 3), 5);
});
