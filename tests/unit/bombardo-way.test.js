import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CollisionWorld } from '../../src/world/Collision.js';
import { Doors } from '../../src/game/Doors.js';
import { Wreck } from '../../src/game/Wreck.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { bombardoWayStop } from '../../src/fx/SpellManager.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function world() {
    const collision = new CollisionWorld();
    const game = { collision, scene: { add() {}, remove() {} }, character: { group: { position: V(99, 0, 99) } } };
    const doors = new Doors(game);
    game.doors = doors;
    return { collision, game, doors };
}

test('a fast orb does not skip a thin box: the whole step is cut', () => {
    const { collision } = world();
    collision.addBox({ minX: -3, maxX: 3, minY: 0, maxY: 5, minZ: 9.9, maxZ: 10.1, kind: 'door' });
    // one frame at a low FPS: 6 m, the end is behind the wall — the old end-point check saw nothing there
    assert.equal(collision.pointBlocked(0, 2, 13), false);
    const hit = bombardoWayStop(collision, null, V(0, 2, 7), V(0, 2, 13));
    assert.ok(hit, 'the wall is hit');
    assert.ok(Math.abs(hit.z - 9.9) < 1e-6, `at the near face: ${hit.z}`);
    // a step that stops short of it, and one that flies past beside it
    assert.equal(bombardoWayStop(collision, null, V(0, 2, 7), V(0, 2, 9.5)), null);
    assert.equal(bombardoWayStop(collision, null, V(5, 2, 7), V(5, 2, 13)), null);
    assert.equal(bombardoWayStop(collision, null, V(0, 6, 7), V(0, 6, 13)), null, 'over it');
});

test('a 1 m wall of a lifted house (levmax box) stops an orb that moves 3 m a frame', () => {
    const { collision } = world();
    collision.addBox({ minX: 0, maxX: 1, minY: 0, maxY: 6, minZ: -5, maxZ: 5, kind: 'levmax' });
    const hit = bombardoWayStop(collision, null, V(-1.5, 3, 0), V(2.5, 3, 0));
    assert.ok(hit && Math.abs(hit.x) < 1e-6, JSON.stringify(hit));
});

test('a closed door and an opened leaf are both on an orb\'s way', () => {
    const { doors, collision } = world();
    doors._place({ id: 'd1', x: 0, y: 0, z: 10, ry: 0, a: 0, w: 3, h: 5, color: 0x7a4f2a });
    const shut = bombardoWayStop(collision, doors, V(0, 2, 6), V(0, 2, 14));
    assert.ok(shut && shut.z > 9.5 && shut.z < 10.1, `shut door: ${JSON.stringify(shut)}`);
    // swung wide open (no box any more): its leaf is still hit
    const d = doors.list.get('d1');
    d.a = 1.4; doors._setAngle(d, 1.4);
    assert.equal(d.boxId, null);
    const mid = doors._leafMiddle(d, V(0, 0, 0));
    const n = doors._leafNormal(d, V(0, 0, 0));
    const hit = bombardoWayStop(collision, doors, mid.clone().addScaledVector(n, -5), mid.clone().addScaledVector(n, 5));
    assert.ok(hit && hit.door === d, 'the open leaf');
});

test('a Bombardo that bursts on a house door breaks it, though its frame stands; far away it does not', () => {
    const { doors, game } = world();
    const stone = { get: () => BLOCK.STONE ?? 1 };
    game.world = { terrain: { data: stone } };
    game.wreck = new Wreck(game);
    game.locks = { blast() {} };
    doors._place({ id: 'h1', x: 0, y: 0, z: 10, ry: 0, a: 0, w: 3, h: 5, color: 0x7a4f2a, gen: true });
    // a blast 8 m away does not touch it (the frame holds)
    game.wreck.afterBlast(V(0, 1, 2), 3.6, 1);
    assert.ok(doors.list.has('h1'), 'stays');
    // an orb that burst on the leaf
    game.wreck.afterBlast(V(0, 2, 9.9), 3.6, 1);
    assert.ok(!doors.list.has('h1'), 'broken');
    assert.equal(game.collision.boxes.size, 0, 'and its box is gone: the way is open');
});

test('a made door is broken by a blast at it as before', () => {
    const { doors, game } = world();
    game.world = { terrain: { data: { get: () => BLOCK.STONE ?? 1 } } };
    game.wreck = new Wreck(game);
    game.locks = { blast() {} };
    doors._place({ id: 'm1', x: 0, y: 0, z: 10, ry: 0, a: 0, color: 0x7a4f2a });
    game.wreck.afterBlast(V(0, 1.8, 10.5), 3.6, 1);
    assert.ok(!doors.list.has('m1'));
});

