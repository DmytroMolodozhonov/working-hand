import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bladeContact, overpowers, bladePower, sweptBladeContact } from '../../src/game/BladeClash.js';
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

// ------------------------------------------- fast swings, bodies, thrusts
test('a blade that went right through the other one between two frames is caught on the way', () => {
    // last frame far on one side, now far on the other: the end poses don't touch at all
    const c = sweptBladeContact([-0.5, -0.6, 0], [0.5, -0.6, 0.9], [-0.5, 0.6, 0], [0.5, 0.6, 0.9], [0, 0, -0.5], [0, 0, 1.5], [0, 0, -0.5], [0, 0, 1.5]);
    assert.ok(c.touch, 'caught');
    assert.ok(c.n[1] < -0.9, `put back where it came from: ${c.n}`);
    assert.ok(c.depth > 0.5, `depth ${c.depth}`);
    const miss = sweptBladeContact([-0.5, -0.6, 3], [0.5, -0.6, 3], [-0.5, 0.6, 3], [0.5, 0.6, 3], [0, 0, -0.5], [0, 0, 1.5], [0, 0, -0.5], [0, 0, 1.5]);
    assert.ok(!miss.touch, 'passing beyond its end is not a contact');
});

function bodySetup() {
    const s = setup();
    s.ws.weapons.splice(s.ws.weapons.findIndex((w) => w.id === 'o1'), 1); // (no other blade here)
    s.ws.byId.delete('o1');
    const group = new THREE.Group();
    s.ws.game.scene.add(group);
    // (a body as a capsule round its axis; real people's trunk, skull and bones: dismember.test.js)
    const z = { group, isDead: false, damageCooldown: 0, bodyCapsule: (out) => { out.a.set(group.position.x, group.position.y - 1.5, group.position.z); out.b.set(group.position.x, group.position.y + 2.2, group.position.z); out.r = 0.5; return out; } };
    const hits = [];
    s.ws.onHit = (t, dmg) => hits.push(dmg);
    s.ws.game.character.group.position.set(-3, 0, 0);
    const swing = (axis, from, to, seconds) => {
        const n = Math.max(1, Math.round(seconds * 60));
        for (let i = 0; i < n; i++) {
            s.ws.frame++;
            s.ws.game.advance(1000 / 60);
            if (s.mine.drive) s.mine.drive.position[axis] = from + (to - from) * Math.min(1, (i + 1) / n);
            if (!s.mine.stuckIn) s.mine.step(1 / 60, null);
            s.ws.checkHits([z], 1 / 60);
            z.damageCooldown = 0;
        }
    };
    return { ...s, z, hits, swing };
}

test('my blade does not go through a body: it hits and stops on it', () => {
    const s = bodySetup();
    s.mine.position.set(-1.5, s.mine.position.y - 3, 0); // (the blade at the chest, left of the body)
    s.drive.position.copy(s.mine.position);
    s.mine.mesh.updateMatrixWorld(true);
    s.swing('x', -1.5, 1.5, 0.25); // a slash through the body
    s.swing('x', 1.5, 1.5, 0.3); // and keep pressing
    assert.ok(s.hits.length >= 1, 'it hit');
    assert.ok(s.bladeX() < -0.3, `the blade stayed on its side of the body: ${s.bladeX()}`);
    assert.ok(s.mine.bodyStops > 0 && s.mine.contactHard >= 0.02, 'stopped, the hand held back too');
});

test('a thrust goes into the body and stays there, still in the hand', () => {
    const s = bodySetup();
    // point forward (+X), at the belly, 1.6 m before the body
    s.mine.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
    s.mine.position.set(-2.4, 0.4, 0);
    s.mine.mesh.updateMatrixWorld(true);
    s.drive.position.copy(s.mine.position);
    s.drive.quaternion.copy(s.mine.quaternion);
    s.swing('x', -2.4, -0.6, 0.2);
    assert.ok(s.mine.stuckIn, 'stuck in the body');
    assert.equal(s.ws.hands.right.held, s.mine, 'still in my hand');
    assert.equal(s.mine.holder.side, 'right');
    assert.ok(s.hits.some((d) => d >= 2), 'a run-through hurts double');
    // the body moves: the blade goes with it
    const x0 = s.mine.position.x;
    s.z.group.position.x += 1;
    s.ws._updateStuck();
    assert.ok(Math.abs(s.mine.position.x - x0 - 1) < 1e-6, 'moves with the body');
    // the hand moves a little: the blade stays in, the hand stays on its handle
    const hs = s.ws.hands.right;
    s.ws._driveHeld = () => {}; // (the hand's place is set right here)
    const into = new THREE.Vector3(1, 0, 0);
    s.drive.position.copy(s.mine.position).addScaledVector(into, -s.mine.stuckIn.gap).add(new THREE.Vector3(0, 0.1, 0.1));
    s.ws._holdStuck('right', hs, s.mine, 1 / 60, s.ws.game.character, 1, true);
    assert.ok(s.mine.stuckIn, 'a small move does not pull it out');
    // drawn back along the blade: it comes out, in the hand again
    s.drive.position.addScaledVector(into, -0.4);
    s.ws._holdStuck('right', hs, s.mine, 1 / 60, s.ws.game.character, 1, true);
    assert.ok(!s.mine.stuckIn, 'pulled out');
    assert.equal(hs.held, s.mine);
    // (the victim pulls it out of the body while my hand still holds it: it stays in my hand)
    s.ws._stick(s.mine, s.z, hs, true);
    s.ws._unstick(s.mine, true);
    assert.ok(!s.mine.stuckIn);
    assert.equal(s.mine.holder.side, 'right', 'still held after it came out');
    assert.ok(s.mine.drive, 'follows the hand again');
    // the hand let go while it is in: it stays in the body
    s.ws._stick(s.mine, s.z, s.ws.hands.right, true);
    s.ws.release('right');
    assert.ok(s.mine.stuckIn, 'stays in');
    assert.equal(s.ws.hands.right.held, null);
    assert.ok(s.mine.holder.stuck);
});
