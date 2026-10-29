import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { findHanging, collapseAfter } from '../../src/world/Collapse.js';

function flat() { const d = new TerrainData(); d.generate({ seed: 1 }); return d; }
/** A little house: 4 walls 5 high on the grass, a flat roof on top. */
function house(d, x0, z0) {
    for (let L = 1; L <= 5; L++) for (let i = 0; i <= 6; i++) {
        d.set(x0 + i, L, z0, BLOCK.PLANKS); d.set(x0 + i, L, z0 + 6, BLOCK.PLANKS);
        d.set(x0, L, z0 + i, BLOCK.PLANKS); d.set(x0 + 6, L, z0 + i, BLOCK.PLANKS);
    }
    for (let i = 0; i <= 6; i++) for (let k = 0; k <= 6; k++) d.set(x0 + i, 6, z0 + k, BLOCK.ROOF_RED);
}

test('a roof whose walls were blown away falls down and lands on the ground (part of it breaks)', () => {
    const d = flat();
    house(d, 10, 10);
    // one blast takes one wall: the roof still hangs on the other three
    d.removeSphere(13, 1, 10, 3.2);
    assert.equal(collapseAfter(d, 13, 1, 10, 3.2).length, 0, 'held by the other walls');
    assert.equal(d.get(13, 6, 13), BLOCK.ROOF_RED);
    // all the walls cut through at the bottom: the whole top falls
    for (let L = 1; L <= 2; L++) for (let i = 0; i <= 6; i++) for (const [x, z] of [[10 + i, 10], [10 + i, 16], [10, 10 + i], [16, 10 + i]]) d.set(x, L, z, BLOCK.AIR);
    const falls = collapseAfter(d, 13, 1, 13, 3);
    assert.equal(falls.length, 1);
    const f = falls[0];
    assert.equal(f.d, 2, 'it falls until it meets the ground');
    assert.ok(f.landed.length > 0.8 * f.cells.length, 'most of it lands whole');
    assert.equal(d.get(13, 6, 13), BLOCK.AIR, 'nothing hangs where the roof was');
    assert.equal(d.get(13, 4, 13), BLOCK.ROOF_RED, 'the roof lies lower now');
    assert.equal(d.get(10, 1, 13), BLOCK.PLANKS, 'the walls stand on the ground under it');
});

test('blocks standing on the ground, and natural rock, never fall; the same on every computer', () => {
    const a = flat(), b = flat();
    for (const d of [a, b]) {
        house(d, 0, 0);
        // a floating slab (a cut-off floor) and a pillar on the ground
        for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) d.set(30 + i, 8, 30 + k, BLOCK.CS_GREY);
        for (let L = 1; L <= 8; L++) d.set(40, L, 40, BLOCK.CS_GREY);
    }
    const ha = findHanging(a, 31, 7, 31, 3), hb = findHanging(b, 31, 7, 31, 3);
    assert.equal(ha.length, 1);
    assert.deepEqual(ha[0].cells.sort(), hb[0].cells.sort());
    assert.equal(findHanging(a, 40, 3, 40, 3).length, 0, 'a pillar on the ground stands');
    const fa = collapseAfter(a, 31, 7, 31, 3), fb = collapseAfter(b, 31, 7, 31, 3);
    assert.deepEqual(fa.map((f) => [f.d, f.landed.length]), fb.map((f) => [f.d, f.landed.length]));
    assert.equal(fa[0].d, 7);
    assert.equal(findHanging(a, 0, 0, 0, 4).length, 0, 'grass and rock hold');
});

test('a hanging piece of a wizards\' tower floor falls through the room below', () => {
    const d = new TerrainData(); d.generate({ seed: 12345, mountains: true });
    const k = d.towers.spawnKey(); const gx = Math.round(k / 65536), gz = k - gx * 65536;
    const w = d.towers.cellOf(gx, gz);
    // the first floor's slab (l 6 → layer 7) cut round a 3×3 piece in the middle of a room
    const x = w.x, z = w.z + (w.rot === 0 ? 7 : 0) + (w.rot === 2 ? -7 : 0), xx = x + (w.rot === 1 ? -7 : w.rot === 3 ? 7 : 0);
    const L = 7;
    assert.ok(d.get(xx, L, z) !== BLOCK.AIR, 'there is a floor');
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (Math.max(Math.abs(i), Math.abs(j)) === 3) d.set(xx + i, L, z + j, BLOCK.AIR);
    const falls = collapseAfter(d, xx + 3, L - 1, z, 1);
    assert.ok(falls.length >= 1, 'the cut-out piece falls');
    assert.equal(d.get(xx, L, z), BLOCK.AIR);
});

import { toppleOf, turned, COLLAPSE, dropPiece } from '../../src/world/Collapse.js';

/** A 5-wide, 8-tall block of planks hanging 2 above the ground, with a one-block stub under its +x end... or its −x end. */
function hangingTower(d, x0, z0, stubAt) {
    for (let L = 3; L <= 10; L++) for (let i = 0; i < 5; i++) for (let k = 0; k < 3; k++) d.set(x0 + i, L, z0 + k, BLOCK.PLANKS);
    for (let k = 0; k < 3; k++) d.set(x0 + stubAt, 1, z0 + k, BLOCK.STONE);
}

test('the weight beyond its footing turns a piece over: it topples to the weaker side, not straight down; the same on every computer', () => {
    const a = flat(), b = flat();
    for (const d of [a, b]) hangingTower(d, 20, 20, 0); // the stub under the −x end only
    const fa = collapseAfter(a, 22, 6, 21, 8), fb = collapseAfter(b, 22, 6, 21, 8);
    assert.equal(fa.length, 1);
    const f = fa[0];
    assert.ok(f.tilt, 'it turned over');
    assert.equal(f.tilt.axis, 'x');
    assert.equal(f.tilt.sg, 1, 'towards the side that has no support (+x)');
    assert.ok(f.landed.length > 0, 'it lies somewhere');
    // lying down: it is long in x now (it was tall), and low
    const xs = f.landed.map((c) => c[0]), ys = f.landed.map((c) => c[1]);
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 6, 'it lies along x');
    assert.ok(Math.max(...ys) - Math.min(...ys) <= 6, 'and low');
    assert.deepEqual(fa.map((x) => [x.d, x.landed.length, x.broken.length, x.tilt?.sg]), fb.map((x) => [x.d, x.landed.length, x.broken.length, x.tilt?.sg]), 'the same everywhere');
    for (const c of f.landed) assert.equal(a.get(c[0], c[1], c[2]), c[3], 'the data holds the landed blocks');
    assert.equal(a.get(22, 8, 21), BLOCK.AIR, 'nothing hangs where it was');
    // the other side: the stub under the +x end — it topples towards −x
    const c = flat();
    hangingTower(c, 20, 20, 4);
    const fc = collapseAfter(c, 22, 6, 21, 8);
    assert.equal(fc[0].tilt.sg, -1);
});

test('a piece resting evenly on its footing, or a low one, still comes straight down; the turning can be switched off', () => {
    const d = flat();
    house(d, 10, 10);
    for (let L = 1; L <= 2; L++) for (let i = 0; i <= 6; i++) for (const [x, z] of [[10 + i, 10], [10 + i, 16], [10, 10 + i], [16, 10 + i]]) d.set(x, L, z, BLOCK.AIR);
    const f = collapseAfter(d, 13, 1, 13, 3)[0];
    assert.ok(!f.tilt, 'a roof on its walls lands flat');
    const e = flat();
    hangingTower(e, 20, 20, 0);
    COLLAPSE.TOPPLE = false;
    try { assert.ok(!collapseAfter(e, 22, 6, 21, 8)[0].tilt, 'switched off: straight down as before'); } finally { COLLAPSE.TOPPLE = true; }
});

test('turned(): a block of the footing lies next to the footing, the ones above it lie beyond — mirrored for the other side and the z axis', () => {
    const T = { axis: 'x', sg: 1, edge: 4, Lb: 1 };
    assert.deepEqual(turned([4, 3, 0], 2, T), [5, 1, 0], 'the footing\'s own corner block');
    assert.deepEqual(turned([4, 7, 0], 2, T), [9, 1, 0], 'four above it: four beyond');
    assert.deepEqual(turned([2, 3, 0], 2, T), [5, 3, 0], 'two columns inside: two layers up');
    const M = { axis: 'x', sg: -1, edge: 0, Lb: 1 };
    assert.deepEqual(turned([0, 7, 0], 2, M), [-5, 1, 0]);
    const Z = { axis: 'z', sg: 1, edge: 2, Lb: 1 };
    assert.deepEqual(turned([5, 4, 2], 1, Z), [5, 1, 5]);
});
