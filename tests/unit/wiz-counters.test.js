// The shops of the wizards' market lane (generation WIZ_COUNTER_FROM_GEN = 34, the author 19.11: «прилавки очень маленькие, всё забито, легко обронить деньги —
// сделать обширнее, с пустым местом для денег, магически интересно»): the counter fills the whole open front (7 × 3, was 5 × 2), the goods lie on its left (display)
// part, the right part is an empty rune plate for the coins with a rim round it; older worlds keep the old counters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, WIZ_COUNTER_FROM_GEN, WORLD_GEN } from '../../src/world/Terrain.js';

function stallsOf(opts) {
    const t = new TerrainData(); t.generate({ seed: 4242, mountains: true, ...opts });
    return t.villages.spawnVillage().stalls.filter((s) => s.counter);
}
const area = (r) => (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);

test('the new counters are wide, with a display part and an empty plate for the coins', () => {
    assert.ok(WORLD_GEN >= WIZ_COUNTER_FROM_GEN);
    const wide = stallsOf({ wizCounters: true }), old = stallsOf({});
    assert.equal(wide.length, old.length, 'the same shops');
    for (let i = 0; i < wide.length; i++) {
        const w = wide[i], o = old[i];
        assert.ok(area(w.counter) >= area(o.counter) * 2 - 1e-6, `counter ${i}: ${area(w.counter)} vs ${area(o.counter)}`);
        assert.ok(w.goodsRect && w.payRect, 'display part and plate');
        assert.ok(!o.goodsRect && !o.payRect, 'old worlds are as they were');
        // the two parts share the counter's rim and do not overlap
        const ov = Math.min(w.goodsRect.x1, w.payRect.x1) - Math.max(w.goodsRect.x0, w.payRect.x0) + 1 > 0 && Math.min(w.goodsRect.z1, w.payRect.z1) - Math.max(w.goodsRect.z0, w.payRect.z0) + 1 > 0;
        assert.equal(ov, false, 'the plate is empty of goods');
        assert.ok(area(w.payRect) >= 9, 'a plate big enough to set a pouch down');
        assert.equal(w.counter.top, o.counter.top, 'the same height');
    }
});

test('the shops of the older generation are unchanged in everything else (houses, roads)', () => {
    const a = new TerrainData(); a.generate({ seed: 4242, mountains: true });
    const b = new TerrainData(); b.generate({ seed: 4242, mountains: true, wizCounters: true });
    const va = a.villages.spawnVillage(), vb = b.villages.spawnVillage();
    assert.equal(va.houses.length, vb.houses.length);
    assert.deepEqual(va.houses.map((h) => [h.x, h.z]), vb.houses.map((h) => [h.x, h.z]), 'the lots did not move (the rng is the same)');
});
