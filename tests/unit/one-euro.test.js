import test from 'node:test';
import assert from 'node:assert/strict';
import { OneEuro } from '../../src/input/PoseInterpreter.js';

test('head turn filter: jitter of a still head is smoothed away, a real turn passes quickly', () => {
    // a still head looking down a little: ±0.04 rad of noise at 20 pictures a second
    const f = new OneEuro(0.2, 0.5);
    let t = 0, worst = 0;
    const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5; })();
    for (let i = 0; i < 200; i++) {
        t += 0.05;
        const v = f.filter(0.3 + rnd() * 0.08, t);
        if (i > 20) worst = Math.max(worst, Math.abs(v - 0.3));
    }
    assert.ok(worst < 0.015, `jitter ${worst.toFixed(3)} rad (raw ±0.04)`);
    // a real turn of 0.6 rad: most of it within 0.3 s
    let v = 0;
    for (let i = 0; i < 6; i++) { t += 0.05; v = f.filter(0.9, t); }
    assert.ok(v > 0.8, `followed the turn to ${v.toFixed(2)} of 0.9`);
});
