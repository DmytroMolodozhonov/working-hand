// «Alive»: the living tree is its own tree — its very blocks (or its own model) — with a face, arms and root legs
// grown on it; asleep (form 0) it stands exactly where and as the tree stood.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { livingTreeModel, treeOwnLook } from '../../src/game/LivingTrees.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('a living tree of its own blocks: the same blocks where they stood, the face only as it wakes', () => {
    const cells = [];
    for (let L = 0; L < 5; L++) cells.push(0, L, 0, BLOCK.WOOD);
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let L = 4; L <= 6; L++) cells.push(x, L, z, BLOCK.LEAVES);
    const d = { x: 10, y: 3.5, z: -4, ry: 1.1, kind: 0, cells, fx: 10, fz: -4, L0: 5 }; // (its foot: block (10, 5, -4))
    const own = treeOwnLook(d);
    assert.ok(own && own.trunk.length === 1 && own.crown.length === 1, 'trunk and crown of its blocks');
    assert.equal(own.crownY, 4, 'the crown from its lowest leaves');
    const m = livingTreeModel({ trunk: 0x8b4513, leaf: 0x228b22, h: 7 }, own);
    assert.ok(m.userData.ownLook);
    // asleep: the legs in the ground (as LivingTrees._pose at form 0), the face closed
    m.userData.rig.position.y = -2.6;
    m.userData.face.scale.setScalar(1e-3);
    for (const a of m.userData.arms) a.sh.scale.setScalar(1e-3);
    m.position.set(d.x, d.y, d.z);
    m.rotation.y = d.ry;
    m.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const p of [...own.trunk, ...own.crown]) box.union(new THREE.Box3().setFromObject(p));
    const near = (a, b) => Math.abs(a - b) < 1e-3;
    // the blocks span x 7.5…12.5, layers 5…11 (y 3.5…10.5), z −6.5…−1.5 — as in the world
    assert.ok(near(box.min.x, 7.5) && near(box.max.x, 12.5) && near(box.min.z, -6.5) && near(box.max.z, -1.5), JSON.stringify(box));
    assert.ok(near(box.min.y, 3.5) && near(box.max.y, 10.5), JSON.stringify(box));
    const geo = own.trunk[0].geometry;
    assert.ok(geo.getAttribute('voxPat') && geo.getAttribute('color'), 'drawn as the world draws blocks');
    // unknown (a guest before the host's word): the made-up look
    assert.equal(treeOwnLook({ x: 0, y: 0, z: 0 }), null);
});
