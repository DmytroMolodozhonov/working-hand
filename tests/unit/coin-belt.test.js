// The coin pouches on the belt's right side (CoinBelt.js): how coins fill the pouches, and
// the hand put on the side (PoseInterpreter.purseHand) — never a hanging or lowered arm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { purseBags, purseAdd, pouchSize } from '../../src/game/CoinBelt.js';
import { purseHand } from '../../src/input/PoseInterpreter.js';
import { frame } from '../e2e/poses.mjs';

test('the one pouch: all the coins in it, no limit, it grows a little and stops', () => {
    assert.deepEqual(purseBags(0), [0]);
    assert.deepEqual(purseBags(5000), [5000], 'one pouch, all the coins in it');
    assert.deepEqual(purseAdd(280, 10000), { have: 10280, rest: 0 }, 'no limit');
    assert.deepEqual(purseAdd(0, 40, false), { have: 0, rest: 40 }, 'a pouch off the belt takes nothing');
    assert.ok(pouchSize(1e6) < 0.63 && pouchSize(1e6) > pouchSize(10), 'grows a little and stops');
});

test('the hand put on the right hip (or the left one across) is seen; hanging, lowered, raised arms, the wand\'s belt — not', () => {
    const lm = (f) => frame(f).poseLandmarks;
    for (const purse of ['right', 'hip']) assert.equal(purseHand(lm({ arms: 'hang', purse, rightCurl: 0.9 }), 'right'), true, purse);
    assert.equal(purseHand(lm({ arms: 'hang', purse: 'cross', leftCurl: 0.9 }), 'left', 4 / 3, 'right'), true, 'the left hand across to the right hip');
    for (const f of [{ arms: 'hang' }, { arms: 'down' }, { arms: 'forward' }, { arms: 'up' }, { arms: 'hang', belt: 'right' }, { raise: 15 }, { raise: 30 }, { raise: 70 }, { arms: 'hang', lean: 0.05 }, { arms: 'hang', lean: -0.05 }]) {
        assert.notEqual(purseHand(lm(f), 'right'), true, JSON.stringify(f));
        assert.notEqual(purseHand(lm(f), 'left', 4 / 3, 'right'), true, 'across ' + JSON.stringify(f));
    }
});

test('a new hero has the pouch on the belt; a pouch picked up pours into it; death drops it whole', async () => {
    const { CoinBelt, makeMagicPouch, makePurseModel } = await import('../../src/game/CoinBelt.js');
    const belt = new CoinBelt({});
    assert.equal(belt.magic, true, 'the pouch is on the belt from the start');
    assert.equal(belt.any, true);
    assert.equal(belt.count, 0, 'empty');
    assert.equal(belt.add(5000), 0, 'everything fits');
    assert.equal(belt.canTie({ kind: 'coins', count: 100 }), true, 'a second pouch is emptied into it');
    assert.equal(belt.canTie({ kind: 'coins', count: 0 }), false, 'an empty second one: nothing to pour');
    assert.equal(belt.canTie({ ...makeMagicPouch('x'), shop: { price: 750 } }), false, 'not paid for: not tied on');
    assert.equal(belt.tieMagic(makeMagicPouch('y', 20)), false, 'already one on the belt');
    assert.equal(makePurseModel(belt.count, false).children.length, 1, 'one pouch seen on the belt');
    const dropped = belt.takeAll();
    assert.equal(dropped.length, 1, 'at death: one pouch');
    assert.equal(dropped[0].count, 5000);
    assert.equal(dropped[0].kind, 'coins');
    assert.equal(belt.any, false);
    assert.equal(belt.add(10), 10, 'off the belt it takes nothing');
    assert.ok(belt.tieMagic(dropped[0]), 'its own body\'s pouch back on');
    assert.equal(belt.count, 5000);
    const g = { inventory: { hasMagicPouch: () => false } };
    const b2 = new CoinBelt(g);
    b2.takeAll();
    assert.equal(b2.ensure(), true, 'the reborn hero gets a new pouch');
    assert.equal(b2.count, 0, 'empty');
    assert.equal(b2.ensure(), false, 'only one');
});

test('a pouch picked up pours its coins into mine and is gone; a hero has one pouch', async () => {
    const { ItemSystem: Items } = await import('../../src/game/Items.js');
    const { CoinBelt } = await import('../../src/game/CoinBelt.js');
    const held = { right: null, left: null };
    const g = { hud: { setVoice() {} }, items: { held }, weapons: { hands: {} } };
    g.inventory = { slots: [], purse: new CoinBelt(g), coins() { return this.purse.count; }, _render() {}, hasUid: () => false };
    g.inventory.purse.add(30);
    const self = { game: g, held, takeIntoHand() { throw new Error('kept as a thing'); } };
    Items.prototype._gotItem.call(self, { kind: 'coins', uid: 'p1', count: 70 }, 'right');
    Items.prototype._gotItem.call(self, { kind: 'coins', uid: 'p2', count: 5, magic: true }, 'left');
    assert.equal(g.inventory.purse.count, 105, 'both pouches poured into mine');
    assert.equal(held.right, null);
    assert.equal(held.left, null, 'no second pouch in a hand');
});
