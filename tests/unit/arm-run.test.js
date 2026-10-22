// Running with the arms (ArmPump.js): up to +40% while the legs run; and running, nothing leaves the hand (HandRelease.holdsFast).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArmPump, ARM_RUN } from '../../src/game/ArmPump.js';
import { holdsFast, RUN_HOLD_MS } from '../../src/game/HandRelease.js';
import { bodyPlaces } from '../../src/input/PoseInterpreter.js';
import { frame } from '../e2e/poses.mjs';

/** s seconds of swings: each hand's forward-up speed a·sin(2π·f·t + phase) (+ jitter). */
function swing(p, { s = 3, f = 1.6, aL = 6, aR = 6, phase = Math.PI, running = true, jitter = 0, dt = 1 / 60 } = {}) {
    const out = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * jitter;
    for (let t = 0; t < s; t += dt) {
        const vL = aL * Math.sin(2 * Math.PI * f * t), vR = aR * Math.sin(2 * Math.PI * f * t + phase);
        // (forward and up: −z and +y, half each)
        out.push(p.update(dt, { x: rnd(), y: vL / 2 + rnd(), z: -vL / 2 + rnd() }, { x: rnd(), y: vR / 2 + rnd(), z: -vR / 2 + rnd() }, running));
    }
    return out;
}

test('ArmPump: a runner\'s arms in turn, the legs running — faster up to +40%, growing smoothly', () => {
    const p = new ArmPump();
    const b = swing(p, { aL: 10, aR: 10 });
    assert.ok(p.pumping, 'pumping');
    assert.ok(Math.abs(b.at(-1) - ARM_RUN.MAX) < 1e-6, 'fast wide swings: all of +40% ' + b.at(-1));
    for (let i = 1; i < b.length; i++) assert.ok(Math.abs(b[i] - b[i - 1]) <= ARM_RUN.RATE / 60 + 1e-9, 'no jump in the speed');
    assert.ok(b.every((x) => x <= ARM_RUN.MAX + 1e-9), 'never more than 40%');
    // slower, smaller swings: less
    const q = new ArmPump();
    const slow = swing(q, { aL: 4, aR: 4 }).at(-1);
    assert.ok(slow > 0.02 && slow < ARM_RUN.MAX - 0.1, 'slower arms: a smaller bonus ' + slow);
    // the legs stop: it fades smoothly to nothing
    const f = swing(p, { aL: 10, aR: 10, running: false, s: 1 });
    assert.ok(f[0] > 0.3 && f.at(-1) < 0.01, 'fades after the legs stop');
});

test('ArmPump: the arms without the legs, one arm, both arms together, a jittery camera — nothing', () => {
    assert.equal(swing(new ArmPump(), { aL: 10, aR: 10, running: false }).at(-1), 0, 'the arms without the legs');
    assert.equal(swing(new ArmPump(), { aL: 10, aR: 0 }).at(-1), 0, 'one arm waving');
    assert.equal(swing(new ArmPump(), { aL: 10, aR: 10, phase: 0 }).at(-1), 0, 'both arms together (a stroke, a two-hand spell)');
    const j = new ArmPump();
    assert.equal(swing(j, { aL: 0, aR: 0, jitter: 1.5 }).at(-1), 0, 'the camera\'s jitter');
    assert.equal(j.pumping, false);
    // one throw (wind-up back, swing forward; the other arm goes back meanwhile) is no pumping
    const t = new ArmPump();
    for (let i = 0; i < 60; i++) {
        const k = i < 15 ? -4 : i < 25 ? 12 : 0;
        t.update(1 / 60, { x: 0, y: -k / 4, z: k / 4 }, { x: 0, y: k / 2, z: -k / 2 }, true);
        assert.equal(t.pumping, false, 'a throw, frame ' + i);
    }
});

test('running and working the arms, the wand and things never leave the hand — a throw only once stopped', () => {
    const ch = { isRunning: true, runIntensity: 0.4, armPump: { pumping: true } };
    assert.equal(holdsFast(ch, 1000), true, 'the arms pumping');
    ch.armPump.pumping = false; ch.runIntensity = 0.9;
    assert.equal(holdsFast(ch, 1100), true, 'running really fast');
    ch.isRunning = false; ch.runIntensity = 0;
    assert.equal(holdsFast(ch, 1100 + RUN_HOLD_MS / 2), true, 'the arms still swinging just after');
    assert.equal(holdsFast(ch, 1100 + RUN_HOLD_MS + 10), false, 'stopped: a real throw works again');
    assert.equal(holdsFast({ isRunning: true, runIntensity: 0.3, armPump: { pumping: false } }, 1000), false, 'walking: as always');
});

test('the right pocket for the left hand: a little higher than the hip joint counts too', () => {
    const f = frame({ arms: 'hang', pocket: 'cross' });
    const lm = f.poseLandmarks, T = lm[24].y - lm[11].y;
    for (const dy of [0, -0.2, -0.4]) {
        const l = lm.map((p) => ({ ...p }));
        const d = lm[24].y + dy * T - lm[15].y;
        l[15].y += d; l[13].y += d * 0.6;
        assert.equal(bodyPlaces(l, null, null, 4 / 3, false).pocket.off, true, 'the wrist ' + dy + ' torso above the hip');
    }
});
