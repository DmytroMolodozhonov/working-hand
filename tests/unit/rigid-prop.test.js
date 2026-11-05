/**
 * RigidProp — the default physics of a loose solid thing (the author 05.11: body parts after «Пилбидрио» had no real physics; things
 * hung in the air after «Бомбардо»). A long piece dropped on its end tips over and lies flat by itself; a sleeping one falls when the
 * ground under it is blown away; it never goes through the ground or a wall.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RigidProp, RIGID } from '../../src/game/RigidProp.js';

const stick = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.25))); // (a forearm: long along y)
    return g;
};
const run = (b, world, sec) => { for (let t = 0; t < sec; t += 1 / 60) { b.step(1 / 60, world); b.obj.updateMatrixWorld(true); } };

test('dropped on its end, a long piece tips over and lies flat on the ground (no hanging, no standing on end)', () => {
    const o = stick();
    o.position.set(0, 3, 0);
    o.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.12); // (nearly upright)
    const world = { ground: () => 0, blocked: () => false };
    const b = new RigidProp(o, { vel: new THREE.Vector3(0.3, 0, 0) });
    run(b, world, 6);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion);
    assert.ok(Math.abs(up.y) < 0.35, 'lies along the ground: its long side ' + up.y.toFixed(2));
    let low = Infinity; for (let i = 0; i < 8; i++) low = Math.min(low, b.corner(i, new THREE.Vector3()).y);
    assert.ok(low > -0.06 && low < 0.1, 'on the ground, not in it, not over it: ' + low.toFixed(3));
    assert.ok(b.sleeping, 'comes to rest');
});

test('asleep on the ground, the ground blown away under it: it falls to the new floor', () => {
    const o = stick();
    o.position.set(0, 0.5, 0);
    o.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    let floor = 0;
    const world = { ground: () => floor, blocked: () => false };
    const b = new RigidProp(o);
    run(b, world, 3);
    assert.ok(b.sleeping);
    floor = -4; // (a crater)
    run(b, world, 4);
    assert.ok(o.position.y < -3, 'fell into the crater: ' + o.position.y.toFixed(2));
    assert.ok(RIGID.CHECK_T <= 0.5);
});

test('thrown at a wall, it does not go through it', () => {
    const o = stick();
    o.position.set(0, 1.5, 0);
    const world = { ground: () => 0, blocked: (x) => x > 2 };
    const b = new RigidProp(o, { vel: new THREE.Vector3(12, 2, 0), spin: new THREE.Vector3(0, 0, 6) });
    run(b, world, 3);
    assert.ok(o.position.x < 2.2, 'stopped by the wall: ' + o.position.x.toFixed(2));
});
