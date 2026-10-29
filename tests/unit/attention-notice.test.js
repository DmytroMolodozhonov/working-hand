import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mayNotice, WaveDetector, ATT } from '../../src/game/Attention.js';

describe('strangers do not notice a plain look (the author: only when I call, wave or come up)', () => {
    const base = { known: false, calledAt: -1e9, now: 100000, d: 10, stillClose: false };
    it('a stranger 10 m away, only looked at: does not notice', () => assert.equal(mayNotice(base), false));
    it('a known one (friend, subject, king, foe) notices as before', () => assert.equal(mayNotice({ ...base, known: true }), true));
    it('after I called / waved a moment ago he notices; later not', () => {
        assert.equal(mayNotice({ ...base, calledAt: 100000 - 2000 }), true);
        assert.equal(mayNotice({ ...base, calledAt: 100000 - (ATT.ADDRESS + 1) * 1000 }), false);
    });
    it('a call is not heard beyond a shout', () => assert.equal(mayNotice({ ...base, calledAt: 99000, d: ATT.SHOUT + 5 }), false));
    it('came right up and stopped: notices; stopped far off: no', () => {
        assert.equal(mayNotice({ ...base, d: 2, stillClose: true }), true);
        assert.equal(mayNotice({ ...base, d: 8, stillClose: true }), false);
        assert.equal(mayNotice({ ...base, d: 2, stillClose: false }), false);
    });
});

describe('WaveDetector', () => {
    const run = (yaws, dt = 0.1) => { const w = new WaveDetector(); let r = false; yaws.forEach((y, i) => { r = w.step(y, true, i * dt) || r; }); return r; };
    it('a hand waving side to side is a wave', () => {
        const ys = []; for (let i = 0; i < 20; i++) ys.push(Math.sin(i * 0.9) * 0.4);
        assert.equal(run(ys), true);
    });
    it('a hand held steady, or trembling, is not', () => {
        assert.equal(run(new Array(20).fill(0.3)), false);
        const ys = []; for (let i = 0; i < 20; i++) ys.push(0.3 + (i % 2) * 0.02);
        assert.equal(run(ys), false);
    });
    it('one sweep to the side is not a wave', () => {
        const ys = []; for (let i = 0; i < 20; i++) ys.push(i * 0.05);
        assert.equal(run(ys), false);
    });
    it('hand lowered resets', () => {
        const w = new WaveDetector();
        for (let i = 0; i < 20; i++) w.step(Math.sin(i * 0.9) * 0.4, true, i * 0.1);
        assert.equal(w.step(0, false, 3), false);
    });
});
