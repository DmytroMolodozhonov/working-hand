import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FarShape } from '../../src/core/FarShape.js';
import { animalModel, animateLegs } from '../../src/game/AnimalModels.js';

const drawn = (root) => { const out = []; root.traverseVisible((o) => { if (o.isMesh) out.push(o); }); return out; };
/** The model's shown surface in the world: every vertex of every drawn mesh. */
const box = (root) => {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3(), v = new THREE.Vector3();
    for (const m of drawn(root)) { const P = m.geometry.attributes.position; for (let i = 0; i < P.count; i++) b.expandByPoint(v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld)); }
    return b;
};

test('FarShape: an animal far off is one shape per material, posed as its parts — and back as it was', () => {
    const cow = animalModel('cow', 2);
    cow.position.set(40, 3, -12); cow.rotation.y = 0.7; cow.scale.setScalar(1.1);
    animateLegs(cow, 1.3, 1);
    const parts = drawn(cow), mats = new Set(parts.map((m) => m.material));
    const near = box(cow);
    const far = new FarShape(cow);
    far.set(true);
    const now = drawn(cow);
    assert.equal(now.length, mats.size, `${parts.length} parts → one draw per material (${mats.size})`);
    assert.ok(now.every((m) => m.userData.farOne && !m.castShadow));
    const b = box(cow);
    for (const k of ['min', 'max']) for (const a of ['x', 'y', 'z']) assert.ok(Math.abs(b[k][a] - near[k][a]) < 1e-3, `the same body: ${k}.${a} ${b[k][a]} vs ${near[k][a]}`);
    // a new pose: the copy follows it once refreshed
    animateLegs(cow, 2.9, 1);
    far.set(false);
    const near2 = box(cow);
    far.set(true);
    far.refresh();
    const b2 = box(cow);
    for (const k of ['min', 'max']) for (const a of ['x', 'y', 'z']) assert.ok(Math.abs(b2[k][a] - near2[k][a]) < 1e-3, `posed anew: ${k}.${a}`);
    // near again: the parts as they were, the copy hidden
    far.set(false);
    assert.equal(drawn(cow).length, parts.length);
    assert.ok(drawn(cow).every((m) => !m.userData.farOne));
    far.dispose();
    assert.ok(!cow.children.some((c) => c.userData.farOne), 'disposed: the copy gone');
});

test('FarShape: a part hidden by the game is not in the copy', () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); a.position.x = -2;
    const j = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); b.position.x = 5; j.add(b);
    g.add(a, j);
    j.visible = false; // (a joint hidden: the part under it is not drawn)
    const far = new FarShape(g);
    far.set(true);
    const bb = box(g);
    assert.ok(bb.max.x < 0, 'only the shown part');
    far.set(false);
    assert.ok(a.visible && b.visible, 'the flags as they were');
});
