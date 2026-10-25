import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FarShape } from '../../src/core/FarShape.js';
import { updateFarBatches, resetFarBatches, FAR_BATCH, farBatchStats } from '../../src/core/FarBatch.js';
import { animalModel, animateLegs } from '../../src/game/AnimalModels.js';

const renderer = { capabilities: { floatVertexTextures: true } };
const batches = (scene) => scene.children.filter((o) => o.userData.farBatch);
/** Where the batch's skeleton puts its vertices (its bones as the renderer would take them this frame). */
function batchBox(mesh) {
    mesh.skeleton.update();
    const P = mesh.geometry.attributes.position, SI = mesh.geometry.attributes.skinIndex, M = mesh.skeleton.boneMatrices;
    const b = new THREE.Box3(), v = new THREE.Vector3(), m = new THREE.Matrix4();
    for (let i = 0; i < P.count; i++) {
        m.fromArray(M, SI.getX(i) * 16);
        if (m.elements.every((e) => e === 0)) continue;
        b.expandByPoint(v.fromBufferAttribute(P, i).applyMatrix4(m));
    }
    return b;
}
function ownBox(shape) {
    const b = new THREE.Box3(), v = new THREE.Vector3();
    for (const s of shape.meshes) {
        s.skeleton.update();
        const P = s.geometry.attributes.position;
        for (let i = 0; i < P.count; i++) b.expandByPoint(s.boneTransform(i, v).applyMatrix4(s.matrixWorld));
    }
    return b;
}
const near = (a, b) => ['min', 'max'].every((k) => ['x', 'y', 'z'].every((ax) => Math.abs(a[k][ax] - b[k][ax]) < 1e-3));

test('FarBatch: still one-shapes of one look near each other — one draw; their parts posed as before; a change — out at once', () => {
    resetFarBatches();
    const scene = new THREE.Scene();
    const cows = [0, 1, 2].map((i) => { const c = animalModel('cow', 2); c.position.set(i * 6, 0, 0); c.rotation.y = i; scene.add(c); return c; });
    const shapes = cows.map((c) => { const s = new FarShape(c); s.set(true); return s; });
    const own = shapes.reduce((n, s) => n + s.meshes.length, 0);
    scene.updateMatrixWorld(true);
    updateFarBatches(scene, renderer, 0.1);
    assert.equal(batches(scene).length, 0, 'not yet: a shape is batched only when it has stayed as it is a moment');
    for (let t = 0; t < FAR_BATCH.STABLE + 0.2; t += 0.1) updateFarBatches(scene, renderer, 0.1);
    const bs = batches(scene);
    assert.ok(bs.length > 0 && bs.length < own, `${own} own draws → ${bs.length} batches`);
    assert.ok(shapes.every((s) => s.meshes.every((m) => !m.visible)), 'their own meshes are not drawn');
    // (the same body: the batch puts the vertices where the shapes did)
    animateLegs(cows[1], 2.2, 1);
    scene.updateMatrixWorld(true);
    const u = new THREE.Box3(); for (const b of bs) u.union(batchBox(b));
    const ref = new THREE.Box3(); for (const s of shapes) { for (const m of s.meshes) m.visible = true; ref.union(ownBox(s)); for (const m of s.meshes) m.visible = false; }
    assert.ok(near(u, ref), 'the same surface');
    // a cow hidden by the game: its triangles vanish, nothing made again
    const r0 = farBatchStats.rebuilds;
    cows[2].visible = false;
    updateFarBatches(scene, renderer, 0.1);
    const u2 = new THREE.Box3(); for (const b of batches(scene)) u2.union(batchBox(b));
    assert.ok(u2.max.x < 12 - 1, 'the hidden one is not drawn');
    assert.equal(farBatchStats.rebuilds, r0);
    // a red flash on one (its material swapped — HurtFlash): out of the batch at once, its own mesh drawn
    const m0 = shapes[0].meshes[0], orig = m0.material;
    m0.material = orig.clone();
    updateFarBatches(scene, renderer, 0.1);
    assert.ok(shapes[0].meshes.every((m) => m.visible), 'drawn as itself again');
    m0.material = orig;
    // disposed: let go
    for (const s of shapes) s.dispose();
    for (let i = 0; i < 3; i++) updateFarBatches(scene, renderer, 0.1);
    assert.equal(batches(scene).length, 0, 'no batch left');
    resetFarBatches();
});
