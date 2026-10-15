// Every creature sees the others through the crowd grid and goes round them (Crowd.js + Avoid.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Crowd, steer, makeWayStep } from '../../src/game/Crowd.js';

/** Run walkers [{x, z, gx, gz, r, sp}] (and standing ones) through one crowd; min gap between bodies. */
function sim(walkers, standing = [], room = () => true, T = 30) {
    const crowd = new Crowd();
    crowd.addSource((push) => {
        for (const w of walkers) push({ x: w.x, y: 0, z: w.z, r: w.r, ref: w });
        for (const s of standing) push({ x: s.x, y: 0, z: s.z, r: s.r, ref: s, vx: 0, vz: 0 });
    });
    const dt = 1 / 30;
    let minGap = Infinity, frame = 0;
    for (let t = 0; t < T; t += dt) {
        crowd.update(frame++, t);
        for (const w of walkers) {
            const dx = w.gx - w.x, dz = w.gz - w.z, d = Math.hypot(dx, dz);
            if (d < 0.3) { w.done = true; continue; }
            const others = crowd.near(w.x, w.z, 0, 6, w);
            const st = (w.st ||= {});
            const a = steer(st, w, { x: dx / d, z: dz / d }, { others, r: w.r, speed: w.sp, maxF: d, room, dt, id: w.id });
            if (!a) continue;
            const s = Math.min(d, w.sp * dt);
            const nx = w.x + a.x * s, nz = w.z + a.z * s;
            // (as in the game: blocked — slide along the wall)
            if (room(nx, nz)) { w.x = nx; w.z = nz; } else if (room(nx, w.z)) w.x = nx; else if (room(w.x, nz)) w.z = nz;
        }
        const all = [...walkers, ...standing];
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
            minGap = Math.min(minGap, Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) - all[i].r - all[j].r);
        }
        if (walkers.every((w) => w.done)) break;
    }
    return { minGap, done: walkers.every((w) => w.done) };
}

test('two walking straight at each other step aside (both to the right) and pass', () => {
    const a = { id: 1, x: 0, z: 0, gx: 0, gz: -14, r: 0.5, sp: 1.6 };
    const b = { id: 2, x: 0.05, z: -14, gx: 0.05, gz: 0, r: 0.5, sp: 1.6 };
    const r = sim([a, b]);
    assert.ok(r.done, 'both got where they were going');
    assert.ok(r.minGap > 0.05, `never bumped (gap ${r.minGap.toFixed(2)} m)`);
});

test('a cow and a man going at each other pass too (different sizes and speeds)', () => {
    const a = { id: 1, x: 0, z: 0, gx: 0, gz: -14, r: 1.0, sp: 1.2 };
    const b = { id: 2, x: 0.2, z: -14, gx: 0.2, gz: 0, r: 0.5, sp: 2.3 };
    const r = sim([a, b]);
    assert.ok(r.done && r.minGap > 0.05, JSON.stringify(r));
});

test('a walker goes round a villager standing and talking (who is not shoved)', () => {
    const talker = { x: 0, z: -6, r: 0.5 };
    const a = { id: 1, x: 0, z: 0, gx: 0, gz: -12, r: 0.5, sp: 2 };
    const r = sim([a], [talker]);
    assert.ok(r.done, 'arrived');
    assert.ok(r.minGap > 0.1, `kept clear (${r.minGap.toFixed(2)})`);
    assert.deepEqual([talker.x, talker.z], [0, -6], 'the talker stayed where he stood');
});

test('a big one (the spider) is passed with a wide berth', () => {
    const spider = { x: 0.3, z: -8, r: 2.4 };
    const a = { id: 1, x: 0, z: 0, gx: 0, gz: -16, r: 0.5, sp: 2 };
    const r = sim([a], [spider]);
    assert.ok(r.done && r.minGap > 0.15, JSON.stringify(r));
});

test('a jam in a narrow passage clears: one waits, the other comes through, then it goes', () => {
    // a corridor 1.6 m wide between z = -4 and z = -10 (only one fits), open space either side
    const room = (x, z) => (z > -4 || z < -10) || Math.abs(x) < 0.8;
    const a = { id: 1, x: 0, z: 0, gx: 0, gz: -14, r: 0.5, sp: 1.6 };
    const b = { id: 2, x: 0, z: -14, gx: 0, gz: 0, r: 0.5, sp: 1.6 };
    const r = sim([a, b], [], room, 60);
    assert.ok(r.done, `both got through (a ${a.x.toFixed(1)},${a.z.toFixed(1)}; b ${b.x.toFixed(1)},${b.z.toFixed(1)})`);
    assert.ok(r.minGap > -0.15, `no walking through each other (${r.minGap.toFixed(2)})`);
});

test('a group crossing another group: everybody gets across without walking into anybody', () => {
    const W = [];
    for (let i = 0; i < 5; i++) W.push({ id: i, x: -10, z: i * 1.6, gx: 10, gz: i * 1.6, r: 0.5, sp: 1.6 });
    for (let i = 0; i < 5; i++) W.push({ id: 10 + i, x: 10, z: i * 1.6 + 0.3, gx: -10, gz: i * 1.6 + 0.3, r: 0.5, sp: 1.6 });
    const r = sim(W, [], () => true, 60);
    assert.ok(r.done, 'all across');
    assert.ok(r.minGap > -0.2, `nobody went through anybody (${r.minGap.toFixed(2)})`);
});

test('the grid finds only the near ones', () => {
    const c = new Crowd();
    const far = { x: 100, z: 100, r: 0.5 }, near = { x: 2, z: 1, r: 0.5 };
    c.addSource((push) => { push({ ...far, ref: far }); push({ ...near, ref: near }); });
    c.update(1, 0);
    const got = c.near(0, 0, 0, 5);
    assert.equal(got.length, 1);
    assert.equal(got[0].ref, near);
});

test('one standing in a narrow way is asked to step aside («посторонись») — and the way opens', () => {
    const room = (x, z) => (z > -4 || z < -10) || Math.abs(x) < 1.2; // (a passage 2.4 m: one stands in the middle)
    const stander = { x: 0, z: -7, r: 0.5 };
    const a = { id: 1, x: 0, z: 0, gx: 0, gz: -14, r: 0.5, sp: 1.6 };
    const crowd = new Crowd();
    crowd.addSource((push) => { push({ x: a.x, z: a.z, r: a.r, ref: a }); push({ x: stander.x, z: stander.z, r: 0.5, ref: stander, vx: 0, vz: 0 }); });
    let asked = false, min = Infinity;
    for (let t = 0, f = 0; t < 30; t += 1 / 30) {
        crowd.update(f++, t);
        // the stander's own system: the step aside, where there's room
        const mw = makeWayStep(stander, 1 / 30);
        if (mw) { asked = true; if (room(stander.x + mw.x * 2, stander.z)) stander.x += mw.x; }
        const dx = a.gx - a.x, dz = a.gz - a.z, d = Math.hypot(dx, dz);
        if (d < 0.3) break;
        const s = steer(a.st ||= {}, a, { x: dx / d, z: dz / d }, { others: crowd.near(a.x, a.z, 0, 6, a), r: 0.5, speed: 1.6, maxF: d, room, dt: 1 / 30, id: 1 });
        if (s) {
            const nx = a.x + s.x * 1.6 / 30, nz = a.z + s.z * 1.6 / 30;
            if (room(nx, nz)) { a.x = nx; a.z = nz; } else if (room(a.x, nz)) a.z = nz;
        }
        min = Math.min(min, Math.hypot(a.x - stander.x, a.z - stander.z) - 1);
    }
    assert.ok(asked, 'it was asked to make way');
    assert.ok(Math.hypot(a.x - a.gx, a.z - a.gz) < 0.4, `got through (${a.x.toFixed(1)}, ${a.z.toFixed(1)})`);
    assert.ok(min > -0.15, `never walked into it (${min.toFixed(2)})`);
});
