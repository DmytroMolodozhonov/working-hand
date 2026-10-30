// The Ice Queen's OWN MAP (src/world/QueenMap.js, QUEEN_MAP_FROM_GEN): a far region of the same world with her palace, snow and mountains — nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, CHUNK, WORLD_GEN, QUEEN_MAP_FROM_GEN, SPAWN_MAPS_FROM_GEN, MAX_LAYER } from '../../src/world/Terrain.js';
import { QUEEN_MAP, inQueenMap, queenChunk } from '../../src/world/QueenMap.js';
import { SPACE, offEarth, earthly, realmAt, slotAt } from '../../src/world/Planets.js';
import { iceApproach } from '../../src/world/IceCastle.js';
import { queenApproach } from '../../src/game/SpawnSpots.js';

const world = (extra = {}) => {
    const d = new TerrainData();
    d.generate({ seed: 777, mountains: true, seas: true, deepCaves: true, lush: true, test: true, slopes: true, wizHuts: true, furnish: true, apart: true, iceArena: true, dungeons: true, buildings: true, ghostCastle: true, ghostSeen: true, knightCap: true, ...extra });
    return d;
};

test('the map is in the far zone, whole chunks, in the gap before the first planet — on no planet, and off the Earth', () => {
    assert.ok(WORLD_GEN >= QUEEN_MAP_FROM_GEN && QUEEN_MAP_FROM_GEN > SPAWN_MAPS_FROM_GEN);
    const M = QUEEN_MAP;
    assert.ok(offEarth(M.CX - M.HALF) && M.CX - M.HALF >= SPACE.ZONE_X, 'every column of it is off the Earth: no castle, tower, village, dungeon, cave, lair, isle, ghost castle there');
    assert.ok(M.CX + M.HALF < SPACE.SLOT_X0 - SPACE.SLOT_W / 2, 'before the first planet\'s slot');
    for (const x of [M.CX - M.HALF, M.CX, M.CX + M.HALF - 1]) assert.equal(slotAt(x, M.CZ), -1, 'on no planet');
    assert.equal((M.CX - M.HALF) % CHUNK, 0); assert.equal(M.HALF % CHUNK, 0);
    assert.ok(!earthly({ x: M.CX, y: 100, z: M.CZ }), 'the Earth\'s creatures (zombies, herds, dragons, the spider, book-birds, travellers) never appear there');
    assert.equal(realmAt(M.CX, 80, M.CZ), 'earth', 'ordinary air and day: it is not space');
});

test('a Creative world of the generation: her palace stands on the map; the main map has no Queen', () => {
    const d = world({ queenMap: true });
    const P = d.iceCastle.plan;
    assert.ok(P && P.arena && P.map, 'the arena palace');
    assert.equal(P.x, QUEEN_MAP.CX); assert.equal(P.z, QUEEN_MAP.CZ);
    assert.ok(inQueenMap(P.x, P.z));
    // the main map: no palace within 2 km of the start, no summit with a palace on the test mountain
    const old = world({ queenMap: false }).iceCastle.plan;
    assert.ok(Math.hypot(old.x, old.z) > 500, 'without the map the palace is as before (far on the Earth)');
    assert.ok(Math.hypot(P.x, P.z) > 200000, 'with it — nowhere on the Earth');
    // the spawn «У Ледяной Королевы»: inside the arena's gateway on the map
    const a = queenApproach(P);
    assert.ok(inQueenMap(a.x, a.z) && a.layer === P.F);
    assert.deepEqual({ x: a.x, z: a.z }, { x: iceApproach(P).x, z: iceApproach(P).z });
});

test('a world without a test ground (survival, free): the Queen stays on the Earth — the map is for the Creative test ground only', () => {
    const d = new TerrainData();
    d.generate({ seed: 777, mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, iceArena: true, queenMap: true });
    assert.ok(!d.queenMap);
    assert.ok(Math.hypot(d.iceCastle.plan.x, d.iceCastle.plan.z) < 3000);
});

test('on the map: only snow, rock, ice and bedrock — no tree, grass, water, sand, castle or dungeon; the rim is a wall of mountains; nothing past it', () => {
    const d = world({ queenMap: true });
    const M = QUEEN_MAP, seen = new Set();
    for (let x = M.CX - M.HALF; x < M.CX + M.HALF; x += 128) for (let z = M.CZ - M.HALF; z < M.CZ + M.HALF; z += 128) {
        assert.ok(queenChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
        const c = d.chunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
        for (let i = 0; i < c.blocks.length; i += 7) seen.add(c.blocks[i]);
        for (let i = 0; i < c.blocks.length; i++) { const b = c.blocks[i]; if (b === BLOCK.GRASS || b === BLOCK.WATER || b === BLOCK.SAND || b === BLOCK.WOOD || b === BLOCK.LEAVES) assert.fail(`block ${b} on the Queen's map`); }
    }
    for (const b of seen) assert.ok([BLOCK.AIR, BLOCK.STONE, BLOCK.SNOW, BLOCK.GRAVEL, BLOCK.BEDROCK, BLOCK.DIRT, 59, 60, 61, 62].includes(b), 'block ' + b);
    // the plain round the arena is flat and low; the rim is high
    assert.ok(d.surfaceY(M.CX + 400, M.CZ) <= QUEEN_MAP.GROUND + 4);
    for (const [dx, dz] of [[M.HALF - 8, 0], [-M.HALF + 8, 0], [0, M.HALF - 8], [0, -M.HALF + 8]]) assert.ok(d.surfaceY(M.CX + dx, M.CZ + dz) >= 90, 'a wall at the rim');
    assert.ok(d.surfaceY(M.CX + M.HALF - 8, M.CZ) <= MAX_LAYER);
    // nothing at all past the rim (no ground is made there)
    assert.equal(d.chunk(Math.floor((M.CX + M.HALF + 64) / CHUNK), 0).maxTop, -17);
    // the Earth's sites are asked and are not there
    for (const [x, z] of [[M.CX, M.CZ], [M.CX + 300, M.CZ + 300], [M.CX - 700, M.CZ + 100]]) {
        assert.equal(d.sites.castles.near(x, z, 400).length + d.sites.towers.near(x, z, 400).length + (d.sites.hamlets?.near(x, z, 400).length || 0) + (d.sites.dungeons?.near(x, z, 400).length || 0), 0, 'no site of the Earth');
    }
});

test('the workers make the world by the same recipe as the main thread (apart, knightCap, queenMap are in the options)', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../../src/world/TerrainView.js', import.meta.url), 'utf8');
    const line = src.split('\n').find((l) => l.includes('this.opts = {'));
    for (const k of ['apart', 'knightCap', 'queenMap', 'iceArena']) assert.ok(new RegExp('\\b' + k + '\\b').test(line), k + ' is in the workers\' options');
});
