/**
 * The network loses the hand for a moment (fast moves, blur): the hero's hand must not
 * break. Meanwhile it stays as it was on the forearm (moves with the arm, the wrist not
 * twisted by its last turn frozen in the air); seen again, it glides into the new pose
 * within ~¼ s instead of jumping there in one frame.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { frame } from '../e2e/poses.mjs';
import { synthHand, ASPECT } from './synth-hand.mjs';

const rot = (ax, ay, az) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax, ay, az, 'XYZ'));

function poseOf(arms, lm) {
    const f = frame({ arms, leftCurl: null, rightCurl: null });
    const P = (i) => ({ x: f.poseLandmarks[i].x, y: f.poseLandmarks[i].y, z: f.poseLandmarks[i].z });
    return { leftShoulder: P(11), leftElbow: P(13), leftWrist: P(15), rightShoulder: P(12), rightElbow: P(14), rightWrist: P(16), aspect: ASPECT, rightHandLandmarks: lm, _w: P(16) };
}

test('hand lost for a second: it moves with the arm as it was, then glides into the new pose (no jump)', () => {
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setShowHands(true);
    let t = 0;
    ch.handNow = () => t;
    const hand = ch.rightSimplifiedHand;
    const step = (pose) => { t += 1000 / 60; ch.updateArmsLookAt(pose, 1 / 60); ch.group.updateMatrixWorld(true); };
    const seen = (arms, R) => { const p = poseOf(arms, null); p.rightHandLandmarks = synthHand(R, { at: [p._w.x, p._w.y], size: 0.1 }); return p; };
    for (let i = 0; i < 60; i++) step(seen('up', rot(-0.4, 0, 0)));
    const local = hand.palm.quaternion.clone();
    // lost for 1 s while the arm swings down to the front
    for (let i = 0; i < 60; i++) {
        const p = poseOf(i < 30 ? 'up' : 'forward', null);
        step(p);
        assert.ok(hand.palm.quaternion.angleTo(local) < 1e-6, 'the lost hand keeps its turn on the forearm');
    }
    // seen again, turned otherwise
    const R = rot(-1.2, 0.4, 0);
    const world = new THREE.Quaternion(), prev = new THREE.Quaternion();
    hand.palm.getWorldQuaternion(prev);
    const steps = [];
    for (let i = 0; i < 40; i++) {
        step(seen('forward', R));
        hand.palm.getWorldQuaternion(world);
        steps.push(world.angleTo(prev));
        prev.copy(world);
    }
    const final = world.clone();
    const total = steps.reduce((a, b) => a + b, 0);
    assert.ok(total > 0.4, `it really turned (${total.toFixed(2)} rad)`);
    assert.ok(Math.max(...steps) < total * 0.45, `no jump: biggest frame ${Math.max(...steps).toFixed(2)} of ${total.toFixed(2)} rad`);
    // there within ~¼ s
    let q = new THREE.Quaternion();
    // (re-run the same frames' end state: after 15 frames it must be within 10%)
    const ch2 = new VoxelCharacter(new THREE.Scene());
    ch2.setShowHands(true);
    let t2 = 0;
    ch2.handNow = () => t2;
    const s2 = (pose) => { t2 += 1000 / 60; ch2.updateArmsLookAt(pose, 1 / 60); ch2.group.updateMatrixWorld(true); };
    for (let i = 0; i < 60; i++) s2(seen('up', rot(-0.4, 0, 0)));
    for (let i = 0; i < 60; i++) s2(poseOf(i < 30 ? 'up' : 'forward', null));
    for (let i = 0; i < 15; i++) s2(seen('forward', R));
    ch2.rightSimplifiedHand.palm.getWorldQuaternion(q);
    assert.ok(q.angleTo(final) < 0.1 * total + 0.02, `within ¼ s: ${q.angleTo(final).toFixed(3)} rad left`);
});

test('a short drop-out (two pictures) changes nothing: no glide, the hand follows at once', () => {
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setShowHands(true);
    let t = 0;
    ch.handNow = () => t;
    const hand = ch.rightSimplifiedHand;
    const step = (pose) => { t += 1000 / 60; ch.updateArmsLookAt(pose, 1 / 60); };
    const seen = (R) => { const p = poseOf('up', null); p.rightHandLandmarks = synthHand(R, { at: [p._w.x, p._w.y], size: 0.1 }); return p; };
    for (let i = 0; i < 30; i++) step(seen(rot(0, 0, 0)));
    for (let i = 0; i < 4; i++) step(poseOf('up', null)); // (~65 ms)
    step(seen(rot(-1, 0, 0)));
    assert.equal(hand._k, hand.FOLLOW, 'no glide after a tiny gap');
});
