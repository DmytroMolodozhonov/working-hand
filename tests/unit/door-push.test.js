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

import { inwardRy } from '../../src/world/Castles.js';

test('house doors open into the room; a wall or a chest behind the leaf stops it', () => {
    for (const ry of [0, 0.5, 2, -1.3]) for (const [ix, iz] of [[1, 0], [0, -1], [-0.6, 0.8]]) {
        const r = inwardRy(ry, ix, iz);
        assert.ok(-Math.sin(r) * ix - Math.cos(r) * iz >= 0, 'local −Z (the opening side) points in');
    }
    // a door at the origin (ry 0: it opens towards −z), a wall 1.2 m inside along x
    const D = fake();
    D.game.world = { terrain: { data: { isSolidAt: (x, y, z) => z < -1.6 } } };
    const d = door({ x: 0, y: 0, z: 0, ry: 0, a: 0 });
    D._setAngle = Doors.prototype._setAngle.bind(D);
    const lim = D.openLimit(d);
    assert.ok(lim > 0.3 && lim < 0.8, `stops on the wall: ${lim}`);
    D._setAngle(d, 1.5);
    assert.ok(d.a <= lim + 1e-9);
});

// ---- the leaf swings both ways (CLAUDE.md: a door opens to whichever side it is pushed)
import { leafPushed } from '../../src/game/Doors.js';

test('both ways: a push from one face opens it one way, from the other — the other way; the latch catches it at 0 from either side', () => {
    const D = fake();
    D._setAngle = (d, a) => { d.a = a; };
    const run = (d) => { for (let i = 0; i < 600 && d.spin; i++) { const r = swingStep(d.a, d.spin, 1 / 60); d.a = r.a; d.spin = r.w; } return d.a; };
    const push = (d, v) => { D.impulse(d, D._leafNormal(d, new THREE.Vector3()).multiplyScalar(v)); return run(d); };
    assert.ok(push(door({ a: 0 }), 12) > 0.3, 'pushed from the back: it opens one way');
    assert.ok(push(door({ a: 0 }), -12) < -0.3, 'pushed from the front: it opens the other way');
    // shut hard from either side: it never shoots through the frame
    for (const [a, v] of [[1.2, -60], [-1.2, 60]]) {
        const d = door({ a }); D.impulse(d, D._leafNormal(d, new THREE.Vector3()).multiplyScalar(v));
        let crossed = false, slam = false;
        for (let i = 0; i < 600 && d.spin; i++) { const r = swingStep(d.a, d.spin, 1 / 60); if (Math.sign(r.a) === -Math.sign(a)) crossed = true; slam ||= r.hit === 'slam'; d.a = r.a; d.spin = r.w; }
        assert.equal(d.a, 0, `shut from ${a > 0 ? '+' : '−'}`);
        assert.ok(!crossed && slam, 'latched with a slam, not through');
    }
    // the stops on each side: its own
    let r = swingStep(1.0, 50, 0.05, 1.3, 0.6); assert.ok(r.a <= 1.3 && r.hit === 'open');
    r = swingStep(-0.4, -50, 0.05, 1.3, 0.6); assert.ok(r.a >= -0.6 && r.hit === 'open');
    // the hand: from 0 pushed either way; coming shut — the latch
    assert.equal(leafPushed(1, -0.4, 0), -0.4);
    assert.equal(leafPushed(-1, 0.4, 0), 0.4);
    assert.equal(leafPushed(-1, 0.3, -0.5), 0, 'pushed shut from the other side: latched');
    assert.equal(leafPushed(1, -3, -1, 1.75, 0.9), -0.9, 'its stop on that side');
});

test('both ways: a wall on either side stops the leaf there; a locked leaf moves neither way', () => {
    const D = fake();
    // a door at the origin (ry 0), a wall 1.2 m away on each side — nearer on +Z
    D.game.world = { terrain: { data: { isSolidAt: (x, y, z) => z < -1.6 || z > 0.9 } } };
    const d = door({ x: 0, y: 0, z: 0, ry: 0, a: 0 });
    const P = D.openLimit(d, 1), N = D.openLimit(d, -1);
    assert.ok(P > 0.3 && P < 0.8 && N > 0.15 && N < P, `${P} / ${N}`);
    D._setAngle(d, 1.5); assert.ok(d.a <= P + 1e-9 && d.a > 0);
    D._setAngle(d, -1.5); assert.ok(d.a >= -N - 1e-9 && d.a < 0);
    // locked: no push opens it either way
    D.game.locks = { doorLocked: () => true }; D.game.sound = null; D.game.hud = null;
    const l = door({ a: 0 });
    for (const v of [40, -40]) { D.impulse(l, D._leafNormal(l, new THREE.Vector3()).multiplyScalar(v)); assert.ok(!l.spin); }
});

test('both ways: the people open it away from themselves; a body walking into an open leaf pushes it away', () => {
    const D = fake();
    const d = door({ x: 0, y: 0, z: 0, ry: 0, a: 0, w: 1.6, h: 3.6 });
    assert.equal(D.awaySign(d, 0, 2), 1, 'from +Z: it opens towards −Z');
    assert.equal(D.awaySign(d, 0, -2), -1, 'from −Z: towards +Z');
    // an open leaf (towards −Z), I walk into it from its −X/−Z side: it goes further from me
    D.list.set('d', d);
    D._setAngle = (dd, a) => { dd.a = a; dd.model.userData.hinge.rotation.y = a; dd.model.updateMatrixWorld(true); };
    D._setAngle(d, 0.8);
    D.openLimit = () => 1.75;
    const me = D.game.character.group.position;
    const hx = -0.8, r = 1.0, ha = 0.8 + 0.25; // (against the leaf on its open side: it is pushed back towards the frame)
    me.set(hx + r * Math.cos(ha), 1, -r * Math.sin(ha));
    D._bodiesPush();
    assert.ok(d.a < 0.8 && d.a > 0.4, `pushed back from my side (${d.a.toFixed(2)})`);
    D._setAngle(d, 0.5); // (against it from the doorway side: pushed further open)
    const a0 = d.a;
    me.set(hx + r * Math.cos(0.3), 1, -r * Math.sin(0.3));
    D._bodiesPush();
    assert.ok(d.a > 0.5, `pushed on, away from me (${d.a.toFixed(2)} from ${a0.toFixed(2)})`);
});
