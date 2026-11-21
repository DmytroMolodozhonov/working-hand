import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK, TerrainData } from '../../src/world/Terrain.js';
import { WATER_FULL } from '../../src/world/WaterBreach.js';
import { waterAt } from '../../src/game/CreatureSwim.js';

const { AIR, WATER, STONE } = BLOCK;
const X = 31, Z = 12;

function basin(size) {
    const data = new TerrainData();
    data.generate({ seed: 9 });
    const lake = [], cave = [];
    for (let z = Z - 3; z <= Z + 3; z++) for (let x = X - 3; x <= X + 3; x++) for (let l = -1; l <= 0; l++) {
        data.set(x, l, z, WATER); lake.push([x, l, z]);
    }
    for (let z = Z; z < Z + size; z++) for (let x = X; x < X + size; x++) for (let l = -6; l <= -4; l++) {
        data.set(x, l, z, AIR); cave.push([x, l, z]);
    }
    const shaft = [[X, -2, Z], [X, -3, Z]];
    const blast = () => data.removeSphere(X, -3.5, Z, .62);
    return { data, lake, cave, shaft, blast };
}

const volume = (data, cells) => cells.reduce((n, cell) => n + Math.max(0, data.waterAmount(...cell)), 0);

test('a ceiling blast fills a small intact cave across a chunk border and lowers a level lake surface', () => {
    const { data, lake, cave, shaft, blast } = basin(4);
    data.set(X - 5, -6, Z, AIR); // a sealed pocket, outside any passage
    assert.equal(volume(data, cave), 0);
    const before = volume(data, lake);
    assert.equal(blast().length, 2);
    assert.equal(volume(data, cave), cave.length * WATER_FULL);
    assert.equal(volume(data, [...lake, ...cave, ...shaft]), before);
    const heights = lake.filter(([, l]) => l === -1).map(c => data.waterAmount(...c));
    assert.ok(Math.max(...heights) - Math.min(...heights) <= 1, 'the remaining surface is level to 1/256 m');
    assert.ok(heights[0] > 0 && heights[0] < WATER_FULL);
    assert.equal(data.get(X - 5, -6, Z), AIR);
    const w = waterAt(data, X + 1, Z, -1.6);
    assert.ok(w.surface < -1.5 && w.surface > -2.5);
    assert.equal(data.isWaterAt(X + 1, w.surface + .01, Z), false);
    const mesh = data.buildChunkArrays(1, 0).water;
    assert.ok(mesh.positions.some((y, i) => i % 3 === 1 && Math.abs(y - (w.surface - w.depth * .12)) < .01));
});

test('a larger cave takes the whole lake, keeps the volume and wets the far end of its floor', () => {
    const { data, cave, lake, shaft, blast } = basin(14);
    const before = volume(data, lake);
    blast();
    assert.equal(volume(data, lake), 0);
    assert.equal(volume(data, cave), before);
    assert.ok(data.waterAmount(X + 13, -6, Z + 13) > 0);
    assert.equal(volume(data, shaft), 0);
    assert.equal(data.get(X, -5, Z), AIR);
});

test('a side outlet leaves the lake water below its sill', () => {
    const data = new TerrainData(); data.generate();
    for (let z = 0; z < 6; z++) for (let l = -3; l <= 0; l++) data.set(0, l, z, WATER);
    for (let l = -6; l <= -2; l++) for (let z = 0; z < 6; z++) data.set(2, l, z, AIR);
    data.set(2, -1, 2, AIR);
    data.set(1, -1, 2, AIR);
    data._flood([[1, -1, 2]]);
    assert.equal(data.waterAmount(0, -3, 2), WATER_FULL);
    assert.equal(data.waterAmount(0, -2, 2), WATER_FULL);
    assert.equal(data.get(0, 0, 2), AIR);
    assert.ok(data.waterAmount(2, -6, 2) > 0);
    assert.equal(data.get(1, -2, 2), STONE);
});

test('a saved flood resumes mid-transfer, and the guest receives both refill and drawdown', () => {
    const a = basin(4), b = basin(4), guest = basin(4), direct = basin(4);
    a.data.deferFloods = b.data.deferFloods = true;
    guest.data.floodAuthority = () => false;
    a.data.onFloodPatch = patch => guest.data.applyFloodPatch(patch);
    guest.blast(); a.blast(); direct.blast();
    while (!a.data.floodState.size) a.data.stepFloods(Infinity, 3);
    b.data.loadingFloodState = true; b.blast(); b.data.loadingFloodState = false;
    b.data.restoreFlood(JSON.parse(JSON.stringify(a.data.floodSnapshot())));
    a.data.stepFloods(Infinity, Infinity); b.data.stepFloods(Infinity, Infinity);
    for (const c of [...a.lake, ...a.cave, ...a.shaft]) {
        const amount = direct.data.waterAmount(...c);
        assert.equal(a.data.waterAmount(...c), amount);
        assert.equal(guest.data.waterAmount(...c), amount);
        assert.equal(b.data.waterAmount(...c), amount);
    }
});

test('the sea continues supplying a cave at sea level without draining the coast', () => {
    const { data, lake, cave, blast } = basin(4);
    for (const [x, l, z] of lake) data.fillWater(x, l, z, true);
    blast();
    assert.equal(volume(data, cave), cave.length * WATER_FULL);
    assert.equal(volume(data, lake), lake.length * WATER_FULL);
});

test('plugging the shaft stops further transfer and keeps the water already in the cave', () => {
    const { data, lake, cave, blast } = basin(14);
    const before = volume(data, lake);
    data.deferFloods = true;
    blast();
    while (!data.floodState.size) data.stepFloods(Infinity, 3);
    const already = volume(data, cave);
    assert.ok(already > 0 && already < before);
    data.set(X, -2, Z, STONE);
    data.stepFloods(Infinity, Infinity);
    assert.equal(volume(data, cave), already);
    assert.equal(volume(data, [...lake, ...cave]), before);
});

test('the stream starts at the open shaft, not at a nearby wet ledge', () => {
    const { data } = basin(14);
    data.set(X - 1, -2, Z, AIR);
    data.deferFloods = true;
    let site;
    data.onFloodInlet = inlet => site = inlet;
    data.set(X, -2, Z, AIR);
    data.set(X, -3, Z, AIR);
    data._flood([[X - 1, -2, Z], [X, -2, Z], [X, -3, Z]]);
    data.stepFloods(Infinity, Infinity);
    assert.deepEqual([site.x, site.l, site.z, site.bottom], [X, -2, Z, -7]);
});

test('the flood pauses at a not-yet-loaded chunk and continues with the same volume', () => {
    const { data, lake, cave, blast } = basin(14);
    const before = volume(data, lake);
    let ready = false, waits = 0;
    data.floodGroundReady = x => x < 32 || ready || (++waits, false);
    data.deferFloods = true;
    blast();
    data.stepFloods(Infinity, Infinity);
    assert.ok(waits > 0 && data.waterJobs.length);
    assert.equal(volume(data, lake), before);
    ready = true;
    data.stepFloods(Infinity, Infinity);
    assert.equal(volume(data, cave), before);
});

test('water from the host waits for the guest crater to finish carving', () => {
    const { data } = basin(4);
    data.applyFloodPatch([[X, -2, Z, 187, 0]], true);
    data.stepFloods(Infinity, Infinity);
    assert.equal(data.get(X, -2, Z), STONE);
    data.set(X, -2, Z, AIR);
    data.stepFloods(Infinity, Infinity);
    assert.equal(data.waterAmount(X, -2, Z), 187);
});

test('a tunnel can carry a lake to a basin more than four chunks away', () => {
    const { data, lake, blast } = basin(3);
    const before = volume(data, lake);
    for (let x = X + 3; x < X + 150; x++) data.set(x, -6, Z, AIR);
    blast();
    assert.ok(data.waterAmount(X + 149, -6, Z) > 0);
    assert.equal(volume(data, lake), 0);
    assert.equal(volume(data, Array.from({ length: 150 }, (_, i) => [X + i, -6, Z]))
        + volume(data, Array.from({ length: 6 }, (_, i) => [X + i % 3, -6, Z + 1 + Math.floor(i / 3)])), before);
});
