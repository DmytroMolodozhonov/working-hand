// Monster form (×7): jumps over ledges, squeezes through cracks, does not get stuck between rocks (MonsterClimb.js). The author:
// «монстр застревает в проходах между блоками/скалами (пустыня, узкие каньоны)… прыжок, залезание на уступы, выход из щелей».
// The scenes are REAL blocks on the real ground of the seed, the game's own body and wall code (tools/monsterrig.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIMB, SQUEEZE, G, expectedStep, stuckStep, findHop, hopLaunch, assist, squeezeStep, roomFor, openWay, liftOut, trailPush, trailBack, landingOk } from '../../src/game/MonsterClimb.js';
import { MONSTER } from '../../src/game/MonsterForm.js';
import { makeWorld, makeMonster, walk, calmSpot, flatten, canyon, ledge } from '../../tools/monsterrig.mjs';

const S = MONSTER.SCALE, R = 0.48 * S, BH = MONSTER.BODY_H;

/** A flat world 0 at layer 0 with a ledge `h` high from x ≥ 10 (T.floorBelow in layers; surface = layer − 0.5). */
const fakeT = (h, { wallTall = false } = {}) => ({
    floorBelow: (ix, iz, L) => { const top = ix >= 10 ? h : 0; return Math.min(L, top); },
    solidIn: (ix, iz, L0, L1) => (ix >= 10 ? L0 <= h && L1 >= 1 : false) || (wallTall && ix >= 10 && L1 > h),
});

test('numbers: the step is 1,05 of the height, the hop takes up to 2,7', () => {
    assert.equal(CLIMB.STEP, 1.05);
    assert.ok(CLIMB.MAX_H * S > 15 && CLIMB.MAX_H * S < 22);
    assert.ok(SQUEEZE.MIN * R > 1.2 && SQUEEZE.MIN < 0.5);
    assert.ok(Math.abs(MONSTER.JUMP_K ** 2 - 7) < 1e-9, 'a jump ×7 high');
});

test('stuck: counts only when it wants to walk and does not move; decays when it moves', () => {
    const e = expectedStep(1, 2.6, 1 / 30);
    assert.ok(e > 0.7 && e < 0.9);
    let t = 0;
    for (let i = 0; i < 20; i++) t = stuckStep(t, true, 0, e, 1 / 30);
    assert.ok(t > 0.6);
    assert.equal(stuckStep(0.2, false, 0, e, 1), 0, 'standing still on purpose: nothing');
    assert.ok(stuckStep(0.5, true, e, e, 0.1) < 0.5, 'moving: decays');
});

test('findHop: a ledge higher than the step and not higher than 2,7 — yes; lower — nothing to hop; too high — no', () => {
    const feet = -0.5;
    // the body at x = 3 looking at +x: yaw so that forward = (−sin, −cos) = (1, 0) → yaw = −π/2
    const yaw = -Math.PI / 2;
    for (const h of [9, 13, 18]) {
        const p = findHop(fakeT(h), 3, 0, feet, yaw, S, R, BH);
        assert.ok(p, `${h} blocks`);
        assert.ok(p.fx > 0.9);
        assert.ok(Math.abs(p.h - (h - 0.5 - feet)) < 0.01);
    }
    assert.equal(findHop(fakeT(5), 3, 0, feet, yaw, S, R, BH), null, '5 m is walked by the step');
    assert.equal(findHop(fakeT(30), 3, 0, feet, yaw, S, R, BH), null, '30 m is a wall');
});

test('hopLaunch: the hop lifts the feet above the edge (the air step is 1,4 of the height) and carries forward', () => {
    for (const h of [9, 13, 18]) {
        const plan = { h, d: R + 2, fx: 1, fz: 0 };
        const L = hopLaunch(plan, S, R);
        assert.ok(L.H + CLIMB.AIR_STEP * S >= h, `apex ${L.H.toFixed(1)} + the air step reaches ${h}`);
        assert.ok(L.H <= CLIMB.HOP_MAX * S + 1e-9);
        assert.ok(L.vf >= 0.5 * S - 1e-9 && L.vf <= 1.6 * S + 1e-9);
        assert.ok(Math.abs(L.vy - Math.sqrt(2 * G * L.H)) < 1e-9);
    }
    const a = assist(fakeT(12), 3, 0, -0.5, -Math.PI / 2, S, R, BH);
    assert.ok(a && a.x > 0 && a.vy > 0, 'a real jump near a ledge gets pushed onto it');
    assert.equal(assist(fakeT(30), 3, 0, -0.5, -Math.PI / 2, S, R, BH), null);
});

test('squeeze: narrows only while stuck with no hop, down to the least; widens back only when there is room', () => {
    let sq = 1;
    for (let i = 0; i < 300; i++) sq = squeezeStep(sq, 2, false, false, 1 / 30);
    assert.equal(sq, SQUEEZE.MIN);
    assert.equal(squeezeStep(1, 5, true, false, 1), 1, 'a hop is found: no squeezing');
    assert.equal(squeezeStep(0.5, 0, false, false, 1), 0.5, 'no room around: stays narrow');
    assert.ok(squeezeStep(0.5, 0, false, true, 0.5) > 0.5, 'room: widens');
    assert.equal(squeezeStep(0.99, 0, false, true, 5), 1);
});

test('roomFor / openWay / liftOut / trail', () => {
    const wallEast = (x) => x > 10;
    assert.equal(roomFor((x, y, z) => wallEast(x), 0, 0, 0, R, S), true);
    assert.equal(roomFor((x, y, z) => wallEast(x), 8, 0, 0, R, S), false);
    const w = openWay((x, y, z) => wallEast(x), 8, 0, 0, S);
    assert.ok(w && w.dx < 0, 'the free way is away from the wall');
    assert.equal(openWay(() => true, 0, 0, 0, S), null, 'fully enclosed: nothing');
    const L = liftOut(w, S);
    assert.ok(L.vy > 0 && L.x < 0);
    const tr = [];
    for (let t = 0; t < 12; t += 0.5) trailPush(tr, t, { x: t, y: 0, z: 0 });
    assert.ok(tr.length <= 17);
    assert.ok(11.5 - trailBack(tr, 11.5).t >= CLIMB.TRAIL_S);
    assert.equal(trailBack([], 3), null);
});

test('landingOk: the plateau must hold the whole body (a column ledge is no landing)', () => {
    const T = { floorBelow: (ix, iz, L) => (ix === 10 && iz === 0 ? 12 : Math.min(L, 0)), solidIn: () => false };
    assert.equal(landingOk(T, 10, 0, 12, S, R, BH), false, 'a post: the ring around it is the low ground');
    assert.equal(landingOk(fakeT(12), 14, 0, 12, S, R, BH), true);
    assert.equal(landingOk(fakeT(12, { wallTall: true }), 14, 0, 12, S, R, BH), false, 'rock overhead: no room');
});

// ---------------------------------------------------------------- on real blocks

const W = makeWorld({});
const spot = calmSpot(W);
let LEVEL = null;
function scene(make) {
    const [fx, fz] = spot, z0 = fz + 30;
    LEVEL = flatten(W, fx, z0 - 25, 170, 50, LEVEL);
    return make(fx + 60, z0);
}
const go = (sc, { old = false } = {}) => walk(makeMonster(W, sc.start[0], sc.start[1], { climb: !old }), sc.goal[0], sc.goal[1], { max: 60, near: 10 });

test('real blocks: a ledge higher than the step stops the old body for ever, the new one hops onto it (9, 13, 18 m)', () => {
    assert.ok(spot, 'a calm place found');
    for (const h of [9, 13, 18]) {
        const sc = scene((x, z) => ledge(W, x, z, h));
        const was = go(sc, { old: true });
        assert.equal(was.ok, false, `${h} m: the old body is stuck`);
        const now = go(sc);
        assert.equal(now.ok, true, `${h} m: the new one passes`);
        assert.ok(now.hops >= 1 && now.t < 12, `${h} m: by a hop, quickly (${now.t.toFixed(1)} s)`);
        assert.ok(now.still <= 2);
    }
});

test('real blocks: a canyon between 30 m rock walls — the old body is stuck from 6 m wide, the new one squeezes through 6…3 m', () => {
    for (const w of [6, 4, 3]) {
        const sc = scene((x, z) => canyon(W, x, z, w, 30));
        assert.equal(go(sc, { old: true }).ok, false, `${w} m: the old body is stuck`);
        const now = go(sc);
        assert.equal(now.ok, true, `${w} m: passes`);
        assert.ok(now.squeezeMin < 1 && now.squeezeMin >= SQUEEZE.MIN - 1e-9, `${w} m: squeezed (${now.squeezeMin.toFixed(2)})`);
        assert.ok(now.still <= 3);
    }
    const wide = go(scene((x, z) => canyon(W, x, z, 9, 30)));
    assert.equal(wide.ok, true);
    assert.equal(wide.squeezeMin, 1, 'a wide canyon: no squeezing');
});

test('real blocks: the ground is not broken by the climbing (no block of the ledge or the walls lost), no craters from hops', () => {
    const sc = scene((x, z) => ledge(W, x, z, 12));
    const T = W.T, [fx, fz] = spot, z0 = fz + 30, x0 = fx + 60;
    const blocks = () => { let n = 0; for (let ix = x0; ix <= x0 + 30; ix += 3) for (let iz = z0 - 20; iz <= z0 + 20; iz += 3) n += T.topLayer(ix, iz); return n; };
    const before = blocks();
    const r = go(sc);
    assert.equal(r.ok, true);
    assert.equal(blocks(), before, 'the plateau stands as built');
});

test('real blocks: a wall too tall to climb is never a trap — it lifts out and goes round, or comes back; no endless stand', () => {
    const r = go(scene((x, z) => ledge(W, x, z, 40)));
    assert.ok(r.still <= 6, `stood at most ${r.still} s`);
    const tight = go(scene((x, z) => canyon(W, x, z, 2, 30)));
    assert.ok(tight.still <= 12, `a crack too narrow: stood at most ${tight.still} s of 60`);
});
