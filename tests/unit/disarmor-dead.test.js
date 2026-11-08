/** «Disarmor» takes the armour off the DEAD too; death itself takes none (the author 08.11). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArmorSystem } from '../../src/game/Armor.js';
import { DeathSystem as Death } from '../../src/game/Death.js';

function armorSys(spawned) {
    const A = Object.create(ArmorSystem.prototype);
    A.game = { authority: true, items: { spawnLoose: (it) => spawned.push(it) }, sync: { armor() {} }, death: { restyleBody: (b) => { b.st = 1; b.arm = null; }, bodies: new Map() }, castleLife: null };
    A.stripped = new Set();
    A._strippedDead = (v) => { v.stripped = true; };
    return A;
}

test('what a dead knight / king / wizard wears is described', () => {
    const A = armorSys([]);
    assert.deepEqual(A.deadArmor({ role: 'knight', armor: 25, maxArmor: 50 }).p, ['helmet', 'chest', 'legs']);
    assert.equal(A.deadArmor({ role: 'knight', armor: 25, maxArmor: 50 }).k, 0.5);
    assert.deepEqual(A.deadArmor({ role: 'king', magicPieces: ['helmet', 'chest', 'legs', 'boots'], armor: 10, maxArmor: 10 }).mg, true);
    assert.equal(A.deadArmor({ wizard: true, robe: true }).r, 'magic');
    assert.equal(A.deadArmor({ wizard: true }).r, 'plain');
    assert.equal(A.deadArmor({ role: 'farmer' }), null);
    assert.equal(A.deadArmor({ role: 'knight', stripped: true }), null, 'already off');
});

test('«Disarmor» on a dead knight: three plates as things, the body made again without them; never twice', () => {
    const out = [];
    const A = armorSys(out);
    const v = { id: 'k1', role: 'knight', dead: true, armor: 50, maxArmor: 50, x: 0, y: 0, z: 0 };
    assert.equal(A.stripVillager(v, 'me'), 'strip');
    assert.equal(out.length, 3);
    assert.equal(v.stripped, true);
    assert.equal(A.stripVillager(v, 'me'), 'none');
    assert.equal(out.length, 3);
});

test('«Disarmor» on a dead wizard in a magic robe takes the robe (a living one keeps it)', () => {
    const out = [];
    const A = armorSys(out);
    const w = { id: 'w1', role: 'teacher', wizard: true, robe: true, dead: true, x: 0, y: 0, z: 0 };
    assert.equal(A.stripVillager(w, 'me'), 'strip');
    assert.equal(out.length, 1);
});

test('«Disarmor» on a lying body (long dead, no live person): its record loses the armour and the body is remade', () => {
    const out = [];
    const A = armorSys(out);
    const b = { id: 'b1', k: 'v', x: 0, y: 0, z: 0, arm: { p: ['helmet', 'chest', 'legs'], k: 1 }, st: 0 };
    assert.equal(A.stripBody(b), true);
    assert.equal(out.length, 3);
    assert.equal(b.st, 1);
    assert.equal(b.arm, null);
    assert.equal(A.stripBody(b), false, 'never twice');
});

test('a charge along a line meets a dead body that still wears armour — the nearest, not one beside the way', () => {
    const D = Object.create(Death.prototype);
    D.bodies = new Map([['a', { id: 'a', k: 'v', x: 10, y: 0, z: 0, arm: { p: ['chest'] }, st: 0, model: {} }], ['b', { id: 'b', k: 'v', x: 4, y: 0, z: 9, arm: { p: ['chest'] }, st: 0, model: {} }], ['c', { id: 'c', k: 'v', x: 6, y: 0, z: 0, arm: null, st: 0, model: {} }]]);
    D.game = { castleLife: null };
    const r = D.corpseOnWay({ x: 0, y: 0.6, z: 0 }, { x: 20, y: 0.6, z: 0 });
    assert.equal(r.body.id, 'a', 'the one on the line; the unarmoured and the far-off ones are not');
    assert.ok(Math.abs(r.s - 0.5) < 0.01);
    assert.equal(D.corpseOnWay({ x: 0, y: 0.6, z: 0 }, { x: 5, y: 0.6, z: 0 }), null, 'a charge that stops short');
});
