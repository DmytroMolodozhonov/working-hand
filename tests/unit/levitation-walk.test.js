// Walking with a thing in the air does not drop it (the author 19.11): the body's motion moves the hand against the body — no jerk then (Levitation._jerked).
// Only a quick, far jerk of the hand while the hero stands still breaks the spell, as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Levitation, LEVITATE } from '../../src/game/Levitation.js';

function rig() {
    const pos = new THREE.Vector3(), hand = new THREE.Vector3(0, 1, 1);
    const ch = { group: { position: pos, quaternion: new THREE.Quaternion() }, isRunning: false, stepping: 0, jumpAir: false, getHandWorldPosition: (side, out) => out.copy(hand).add(pos) };
    const lev = Object.create(Levitation.prototype); lev._t = 10;
    const s = { side: 'right', history: [], age: 5 };
    const step = (dt, { move = 0, jerk = 0 } = {}) => { lev._t += dt; pos.z -= move * dt; hand.x += jerk; return lev._jerked(s, ch); };
    return { ch, hand, pos, step, s, lev };
}

test('standing: a far quick jerk of the hand drops it (as always); a slow movement does not', () => {
    const r = rig();
    for (let i = 0; i < 20; i++) assert.equal(r.step(0.05), false);
    let broke = false;
    for (let i = 0; i < 6; i++) broke = r.step(0.05, { jerk: 0.2 }) || broke;
    assert.ok(broke, '1.2 m in 0.3 s is a jerk');
    const q = rig();
    for (let i = 0; i < 40; i++) assert.equal(q.step(0.05, { jerk: 0.01 }), false, 'slow: no');
});

test('walking: the hand moving about against the body is no jerk — the thing stays up', () => {
    const r = rig();
    for (let i = 0; i < 20; i++) r.step(0.05);
    for (let i = 0; i < 40; i++) assert.equal(r.step(0.05, { move: 6, jerk: i % 2 ? 0.4 : -0.4 }), false, 'step ' + i);
});

test('running / stepping in place / a jump also count as moving; after the hero stops, a short quiet, then the watch is on again', () => {
    for (const flag of ['isRunning', 'jumpAir']) {
        const r = rig(); r.ch[flag] = true;
        for (let i = 0; i < 10; i++) assert.equal(r.step(0.05, { jerk: 0.5 }), false, flag);
    }
    const r = rig(); r.ch.stepping = 0.6;
    for (let i = 0; i < 6; i++) assert.equal(r.step(0.05, { jerk: 0.5 }), false, 'stepping');
    r.ch.stepping = 0;
    assert.equal(r.step(0.05, { jerk: 0.5 }), false, 'the quiet after he stopped');
    for (let i = 0; i < 12; i++) r.step(0.05);
    let broke = false;
    for (let i = 0; i < 6; i++) broke = r.step(0.05, { jerk: 0.2 }) || broke;
    assert.ok(broke, 'standing again: a jerk drops it');
    assert.ok(LEVITATE.MOVE_QUIET > 0);
});
