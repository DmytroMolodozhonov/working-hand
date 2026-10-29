// A weapon over the shoulder (axe, sword…): into a cell and back, never lost when the cells are full, its id never doubled.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Inventory, behindBack } from '../../src/game/Inventory.js';

function game() {
    const forgot = [], removed = [], toasts = [];
    const w = { id: 'cX', type: 'axe', magic: true, bonus: 30 };
    const g = {
        dom: 'right',
        hud: { toast: (t) => toasts.push(t), setVoice: () => {} },
        fx: { spark: () => {} },
        character: { getActiveHands: () => ({}), getGripObject: () => ({ getWorldPosition: (v) => v.set(0, 0, 0) }), getHandWorldPosition: (s, v) => v.set(0, 1, 0), group: { position: new THREE.Vector3() } },
        weapons: { hands: { right: { held: w }, left: { held: null } }, byId: new Map([[w.id, w]]), _forget: (s) => { forgot.push(s); g.weapons.hands[s].held = null; }, remove: (x) => removed.push(x) },
        items: { held: { right: null, left: null } },
    };
    g.inventory = new Inventory(g);
    return { g, w, forgot, removed, toasts };
}

test('back: an axe goes into a cell, the world copy is removed', () => {
    const { g, w, removed } = game();
    assert.ok(g.inventory._storeWeapon(w));
    assert.deepEqual(removed, [w]);
    assert.equal(g.inventory.slots.filter((s) => s?.kind === 'weapon').length, 1);
    assert.ok(g.inventory.hasWeaponId('cX'));
});

test('back: no free cell — the axe STAYS in the hand (not forgotten, not removed), with a toast', () => {
    const { g, w, forgot, removed, toasts } = game();
    g.inventory.slots.fill({ kind: 'meat', count: 10, from: 'pig' });
    assert.equal(g.inventory._storeWeapon(w), false);
    assert.equal(forgot.length, 0);
    assert.equal(removed.length, 0);
    assert.equal(g.weapons.hands.right.held, w);
    assert.ok(toasts.length);
});

test('back: drawing it again never reuses an id another weapon in the world has', () => {
    const { g, w } = game();
    assert.equal(g.inventory._freeWeaponId('cX'), undefined); // (w is in the world)
    assert.equal(g.inventory._freeWeaponId('zz'), 'zz');
});

test('back: the gesture accepts a hand a bit lower / slower, not a raised-in-front or hanging one', () => {
    assert.ok(behindBack({ x: 0.5, y: 1.5, z: 0 }, 2.5));
    assert.ok(!behindBack({ x: 0.5, y: 1.8, z: -0.9 }, 0.5));
    assert.ok(!behindBack({ x: 0.5, y: 0.2, z: 0.2 }, 0.5));
});
