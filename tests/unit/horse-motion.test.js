// The horse's motion under a rider: gaits, weight of speed, the drift, the sliding stop, the rear (HorseMotion.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as HM from '../../src/game/HorseMotion.js';

const horse = () => {
    const leg = (front) => ({ rotation: { x: 0 }, userData: { front, lower: { rotation: { x: 0 } } } });
    return { group: { rotation: { y: 0 }, position: { x: 0, y: 0, z: 0 } }, walkT: 0, lie: 0, model: { rotation: { x: 0, z: 0 }, position: { x: 0, y: 0, z: 0 }, scale: { y: 1 }, userData: { legs: [leg(1), leg(1), leg(0), leg(0)], neck: { rotation: { x: 0 } }, head: { rotation: { x: 0, y: 0 } }, tail: { rotation: { x: 0, z: 0 } } } } };
};
const run = (a, aim, want, sec, dt = 1 / 60) => { let last; for (let t = 0; t < sec; t += dt) { last = HM.drive(a, aim, want, dt); a.walkT += last.speed * dt * 1.6; HM.pose(a, dt, null); } return last; };

test('gaits by speed', () => {
    assert.equal(HM.gaitOf(0), 'stand'); assert.equal(HM.gaitOf(2), 'walk'); assert.equal(HM.gaitOf(4), 'trot'); assert.equal(HM.gaitOf(8), 'canter'); assert.equal(HM.gaitOf(11), 'gallop');
});

test('speed has weight: no jump to a gallop, no stop in a frame', () => {
    const a = horse();
    const d = HM.drive(a, 0, 10, 1 / 60);
    assert.ok(d.speed < 0.2, 'the first frame is slow');
    run(a, 0, 10, 3);
    assert.ok(HM.hmOf(a).s > 9, 'in three seconds it gallops');
});

test('a hard turn at a gallop drifts: the line of travel lags the body', () => {
    const a = horse(); run(a, 0, 11, 4);
    let slip = 0;
    for (let t = 0; t < 0.6; t += 1 / 60) { HM.drive(a, 2.0, 11, 1 / 60); slip = Math.max(slip, Math.abs(HM.hmOf(a).slip)); HM.pose(a, 1 / 60, null); }
    assert.ok(slip > 0.3, `slip ${slip}`);
    assert.ok(Math.abs(a.model.rotation.z) > 0.03, 'leans into the turn');
});

test('a hard brake from a gallop slides, the legs braced; it may rear and comes down level', () => {
    const a = horse(); run(a, 0, 11, 4);
    let skid = false, rear = false;
    for (let t = 0; t < 4; t += 1 / 60) { HM.drive(a, 0, 0, 1 / 60); const H = HM.hmOf(a); skid ||= H.skid > 0; rear ||= H.rear > 0; HM.pose(a, 1 / 60, null); }
    assert.ok(skid, 'the slide');
    HM.rearUp(a, 1); run(a, 0, 0, 3);
    assert.ok(Math.abs(a.model.rotation.x) < 0.1 && Math.abs(a.model.position.y) < 0.05, 'level again after the rear');
    void rear;
});

test('the rear lifts the nose, keeps the hind hooves on the ground; the fore legs fold', () => {
    const a = horse(); assert.ok(HM.rearUp(a, 1));
    let max = 0, foreFold = 0;
    for (let t = 0; t < 0.55; t += 1 / 60) { HM.drive(a, 0, 5, 1 / 60); HM.pose(a, 1 / 60, null); max = Math.max(max, a.model.rotation.x); foreFold = Math.min(foreFold, a.model.userData.legs[0].userData.lower.rotation.x); }
    assert.ok(max > 0.4, `nose up ${max}`); assert.ok(foreFold < -1, 'fore knee folds');
    assert.equal(HM.hmOf(a).s, 0, 'a rearing horse does not run');
});

test('a wall stops it dead; a dead or flying horse is not reared; no NaN in the pose; settle makes it level', () => {
    const a = horse(); run(a, 0, 10, 3); HM.blocked(a);
    assert.equal(HM.hmOf(a).s, 0);
    assert.equal(HM.rearUp({ ...horse(), dead: true }), false);
    const b = horse(); HM.drive(b, NaN, NaN, NaN); HM.pose(b, NaN, null);
    for (const v of [b.group.rotation.y, b.model.rotation.x, b.model.rotation.z, b.model.position.y]) assert.ok(Number.isFinite(v));
    run(a, 0, 10, 1); HM.settle(a);
    assert.equal(a.model.rotation.z, 0); assert.equal(a.gallop, 0);
});
