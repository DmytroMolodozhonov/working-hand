import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { trimShadowCasters, SHADOW_TRIM } from '../../src/core/ShadowTrim.js';

const box = (x, y, z, cast = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), new THREE.MeshBasicMaterial()); m.castShadow = cast; return m; };

test('small parts stop casting, the body and the big pieces keep their shadow', () => {
    const root = new THREE.Group(), body = box(1.2, 1.5, 0.8), leg = box(0.5, 1.95, 0.5), buckle = box(0.1, 0.1, 0.05), coin = box(0.2, 0.2, 0.05), cloak = box(1.3, 2, 0.2);
    for (const m of [body, leg, buckle, coin, cloak]) root.add(m);
    const proxy = box(0.1, 0.1, 0.1); proxy.name = 'head-shadow'; root.add(proxy);
    const off = trimShadowCasters(root);
    assert.equal(off, 2);
    assert.deepEqual([body, leg, cloak, proxy].map((m) => m.castShadow), [true, true, true, true]);
    assert.deepEqual([buckle, coin].map((m) => m.castShadow), [false, false]);
    assert.equal(trimShadowCasters(root), 0, 'nothing more the second time');
});

test('a new small part added later is trimmed at the next look; a part that never cast is left alone', () => {
    const root = new THREE.Group(); trimShadowCasters(root);
    const ring = box(0.15, 0.15, 0.15), already = box(0.1, 0.1, 0.1, false);
    root.add(ring, already);
    assert.equal(trimShadowCasters(root), 1);
    assert.equal(ring.castShadow, false);
    assert.ok(SHADOW_TRIM.MIN >= 0.5 && SHADOW_TRIM.MIN <= 1.2, 'the base limbs (0.4 thick, 1.5 long) stay');
});

test('a scaled small mesh counts by its real size', () => {
    const root = new THREE.Group(), m = box(0.5, 0.5, 0.5); m.scale.set(3, 3, 3); root.add(m);
    trimShadowCasters(root);
    assert.equal(m.castShadow, true);
});
