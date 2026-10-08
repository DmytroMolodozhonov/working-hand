import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Weapon } from '../../src/entities/Weapon.js';
import { CollisionWorld } from '../../src/world/Collision.js';
import { WeaponSystem } from '../../src/game/Weapons.js';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { Zombie } from '../../src/entities/Zombie.js';

const flatQuat = (yaw) => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw, 'XYZ'));

function tableWorld() {
    const c = new CollisionWorld();
    const id = c.addBox({ minX: -9.5, maxX: -4.5, minY: -0.5, maxY: 2.05, minZ: -7, maxZ: -3, kind: 'table' });
    return { c, id };
}

function sim(w, c, seconds) {
    for (let i = 0; i < seconds * 60; i++) w.step(1 / 60, c);
}

for (const type of ['sword', 'axe']) {
    test(`${type}: lies still on a table and falls asleep`, () => {
        const { c } = tableWorld();
        const w = new Weapon(new THREE.Scene(), type, { headless: true, position: new THREE.Vector3(-7, 2.17, -5), quaternion: flatQuat(Math.PI / 4) });
        w.wake();
        sim(w, c, 3);
        assert.ok(w.sleeping, 'sleeping');
        assert.ok(Math.abs(w.position.x + 7) < 0.1 && Math.abs(w.position.z + 5) < 0.1, `stayed on the table ${w.position.toArray()}`);
        assert.ok(w.position.y > 2.05 && w.position.y < 2.4, `on the surface ${w.position.y}`);
    });

    test(`${type}: falls to the ground when the table is destroyed`, () => {
        const { c, id } = tableWorld();
        const w = new Weapon(new THREE.Scene(), type, { headless: true, position: new THREE.Vector3(-7, 2.17, -5), quaternion: flatQuat(0) });
        sim(w, c, 1);
        c.removeBox(id);
        w.wake();
        sim(w, c, 4);
        assert.ok(w.position.y < 0.2 && w.position.y > -0.5, `on the ground ${w.position.y}`);
        assert.ok(w.sleeping);
    });
}

test('thrown sword flies, spins and lands on the ground (no tunnelling)', () => {
    const c = new CollisionWorld();
    const w = new Weapon(new THREE.Scene(), 'sword', { headless: true, position: new THREE.Vector3(0, 3, 0) });
    w.velocity.set(6, 4, 0);
    w.angularVelocity.set(0, 0, 8);
    w.wake();
    let maxX = 0;
    for (let i = 0; i < 400; i++) { w.step(1 / 60, c); maxX = Math.max(maxX, w.position.x); }
    assert.ok(maxX > 3, `flew ${maxX}`);
    // No sample ends up below the ground
    for (const s of w.samples) {
        const p = s.local.clone().applyQuaternion(w.quaternion).add(w.position);
        assert.ok(p.y - s.radius > -0.5 - 0.03, `sample at ${p.y}`);
    }
    assert.ok(w.sleeping);
});

test('held blade is stopped by a wall instead of passing through it', () => {
    const c = new CollisionWorld();
    c.setWalls([{ x: 5, z: 0 }], 5, 8); // wall occupies x in [2.5, 7.5]
    const w = new Weapon(new THREE.Scene(), 'sword', { headless: true, position: new THREE.Vector3(0, 2, 0) });
    w.attach({ playerId: 'me', side: 'right' });
    // Hand tries to push the sword (pointing +X) deep into the wall
    w.drive.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
    w.drive.position.set(4, 2, 0);
    for (let i = 0; i < 120; i++) w.step(1 / 60, c);
    const [, tip] = w.getBladeSegment();
    assert.ok(tip.x < 2.5 + 0.1, `tip stopped at ${tip.x}`);
    assert.ok(w.contactHard > 0, 'contact reported (hand gets pushed back)');
});

// --------------------------------------------------------------- grabbing
function makeGame() {
    const scene = new THREE.Scene();
    const c = new CollisionWorld();
    const character = new VoxelCharacter(scene);
    character.setShowHands(true);
    let t = 1000;
    const game = {
        headless: true, scene, renderer: null, world: { collision: c }, character, localId: 'local', sync: null,
        now: () => t, advance: (ms) => { t += ms; },
    };
    game.weapons = new WeaponSystem(game);
    return game;
}

function setCurl(hand, v) {
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
        hand.currentState.fingers[f] = v;
        hand.targetState.fingers[f] = v;
    }
}

function handleAtPalm(game, w) {
    // Put the sword's handle exactly where the right palm closes
    const ws = game.weapons;
    ws._palmFrame(game.character, 'right');
    const [a, b] = w.getHandleSegment();
    const mid = a.clone().lerp(b, 0.5);
    const grip = game.character.getGripObject('right');
    grip.updateMatrixWorld(true);
    const e = grip.matrixWorld.elements;
    const P = new THREE.Vector3(e[12], e[13], e[14]);
    const Y = new THREE.Vector3(e[4], e[5], e[6]).normalize();
    const Z = new THREE.Vector3(e[8], e[9], e[10]).normalize();
    const G = P.clone().addScaledVector(Y, 0.13).addScaledVector(Z, -0.135);
    w.position.add(G.sub(mid));
    w.mesh.updateMatrixWorld(true);
}

test('a closed fist that touches the sword does NOT glue to it', () => {
    const game = makeGame();
    const w = game.weapons.spawn('sword', new THREE.Vector3(0, 2, -2), new THREE.Quaternion());
    w.sleeping = true;
    const hand = game.character.rightSimplifiedHand;
    setCurl(hand, 1); // fist the whole time
    game.character.group.updateMatrixWorld(true);
    handleAtPalm(game, w);
    for (let i = 0; i < 30; i++) { game.advance(16); game.weapons.update(1 / 60); }
    assert.equal(game.weapons.hands.right.held?.id ?? null, null);
});

test('open hand at the handle + closing fingers = grab; grip point and direction kept; open = release', () => {
    const game = makeGame();
    const w = game.weapons.spawn('sword', new THREE.Vector3(0, 2, -2), new THREE.Quaternion());
    w.sleeping = true;
    const hand = game.character.rightSimplifiedHand;
    game.character.group.updateMatrixWorld(true);
    handleAtPalm(game, w);
    setCurl(hand, 0);
    game.advance(16); game.weapons.update(1 / 60); // hand seen open
    setCurl(hand, 0.9);
    game.advance(16); game.weapons.update(1 / 60);
    assert.equal(game.weapons.hands.right.held?.id, w.id, 'grabbed');
    assert.equal(w.holder.side, 'right');
    assert.ok(hand.gripOverride, 'fingers wrap the handle');

    // Moving the hand moves the sword (with a little physical lag)
    for (let i = 0; i < 40; i++) { game.advance(16); game.weapons.update(1 / 60); }
    const before = w.position.clone();
    game.character.group.position.x += 1;
    game.character.group.updateMatrixWorld(true);
    for (let i = 0; i < 60; i++) { game.advance(16); game.weapons.update(1 / 60); }
    assert.ok(w.position.x - before.x > 0.9, `followed the hand: ${w.position.x - before.x}`);

    // Handle sits across the palm: blade axis ⟂ finger direction
    game.weapons._palmFrame(game.character, 'right');
    const grip = game.character.getGripObject('right');
    const e = grip.matrixWorld.elements;
    const fingers = new THREE.Vector3(e[4], e[5], e[6]).normalize();
    const blade = new THREE.Vector3(0, 1, 0).applyQuaternion(w.quaternion);
    assert.ok(Math.abs(blade.dot(fingers)) < 0.2, `handle across the palm (dot ${blade.dot(fingers).toFixed(2)})`);

    // A short tracking glitch (fingers "open" for 1 frame) must not drop it
    setCurl(hand, 0.1);
    game.advance(16); game.weapons.update(1 / 60);
    setCurl(hand, 0.9);
    game.advance(16); game.weapons.update(1 / 60);
    assert.equal(game.weapons.hands.right.held?.id, w.id, 'still held after a glitch');

    // Really opening the hand drops it, physics takes over — even though the
    // drawn fingers are still wrapped around the handle (grip override)
    // (hand lost by the camera: never drops)
    hand.lastTrackingTime = Date.now() - 5000;
    hand.targetState.fingers.index = hand.targetState.fingers.middle = hand.targetState.fingers.ring = 0.05;
    for (let i = 0; i < 20; i++) { game.advance(16); game.weapons.update(1 / 60); }
    assert.equal(game.weapons.hands.right.held?.id, w.id, 'not dropped while the hand is not tracked');
    hand.lastTrackingTime = Date.now(); // tracked again, really open
    for (let i = 0; i < 3; i++) hand.update(null); // drawn state stays clamped to the handle
    assert.ok(hand.currentState.fingers.index > 0.4, 'drawn fingers still wrap the handle');
    for (let i = 0; i < 20; i++) { game.advance(16); game.weapons.update(1 / 60); }
    assert.equal(game.weapons.hands.right.held?.id ?? null, null, 'released');
    assert.equal(w.holder ?? null, null);
    assert.equal(hand.gripOverride ?? null, null);
    assert.equal(w.sleeping, false, 'falls with physics');
});

test('a fast swing through a zombie hits it; a slow touch does not', () => {
    const game = makeGame();
    const scene = game.scene;
    const z = new Zombie(scene, new THREE.Vector3(0, 0.5, -4), 1, {});
    const w = game.weapons.spawn('sword', new THREE.Vector3(0, 2, 0), new THREE.Quaternion());
    const hits = [];
    game.weapons.onHit = (zombie, dmg, dir) => hits.push({ zombie, dmg, dir });
    const hs = game.weapons.hands.right;
    hs.held = w;
    w.attach({ playerId: 'local', side: 'right' });
    // Slow: blade placed into the zombie with no speed
    w.position.set(0, 2, -3);
    w.velocity.set(0, 0, 0); w.angularVelocity.set(0, 0, 0);
    hs.hasPrev = false;
    game.weapons.checkHits([z], 1 / 60);
    game.weapons.checkHits([z], 1 / 60);
    assert.equal(hits.length, 0, 'no damage from a slow touch');
    // Fast swing across the zombie: blade (pointing -Z) sweeps from x=-1.2 to x=+0.2 in one frame
    w.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    w.position.set(-1.2, 2, -3.6);
    hs.hasPrev = false;
    game.weapons.checkHits([z], 1 / 60); // previous blade position
    w.position.set(0.2, 2, -3.6);
    game.weapons.checkHits([z], 1 / 60);
    assert.equal(hits.length, 1, 'hit registered');
    assert.ok(hits[0].dmg >= 2);
    assert.ok(hits[0].dir.x > 0.9, 'knockback follows the swing');
});
