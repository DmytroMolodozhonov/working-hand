// «Ходьба назад» (the author 05.11: «сильно наклонял спину, но никак не уходит»): the lean back is seen by the shoulders narrowing in
// the frame too (sitting at the monitor the hips are unseen — the depth alone was null and nothing happened); a clear lean walks
// backwards by itself; standing upright — nothing, and the upright is learned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { _leanBack } from '../../src/game/Game.js';

test('no hips in the frame: the shoulders narrowing (leaning back) are enough; a strong lean — 2 (walks by itself)', () => {
    const st = {};
    for (let i = 0; i < 60; i++) assert.equal(_leanBack(st, { depth: null, sw: 0.30 }, 1 / 30), 0, 'upright');
    assert.equal(_leanBack(st, { depth: null, sw: 0.275 }, 1 / 30), 1, 'leaning back a little');
    assert.equal(_leanBack(st, { depth: null, sw: 0.24 }, 1 / 30), 2, 'strongly');
    assert.equal(_leanBack(st, { depth: null, sw: 0.30 }, 1 / 30), 0, 'upright again');
});

test('with the hips: the depth works as before; no torso — nothing', () => {
    const st = {};
    for (let i = 0; i < 30; i++) _leanBack(st, { depth: 0, sw: 0.3 }, 1 / 30);
    assert.ok(_leanBack(st, { depth: 0.09, sw: 0.3 }, 1 / 30) >= 1);
    assert.equal(_leanBack({}, null, 1 / 30), 0);
});

test('the body turned (the shoulders narrow because one is nearer the camera) — not a lean back', () => {
    const st = {};
    for (let i = 0; i < 60; i++) _leanBack(st, { depth: null, sw: 0.30, twist: 0 }, 1 / 30);
    assert.equal(_leanBack(st, { depth: null, sw: 0.24, twist: 0.6 }, 1 / 30), 0);
});
