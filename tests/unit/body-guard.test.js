import test from 'node:test';
import assert from 'node:assert/strict';
import { stepBody, standFree, bounce, lieProbe, freeSpot, straightFree, insideSolid, GUARD } from '../../src/game/BodyGuard.js';
import { Ragdoll, DOLL, P } from '../../src/game/Ragdoll.js';
import { house, rng, FLOOR } from './body-guard-world.mjs';

const R = 0.45;

test('a standing body shoved at 10–60 m/s from any side never ends up inside a block, a bed or a chest (sub-steps of half the radius)', () => {
    const { world } = house();
    const r = rng(7);
    let shoves = 0, inside = 0, blocked = 0;
    for (let n = 0; n < 400; n++) {
        const p = { x: 0, z: 0 };
        do { p.x = 1.5 + r() * 9; p.z = 1.5 + r() * 7; } while (!standFree(world, p.x, p.z, R, FLOOR));
        const sp = 10 + r() * 50, a = r() * Math.PI * 2;
        const v = { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp };
        const got = { x: 0, z: 0 }, want = { x: 0, z: 0 };
        for (let f = 0; f < 90; f++) {
            want.x = v.vx / 30; want.z = v.vz / 30;
            stepBody(world, p, want.x, want.z, R, FLOOR, got);
            if (bounce(v, want, got)) blocked++;
            v.vx *= 0.8; v.vz *= 0.8;
            shoves++;
            if (!standFree(world, p.x, p.z, R, FLOOR)) inside++;
        }
    }
    assert.equal(inside, 0, `inside a solid in ${inside} of ${shoves} frames`);
    assert.ok(blocked > 50, 'the shoves really hit things');
});

test('the old way (one jump per frame) skips a bed at 40 m/s — the new way does not', () => {
    const { world } = house();
    const p = { x: 6, z: 3.5 }, jump = { x: 6, z: 3.5 };
    // aimed west along z = 3.5 through the bed (x 1…3.5): one frame at 40 m/s is 1.33 m
    stepBody(world, p, -5, 0, R, FLOOR);
    assert.ok(p.x > 3.5 + R - 0.01, 'stopped by the bed, not behind it');
    jump.x += -4.5; // (the old single jump)
    assert.ok(insideSolid(world, jump.x, jump.z, R, FLOOR), 'a single jump lands inside the bed');
});

test('a body lying across a tall cupboard is shoved out of it; lying on a bed it rests ON it (not in it, not under it)', () => {
    const { world } = house();
    // feet at (4, 5) head towards +x … the cupboard is at x 10…11, z 2.5…3.5
    const a = lieProbe(world, 8.2, 3, 1, 0, FLOOR);
    assert.ok(a.hit > 0 && a.pushX < -0.5, 'shoved west, away from the cupboard');
    const b = lieProbe(world, 2.25, 1.5, 0, 1, FLOOR); // along the bed's length
    assert.ok(Math.abs(b.rest - 1.0) < 1e-9 && b.hit === 0, 'lying on the bed: rests at its top');
    const c = lieProbe(world, 5, 5, 1, 0, FLOOR); // nothing near (steps aside)
    assert.equal(c.rest, 0);
});

test('a body mostly beside a bed with an edge under it is shoved off, not lifted a metre into the air', () => {
    const { world } = house();
    // head just on the bed's side edge: feet at (6.5, 2), head towards -x: only the last samples on the bed
    const p = lieProbe(world, 5.6, 2, -1, 0, FLOOR);
    assert.equal(p.rest, 0);
    assert.ok(p.hit > 0 && p.pushX > 0.3);
});

test('the safety net: a body found inside the bed is led out to the free side — not behind a wall, not under the bed', () => {
    const { world } = house();
    const r = rng(3);
    let missed = 0;
    for (let n = 0; n < 60; n++) {
        const x = 1.3 + r() * 2, z = 1.3 + r() * 5;
        const spot = freeSpot(world, x, z, R, FLOOR, null, { x: 1, z: 0 });
        if (!spot) { missed++; continue; } // (boxed in between the bed and the steps with no straight way out: the net waits, the shove from the sides frees it)
        assert.ok(standFree(world, spot.x, spot.z, R, FLOOR));
        assert.ok(spot.x >= 1 && spot.x <= 11 && spot.z >= 1 && spot.z <= 9, 'inside the room');
        assert.ok(Math.hypot(spot.x - x, spot.z - z) < 3.6, 'the nearest, not a teleport');
    }
    assert.ok(missed <= 3, `${missed} of 60 had no way out`);
    assert.equal(insideSolid(world, 2, 3, R, FLOOR)?.kind, 'bed');
    assert.equal(insideSolid(world, 6, 2, R, FLOOR), null);
    assert.equal(straightFree(world, 6, 2, 9, 2, R, FLOOR), true);
    assert.equal(straightFree(world, 6, 2, 6, -2, R, FLOOR), false, 'through the south wall — no');
});

// ---------------------------------------------------------------- the rag doll
function run(doll, world, secs, check) {
    let t = 0;
    while (t < secs && !doll.asleep) { doll.step(world, 1 / 60); t += 1 / 60; check?.(); }
    return t;
}

test('a rag doll thrown at 10–60 m/s at corners, the bed, the cupboard and the walls is never inside a solid and goes to sleep', () => {
    const { world } = house({ door: false });
    const r = rng(11);
    let worst = 0, awake = 0;
    for (let n = 0; n < 120; n++) {
        const d = new Ragdoll();
        let x, z;
        do { x = 3 + r() * 6; z = 2 + r() * 5; } while (x > 3.3 && x < 7.7 && z > 3.3 && z < 6.7 || x > 8.3 || !standFree(world, x, z, 0.5, FLOOR)); // (not on the steps, not in the cupboard's corner)
        const a = r() * Math.PI * 2, sp = 10 + r() * 50;
        d.stand(x, FLOOR, z, Math.cos(a), Math.sin(a), Math.cos(a + (r() - 0.5)) * sp, 2 + r() * 8, Math.sin(a + (r() - 0.5)) * sp, (r() - 0.5) * 6);
        run(d, world, 8, () => { worst = Math.max(worst, d.penetration(world)); });
        if (!d.asleep) awake++;
        assert.ok(d.lowest() >= FLOOR - 0.12, `not under the floor (${d.lowest().toFixed(2)})`);
        // every ball inside the room's box
        for (let i = 0; i < 11; i++) { const q = d.at(i); assert.ok(q[0] > 0.2 && q[0] < 11.8 && q[2] > 0.2 && q[2] < 9.8, `ball ${i} stays in the room (${q[0].toFixed(1)}, ${q[2].toFixed(1)})`); }
    }
    assert.ok(worst < 0.12, `deepest penetration ${worst.toFixed(3)} m`);
    assert.equal(awake, 0, 'every doll fell asleep');
});

test('a rag doll dropped on the bed lies ON it (lowest point at the bed top); one dead on the floor keeps its pose and sleeps at once', () => {
    const { world } = house();
    const d = new Ragdoll();
    d.lie(2.25, FLOOR + 1.0, 1.4, 0, 1); // feet on the bed's end, head towards the other end
    run(d, world, 6);
    assert.ok(d.asleep);
    assert.ok(Math.abs(d.lowest() - (FLOOR + 1.0)) < 0.2, `lowest ${d.lowest().toFixed(2)} ≈ bed top 1.5`);
    // the pose: the head is still 3.9 away from the feet along the bed
    const h = d.at(P.HEAD), f = d.at(P.FTL);
    assert.ok(Math.hypot(h[0] - f[0], h[2] - f[2]) > 3, 'it lies stretched out, as it fell');
    const e = new Ragdoll();
    e.lie(8, FLOOR, 5, 1, 0);
    const t = run(e, world, 6);
    assert.ok(e.asleep && t < 3, `asleep after ${t.toFixed(1)} s`);
    const pel = e.at(P.PELVIS);
    assert.ok(pel[1] < FLOOR + 1, 'on the floor, not floating');
});

test('the bones keep their lengths and the joints their limits through a hard throw', () => {
    const { world } = house();
    const d = new Ragdoll();
    d.stand(6, FLOOR, 6, 1, 0, 40, 6, 5, 3);
    let worstBone = 0;
    const torso = () => { const a = d.at(P.CHEST), b = d.at(P.PELVIS); return Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - 1.0); };
    run(d, world, 3, () => { worstBone = Math.max(worstBone, torso()); });
    assert.ok(worstBone < 0.5, `torso length error in the throw ${worstBone.toFixed(2)} m`);
    run(d, world, 6);
    assert.ok(torso() < 0.08, `torso length at rest ${torso().toFixed(3)} m`);
    const hand = d.at(P.HNL), ch = d.at(P.CHEST);
    assert.ok(Math.hypot(hand[0] - ch[0], hand[1] - ch[1], hand[2] - ch[2]) >= 0.3, 'an elbow does not fold flat');
});
