// A friend's body on my screen (RemoteAvatar + RemoteTwist.js): the body and legs turn the short way round, and are never
// left facing away from the head — whatever the stream of poses (turn through ±180°, a stop after a run, lost packets, jitter).
import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapPi, stepAngle, neckLimit, TWIST } from '../../src/net/RemoteTwist.js';

const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ width: 10 })), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
const THREE = await import('three');
const { VoxelCharacter } = await import('../../src/entities/Character.js');
const { RemoteAvatar } = await import('../../src/net/RemoteAvatar.js');

test('angles: wrap into [−π, π], step the short way, bad numbers do no harm', () => {
    assert.ok(Math.abs(wrapPi(3 * Math.PI) - Math.PI) < 1e-9 || Math.abs(wrapPi(3 * Math.PI) + Math.PI) < 1e-9);
    assert.equal(wrapPi(NaN), 0);
    assert.ok(stepAngle(3.0, -3.0, 0.5) > 3.0, '3.0 → −3.0 goes up through π (0.28 rad), not down through 0');
    assert.ok(Math.abs(wrapPi(stepAngle(3.0, -3.0, 1) - -3.0)) < 1e-9);
    assert.deepEqual(neckLimit(1), { turn: 0, head: 1 });
    const n = neckLimit(3);
    assert.ok(Math.abs(n.head - TWIST.MAX) < 1e-9 && Math.abs(n.turn - (3 - TWIST.MAX)) < 1e-9);
    assert.ok(neckLimit(-3).turn < 0);
});

function rig() {
    const scene = new THREE.Scene();
    const src = new VoxelCharacter(scene); src.setShowHands(true); src.setHandVersion('v4'); src.update(1 / 60, null, false);
    const base = src.serializePose();
    const ra = new RemoteAvatar(scene, 'f1', 'Друг', 0);
    const lines = [];
    ra.log = (t) => lines.push(t);
    const twist = () => Math.abs(wrapPi(ra.character.head.rotation.y));
    const feed = (s, n = 1) => { for (let i = 0; i < n; i++) { ra.applyState({ s: { ...base, ...s } }); ra.update(1 / 60); } };
    return { ra, feed, twist, lines };
}

test('streams of poses: the head never ends up turned back from the body; turns go the short way', () => {
    const { ra, feed, twist } = rig();
    feed({ p: [0, 2, 0], ry: 0, hy: 0, hp: 0, run: -1 }, 20);
    let worst = 0;
    const watch = (s, n) => { for (let i = 0; i < n; i++) { feed(s); worst = Math.max(worst, twist()); } };
    watch({ ry: 3.0, hy: 0, run: -1 }, 120); // about-face in place, body only
    watch({ ry: -3.0, hy: 0, run: -1 }, 120); // across ±π
    watch({ ry: 1000 * 0 + 12.5, hy: 0.2, run: 1 }, 90); // an unwrapped body angle, running
    watch({ ry: 12.5, hy: 0, run: -1 }, 60); // a stop
    watch({ ry: 0.1, hy: 3.1, run: -1 }, 120); // the head far round, the body not following (the sender's camera lost the body)
    assert.ok(twist() <= TWIST.MAX + 0.02, 'at rest the head is within the neck limit: ' + twist());
    // the body comes round toward where the head looks
    const bodyToHead = Math.abs(wrapPi(ra.character.group.rotation.y + ra.character.head.rotation.y - 3.2));
    assert.ok(bodyToHead < 0.05, 'the head still looks where it was sent: ' + bodyToHead);
    // lost packets: nothing new for 2 s, then the next one far away
    for (let i = 0; i < 120; i++) { ra.update(1 / 60); worst = Math.max(worst, twist()); }
    watch({ ry: -2.9, hy: -0.1, run: -1 }, 120);
    assert.ok(twist() < 0.3);
});

test('a head sent across ±π does not spin the long way, and a jitter around it stays small', () => {
    const { ra, feed } = rig();
    feed({ p: [0, 2, 0], ry: 3.1, hy: 3.1, run: -1 }, 40);
    let maxStep = 0, prev = ra.character.head.rotation.y;
    for (let i = 0; i < 60; i++) {
        feed({ ry: 3.1, hy: i % 2 ? 3.1 : -3.1, run: -1 });
        const h = ra.character.head.rotation.y;
        maxStep = Math.max(maxStep, Math.abs(wrapPi(h - prev))); prev = h;
    }
    assert.ok(maxStep < 0.5, 'no spin: ' + maxStep);
});

test('a head turned back from the body writes one line in ten seconds', () => {
    const { feed, lines } = rig();
    feed({ p: [0, 2, 0], ry: 0, hy: 3.0, run: -1 }, 60 * 12);
    assert.ok(lines.length >= 1 && lines.length <= 2, 'lines: ' + lines.length);
    assert.match(lines[0], /^ноги назад: f1/);
});
