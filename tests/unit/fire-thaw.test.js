// «Fire Maxima» said by a FROZEN hero melts the ice — no wand, no knowing the spell (FireThaw.js, the author 19.11). Only the mana and
// really being frozen count; the vortex's ice bubble, a hero who is free and a dead one are not its business; the phrase's two versions are one cast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fireThaw, thawApplies, THAW } from '../../src/game/FireThaw.js';

function fake({ frozen = true, fatigue = 100, manaOn = true, trap = false, dead = false } = {}) {
    const log = { voice: [], toast: [], noted: [] };
    const c = {
        frozenLeft: frozen ? 7 : 0, frozenBy: 'x', chill: 0.4, fatigue, manaOn, dead, encased: false, paid: 0,
        get frozen() { return this.frozenLeft > 0; },
        costOf: () => 20, pay() { this.paid++; if (this.manaOn) this.fatigue -= 20; },
    };
    const g = {
        combat: c, vortex: { myTrap: () => (trap ? {} : null) }, monster: null, lastCastWhy: '',
        hud: { setVoice: (t) => log.voice.push(t), toast: (t) => log.toast.push(t), setFrozenOverlay() {}, setStatus() {}, manaShort() {} },
        noteCaster: (n) => log.noted.push(n), sound: { playSplash() {}, playNoMana() {} }, fx: null, character: null,
    };
    return { g, c, log };
}

test('a frozen hero says «Fire Maxima»: the ice melts at once, the usual mana is paid, nobody needs a wand', () => {
    const { g, c, log } = fake();
    assert.equal(fireThaw(g, 'FireMaxima', true), 'FireMaxima');
    assert.equal(c.frozen, false);
    assert.equal(c.chill, 0);
    assert.equal(c.paid, 1);
    assert.equal(c.fatigue, 80);
    assert.deepEqual(log.noted, ['FireMaxima']);
});

test('the interim and the final version of one phrase are one cast — the second must not become the beam', () => {
    const { g } = fake();
    assert.equal(fireThaw(g, 'FireMaxima', false), 'FireMaxima');
    assert.equal(fireThaw(g, 'FireMaxima', true), null, 'swallowed within the debounce');
    g._thawAt -= THAW.DEBOUNCE + 0.1;
    assert.equal(fireThaw(g, 'FireMaxima', true), undefined, 'later — the usual spell again');
});

test('not mine: a free hero, another spell, the vortex ice bubble, the monster form, the dead', () => {
    assert.equal(fireThaw(fake({ frozen: false }).g, 'FireMaxima'), undefined);
    assert.equal(fireThaw(fake().g, 'Fire'), undefined);
    assert.equal(fireThaw(fake({ trap: true }).g, 'FireMaxima'), undefined, 'the bubble has its own way out (WaterVortex.castFire)');
    const m = fake(); m.g.monster = { active: true };
    assert.equal(fireThaw(m.g, 'FireMaxima'), undefined);
    assert.equal(fireThaw(fake({ dead: true }).g, 'FireMaxima'), undefined);
    assert.ok(thawApplies({ name: 'FireMaxima', frozen: true }));
    assert.ok(!thawApplies({ name: 'FireMaxima', frozen: true, encased: true }));
});

test('no mana: the ice stays and a short note says why (nothing is paid)', () => {
    const { g, c, log } = fake({ fatigue: 5 });
    assert.equal(fireThaw(g, 'FireMaxima', true), null);
    assert.equal(c.frozen, true);
    assert.equal(c.paid, 0);
    assert.equal(log.toast.length, 1);
    assert.equal(g._thawAt, undefined, 'a failed try does not start the debounce');
});

test('endless mana (Creative): free, still melts', () => {
    const { g, c } = fake({ manaOn: false, fatigue: 0 });
    assert.equal(fireThaw(g, 'FireMaxima', true), 'FireMaxima');
    assert.equal(c.frozen, false);
});
