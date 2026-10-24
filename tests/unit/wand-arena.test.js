/**
 * A wand knocked out on the duel arena (the enchanted floor, the stands) always ends up lying on a surface —
 * never sunk into the stone or fallen through the floor under the colosseum; buried things come up.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { arenaWorld, makeItems, dropWand } from '../../tools/wandbench.mjs';

const rngOf = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('a knocked-out wand lies on the arena floor or the stands, from every place', () => {
    const { t, a } = arenaWorld(), { it, col } = makeItems(t), rng = rngOf(5), c = a.centre;
    for (let k = 0; k < 600; k++) {
        const ang = rng() * 6.283, r = rng() * 24, x = c.x + Math.cos(ang) * r, z = c.z + Math.sin(ang) * r;
        const o = dropWand(it, col, new THREE.Vector3(x, col.groundAt(x, z, c.y + 40) + 2.6, z), rng);
        assert.ok(o.ok, `wand from ${x.toFixed(1)},${z.toFixed(1)} ended at y ${o.p.y.toFixed(2)} (floor ${o.floor.toFixed(2)})`);
    }
});

test('a wand buried in the arena stone comes up on top of it, never sinks', () => {
    const { t, a } = arenaWorld(), { it, col } = makeItems(t), rng = rngOf(7), c = a.centre;
    for (let k = 0; k < 500; k++) {
        const ang = rng() * 6.283, r = rng() * 28, x = c.x + Math.cos(ang) * r, z = c.z + Math.sin(ang) * r;
        const L = { model: new THREE.Group(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, item: { kind: 'wand' }, rest: k % 2 === 0 };
        L.model.position.set(x, col.surfaceY(x, z) - rng() * 5, z);
        for (let i = 0; i < 60 * 10; i++) it._physics(L, 1 / 60);
        const p = L.model.position;
        assert.ok(p.y >= col.surfaceY(p.x, p.z) - 0.3, `buried wand at ${x.toFixed(1)},${z.toFixed(1)} ended at y ${p.y.toFixed(2)}`);
    }
});
