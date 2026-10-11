import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LegReader } from '../../src/input/LegReader.js';
import { SurfWater, makeSwell } from '../../src/game/SurfWater.js';
import { BoardBody, SURF, riderInput } from '../../src/game/BoardPhysics.js';
import { nearestRail, solveTwoHands, solveOneHand, RAIL, halfWidth } from '../../src/game/BoardHold.js';
import { BoardRegistry } from '../../src/game/BoardRegistry.js';

// ---------------------------------------------------------------- legs
function lm({ left = 'stand', right = 'stand', lVis = 0.95, rVis = 0.95 } = {}) {
    const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
    p[11] = { x: 0.57, y: 0.42 }; p[12] = { x: 0.43, y: 0.42 };
    p[23] = { x: 0.57, y: 0.8 }; p[24] = { x: 0.43, y: 0.8 };
    const T = 0.38;
    for (const [st, k, a, vis] of [[left, 25, 27, lVis], [right, 26, 28, rVis]]) {
        const ky = st === 'up' ? 0.8 + 0.05 * T : 0.8 + 0.5 * T;
        p[k] = { x: 0.5, y: ky, visibility: vis };
        p[a] = { x: 0.5, y: st === 'heel' ? ky + 0.12 * T : ky + 0.5 * T, visibility: vis };
    }
    return p;
}

test('legs: a knee lifted and put down is one stroke; repeated frames count nothing more; unseen legs', () => {
    const r = new LegReader();
    let t = 0, o;
    const run = (opts, n) => { for (let i = 0; i < n; i++) { t += 33; o = r.read(lm(opts), t); } };
    run({}, 10); run({ left: 'up' }, 6); run({}, 10);
    assert.equal(o.left.lifts, 1); assert.equal(o.left.plants, 1); assert.equal(o.left.strokes, 1);
    assert.equal(o.right.lifts, 0);
    // a heel kick counts as a stroke
    run({ right: 'heel' }, 5); run({}, 5);
    assert.equal(o.right.strokes, 1);
    // the same frame object again and again: no extra counts
    const same = lm({ left: 'up' });
    for (let i = 0; i < 5; i++) { t += 33; o = r.read(same, t); }
    assert.equal(o.left.lifts, 2);
    // knees not seen for 600 ms
    for (let i = 0; i < 20; i++) { t += 33; o = r.read(lm({ lVis: 0.2, rVis: 0.2 }), t); }
    assert.equal(o.seen, false);
});

// ---------------------------------------------------------------- water
test('surf water: a swell has the slope it says, a lake is flat, Wave Attack makes a rideable bump', () => {
    const sw = makeSwell({ height: 2, length: 40, depth: 6 });
    const o = sw.sample(3, 0, 1.2, {}), e = 1e-3;
    const h1 = sw.sample(3 + e, 0, 1.2, {}).h, h0 = sw.sample(3 - e, 0, 1.2, {}).h;
    assert.ok(Math.abs(o.h) <= 1.0001 && Math.abs(o.gx - (h1 - h0) / (2 * e)) < 1e-3);
    assert.ok(Math.abs(o.c - Math.sqrt(20 * 6)) < 1e-9);
    const shore = makeSwell({ height: 2, length: 40, depth: 6, shore: { s0: 100, slope: 0.05 } });
    assert.equal(shore.sample(101, 0, 0, {}), null);
    const game = { swim: { waterAt: () => ({ surface: -0.5, depth: 4 }) }, collision: { groundY: () => -0.5 } };
    const w = new SurfWater(game);
    let now = 0;
    w.time = () => now;
    const lake = w.sample(0, 0, 0, {});
    assert.equal(lake.kind, 'lake'); assert.ok(Math.abs(lake.surface + 0.62) < 1e-9); assert.equal(lake.h, 0);
    w.addTransient({ x: 0, z: 0, dirX: 1, dirZ: 0, speed: 8, height: 1.5, width: 6, dist: 20 });
    now = 1; // the bump is 8 m along
    assert.ok(Math.abs(w.sample(8, 0, 1, {}).h - 1.5) < 1e-6);
    now = 10; w.update();
    assert.equal(w.transients.length, 0);
});

// ---------------------------------------------------------------- physics
const flat = (x, z, t, o) => { o.kind = 'lake'; o.surface = -0.62; o.h = o.gx = o.gz = o.vx = o.vz = o.c = o.breaking = 0; o.dx = 1; o.dz = 0; o.depth = 5; return o; };
const seaOf = (sw) => (x, z, t, o) => { if (!sw.sample(x, z, t, o)) { o.kind = 'land'; o.surface = 0; o.depth = 0; return o; } o.kind = 'sea'; o.surface = -0.62; return o; };

test('board: floats still on a lake, paddling pushes it on and turns it away from the paddling side', () => {
    const b = new BoardBody({ y: 0 });
    for (let i = 0; i < 120; i++) b.step(1 / 60, flat, { mode: 'free', t: i / 60 });
    assert.ok(Math.abs(b.y - (-0.62 + SURF.T / 2 - SURF.DRAFT)) < 0.02 && Math.abs(b.u) + Math.abs(b.w) < 0.05);
    const p = new BoardBody();
    let t = 0, yaw0 = p.yaw;
    for (let k = 0; k < 600; k++) { const st = k % 37 === 0 ? 1 : 0; p.step(1 / 60, flat, { mode: 'one', strokes: st, strokeSide: 'right', t }); t += 1 / 60; }
    assert.ok(p.u > 2.5 && p.u < SURF.PADDLE_MAX, `paddled to ${p.u}`);
    assert.ok(p.yaw - yaw0 > 0.3, 'strokes on the right turn the nose to the left');
    for (let k = 0; k < 60; k++) p.step(1 / 60, flat, { mode: 'one', strokes: 1, strokeSide: 'left', t: (t += 1 / 60) });
    assert.ok(p.u < SURF.PADDLE_MAX);
});

test('board: a wave is caught only paddling with it, and carries the board far', () => {
    const sw = seaOf(makeSwell({ height: 1.8, length: 40, depth: 3 })); // waves run +x (≈7.7 m/s)
    const mk = (u, yaw) => new BoardBody({ x: 0, yaw, u });
    const ride = (b, mode, secs) => { const ev = []; let t = 0; for (let i = 0; i < secs * 60; i++) { ev.push(...b.step(1 / 60, sw, { mode, t, lean: 0 })); t += 1 / 60; } return ev; };
    // heading with the waves (+x: yaw −π/2), paddled up to speed: caught
    let caught = 0, far = 0;
    for (let x0 = 0; x0 < 40; x0 += 4) {
        const b = mk(4.6, -Math.PI / 2); b.x = x0;
        const ev = ride(b, 'one', 8);
        if (ev.some((e) => e.type === 'caught')) { caught++; if (b.x - x0 > 35) far++; }
    }
    assert.ok(caught >= 3 && far >= 2, `caught at ${caught} phases, carried far ${far}`);
    // still in the water: never caught, hardly moves
    const s = mk(0, -Math.PI / 2);
    assert.ok(!ride(s, 'one', 8).some((e) => e.type === 'caught') && Math.abs(s.x) < 6);
    // across the waves: never caught
    const c = mk(4.6, 0);
    assert.ok(!ride(c, 'one', 8).some((e) => e.type === 'caught'));
});

test('board: standing is balance held by leaning; too much lean falls; crouching helps', () => {
    const run = (b, inputFn, secs) => { for (let i = 0; i < secs * 60; i++) { const ev = b.step(1 / 60, flat, { mode: 'stand', t: i / 60, ...inputFn(b) }); if (ev.some((e) => e.type === 'fall')) return i / 60; } return null; };
    const a = new BoardBody({ u: 3 }); a.beta = 0.05;
    const tFall = run(a, () => ({ lean: 0 }), 10);
    assert.ok(tFall != null && tFall > 0.8 && tFall < 6, `falls by itself in ${tFall}`);
    const ctl = new BoardBody({ u: 3 }); ctl.beta = 0.05;
    assert.equal(run(ctl, (b) => ({ lean: -2.5 * b.beta })), null, 'a rider who answers the tilt stays up');
    const cr = new BoardBody({ u: 3 }); cr.beta = 0.05;
    assert.ok(run(cr, () => ({ lean: 0, crouch: true }), 12) > tFall * 1.3, 'crouching slows the fall');
    const over = new BoardBody({ u: 3 });
    assert.ok(run(over, () => ({ lean: 0.7 }), 2) != null, 'over-leaning slowly: down');
    assert.deepEqual(riderInput(null, null), { lean: 0, trim: 0 });
});

// ---------------------------------------------------------------- hands
test('hands on the rails: the board follows them, stays out of the body; under the arm it rides on edge', () => {
    assert.ok(halfWidth(0) > 0.6 && halfWidth(-SURF.L / 2) < 0.05);
    const near = nearestRail({ x: 0.9, y: 0.1, z: 0 });
    assert.ok(Math.abs(near.x - halfWidth(0)) < 0.05 && near.d < 0.35);
    const gA = new THREE.Vector3(-halfWidth(0), 0, 0), gB = new THREE.Vector3(halfWidth(0), 0, 0);
    const torso = { center: new THREE.Vector3(0, 2.6, 0), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, -1), halfX: 0.8, halfY: 1.0, halfZ: 0.4 };
    const r = solveTwoHands({ gA, gB, hA: new THREE.Vector3(-0.65, 2.6, -0.6), hB: new THREE.Vector3(0.65, 2.6, -0.6), palmUpA: 1, palmUpB: 1, torso, floorY: () => -0.5 });
    // held out in front, well clear of the body: flat on flat palms
    const far = solveTwoHands({ gA, gB, hA: new THREE.Vector3(-0.65, 2.0, -2.4), hB: new THREE.Vector3(0.65, 2.0, -2.4), palmUpA: 1, palmUpB: 1, torso, floorY: () => -0.5 });
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(far.quat);
    assert.ok(n.y > 0.8, `flat on flat palms ${n.y}`);
    // held close to the chest (r): it turns on edge rather than go through the body
    assert.ok(r.drawA.distanceTo(gA.clone().applyQuaternion(r.quat).add(r.pos)) < 1e-6);
    for (let i = 0; i < 48; i += 3) {
        const p = new THREE.Vector3(RAIL[i * 2], 0, RAIL[i * 2 + 1]).applyQuaternion(r.quat).add(r.pos).sub(torso.center);
        assert.ok(!(Math.abs(p.x) < 0.8 && Math.abs(p.y) < 1 && Math.abs(p.z) < 0.4), 'not through the body');
    }
    const s = solveTwoHands({ gA, gB, hA: new THREE.Vector3(-2, 2.6, -1), hB: new THREE.Vector3(2, 2.6, -1), curlA: 0.6, curlB: 0.9 });
    assert.equal(s.slip, 'A', 'pulled apart: the weaker grip slips');
    // under the arm: the hand at the side holding the right rail's middle
    const tuck = solveOneHand({ g: gB, h: new THREE.Vector3(1.3, 1.3, 0), tuck: { out: new THREE.Vector3(1, 0, 0), fwd: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), hipCenter: new THREE.Vector3(0, 1.5, 0), halfX: 0.6 }, floorY: () => -0.5 });
    assert.equal(tuck.mode, 'tuck');
    const dn = new THREE.Vector3(0, 1, 0).applyQuaternion(tuck.quat), nose = new THREE.Vector3(0, 0, -1).applyQuaternion(tuck.quat);
    assert.ok(Math.abs(dn.y) < 0.1 && nose.z < -0.95, 'on edge, nose forward');
    assert.ok(tuck.pos.y > 1.3, 'the board above the hand that holds its lower rail');
    // one hand at the nose: the tail rests on the ground behind
    const hang = solveOneHand({ g: new THREE.Vector3(0, 0, -SURF.L / 2 + 0.2), h: new THREE.Vector3(0, 1.3, 0), trail: new THREE.Vector3(-1, 0, 0), floorY: () => 0 });
    const tail = new THREE.Vector3(0, 0, SURF.L / 2).applyQuaternion(hang.quat).add(hang.pos);
    assert.ok(tail.y < 0.3 && tail.x < 0, `the tail drags on the ground behind (${tail.x.toFixed(2)}, ${tail.y.toFixed(2)})`);
});

test('board registry: first come wins, owners keep it, saves leave racks out', () => {
    const r = new BoardRegistry();
    r.add({ id: 'b1', wood: 0, st: 'stand', p: [0, 0, 0] });
    r.add({ id: 'cb_1_1_0', wood: 1, st: 'stand', p: [5, 0, 0], beach: true });
    r.add({ id: 'cb_1_1_1', wood: 1, st: 'stand', p: [6, 0, 0], beach: true });
    assert.ok(r.take('b1', 'A', 1)); assert.ok(!r.take('b1', 'B', 1));
    assert.ok(!r.free('b1', 'B', { p: [1, 0, 0], q: [0, 0, 0, 1], st: 'fall' }));
    assert.ok(r.free('b1', 'A', { p: [1, 0, 0], q: [0, 0, 0, 1], st: 'fall' }));
    r.take('b1', 'A', 4); r.take('cb_1_1_0', 'A', 1);
    const snap = r.snapshot();
    assert.deepEqual(snap.map((b) => [b.id, b.st]), [['b1', 'fall'], ['cb_1_1_0', 'fall']]);
    assert.deepEqual(r.leave('A').sort(), ['b1', 'cb_1_1_0']);
    const r2 = new BoardRegistry();
    r2.restore(snap, [...r.beachTaken]);
    assert.ok(r2.beachTaken.has('cb_1_1_0') && r2.map.get('b1').owner === null);
});

test('«Create a Board»: heard right, not mixed up with other spells, learned from a book or a scroll', async () => {
    const { matchSpell } = await import('../../src/fx/SpellManager.js');
    for (const t of ['Create a Board', 'create a board', 'криэйт э борд', 'крейт э борд', 'создай доску', 'surfboard']) assert.equal(matchSpell(t), 'CreateBoard', t);
    assert.equal(matchSpell('Create a Door'), 'CreateDoor');
    assert.equal(matchSpell('Create a Bed'), 'CreateBed');
    assert.equal(matchSpell('Create a Floor'), 'CreateFloor');
    assert.notEqual(matchSpell('абордаж'), 'CreateBoard');
    assert.equal(matchSpell('инферно'), 'Inferno');
    const { BUILD_SPELLS, Builder } = await import('../../src/game/Builder.js');
    assert.equal(BUILD_SPELLS.CreateBoard.cost, 6);
    const { BOOK_POOL, bookSpells } = await import('../../src/game/BookBirds.js');
    assert.ok(BOOK_POOL.includes('CreateBoard'));
    let n = 0;
    for (let i = 0; i < 2000; i++) if (bookSpells(i).includes('CreateBoard')) n++;
    assert.ok(n >= 50, `in ${n} books`);
    const { rollLoot, SCROLL_SPELL_COLOR, SPELL_RIBBON } = await import('../../src/game/ItemTypes.js');
    const { createRng } = await import('../../src/core/math.js');
    const r = createRng(99);
    let all = 0, boards = 0;
    for (let i = 0; i < 5000; i++) for (const it of rollLoot(r)) { all++; if (it.spell === 'CreateBoard') boards++; }
    assert.ok(boards / all > 0.005 && boards / all < 0.04, `${boards} of ${all}`);
    assert.equal(SCROLL_SPELL_COLOR.CreateBoard, undefined);
    assert.ok(SPELL_RIBBON.CreateBoard);
    const game = { config: { mode: 'freeworld' }, books: { learned: new Set() }, bonus: null };
    const b = new Builder(game);
    assert.equal(b.knows('CreateBoard'), false);
    game.books.learned.add('CreateBoard'); assert.equal(b.knows('CreateBoard'), true);
    game.books.learned.clear(); game.bonus = { spells: { CreateBoard: true } }; assert.equal(b.knows('CreateBoard'), true);
    game.bonus = null; game.config.mode = 'creative'; assert.equal(b.knows('CreateBoard'), true);
});
