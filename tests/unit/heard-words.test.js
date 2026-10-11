import test from 'node:test';
import assert from 'node:assert/strict';
import { lastWords } from '../../src/ui/Hud.js';

test('heard words: only the newest few words are kept', () => {
    assert.equal(lastWords('привет как дела у тебя сегодня друг'), 'у тебя сегодня друг');
    assert.equal(lastWords('  экспеллиармус  '), 'экспеллиармус');
    assert.equal(lastWords('бомбардо максима'), 'бомбардо максима');
    assert.equal(lastWords(''), '');
    assert.equal(lastWords(null), '');
    assert.equal(lastWords('a b c d e f', 2), 'e f');
});
