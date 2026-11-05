// The sea's bottom (SeaFloor.js): plants only where the sea is ≥ 2 m deep (never on the land, never a lake), the same for every
// computer (the seed); the deep holds kelp and lilies, the shallows seagrass and corals; the shapes and the fish build; laid a few cells a
// frame (the budget), capped.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cellPlants, SeaFloor, FLOOR } from '../../src/fx/SeaFloor.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('only in the sea, ≥ 2 m deep; the same from the same seed; the deep and the shallows differ', () => {
    const depth = (x) => (x < 0 ? 0 : x < 400 ? 3 : 12);
    let land = 0, shallow = {}, deep = {};
    for (let cx = -30; cx < 120; cx++) for (let cz = 0; cz < 20; cz++) {
        const a = cellPlants(cx, cz, 9, (x) => depth(x)), b = cellPlants(cx, cz, 9, (x) => depth(x));
        assert.deepEqual(a, b);
        for (const p of a) {
            if (p.x < 0) land++;
            const bag = p.x < 400 ? shallow : deep;
            bag[p.kind] = (bag[p.kind] || 0) + 1;
        }
    }
    assert.equal(land, 0, 'nothing on the land');
    assert.ok(!shallow.kelp && !shallow.lily, 'no kelp in the shallows');
    assert.ok(deep.kelp > 0 && deep.lily > 0 && shallow.grass > 0 && shallow.staghorn > 0, JSON.stringify({ shallow, deep }));
});

test('it builds and lays the plants round the player within the caps; the fish swim in the water', () => {
    const SEA = (x) => x > 0;
    const t = {
        get: (x, y) => (SEA(x) ? (y <= 0 ? BLOCK.STONE : y <= 10 ? BLOCK.WATER : 0) : (y <= 11 ? BLOCK.GRASS : 0)),
        topLayer: (x) => (SEA(x) ? 0 : 11), floorBelow: (x) => (SEA(x) ? 0 : 11), landMade: () => true, isSeaColumn: (x) => SEA(x),
    };
    const g = { scene: new THREE.Scene(), seed: 3, terrain: { data: t }, sea: { s: (x) => x }, character: { group: { position: new THREE.Vector3(30, 5, 0) } }, world: {} };
    const F = new SeaFloor(g);
    for (let i = 0; i < 400 && (F.job || !F.center); i++) F.update(1 / 30);
    let n = 0;
    for (const [k, m] of Object.entries(F.meshes)) { assert.ok(m.count <= FLOOR.CAP[k]); n += m.count; }
    assert.ok(n > 50, `plants laid: ${n}`);
    for (let i = 0; i < 60; i++) F.update(1 / 30);
    assert.ok(F.fish.count > 0, 'fish');
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (let i = 0; i < F.fish.count; i++) { F.fish.getMatrixAt(i, m); p.setFromMatrixPosition(m); assert.ok(p.y > 0 && p.y < 11, `a fish in the water: ${p.y}`); }
});
