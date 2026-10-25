/** The sign over an arena duellist (Creative only): values from the same sources as the fight. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tagOf, tagKey, tagShown, RANK_TITLE } from '../../src/game/ArenaTag.js';
import { duelStrength, duelPower, WIZ_RANKS } from '../../src/game/WizardAI.js';

const wiz = (rank, mana, hp = 8, role = 'student') => ({ id: 'x:1', rank, role, mana, maxMana: WIZ_RANKS[rank].mana, hp, maxHp: 8 });

test('the kinds: Младший, Средний, Сильный, Глава башни — by the rank of the wizard', () => {
    assert.deepEqual(['novice', 'adept', 'teacher', 'elder', 'master'].map((r) => RANK_TITLE[r]), ['Младший', 'Средний', 'Сильный', 'Сильный', 'Глава башни']);
});

test('mana and strength come from the fight\'s own numbers, and follow the mana as it is spent', () => {
    const v = wiz('adept', 100);
    const t = tagOf(v);
    assert.equal(t.title, 'Средний');
    assert.equal(t.mana, 100); assert.equal(t.max, 100);
    assert.equal(t.mastery, 50, 'an adept: half of his 100 mana as the duel mastery');
    assert.equal(t.power, Math.round(duelStrength('student', 100, 8, 0, 8, 50)));
    assert.equal(t.power, Math.round(duelPower(150, 1, 0)));
    const k0 = tagKey(t);
    v.mana = 64;
    const t2 = tagOf(v);
    assert.equal(t2.mana, 64);
    assert.ok(t2.power < t.power, 'less mana — less strength');
    assert.notEqual(tagKey(t2), k0, 'a change redraws the sign');
    assert.equal(tagKey(tagOf(v)), tagKey(t2), 'no change — no redraw');
});

test('the sign is shown only in Creative', () => {
    assert.ok(tagShown('creative'));
    for (const m of ['survival', 'freeworld', 'hardcore', 'test', undefined]) assert.ok(!tagShown(m), String(m));
});
