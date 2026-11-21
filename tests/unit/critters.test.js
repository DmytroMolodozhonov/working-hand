// The small flying life (Critters.js): who comes when — butterflies by day in a forest, dragonflies over water, fireflies at night — and that they stay few and go away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Critters } from '../../src/game/Critters.js';

function fake(over = {}) {
    const H = () => 10; H.water = 0; H.sea = false;
    const g = { scene: null, gen: 36, isNight: false, storm: null, nature: { habitat: { forest: true, water: null } }, world: { terrain: { data: { lush: true, heightAt: H, biomeAt: () => 1 } } }, ...over };
    return g;
}
const run = (c, sec, pos = { x: 0, y: 11, z: 0 }) => { for (let i = 0; i < sec * 30; i++) c.update(1 / 30, pos); };

test('by day in a forest: butterflies come, no fireflies, no dragonflies; they stay few and near', () => {
    const c = new Critters(fake());
    run(c, 12);
    const n = { b: 0, d: 0, f: 0 }; for (const x of c.list) n[x.kind]++;
    assert.ok(n.b >= 5 && n.b <= 8, 'butterflies ' + n.b); assert.equal(n.d, 0); assert.equal(n.f, 0);
    for (const x of c.list) { assert.ok(Number.isFinite(x.x + x.y + x.z), 'finite'); assert.ok(Math.hypot(x.x, x.z) < 80, 'near the hero'); assert.ok(x.y > 9 && x.y < 20, 'in the air above the ground'); }
    assert.ok(c.butterflies.reduce((s, m) => s + m.count, 0) === n.b, 'every one is drawn');
});

test('at night by the water: fireflies glow, no butterflies; the day brings them back, the night sends them away', () => {
    const g = fake({ isNight: true, nature: { habitat: { forest: false, water: { x: 5, z: 5, y: 10 } } } });
    const c = new Critters(g);
    run(c, 15);
    let f = 0, b = 0; for (const x of c.list) { if (x.kind === 'f') f++; if (x.kind === 'b') b++; }
    assert.ok(f >= 10 && f <= 14 && b === 0, 'fireflies ' + f);
    g.isNight = false; run(c, 20);
    const d = c.list.filter((x) => x.kind === 'd').length, f2 = c.list.filter((x) => x.kind === 'f').length;
    assert.ok(d >= 3 && d <= 5, 'dragonflies by day over the water ' + d); assert.equal(f2, 0, 'the fireflies are gone by day');
});

test('a storm or a cave or an old world: none; far from the habitat they fade', () => {
    const g = fake({ storm: { raining: true } }); const c = new Critters(g); run(c, 8); assert.equal(c.list.length, 0, 'none in a storm');
    const old = new Critters(fake({ gen: 35 })); run(old, 8); assert.equal(old.list.length, 0, 'none in an old world');
    const cave = new Critters(fake({ _inCave: true })); run(cave, 8); assert.equal(cave.list.length, 0, 'none in a cave');
    const h = fake(); const k = new Critters(h); run(k, 10); assert.ok(k.list.length > 0);
    h.nature.habitat = { forest: false, water: null }; h.world.terrain.data.biomeAt = () => 6; run(k, 15);
    assert.equal(k.list.length, 0, 'they leave when the forest is left');
});
