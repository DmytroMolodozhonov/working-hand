import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LegReader } from '../../src/input/LegReader.js';
import { StepReader } from '../../src/input/StepReader.js';
import { frame } from '../e2e/poses.mjs';

/**
 * Feeds a walk at 30 FPS: `pattern(t)` gives the frame options at time t (ms).
 * Returns what the step reader said on every frame.
 */
function run(pattern, ms, { crouch = () => false } = {}) {
    const legs = new LegReader(), steps = new StepReader();
    const out = [];
    for (let t = 0; t <= ms; t += 33) {
        const lm = frame(pattern(t)).poseLandmarks;
        const r = steps.read(legs.read(lm, t), (lm[11].y + lm[12].y) / 2, crouch(t), t);
        out.push({ t, ...r });
    }
    return out;
}

/** Steps on the spot: one leg up for `up` ms every `period` ms, the legs taking turns. */
const stepping = (period, up = period * 0.45, extra = {}) => (t) => {
    const n = Math.floor(t / period), lifted = t - n * period < up;
    const side = n % 2 ? 'right' : 'left';
    return { arms: 'hang', legs: { left: lifted && side === 'left' ? 'up' : 'stand', right: lifted && side === 'right' ? 'up' : 'stand' }, ...extra };
};
const at = (out, t) => out.find((o) => o.t >= t);

test('slow steps on the spot: walking (slow), and it stops soon after the last step', () => {
    const walk = stepping(800);
    const out = run((t) => (t < 4000 ? walk(t) : { arms: 'hang', legs: { left: 'stand', right: 'stand' } }), 6000);
    assert.equal(at(out, 300).isRunning, false); // (one leg up: not yet)
    assert.equal(at(out, 1000).isRunning, true); // (the second leg: walking)
    assert.ok(out.filter((o) => o.t > 1000 && o.t < 4000).every((o) => o.isRunning), 'no stutter between steps');
    assert.ok(at(out, 3500).runIntensity < 0.25, 'a slow step walks');
    assert.equal(at(out, 5300).isRunning, false); // (stopped stepping: stops, no long coast)
});

test('quick steps: running', () => {
    const out = run(stepping(250), 3000);
    assert.equal(at(out, 2900).isRunning, true);
    assert.ok(at(out, 2900).runIntensity > 0.8, `quick steps run (${at(out, 2900).runIntensity})`);
});

test('legs seen standing, the shoulders bobbing: not walking', () => {
    const out = run((t) => ({ arms: 'hang', legs: { left: 'stand', right: 'stand' }, bob: Math.floor(t / 33) % 2 ? 0.02 : -0.02 }), 2000);
    assert.ok(out.every((o) => !o.isRunning));
});

test('one leg kicked again and again (or a stomp): no step', () => {
    const out = run((t) => ({ arms: 'hang', legs: { left: t % 600 < 250 ? 'up' : 'stand', right: 'stand' } }), 3000);
    assert.ok(out.every((o) => !o.isRunning));
});

test('crouching: no steps', () => {
    const out = run(stepping(400), 3000, { crouch: () => true });
    assert.ok(out.every((o) => !o.isRunning));
});

test('a close camera, seen to the hips: the knees lifted into the picture walk', () => {
    const out = run(stepping(500, 250, { scale: 1.3 }), 3000);
    assert.equal(at(out, 2500).isRunning, true);
    assert.ok(at(out, 2500).steps, 'from the knees, not the bob');
});

test('no legs to read at all: the body bobbing from the steps still walks', () => {
    const out = run((t) => ({ arms: 'hang', bob: Math.floor(t / 33) % 2 ? 0.02 : -0.02 }), 1500); // (the knees at the hips: not readable)
    assert.equal(at(out, 1000).isRunning, true);
});
