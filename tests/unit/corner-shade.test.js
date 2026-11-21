// The land's soft corner shade (the author 21.11: «слишком игрушечно, теней не хватает» — Terrain.faceShade): the ground at the
// foot of a wall is darker towards the wall, open ground is not shaded at all and still merges into big faces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, mergeBuffers } from '../../src/world/Terrain.js';

const tops = (b) => { const out = []; for (let i = 0; i < b.positions.length / 3; i++) if (b.normals[i * 3 + 1] === 1) out.push({ x: b.positions[i * 3], y: b.positions[i * 3 + 1], z: b.positions[i * 3 + 2], shade: b.wet[i] & 127, wet: b.wet[i] >> 7 }); return out; };

test('ground by a wall is shaded towards it; open ground is clear and stays merged', () => {
    const t = new TerrainData(); t.generate({ seed: 1 });
    // a flat stone floor at L=40 (high in the air: nothing else around), 12×12
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) t.set(x, 40, z, BLOCK.STONE);
    let m = mergeBuffers(...Object.values(t.buildChunkArrays(0, 0)).slice(0, 2));
    const floorY = tops(m).filter((v) => v.shade === 0).reduce((a, v) => Math.max(a, v.y), -1e9);
    const flat = tops(m).filter((v) => v.y === floorY);
    assert.ok(flat.length > 0 && flat.every((v) => v.shade === 0), 'open floor: no shade');
    const quadsBefore = flat.length / 4;
    // a wall two blocks high along x = 8
    for (let z = 0; z < 16; z++) for (let L = 41; L <= 42; L++) t.set(8, L, z, BLOCK.STONE);
    m = mergeBuffers(...Object.values(t.buildChunkArrays(0, 0)).slice(0, 2));
    const floor = tops(m).filter((v) => v.y === floorY);
    const byWall = floor.filter((v) => Math.abs(v.x - 7.5) < 0.01 || Math.abs(v.x - 8.5) < 0.01);
    assert.ok(byWall.length && byWall.every((v) => v.shade > 0), 'the floor\'s corners against the wall are shaded');
    assert.ok(floor.filter((v) => v.x < 6 || v.x > 10).every((v) => v.shade === 0), 'away from the wall: none');
    assert.ok(floor.every((v) => v.wet === 0), 'the water bit is untouched');
    assert.ok(floor.length / 4 <= quadsBefore + 8, `still merged: ${floor.length / 4} quads (open floor ${quadsBefore})`);
});
