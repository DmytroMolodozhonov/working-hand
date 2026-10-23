// Whom I talk to (the author: «быстро посмотрел — вряд ли; иду ли я к нему; может, я ему с 10 метров кричу; толпа не мешает»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Attention } from '../../src/game/Attention.js';

const me = { x: 0, y: 3.4, z: 0 };
const at = (t) => { const d = Math.hypot(t.x, t.z); return { x: t.x / d, y: 0, z: t.z / d }; };
const run = (A, look, beings, s, vel = null) => { for (let i = 0; i < s * 10; i++) A.update(me, look, vel, beings, 0.1, 0); };

test('a glance is not addressing; a steady look at one 10 m off is — over the people nearer by', () => {
    const crowd = [{ id: 'a', x: -1.2, y: 3.3, z: -2.5 }, { id: 'b', x: 1.6, y: 3.3, z: -3 }, { id: 'far', x: 0.3, y: 3.3, z: -10 }];
    const A = new Attention();
    run(A, at(crowd[2]), crowd, 0.2);
    assert.notEqual(A.addressee(), 'far');
    run(A, at(crowd[2]), crowd, 0.6);
    assert.equal(A.addressee(), 'far');
    const B = new Attention();
    run(B, at(crowd[1]), crowd, 0.3);
    assert.equal(B.addressee(), 'b'); // (in a crowd: the one I look at)
});

test('20 m off: a word is not heard, a shout is; walking towards one makes him the one', () => {
    const one = [{ id: 'x', x: 0, y: 3.3, z: -20 }];
    const A = new Attention();
    run(A, { x: 0, y: 0, z: -1 }, one, 1);
    assert.equal(A.addressee(), null);
    assert.equal(A.addressee(null, true), 'x');
    const two = [{ id: 'l', x: -4, y: 3.3, z: -7 }, { id: 'r', x: 4, y: 3.3, z: -7 }];
    const B = new Attention();
    run(B, { x: 0, y: 0, z: -1 }, two, 0.5, { x: 1.1, z: -1.9 }); // (looking ahead, walking towards «r»)
    assert.equal(B.addressee(), 'r');
});

test('nothing is kept of those far away', () => {
    const A = new Attention();
    run(A, { x: 0, y: 0, z: -1 }, [{ id: 'x', x: 0, y: 3.3, z: -5 }], 0.3);
    run(A, { x: 0, y: 0, z: -1 }, [{ id: 'x', x: 0, y: 3.3, z: -500 }], 0.1);
    assert.equal(A.of.size, 0);
});

test('a villager behind a wall is not in sight: he does not notice my look (even when «Visible Godi» shows him); the line is asked a few times a second, not every step', async () => {
    const { inSight } = await import('../../src/game/Attention.js');
    let asked = 0, wall = true;
    const los = () => { asked++; return !wall; };
    const cache = new Map(), v = { id: 'a' };
    assert.equal(inSight(v, los, cache, 0), false, 'a wall between us');
    assert.equal(inSight(v, los, cache, 100), false);
    assert.equal(asked, 1, 'cached for a moment');
    wall = false;
    assert.equal(inSight(v, los, cache, 400), true, 'the wall is gone (I came round it)');
    assert.equal(asked, 2);
});
