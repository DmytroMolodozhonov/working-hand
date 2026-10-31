#!/usr/bin/env node
/**
 * monsterwalkbench.mjs — does the monster form (×7) get STUCK in the scarlet canyons / between the rocks?
 * (the author: «монстр застревает в проходах между блоками/скалами, особенно в пустыне, узкие каньоны»).
 * No browser: the world's real ground of the seed + the game's own body & wall code (tools/monsterrig.mjs).
 * Each trip: the monster starts at a random spot of the mesa land and walks straight at a goal 60–140 m away
 * (as the body walks where it is turned); it arrives, or it does not. Compared: the old body (only the step) and the new one (hops,
 * squeezing, lifting out — MonsterClimb.js).
 * Run:  node tools/monsterwalkbench.mjs [--n 12] [--seed 20261015] [--old] [--check] [--v]
 * --check: exit 1 when fewer than LIMITS.share arrive or the longest stand is over LIMITS.stillS (only tighten).
 */
import { makeWorld, makeMonster, walk, mesaSpots, canyonSpots } from './monsterrig.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt('n', '12')), SEED = parseInt(opt('seed', '20261015'), 10), OLD = args.includes('--old'), CHECK = args.includes('--check'), V = args.includes('--v');
export const LIMITS = { share: 0.9, stillS: 6 };

const W = makeWorld({ seed: SEED });
const MODE = opt('mode', 'canyon'); // canyon — along narrow gaps between rock walls · open — random lines across the mesa land
const starts = MODE === 'open' ? mesaSpots(W, { n: N, seed: 11 }).map(([x, z]) => ({ x, z, w: 0, ax: null })) : canyonSpots(W, { n: N, wall: Number(opt('wall', '8')), maxW: Number(opt('maxw', '14')) });
if (!starts.length) { console.log('нет подходящих мест'); process.exit(CHECK ? 1 : 0); }
let s = 99; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const rows = [];
for (const st of starts) {
    const { x, z } = st;
    let x1, z1, D = 60 + rnd() * 80;
    if (st.ax == null) { const a = rnd() * Math.PI * 2; x1 = x + Math.cos(a) * D; z1 = z + Math.sin(a) * D; }
    else { const sg = rnd() < 0.5 ? 1 : -1; x1 = x + st.ax * sg * D; z1 = z + st.az * sg * D; }
    const g = makeMonster(W, x, z, { climb: !OLD });
    const r = walk(g, x1, z1, { max: 90 });
    rows.push({ x, z, D, ...r });
    if (V || !r.ok) console.log(`${r.ok ? 'дошёл ' : 'НЕ дошёл'} из ${Math.round(x)},${Math.round(z)} (${Math.round(D)} м) за ${r.t.toFixed(0)} с; стоял ${r.still} с; прыжков ${r.hops}; сужение ${r.squeezeMin.toFixed(2)}${r.ok ? '' : `; осталось ${Math.round(r.left)} м`}${r.notes.length ? '; ' + [...new Set(r.notes)].slice(0, 2).join(' | ') : ''}`);
}
const ok = rows.filter((r) => r.ok).length, share = rows.length ? ok / rows.length : 1, still = Math.max(0, ...rows.map((r) => r.still));
console.log(`monsterwalkbench (${OLD ? 'старое тело' : 'новое тело'}): дошли ${ok}/${rows.length} (${(share * 100).toFixed(0)}%), самое долгое стояние ${still} с, прыжков всего ${rows.reduce((a, r) => a + r.hops, 0)}`);
if (CHECK && (share < LIMITS.share || still > LIMITS.stillS)) { console.log('← НИЖЕ ПОРОГА'); process.exit(1); }
