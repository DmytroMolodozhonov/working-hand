// «🔍 Поиск» (CodexSearch.js): находит заклинания, зелья, пентаграммы, лор и боссов; слова в любом порядке, любое окончание, «ё» = «е».
import test from 'node:test';
import assert from 'node:assert/strict';
import { codexEntries, searchCodex, norm, stem, SEARCH_KINDS } from '../../src/ui/CodexSearch.js';

const E = codexEntries(null);
const find = (q, kind = 'all') => searchCodex(E, q, kind).map((r) => r.e);

test('в поиске есть все виды: заклинания, зелья, пентаграммы, лор, боссы, вещи', () => {
    for (const k of SEARCH_KINDS.filter((x) => x.id !== 'all')) assert.ok(E.some((e) => e.kind === k.id), k.id);
});
test('заклинание находят по названию, и название идёт первым', () => {
    const r = find('Спиралис');
    assert.equal(r[0].kind, 'spell');
    assert.equal(r[0].title, 'Спиралис');
});
test('зелья: «зелье» находит «зелья», слова в любом порядке, ингредиент находит рецепты', () => {
    assert.ok(find('зелья', 'potion').length >= 5);
    assert.ok(find('зелье крепкого здоровья', 'potion').some((e) => /здоровья/i.test(e.title)));
    assert.ok(find('здоровья крепкого', 'potion').length > 0, 'порядок слов не важен');
    assert.ok(find('золотое яблоко', 'potion').length > 0);
});
test('лор и боссы находятся по словам из текста', () => {
    assert.ok(find('королева', 'boss').some((e) => /Ледяная/.test(e.title)));
    assert.ok(find('пентаграмма', 'lore').length > 0);
    assert.ok(find('сон ночь', 'lore').length > 0);
});
test('«ё» = «е», регистр не важен, пустой запрос — всё, чепуха — ничего', () => {
    assert.equal(norm('ЁЖ'), 'еж');
    assert.ok(find('PENTAGRANIUM', 'pent').length > 0);
    assert.equal(find('').length, E.length);
    assert.equal(find('ъъъъщщщзз').length, 0);
    assert.equal(stem('зелья'), 'зель');
});
test('герой в «Выживании» видит только заклинания, которые умеет', () => {
    const only = codexEntries({ can: (s) => s === 'Stupefy', used: () => false, known: new Set() });
    assert.ok(only.filter((e) => e.kind === 'spell').length < E.filter((e) => e.kind === 'spell').length);
    assert.ok(only.some((e) => e.kind === 'potion'), 'зелья и лор — всегда');
});
