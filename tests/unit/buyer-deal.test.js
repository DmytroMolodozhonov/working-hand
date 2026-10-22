// The pawnshop / the shady buyer: one sum per thing in a deal, the off hand over his counter, the plaque, the pouches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { DealPrices, DEAL_MS, dealKey, offSide, overCounter, clampToCounter, signSpec, COUNTER_H } from '../../src/game/BuyerDeal.js';
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

test('deal: a sum above 500 is several pouches', () => {
    const spawned = [];
    const t = Object.create(CastleTalk.prototype);
    t.game = { items: { loose: new Map([['u', {}]]), pickUp() {}, spawnLoose: (it) => spawned.push(it) }, weapons: { byId: new Map() } };
    t.sellNow('u', null, 1234, { x: 0, y: 0, z: 0 });
    assert.deepEqual(spawned.map((c) => c.count), [500, 500, 234]);
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
    const p = clampToCounter(stall, new Vector3(2.95, 5, 11.9));
    assert.ok(p.x <= 3 && p.x >= -3 && p.z >= 12 && p.z <= 14);
});

test('plaque: 3–4 m up, 2 × 1 m (the shady one smaller), over the counter facing the buyer', () => {
    const s = signSpec(stall), ground = stall.counter.top - COUNTER_H;
    assert.deepEqual([s.w, s.h], [2, 1]);
    const box = new Box3(new Vector3(s.x - s.w / 2, s.y - s.h / 2, s.z), new Vector3(s.x + s.w / 2, s.y + s.h / 2, s.z));
    assert.ok(box.min.y - ground >= 3 && box.max.y - ground <= 4, 'between 3 and 4 m above the ground');
    assert.ok(s.z >= stall.counter.z0 && s.z <= stall.counter.z1, 'over the counter, not sticking out');
    assert.ok(Math.abs(s.yaw) < 1e-9, 'its front looks toward +z, where the buyer stands');
    const f = signSpec({ fence: true, front: { x: -9, z: 0 }, counter: { x0: 0, x1: 2, z0: -1.5, z1: 1.5, top: 4 } });
    assert.ok(f.w < s.w && f.w >= 1.5);
    assert.ok(Math.abs(Math.abs(f.yaw) - Math.PI / 2) < 1e-9);
    assert.equal(signSpec({ front: { x: 0, z: 0 }, counter: stall.counter }), null, 'ordinary sellers have none');
});
