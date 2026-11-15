import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Animals } from '../../src/game/Animals.js';

/**
 * The author 14.11: «мясо множится при выбрасывании — выбрасываю, а в руке тут же новое» (журнал: «Сырое мясо покинул(а) руку» и через 5 мс
 * «взял(а) в руку: Сырое мясо» с новым номером — рука над тушей). Рука берёт мясо из туши только если пришла к ней ПУСТОЙ.
 */
function fake() {
    const hand = new THREE.Vector3(0, 0, 0), taken = [];
    const carcass = { dead: true, meat: 4, group: { position: new THREE.Vector3(0.5, 0, 0) } };
    const g = {
        items: { held: { right: null, left: { item: { kind: 'wand' } } } }, weapons: { hands: { right: { held: null }, left: { held: null } } },
        character: { getHandWorldPosition: (s, v) => v.copy(hand) }, localId: 'me', sync: null, authority: true,
    };
    const a = Object.create(Animals.prototype);
    Object.assign(a, { game: g, list: [carcass], trees: new Map(), _takeMeat: (c, id, side) => { c.meat--; taken.push(side); g.items.held[side] = { item: { kind: 'meat' } }; } });
    return { a, g, hand, taken, carcass };
}
const tick = (a) => { a._pickAt = -1e9; a._handPicks(0.016); };

test('an empty hand touching a carcass takes one piece', () => {
    const { a, taken } = fake();
    tick(a); assert.deepEqual(taken, ['right']);
});

test('a piece thrown over the carcass is not replaced by a new one in the same hand', () => {
    const { a, g, taken } = fake();
    tick(a); g.items.held.right = null; // (let go / thrown)
    tick(a); tick(a);
    assert.equal(taken.length, 1, 'no new piece while the hand has not left the carcass');
});

test('after the hand has gone away and come back empty it takes again', () => {
    const { a, g, hand, taken } = fake();
    tick(a); g.items.held.right = null;
    hand.set(6, 0, 0); tick(a); // (away)
    hand.set(0, 0, 0); tick(a);
    assert.equal(taken.length, 2);
});
