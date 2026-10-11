import test from 'node:test';
import assert from 'node:assert/strict';
import { CAULDRON, RECIPES, newBrew, addWater, addIngredient, stepBrew, takePortion, spill, matchRecipe, fullness, rollCaveCauldron, randomColor, wallRadius, surfaceY, SLUDGE } from '../../src/game/Potions.js';
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
    const small = (4 / 3) * Math.PI * Math.cbrt((3 * 2) / (4 * Math.PI)) ** 3; // («Waterbollow»: 2 m³)
    addWater(st, small);
    assert.equal(st.phase, 'water');
    assert.ok(Math.abs(fullness(st) - 1 / 3) < 0.02, `a third (${fullness(st)})`);
    const over = addWater(st, 6);
    assert.equal(fullness(st), 1);
    assert.ok(Math.abs(over - 2) < 0.01, 'the rest runs over the rim');
    assert.ok(surfaceY(st) > CAULDRON.BOTTOM + 1.5 && surfaceY(st) < CAULDRON.H, 'the water near the rim');
});

test('cauldron: water, then the healing recipe (any order) → brews 30–60 s (random) → ready, a random colour, 3 portions', () => {
    const durs = new Set(), colours = new Set();
    for (const seed of [1, 2, 3, 4, 5]) {
        const rng = createRng(seed);
        const st = newBrew();
        addWater(st, CAULDRON.FULL);
        assert.equal(addIngredient(st, 'crystal'), 'in');
        assert.equal(addIngredient(st, 'apple'), 'in');
        assert.equal(run(st, CAULDRON.SETTLE - 1, rng), null, 'it settles first');
        assert.equal(run(st, 1.5, rng), 'brew');
        assert.equal(st.phase, 'brewing');
        assert.ok(st.dur >= 30 && st.dur <= 60, `brewing ${st.dur} s`);
        durs.add(Math.round(st.dur));
        assert.equal(run(st, st.dur - 1, rng), null, 'still brewing');
        assert.equal(run(st, 1.5, rng), 'ready');
        assert.equal(st.rec, 'heal');
        assert.equal(st.por, CAULDRON.PORTIONS);
        colours.add(st.color);
        assert.equal(takePortion(st), 'heal');
        assert.equal(takePortion(st), 'heal');
        assert.equal(takePortion(st), 'heal');
        assert.equal(takePortion(st), null, 'three flasks, then it is empty');
        assert.equal(st.phase, 'empty');
    }
    assert.ok(durs.size >= 3, 'a different time each brew');
    assert.ok(colours.size >= 4, 'a different colour each time');
});

test('cauldron: wrong things → grey sludge; a thing into a ready potion spoils it; tipped over it is empty', () => {
    const st = newBrew();
    addWater(st, CAULDRON.FULL);
    addIngredient(st, 'bread');
    assert.equal(run(st, CAULDRON.SETTLE + 0.5), 'brew');
    assert.equal(run(st, 61), 'sludge');
    assert.equal(st.color, SLUDGE);
    assert.equal(takePortion(st), null, 'no potion from sludge');
    assert.equal(spill(st), true);
    assert.equal(st.phase, 'empty');
    // a ready potion spoilt by one more thing
    const p = newBrew();
    addWater(p, CAULDRON.FULL);
    addIngredient(p, 'apple'); addIngredient(p, 'crystal');
    run(p, 70);
    assert.equal(p.phase, 'ready');
    assert.equal(addIngredient(p, 'wool'), 'spoil');
    assert.equal(p.phase, 'sludge');
    // things that never dissolve just sink
    const w = newBrew();
    addWater(w, CAULDRON.FULL);
    assert.equal(addIngredient(w, 'wand'), 'sink');
    assert.equal(run(w, 20), null, 'a wand on the bottom brews nothing');
    // not full: it waits for more water
    const half = newBrew();
    addWater(half, 2);
    addIngredient(half, 'apple'); addIngredient(half, 'crystal');
    assert.equal(run(half, 20), null);
    addWater(half, 4);
    assert.equal(run(half, CAULDRON.SETTLE + 0.5), 'brew');
});

test('recipes: exactly the ingredients (counts too), any order', () => {
    assert.ok(RECIPES.length >= 1 && RECIPES.every((r) => r.id && r.name && r.effect && Object.keys(r.ingredients).length));
    assert.equal(matchRecipe({ crystal: 1, apple: 1 })?.id, 'heal');
    assert.equal(matchRecipe({ apple: 2, crystal: 1 }), null);
    assert.equal(matchRecipe({ apple: 1 }), null);
    assert.equal(matchRecipe({ apple: 1, crystal: 1, wool: 1 }), null);
    assert.equal(matchRecipe({}), null);
    for (const k of Object.keys(RECIPES[0].ingredients)) assert.ok(ITEM_INFO[k], `${k} is a real thing`);
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
