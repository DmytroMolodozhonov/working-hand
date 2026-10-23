// The pocket goes through the slots by touches (never a drop), and two wands touching ~3 s change hands.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Inventory } from '../../src/game/Inventory.js';
import { SwapTimer, SWAP_TIME, segmentGap, WandSwap } from '../../src/game/WandSwap.js';

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

test('pocket: three touches — the third slot\'s thing is in the hand, the others are back in their slots', () => {
    const g = fakeGame(), inv = g.inventory;
    const a = { kind: 'meat', uid: 'a', count: 1 }, b = { kind: 'scroll', uid: 'b' }, c = { kind: 'apple', uid: 'c', count: 1 };
    inv.slots[0] = a; inv.slots[1] = b; inv.slots[2] = c;
    inv.purse.takeAll();
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, a);
    assert.ok(inv.pocketCycling('left'), 'no drop / throw while choosing');
    inv.pocketTouch('left');
    assert.equal(g.items.held.left, null, 'between two things the hand is empty');
    assert.equal(inv.slots[0], a, 'the first came back into its slot');
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, b);
    inv.pocketTouch('left');
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, c);
    assert.deepEqual(inv.slots.slice(0, 2), [a, b]);
    // and round the circle
    inv.pocketTouch('left');
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, a);
    assert.equal(inv.slots[2], c);
});

test('pocket: empty slots are skipped; the hand away for good keeps its thing', () => {
    const g = fakeGame(), inv = g.inventory;
    const a = { kind: 'meat', uid: 'a', count: 1 }, b = { kind: 'scroll', uid: 'b' };
    inv.slots[0] = a; inv.slots[3] = b;
    inv.pocketTouch('left');
    inv.pocketTouch('left');
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, b);
    inv._cyc = null; // (the hand went away for ~1 s)
    assert.ok(!inv.pocketCycling('left'));
    inv.pocketTouch('left'); // (a later touch with a thing in the hand puts it away, as ever)
    assert.equal(g.items.held.left, null);
    assert.ok(inv.slots.includes(b));
});

test('wand swap: touching 3 s — done; 1 s — nothing; parted — starts over', () => {
    const t = new SwapTimer();
    let done = false;
    for (let i = 0; i < 60; i++) done = t.update(1 / 60, true) || done; // 1 s
    assert.ok(!done);
    for (let i = 0; i < 60; i++) t.update(1 / 60, false); // parted (a second)
    assert.equal(t.t, 0);
    for (let i = 0; i < Math.ceil(SWAP_TIME * 60) + 2; i++) done = t.update(1 / 60, true) || done;
    assert.ok(done);
    // a blink of the camera does not reset
    const u = new SwapTimer();
    u.update(1, true); u.update(0.1, false); u.update(0.1, true);
    assert.ok(u.t > 1.05);
});

test('wand swap: wands crossing touch, wands apart do not; the swap changes the hands', () => {
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    assert.ok(segmentGap(v(0, 0, 0), v(0, 0.6, 0), v(-0.3, 0.6, 0), v(0.3, 0.6, 0)) < 0.01);
    assert.ok(segmentGap(v(0, 0, 0), v(0, 0.6, 0), v(0.3, 0, 0), v(0.3, 0.6, 0)) > 0.25);
    const L = { item: { kind: 'wand', uid: 'l' }, model: new THREE.Group() }, R = { item: { kind: 'wand', uid: 'r' }, model: new THREE.Group() };
    const sent = [];
    const items = { held: { left: L, right: R }, game: { character: {}, sync: { itemHold: (s, i) => sent.push([s, i.uid]) } } };
    const sw = new WandSwap(items);
    assert.ok(sw.swap(null));
    assert.equal(items.held.left, R);
    assert.equal(items.held.right, L);
    assert.deepEqual(sent, [['left', 'r'], ['right', 'l']]);
});

test('pocket: sand, wand, earth — three touches give sand, wand, earth (the wand is in the circle)', () => {
    const g = fakeGame(), inv = g.inventory;
    const wand = { kind: 'wand', uid: 'w', model: 1, color: 0x123456 };
    inv.purse.takeAll();
    inv.slots[0] = { kind: 'res', block: 1, count: 5 };
    inv.slots[1] = wand;
    inv.slots[2] = { kind: 'res', block: 2, count: 5 };
    inv.pocketTouch('left');
    assert.equal(inv.selected, 0);
    inv.pocketTouch('left');
    assert.equal(inv.selected, -1, 'the empty hand');
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, wand);
    assert.equal(inv.selected, 1);
    inv.pocketTouch('left');
    assert.equal(g.items.held.left, null);
    assert.equal(inv.slots[1], wand, 'the wand is back in its slot');
    inv.pocketTouch('left');
    assert.equal(inv.selected, 2);
    inv.pocketTouch('left');
    inv.pocketTouch('left');
    assert.equal(inv.selected, 0, 'and round again');
});

test('a wand just taken out of the pocket by the other hand is not tucked into the belt on the way back', () => {
    const g = fakeGame(), inv = g.inventory;
    const wand = { kind: 'wand', uid: 'w2' };
    inv.slots[0] = wand;
    assert.ok(!inv.justTook('left'));
    inv.pocketTouch('left');
    assert.equal(g.items.held.left.item, wand);
    assert.ok(inv.justTook('left'), 'WandBelt leaves it in the hand for a while');
    assert.ok(!inv.justTook('right'));
});
