import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST, PLAYER_DAMAGE } from '../../src/game/Combat.js';
import { SPELL_PHYSICS } from '../../src/game/Impact.js';
import { overgrownPush } from '../../src/game/Overgrown.js';
import { fallDamage } from '../../src/game/Levitation.js';

test('«Overgrown» is heard in English and as Russian recognition writes it; «Максима» makes it the strong one', () => {
    for (const t of ['Overgrown', 'over grown', 'овергроун', 'Оверграун', 'овер гроун', 'Овергрон', 'оверграунд', 'обергроун'])
        assert.equal(matchSpell(t), 'Overgrown', t);
    for (const t of ['Overgrown Maxima', 'овергроун максима', 'Оверграун Максима', 'оверграунд макс'])
        assert.equal(matchSpell(t), 'OvergrownMaxima', t);
    // the old spells are not taken over
    assert.equal(matchSpell('вайнд'), 'Wind');
    assert.equal(matchSpell('вайнд максима'), 'WindMaxima');
    assert.equal(matchSpell('бомбардо'), 'Bombardo');
    assert.equal(matchSpell('game over'), null);
});

test('«Overgrown» costs 10 mana, its Максима 20; the spell itself hurts nobody', () => {
    assert.equal(SPELL_COST.Overgrown, 10);
    assert.equal(SPELL_COST.OvergrownMaxima, 20);
    assert.equal(PLAYER_DAMAGE.Overgrown, undefined);
    assert.equal(PLAYER_DAMAGE.OvergrownMaxima, undefined);
});

const O = new THREE.Vector3(0, 1.6, 0);
const D = new THREE.Vector3(0, 0, -1);

test('a crowd in front is thrown apart: the left ones to the left, the right ones to the right, all up', () => {
    const left = overgrownPush('Overgrown', O, D, new THREE.Vector3(-1.5, 1, -8));
    const right = overgrownPush('Overgrown', O, D, new THREE.Vector3(1.5, 1, -8));
    assert.ok(left.x < -3 && right.x > 3, `${left.x} ${right.x}`);
    assert.ok(left.y > 2 && right.y > 2);
    // one right on the line still goes to a side
    const mid = overgrownPush('Overgrown', O, D, new THREE.Vector3(0, 1, -8));
    assert.ok(Math.abs(mid.x) > 3);
    // behind the hand or far away: nothing
    assert.equal(overgrownPush('Overgrown', O, D, new THREE.Vector3(0, 1, 8)), null);
    assert.equal(overgrownPush('Overgrown', O, D, new THREE.Vector3(0, 1, -30)), null);
    assert.equal(overgrownPush('Overgrown', O, D, new THREE.Vector3(12, 1, -6)), null);
});

test('«Overgrown Максима» throws twice as hard and twice as high, and reaches further', () => {
    const p = new THREE.Vector3(1.5, 1, -8);
    const a = overgrownPush('Overgrown', O, D, p);
    const b = overgrownPush('OvergrownMaxima', O, D, p);
    const h = (v) => Math.hypot(v.x, v.z);
    assert.ok(h(b) > 1.9 * h(a) && h(b) < 2.4 * h(a), `${h(a)} ${h(b)}`);
    assert.equal(b.y, 2 * a.y);
    assert.equal(overgrownPush('Overgrown', O, D, new THREE.Vector3(0, 1, -20)), null);
    assert.ok(overgrownPush('OvergrownMaxima', O, D, new THREE.Vector3(0, 1, -20)));
});

test('on flat ground the throw alone is no fall from a height (no damage); only a ledge hurts', () => {
    for (const n of ['Overgrown', 'OvergrownMaxima']) {
        const vy = SPELL_PHYSICS[n].toss;
        // zombies fall at 25 m/s², villagers at 22, the player at 20 (and is lifted 0.7 m at the toss)
        assert.equal(fallDamage(vy * vy / (2 * 25)), 0, n);
        assert.equal(fallDamage(vy * vy / (2 * 22)), 0, n);
        assert.equal(fallDamage(vy * vy / (2 * 20) + 0.7), 0, n);
        assert.ok(fallDamage(vy * vy / (2 * 20) + 0.7 + 6) > 0, n);
    }
});
