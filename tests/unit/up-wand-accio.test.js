// «Up» throws me up from the ground; a blow never knocks the wand out of my hand; a wand lying in the
// snow / under new ice comes up within reach; «Акцио» brings the thing into the leading hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { inAir } from '../../src/entities/Character.js';
import { UP } from '../../src/game/UpSpell.js';
import { accioCatcher } from '../../src/game/Accio.js';
import { BodyImpact } from '../../src/game/BodyImpact.js';
import { holdsFast } from '../../src/game/HandRelease.js';
import { ItemSystem as Items } from '../../src/game/Items.js';

test('«Up» from the floor: the push is not taken back by the floor at once', () => {
    // standing exactly on the floor, thrown up just now
    assert.equal(inAir(2, 2, false, false, UP.VY), true);
    assert.equal(inAir(2, 2, true, false, UP.VY), true); // (even crouching)
    // standing still: stands
    assert.equal(inAir(2, 2, false, false, 0), false);
    // the arc: from the floor with VY under the body's gravity 20, it goes well up (a big leap)
    let y = 0, vy = UP.VY, top = 0;
    for (let i = 0; i < 400 && inAir(y, 0, false, false, vy); i++) { vy -= 20 / 60; y = Math.max(0, y + vy / 60); top = Math.max(top, y); }
    assert.ok(top > 8, `top ${top}`);
});

test('«Акцио»: into the leading hand when free, the other only when it is busy', () => {
    const free = (busy) => (s) => !busy.includes(s);
    assert.equal(accioCatcher(free([]), 'right'), 'right');      // right-handed, pointing with either: right
    assert.equal(accioCatcher(free(['right']), 'right'), 'left'); // the right busy: the left
    assert.equal(accioCatcher(free([]), 'left'), 'left');         // left-handed: mirrored
    assert.equal(accioCatcher(free(['left']), 'left'), 'right');
    assert.equal(accioCatcher(free(['left', 'right']), 'right'), null);
});

test('a blast / a blow that staggers me: the wand stays in the hand for a while after', () => {
    const ch = { group: { position: new THREE.Vector3(), rotation: { y: 0 } }, isCrouching: false };
    const calls = [];
    const g = {
        character: ch, knockback: new THREE.Vector3(), fx: {},
        combat: { dead: false, shieldFactor: () => 0, center: (v) => v.set(0, 1, 0) },
        knock: { knock: () => calls.push('knock'), stagger: () => calls.push('stagger') },
    };
    const imp = new BodyImpact(g);
    assert.equal(holdsFast(ch), false);
    const res = imp.apply({ v: new THREE.Vector3(6, 0, 0), from: new THREE.Vector3(-3, 1, 0), spell: 'Bombardo', blast: true });
    assert.notEqual(res, 'none');
    assert.equal(holdsFast(ch), true);
});

test('a thing lying still: buried by new ice it comes up on top; the ground blown away under it, it falls', () => {
    let top = 0;
    const it = Object.create(Items.prototype);
    it.game = {
        collision: { groundAt: () => top, pointBlocked: (x, y) => y < top },
        handBlocks: null,
    };
    const L = { model: { position: new THREE.Vector3(0, 0.12, 0) }, rest: true, sentRest: true };
    top = 1; // ice grew a block over it
    it._restCheck(L, 0.6);
    assert.ok(L.model.position.y >= 1.1, `y ${L.model.position.y}`);
    assert.equal(L.rest, true);
    assert.equal(L.sentRest, false);
    top = -2; // a crater under it
    it._restCheck(L, 0.6);
    assert.equal(L.rest, false);
});

test('the wand stays in the hand: an arm stretched out a little to the left (at the camera) is not at the belt', async () => {
    const { beltPose } = await import('../../src/input/PoseInterpreter.js');
    const { frame } = await import('../e2e/poses.mjs');
    // the real tuck still counts
    assert.equal(beltPose(frame({ arms: 'hang', belt: 'right' }).poseLandmarks, 'right').at, true);
    // the right arm straight out at the camera, a little to the left and down: the camera sees the upper
    // arm short, the wrist over the belly, the elbow put a little off the line (bent, as the camera guesses it)
    const lm = frame({ arms: 'forward' }).poseLandmarks;
    lm[14] = { x: 0.41, y: 0.52, z: -0.3, visibility: 0.9 };
    lm[16] = { x: 0.52, y: 0.66, z: -0.6, visibility: 0.9 };
    const b = beltPose(lm, 'right');
    assert.equal(b.at, false);
    assert.equal(b.near, false);
});

test('the other hand taking a thing out of the pocket never puts the wand of the leading hand into a slot', async () => {
    const { Inventory } = await import('../../src/game/Inventory.js');
    const wand = { kind: 'wand', uid: 'w1' }, bread = { kind: 'bread', uid: 'b1' };
    const held = { right: { item: wand }, left: null };
    const released = [];
    const inv = Object.create(Inventory.prototype);
    inv.game = {
        dom: 'right',
        items: { held, releaseHand: (s) => { released.push(s); const it = held[s]?.item; held[s] = null; return it; }, takeIntoHand: (it, s) => { held[s] = { item: it }; return true; } },
        weapons: { hands: { left: {}, right: {} } },
    };
    inv.slots = [bread, null, null, null, null];
    inv.selected = 1;
    inv.inHand = { kind: 'item', item: wand, side: 'right' }; // (the wand was chosen from the slots)
    inv._render = () => {};
    inv.storeItem = () => true;
    inv.select(0, 'left'); // the left hand into the pocket: the bread
    assert.deepEqual(released, []);
    assert.equal(held.right.item, wand);
    assert.equal(held.left.item, bread);
});

test('a hand with the wand resting on the ground / its tip in the slope: the wand stays in the hand', async () => {
    const { TOUCH_MS } = await import('../../src/game/Items.js');
    let ground = -10, pushed = 0;
    const it = Object.create(Items.prototype);
    it.game = { handBlocks: { pushed: { left: 0, get right() { return pushed; } }, solid: (x, y) => y < ground } };
    const model = new THREE.Object3D(); model.position.set(0, 1, 0); model.updateMatrixWorld(true);
    const h = { model, shape: { c: new THREE.Vector3(), y0: -0.05, y1: 0.35 } };
    assert.equal(it._touching('right', h, 1000), false, 'in the air: free');
    pushed = 0.1; // the hand held back by the ground
    assert.equal(it._touching('right', h, 2000), true);
    pushed = 0;
    assert.equal(it._touching('right', h, 2000 + TOUCH_MS - 1), true, 'a moment after, still');
    assert.equal(it._touching('right', h, 2000 + TOUCH_MS + 1), false);
    ground = 1.2; // the wand's tip in the slope
    assert.equal(it._touching('right', h, 9000), true);
});
