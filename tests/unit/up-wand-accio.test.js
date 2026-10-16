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
