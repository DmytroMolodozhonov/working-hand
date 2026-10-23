import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, TEST_DRAGON_SPOT } from '../../src/world/Terrain.js';

/**
 * Creative: the test dragon must not sleep on the Ice Queen (author: «дракон сидел прямо на Королеве»).
 * Every creature of the ground has its own clear spot: the dragon's (body ~19 m, wings ~33 m) against the queen on her
 * throne, the monsters and snowmen at her gates, and the pedestals.
 */
test('creative: the test dragon has its own peak, clear of the ice castle, its gates and the pedestals', () => {
    for (const seed of [12345, 7, 99991]) {
        const d = new TerrainData(); d.generate({ seed, mountains: true, seas: true, test: true, deepCaves: true });
        const k = d.iceCastle.plan, D = TEST_DRAGON_SPOT, H = d.heightAt;
        assert.ok(k, 'the ice castle');
        // (the castle's whole shelf, with the dragon's ground)
        assert.ok(Math.hypot(D.x - k.x, D.z - k.z) > k.R + D.r + 8, 'clear of the castle');
        const pts = [k.throne, k.gate.out, k.hall, ...k.guard];
        for (const p of pts) assert.ok(Math.hypot(D.x - p.x, D.z - p.z) > D.r + 16, `clear of ${JSON.stringify(p)}`);
        // (the pedestals' field: x −16…25, z −21…3)
        const dx = Math.max(0, -16 - D.x, D.x - 25), dz = Math.max(0, -21 - D.z, D.z - 3);
        assert.ok(Math.hypot(dx, dz) > D.r + 20, 'clear of the pedestals');
        // (dry, solid ground all round)
        for (let a = 0; a < 12; a++) for (const r of [0, 6, D.r]) { const h = H(D.x + Math.cos(a / 12 * 6.283) * r, D.z + Math.sin(a / 12 * 6.283) * r); assert.ok(!H.water && !H.sea && h >= 6, `ground at ${a},${r}`); }
    }
});
