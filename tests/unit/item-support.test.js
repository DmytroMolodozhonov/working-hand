// A thing thrown on a bed lies on the bed: the top of a solid box is a floor for loose things.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld as Collision } from '../../src/world/Collision.js';
import { boxTopUnder } from '../../src/game/ItemSupport.js';
import { ItemSystem as Items } from '../../src/game/Items.js';
import * as THREE from 'three';
import { BED } from '../../src/game/BedModels.js';

function world() {
    const col = new Collision();
    col.addBox({ minX: -1.25, maxX: 1.25, minY: 0, maxY: BED.top, minZ: -2.75, maxZ: 2.75, kind: 'bed' }); // the bed, as Beds.js puts it
    col.addBox({ minX: 5, maxX: 6, minY: 0, maxY: 8, minZ: 5, maxZ: 6, kind: 'tree', noSupport: true });
    return col;
}

test('over a bed the floor is the mattress; beside it the ground; a tree is no floor', () => {
    const col = world();
    assert.equal(boxTopUnder(col, 0, 0, 1.4), BED.top);
    assert.equal(boxTopUnder(col, 3, 0, 1.4), -Infinity);
    assert.equal(boxTopUnder(col, 5.5, 5.5, 9), -Infinity);
    assert.equal(boxTopUnder(col, 0, 0, 0.2), -Infinity, 'a thing far below the top (inside) is not lifted by a box it is under');
});

test('Items._floorUnder: a thrown bow falling over a bed stops on its top, and falls again when the bed is gone', () => {
    const col = world();
    const fake = { game: { collision: col } };
    const floor = (p) => Items.prototype._floorUnder.call(fake, p, null);
    const p = { x: 0.5, y: 1.3, z: 1, };
    assert.ok(floor(p) >= BED.top, 'the bed holds it');
    const edge = { x: 1.5, y: 1.3, z: 1 };
    assert.ok(floor(edge) < BED.top, 'beside the bed it is the ground');
    for (const id of [...col.boxes.keys()]) col.removeBox(id);
    assert.ok(floor(p) < BED.top, 'the bed is gone — nothing holds it');
});

test('a bow dropped / thrown onto a bed comes to rest on the mattress (it used to hover inside it forever)', () => {
    const col = world();
    const P = Items.prototype;
    const sys = { game: { collision: col, fx: { spark() {} }, world: {} }, auth: true, _shields: [], _floorUnder: P._floorUnder, _perched: P._perched, _liftOutOfSolid: P._liftOutOfSolid, _thrownHit() {} };
    for (const [x, y, v] of [[0, 4, [0, 0, 0]], [-3, 3.5, [3, 1, 0]], [0, 3, [0, -3, 0]]]) {
        const m = new THREE.Object3D(); m.position.set(x, y, -1);
        const L = { model: m, vel: new THREE.Vector3(...v), spin: new THREE.Vector3(), item: { kind: 'bow' }, t: 0, rest: false };
        for (let i = 0; i < 900 && !L.rest; i++) P._physics.call(sys, L, 1 / 60);
        assert.ok(L.rest, 'it lies still');
        assert.ok(m.position.y >= BED.top && m.position.y < BED.top + 0.3, `on the mattress, not in it: y=${m.position.y}`);
    }
});
