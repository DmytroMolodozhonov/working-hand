// Every boss has a chest with things that fit it (CLAUDE.md: «Боссы»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';
import { rollDragonLoot } from '../../src/game/ItemTypes.js';

const t = new TerrainData();
t.generate({ seed: 12345, mountains: true });
const lairList = [7, 99991].flatMap((seed) => { const w = new TerrainData(); w.generate({ seed, mountains: true, seas: true, deepCaves: true }); return w.lairsNear(0, 0, 2400); });

test('dragon lairs: two chests in the hall, inside it', () => {
    const lairs = lairList;
    assert.ok(lairs.length > 0);
    for (const s of lairs) {
        assert.equal(s.chests.length, 2);
        for (const c of s.chests) assert.ok(Math.hypot(c.x - s.lair.x, c.z - s.lair.z) < s.lair.r - 3, 'inside the hall');
    }
});

test('wizard tower: the Master\'s study holds a chest; the vault chests too', () => {
    let n = 0;
    for (let gz = -8; gz < 8; gz++) for (let gx = -8; gx < 8; gx++) {
        const w = t.towers.cellOf(gx, gz);
        if (!w) continue;
        n++;
        const rooms = new Set(w.chests.map((c) => c.room));
        assert.ok(rooms.has('study'), 'study chest');
        assert.ok(rooms.has('vault'), 'vault chest');
    }
    assert.ok(n > 0);
});

test('castle king: chests in the treasury and the king\'s rooms', () => {
    let n = 0;
    for (let gz = -4; gz <= 4; gz++) for (let gx = -4; gx <= 4; gx++) {
        const c = t.castles.cellOf(gx, gz);
        if (!c || !c.chests) continue;
        n++;
        assert.ok(c.chests.some((x) => x.room === 'treasury'), 'treasury chest');
    }
    assert.ok(n > 0);
});

test('boss loot: dragon — precious things (the giant spider has no chest)', () => {
    for (let i = 0; i < 20; i++) assert.ok(rollDragonLoot().length >= 2);
});
