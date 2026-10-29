import test from 'node:test';
import assert from 'node:assert/strict';
import { DUEL, deflectAllowed, DUEL_SPELLS } from '../../src/game/Duel.js';

test('отвод: порог 20 %', () => {
    assert.equal(DUEL.DEFLECT_MIN_SHARE, 0.2);
    assert.equal(deflectAllowed(0.15), false, '15 % — отказ');
    assert.equal(deflectAllowed(0.2), false, 'ровно 20 % — отказ');
    assert.equal(deflectAllowed(0.25), true, '25 % — можно');
    assert.equal(deflectAllowed(0.5), true);
    assert.equal(deflectAllowed(0.8), true, 'выигрывающий может');
});

test('отвод: вынужденный выход (мёртв, оглушён, нет маны) не запрещается', () => {
    assert.equal(deflectAllowed(0.01, true), true);
});

test('отвод: правило одно для всех дуэльных зарядов', () => {
    for (const spell of Object.keys(DUEL_SPELLS)) assert.equal(deflectAllowed(0.1), false, spell);
});
