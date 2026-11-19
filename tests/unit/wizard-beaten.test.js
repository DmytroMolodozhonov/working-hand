// Победа в бою без столкновения лучей и без убийства (автор 19.11): волшебник, бивший по мне, повержен (оглушён / тяжело ранен) → +1…+3 ячеек, один раз
import test from 'node:test';
import assert from 'node:assert/strict';
import { WizardLife } from '../../src/game/WizardLife.js';

function fake(me = 'me') {
    const calls = [];
    const game = { localId: me, mana: { duelWonAlive: (...a) => { calls.push(a); return 1; } } };
    const w = Object.create(WizardLife.prototype); w.game = game;
    return { w, calls };
}

test('a wizard who cast at me and lies stunned: the fight is won — once', () => {
    const { w, calls } = fake();
    const v = { id: 'w1', hp: 100, maxHp: 100, maxMana: 60, stunT: 2, castAtPlayers: new Set(['me']) };
    w.beatenCheck(v); w.beatenCheck(v);
    assert.equal(calls.length, 1); assert.equal(calls[0][0], 'w1');
});
test('hurt to a third: won; healthy and standing: not; never cast at me: not; dead: not (the kill has its own reward)', () => {
    const { w, calls } = fake();
    w.beatenCheck({ id: 'a', hp: 30, maxHp: 100, castAtPlayers: new Set(['me']) });
    w.beatenCheck({ id: 'b', hp: 100, maxHp: 100, castAtPlayers: new Set(['me']) });
    w.beatenCheck({ id: 'c', hp: 10, maxHp: 100, stunT: 3, castAtPlayers: new Set(['other']) });
    w.beatenCheck({ id: 'd', hp: 10, maxHp: 100, dead: true, castAtPlayers: new Set(['me']) });
    assert.deepEqual(calls.map((c) => c[0]), ['a']);
});
