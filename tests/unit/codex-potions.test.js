// Справочник зелий: у КАЖДОГО ингредиента рецептов своя картинка (раньше — белая точка), у золотого яблока не значок красного; время варки — полминуты, без 2.3333333333333335.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { potionCards, brewText } from '../../src/ui/Codex.js';
import { RECIPES } from '../../src/game/Potions.js';

test('каждый ингредиент каждого рецепта — со своим существующим значком; золотое и красное яблоко — разные', () => {
    const cards = potionCards();
    const icons = new Map();
    for (const c of cards) for (const g of c.ingredients) {
        assert.ok(g.icon && fs.existsSync(g.icon), `нет значка у «${g.name}» (${g.kind})`);
        icons.set(g.kind, g.icon);
    }
    assert.ok(RECIPES.length === cards.length);
    assert.notEqual(icons.get('apple'), icons.get('redApple'));
    assert.match(icons.get('apple'), /golden/);
    assert.equal(new Set(icons.values()).size, icons.size, 'два ингредиента с одним значком');
});

test('время варки — по полминуты и по-русски', () => {
    assert.equal(brewText([120, 180]), 'от 2 до 3 минут');
    assert.equal(brewText([90, 140]), 'от 1,5 до 2,5 минуты');
    assert.equal(brewText([150, 210]), 'от 2,5 до 3,5 минуты');
    for (const r of RECIPES) if (r.brew) assert.ok(!/\d\.\d{3}/.test(brewText(r.brew)) && !/\./.test(brewText(r.brew)), r.id);
});
