// The forest's and the shore's small voices (NatureSounds.js, NatureAmbience.js): every sound is made, sane, and can be chosen; day and night differ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { synthNature, NATURE_SOUNDS, FOREST_SOUNDS, SHORE_SOUNDS } from '../../src/audio/NatureSounds.js';
import { pick, ALL_PICKED, AMBIENCE } from '../../src/game/NatureAmbience.js';

const ctx = { sampleRate: 22050, createBuffer: (c, n) => { const a = new Float32Array(n); return { getChannelData: () => a, length: n }; } };

test('every voice is made: finite, not silent, not clipping, not long', () => {
    assert.equal(NATURE_SOUNDS.length, FOREST_SOUNDS.length + SHORE_SOUNDS.length);
    for (const k of NATURE_SOUNDS) {
        const d = synthNature(ctx, k).getChannelData(0);
        let pk = 0, e = 0;
        for (const x of d) { assert.ok(Number.isFinite(x), k); pk = Math.max(pk, Math.abs(x)); e += x * x; }
        assert.ok(pk > 0.5 && pk <= 0.9, k + ' peak ' + pk);
        assert.ok(Math.sqrt(e / d.length) > 0.02, k + ' is not silent');
        assert.ok(d.length / 22050 < 5, k + ' is short');
        assert.ok(Math.abs(d[0]) < 1e-6, 'starts soft'); assert.ok(Math.abs(d[d.length - 1]) < 1e-3, 'ends soft');
    }
});

test('the ambience can choose every sound; birds by day, owl and crickets by night; shore and forest differ', () => {
    const all = ALL_PICKED();
    for (const k of NATURE_SOUNDS) assert.ok(all.has(k), k + ' can be picked');
    const day = new Set(), night = new Set();
    for (let i = 0; i < 300; i++) { day.add(pick('forest', false, i / 300).kind); night.add(pick('forest', true, i / 300).kind); }
    assert.ok(day.has('thrush') && day.has('woodpecker') && day.has('cuckoo'));
    assert.ok(!night.has('thrush') && !night.has('cuckoo') && !night.has('woodpecker'), 'no day birds at night');
    assert.ok(night.has('owl') && night.has('cricket'));
    const sh = new Set(); for (let i = 0; i < 300; i++) sh.add(pick('shore', false, i / 300).kind);
    assert.ok(sh.has('duck') && sh.has('kingfisher') && sh.has('plop') && !sh.has('thrush'));
    assert.ok(pick('forest', false, 0.999).kind && pick('forest', false, 0).kind, 'the ends of the range are fine');
    assert.ok(AMBIENCE.MIN_GAP >= 2);
});
