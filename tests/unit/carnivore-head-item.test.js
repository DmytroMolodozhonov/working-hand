// «Головка плотоядной» (предмет): нижняя челюсть — зеркало верхней, как у живого растения, а не перевёрнутая назад.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' }) }) };
const { carnivoreHeadItemModel } = await import('../../src/fx/PlantModels.js');

test('предмет «головка плотоядной»: обе челюсти смотрят в одну сторону (вперёд от стебля), нижняя — под верхней, зубами вверх', () => {
    const g = carnivoreHeadItemModel();
    g.updateMatrixWorld(true);
    const [top, low] = g.children;
    const bt = new THREE.Box3().setFromObject(top), bl = new THREE.Box3().setFromObject(low);
    const ct = bt.getCenter(new THREE.Vector3()), cl = bl.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(ct.z - cl.z) < 0.04, `челюсти в разные стороны по z: ${ct.z.toFixed(3)} / ${cl.z.toFixed(3)}`);
    assert.ok(ct.y > cl.y, 'верхняя выше нижней');
    // зеркало: размеры одинаковые (с точностью до разной формы двух долей)
    assert.ok(Math.abs(bt.max.z - bl.max.z) < 0.05 && Math.abs(bt.min.z - bl.min.z) < 0.05);
    // нижняя долей отражена по высоте: определитель матрицы отрицателен (зеркало), у верхней положителен
    assert.ok(top.matrixWorld.determinant() > 0 && low.matrixWorld.determinant() < 0, 'нижняя — зеркало верхней');
});
