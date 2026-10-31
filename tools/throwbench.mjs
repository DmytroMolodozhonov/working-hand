#!/usr/bin/env node
/**
 * throwbench.mjs — how well the hands let things go (ThrowModel.HandTrack), measured on synthetic human throws run
 * through the game's camera path (tools/throwsim.mjs): every kind of throw × both hands × camera 15/24/30/60 Hz ×
 * latency 50/100/150 ms × noise × the hand lost 0–6 pictures at the peak × light/heavy, calm openings, and moves
 * that must let NOTHING go (holding, walking, waving, a chop, a punch, a hand lost at rest, bad pictures).
 *   node tools/throwbench.mjs [--quick] [--seeds 3] [--check] [--v]
 * The game itself draws 60 / 30 / 20 frames a second (a slow computer).
 * --check fails (exit 1) past the limits below (only ever tighten them).
 * A sixth of the throws have the fingers read late by the camera (90–260 ms after the real opening: the blur) — the
 * model lets the thing go at the swing's peak then (the lag is counted from when the camera let the opening be seen).
 */
import { bench } from './throwsim.mjs';

export const LIMITS = {
    thrownShare: 0.99, // real throws recognised as throws
    fellDown: 12, // a real throw that left the hand at < 40% of its speed (of 18 432 at --seeds 2: only abrupt pushes on a computer drawing 20–30 frames a second; at 60 — none)
    spdErrP90: 0.2, // launch speed error (90th percentile; a sixth of the throws have the fingers read 90–260 ms late, a half drawn at 20–30 frames a second)
    angErrP90: 17.5, // launch direction error, degrees (90th percentile, no aim help; the game adds ≤ 10° towards the eyes' aim)
    lagGameP95: 250, // ms from the opening reaching the game to the thing leaving the hand (its place is moved on along the flight)
    dropShare: 0.99, // calm openings of a held-out hand let go
    dropLagP95: 310,
    falseShare: 0, // moves that must not let go (holding, walking, waving, chops, punches, a lost hand, bad pictures, lowering the arm)
};

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const t0 = Date.now();
const r = bench({ seeds: +opt('--seeds', 2), quick: args.includes('--quick') });
const f = (x, d = 3) => (typeof x === 'number' ? x.toFixed(d) : x);
console.log(`броски: ${r.throws}, распознано ${f(r.thrownShare * 100, 2)}%, как разжатие ${r.asDrop}, пропущено ${r.missed}, «упал вниз» ${r.fellDown}`);
console.log(`скорость вылета: ошибка средняя ${f(r.spdErrMean * 100, 1)}%, 90% — ${f(r.spdErrP90 * 100, 1)}%`);
console.log(`направление: ошибка средняя ${f(r.angErrMean, 1)}°, 90% — ${f(r.angErrP90, 1)}°`);
console.log(`задержка (от прихода разжатия в игру): медиана ${f(r.lagGameP50, 0)} мс, 95% — ${f(r.lagGameP95, 0)} мс; от настоящего разжатия (с камерой) 95% — ${f(r.lagTotalP95, 0)} мс`);
console.log(`спокойные разжатия: ${r.drops}, отпущено ${f(r.dropShare * 100, 2)}%, задержка 95% — ${f(r.dropLagP95, 0)} мс`);
console.log(`ложные (держит/ходьба/машет/рубит/бьёт/потеря кисти/плохие кадры): ${r.falseN}, выпало ${f(r.falseShare * 100, 2)}% ${JSON.stringify(r.falseWhy)}`);
if (args.includes('--v') && r.fails.length) console.log('примеры неудач:', r.fails);
if (r.fell.length) console.log('«упал вниз»:', r.fell);
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} с)`);
if (args.includes('--check')) {
    const bad = [];
    for (const [k, lim] of Object.entries(LIMITS)) {
        const v = r[k];
        const lower = k === 'thrownShare' || k === 'dropShare';
        if (lower ? v < lim : v > lim) bad.push(`${k} = ${f(v)} (порог ${lim})`);
    }
    if (bad.length) { console.log('ПРОВАЛ:', bad.join('; ')); process.exit(1); }
    console.log('ok');
}
