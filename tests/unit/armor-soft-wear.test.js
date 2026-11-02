// Armour put on by hand is softer (the author: «надел нагрудник, но не сразу»): a wider torso, grace for noise, no putting on by a fast pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bodyTouch } from '../../src/input/PoseInterpreter.js';
import { ARMOR, wearSpot } from '../../src/game/ArmorTypes.js';
import { ArmorSystem } from '../../src/game/Armor.js';

function pose(wrist) {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
    lm[0] = { x: 0.5, y: 0.2, visibility: 1 };
    lm[11] = { x: 0.6, y: 0.35, visibility: 1 }; lm[12] = { x: 0.4, y: 0.35, visibility: 1 };
    lm[23] = { x: 0.56, y: 0.65, visibility: 1 }; lm[24] = { x: 0.44, y: 0.65, visibility: 1 };
    lm[16] = { ...wrist, visibility: 1 }; lm[15] = { x: 1 - wrist.x, y: wrist.y, visibility: 1 };
    return lm;
}

test('the chest zone: collarbone, belly, a bit to the side — all count; far aside / over the head do not', () => {
    for (const [x, y] of [[0.5, 0.45], [0.5, 0.34], [0.5, 0.55], [0.62, 0.45], [0.38, 0.5], [0.55, 0.6]]) {
        for (const side of ['right', 'left']) assert.ok(bodyTouch(pose({ x, y }), side, 1).chest, `${x},${y} ${side}`);
    }
    assert.ok(!bodyTouch(pose({ x: 0.9, y: 0.45 }), 'right', 1).chest, 'far at the side');
    assert.ok(!bodyTouch(pose({ x: 0.5, y: 0.1 }), 'right', 1).chest, 'over the head');
    assert.ok(wearSpot('armor', 'chest', { x: 0.2, y: 1.8, z: -1.0 }), 'a bit above and in front of the chest (0.6 m) counts');
});

function game(handAt) {
    const ch = { group: new THREE.Object3D(), getHandWorldPosition(side, v) { return v.set(handAt.x, handAt.y, handAt.z); } };
    const worn = [];
    const held = { right: { item: { kind: 'armor', piece: 'chest', uid: 'u1' } }, left: null };
    const g = {
        character: ch, combat: {}, hud: { setVoice() {} }, currentPose: { bodyTouch: { right: { head: false, chest: true, knee: false }, left: null } },
        items: { held, releaseHand: () => { const i = held.right.item; held.right = null; return i; }, takeIntoHand() {} },
        inventory: {},
    };
    const a = new ArmorSystem(g);
    a.wear = (it) => { worn.push(it); return true; };
    return { a, g, worn, handAt };
}
const run = (t, n, dt, f) => { for (let i = 0; i < n; i++) f(i * dt, dt); };

test('held on the chest: on in ≤ 1 s; a lost wrist for 3 frames does not reset; either hand', () => {
    const E = game({ x: 0, y: 0.9, z: -0.6 });
    run(0, 40, 1 / 30, (t, dt) => {
        if (t > 0.2 && t < 0.3) E.g.currentPose.bodyTouch.right = null; // (the wrist lost: the hero's own hand still says «at the chest»)
        else E.g.currentPose.bodyTouch.right = { head: false, chest: true, knee: false };
        E.a._handWear(dt);
    });
    assert.equal(E.worn.length, 1, 'put on');
});

test('a fast pass of the hand does not put it on; the count survives a short jitter out of the place', () => {
    const E = game({ x: 0, y: 0.9, z: -0.6 });
    run(0, 60, 1 / 30, (t, dt) => { E.handAt.x = -3 + 6 * (t / 2); E.handAt.x = (t * 30) % 2 === 0 ? 1 : -1; E.handAt.z = -0.6; E.a._handWear(dt); });
    assert.equal(E.worn.length, 0, 'a hand jumping around fast');
    const F = game({ x: 0, y: 0.9, z: -0.6 });
    F.a._wearT.right = 0.3;
    F.handAt.x = 5; F.g.currentPose.bodyTouch.right = { head: false, chest: false, knee: false };
    F.a._handWear(0.1); F.a._handWear(0.1);
    assert.ok(F.a._wearT.right >= 0.3 - 1e-9, 'within the grace the count stays');
    assert.ok(ARMOR.WEAR_T <= 0.5);
});

test('a hand that goes by (not held still) with the camera saying «no» does not put it on', () => {
    const E = game({ x: 0, y: 0.9, z: -2.5 });
    E.g.currentPose.bodyTouch.right = { head: false, chest: false, knee: false };
    run(0, 60, 1 / 30, (t, dt) => E.a._handWear(dt));
    assert.equal(E.worn.length, 0, 'arm stretched out');
});
