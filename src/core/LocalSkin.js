/**
 * LocalSkin.js — кости скин-моделей считаются относительно самой модели, а не мира.
 *
 * Жалоба автора: «в аду дрожит рука» (на Земле — нет). Ад (и планеты) лежат далеко от начала мира (x ≈ 480 000 м).
 * three r128 кладёт в шейдер матрицы костей В МИРЕ (bone.matrixWorld) и вычитает мир модели уже на видеокарте
 * (bindMatrixInverse) — в 32-битных числах: у 480 000 шаг числа ≈ 3 см, и вершины рук/тела прыгали на эти сантиметры
 * от кадра к кадру. Здесь вычитание делается на процессоре в 64-битных числах: в шейдер идут маленькие числа
 * «кость относительно модели», а модель ставит на место её обычная modelMatrix (её three считает точно).
 * Условие: все скин-сетки этого скелета — дети `frame` без своего сдвига (как у FarShape, тела героя, горгулий).
 */
import * as THREE from 'three';

const _inv = new THREE.Matrix4(), _off = new THREE.Matrix4(), _id = new THREE.Matrix4();

/** Скелет кладёт в шейдер кости относительно `frame` (его мировой матрицы). */
export function localSkin(skeleton, frame) {
    if (!skeleton || !frame) return skeleton;
    skeleton.update = function localUpdate() {
        const bones = this.bones, inv = this.boneInverses, out = this.boneMatrices;
        _inv.copy(frame.matrixWorld).invert();
        for (let i = 0; i < bones.length; i++) {
            _off.multiplyMatrices(_inv, bones[i] ? bones[i].matrixWorld : _id).multiply(inv[i]);
            _off.toArray(out, i * 16);
        }
        if (this.boneTexture) this.boneTexture.needsUpdate = true;
    };
    return skeleton;
}

const _fi = new THREE.Matrix4();
/**
 * Сетка такого скелета: без «привязки к миру» (bindMatrix — единица, не пересчитывается от мира модели). `frame` — тот же, что у
 * скелета: расчёт вершины на процессоре (`boneTransform`: попадания, замеры, тесты) отдаёт её, как раньше, в координатах сетки.
 */
export function localBind(mesh, frame = null) {
    mesh.bindMode = 'detached';
    mesh.bindMatrix.identity();
    mesh.bindMatrixInverse.identity();
    if (frame) {
        mesh.boneTransform = function localBoneTransform(index, target) {
            THREE.SkinnedMesh.prototype.boneTransform.call(this, index, target); // (кости в мире, привязка — единица: точка в мире)
            return target.applyMatrix4(_fi.copy(frame.matrixWorld).invert());
        };
    }
    return mesh;
}
