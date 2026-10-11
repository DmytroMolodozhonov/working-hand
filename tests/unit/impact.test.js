import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPACT, KD, KD_NAME, classify, fallDir, quadFallDir, segmentBox, headKick, HeadJolt, thunderPush, bodyOf } from '../../src/game/Impact.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

test('classify: nothing / a stagger / off the feet by the speed the blow gives the body', () => {
    assert.equal(classify(2.9), 'none');
    assert.equal(classify(3), 'stagger');
    assert.equal(classify(10.99), 'stagger');
    assert.equal(classify(11), 'knockdown');
    assert.equal(classify(14, { crouch: true }), 'stagger', 'crouching stands firmer');
    assert.equal(classify(15.5, { crouch: true }), 'knockdown');
    assert.equal(classify(30, { dome: true }), 'none');
    assert.equal(classify(30, { blocked: true }), 'stagger', 'a shield holds a spell: felt, never a fall');
    assert.equal(classify(11, { blocked: true }), 'none');
    assert.equal(classify(40, { swim: true }), 'stagger', 'never a knockdown in water');
    assert.equal(classify(3, { frozen: true }), 'shatter');
    assert.equal(classify(2, { frozen: true }), 'none');
});

test('classify: a heavy body gets less speed from the same push; four legs stand firmer', () => {
    const cow = bodyOf('cow'), pig = bodyOf('pig'), knight = bodyOf('knight');
    assert.equal(classify(20, cow), 'stagger', 'a Thunderwave right at a cow only shoves it');
    assert.equal(classify(40, cow), 'knockdown');
    assert.equal(classify(15, pig), 'stagger', '(a pig on four legs)');
    assert.equal(classify(15, bodyOf('person')), 'knockdown', 'the same push throws a person');
    assert.equal(classify(15, knight), 'stagger', 'a knight in armour is heavier');
    assert.equal(classify(5, bodyOf('horse')), 'none', 'a slap does nothing to a horse');
    assert.equal(bodyOf('who knows').mass, 1);
});

test('fallDir: pushed from the front → on the back; zombies face +Z', () => {
    // (impulse x, z; the body's yaw; which way it faces)
    assert.equal(fallDir(0, 1, 0), 'back');
    assert.equal(fallDir(0, -1, 0), 'front');
    assert.equal(fallDir(1, 0, 0), 'right');
    assert.equal(fallDir(-1, 0, 0), 'left');
    assert.equal(fallDir(1, 0, Math.PI / 2), 'back');
    assert.equal(fallDir(0, -1, 0, 1), 'back', 'a zombie looking along +Z pushed from its front');
    assert.equal(fallDir(-1, 0, 0, 1), 'right', '(its right is −X)');
    for (const d of ['left', 'back', 'front', 'right']) assert.equal(KD_NAME[KD[d]], d);
    assert.equal(KD.left, 1, '1 = the old quake roll');
    assert.ok(['left', 'right'].includes(quadFallDir(0, 1, 0)), 'four legs: always on a side');
    assert.equal(quadFallDir(1, 0.2, 0), 'right');
    assert.equal(quadFallDir(-1, 0.2, 0), 'left');
});

test('segmentBox: the swept fist enters a box (one frame is enough, no tunnelling)', () => {
    const h = [0.6, 0.6, 0.6];
    const a = segmentBox([0, 0, -2], [0, 0, 2], h);
    assert.ok(near(a.t, 0.35)); assert.deepEqual(a.n, [0, 0, -1]); assert.equal(a.inside, false);
    assert.ok(near(segmentBox([0, 0, -1], [0, 0, 1], h).t, 0.2));
    assert.equal(segmentBox([0.8, 0, -2], [0.8, 0, 2], h, 0.1), null);
    assert.ok(segmentBox([0.8, 0, -2], [0.8, 0, 2], h, 0.25));
    const inside = segmentBox([0, 0, 0.5], [0, 0, 0.55], h);
    assert.equal(inside.t, 0); assert.equal(inside.inside, true); assert.deepEqual(inside.n, [0, 0, 1]);
});

test('headKick: a jab in the face snaps the head back; a hook turns it; capped', () => {
    const j = headKick([0, 0.1, -0.6], [0, 0, 1], 6);
    assert.ok(j.pitch > 0 && Math.abs(j.yaw) < 1e-9 && Math.abs(j.roll) < 1e-9);
    assert.ok(headKick([0, 0.1, -0.6], [0, 0, 1], 9).pitch > j.pitch);
    const big = headKick([0, 0.1, -0.6], [0, 0, 1], 100);
    assert.ok(Math.hypot(big.pitch, big.yaw, big.roll) <= IMPACT.JOLT_W_MAX + 1e-9);
    const hook = headKick([0.6, 0.1, -0.3], [-1, 0, 0], 6);
    assert.ok(hook.yaw > 0 && hook.roll > 0);
});

test('HeadJolt: the head snaps and comes back, the same at any frame rate', () => {
    const run = (dt) => {
        const J = new HeadJolt();
        J.kick({ pitch: 3.8 });
        let peak = 0, peakT = 0, min = 0, t = 0;
        while (t < 0.9) { J.step(dt); t += dt; if (J.pitch > peak) { peak = J.pitch; peakT = t; } min = Math.min(min, J.pitch); assert.ok(Math.abs(J.pitch) <= IMPACT.JOLT_MAX); }
        return { peak, peakT, min, end: J.pitch, busy: J.busy };
    };
    const a = run(1 / 60);
    assert.ok(a.peak >= 0.15 && a.peak <= 0.35, `peak ${a.peak}`);
    assert.ok(a.peakT >= 0.08 && a.peakT <= 0.2, `at ${a.peakT}`);
    assert.ok(Math.abs(a.end) < 0.02);
    assert.ok(a.min > -0.1, 'it does not swing far past');
    const b = run(1 / 30), c = run(1 / 144);
    assert.ok(Math.abs(b.peak - c.peak) / c.peak < 0.1);
});

test('thunderPush falls off with distance', () => {
    assert.equal(thunderPush(0), 20);
    assert.ok(near(thunderPush(20), 11, 1e-9));
    assert.ok(near(thunderPush(30), 6.5, 1e-9));
    assert.ok(near(thunderPush(40), 2, 1e-9));
});
