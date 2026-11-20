import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, DistanceCull, CULL } from '../../src/core/DistanceCull.js';

test('decide: hides far behind the haze, shows again with a gap, never the sky-far things', () => {
    assert.equal(decide(100, 45, false), null); // (inside the haze + margin)
    assert.equal(decide(200, 45, false), 'hide');
    assert.equal(decide(45 + CULL.HIDE - 1, 45, false), null);
    assert.equal(decide(45 + CULL.HIDE + 5, 45, true), null); // (stays hidden in the gap)
    assert.equal(decide(45 + CULL.SHOW - 5, 45, true), 'show');
    assert.equal(decide(5000, 45, false), null); // (a planet / the moon: not hidden)
    assert.equal(decide(300, 0, true), 'show');
});

const obj = (x, z, extra = {}) => ({ position: { x, z }, visible: true, userData: {}, name: '', parent: {}, ...extra });

test('walks the scene: hides far ones, shows them back, leaves the owner-hidden and the skipped alone', () => {
    const near = obj(10, 0), far = obj(300, 0), ownerHid = obj(300, 0, { visible: false }), terrain = obj(0, 0, { name: 'terrain' }), noCull = obj(400, 0, { userData: { noCull: true } });
    const light = obj(400, 0, { isLight: true });
    const scene = { children: [near, far, ownerHid, terrain, noCull, light] };
    const c = new DistanceCull();
    c.update(1, scene, 0, 0, 0, 45);
    assert.deepEqual([near.visible, far.visible, ownerHid.visible, noCull.visible, light.visible], [true, false, false, true, true]);
    far.position.x = 20; c.t = 0; c.update(0, scene, 0, 0, 0, 45);
    assert.equal(far.visible, true);
    assert.equal(ownerHid.visible, false, 'never shown by us');
    assert.equal(c.mine.size, 0);
});

test('a throttle: not every frame; and switching off shows all back', () => {
    const far = obj(300, 0), scene = { children: [far] }, c = new DistanceCull();
    c.update(0.1, scene, 0, 0, 0, 45); // (first call checks)
    assert.equal(far.visible, false);
    far.position.x = 10; c.update(0.1, scene, 0, 0, 0, 45); assert.equal(far.visible, false); // (within CHECK_S: not yet)
    c.enabled = false; c.t = 0; c.update(0.1, scene, 0, 0, 0, 45); assert.equal(far.visible, true);
});

test('a shared group at the world origin (trees…) is never hidden by the hero\'s distance from the origin', () => {
    const trees = obj(0, 0, { name: 'trees' }), anon = obj(0, 0), scene = { children: [trees, anon] }, c = new DistanceCull();
    c.update(1, scene, 900, 0, 900, 45);
    assert.deepEqual([trees.visible, anon.visible], [true, true]);
});
