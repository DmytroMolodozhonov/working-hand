/**
 * Hand → drawn hand latency (and steadiness). The whole chain a hand's 21 points go
 * through (stabilizer → interpreter → blending → arm solver → the hand model) on a
 * simulated clock: the camera gives 30 results a second, the game draws 60 frames
 * (tests/unit/hand-latency.mjs).
 *
 * Measured when this test was written (camera jitter 0.002 of the picture):
 *   a sudden wrist bend  — before 167 ms (10 drawn frames), after 17 ms (1 frame)
 *   a fast turn (120 ms) — before 130 ms after the move,   after ≤ 30 ms
 *   fingers closing      — before 50 ms,                   after 17 ms
 *   a still hand's jitter (the palm's turn between frames) — the same as before
 * Taking a thing must not wait for the hand: if a change makes it trail again, this fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { measure, jitter, rot } from './hand-latency.mjs';

const N = 0.002; // (the network's jitter, in picture units)

test('hand latency: a sudden wrist bend — the drawn palm is there within 3 drawn frames', (t) => {
    for (const side of ['right', 'left']) {
        const r = measure({ R1: rot(-1.0, 0, 0), noise: N, side });
        t.diagnostic(`${side}: ${r.turnMs.toFixed(0)} ms (${r.turnFrames} frames), ${r.total.toFixed(2)} rad`);
        assert.ok(r.total > 0.6, 'the palm really turned');
        assert.ok(r.turnFrames <= 3, `the palm trails the hand by ${r.turnMs.toFixed(0)} ms`); // (1 frame before the anti-tremble filters; 3 now)
    }
});

test('hand latency: a fast real turn (120 ms, the palm turned aside) — the palm follows within 50 ms after the move', (t) => {
    const r = measure({ R1: rot(0, 1.4, 0), moveMs: 120, noise: N });
    t.diagnostic(`${r.turnMs.toFixed(0)} ms, ${r.total.toFixed(2)} rad`);
    assert.ok(r.total > 1, 'the palm really turned');
    assert.ok(r.turnMs <= 50, `the palm trails the hand by ${r.turnMs.toFixed(0)} ms`);
});

test('hand latency: a slow turn (2 s) is followed too (no more than ~0.25 s behind half-way)', (t) => {
    const r = measure({ R1: rot(0, 1.4, 0), moveMs: 2000, noise: N });
    t.diagnostic(`half-way ${r.midMs.toFixed(0)} ms late`);
    assert.ok(r.midMs < 280, `the palm trails a slow turn by ${r.midMs.toFixed(0)} ms`);
});

test('hand latency: fingers closing fast (100 ms) — the drawn finger joints follow within 3 frames', (t) => {
    const r = measure({ R1: rot(0, 0, 0), b0: 0, b1: 1.2, moveMs: 100, noise: N });
    t.diagnostic(`${r.bendMs?.toFixed(0)} ms, ${r.bendTotal.toFixed(2)} rad`);
    assert.ok(r.bendTotal > 0.6, 'the finger really bent');
    assert.ok(r.bendMs <= 51, `the finger trails by ${r.bendMs} ms`);
});

test('hand steadiness: a still hand with the camera\'s jitter stays as steady as before (no shaking)', (t) => {
    const j = jitter(N), j5 = jitter(0.005);
    t.diagnostic(`palm ${j.step.toFixed(4)} rad/frame (strong jitter ${j5.step.toFixed(4)}), finger ${j.finger.toFixed(4)}`);
    // (the old chain: 0.0083 and 0.0176 rad a drawn frame; now ~0.0064 and ~0.016)
    assert.ok(j.step < 0.007, `the palm shakes ${j.step.toFixed(4)} rad a frame`);
    assert.ok(j5.step < 0.025, `the palm shakes ${j5.step.toFixed(4)} rad a frame with a strong jitter`);
    assert.ok(j.finger < 0.02, `the fingers shake ${j.finger.toFixed(4)} rad a frame`);
});

test('hand steadiness with a real webcam\'s noise (640×480: the picture ±0.002, the depth ±0.006, the arm too): the still hand doesn\'t tremble', (t) => {
    const real = { noise: 0.002, zNoise: 0.006, poseNoise: 0.002, size: 0.08 };
    for (const [name, R0] of [['fingers up', rot(0, 0, 0)], ['fingers at the camera', rot(-1.2, 0, 0)], ['turned aside', rot(-0.6, 1.0, 0)]]) {
        const j = jitter(real.noise, { ...real, R0 });
        t.diagnostic(`${name}: palm ${(j.step * 57.3).toFixed(2)}°/frame, fingers ${(j.finger * 57.3).toFixed(2)}°/frame`);
        // (before: 1.28 / 0.65 / 0.78 °/frame the palm, 2.3 °/frame the fingers)
        assert.ok(j.step * 57.3 < 0.55, `${name}: the palm trembles ${(j.step * 57.3).toFixed(2)}° a frame`);
        assert.ok(j.finger * 57.3 < 1.2, `${name}: the fingers tremble ${(j.finger * 57.3).toFixed(2)}° a frame`);
    }
    const r = measure({ ...real, R1: rot(0, 1.4, 0), moveMs: 120 });
    assert.ok(r.turnMs <= 50, `and a real quick turn still passes at once (${r.turnMs.toFixed(0)} ms)`);
});
