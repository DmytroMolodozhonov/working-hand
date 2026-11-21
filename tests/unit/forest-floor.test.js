// The undergrowth of the forest (ForestRules.js, ForestModel.js; generation 36): where things lie, that they are real shapes, that nothing is in a wrong place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, WORLD_GEN, BLOCK, MIN_LAYER, CHUNK } from '../../src/world/Terrain.js';
import { BIOME } from '../../src/world/Landscape.js';
import { FOREST, FOREST_FROM_GEN, KINDS, forestOfChunk, boxesOf } from '../../src/world/ForestRules.js';
import { forestArrays } from '../../src/world/ForestModel.js';

const OPTS = { mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, meshTrees: true, waterfalls: true, buildings: true, dungeons: true };
const world = (seed) => { const d = new TerrainData(); d.generate({ seed, ...OPTS }); return d; };

function forestChunks(d, seedSteps) {
    const out = [];
    for (let cz = -30; cz < 10; cz++) for (let cx = -20; cx < 10; cx++) {
        const c = d.chunk(cx, cz); let f = 0;
        for (const b of c.bio) if (b === BIOME.forest) f++;
        if (f >= 600) out.push(c);
        if (out.length >= seedSteps) return out;
    }
    return out;
}

test('the forest has its undergrowth: every kind, deterministic, on forest grass, off the trunks', () => {
    assert.equal(FOREST_FROM_GEN, 36);
    assert.ok(WORLD_GEN >= FOREST_FROM_GEN);
    const d = world(1), chunks = forestChunks(d, 120), seen = {};
    assert.ok(chunks.length > 30, 'forest exists');
    const COLS = CHUNK * CHUNK;
    for (const c of chunks) {
        const a = forestOfChunk(d, c), b = forestOfChunk(d, c);
        assert.deepEqual(a.map((r) => r.id + r.x.toFixed(2)), b.map((r) => r.id + r.x.toFixed(2)), 'the same twice');
        for (const it of a) {
            seen[it.k] = (seen[it.k] || 0) + 1;
            assert.ok(it.v >= 0 && it.v < KINDS[it.k], 'a real shape');
            assert.ok(it.x >= c.cx * CHUNK && it.x < (c.cx + 1) * CHUNK && it.z >= c.cz * CHUNK && it.z < (c.cz + 1) * CHUNK, 'inside its chunk');
            const col = (Math.round(it.z) - c.cz * CHUNK) * CHUNK + (Math.round(it.x) - c.cx * CHUNK);
            assert.equal(c.bio[col], BIOME.forest, 'on forest land');
            const L = c.top[col], i = (L - MIN_LAYER) * COLS + col;
            assert.equal(c.blocks[i], BLOCK.GRASS, 'on a grass block');
            assert.ok(Math.abs(it.y - (L - 0.5)) < 0.01, 'on the top of the ground');
            if (it.k !== 'litter' && it.k !== 'twig') for (const t of c.trees || []) assert.ok(Math.hypot(t.x - it.x, t.z - it.z) > 1.3, it.k + ' not in a trunk'); // (leaves and sticks may lie round a trunk's foot)
        }
    }
    for (const k of Object.keys(KINDS)) assert.ok(seen[k] > 0, 'there are ' + k);
    const total = Object.values(seen).reduce((s, n) => s + n, 0);
    assert.ok(total / chunks.length > 40, `rich floor: ${(total / chunks.length).toFixed(0)} things a chunk`);
    assert.ok(total / chunks.length < 150, 'not a carpet');
    // the small things are the many, the solid ones are the few
    assert.ok(seen.fern > seen.log * 10 && seen.litter > seen.stump * 4);
});

test('solid things keep clear of each other, of the chunk edge and of the trees; their boxes stand on the ground', () => {
    const d = world(1), chunks = forestChunks(d, 80);
    for (const c of chunks) {
        const items = forestOfChunk(d, c), solid = items.filter((i) => boxesOf(i).length);
        for (const it of solid) {
            for (const b of boxesOf(it)) {
                assert.ok(b.minX >= c.cx * CHUNK - 0.01 && b.maxX <= (c.cx + 1) * CHUNK + 0.01 && b.minZ >= c.cz * CHUNK - 0.01 && b.maxZ <= (c.cz + 1) * CHUNK + 0.01, it.k + ' box inside its chunk');
                assert.ok(b.maxY > b.minY && b.minY === it.y, 'stands on the ground');
            }
        }
        for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
            assert.ok(Math.hypot(solid[i].x - solid[j].x, solid[i].z - solid[j].z) > 1.5, 'two solid things not in one place');
        }
    }
});

test('another biome has no undergrowth; an old world is untouched (the land itself is the same, nothing in the blocks)', () => {
    const d = world(1);
    let other = null;
    for (let cx = -20; cx < 20 && !other; cx++) { const c = d.chunk(cx, 3); if (c.bio.every((b) => b !== BIOME.forest)) other = c; }
    assert.ok(other, 'a chunk without forest');
    assert.equal(forestOfChunk(d, other).length, 0);
    assert.equal(forestOfChunk(d, null).length, 0);
});

test('the shapes are real: many triangles, finite, with a size of their own, colours in range', () => {
    let tris = 0;
    for (const [k, n] of Object.entries(KINDS)) {
        if (k === 'stone') continue; // (the boulders are RockModel's)
        for (let v = 0; v < n; v++) {
            const a = forestArrays(k, v);
            assert.ok(a.count > 0 && a.count % 3 === 0, k + v + ' triangles');
            for (const arr of [a.pos, a.nor, a.col, a.uv]) for (const x of arr) assert.ok(Number.isFinite(x), k + v + ' finite');
            for (const x of a.col) assert.ok(x >= 0 && x <= 1.2, 'colour in range');
            for (const x of a.uv) assert.ok(x >= 0 && x <= 1, 'uv inside the atlas');
            let h = 0; for (let i = 1; i < a.pos.length; i += 3) h = Math.max(h, a.pos[i]);
            assert.ok(h > 0.05 && h < 4, k + v + ' height ' + h.toFixed(2));
            tris += a.count / 3;
            assert.ok(a.count / 3 < 1500, k + v + ' is cheap: ' + a.count / 3 + ' triangles');
        }
    }
    assert.ok(tris < 12000, 'all the shapes together are light: ' + tris);
    // mushrooms differ from one another (four real sorts)
    const sig = [0, 1, 2, 3].map((v) => { const a = forestArrays('mush', v); return a.count + ':' + a.col.slice(0, 9).join(','); });
    assert.equal(new Set(sig).size, 4);
});
