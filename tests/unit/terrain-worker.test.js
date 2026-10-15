/**
 * Chunks made in a web worker (terrain.worker.js) go into this computer's world as
 * they are: they must be the very same as the ones made here, whatever was made
 * before (a worker keeps other chunks than the main thread, and forgets them).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';

const OPTS = { seed: 20261015, mountains: true, seas: true, test: true, deepCaves: true, lush: true };
const make = () => { const d = new TerrainData(); d.generate(OPTS); d.skipSeaTop = true; return d; };
const same = (a, b, what) => {
    assert.equal(a.length, b.length, what + ' length');
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) assert.fail(`${what} differs at ${i}`);
};

test('a chunk is the same whatever chunks were made before it, and so is its mesh', () => {
    const here = make(), worker = make();
    // the worker has made a different set of chunks, in another order, and forgot some
    for (const [x, z] of [[9, -4], [3, 3], [-6, 8], [4, 2], [5, 1], [12, 12]]) worker.chunk(x, z);
    worker.evictFar(0, 0, 1);
    for (const [cx, cz] of [[4, 3], [-2, -7], [7, -1]]) {
        const a = here.buildChunkArrays(cx, cz), b = worker.buildChunkArrays(cx, cz);
        const ca = here.chunk(cx, cz), cb = worker.chunk(cx, cz);
        same(ca.blocks, cb.blocks, 'blocks');
        same(ca.top, cb.top, 'tops');
        for (const k of ['ground', 'raised', 'water']) for (const f of ['positions', 'colors', 'indices', 'skies', 'patterns']) same(a[k][f], b[k][f], `${k}.${f}`);
        // the copy sent to the main thread is a plain object of typed arrays and numbers
        const copy = structuredClone({ ...cb });
        same(copy.blocks, ca.blocks, 'sent blocks');
    }
});

test('a castle planned in a worker and sent over is the same plan, and builds the same chunks', () => {
    const worker = make(), here = make(), plain = make();
    // the test castle (cell 0, −1) and its neighbours: planned in the worker, sent (structured clone)
    for (let gz = -2; gz <= 1; gz++) for (let gx = -2; gx <= 1; gx++) {
        const key = worker.castles._key(gx, gz);
        const c = worker.castles.cellOf(gx, gz), t = worker.towers.cellOf(gx, gz);
        here.castles.cells.set(key, structuredClone(c && { ...c, _byChunk: new Map() }));
        here.towers.cells.set(key, structuredClone(t && (t._byChunk ? { ...t, _byChunk: new Map() } : t)));
        const pc = plain.castles.cellOf(gx, gz);
        assert.deepEqual(here.castles.cells.get(key) && { ...here.castles.cells.get(key), _byChunk: null }, pc && { ...pc, _byChunk: null });
    }
    const castle = plain.castles.cellOf(0, -1);
    assert.ok(castle, 'the test castle');
    const cx = Math.floor(castle.x / 32), cz = Math.floor(castle.z / 32);
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) same(here.chunk(cx + dx, cz + dz).blocks, plain.chunk(cx + dx, cz + dz).blocks, 'castle chunk');
});
