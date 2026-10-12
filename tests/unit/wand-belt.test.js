/**
 * The wand's place at the waistband (WandBelt.js): a hand in front of the belly counts,
 * an arm hanging at the side, a hand on the hip or in a trouser pocket, a hand at the
 * chest or the knees never do. (Hand places as the hero's arms put them for those poses.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { atBelt } from '../../src/game/WandBelt.js';

const at = (x, y, z) => atBelt(new THREE.Vector3(x, y, z));

test('wand belt: only a hand in front of the belly is at the belt', () => {
    assert.ok(at(0.18, -0.08, -1.14) < Infinity, 'the right hand reaching across to it');
    assert.ok(at(-0.46, -0.08, -1.18) < Infinity, 'the left hand in front of its hip');
    assert.equal(at(0.95, -0.39, -0.89), Infinity, 'the right arm hanging');
    assert.equal(at(-0.95, -0.39, -0.89), Infinity, 'the left arm hanging');
    assert.equal(at(0.66, -0.28, -0.91), Infinity, 'in the right trouser pocket');
    assert.equal(at(-0.66, -0.28, -0.91), Infinity, 'in the left trouser pocket');
    assert.equal(at(0.92, -0.06, -1.36), Infinity, 'arms down in front, apart');
    assert.equal(at(0, 1.1, -1.2), Infinity, 'at the chest');
    assert.equal(at(0, -1.2, -0.8), Infinity, 'at the knees');
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

test('first person: the torso stays seen (looking down one sees one\'s body); the hidden head still casts its shadow', async () => {
    const { VoxelCharacter } = await import('../../src/entities/Character.js');
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setFirstPerson(true);
    const cam = new THREE.Layers(); // (the camera sees layer 0)
    assert.ok(ch.body.layers.test(cam), 'the torso is seen');
    assert.ok(!ch.head.layers.test(cam), 'the head (the eyes are in it) is not');
    const shadow = ch.head.getObjectByName('head-shadow');
    assert.ok(shadow && shadow.visible && shadow.castShadow && shadow.layers.test(cam), 'an unseen double of the head casts the shadow');
    assert.equal(shadow.material.colorWrite, false, '(unseen)');
    ch.setFirstPerson(false);
    assert.ok(ch.head.layers.test(cam) && !shadow.visible, 'from outside: the head itself, no double');
});
