// «Up» once in 7 s (the author), quiet «Подождите немного» at most once in 3 s, reset on death.
import test from 'node:test';
import assert from 'node:assert/strict';
import { upCooldown, UP, UpSpell } from '../../src/game/UpSpell.js';

test('«Up»: free at first, 7 s of wait after a cast, then free again', () => {
    assert.equal(UP.COOLDOWN_MS, 7000);
    assert.equal(upCooldown(1000, null, null), null);
    assert.equal(upCooldown(1000 + 6999, 1000, null), 'wait');
    assert.equal(upCooldown(1000 + 7000, 1000, null), null);
});

test('«Up»: the hint comes at most once in 3 s', () => {
    assert.equal(upCooldown(3000, 1000, null), 'wait');
    assert.equal(upCooldown(4000, 1000, 3000), 'wait-quiet');
    assert.equal(upCooldown(6100, 1000, 3000), 'wait');
});

test('«Up»: too soon is not cast, not paid, no leap; death clears the wait', () => {
    let paid = 0; const hints = [];
    const g = { character: {}, knock: {}, hud: { setVoice: (t) => hints.push(t) }, combat: { check: () => null, pay: () => paid++ } };
    const up = new UpSpell(g);
    up.castAt = performance.now() - 4000; // (cast 4 s ago, past the same-phrase window)
    assert.equal(up.cast(true), null);
    assert.equal(up.cast(true), null); // (again at once: quiet)
    assert.equal(paid, 0);
    assert.equal(hints.length, 1);
    assert.match(hints[0], /Подождите/);
    assert.equal(up.leap, null);
    up.reset();
    assert.equal(upCooldown(performance.now(), up.castAt, up.hintAt), null);
});
