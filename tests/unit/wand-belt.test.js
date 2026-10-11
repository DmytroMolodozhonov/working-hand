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
