import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Zombie } from '../../src/entities/Zombie.js';
import { animalModel } from '../../src/game/Animals.js';
import { CreatureImpact } from '../../src/game/CreatureImpact.js';
import { ICE } from '../../src/game/IceQueen.js';

// Snowball of an evil snowman — «кто/что»:
//   игрок: 0 HP, без износа брони/мантии/щита, толчок ≈1 м, поза «устоял» (BodyImpact `stand`)
//   зомби / житель / зверь / моряк: 0 HP, толчок ≈1 м, поза «устоял» (CreatureImpact `stand`)
//   другой злой снеговик: урон ICE.SNOW.DMG (война жезла)
const push = () => new THREE.Vector3(0, 0, -ICE.SNOW.PUSH);
const step = (ci, s) => { for (let t = 0; t < s; t += 1 / 30) ci.update(1 / 30); };

function world() {
    const scene = new THREE.Scene();
    const g = { scene, authority: true, localId: 'me', remotes: new Map(), fx: { spark() {} }, collision: { resolveCylinder() {} }, zombies: [], zombieById: new Map(), sync: { creatureImpacts() {} } };
    const z = new Zombie(scene, new THREE.Vector3(0, 0, 0), 7, {}); z.group.position.y = 0.5;
    g.zombies.push(z); g.zombieById.set(7, z);
    const m = animalModel('cow'); m.scale.setScalar(2); m.position.set(0, 0, 5); scene.add(m);
    const cow = { id: 101, type: 'cow', group: m, model: m, isAnimal: true, dead: false, stunT: 0, vel: new THREE.Vector3() };
    g.animals = { list: [cow], byId: new Map([[101, cow]]), push: (a, vel, stun) => { a.vel.add(vel); a.stunT = Math.max(a.stunT, stun); } };
    g.creatureImpact = new CreatureImpact(g);
    return { g, z, cow, ci: g.creatureImpact };
}

test('the snowball only shoves: no damage anywhere but snowman vs snowman', () => {
    assert.equal(ICE.SNOW.DMG, 1, 'a snowman hit by a snowman: the rod\'s war');
    assert.ok(ICE.SNOW.PUSH > 0 && ICE.SNOW.PUSH <= 6, 'a shove, not a blast');
});

test('a snowball shoves a zombie about a metre, in the «устоял» pose, never felling it', () => {
    const { z, ci } = world();
    const z0 = z.group.position.z;
    const res = ci.apply(z, { v: push(), kind: 'snow', stand: true });
    assert.equal(res, 'stagger');
    assert.ok(ci.log.some((l) => l.res === 'held'), 'the «устоял» pose');
    step(ci, 1.5);
    assert.equal(ci.stateOf(z), 'up', 'on its feet');
    const d = z0 - z.group.position.z;
    assert.ok(d > 0.4 && d < 2.0, `slid ${d} m`);
});

test('even a hard snowball (stand) never fells and the animal kind is shoved too', () => {
    const { cow, ci } = world();
    const res = ci.apply(cow, { v: new THREE.Vector3(0, 0, -30), kind: 'snow', stand: true });
    assert.equal(res, 'stagger');
    step(ci, 2);
    assert.equal(ci.stateOf(cow), 'up');
});
