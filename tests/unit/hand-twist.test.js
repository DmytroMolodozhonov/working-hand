import test from 'node:test';
import assert from 'node:assert/strict';
import { SimplifiedHand } from '../../src/entities/SimplifiedHand.js';
import { makeHand } from './tracking.test.js';

/** A hand turned by `rot` (rad) round the wrist, in the image plane; `mirror` = seen from the back. */
function turned(rot, mirror = false, noise = 0) {
    const lm = makeHand(0.5, 0.6, 0.12);
    const w = lm[0];
    return lm.map((p) => {
        let x = p.x - w.x, y = p.y - w.y;
        if (mirror) x = -x;
        const c = Math.cos(rot), s = Math.sin(rot);
        return { x: w.x + x * c - y * s + (Math.random() - 0.5) * noise, y: w.y + x * s + y * c + (Math.random() - 0.5) * noise, z: 0 };
    });
}

test('hand: a few glitchy frames of a turned-over hand do not flip the palm', () => {
    const h = new SimplifiedHand('right');
    let t = 1000;
    for (let i = 0; i < 20; i++) h.update(turned(0), 0, (t += 33));
    const steady = h.targetState.wristTwist;
    // 4 glitch frames (the knuckles «swap sides»), then the hand is seen right again
    for (let i = 0; i < 4; i++) h.update(turned(0, true), 0, (t += 33));
    for (let i = 0; i < 5; i++) h.update(turned(0), 0, (t += 33));
    const d = Math.abs(Math.atan2(Math.sin(h.targetState.wristTwist - steady), Math.cos(h.targetState.wristTwist - steady)));
    assert.ok(d < 0.5, `no flip (moved ${d.toFixed(2)} rad)`);
});

test('hand: a lost hand keeps its turn (does not roll over)', () => {
    const h = new SimplifiedHand('right');
    let t = 1000;
    for (let i = 0; i < 20; i++) h.update(turned(0.6), 0, (t += 33));
    const tw = h.targetState.wristTwist;
    for (let i = 0; i < 200; i++) h.update(null, 0, (t += 33)); // ~6.6 s without the hand
    assert.ok(Math.abs(h.targetState.wristTwist - tw) < 1e-6, 'the wrist turn is kept');
});

test('hand: a slow real turn is followed', () => {
    const h = new SimplifiedHand('right');
    let t = 1000;
    for (let i = 0; i < 10; i++) h.update(turned(0), 0, (t += 33));
    const a0 = h.targetState.wristTwist;
    for (let i = 0; i <= 30; i++) h.update(turned(i * 0.03), 0, (t += 33)); // 0.9 rad over 1 s
    const d = Math.abs(h.targetState.wristTwist - a0);
    assert.ok(d > 0.6, `followed (${d.toFixed(2)} rad)`);
});
