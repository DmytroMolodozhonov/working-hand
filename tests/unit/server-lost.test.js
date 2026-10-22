import test from 'node:test';
import assert from 'node:assert/strict';
import { lostAfter, shouldReload } from '../../src/ui/ServerLost.js';

test('the window says «the game closed» only when the program is really gone — not while it is busy (a villager answering)', () => {
    assert.ok(!lostAfter(0, 8000), 'checks that only waited (requests queued behind a talk): not lost');
    assert.ok(!lostAfter(1, 3000));
    assert.ok(lostAfter(2, 0), 'refused twice: gone');
    assert.ok(lostAfter(0, 20000), 'no answer at all for 20 s: gone');
    assert.ok(!shouldReload('a1', 'a1'), 'the same program back: the game goes on, no reload');
    assert.ok(shouldReload('a1', 'b2'), 'started again: reload');
    assert.ok(shouldReload('', 'b2'));
});
