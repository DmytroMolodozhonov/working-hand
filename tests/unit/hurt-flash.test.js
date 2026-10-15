import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HurtFlash, HURT_FLASH } from '../../src/game/HurtFlash.js';
import { bodySpan, rayToSpan } from '../../src/game/AnimalHerd.js';

test('HurtFlash: a lost HP tints the model red for a moment, the shared material untouched', () => {
    const shared = new THREE.MeshLambertMaterial({ color: 0x336699 });
    const a = { hp: 10, dead: false, model: new THREE.Group() };
    const b = { hp: 10, dead: false, model: new THREE.Group() };
    const ma = new THREE.Mesh(new THREE.BoxGeometry(), shared), mb = new THREE.Mesh(new THREE.BoxGeometry(), shared);
    a.model.add(ma); b.model.add(mb);
    const game = { animals: { list: [a, b] } };
    const hf = new HurtFlash(game);
    hf.update(0.016); // (first look: nothing)
    assert.equal(ma.material, shared);
    a.hp = 8;
    hf.update(0.016);
    assert.notEqual(ma.material, shared, 'the wounded one is red');
    assert.ok(ma.material.color.r > shared.color.r && ma.material.color.b < shared.color.b);
    assert.equal(mb.material, shared, 'the other one, with the same material, is not');
    assert.equal(shared.color.getHex(), 0x336699, 'the shared material never changes');
    for (let i = 0; i < 20; i++) hf.update(0.016);
    assert.equal(ma.material, shared, 'back after ~0.2 s');
    // a dead body losing HP (teardown) does not flash
    a.dead = true; a.hp = 0; hf.update(0.5);
    a.hp = -5; hf.update(0.5);
    assert.equal(ma.material, shared);
    // another look put meanwhile stays
    b.hp = 1; hf.update(0.016);
    const cooked = new THREE.MeshLambertMaterial({ color: 0x5a2d0c });
    mb.material = cooked;
    hf.update(HURT_FLASH.TIME + 0.1);
    assert.equal(mb.material, cooked);
});

test('a tall body (the minotaur) is reached at its chest by a ray', () => {
    const a = { group: new THREE.Group(), model: { userData: { minotaur: { visible: true } } }, bodyH: 5.6, bodyR: 1 };
    const s = bodySpan(a, {});
    assert.ok(s.top - s.bot > 5);
    // a flame shot level at 4 m height, passing right through the body
    const o = new THREE.Vector3(-10, 4, 0), d = new THREE.Vector3(1, 0, 0);
    assert.ok(rayToSpan(o, d, 20, s.x, s.bot, s.top, s.z, {}).dist < 0.01);
    // and one passing 3 m to its side misses
    assert.ok(rayToSpan(new THREE.Vector3(-10, 4, 3), d, 20, s.x, s.bot, s.top, s.z, {}).dist > s.r + 0.8);
});
