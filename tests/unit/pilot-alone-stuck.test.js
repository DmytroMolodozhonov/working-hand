// A lone walker that walks and stays where it is (the author 05.11, the knight in a cave: «если NPC идёт вперёд, но остаётся на месте —
// пусть меняет, куда идти: ищет пустые места, обходы»): it goes round (Pilot.detourHeading), and if even that does not move it, it is set on
// the nearest open place. Before: with nobody near the stall detector was never asked — it stood there for good.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pilot, newPilotState, detourHeading, PILOT } from '../../src/game/Pilot.js';

/** Walk from (0, 0) to the goal with a block in the way; the body is stopped by the block (a real collision), `room` may or may not know it. */
function walk(block, roomKnows = true, secs = 25) {
    const R = 0.5, speed = 2.5, dt = 1 / 60, goal = { x: 12, z: 0 };
    const inBlock = (x, z, m = 0) => Math.abs(x - block.x) < block.hx + m && Math.abs(z - block.z) < block.hz + m;
    const room = roomKnows ? (x, z) => !inBlock(x, z) : () => true;
    const st = newPilotState();
    const p = { x: 0, z: 0 };
    let detours = 0, unsticks = 0;
    for (let i = 0; i < secs / dt; i++) {
        const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
        if (d < 1) return { p, t: i * dt, detours, unsticks };
        const out = pilot(st, p, { x: dx / d, z: dz / d }, [], { r: R, speed, dt, maxF: d, room, id: 'knight' });
        if (!out) continue;
        if (out.detour) detours++;
        if (out.unstick) { unsticks++; if (!inBlock(out.unstick.x, out.unstick.z, R)) { p.x = out.unstick.x; p.z = out.unstick.z; } continue; }
        const nx = p.x + out.x * out.k * speed * dt, nz = p.z + out.z * out.k * speed * dt;
        if (!inBlock(nx, nz, R)) { p.x = nx; p.z = nz; } // (the collision: the body does not go into the block)
    }
    return { p, t: secs, detours, unsticks };
}

test('a lone knight walking into a block goes round it and gets where it was going', () => {
    const r = walk({ x: 3, z: 0, hx: 0.6, hz: 1.2 });
    assert.ok(r.t < 25, `arrived (${r.p.x.toFixed(1)}, ${r.p.z.toFixed(1)}) in ${r.t.toFixed(1)} s`);
    assert.ok(r.detours > 0, 'it went round');
});

test('even a block the walker cannot see (its map says open): set on an open place, then on its way', () => {
    const r = walk({ x: 3, z: 0, hx: 0.6, hz: 1.2 }, false);
    assert.ok(r.t < 25, `arrived (${r.p.x.toFixed(1)}, ${r.p.z.toFixed(1)}) in ${r.t.toFixed(1)} s`);
});

test('a wide wall: it tries one side, then the other — never stands for good', () => {
    const r = walk({ x: 3, z: 0, hx: 0.6, hz: 6 }, true, 40);
    assert.ok(r.t < 40, `arrived in ${r.t.toFixed(1)} s`);
});

test('the way round: to a side, open for its shoulders; the side that worked kept, the other after failures', () => {
    const st = {};
    const room = (x, z) => !(x > 0.3 && Math.abs(z) < 1);
    const a = detourHeading({ x: 0, z: 0 }, { x: 1, z: 0 }, room, st);
    const same = detourHeading({ x: 0, z: 0 }, { x: 1, z: 0 }, room, st);
    assert.ok(a && same && Math.sign(a.z) === Math.sign(same.z), 'the side that worked is kept (no swinging back and forth at a long wall)');
    st.detourFlip = true; // (three ways round on that side did not move it)
    const b = detourHeading({ x: 0, z: 0 }, { x: 1, z: 0 }, room, st);
    assert.ok(b && Math.sign(a.z) !== Math.sign(b.z), 'then the other side');
    assert.equal(detourHeading({ x: 0, z: 0 }, { x: 1, z: 0 }, () => false, {}), null, 'nowhere open: none');
    assert.ok(PILOT.DETOUR < PILOT.UNSTICK_ALONE);
});
