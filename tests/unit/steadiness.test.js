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

// ------------------------------------------------------------------ the others
import { creatureSteady, steadyKind, NPC_STEADY, braceProfile, braceTime, braceLean, creatureHolds, creatureAbsolute } from '../../src/game/Steadiness.js';

test('creatures: fixed value by kind, from the id (the same every time), inside the author\'s ranges', () => {
    const inR = (v, k) => assert.ok(v >= NPC_STEADY[k][0] && v <= NPC_STEADY[k][1], `${k}: ${v}`);
    for (let i = 0; i < 40; i++) {
        inR(creatureSteady('v', { id: 'c:' + i, role: 'farmer' }), 'resident');
        inR(creatureSteady('v', { id: 'c:' + i, role: 'knight' }), 'knight');
        inR(creatureSteady('v', { id: 'c:' + i, role: 'king' }), 'king');
        inR(creatureSteady('v', { id: 'w:' + i, role: 'townwiz', rank: 'novice', wizard: true }), 'novice');
        inR(creatureSteady('v', { id: 'w:' + i, role: 'mage', rank: 'adept', wizard: true }), 'adept');
        inR(creatureSteady('v', { id: 'w:' + i, role: 'mage', rank: 'elder', wizard: true }), 'elder');
        inR(creatureSteady('c', { id: 's:' + i, role: 'sailor' }), 'sailor');
        inR(creatureSteady('c', { id: 's:' + i, role: 'blackbeard' }), 'captain');
    }
    assert.equal(creatureSteady('v', { id: 'tower:0', role: 'master', wizard: true }), 100);
    assert.equal(creatureSteady('v', { id: 'x', role: 'farmer' }), creatureSteady('v', { id: 'x', role: 'farmer' }));
    assert.equal(steadyKind('v', { role: 'merchant' }), 'merchant');
    assert.equal(steadyKind('v', { role: 'student', wizard: true }), 'novice');
});

test('creatures: the same exceptions (gods, Wind Maxima, Inspirius) and the Bombardo Maxima share — for a wizard without the mark (the head of the tower has the mark: nothing fells him)', () => {
    const w = Array.from({ length: 200 }, (_, i) => ({ id: `tower:${i}`, role: 'teacher', wizard: true, rank: 'elder' })).find((x) => !creatureAbsolute('v', x));
    assert.equal(creatureHolds('v', w, 'Jolt', {}, () => 0), true);
    assert.equal(creatureHolds('v', w, 'WindMaxima', {}, () => 0), false);
    assert.equal(creatureHolds('v', w, 'Inspirius', {}, () => 0), false);
    assert.equal(creatureHolds('v', w, 'BombardoMaxima', {}, () => 0.41), false);
    assert.equal(creatureHolds('v', w, 'BombardoMaxima', {}, () => 0.01), true);
    const tower = { id: 'tower:0', role: 'master', wizard: true }; // the head: the mark, always
    for (const k of ['WindMaxima', 'Inspirius', 'BombardoMaxima']) assert.equal(creatureHolds('v', tower, k, {}, () => 0.99), true, k);
});

test('the stance: quick in, held, upright again; leans harder for a harder blow; 0.5 … 0.8 s', () => {
    assert.equal(braceProfile(0), 0); assert.equal(braceProfile(0.4), 1); assert.equal(braceProfile(1), 0);
    assert.ok(braceTime(0) >= 0.5 && braceTime(1000) <= 0.8);
    assert.ok(braceLean(30) > braceLean(5));
});

import * as THREE from 'three';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';
import { CreatureImpact } from '../../src/game/CreatureImpact.js';

test('a steady creature that stays up runs the «устоял» animation (not a fall), everybody is told', () => {
    const scene = new THREE.Scene(), sent = [];
    const model = new VillagerModel(villagerLook(9, 'knight'), {}); scene.add(model.group);
    const v = { id: 'tower:0', isVillager: true, role: 'master', wizard: true, model, group: model.group, x: 0, y: 0, z: 0, yaw: 0, dead: false, stunT: 0, vy: 0, mode: 'idle', speed: 0 };
    const g = { scene, authority: true, localId: 'me', remotes: new Map(), fx: { spark() {} }, collision: { resolveCylinder() {} }, zombies: [], zombieById: new Map(),
        sync: { creatureImpacts: (l) => sent.push(...l) }, castleLife: { byId: new Map([[v.id, v]]), _walkable: () => true } };
    const ci = g.creatureImpact = new CreatureImpact(g);
    const res = ci.apply(v, { v: new THREE.Vector3(0, 0, -30), spell: 'Jolt', always: { down: 2.5 }, toss: 7 });
    assert.equal(res, 'stagger');
    assert.equal(ci.isDown(v), false);
    assert.ok(ci.log.some((l) => l.k === 'brace' && l.res === 'held'));
    for (let t = 0; t < 0.35; t += 1 / 30) ci.update(1 / 30);
    assert.ok(Math.abs(model.root.rotation.x) > 0.05 || Math.abs(model.root.rotation.z) > 0.05, 'leans into the blow');
    for (let t = 0; t < 0.6; t += 1 / 30) ci.update(1 / 30);
    assert.equal(ci.stateOf(v), 'up');
    assert.ok(sent.some((e) => e[2] === 'h'), 'the others get the stance event');
});
