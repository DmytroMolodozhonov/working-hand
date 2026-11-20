// The wand's aim under the author's real conditions, over a long game (19.11: «бегаю — палочка колеблется; чем дольше играешь, тем хуже; рука вверх — камера видит пол руки»).
//   node tools/handbench/stress-pointing.mjs [--minutes 30] [--case up-clip|run|updown|all] [--check]
// Per window: the aim's jitter at rest (deg RMS around its own mean), the bias against the truth (deg), the worst frame, and the learned numbers of the arm
// (the shoulders' width, the bone lengths, the noise states) — a number that only grows or drifts across windows is the degradation.
import * as THREE from 'three';
import { run } from './pointing.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const minutes = Number(arg('--minutes', 30));
const which = arg('--case', 'all');
const R2D = 180 / Math.PI;
const CASES = {
    'rest': { move: 'still', yaw: 15, pitch: 5 },
    'run': { move: 'still', yaw: 15, pitch: 5, runBob: true },
    'up-clip': { move: 'up', clipTop: true },
    'up-run': { move: 'up', clipTop: true, runBob: true },
    'updown': { move: 'updown', clipTop: true, runBob: true, dropEvery: 7 },
};
const WIN = 60000;
function windows(rows, ms) {
    const out = [];
    for (let t0 = 10000; t0 + 20000 <= ms; t0 += WIN * 5) {
        const sel = rows.filter((r) => r.t >= t0 && r.t < t0 + 20000);
        if (!sel.length) continue;
        const m = new THREE.Vector3(), tr = new THREE.Vector3();
        for (const r of sel) { m.add(r.aim); tr.add(r.truth); }
        m.normalize(); tr.normalize();
        let j = 0, worst = 0, err = 0;
        for (const r of sel) { const a = r.aim.angleTo(m) * R2D; j += a * a; const e = r.aim.angleTo(r.truth) * R2D; err += e; if (e > worst) worst = e; }
        out.push({ min: Math.round(t0 / 600) / 100, jitter: +(Math.sqrt(j / sel.length)).toFixed(2), bias: +(m.angleTo(tr) * R2D).toFixed(2), meanErr: +(err / sel.length).toFixed(2), worst: +worst.toFixed(1) });
    }
    return out;
}
let bad = 0;
for (const [name, o] of Object.entries(CASES)) {
    if (which !== 'all' && which !== name) continue;
    const ms = minutes * 60000;
    const res = run({ ...o, ms, chain: { camHz: 30, drawHz: 60, latency: 100 } });
    const w = windows(res.rows, ms);
    const S = res.ch.armSolver, R = S.right, L = S.left;
    const learned = { W: +S.W.toFixed(3), right: { Lu: +R.Lu.toFixed(3), Lf: +R.Lf.toFixed(3), nuV: +(R.nu?.v ?? 0).toExponential(2), nfV: +(R.nf?.v ?? 0).toExponential(2) } };
    const guard = {}; for (const [k, J] of res.guard.arms.joints) guard[k] = { len: +J.len.toFixed(2), trust: +J.trust.toFixed(2) };
    console.log(JSON.stringify({ case: name, minutes, first: w[0], last: w[w.length - 1], learned, guard }));
    if (process.argv.includes('--verbose')) for (const x of w) console.log('  ', JSON.stringify(x));
    if (process.argv.includes('--check') && w.length >= 3) {
        // (the first third of the windows against the last third: one window is one noisy sample of the camera)
        const t = Math.max(1, Math.floor(w.length / 3)), avg = (a, k) => a.reduce((x, y) => x + y[k], 0) / a.length;
        const f = w.slice(0, t), l = w.slice(-t);
        if (avg(l, 'jitter') > avg(f, 'jitter') * 1.4 + 0.5 || avg(l, 'meanErr') > avg(f, 'meanErr') * 1.25 + 1.5) { console.log('DEGRADES:', name); bad++; }
    }
}
if (bad) process.exitCode = 1;
