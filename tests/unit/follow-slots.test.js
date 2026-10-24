import test from 'node:test';
import assert from 'node:assert/strict';
import { CastleLife } from '../../src/game/CastleLife.js';

function world(n, yaw) {
    const byId = new Map();
    for (let i = 0; i < n; i++) byId.set('k' + i, { id: 'k' + i, dead: false, follow: 'me', job: 'guard', cs: { def: { id: 'c1' } } });
    const fake = { byId, _clock: 10, game: { localId: 'me', character: { group: { rotation: { y: yaw } } }, remotes: new Map() } };
    return fake;
}

test('followers get places of their own round the hero: apart, behind him, not in a heap', () => {
    for (const yaw of [0, 1.2, 3, -2]) {
        const w = world(10, yaw), fp = { x: 100, y: 5, z: 50 };
        const slots = [...w.byId.values()].map((v) => CastleLife.prototype._followSlot.call(w, v, fp));
        for (let i = 0; i < slots.length; i++) {
            const d = Math.hypot(slots[i].x - fp.x, slots[i].z - fp.z);
            assert.ok(d >= 3, `slot ${i} too close: ${d}`);
            const back = [Math.sin(yaw), Math.cos(yaw)];
            const dot = ((slots[i].x - fp.x) * back[0] + (slots[i].z - fp.z) * back[1]) / d;
            assert.ok(dot > -0.45, `slot ${i} is in front of the hero (${dot.toFixed(2)})`);
            for (let j = i + 1; j < slots.length; j++) assert.ok(Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z) >= 1.4, `slots ${i} and ${j} too close`);
        }
    }
});

test('a lone follower, or one with no heading, still has a sane place', () => {
    const one = world(1, 0), fp = { x: 0, y: 0, z: 0 };
    assert.deepEqual(CastleLife.prototype._followSlot.call(one, one.byId.get('k0'), fp), fp);
    const w = world(6, undefined);
    w.game.character = null;
    const s = [...w.byId.values()].map((v) => CastleLife.prototype._followSlot.call(w, v, fp));
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) assert.ok(Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z) >= 1.4);
});
