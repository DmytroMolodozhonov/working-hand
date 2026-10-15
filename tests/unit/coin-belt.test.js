// The coin pouches on the belt's right side (CoinBelt.js): how coins fill the pouches, and
// the hand put on the side (PoseInterpreter.purseHand) — never a hanging or lowered arm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { purseBags, purseAdd, pouchSize, BELT_MAX } from '../../src/game/CoinBelt.js';
import { purseHand } from '../../src/input/PoseInterpreter.js';
import { frame } from '../e2e/poses.mjs';

test('pouches: up to 100 coins each, then a second and a third beside it (300 at most)', () => {
    assert.deepEqual(purseBags(0), []);
    assert.deepEqual(purseBags(37), [37]);
    assert.deepEqual(purseBags(100), [100]);
    assert.deepEqual(purseBags(101), [100, 1]);
    assert.deepEqual(purseBags(250), [100, 100, 50]);
    assert.deepEqual(purseBags(999), [100, 100, 100]);
    assert.deepEqual(purseAdd(0, 40), { have: 40, rest: 0 });
    assert.deepEqual(purseAdd(280, 40), { have: BELT_MAX, rest: 20 }); // (what does not fit stays in the hand)
    assert.ok(pouchSize(100) > pouchSize(50) && pouchSize(50) > pouchSize(5), 'the pouch grows with its coins');
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

test('the magic pouch: coins without end, small outside; on the belt it takes the coins in, drops whole', async () => {
    const { CoinBelt, makeMagicPouch, makePurseModel } = await import('../../src/game/CoinBelt.js');
    assert.deepEqual(purseBags(5000, true), [5000], 'one pouch, all the coins in it');
    assert.deepEqual(purseAdd(280, 10000, true), { have: 10280, rest: 0 }, 'no 300 limit');
    assert.ok(pouchSize(1e6, true) < 0.63 && pouchSize(1e6, true) > pouchSize(10, true), 'grows a little and stops');
    const belt = new CoinBelt({});
    belt.add(150); // (plain pouches on the belt)
    assert.equal(belt.canTie(makeMagicPouch('m', 20)), true);
    assert.ok(belt.tieMagic(makeMagicPouch('m', 20)));
    assert.equal(belt.count, 170, 'the coins on the belt went into it');
    assert.equal(belt.add(5000), 0, 'everything fits');
    assert.equal(belt.canTie({ kind: 'coins', count: 100 }), true, 'plain pouches are emptied into it');
    assert.equal(belt.canTie({ ...makeMagicPouch('x'), shop: { price: 750 } }), false, 'not paid for: not tied on');
    assert.equal(makePurseModel(belt.count, false, true).children.length, 1, 'one pouch seen on the belt');
    const dropped = belt.takeAll();
    assert.deepEqual(dropped, [{ kind: 'coins', uid: 'm', count: 5170, magic: true }], 'at death: the magic pouch whole');
    assert.equal(belt.any, false);
});
