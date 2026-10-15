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

test('first person: the eyes are in the head, ahead of the neck; the whole torso is there — out of sight looking ahead, the chest and the belly seen looking down, the eyes never inside it', async () => {
    const { VoxelCharacter } = await import('../../src/entities/Character.js');
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setFirstPerson(true);
    const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    const camLayers = new THREE.Layers();
    assert.ok(ch.body.layers.test(camLayers) && !ch.head.layers.test(camLayers), 'the torso is seen, the head is not');
    ch.body.geometry.computeBoundingBox();
    const bb = ch.body.geometry.boundingBox;
    /** Look (yaw, pitch); → {n: torso points in the view, gap: the eyes' distance from the torso, eye: hero space}. */
    const look = (yaw, pitch, aspect = 16 / 9) => {
        cam.aspect = aspect; cam.updateProjectionMatrix();
        ch.updateHeadRotation(yaw, pitch);
        ch.group.updateMatrixWorld(true);
        ch.getHeadPosition(cam.position);
        ch.getHeadQuaternion(cam.quaternion);
        cam.updateMatrixWorld(true);
        const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        let n = 0;
        for (const x of [bb.min.x, 0, bb.max.x]) for (const y of [bb.min.y, 0, bb.max.y]) for (const z of [bb.min.z, 0, bb.max.z]) if (fr.containsPoint(ch.body.localToWorld(new THREE.Vector3(x, y, z)))) n++;
        const local = ch.body.worldToLocal(cam.position.clone());
        const gap = new THREE.Box3(bb.min, bb.max).distanceToPoint(local);
        return { n, gap, eye: ch.group.worldToLocal(cam.position.clone()) };
    };
    const ahead = look(0, 0);
    assert.ok(ahead.eye.y > 2 && ahead.eye.y < 2.3 && ahead.eye.z < -0.2, `the eyes in the head, before the neck (${ahead.eye.toArray().map((v) => v.toFixed(2))})`);
    for (const pitch of [0, -0.15, 0.3]) for (const aspect of [16 / 9, 4 / 3, 21 / 9]) assert.equal(look(0, pitch, aspect).n, 0, `looking ahead (pitch ${pitch}): no torso before the eyes`);
    for (let yaw = -1.2; yaw <= 1.2; yaw += 0.2) for (let pitch = -1.45; pitch <= 1.5; pitch += 0.1) {
        const { gap } = look(yaw, pitch);
        assert.ok(gap > 0.25, `the eyes never in the torso (yaw ${yaw.toFixed(1)}, pitch ${pitch.toFixed(1)}: ${gap.toFixed(2)})`);
    }
    assert.ok(look(0, -1.2).n >= 4, 'looking down: the chest and the belly are seen');
    const d = ch.group.getObjectByName('head-shadow');
    assert.ok(d && d.visible && d.castShadow && d.layers.test(camLayers) && d.material.colorWrite === false, 'an unseen double of the head casts its shadow');
    ch.setFirstPerson(false);
    assert.ok(ch.body.layers.test(camLayers) && ch.head.layers.test(camLayers) && !d.visible, 'from outside: the hero as it is');
});

test('one place for a hand at the belt: reaching for the wand is never the coin pouches; the pouches only really at the right hip; in doubt nothing', async () => {
    const { bodyPlace } = await import('../../src/input/PoseInterpreter.js');
    const { frame } = await import('../e2e/poses.mjs');
    const place = (o, side = 'right') => bodyPlace(frame(o).poseLandmarks, side);
    assert.equal(place({ arms: 'hang', belt: 'right' }), 'wand', 'the right hand reaching across to the wand');
    assert.equal(place({ arms: 'hang', belt: 'left' }, 'left'), 'wand', 'the left hand at the wand');
    assert.equal(place({ arms: 'hang', purse: 'right' }), 'purse', 'at the right side of the belt');
    assert.equal(place({ arms: 'hang', purse: 'hip' }), 'purse', 'the fist at the belt by the hip');
    for (const o of [{ arms: 'hang' }, { arms: 'down' }, { arms: 'forward' }]) assert.equal(place(o), null, JSON.stringify(o));
    // the right wrist moved from the wand (the belly's middle) out to the hip, the elbow bent: wand … nothing … pouches, never back and forth
    const seen = [];
    for (let x = 0.53; x >= 0.33; x -= 0.005) {
        const f = frame({ arms: 'hang', belt: 'right' }).poseLandmarks;
        f[16] = { ...f[16], x }; f[14] = { ...f[14], x: x - 0.09 };
        const p = bodyPlace(f, 'right');
        if (seen[seen.length - 1] !== p) seen.push(p);
    }
    assert.deepEqual(seen.filter((p) => p !== null), ['wand', 'purse'], `the way out: ${JSON.stringify(seen)}`);
    // the middle-right of the belly (left of the right hip joint) is never the pouches
    const f = frame({ arms: 'hang', belt: 'right' }).poseLandmarks;
    f[16] = { ...f[16], x: 0.46 }; f[14] = { ...f[14], x: 0.38 };
    assert.notEqual(bodyPlace(f, 'right'), 'purse', 'right of the middle, still in front of the belly: not the pouches');
});

test('a left-hander: the belt mirrored — the left hand at the wand, the pouches and the things\' pocket at the left hip; a right-hander\'s places are not a left-hander\'s', async () => {
    const { bodyPlaces } = await import('../../src/input/PoseInterpreter.js');
    const { frame } = await import('../e2e/poses.mjs');
    const at = (o, lefty) => {
        const f = frame(o);
        const hand = (label) => f.hands.find((h) => h.label === label)?.landmarks; // ('Right' = the person's left: a selfie picture)
        return bodyPlaces(f.poseLandmarks, hand('Right'), hand('Left'), 4 / 3, lefty);
    };
    // a right-hander
    assert.equal(at({ arms: 'hang', belt: 'right' }, false).place.right, 'wand');
    assert.equal(at({ arms: 'hang', purse: 'hip' }, false).purse.dom, true);
    // a left-hander doing the same in the mirror: the LEFT hand
    const w = at({ arms: 'hang', belt: 'right', mirror: true }, true);
    assert.equal(w.place.left, 'wand', 'the left hand reaching across to the wand');
    assert.notEqual(w.place.right, 'wand');
    const p = at({ arms: 'hang', purse: 'hip', mirror: true }, true);
    assert.equal(p.purse.dom, true, 'the left hand at the left hip: the pouches');
    assert.equal(p.place.left, 'purse');
    // a left-hander's right hand at the right hip: not the pouches (their place is on the left)
    assert.notEqual(at({ arms: 'hang', purse: 'hip' }, true).purse.dom, true);
    assert.notEqual(at({ arms: 'hang', purse: 'hip' }, true).place.right, 'purse');
    // and a right-hander's left hand at the left hip: not the pouches either
    assert.notEqual(at({ arms: 'hang', purse: 'hip', mirror: true }, false).purse.dom, true);
});
