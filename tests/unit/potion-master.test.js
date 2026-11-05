// Мастер зелий (PotionMaster.js): знает все рецепты, понимает слова, подсказывает по котлу.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecipe, planOf, parseIntent, hintFor, hintLine, recipeLine, knownLine, promptText, POTION_WORDS, listRu } from '../../src/game/PotionMaster.js';
import { RECIPES } from '../../src/game/Potions.js';

test('каждое зелье мира узнаётся по названию и по ключевому слову; рецепт говорится целиком', () => {
    for (const r of RECIPES) {
        assert.equal(findRecipe(r.name)?.id, r.id, `по названию: ${r.name}`);
        const w = POTION_WORDS[r.id]?.[0];
        assert.ok(w, `нет слов для ${r.id}`);
        assert.equal(findRecipe('сделай зелье ' + w + 'ие')?.id === r.id || findRecipe(w)?.id === r.id, true, `по слову «${w}»`);
        const line = recipeLine(r);
        for (const k of Object.keys(r.ingredients)) assert.ok(line.length > 20);
        assert.ok(planOf(r).length >= Object.keys(r.ingredients).length);
    }
    assert.ok(knownLine().includes('Зелье') === false && knownLine().length > 80);
    assert.ok(promptText().includes('Вингардиум'));
    for (const r of RECIPES) assert.ok(promptText().includes(r.name), `в описании для нейросети нет ${r.name}`);
});

test('порядок ингредиентов: у зелья с порядком — как велено; у остальных — все по числу', () => {
    const lord = RECIPES.find((r) => r.order);
    assert.deepEqual(planOf(lord), lord.order);
    const wings = RECIPES.find((r) => r.id === 'wings');
    assert.equal(planOf(wings).length, Object.values(wings.ingredients).reduce((a, b) => a + b, 0));
});

test('разбор слов: свари / как сварить / какие знаешь / помоги / что дальше / налей / огонь / вода / стоп', () => {
    assert.deepEqual(parseIntent('Эрдвин, свари зелье удачи'), { kind: 'brew', rec: RECIPES.find((r) => r.id === 'luck') });
    assert.equal(parseIntent('как сварить зелье русалки')?.kind, 'recipe');
    assert.equal(parseIntent('как сварить зелье русалки')?.rec.id, 'mermaid');
    assert.equal(parseIntent('какие зелья ты знаешь')?.kind, 'list');
    assert.equal(parseIntent('что ты умеешь')?.kind, 'list');
    assert.equal(parseIntent('помоги мне сварить зелье крыльев')?.kind, 'help');
    assert.equal(parseIntent('помоги мне сварить зелье крыльев')?.rec.id, 'wings');
    assert.equal(parseIntent('помоги')?.ask, true);
    assert.equal(parseIntent('что дальше класть')?.kind, 'hint');
    assert.equal(parseIntent('налей зелье')?.kind, 'give');
    assert.equal(parseIntent('налей воды в котёл')?.kind, 'water');
    assert.equal(parseIntent('разожги огонь')?.kind, 'fire');
    assert.equal(parseIntent('стоп')?.kind, 'stop');
    assert.equal(parseIntent('свари что-нибудь')?.ask, true);
    assert.equal(parseIntent('сегодня хорошая погода'), null);
});

test('подсказка по котлу: пусто / верно / не хватает / не то', () => {
    assert.ok(hintFor({}).empty);
    const heal = RECIPES.find((r) => r.id === 'heal');
    assert.equal(hintFor({ ...heal.ingredients })?.done?.id, 'heal');
    const part = hintFor({ apple: 1 });
    assert.equal(part.rec.id, 'heal'); assert.deepEqual(part.missing, ['crystal']);
    assert.ok(hintFor({ wool: 3, meat: 1 }).wrong);
    assert.ok(/[Нн]е хватает/.test(hintLine({ apple: 1 })));
    assert.equal(listRu(['apple', 'apple', 'crystal']), 'золотое яблоко ×2 и кристалл маны');
});

test('«где лежит …»: яйцо дракона и любой другой ингредиент находятся на полках; ответ — стена, полка, ярус, место; колбы и зелья тоже', async () => {
    const { findThing, describeSlot, whereLine, ingredientsLine } = await import('../../src/game/PotionMaster.js');
    const { layout, racks } = await import('../../src/world/PotionLairPlan.js');
    const { stockFor, lairIngredients } = await import('../../src/game/PotionLair.js');
    const P = layout(), R = racks(), stock = stockFor(P.slots);
    assert.equal(parseIntent('где яйцо дракона')?.kind, 'where');
    assert.deepEqual(findThing('где яйцо дракона'), [{ type: 'ing', kind: 'dragonEgg' }]);
    assert.equal(parseIntent('покажи колбы')?.things[0].type, 'flask');
    assert.equal(parseIntent('где зелье удачи')?.things[0].rec.id, 'luck');
    // каждый ингредиент мира находится по своему названию и имеет место на полках
    for (const k of lairIngredients()) {
        const e = stock.find((x) => x.item.kind === k);
        assert.ok(e, `нет места для ${k}`);
        const r = whereLine(findThing('где найти ' + (await import('../../src/game/Potions.js')).INGREDIENT_RU[k]), stock, R);
        assert.ok(typeof r !== 'string' && r.found.length >= 1, `не нашёл по названию: ${k}`);
        assert.ok(/полка слева, (нижний|средний|верхний) ярус/.test(describeSlot(e.slot, R)), describeSlot(e.slot, R));
    }
    assert.ok(whereLine(findThing('где яйцо дракона'), stock, R).text.includes('Яйцо дракона'));
    assert.ok(ingredientsLine(lairIngredients()).includes('яйцо дракона'));
});
