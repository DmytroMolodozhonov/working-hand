import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TerrainData, mergeBuffers, chunkKey } from '../../src/world/Terrain.js';
import { Terrain } from '../../src/world/TerrainView.js';
import { applyVoxelDetail } from '../../src/world/VoxelShading.js';
import { terrainProbe } from '../../src/world/TerrainProbe.js';

test('the startup probe reports the actual ground and its shader without generating or changing chunks', () => {
    const d = new TerrainData(); d.generate({seed: 123, lush: true});
    const a = d.buildChunkArrays(0, 0), mesh = new THREE.Mesh(new THREE.BufferGeometry(), applyVoxelDetail(new THREE.MeshPhongMaterial({vertexColors: true})));
    Terrain.prototype._fill.call({}, mesh, mergeBuffers(a.ground, a.raised));
    const size = d.chunks.size, bytes = d.chunk(0, 0).blocks.slice();
    const g = { config: { mode: 'freeworld', saved: { gen: 27 } }, gen: 27, character: { group: { position: new THREE.Vector3(8, 2, 8) } },
        world: { terrain: { data: d, meshes: new Map([[chunkKey(0, 0), {ground: mesh}]]) } } };
    const lines = terrainProbe(g);
    assert.ok(lines.some(s => s.includes('GRASS')));
    assert.ok(lines.some(s => s.includes('voxel-detail') && s.includes('MeshPhongMaterial')));
    assert.ok(lines.every(s => s.length < 1200));
    assert.equal(d.chunks.size, size);
    assert.deepEqual(d.chunk(0, 0).blocks, bytes);
});
