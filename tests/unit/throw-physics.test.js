import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ItemSystem } from '../../src/game/Items.js';
import { CollisionWorld } from '../../src/world/Collision.js';
import { VoxelCharacter } from '../../src/entities/Character.js';

function fakeGame(collision = new CollisionWorld()) {
    const scene = new THREE.Scene();
    const g = { scene, collision, fx: { spark() {} }, sync: null, authority: true, hud: { setVoice() {} }, localId: 'me', zombies: [] };
    g.items = new ItemSystem(g);
    return g;
}

/** Launch a thing and let it fly until it rests: where it landed, and its farthest x. */
function fly(kind, { from = new THREE.Vector3(0, 3, 0), vel = new THREE.Vector3(10, 6, 0), collision, seconds = 6 } = {}) {
    const g = fakeGame(collision);
    const L = g.items.spawnLoose({ kind, uid: kind + Math.random() }, from, { vel });
    let maxX = -Infinity;
    for (let i = 0; i < seconds * 60 && !L.rest; i++) { g.items._physics(L, 1 / 60); maxX = Math.max(maxX, L.model.position.x); }
    return { x: L.model.position.x, maxX, rest: L.rest, L };
}

test('flight: the air holds back light flat things — an apple flies over twice as far as a book; a hammer about as far as an apple', () => {
    const apple = fly('apple').x, book = fly('book').x, hammer = fly('hammer').x;
    assert.ok(apple > 2 * book, `apple ${apple.toFixed(2)} vs book ${book.toFixed(2)}`);
    assert.ok(Math.abs(hammer - apple) / apple < 0.15, `hammer ${hammer.toFixed(2)} vs apple ${apple.toFixed(2)}`);
});

test('throw: a heavy thing leaves the hand slower (the same swing gives a wand twice the speed of a hammer)', () => {
    const g = fakeGame();
    g.character = new VoxelCharacter(g.scene);
    const thr = { speed: 10, vRel: [0, -2, -9.8], vWorld: [0, -2, -9.8], at: 0 };
    const v = {};
    for (const kind of ['wand', 'hammer']) {
        g.items.held.right = { item: { kind } };
        v[kind] = g.items._throwVelocity('right', thr).length();
    }
    const r = v.wand / v.hammer;
    assert.ok(r > 1.8 && r < 2.1, `wand ${v.wand.toFixed(2)} / hammer ${v.hammer.toFixed(2)} = ${r.toFixed(2)}`);
    // the direction: where the thrower looks (ahead, a little up), not the camera's guess of the arm
    g.items.held.right = { item: { kind: 'apple' } };
    const d = g.items._throwVelocity('right', thr).normalize();
    assert.ok(d.z < -0.9 && d.y > 0.1 && d.y < 0.4, 'ahead and a little up ' + d.toArray().map((x) => x.toFixed(2)));
    // a throw on the run carries the body's speed
    const run = g.items._throwVelocity('right', { ...thr, vWorld: [0, -2, -9.8 - 7.5] });
    assert.ok(run.z < -g.items._throwVelocity('right', thr).length() - 5, 'running adds the body\'s speed');
});

test('flight: it keeps the turn it had in the hand and spins with the wrist\'s snap (a real angular velocity)', () => {
    const g = fakeGame();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 1.1, -0.4));
    const L = g.items.spawnLoose({ kind: 'apple', uid: 'sp' }, new THREE.Vector3(0, 30, 0), { vel: new THREE.Vector3(1, 0, 0), quat: q, spin: new THREE.Vector3(0, 0, 10) });
    assert.ok(L.model.quaternion.angleTo(q) < 1e-6, 'as it was in the hand');
    for (let i = 0; i < 6; i++) g.items._physics(L, 1 / 60);
    const turned = L.model.quaternion.angleTo(q);
    assert.ok(Math.abs(turned - 1.0) < 0.05, `turned ${turned.toFixed(3)} rad in 0.1 s at 10 rad/s`);
});

test('flight: a wall stops a thrown thing (it bounces off, never goes into it)', () => {
    const c = new CollisionWorld();
    c.setWalls([{ x: 5, z: 0 }], 5, 8); // a wall over x 2.5 … 7.5
    const r = fly('apple', { from: new THREE.Vector3(0, 4, 0), collision: c, vel: new THREE.Vector3(10, 4, 0) });
    assert.ok(r.maxX < 2.8, `got to x ${r.maxX.toFixed(2)}`);
    assert.ok(r.rest && r.x < 2.5, `came to rest in front of the wall at x ${r.x.toFixed(2)}`);
});

test('a fast thrown thing hurts a creature it hits (once) and pushes it along its flight', () => {
    const g = fakeGame();
    const hits = [];
    const z = { group: { position: new THREE.Vector3(4, 0.5, 0) }, isDead: false };
    g.zombies = [z];
    g.damageZombie = (zz, dmg, isWeapon, dir, by) => hits.push({ zz, dmg, dir, by });
    const L = g.items.spawnLoose({ kind: 'hammer', uid: 'h1' }, new THREE.Vector3(0, 1.5, 0), { vel: new THREE.Vector3(14, 0, 0) });
    L.thrower = 'me';
    for (let i = 0; i < 60; i++) g.items._physics(L, 1 / 60);
    assert.equal(hits.length, 1, 'one hit');
    assert.ok(hits[0].dmg > 5 && hits[0].dir.x > 0.9 && hits[0].by === 'me', JSON.stringify(hits[0]));
});
