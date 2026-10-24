#!/usr/bin/env node
/**
 * hillbench.mjs — how the walkers of the game really go UP AND DOWN HILLS (the author: «Рыцари-путешественники,
 * поднимаясь по холмам — даже не очень высоким — застревают… это не только рыцари, а все человекоподобные существа»).
 * No browser: the world's real ground (the seed's terrain data) and the game's own walking code —
 * CastleLife._steer / _walkable / _tryClimb / _ground (people), Travelers.step (a party of the road: a leader who looks for the
 * way, a follower after him), Zombie / animal walking (Collision.resolveCylinder).
 * Run:  node tools/hillbench.mjs [--kind knight|road|zombie|pig|all] [--n 40] [--seed 20261015] [--slopes 0] [--check] [--out f.json]
 *
 * The trips are picked from the real hills: a straight line of 60–140 m with no water on it, no steps of more than 2 blocks, and a way
 * that exists (a search over the cells a man can stand on, ledges of two blocks climbed), in four bands of the steepest 6 m of it:
 *   пологий (до 35°) · холм (35–45°) · крутой (45–52°) · очень крутой (52–60°, не обязаны — но и не должны ломаться).
 * Per band: how many reach the goal (in 4 minutes of game time), how long it took against flat ground, the longest stand.
 * --check fails (exit 1) when a band up to «крутой» falls below LIMITS.
 */
import fs from 'node:fs';
import { makeRig } from './hillrig.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const KINDS = opt('kind', 'all') === 'all' ? ['knight', 'road', 'zombie', 'pig'] : opt('kind', 'all').split(',');
const N = Number(opt('n', '40'));
const SEED = parseInt(opt('seed', '20261015'), 10);
const SLOPES = opt('slopes', '1') !== '0';
const CHECK = args.includes('--check');
const OUT = opt('out', null);
const VERBOSE = args.includes('--v'); // list the trips that did not arrive
/** --check: the least share that must arrive, per band. */
const LIMITS = { 'пологий': 0.95, 'холм': 0.95, 'крутой': 0.9, 'обход': 0.8 };
// [name, steepest 6 m from, to, steps allowed on the line (blocks), the kinds that go it]
const BANDS = [['пологий', 0.3, 0.7, 2], ['холм', 0.7, 1.0, 2], ['крутой', 1.0, 1.3, 2], ['очень крутой', 1.3, 1.7, 2],
    // a cliff or a pit with steep sides on the straight line (3–6 blocks): the road folk must go ROUND it (they do not know the way: HillWay.RoutePlanner)
    ['обход', 0, 9, 6, ['knight', 'road']]];

const rig = await makeRig({ seed: SEED, slopes: SLOPES });
const { HW, pickTrips, tripKnight, tripRoad, tripBody } = rig;
const RUN = { knight: tripKnight, road: tripRoad, zombie: tripBody('zombie'), pig: tripBody('pig') };
const PACE = { knight: 2.3, road: 1.96, zombie: 2.4, pig: 2.0 };
const report = {};
let failed = false;
console.log(`hillbench: seed ${SEED}${SLOPES ? '' : ' (без плавных склонов)'}, ${N} походов на полосу${HW ? '' : ' [старый код: без HillWay]'}`);
for (const [name, lo, hi, maxStep, only] of BANDS) {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const trips = pickTrips(lo, hi, N, rnd, maxStep, name === 'обход');
    for (const kind of KINDS) {
        if (only && !only.includes(kind)) continue;
        rig.resetStuck();
        const rs = trips.map((tr) => RUN[kind](tr[0], tr[1], tr[2], tr[3]));
        const ok = rs.filter((r) => r.ok).length;
        if (VERBOSE) rs.forEach((r, i) => { if (!r.ok) console.log(`   не дошёл: ${kind}/${name} из ${trips[i].slice(0, 2).map(Math.round)} в ${trips[i].slice(2, 4).map(Math.round)}`); });
        const slow = rs.filter((r, i) => r.ok).map((r, i) => r.tm / (trips[rs.indexOf(r)][4] / PACE[kind])).sort((p, q) => p - q);
        const med = slow.length ? slow[Math.floor(slow.length / 2)] : NaN;
        const stand = Math.max(0, ...rs.map((r) => r.still));
        const share = trips.length ? ok / trips.length : 1;
        report[`${kind}/${name}`] = { trips: trips.length, reached: ok, share: +share.toFixed(2), medianTimeVsFlat: +med.toFixed(2), longestStandS: stand, stuckLines: rig.stuckLines() };
        const bad = LIMITS[name] !== undefined && share < LIMITS[name];
        if (bad) failed = true;
        console.log(`${kind.padEnd(7)} ${name.padEnd(13)} дошли ${String(ok).padStart(3)}/${String(trips.length).padEnd(3)} (${(share * 100).toFixed(0)}%) время к ровному ×${med.toFixed(2)}  самое долгое стояние ${stand} с${kind === 'road' ? `, «стоит без причины» ${rig.stuckLines()}` : ''}${bad ? '   ← НИЖЕ ПОРОГА' : ''}`);
    }
}
rig.restore();
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
if (CHECK && failed) { console.error('hillbench --check: ниже порога'); process.exit(1); }
