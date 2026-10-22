// The slots under the fatigue bar: each thing drawn as itself (ItemIcons), things of other kinds never in one
// stack, one wand — one entry, a pouch never vanishes into a full pocket, «Акцио» never stops working.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { iconKey } from '../../src/ui/ItemIcons.js';
import { Inventory, sameLook } from '../../src/game/Inventory.js';
import { Accio, accioBody, ACCIO_STUCK } from '../../src/game/Accio.js';

/** A game just big enough for the slots and the hands. */
function fakeGame() {
    const held = { right: null, left: null };
    const toasts = [];
    const g = {
        dom: 'right',
        hud: { toast: (t) => toasts.push(t), setVoice: () => {} },
        toasts,
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

test('pictures: one per look of a thing — two wands of other woods or shapes differ, its uid / power / count never matter', () => {
    const a = { kind: 'wand', uid: 'i1', model: 3, color: 0x8844ff, power: 12 };
    assert.equal(iconKey(a), iconKey({ ...a, uid: 'i2', power: 40 }));
    assert.notEqual(iconKey(a), iconKey({ ...a, color: 0x22aa33 }));
    assert.notEqual(iconKey(a), iconKey({ ...a, model: 4 }));
    assert.notEqual(iconKey({ kind: 'scroll', stat: 'spell', spell: 'Bombardo' }), iconKey({ kind: 'scroll', stat: 'spell', spell: 'Inferno' }));
    assert.equal(iconKey({ kind: 'coins', count: 5 }), iconKey({ kind: 'coins', count: 300 }));
    assert.notEqual(iconKey({ kind: 'coins' }), iconKey({ kind: 'coins', magic: true }));
    assert.notEqual(iconKey({ kind: 'weapon', type: 'sword' }), iconKey({ kind: 'weapon', type: 'axe' }));
    assert.notEqual(iconKey({ kind: 'meat' }), iconKey({ kind: 'coins' }));
    // (never a fractional number in a key: the cache would grow without end)
    assert.ok(!/\./.test(iconKey({ kind: 'potion', color: 0x9fe8ff, rec: 'heal', strength: 0.7345 })));
    assert.equal(iconKey(null), null);
});

test('meat in the pocket, then a pouch of coins: two things, never «a second meat»', () => {
    const g = fakeGame(), inv = g.inventory;
    assert.ok(inv.storeItem({ kind: 'meat', uid: 'm1', count: 1, from: 'pig' }));
    assert.ok(inv.storeItem({ kind: 'coins', uid: 'c1', count: 23 }));
    const meat = inv.slots.filter((s) => s?.kind === 'meat'), coins = inv.slots.filter((s) => s?.kind === 'coins');
    assert.equal(meat.length, 1);
    assert.equal(meat[0].count, 1);
    assert.equal(coins.length, 1);
    assert.equal(coins[0].count, 23);
    // the same kind stacks; another look of it (another animal's meat, another potion) does not
    assert.ok(sameLook({ kind: 'meat', from: 'pig' }, { kind: 'meat', from: 'pig' }));
    assert.ok(!sameLook({ kind: 'meat', from: 'pig' }, { kind: 'meat', from: 'cow' }));
    inv.storeItem({ kind: 'meat', uid: 'm2', count: 1, from: 'pig' });
    assert.equal(inv.slots.find((s) => s?.kind === 'meat').count, 2);
});

test('a pouch tied on at the hip: the empty hand still there takes nothing out of the pocket', () => {
    const g = fakeGame(), inv = g.inventory;
    inv.storeItem({ kind: 'meat', uid: 'm1', count: 1 });
    g.items.held.left = { item: { kind: 'coins', uid: 'c1', count: 30 } };
    inv._pocket.left.armed = true;
    inv.purse._tieOn('left');
    assert.equal(inv.purse.count, 30);
    assert.equal(g.items.held.left, null);
    assert.equal(inv._pocket.left.armed, false, 'the pocket waits until the hand has gone away from the hip');
    assert.ok(inv._pocket.left.hold > performance.now());
    assert.equal(inv.slots.filter((s) => s?.kind === 'meat').length, 1);
});

test('a full pocket: a pouch, a wand, a scroll stay in the hand — they never vanish', () => {
    const g = fakeGame(), inv = g.inventory;
    for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = { kind: 'scroll', uid: 's' + i };
    inv.purse.count = 300; // (the belt full too)
    const pouch = { kind: 'coins', uid: 'c9', count: 40 };
    g.items.held.left = { item: pouch };
    inv.pocketRight('left');
    assert.equal(g.items.held.left?.item, pouch, 'the pouch is still in the hand');
    const wand = { kind: 'wand', uid: 'w1', model: 2, color: 0x123456 };
    g.items.held.right = { item: wand };
    assert.equal(inv.wandPocket('right'), false);
    assert.equal(g.items.held.right?.item, wand, 'the wand is still in the hand');
    assert.equal(inv.coins(), 340);
});

test('one wand, one entry: my own lost wand back («Акцио» after leaving the game) — the stand-in goes', () => {
    const g = fakeGame(), inv = g.inventory;
    const mine = { kind: 'wand', uid: 'w-mine', model: 5, color: 0x4466ff };
    inv.heldWand(mine); // (it was in my hand: it is my wand)
    assert.equal(inv.ownWand, 'w-mine');
    // the game left with the wand on the ground: back in, a plain stand-in is given
    assert.ok(inv.ensureStarterWand());
    const spare = inv.slots.find((s) => s?.kind === 'wand');
    assert.ok(spare.spare);
    inv.heldWand(spare); // (taking the stand-in into the hand does not make it «my wand» while mine lies there)
    assert.equal(inv.ownWand, 'w-mine');
    // «Акцио»: my wand comes into the hand — the stand-in is gone
    assert.ok(g.items.takeIntoHand(mine, 'right'));
    assert.ok(inv.gotWand(mine));
    const wands = inv.slots.filter((s) => s?.kind === 'wand').length + ['left', 'right'].filter((s) => g.items.held[s]?.item.kind === 'wand').length;
    assert.equal(wands, 1);
    // the same thing never stored twice
    assert.ok(inv.storeItem(mine) && inv.storeItem(mine));
    assert.equal(inv.slots.filter((s) => s?.uid === 'w-mine').length, 0, 'in the hand already: not put into a slot as well');
    inv.slots[0] = { kind: 'scroll', uid: 'sx' };
    inv.store({ kind: 'scroll', uid: 'sx' });
    assert.equal(inv.slots.filter((s) => s?.uid === 'sx').length, 1);
});

test('«Акцио»: bones (the meat all taken) are no target; a wand lying by a dead pig wins over the body', () => {
    assert.equal(accioBody({ dead: true, meat: 2 }), true);
    assert.equal(accioBody({ dead: true, meat: 0, bones: {} }), false);
    assert.equal(accioBody({ dead: false }), false);
    const hand = new THREE.Vector3(0, 1.5, 0), dir = new THREE.Vector3(0, -0.35, -1).normalize();
    const wandAt = new THREE.Vector3(0, 0.1, -4), pigAt = new THREE.Vector3(0.6, 0.4, -4.3);
    const L = { item: { kind: 'wand', uid: 'w1' }, model: { position: wandAt } };
    const pig = { dead: true, meat: 3, group: { position: pigAt } };
    let pulled = null, gotMeat = null;
    const g = {
        dom: 'right',
        character: { isArmRaised: () => true, getHandWorldPosition: (s, v) => v.copy(hand), getHandDirection: (s, v) => v.copy(dir), getGripObject: () => ({ getWorldPosition: (v) => v.copy(hand) }) },
        weapons: { hands: { right: { held: null }, left: { held: null } }, weapons: [] },
        items: { held: { right: null, left: null }, loose: new Map([['w1', L]]), auth: true },
        animals: { list: [pig], auth: true, _takeMeat: (a, to, side) => { gotMeat = side; a.meat--; } },
        runner: { accioTargets: () => [], accio: (a) => { pulled = a; } },
        fx: { spark: () => {} },
        mana: { success: () => {} },
        hud: {},
    };
    const ac = new Accio(g);
    assert.equal(ac.cast(), null);
    assert.equal(ac.state?.L, L, 'the wand flies, not the pig');
    assert.equal(pulled, null);
    // the wand far off the pointing: the pig's meat comes into the free hand
    ac.state = null; L.accio = false;
    wandAt.set(8, 0.1, 0);
    assert.equal(ac.cast(), null);
    assert.equal(gotMeat, 'right');
    // bones only: nothing there to summon — it never stands in the way
    pig.meat = 0; pig.bones = {};
    wandAt.set(0, 0.1, -4);
    ac.state = null; L.accio = false;
    ac.cast();
    assert.equal(ac.state?.L, L);
});

test('«Акцио» never stays busy: whatever it waits for, after a few seconds it can be said again', () => {
    const g = { items: { loose: new Map() }, character: {} };
    const ac = new Accio(g);
    ac.state = { mc: { done: false }, side: 'right', t: 0 }; // (a crystal whose flight was cut short elsewhere)
    for (let t = 0; t < ACCIO_STUCK + 1; t += 0.5) ac.update(0.5);
    assert.equal(ac.active, false);
});
