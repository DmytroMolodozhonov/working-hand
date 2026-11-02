/**
 * The arms raised over the head (part of the arm out of the picture) must not shake.
 * ArmGuard (input) + Character's straight-arm turn fix (drawing). Only the arms, not the palms.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArmGuard } from '../../src/input/ArmGuard.js';
import { ArmLog } from '../../src/core/ArmLog.js';
import { VoxelCharacter } from '../../src/entities/Character.js';

/** Both arms raised; the right wrist (16) goes out through the top of the picture. */
function raised({ wristY = 0.08, vis = 0.95, sway = 0 } = {}) {
    const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.8, z: 0, visibility: 0.95 }));
    p[0] = { x: 0.5 + sway, y: 0.35, z: -0.3, visibility: 0.99 };
    p[11] = { x: 0.6 + sway, y: 0.5, z: 0, visibility: 0.99 };
    p[12] = { x: 0.4 + sway, y: 0.5, z: 0, visibility: 0.99 };
    p[13] = { x: 0.63 + sway, y: 0.3, z: 0, visibility: 0.99 };
    p[14] = { x: 0.37 + sway, y: 0.3, z: 0, visibility: 0.99 };
    p[15] = { x: 0.64 + sway, y: 0.12, z: 0, visibility: 0.95 };
    p[16] = { x: 0.36 + sway, y: wristY, z: 0, visibility: vis };
    return p;
}

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;

test('arm guard: a wrist out of the picture top (a wandering low-visibility guess) is steady, no flips', () => {
    const g = new ArmGuard({ log: null });
    let t = 0;
    for (let i = 0; i < 30; i++) g.process(raised(), (t += 45)); // seen well first
    let rawMove = 0, outMove = 0, prev = null, prevRaw = null, maxStep = 0;
    for (let i = 0; i < 60; i++) {
        // out of the frame: the network guesses all over the place, visibility flickers round the old 0.35 threshold
        const raw = raised({ wristY: -0.05 + rnd() * 0.12, vis: 0.35 + rnd() * 0.3 });
        raw[16].x += rnd() * 0.1;
        const o = g.process(raw, (t += 45))[16];
        if (prev) {
            const step = Math.hypot(o.x - prev.x, o.y - prev.y);
            outMove += step; maxStep = Math.max(maxStep, step);
            rawMove += Math.hypot(raw[16].x - prevRaw.x, raw[16].y - prevRaw.y);
        }
        prev = o; prevRaw = raw[16];
    }
    assert.ok(outMove < rawMove * 0.15, `the wrist still wanders: ${outMove.toFixed(3)} of raw ${rawMove.toFixed(3)}`);
    assert.ok(maxStep < 0.012, `a jump of ${maxStep.toFixed(3)} in one picture`);
});

test('arm guard: an unseen wrist goes with the body (held from its elbow, not frozen in the picture)', () => {
    const g = new ArmGuard({ log: null });
    let t = 0;
    for (let i = 0; i < 30; i++) g.process(raised(), (t += 45));
    let o;
    for (let i = 0; i < 30; i++) o = g.process(raised({ wristY: 0.5, vis: 0.05, sway: 0.1 }), (t += 45));
    // the body moved 0.1 to the side: the held wrist with it, where it was over the elbow
    assert.ok(Math.abs(o[16].x - (0.36 + 0.1)) < 0.02, `wrist x ${o[16].x.toFixed(3)}`);
    assert.ok(Math.abs(o[16].y - 0.08) < 0.03, `wrist y ${o[16].y.toFixed(3)} (the bad guess pulled it)`);
});

test('arm guard: a bone never comes out longer than it was seen', () => {
    const g = new ArmGuard({ log: null });
    let t = 0;
    for (let i = 0; i < 30; i++) g.process(raised(), (t += 45));
    let o;
    // well seen but stretched (a guess at the picture's edge): forearm 0.22 → 0.5
    for (let i = 0; i < 30; i++) o = g.process(raised({ wristY: -0.2, vis: 0.9 }), (t += 45));
    const fore = Math.hypot(o[16].x - o[14].x, o[16].y - o[14].y);
    assert.ok(fore < 0.22 * 1.2, `forearm ${fore.toFixed(3)}`);
});

test('arm guard: a point seen again glides back, never snaps', () => {
    const g = new ArmGuard({ log: null });
    let t = 0;
    for (let i = 0; i < 30; i++) g.process(raised(), (t += 45));
    for (let i = 0; i < 20; i++) g.process(raised({ wristY: 0.5, vis: 0.05 }), (t += 45));
    let prev = g.process(raised({ wristY: 0.2, vis: 0.05 }), (t += 45))[16], maxStep = 0, o;
    for (let i = 0; i < 20; i++) {
        o = g.process(raised({ wristY: 0.2, vis: 0.95 }), (t += 45))[16];
        maxStep = Math.max(maxStep, Math.abs(o.y - prev.y)); prev = o;
    }
    assert.ok(Math.abs(o.y - 0.2) < 0.01, `ended at ${o.y.toFixed(3)}`);
    assert.ok(maxStep < 0.08, `snapped ${maxStep.toFixed(3)} (of 0.12) in one picture`);
});

test('arm guard: a fast real swing is not slowed (seen well)', () => {
    const g = new ArmGuard({ log: null });
    let t = 0, o;
    for (let i = 0; i < 20; i++) g.process(raised({ wristY: 0.5 }), (t += 45));
    for (let i = 0; i < 3; i++) o = g.process(raised({ wristY: 0.08 }), (t += 45));
    assert.ok(o[16].y < 0.08 + 0.42 * 0.12, `after 3 pictures the wrist is still at ${o[16].y.toFixed(3)}`);
});

test('hero: an arm straight up with the camera\'s jitter does not spin round its length', () => {
    const ch = new VoxelCharacter(new THREE.Scene());
    const log = new ArmLog({ send: false });
    ch.armLog = log;
    const pose = (j) => ({
        leftShoulder: { x: 0.6, y: 0.5 }, leftElbow: { x: 0.6 + j(), y: 0.25 }, leftWrist: { x: 0.6 + j(), y: 0.0 },
        rightShoulder: { x: 0.4, y: 0.5 }, rightElbow: { x: 0.4 + j(), y: 0.25 }, rightWrist: { x: 0.4 + j(), y: 0.0 },
    });
    for (let i = 0; i < 60; i++) ch.updateArmsLookAt(pose(() => 0), 1 / 60);
    const q = new THREE.Quaternion(), qp = new THREE.Quaternion();
    let maxTurn = 0;
    ch.rightElbowAnchor.getWorldQuaternion(qp);
    for (let i = 0; i < 120; i++) {
        ch.updateArmsLookAt(pose(() => rnd() * 0.006), 1 / 60);
        ch.rightElbowAnchor.getWorldQuaternion(q);
        maxTurn = Math.max(maxTurn, (q.angleTo(qp) * 180) / Math.PI); qp.copy(q);
    }
    assert.ok(maxTurn < 6, `the forearm turned ${maxTurn.toFixed(1)}° in one frame`);
    log.flush(performance.now() + 2000);
    assert.match(log.text(), /фикс поворота/);
});
