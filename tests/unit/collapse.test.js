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
