// End-to-end half-hour aim stability: same noise/camera, compare the beginning and end.
import * as THREE from 'three';
import { run } from './pointing.mjs';
const minutes = Number(process.argv[process.argv.indexOf('--minutes') + 1]) || 30;
if (!(minutes >= 2 && minutes <= 120)) throw new Error('--minutes must be 2…120');
const ms = minutes * 60000;
function sample(rows, from, to) {
    const mean = new THREE.Vector3(); let n = 0, truth;
    for (const r of rows) if (r.t >= from && r.t < to) { mean.add(r.aim); truth = r.truth; n++; }
    mean.normalize(); let jitter = 0;
    for (const r of rows) if (r.t >= from && r.t < to) jitter += (r.aim.angleTo(mean) * 180 / Math.PI) ** 2;
    return { frames: n, jitter: Math.sqrt(jitter / n), bias: mean.angleTo(truth) * 180 / Math.PI };
}
for (const chain of [{ camHz: 30, drawHz: 60, latency: 100 }, { camHz: 13, drawHz: 25, latency: 220 }]) {
    const { rows } = run({ move: 'still', ms, chain });
    const first = sample(rows, 10000, 40000), last = sample(rows, ms - 30000, ms);
    console.log(JSON.stringify({ minutes, chain, first, last }));
    if (process.argv.includes('--check') && (last.jitter > first.jitter + 0.1 || Math.abs(last.bias - first.bias) > 0.2)) process.exitCode = 1;
}
