/**
 * The wand held like a pen: one steady grip — its back in the web of the thumb, the
 * thumb's and the index's pads on it — the wand ~16° off the palm's line (the writing
 * grip's 30° pointed it down). The network's points of fingers pinching a stick jump
 * about: the grip must not follow them (it twisted the fingers «like chopsticks» and
 * shook the wand). Both hands, many wrist turns.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { PEN_POINTS } from '../../src/entities/SimplifiedHand.js';
import { frame } from '../e2e/poses.mjs';
import { synthHand, ASPECT } from './synth-hand.mjs';

const rot = (ax, ay, az) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax, ay, az, 'XYZ'));

/** The wand's direction off the drawn palm's line (towards the palm, rad), and the gap of the pinch. */
function wandOnPalm(hand) {
    hand.group.updateMatrixWorld(true);
    const web = hand.palm.localToWorld(new THREE.Vector3().fromArray(PEN_POINTS.web));
    const a = hand.penIndexPoint(new THREE.Vector3());
    const b = hand.fingerMeshes.thumb[2].pivot.localToWorld(new THREE.Vector3().fromArray(PEN_POINTS.thumb));
    const d = a.clone().add(b).multiplyScalar(0.5).sub(web).applyQuaternion(hand.palm.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    return { tilt: Math.atan2(-d.z, d.y), side: Math.atan2(d.x, d.y) };
}

test('the wand grip is steady: the same on the hand whatever the network\'s finger points do; ~16° off the palm\'s line; both hands', () => {
    let rnd = 5;
    const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    for (const side of ['right', 'left']) {
        const ch = new VoxelCharacter(new THREE.Scene());
        ch.setShowHands(true);
        ch.setHandVersion('v4'); // (the full hand)
        let t = 0;
        ch.handNow = () => t;
        const hand = side === 'right' ? ch.rightSimplifiedHand : ch.leftSimplifiedHand;
        hand.setGrip(0.38, 'pen');
        const f = frame({ arms: 'forward', leftCurl: null, rightCurl: null });
        const P = (i) => ({ x: f.poseLandmarks[i].x, y: f.poseLandmarks[i].y, z: f.poseLandmarks[i].z });
        const wr = side === 'right' ? P(16) : P(15);
        const pose = { leftShoulder: P(11), leftElbow: P(13), leftWrist: P(15), rightShoulder: P(12), rightElbow: P(14), rightWrist: P(16), aspect: ASPECT };
        const key = side === 'right' ? 'rightHandLandmarks' : 'leftHandLandmarks';
        const tilts = [];
        for (let i = 0; i < 120; i++) {
            // fingers pinching a stick, as the network sees them: bent anyhow, jumping about
            const b = 0.4 + r() * 0.4;
            pose[key] = synthHand(rot(-1.2 + r() * 0.3, r() * 0.4, r() * 0.4), { side, at: [wr.x, wr.y], size: 0.1, bends: { index: [b, b + r() * 0.3, b], middle: [0.5, 1, 0.6], ring: [1, 1.2, 0.8], pinky: [1, 1.2, 0.8] } });
            t += 1000 / 60;
            ch.updateArmsLookAt(pose, 1 / 60);
            if (i > 20) tilts.push(wandOnPalm(hand));
        }
        const spread = Math.max(...tilts.map((x) => x.tilt)) - Math.min(...tilts.map((x) => x.tilt));
        const mean = tilts.reduce((a, x) => a + x.tilt, 0) / tilts.length;
        assert.ok(spread < 0.01, `${side}: the grip moved by ${(spread * 180 / Math.PI).toFixed(1)}° on the hand`);
        assert.ok(Math.abs(mean * 180 / Math.PI - 16) < 4, `${side}: ${(mean * 180 / Math.PI).toFixed(1)}° off the palm's line`);
        assert.ok(Math.abs(tilts[0].side) < 0.15, `${side}: not off to a side`);
    }
});

test('a real stick seen in the hand sets the grip (pointing … writing) — smoothly, not in one jump', () => {
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setShowHands(true);
    ch.setHandVersion('v4'); // (the full hand)
    const hand = ch.rightSimplifiedHand;
    hand.setGrip(0.38, 'pen');
    hand.stickTilt = 0.09; // (pointing)
    const ts = [];
    for (let i = 0; i < 40; i++) { hand.animateModel(); ts.push(hand.penT); }
    assert.ok(ts[0] > 0.3, 'not at once');
    assert.ok(ts[39] < 0.02, 'there in a moment');
    hand.stickTilt = null;
    for (let i = 0; i < 40; i++) hand.animateModel();
    assert.ok(Math.abs(hand.penT - 0.45) < 0.01, 'back to the steady grip');
});
