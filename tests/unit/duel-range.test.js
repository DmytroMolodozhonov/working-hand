import test from 'node:test';
import assert from 'node:assert/strict';
import { duelRange, emptyRange, DUEL_RANGE } from '../../src/game/DuelRange.js';

test('1 мана = 1 метр: 30 → 30, 5 → 5, 10 → 10', () => {
    assert.equal(duelRange(30), 30);
    assert.equal(duelRange(5), 5);
    assert.equal(duelRange(10), 10);
});

test('больше 200 не бывает, как бы много маны ни было', () => {
    assert.equal(duelRange(500), 200);
    assert.equal(duelRange(1e9), 200);
    assert.equal(duelRange(200), 200);
});

test('нет маны / мусор → 0 (не запускать)', () => {
    assert.equal(duelRange(0), 0);
    assert.equal(duelRange(-3), 0);
    assert.equal(duelRange(NaN), 0);
    assert.equal(duelRange(undefined), 0);
});

test('Творческий: мана бесконечна → 200', () => {
    assert.equal(duelRange(0, { creative: true }), 200);
    assert.equal(duelRange(7, { creative: true }), DUEL_RANGE.MAX);
});

test('мана читается ДО списания: дальность не зависит от цены', () => {
    let mana = 30;
    const reach = duelRange(mana); // слово сказано
    mana -= 12; // цена
    assert.equal(reach, 30);
    assert.equal(duelRange(mana), 18); // следующий выстрел — уже короче
});

test('NPC: тот же расчёт по его мане', () => {
    for (const m of [10, 40, 80, 100, 450]) assert.equal(duelRange(m), Math.min(200, m));
});

test('пустота: без цели на линии заряд гаснет раньше, с целью — летит весь путь', () => {
    assert.equal(emptyRange(200, false), DUEL_RANGE.EMPTY);
    assert.equal(emptyRange(10, false), 10);
    assert.equal(emptyRange(200, true), 200);
});
