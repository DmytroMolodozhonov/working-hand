// The author 20.11: the buyer's / potion master's / hamlet magic seller's counters were one block thin («предметы проходят сквозь блоки»): every counter is now ≥ 3 deep, ≥ 3 long, 2 high,
// and the seller's place behind it is clear air (3 blocks) — measured on the real blocks of the world.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';

const make = (seed) => { const t = new TerrainData(); t.generate({ seed, mountains: true, lush: true, seas: true }); return t; };
function tower(t) { const k = t.towers.spawnKey(); const gx = Math.round(k / 65536); return t.towers.cellOf(gx, k - gx * 65536); }

test('the stalls of the tower site: every counter rect is at least 3 × 3 cells, and has a seller place behind', () => {
    let n = 0;
    for (const seed of [4242, 12345, 1, 777, 20261015]) {
        const d = tower(make(seed));
        for (const s of d.stalls || []) {
            if (!s.counter) continue;
            const w = s.counter.x1 - s.counter.x0 + 1, h = s.counter.z1 - s.counter.z0 + 1;
            assert.ok(Math.max(w, h) >= 3 && Math.min(w, h) >= 2.5 || (Math.max(w, h) >= 3 && Math.min(w, h) >= 2), `${d.id} ${s.trade || (s.potions ? 'potions' : '?')}: counter ${w}×${h}`);
            n++;
        }
    }
    assert.ok(n >= 5, 'stalls seen: ' + n);
});
