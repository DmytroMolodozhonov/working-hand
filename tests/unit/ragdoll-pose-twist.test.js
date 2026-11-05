// The doll drawn on the model: an arm, a leg, the head point where the doll's points are, and never get wrung round themselves when they
// pass near straight up / down (the author 05.11: «после Джолта он как-то так искривился странно» — the shortest turn's axis is undefined
// opposite its start: the parts twisted and jumped from frame to frame).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';
import { Ragdoll, P } from '../../src/game/Ragdoll.js';
import * as RagPose from '../../src/game/RagdollPose.js';

test('an arm swung from down, forward, over the head and behind: it follows the doll and never wrings round itself', () => {
    const model = new VillagerModel(villagerLook(3, 'farmer'), {});
    const scene = new THREE.Scene(); scene.add(model.group);
    model.group.position.set(0, 1.95, 0);
    const doll = new Ragdoll();
    RagPose.fromModel(doll, model);
    const sh = doll.at(P.SHR, []);
    let prev = null, maxJump = 0;
    const tip = new THREE.Vector3();
    for (let a = 0; a <= Math.PI * 1.9; a += 0.02) {
        // the hand on a circle round the shoulder in the body's front-up plane (−z is his front)
        doll.set(P.HNR, sh[0], sh[1] - Math.cos(a) * 0.95, sh[2] - Math.sin(a) * 0.95);
        RagPose.toModel(doll, model);
        const q = model.rightArm.quaternion.clone();
        if (prev) maxJump = Math.max(maxJump, prev.angleTo(q));
        prev = q;
        // the arm points at the hand
        model.group.updateMatrixWorld(true);
        model.rightArm.localToWorld(tip.set(0, -0.95, 0));
        const h = doll.at(P.HNR, []);
        assert.ok(tip.distanceTo(new THREE.Vector3(...h)) < 0.12, `the arm reaches the hand at ${a.toFixed(2)}`);
    }
    assert.ok(maxJump < 0.12, `no jump of the arm's turn: ${maxJump.toFixed(3)} rad a step of 0.02`);
});

test('an arm held up over the head, swaying a little round: it does not spin round itself (the old shortest turn wrung it a full turn)', () => {
    const model = new VillagerModel(villagerLook(3, 'farmer'), {});
    const scene = new THREE.Scene(); scene.add(model.group);
    model.group.position.set(0, 1.95, 0);
    const doll = new Ragdoll();
    RagPose.fromModel(doll, model);
    const sh = doll.at(P.SHR, []);
    const side = new THREE.Vector3(), first = new THREE.Vector3();
    let maxRoll = 0;
    for (let a = 0; a <= Math.PI * 2; a += 0.05) {
        const tilt = 0.25; // (~14° off straight up, going round)
        doll.set(P.HNR, sh[0] + Math.sin(tilt) * Math.cos(a) * 0.95, sh[1] + Math.cos(tilt) * 0.95, sh[2] + Math.sin(tilt) * Math.sin(a) * 0.95);
        RagPose.toModel(doll, model);
        side.set(1, 0, 0).applyQuaternion(model.rightArm.quaternion); // (the arm's own side axis, in the torso's frame)
        side.y = 0; side.normalize();
        if (a === 0) first.copy(side);
        maxRoll = Math.max(maxRoll, first.angleTo(side));
    }
    assert.ok(maxRoll < 0.8, `its side axis stays put: turned ${maxRoll.toFixed(2)} rad at most`);
});
