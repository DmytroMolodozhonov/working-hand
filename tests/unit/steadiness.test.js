// «Устойчивость»: the chance to stay on the feet, how it grows, what death does with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { holdChance, Steadiness, STEADY, needFor, roughOf } from '../../src/game/Steadiness.js';
import { captureLegacy, wipeHero, absorbLegacy } from '../../src/game/Legacy.js';
import { IMPACT } from '../../src/game/Impact.js';
import { GOD_SPELLS } from '../../src/game/Mana.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('chance: 1 → 1 %, 100 → 100 %, Bombardo Maxima ×0.4', () => {
    near(holdChance(1, 'Wind'), 0.01);
    near(holdChance(100, 'Wind'), 1);
    near(holdChance(50, 'Jolt'), 0.5);
    near(holdChance(100, 'BombardoMaxima'), 0.4);
    near(holdChance(100, 'Bombardo'), 1);
});

test('exceptions: gods, Wind Maxima, Inspirius, deep falls, non-spells', () => {
    for (const k of GOD_SPELLS) assert.equal(holdChance(100, k), 0, k);
    assert.equal(holdChance(100, 'WindMaxima'), 0);
    assert.equal(holdChance(100, 'Inspirius'), 0);
    assert.equal(holdChance(100, 'Wind', { drop: IMPACT.FALL_KNOCK_DROP }), 0);
    assert.equal(holdChance(100, null), 0);
    assert.equal(holdChance(100, 'Bombardo', { cause: 'cannon' }), 0);
    near(holdChance(100, null, { spell: false, drop: IMPACT.FALL_KNOCK_DROP - 0.1 }), 1); // (a short drop landing)
    assert.equal(holdChance(100, null, { spell: false, drop: 7 }), 0);
});

function game(mode = 'play') {
    const g = { config: { mode }, toasts: [], hud: { toast(t) { g.toasts.push(t); } }, knock: {}, bonus: { hp: 0, fatigue: 0 }, books: { learned: new Set() },
        character: { group: { position: { x: 0, z: 0 } }, groundY: 0, isRunning: true, onGround: true } };
    g.steady = new Steadiness(g);
    return g;
}
const run = (g, metres, slope) => { // steps of 0.5 m, ground rising `slope` per metre
    const ch = g.character;
    for (let i = 0; i < metres * 2; i++) { ch.group.position.x += 0.5; ch.groundY += 0.5 * slope; g.steady.step(0.05); }
};

test('growth: steep running is fast, flat is slow, +1 is told, creative does not grow', () => {
    let g = game(); run(g, 1, 0.8); // (first frame only sets the start)
    run(g, needFor(1) / 0.9, 0.8);
    assert.equal(g.steady.skill, 2);
    assert.deepEqual(g.toasts, ['+1 к устойчивости']);
    g = game(); run(g, needFor(1) / 0.9, 0);
    assert.equal(g.steady.skill, 1); // flat: ×0.12
    g = game('creative'); run(g, 2000, 0.8);
    assert.equal(g.steady.skill, 1);
    assert.equal(g.steady.effective, 100);
    assert.ok(roughOf(1, 1) === 1 && roughOf(0, 1) === 0);
});

test('speed bonus only on rough ground, up to +30 %', () => {
    const g = game(); g.steady.skill = 100; g.steady.rough = 1;
    near(g.steady.runK(), 1.3);
    g.steady.rough = 0; near(g.steady.runK(), 1);
    g.steady.skill = 1; g.steady.rough = 1; near(g.steady.runK(), 1);
});

test('death takes it; the body gives it back and replaces the new life', () => {
    const g = game(); g.steady.skill = 40; g.steady.acc = 120;
    const lg = captureLegacy(g);
    assert.deepEqual(lg.steady, { skill: 40, acc: 120 });
    wipeHero(g);
    assert.equal(g.steady.skill, 1);
    g.steady.skill = 7; // (grown in the new life — given up)
    absorbLegacy(g, lg);
    assert.equal(g.steady.skill, 40);
    assert.equal(g.steady.acc, 120);
});

test('save keeps the skill', () => {
    const g = game(); g.steady.skill = 63; g.steady.acc = 55;
    const h = game(); h.steady.restore(g.steady.snapshot());
    assert.equal(h.steady.skill, 63); assert.equal(h.steady.acc, 55);
    assert.equal(game().steady.snapshot(), null);
});
