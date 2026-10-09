import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bladeContact, overpowers, bladePower } from '../../src/game/BladeClash.js';
import { cutPlace } from '../../src/game/Bleeding.js';
import { CollisionWorld } from '../../src/world/Collision.js';
import { WeaponSystem } from '../../src/game/Weapons.js';
import { VoxelCharacter } from '../../src/entities/Character.js';

// ------------------------------------------------------------ geometry only
test('crossing blades touch; apart they do not', () => {
    const a = bladeContact([-0.5, 0, 0.05], [0.5, 0, 0.05], [0, -0.5, 0], [0, 0.5, 0]);
    assert.ok(a.touch, 'touching');
    assert.ok(a.n[2] > 0.99, `pushed to my side ${a.n}`);
    assert.ok(Math.abs(a.depth - 0.04) < 1e-6, `depth ${a.depth}`);
    const b = bladeContact([-0.5, 0, 0.3], [0.5, 0, 0.3], [0, -0.5, 0], [0, 0.5, 0]);
    assert.ok(!b.touch);
});

test('a blade that jumped across the other within one frame is still caught', () => {
    // last frame mine was in front (+z), now it is behind: put it back in front
    const c = bladeContact([-0.5, 0, -0.2], [0.5, 0, -0.2], [0, -0.5, 0], [0, 0.5, 0], [0, 0, 1]);
    assert.ok(c.touch);
    assert.ok(Math.abs(c.depth - 0.29) < 1e-6, `depth ${c.depth}`);
    // but going past the end of the other blade is not a hit
    const d = bladeContact([-0.5, 0.9, -0.2], [0.5, 0.9, -0.2], [0, -0.5, 0], [0, 0.5, 0], [0, 0, 1]);
    assert.ok(!d.touch);
});

test('only a much stronger blow beats the other blade', () => {
    assert.ok(overpowers(bladePower(14), 14, bladePower(3)));
    assert.ok(!overpowers(bladePower(14), 14, bladePower(10)), 'two strong swings: both stop');
    assert.ok(!overpowers(bladePower(6), 6, 0), 'a slow push never goes through');
});

test('cuts go on the surface of the body part that was hit', () => {
    const head = cutPlace([0.1, 2.2, -0.9]);
    assert.equal(head.part, 'head');
    assert.deepEqual(head.normal, [0, 0, -1]);
    assert.ok(Math.abs(head.pos[2] + 0.612) < 1e-6);
    const body = cutPlace([0.9, 0.8, 0]);
    assert.equal(body.part, 'body');
    assert.deepEqual(body.normal, [1, 0, 0]);
    const leg = cutPlace([-0.3, -1, 0.6]);
    assert.equal(leg.part, 'leftLeg');
    assert.deepEqual(leg.normal, [0, 0, 1]);
});

// ------------------------------------------------- with real weapons
function setup() {
    const scene = new THREE.Scene();
    const character = new VoxelCharacter(scene);
    let t = 1000;
    const sounds = [];
    const game = {
        headless: true, scene, renderer: null, world: { collision: new CollisionWorld() }, character, localId: 'me', sync: null,
        sound: { playClang: (p) => sounds.push(p) },
        now: () => t, advance: (ms) => { t += ms; },
    };
    const ws = new WeaponSystem(game);
    // the other player's sword: standing upright
    const other = ws.spawn('sword', new THREE.Vector3(0, 3, 0), new THREE.Quaternion(), 'o1');
    other.foreignHeld = true;
    other.sleeping = true;
    other.mesh.updateMatrixWorld(true);
    const [ob, ot] = other.getBladeSegment();
    const midY = (ob.y + ot.y) / 2;
    // mine: lying along Z, its blade middle at the height of the other blade, left of it
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const mine = ws.spawn('sword', new THREE.Vector3(-0.5, 0, 0), q, 'm1');
    mine.mesh.updateMatrixWorld(true);
    let [mb, mt] = mine.getBladeSegment();
    mine.position.add(new THREE.Vector3(0, midY - (mb.y + mt.y) / 2, -(mb.z + mt.z) / 2));
    mine.mesh.updateMatrixWorld(true);
    mine.attach({ playerId: 'me', side: 'right' });
    ws.hands.right.held = mine;
    const bladeX = () => { const [b, t2] = mine.getBladeSegment(); return (b.x + t2.x) / 2; };
    const run = (fromX, toX, seconds) => {
        const n = Math.round(seconds * 60);
        for (let i = 0; i < n; i++) {
            ws.frame++;
            game.advance(1000 / 60);
            mine.drive.position.x = fromX + (toX - fromX) * Math.min(1, (i + 1) / n);
            mine.step(1 / 60, null);
            ws._bladeClash(1 / 60, game.now());
        }
    };
    ws.frame = 1;
    return { ws, mine, sounds, bladeX, run, drive: mine.drive };
}

test('my sword stops on the other player\'s sword — with a clang', () => {
    const s = setup();
    s.run(-0.5, 0.8, 0.3); // a normal swing into the other blade
    s.run(0.8, 0.8, 0.5); // keep pressing
    assert.ok(s.bladeX() < 0, `my blade stayed on its side: ${s.bladeX()}`);
    assert.ok(s.sounds.length >= 1, 'metal rang');
    assert.ok(s.mine.contactHard >= 0.02, 'the hand is held back too');
});

test('a much stronger blow goes through the other blade', () => {
    const s = setup();
    s.run(-0.5, 1.2, 0.08); // a very fast swing
    s.run(1.2, 1.2, 0.5);
    assert.ok(s.bladeX() > 0.6, `beat it aside: ${s.bladeX()}`);
    assert.ok(s.sounds.length >= 1, 'still rang');
});
