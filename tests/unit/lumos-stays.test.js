/** Lumos burns until «стоп»/«Нокс»: a wand lost for a blink (camera) does not put it out; one really gone does. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lumosGone, LUMOS } from '../../src/game/WandMagic.js';

test('a tracking blink does not put Lumos out', () => {
    let t = 0;
    for (let i = 0; i < 60; i++) { const r = lumosGone(t, false, 0.016); assert.equal(r.out, false); t = r.t; } // ~1 s without the wand
    assert.equal(lumosGone(t, true, 0.016).t, 0); // the wand is back: the count starts over
});

test('a wand really gone puts it out after the grace', () => {
    let t = 0, out = false;
    for (let i = 0; i < 200 && !out; i++) { const r = lumosGone(t, false, 0.016); t = r.t; out = r.out; }
    assert.ok(out);
    assert.ok(LUMOS.LOSS_GRACE >= 1 && LUMOS.LOSS_GRACE <= 2);
});
