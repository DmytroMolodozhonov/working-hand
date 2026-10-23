// After a blast the ground the creatures stand on is the real surface (no one is left sunk in the earth).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';

const world = () => { const d = new TerrainData(); d.generate({ seed: 1 }); return d; };
/** the true top solid layer of a column, read from the blocks */
function trueTop(d, ix, iz) {
    for (let L = 120; L > -60; L--) { const b = d.get ? d.get(ix, L, iz) : 0; if (b !== BLOCK.AIR && b !== BLOCK.WATER && b !== undefined) return L; }
    return -60;
}

test('after a blast surfaceY / floorAt equal the real top of every column in and around the crater', () => {
    const d = world();
    const cx = 10, cz = 10, cy = d.surfaceY(cx, cz);
    d.removeSphere(cx, cy, cz, 7);
    let bad = 0, worst = 0;
    for (let ix = cx - 10; ix <= cx + 10; ix++) for (let iz = cz - 10; iz <= cz + 10; iz++) {
        const real = d.floorBelow(ix, iz, 200) - 0.5, s = d.surfaceY(ix, iz), f = d.floorAt(ix, iz, s + 1.1);
        const err = Math.max(Math.abs(real - s), Math.abs(real - f));
        if (err > 0.01) { bad++; worst = Math.max(worst, err); }
    }
    assert.equal(bad, 0, `${bad} columns disagree, worst ${worst}`);
});
