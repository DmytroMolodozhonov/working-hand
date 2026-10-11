import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { handFrame, fingerJoints, heroPoints } from '../../src/entities/HandPose.js';
import { synthHand, ASPECT } from './synth-hand.mjs';

const rot = (ax, ay, az) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax, ay, az, 'XYZ'));
const cols = (m) => { const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3(); m.extractBasis(x, y, z); return { x, y, z }; };

test('hand frame: the whole turn of the hand comes back from its 21 points (any turn, both hands)', () => {
    let rnd = 7;
    const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    for (const side of ['right', 'left']) {
        for (let i = 0; i < 40; i++) {
            const R = rot(r() * Math.PI, r() * Math.PI, r() * Math.PI);
            const fr = handFrame(synthHand(R, { side }), ASPECT);
            const c = cols(R);
            // X: index → little finger: the hand's +x (right) / −x (left, a mirror image)
            const wantX = side === 'right' ? c.x : c.x.clone().negate();
            assert.ok(fr.Y.distanceTo(c.y) < 1e-6, 'fingers direction');
            assert.ok(fr.X.distanceTo(wantX) < 1e-6, 'across the knuckles');
            assert.ok(Math.abs(fr.X.clone().cross(fr.Y).dot(fr.Z) - 1) < 1e-9, 'a proper frame');
        }
    }
});

test('hand frame: bending the hand to the left / right at the wrist is seen (it was lost before)', () => {
    // a right hand up, palm to the camera; bent 30° towards the thumb, then 30° towards the little finger
    const up = rot(0, Math.PI, 0); // (the palm faces the camera: the back of the hand away from it)
    const base = handFrame(synthHand(up), ASPECT);
    const sides = [];
    for (const deg of [30, -30]) {
        const bent = up.clone().multiply(rot(0, 0, (deg * Math.PI) / 180)); // about the palm's normal
        const fr = handFrame(synthHand(bent), ASPECT);
        const ang = Math.acos(fr.Y.dot(base.Y)) * 180 / Math.PI;
        assert.ok(Math.abs(ang - 30) < 0.5, `the fingers turned ${ang.toFixed(1)}° (want 30°)`);
        // in the picture plane (the hero's XY): to one side, not towards the camera
        assert.ok(Math.abs(fr.Y.z) < 1e-6, 'sideways, not in depth');
        sides.push(Math.sign(fr.Y.x - base.Y.x));
    }
    assert.equal(sides[0], -sides[1], 'to the thumb and to the little finger: the two sides');
});

test('hand frame: an edge-on hand says its roll is a guess', () => {
    const flat = handFrame(synthHand(rot(0, Math.PI, 0)), ASPECT);
    const edge = handFrame(synthHand(rot(0, Math.PI / 2, 0)), ASPECT);
    assert.ok(flat.quality > 0.8, 'palm to the camera: sure ' + flat.quality);
    assert.ok(edge.quality < 0.15, 'edge-on: unsure ' + edge.quality);
});

test('finger joints: every joint of every finger as bent', () => {
    const bends = { index: [0.5, 0.9, 0.4], middle: [1.2, 1.4, 0.7], ring: [0.1, 0.2, 0.1], pinky: [0.0, 0.0, 0.0], thumb: [0.3, 0.4, 0.5] };
    for (const side of ['right', 'left']) {
        for (const R of [rot(0, 0, 0), rot(0.7, -0.4, 1.9), rot(-1.2, 2.5, 0.3)]) {
            const j = fingerJoints(synthHand(R, { side, bends }), ASPECT, side);
            for (const name of ['index', 'middle', 'ring', 'pinky']) {
                for (let k = 0; k < 3; k++) assert.ok(Math.abs(j[name][k] - bends[name][k]) < 1e-6, `${side} ${name}[${k}] ${j[name][k].toFixed(3)} vs ${bends[name][k]}`);
            }
            for (let k = 1; k < 3; k++) assert.ok(Math.abs(j.thumb[k] - bends.thumb[k]) < 1e-6, 'thumb ' + k);
        }
    }
    // a knuckle bent backwards reads negative
    const back = fingerJoints(synthHand(rot(0, 0, 0), { bends: { index: [-0.3, 0, 0] } }), ASPECT, 'right');
    assert.ok(back.index[0] < -0.25, 'bent back: ' + back.index[0]);
});

test('finger spread: a finger turned aside is seen (towards the little finger is +)', () => {
    const j = fingerJoints(synthHand(rot(0.3, 0.2, 0), { spread: { index: -0.3, pinky: 0.35 } }), ASPECT, 'right');
    assert.ok(Math.abs(j.spread.index + 0.3) < 1e-6 && Math.abs(j.spread.pinky - 0.35) < 1e-6, JSON.stringify(j.spread));
    assert.ok(Math.abs(j.spread.middle) < 1e-6);
});

test('hero points: the picture is not mirrored — the person\'s left (picture right) is the hero\'s left (−X)', () => {
    const P = heroPoints(Array.from({ length: 21 }, (_, i) => ({ x: i === 1 ? 0.9 : 0.5, y: 0.5, z: 0 })), 1);
    assert.ok(P[1].x < P[0].x);
});
