/**
 * The setting «Подсказки»: a «how to» hint once (remembered), always or never; news, danger and
 * «не хватает маны» are always shown.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { HintPolicy, isHowTo, hintKey } from '../../src/ui/HintPolicy.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('hints: «how to» lines are hints; damage, danger, results are not', () => {
    assert.ok(isHowTo('✋ Поднимите руку и направьте её на цель — тогда заклинание сработает'));
    assert.ok(isHowTo('🦸 Для полёта поднимите <b>обе руки вверх</b> и скажите «Флайн»'));
    assert.ok(isHowTo('🚪 Дверь стоит! Возьмитесь за ручку, чтобы открыть'));
    for (const t of ['☠️ Яд паучихи: −7 HP', '🔥 Горячо! Отойдите от костра', '⚔️ Вас заметили! Стража замка идёт за вами',
        '😮‍💨 Не хватает маны: нужно 15, есть 3', '✨ <span>BOMBARDO</span>', '🕷️ Укус! Скажите «Protection Maxima»', '🎤 ЖДУ КОМАНДУ (ПРАВАЯ)']) {
        assert.equal(isHowTo(t), false, t);
    }
});

test('hints: «Один раз» — each hint once, remembered in the browser for every world; numbers do not make a new one', () => {
    const store = mem();
    const p = new HintPolicy(store);
    assert.equal(p.allow('✋ Поднимите руку — ещё 3 с'), true);
    assert.equal(p.allow('✋ Поднимите руку — ещё 5 с'), false);
    assert.equal(hintKey('нужно 15'), hintKey('нужно 25'));
    assert.equal(new HintPolicy(store).allow('✋ Поднимите руку — ещё 1 с'), false, 'remembered after a restart');
    assert.equal(p.allow('☠️ Яд паучихи: −7 HP'), true);
    assert.equal(p.allow('☠️ Яд паучихи: −7 HP'), true, 'news is always shown');
});

test('hints: «Всегда» shows them again, «Без подсказок» never — the news still shows', () => {
    const p = new HintPolicy(mem());
    p.setMode('always');
    assert.equal(p.allow('🗝️ Покажите рукой на замок'), true);
    assert.equal(p.allow('🗝️ Покажите рукой на замок'), true);
    p.setMode('off');
    assert.equal(p.allow('🚪 Покажите рукой на землю рядом'), false);
    assert.equal(p.allow('⚔️ Стража видела, кто ломает замок!'), true);
});
