// Phoenixes (src/game/Phoenixes.js): what counts as a wound (one roll per wound, never per frame),
// what scares it, when it turns on an attacker, and that it is half a hero tall.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHOENIX, woundEvent, threatOf, rageRoll, phoenixModel, posePhoenix } from '../../src/game/Phoenixes.js';

test('a wound is an event: a burst of blows or a long bleed is one, a cut limb or new bleeding is one more', () => {
    const st = {};
    const s = (hp, bleed = 0, lost = 0) => ({ hp, max: 100, bleed, lost });
    assert.equal(woundEvent(st, s(100), 0), null, 'the first look: nothing');
    assert.equal(woundEvent(st, s(90), 1000), 'hit', 'a blow');
    assert.equal(woundEvent(st, s(85), 1500), null, 'blows in a row: the same wound');
    assert.equal(woundEvent(st, s(84), 2500), null);
    assert.equal(woundEvent(st, s(84, 1), 2600), 'bleed', 'bleeding began');
    for (let t = 3600, hp = 83; t < 12000; t += 1000, hp--) assert.equal(woundEvent(st, s(hp, 1), t), null, 'the bleed drips on: no new roll');
    assert.equal(woundEvent(st, s(70, 1, 1), 12500), 'limb', 'an arm cut off');
    assert.equal(woundEvent(st, s(70, 1, 1), 30000), null, 'nothing new');
    assert.equal(woundEvent(st, s(60, 1, 1), 30000 + PHOENIX.WOUND_GAP * 1000 + 1), 'hit', 'a new blow after a quiet while');
    // whole again: no roll for HP going up
    const st2 = {};
    woundEvent(st2, s(50), 0);
    assert.equal(woundEvent(st2, s(100), 5000), null);
    assert.equal(PHOENIX.CALL_CHANCE, 0.09, 'the author: 9%');
});

test('calm or a threat: a big move, a fast hand (a swing), a hand held raised', () => {
    assert.equal(threatOf({ body: 0.3, hand: 1, raisedT: 0 }), false);
    assert.equal(threatOf({ body: 3, hand: 1, raisedT: 0 }), true, 'walking at it');
    assert.equal(threatOf({ body: 0, hand: 8, raisedT: 0 }), true, 'a swing');
    assert.equal(threatOf({ body: 0, hand: 1, raisedT: 0.2 }), false, 'a hand lifted for a moment');
    assert.equal(threatOf({ body: 0, hand: 1, raisedT: 0.6 }), true, 'a hand held raised to cast');
});

test('it turns on an attacker only after several attacks in a short time, and only by chance', () => {
    const now = 100000;
    assert.equal(rageRoll([now - 1000, now - 500], now, () => 0), false, 'two attacks: it flies off');
    assert.equal(rageRoll([now - 2000, now - 1000, now], now, () => 0), true, 'the third: it may');
    assert.equal(rageRoll([now - 2000, now - 1000, now], now, () => 0.99), false, '…by chance');
    assert.equal(rageRoll([now - 90000, now - 80000, now], now, () => 0), false, 'old attacks are forgotten');
});

test('half a hero tall (the hero ~4.8 m), wings longer than the body, a long tail; it stands on its feet', () => {
    const m = phoenixModel();
    posePhoenix(m, { mode: 'stand' }, 1);
    posePhoenix(m, { mode: 'stand' }, 1);
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m);
    assert.ok(box.max.y > 2.1 && box.max.y < 2.9, `height ${box.max.y.toFixed(2)}`);
    assert.ok(box.min.y > -0.35, `the feet on the ground (${box.min.y.toFixed(2)})`);
    posePhoenix(m, { mode: 'glide' }, 1);
    posePhoenix(m, { mode: 'glide' }, 1);
    m.updateMatrixWorld(true);
    const fly = new THREE.Box3().setFromObject(m);
    assert.ok(fly.max.x - fly.min.x > 4, `wings spread (${(fly.max.x - fly.min.x).toFixed(2)} m)`);
    assert.ok(fly.max.z - fly.min.z > 3.5, `the long tail (${(fly.max.z - fly.min.z).toFixed(2)} m)`);
});
