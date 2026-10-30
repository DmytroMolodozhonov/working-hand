// «Дай» and the other duel charges: how far they reach, and the hint when the target is beyond it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyRange as duelRange, DUEL } from '../../src/game/Duel.js';
import { refusal } from '../../src/game/Hints.js';

test('«Дай» reaches farther than the rest', () => {
    assert.ok(duelRange('Die') > DUEL.RANGE);
    assert.equal(duelRange('Stupefy'), DUEL.RANGE);
});

test('too-far and no-target hints', () => {
    const t = refusal('tooFar', { name: 'Дай', dist: 64, range: 50 });
    assert.match(t, /Слишком далеко/);
    assert.match(t, /64/);
    assert.match(t, /50/);
    assert.match(refusal('noTarget', {}), /Нет цели/);
});
