import test from 'node:test';
import assert from 'node:assert/strict';
import { elementK, switchTo, HeroElement, ELEMENTS, KEY_SPELL } from '../../src/game/HeroElement.js';
import { normalizeHero, DEFAULT_HERO } from '../../src/game/HeroSetup.js';
import { ELEMENT_SPELLS } from '../../src/ui/SpellElements.js';

test('a mage of an element pays half for its spells and full for the others', () => {
    assert.equal(elementK('water', 'WaterVortex'), 0.5);
    assert.equal(elementK('earth', 'GroundVortex'), 0.5);
    assert.equal(elementK('water', 'GroundVortex'), 1);
    assert.equal(elementK(null, 'WaterVortex'), 1);
    assert.equal(elementK('air', undefined), 1);
});
test('every element has its category spells and its key spell is one of them or is new', () => {
    for (const e of ELEMENTS) assert.ok(ELEMENT_SPELLS[e].length > 3);
    assert.equal(KEY_SPELL.water, 'WaterVortex'); assert.equal(KEY_SPELL.earth, 'GroundVortex');
});
test('a pentagram of another element replaces the old one: the advantage is lost, the same one changes nothing', () => {
    assert.deepEqual(switchTo(null, 'fire'), { element: 'fire', lost: null, changed: true });
    assert.deepEqual(switchTo('water', 'fire'), { element: 'fire', lost: 'water', changed: true });
    assert.equal(switchTo('fire', 'fire').changed, false);
    assert.equal(switchTo('fire', 'nonsense').element, 'fire');
});
test('the hero class: only one element, saved and restored', () => {
    const g = { hud: { setVoice() {} } };
    const h = new HeroElement(g);
    h.set('water'); h.set('fire');
    assert.equal(h.element, 'fire'); assert.equal(h.k('Fireball'), 0.5); assert.equal(h.k('Waterball'), 1);
    const s = h.snapshot(); const h2 = new HeroElement(g); h2.restore(s); assert.equal(h2.element, 'fire');
    h2.restore('junk'); assert.equal(h2.element, null);
});
test('the Creative setting is normalised; old worlds have none', () => {
    assert.equal(normalizeHero({ element: 'air' }).element, 'air');
    assert.equal(normalizeHero({ element: 'x' }).element, null);
    assert.equal(normalizeHero({}).element, DEFAULT_HERO.element);
});

import { bareOwn } from '../../src/game/HeroElement.js';
import { bareGate } from '../../src/game/BareHand.js';
test('a mage of an element casts the spells of his own element with a bare hand, and only those', () => {
    assert.equal(bareOwn('water', 'WaterVortex'), true);
    assert.equal(bareOwn('water', 'IceShards'), true);
    assert.equal(bareOwn('earth', 'Earthquake'), true);
    assert.equal(bareOwn('fire', 'FireVortex'), true);
    assert.equal(bareOwn('fire', 'Waterball'), false);
    assert.equal(bareOwn(null, 'Fireball'), false);
    const st = { hasWand: false, creative: false, bareMaster: false };
    assert.equal(bareGate('Waterball', { ...st, elementOwn: true }).ok, true);
    assert.equal(bareGate('Fireball', { ...st, elementOwn: false }).ok, false, 'another element still wants the wand');
});

import { resistsWaterPush } from '../../src/game/HeroElement.js';
test('a water mage is not moved by water (his own wave, a foe\'s vortex, a ball); others are', () => {
    for (const k of ['WaveAttack', 'WaterVortex', 'Waterball', 'WaveRoll']) assert.equal(resistsWaterPush('water', k), true, k);
    assert.equal(resistsWaterPush('fire', 'WaveAttack'), false);
    assert.equal(resistsWaterPush('water', 'Bombardo'), false, 'only water');
    assert.equal(resistsWaterPush(null, 'WaveAttack'), false);
});
