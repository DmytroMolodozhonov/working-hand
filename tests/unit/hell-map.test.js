// HELL (src/world/HellMap.js — the contract for every hell session, src/world/HellLand.js — its blocks): a far map of the same world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, CHUNK, MAX_LAYER, isSolid } from '../../src/world/Terrain.js';
import { HELL, HELL_FROM_GEN, hellPlan, inHell, hellChunk } from '../../src/world/HellMap.js';
import { offEarth, earthly, SPACE, slotAt } from '../../src/world/Planets.js';
import { QUEEN_MAP } from '../../src/world/QueenMap.js';

const RECIPE = { mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, furnish: true, dungeons: true };
const world = (seed = 4242, more = {}) => { const d = new TerrainData(); d.generate({ seed, ...RECIPE, hell: true, ...more }); return d; };

test('the contract: the plan has every field the other sessions read', () => {
    assert.equal(HELL_FROM_GEN, 1);
    const P = hellPlan(4242);
    for (const k of ['spawn', 'returnMark', 'devilSeat', 'chainAnchor']) assert.ok(P[k] && Number.isFinite(P[k].x) && Number.isFinite(P[k].z), k);
    assert.ok(P.chainLen >= 60 && P.chainLen <= 80);
    assert.ok(P.taronCamps.length >= 3 && P.taronCamps.length <= 6);
    assert.ok(P.gargoyleLairs.length >= 4 && P.gargoyleLairs.length <= 8);
    assert.ok(P.lavaFalls.length >= 4 && P.bridges.length >= 1 && P.fountains.length >= 4);
    for (const c of P.taronCamps) assert.ok(c.r >= 20 && c.r <= 40 && c.n >= 1 && inHell(c.x, c.z));
    assert.equal(hellPlan(4242), P, 'worked out once');
    assert.deepEqual(JSON.stringify(hellPlan(99).spawn), JSON.stringify(hellPlan(99).spawn));
});

test('hell lies in the far zone, apart from the Queen\'s map and the planets — off the Earth', () => {
    const x0 = HELL.CX - HELL.HALF, x1 = HELL.CX + HELL.HALF;
    assert.ok(x0 > QUEEN_MAP.CX + QUEEN_MAP.HALF, 'past the Queen\'s map');
    assert.ok(x0 >= SPACE.ZONE_X && offEarth(x0));
    for (const z of [-HELL.HALF, 0, HELL.HALF - 1]) for (const x of [x0, HELL.CX, x1 - 1]) assert.equal(slotAt(x, z), -1, 'no planet slot');
    assert.ok(!earthly({ x: HELL.CX, y: 20, z: 0 }));
    assert.ok(x0 % CHUNK === 0 && (HELL.CZ - HELL.HALF) % CHUNK === 0);
    assert.ok(hellChunk(x0 / CHUNK, 0) && !hellChunk(x0 / CHUNK - 1, 0));
});

test('the Earth is not changed by hell (same heights with and without it)', () => {
    const a = world(777), b = new TerrainData(); b.generate({ seed: 777, ...RECIPE });
    for (const [x, z] of [[0, 0], [130, -40], [-900, 333], [2500, 1800]]) assert.equal(a.heightAt(x, z), b.heightAt(x, z));
});

test('the arrival: firm floor under the spawn and the mark, air over the head; the devil\'s basin is flat; the ring of the chain', () => {
    const d = world();
    const P = d.hellPlan;
    for (const p of [P.spawn, P.returnMark]) {
        const L = d.heightAt(p.x, p.z);
        assert.equal(L, HELL.SPAWN_Y);
        assert.ok(isSolid(d.get(p.x, L, p.z)));
        for (let k = 1; k <= 6; k++) assert.equal(d.get(p.x, L + k, p.z), BLOCK.AIR, 'air over the head');
    }
    const S = P.devilSeat;
    for (let a = 0; a < 16; a++) for (const r of [20, 45, 70, S.r - 4]) {
        const x = Math.round(S.x + Math.cos(a / 16 * Math.PI * 2) * r), z = Math.round(S.z + Math.sin(a / 16 * Math.PI * 2) * r);
        assert.equal(d.heightAt(x, z), HELL.SEAT_Y, `seat flat at ${r}`);
    }
    const A = P.chainAnchor;
    assert.equal(d.get(A.x + HELL.RING_R, A.y, A.z), BLOCK.HELL_IRON, 'the forged ring');
    assert.ok(d.get(A.x, A.y + 4, A.z) !== BLOCK.AIR, 'the pillar');
});

test('the roads: from the mark to the basin and to every camp — walkable (steps of one block, room over the head, no lava)', () => {
    const d = world();
    const P = d.hellPlan;
    for (const r of P.roads) {
        let prev = null;
        for (let i = 1; i < r.length; i++) {
            const a = r[i - 1], b = r[i], L = Math.hypot(b.x - a.x, b.z - a.z);
            for (let s = 0; s <= L; s += 1) {
                const x = Math.round(a.x + (b.x - a.x) * s / L), z = Math.round(a.z + (b.z - a.z) * s / L);
                const f = d.heightAt(x, z);
                assert.notEqual(d.get(x, f, z), BLOCK.HELL_LAVA, `no lava on the road at ${x},${z}`);
                for (let k = 1; k <= 5; k++) assert.ok(!isSolid(d.get(x, f + k, z)), `room over the road at ${x},${z} (+${k})`);
                if (prev != null) assert.ok(Math.abs(f - prev) <= 1, `a step of one block at ${x},${z}: ${prev} → ${f}`);
                prev = f;
            }
        }
    }
    for (const c of P.taronCamps) assert.equal(d.heightAt(c.x, c.z), c.y, 'the camp\'s plateau');
});

test('nothing of the Earth in hell: no castle, cave, lair, dungeon there', () => {
    const d = world();
    const P = d.hellPlan;
    assert.equal(d.cavesNear?.(P.spawn.x, P.spawn.z, 200)?.length ?? 0, 0);
    assert.equal(d.dungeonsNear?.(P.spawn.x, P.spawn.z, 300)?.length ?? 0, 0);
    assert.ok(!d.sites.landAt(P.spawn.x, P.spawn.z));
    let lava = 0, hellRock = 0;
    for (let x = P.spawn.x - 200; x < P.spawn.x + 200; x += 7) for (let z = P.spawn.z - 200; z < P.spawn.z + 200; z += 7) {
        const L = d.heightAt(x, z), t = d.get(x, L, z);
        if (t === BLOCK.HELL_LAVA) lava++;
        if (t >= BLOCK.HELL_BASALT && t <= BLOCK.HELL_IRON) hellRock++;
        assert.ok(t !== BLOCK.GRASS && t !== BLOCK.WATER && t !== BLOCK.SNOW, 'no grass, water or snow');
        assert.ok(L <= MAX_LAYER);
    }
    assert.ok(hellRock > 3000 * 0.9, 'hell\'s own stone');
    assert.ok(lava > 0, 'lava near the arrival');
});
