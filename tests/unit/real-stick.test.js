/**
 * A real stick in the real hand (RealStick.js): which hand it is in, believed only
 * when seen steadily, and its 3D direction from the picture's 2D one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSticks, StickTracker, stickDirection } from '../../src/input/RealStick.js';

const lmAt = (x, y) => [{ x, y, z: 0 }];

test('real stick: it belongs to the hand whose wrist it came with; a stick by no hand is nobody\'s', () => {
    const s1 = { wrist: [0.3, 0.6], dir: [0, -1], out: 2, conf: 0.8 };
    const s2 = { wrist: [0.7, 0.62], dir: [1, 0], out: 2, conf: 0.8 };
    const far = { wrist: [0.5, 0.1], dir: [1, 0], out: 2, conf: 0.9 };
    const m = matchSticks([s1, s2, far], lmAt(0.71, 0.6), lmAt(0.3, 0.61));
    assert.equal(m.right, s1);
    assert.equal(m.left, s2);
    assert.deepEqual(matchSticks([far], lmAt(0.71, 0.6), null), { left: null, right: null });
    assert.deepEqual(matchSticks(undefined, lmAt(0.71, 0.6), null), { left: null, right: null });
});

test('real stick: believed when seen for a moment (several pictures), not from a weak or a single glimpse; kept over a short miss, then let go', () => {
    const tr = new StickTracker();
    const s = { wrist: [0.3, 0.6], dir: [0, -1], out: 2, conf: 0.8 };
    let t = 0;
    assert.equal(tr.update(s, (t += 33)), null);
    assert.equal(tr.update(s, (t += 16), false), null, 'the same picture drawn again does not count');
    assert.equal(tr.update(s, (t += 33)), null);
    assert.ok(tr.update(s, (t += 33)), 'seen three times');
    const g = new StickTracker();
    assert.equal(g.update(s, (t += 33)), null);
    assert.equal(g.update(null, (t += 33)), null, 'a glimpse, then nothing');
    assert.equal(g.update(s, (t += 33)), null, 'a new glimpse starts over');
    assert.ok(tr.update(null, (t += 200)), 'a short miss: still there');
    assert.equal(tr.update(null, (t += 300)), null, 'gone');
    const weak = new StickTracker();
    for (let i = 0; i < 10; i++) assert.equal(weak.update({ ...s, conf: 0.3 }, (t += 33)), null, 'an unsure line is never a stick');
});

test('real stick: a quick turn is followed at once, a still stick stays still', () => {
    const tr = new StickTracker();
    let t = 0;
    for (let i = 0; i < 5; i++) tr.update({ wrist: [0, 0], dir: [0, -1], out: 2, conf: 0.8 }, (t += 33));
    // jitter of ±1°: barely moves
    const a = tr.update({ wrist: [0, 0], dir: [Math.sin(0.017), -Math.cos(0.017)], out: 2, conf: 0.8 }, (t += 33));
    assert.ok(Math.abs(Math.atan2(a.dx, -a.dy)) < 0.012);
    // a real 30° turn: there within two pictures
    const b1 = tr.update({ wrist: [0, 0], dir: [Math.sin(0.52), -Math.cos(0.52)], out: 2, conf: 0.8 }, (t += 33));
    const b2 = tr.update({ wrist: [0, 0], dir: [Math.sin(0.52), -Math.cos(0.52)], out: 2, conf: 0.8 }, (t += 33));
    assert.ok(Math.abs(Math.atan2(b1.dx, -b1.dy) - 0.52) < 0.05, `first picture ${Math.atan2(b1.dx, -b1.dy)}`);
    assert.ok(Math.abs(Math.atan2(b2.dx, -b2.dy) - 0.52) < 0.01);
});

test('real stick: the 3D direction from the picture — across the picture exact, its depth from how short it looks and the fingers', () => {
    let rnd = 11;
    const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    let worst = 0, worstNoLen = 0;
    for (let i = 0; i < 300; i++) {
        // a real direction (hero's space; mostly ahead — at the camera — as wands are pointed)
        const D = new THREE.Vector3(r(), r(), -Math.abs(r()) - 0.2).normalize();
        const across = Math.hypot(D.x, D.y);
        if (across < 0.25) continue; // (end-on: the picture sees no line — no stick then)
        const s = { dx: -D.x / across, dy: -D.y / across, out: 3 * across, outMax: 3 };
        // the fingers' pen direction: the real one off by up to ~20°
        const finger = D.clone().add(new THREE.Vector3(r(), r(), r()).multiplyScalar(0.2)).normalize();
        const got = stickDirection(s, finger);
        const pic = new THREE.Vector2(-got.x, -got.y).normalize();
        assert.ok(Math.abs(pic.angle() - new THREE.Vector2(s.dx, s.dy).angle()) < 1e-6 || Math.abs(Math.abs(pic.angle() - new THREE.Vector2(s.dx, s.dy).angle()) - 2 * Math.PI) < 1e-6, 'across the picture: exactly the seen line');
        worst = Math.max(worst, got.angleTo(D));
        // its length not known yet (outMax small): the fingers' depth alone
        const got2 = stickDirection({ ...s, outMax: 0 }, finger);
        worstNoLen = Math.max(worstNoLen, got2.angleTo(D));
    }
    assert.ok(worst < 0.3, `worst ${(worst * 180 / Math.PI).toFixed(0)}°`);
    assert.ok(worstNoLen < 0.45, `without the length: worst ${(worstNoLen * 180 / Math.PI).toFixed(0)}°`);
});
