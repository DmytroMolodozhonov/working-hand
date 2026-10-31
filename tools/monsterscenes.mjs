#!/usr/bin/env node
/**
 * monsterscenes.mjs — the monster form (×7) in made scenes of REAL blocks on real ground: ledges of every height across the way,
 * canyons between rock walls of every width. (No browser: tools/monsterrig.mjs.) The author: «монстр застревает в проходах между
 * скалами… не должно быть застреваний нигде».
 * Run:  node tools/monsterscenes.mjs [--old] [--check] [--v]
 * --check: exit 1 when a scene in EXPECT fails (ledges up to 2,7 роста and canyons down to SQUEEZE.MIN must be passed).
 */
import { makeWorld, makeMonster, walk, calmSpot, flatten, canyon, ledge } from './monsterrig.mjs';
import { CLIMB, SQUEEZE } from '../src/game/MonsterClimb.js';
import { MONSTER } from '../src/game/MonsterForm.js';

const args = process.argv.slice(2);
const OLD = args.includes('--old'), CHECK = args.includes('--check'), V = args.includes('--v');
const S = MONSTER.SCALE;
const W = makeWorld({});
const spot = calmSpot(W);
if (!spot) { console.log('нет ровной земли'); process.exit(1); }
const [fx, fz] = spot;
const rows = [];
let slot = 0, LEVEL = null;
/** Each scene in its own strip of the flat ground (they do not touch). */
function run(name, make, expect) {
    const z0 = fz + 30; slot++;
    LEVEL = flatten(W, fx, z0 - 25, 170, 50, LEVEL);
    const sc = make(fx + 60, z0);
    const g = makeMonster(W, sc.start[0], sc.start[1], { climb: !OLD });
    const r = walk(g, sc.goal[0], sc.goal[1], { max: 60, near: 10 });
    rows.push({ name, expect, ...r });
    console.log(`${r.ok ? '✔' : '✘'} ${name.padEnd(28)} ${r.ok ? `дошёл за ${r.t.toFixed(1)} с` : `НЕ дошёл (осталось ${Math.round(r.left)} м)`}; стоял ${r.still} с; прыжков ${r.hops}; сужение ${r.squeezeMin.toFixed(2)}; ${expect ? 'должен пройти' : 'не обязан'}${V && r.notes.length ? '; ' + [...new Set(r.notes)].join(' | ') : ''}`);
}
// ledges: the step alone is 1,05 · 7 = 7,35 m; a hop takes up to MAX_H · 7 = 18,9 m
for (const h of [4, 7, 9, 12, 15, 18, 22]) run(`уступ ${h} м`, (x, z) => ledge(W, x, z, h), h <= CLIMB.MAX_H * S - 0.5);
// canyons: walls 30 m, the gap w wide; the body is 6,7 m across (squeeze down to SQUEEZE.MIN · 6,7 = 2,7 m)
for (const w of [9, 7, 6, 5, 4, 3, 2]) run(`каньон ${w} м, стены 30 м`, (x, z) => canyon(W, x, z, w, 30), w >= 2.7 + 0.3);
// a wall too high to climb and a gap too narrow: no need to pass — only not to be stuck for ever (it walks back / lifts out)
run('глухая стена 40 м', (x, z) => ledge(W, x, z, 40), false);
const bad = rows.filter((r) => r.expect && !r.ok);
console.log(`monsterscenes (${OLD ? 'старое тело' : 'новое тело'}): ${rows.filter((r) => r.expect && r.ok).length}/${rows.filter((r) => r.expect).length} обязательных пройдено`);
if (CHECK && bad.length) { console.log('← НЕ ПРОШЛИ: ' + bad.map((r) => r.name).join(', ')); process.exit(1); }
