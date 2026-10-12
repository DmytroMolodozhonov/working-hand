/**
 * The wand's place at the waistband (WandBelt.js): a hand in front of the belly counts,
 * an arm hanging at the side, a hand on the hip or in a trouser pocket, a hand at the
 * chest or the knees never do. (Hand places as the hero's arms put them for those poses.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';


test('wand belt: the REAL hand at the waistband (the camera\'s skeleton) — not a lowered, hanging or resting arm, not a pocket', async () => {
    const { beltPose } = await import('../../src/input/PoseInterpreter.js');
    const { frame } = await import('../e2e/poses.mjs');
    const at = (o, side) => beltPose(frame(o).poseLandmarks, side).at;
    assert.equal(at({ arms: 'hang', belt: 'right' }, 'right'), true, 'the right hand reaching across to it');
    assert.equal(at({ arms: 'hang', belt: 'left' }, 'left'), true, 'the left hand in front of its hip');
    for (const o of [{ arms: 'hang' }, { arms: 'down' }, { arms: 'forward' }, { arms: 'hang', lowLeft: true }, { arms: 'hang', pocket: 'right' }, { arms: 'hang', pocket: 'left' }]) {
        assert.equal(at(o, 'right'), false, 'right: ' + JSON.stringify(o));
        assert.equal(at(o, 'left'), false, 'left: ' + JSON.stringify(o));
    }
});

test('wand belt: a hand low in front of the belly is drawn close to it (fading in at the edges), the sides never', async () => {
    const { bellyWeight } = await import('../../src/game/WandBelt.js');
    const w = (x, y, z) => bellyWeight(new THREE.Vector3(x, y, z));
    assert.equal(w(0.18, -0.08, -1.14), 1, 'the right hand reaching across to the belt');
    assert.equal(w(-0.2, 0, -0.9), 1);
    assert.equal(w(0.95, -0.39, -0.89), 0, 'a hanging arm');
    assert.equal(w(0.66, -0.28, -0.91), 0, 'in the trouser pocket');
    assert.equal(w(0, 1.2, -1), 0, 'at the chest');
    const edge = w(0.42, 0, -1);
    assert.ok(edge > 0 && edge < 1, 'fades at the edge');
});

test('first person: the torso is never before the eyes looking ahead or about (head turned, tilted a little); looking down one sees the belly; the hidden head and torso still cast shadows', async () => {
    const { VoxelCharacter } = await import('../../src/entities/Character.js');
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setFirstPerson(true);
    const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    const camLayers = new THREE.Layers();
    const belly = ch.torso.getObjectByName('fpv-belly');
    assert.ok(belly && belly.visible && belly.layers.test(camLayers), 'the belly is seen');
    assert.ok(!ch.body.layers.test(camLayers) && !ch.head.layers.test(camLayers), 'the full torso and the head are not');
    /** How much of the belly the camera sees (its corners in the view), the head turned (yaw, pitch). */
    const seen = (yaw, pitch, aspect = 16 / 9) => {
        cam.aspect = aspect; cam.updateProjectionMatrix();
        ch.updateHeadRotation(yaw, pitch);
        ch.group.updateMatrixWorld(true);
        ch.getHeadPosition(cam.position);
        ch.getHeadQuaternion(cam.quaternion);
        cam.updateMatrixWorld(true);
        const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        belly.geometry.computeBoundingBox();
        const bb = belly.geometry.boundingBox;
        let n = 0;
        for (const x of [bb.min.x, 0, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, 0, bb.max.z]) if (fr.containsPoint(belly.localToWorld(new THREE.Vector3(x, y, z)))) n++;
        return n;
    };
    for (const yaw of [0, 0.5, -0.5, 1.0, -1.0]) for (const pitch of [0, -0.15, 0.3]) for (const aspect of [16 / 9, 4 / 3, 21 / 9]) {
        assert.equal(seen(yaw, pitch, aspect), 0, `looking ahead (yaw ${yaw}, pitch ${pitch}, ${aspect.toFixed(2)}): no torso before the eyes`);
    }
    assert.ok(seen(0, -0.9) > 0, 'looking down: the belly is seen');
    for (const name of ['head-shadow', 'body-shadow']) {
        const d = ch.group.getObjectByName(name);
        assert.ok(d && d.visible && d.castShadow && d.layers.test(camLayers) && d.material.colorWrite === false, `${name}: an unseen double casts the shadow`);
    }
    ch.setFirstPerson(false);
    assert.ok(ch.body.layers.test(camLayers) && ch.head.layers.test(camLayers) && !belly.visible, 'from outside: the hero as it is');
});
