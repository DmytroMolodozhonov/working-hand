// The small things of the rivers' and lakes' edges (ShoreRules.js, ShoreModel.js; generation 36).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, WORLD_GEN, CHUNK } from '../../src/world/Terrain.js';
import { SHORE, SHORE_FROM_GEN, SHORE_KINDS, shoreOfChunk, chunkHasWater } from '../../src/world/ShoreRules.js';
import { shoreArrays } from '../../src/world/ShoreModel.js';

const OPTS = { mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, meshTrees: true, waterfalls: true, buildings: true, dungeons: true };
const world = (seed) => { const d = new TerrainData(); d.generate({ seed, ...OPTS }); return d; };

test('shores have their small things: every kind, deterministic, in fresh water or on its bank, never in the sea or a built place', () => {
    assert.equal(SHORE_FROM_GEN, 36); assert.ok(WORLD_GEN >= SHORE_FROM_GEN);
    const d = world(1), seen = {};
    let chunks = 0, withItems = 0;
    for (let cz = -30; cz < 10; cz++) for (let cx = -20; cx < 10; cx++) {
        const c = d.chunk(cx, cz); chunks++;
        const a = shoreOfChunk(d, c), b = shoreOfChunk(d, c);
        assert.deepEqual(a.map((r) => r.id + r.x.toFixed(2)), b.map((r) => r.id + r.x.toFixed(2)), 'the same twice');
        if (a.length) withItems++;
        for (const it of a) {
            seen[it.k] = (seen[it.k] || 0) + 1;
            assert.ok(it.v >= 0 && it.v < SHORE_KINDS[it.k], 'a real shape');
            assert.ok(it.x >= cx * CHUNK && it.x < (cx + 1) * CHUNK && it.z >= cz * CHUNK && it.z < (cz + 1) * CHUNK, 'inside its chunk');
            assert.ok(Number.isFinite(it.y) && it.s > 0.5 && it.s < 1.6);
            d.heightAt(Math.round(it.x), Math.round(it.z));
            assert.ok(!d.heightAt.sea, it.k + ' not in the sea');
            if (it.k === 'lily' || it.k === 'reed') assert.ok(d.heightAt.water > 0 && d.heightAt.water <= SHORE.SHALLOW + 1, it.k + ' stands in shallow water');
            else assert.ok(!(d.heightAt.water > 0), it.k + ' is on dry ground');
            if (it.k === 'lily') { assert.ok(it.surf > it.y, 'floats above the bed'); assert.ok(!d.heightAt.river, 'in still water'); }
            assert.ok(!d.sites.landAt(Math.round(it.x), Math.round(it.z)), 'not in a built place');
        }
    }
    for (const k of Object.keys(SHORE_KINDS)) assert.ok(seen[k] > 0, 'there are ' + k);
    assert.ok(withItems > 30 && withItems < chunks * 0.45, `${withItems} of ${chunks} chunks have shores (some, not everywhere)`);
    assert.ok(seen.pebbles > 100 && seen.reed > 100);
});

test('a dry chunk costs nothing and has nothing', () => {
    const d = world(1);
    let dry = null;
    for (let cx = -20; cx < 10 && !dry; cx++) if (!chunkHasWater(d, cx, 3)) dry = d.chunk(cx, 3);
    assert.ok(dry);
    assert.equal(shoreOfChunk(d, dry).length, 0);
    assert.equal(shoreOfChunk(d, null).length, 0);
});

test('the shapes are real, cheap and inside the atlas', () => {
    let tris = 0;
    for (const [k, n] of Object.entries(SHORE_KINDS)) for (let v = 0; v < n; v++) {
        const a = shoreArrays(k, v);
        assert.ok(a.count > 0 && a.count % 3 === 0);
        for (const arr of [a.pos, a.nor, a.col, a.uv]) for (const x of arr) assert.ok(Number.isFinite(x), k + v);
        for (const x of a.uv) assert.ok(x >= 0 && x <= 1);
        tris += a.count / 3; assert.ok(a.count / 3 < 700, k + v + ' cheap');
    }
    assert.ok(tris < 6000, 'all together light: ' + tris);
    let h = 0; for (let i = 1; i < shoreArrays('reed', 0).pos.length; i += 3) h = Math.max(h, shoreArrays('reed', 0).pos[i]);
    assert.ok(h > 3, 'reeds are taller than a hero (3.5 m high)');
});
