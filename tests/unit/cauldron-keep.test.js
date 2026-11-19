// Things the player sets up near his house stay (the author 19.11: «поставил чан возле дома — не должен пропасть, боюсь какой-то очистки игры»):
// a cauldron put anywhere is saved and comes back; the cave clean-up (_unloadCaves) takes only a forgotten cave cauldron nobody touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Cauldrons } from '../../src/game/Cauldrons.js';

function fake() {
    const scene = new THREE.Scene();
    const collision = { addBox: () => 1, removeBox() {}, groundAt: () => 0, groundY: () => 0, resolveCylinder: (p) => p };
    const g = { scene, collision, authority: true, config: {}, character: { group: { position: new THREE.Vector3(0, 0, 0) } }, items: { loose: new Map() }, liquidation: { isGone: () => false }, hud: {}, sync: null, world: { data: { groundY: () => 0 } } };
    g._playerPositions = () => [new THREE.Vector3(5000, 0, 5000)]; // (the player flew far away)
    return { g, c: new Cauldrons(g) };
}

test('a cauldron put by the house: saved, loaded back, never put away by the cave clean-up', () => {
    const { g, c } = fake();
    c.spawn({ id: 'home1', x: 40, y: 0, z: 40, yaw: 0, tilt: 0, tdir: 0, old: false });
    c._unloadCaves();
    assert.ok(c.list.has('home1'), 'no cave: stays when everybody is far');
    const snap = JSON.parse(JSON.stringify(c.snapshot()));
    const { c: c2 } = fake();
    c2.restore(snap);
    assert.ok(c2.list.has('home1'), 'comes back after a save');
    assert.equal(Math.round(c2.list.get('home1').x), 40);
    void g;
});

test('a cave\'s forgotten cauldron: put away when far, but one somebody touched (carried home, filled) stays', () => {
    const { c } = fake();
    c.spawn({ id: 'cave:a', x: 400, y: 0, z: 400, yaw: 0, tilt: 0, tdir: 0, old: true }).cave = 7;
    c.spawn({ id: 'cave:b', x: 500, y: 0, z: 500, yaw: 0, tilt: 0, tdir: 0, old: true }).cave = 8;
    c.list.get('cave:b').touched = true;
    c._unloadCaves();
    assert.ok(!c.list.has('cave:a'), 'untouched: put away');
    assert.ok(c.list.has('cave:b'), 'touched: stays');
});
