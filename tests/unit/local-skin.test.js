import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FarShape } from '../../src/core/FarShape.js';

// Жалоба автора: «в аду дрожит рука». Ад — x ≈ 480 000 м: у 32-битных чисел видеокарты там шаг ≈ 3 см, а кости шли в шейдер
// в мировых координатах и вычитались уже на карте — вершины прыгали. Теперь в шейдер идёт «кость относительно модели» (LocalSkin).
test('кости одной формы (FarShape) — относительно модели: в аду (x 480 000) числа в шейдере маленькие, вершина там же, где у частей', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshLambertMaterial({ color: 0xff0000 }));
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), new THREE.MeshLambertMaterial({ color: 0xff0000 }));
    a.position.set(0.3, 1.2, 0.1); b.position.set(-0.2, 0.7, 0.05); b.rotation.z = 0.4;
    root.add(a, b);
    root.position.set(480013.37, 21.5, -2017.25); root.rotation.y = 0.7;
    root.userData.farRadius = 2;
    const fs = new FarShape(root); fs.set(true);
    root.updateMatrixWorld(true);
    const mesh = fs.meshes[0];
    assert.ok(mesh, 'форма собрана');
    mesh.skeleton.update();
    const M = mesh.skeleton.boneMatrices;
    for (let i = 0; i < M.length; i += 16) assert.ok(Math.abs(M[i + 12]) < 5 && Math.abs(M[i + 14]) < 5, `кость ${i / 16}: сдвиг ${M[i + 12].toFixed(1)}, ${M[i + 14].toFixed(1)} — относительно модели`);
    // вершина как в шейдере (32-битные числа): modelMatrix · (кость · позиция) — там же, где у самой части в мире
    const f = (x) => Math.fround(x);
    const bone = new THREE.Matrix4().fromArray(Array.from(M.slice(0, 16), f));
    const p = new THREE.Vector3(0.1, 0.1, 0.1).applyMatrix4(bone).applyMatrix4(mesh.matrixWorld);
    const want = new THREE.Vector3(0.1, 0.1, 0.1).applyMatrix4(mesh.skeleton.bones[0].matrixWorld);
    assert.ok(p.distanceTo(want) < 1e-3, `вершина ушла на ${p.distanceTo(want)} м`);
    assert.equal(mesh.bindMode, 'detached');
});
