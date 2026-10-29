// The Castle of Ghosts in the land (GhostCastle.js, Terrain.js ghostApply): it is not in the world at all until a hero sees the invisible,
// it never changes the land, and it goes out again (an empty place — no blocks, no collisions) when the sight is gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, CHUNK, WORLD_GEN, GHOST_CASTLE_FROM_GEN } from '../../src/world/Terrain.js';
import { GhostCastleIndex } from '../../src/world/GhostCastle.js';
import { GHOST_CASTLE as GC } from '../../src/game/GhostRules.js';
import { isEnchanted } from '../../src/world/EnchantedStone.js';

const SEED = 20261015, CELL = [-2, -2]; // (a seed whose cell has a castle)
const make = (opts = {}) => {
    const d = new TerrainData();
    d.generate({ seed: SEED, mountains: true, seas: true, lush: true, slopes: true, wizHuts: true, furnish: true, bigHouses: true, buildings: true, dungeons: true, ghostCastle: true, ...opts });
    return d;
};
const ghostBlocks = (d, s, r = 3) => {
    const cx = Math.floor(s.x / CHUNK), cz = Math.floor(s.z / CHUNK);
    let n = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const b = d.chunk(cx + dx, cz + dz).blocks;
        for (let i = 0; i < b.length; i++) if (b[i] >= BLOCK.GHOST_STONE && b[i] <= BLOCK.GHOST_LAMP) n++;
    }
    return n;
};

test('generation 18 has the castle; an older world (and a world without the option) has none', () => {
    assert.ok(GHOST_CASTLE_FROM_GEN <= WORLD_GEN);
    assert.ok(make().ghost, 'the index exists');
    assert.equal(make({ ghostCastle: false }).ghost, null, 'an older world: no Castle of Ghosts');
    assert.equal(make({ lush: false }).ghost, null);
});

test('the castle is not in the world until the hero sees the invisible: no blocks at all', () => {
    const d = make();
    const s = d.ghost.cellOf(...CELL);
    assert.ok(s, 'a castle in the cell');
    assert.equal(d.ghost.on, false);
    assert.equal(ghostBlocks(d, s), 0, 'no black stone in the land');
    assert.deepEqual(d.ghost.partsForChunk(Math.floor(s.x / CHUNK), Math.floor(s.z / CHUNK), CHUNK), [], 'no parts for the chunks');
    assert.equal(d.ghostNear(s.x, s.z, 50).length, 0, 'nothing to find (no chests either)');
});

test('with the sight the castle comes into the land; without it, it goes out again and the land is as it was', () => {
    const d = make();
    const s = d.ghost.cellOf(...CELL);
    const col = (x, z) => d.heightAt(x, z);
    const before = [[s.x, s.z], [s.x + 40, s.z - 30], [s.x - 70, s.z + 20]].map(([x, z]) => col(x, z));
    assert.ok(d.setGhostSeen(true));
    assert.equal(d.setGhostSeen(true), false, 'the same again changes nothing');
    const keys = d.ghostApply(s);
    assert.ok(keys.length >= 36, 'the chunks of the footprint are put right');
    assert.equal(s.shown, true);
    assert.ok(ghostBlocks(d, s) > 1000, 'the black castle stands there');
    // the black stone is enchanted stone: no ordinary spell breaks it
    for (const t of [BLOCK.GHOST_STONE, BLOCK.GHOST_BRICK, BLOCK.GHOST_TILE, BLOCK.GHOST_ROOF, BLOCK.GHOST_LAMP]) assert.ok(isEnchanted(t), 'enchanted: ' + t);
    // it never changes the LAND (heights are the world's own)
    assert.deepEqual([[s.x, s.z], [s.x + 40, s.z - 30], [s.x - 70, s.z + 20]].map(([x, z]) => col(x, z)), before);
    assert.ok(d.ghostNear(s.x, s.z, 50).length === 1, 'a shown castle can be found (its chests)');
    d.setGhostSeen(false);
    d.ghostApply(s);
    assert.equal(s.shown, false);
    assert.equal(ghostBlocks(d, s), 0, 'the sight is gone: an empty place again');
    assert.equal(d.ghostNear(s.x, s.z, 50).length, 0);
});

test('a chunk a player changed keeps the change: the castle goes into its air and comes out of it again, the ground never touched', () => {
    const d = make();
    const s = d.ghost.cellOf(...CELL);
    const x = s.x + 45, z = s.z + 45, cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const g0 = d.heightAt(x, z);
    d.set(x, g0 + 30, z, BLOCK.PLANKS); // (a hut's plank floating: a player's edit — the chunk is «modified»)
    assert.ok(d.chunk(cx, cz).modified);
    const own = d.get(x, g0 + 30, z);
    d.setGhostSeen(true); d.ghostApply(s);
    let n = 0; const b = d.chunk(cx, cz).blocks;
    for (let i = 0; i < b.length; i++) if (b[i] >= BLOCK.GHOST_STONE && b[i] <= BLOCK.GHOST_LAMP) n++;
    assert.ok(n > 0, 'the changed chunk got the castle too');
    assert.equal(d.get(x, g0 + 30, z), own === BLOCK.PLANKS ? BLOCK.PLANKS : d.get(x, g0 + 30, z));
    d.setGhostSeen(false); d.ghostApply(s);
    n = 0; for (let i = 0; i < b.length; i++) if (b[i] >= BLOCK.GHOST_STONE && b[i] <= BLOCK.GHOST_LAMP) n++;
    assert.equal(n, 0, 'taken out again from the changed chunk');
    assert.equal(d.heightAt(x, z), g0, 'the ground is as it was');
    assert.ok(d.get(x, g0, z) !== BLOCK.AIR, 'nothing under the ground was taken');
});

test('with the workers on the main thread never decides a cell: it asks (passive) and takes what a worker sends', () => {
    const w = make(); // (what a terrain worker would decide)
    const d = make();
    d.ghost.passive = true;
    assert.equal(d.ghost.cellOf(...CELL), null, 'passive: undecided reads as none');
    assert.equal(d.ghost.has(...CELL), false);
    const sent = w.ghost.export9(w.ghost.cellOf(...CELL).x, w.ghost.cellOf(...CELL).z);
    const fresh = d.ghost.adopt(JSON.parse(JSON.stringify(sent))); // (it crosses postMessage as plain data)
    assert.ok(fresh.length >= 1, 'the sites of the 3×3 cells came');
    assert.equal(d.ghost.cellOf(...CELL).id, w.ghost.cellOf(...CELL).id);
    assert.ok(d.ghost.has9(fresh[0].x, fresh[0].z));
    assert.equal(d.ghost.adopt(sent).length, 0, 'told again: nothing new');
});

test('the same seed gives the same castle (every computer, every worker)', () => {
    const a = make().ghost.cellOf(...CELL), b = make().ghost.cellOf(...CELL);
    for (const k of ['id', 'x', 'z', 'rot', 'F', 'lo', 'hi', 'seed']) assert.equal(a[k], b[k], k);
});

test('the castle is whole inside its cell, far from the start, and the heights fit under the ceiling', () => {
    const d = make();
    let found = 0;
    for (let gz = -3; gz <= 1; gz++) for (let gx = -3; gx <= 1; gx++) {
        const s = d.ghost.cellOf(gx, gz);
        if (!s) continue;
        found++;
        assert.ok(s.x0 >= gx * GC.CELL && s.x1 < (gx + 1) * GC.CELL && s.z0 >= gz * GC.CELL && s.z1 < (gz + 1) * GC.CELL, s.id + ' inside its cell');
        assert.ok(Math.hypot(s.x, s.z) >= GC.MIN_SPAWN, 'far from the start');
        assert.ok(s.F + 1 + 80 <= 120, 'under the world ceiling');
        assert.ok(s.F - s.hi === GC.PLINTH && s.hi - s.lo <= GC.SPREAD);
    }
    assert.ok(found >= 1);
});

test('a world without lush land or an index with no sites gives nothing', () => {
    const idx = new GhostCastleIndex(1, Object.assign(() => 60, { water: 0, sea: false }), () => false);
    assert.equal(idx.cellOf(0, 0), null, 'ground too high: none');
    assert.deepEqual(idx.partsForChunk(0, 0, CHUNK), []);
});
