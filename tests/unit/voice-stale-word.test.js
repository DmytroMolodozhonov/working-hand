/**
 * «Инферно … стоп» in one open phrase (the author's journal, 19.11): «стоп» cast, then «инферно» found earlier in the same sound and cast AGAIN.
 * A word that ended before the word already cast is old (NativeVoice.staleWord) — the spells of a phrase go in the order they were said.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { staleWord, STALE_MS } from '../../src/input/NativeVoice.js';

test('a word that ended earlier than the cast one is stale; a later one is not', () => {
    const seg = { fired: 'Stand', firedEnd: 10_000 }; // «стоп» ended at t = 10 s
    const d = { t1: 10_600 };
    assert.equal(staleWord(seg, { tail: 2000 }, d), true, '«инферно» ended at 8.6 s: old');
    assert.equal(staleWord(seg, { tail: 300 }, d), false, 'a word ending at 10.3 s: after «стоп» — new');
    assert.equal(staleWord(seg, { tail: 600 + STALE_MS - 1 }, d), false, 'within a step: the same word read again, not stale');
});

test('nothing cast yet / no times: never stale (the usual first look)', () => {
    assert.equal(staleWord({}, { tail: 500 }, { t1: 1000 }), false);
    assert.equal(staleWord({ firedEnd: 5 }, { tail: NaN }, { t1: 1000 }), false);
    assert.equal(staleWord(null, { tail: 1 }, { t1: 1 }), false);
});
