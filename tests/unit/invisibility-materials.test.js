import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Invisibility } from '../../src/game/Invisibility.js';

// Invisible hero must never change a material that anyone else uses (knights, shared swords…).
describe('Invisibility: own materials only', () => {
    const shared = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const knight = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
    const heroGroup = new THREE.Group();
    const own = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xff0000 }));
    const armour = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared); // same material as the knight's
    heroGroup.add(own, armour);
    const sword = new THREE.Group(); sword.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared));
    const game = { character: { group: heroGroup }, items: { held: { left: null, right: { model: sword } } }, localId: 'me' };

    it('shared materials stay untouched, the hero is faint, all is given back', () => {
        const inv = new Invisibility(game);
        const orig = own.material;
        inv._fade(true);
        assert.equal(shared.transparent, false);
        assert.equal(shared.opacity, 1);
        assert.notEqual(armour.material, shared);
        assert.ok(Math.abs(armour.material.opacity - 0.28) < 1e-6);
        assert.ok(Math.abs(sword.children[0].material.opacity - 0.28) < 1e-6);
        // let go of the sword: its look comes back
        game.items.held.right = null;
        inv._fadeHeld();
        assert.equal(sword.children[0].material, shared);
        inv._fade(false);
        assert.equal(own.material, orig);
        assert.equal(armour.material, shared);
        assert.equal(knight.material.transparent, false);
        assert.equal(shared.opacity, 1);
        assert.equal(shared.depthWrite, true);
    });

    it('on / off many times collects nothing', () => {
        const inv = new Invisibility(game);
        for (let i = 0; i < 50; i++) { inv._fade(true); inv._fadeHeld(); inv._fade(false); }
        assert.equal(inv._body, null);
        assert.equal(inv._heldFaded, null);
        assert.equal(own.material.opacity, 1);
    });
});

// A castle must not fall asleep (its people vanish) round an invisible hero: «Invisible» only blinds the minds.
import { CastleLife } from '../../src/game/CastleLife.js';
describe('Invisibility: the castle stays awake', () => {
    it('_players() has the invisible hero, perceived list does not', () => {
        const pos = { x: 5, y: 2, z: 7 };
        const game = { localId: 'me', isDeadLocal: false, combat: {}, character: { group: { position: pos } }, remotes: new Map(),
            invis: { aiPos: () => null } };
        const L = Object.create(CastleLife.prototype); L.game = game;
        assert.equal(L._players().length, 1);
        assert.equal(L._players(true).length, 0);
    });
});
