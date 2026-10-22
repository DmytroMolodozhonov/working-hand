// Every market stall sells its own trade's goods (no two neighbours alike); the buyer's body stays
// a little before a counter; a thing just put down is not taken back by the same fingers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRADES, stallTrades, counterZone } from '../../src/game/MarketGoods.js';
import { regrabFree, REGRAB } from '../../src/game/Items.js';
import { namedGood } from '../../src/game/CastleTalk.js';

test('market: the stalls of a castle all have different trades, the same in every game', () => {
    for (const id of ['c_0_0', 'c_3_-2', 'c_17_5', 'x']) {
        const t = stallTrades(id, 8);
        assert.equal(new Set(t.map((x) => x.id)).size, 8, `${id}: 8 stalls, 8 trades`);
        assert.deepEqual(stallTrades(id, 8).map((x) => x.id), t.map((x) => x.id), 'fixed by the castle');
        // (the goods of two stalls hardly ever meet: only single kinds may, e.g. bread … nowhere twice)
        const kinds = t.map((x) => new Set(x.goods.map((g) => g.kind)));
        for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
            const both = [...kinds[i]].filter((k) => kinds[j].has(k));
            assert.ok(both.length <= 1, `${t[i].id} / ${t[j].id}: ${both}`);
        }
    }
    assert.ok(TRADES.every((t) => t.goods.length === 3));
});

test('market: the body stays before the counter on the buyer\'s side only', () => {
    // a counter long in z (2 × 5 blocks), the buyer at −x
    const st = { counter: { x0: 8, x1: 9, z0: 0, z1: 4, top: 1.5 }, front: { x: 5, z: 2 } };
    const z = counterZone(st, 0.55);
    assert.equal(z.minX, 7.5 - 0.55);
    assert.equal(z.maxX, 9.5, 'the merchant\'s side is free');
    assert.deepEqual([z.minZ, z.maxZ], [-0.5, 4.5]);
});

test('market: a good named by the buyer — the best match; a tie is never guessed', () => {
    const goods = [
        { item: { kind: 'steak' }, price: 6 }, { item: { kind: 'meat' }, price: 3 },
        { item: { kind: 'apple' }, price: 30 }, { item: { kind: 'redApple' }, price: 2 },
    ];
    assert.equal(namedGood('дай сырое мясо', goods).item.kind, 'meat');
    assert.equal(namedGood('хочу мясо', goods).item.kind, 'steak');
    assert.equal(namedGood('золотое яблоко', goods).item.kind, 'apple');
    assert.equal(namedGood('яблоко', goods), null, 'a plain apple or the golden one: the merchant asks, never the cheaper by himself');
    assert.equal(namedGood('меч', goods), null);
});

test('a thing let go of is taken back only after the hand moved off it, or later', () => {
    const e = { at: 0, away: false };
    assert.equal(regrabFree(e, 0.05, 300), false, 'the same moment\'s fingers: no');
    assert.equal(regrabFree(e, 0.1, 1500), false);
    assert.equal(regrabFree(e, REGRAB.AWAY + 0.1, 1600), true, 'the hand went off it');
    assert.equal(regrabFree(e, 0.05, 1700), true, '… and came back: a new grip takes it');
    assert.equal(regrabFree({ at: 0, away: false }, 0.05, REGRAB.MS + 1), true, 'or after a while');
});
