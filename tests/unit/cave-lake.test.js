// A cave never opens onto the side of a lake (Terrain._nearWater, CAVE_LAKE_FROM_GEN): the author saw the lake's bed from inside a cave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, CHUNK, MIN_LAYER, MAX_LAYER, WORLD_GEN, CAVE_LAKE_FROM_GEN } from '../../src/world/Terrain.js';

const make = (seed, caveLake) => {
    const d = new TerrainData();
    d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, caveLake });
    return d;
};
const at = (d, x, L, z) => {
    const c = d.chunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
    return c.blocks[((L - MIN_LAYER) * CHUNK + (z & (CHUNK - 1))) * CHUNK + (x & (CHUNK - 1))];
};
// cave air (carved: has rock above it) touching water sideways, in chunks cx,cz ∈ [-R, R]
const exposed = (d, R) => {
    let n = 0;
    for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
        const c = d.chunk(cx, cz);
        if (!c.caved) continue;
        for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
            const x = cx * CHUNK + lx, z = cz * CHUNK + lz, top = c.top[lz * CHUNK + lx];
            for (let L = Math.max(MIN_LAYER + 1, c.minOpen); L < top && L < MAX_LAYER; L++) {
                if (at(d, x, L, z) !== BLOCK.AIR) continue;
                for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(d, x + dx, L, z + dz) === BLOCK.WATER) n++;
            }
        }
    }
    return n;
};

test('the version is current', () => assert.ok(WORLD_GEN >= CAVE_LAKE_FROM_GEN));

test('new worlds: no cave air beside lake or river water', () => {
    for (const seed of [1, 7, 21]) assert.equal(exposed(make(seed, true), 14), 0, 'seed ' + seed);
});

test('the same world twice is the same (deterministic, whichever chunk is made first)', () => {
    const a = make(7, true), b = make(7, true);
    for (const [cx, cz] of [[3, -2], [-5, 4], [0, 0]]) { b.chunk(cx + 1, cz); assert.deepEqual(a.chunk(cx, cz).blocks, b.chunk(cx, cz).blocks); }
});

test('the check bites: older worlds do have caves opening onto water', () => {
    let n = 0;
    for (const seed of [1, 7, 21]) n += exposed(make(seed, false), 14);
    assert.ok(n > 0, 'without the margin some cave touches water');
});
