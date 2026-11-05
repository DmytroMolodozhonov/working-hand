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

test('«Stand Up» throws me out of a shallow wide pit (walls a few metres away), not on an open field', async () => {
    const { boxedAt } = await import('../../src/game/UpSpell.js');
    // a pit 2 blocks deep, 9×9 m: floor layer at feetL−1 (feet at 0 → feetL 2), walls up to layer 3 outside |x|,|z| > 4
    const pit = (half, depth) => ({ solidIn: (ix, iz, L0, L1) => {
        const top = Math.max(Math.abs(ix), Math.abs(iz)) > half ? 1 + depth : 1;
        return L0 <= top && L1 >= L0;
    } });
    assert.ok(boxedAt(pit(4, 2), 0, 0, 0), 'a shallow pit 9 m wide');
    assert.ok(boxedAt(pit(1, 2), 0, 0, 0), 'a narrow shaft');
    assert.ok(!boxedAt(pit(4, 1), 0, 0, 0), 'one block deep: a step — walk out');
    assert.ok(!boxedAt(pit(12, 2), 0, 0, 0), 'a wide hollow: just walk');
    assert.ok(!boxedAt({ solidIn: (ix, iz, L0) => L0 <= 1 }, 0, 0, 0), 'open field');
});

test('Creative: absolute steadiness by default (setting «Устойчивость» 100); lower — may fall; the gift is saved apart', async () => {
    const { Steadiness } = await import('../../src/game/Steadiness.js');
    const g = { config: { mode: 'creative' }, hero: { steady: 100 } };
    const s = new Steadiness(g);
    assert.ok(s.absolute);
    assert.equal(s.snapshot(), null, 'Creative firmness is not the saved gift');
    g.hero.steady = 60; assert.ok(!s.absolute);
    g.config.mode = 'survival'; g.hero.steady = 100; assert.ok(!s.absolute);
    s.setAbsolute(true); assert.ok(s.absolute); assert.equal(s.snapshot().ab, 1);
});
