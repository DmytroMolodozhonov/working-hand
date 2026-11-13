import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Terrain } from '../../src/world/TerrainView.js';
import { BLOCK, chunkKey } from '../../src/world/Terrain.js';

let handle;
async function initWorker(opts) {
    if (!handle) { await import('../../src/world/terrain.worker.js'); handle = self.onmessage; }
    await handle({ data: { type: 'init', opts } });
}
test('loading restored edits waits for the real worker geometry, including a delayed reply', async () => {
    const opts = { seed: 123, viewDistance: 0 };
    const terrain = new Terrain(new THREE.Scene(), opts);
    let waiting = null, worker;const jobs=[];
    globalThis.self = { postMessage: m => { waiting = m; } };
    try {
        await initWorker(opts);
        worker = { load: 0, postMessage: m => {
            // Use the production worker; hold its answer until after the loader would have returned before the fix.
            jobs.push(handle({ data: structuredClone(m) }));
        }, terminate() {} };
        terrain._workers = [worker];
        terrain.data.set(40, 1, 8, BLOCK.STONE); // A saved building edit makes this take the rebuild route.
        let finished = false;
        const loading = terrain.flushAroundAsync(40, 8).then(() => { finished = true; });
        await new Promise(r => setTimeout(r, 20));
        assert.equal(waiting?.type, 'rebuilt');
        assert.equal(finished, false, 'the loading screen must stay until the surface is installed');
        assert.equal(terrain.settled(), false);
        terrain._onBuilt(worker, waiting);
        assert.equal(terrain.settled(), false, 'a received reply still needs to be applied');
        await loading;
        const mesh = terrain.meshes.get(chunkKey(1, 0)).ground;
        assert.equal(mesh.visible, true);
        assert.ok(mesh.geometry.getAttribute('position').count > 0);
        assert.equal(terrain.data.get(40, 1, 8), BLOCK.STONE, 'saved edits survive');
        mesh.updateMatrixWorld(true);
        const ray = new THREE.Raycaster(new THREE.Vector3(40, 8, 8), new THREE.Vector3(0, -1, 0));
        assert.ok(ray.intersectObject(mesh).length, 'the restored surface stops a downward view');
        assert.equal(terrain.settled(), true);
    } finally {
        terrain.dispose();
        await Promise.all(jobs);
        delete globalThis.self;
    }
});

for (const received of [false, true]) test(`a failed worker cannot leave a restored chunk invisible (reply received: ${received})`, async () => {
    const terrain = new Terrain(new THREE.Scene(), { seed: 123, viewDistance: 0 });
    let waiting;
    globalThis.self = { postMessage: m => { waiting = m; } };
    try {
        await initWorker({ seed: 123 });
        let job;
        const worker = { load: 0, postMessage: m => {job=handle({ data: structuredClone(m) });}, terminate() {} };
        terrain._workers = [worker];
        terrain.data.set(40, 1, 8, BLOCK.STONE);
        const loading = terrain.flushAroundAsync(40, 8);
        await job; // Real worker messages are serialized asynchronously since template caching.
        assert.equal(waiting.type, 'rebuilt');
        if (received) terrain._onBuilt(worker, waiting);
        terrain._stopWorkers();
        await loading;
        const mesh = terrain.meshes.get(chunkKey(1, 0)).ground;
        assert.equal(mesh.visible, true);
        assert.ok(mesh.geometry.getAttribute('position').count > 0);
        assert.equal(terrain.data.get(40, 1, 8), BLOCK.STONE);
        assert.equal(terrain.settled(), true);
    } finally {
        delete globalThis.self;
        terrain.dispose();
    }
});

test('saved edits at the initial spawn are installed before loading completes', async () => {
    const terrain = new Terrain(new THREE.Scene(), { seed: 123, viewDistance: 0 });
    globalThis.self = { postMessage: m => terrain._onBuilt(worker, m) };
    const worker = { load: 0, postMessage: m => handle({ data: structuredClone(m) }), terminate() {} };
    try {
        await initWorker({ seed: 123 });
        terrain._workers = [worker];
        terrain.data.set(8, 5, 8, BLOCK.STONE);
        await terrain.flushAroundAsync(8, 8);
        const mesh = terrain.meshes.get(chunkKey(0, 0)).ground;
        mesh.updateMatrixWorld(true);
        const ray = new THREE.Raycaster(new THREE.Vector3(8, 8, 8), new THREE.Vector3(0, -1, 0));
        assert.equal(ray.intersectObject(mesh)[0]?.point.y, 4.5, 'the saved block is visible, not just present in collision data');
    } finally {
        delete globalThis.self;
        terrain.dispose();
    }
});
