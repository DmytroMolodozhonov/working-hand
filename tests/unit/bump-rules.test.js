import test from 'node:test';
import assert from 'node:assert/strict';
import { blowSpeed, knockOutcome, isApology, strikeLine } from '../../src/game/BumpRules.js';
import { IMPACT } from '../../src/game/Impact.js';

const N = [0, 0, 1]; // the body's surface looks towards +z; a hand coming from there moves in −z
const MIN = IMPACT.TOUCH_V;

test('a villager walking into a still hand is no blow', () => {
    assert.equal(blowSpeed([0, 0, 0], [0, 0, 0], [0, 0, 0], N, MIN), 0);
});

test('a slow palm by the counter is no blow', () => {
    assert.equal(blowSpeed([0, 0, -1], [0, 0, -1], [0, 0, 0], N, MIN), 0);
});

test('a one-frame flick (tracking jitter) is no blow, a real swing is', () => {
    assert.equal(blowSpeed([0, 0, -4], [0, 0, 0], [0, 0, 0], N, MIN), 0);
    assert.equal(blowSpeed([0, 0, -6], [0, 0, -5], [0, 0, 0], N, MIN), 6);
    assert.equal(blowSpeed([0, 0, -90], [0, 0, -90], [0, 0, 0], N, MIN), 0, 'a tracking jump');
});

test('my body walking into somebody carries the hand: not a hand blow', () => {
    assert.equal(blowSpeed([0, 0, -3], [0, 0, -3], [0, 0, -3], N, MIN), 0);
});

test('a first light knock is only told off, a second within 20 s fights, a hard one fights at once', () => {
    assert.equal(knockOutcome({ hard: false, count: 1 }), 'told');
    assert.equal(knockOutcome({ hard: false, count: 2 }), 'fight');
    assert.equal(knockOutcome({ hard: true, count: 1 }), 'fight');
    assert.equal(knockOutcome({ hard: false, count: 2, owner: true }), 'offended');
});

test('sorry is recognised', () => {
    for (const t of ['извините', 'Простите!', 'прошу прощения', 'извини', 'прости', 'сорри', 'ой, извините меня']) assert.ok(isApology(t), t);
    for (const t of ['покажи товары', 'сколько стоит', 'проститутка']) assert.ok(!isApology(t), t);
});

test('the journal line says what, how fast, who and whom', () => {
    const l = strikeLine({ kind: 'punch', part: 'body', speed: 5.234, hand: 'left', who: 'Маг Ион', by: 'me', hard: false });
    assert.match(l, /punch/); assert.match(l, /5\.2 м\/с/); assert.match(l, /Маг Ион/);
});
