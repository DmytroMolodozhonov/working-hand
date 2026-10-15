// The houses' lamps shine (src/game/LanternLights.js): the nearest lamps get the few real lights,
// a row of lanterns side by side is one light, lamps too far away get none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestLamps } from '../../src/game/LanternLights.js';
import { BLOCK } from '../../src/world/Terrain.js';

const world = (lamps) => {
    const m = new Map(lamps.map(([x, L, z, t = BLOCK.LANTERN]) => [x + ',' + L + ',' + z, t]));
    return { get: (x, L, z) => m.get(x + ',' + L + ',' + z) ?? BLOCK.AIR };
};

test('the nearest lamps, one light for lanterns side by side, none far away', () => {
    const data = world([[3, 16, 0], [4, 16, 0], [-6, 16, 2, BLOCK.ARCANE_LAMP], [0, 15, 12], [60, 16, 0]]);
    const got = nearestLamps(data, 0, 10, 0, { n: 3, reach: 22 });
    assert.equal(got.length, 3);
    assert.deepEqual(got.map((l) => [l.x, l.z]), [[3, 0], [-6, 2], [0, 12]]);
    assert.equal(got[1].t, BLOCK.ARCANE_LAMP);
    assert.ok(got[0].y < 16 - 1 && got[0].y > 16 - 2, 'just under the lantern block');
    assert.deepEqual(nearestLamps(data, 0, 10, 0, { n: 1 }).map((l) => l.x), [3]);
});
