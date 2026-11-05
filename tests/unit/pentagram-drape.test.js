/**
 * A pentagram's lines lie on the ground NEAR the circle's level (the author's shot 05.11: by a house its lines ran up the walls and over
 * the roofs — the top of each column was taken). Pentagranium.surfaceNear.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceNear, PENT_DRAPE } from '../../src/game/Pentagranium.js';

// the ground: top solid layer 10 (surface y 9.5); a house over x ≥ 5 (walls up to layer 18), a step at x = −3 (layer 11), a pit at x = −6 (layer 7)
const world = { solidIn(ix, iz, L0, L1) {
    const top = ix >= 5 ? 18 : ix === -3 ? 11 : ix === -6 ? 7 : ix === -8 ? 2 : 10;
    return L0 <= top && L1 >= L0;
} };

test('the line follows the land near the circle, never up a house', () => {
    assert.equal(surfaceNear(world, 0, 0, 9.5), 9.5, 'flat ground');
    assert.equal(surfaceNear(world, 6, 0, 9.5), 9.5, 'a house wall: the line stays on the circle\'s plane, not on the roof (17.5)');
    assert.equal(surfaceNear(world, -3, 0, 9.5), 10.5, 'a step up: followed');
    assert.equal(surfaceNear(world, -6, 0, 9.5), 6.5, 'a hollow 3 blocks deep: followed');
    assert.equal(surfaceNear(world, -8, 0, 9.5), 9.5, 'a deep pit: flat over it');
    assert.ok(PENT_DRAPE.UP >= 1 && PENT_DRAPE.DOWN >= 1);
});
