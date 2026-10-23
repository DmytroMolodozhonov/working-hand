// Logs: they burn lying in flames (not in the hand), and the log model is a cylinder, not a cube.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BurnWreck } from '../../src/game/BurnWreck.js';
import { logStackModel, LOG } from '../../src/game/LogModel.js';

test('a log lying in flames burns down in a few seconds; its neighbour too; wool and a carried log do not', () => {
    const loose = new Map();
    const mk = (uid, kind, x) => loose.set(uid, { item: { kind, uid }, model: { position: new THREE.Vector3(x, 0, 0) }, hover: false });
    mk('a', 'logs', 0); mk('b', 'logs', 1.2); mk('far', 'logs', 30); mk('w', 'wool', 0.2);
    const g = { authority: true, items: { loose, removeLoose: (u) => { const L = loose.get(u); loose.delete(u); return L?.item; } }, sync: { itemGone() {} } };
    const bw = new BurnWreck(g);
    bw.igniteLoose(new THREE.Vector3(0, 0, 0), 1.5);
    for (let t = 0; t < 8; t += 0.1) bw.update(0.1);
    assert.ok(!loose.has('a') && !loose.has('b'), 'burnt, the fire spread to the next log');
    assert.ok(loose.has('far') && loose.has('w'), 'the far log and wool stay');
});

test('the log model is a round log about 1 m × 0.26 m, not a cube', () => {
    const m = logStackModel(0x8b5a2b, 1);
    const mesh = m.children[0];
    assert.ok(mesh.geometry.parameters.radialSegments > 6);
    m.updateMatrixWorld(true);
    const s = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    assert.ok(Math.abs(s.x - LOG.LEN) < 0.02 && s.y < 0.3 && s.y > 0.22, `${s.x} × ${s.y} × ${s.z}`);
    assert.equal(logStackModel(0x8b5a2b, 3).children.length, 3);
});
