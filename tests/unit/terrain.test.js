import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, MIN_LAYER, CHUNK } from '../../src/world/Terrain.js';

test('flat ground surface is exactly where the old ground plane was (y = -0.5)', () => {
    const d = new TerrainData(64);
    d.generate({ seed: 1, mountains: false });
    for (const [x, z] of [[0, 0], [10, -5], [-31, 31], [3.4, -2.6]]) assert.equal(d.surfaceY(x, z), -0.5);
    assert.equal(d.get(0, 0, 0), BLOCK.GRASS);
    assert.equal(d.get(0, MIN_LAYER, 0), BLOCK.BEDROCK);
    assert.equal(d.get(0, 1, 0), BLOCK.AIR);
});

test('flat chunk is greedy-meshed into a handful of quads (looks like a plane, costs nothing)', () => {
    const d = new TerrainData(64);
    d.generate({ seed: 1, mountains: false });
    const a = d.buildChunkArrays(0, 0);
    const groundQuads = a.ground.indices.length / 6;
    assert.ok(groundQuads < 20, `ground quads: ${groundQuads}`);
    assert.equal(a.raised.indices.length, 0);
    // The top face colour is the original ground colour 0x4CAF50
    const c = a.ground.colors;
    const pos = a.ground.positions;
    let found = false;
    for (let i = 0; i < pos.length / 3; i++) {
        if (Math.abs(pos[i * 3 + 1] + 0.5) < 1e-6 && a.ground.normals[i * 3 + 1] === 1) {
            assert.ok(Math.abs(c[i * 3] - 0x4C / 255) < 1e-6 && Math.abs(c[i * 3 + 1] - 0xAF / 255) < 1e-6 && Math.abs(c[i * 3 + 2] - 0x50 / 255) < 1e-6);
            found = true;
        }
    }
    assert.ok(found, 'top face present');
});

test('mountains exist away from spawn, spawn area stays flat', () => {
    const d = new TerrainData(240);
    d.generate({ seed: 12345, mountains: true });
    for (let x = -20; x <= 20; x += 2) for (let z = -20; z <= 20; z += 2) assert.equal(d.topLayer(x, z), 0);
    let max = 0;
    for (let x = -120; x < 120; x += 3) for (let z = -120; z < 120; z += 3) max = Math.max(max, d.topLayer(x, z));
    assert.ok(max >= 10, `highest mountain ${max}`);
});

test('explosion removes blocks in a sphere, never bedrock, and marks chunks dirty', () => {
    const d = new TerrainData(64);
    d.generate({ seed: 1 });
    d.dirtyChunks.clear();
    const removed = d.removeSphere(0, -0.5, 0, 3.2);
    assert.ok(removed.length > 40, `removed ${removed.length}`);
    assert.ok(d.surfaceY(0, 0) < -0.5, 'crater is lower than ground');
    assert.equal(d.get(0, MIN_LAYER, 0), BLOCK.BEDROCK, 'bedrock survives');
    assert.ok(d.dirtyChunks.size >= 1);
    // A second blast deeper still stops at bedrock
    d.removeSphere(0, -4, 0, 6);
    assert.equal(d.get(0, MIN_LAYER, 0), BLOCK.BEDROCK);
    assert.equal(d.surfaceY(0, 0), MIN_LAYER - 0.5);
});

test('removing blocks next to a chunk border also rebuilds the neighbour chunk', () => {
    const d = new TerrainData(64);
    d.generate({ seed: 1 });
    d.dirtyChunks.clear();
    d.set(-32 + CHUNK, 0, -32, BLOCK.AIR); // first column of chunk (1,0)
    assert.ok(d.dirtyChunks.has(0) && d.dirtyChunks.has(1));
});

test('voxel ray cast hits the ground and mountain sides', () => {
    const d = new TerrainData(64);
    d.generate({ seed: 1 });
    const down = d.raycast({ x: 0.2, y: 10, z: 0.3 }, { x: 0, y: -1, z: 0 }, 50);
    assert.ok(down && Math.abs(down.y + 0.5) < 1e-6, JSON.stringify(down));
    d.set(5, 1, 0, BLOCK.STONE);
    const side = d.raycast({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 20);
    assert.ok(side && Math.abs(side.x - 4.5) < 1e-6, JSON.stringify(side));
    assert.equal(d.raycast({ x: 0, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }, 20), null);
});
