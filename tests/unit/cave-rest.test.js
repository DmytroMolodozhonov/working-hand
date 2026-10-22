import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CollisionWorld } from '../../src/world/Collision.js';

// rock everywhere up to layer 12 except a corridor along x (|z| ≤ 1), floor layer 0, air layers 1…4
const solid = (x, L, z) => L <= 12 && (Math.abs(z) > 1 || L <= 0 || L > 4);
function caveWorld() {
    const col = new CollisionWorld();
    col.setTerrain({
        topLayer: () => 12, surfaceY: () => 11.5,
        blockAt: (x, L, z) => (solid(x, L, z) ? 1 : 0),
        floorBelow: (x, z, L) => { for (let l = Math.min(L, 12); l >= -17; l--) if (solid(x, l, z)) return l; return -18; },
    });
    return col;
}

test('cave: a thing pressed into the wall is moved out sideways, not up to the surface', () => {
    const col = caveWorld();
    const p = new THREE.Vector3(5, 1.5, 1.8); // inside the wall rock
    assert.ok(col.inRock(p.x, p.y, p.z));
    assert.ok(col.pushOutOfRock(p));
    assert.ok(!col.inRock(p.x, p.y, p.z));
    assert.equal(p.y, 1.5);
    const gy = col.groundAt(p.x, p.z, p.y + 0.5);
    assert.ok(gy < 1, `the cave floor (${gy}), not the surface`);
});

test('cave: a body in the corridor stays on the cave floor', () => {
    const col = caveWorld();
    const p = new THREE.Vector3(5, 1.2, 0);
    assert.equal(col.pushOutOfRock(p), true);
    assert.ok(col.groundAt(p.x, p.z, p.y + 1) < 1);
});
