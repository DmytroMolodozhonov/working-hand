import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';

/**
 * Cave chests (generation 4) stand clear in their chambers: no rock anywhere in the chest
 * (3.6 × 2.4 m, 2.1 m high, turned as it stands), a floor under it, never two side by side.
 * Where two systems cross, the game moves a chest a step up or down, or leaves it out — never in the rock.
 */
test('caves: every chest stands clear of the rock, on a floor, none side by side', () => {
    for (const [seed, testGround] of [[12345, true], [7, false], [99991, false]]) {
        const d = new TerrainData();
        d.generate({ seed, mountains: true, seas: true, test: testGround, deepCaves: true });
        const systems = d.cavesNear(0, 0, 260);
        assert.ok(systems.length >= 3, `caves (seed ${seed})`);
        let all = 0, placed = 0, asMade = 0;
        for (const s of systems) {
            s.chests.forEach((c0, k) => {
                for (const o of s.chests.slice(0, k)) assert.ok(Math.hypot(o.x - c0.x, o.z - c0.z) >= 6, `${s.id}: two chests side by side`);
                all++;
                const c = d.chestSpot(c0);
                if (!c) return;
                placed++;
                if (c.y === c0.y) asMade++;
                const cos = Math.cos(c.a), sin = Math.sin(c.a);
                for (let lx = -1.8; lx <= 1.81; lx += 0.6) for (let lz = -1.2; lz <= 1.21; lz += 0.6) {
                    const x = Math.round(c.x + lx * cos + lz * sin), z = Math.round(c.z - lx * sin + lz * cos);
                    for (let L = c.y + 1; L <= c.y + 3; L++) assert.equal(d.get(x, L, z), 0, `${seed} ${s.id}: rock in the chest at ${x},${L},${z}`);
                }
                assert.notEqual(d.get(Math.floor(c.x), c.y, Math.floor(c.z)), 0, `${seed} ${s.id}: a floor under the chest`);
            });
        }
        assert.ok(placed >= 3 && placed >= all * 0.85 && asMade >= all * 0.75, `chests (seed ${seed}): ${asMade} as made, ${placed} placed of ${all}`);
    }
});
