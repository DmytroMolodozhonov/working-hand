/**
 * How the elemental mages move (ElementalMove.js) and the watchdog against a frozen one (the author 14.11: «маг земли замирает… при ходьбе назад или если взорвало»;
 * «перемещение нереалистичное»). «А если»: cornered with a wall behind; nowhere free at all; the foe on top of him; a blast left him stunned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHop, stepHop, hopDirections, newWatch, stuckStep, STUCK, HOP } from '../../src/game/ElementalMove.js';

const seeded = (n = 1) => () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
const world = (wall) => {
    const p = { x: 0, z: 0 };
    return { p, io: { pos: p, rng: seeded(7), free: (x, z) => !wall(x, z), steer: (tx, tz, sp, dt) => { const d = Math.hypot(tx - p.x, tz - p.z) || 1, s = Math.min(d, sp * dt); const nx = p.x + (tx - p.x) / d * s, nz = p.z + (tz - p.z) / d * s; if (!wall(nx, nz)) { p.x = nx; p.z = nz; } } } };
};

test('too close: the first way is a step back (aslant), not a circle', () => {
    const dirs = hopDirections(3, 0, 14, 1, 0.3); // foe 3 m ahead (+x)
    assert.ok(dirs[0].x < -0.5, 'away from the foe');
    assert.ok(Math.abs(Math.hypot(dirs[0].x, dirs[0].z) - 1) < 1e-9);
});
test('hops end and pause: he is not walking every frame', () => {
    const { p, io } = world(() => false);
    const h = newHop(), foe = { x: 12, z: 0 };
    let hop = 0, wait = 0;
    for (let i = 0; i < 600; i++) { const r = stepHop(h, foe, 12, 4, 1 / 30, io); if (r === 'hop') hop++; else if (r === 'wait') wait++; }
    assert.ok(hop > 40 && wait > 40, `hops ${hop}, pauses ${wait}`);
    assert.ok(Math.hypot(p.x - foe.x, p.z) > 4, 'never walked into the foe');
});
test('cornered with a wall behind: the retreat is dropped for another way, never a push at the wall for good', () => {
    const { p, io } = world((x) => x < -1); // a wall at x = −1; the mage at 0; the foe near, on +x
    const h = newHop(), foe = { x: 4, z: 0 };
    const seen = new Set();
    for (let i = 0; i < 900; i++) { stepHop(h, foe, 14, 4, 1 / 30, io); seen.add(Math.round(p.z)); }
    assert.ok(p.x >= -1.01, 'stayed out of the wall');
    assert.ok(seen.size > 2 || Math.abs(p.x) > 1, 'he went somewhere: sideways at least');
});
test('nowhere free at all: he waits (no spin, no crash) and reports stuck', () => {
    const { io } = world(() => true);
    io.free = () => false;
    const h = newHop();
    let stuck = 0;
    for (let i = 0; i < 200; i++) if (stepHop(h, { x: 5, z: 0 }, 12, 4, 1 / 30, io) === 'stuck') stuck++;
    assert.ok(stuck > 0);
});
test('the watchdog: no steps and no new phase for STUCK.T s → fires once, then rests (cool-down)', () => {
    const w = newWatch(), v = { x: 1, z: 1 };
    let fires = 0, t = 0;
    for (; t < 30; t += 0.1) if (stuckStep(w, v, true, 'earthRest:3:0', 0.1)) fires++;
    assert.ok(fires >= 1 && fires <= 6, `fired ${fires}`);
    const first = (() => { const w2 = newWatch(); for (let k = 0; k < 200; k++) if (stuckStep(w2, v, true, 'k', 0.1)) return k * 0.1; })();
    assert.ok(first >= STUCK.T - 0.2 && first <= STUCK.T + 0.5, `first at ${first}`);
});
test('the watchdog does not count: moving, a new phase, no foe, stunned / lifted', () => {
    const v = { x: 0, z: 0 }, w = newWatch();
    for (let i = 0; i < 400; i++) { v.x += 0.1; assert.ok(!stuckStep(w, v, true, 'a', 0.1)); }
    const w2 = newWatch(), u = { x: 0, z: 0 };
    for (let i = 0; i < 400; i++) assert.ok(!stuckStep(w2, u, true, 'p' + Math.floor(i / 30), 0.1));
    const w3 = newWatch();
    for (let i = 0; i < 400; i++) assert.ok(!stuckStep(w3, u, false, 'a', 0.1));
    const w4 = newWatch();
    for (let i = 0; i < 150; i++) assert.ok(!stuckStep(w4, u, true, 'a', 0.1, true), 'a stunned / lifted mage is not «stuck» (for a while)');
    let fired = 0; for (let i = 0; i < 400; i++) if (stuckStep(w4, u, true, 'a', 0.1, true)) fired++;
    assert.ok(fired >= 1, 'but an excuse that never ends is no excuse: the watch fires after STILL_CAP + T');
});
test('constants are sane', () => { assert.ok(HOP.LEN[0] > 2 && HOP.LEN[1] < 8 && HOP.PAUSE[0] > 0.2 && STUCK.T > 3); });

import { lowMana, readyMana, ELEMENT_LOW, REGEN } from '../../src/game/ElementalRules.js';
test('rest and ready lines: a mage whose mana sits between «rest» and «one attack» cannot exist (the water mage stuck at 12 mana, 14.11)', () => {
    // the cheapest attack of each (SpellCosts): air Wind 8, water WaterVortex 20 / WaveAttack 8, fire Fireball 7
    assert.ok(lowMana('water', 200) >= 20, 'water: rests below a vortex\'s price');
    assert.ok(lowMana('air', 200) >= 8 && lowMana('fire', 200) >= 7);
    for (const e of Object.keys(ELEMENT_LOW)) { assert.ok(readyMana(e, 200) >= lowMana(e, 200) * 2, e); assert.ok(readyMana(e, 200) <= 200, e); }
    assert.ok(readyMana('water', 25) <= 25, 'a small pool still reaches ready');
    // time to be ready again from the empty: seconds, not minutes
    for (const e of Object.keys(ELEMENT_LOW)) assert.ok(readyMana(e, 200) / REGEN.REST < 12, e + ' rests ' + (readyMana(e, 200) / REGEN.REST).toFixed(1) + ' s');
});

import { nextAirMove, AIR_MOVES, AIR_SPIN } from '../../src/game/ElementalRules.js';
import { ELEMENTAL_MODES } from '../../src/entities/ElementalMagePose.js';
import { FX } from '../../src/fx/WizardFx.js';
test('the air mage varies his moves: never the same twice in a row, all three used', () => {
    let last = null; const seen = new Set();
    for (let i = 0; i < 300; i++) { const r = (i * 0.37 + 0.11) % 1; const m = nextAirMove(last, r); assert.notEqual(m, last); assert.ok(AIR_MOVES.includes(m)); seen.add(m); last = m; }
    assert.equal(seen.size, AIR_MOVES.length);
    assert.ok(AIR_SPIN.RATE * AIR_SPIN.SPIN_T > 4 * Math.PI - 0.1 && AIR_SPIN.RATE * AIR_SPIN.SPIN_T < 4 * Math.PI + 0.1, 'two whole turns: he ends facing the foe he began facing');
    assert.ok(AIR_SPIN.FIRE_T >= AIR_SPIN.SPIN_T, 'the release comes after the whirl, facing the foe');
    for (const mode of ['airSpin', 'airLash', 'fireSwat', 'airSwat', 'waterSwat']) assert.ok(ELEMENTAL_MODES.includes(mode), mode + ' is a network pose mode');
    assert.ok(FX.SWIRL === 8192 && Object.values(FX).filter((v) => v === 8192).length === 1, 'the swirl bit is its own');
});
