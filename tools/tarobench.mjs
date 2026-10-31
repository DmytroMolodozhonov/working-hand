#!/usr/bin/env node
/**
 * tarobench.mjs — the Tarons and the underworld's gargoyle patrols without the game.
 *   node tools/tarobench.mjs [--seeds 1,4242,12345] [--check]
 * Prints: (1) the Taron's measures against the hero (~3.5 m) — height with the horns, belly, head, parts, triangles, draws;
 * (2) the underworld's plan for each seed — the camps (3–8 each, flat roads to them), the bridges' widths against the Taron's body (R 1.6, NARROW 5),
 * the gargoyle lairs; (3) a camp in a fake game: speed (half the player's), the wind-up and the swing, the leash; (4) the patrol's numbers (a sample of 20 000).
 * --check: exits with 1 if a number is off. tests/unit/taron*.test.js, hell-gargoyles.test.js hold the same.
 */
import * as THREE from 'three';
import { taronModel, poseTaron, TARON_DIM } from '../src/fx/TaronModel.js';
import { TARON, taronLook, campSize } from '../src/game/TaronRules.js';
import { Taron } from '../src/game/Taron.js';
import { HELL_GARGOYLE as H, packSize, rollAttack, dropsHead, groupCount, groupSizeOf } from '../src/game/HellGargoyleRules.js';
import { hellPlan } from '../src/world/HellMap.js';

const args = process.argv.slice(2), has = (f) => args.includes(f), val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const seeds = String(val('--seeds', '1,4242,12345')).split(',').map(Number);
const HERO = 3.5;
const bad = [];
const expect = (ok, msg) => { if (!ok) { bad.push(msg); console.log('  ✗ ' + msg); } };
const f = (x, n = 2) => (+x).toFixed(n);

// ---- (1) the measures
console.log('— measures (hero ≈ ' + HERO + ' m)');
console.log('seed  height  ×hero  belly  head   meshes  tris');
let hs = 0;
for (let i = 1; i <= 24; i++) {
    const m = taronModel(taronLook(i)); poseTaron(m, { mode: 'idle' }); m.userData.axe.parent.remove(m.userData.axe); m.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(m), sz = b.getSize(new THREE.Vector3());
    const belly = new THREE.Box3().setFromObject(m.userData.torso.children[0]).getSize(new THREE.Vector3()).x;
    const head = new THREE.Box3().setFromObject(m.userData.head).getSize(new THREE.Vector3()).y;
    let draws = 0, tris = 0; m.traverse((o) => { if (o.isMesh) { draws++; tris += o.geometry.index.count / 3; } });
    hs += sz.y;
    if (i <= 6) console.log(String(i).padEnd(5), f(sz.y).padStart(6), f(sz.y / HERO).padStart(6), f(belly).padStart(6), f(head).padStart(5), String(draws).padStart(6), String(Math.round(tris)).padStart(6));
    expect(sz.y >= 6.2 && sz.y <= 7.8, `look ${i}: height ${f(sz.y)} m (≈ 7, twice the hero)`);
    expect(belly >= 3 && belly <= 4.4, `look ${i}: belly ${f(belly)} m (≈ 3.4 across)`);
    expect(Math.abs(b.min.y) < 0.05, `look ${i}: the feet at y = 0 (${f(b.min.y)})`);
    expect(draws <= 28, `look ${i}: ${draws} meshes (FarShape makes them ≤ 6 draws)`);
}
console.log('average height', f(hs / 24), 'm = ×' + f(hs / 24 / HERO) + ' the hero');
expect(Math.abs(hs / 24 - 7) < 0.4, 'the average height ≈ 7 m');

// ---- (2) the plan
console.log('\n— the underworld\'s plan');
for (const seed of seeds) {
    const P = hellPlan(seed);
    const ns = P.taronCamps.map((c) => c.n);
    const ws = [...new Set(P.bridges.map((b) => b.w - 1.6))]; // (the clear passage between the parapets)
    console.log(`seed ${seed}: camps ${P.taronCamps.length} (n ${ns.join(',')}; r ${P.taronCamps.map((c) => c.r).join(',')}), lairs ${P.gargoyleLairs.length}, bridges ${P.bridges.length} (clear width ${ws.join('/')} m)`);
    expect(P.taronCamps.length >= 2, `seed ${seed}: camps`);
    for (const c of P.taronCamps) { expect(campSize(c.n) === c.n, `seed ${seed}: camp n ${c.n} in 3…8`); expect(c.r >= 20 && c.r <= 40, `seed ${seed}: camp r ${c.r} (20–40)`); }
    for (const b of P.bridges) { expect(b.w - 1.6 >= TARON.NARROW * 1.6, `seed ${seed}: a bridge ${b.w - 1.6} m clear is wide enough for a Taron (≥ 8)`); }
    const g = groupCount(seed, P.gargoyleLairs.length);
    console.log(`        patrols: ${g} groups of ${Array.from({ length: g }, (_, i) => groupSizeOf(seed, i)).join('+')}`);
    expect(g >= 4 && g <= 8, `seed ${seed}: groups ${g} (4–8)`);
}

// ---- (3) a camp in a fake game
console.log('\n— a camp');
const mk = () => {
    const g = {
        scene: new THREE.Group(), authority: true, localId: 'me', remotes: new Map(), frameCount: 0, gen: 30,
        character: { group: new THREE.Group(), velocity: { x: 0, z: 0 } },
        collision: { groundY: () => 0, resolveCylinder() {} },
        terrain: { data: { hell: true, landMade: () => true } },
        combat: { dead: false, enabled: true, hits: [], damage(d) { this.hits.push(d); }, shieldFactor: () => 0 },
        sound: { playTaron() {}, playCrack() {} }, fx: { shake: 0 }, hud: { setVoice() {} }, items: { spawnLoose() {} }, creatureImpact: { apply() {} }, impact: { apply() {} },
    };
    g.character.group.position.set(0, 0, 100);
    return g;
};
{
    const g = mk(), T = new Taron(g); g.tarons = T; T.setPlan({ taronCamps: [{ x: 0, z: 0, n: 5, r: 30, y: 18 }] });
    const step = (s) => { for (let t = 0; t < s; t += 1 / 30) { g.frameCount++; T.update(1 / 30); } };
    step(15);
    g.character.group.position.set(0, 0, 36); step(2);
    let maxV = 0, windFrames = 0, windMax = 0; const run = new Map();
    for (let i = 0; i < 900; i++) {
        g.frameCount++; const before = T.list.map((t) => t.model.position.clone()); T.update(1 / 30);
        T.list.forEach((t, k) => { maxV = Math.max(maxV, before[k].distanceTo(t.model.position) * 30); if (t.mode === 'windup') { const n = (run.get(t.id) || 0) + 1; run.set(t.id, n); windMax = Math.max(windMax, n); } else run.set(t.id, 0); });
    }
    console.log(`speed max ${f(maxV)} m/s (the player ${TARON.PLAYER_SPEED}; half = ${f(TARON.WALK)}), wind-up ${f(windMax / 30)} s, hits on the hero: ${g.combat.hits.join(', ') || 'none'}`);
    expect(maxV <= TARON.WALK + 0.35, `speed ${f(maxV)} ≤ half the player's ${f(TARON.WALK)}`);
    expect(windMax / 30 >= 0.8 && windMax / 30 <= 1.2, `the wind-up ${f(windMax / 30)} s (0.9)`);
    expect(g.combat.hits.every((d) => d === 22 || d === 14), 'blows are 22 or 14');
    g.character.group.position.set(0, 0, 200); step(25);
    expect(T.list.every((t) => Math.hypot(t.model.position.x, t.model.position.z) < TARON.LEASH + 6), 'they do not follow past the leash');
}

// ---- (4) the patrol's numbers
console.log('\n— the patrol\'s numbers (20 000 rolls)');
{
    const N = 20000, c = [0, 0, 0, 0]; let atk = 0, head = 0;
    for (let i = 0; i < N; i++) { const u = (i + 0.5) / N; c[packSize(u, 3)]++; if (rollAttack(u)) atk++; if (dropsHead(u)) head++; }
    console.log(`attackers 1/2/3: ${c[1]}/${c[2]}/${c[3]} (max ${H.PACK_MAX}), attack ${f(atk / N * 100, 1)} %, head ${f(head / N * 100, 1)} %`);
    expect(c[0] === 0 && c[1] > c[2] && c[2] > c[3] && c[3] > 0, 'packs 1–3, mostly one');
    expect(Math.abs(atk / N - 0.35) < 0.005 && Math.abs(head / N - 0.25) < 0.005, 'attack 35 %, head 25 %');
}

if (has('--check')) { console.log(bad.length ? `\n${bad.length} problem(s)` : '\nall good'); process.exit(bad.length ? 1 : 0); }
