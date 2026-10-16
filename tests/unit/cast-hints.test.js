/**
 * Advice about a spell only to a player who is really casting (CastHints), and the mana bar's red
 * flash when a spell was understood but the mana is short (Hud.manaShort).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CastHints, HINT_REPEAT_MS } from '../../src/game/CastHints.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

const clock = () => { const c = { t: 0 }; c.now = () => c.t; return c; };

test('cast hints: «левиоса» in the middle of a long phrase is talk — no advice', () => {
    const text = 'ну вот я сегодня читал про левиоса и думаю что это интересно';
    assert.ok(matchSpell(text), 'the spell word is in there');
    const h = new CastHints(clock().now);
    assert.equal(h.phrase({ text, name: matchSpell(text), isFinal: true, intent: false, talking: false }).ok, false);
    assert.equal(h.phrase({ text, name: matchSpell(text), isFinal: true, intent: true, talking: false }).ok, false);
});

test('cast hints: a clear spell with the hand raised gets its advice; an unfinished phrase never', () => {
    const h = new CastHints(clock().now);
    assert.equal(h.phrase({ text: 'вингардиум левиоса', name: 'Levitation', isFinal: true, intent: true, talking: false }).ok, true);
    assert.equal(h.phrase({ text: 'вингардиум левиоса', name: 'Levitation', isFinal: false, intent: true, talking: false }).ok, false);
});

test('cast hints: no gesture — advice only when the same spell is said again; near a villager — none', () => {
    const c = clock(), h = new CastHints(c.now);
    const p = { text: 'бомбардо', name: 'Bombardo', isFinal: true, intent: false, talking: false };
    assert.equal(h.phrase(p).ok, false);
    c.t += 3000;
    assert.equal(h.phrase(p).ok, true, 'said twice in a row: meant');
    const t = new CastHints(c.now);
    t.phrase({ ...p, talking: true }); c.t += 1000;
    assert.equal(t.phrase({ ...p, talking: true }).ok, false);
});

test('cast hints: the same advice at most once in 20–30 s', () => {
    const c = clock(), h = new CastHints(c.now);
    assert.equal(h.pass('✋ Поднимите руку'), true);
    c.t += 10000;
    assert.equal(h.pass('✋ Поднимите руку'), false);
    c.t += HINT_REPEAT_MS;
    assert.equal(h.pass('✋ Поднимите руку'), true);
    assert.ok(HINT_REPEAT_MS >= 20000 && HINT_REPEAT_MS <= 30000);
});

test('mana short: the bar and its figures get the red flash class', async () => {
    globalThis.performance ??= { now: () => Date.now() };
    const { Hud } = await import('../../src/ui/Hud.js');
    const el = () => { const s = new Set(); return { classList: { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) }, offsetWidth: 0 }; };
    const fake = { el: { fatigue: el(), manaNum: el() } };
    Hud.prototype.manaShort.call(fake);
    assert.ok(fake.el.fatigue.classList.contains('short'));
    assert.ok(fake.el.manaNum.classList.contains('short'));
    clearTimeout(fake.el.fatigue._shortT); clearTimeout(fake.el.manaNum._shortT);
});
