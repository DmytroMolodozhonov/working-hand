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

// (author, 02.11: «монеточки в кармане уже не делаем» — the coins come off the belt only in a deal, by the pouch cell or the hand at
//  the hip; the pocket circle is things only, so a touch never answers with coins, a message or a clink)
test('pocket circle: things only — the pouch is not in it, the coins stay on the belt', () => {
    const g = fakeGame(), inv = g.inventory;
    const a = { kind: 'meat', uid: 'a', count: 1 }, b = { kind: 'scroll', uid: 'b' };
    inv.slots[0] = a; inv.slots[1] = b;
    inv.purse.count = 700;
    const seq = [];
    for (let i = 0; i < 8; i++) { inv.pocketTouch('left'); seq.push(g.items.held.left?.item.kind ?? '-'); }
    assert.deepEqual(seq, ['meat', '-', 'scroll', '-', 'meat', '-', 'scroll', '-']);
    assert.equal(inv.purse.count, 700, 'the coins never left the belt');
    assert.equal(inv.coins(), 700);
});

test('pouch cell: the pouch is off the belt (lost) — no pouch in the circle', () => {
    const g = fakeGame(), inv = g.inventory;
    inv.purse.takeAll();
    const a = { kind: 'meat', uid: 'a', count: 1 };
    inv.slots[0] = a;
    inv.pocketTouch('left');
    inv.pocketTouch('left');
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, a);
});

test('pocket circle: thing, empty, thing, empty… round (no pouch); a thrown thing keeps the place', () => {
    const g = fakeGame(), inv = g.inventory;
    const a = { kind: 'meat', uid: 'a', count: 1 }, b = { kind: 'scroll', uid: 'b' }, c = { kind: 'apple', uid: 'c', count: 1 };
    inv.slots[0] = a; inv.slots[1] = b; inv.slots[2] = c;
    inv.purse.count = 100;
    const seq = [];
    for (let i = 0; i < 9; i++) { inv.pocketTouch('left'); seq.push(g.items.held.left?.item.kind ?? '-'); }
    assert.deepEqual(seq, ['meat', '-', 'scroll', '-', 'apple', '-', 'meat', '-', 'scroll']);
    // the scroll (cell 2) is in the hand and is thrown away: the next touch gives cell 3 at once, no extra empty step
    assert.equal(g.items.held.left.item, b);
    g.items.releaseHand('left'); inv.slots[1] = null; // (thrown away)
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, c, 'cell 3 right away');
});

test('pocket circle: the thing let go and put back in its cell is taken again', () => {
    const g = fakeGame(), inv = g.inventory;
    const a = { kind: 'meat', uid: 'a', count: 1 }, b = { kind: 'scroll', uid: 'b' };
    inv.slots[0] = a; inv.slots[1] = b;
    inv.purse.takeAll();
    inv.pocketTouch('left'); inv.pocketTouch('left'); inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, b);
    g.items.releaseHand('left'); inv.slots[1] = null;
    inv.slots[1] = b; // (picked up again)
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, b, 'the same cell');
});

test('pouch cell: the red picture, no number of pouches, the coins on hover; one pouch only', () => {
    const g = fakeGame(), inv = g.inventory;
    assert.deepEqual(inv.pouchInfo(), { have: true, coins: 0 }, 'a new hero has the pouch');
    inv.purse.count = 1200;
    assert.deepEqual(inv.pouchInfo(), { have: true, coins: 1200 });
    assert.ok(pouchIcon().includes('#b3202a'));
    inv.purse.takeAll();
    assert.equal(inv.pouchInfo().have, false);
    inv.purse.ensure();
    assert.equal(inv.pouchInfo().have, true, 'given again');
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
