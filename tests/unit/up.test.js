import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { isUpWord, upAction, leapVelocity, UP } from '../../src/game/UpSpell.js';
import { SPELL_COST } from '../../src/game/Combat.js';

test('«Up» is heard as the whole phrase only', () => {
    for (const t of ['Up', 'up!', 'Ап', 'апп', 'Ап.', 'ап ап']) assert.equal(matchSpell(t), 'Up', t);
    for (const t of ['папа', 'капитан', 'ап и всё тут', 'stand up please', 'shut up now', 'лапа']) assert.notEqual(matchSpell(t), 'Up', t);
    assert.ok(!isUpWord('')); assert.ok(!isUpWord('апельсин'));
    // other spells are not taken over
    assert.equal(matchSpell('Сапира'), 'Sapira');
    assert.equal(matchSpell('Акцио'), 'Accio');
});

test('«Up»: lying or swimming, a hand up; not stunned or frozen; 7 mana', () => {
    assert.equal(upAction({ down: true, swimming: false, armUp: true }), 'rise');
    assert.equal(upAction({ down: false, swimming: true, armUp: true }), 'leap');
    assert.match(upAction({ down: true, swimming: false, armUp: false }), /Вытяните руку/);
    assert.match(upAction({ down: false, swimming: true, armUp: false }), /Поднимите руку/);
    assert.match(upAction({ down: false, swimming: false, armUp: true }), /в воздухе/);
    assert.equal(upAction({ down: false, swimming: false, standing: true, armUp: true }), 'leap'); // (on the ground, a deck…)
    assert.match(upAction({ down: false, swimming: false, standing: true, armUp: false }), /Поднимите руку/);
    assert.equal(upAction({ down: true, swimming: false, armUp: true, stunned: true }), null);
    assert.equal(upAction({ down: false, swimming: true, armUp: true, frozen: true }), null);
    assert.equal(SPELL_COST.Up, 7);
});

test('«Up» leap: up, and sideways where the raised arm points', () => {
    const straight = leapVelocity({ x: 0, y: 1, z: 0 });
    assert.equal(straight.y, UP.VY); assert.equal(straight.x, 0); assert.equal(straight.z, 0);
    const v = leapVelocity({ x: 1, y: 1, z: 0 });
    assert.ok(v.x > 5 && Math.abs(v.z) < 1e-9, `towards +x (${v.x})`);
    const w = leapVelocity({ x: 0, y: 2, z: -0.5 });
    assert.ok(w.z < 0 && w.z > -v.x, 'a steeper arm: less far');
});

test('«Up» heard as it really is said: again and again, «Stand up», the short sounds — never inside a sentence', async () => {
    const { isUpWord } = await import('../../src/game/UpSpell.js');
    const { matchSpell } = await import('../../src/fx/SpellManager.js');
    for (const t of ['ап', 'ап ап ап', 'Ап! Ап! Ап! Ап!', 'up', 'аб', 'оп', 'stand up', 'Стенд ап', 'стэнд ап', 'стендап']) assert.ok(isUpWord(t), t);
    for (const t of ['стенд', 'стоп', 'ап ап ап ап ап', 'поднимись наверх', 'оп ля', 'встану потом']) assert.ok(!isUpWord(t), t);
    assert.equal(matchSpell('стенд ап'), 'Up');
    assert.equal(matchSpell('стенд'), 'Stand');
});
