// Частные условия голоса (журнал друга): «стоп» при удерживаемом, громкое короткое слово с видимыми губами.
import test from 'node:test';
import assert from 'node:assert/strict';
import { soundTrust } from '../../src/audio/SpellPhrase.js';

test('«стоп» with something held (a shield, a flame, flight) is taken at a thin fit; with nothing held — as before', () => {
    const h = { spell: 'Stand', canonical: 'стоп', written: 'сто', fit: 0.2, len: 4, lips: null };
    assert.ok(soundTrust({ ...h, holding: false }), 'nothing held: still careful');
    assert.equal(soundTrust({ ...h, holding: true }), null);
    assert.equal(soundTrust({ ...h, holding: true, fit: 0.9, written: 'ксссс' }), null);
});

test('a short loud word, the mouth seen moving, a clear fit: mine even when the written letters are off («акцио» → «аксо»)', () => {
    const h = { spell: 'Accio', canonical: 'акцио', written: 'аксо', len: 5, lips: true, far: 0 };
    assert.equal(soundTrust({ ...h, fit: 2, snr: 22 }), null);
    assert.ok(soundTrust({ ...h, fit: 2, snr: 8 }), 'quiet: not loud');
    assert.ok(soundTrust({ ...h, fit: 2, snr: 22, lips: null }), 'mouth not seen: as before');
    assert.ok(soundTrust({ ...h, fit: 2, snr: 22, lips: false }), 'mouth still: no');
    assert.ok(soundTrust({ ...h, fit: 1.0, snr: 22 }), 'thin fit: no');
    assert.ok(soundTrust({ spell: 'Frozen', canonical: 'фрозен', written: 'просто', len: 6, fit: 2, snr: 25, lips: true }), 'a costly spell keeps its checks');
});
