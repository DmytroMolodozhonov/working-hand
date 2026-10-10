import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bowAim, BOW_AGREE } from '../../src/game/Gear.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const deg = (a, b) => (a.angleTo(b) * 180) / Math.PI;
const FWD = V(0, 0, -1);

// an archer (the hero's space: −Z ahead): the left arm stretched ahead, the bow in its fist
const shoulder = V(-0.7, 1.25, 0), bowHand = V(-0.6, 1.21, -1.9), grip = V(-0.59, 1.21, -2.12);
const arm = bowHand.clone().sub(shoulder).normalize();

test('bow: the camera puts the drawing hand beside the bow (weak depth) — the arrow still goes along the bow arm, not sideways', () => {
    // (the right hand drawn back to the chin, as the game sees it: nearly level with the bow)
    const drawHand = V(0.43, 1.58, -1.43);
    const sideways = grip.clone().sub(drawHand).normalize();
    assert.ok(deg(sideways, FWD) > 45, 'the hands\' own line goes sideways');
    const aim = bowAim(shoulder, bowHand, grip, drawHand, new THREE.Vector3());
    assert.ok(deg(aim, arm) < 1, `along the bow arm (${deg(aim, arm).toFixed(1)}°)`);
    assert.ok(deg(aim, FWD) < 5, `ahead (${deg(aim, FWD).toFixed(1)}°)`);
    assert.ok(Math.abs(aim.length() - 1) < 1e-6);
});

test('bow: a drawing hand that agrees with the bow arm refines the aim a little (towards it, never past half way)', () => {
    // the hand straight behind the bow, 10° off the arm
    const off = arm.clone().applyAxisAngle(V(0, 1, 0), (10 * Math.PI) / 180);
    const drawHand = grip.clone().addScaledVector(off, -1.2);
    const aim = bowAim(shoulder, bowHand, grip, drawHand, new THREE.Vector3());
    const toArm = deg(aim, arm), toHand = deg(aim, off);
    assert.ok(toArm > 0.5 && toArm < 5, `moved a little towards the drawing hand (${toArm.toFixed(1)}° from the arm)`);
    assert.ok(toHand > 5, `but stays nearer the bow arm (${toHand.toFixed(1)}° from the hands' line)`);
    // exactly behind: exactly along the arm
    const behind = grip.clone().addScaledVector(arm, -1.2);
    assert.ok(deg(bowAim(shoulder, bowHand, grip, behind, new THREE.Vector3()), arm) < 0.01);
});

test('bow: no jump when the drawing hand drifts out of agreement (the refinement fades to nothing at ~25°)', () => {
    let prev = null, maxStep = 0;
    for (let a = 0; a <= 40; a += 0.5) {
        const off = arm.clone().applyAxisAngle(V(0, 1, 0), (a * Math.PI) / 180);
        const aim = bowAim(shoulder, bowHand, grip, grip.clone().addScaledVector(off, -1.2), new THREE.Vector3());
        if (prev) maxStep = Math.max(maxStep, deg(aim, prev));
        prev = aim;
        if ((a - 0.25) * Math.PI / 180 >= BOW_AGREE) assert.ok(deg(aim, arm) < 1e-3, `at ${a}° the drawing hand is ignored`);
    }
    assert.ok(maxStep < 0.5, `smooth (largest step ${maxStep.toFixed(2)}° per 0.5°)`);
});

test('bow: a drawing hand on the bow itself, or no arm at all, never breaks the aim', () => {
    const onBow = bowAim(shoulder, bowHand, grip, grip.clone(), new THREE.Vector3());
    assert.ok(deg(onBow, arm) < 1e-6);
    const none = bowAim(shoulder, shoulder.clone(), grip, V(0, 1.5, -1), new THREE.Vector3(), V(1, 0, 0));
    assert.ok(Number.isFinite(none.x) && Math.abs(none.length() - 1) < 1e-6, 'a finite direction');
    assert.ok(deg(none, V(1, 0, 0)) < 30, 'the given facing');
});
