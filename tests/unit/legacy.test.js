// Death takes everything (the author: «умер — всё»); all of it lies in the body (Legacy.js) and only
// its owner takes it back — added to what they have grown since.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Mana } from '../../src/game/Mana.js';
import { Achievements } from '../../src/game/Achievements.js';
import { captureLegacy, wipeHero, absorbLegacy } from '../../src/game/Legacy.js';

function hero() {
    const g = {
        localId: 'me', authority: true, remotes: new Map(), maxHP: 20, playerHP: 20,
        character: { group: { position: { x: 0, y: 0, z: 0, clone() { return { ...this }; } } } },
        combat: {
            enabled: true, maxFatigue: 30, fatigue: 30, maxHp: 20, hp: 20,
            addMaxFatigue(n) { this.maxFatigue += n; this.fatigue = Math.min(this.maxFatigue, this.fatigue + n); },
            addMaxHp(n) { this.maxHp += n; this.hp = Math.min(this.maxHp, this.hp + n); },
        },
        sync: { achCredit() {}, ach() {} },
        inventory: { slots: [null, null], storeItem(it) { const i = this.slots.indexOf(null); if (i < 0) return false; this.slots[i] = it; return true; } },
        hud: { notify() {}, setVoice() {}, update() {} },
        books: { learned: new Set() },
        bonus: { hp: 0, fatigue: 0 },
    };
    g.mana = new Mana(g);
    g.achievements = new Achievements(g);
    return g;
}

/** As a burnt scroll does (Items.applyScroll). */
function burn(g, stat, amount) {
    if (stat === 'hp') { g.bonus.hp += amount; g.combat.addMaxHp(amount); g.maxHP = g.combat.maxHp; }
    else { g.bonus.fatigue += amount; g.combat.addMaxFatigue(amount); }
}

/** As Game.onLocalDeath does. */
function die(g) {
    const lg = captureLegacy(g);
    g.mana.onDeath();
    g.achievements.onDeath();
    wipeHero(g);
    return lg;
}

test('death takes all: scrolls, spells, flight, practice mana, achievements — and the body gives it all back', () => {
    const g = hero();
    burn(g, 'hp', 4); burn(g, 'fatigue', 7);
    g.bonus.flight = true; g.bonus.spells = { LightningStrike: true };
    g.books.learned.add('Flight');
    g.mana.grow(12, 'spell', 'Lumos'); g.mana.spellsUsed.add('Lumos');
    g.achievements.gain('king', { quiet: true });
    assert.equal(g.combat.maxFatigue, 30 + 7 + 12 + 50);
    assert.equal(g.combat.maxHp, 24);
    const lg = die(g);
    assert.equal(g.combat.maxFatigue, 30, 'mana back to 30');
    assert.equal(g.combat.maxHp, 20, 'health back to 20');
    assert.equal(g.achievements.done.size, 0);
    assert.ok(!g.bonus.flight && !g.bonus.spells && g.books.learned.size === 0, 'nothing learnt any more');
    assert.equal(lg.owner, 'me');
    // grown a little again, then the body found: all of it back, added
    g.mana.grow(3, 'crystal');
    absorbLegacy(g, JSON.parse(JSON.stringify(lg))); // (as it comes from the save / the network)
    assert.equal(g.combat.maxFatigue, 30 + 3 + 7 + 12 + 50);
    assert.equal(g.combat.maxHp, 24);
    assert.ok(g.achievements.done.has('king') && g.bonus.flight && g.bonus.spells.LightningStrike && g.books.learned.has('Flight'));
    assert.ok(g.mana.spellsUsed.has('Lumos'), 'Lumos\'s first time is not counted twice');
});

test('«Give Me My Power» itself is never lost on death: the one way to take the rest back', () => {
    const g = hero();
    g.bonus.spells = { GiveMyPower: true, AvadaKedavra: true };
    const lg = die(g);
    assert.deepEqual(g.bonus.spells, { GiveMyPower: true });
    assert.ok(lg.spells.includes('AvadaKedavra'));
});

test('a fresh hero who dies leaves no legacy; a legacy taken is never doubled by a second death', () => {
    const g = hero();
    assert.equal(die(g), null, 'nothing grown: nothing to leave');
    burn(g, 'fatigue', 5);
    const lg = die(g);
    absorbLegacy(g, lg);
    assert.equal(g.combat.maxFatigue, 35);
    const lg2 = die(g);
    assert.equal(lg2.fatigue, 5, 'the second body holds the same, once');
    assert.equal(g.combat.maxFatigue, 30);
});
