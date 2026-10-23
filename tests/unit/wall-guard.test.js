// A walker with a goal behind a wall (a house built by magic): never pushes at the wall for long —
// goes round to the door, or stands off the wall and lets the goal go. And «стоит без причины» is found and helped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CastleLife } from '../../src/game/CastleLife.js';
import { StuckWatch, STUCK, WALL } from '../../src/game/Unstick.js';
import { BLOCK } from '../../src/world/Terrain.js';

/** A flat floor (layer 0); a house x 10…16, z −3…3 — walls two blocks thick are not needed: one ring, `door` cells open. */
function world(door = null) {
    const wall = (x, z) => x >= 10 && x <= 16 && z >= -3 && z <= 3 && (x === 10 || x === 16 || z === -3 || z === 3) && !(door && door(x, z));
    return {
        get: (x, l, z) => (l <= 0 || (l <= 6 && wall(x, z)) ? BLOCK.STONE : BLOCK.AIR),
        floorBelow: (x, z, L) => Math.min(0, L),
        solidIn: (x, z, a, b) => wall(x, z) && a <= 6 && b >= 1,
    };
}
function life(t) {
    const L = Object.create(CastleLife.prototype);
    L.game = { world: { terrain: { data: t } }, terrain: { data: t }, frameCount: 0, collision: { groundAt: () => -0.5 } };
    L._say = () => {};
    L._clock = 0;
    return L;
}
/** Run a walker towards (13, 0) in the house; → {minD, wallT (longest time held against the wall), v, gaveUp}. */
function run(L, seconds, gx = 13, gz = 0) {
    const v = { id: 1, x: -2, y: -0.5, z: 0.3, yaw: 0, speed: 0, role: 'wizard', follow: 'p' };
    let held = 0, longest = 0, gaveUp = false, nearWall = 0, worst = 0;
    const dt = 1 / 30;
    let lx = v.x, lz = v.z, still = 0;
    for (let t = 0; t < seconds; t += dt) {
        L.game.frameCount++; L._clock += dt;
        if (v.follow) L._steer(v, gx, gz, 4, dt, 3); else { v.speed = 0; gaveUp = true; }
        // never inside a wall
        assert.ok(L._walkable(v.x, v.z, v.y), `inside a wall at ${v.x.toFixed(2)}, ${v.z.toFixed(2)} t=${t.toFixed(1)}`);
        // pushing at the wall = tries to go (speed > 0) near the house with no way made
        const nearHouse = v.x > 7.5 && v.x < 18.5 && Math.abs(v.z) < 5.5;
        held = (v.speed > 0 && nearHouse && Math.hypot(v.x - lx, v.z - lz) < 0.3 * 4 * dt) ? held + dt : 0;
        longest = Math.max(longest, held);
        lx = v.x; lz = v.z;
    }
    return { v, longest, gaveUp };
}

test('wall guard: the house is shut — the wizard stops short of it, does not press into the wall, and after ~20 s lets the goal go', () => {
    const L = life(world());
    const r = run(L, 60);
    assert.ok(r.v.x < 10, `did not go through the wall: x=${r.v.x}`);
    assert.ok(r.longest < 3, `pressing at the wall for ${r.longest.toFixed(1)} s`);
    assert.ok(r.gaveUp, 'the goal was let go (follow cleared)');
});

test('wall guard: a door in the wall — he goes round to it and in', () => {
    const L = life(world((x, z) => x === 10 && Math.abs(z) <= 0)); // (the door is on the near side, in the middle)
    const r = run(L, 40, 13, 0);
    assert.ok(Math.hypot(r.v.x - 13, r.v.z) < 4, `got to the goal: ${r.v.x.toFixed(1)}, ${r.v.z.toFixed(1)}`);
});

test('wall guard: the door on the far side — round the house to it', () => {
    const L = life(world((x, z) => x === 16 && Math.abs(z) <= 0));
    const r = run(L, 60, 13, 0);
    assert.ok(Math.hypot(r.v.x - 13, r.v.z) < 4, `got in by the far door: ${r.v.x.toFixed(1)}, ${r.v.z.toFixed(1)}`);
});

test('stuck watch: a walker that wants to go and makes no way is logged with the reason, then helped (new way, then out of sight → moved)', () => {
    const lines = [];
    let replans = 0;
    const w = new StuckWatch({
        now: 0, skip: () => null, diagnose: () => 'путь пуст', replan: () => { replans++; return true; },
        unseen: () => true, nearestFree: () => ({ x: 5, y: 0, z: 5 }), log: (t) => lines.push(t),
    });
    const b = { x: 0, y: 0, z: 0 };
    let t = 0;
    for (; t < 120; t += 0.5) { w.env.now = t; w.watch(b, 0.5, true); if (b.x === 5) break; }
    assert.ok(lines.length >= 1 && /путь пуст/.test(lines[0]), lines.join('|'));
    assert.ok(replans >= 1);
    assert.deepEqual([b.x, b.z], [5, 5], 'taken out to the nearest free place');
    assert.ok(t < STUCK.STILL + STUCK.PORT_AFTER + 5, `soon enough: ${t}`);
});

test('stuck watch: one that is seen is not moved; one with a reason to stand (asleep, at its post) is not stuck; one going is not stuck', () => {
    let seen = false, fine = null;
    const lines = [];
    const w = new StuckWatch({ now: 0, skip: () => fine, diagnose: () => 'x', replan: () => true, unseen: () => !seen, nearestFree: () => ({ x: 9, y: 0, z: 9 }), log: (t) => lines.push(t) });
    const b = { x: 0, y: 0, z: 0 };
    seen = true;
    for (let t = 0; t < 200; t += 0.5) { w.env.now = t; w.watch(b, 0.5, true); }
    assert.equal(b.x, 0, 'seen: not moved'); assert.ok(lines.length >= 3, 'but logged (once a minute)'); assert.ok(lines.length <= 4);
    const c = { x: 0, y: 0, z: 0 }; fine = 'post'; lines.length = 0;
    for (let t = 0; t < 200; t += 0.5) w.watch(c, 0.5, true);
    assert.equal(lines.length, 0, 'at its post');
    const d = { x: 0, y: 0, z: 0 }; fine = null;
    for (let t = 0; t < 200; t += 0.5) { d.x += 0.5; w.watch(d, 0.5, true); }
    assert.equal(lines.length, 0, 'going');
});
