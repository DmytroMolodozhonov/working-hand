// The weather's rain is 4 times rarer than it was (the author: «дождь идёт слишком часто»), a rain as long as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER } from '../../src/fx/Storm.js';

const OLD = { CHECK: 300, CHANCE: 0.17, MIN: 120, SPAN: 60 }; // (Gear._updateWeather before)
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Rain starts and the share of time it rains over `hours` game hours (a game hour is a minute). */
function simulate(W, hours, seed) {
    const rnd = mulberry(seed);
    let rains = 0, until = 0, wet = 0, last = 0;
    for (let t = W.CHECK; t <= hours * 60; t += W.CHECK) {
        if (rnd() >= W.CHANCE) continue;
        const d = W.MIN + rnd() * W.SPAN;
        rains++;
        const from = Math.max(t, until);
        wet += Math.max(0, t + d - from); // (rains that overlap are counted once)
        until = Math.max(until, t + d);
        last = t;
    }
    return { rains, wet: wet / (hours * 60), last };
}

test('rain: 4 times rarer over 10 000 game hours, a rain no shorter', () => {
    let o = 0, n = 0, ow = 0, nw = 0;
    for (let seed = 1; seed <= 5; seed++) { const a = simulate(OLD, 10000, seed), b = simulate(WEATHER, 10000, seed * 7); o += a.rains; n += b.rains; ow += a.wet; nw += b.wet; }
    console.log(`rains per 50 000 h: before ${o}, after ${n}; share of time raining: before ${(ow / 5 * 100).toFixed(1)} %, after ${(nw / 5 * 100).toFixed(1)} %`);
    assert.ok(o / n > 3.6 && o / n < 4.5, 'count ratio ' + o / n);
    assert.ok(ow / nw > 3.4 && ow / nw < 4.8, 'time ratio ' + ow / nw);
    assert.equal(WEATHER.MIN, OLD.MIN); assert.equal(WEATHER.SPAN, OLD.SPAN); assert.equal(WEATHER.CHECK, OLD.CHECK);
    assert.ok(Math.abs(WEATHER.CHANCE * 4 - OLD.CHANCE) < 1e-9);
});
