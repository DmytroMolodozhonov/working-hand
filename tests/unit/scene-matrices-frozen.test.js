/** A person «frozen» out of the picture must have its matrices made once first — else its parts stand at the world's origin (the spawn)
 * with identity matrices and are drawn there (the author, 01.11: «персонажи накладываются у спавна, потом пропадают»). */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installSceneMatrices } from '../../src/core/SceneMatrices.js';

installSceneMatrices();

test('a frozen branch never made is made once, then waits', () => {
    const scene = new THREE.Scene();
    scene.matrixAutoUpdate = false;
    const root = new THREE.Group(), part = new THREE.Group();
    root.add(part); scene.add(root);
    root.position.set(170, 3, -110);
    root.userData.matFrozen = true; // (frozen from its very first frame)
    scene.updateMatrixWorld(true);
    assert.equal(part.matrixWorld.elements[12], 170, 'made once: the part is where its person is, not at the origin');
    root.position.set(10, 0, 0);
    scene.updateMatrixWorld(true);
    assert.equal(part.matrixWorld.elements[12], 170, 'then it waits (nobody sees it)');
    root.userData.matFrozen = false;
    scene.updateMatrixWorld(true);
    assert.equal(part.matrixWorld.elements[12], 10, 'unfrozen: recomputed at once');
});
