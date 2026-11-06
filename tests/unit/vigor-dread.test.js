// «Зелье крепкого здоровья» (Vigor.js) и «Зелье страха» (Dread.js): рецепты, один раз, навсегда (смерть снимает, «Give Me My Power» возвращает и не удваивает), кого пугает.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, matchRecipe, INGREDIENT_RU } from '../../src/game/Potions.js';
import { Vigor, VIGOR } from '../../src/game/Vigor.js';
import { Dread, DREAD, isWeakOne, dreadedChance, dreadedBrave } from '../../src/game/Dread.js';
import { missVerdict, fightChance } from '../../src/game/WandererMind.js';
import { fightsInMob } from '../../src/game/Audacity.js';
import { captureLegacy, absorbLegacy, wipeHero } from '../../src/game/Legacy.js';

test('рецепты: свои три ингредиента, которых нет в других зельях; одна колба; ингредиенты названы', () => {
    for (const id of ['vigor', 'dread']) {
        const r = RECIPES.find((x) => x.id === id);
        assert.ok(r, id);
        assert.equal(Object.keys(r.ingredients).length, 3);
        assert.equal(r.portions, 1, 'одна колба с котла');
        for (const k of Object.keys(r.ingredients)) {
            assert.ok(INGREDIENT_RU[k], `нет названия ${k}`);
            assert.ok(!RECIPES.some((o) => o.id !== id && o.ingredients[k]), `${k} уже есть в другом зелье`);
        }
        assert.equal(matchRecipe(r.ingredients, Object.keys(r.ingredients))?.id, id);
    }
    const all = RECIPES.filter((r) => r.id === 'vigor' || r.id === 'dread').flatMap((r) => Object.keys(r.ingredients));
    assert.equal(new Set(all).size, all.length, 'два зелья не делят ингредиенты');
});

function fakeGame(enabled = true) {
    const g = { maxHP: 20, playerHP: 20, bonus: { hp: 0, fatigue: 0 }, localId: 'A', killCount: 0, punchCount: 0, hud: { update() {}, setVoice() {} }, perf: { note() {} } };
    g.combat = { enabled, maxHp: 20, hp: 20, addMaxHp(n) { this.maxHp += n; this.hp = Math.min(this.maxHp, this.hp + n); }, addMaxFatigue() {}, maxFatigue: 100, fatigue: 100, _hudKey: '' };
    return g;
}

test('крепкое здоровье: было 20 — стало 30, один раз; смерть снимает (можно выпить снова); «Give Me My Power» возвращает 30 и не даёт выпить второй раз', () => {
    const g = fakeGame();
    const V = new Vigor(g);
    assert.equal(V.cantDrink(), null);
    assert.equal(V.drink(), 30);
    assert.equal(g.combat.maxHp, 30);
    assert.equal(g.bonus.hp, 10);
    assert.ok(V.cantDrink(), 'второй раз нельзя');
    // смерть: всё выращенное снято
    const rec = captureLegacy(g);
    assert.equal(rec.hp, 10); assert.equal(rec.vigor, 1);
    wipeHero(g);
    assert.equal(g.combat.maxHp, 20);
    assert.equal(V.cantDrink(), null, 'в новой жизни можно снова');
    // «Give Me My Power» возвращает прежнее — и флаг: второй раз всё равно нельзя
    g.mana = null; g.achievements = null;
    absorbLegacy(g, rec);
    assert.equal(g.combat.maxHp, 30);
    assert.ok(V.cantDrink(), 'после возвращения флаг на месте: не удвоить');
});

test('крепкое здоровье без боевого здоровья (Творческий): число растёт всё равно', () => {
    const g = fakeGame(false);
    new Vigor(g).drink();
    assert.equal(g.maxHP, 20 + VIGOR.GAIN);
});

test('страх: действует только на слабых — жителей и неопытных магов; рыцарь, король, мастер, босс — нет', () => {
    for (const v of [{ role: 'farmer' }, { role: 'builder' }, { role: 'merchant' }, { role: 'student', wizard: true, rank: 'novice' }, { role: 'teacher', wizard: true, rank: 'adept' }, { role: 'farmer', elder: true }]) assert.ok(isWeakOne(v), JSON.stringify(v));
    for (const v of [{ role: 'knight' }, { role: 'king' }, { role: 'advisor' }, { role: 'master', wizard: true, rank: 'master' }, { role: 'teacher', wizard: true, rank: 'teacher' }, { role: 'x', boss: true }]) assert.ok(!isWeakOne(v), JSON.stringify(v));
});

test('страх: «чаще бегут, чем нападают» — доля побегов выше половины; без зелья — никогда; чужому герою — не действует', () => {
    const g = { localId: 'A', bonus: { hp: 0, fatigue: 0 } };
    const D = new Dread(g);
    const weak = { role: 'farmer' }, strong = { role: 'knight' };
    assert.equal(D.scares(weak, 'A', () => 0), false, 'зелья нет');
    assert.equal(D.cantDrink(), null);
    D.drink();
    assert.ok(D.cantDrink(), 'один раз');
    let flee = 0;
    for (let i = 0; i < 10000; i++) if (D.scares(weak, 'A', Math.random)) flee++;
    assert.ok(flee / 10000 > 0.5 && flee / 10000 < 0.9, `доля побегов ${flee / 10000}`);
    assert.equal(D.scares(strong, 'A', () => 0), false, 'рыцаря не пугает');
    assert.equal(D.scares(weak, 'B', () => 0), false, 'другой игрок (хост не знает его флага)');
});

test('страх: слабый маг отвечает заклинанием втрое реже; толпа смелеет меньше; сильные — как раньше', () => {
    const base = fightChance('wizard', 'novice');
    assert.equal(dreadedChance(base, true), base * DREAD.WIZ_K);
    assert.equal(dreadedChance(base, false), base);
    // вердикт: бросок, при котором неопытный маг раньше дрался (roll чуть ниже шанса), теперь только поворачивается
    const roll = base * 0.9;
    assert.equal(missVerdict({ cls: 'wizard', rank: 'novice', zone: 'near', knows: true, roll }).act, 'fight');
    assert.equal(missVerdict({ cls: 'wizard', rank: 'novice', zone: 'near', knows: true, roll, dread: true }).act, 'turn');
    // рыцарь не меняется
    assert.equal(missVerdict({ cls: 'knight', zone: 'near', knows: true, roll: 0.1, dread: true }).act, 'fight');
    // толпа: храбрости 0,45 хватало (порог 0,3), с зельем — нет
    const p = { role: 'farmer', brave: 0.45 };
    assert.ok(fightsInMob(p));
    assert.ok(!fightsInMob({ ...p, brave: dreadedBrave(0.45, true) }));
    assert.equal(dreadedBrave(0.1, true), 0);
});
