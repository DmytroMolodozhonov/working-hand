// A bad number in a sound ramp never stops the game (the author's critical error during «Авада Кедавра»: linearRampToValueAtTime non-finite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { installSafeAudio } from '../../src/audio/SafeAudio.js';

class FakeParam {
    constructor() { this._v = 0.5; this.calls = []; this.context = { currentTime: 3 }; }
    get value() { return this._v; }
    set value(v) { if (!Number.isFinite(v)) throw new TypeError('non-finite'); this._v = v; }
    linearRampToValueAtTime(v, t) { if (!Number.isFinite(v) || !Number.isFinite(t)) throw new TypeError('non-finite'); this.calls.push(['lin', v, t]); }
    setTargetAtTime(v, t, c) { if (!Number.isFinite(v) || !Number.isFinite(t) || !Number.isFinite(c)) throw new TypeError('non-finite'); this.calls.push(['tgt', v, t, c]); }
}

test('non-finite values and times are replaced, never thrown', () => {
    const origWarn = console.warn; console.warn = () => {};
    try {
        assert.equal(installSafeAudio({ AudioParam: FakeParam }), true);
        const p = new FakeParam();
        p.linearRampToValueAtTime(NaN, 2);
        p.linearRampToValueAtTime(0.3, Infinity);
        p.setTargetAtTime(undefined / 100, 1, NaN);
        p.value = NaN;
        assert.deepEqual(p.calls, [['lin', 0.5, 2], ['lin', 0.3, 3], ['tgt', 0.5, 1, 0.05]]);
        assert.equal(p.value, 0.5);
        p.linearRampToValueAtTime(0.2, 4); // (good numbers pass as they are)
        assert.deepEqual(p.calls.at(-1), ['lin', 0.2, 4]);
    } finally { console.warn = origWarn; }
});
