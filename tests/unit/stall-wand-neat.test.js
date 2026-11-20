// A wand laid out on a counter lies along it, neatly (CastleTalk restock; the author 19.11: «палочки криво лежат»): the same quaternion, run through
// the settling rule of Items._physics (axis → yaw → rotation), gives the same direction — along the counter, flat.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const lay = (along, flip) => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, (along ? -Math.PI / 2 : 0) + (flip ? Math.PI : 0), 0, 'YXZ'));
test('the wand lies along the counter (x if the counter is long in x, else z), flat, whichever end is left', () => {
    for (const flip of [false, true]) {
        const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(lay(true, flip));
        assert.ok(Math.abs(ax.z) < 1e-6 && Math.abs(Math.abs(ax.x) - 1) < 1e-6 && Math.abs(ax.y) < 1e-6, `along x: ${ax.toArray()}`);
        const bz = new THREE.Vector3(0, 1, 0).applyQuaternion(lay(false, flip));
        assert.ok(Math.abs(bz.x) < 1e-6 && Math.abs(Math.abs(bz.z) - 1) < 1e-6 && Math.abs(bz.y) < 1e-6, `along z: ${bz.toArray()}`);
        // (the settling rule: it keeps this direction — yaw from the axis, flat)
        const m = new THREE.Object3D(); m.quaternion.copy(lay(true, flip));
        const a = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion);
        m.rotation.set(-Math.PI / 2, Math.atan2(-a.x, -a.z), 0, 'YXZ');
        const after = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion);
        assert.ok(after.distanceTo(a) < 1e-6, 'the settled wand points the same way');
    }
});
