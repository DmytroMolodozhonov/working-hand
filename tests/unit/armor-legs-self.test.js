// The greaves put on at the thigh (PoseInterpreter.bodyTouch + ArmorTypes.wearSpot); «Disarmor» off myself (Armor.disarmSelf).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bodyTouch } from '../../src/input/PoseInterpreter.js';
import { wearSpot, makePiece, makeRobe, makeArchmageSuit } from '../../src/game/ArmorTypes.js';
import { ArmorSystem } from '../../src/game/Armor.js';

// a body facing the camera (image coords, y down): shoulders at y .35, hips at y .65 (or unseen)
function pose(wrist, { hips = true } = {}) {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
    lm[0] = { x: 0.5, y: 0.2, visibility: 1 };
    lm[11] = { x: 0.6, y: 0.35, visibility: 1 }; lm[12] = { x: 0.4, y: 0.35, visibility: 1 };
    lm[23] = { x: 0.56, y: 0.65, visibility: hips ? 1 : 0.05 }; lm[24] = { x: 0.44, y: 0.65, visibility: hips ? 1 : 0.05 };
    lm[16] = { ...wrist, visibility: 1 }; // (the right wrist)
    return lm;
}

test('the greaves: the hand on the thigh in front puts them on; a hand just hanging at the side does not', () => {
    const thigh = bodyTouch(pose({ x: 0.43, y: 0.72 }), 'right', 1);
    assert.ok(thigh.knee, 'on the front of the thigh');
    assert.ok(wearSpot('armor', 'legs', { x: 0.3, y: -0.4, z: -0.3 }, thigh), 'the hero\'s arm reaches there (it cannot below y −0.65)');
    const hanging = bodyTouch(pose({ x: 0.38, y: 0.68 }), 'right', 1);
    assert.ok(!hanging.knee, 'a hand hanging by the side');
    assert.ok(!wearSpot('armor', 'legs', { x: 0.7, y: -0.65, z: 0 }, hanging));
    assert.ok(!wearSpot('armor', 'legs', { x: 0.7, y: -0.65, z: 0 }), 'unseen: an arm hanging straight down is not forward of the thigh');
    // the camera sees only to the waist: the hand at the belt in front is enough
    assert.ok(bodyTouch(pose({ x: 0.46, y: 0.63 }, { hips: false }), 'right', 1).knee);
    // the chest is still the chest, not the legs
    const chest = bodyTouch(pose({ x: 0.48, y: 0.45 }), 'right', 1);
    assert.ok(chest.chest && !chest.knee);
});

function game({ up = true, mana = true } = {}) {
    const spawned = [];
    const g = {
        localId: 'me', _lastDuelCast: 0,
        character: { group: new THREE.Object3D(), head: new THREE.Object3D(), torso: new THREE.Object3D(), leftLegPivot: new THREE.Object3D() },
        combat: { check: () => (mana ? null : 'мало маны'), pay(n) { this.paid = n; } },
        items: { auth: true, spawnLoose: (it) => spawned.push(it) },
        hud: { setVoice() {} },
        spawned, up,
    };
    return g;
}

test('«Disarmor» with the wand up: my plain steel and plain robe drop by me; magic ones and the High Mage\'s suit stay', () => {
    const g = game();
    const a = new ArmorSystem(g);
    const magicHelm = makePiece('helmet'); magicHelm.magic = true;
    a.worn = { helmet: magicHelm, chest: makePiece('chest'), legs: makePiece('legs'), robe: makeRobe(false) };
    assert.equal(a.disarmSelf(true), 'Disarmor');
    assert.equal(g.combat.paid, 'Disarmor');
    assert.equal(a.worn.chest, null); assert.equal(a.worn.legs, null); assert.equal(a.worn.robe, null);
    assert.equal(a.worn.helmet, magicHelm);
    assert.equal(g.spawned.length, 3, 'the pieces lie by me as things');

    const g2 = game(); const b = new ArmorSystem(g2);
    const suit = makeArchmageSuit();
    b.worn = { helmet: null, chest: null, legs: null, robe: suit };
    assert.equal(b.disarmSelf(true), null);
    assert.equal(b.worn.robe, suit);
    assert.equal(g2.combat.paid, undefined, 'nothing taken off — no mana');
});
