import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STORM, WaterStorm, stormBlock, stormCanStop, stormDrain, stormReward, enoughWater, massRadius, inStorm, stormRadius, waterInReach } from '../../src/game/WaterStorm.js';
import { Hellfire } from '../../src/game/Hellfire.js';
import { SPELL_COST, Combat } from '../../src/game/Combat.js';
import { Mana } from '../../src/game/Mana.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('Water Vortex Super Maxima: the words — before «Water Vortex» and «Максима»', () => {
    for (const t of ['вотер вортекс супер максима', 'Water Vortex Super Maxima', 'ватер вортекс супер максима', 'водоворот супер максима', 'вотер вортекс супермаксима']) {
        assert.equal(matchSpell(t), 'WaterVortexSuperMaxima', t);
    }
    assert.equal(matchSpell('вотер вортекс'), 'WaterVortex');
    assert.equal(matchSpell('максима'), 'Maxima');
    assert.notEqual(matchSpell('это было супер'), 'WaterVortexSuperMaxima');
});

test('Water Vortex Super Maxima: the same mana rules as the Hellfire (100 max, 80, 2/s, «стоп» 50, +10 once)', () => {
    assert.equal(SPELL_COST.WaterVortexSuperMaxima, 80);
    assert.equal(stormBlock({ enabled: true, max: 99, mana: 99 }), 'max');
    assert.equal(stormBlock({ enabled: true, max: 120, mana: 79 }), 'mana');
    assert.equal(stormBlock({ enabled: true, max: 100, mana: 80 }), null);
    assert.equal(stormBlock({ enabled: false, max: 30, mana: 0 }), null);
    assert.equal(stormDrain(1), 2);
    assert.equal(stormCanStop({ enabled: true, mana: 49 }), false);
    assert.equal(stormCanStop({ enabled: true, mana: 50 }), true);
    const bonus = { hp: 0, fatigue: 0, hellfire: true };
    assert.equal(stormReward(bonus), 10, 'its own +10 (the Hellfire\'s is separate)');
    assert.equal(stormReward(bonus), 0);
    assert.equal(bonus.fatigue, 10);
});

test('Water Vortex Super Maxima: only where there is a lot of water; the mass grows with it and with the spread hands', () => {
    assert.equal(enoughWater(STORM.MIN_WATER - 1), false);
    assert.equal(enoughWater(STORM.MIN_WATER), true);
    assert.ok(massRadius(300) > massRadius(60));
    assert.ok(massRadius(200, 1.5) > massRadius(200, 0.3));
    const me = { x: 0, y: 2, z: 0 }, rr = stormRadius(3);
    assert.ok(inStorm(me, rr, { x: 0, y: 1, z: rr }));
    assert.ok(!inStorm(me, rr, { x: 0, y: 1.5, z: 0 }), 'the caster stands in the eye of the storm');
});

/** A lake: water 3 deep, `w` wide, in flat ground. */
function lake(w) {
    const m = new Map();
    const k = (x, L, z) => `${x},${L},${z}`;
    for (let x = -w; x <= w; x++) for (let z = -w; z <= w; z++) for (let L = -2; L <= 0; L++) m.set(k(x, L, z), BLOCK.WATER);
    return {
        get: (x, L, z) => m.get(k(x, L, z)) ?? (L <= 0 ? BLOCK.DIRT : BLOCK.AIR),
        set: (x, L, z, t) => m.set(k(x, L, z), t),
        count: () => [...m.values()].filter((t) => t === BLOCK.WATER).length,
    };
}

test('Water Vortex Super Maxima: counts the water in reach; takes the highest, nearest first — the same list every time', () => {
    const small = waterInReach(lake(2), { x: 0, y: -1.5, z: 0 });
    assert.equal(small.count, 75, 'a small pond: 5×5×3');
    assert.equal(enoughWater(small.count), false);
    const big = waterInReach(lake(14), { x: 0, y: -1.5, z: 0 });
    assert.ok(enoughWater(big.count));
    assert.deepEqual(big.list[0], [0, 0, 0], 'the top layer at the place pointed at first');
    assert.ok(big.list.slice(0, 50).every((b) => b[1] === 0), 'the surface goes down first');
    assert.deepEqual(waterInReach(lake(14), { x: 0, y: -1.5, z: 0 }).list.slice(0, 40), big.list.slice(0, 40), 'deterministic');
});

function fakeGame(mode = 'freeworld', w = 14) {
    const noop = () => {};
    const hud = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop) });
    const data = lake(w);
    const g = {
        config: { mode }, hud, localId: 'me', authority: true,
        terrain: { data },
        character: {
            group: { position: new THREE.Vector3(0, 2, 18) },
            slowScale: 1,
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.set(side === 'right' ? 0.25 : -0.25, 1.6, 17.5),
            getPointingDirection: (side, out = new THREE.Vector3()) => out.set(0, 0, -1),
            getHandDirection: (side, out = new THREE.Vector3()) => out.set(0, 0, -1),
            isArmRaised: () => true,
            handLost: () => false,
        },
        items: { heldOf: (k) => (k === 'wand' ? { side: 'right' } : null) },
        castOrigin: (side, out = new THREE.Vector3()) => out.set(0.25, 1.6, 17.2),
        collision: { groundY: () => 0 },
        _flameBlock: () => null,
        vortex: { _pointedWater: () => new THREE.Vector3(0, -1.5, 12), _push: function (f, tk, tid) { (this.pushed ||= []).push({ tk, tid }); } },
        fire: { douse: () => 0, ignite: () => false },
        duel: { _bodies: () => [] },
    };
    g._flameWaters = () => g.waterStorm.spheres([]);
    g.combat = new Combat(g);
    g.mana = new Mana(g);
    g.waterStorm = new WaterStorm(g);
    g.hellfire = new Hellfire(g);
    return g;
}

const run = (g, secs, step = 0.1) => { for (let t = 0; t < secs - 1e-9; t += step) { g.combat.update(step); g.hellfire.update(step); g.waterStorm.update(step); } };

test('Water Vortex Super Maxima: a puddle is not enough; by a lake it takes the water out (the lake sinks), it falls and the lake fills back', () => {
    const pond = fakeGame('creative', 2);
    assert.equal(pond.waterStorm.cast(true), null, 'too little water');
    const g = fakeGame('creative');
    const full = g.terrain.data.count();
    assert.equal(g.waterStorm.cast(true), 'WaterVortexSuperMaxima');
    run(g, 3);
    const taken = full - g.terrain.data.count();
    assert.ok(taken > 100, `the lake sinks: ${taken} m³ taken`);
    assert.equal(g.waterStorm.state.drawn, taken);
    g.waterStorm.stop('stop');
    assert.ok(g.waterStorm.log.some((e) => e.ev === 'fall'), 'the water falls');
    run(g, 6);
    assert.equal(g.terrain.data.count(), full, 'the lake filled back');
});

test('Water Vortex Super Maxima: 80 at once, 2 a second; «стоп» costs 50 — without 50 it goes on', () => {
    const g = fakeGame();
    const c = g.combat;
    c.fatigue = 30;
    assert.equal(g.waterStorm.cast(true), null, 'a mana maximum of 30');
    c.maxFatigue = 200; c.fatigue = 200;
    assert.equal(g.waterStorm.cast(true), 'WaterVortexSuperMaxima');
    assert.equal(c.fatigue, 120);
    run(g, 2);
    assert.ok(Math.abs(c.fatigue - 116) < 0.05, `2 a second: ${c.fatigue}`);
    c.fatigue = 40;
    assert.equal(g.waterStorm.sayStop(), 'mana');
    assert.ok(g.waterStorm.busy);
    c.fatigue = 60;
    assert.equal(g.waterStorm.sayStop(), true);
    assert.equal(c.fatigue, 10);
    assert.equal(g.waterStorm.busy, false);
});

test('Water Vortex Super Maxima: it puts out the Hellfire — the first time it gives +10 to the mana maximum', () => {
    const g = fakeGame();
    const c = g.combat;
    c.maxFatigue = 300; c.fatigue = 300;
    g.hellfire.cast(true);
    run(g, 1);
    assert.ok(g.hellfire.busy);
    g.waterStorm.cast(true);
    // the water mass right onto the fire
    run(g, 0.2);
    g.waterStorm.state.c.copy(g.hellfire.state.c);
    g.waterStorm.state.R = 3;
    g.waterStorm.state.target.copy(g.hellfire.state.c);
    g.character.getPointingDirection = (side, out = new THREE.Vector3()) => out.copy(g.hellfire.state ? g.hellfire.state.c : out).sub(new THREE.Vector3(0.25, 1.6, 17.2)).normalize();
    run(g, 3);
    assert.equal(g.hellfire.busy, false, 'the Hellfire hissed out');
    assert.ok(g.hellfire.log.some((e) => e.ev === 'out' && e.why === 'water'));
    assert.equal(g.bonus?.waterStorm, true);
    assert.ok(g.waterStorm.log.some((e) => e.ev === 'reward' && e.n === 10));
});
