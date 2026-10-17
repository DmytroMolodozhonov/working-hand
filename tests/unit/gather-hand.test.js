import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DeathSystem } from '../../src/game/Death.js';
import { Inventory } from '../../src/game/Inventory.js';
import { Beds } from '../../src/game/Beds.js';
import { BLOCK } from '../../src/world/Terrain.js';

// a game with a wand in the right hand and armour lying on the ground 3 m ahead
function fakeGame() {
    const picked = [];
    const armor = { kind: 'armor', uid: 'a1', piece: 'chest' };
    const L = { item: armor, model: { position: new THREE.Vector3(3, 0.2, 0) } };
    const g = {
        dom: 'right',
        authority: true,
        items: { auth: true, loose: new Map([['a1', L]]), held: { right: { item: { kind: 'wand' } }, left: null }, pickUp: (uid, to, side) => picked.push({ uid, side }) },
        weapons: { weapons: [], hands: { left: {}, right: {} } },
        hud: { toast() {}, setVoice() {} },
        fx: { spark() {} },
    };
    return { g, picked };
}

test('Gather at armour: the armour (not the ground) into the free hand — never the wand hand', () => {
    const { g, picked } = fakeGame();
    const d = new DeathSystem(g);
    const o = new THREE.Vector3(0, 1.4, 0);
    const dir = new THREE.Vector3(3, -1.2, 0).normalize();
    const hint = d.gatherAt([{ o, d: dir }], null, 'left');
    assert.ok(hint?.startsWith('✨'), 'a thing was gathered (the blocks are left alone): ' + hint);
    assert.deepEqual(picked, [{ uid: 'a1', side: 'left' }]);
    // both hands busy: into a slot
    const b = fakeGame();
    new DeathSystem(b.g).gatherAt([{ o, d: dir }], null, null);
    assert.deepEqual(b.picked, [{ uid: 'a1', side: 'slot' }]);
});

test('the chosen resource is never in the hand with the wand, and leaves the hand as a heap', () => {
    const { g } = fakeGame();
    const inv = new Inventory(g);
    inv.addResource(BLOCK.DIRT, 30);
    inv.selected = 0;
    inv._takeIntoHand();
    assert.equal(inv.resSide(), 'left', 'the wand is in the right hand');
    g.items.held.left = { item: { kind: 'apple' } };
    assert.equal(inv.resSide(), null, 'both hands busy: in no hand');
    g.items.held.left = null;
    // thrown / let go: earth leaves the hand like any thing
    const spawned = [];
    const grip = { getWorldPosition: (v) => v.set(0, 1, 0) };
    Object.assign(g, { inventory: inv, character: { getGripObject: () => grip, getHandDirection: (s, v) => v.set(1, 0, 0) } });
    const beds = Object.create(Beds.prototype);
    beds.game = g; // (no sync: this computer decides — Beds.auth)
    g.items.spawnLoose = (item) => { spawned.push(item); return {}; };
    const it = beds.throwWood(null, 'left');
    assert.equal(it.kind, 'blocks');
    assert.equal(it.block, BLOCK.DIRT);
    assert.equal(inv.slots[0].count, 20);
    assert.equal(spawned.length, 1);
});
