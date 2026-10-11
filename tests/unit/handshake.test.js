import test from 'node:test';
import assert from 'node:assert/strict';
import { HAND, closingAround, palmsFacing, clasp, leash, breakFree, lettingGo, pulledApart, armTo } from '../../src/game/Handshake.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

test('grabbing a hand: the fingers must really close round it (open → closed while near, in time)', () => {
    // open near, then closed near: a grab
    assert.equal(closingAround([{ t: 0, c: 0.1, near: true }, { t: 0.2, c: 0.4, near: true }, { t: 0.4, c: 0.8, near: true }], 0.4), true);
    // a fist already made, pushed into the hand: no grab
    assert.equal(closingAround([{ t: 0, c: 0.9, near: true }, { t: 0.2, c: 0.9, near: true }], 0.2), false);
    // closed far away, then brought to the hand: no grab
    assert.equal(closingAround([{ t: 0, c: 0.1, near: false }, { t: 0.2, c: 0.9, near: false }, { t: 0.3, c: 0.9, near: true }], 0.3), false);
    // went away while closing: no grab
    assert.equal(closingAround([{ t: 0, c: 0.1, near: true }, { t: 0.1, c: 0.5, near: false }, { t: 0.2, c: 0.9, near: true }], 0.2), false);
    // too slow (opened long ago)
    assert.equal(closingAround([{ t: 0, c: 0.1, near: true }, { t: HAND.CLOSE_T + 0.3, c: 0.9, near: true }], HAND.CLOSE_T + 0.3), false);
    // half-closed is not closed
    assert.equal(closingAround([{ t: 0, c: 0.1, near: true }, { t: 0.2, c: 0.5, near: true }], 0.2), false);
    assert.equal(closingAround([], 0), false);
});

test('palms roughly facing: palm to palm yes; side by side or crossed no', () => {
    const z = { x: 0, y: 0, z: 1 }, mz = { x: 0, y: 0, z: -1 }, x = { x: 1, y: 0, z: 0 };
    assert.equal(palmsFacing(z, mz, { x: 0, y: 0, z: 0.4 }), true, 'face to face along z');
    assert.equal(palmsFacing(z, mz, { x: 0.1, y: 0.05, z: 0.4 }), true, 'a little off');
    assert.equal(palmsFacing(z, x, { x: 0, y: 0, z: 0.4 }), false, 'planes at a right angle');
    assert.equal(palmsFacing(z, mz, { x: 0.6, y: 0, z: 0 }), false, 'side by side in one plane');
    assert.equal(palmsFacing(z, mz, { x: 0.05, y: 0, z: 0.02 }), true, 'already touching');
});

test('clasped hands: at the midpoint of the two real hands, each palm on its own side (never inside each other)', () => {
    const a = { x: 0, y: 3, z: 0 }, b = { x: 0, y: 3.4, z: -1 };
    const c = clasp(a, b);
    assert.ok(near(c.joint.x, 0) && near(c.joint.y, 3.2) && near(c.joint.z, -0.5));
    const d = Math.hypot(c.a.x - c.b.x, c.a.y - c.b.y, c.a.z - c.b.z);
    assert.ok(near(d, 2 * HAND.GAP), `palms ${d} apart`);
    // a's palm is on a's side of the joint
    assert.ok(c.a.z > c.joint.z && c.b.z < c.joint.z);
    // the joint follows both hands: one hand shakes up 0.4, the joint goes up 0.2
    const c2 = clasp({ ...a, y: 3.4 }, b);
    assert.ok(near(c2.joint.y - c.joint.y, 0.2));
    // the very same point: still apart
    const c3 = clasp(a, a);
    assert.ok(near(Math.hypot(c3.a.x - c3.b.x, c3.a.y - c3.b.y, c3.a.z - c3.b.z), 2 * HAND.GAP));
});

test('led by the hand: within the arm nothing moves; past it the body is drawn after the hand', () => {
    const R = HAND.REACH + HAND.SLACK;
    assert.equal(leash({ me: { x: 0, z: 0 }, them: { x: R - 0.1, z: 0 } }).move, null);
    const r = leash({ me: { x: 0, z: 0 }, them: { x: R + 1, z: 0 } });
    assert.ok(near(r.move.x, 1) && near(r.move.z, 0) && near(r.excess, 1));
    // standing still and pulled: stumbles after the hand
    const s = leash({ me: { x: 0, z: 0 }, them: { x: 0, z: -(R + 0.5) }, walking: false, facing: { x: 0, z: 1 } });
    assert.ok(near(s.move.z, -0.5) && !s.away);
    // walking along towards the hand: pulled
    const w = leash({ me: { x: 0, z: 0 }, them: { x: 0, z: -(R + 0.5) }, walking: true, facing: { x: 0, z: -1 } });
    assert.ok(w.move && !w.away);
    // walking away from the holder: pulling against it (not moved; breaks free when hard)
    const a = leash({ me: { x: 0, z: 0 }, them: { x: 0, z: -(R + 0.8) }, walking: true, facing: { x: 0, z: 1 } });
    assert.equal(a.move, null);
    assert.equal(a.away, true);
    // a villager's shorter arm
    assert.equal(leash({ me: { x: 0, z: 0 }, them: { x: 1.5, z: 0 }, reach: 1.6 }).move, null);
});

test('breaking free is easy: pulling away hard, a sharp jerk, a blow; lag far away', () => {
    const dt = 1 / 30;
    let st = {};
    let why = null;
    for (let i = 0; i < 20 && !why; i++) why = breakFree(st, { dt, away: true, excess: HAND.BREAK_EXCESS + 0.2 });
    assert.equal(why, 'away');
    // pulling away gently (inside the slack): never
    st = {};
    why = null;
    for (let i = 0; i < 60 && !why; i++) why = breakFree(st, { dt, away: true, excess: HAND.BREAK_EXCESS * 0.5 });
    assert.equal(why, null);
    // stumbling after the holder (pulled, not away): never
    st = {};
    for (let i = 0; i < 60 && !why; i++) why = breakFree(st, { dt, away: false, excess: 1.5 });
    assert.equal(why, null);
    assert.equal(breakFree({}, { dt, jerk: true }), 'jerk');
    assert.equal(breakFree({}, { dt, blow: true }), 'blow');
    st = {};
    why = null;
    for (let i = 0; i < 40 && !why; i++) why = breakFree(st, { dt, excess: HAND.LAG_EXCESS + 1 });
    assert.equal(why, 'far');
});

test('letting go: fingers opened for a moment; hands pulled apart', () => {
    const dt = 1 / 30;
    const st = {};
    assert.equal(lettingGo(st, 0.2, dt), false);
    let gone = false;
    for (let i = 0; i < 10 && !gone; i++) gone = lettingGo(st, 0.2, dt);
    assert.equal(gone, true);
    // closed again in between: starts over
    const s2 = {};
    lettingGo(s2, 0.2, dt); lettingGo(s2, 0.2, dt); lettingGo(s2, 0.8, dt);
    assert.equal(s2.openT, 0);
    // shaking hands moving together: never apart; pulled 1.5 apart: slip out
    const p = {};
    for (let i = 0; i < 30; i++) assert.equal(pulledApart(p, 0.3, dt), false);
    let slip = false;
    for (let i = 0; i < 10 && !slip; i++) slip = pulledApart(p, 1.5, dt);
    assert.equal(slip, true);
});

test('a villager\'s arm reaching a hand: points at it and says whether it gets there', () => {
    const r = armTo({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 1.25);
    assert.ok(near(r.dir.z, 1) && r.reaches);
    assert.equal(armTo({ x: 0, y: 0, z: 0 }, { x: 0, y: -3, z: 0 }, 1.25).reaches, false);
});

test('hand sizes in world units: a grab is within a palm or two, apart is beyond a real 40 cm', () => {
    const PER_M = 2.8; // hero units per real metre
    assert.ok(HAND.GRAB_R / PER_M < 0.25 && HAND.GRAB_R / PER_M > 0.1, 'grab range 10–25 cm');
    assert.ok(HAND.APART / PER_M > 0.3 && HAND.APART / PER_M < 0.6, 'apart 30–60 cm');
    assert.ok(HAND.GAP < 0.14, 'two palms clasped are about two palm-thicknesses apart');
});
