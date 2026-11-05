/**
 * «Flourish» (the author 05.11): the earth turns to grass, then flowers. The words are its own; a bloom column always grows a flower
 * (FloraBuild), whatever the meadow; the flowers come back after a load (the snapshot) and by the network (`flr`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { buildFlora } from '../../src/world/FloraBuild.js';
import { Flourish, GREENS } from '../../src/game/Flourish.js';

test('the words: «Flourish» / «флориш» — and not everyday speech', () => {
    for (const t of ['Flourish', 'флориш', 'флёриш']) assert.equal(matchSpell(t), 'Flourish', t);
    for (const t of ['я сегодня ходил гулять', 'флаг']) assert.notEqual(matchSpell(t), 'Flourish', t);
    assert.ok(GREENS.has(BLOCK.DIRT) && !GREENS.has(BLOCK.SAND) && !GREENS.has(BLOCK.STONE));
});

test('a bloom column grows a flower on its grass; the chunk is made again; the list comes back after a load', () => {
    const t = new TerrainData();
    t.generate({ seed: 7, mountains: true });
    // a grass column near the start
    let gx = null, gz = null;
    for (let x = 60; x < 140 && gx == null; x++) for (let z = 60; z < 140; z++) { if (t.get(x, t.topLayer(x, z), z) === BLOCK.GRASS && t.get(x, t.topLayer(x, z) + 1, z) === BLOCK.AIR) { gx = x; gz = z; break; } }
    assert.ok(gx != null, 'grass found');
    const c = t.chunk(gx >> 5, gz >> 5);
    const before = buildFlora(t, c).count;
    const rev = c.rev || 0;
    // every grass column of the chunk asked to flower: many more flowers than the meadow had
    for (let x = c.cx * 32; x < c.cx * 32 + 32; x++) for (let z = c.cz * 32; z < c.cz * 32 + 32; z++) t.setBloom(x, z);
    assert.ok((c.rev || 0) > rev, 'the chunk is made again');
    const after = buildFlora(t, c).count;
    assert.ok(after >= before, `flowers ${before} → ${after}`);
    const F = new Flourish({ terrain: { data: t }, fx: null });
    F.bloomed.push([gx, gz]);
    const t2 = new TerrainData(); t2.generate({ seed: 7, mountains: true });
    const G = new Flourish({ terrain: { data: t2 }, fx: null });
    G.restore(JSON.parse(JSON.stringify(F.snapshot())));
    assert.ok(t2._bloom?.size, 'the flowers back after a load');
});
