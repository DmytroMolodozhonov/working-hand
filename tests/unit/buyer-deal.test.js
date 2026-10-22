// The pawnshop / the shady buyer: one sum per thing in a deal, the off hand over his counter, the plaque, the pouches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { DealPrices, DEAL_MS, dealKey, offSide, overCounter, clampToCounter, signSpec, COUNTER_H, BuyerGate } from '../../src/game/BuyerDeal.js';
import { CastleTalk } from '../../src/game/CastleTalk.js';

test('deal: put → price N; taken back → reset; put again → the same N; «да» → N coins', () => {
    const d = new DealPrices();
    let calls = 0;
    const found = { uid: 'abc' };
    const first = d.price('c1:s7', dealKey(found), () => { calls++; return 37 + calls; }, 1000);
    // taken back and put again: the sum is the same, not made up again
    const again = d.price('c1:s7', dealKey(found), () => { calls++; return 99; }, 5000);
    assert.equal(again, first);
    assert.equal(calls, 1);
    assert.equal(d.peek('c1:s7', 'uabc', 6000), first, 'the speech uses this sum');
    // the sale: pouches with exactly that sum
    const spawned = [];
    const game = { items: { loose: new Map([['abc', {}]]), pickUp() {}, spawnLoose: (it) => spawned.push(it) }, weapons: { byId: new Map() } };
    const t = Object.create(CastleTalk.prototype);
    t.game = game;
    t.sellNow('abc', null, first, { x: 0, y: 2, z: 0 });
    assert.equal(spawned.reduce((n, c) => n + c.count, 0), first);
    d.close('c1:s7', 'uabc');
    assert.equal(d.peek('c1:s7', 'uabc', 6000), null);
});

test('deal: forgotten after ~10 minutes and when the player walks far; weapons keyed by id', () => {
    const d = new DealPrices();
    d.price('s', 'w5', () => 10, 0);
    assert.equal(d.peek('s', 'w5', DEAL_MS - 1), 10);
    assert.equal(d.price('s', 'w5', () => 12, DEAL_MS + 1), 12);
    d.leave('s');
    assert.equal(d.peek('s', 'w5', DEAL_MS + 2), null);
    assert.equal(dealKey({ wid: 5 }), 'w5');
});

test('deal: a big sum is one pouch (it has no limit)', () => {
    const spawned = [];
    const t = Object.create(CastleTalk.prototype);
    t.game = { items: { loose: new Map([['u', {}]]), pickUp() {}, spawnLoose: (it) => spawned.push(it) }, weapons: { byId: new Map() } };
    t.sellNow('u', null, 1234, { x: 0, y: 0, z: 0 });
    assert.deepEqual(spawned.map((c) => c.count), [1234]);
});

test('the off hand: the right-hander puts with the left, the left-hander with the right', () => {
    assert.equal(offSide(false), 'left');
    assert.equal(offSide(true), 'right');
});

const stall = { pawn: true, front: { x: 0, z: 17 }, counter: { x0: -3, x1: 3, z0: 12, z1: 14, top: 4 } };
test('counter: only over it, at its height or higher; a thing lands on it', () => {
    assert.ok(overCounter(stall, { x: 0, y: 5, z: 13 }));
    assert.ok(!overCounter(stall, { x: 0, y: 5, z: 20 }), 'not beside it');
    assert.ok(!overCounter(stall, { x: 0, y: 2, z: 13 }), 'not below it');
    assert.ok(overCounter(stall, { x: 3.4, y: 5, z: 11.6 }), 'the counter reaches half a block past its end blocks\' centres');
    const p = clampToCounter(stall, new Vector3(2.95, 5, 11.9));
    assert.ok(p.x <= 3.5 && p.x >= -3.5 && p.z >= 11.5 && p.z <= 14.5);
    assert.ok(overCounter(stall, p), 'where it is laid is over the counter');
});

test('plaque: low on the counter\'s front, flush, facing the buyer; 2.4 × 0.9 m (the shady one 1.6 × 0.6)', () => {
    const s = signSpec(stall), ground = stall.counter.top - COUNTER_H;
    assert.deepEqual([s.w, s.h], [2.4, 0.9]);
    assert.ok(s.y - s.h / 2 - ground >= 0.4 && s.y + s.h / 2 - ground <= 1.5, 'on the counter\'s front, below the hands and the face');
    assert.ok(s.w <= stall.counter.x1 - stall.counter.x0, 'not wider than the counter');
    assert.ok(Math.abs(s.z - (stall.counter.z1 + 0.5)) <= 0.06, 'flush with the front face (half a block past the end blocks\' centres; +z, where the buyer is)');
    assert.ok(Math.abs(s.yaw) < 1e-9);
    const f = signSpec({ fence: true, front: { x: -9, z: 0 }, counter: { x0: 0, x1: 2, z0: -1.5, z1: 1.5, top: 4 } });
    assert.ok(f.w < s.w && f.w >= 1.5 && Math.abs(f.x - -0.55) < 1e-9);
    assert.ok(Math.abs(Math.abs(f.yaw) - Math.PI / 2) < 1e-9);
    assert.equal(signSpec({ front: { x: 0, z: 0 }, counter: stall.counter }), null, 'ordinary sellers have none');
});

test('letting go over the counter: a half-open pinch, palm any way, held a moment → drops; closed or fast → not', () => {
    const g = new BuyerGate(), base = { tracked: true, reach: 0.7, forward: 0.4, speed: 1, heldMs: 2000 };
    assert.equal(g.update({ now: 0, curl: 0.3, ...base }), false);
    assert.equal(g.update({ now: 200, curl: 0.3, ...base }), true);
    const h = new BuyerGate();
    h.update({ now: 0, curl: 0.3, ...base });
    assert.equal(h.update({ now: 300, curl: 0.7, ...base }), false, 'closed again');
    assert.equal(new BuyerGate().update({ now: 0, curl: 0.1, ...base, heldMs: 100 }), false, 'just taken');
    assert.equal(new BuyerGate().update({ now: 0, curl: 0.1, ...base, tracked: false }), false, 'a lost hand never lets go');
});
