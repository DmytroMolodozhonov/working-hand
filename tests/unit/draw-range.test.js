import test from 'node:test';
import assert from 'node:assert/strict';
import { drawRange, drawLevel, DRAW } from '../../src/game/DrawRange.js';

test('is as far as the land (+ a margin), never less than MIN, never past the camera', () => {
    assert.equal(drawRange(600), 600 + DRAW.MARGIN);
    assert.equal(drawRange(50), DRAW.MIN);
    assert.equal(drawRange(NaN), DRAW.MIN);
    assert.equal(drawRange(5000), DRAW.CAM_FAR);
});
test('a mage 150 / 300 / 600 m away on the highest setting is drawn', () => {
    const range = drawRange(90 * 3 + 32 + 400);
    for (const d of [150, 300, 600]) assert.notEqual(drawLevel(d, range), 'none');
});
test('levels: near, one merged shape, distant; a fighter stays whole; beyond the land — none', () => {
    assert.equal(drawLevel(20, 500), 'near');
    assert.equal(drawLevel(80, 500), 'far');
    assert.equal(drawLevel(300, 500), 'distant');
    assert.equal(drawLevel(300, 500, { foe: true }), 'near');
    assert.equal(drawLevel(500, 500), 'none');
});
