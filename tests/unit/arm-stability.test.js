/**
 * The hero's arm does not tremble (the author: «когда я поднимаю руку вверх, она может шататься, дрожать… когда размахиваю
 * рукой — тоже дрожание»). The whole way through the game's code: a noisy camera → PoseStabilizer → PoseSmoother →
 * VoxelCharacter (ArmSolver) — tools/armstab.mjs (limits only tighten).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArmSolver, DirFilter, planeDepth, ARM } from '../../src/entities/ArmSolver.js';
import { still, swing, step, run, POSES, LIMITS } from '../../tools/armstab.mjs';

test('an arm held still does not tremble — up, down, sideways, forward (good and noisy camera)', () => {
    for (const [noise, cmL, degL] of [[0.3, LIMITS.goodCm, LIMITS.goodDeg], [1, LIMITS.noisyCm, LIMITS.noisyDeg]]) {
        const r = still({ seeds: 1, noise });
        for (const [k, v] of Object.entries(r)) {
            assert.ok(v.cm <= cmL, `noise ${noise}, ${k}: the hand trembles ${v.cm.toFixed(2)} cm`);
            assert.ok(v.deg <= degL, `noise ${noise}, ${k}: the forearm trembles ${v.deg.toFixed(2)}°`);
        }
    }
});

test('a raised arm is never thrown forward and back by itself (the side flipping on the camera\'s noise; no twitch)', () => {
    for (const pose of ['overhead', 'tpose', 'raisedBent', 'rest']) {
        for (const seed of [3, 65]) {
            const fr = run({ arm: () => POSES[pose], seconds: 5, seed, noise: 0.3 }).filter((f) => f.t > 2.5);
            let jump = 0, zMin = Infinity, zMax = -Infinity;
            for (let i = 1; i < fr.length; i++) jump = Math.max(jump, fr[i].hand.distanceTo(fr[i - 1].hand));
            for (const f of fr) { zMin = Math.min(zMin, f.up.z); zMax = Math.max(zMax, f.up.z); }
            assert.ok(jump < 0.04, `${pose} (${seed}): a ${(jump * 100).toFixed(1)} cm twitch in one frame`);
            assert.ok(zMax - zMin < 0.2, `${pose} (${seed}): the upper arm swings ${((zMax - zMin) * 57).toFixed(0)}° in and out of the picture (before: ±17°, a range of 0.6)`);
        }
    }
});

test('a swing is drawn whole and on time, a quick stop does not overshoot', () => {
    const r = swing({ freqs: [1, 3], seeds: 1 });
    for (const [f, v] of Object.entries(r)) {
        assert.ok(v.amp >= LIMITS.swingAmp3, `${f} Hz: ${(v.amp * 100).toFixed(0)} % of the swing`);
        assert.ok(v.lagMs <= LIMITS.swingLagMs, `${f} Hz: ${v.lagMs.toFixed(0)} ms late`);
    }
    assert.ok(step({ seeds: 1 }).overshoot <= LIMITS.overshoot);
});

test('the depth at the picture\'s plane is gentle (√ was infinitely steep: the noise on the length alone made ±15°)', () => {
    const L = 1;
    assert.equal(planeDepth(L, 1), 0);
    assert.equal(planeDepth(L, 0.985, 0.03), 0, 'within the noise band: in the plane');
    // well out of the plane: about the true depth
    assert.ok(Math.abs(planeDepth(L, 0.5, 0.03) - Math.sqrt(1 - (0.5 / 0.97) ** 2)) < 0.03);
    // just past the band the depth grows gently (a few degrees, not ten)
    const d = planeDepth(L, 0.95, 0.03);
    assert.ok(d < 0.15, 'just past the band: ' + d.toFixed(3));
    // a person far from the camera: a noisier length → a wider band (learnt while still)
    assert.ok(ARM.DZ_HI > ARM.DZ_LO);
});

test('the direction\'s filter (a very noisy camera): still — steady, turning — at once; a side flip glides (does not open it)', () => {
    const F = new DirFilter(), o = { x: 0, y: 0, z: 0 };
    F.step(1, 0, 0, 1 / 60, o);
    // noise ±1° about +x: the drawn direction moves far less
    let maxDev = 0;
    for (let i = 0; i < 120; i++) {
        const a = (i % 2 ? 1 : -1) * 0.017;
        F.step(Math.cos(a), Math.sin(a), 0, 1 / 60, o);
        maxDev = Math.max(maxDev, Math.abs(Math.atan2(o.y, o.x)));
    }
    assert.ok(maxDev < 0.006, 'the noise cut: ' + (maxDev * 57.3).toFixed(2) + '°');
    // a real turn of 4 rad/s: followed closely after its start
    let th = 0;
    for (let i = 0; i < 30; i++) { th += 4 / 60; F.step(Math.cos(th), Math.sin(th), 0, 1 / 60, o); }
    assert.ok(Math.abs(th - Math.atan2(o.y, o.x)) < 0.12, 'a turn followed: ' + ((th - Math.atan2(o.y, o.x)) * 57.3).toFixed(1) + '° behind');
    // the solver flips a near-plane segment's side: the jump is glided over, not followed in a frame
    const G = new DirFilter();
    for (let i = 0; i < 60; i++) G.step(1, 0, 0.1, 1 / 60, o);
    G.rebase(1, 0, -0.1);
    G.step(0.995, 0, -0.0995, 1 / 60, o);
    assert.ok(o.z > 0.07, 'glides: ' + o.z.toFixed(3));
});

test('the solver keeps fixed memory (no garbage a frame)', () => {
    const s = new ArmSolver();
    const out = { u: { x: 0, y: 0, z: 0 }, f: { x: 0, y: 0, z: 0 }, g: { x: 0, y: 0, z: 0 } };
    const p = (x, y, z) => ({ x, y, z });
    s.solve('right', p(0.4, 0.4, 0), p(0.3, 0.4, 0), p(0.2, 0.4, 0), 1, out, 1 / 60);
    const keys = Object.keys(s.right).length;
    for (let i = 0; i < 200; i++) s.solve('right', p(0.4, 0.4, 0), p(0.3, 0.4 + (i % 3) * 0.002, 0), p(0.2, 0.4, 0), 1, out, 1 / 60);
    assert.equal(Object.keys(s.right).length, keys);
    assert.ok(Number.isFinite(out.u.x) && Number.isFinite(out.f.y));
});
