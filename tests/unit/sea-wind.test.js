// The world's wind as a system (the author: «ветер как система, волны 10 уровней по ветру и месту», SeaWind.js): the same on every
// computer from the seed and the clock; ten levels; mostly calm-to-fresh, a storm rare and minutes long; smooth (no jumps); the waves
// follow the level (Sea.js `storm`), the shore and a harbour calmer; the ships' sails get it scaled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { windAt, windLevel, windLevelSmooth, waveFactor, seaLevelAt, stormOf, WIND } from '../../src/world/SeaWind.js';
import { seaWaveHeight, waveAmp } from '../../src/world/Sea.js';

test('the same wind on every computer: a pure function of the seed and the time', () => {
    for (const t of [0, 1234.5, 99999]) assert.deepEqual(windAt(42, t), windAt(42, t));
    assert.notDeepEqual(windAt(42, 5000), windAt(43, 5000), 'another world, another weather');
});

test('ten levels; mostly calm to fresh, a storm rare (a few % of the time) and minutes long, never hours', () => {
    assert.equal(WIND.LEVELS.length, 10);
    assert.equal(windLevel(0), 0); assert.equal(windLevel(30), 9);
    for (const seed of [1, 777, 31337]) {
        const n = new Array(10).fill(0); let all = 0, run = 0, longest = 0;
        for (let t = 0; t < 86400 * 10; t += 10) {
            const w = windAt(seed, t); n[w.level]++; all++;
            if (w.level >= WIND.STORM_AT) { run += 10; longest = Math.max(longest, run); } else run = 0;
        }
        const pct = (lo, hi) => n.slice(lo, hi + 1).reduce((a, b) => a + b, 0) / all;
        assert.ok(pct(1, 5) > 0.75, `mostly calm to fresh: ${pct(1, 5)}`);
        assert.ok(pct(8, 9) > 0.01 && pct(8, 9) < 0.12, `a storm is rare: ${pct(8, 9)}`);
        assert.ok(longest < 3600, `a storm passes: ${longest} s`);
    }
});

test('smooth: a second later the wind is nearly the same (no jumps in the waves)', () => {
    let worst = 0;
    for (let t = 0; t < 20000; t += 1) worst = Math.max(worst, Math.abs(windAt(5, t + 1).speed - windAt(5, t).speed));
    assert.ok(worst < 1.2, `${worst}`);
    assert.ok(Math.abs(windLevelSmooth(12.5) - 6) < 1e-9 && windLevelSmooth(11) > 5 && windLevelSmooth(11) < 6);
});

test('the waves follow the wind: a calm sea — ripples, a storm — waves nearly three times the old sea; the shore and a harbour calmer', () => {
    assert.ok(Math.abs(stormOf(5)) < 1e-9, 'a fresh breeze = the old sea');
    const amp = (L) => waveAmp(300, stormOf(L));
    for (let L = 1; L < 10; L++) assert.ok(amp(L) > amp(L - 1), `level ${L} higher`);
    assert.ok(amp(9) / amp(5) > 2.5 && amp(0) / amp(5) < 0.3);
    assert.ok(seaLevelAt(9, 10) < seaLevelAt(9, 300));
    assert.equal(seaLevelAt(9, 300, true), 1, 'a harbour behind its breakwater');
    // the sea height itself (what swimmers, boards and ships feel) grows with the storm number
    let calm = 0, storm = 0;
    for (let t = 0; t < 60; t += 0.5) { calm = Math.max(calm, Math.abs(seaWaveHeight(10, 20, t, 300, stormOf(1)))); storm = Math.max(storm, Math.abs(seaWaveHeight(10, 20, t, 300, stormOf(9)))); }
    assert.ok(storm > calm * 4, `${calm} / ${storm}`);
    assert.ok(waveFactor(9) === WIND.WAVE[9]);
});
