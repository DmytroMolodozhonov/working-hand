import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FarShape } from '../../src/core/FarShape.js';
import { animalModel, animateLegs } from '../../src/game/AnimalModels.js';

const drawn = (root) => { const out = []; root.traverseVisible((o) => { if (o.isMesh) out.push(o); }); return out; };
/** The model's shown surface in the world: every vertex of every drawn mesh (a skinned one — where its bones put it). */
const box = (root) => {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3(), v = new THREE.Vector3();
    for (const m of drawn(root)) {
        const P = m.geometry.attributes.position;
        if (m.isSkinnedMesh) m.skeleton.update();
        for (let i = 0; i < P.count; i++) {
            if (m.isSkinnedMesh) m.boneTransform(i, v).applyMatrix4(m.matrixWorld); else v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
            b.expandByPoint(v);
        }
    }
    return b;
};
const same = (a, b, what) => { for (const k of ['min', 'max']) for (const ax of ['x', 'y', 'z']) assert.ok(Math.abs(a[k][ax] - b[k][ax]) < 1e-3, `${what}: ${k}.${ax} ${a[k][ax]} vs ${b[k][ax]}`); };

test('FarShape: an animal is one shape per material, its parts moved by the video card (bones) — and back as it was', () => {
    const cow = animalModel('cow', 2);
    cow.position.set(40, 3, -12); cow.rotation.y = 0.7; cow.scale.setScalar(1.1);
    animateLegs(cow, 1.3, 1);
    const parts = drawn(cow), mats = new Set(parts.map((m) => m.material));
    const near = box(cow);
    const one = new FarShape(cow);
    one.set(true);
    const now = drawn(cow);
    const plain = [...mats].filter((m) => m.isMeshLambertMaterial && !m.map && !m.transparent).length;
    assert.equal(now.length, mats.size - plain + (plain ? 1 : 0), `${parts.length} parts → one draw per material, the plain-coloured ones in one (${now.length})`);
    // (a baked part's colour: its material's colour times its own)
    const bodyPart = parts.find((p) => p.material.isMeshLambertMaterial && !p.material.map);
    if (bodyPart) assert.ok(now.some((m) => m.material.name.startsWith('farshape-plain')));
    assert.ok(now.every((m) => m.isSkinnedMesh && m.material.skinning && m.userData.farOne));
    same(box(cow), near, 'the same body');
    // a new pose: followed at once (nothing to remake — the bones are the parts)
    animateLegs(cow, 2.9, 1);
    const posed = box(cow);
    one.set(false);
    same(box(cow), posed, 'posed by the card as the parts are');
    assert.equal(drawn(cow).length, parts.length);
    // another cow: the same geometry (made once for the kind)
    const cow2 = animalModel('cow', 2), two = new FarShape(cow2);
    two.set(true);
    one.set(true);
    const g1 = drawn(cow).map((m) => m.geometry), g2 = drawn(cow2).map((m) => m.geometry);
    assert.deepEqual(g1, g2, 'shared geometry');
    one.dispose(); two.dispose();
    assert.ok(!cow.children.some((c) => c.userData.farOne), 'disposed: the shape gone');
});

test('FarShape: a part hidden by the game is not in the shape; a pig\'s morphing wings stay themselves', () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); a.position.x = -2;
    const j = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); b.position.x = 5; j.add(b);
    g.add(a, j);
    j.visible = false;
    const one = new FarShape(g);
    one.set(true);
    assert.ok(box(g).max.x < 0, 'only the shown part');
    one.set(false);
    assert.ok(a.visible && b.visible, 'the flags as they were');
    const pig = animalModel('pig', 1), wings = [];
    pig.traverse((o) => { if (o.isMesh && o.material.morphTargets) wings.push(o); });
    const p1 = new FarShape(pig); p1.set(true);
    for (const w of wings) assert.ok(w.visible && !p1.parts.includes(w));
});
