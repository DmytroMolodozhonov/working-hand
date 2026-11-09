import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { backAllowed, BACK_HOLD } from '../../src/game/BackInteraction.js';
import { ItemSystem, BACKPACK_WEAR, backpackSpot } from '../../src/game/Items.js';
import { Inventory } from '../../src/game/Inventory.js';

function pack(dom = 'right') {
    const A = Object.create(ItemSystem.prototype), hints = [];
    const ch = { isRunning: false, group: { position: new THREE.Vector3() } };
    const item = { kind: 'wand', uid: 'wand' }, magic = { kind: 'backpack', magic: true, store: [] };
    A.game = { dom, character: ch, currentPose: {}, hud: { toast(t) { hints.push(t); } } };
    A.worn = { backpack: { item: magic } };
    A.held = { left: null, right: null };
    A._handAtBack = () => true;
    A.releaseHand = (side) => { const i = A.held[side]?.item; A.held[side] = null; return i; };
    return { A, ch, item, magic, hints };
}

test('running in place, moving, stepping or flying: no interaction behind the back', () => {
    for (const game of [ { character: { isRunning: true } }, { currentPose: { isRunning: true } }, { character: { stepping: 0.4 } }, { flight: { active: true } } ]) assert.equal(backAllowed(game), false);
    assert.equal(backAllowed({ character: { isRunning: false } }), true);
    assert.ok(BACK_HOLD >= 1 && BACKPACK_WEAR.T >= 1 && BACKPACK_WEAR.T_OFF >= 1 && BACKPACK_WEAR.STASH_T >= 1);
    let gestures = 0;
    Inventory.prototype._backGesture.call({ game: { character: { isRunning: true } }, monsterShut: () => false, _backThing() { gestures++; } }, 'left');
    assert.equal(gestures, 0, 'the weapon path is blocked as well');
});

test('wand into magic pack: only the secondary hand, for a full second, mirrored for left-handers', () => {
    for (const dom of ['right', 'left']) {
        const { A, ch, item, magic, hints } = pack(dom), off = dom === 'right' ? 'left' : 'right';
        A.held[dom] = { item };
        A._stash(2, ch);
        assert.equal(magic.store.length, 0);
        assert.ok(A.held[dom] && hints.some(t => t.includes('дочерней')));
        A.held[dom] = null; A.held[off] = { item };
        A._stash(0.9, ch);
        assert.equal(magic.store.length, 0);
        A._stash(0.11, ch);
        assert.equal(magic.store[0], item);
        assert.equal(A.held[off], null);
    }
});

test('movement or leaving the back cancels the hold; separate reaches cannot add up to a second', () => {
    const { A, ch, item, magic } = pack();
    A.held.left = { item };
    A._stash(0.8, ch);
    ch.isRunning = true;
    A._stash(5, ch);
    ch.isRunning = false;
    A._stash(0.3, ch);
    assert.equal(magic.store.length, 0, 'must start over after running');
    A._handAtBack = () => false;
    A._stash(0.1, ch);
    A._handAtBack = () => true;
    A._stash(0.8, ch);
    assert.equal(magic.store.length, 0, 'must start over after taking the hand away');
    A._stash(0.21, ch);
    assert.equal(magic.store.length, 1);
});

test('running cancels taking off, putting on and stashing a backpack immediately', () => {
    const { A, ch } = pack();
    A._wearT = A._offT = 0.95; A._stashT = { left: 0.95, right: 0.95 };
    A.game.currentPose.isRunning = true;
    A._wear(0.05, ch);
    assert.equal(A._wearT, 0); assert.equal(A._offT, 0);
    assert.equal(A._stashT.left, 0); assert.equal(A._stashT.right, 0);
});

test('lowered hands cannot touch the backpack even when depth tracking puts them slightly behind the torso', () => {
    for (const sign of [-1, 1]) for (const z of [0.12, 0.3, 0.6, 0.9]) {
        assert.equal(backpackSpot(new THREE.Vector3(sign, -1.2, z), new THREE.Vector3(-sign, -1.2, z), new THREE.Vector3(sign * 0.7, 0.5, 0)), null);
    }
});

for (const magic of [false, true]) test(`one reach cannot repeatedly remove and wear a backpack while the hand stays still (magic: ${magic})`, () => {
    const A = Object.create(ItemSystem.prototype), group = new THREE.Group();
    const hands = { right: new THREE.Vector3(0.8, 0.2, 0.6), left: new THREE.Vector3(-1, -1.2, -0.3) };
    const right = new THREE.Object3D(), left = new THREE.Object3D();
    right.position.set(0.7, 0.5, 0); left.position.set(-0.7, 0.5, 0); group.add(right, left);
    const ch = { group, rightArmAnchor: right, leftArmAnchor: left, getHandWorldPosition: (s, v) => v.copy(hands[s]) };
    A.game = { character: ch, currentPose: {}, scene: new THREE.Scene(), inventory: { setExtraSlots() {} }, hud: {} };
    A.worn = { backpack: { item: { kind: 'backpack', magic }, model: new THREE.Group() } };
    A.held = { right: null, left: null }; A._stash = () => {}; A._packLocked = () => false;
    A.takeIntoHand = (item, side) => { A.held[side] = { item, side }; return true; };
    A.heldOf = () => A.held.right;
    A.releaseHand = side => { const item = A.held[side].item; A.held[side] = null; return item; };
    let worn = 0; A.wear = () => { worn++; };
    A._wear(1.3, ch);
    assert.equal(A.worn.backpack, null); assert.ok(A.held.right);
    for (let i = 0; i < 100; i++) A._wear(0.1, ch);
    assert.equal(worn, 0, 'a still hand cannot automatically wear it again after the cooldown');
    hands.right.set(1, -1.2, 0.3); A._wear(0.1, ch);
    hands.right.set(0.8, 0.2, 0.6); A._wear(0.9, ch);
    assert.equal(worn, 0, 'the deliberate new reach still requires the full hold');
    A._wear(0.11, ch); assert.equal(worn, 1);
});
