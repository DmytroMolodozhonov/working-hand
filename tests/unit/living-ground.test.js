// The living ground (the author 21.11: «трава — отдельная крутая часть игры… 20 видов, сплошные, кусты, лужи, мелочи, какашки животных…
// следы ног в зависимости от погоды»): the catalogue, the ecology of the kinds, the trampled grass rising again, the footprints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRASSES, CARPETS, BUSHES, LITTER, ATLAS, cellUV } from '../../src/world/GrassSpecies.js';
import { BIOMES } from '../../src/world/Landscape.js';
import { TerrainData } from '../../src/world/Terrain.js';
import { buildFlora } from '../../src/world/FloraBuild.js';
import { TrampleField, TRAMPLE } from '../../src/world/TrampleField.js';
import { groundKind, FOOT_GROUND, FOOT_KINDS, animalPrint } from '../../src/game/Footprints.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('the catalogue: 20 grasses, the sward among the carpets, bushes, litter; every cell its own and inside the atlas', () => {
    assert.equal(GRASSES.length, 20);
    assert.ok(CARPETS.some((k) => k.id === 'sward'), 'the straight dense sward');
    assert.ok(BUSHES.length >= 4 && LITTER.some((k) => k.id === 'dung') && LITTER.some((k) => k.id === 'molehill'));
    const cells = new Set();
    for (const k of [...GRASSES, ...CARPETS, ...BUSHES]) { assert.ok(!cells.has(k.cell), `${k.id}: its own cell`); cells.add(k.cell); assert.ok(k.cell < ATLAS.COLS * ATLAS.ROWS); }
    const ids = new Set(BIOMES.map((b) => b.id));
    for (const k of [...GRASSES, ...CARPETS, ...BUSHES, ...LITTER]) for (const b of Object.keys(k.where)) assert.ok(b === '*' || ids.has(b), `${k.id}: unknown land ${b}`);
    for (const k of GRASSES) { const [u0, v0, u1, v1] = cellUV(k.cell); assert.ok(u0 >= 0 && u1 <= 1 && v0 >= 0 && v1 <= 1 && u1 > u0 && v1 > v0); }
    // sizes from the world's measures (hero 3.5 m): the meadow grass under his knee, the reeds over his head
    assert.ok(GRASSES.find((k) => k.id === 'bluegrass').h[1] <= 1.0 && GRASSES.find((k) => k.id === 'reed').h[1] >= 3.5);
});

test('the meadow is covered: many plants a chunk, deterministic, bushes in their own arrays, the dry kinds never by the water', () => {
    const t = new TerrainData(); t.generate({ seed: 800694817, lush: true, slopes: true, mountains: true, seas: true });
    let plants = 0, bush = 0;
    for (const [cx, cz] of [[0, 0], [1, -1], [-2, 2]]) {
        const c = t.chunk(cx, cz), a = buildFlora(t, c), b = buildFlora(t, c);
        assert.equal(a.verts, b.verts); assert.deepEqual([...a.index.slice(0, 60)], [...b.index.slice(0, 60)]);
        assert.equal(a.index.length % 3, 0); assert.ok(a.index.every((i) => i < a.verts));
        assert.equal(a.uv.length, a.verts * 2); assert.equal(a.grow.length, a.verts * 2);
        plants += a.count; bush += a.bush?.verts || 0;
    }
    assert.ok(plants > 2000, `${plants} tall plants, flowers and bushes in three chunks (the cover besides)`);
    assert.ok(bush > 0, 'bushes grow');
    // generation 36: the forest's and the banks' own models stand there — the same kinds are left out of the grass
    const c = t.chunk(0, 0), withUnder = buildFlora(t, c, { under: true });
    assert.ok(withUnder.verts <= buildFlora(t, c).verts);
});

test('trampled grass: pressed under the feet, bent along the way, stands up again; the map follows the player', () => {
    const T = new TrampleField();
    T.follow(10, 10);
    assert.ok(T.press(10, 10, 0.55, 3, 0));
    const N = TRAMPLE.N, C = TRAMPLE.CELL, i = Math.floor((10 - T.ox) / C), j = Math.floor((10 - T.oz) / C), o = (j * N + i) * 4;
    assert.ok(T.data[o + 3] > 200, 'pressed hard under the feet');
    const k0 = T.data[o + 3];
    for (let s = 0; s < 40; s++) T.rise(0.1);
    assert.ok(T.data[o + 3] < k0 * 0.8, 'rising again');
    for (let s = 0; s < 600; s++) T.rise(0.1);
    assert.equal(T.data[o + 3], 0, 'stood up');
    assert.equal(T.active, 0, 'nothing more to send to the card');
    T.follow(60, 10); // far: the map moved
    assert.ok(Math.abs(T.ox + N * C / 2 - 60) < TRAMPLE.RECENTRE);
});

test('footprints: by the ground and the weather — deep in snow, mud after rain, none on dry stone or dry grass', () => {
    assert.equal(groundKind(BLOCK.SNOW), 'snow'); assert.equal(groundKind(BLOCK.SAND), 'sand'); assert.equal(groundKind(BLOCK.DIRT), 'soil');
    assert.equal(groundKind(BLOCK.GRASS), 'grass'); assert.equal(groundKind(BLOCK.STONE), 'hard'); assert.equal(groundKind(BLOCK.AIR), null);
    assert.ok(FOOT_GROUND.snow.k >= 0.9 && FOOT_GROUND.snow.life > FOOT_GROUND.sand.life);
    assert.equal(FOOT_GROUND.hard.k, 0); assert.ok(FOOT_GROUND.hard.wetK > 0, 'wet boots on stone');
    assert.equal(FOOT_GROUND.grass.k, 0); assert.ok(FOOT_GROUND.grass.wetK > 0, 'pressed mud in wet grass');
    assert.ok(FOOT_GROUND.soil.wetLife > FOOT_GROUND.soil.life, 'mud lasts');
    assert.ok(FOOT_GROUND.sand.rainLife < FOOT_GROUND.sand.life, 'rain smooths the sand');
    assert.equal(animalPrint('horse'), 'hoof'); assert.equal(animalPrint('cow'), 'cloven'); assert.equal(animalPrint('swan'), 'web');
    assert.ok(FOOT_KINDS.boot && FOOT_KINDS.hoof.stride > FOOT_KINDS.boot.stride);
});
