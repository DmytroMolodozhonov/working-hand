// Walking into a shut, UNLOCKED door opens it (as a push in life); a locked one rattles; sideways / backing — nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Doors, doorModel, walkOpenSign, DOOR_WALK } from '../../src/game/Doors.js';

const LW = 3;
function rig({ locked = false, ward = null, duel = false } = {}) {
    const me = new THREE.Vector3(0, 3.5, 0.9); // (the door at the origin, I stand at +Z, the hero is ~3.5 m: his body y = feet + 2)
    const sent = [], rattles = [];
    const g = {
        collision: { addBox: () => 1, removeBox() {}, groundY: () => 0 },
        scene: { add() {}, remove() {} },
        character: { group: { position: me, rotation: { y: 0 } }, isRunning: true },
        locks: { doorLocked: () => locked, lockedTried() { rattles.push(1); } },
        sync: { doorAngle: (id, a) => sent.push([id, a]) },
        wards: ward ? { list: new Map([['w', ward]]), mine: () => false } : null,
        _inDuel: () => duel,
        remotes: new Map(), zombies: [],
    };
    const D = new Doors(g);
    const model = doorModel(0x8b5a2b, { w: LW, h: 6 });
    model.position.set(0, 1.5, 0); model.rotation.y = 0; model.updateMatrixWorld(true);
    const door = { id: 'd1', x: 0, y: 1.5, z: 0, ry: 0, a: 0, mirror: false, w: LW, h: 6, model, hand: {}, gen: true };
    D.list.set(door.id, door);
    D._setAngle(door, 0);
    D._rattle = () => rattles.push(1);
    return { D, g, me, door, sent, rattles, face: (y) => { g.character.group.rotation.y = y; } };
}
// the body's forward is (−sin ry, −cos ry): ry = π → looks to +Z; ry = 0 → looks to −Z (at the door from +Z)
const run = (r, t = 1.5, dt = 1 / 60) => { for (let i = 0; i < t / dt; i++) r.D.update?.call(r.D, dt) ?? r.D._walkOpen(dt); };
const walk = (r, t, dt = 1 / 60) => { for (let i = 0; i < t / dt; i++) r.D._walkOpen(dt); };

test('pure rule: facing the leaf, walking, near — opens away from the body; sideways, backing, far — no', () => {
    assert.equal(walkOpenSign(0, 0.8, 0, -1, true, LW), 1);  // at +Z facing −Z: swings to −Z (+1)
    assert.equal(walkOpenSign(0, -0.8, 0, 1, true, LW), -1); // at −Z facing +Z
    assert.equal(walkOpenSign(0, 0.8, 0, -1, false, LW), 0); // standing
    assert.equal(walkOpenSign(0, 0.8, 1, 0, true, LW), 0);   // sideways
    assert.equal(walkOpenSign(0, 0.8, 0, 1, true, LW), 0);   // back to it (backing away)
    assert.equal(walkOpenSign(0, 2.0, 0, -1, true, LW), 0);  // not against it
    assert.equal(walkOpenSign(LW, 0.8, 0, -1, true, LW), 0); // beside the frame
});

test('walking into an unlocked shut door opens it away from me; nothing before the hold; then it is sent', () => {
    const r = rig();
    walk(r, DOOR_WALK.HOLD * 0.5);
    assert.equal(r.door.a, 0, 'a brush does not open it');
    walk(r, 1.2);
    assert.ok(r.door.a > 0.8, `swung to −Z side (positive): ${r.door.a}`);
    assert.ok(r.sent.length > 0, 'the angle goes to the others');
});

test('from the other face it swings the other way', () => {
    const r = rig();
    r.me.set(0, 3.5, -0.9); r.face(Math.PI);
    walk(r, 1.5);
    assert.ok(r.door.a < -0.8, `${r.door.a}`);
});

test('a locked door does not open; the old rattle answers', () => {
    const r = rig({ locked: true });
    walk(r, 2);
    assert.equal(r.door.a, 0);
    assert.ok(r.rattles.length > 0);
});

test('sideways, backing, not walking, a stranger\'s ward, a duel, a held / gate / forged / ship door — it stays shut', () => {
    const cases = {
        sideways: (r) => r.face(Math.PI / 2),
        backing: (r) => r.face(Math.PI),
        standing: (r) => { r.g.character.isRunning = false; },
        dead: (r) => { r.g.isDeadLocal = true; },
        held: (r) => { r.door.holdSide = 'left'; },
        gate: (r) => { r.door.gate = true; },
        forged: (r) => { r.door.forged = true; },
        ice: (r) => { r.door.ice = true; },
        ship: (r) => { r.door.ship = {}; },
        lifted: (r) => { r.door.lifted = true; },
    };
    for (const [name, f] of Object.entries(cases)) { const r = rig(); f(r); walk(r, 2); assert.equal(r.door.a, 0, name); }
    const w = rig({ ward: { c: { x: 0, y: 3, z: 0 }, r: 20 } }); walk(w, 2); assert.equal(w.door.a, 0, 'ward');
    const d = rig({ duel: true }); walk(d, 2); assert.equal(d.door.a, 0, 'duel');
});

test('my own ward lets me through', () => {
    const r = rig({ ward: { c: { x: 0, y: 3, z: 0 }, r: 20 } });
    r.g.wards.mine = () => true;
    walk(r, 1.5);
    assert.ok(r.door.a > 0.8);
});

test('it shuts by itself after a while, but never on somebody in the doorway', () => {
    const r = rig();
    walk(r, 1.5);
    assert.ok(r.door.a > 0.8);
    r.g.character.isRunning = false; // I stand in the doorway
    walk(r, DOOR_WALK.CLOSE_AFTER + 2);
    assert.ok(r.door.a > 0.8, 'waits for me');
    r.me.set(0, 3.5, 12); // I went away
    walk(r, DOOR_WALK.CLOSE_AFTER + 2.5);
    assert.equal(r.door.a, 0, 'shut');
    assert.equal(r.door.walk, null);
    assert.equal(r.sent.at(-1)[1], 0, 'the host and the others are told');
});

test('two bodies at one door: it opens once, one way; the second one does not fight it', () => {
    const r = rig();
    r.g.remotes.set('p2', { position: new THREE.Vector3(0.5, 3.5, 0.9) });
    walk(r, 1.5);
    const a = r.door.a;
    assert.ok(a > 0.8);
    walk(r, 0.5);
    assert.equal(r.door.a, a, 'open stays open, no flipping');
});

test('a door locked by «Lock» in the middle of the swing stops being driven', () => {
    const r = rig();
    walk(r, 0.4);
    r.g.locks.doorLocked = () => true;
    walk(r, 0.1);
    assert.equal(r.door.walk, null);
});

test('only the doors within reach are looked at: a far door costs nothing, a door is not opened from another floor', () => {
    const r = rig();
    r.me.set(0, 3.5 + 12, 0.9);
    walk(r, 2);
    assert.equal(r.door.a, 0, 'upstairs');
    r.me.set(0, 3.5, 30);
    walk(r, 2);
    assert.equal(r.door.a, 0, 'far');
});
