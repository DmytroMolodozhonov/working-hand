// Dragons (src/game/Dragons.js, DragonKinds.js) and their lairs high in the mountains (src/world/DragonLairs.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAGON_KINDS, KIND_IDS, DRAGON_HP, rollDragon, dragonDamage, FIRE_KINDS, ON_DRAGON, rollHoard, FIRE_SPELLS, dragonWand } from '../../src/game/DragonKinds.js';
import { wandPower } from '../../src/game/WandMagic.js';
import { inFlame } from '../../src/game/Dragons.js';
import { TerrainData } from '../../src/world/Terrain.js';
import { LAIR } from '../../src/world/DragonLairs.js';
import * as THREE from 'three';

test('five kinds, each its own look; strength by kind and by chance; 1000 HP', () => {
    assert.equal(KIND_IDS.length, 5);
    assert.equal(DRAGON_HP, 1000);
    assert.equal(new Set(KIND_IDS.map((k) => DRAGON_KINDS[k].body)).size, 5, 'each its own colour');
    let s = 1;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const reacts = new Set();
    for (let i = 0; i < 40; i++) {
        const d = rollDragon(rng, 'crimson');
        const K = DRAGON_KINDS.crimson;
        assert.ok(d.react >= K.react * 0.79 && d.react <= K.react * 1.21);
        assert.ok(d.flame >= K.flame * 0.79 && d.flame <= K.flame * 1.26);
        reacts.add(d.react);
    }
    assert.ok(reacts.size > 10, 'chance makes them differ');
});

test('fire of any kind does nothing to a dragon; other blows decided per spell, with a reason', () => {
    for (const k of ['Inferno', 'InfernoMaxima', 'Fire', 'FireMaxima', 'Hellfire', 'fire', 'campfire', 'burn', 'DragonFire', 'lava']) {
        assert.ok(FIRE_KINDS.has(k), k);
        assert.equal(dragonDamage(k, 500).dmg, 0, k);
    }
    assert.equal(dragonDamage('AvadaKedavra', 4).dmg, 60, '«Авада» only wounds');
    assert.equal(dragonDamage('Expelliarmus', 4).dmg, 0);
    assert.ok(dragonDamage('melee', 30).dmg < 30 && dragonDamage('melee', 30).dmg > 0, 'blades: a little');
    assert.ok(dragonDamage('arrow', 20).dmg < 20 && dragonDamage('arrow', 20).dmg > 0, 'arrows: a little');
    assert.equal(dragonDamage('Bombardo', 24).dmg, 24, 'a blast is not fire');
    for (const [k, r] of Object.entries(ON_DRAGON)) assert.ok(r.why, `${k}: why`);
});

test('the dragon\'s wand: every fire spell +60% (no other), a plain +15% for the rest', () => {
    const w = dragonWand('x');
    for (const s of FIRE_SPELLS) assert.ok(Math.abs(wandPower(w, s) - 1.15 * 1.6) < 1e-9, s);
    assert.ok(Math.abs(wandPower(w, 'Bombardo') - 1.15) < 1e-9, 'Bombardo is a blast, not fire');
    assert.ok(Math.abs(wandPower(w, 'Sapira') - 1.15) < 1e-9);
});

test('the hoard: 1000–5000 coins, mostly a loose heap, pouches never full (some empty)', () => {
    let s = 7;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 50; i++) {
        const h = rollHoard(rng);
        assert.ok(h.total >= 1000 && h.total <= 5000);
        assert.equal(h.loose + h.bags.reduce((a, b) => a + b, 0), h.total);
        assert.ok(h.loose > h.total / 2);
        assert.ok(h.bags.every((n) => n < 100) && h.bags.some((n) => n === 0));
    }
});

test('a dragon\'s flame: a cone that widens', () => {
    const o = new THREE.Vector3(0, 0, 0), d = new THREE.Vector3(0, 0, -1);
    assert.ok(inFlame(o, d, 20, new THREE.Vector3(0, 0, -10)));
    assert.ok(inFlame(o, d, 20, new THREE.Vector3(2, 0, -15)), 'wide further out');
    assert.ok(!inFlame(o, d, 20, new THREE.Vector3(2, 0, -2)), 'narrow at the mouth');
    assert.ok(!inFlame(o, d, 20, new THREE.Vector3(0, 0, -25)), 'its reach');
    assert.ok(!inFlame(o, d, 20, new THREE.Vector3(0, 0, 5)), 'not behind');
});

test('lairs: rare, high in big mountains, a great hall and a huge mouth carved out', () => {
    let all = 0;
    for (const seed of [7, 99991]) {
        const t = new TerrainData();
        t.generate({ seed, mountains: true, seas: true, deepCaves: true });
        const lairs = t.lairsNear(0, 0, 2400);
        all += lairs.length;
        assert.ok(lairs.length <= 6, 'rare');
        for (const s of lairs) {
            const L = s.lair;
            assert.ok(Math.hypot(L.x, L.z) >= LAIR.MIN_SPAWN);
            assert.ok(L.F >= 12, `high up a mountain (floor ${L.F})`);
            assert.ok(L.r >= LAIR.R_MIN, 'a great hall');
            // the hall's floor is solid and there is air above it
            let air = 0;
            for (let a = 0; a < 8; a++) { const x = Math.round(L.x + Math.cos(a) * L.r * 0.5), z = Math.round(L.z + Math.sin(a) * L.r * 0.5); if (t.get(x, L.F + 3, z) === 0 && t.get(x, L.F, z) !== 0) air++; }
            assert.ok(air >= 6, `${L.id}: the hall is carved (${air}/8)`);
            // the mouth: wide and high, open to the sky beyond it
            for (const off of [-5, 0, 5]) assert.equal(t.get(Math.round(L.mouth.x - L.dz * off), L.F + 5, Math.round(L.mouth.z + L.dx * off)), 0, `${L.id}: the mouth is wide`);
            assert.equal(t.get(Math.round(L.mouth.x), L.F + 8, Math.round(L.mouth.z)), 0, `${L.id}: the mouth is high`);
        }
    }
    assert.ok(all >= 1, 'there are some');
});
