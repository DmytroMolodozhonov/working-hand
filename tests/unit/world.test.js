import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, pushOutOfRect } from '../../src/world/Collision.js';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { chestFacing } from '../../src/world/World.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('circle is pushed out of a box along the shortest way', () => {
    const p = { x: 0.9, z: 0 };
    assert.ok(pushOutOfRect(p, 0.5, -1, 1, -1, 1));
    assert.ok(Math.abs(p.x - 1.5) < 1e-9 && p.z === 0);
    const q = { x: 3, z: 3 };
    assert.equal(pushOutOfRect(q, 0.5, -1, 1, -1, 1), false);
});

test('map walls block the player (grid lookup)', () => {
    const c = new CollisionWorld();
    c.setWalls([{ x: 10, z: 10 }], 5, 8);
    const pos = { x: 10 + 2.5 + 0.2, z: 10 };
    c.resolveCylinder(pos, 0.48, -0.5, 3.5);
    assert.ok(pos.x >= 10 + 2.5 + 0.48 - 1e-9, `pushed to ${pos.x}`);
    assert.ok(c.pointBlocked(10, 2, 10));
    assert.ok(!c.pointBlocked(10, 9, 10), 'above the wall is free');
});

test('tables block walking but support items on top', () => {
    const c = new CollisionWorld();
    c.addBox({ minX: -2.5, maxX: 2.5, minY: -0.5, maxY: 2.05, minZ: -2, maxZ: 2 });
    const pos = { x: 0, z: 2.2 };
    c.resolveCylinder(pos, 0.48, -0.5, 3.5);
    assert.ok(pos.z >= 2.48 - 1e-9);
    assert.equal(c.supportY(0, 0, 2.3), 2.05);
    assert.equal(c.supportY(0, 0, 0.5), -0.5, 'under the table top you stand on the ground');
});

test('terrain: one-block steps are walkable, cliffs block', () => {
    const t = new TerrainData(64);
    t.generate({ seed: 1 });
    const c = new CollisionWorld();
    c.setTerrain(t);
    t.set(3, 1, 0, BLOCK.STONE); // 1 block step
    for (let L = 1; L <= 4; L++) t.set(-3, L, 0, BLOCK.STONE); // 4-block cliff
    const a = { x: 2.6, z: 0 };
    assert.equal(c.resolveCylinder(a, 0.48, -0.5, 3.5, 1.05), false, 'step is not an obstacle');
    const b = { x: -2.6, z: 0 };
    assert.equal(c.resolveCylinder(b, 0.48, -0.5, 3.5, 1.05), true, 'cliff blocks');
    assert.ok(b.x >= -2.5 + 0.48 - 1e-9);
    assert.equal(c.groundY(3, 0), 0.5);
});

test('chest faces open space, never a wall', () => {
    // Chest at (5,5) with a wall right in front (+Z) and to the right (+X)
    const walls = new Set(['5,6', '6,5']);
    const rot = chestFacing(5, 5, walls, { playerSpawn: { x: 5, z: 9 } });
    const dir = { x: Math.round(Math.sin(rot)), z: Math.round(Math.cos(rot)) };
    assert.ok(!walls.has(`${5 + dir.x},${5 + dir.z}`), `faces ${JSON.stringify(dir)}`);
    // Open everywhere: faces the player spawn
    const r2 = chestFacing(5, 5, new Set(), { playerSpawn: { x: 1, z: 5 } });
    assert.equal(Math.round(Math.sin(r2)), -1);
});

test('voice spell recognition (old words still work, Бомбардо added)', () => {
    const cases = {
        'инферно': 'Inferno', 'огонь': 'Inferno', 'гром': 'Thunderwave', 'тандервейв': 'Thunderwave',
        'сапира': 'Sapira', 'санд': 'Sands', 'даст': 'Sands', 'айс': 'Ice', 'лёд': 'Ice', 'лед': 'Ice',
        'бомбардо': 'Bombardo', 'бомбарда': 'Bombardo', 'bombardo': 'Bombardo', 'бамбардо': 'Bombardo', 'бомба': 'Bombardo',
    };
    for (const [word, spell] of Object.entries(cases)) assert.equal(matchSpell(word), spell, word);
    assert.equal(matchSpell('привет как дела'), null);
    assert.equal(matchSpell(''), null);
});
