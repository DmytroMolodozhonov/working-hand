/**
 * Chunks made in a web worker (terrain.worker.js) go into this computer's world as
 * they are: they must be the very same as the ones made here, whatever was made
 * before (a worker keeps other chunks than the main thread, and forgets them).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, mergeBuffers } from '../../src/world/Terrain.js';

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

test('the worker itself: a chunk changed here (a house built, a crater) is made there the same, and so is its grass', async () => {
    const sent = [];
    globalThis.self = { postMessage: (m) => sent.push(m) };
    await import('../../src/world/terrain.worker.js');
    const { buildFlora } = await import('../../src/world/FloraBuild.js');
    self.onmessage({ data: { type: 'init', opts: OPTS, skipSeaTop: true } });
    const here = make();
    // a wall of planks across a chunk border and a pit dug, here
    const cx = 5, cz = -3, x0 = cx * 32, z0 = cz * 32;
    for (let x = x0 + 26; x < x0 + 38; x++) for (let L = 0; L < 4; L++) here.set(x, here.topLayer(x, z0 + 10) + 1 + L, z0 + 10, 27);
    for (let x = x0 + 3; x < x0 + 6; x++) for (let z = z0 + 3; z < z0 + 6; z++) here.set(x, here.topLayer(x, z), z, 0);
    const chunks = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const c = here.chunk(cx + dx, cz + dz);
        if (c.modified) { const { rev, ...copy } = c; chunks.push(structuredClone(copy)); } // eslint-disable-line no-unused-vars
    }
    assert.ok(chunks.length >= 2, 'the changed chunks go along');
    self.onmessage({ data: { type: 'rebuild', id: 1, key: 'k', cx, cz, chunks, hidden: null } });
    const got = sent.pop(), w = here.buildChunkArrays(cx, cz), want = { land: mergeBuffers(w.ground, w.raised), water: w.water };
    assert.equal(got.type, 'rebuilt');
    for (const k of ['land', 'water']) for (const f of ['positions', 'colors', 'indices', 'skies']) same(got.arrays[k][f], want[k][f], `rebuilt ${k}.${f}`);
    // and the worker's own chunks are as generated again afterwards
    const fresh = make();
    self.onmessage({ data: { type: 'build', id: 2, key: 'k2', cx, cz, fcx: cx, fcz: cz, R: 4 } });
    same(sent.pop().chunk.blocks, fresh.chunk(cx, cz).blocks, 'the worker forgot the changed copy');
    // the grass of the changed chunk
    const { rev, ...copy } = here.chunk(cx, cz); // eslint-disable-line no-unused-vars
    self.onmessage({ data: { type: 'flora', id: 3, key: 'k', cx, cz, chunk: structuredClone(copy), hidden: null, rev: 7 } });
    const fl = sent.pop(), mine = buildFlora(here, here.chunk(cx, cz));
    assert.equal(fl.rev, 7);
    same(fl.out.pos, mine.pos, 'grass');
    // (TerrainView._share) the changed chunks sent once, then only named; changed again — sent again
    const keyOf = (c) => (c.cx + 0x8000) * 0x10000 + (c.cz + 0x8000);
    const fresh1 = chunks.map(({ sky, ...c }) => c); // eslint-disable-line no-unused-vars
    const use = chunks.map(keyOf);
    const check = (what) => {
        const g2 = sent.pop(), w2 = here.buildChunkArrays(cx, cz);
        const want2 = { land: mergeBuffers(w2.ground, w2.raised), water: w2.water };
        for (const k of ['land', 'water']) for (const f of ['positions', 'colors', 'indices', 'skies']) same(g2.arrays[k][f], want2[k][f], `${what} ${k}.${f}`);
    };
    self.onmessage({ data: { type: 'rebuild', id: 4, key: 'k', cx, cz, fresh: fresh1, use, drop: null, hidden: null } });
    check('sent');
    self.onmessage({ data: { type: 'rebuild', id: 5, key: 'k', cx, cz, fresh: [], use, drop: null, hidden: null } });
    check('kept there');
    here.set(x0 + 10, here.topLayer(x0 + 10, z0 + 20) + 1, z0 + 20, 27);
    const { rev: r2, sky: s2, ...again } = here.chunk(cx, cz); // eslint-disable-line no-unused-vars
    self.onmessage({ data: { type: 'rebuild', id: 6, key: 'k', cx, cz, fresh: [structuredClone(again)], use, drop: null, hidden: null } });
    check('changed again');
    // a chunk next to a changed one that this computer has not got yet: it comes along
    self.onmessage({ data: { type: 'rebuild', id: 7, key: 'k3', cx: cx + 3, cz, fresh: [], use, drop: use, hidden: null, wantChunk: true } });
    same(sent.pop().chunk.blocks, fresh.chunk(cx + 3, cz).blocks, 'the chunk itself');
    delete globalThis.self;
});

test('one mesh for a chunk\'s land: the ground and the raised faces together, nothing lost', () => {
    const d = make();
    const a = d.buildChunkArrays(4, 3), m = mergeBuffers(a.ground, a.raised);
    assert.equal(m.positions.length, a.ground.positions.length + a.raised.positions.length);
    assert.equal(m.indices.length, a.ground.indices.length + a.raised.indices.length);
    const nv = a.ground.positions.length / 3;
    for (let i = 0; i < a.raised.indices.length; i += 97) assert.equal(m.indices[a.ground.indices.length + i], a.raised.indices[i] + nv);
});
