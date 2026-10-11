/**
 * The wand held like a pen points where the real hand points. A real hand holding a
 * wand (or a brush) is built point by point (synth-hand.mjs) — the index finger along
 * the stick, bent from pointing (nearly straight) to writing — at many turns of the
 * wrist, both hands; the hero's hand is driven by its 21 points, and the wand (from
 * the web of the thumb through the pinch, as Items._penGrip) must go along the real
 * index finger, not ~25° under it (the author: «the wand points a little down»).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { PEN_POINTS } from '../../src/entities/SimplifiedHand.js';
import { heroPoints } from '../../src/entities/HandPose.js';
import { frame } from '../e2e/poses.mjs';
import { synthHand, ASPECT } from './synth-hand.mjs';

const rot = (ax, ay, az) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax, ay, az, 'XYZ'));

/** The hero's wand direction (world) and the real index finger's (world) for a hand turned by R. */
export function wandVsIndex(R, side, bends) {
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setShowHands(true);
    const hand = side === 'right' ? ch.rightSimplifiedHand : ch.leftSimplifiedHand;
    hand.setGrip(0.38, 'pen');
    const f = frame({ arms: 'forward', leftCurl: null, rightCurl: null });
    const P = (i) => ({ x: f.poseLandmarks[i].x, y: f.poseLandmarks[i].y, z: f.poseLandmarks[i].z });
    const wr = side === 'right' ? P(16) : P(15);
    const lm = synthHand(R, { side, at: [wr.x, wr.y], size: 0.1, bends: { index: bends, middle: [0.4, 0.9, 0.5], ring: [1, 1.2, 0.8], pinky: [1, 1.2, 0.8] } });
    const pose = { leftShoulder: P(11), leftElbow: P(13), leftWrist: P(15), rightShoulder: P(12), rightElbow: P(14), rightWrist: P(16), aspect: ASPECT };
    pose[side === 'right' ? 'rightHandLandmarks' : 'leftHandLandmarks'] = lm;
    for (let i = 0; i < 40; i++) ch.updateArmsLookAt(pose, 1 / 60);
    ch.group.updateMatrixWorld(true);
    const web = hand.palm.localToWorld(new THREE.Vector3().fromArray(PEN_POINTS.web));
    const a = hand.penIndexPoint(new THREE.Vector3());
    const b = hand.fingerMeshes.thumb[2].pivot.localToWorld(new THREE.Vector3().fromArray(PEN_POINTS.thumb));
    const wand = a.add(b).multiplyScalar(0.5).sub(web).normalize();
    const hp = heroPoints(lm, ASPECT);
    const index = hp[8].clone().sub(hp[5]).normalize().applyQuaternion(ch.group.getWorldQuaternion(new THREE.Quaternion()));
    return { wand, index, angle: wand.angleTo(index) * 180 / Math.PI };
}

test('the wand goes along the real index finger: pointing and writing grips, many wrist turns, both hands', (t) => {
    const grips = { pointing: [0.15, 0.25, 0.15], between: [0.3, 0.5, 0.3], writing: [0.45, 0.8, 0.6] };
    // fingers up / towards the camera / to the side, palm in / down (wrist turns a real arm makes)
    const turns = [rot(0, 0, 0), rot(-1.2, 0, 0), rot(-1.4, 0.5, 0), rot(-1.3, -0.5, 0), rot(-1.2, 0, 0.8), rot(-0.6, 1.2, 0), rot(-1.4, 0, -0.6)];
    let worst = 0, sum = 0, n = 0;
    for (const side of ['right', 'left']) {
        for (const [name, b] of Object.entries(grips)) {
            for (const R of turns) {
                const r = wandVsIndex(R, side, b);
                // (writing: the pen lies flatter than the curled index — the grip's own 30°)
                const limit = name === 'writing' ? 35 : 12;
                assert.ok(r.angle < limit, `${side} ${name}: the wand ${r.angle.toFixed(0)}° off the index finger`);
                if (name !== 'writing') { worst = Math.max(worst, r.angle); sum += r.angle; n++; }
            }
        }
    }
    // (before: the wand was always held as in writing, ~25° under a pointing index finger)
    t.diagnostic(`pointing / between: mean ${(sum / n).toFixed(1)}°, worst ${worst.toFixed(1)}°`);
});

test('a real pinch (a brush held like a pen): the wand goes along the line the real thumb and index finger hold, any wrist turn, both hands; no pinch — the grip as before', () => {
    const turns = [rot(0, 0, 0), rot(-1.2, 0, 0), rot(-1.4, 0.5, 0), rot(-1.3, -0.5, 0), rot(-1.2, 0, 0.8), rot(-0.6, 1.2, 0)];
    for (const side of ['right', 'left']) {
        for (const R of turns) {
            const ch = new VoxelCharacter(new THREE.Scene());
            ch.setShowHands(true);
            const hand = side === 'right' ? ch.rightSimplifiedHand : ch.leftSimplifiedHand;
            hand.setGrip(0.38, 'pen');
            const f = frame({ arms: 'forward', leftCurl: null, rightCurl: null });
            const P = (i) => ({ x: f.poseLandmarks[i].x, y: f.poseLandmarks[i].y, z: f.poseLandmarks[i].z });
            const wr = side === 'right' ? P(16) : P(15);
            // a writing-like grip; the thumb's tip pressed onto the index's end joint (the pinch)
            const lm = synthHand(R, { side, at: [wr.x, wr.y], size: 0.1, bends: { index: [0.45, 0.8, 0.6], middle: [0.5, 1, 0.6], ring: [1, 1.2, 0.8], pinky: [1, 1.2, 0.8] } });
            lm[4] = { ...lm[7] };
            const pose = { leftShoulder: P(11), leftElbow: P(13), leftWrist: P(15), rightShoulder: P(12), rightElbow: P(14), rightWrist: P(16), aspect: ASPECT };
            pose[side === 'right' ? 'rightHandLandmarks' : 'leftHandLandmarks'] = lm;
            for (let i = 0; i < 10; i++) ch.updateArmsLookAt(pose, 1 / 60);
            const hp = heroPoints(lm, ASPECT);
            const web = hp[2].clone().add(hp[5]).multiplyScalar(0.5);
            const truth = hp[7].clone().sub(web).normalize();
            assert.ok(hand.pinchDir, `${side}: the pinch is seen`);
            assert.ok(hand.pinchDir.angleTo(truth) < 0.02, `${side}: along the pinch`);
            // the drawn fingers hold it as it lies (between pointing and writing)
            assert.ok(hand.pinchTilt != null && hand.penT >= 0 && hand.penT <= 1);
            // the thumb off the index finger: no pinch
            const open = synthHand(R, { side, at: [wr.x, wr.y], size: 0.1 });
            pose[side === 'right' ? 'rightHandLandmarks' : 'leftHandLandmarks'] = open;
            ch.updateArmsLookAt(pose, 1 / 60);
            assert.equal(hand.pinchDir, null, `${side}: an open hand pinches nothing`);
        }
    }
});
