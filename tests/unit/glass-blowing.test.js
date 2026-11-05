/**
 * «Create a Flask» (the author 05.11): 5 sand a flask (10 → 2), or 1 glass shard a flask — in the slots, sand blocks under the wand, or
 * shards lying where the wand points. The flasks go into the slots (a stack holds 5); nothing is taken when there is too little.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GlassBlowing, FLASK, flasksFromSlots } from '../../src/game/GlassBlowing.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('the slots: 10 sand → 2 flasks, 7 sand → 1, glass 1 each', () => {
    const sand = (n) => ({ kind: 'res', block: BLOCK.SAND, count: n });
    assert.equal(flasksFromSlots([sand(10)]).n, 2);
    assert.equal(flasksFromSlots([sand(7)]).n, 1);
    assert.equal(flasksFromSlots([sand(4)]).n, 0);
    assert.deepEqual(flasksFromSlots([{ kind: 'glass', count: 3 }, sand(5)]), { n: 4, glass: 3, sand: 5 });
    assert.equal(flasksFromSlots([sand(64), sand(64)]).n, FLASK.MAX, 'at most MAX a cast');
});

function fakeGame(slots, creative = false) {
    const stored = [];
    const g = {
        localId: 'me', authority: true, config: { mode: creative ? 'creative' : 'survival' }, scene: new THREE.Scene(),
        builder: { _hand: () => ({ o: new THREE.Vector3(0, 3, 0), d: new THREE.Vector3(1, 0, 0) }), _hitCell: () => null, _flood: () => [] },
        terrain: { raycast: () => null }, items: { loose: new Map() },
        inventory: { slots, take: (s, k) => { s.count -= k; if (s.count <= 0) slots[slots.indexOf(s)] = null; }, storeItem: (it) => { stored.push(it); return true; } },
        hud: { setVoice() {} },
    };
    return { g, stored };
}

test('cast from the slots: the sand used, the flasks in the slots (in fives)', () => {
    const slots = [{ kind: 'res', block: BLOCK.SAND, count: 12 }, null];
    const { g, stored } = fakeGame(slots);
    const G = new GlassBlowing(g);
    assert.equal(G.cast(), null);
    assert.equal(slots[0].count, 2, '10 of 12 sand used');
    for (let t = 0; t < FLASK.T + 1; t += 1 / 30) G.update(1 / 30);
    assert.equal(stored.reduce((a, it) => a + it.count, 0), 2);
    assert.ok(stored.every((it) => it.kind === 'flask' && it.count <= 5));
    assert.equal(g.scene.children.length, 0, 'the look is gone');
});

test('too little: a hint, nothing taken; Creative: one from nothing', () => {
    const slots = [{ kind: 'res', block: BLOCK.SAND, count: 3 }];
    const { g } = fakeGame(slots);
    assert.match(new GlassBlowing(g).cast(), /5 песка/);
    assert.equal(slots[0].count, 3);
    assert.equal(new GlassBlowing(fakeGame([], true).g).cast(), null);
});

test('the words', () => {
    for (const t of ['Create a Flask', 'крейт э фласк']) assert.equal(matchSpell(t), 'CreateFlask', t);
    for (const t of ['колба', 'красивая колба', 'Create a Cauldron']) assert.notEqual(matchSpell(t), 'CreateFlask', t);
});
