import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CollisionWorld } from '../../src/world/Collision.js';

// Flat ground: layers ≤ 0 are solid, the feet of whoever stands on it are at y −0.5.
function flat() {
    const solid = (L) => L <= 0;
    return {
        topLayer: () => 0,
        surfaceY: () => -0.5,
        solidIn: (x, z, L0, L1) => { for (let L = L0; L <= L1; L++) if (solid(L)) return true; return false; },
        floorBelow: (x, z, L) => Math.min(L, 0),
        ceilingAbove: () => Infinity,
    };
}

// A lying horse sits low (base = 0.5 − lie·legH·0.9 goes negative for long legs). The author: «иду по миру — конь резко
// пролетает, будто телепорт». Its feet were taken as «body height − 0.5», far under the ground, so the flat ground stood
// over them as a wall and the collision threw the body ~10 m in one frame. The feet are the support: body height − base.
test('lying animal on flat ground: not thrown aside (feet measured from its support)', () => {
    const col = new CollisionWorld();
    col.setTerrain(flat());
    for (const base of [0.5, 0.2, -0.4, -1.3]) {
        const p = new THREE.Vector3(5, -0.5 + base, 3);
        col.resolveCylinder(p, 0.9, p.y - base, 2, 1.1);
        assert.ok(Math.hypot(p.x - 5, p.z - 3) < 1e-6, `base ${base}: stays (moved ${Math.hypot(p.x - 5, p.z - 3).toFixed(2)} m)`);
    }
});

test('the old measure (body height − 0.5) is what threw a lying long-legged animal', () => {
    const col = new CollisionWorld();
    col.setTerrain(flat());
    const p = new THREE.Vector3(5, -0.5 - 1.3, 3);
    col.resolveCylinder(p, 0.9, p.y - 0.5, 2, 1.1);
    assert.ok(Math.hypot(p.x - 5, p.z - 3) > 1, 'the old call shoved it');
});
