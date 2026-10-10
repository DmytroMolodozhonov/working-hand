import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { paneBlow, GLASS } from '../../src/game/Houses.js';

// a pane facing +Z (ry 0): its normal is along z
test('glass: a touch, a slow push or walking past does not break it; a real fist blow into it does', () => {
    assert.equal(paneBlow(new THREE.Vector3(0, 0, -1.5), 0, 1), false, 'a touch / a slow push');
    assert.equal(paneBlow(new THREE.Vector3(7, 0, 0.5), 0, 1), false, 'a fast hand along the glass (sweeping past)');
    assert.equal(paneBlow(new THREE.Vector3(0, 0, -8), 0, 0.2), false, 'an open hand slapping is no blow');
    assert.equal(paneBlow(new THREE.Vector3(0.5, 0, -8), 0, 0.9), true, 'a fist into the pane');
    assert.equal(paneBlow(new THREE.Vector3(-8, 0, 0), Math.PI / 2, 0.9), true, 'a pane turned 90°: its own normal');
    assert.ok(GLASS.BLOW > 5, 'faster than walking (and the body speed is taken away before)');
});
