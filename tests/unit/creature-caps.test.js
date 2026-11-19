import test from 'node:test';
import assert from 'node:assert/strict';
import { overflow, CAPS } from '../../src/game/CreatureCaps.js';

test('caps: the farthest calm extras go, the near ones stay', () => {
    const l = [{ d: 10 }, { d: 300 }, { d: 50 }, { d: 500, busy: true }];
    const out = overflow(l, 2, (x) => x.d, (x) => !x.busy);
    assert.deepEqual(out.map((x) => x.d), [300, 50]);
    assert.deepEqual(overflow(l, 4, (x) => x.d), []);
    assert.ok(CAPS.owl >= 1 && CAPS.phoenix >= 1);
});
