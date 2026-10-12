import test from 'node:test';
import assert from 'node:assert/strict';
import { CAULDRON, RECIPES, newBrew, addWater, addIngredient, stepBrew, takePortion, spill, matchRecipe, fullness, rollCaveCauldron, randomColor, wallRadius, surfaceY, SLUDGE, boiling, recipeById } from '../../src/game/Potions.js';
import { handContact, pushMove } from '../../src/game/Cauldrons.js';
import { createRng } from '../../src/core/math.js';
import { TerrainData } from '../../src/world/Terrain.js';
import { wizardRoster } from '../../src/game/WizardAI.js';
import { ITEM_INFO, itemValue, describeItem } from '../../src/game/ItemTypes.js';

const run = (st, secs, rng = Math.random) => { let ev = null; for (let t = 0; t < secs; t += 0.1) ev = stepBrew(st, 0.1, rng) || ev; return ev; };

test('cauldron: big — half a hero (4.8 m) tall and more, wider than tall', () => {
    assert.ok(CAULDRON.H >= 2.4, `${CAULDRON.H} m tall`);
    assert.ok(CAULDRON.R_BODY * 2 > CAULDRON.H, 'wider than tall');
    assert.ok(wallRadius(1.5) > wallRadius(0.5) && wallRadius(1.5) > wallRadius(2.6), 'a round belly');
});

test('cauldron: dry and inert until water; a small ball fills a third, a big one fills it, more runs over', () => {
    const st = newBrew();
    assert.equal(st.phase, 'empty');
    assert.equal(addIngredient(st, 'apple'), 'dry', 'a thing in a dry cauldron lies on the bottom');
    assert.equal(run(st, 10), null, 'nothing happens without water');
    assert.equal(run(st, 30), null);
    const small = (4 / 3) * Math.PI * Math.cbrt((3 * 2) / (4 * Math.PI)) ** 3; // («Waterbollow»: 2 m³)
    addWater(st, small);
    assert.equal(st.phase, 'water');
    assert.ok(Math.abs(fullness(st) - 1 / 3) < 0.02, `a third (${fullness(st)})`);
    const over = addWater(st, 6);
    assert.equal(fullness(st), 1);
    assert.ok(Math.abs(over - 2) < 0.01, 'the rest runs over the rim');
    assert.ok(surfaceY(st) > CAULDRON.BOTTOM + 1.5 && surfaceY(st) < CAULDRON.H, 'the water near the rim');
});

/** Water in it, over a burning fire until it boils. */
const boiled = (rng = Math.random) => {
    const st = newBrew();
    addWater(st, CAULDRON.FULL);
    assert.equal(addIngredient(st, 'apple'), 'cold', 'cold water: it sinks, counts for nothing');
    let ev = null;
    for (let t = 0; t < CAULDRON.BOIL_TIME + 0.5; t += 0.1) ev = stepBrew(st, 0.1, rng, true) || ev;
    assert.equal(ev, 'boil');
    assert.ok(boiling(st));
    return st;
};
const runFire = (st, secs, rng = Math.random, fire = true) => { let ev = null; for (let t = 0; t < secs; t += 0.1) ev = stepBrew(st, 0.1, rng, fire) || ev; return ev; };

test('cauldron: on a fire the water boils; off it, it never does', () => {
    const st = newBrew();
    addWater(st, CAULDRON.FULL);
    assert.equal(runFire(st, 60, Math.random, false), null);
    assert.equal(boiling(st), false, 'no fire: cold');
    assert.ok(CAULDRON.BOIL_TIME >= 8 && CAULDRON.BOIL_TIME <= 25);
    const b = boiled();
    assert.equal(b.ings.apple, undefined, 'the apple thrown into cold water does not count');
});

test('cauldron: boiling, the healing recipe in any order → brews 30–60 s (random) → ready, a random colour, 10 flasks, the level going down', () => {
    const durs = new Set(), colours = new Set();
    for (const seed of [1, 2, 3, 4, 5]) {
        const rng = createRng(seed);
        const st = boiled(rng);
        assert.equal(addIngredient(st, 'crystal'), 'in');
        assert.ok(st.win > 29, 'the countdown starts with the first one');
        assert.equal(addIngredient(st, 'apple'), 'in');
        assert.equal(runFire(st, 0.2, rng), 'brew', 'all in: it brews');
        assert.ok(st.dur >= 30 && st.dur <= 60, `brewing ${st.dur} s`);
        durs.add(Math.round(st.dur));
        assert.equal(runFire(st, st.dur - 1, rng), null, 'still brewing');
        assert.equal(runFire(st, 1.5, rng), 'ready');
        assert.equal(st.rec, 'heal');
        assert.equal(st.por, CAULDRON.PORTIONS);
        assert.equal(CAULDRON.PORTIONS, 10);
        colours.add(st.color);
        let level = surfaceY(st);
        for (let i = 0; i < 10; i++) {
            assert.equal(takePortion(st), 'heal', `flask ${i + 1}`);
            const now = surfaceY(st);
            assert.ok(now < level, 'the level goes down');
            level = now;
        }
        assert.equal(takePortion(st), null, 'ten flasks, then it is empty');
        assert.equal(st.phase, 'empty');
    }
    assert.ok(durs.size >= 3, 'a different time each brew');
    assert.ok(colours.size >= 4, 'a different colour each time');
    // less water: fewer flasks
    const half = newBrew();
    addWater(half, 3);
    runFire(half, CAULDRON.BOIL_TIME + 1);
    addIngredient(half, 'apple'); addIngredient(half, 'crystal');
    runFire(half, 70);
    assert.equal(half.phase, 'ready');
    assert.equal(half.por, 5);
});

test('cauldron: 30 s for all the ingredients — too late, the fire out, wrong things → sludge; a thing into a ready potion spoils it; tipped over it is empty', () => {
    const late = boiled();
    addIngredient(late, 'web'); addIngredient(late, 'glass');
    assert.equal(runFire(late, 29), null, 'still time');
    assert.equal(runFire(late, 1.5), 'late');
    assert.equal(late.phase, 'sludge');
    assert.equal(late.color, SLUDGE);
    // the invisibility potion: all three in time, in any order
    const inv = boiled();
    for (const k of ['glass', 'minotaurHorn', 'web']) { assert.equal(addIngredient(inv, k), 'in'); runFire(inv, 9); }
    assert.equal(inv.phase, 'brewing');
    runFire(inv, 61);
    assert.equal(inv.rec, 'invis');
    // the fire goes out while brewing
    const out = boiled();
    addIngredient(out, 'apple'); addIngredient(out, 'crystal');
    runFire(out, 5);
    assert.equal(out.phase, 'brewing');
    assert.equal(runFire(out, 40, Math.random, false), 'out');
    assert.equal(out.phase, 'sludge');
    // wrong things: nothing ever matches → too late
    const st = boiled();
    addIngredient(st, 'bread');
    assert.equal(runFire(st, 31), 'late');
    assert.equal(takePortion(st), null, 'no potion from sludge');
    assert.equal(spill(st), true);
    assert.equal(st.phase, 'empty');
    // a ready potion spoilt by one more thing
    const p = boiled();
    addIngredient(p, 'apple'); addIngredient(p, 'crystal');
    runFire(p, 70);
    assert.equal(p.phase, 'ready');
    assert.equal(addIngredient(p, 'wool'), 'spoil');
    assert.equal(p.phase, 'sludge');
    // things that never dissolve just sink; a dry cauldron starts nothing
    const w = boiled();
    assert.equal(addIngredient(w, 'wand'), 'sink');
    assert.equal(runFire(w, 40), null, 'a wand on the bottom brews nothing');
    assert.equal(addIngredient(newBrew(), 'apple'), 'dry');
});

test('recipes: exactly the ingredients (counts too), any order', () => {
    assert.ok(RECIPES.length >= 2 && RECIPES.every((r) => r.id && r.name && Object.keys(r.ingredients).length && r.window > 0));
    assert.equal(matchRecipe({ crystal: 1, apple: 1 })?.id, 'heal');
    assert.equal(matchRecipe({ apple: 2, crystal: 1 }), null);
    assert.equal(matchRecipe({ apple: 1 }), null);
    assert.equal(matchRecipe({ apple: 1, crystal: 1, wool: 1 }), null);
    assert.equal(matchRecipe({}), null);
    assert.equal(matchRecipe({ glass: 1, web: 1, minotaurHorn: 1 })?.id, 'invis');
    assert.equal(recipeById('invis').effect, null, 'its effect: not described yet');
    for (const r of RECIPES) for (const k of Object.keys(r.ingredients)) assert.ok(ITEM_INFO[k], `${k} is a real thing`);
});

test('flask and potion are things: a name, a price, a card', () => {
    assert.ok(ITEM_INFO.flask && ITEM_INFO.potion);
    assert.ok(itemValue({ kind: 'potion', rec: 'heal' }) > 0);
    assert.match(describeItem({ kind: 'potion', rec: 'heal', color: 0xff0000 }).title, /исцеления/);
    assert.ok(/^#?[0-9a-f]+$/i.test(randomColor().toString(16)));
});

test('hands on the cauldron: belly, rim, handles; it takes both hands; open palms only push, a grip drags', () => {
    assert.equal(handContact({ x: CAULDRON.R_RIM, y: CAULDRON.H, z: 0 }), 'rim');
    assert.equal(handContact({ x: CAULDRON.R_RIM + 0.28, y: CAULDRON.H - 0.42, z: 0 }), 'handle');
    assert.equal(handContact({ x: 0, y: 1.4, z: wallRadius(1.4) + 0.1 }), 'wall');
    assert.equal(handContact({ x: 0, y: 1.4, z: wallRadius(1.4) + 1.5 }), null, 'a hand in the air');
    // pushing from the -x side towards +x
    const push = (d) => ({ contact: 'wall', grip: false, d, n: [1, 0] });
    assert.deepEqual(pushMove([push([0.1, 0])]), [0, 0], 'one hand does not move it');
    const [x] = pushMove([push([0.1, 0]), push([0.1, 0])]);
    assert.ok(x > 0.08, 'two hands push it');
    assert.deepEqual(pushMove([push([-0.1, 0]), push([-0.1, 0])]).map(Math.abs), [0, 0], 'open hands cannot pull');
    const grip = (d) => ({ contact: 'rim', grip: true, d, n: [1, 0] });
    const [gx] = pushMove([grip([-0.1, 0]), grip([-0.1, 0])]);
    assert.ok(gx < -0.08, 'gripping the rim, it is dragged back');
});

test('caves: a forgotten cauldron now and then (the same every time), about half of them overturned', () => {
    let n = 0, tipped = 0;
    for (let i = 0; i < 2000; i++) {
        const a = rollCaveCauldron(createRng(i)), b = rollCaveCauldron(createRng(i));
        assert.deepEqual(a, b, 'deterministic');
        if (a) { n++; if (a.tipped) tipped++; }
    }
    assert.ok(n > 150 && n < 450, `rare: ${n}/2000`);
    assert.ok(tipped > n * 0.35 && tipped < n * 0.65, `often overturned: ${tipped}/${n}`);
    assert.ok(rollCaveCauldron(() => 0.99, true), 'the creative test cave always has one');
});

test('wizards\' site: the master of cauldrons and potions has a stall (and a cauldron spot) by a house, not in the tower', () => {
    const t = new TerrainData();
    t.generate({ seed: 4242, mountains: true });
    const k = t.towers.spawnKey();
    const gx = Math.round(k / 65536), gz = k - gx * 65536;
    const def = t.towers.cellOf(gx, gz);
    const st = def.stalls.find((s) => s.potions);
    assert.ok(st, 'a potion stall');
    assert.ok(st.cauldron && Number.isFinite(st.cauldron.x) && Number.isFinite(st.counter.top));
    const R = Math.hypot(st.cauldron.x - def.x, st.cauldron.z - def.z);
    assert.ok(R > 20, `outside the tower (${R.toFixed(1)} m from its middle)`);
    const i = def.stalls.indexOf(st);
    const seller = wizardRoster(def, 1 + i);
    assert.equal(seller.role, 'seller');
    assert.equal(seller.stall, i);
});

test('invisibility ingredients: the spider leaves its web, a broken window its glass (the host drops them)', async () => {
    const fs = await import('node:fs');
    for (const k of ['web', 'glass', 'minotaurHorn']) assert.ok(ITEM_INFO[k] && describeItem({ kind: k }).title, k);
    assert.match(fs.readFileSync(new URL('../../src/game/Spider.js', import.meta.url), 'utf8'), /kind: 'web'/);
    assert.match(fs.readFileSync(new URL('../../src/game/Houses.js', import.meta.url), 'utf8'), /g\.authority && g\.items\) g\.items\.spawnLoose\(\{ kind: 'glass'/);
});
