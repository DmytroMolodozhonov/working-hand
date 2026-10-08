/**
 * Body → hero latency. The whole chain the camera result goes through
 * (stabilizer → interpreter → blending → arm solver), on a simulated clock:
 * the camera gives 22 results a second, the game draws 60 frames.
 *
 * This guards the most important feel of the game — the hero must follow the
 * player's body at once. If any change makes it trail, this test fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PoseStabilizer } from '../../src/input/TrackingGuard.js';
import { PoseInterpreter } from '../../src/input/PoseInterpreter.js';
import { PoseSmoother } from '../../src/input/PoseSmoother.js';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { frame } from '../e2e/poses.mjs';

const video = { videoWidth: 640, videoHeight: 480 };

/** The right arm goes from hanging down to straight forward in `moveMs`; how long until the hero's hand is there. */
function swing(moveMs) {
    const guard = new PoseStabilizer();
    const interp = new PoseInterpreter();
    const smoother = new PoseSmoother();
    const ch = new VoxelCharacter(new THREE.Scene());
    const cam = 1000 / 22, draw = 1000 / 60;
    const poseAt = (t) => {
        const k = Math.max(0, Math.min(1, t / moveMs));
        // blend the landmarks of 'down' and 'forward'
        const a = frame({ arms: 'down', rightCurl: null, leftCurl: null }).poseLandmarks;
        const b = frame({ arms: 'forward', rightCurl: null, leftCurl: null }).poseLandmarks;
        return a.map((p, i) => (i === 14 || i === 16 ? { ...p, x: p.x + (b[i].x - p.x) * k, y: p.y + (b[i].y - p.y) * k, z: p.z + (b[i].z - p.z) * k } : p));
    };
    let nextCam = -2000, t = -2000;
    let final = null;
    const results = [];
    // settle with the arm down, move, then hold forward
    while (t < moveMs + 1000) {
        if (t >= nextCam) {
            nextCam += cam;
            const lm = guard.process(poseAt(t), t);
            smoother.push(interp.process({ poseLandmarks: lm }, video), t);
        }
        const pose = smoother.sample(t);
        if (pose) ch.updateArmsLookAt(pose, draw / 1000);
        ch.group.updateMatrixWorld(true);
        results.push({ t, p: ch.getHandWorldPosition('right', new THREE.Vector3()).clone() });
        t += draw;
    }
    final = results[results.length - 1].p;
    const start = results.find((r) => r.t >= 0).p;
    const total = start.distanceTo(final);
    // when the hand covered 90% of the way
    const reached = results.find((r) => r.t >= 0 && r.p.distanceTo(final) < total * 0.1);
    return { lag: reached.t - moveMs, total };
}

test('latency: a fast swing (150 ms) — the hero\'s hand is there within 100 ms after the body', (t) => {
    const r = swing(150);
    t.diagnostic(`lag ${r.lag.toFixed(0)} ms`);
    assert.ok(r.total > 0.5, 'the hand really moved');
    assert.ok(r.lag < 100, `hand trails the body by ${r.lag.toFixed(0)} ms`);
});

test('latency: a normal move (400 ms) — within 80 ms', (t) => {
    const r = swing(400);
    t.diagnostic(`lag ${r.lag.toFixed(0)} ms`);
    assert.ok(r.lag < 80, `hand trails the body by ${r.lag.toFixed(0)} ms`);
});
