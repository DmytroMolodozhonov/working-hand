// The tune of «Create a House» (src/audio/HouseTheme.js): as long as the magic (and the last chord's
// ring), growing from a quiet start to a full end, the big chord exactly when the house is done,
// never clipping; a broken magic ends on a short sour chord.
import test from 'node:test';
import assert from 'node:assert/strict';
import { houseTheme, houseThemeBreak, THEME_TAIL, hz } from '../../src/audio/HouseTheme.js';

const SR = 8000;
const rms = (a, t0, t1) => { let s = 0; const i0 = Math.floor(t0 * SR), i1 = Math.floor(t1 * SR); for (let i = i0; i < i1; i++) s += a[i] * a[i]; return Math.sqrt(s / (i1 - i0)); };

test('the house tune: the magic\'s length, growing, the chord at the end, no clipping', () => {
    assert.ok(Math.abs(hz('A4') - 440) < 1e-9 && Math.abs(hz('C5') - 523.25) < 0.01);
    for (const [sec, level] of [[10, 1], [10, 5], [14, 3]]) {
        const a = houseTheme(SR, sec, level);
        assert.equal(a.length, Math.ceil(SR * (sec + THEME_TAIL)));
        let peak = 0;
        for (const v of a) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
        assert.ok(peak <= 0.86 && peak > 0.5, `peak ${peak}`);
        const bar = sec / 4;
        assert.ok(rms(a, bar * 3, sec) > rms(a, 0, bar), `richer at the end (level ${level})`);
        // the last chord strikes exactly as the house is done: much louder just after than just before
        assert.ok(rms(a, sec, sec + 0.25) > 1.3 * rms(a, sec - 0.6, sec - 0.35), `the chord at ${sec} s`);
        assert.ok(rms(a, a.length / SR - 0.1, a.length / SR) < 0.02, 'it rings out to nothing');
    }
    assert.ok(rms(houseTheme(SR, 10, 5), 0, 2.5) > rms(houseTheme(SR, 10, 1), 0, 2.5), 'a higher level: grander from the start');
});

test('a broken magic: a short sour chord, dying away', () => {
    const b = houseThemeBreak(SR);
    assert.ok(b.length < SR * 2);
    assert.ok(rms(b, 0.02, 0.3) > 4 * rms(b, 1.2, 1.4));
});
