// Boats (the author 05.11): a boat for two, «Navigare» — it goes, the head steers, «стоп» slows it to a stop in a few seconds;
// a jump near it — in, a jump in it — out; the caster out — it stops; the land ahead — it stops there.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Boats, BOAT, driveStep } from '../../src/game/Boats.js';
import { BOAT_DIM, BOAT_SEATS, boatGeometry } from '../../src/entities/BoatModel.js';

test('«Navigare»: picks up to SPEED, the head turned left turns it left, «стоп» stops it in about STOP_T s', () => {
    const b = { yaw: 0, u: 0 };
    for (let i = 0; i < 300; i++) driveStep(b, 0, 1 / 30, true);
    assert.ok(Math.abs(b.u - BOAT.SPEED) < 1e-6 && b.yaw === 0, 'straight on at full speed');
    for (let i = 0; i < 30; i++) driveStep(b, 0.5, 1 / 30, true);
    assert.ok(b.yaw > 0.3, 'the head to the left (+): it turns left');
    let t = 0;
    while (b.u > 0 && t < 10) { driveStep(b, 0, 1 / 30, false); t += 1 / 30; }
    assert.ok(Math.abs(t - BOAT.STOP_T) < 0.2, `stopped in ${t.toFixed(2)} s`);
});

test('the boat is sized for two heroes (~3.5 m tall): 7.4 m long, ~3 m wide, two seats inside the hull', () => {
    const g = boatGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox;
    assert.ok(bb.max.z - bb.min.z > 7 && bb.max.z - bb.min.z < 8.2);
    assert.ok(bb.max.x - bb.min.x > 2.6 && bb.max.x - bb.min.x < 3.4);
    assert.equal(BOAT_SEATS.length, 2);
    for (const s of BOAT_SEATS) assert.ok(Math.abs(s.z) < BOAT_DIM.L / 2 - 1 && s.y < BOAT_DIM.D);
});

/** A small fake world: water everywhere x < 50, the land beyond. */
function fakeGame() {
    const scene = new THREE.Scene();
    const ch = { group: new THREE.Group(), jumpAir: false, jumpVel: new THREE.Vector3() };
    const water = { sample: (x, z, t, o = {}) => Object.assign(o, x < 50 ? { kind: 'sea', surface: 0, depth: 6, h: 0 } : { kind: 'land', surface: 1, depth: 0, h: 0 }) };
    const said = [];
    return { scene, character: ch, localId: 'me', config: { mode: 'creative' }, collision: { groundY: () => 1 }, boards: { water }, hud: { setVoice: (t) => said.push(t) }, said, _headBase: { yaw: 0 } };
}

test('a jump near the boat — in (a seat); «Navigare» — it goes; the caster jumps out — it slows and stops; the land ahead stops it', () => {
    const g = fakeGame();
    const B = new Boats(g);
    const b = B.spawn({ id: 'b1', x: 0, z: 0, yaw: -Math.PI / 2, st: 'float', y: -BOAT.DRAFT }); // (the bow towards +x)
    g.character.group.position.set(2, 2, 0);
    let jumps = 0;
    B.update(1 / 30, { jump: { jumps } });
    B.update(1 / 30, { jump: { jumps: ++jumps } });
    assert.equal(B.riding, true, 'in');
    assert.equal(b.seats[0], 'me');
    assert.equal(B.enchant(), null);
    for (let i = 0; i < 90; i++) B.update(1 / 30, { jump: { jumps } });
    assert.ok(b.x > 3, `it went on (${b.x.toFixed(1)} m)`);
    const p = g.character.group.position;
    assert.ok(Math.hypot(p.x - b.x, p.z - b.z) < 2.5, 'I sit in it as it goes');
    // out with a jump: it slows down and stops
    B.update(1 / 30, { jump: { jumps: ++jumps } });
    assert.equal(B.riding, false, 'out');
    for (let i = 0; i < 30 * (BOAT.STOP_T + 1); i++) B.update(1 / 30, { jump: { jumps } });
    assert.equal(b.drive, null, 'the spell is over');
    assert.ok(b.u < 0.05);
    // in again, on and on: the land (x ≥ 50) stops it at the shore — never onto it
    for (let i = 0; i < 40; i++) B.update(1 / 30, { jump: { jumps } }); // (a moment after jumping out)
    g.character.group.position.set(b.x + 1, 2, b.z);
    B.update(1 / 30, { jump: { jumps: ++jumps } });
    assert.equal(B.riding, true);
    B.enchant();
    for (let i = 0; i < 30 * 20; i++) B.update(1 / 30, { jump: { jumps } });
    assert.ok(b.x + BOAT_DIM.L / 2 < 50.5 && b.x > 30, `stopped at the shore (${b.x.toFixed(1)})`);
});

test('«стоп» while going: it slows over a few seconds (not at once), then the spell is gone', () => {
    const g = fakeGame();
    const B = new Boats(g);
    const b = B.spawn({ id: 'b2', x: -200, z: 0, yaw: -Math.PI / 2, st: 'float', y: -BOAT.DRAFT });
    g.character.group.position.set(-199, 2, 0);
    B.update(1 / 30, { jump: { jumps: 0 } }); B.update(1 / 30, { jump: { jumps: 1 } });
    B.enchant();
    for (let i = 0; i < 150; i++) B.update(1 / 30, { jump: { jumps: 1 } });
    assert.equal(B.stop(), true);
    B.update(0.5, { jump: { jumps: 1 } });
    assert.ok(b.u > 2, 'half a second on: still going, slower');
    for (let i = 0; i < 120; i++) B.update(1 / 30, { jump: { jumps: 1 } });
    assert.equal(b.drive, null);
    assert.equal(B.enchant(), null, 'said again: it goes again');
});

test('two players, one boat: two seats, the third cannot get in', () => {
    const g = fakeGame();
    const B = new Boats(g);
    const b = B.spawn({ id: 'b3', x: 0, z: 0, yaw: 0, st: 'float', y: -BOAT.DRAFT });
    b.seats = ['p1', 'p2'];
    g.character.group.position.set(1, 2, 0);
    B.update(1 / 30, { jump: { jumps: 0 } }); B.update(1 / 30, { jump: { jumps: 1 } });
    assert.equal(B.riding, false);
});
