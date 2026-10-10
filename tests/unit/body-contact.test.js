import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO, MOUNT, STEP, TELEPORT, heroBody, mountBody, contact, moveSolid } from '../../src/game/BodyContact.js';

// Bodies standing on flat ground: the body origin 2 m above the soles (y 1.5 on ground −0.5)
const Y = 1.5;
const standing = (x, z, yaw = 0, extra = {}) => ({ ...heroBody(x, Y, z, yaw), ...extra });
const gap = (a, b) => -contact(a, b).depth; // (< 0: inside each other)

/** Runs a hero facing −Z from z0 at `speed` m/s for `seconds` with frames of `dt`, the way the game does. */
function run(others, { x = 0, z0 = 10, speed = 7.5, dt = 1 / 60, seconds = 3, yaw = 0, y = Y, up = null } = {}) {
    let from = { x, z: z0 };
    let minGap = Infinity;
    const path = [];
    for (let t = 0; t < seconds; t += dt) {
        const to = { x: from.x - Math.sin(yaw) * speed * dt, z: from.z - Math.cos(yaw) * speed * dt };
        const r = moveSolid(from, to, (bx, bz, out) => heroBody(bx, y, bz, yaw, up, false, out), others);
        from = { x: r.x, z: r.z };
        for (const o of others) minGap = Math.min(minGap, gap(heroBody(from.x, y, from.z, yaw, up), o));
        path.push(from);
    }
    return { end: from, minGap, path };
}

test('the body is as wide as the drawn hero: arms side by side 1.8 m apart, face to face 1.2 m', () => {
    // side by side (both facing −Z): the shoulder lines are on one line
    assert.ok(Math.abs(contact(standing(1.79, 0), standing(0, 0)).depth - 0.01) < 1e-9);
    assert.ok(contact(standing(1.81, 0), standing(0, 0)).depth <= 0);
    // one behind the other: the heads (1.2 m deep) touch at 1.2
    assert.ok(contact(standing(0, 1.19), standing(0, 0)).depth > 0);
    assert.ok(contact(standing(0, 1.21), standing(0, 0)).depth <= 0);
    // turned: the shoulders follow the yaw
    assert.ok(contact(standing(0, 1.5, Math.PI / 2), standing(0, 0, Math.PI / 2)).depth > 0, 'side by side along z after a quarter turn');
    // the old rule let 1.2 m between the middles be enough even shoulder to shoulder
    assert.ok(contact(standing(1.2, 0), standing(0, 0)).depth > 0.5);
    assert.ok(Math.abs(HERO.R + HERO.SHOULDER - 0.9) < 1e-9);
});

test('running straight at a standing player: stops against the body, never goes through (any frame rate)', () => {
    const other = standing(0, 0);
    for (const dt of [1 / 60, 1 / 20, 0.1]) {
        const r = run([other], { dt });
        assert.ok(r.minGap >= -1e-6, `never inside (dt ${dt}: ${r.minGap})`);
        assert.ok(r.end.z > 1.19 && r.end.z < 1.25, `stopped in front, touching (dt ${dt}: z ${r.end.z})`);
        assert.ok(Math.abs(r.end.x) < 1e-9, 'straight on: no sliding');
    }
});

test('very fast bodies (a gallop, a flight, a blast) cannot jump through in one frame', () => {
    const other = standing(0, 0);
    // 26 m/s (top flight speed) at 10 frames a second: 2.6 m a frame — more than the whole body
    const r = run([other], { speed: 26, dt: 0.1, z0: 3 });
    assert.ok(r.minGap >= -1e-6 && r.end.z > 1.19, `stopped in front (z ${r.end.z})`);
    // one frame from just in front to just behind: blocked at the front
    const one = moveSolid({ x: 0, z: 1.3 }, { x: 0, z: -2 }, (x, z, out) => heroBody(x, Y, z, 0, null, false, out), [other]);
    assert.ok(one.hit && one.z > 1.19, `no tunnelling (z ${one.z})`);
    // a teleport (respawn) does not check the way, only gets out of a body at the end
    const tp = moveSolid({ x: 0, z: 20 }, { x: 0, z: -20 }, (x, z, out) => heroBody(x, Y, z, 0, null, false, out), [other]);
    assert.equal(tp.z, -20);
    assert.ok(TELEPORT > 26 * 0.1 && STEP < 2 * HERO.R, 'steps are short enough for the thinnest body');
});

test('running a bit to the side: slides around the body, shoulders never overlap', () => {
    const other = standing(0, 0);
    const r = run([other], { x: 0.7, seconds: 4 });
    assert.ok(r.minGap >= -1e-6, `never inside (${r.minGap})`);
    assert.ok(r.end.z < -3, 'got past by going around');
    assert.ok(Math.max(...r.path.map((p) => p.x)) > 1.79, 'went round the shoulder');
});

test('the other player walks into me: I am pushed out, the same amount both ways', () => {
    const me = { x: 0, z: 0.5 };
    const r = moveSolid(me, me, (x, z, out) => heroBody(x, Y, z, 0, null, false, out), [standing(0, 0)]);
    assert.ok(Math.abs(r.z - 1.2) < 1e-3 && r.x === 0, `out behind (${r.x}, ${r.z})`);
    // on the very same spot each computer parts its own hero the opposite way
    const a = moveSolid(null, { x: 0, z: 0 }, (x, z, out) => heroBody(x, Y, z, 0, null, false, out), [standing(0, 0, 0, { fallback: { x: 1, z: 0 } })]);
    const b = moveSolid(null, { x: 0, z: 0 }, (x, z, out) => heroBody(x, Y, z, 0, null, false, out), [standing(0, 0, 0, { fallback: { x: -1, z: 0 } })]);
    assert.ok(a.x > 1.79 && b.x < -1.79, `parted (${a.x}, ${b.x})`);
});

test('squeezed between two players: ends outside both', () => {
    const others = [standing(-1.9, 0), standing(1.9, 0)];
    const r = run(others, { x: 0, seconds: 3 });
    assert.ok(r.minGap >= -1e-3, `never inside (${r.minGap})`);
    // a gap too narrow for the shoulders: blocked in front of it
    const tight = [standing(-1.5, 0), standing(1.5, 0)];
    const t = run(tight, { x: 0, seconds: 3 });
    assert.ok(t.end.z > 0.5, `does not squeeze through (z ${t.end.z})`);
    assert.ok(t.minGap >= -0.05, `hardly inside (${t.minGap})`);
});

test('heights: a flyer passes over a head, at body height it is stopped; a crouching body is lower', () => {
    const other = standing(0, 0);
    const flat = { x: 0, y: 0, z: -1 }; // (flying along −Z, the body horizontal)
    const high = run([other], { y: Y + 6, up: flat, seconds: 2 });
    assert.ok(high.end.z < -5, 'over the head');
    const low = run([other], { y: Y + 1, up: flat, seconds: 2 });
    assert.ok(low.end.z > 0, `stopped by the body (${low.end.z})`);
    // a flying body is long: the head 2.2 m ahead of the middle
    assert.ok(low.end.z > 2.2 + 0.6 + 0.6 - 0.01, `the flyer's head touches first (${low.end.z})`);
    const crouch = heroBody(0, Y - 1, 0, 0, null, true);
    assert.ok(Math.abs(crouch.bottom - (Y - HERO.FEET)) < 1e-9, 'crouching: still on the ground');
    assert.ok(crouch.top < heroBody(0, Y, 0, 0).top);
    // lying flat on its back: long along the bed
    const lying = heroBody(0, Y, 0, 0, { x: 1, y: 0, z: 0 });
    assert.ok(contact(standing(3.5, 0), lying).depth > 0 && contact(standing(0, 2), lying).depth <= 0);
});

test('a rider: the horse body is what touches (from the hooves to the rider\'s head)', () => {
    const size = 2.3;
    const horse = mountBody(0, -0.5, 0, 0, size, 7.5);
    assert.ok(horse.r === MOUNT.R * size);
    // the horse's head is 2.76 m forward (−Z), the tail end 1.15 m back
    assert.ok(contact(standing(0, -2.76 - horse.r - 0.59), horse).depth > 0);
    assert.ok(contact(standing(0, 1.15 + horse.r + 0.61), horse).depth <= 0);
    // galloping (30 m/s, 10 FPS) into a player: the horse stops at them
    const other = standing(0, -10);
    let from = { x: 0, z: 0 };
    for (let i = 0; i < 20; i++) {
        const r = moveSolid(from, { x: from.x, z: from.z - 3 }, (x, z, out) => mountBody(x, -0.5, z, 0, size, 7.5, out), [other]);
        from = { x: r.x, z: r.z };
        assert.ok(contact(mountBody(from.x, -0.5, from.z, 0, size, 7.5), other).depth <= 1e-6);
    }
    assert.ok(from.z > -10 + 2.76 + horse.r + 0.59, `stopped in front (${from.z})`);
});
