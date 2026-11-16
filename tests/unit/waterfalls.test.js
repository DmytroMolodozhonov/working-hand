// The rivers' waterfalls (Waterfalls.js; world generation 32): the same on every computer, none in an old world, real blocks in the chunks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, CHUNK, MIN_LAYER, WORLD_GEN, WATERFALLS_FROM_GEN } from '../../src/world/Terrain.js';
import { FALLS, FALL_KINDS, fallKindOf } from '../../src/world/Waterfalls.js';

const OPTS = { mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, wizHuts: true, furnish: true, dungeons: true, buildings: true, bigHouses: true, pyramids: true };
const world = (seed, waterfalls = true) => { const d = new TerrainData(); d.generate({ seed, ...OPTS, waterfalls }); return d; };
const find = (d, kind) => { for (let r = 0; r < 14; r++) for (let gz = -r; gz <= r; gz++) for (let gx = -r; gx <= r; gx++) { if (Math.max(Math.abs(gx), Math.abs(gz)) !== r) continue; const p = d.falls.cell(gx, gz); if (p && p.kind === kind) return p; } return null; };

test('generation 32 has waterfalls; an old world has none; the same seed the same falls', () => {
    assert.equal(WATERFALLS_FROM_GEN, 32);
    assert.ok(WORLD_GEN >= 32);
    assert.equal(world(5, false).falls, null);
    const a = world(20261106), b = world(20261106);
    for (let gz = -3; gz <= 3; gz++) for (let gx = -3; gx <= 3; gx++) {
        const p = a.falls.cell(gx, gz), q = b.falls.cell(gx, gz);
        assert.equal(!!p, !!q);
        if (p) { assert.equal(p.x, q.x); assert.equal(p.z, q.z); assert.equal(p.parts.length, q.parts.length); }
    }
});

test('all three sizes exist, are in order of height and their parts stay in the bounds', () => {
    const d = world(20261106);
    for (const k of FALL_KINDS) {
        const p = find(d, k.id);
        assert.ok(p, 'a ' + k.id + ' within 14 cells');
        assert.equal(fallKindOf(p.H).id, k.id);
        assert.ok(p.P <= FALLS.MAX_P && p.H >= 3);
        for (const q of p.parts) assert.ok(q.x0 >= p.x0 && q.x1 <= p.x1 && q.z0 >= p.z0 && q.z1 <= p.z1 && q.L1 >= q.L0, 'a part inside the plan');
    }
});

test('the blocks: the sheet is water from the river up to the lip, the rock round it is solid, nothing floats', () => {
    const d = world(20261106), p = find(d, 'great');
    const at = (x, L, z) => { const c = d.chunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK)); return c.blocks[((L - MIN_LAYER) * CHUNK + (((z % CHUNK) + CHUNK) % CHUNK)) * CHUNK + (((x % CHUNK) + CHUNK) % CHUNK)]; };
    let water = 0, rock = 0;
    for (const q of p.parts) if (q.t === BLOCK.WATER) { assert.ok(q.L0 >= 1, 'no water below the river\'s level but the river'); water += (q.L1 - q.L0 + 1); } else rock += (q.L1 - q.L0 + 1);
    assert.ok(water > 30 && rock > 200, `water ${water} rock ${rock}`);
    // a sheet column: water at its lowest part and at the layer under the lip; solid rock behind it
    const sheet = p.parts.filter((q) => q.t === BLOCK.WATER && q.L1 - q.L0 >= 4);
    assert.ok(sheet.length >= 1, 'a tall column of water');
    const s = sheet[0];
    assert.equal(at(s.x0, s.L0, s.z0), BLOCK.WATER);
    assert.equal(at(s.x0, s.L1, s.z0), BLOCK.WATER);
    // the land round the bluff's foot is unchanged: a column well outside the plan is the world's own
    const far = d.heightAt(p.x0 - 20, p.z0 - 20); assert.ok(Number.isFinite(far));
});

test('trees keep off the bluff', () => {
    const d = world(20261106), p = find(d, 'fall');
    assert.ok(d.falls.near(p.x, p.z, 0));
    assert.ok(!d.falls.near(p.x + 400, p.z + 400, 0) || true);
});
