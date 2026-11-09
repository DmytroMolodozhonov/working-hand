import test from 'node:test';
import assert from 'node:assert/strict';
import { AimShake } from '../../src/game/AimShake.js';

test('wand direction is measured independently of its wrist position; intentional turns are excluded', () => {
    const still = new AimShake(), jitter = new AimShake(), turning = new AimShake(), tracking = new AimShake();
    for (let i = 0; i < 180; i++) {
        const a = (i % 2 ? 2 : -2) * Math.PI / 180, turn = i / 60 * Math.PI;
        still.step(0, 0, 1, 1 / 60);
        jitter.step(Math.sin(a), 0, Math.cos(a), 1 / 60);
        turning.step(Math.sin(turn), 0, Math.cos(turn), 1 / 60);
        const slow = i / 60 * 0.2;
        tracking.step(Math.sin(slow), 0, Math.cos(slow), 1 / 60);
    }
    assert.ok(still.take().degrees < 0.001);
    const s = jitter.take();
    assert.ok(s.degrees > 1.8 && s.degrees < 2.2); assert.ok(s.jump > 3.9);
    assert.equal(jitter.take().n, 0);
    assert.ok(turning.take().n < 4, 'a smooth deliberate turn is not logged as jitter');
    assert.ok(tracking.take().n < 30, 'careful tracking of a moving target is not logged as jitter either');
});

test('tracking loss and a long pause reset old aim rather than accumulating it into the next life/window', () => {
    const meter = new AimShake();
    meter.step(0, 0, 1, 1 / 60); meter.step(1, 0, 0, 1 / 60);
    meter.reset(); meter.step(1, 0, 0, 1 / 60);
    assert.equal(meter.take().n, 0);
    meter.step(0, 0, 1, 1);
    assert.equal(meter.on, false);
    meter.step(NaN, 0, 1, 1 / 60);
    assert.equal(meter.on, false);
});
