import test from 'node:test';
import assert from 'node:assert/strict';
import { sharpJerk } from '../../src/game/Duel.js';

/** The hand's path: `fn(t)` → [x, y, z] sampled at `hz` for `secs`. */
/** Checked every picture, as the game does: did it see a jerk at any moment? */
const ever = (list) => list.some((_, i) => sharpJerk(list.slice(0, i + 1)));
const path = (fn, secs = 0.4, hz = 30) => Array.from({ length: Math.round(secs * hz) + 1 }, (_, i) => { const t = i / hz; const [x, y, z] = fn(t); return { t, x, y, z }; });

test('duel: a small move of the hand (≈20 cm real) is not a jerk', () => {
    assert.equal(ever(path((t) => [Math.min(1, t / 0.3) * 0.65, 0, 0])), false);
});

test('duel: the camera\'s jitter is not a jerk', () => {
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 0.3;
    assert.equal(ever(path(() => [r(), r(), r()])), false);
});

test('duel: one picture where the camera lost the hand (a jump) is not a jerk', () => {
    assert.equal(ever(path((t) => [t > 0.2 ? 1.8 : 0, 0, 0])), false);
});

test('duel: a real sharp jerk (≈50 cm in a quarter second, one way) is', () => {
    assert.equal(ever(path((t) => [Math.min(1, t / 0.2) * 1.7, Math.min(1, t / 0.2) * 0.4, 0])), true);
});

test('duel: a slow wide move (1.5 m over a second) is not', () => {
    assert.equal(ever(path((t) => [t * 1.5, 0, 0], 1.0)), false);
});

import { markSlots, clashLead, DUEL_MARK } from '../../src/game/Duel.js';

test('duel marker: two wizards never share a colour; the lead and the push read from the meeting point', () => {
    for (let a = 0; a < DUEL_MARK.length; a++) for (let b = 0; b < DUEL_MARK.length; b++) { const [x, y] = markSlots(a, b); assert.notEqual(x, y); }
    assert.deepEqual(clashLead(0.5, 0), { lead: 0, push: 0 });
    assert.equal(clashLead(0.9, 0.12).lead > 0.7, true, 'the point near B: A is winning');
    assert.equal(clashLead(0.2, -0.2).push, -1, 'B pushes hard');
});
