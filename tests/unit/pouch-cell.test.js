// The pouch cell: the last of the pocket's circle, the best pouch, how many of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Inventory, pouchIcon } from '../../src/game/Inventory.js';

function fakeGame() {
    const held = { right: null, left: null };
    const g = {
        dom: 'right',
        hud: { toast: () => {}, setVoice: () => {} },
        fx: { spark: () => {} },
        character: { getHandWorldPosition: (s, v = new THREE.Vector3()) => v.set(0, 1, 0), group: { position: new THREE.Vector3() } },
        weapons: { hands: { right: { held: null }, left: { held: null } } },
        items: {
            held,
            takeIntoHand(item, side) { if (held[side]) return false; held[side] = { item }; return true; },
            releaseHand(side) { const h = held[side]; held[side] = null; return h?.item || null; },
        },
    };
    g.inventory = new Inventory(g);
    return g;
}

test('pouch cell: circle is [slots…, pouch], the pouch goes back onto the belt without losing coins', () => {
    const g = fakeGame(), inv = g.inventory;
    const a = { kind: 'meat', uid: 'a', count: 1 }, b = { kind: 'scroll', uid: 'b' };
    inv.slots[0] = a; inv.slots[1] = b;
    inv.purse.count = 700; // two pouches: 500 + 200
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, a);
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, b);
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item.kind, 'coins', 'the last of the circle is the pouch');
    assert.equal(g.items.held.left.item.count, 500);
    assert.equal(inv.coins(), 700);
    inv.pocketTouch('left');
    assert.equal(inv.purse.count, 700, 'back onto the belt: no coin lost');
    assert.equal(inv.coins(), 700);
    assert.equal(g.items.held.left.item, a, 'the circle goes on from the start');
});

test('pouch cell: no pouches — no pouch in the circle', () => {
    const g = fakeGame(), inv = g.inventory;
    const a = { kind: 'meat', uid: 'a', count: 1 };
    inv.slots[0] = a;
    inv.pocketTouch('left');
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, a);
});

test('pouch cell: red picture with a magic pouch, the number of pouches', () => {
    const g = fakeGame(), inv = g.inventory;
    assert.deepEqual(inv.pouchInfo(), { count: 0, magic: false, coins: 0 });
    inv.purse.count = 1200; // 500 + 500 + 200
    inv.slots[3] = { kind: 'coins', uid: 'c', count: 40 };
    assert.equal(inv.pouchInfo().count, 4);
    assert.equal(inv.pouchInfo().magic, false);
    inv.slots[4] = { kind: 'coins', uid: 'm', count: 5, magic: true };
    const o = inv.pouchInfo();
    assert.equal(o.count, 5);
    assert.equal(o.magic, true);
    assert.notEqual(pouchIcon(true), pouchIcon(false));
    assert.ok(pouchIcon(o.magic).includes('#b3202a'));
});

test('pouch cell: a click takes the pouch and puts it back', () => {
    const g = fakeGame(), inv = g.inventory;
    inv.purse.count = 300;
    inv.pouchClick();
    assert.equal(g.items.held.right.item.count, 300);
    inv.pouchClick();
    assert.equal(g.items.held.right, null);
    assert.equal(inv.purse.count, 300);
});
