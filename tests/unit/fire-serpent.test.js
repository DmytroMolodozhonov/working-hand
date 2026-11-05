// The fire serpent of «Let the Hellfire Come» (FireSerpentRules.js, the author 31.10 / 01.11 / 05.11): only out of one's own Hellfire,
// one must HAVE 350 mana, the Hellfire's drain ×2 while it lives, English words only; what charges do to it; the wizards' choice among
// several foes (the nearest, the one hitting, a little helper first, else the player); a weak wizard runs from it, a strong one fights.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SERPENT, serpentBlock, serpentDrainK, serpentWords, serpentHit, threatScore, pickThreat, serpentResponse, serpentRadius, SERPENT_TARGETS } from '../../src/game/FireSerpentRules.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { HELD } from '../../src/game/Concentration.js';

test('called only out of my Hellfire, with 350 mana; the fire drains twice as fast while it lives', () => {
    assert.equal(serpentBlock({ enabled: true, mana: 999, fire: false }), 'fire');
    assert.equal(serpentBlock({ enabled: true, mana: 349, fire: true }), 'mana');
    assert.equal(serpentBlock({ enabled: true, mana: 350, fire: true }), null);
    assert.equal(serpentBlock({ enabled: false, mana: 0, fire: true }), null, 'Creative: no mana rule');
    assert.equal(serpentBlock({ enabled: true, mana: 999, fire: true, alive: true }), 'alive');
    assert.equal(SERPENT.NEED_MANA, 350);
    assert.equal(serpentDrainK(true), 2);
    assert.equal(serpentDrainK(false), 1);
    assert.ok(HELD.Hellfire.own.includes('FireSerpent'), 'said while the Hellfire is held');
});

test('the words: «Serpent» (English), never a mountain road or a sickle, never a sentence', () => {
    for (const s of ['Serpent', 'серпент', 'сёрпент', 'fire serpent']) { assert.ok(serpentWords(s), s); assert.equal(matchSpell(s), 'FireSerpent', s); }
    for (const s of ['серпантин', 'серп', 'я видел серпент на горе вчера вечером']) assert.notEqual(matchSpell(s), 'FireSerpent', s);
});

test('charges on it: cold and water hurt, «Авада» passes, fire feeds it, the gods end it', () => {
    assert.ok(serpentHit('IceDuel').dmg > serpentHit('Jolt').dmg);
    assert.equal(serpentHit('AvadaKedavra').dmg, 0);
    assert.ok(serpentHit('Inferno').dmg < 0);
    assert.ok(serpentHit('Jolt', true).dmg >= SERPENT.HP);
    assert.ok(SERPENT.DOUSE_RATE * 2 > SERPENT.HP, '«Firefighting Maxima» puts it out in under 2 s');
    for (const k of ['players', 'zombies', 'villagers', 'wizards', 'animals', 'dragons', 'trees', 'water']) assert.ok(SERPENT_TARGETS[k]?.does, k);
});

test('a wizard among several foes: the nearest / the one hitting him first; a little helper first; else the player', () => {
    // far player, a serpent biting him right now: the serpent
    assert.equal(pickThreat([{ kind: 'player', dist: 30 }, { kind: 'serpent', dist: 8, hitMe: 0.5 }]), 1);
    // the player close and hitting, a tree far: the player
    assert.equal(pickThreat([{ kind: 'player', dist: 6, hitMe: 1 }, { kind: 'tree', dist: 25 }]), 0);
    // a weak little servant at the same distance: it first
    assert.equal(pickThreat([{ kind: 'player', dist: 12 }, { kind: 'servant', dist: 12, small: true, hp: 0.2 }]), 1);
    // equal otherwise: the player is the priority
    assert.ok(threatScore({ kind: 'player', dist: 15 }) > threatScore({ kind: 'tree', dist: 15 }));
    assert.equal(serpentResponse({ rank: 'novice', mana: 100, dist: 20 }), 'flee');
    assert.equal(serpentResponse({ rank: 'master', mana: 100, dist: 20 }), 'fight');
    assert.equal(serpentResponse({ rank: 'master', mana: 100, dist: 80 }), null);
});

test('the body: thin tail, thick middle, a neck, a wide head, a tapering snout', () => {
    const N = SERPENT.SEGS;
    assert.ok(serpentRadius(0, N) < serpentRadius(N * 0.5, N));
    assert.ok(serpentRadius(N - 4, N) > serpentRadius(Math.floor(N * 0.8), N), 'the head wider than the neck');
    assert.ok(serpentRadius(N - 1, N) < serpentRadius(N - 4, N), 'the snout tapers');
    assert.ok((N - 1) * SERPENT.SEG_LEN > 50, 'over 50 m of body');
});
