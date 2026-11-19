// The new zombie (ZombieModel.js + Zombie.js, the author 19.11: «переделал полностью скин зомби с нуля… другими анимациями… крутой зомби»):
// six looks, a cheap body (few meshes, four materials), limbs that come off and a zombie that goes on — armless it still strikes, legless it crawls,
// bleeding from the stumps — and one that really CATCHES fire in the sun (flames grow over a second).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Zombie, ZOMBIE } from '../../src/entities/Zombie.js';
import { zombieLook, ZOMBIE_LOOK_NAMES } from '../../src/entities/ZombieModel.js';

const make = (id = 1, fx = null) => new Zombie(new THREE.Scene(), new THREE.Vector3(0, 0.5, 0), id, fx ? { fx } : {});
const NEAR = new THREE.Vector3(0, 0.5, 30); // (a player somewhere in view: far ones are not drawn in detail)
const meshes = (z) => { let n = 0; z.group.traverse((o) => { if (o.isMesh) n++; }); return n; };

test('six different looks, picked by the zombie\'s number and always the same for it', () => {
    const seen = new Set();
    for (let id = 0; id < 400; id++) seen.add(zombieLook(id));
    assert.equal(seen.size, ZOMBIE_LOOK_NAMES.length);
    assert.equal(zombieLook(17), zombieLook(17));
});

test('a cheap body: a handful of meshes (the video card draws few shapes), four materials per zombie', () => {
    const z = make(3);
    assert.ok(meshes(z) <= 16, `meshes ${meshes(z)}`);
    assert.equal(z.materials.length, 4);
});

test('an arm struck off: the zombie still strikes (a swipe or a lunge with the other arm, the jaw), and the stump bleeds', () => {
    const drops = [];
    const z = make(4, { spark: (p, c) => drops.push(c), blood() {}, flyingPart() {} });
    z.severLimb(Math.random, 2);
    z.severLimb(Math.random, 4);
    assert.equal(z.limbMask & 6, 6);
    z.triggerAttack();
    assert.ok(z.isAttacking, 'armless, it still attacks');
    for (let i = 0; i < 60; i++) { z.update(1 / 60, NEAR, null, null); }
    assert.ok(drops.length > 0, 'blood drops from the stumps');
});

test('both legs gone: it drops onto its belly and crawls — slower, lower, and still reaches', () => {
    const z = make(5, { spark() {}, blood() {}, flyingPart() {} });
    const fast = z.speed;
    z.severLimb(Math.random, 8);
    assert.equal(z.crawling, false, 'one leg: it limps, upright');
    z.severLimb(Math.random, 16);
    z.update(1 / 60, null, null, null);
    assert.equal(z.crawling, true);
    assert.ok(z.speed <= ZOMBIE.CRAWL_SPEED && z.speed < fast);
    assert.ok(z.gOff < 1.0, 'lower to the ground');
    for (let i = 0; i < 90; i++) z.update(1 / 60, null, null, null);
    assert.ok(Math.abs(z.group.rotation.x - ZOMBIE.CRAWL_PITCH) < 0.1, 'belly down: ' + z.group.rotation.x);
    z.group.position.set(0, 0.5, 0);
    assert.ok(z.reaches(new THREE.Vector3(0, 0.5, 1.4)), 'it claws at what is near');
});

test('it catches fire in the sun: the flames grow over about a second, the glow rises, and it goes out when it leaves the light', () => {
    let n1 = 0, n2 = 0, phase = 1;
    const z = make(6, { spark() { if (phase === 1) n1++; else n2++; }, blood() {}, flyingPart() {} });
    z.burning = 0.6;
    for (let i = 0; i < 20; i++) { z.burning = 0.6; z.update(1 / 60, NEAR, null, null); } // (a third of a second: just smoking)
    const early = z._glow;
    phase = 2;
    for (let i = 0; i < 90; i++) { z.burning = 0.6; z.update(1 / 60, NEAR, null, null); }
    assert.ok(z._glow > early, `the glow rises (${early.toFixed(2)} → ${z._glow.toFixed(2)})`);
    assert.ok(z._lit >= 0.99, 'fully alight');
    assert.ok(n2 > n1, `more flames later (${n1} → ${n2})`);
    z.burning = 0;
    z.update(1 / 60, NEAR, null, null);
    assert.equal(z._lit, 0, 'out of the light: the fire is out');
    assert.equal(z._glow, 0);
});
