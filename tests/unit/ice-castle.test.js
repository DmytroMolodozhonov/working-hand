// The Ice Castle (src/world/IceCastle.js) and its life (src/game/IceQueen.js): one castle per world from
// the seed alone; on the creative test ground — on the mountain by the start; the queen, the snowmen,
// the monsters by their tables; the Ice Rod's «Frozen».
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, TEST_CAVE } from '../../src/world/Terrain.js';
import { ICE_BLOCK, ICE_CASTLE } from '../../src/world/IceCastle.js';

const world = (seed, test = false) => {
    const d = new TerrainData();
    d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, test });
    return d;
};

test('one Ice Castle per world: the same from the same seed, far from the start, built of ice', () => {
    for (const k of ['WALL', 'GLOW', 'FLOOR', 'DARK']) assert.equal(BLOCK['ICE_' + k], ICE_BLOCK[k]);
    const a = world(12345).iceCastle.plan, b = world(12345).iceCastle.plan;
    assert.ok(a, 'a castle in the world');
    assert.deepEqual([a.x, a.z, a.F, a.rot], [b.x, b.z, b.F, b.rot], 'the same seed — the same castle (every computer, the workers)');
    const d = Math.hypot(a.x, a.z);
    assert.ok(d > ICE_CASTLE.MIN * 0.8 && d < ICE_CASTLE.MAX * 1.15, `far from the start, but reachable: ${Math.round(d)} m`);
    // it is ONE: the index knows exactly one castle, whatever is asked
    const t = world(12345);
    assert.equal(t.sites.ice, t.iceCastle);
    assert.ok(t.sites.landAt(Math.round(a.x), Math.round(a.z))?.ice, 'its summit is levelled');
    // its blocks are in the chunks: the hall's snowflake floor under the throne, glacier ice in the walls
    const thr = a.throne;
    let ice = 0;
    for (let L = a.F; L <= a.F + 6; L++) if (t.get(Math.round(thr.x), L, Math.round(thr.z)) >= BLOCK.ICE_WALL) ice++;
    assert.ok(ice >= 2, 'the throne and its dais are ice');
    const floor = t.get(Math.round(a.hall.x), a.floor, Math.round(a.hall.z));
    assert.ok(floor === BLOCK.ICE_FLOOR || floor === BLOCK.ICE_GLOW, 'the hall floor: ice with a snowflake');
    // the gates: an opening through the wall (the leaves are doors)
    assert.equal(t.get(Math.round(a.gate.x), a.floor + 2, Math.round(a.gate.z)), BLOCK.AIR);
    // a different world, a different place
    const c = world(777).iceCastle.plan;
    assert.ok(c && (c.x !== a.x || c.z !== a.z));
});

test('Creative: the castle stands on the mountain right by the start (seen at once)', () => {
    const p = world(42, true).iceCastle.plan;
    assert.ok(p);
    assert.ok(Math.hypot(p.x - TEST_CAVE.X, p.z - TEST_CAVE.Z) < TEST_CAVE.R, 'on the test mountain');
    assert.ok(Math.hypot(p.x, p.z) < 150, 'by the start');
});
