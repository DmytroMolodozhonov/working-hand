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

test('the hand put on the right side of the belt is seen; hanging, lowered, raised arms, the pocket, the wand\'s belt — not', () => {
    const lm = (f) => frame(f).poseLandmarks;
    assert.equal(purseHand(lm({ arms: 'hang', purse: 'right', rightCurl: 0.9 }), 'right'), true);
    for (const f of [{ arms: 'hang' }, { arms: 'down' }, { arms: 'forward' }, { arms: 'up' }, { arms: 'hang', pocket: 'right' }, { arms: 'hang', belt: 'right' }, { raise: 30 }, { raise: 70 }]) {
        assert.notEqual(purseHand(lm(f), 'right'), true, JSON.stringify(f));
    }
});
