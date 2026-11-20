import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { BLOCK } from '../../src/world/Terrain.js';
import { findPassage, irisOrder, wallPlane } from '../../src/game/Stitching.js';

function wall(angle, axis = 'z', thickness = 1) {
    const slope = Math.tan(angle * Math.PI / 180);
    const get = (x, L, z) => {
        const u = axis === 'z' ? x : z, n = axis === 'z' ? z : x;
        if (Math.abs(u) > 25 || L < -10 || L > 20) return BLOCK.AIR;
        if (n < Math.round(slope * u) || n >= Math.round(slope * u) + thickness) return BLOCK.AIR;
        return Math.abs(u) <= 2 && L >= 1 && L <= 4 ? BLOCK.AIR : BLOCK.STONE;
    };
    return { get, slope };
}

for (const axis of ['x', 'z']) for (const angle of [-30, 30, 45]) {
    test(`Stitching follows the existing ${angle}° ${axis}-wall rather than laying an axis-aligned patch`, () => {
        const { get, slope } = wall(angle, axis);
        const o = axis === 'z' ? new Vector3(0, 1.5, -6) : new Vector3(-6, 1.5, 0);
        const d = axis === 'z' ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
        const found = findPassage(get, o, d);
        assert.ok(found.cells, JSON.stringify(found));
        assert.equal(found.cells.length, 20);
        for (const c of found.cells) {
            const u = axis === 'z' ? c.x : c.z, n = axis === 'z' ? c.z : c.x;
            assert.equal(n || 0, Math.round(slope * u) || 0);
            assert.equal(get(c.x, c.L, c.z), BLOCK.AIR);
        }
        const iris = irisOrder(get, found.cells, found.plane);
        assert.equal(iris.stones.length, 20);
        assert.ok(iris.stones.every(s => Number.isFinite(s.at) && s.to.toArray().every(Number.isFinite)));
        assert.ok(Math.abs(iris.normal.x) > .2 && Math.abs(iris.normal.z) > .2);
    });
}

test('a tilted two-block-thick wall still gets a patch inside its original thickness', () => {
    const { get, slope } = wall(30, 'z', 2);
    const found = findPassage(get, new Vector3(0, 1.5, -6), new Vector3(0, 0, 1));
    assert.ok(found.cells);
    assert.equal(typeof found.plane, 'object');
    for (const c of found.cells) assert.ok(c.z >= Math.round(slope * c.x) && c.z < Math.round(slope * c.x) + 2);
});

test('the patch follows the wall even when the wand approaches it obliquely', () => {
    const { get, slope } = wall(30);
    for (const x of [-3, 3]) {
        const o = new Vector3(x, 1.5, -6), d = new Vector3(0, 1.5, 0).sub(o).normalize();
        const found = findPassage(get, o, d);
        assert.equal(found.cells?.length, 20);
        for (const c of found.cells) assert.equal(c.z || 0, Math.round(slope * c.x) || 0);
    }
});

test('solid rock does not produce a fictitious tilted wall', () => {
    assert.equal(wallPlane(() => BLOCK.STONE, { x: 0, L: 2, z: 0 }, 'z'), null);
});
