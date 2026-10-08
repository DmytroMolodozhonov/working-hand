import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, MIN_LAYER, MAX_LAYER, CHUNK, chunkKey, WATER_LEVEL_Y } from '../../src/world/Terrain.js';

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
    d.set(CHUNK, 0, 5, BLOCK.AIR); // first column of chunk (1,0)
    assert.ok(d.dirtyChunks.has(chunkKey(0, 0)) && d.dirtyChunks.has(chunkKey(1, 0)));
    d.dirtyChunks.clear();
    d.set(-1, 0, 5, BLOCK.AIR); // last column of chunk (-1,0): negative coordinates work too
    assert.ok(d.dirtyChunks.has(chunkKey(-1, 0)) && d.dirtyChunks.has(chunkKey(0, 0)));
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

test('the world is endless: far away there is ground, plains, high mountain ranges and trees', () => {
    const d = new TerrainData();
    d.generate({ seed: 12345, mountains: true });
    // Ground everywhere, even kilometres away and on negative coordinates
    for (const [x, z] of [[500, 0], [-2000, 1500], [10000, -10000]]) assert.ok(d.topLayer(x, z) >= MIN_LAYER + 1, `${x},${z}`);
    let max = 0, flat = 0, trees = 0, n = 0;
    for (let x = 300; x < 1500; x += 4) {
        for (let z = -600; z < 600; z += 4) {
            const t = d.topLayer(x, z);
            n++;
            if (t > max) max = t;
            if (t === 0) flat++;
            if (t > 0 && d.get(x, t, z) === BLOCK.LEAVES) trees++;
        }
        d.evictFar(Math.floor(x / CHUNK), 0, 40); // keep memory small while scanning
    }
    assert.ok(max > 26 && max <= MAX_LAYER, `ranges higher than near spawn (${max})`);
    assert.ok(flat / n > 0.2, `plains exist (${(100 * flat / n).toFixed(0)}% flat)`);
    assert.ok(trees > 20, `trees (${trees})`);
});

test('same seed → identical world (multiplayer), evicted chunks regenerate identically, edits survive', () => {
    const a = new TerrainData(), b = new TerrainData();
    a.generate({ seed: 7, mountains: true });
    b.generate({ seed: 7, mountains: true });
    for (let i = 0; i < 400; i++) {
        const x = (i * 97) % 3000 - 1500, z = (i * 61) % 3000 - 1500;
        assert.equal(a.topLayer(x, z), b.topLayer(x, z));
    }
    const before = a.topLayer(900, 900);
    a.evictFar(0, 0, 2);
    assert.equal(a.topLayer(900, 900), before);
    // An explosion far away is remembered even when evicting
    a.removeSphere(900, before - 0.5, 900, 3);
    const crater = a.topLayer(900, 900);
    assert.ok(crater < before);
    a.evictFar(0, 0, 2);
    assert.equal(a.topLayer(900, 900), crater);
});

test('chunk meshing is fast enough to stream while flying', () => {
    const d = new TerrainData();
    d.generate({ seed: 3, mountains: true });
    let worst = 0;
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) {
        const s = performance.now();
        d.buildChunkArrays(8 + (i % 6), -3 + Math.floor(i / 6));
        worst = Math.max(worst, performance.now() - s);
    }
    const avg = (performance.now() - t0) / 30;
    assert.ok(avg < 25, `average ${avg.toFixed(1)} ms per chunk (worst ${worst.toFixed(1)})`);
});

test('rivers and lakes: far from spawn, walkable beds, see-through water that floods craters', () => {
    const d = new TerrainData();
    d.generate({ seed: 12345, mountains: true });
    // The original play area has no water
    for (let x = -90; x <= 90; x += 3) for (let z = -90; z <= 90; z += 3) if (Math.hypot(x, z) < 95) assert.notEqual(d.get(x, 0, z), BLOCK.WATER);
    // Further out there is plenty
    let wet = 0, n = 0, spot = null;
    for (let x = -1200; x < 1200; x += 6) {
        for (let z = -1200; z < 1200; z += 6) {
            if (Math.hypot(x, z) < 200) continue;
            n++;
            if (d.get(x, 0, z) === BLOCK.WATER) { wet++; spot = spot || { x, z }; }
        }
        d.evictFar(Math.floor(x / CHUNK), 0, 60);
    }
    assert.ok(wet / n > 0.03 && wet / n < 0.35, `water covers ${(100 * wet / n).toFixed(1)}%`);
    // Water is not solid: the ground under it is the (sand) bed, never deeper than 3
    const top = d.topLayer(spot.x, spot.z);
    assert.ok(top < 0 && top >= -3, `bed at layer ${top}`);
    assert.equal(d.get(spot.x, top, spot.z), BLOCK.SAND);
    assert.equal(d.isSolidAt(spot.x, -0.8, spot.z), false);
    assert.equal(d.raycast({ x: spot.x, y: 5, z: spot.z }, { x: 0, y: -1, z: 0 }, 20).y, top - 0.5);
    // Water surface lookup
    const ws = d.findWaterSurface(spot.x + 1.3, spot.z, 3);
    assert.ok(ws && Math.abs(ws.y - WATER_LEVEL_Y) < 1e-9, JSON.stringify(ws));
    // A crater next to the water fills with water, water itself is not blown away
    const before = d.get(spot.x, 0, spot.z);
    d.removeSphere(spot.x, -1, spot.z, 2.5);
    assert.equal(before, BLOCK.WATER);
    assert.equal(d.get(spot.x, 0, spot.z), BLOCK.WATER);
    assert.equal(d.get(spot.x, top, spot.z), BLOCK.WATER, 'the dug-out bed flooded');
    // Ice built on water is solid
    d.set(spot.x, 1, spot.z, BLOCK.ICE);
    assert.ok(d.isSolidAt(spot.x, -0.4, spot.z));
    assert.equal(d.topLayer(spot.x, spot.z), 1);
    // Meshes: water surface goes to its own transparent buffer
    const a = d.buildChunkArrays(spot.x >> 5, spot.z >> 5);
    assert.ok(a.water.indices.length > 0);
});
