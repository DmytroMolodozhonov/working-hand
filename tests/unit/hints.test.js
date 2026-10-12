/**
 * Hints: the player is told what happened and why — the cause of a fall, why a spell did not work —
 * and the same hint is not repeated for every unfinished phrase.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { knockCause, knockMessage, lyingMessage, refusal, HintGate } from '../../src/game/Hints.js';
import { SPELL_PHYSICS } from '../../src/game/Impact.js';

test('hints: every kind of fall has its own cause', () => {
    assert.match(knockCause('Bombardo'), /взрывом «Bombardo»/);
    assert.match(knockCause('BombardoMaxima'), /Bombardo Maxima/);
    assert.match(knockCause('cannon'), /пушечного ядра/);
    assert.match(knockCause('SapiraDuel'), /Sapira/);
    assert.match(knockCause('knight'), /рыцарь/);
    assert.match(knockCause('fall'), /упали с высоты/);
    assert.match(knockCause('EarthquakeMaxima'), /землетрясением/);
    assert.match(knockCause('vortex'), /водоворотом/);
    assert.match(knockCause('WindMaxima'), /Wind/);
    assert.match(knockCause('punch'), /ударом/);
    assert.match(knockCause('avada'), /Авадой/);
    assert.match(knockCause('???'), /сбили с ног/);
    // every spell that can throw a body off its feet is named, not a plain «сбили с ног»
    for (const [k, P] of Object.entries(SPELL_PHYSICS)) {
        if (P && (P.always || P.blast || P.push >= 8 || P.own)) assert.doesNotMatch(knockCause(k), /^💥 Вас сбили с ног$/, k);
    }
});

test('hints: the fall line names who did it and how long; the lying line tells how to get up', () => {
    assert.equal(knockMessage('Bombardo', { by: 'Петя', down: 2.5 }), '💥 Вас отбросило взрывом «Bombardo» (Петя) — лежите ещё 3 с');
    assert.equal(knockMessage('fall', { by: 'Петя' }), '🦵 Вы упали с высоты');
    assert.equal(knockMessage('knight', { down: 1.5 }), '⚔️ Вас сбил с ног рыцарь');
    assert.match(lyingMessage('Bombardo'), /^🧍 Вас отбросило взрывом «Bombardo»\. Чтобы встать — присядьте и выпрямитесь$/);
});

test('hints: why a recognized spell did not work', () => {
    assert.match(refusal('handDown', { name: 'Bombardo' }), /«Bombardo».*рука опущена.*Поднимите руку/);
    assert.match(refusal('cooldown'), /Слишком быстро/);
    assert.match(refusal('maximaAlone'), /вместе с заклинанием/);
    assert.match(refusal('busy', { name: 'Адский огонь' }), /Уже действует «Адский огонь».*Стоп/);
    assert.equal(refusal('nope'), '');
});

test('hints: the same hint at most once every two seconds', () => {
    let t = 0;
    const g = new HintGate(2000, () => t);
    assert.ok(g.pass('handDown'));
    t = 500; assert.ok(!g.pass('handDown')); assert.ok(g.pass('cooldown'));
    t = 2100; assert.ok(g.pass('handDown'));
});
