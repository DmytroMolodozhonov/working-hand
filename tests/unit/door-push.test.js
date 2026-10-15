import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Doors, doorModel, swingStep, DOOR_HAND } from '../../src/game/Doors.js';

/** A door as Doors._place makes it (its model turned and scaled), without a game. */
function door(o) {
    const d = { x: 3, y: 1, z: -2, ry: 0.7, a: 0.4, mirror: false, w: 3, h: 5, ...o };
    const model = doorModel(0x8b5a2b, { mirror: d.mirror, w: d.w, h: d.h });
    model.position.set(d.x, d.y, d.z); model.rotation.y = d.ry;
    model.userData.hinge.rotation.y = (d.mirror ? -1 : 1) * d.a;
    model.updateMatrixWorld(true);
    return { ...d, model };
}
const fake = () => { const col = { addBox: () => 1, removeBox() {} }; return new Doors({ collision: col, scene: { add() {}, remove() {} }, character: { group: { position: new THREE.Vector3(99, 0, 99) } } }); };

for (const mirror of [false, true]) test(`the leaf's middle and normal match its model (mirror ${mirror})`, () => {
    const D = fake();
    const d = door({ mirror });
    const leaf = d.model.userData.hinge.children[0];
    const real = leaf.getWorldPosition(new THREE.Vector3());
    const mid = D._leafMiddle(d, new THREE.Vector3());
    assert.ok(real.distanceTo(mid) < 1e-6, `middle ${mid.toArray()} vs ${real.toArray()}`);
    // the normal: where the middle goes when the angle grows
    const d2 = door({ mirror, a: d.a + 1e-4 });
    const mid2 = D._leafMiddle(d2, new THREE.Vector3());
    const n = D._leafNormal(d, new THREE.Vector3());
    assert.ok(mid2.sub(mid).normalize().dot(n) > 0.999, 'opening side');
    // the leaf's own frame: its middle is at (lw/2, h/2, 0)
    const L = D._leafLocal(d, real, new THREE.Vector3());
    assert.ok(Math.abs(L.x - 1.5) < 1e-6 && Math.abs(L.y - 2.5) < 1e-6 && Math.abs(L.z) < 1e-6, L.toArray().join());
});

test('a push swings a leaf: opens from the front, shuts from behind; harder — further; locked — not at all', () => {
    const D = fake();
    D._setAngle = (d, a) => { d.a = a; };
    const run = (d) => { for (let i = 0; i < 400 && d.spin; i++) { const r = swingStep(d.a, d.spin, 1 / 60); d.a = r.a; d.spin = r.w; } return d.a; };
    const open = (v) => { const d = door({ a: 0 }); const n = D._leafNormal(d, new THREE.Vector3()); D.impulse(d, n.multiplyScalar(v)); return run(d); };
    const soft = open(9), hard = open(20);
    assert.ok(soft > 0.4 && soft < DOOR_HAND.MAX_A, `wind opens it part way: ${soft}`);
    assert.ok(hard > soft, 'a stronger push opens it further');
    // from behind: an open door is shut
    const d = door({ a: 1.2 }); const n = D._leafNormal(d, new THREE.Vector3());
    D.impulse(d, n.multiplyScalar(-25));
    assert.equal(run(d), 0, 'shut');
    // locked: it only rattles
    D.game.locks = { doorLocked: () => true }; D.game.sound = null; D.game.hud = null;
    const l = door({ a: 0 }); D.impulse(l, D._leafNormal(l, new THREE.Vector3()).multiplyScalar(40));
    assert.ok(!l.spin, 'the lock holds');
});

test('a charge flying at a closed leaf hits it', () => {
    const D = fake();
    const d = door({ a: 0, ry: 0, x: 0, z: 0, y: 0 });
    D.list.set('x', d);
    const hit = D.segmentHit(new THREE.Vector3(0.5, 2, 5), new THREE.Vector3(0.5, 2, -5));
    assert.ok(hit && hit.door === d && Math.abs(hit.s - 0.5) < 0.05);
    assert.equal(D.segmentHit(new THREE.Vector3(5, 2, 5), new THREE.Vector3(5, 2, -5)), null, 'past it');
});
