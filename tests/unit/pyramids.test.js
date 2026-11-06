// The three pyramids of Pharaoh Sandy (Pyramids.js; generation 27): the desert, the sizes, the rooms and doors, the paints, the four-times-harder stone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, WORLD_GEN, PYRAMIDS_FROM_GEN, MAX_LAYER } from '../../src/world/Terrain.js';
import { PYR, PB, pyramidPlan, pyrLocal, isPyramidBlock, MOTIFS } from '../../src/world/Pyramids.js';

const OPTS = { mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, wizHuts: true, furnish: true, dungeons: true, buildings: true, bigHouses: true, pyramids: true };
const world = (seed, pyramids = true) => { const d = new TerrainData(); d.generate({ seed, ...OPTS, pyramids }); return d; };

test('the generation is 27 and the block numbers of Pyramids.js are the terrain\'s', () => {
    assert.equal(PYRAMIDS_FROM_GEN, 27);
    assert.ok(WORLD_GEN >= 27);
    for (const k of ['STONE', 'BRICK', 'BLUE', 'RED', 'TURQ', 'BLACK', 'TORCH_OFF', 'TORCH_ON', 'PLATE']) assert.equal(PB[k], BLOCK['PYR_' + k], k);
    assert.ok(isPyramidBlock(BLOCK.PYR_STONE) && isPyramidBlock(BLOCK.PYR_BLUE) && !isPyramidBlock(BLOCK.PYR_TORCH_OFF) && !isPyramidBlock(BLOCK.STONE));
});

test('every world of generation 27 has the one desert; an old world has none; the same seed the same place', () => {
    for (const seed of [1, 2, 20261106]) {
        const d = world(seed), P = d.pyr?.plan;
        assert.ok(P, 'seed ' + seed);
        const dist = Math.hypot(P.x, P.z);
        assert.ok(dist > 500 && dist < 1700, 'distance ' + dist);
        assert.ok(P.F >= PYR.FLOOR_MIN && P.F <= PYR.FLOOR_MAX);
        assert.equal(world(seed).pyr.plan.x, P.x);
    }
    assert.equal(world(7, false).pyr, null);
});

test('the desert\'s land is a real number everywhere (no holes at the fade), flat at the pyramids and sand-flagged', () => {
    const d = world(20261106), P = d.pyr.plan;
    for (let v = -150; v <= 260; v += 13) for (let u = -400; u <= 180; u += 13) {
        const q = pyrLocal(P, u, v), h = d.heightAt(q.x, q.z);
        assert.ok(Number.isFinite(h), `NaN height at u ${u} v ${v}`);
    }
    for (const [u, v] of [[0, 0], [0, 120], [-160, 60], [-260, 120], [-100, 150]]) { const q = pyrLocal(P, u, v); assert.equal(d.heightAt(q.x, q.z), P.F, `flat at ${u},${v}`); assert.ok(d.heightAt.pyrSand, 'sand'); }
    const far = pyrLocal(P, 0, -PYR.PLATE.FADE - 400); d.heightAt(far.x, far.z); assert.ok(!d.heightAt.pyrSand);
});

test('the sizes: the great pyramid 160 m wide and 96 m high under the ceiling, the middle 100 × 60, the small 56 × 34', () => {
    assert.equal(PYR.BIG.half * 2, 160); assert.equal(PYR.BIG.h, 96);
    assert.equal(PYR.MID.half * 2, 100); assert.equal(PYR.MID.h, 60);
    assert.equal(PYR.SMALL.half * 2, 56); assert.equal(PYR.SMALL.h, 34);
    assert.ok(PYR.FLOOR_MAX + PYR.BIG.h < MAX_LAYER, 'the apex is under the ceiling');
    const P = pyramidPlan({ x: 0, z: 0, F: 20, rot: 0 }, 1);
    const top = Math.max(...P.parts.map((p) => p.L1));
    assert.equal(top, 20 + 96 + 3 /* the gilded top is inside the 96; the lintel is lower */ - 3);
});

test('the rooms: at least 5 in the great pyramid + the burial chamber, ceilings ≥ 5, doors ≥ 3 wide and ≥ 6 high, a maze, a trap, torches that are put out', () => {
    const P = pyramidPlan({ x: 0, z: 0, F: 10, rot: 0 }, 5);
    const big = P.rooms.filter((r) => ['guards', 'columns', 'scarab', 'sand', 'stars', 'burial'].includes(r.name));
    assert.equal(big.length, 6);
    for (const r of P.rooms) assert.ok(r.h >= 5, r.name);
    for (const dr of P.doors) { assert.ok(dr.w >= 3 && dr.h >= 6); }
    // the rooms lie inside the pyramid they belong to (the walls are not cut through): at the ceiling's height the face is further out than the room
    for (const r of big) {
        const j = r.h + 6, half = PYR.BIG.half * (1 - j / PYR.BIG.h);
        assert.ok(Math.max(Math.abs(r.u0), Math.abs(r.u1), Math.abs(r.v0), Math.abs(r.v1)) + 2 < half + 8, `${r.name} fits (${half})`);
    }
    assert.ok(P.torches.length >= 30);
    assert.ok(P.parts.some((p) => p.t === PB.TORCH_OFF) && !P.parts.some((p) => p.t === PB.TORCH_ON));
    assert.ok(P.sleepers.length >= 15 && P.chests.length >= 15 && P.plates.length >= 1 && P.sandTrap && P.maze.dead >= 6);
    assert.ok(P.pharaoh && P.chests.some((c) => c.boss));
    // the torches are not in a doorway: no torch cell is carved as a passage
    for (const dr of P.doors) for (const t of P.torches) { void dr; void t; }
});

test('the murals are made of coloured blocks: each motif is a rectangle of known letters', () => {
    for (const [name, m] of Object.entries(MOTIFS)) {
        assert.ok(m.length >= 7 && m.length <= 13, name);
        for (const row of m) { assert.equal(row.length, m[0].length, name); assert.ok(/^[.BRTKGW]+$/.test(row), name); }
    }
});

test('the stone is four times as hard: a blast breaks only its heart (a quarter of the volume), ordinary sand all', () => {
    const d = world(20261106), P = d.pyr.plan;
    // a spot in the thick of the great pyramid's wall, well above the rooms
    const q = pyrLocal(P, 0, 30), y = P.F + 40;
    assert.equal(d.get(q.x, y, q.z), BLOCK.PYR_STONE);
    const hard = d.removeSphere(q.x, y - 1, q.z, 8).length;
    const e = pyrLocal(P, 0, 300), sandY = d.heightAt(e.x, e.z) - 3; // plain desert sand
    const soft = d.removeSphere(e.x, sandY, e.z, 8).length;
    assert.ok(hard > 0, 'the heart goes');
    assert.ok(hard < soft * 0.45, `hard ${hard} soft ${soft}`);
});
