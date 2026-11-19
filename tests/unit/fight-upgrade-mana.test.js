// «Бомбардо Максима» in a fight: the plain spell flies at once, the Maxima follows (Game.castUpgrade). The plain one's mana goes back BEFORE the
// Maxima is paid for — paid once, at the Maxima's price (the author 19.11: the hero with 40 mana got only the plain one, the Maxima wanted 35 on top of the 20).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/game/Game.js';

function fake(mana) {
    const g = Object.create(Game.prototype);
    g.combat = { manaOn: true, fatigue: mana, maxFatigue: 100 };
    g.lastSpellCastTime = 5; g._lastDuelCast = 6; g._interimCast = null;
    g._fightBase = { spell: 'Bombardo', at: performance.now(), paid: 20 };
    g.castLocalSpell = () => { // the Maxima costs 35 and is refused without it
        if (g.combat.fatigue < 35) return null;
        g.combat.fatigue -= 35; return 'BombardoMaxima';
    };
    return g;
}

test('40 mana: plain Bombardo (−20) → 20 left; the Maxima still goes (the 20 come back first) and in all costs 35', () => {
    const g = fake(20); // (40 − 20 already paid for the plain one)
    assert.equal(g.castUpgrade('Bombardo', 'бомбардо максима'), 'BombardoMaxima');
    assert.equal(g.combat.fatigue, 5, '40 − 35');
});

test('not enough even for that: refused, the plain one stays paid, nothing is lost', () => {
    const g = fake(10); // (30 before the plain one: the Maxima wants 35)
    assert.equal(g.castUpgrade('Bombardo', 'бомбардо максима'), null);
    assert.equal(g.combat.fatigue, 10);
    assert.equal(g.lastSpellCastTime, 5);
});

test('too late (after the upgrade window): not an upgrade at all', () => {
    const g = fake(50);
    g._fightBase.at -= 5000;
    assert.equal(g.castUpgrade('Bombardo', 'бомбардо максима'), undefined);
});
