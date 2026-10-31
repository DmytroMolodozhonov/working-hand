#!/usr/bin/env node
/**
 * protectbench.mjs — how fast and how surely «Protection» by crossed arms goes up (CrossedArms.CrossTrack), measured on
 * synthetic people through the game's camera path (tools/protectsim.mjs): real crosses (7 start poses × 5 ways to cross
 * × camera 15/24/30/60 a second × latency 50/100/150 ms × noise × a wrist lost for 1–3 pictures × the crossed wrists seen
 * worse × 0.15–0.6 s to cross, one arm late) and moves that must put NO shield up (walking, running, waving, clapping,
 * a scroll, a book, the flight's T, Superman, a dome's spread, swimming, chops, a throw, a handshake, catching,
 * stretches, talking with the hands, jumps, a fall, a hand to the other pocket / the belt / the mouth / the other
 * shoulder, the warm-up of straight arms swung crossed, a wand's cast, picking up) — each and an hour of them.
 *   node tools/protectbench.mjs [--quick] [--seeds 2] [--check] [--v] [--no-old]
 * «до» — the old path (smoothed points, read once a game frame, held 0.35 s), «после» — the new one.
 * --check fails (exit 1) past the limits below (only ever tighten them).
 */
import { bench } from './protectsim.mjs';

export const LIMITS = {
    okShare: 0.98, // real crosses that put the shield up
    lagGameP95: 40, // ms from the first picture of the pose reaching the game to the protection (95 %, all cameras)
    lagFramesP95: 1.05, // …in the camera's pictures (≤ 1: the very picture, or the next one)
    falseShare: 0, // false moves that put a shield up
    hourOn: 0, // shields up in an hour of false moves
    hourTentPerMin: 1, // unseen guesses a minute in that hour (no mana, no look, no sound — taken back)
    flicker: 0, // a held cross that let the shield drop
    releaseP95: 600, // ms from the arms opening to the shield down
    // a danger near (ShieldAlert: a charge flying at me, a player casting / aiming, a foe) — believed sooner
    aOkShare: 0.995,
    aLagGameP95: 25, // ms (95 %)
    aLagP50: 95, // ms from the arms in the pose (the camera's latency in it) — sooner than calm
    aFalseShare: 0, // still no shield from the false moves
};

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const t0 = Date.now();
const r = bench({ seeds: +opt('--seeds', 2), quick: args.includes('--quick'), old: !args.includes('--no-old') });
const f = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : String(x));
console.log(`настоящие скрещивания: ${r.real}; щит встал: после ${f(r.okShare * 100, 2)}%, до ${f(r.oldShare * 100, 2)}%`);
console.log(`от «руки в позе» до защиты (с задержкой камеры): после — медиана ${f(r.lagP50)} мс, 95% ${f(r.lagP95)} мс; до — медиана ${f(r.oldLagP50)} мс, 95% ${f(r.oldLagP95)} мс`);
console.log(`от прихода первого кадра позы в игру до защиты: медиана ${f(r.lagGameP50)} мс, 95% ${f(r.lagGameP95)} мс (${f(r.lagFramesP95, 2)} кадра камеры)`);
for (const [fps, b] of Object.entries(r.byFps)) console.log(`   ${fps} кадров/с: встал ${f(b.ok / b.n * 100, 1)}%, кадр → защита медиана ${f(b.p50)} мс, 95% ${f(b.p95)} мс`);
console.log(`с опережением (пробный невидимый щит): ${f(r.tentShare * 100, 1)}% настоящих; мигание при удержании: ${r.flicker}; снятие после разведения рук 95% ${f(r.releaseP95)} мс`);
console.log(`ложные движения: ${r.falseN}, щит встал ${r.falseOn} ${JSON.stringify(r.falseWhy)} (до: ${r.oldFalseOn}); пробных ${r.falseTent}`);
console.log(`час ложных движений (${f(r.hourSecs / 60, 1)} мин): щитов ${r.hourOn} ${JSON.stringify(r.hourWhy)}, пробных ${f(r.hourTentPerMin, 2)} в минуту`);
console.log(`опасность рядом (летит заряд, рядом колдуют/целятся, враг): встал ${f(r.aOkShare * 100, 2)}%, от позы до щита медиана ${f(r.aLagP50)} мс, 95% ${f(r.aLagP95)} мс; от кадра медиана ${f(r.aLagGameP50)} мс, 95% ${f(r.aLagGameP95)} мс; ложных ${r.aFalseOn} из ${r.aFalseN} ${JSON.stringify(r.aFalseWhy)}`);
if (args.includes('--v') && r.fails.length) console.log('неудачи:', r.fails);
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} с)`);
if (args.includes('--check')) {
    const bad = [];
    for (const [k, lim] of Object.entries(LIMITS)) {
        const v = r[k];
        if (k === 'okShare' || k === 'aOkShare' ? !(v >= lim) : !(v <= lim)) bad.push(`${k} = ${f(v, 3)} (порог ${lim})`);
    }
    if (bad.length) { console.log('ПРОВАЛ:', bad.join('; ')); process.exit(1); }
    console.log('ok');
}
