// Magic armour: ×ARMOR.MAGIC_K points (one constant) for every piece, and all of it goes on by hand and comes off.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARMOR, PIECES, makePiece, pieceMax, wearSpot } from '../../src/game/ArmorTypes.js';
import { ArmorSystem } from '../../src/game/Armor.js';
import { bodyTouch } from '../../src/input/PoseInterpreter.js';

test('magic armour lasts MAGIC_K times longer than plain — every piece, one constant', () => {
    assert.equal(ARMOR.MAGIC_K, 2);
    for (const p of PIECES) assert.equal(pieceMax(makePiece(p, { magic: true })), ARMOR.HP[p] * ARMOR.MAGIC_K);
    for (const p of PIECES) assert.equal(pieceMax(makePiece(p)), ARMOR.HP[p]);
});

test('every magic piece goes on and comes off', () => {
    const g = { character: { group: new THREE.Object3D() }, hud: { setVoice() {} }, items: { spawnLoose() {} }, inventory: null };
    const a = new ArmorSystem(g);
    for (const p of PIECES) assert.ok(a.wear(makePiece(p, { magic: true }), { quiet: true }), p);
    assert.ok(PIECES.every((p) => a.worn[p]?.magic));
    a.takeOffAll();
    assert.ok(PIECES.every((p) => !a.worn[p]));
});

test('greaves: the hero\'s hand at the thigh is enough, magic or not', () => {
    for (const magic of [false, true]) {
        const it = makePiece('legs', { magic });
        assert.ok(wearSpot(it.kind, it.piece, { x: 0.3, y: -0.4, z: -0.6 }, null));
    }
});
