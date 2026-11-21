// «Вайнд» и «Вайнд Максима» рассеивают пыль от обрушений и дым (автор 21.11): частицы в конусе летят дальше и живут меньше; вне конуса и вне дальности — не тронуты.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ParticlePool } from '../../src/fx/Particles.js';
import { windSmoke } from '../../src/fx/SpellManager.js';

function pool() { return new ParticlePool(new THREE.Scene(), { geometry: new THREE.BoxGeometry(1, 1, 1), capacity: 50, transparent: true }); }
const put = (p, x, y, z) => p.spawn(x, y, z, 0, 0, 0, 0xaaaaaa, 1, 4, {});

test('a gust through a cloud of dust: those in the cone are thrown along it and thinned; behind, aside and beyond the reach — untouched', () => {
    const smoke = pool();
    put(smoke, 5, 1, 0);   // ahead, in the cone
    put(smoke, -5, 1, 0);  // behind
    put(smoke, 0, 1, 9);   // aside (90°)
    put(smoke, 30, 1, 0);  // ahead but beyond the reach of «Вайнд» (14 m)
    windSmoke({ smoke }, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), 14, 0.65, 1, false);
    assert.ok(smoke.vel[0] > 3, `thrown ahead: ${smoke.vel[0]}`);
    assert.ok(smoke.life[0] < 4 && smoke.maxLife[0] < 4 && Math.abs(smoke.life[0] / smoke.maxLife[0] - 1) < 1e-6, 'thinned: shorter life, the same fade ratio (no pop)');
    for (const i of [1, 2, 3]) assert.equal(smoke.vel[i * 3], 0, `particle ${i} untouched`);
    assert.equal(smoke.life[1], 4);
});

test('«Вайнд Максима» is stronger and reaches further; the ring (radial) blows all round', () => {
    const a = pool(), b = pool();
    put(a, 5, 1, 0); put(b, 5, 1, 0);
    windSmoke({ smoke: a }, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), 14, 0.65, 1, false);
    windSmoke({ smoke: b }, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), 24, 0.65, 3, false);
    assert.ok(b.vel[0] > a.vel[0] && b.life[0] < a.life[0], 'stronger: faster and thinner');
    const r = pool(); put(r, -6, 1, 0); put(r, 0, 1, 7);
    windSmoke({ smoke: r }, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), 24, Math.PI, 3, true);
    assert.ok(r.vel[0] < -3 && r.vel[5] > 3, 'outward from the caster in every direction');
});

test('no pools (an old build, a test): nothing happens', () => { windSmoke(null, new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 14, 0.65, 1, false); windSmoke({}, new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 14, 0.65, 1, false); });
