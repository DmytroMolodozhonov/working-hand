import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE } from '../../src/world/BlockShapes.js';
import { BLOCK, CHUNK, PATTERN, TerrainData, chunkKey } from '../../src/world/Terrain.js';

function floorVertices(data, cx, cz, pattern) {
    const b = data.buildChunkArrays(cx, cz).ground;
    const out = [];
    for (let i = 0; i < b.patterns.length; i++) {
        if (b.patterns[i] !== pattern || b.normals[i * 3 + 1] !== 1 || b.positions[i * 3 + 1] !== -10.5) continue;
        out.push([b.positions[i * 3], b.positions[i * 3 + 2], b.geology[i]]);
    }
    return out;
}

test('soil and stone share a continuous material transition between chunks', () => {
    const data = new TerrainData();
    data.generate({ seed: 1 });
    for (let z = 7; z <= 13; z++) for (let x = CHUNK - 4; x <= CHUNK + 3; x++) {
        data.set(x, -10, z, x < CHUNK ? BLOCK.DIRT : BLOCK.STONE);
        data.set(x, -9, z, BLOCK.AIR);
    }
    const dirt = floorVertices(data, 0, 0, PATTERN.SOIL);
    const rock = floorVertices(data, 1, 0, PATTERN.ROCK);
    const seam = CHUNK - .5;
    for (const [verts, ownX, pure] of [[dirt, seam - 1, 0], [rock, seam + 1, 255]]) {
        const edge = verts.filter(([x]) => x === seam);
        assert.ok(edge.length >= 2);
        assert.ok(edge.every(([, , weight]) => weight === 128));
        assert.ok(verts.some(([x, , weight]) => x === ownX && weight === pure));
    }
});

test('a diagonal block edit rebuilds a shared chunk vertex', () => {
    const data = new TerrainData();
    data.generate({ seed: 1 });
    for (let z = CHUNK - 2; z <= CHUNK; z++) for (let x = CHUNK - 2; x <= CHUNK; x++) {
        data.set(x, -10, z, BLOCK.STONE);
        data.set(x, -9, z, BLOCK.AIR);
    }
    const corner = CHUNK - .5;
    const sample = () => floorVertices(data, 0, 0, PATTERN.ROCK)
        .filter(([x, z]) => x === corner && z === corner).map(([, , w]) => w);
    assert.deepEqual(sample(), [255]);
    data.dirtyChunks.clear();
    data.set(CHUNK, -10, CHUNK, BLOCK.DIRT);
    assert.ok(data.dirtyChunks.has(chunkKey(0, 0)));
    assert.deepEqual(sample(), [128]);
});

test('shaped soil and stone use the same weight halfway up a slab edge', () => {
    const data = new TerrainData();
    data.generate({ seed: 1 });
    for (const [x, type] of [[CHUNK - 1, BLOCK.DIRT], [CHUNK, BLOCK.STONE]]) {
        data.set(x, -10, 10, type, SHAPE.SLAB);
        data.set(x, -9, 10, BLOCK.AIR);
    }
    for (const [cx, pattern] of [[0, PATTERN.SOIL], [1, PATTERN.ROCK]]) {
        const b = data.buildChunkArrays(cx, 0).ground;
        const weights = [];
        for (let i = 0; i < b.patterns.length; i++) {
            const o = i * 3;
            if (b.patterns[i] === pattern && b.positions[o] === CHUNK - .5 && b.positions[o + 1] === -11
                && b.normals[o + 1] === 1) weights.push(b.geology[i]);
        }
        assert.deepEqual(weights, [128, 128]);
    }
});
