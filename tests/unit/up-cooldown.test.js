// «Up» («Stand Up»): NO wait between casts (the author 08.11: «убрать ограничения на секунды… не должно быть такого ограничения»).
// The same phrase heard twice (said → over) is still the same cast (AGAIN_MS), that is not a wait.
import test from 'node:test';
import assert from 'node:assert/strict';
import { upCooldown, UP } from '../../src/game/UpSpell.js';

test('«Up»: no wait after a cast', () => {
    assert.equal(UP.COOLDOWN_MS, 0);
    assert.equal(upCooldown(1000, null, null), null);
    assert.equal(upCooldown(1001, 1000, null), null);
    assert.equal(upCooldown(1000 + 3000, 1000, null), null);
});
