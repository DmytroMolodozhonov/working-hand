import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Animals, appleTreeAt, APPLE_TREES, goldenTreeModel } from '../../src/game/Animals.js';
import { ITEM_INFO, makeItemModel } from '../../src/game/ItemTypes.js';

test('apple trees: golden ones half as common as before (15% of cells), ordinary red apple trees common (65%)', () => {
    const n = { golden: 0, red: 0, none: 0 };
    for (let s = 1; s <= 3; s++) for (let gx = -60; gx < 60; gx++) for (let gz = -20; gz < 20; gz++) n[appleTreeAt(gx, gz, s) || 'none']++;
    const all = n.golden + n.red + n.none;
    assert.ok(Math.abs(n.golden / all - APPLE_TREES.GOLDEN) < 0.02, `golden ${n.golden / all}`);
    assert.ok(Math.abs(n.red / all - APPLE_TREES.RED) < 0.02, `red ${n.red / all}`);
    assert.ok(APPLE_TREES.GOLDEN <= 0.3 / 2, 'twice as rare as the old 30%');
    assert.equal(appleTreeAt(7, -3, 42), appleTreeAt(7, -3, 42), 'the same on every computer');
});

test('the red apple tree: the same tree with red apples; the apple is ordinary food that tames horses', () => {
    const t = goldenTreeModel(true), gold = goldenTreeModel();
    // (real trees now — AppleTrees.js: each its own shape, 12 apples and more hanging round its crown)
    assert.ok(t.userData.apples.length >= 12 && gold.userData.apples.length >= 12);
    assert.equal(t.userData.apples[0].material.color.getHex(), 0xc8202a);
    assert.equal(ITEM_INFO.redApple.heal, 3); // (the author: an apple +3, a golden one +10)
    assert.ok(makeItemModel({ kind: 'redApple' }).children.length);
    // a horse eats an ordinary apple just like a golden one
    const g = { config: { mode: 'freeworld' }, authority: true, localId: 'me', scene: new THREE.Scene(), character: { group: new THREE.Group() }, collision: { groundY: () => 0, resolveCylinder() {} }, remotes: new Map(), fx: { spark() {} }, hud: { setVoice() {} } };
    const A = new Animals(g);
    const horse = A._spawn('horse', new THREE.Vector3(0, 0.5, 0), { color: 0x4a3022 });
    const head = horse.group.position.clone().add(new THREE.Vector3(0, 1, -1.2));
    const ap = { item: { kind: 'redApple', count: 3 }, side: 'right', model: { position: head } };
    g.items = { heldOf: (k) => (k === 'redApple' ? ap : null), releaseHand() {} };
    A._feedT = 0.7; A._feed(0.01);
    assert.equal(horse.apples, 1);
});
