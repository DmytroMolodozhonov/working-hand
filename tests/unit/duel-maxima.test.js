import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Duel, DUEL, maximaPush } from '../../src/game/Duel.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

function fakeDuel({ authority = true, fatigue = 30, enabled = true } = {}) {
    const voice = [], sent = [];
    const g = {
        authority,
        combat: { enabled, fatigue, hp: 20 },
        hud: { setVoice: (t) => voice.push(t) },
        sync: { duelMaxima: (a, b) => sent.push([a, b]) },
        remotes: new Map([['enemy', { fatigue: 30, hp: 20 }]]),
    };
    const d = Object.create(Duel.prototype);
    d.game = g;
    d.log = [];
    d._t = 0;
    d.bolts = new Map();
    Object.defineProperty(d, 'me', { get: () => 'me' });
    const a = { id: 'a1', by: 'me', spell: 'SapiraDuel' }, b = { id: 'b1', by: 'enemy', spell: 'Stupefy' };
    const c = { a, b, p: 0.5, t: 0, luckA: 0, luckB: 0 };
    d.clashes = [c];
    return { d, g, c, voice, sent };
}

test('«Максима» alone is heard as Maxima', () => {
    assert.equal(matchSpell('максима'), 'Maxima');
});

test('duel «Максима»: +5 % of the way a second towards the opponent per shout, adding up', () => {
    assert.equal(maximaPush(0, 0), 0);
    assert.ok(Math.abs(maximaPush(1, 0) - 0.05) < 1e-9);
    assert.ok(Math.abs(maximaPush(3, 1) - 0.1) < 1e-9);
    assert.ok(maximaPush(0, 2) < 0, 'the other side\'s shouts push back');
    // worth it: one shout pushes more than its 5 mana takes from the strength (mana/30 × PUSH)
    assert.ok(maximaPush(1, 0) > (DUEL.MAXIMA_COST / 30) * DUEL.PUSH);
    assert.equal(DUEL.MAXIMA_COST, 5);
    assert.equal(DUEL.MAXIMA_EVERY, 3);
    assert.equal(DUEL.CLASH_FATIGUE, 1, 'a clash costs each side 1 mana a second');
});

test('duel «Максима»: −5 mana at once, at most once every 3 s, the host counts each shout', async () => {
    const { d, g, c, voice, sent } = fakeDuel();
    assert.equal(d.maxima(true), 'Maxima');
    assert.equal(g.combat.fatigue, 25, '−5 mana');
    assert.equal(c.boostA, 1);
    assert.ok(c.pulse, 'the marker pulses');
    assert.ok(voice.some((t) => /МАКСИМА/.test(t)));
    assert.deepEqual(sent, [['a1', 'b1']], 'told to the others');
    assert.equal(d.maxima(true), null, 'not again within 3 s');
    assert.equal(g.combat.fatigue, 25, 'and nothing paid');
    d._maximaAt -= 3100; // (3 s later)
    c.t += 3.1;
    assert.equal(d.maxima(true), 'Maxima');
    assert.equal(c.boostA, 2, 'they add up');
    assert.equal(g.combat.fatigue, 20);
});

test('duel «Максима»: not enough mana — nothing happens; outside a clash it is not a duel shout', () => {
    const { d, c } = fakeDuel({ fatigue: 4 });
    assert.equal(d.maxima(true), null);
    assert.equal(c.boostA || 0, 0);
    const { d: d2 } = fakeDuel();
    d2.clashes = [];
    assert.equal(d2.maxima(true), null);
});

test('duel «Максима» from a guest: the host applies it (with the 3 s limit) and pushes harder for them', () => {
    const { d, c } = fakeDuel();
    assert.ok(d.applyMaxima('a1', 'b1', 'enemy'));
    assert.equal(c.boostB, 1);
    assert.equal(d.applyMaxima('a1', 'b1', 'enemy'), false, 'too soon');
    c.t = 3;
    assert.ok(d.applyMaxima('a1', 'b1', 'enemy'));
    assert.equal(c.boostB, 2);
    assert.equal(d.applyMaxima('a1', 'b1', 'stranger'), false, 'only the two in the clash');
    // a guest's computer only shows it (the host does the maths)
    const { d: guest, c: gc } = fakeDuel({ authority: false });
    assert.ok(guest.applyMaxima('a1', 'b1', 'enemy'));
    assert.equal(gc.boostB || 0, 0);
    assert.ok(gc.pulse);
});
