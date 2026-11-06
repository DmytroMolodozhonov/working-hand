// Каждое зелье действительно варится: по коду, как в игре — вода кипит, ингредиенты по одному падают (addIngredient), котёл доходит до «готово» (stepBrew),
// колба берёт порцию. Плюс: каждый ингредиент — настоящая вещь игры, не из «никогда не растворяются», имеет имя; крылья лебедя — любые (простые и магические).
import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, CAULDRON, newBrew, addWater, addIngredient, stepBrew, takePortion, DURABLE, INGREDIENT_RU, INGREDIENT_ALIAS } from '../../src/game/Potions.js';
import { ITEM_INFO } from '../../src/game/ItemTypes.js';
import { POTION_FX } from '../../src/game/PotionEffects.js';

const boilingCauldron = () => { const st = newBrew(); addWater(st, CAULDRON.FULL); st.heat = 1; return st; };
const rng = () => 0.5;

function brewIt(r, kinds) {
    const st = boilingCauldron();
    for (const k of kinds) assert.equal(addIngredient(st, k), 'in', `${r.id}: «${k}» растворилась`);
    let ev = null;
    for (let t = 0; t < 600 && st.phase !== 'ready'; t += 0.5) { const e = stepBrew(st, 0.5, rng, true); if (e) ev = e; if (e === 'late' || e === 'sludge' || e === 'out') break; }
    return { st, ev };
}

for (const r of RECIPES) {
    test(`зелье «${r.name}» (${r.id}) варится и даёт колбу`, () => {
        const list = Object.entries(r.ingredients).flatMap(([k, n]) => Array(n).fill(k));
        const orders = r.order ? [r.order.slice()] : [list, list.slice().reverse()]; // (без порядка — в любом)
        for (const kinds of orders) {
            const { st } = brewIt(r, kinds);
            assert.equal(st.phase, 'ready', `${r.id}: готово (${kinds.join(', ')})`);
            assert.equal(st.rec, r.id);
            assert.ok(st.por >= 1);
            assert.equal(takePortion(st), r.id, 'колба берёт порцию этого зелья');
        }
        if (r.order) { // (неверный порядок — не то зелье)
            const { st } = brewIt(r, r.order.slice().reverse());
            assert.notEqual(st.rec, r.id, `${r.id}: порядок важен`);
        }
    });
    test(`ингредиенты «${r.name}»: настоящие вещи, растворяются, названы`, () => {
        for (const k of Object.keys(r.ingredients)) {
            assert.ok(ITEM_INFO[k], `${r.id}: «${k}» есть в ITEM_INFO`);
            assert.ok(!DURABLE.has(k), `${r.id}: «${k}» не растворяется, но нужна в рецепте`);
            assert.ok(INGREDIENT_RU[k], `${r.id}: «${k}» без названия для подсказок`);
        }
    });
}

test('крылья лебедя — любые: простые и магические варят зелье крыльев', () => {
    assert.equal(INGREDIENT_ALIAS.swanWings, 'magicSwanWings');
    const r = RECIPES.find((x) => x.id === 'wings');
    for (const wings of ['swanWings', 'magicSwanWings']) {
        const st = boilingCauldron();
        assert.equal(addIngredient(st, wings), 'in');
        assert.equal(addIngredient(st, 'apple'), 'in');
        let ev = null; for (let t = 0; t < 600 && st.phase !== 'ready'; t += 0.5) ev = stepBrew(st, 0.5, rng, true) || ev;
        assert.equal(st.phase, 'ready', `${wings}: готово`);
        assert.equal(st.rec, r.id);
    }
});

test('лишняя вещь или холодная вода портят зелье, а не молчат', () => {
    const st = boilingCauldron(); addIngredient(st, 'apple'); addIngredient(st, 'crystal'); addIngredient(st, 'bread');
    for (let t = 0; t < 200; t += 0.5) stepBrew(st, 0.5, rng, true);
    assert.equal(st.phase, 'sludge');
    const cold = newBrew(); addWater(cold, CAULDRON.FULL);
    assert.equal(addIngredient(cold, 'apple'), 'cold');
});

test('у каждого зелья есть то, что оно делает при питье', () => {
    for (const r of RECIPES) {
        const fx = r.effect || {};
        assert.ok(fx.hp || fx.skin || fx.lordCure || fx.wings || fx.maxHp || fx.dread || fx.skin || fx.reset || (fx.timed && POTION_FX[fx.timed]), `${r.id}: эффект известен`);
    }
});
