#!/usr/bin/env node
/**
 * pointbench.mjs — «куда указывает палочка» и с какой задержкой: the whole chain from the camera's picture to the drawn V5
 * wand (pointing.mjs) on synthetic pointing — still at places on the screen, a careful aim, a quick flick, sweeping, slow
 * tracking; a 720p webcam, a noisy 640×480 one, a weak video card (15 pictures a second), the game at 30 / 60 / 144 FPS,
 * a left-handed player.
 *   node tools/handbench/pointbench.mjs [--check] [--old DIR]
 * --old DIR: the same bench run on another copy of the game (a git worktree of an older commit, with its own
 * src/game/WandAim.js shim) — «было → стало».
 * Numbers: «ошибка» — the mean angle between the drawn aim and where the arm really points at that moment (deg: offset +
 * lag + tremble); «смещение» — at rest, the aim's own offset (deg); «дрожь» — at rest, RMS around its mean (deg);
 * «задержка» — the delay (ms) that best explains the drawn aim, END TO END (the camera's 70 ms included); «рывки» — the
 * drawn aim's second difference frame to frame (deg: steps between the camera's pictures); «перелёт» — past the target
 * after a quick flick (deg).
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const LIMITS = { bias: 1.5, jit: 0.35, stillSm: 0.06, aimLag: 100, sweepLag: 105, trackLag: 150, flickLag: 120, over: 2, jit640: 1.0, biasLeft: 1.5 };
// (only ever tighten; before this bench — the old chain: смещение 34.7°, задержка aim 125 / sweep 140 / track 210 ms)

const args = process.argv.slice(2);
const oldDir = args.includes('--old') ? args[args.indexOf('--old') + 1] : null;
const here = path.dirname(new URL(import.meta.url).pathname);

const CASES = {
    '720p, 30 кадров/с': {},
    '640×480 (шум ×2)': { noise: 0.005, poseNoise: 0.004, zNoise: 0.015 },
    'слабая видеокарта (15/с, +40 мс)': { camHz: 15, latency: 110 },
    'игра 30 FPS': { drawHz: 30 },
    'игра 144 FPS': { drawHz: 144 },
};

async function bench(dir, debias) {
    const m = await import(pathToFileURL(path.join(dir, 'tools/handbench/pointing.mjs')).href);
    const out = {};
    for (const [name, chain] of Object.entries(CASES)) {
        const row = {};
        for (const mv of ['still', 'aim', 'flick', 'sweep', 'track']) row[mv] = m.measure({ move: mv, ms: mv === 'track' ? 3000 : 2000, chain, debias });
        row.over = m.settle({ chain }).over;
        out[name] = row;
    }
    const left = { still: m.measure({ move: 'still', side: 'left' }), aim: m.measure({ move: 'aim', side: 'left', debias }) };
    const places = [[0, 0], [40, 0], [-30, 0], [0, 35], [0, -30], [60, 10]].map(([yaw, pitch]) => m.measure({ move: 'still', yaw, pitch }).bias);
    return { out, left, places };
}

const f1 = (v) => (v == null ? '—' : (+v).toFixed(1));
const f2 = (v) => (v == null ? '—' : (+v).toFixed(2));
function print(title, b) {
    console.log(`\n${title}`);
    console.log('случай'.padEnd(34) + 'смещ.° дрожь° рывки° | задержка мс: навед. рывок взмахи медл. | ошибка° навед. медл. | перелёт°');
    for (const [name, r] of Object.entries(b.out)) {
        console.log(name.padEnd(34) + `${f1(r.still.bias).padStart(5)} ${f2(r.still.jit).padStart(6)} ${f2(r.still.tremble).padStart(6)} | ${String(r.aim.lagMs).padStart(19)} ${String(r.flick.lagMs).padStart(5)} ${String(r.sweep.lagMs).padStart(6)} ${String(r.track.lagMs).padStart(5)} | ${f1(r.aim.mean).padStart(13)} ${f1(r.track.mean).padStart(5)} | ${f1(r.over).padStart(7)}`);
    }
    console.log(`левша: смещение ${f1(b.left.still.bias)}°, дрожь ${f2(b.left.still.jit)}°, задержка наведения ${b.left.aim.lagMs} мс`);
    console.log(`смещение по местам экрана (прямо, справа 40°, слева 30°, вверх 35°, вниз 30°, далеко вбок): ${b.places.map(f1).join(' / ')}°`);
}

const now = await bench(path.resolve(here, '../..'), false);
if (oldDir) print('БЫЛО (' + oldDir + ')', await bench(path.resolve(oldDir), true));
print('СТАЛО', now);

if (args.includes('--check')) {
    const r = now.out['720p, 30 кадров/с'];
    const bad = [];
    const chk = (name, v, lim) => { if (!(v <= lim)) bad.push(`${name} ${f2(v)} > ${lim}`); };
    chk('смещение', Math.max(r.still.bias, ...now.places), LIMITS.bias);
    chk('дрожь', r.still.jit, LIMITS.jit);
    chk('рывки в покое', r.still.tremble, LIMITS.stillSm);
    chk('задержка наведения', r.aim.lagMs, LIMITS.aimLag);
    chk('задержка взмахов', r.sweep.lagMs, LIMITS.sweepLag);
    chk('задержка медленного', r.track.lagMs, LIMITS.trackLag);
    chk('задержка рывка', r.flick.lagMs, LIMITS.flickLag);
    chk('перелёт', r.over, LIMITS.over);
    chk('дрожь 640×480', now.out['640×480 (шум ×2)'].still.jit, LIMITS.jit640);
    chk('смещение левши', now.left.still.bias, LIMITS.biasLeft);
    if (bad.length) { console.log('\n✗ ' + bad.join('; ')); process.exit(1); }
    console.log('\n✓ всё в пределах');
}
