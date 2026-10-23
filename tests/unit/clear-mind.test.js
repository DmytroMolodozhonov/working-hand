import test from 'node:test';
import assert from 'node:assert/strict';
import { CAULDRON, newBrew, addWater, addIngredient, stepBrew, takePortion, matchRecipe, recipeById } from '../../src/game/Potions.js';
import { DARK, DarkHero, addDark, onDarkCast, cleanSkin, skinOf, darkLevel, darkStage, wizardDetects } from '../../src/game/DarkMagic.js';

const brewIt = (order) => {
    const st = newBrew();
    addWater(st, CAULDRON.FULL);
    for (let t = 0; t < CAULDRON.BOIL_TIME + 0.5; t += 0.1) stepBrew(st, 0.1, Math.random, true);
    for (const k of order) assert.equal(addIngredient(st, k), 'in');
    return st;
};
const run = (st, secs, rng) => { let ev = null, e; for (let t = 0; t < secs; t += 0.1) { e = stepBrew(st, 0.1, rng, true); if (e) ev = e; } return ev; };

test('clearmind: recipe — owl feather, phoenix feather, golden apple (any order, nothing more)', () => {
    const r = recipeById('clearmind');
    assert.equal(r.name, 'Зелье светлого ума');
    for (const order of [['owlFeather', 'phoenixFeather', 'apple'], ['apple', 'owlFeather', 'phoenixFeather']]) assert.equal(matchRecipe(Object.fromEntries(order.map((k) => [k, 1]))).id, 'clearmind');
    assert.equal(matchRecipe({ owlFeather: 1, phoenixFeather: 1 }), null);
    assert.equal(matchRecipe({ owlFeather: 1, phoenixFeather: 1, apple: 2 }), null);
    assert.equal(matchRecipe({ apple: 1, crystal: 1 }).id, 'heal', 'the healing potion is untouched');
});

test('clearmind: brews 2–3 minutes, then 10 flasks', () => {
    const st = brewIt(['owlFeather', 'phoenixFeather', 'apple']);
    assert.equal(run(st, 0.1, () => 0), 'brew');
    assert.equal(st.dur, 120);
    const st2 = brewIt(['owlFeather', 'phoenixFeather', 'apple']);
    run(st2, 0.1, () => 0.999999);
    assert.ok(st2.dur > 179.9 && st2.dur <= 180);
    assert.equal(run(st2, 100, Math.random), null, 'still brewing after 100 s');
    assert.equal(run(st2, 90, Math.random), 'ready');
    assert.equal(st2.rec, 'clearmind');
    assert.equal(st2.por, 10);
    let n = 0; while (takePortion(st2) === 'clearmind') n++;
    assert.equal(n, 10);
});

test('clearmind: a flask takes 30 off the skin, never the level, never below 0', () => {
    const h = new DarkHero(null);
    addDark(h, 100);
    assert.deepEqual([h.level, h.skin], [100, 100]);
    assert.equal(cleanSkin(h, recipeById('clearmind').effect.skin), 30);
    assert.deepEqual([h.level, h.skin], [100, 70]);
    cleanSkin(h); cleanSkin(h);
    assert.equal(h.skin, 10);
    assert.equal(cleanSkin(h), 10);
    assert.deepEqual([h.level, h.skin], [100, 0], '3–4 flasks clear the body');
    assert.equal(cleanSkin(h), 0);
    assert.equal(darkLevel(h), 100);
});

test('clearmind: after cleansing each dark cast darkens the skin by 10 until it catches the level', () => {
    const h = new DarkHero(null);
    const g = { dark: h };
    addDark(h, 100); for (let i = 0; i < 4; i++) cleanSkin(h);
    assert.equal(h.skin, 0);
    for (let i = 1; i <= 10; i++) { onDarkCast(g, 'Alive', () => 0); assert.equal(h.skin, i * 10); }
    assert.equal(h.skin, 100, 'ten casts: fully black again');
    assert.equal(onDarkCast(g, 'Alive', () => 0.9), 0, 'a failed 50% roll changes nothing');
    // a lower level: the skin grows by 10 but never past the level, which grows as usual
    const m = new DarkHero(null); addDark(m, 45); cleanSkin(m); cleanSkin(m);
    assert.deepEqual([m.level, m.skin], [45, 0]);
    onDarkCast({ dark: m }, 'Alive', () => 0);
    assert.deepEqual([m.level, m.skin], [46, 10]);
    for (let i = 0; i < 10; i++) onDarkCast({ dark: m }, 'Alive', () => 0);
    assert.deepEqual([m.level, m.skin], [56, 56], 'caught up');
    onDarkCast({ dark: m }, 'Alive', () => 0);
    assert.deepEqual([m.level, m.skin], [57, 57], 'equal again: +1 as before');
});

test('clearmind: wizards and stages see the skin, not the level', () => {
    const h = new DarkHero(null);
    addDark(h, 90);
    assert.equal(h.stage, 'outcast');
    cleanSkin(h); cleanSkin(h); cleanSkin(h);
    assert.equal(skinOf(h), 0);
    assert.equal(h.stage, 'clean');
    assert.equal(wizardDetects(skinOf(h)), false);
    assert.equal(darkStage(darkLevel(h)), 'outcast', 'the true level is still black-mage');
});

test('clearmind: save and death keep both counters; old saves follow the level', () => {
    const h = new DarkHero(null); addDark(h, 80); cleanSkin(h);
    const snap = h.snapshot();
    assert.deepEqual(snap, { level: 80, skin: 50 });
    const h2 = new DarkHero(null); h2.restore(JSON.parse(JSON.stringify(snap)));
    assert.deepEqual([h2.level, h2.skin], [80, 50]);
    const old = new DarkHero(null); old.restore({ level: 33 });
    assert.deepEqual([old.level, old.skin], [33, 33]);
    h.onDeath();
    assert.deepEqual([h.level, h.skin], [0, 0]);
    assert.equal(h.snapshot(), null);
    const clean = new DarkHero(null); addDark(clean, 20); cleanSkin(clean); cleanSkin(clean);
    assert.deepEqual(clean.snapshot(), { level: 20, skin: 0 }, 'level kept even if the skin is clean');
});

test('clearmind: the owl sheds a feather', async () => {
    const { OWL } = await import('../../src/game/Owls.js');
    assert.ok(OWL.SHED_CHANCE > 0 && OWL.SHED_CHANCE < 0.2, 'rare');
    const src = (await import('node:fs')).readFileSync(new URL('../../src/game/Owls.js', import.meta.url), 'utf8');
    assert.match(src, /kind: 'owlFeather'[^]*?_die|_die\(o, by\) \{[^]*?kind: 'owlFeather'/, 'a killed owl leaves its feather');
});

test('clearmind: flasks of one brew stack up to 10 in one slot; a different colour does not join', async () => {
    const { sameLook } = await import('../../src/game/Inventory.js');
    const { ITEM_INFO, describeItem } = await import('../../src/game/ItemTypes.js');
    assert.equal(ITEM_INFO.potion.stack, 10);
    const a = { kind: 'potion', rec: 'clearmind', color: 0x55aa33 };
    assert.ok(sameLook(a, { kind: 'potion', rec: 'clearmind', color: 0x55aa33 }));
    assert.ok(!sameLook(a, { kind: 'potion', rec: 'clearmind', color: 0x3355aa }));
    assert.ok(describeItem({ ...a, count: 7 }).lines.some((l) => l.includes('7')));
});
