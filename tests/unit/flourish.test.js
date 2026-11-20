/**
 * «Flourish» (the author 05.11): the earth turns to grass, then flowers. The words are its own; a bloom column always grows a flower
 * (FloraBuild), whatever the meadow; the flowers come back after a load (the snapshot) and by the network (`flr`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSpell } from '../../src/fx/SpellManager.js';
import * as THREE from 'three';
import { TerrainData, BLOCK, chunkKey } from '../../src/world/Terrain.js';
import { Flora, buildFlora } from '../../src/world/Flora.js';
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

test('Flourish greens the aimed cave floor, places flowers there, and leaves stone and the surface alone', () => {
    const t = new TerrainData();
    t.generate({ seed: 7, mountains: true });
    const x = 80, z = 80, layer = -7;
    const c = t.chunk(x >> 5, z >> 5);
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
        t.set(x + dx, layer, z + dz, dx === 0 && dz === 0 ? BLOCK.DIRT : BLOCK.STONE);
        t.set(x + dx, layer + 1, z + dz, BLOCK.AIR);
    }
    const top = t.topLayer(x, z), surface = t.get(x, top, z);
    assert.ok(top > layer + 1);
    const game = {
        localId: 'me', terrain: {data: t},
        dom: 'right', wandSide: () => 'right',
        character: {getHandDirection: (_, out) => out.set(0, -1, 0), getHandWorldPosition: (_, out) => out.set(x, -5, z)},
        combat: {pay: () => {}},
        builder: {
            _hitCell: () => ({x, z, L: layer, type: t.get(x, layer, z), point: {}}),
            _sendEdits: edits => { for (const cell of edits) t.set(...cell); },
        },
    };
    const F = new Flourish(game);
    assert.equal(F.cast(true), 'Flourish');
    F.update(2.3);
    assert.equal(t.get(x, layer, z), BLOCK.GRASS);
    assert.equal(t.get(x + 1, layer, z), BLOCK.STONE);
    assert.equal(t.get(x, top, z), surface);
    const flowers = new Flourish(game);
    flowers.restore([[x, z, layer]]);
    assert.deepEqual(flowers.snapshot(), [[x, z, layer]]);
    assert.ok(buildFlora(t, c).box[1] < -6, 'flower vertices belong to the cave, not the grass above');
});


test('an edited floor hides stale meadow geometry while the worker rebuilds it', () => {
    const data = new TerrainData();
    data.generate({ seed: 7 });
    const cx = 0, cz = 0, key = chunkKey(cx, cz);
    const c = data.chunk(cx, cz);
    const terrain = {
        data, group: new THREE.Group(), meshes: new Map([[key, {}]]),
        floraAsync: false, askFlora() {}, takeFlora: () => [],
    };
    const meadow = new Flora(terrain);
    const focus = { x: 4, z: 4 };
    meadow.update(focus, true);
    const old = meadow.meshes.get(key).mesh;
    assert.equal(old.visible, true);
    data.set(4, data.topLayer(4, 4) + 1, 4, BLOCK.PLANKS);
    c.rev = (c.rev || 0) + 1; // the built terrain mesh was swapped in
    terrain.floraAsync = true;
    meadow.update(focus);
    assert.equal(old.visible, false);
    terrain.takeFlora = () => [{ key, rev: c.rev, out: buildFlora(data, c) }];
    meadow.update(focus);
    const current = meadow.meshes.get(key).mesh;
    assert.notEqual(current, old);
    assert.equal(current.visible, true);
    meadow.dispose();
});
