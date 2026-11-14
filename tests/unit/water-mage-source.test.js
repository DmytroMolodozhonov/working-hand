/**
 * Where a water mage's guard water comes from (WaterMageSource.js) and how fast his wave goes (WaveAttack.NPC_WAVE) — the author 14.11:
 * «протекшн появляется из ниоткуда, должен манипулировать той водой, которая у него есть»; «волна слишком медленно, может в разы быстрее».
 * «А если»: no water at all (tank / air gift); the land not made yet; water above / below him; a mage far from the player (no picture work).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { findWater, waterKind, streamPoint, GUARD_BUILD, WATER_REACH } from '../../src/game/WaterMageSource.js';
import { newWave, npcWave, stepWave, NPC_WAVE, waveForm } from '../../src/game/WaveAttack.js';

const W = 9, A = 0;
test('findWater: the NEAREST real water, within reach, never from nothing', () => {
    const water = new Set(['4,0,0', '2,-1,2', '-8,0,8']);
    const get = (x, y, z) => (water.has(x + ',' + y + ',' + z) ? W : A);
    const w = findWater(get, (id) => id === W, 0, 0, 0);
    assert.ok(w, 'found');
    const d = Math.hypot(w.x, w.z);
    assert.ok(d <= 4.5, 'the near one (2,2 or 4,0), not the far one at −8,8: ' + d);
    assert.equal(findWater(() => A, (id) => id === W, 0, 0, 0), null, 'no water: null');
    assert.equal(findWater((x) => (x > WATER_REACH.XZ + 4 ? W : A), (id) => id === W, 0, 0, 0), null, 'out of reach: null');
});
test('findWater: land not made yet is skipped (never made in the frame)', () => {
    let asked = 0;
    const w = findWater(() => W, (id) => id === W, 0, 0, 0, () => { asked++; return false; });
    assert.equal(w, null); assert.ok(asked > 0);
});
test('the kind of the water: a block, else the tank on his back, else the moisture of the air', () => {
    assert.equal(waterKind({ x: 1, y: 0, z: 1 }, false), 'water');
    assert.equal(waterKind(null, true), 'tank');
    assert.equal(waterKind(null, false), 'air');
});
test('the stream: starts at the source, ends at the hand, arches up between', () => {
    const a = { x: 0, y: 0, z: 0 }, b = { x: 10, y: 3, z: 0 };
    const s0 = streamPoint(a, b, 2, 0), s1 = streamPoint(a, b, 2, 1), mid = streamPoint(a, b, 2, 0.5);
    assert.ok(Math.abs(s0.x) < 1e-9 && Math.abs(s0.y) < 1e-9); assert.ok(Math.abs(s1.x - 10) < 1e-9 && Math.abs(s1.y - 3) < 1e-9);
    assert.ok(mid.y > 1.5 + 2 - 0.01 && mid.y <= 3.6);
});
test('the guard gathers quickly but not in one frame, and falls back slower', () => {
    assert.ok(GUARD_BUILD.SHIELD > 0.2 && GUARD_BUILD.SHIELD < 0.6 && GUARD_BUILD.DOME > GUARD_BUILD.SHIELD && GUARD_BUILD.FADE > GUARD_BUILD.SHIELD);
});

const env = { surface: () => ({ y: 0, water: false }), solid: () => false };
test('a mage\'s wave: rises in half the time and rolls 2.4× as fast, on its own copy of the form', () => {
    const plain = newWave('WaveAttack', 'p', { x: 0, y: 0, z: 0 }, 0, 1), mage = npcWave(newWave('WaveAttack', 'm', { x: 0, y: 0, z: 0 }, 0, 1));
    assert.ok(mage.F !== waveForm('WaveAttack'), 'its own copy: the shared form is not changed');
    assert.equal(waveForm('WaveAttack').speed, 6.5);
    assert.ok(Math.abs(mage.F.speed - 6.5 * NPC_WAVE.SPEED_K) < 1e-9);
    const rise = (w) => { let t = 0; while (w.phase === 'rise' && t < 5) { stepWave(w, 0.02, env); t += 0.02; } return t; };
    const tp = rise(plain), tm = rise(mage);
    assert.ok(tm < tp * 0.55, `rise ${tm.toFixed(2)} s vs ${tp.toFixed(2)} s`);
    // rolling: distance in one second
    for (const w of [plain, mage]) { w.phase = 'roll'; w.t = 0; w.s = 0; w.x = 0; w.z = 0; }
    stepWave(plain, 1 / 30, env); stepWave(mage, 1 / 30, env);
    assert.ok(mage.s > plain.s * 2.2, `a mage's wave goes ${(mage.s / plain.s).toFixed(2)}× as far per step`);
});
