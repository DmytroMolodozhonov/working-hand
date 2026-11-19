import test from 'node:test';
import assert from 'node:assert/strict';
import { gazeAt, GAZE } from '../../src/game/TravelerGaze.js';

const mk = (id, over = {}) => ({ id, x: 0, z: 0, yaw: 0, ahead: 0, driver: false, ...over });

test('a stranger within sight: he is looked at and watched (alert when near)', () => {
    const p = mk('a'), g = gazeAt(p, 10, [{ x: 0, z: -12 }]);
    assert.deepEqual([g.x, g.z, g.alert], [0, -12, true]);
    const f = gazeAt(mk('b'), 10, [{ x: 0, z: -30 }]);
    assert.equal(f.alert, false); assert.equal(f.z, -30); // (seen, not yet watched closely)
});

test('a stranger far or right behind a far man is not noticed', () => {
    assert.equal(gazeAt(mk('c'), 10, [{ x: 0, z: -80 }])?.alert ?? false, false);
    const g = gazeAt(mk('d'), 10, [{ x: 0, z: 30 }]); // (behind: yaw 0 faces −z)
    assert.ok(!g || g.z !== 30);
});

test('the look is held a moment after the stranger leaves, then scanning goes on', () => {
    const p = mk('e');
    gazeAt(p, 10, [{ x: 5, z: -10 }]);
    const held = gazeAt(p, 10 + GAZE.HOLD_S * 0.5, []);
    assert.equal(held.x, 5);
    const later = gazeAt(p, 10 + GAZE.HOLD_S + 0.2, []);
    assert.ok(later === null || later.x !== 5);
});

test('scanning: the head really moves over time (several different directions), within the head turn', () => {
    const p = mk('f'), seen = new Set();
    for (let t = 0; t < 60; t += 0.25) { const g = gazeAt(p, t, []); if (g) { seen.add(Math.round(g.x)); const a = Math.atan2(-g.x, -g.z); assert.ok(Math.abs(a) <= GAZE.SIDE + 1e-6, 'within ' + a); } }
    assert.ok(seen.size >= 5, 'sweeps differ: ' + seen.size);
});

test('two people with different ids do not turn together', () => {
    const a = mk('p1'), b = mk('p2'); let same = 0, n = 0;
    for (let t = 0; t < 40; t += 0.5) { const x = gazeAt(a, t, []), y = gazeAt(b, t, []); n++; if ((x && y && Math.round(x.x) === Math.round(y.x)) || (!x && !y)) same++; }
    assert.ok(same / n < 0.7);
});
