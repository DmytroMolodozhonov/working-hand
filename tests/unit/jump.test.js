import test from 'node:test';
import assert from 'node:assert/strict';
import { frame } from '../e2e/poses.mjs';
import { JumpReader } from '../../src/input/JumpReader.js';
import { jumpHeight, jumpSpeed } from '../../src/game/Jump.js';

// the person a little away from the camera: the whole body (and the feet) in the picture
const SC = 0.7, T = (0.8 - 0.42) * SC; // torso length in the picture

/** One camera result: the whole body moved up by `up` torso lengths (the feet with it: `feet`). */
function pose({ up = 0, squat = 0, feet = true, hipsOnly = false, scale = SC, ...o } = {}) {
    const lm = frame({ legs: { left: 'stand', right: 'stand' }, scale, ...o }).poseLandmarks;
    const dy = -up * T;
    for (let i = 0; i < lm.length; i++) {
        let d = dy;
        if (squat && i < 25) d += squat * T; // (a squat: the body goes down, the feet stay)
        if (i >= 25 && !feet) d = 0;
        if (i >= 25 && squat && !up) d = 0;
        lm[i] = { ...lm[i], y: lm[i].y + d };
        if (hipsOnly && i >= 25) lm[i].visibility = 0.05;
    }
    return lm;
}

/** Feeds frames at 30 FPS: `at(t)` gives the pose options at t seconds. */
function run(at, seconds, r = new JumpReader()) {
    let out = null, n = Math.round(seconds * 30);
    const t0 = r._t || 0;
    for (let i = 0; i < n; i++) { const t = t0 + i / 30; out = r.read(pose(at(t - t0)), t * 1000); }
    r._t = t0 + n / 30;
    return { r, out };
}

/** A real jump: stand, squat down, push off, fly (`h` torso lengths at the top), land. */
const jump = (h, hipsOnly = false) => (t) => {
    if (t < 1) return { hipsOnly };
    if (t < 1.25) return { squat: 0.25 * (t - 1) / 0.25, hipsOnly };
    if (t < 1.35) return { squat: 0.25 * (1 - (t - 1.25) / 0.1), hipsOnly }; // (the push: the legs straighten)
    const tf = Math.sqrt(h) * 0.9, u = (t - 1.35) / tf; // (flight time grows with the height)
    if (u < 1) return { up: Math.max(0, 4 * h * u * (1 - u)), hipsOnly };
    return { hipsOnly };
};

test('jump: a real jump is a jump, and it lands', () => {
    const { out } = run(jump(0.5), 3);
    assert.equal(out.jumps, 1);
    assert.equal(out.lands, 1);
    assert.equal(out.air, false);
});

test('jump: a higher jump is a stronger jump', () => {
    const lo = run(jump(0.3), 3).out, hi = run(jump(0.8), 3).out;
    assert.equal(lo.jumps, 1); assert.equal(hi.jumps, 1);
    assert.ok(hi.strength > lo.strength + 0.2, `${lo.strength} → ${hi.strength}`);
});

test('jump: seen only down to the hips — a real jump still is, a small one is not', () => {
    assert.equal(run(jump(0.6, true), 3).out.jumps, 1);
    assert.equal(run(jump(0.18, true), 3).out.jumps, 0);
});

test('jump: a nod, the head tipped back, leaning — not a jump', () => {
    const nod = (t) => ({ noseY: 0.25 + (t > 1 && t < 1.3 ? 0.08 : t > 1.3 && t < 1.6 ? -0.08 : 0) });
    assert.equal(run(nod, 3).out.jumps, 0);
    const lean = (t) => ({ lean: t > 1 && t < 2 ? 0.08 * Math.sin((t - 1) * Math.PI) : 0, forward: t > 1 && t < 2 ? 0.2 : 0 });
    assert.equal(run(lean, 3).out.jumps, 0);
});

test('jump: standing up from a squat (fast) — not a jump', () => {
    const up = (t) => (t < 1 ? {} : t < 1.4 ? { squat: (t - 1) / 0.4 * 0.5 } : t < 3.5 ? { squat: 0.5 } : t < 3.7 ? { squat: 0.5 * (1 - (t - 3.5) / 0.2) } : {});
    assert.equal(run(up, 5).out.jumps, 0);
});

test('jump: steps on the spot and running (the body bobs) — not a jump', () => {
    const steps = (t) => ({ bob: 0.02 * Math.abs(Math.sin(t * 9)) });
    assert.equal(run(steps, 4).out.jumps, 0);
    const runs = (t) => ({ up: 0.1 * Math.abs(Math.sin(t * 11)) });
    assert.equal(run(runs, 4).out.jumps, 0);
});

test('jump: coming closer to the camera / going away — not a jump', () => {
    const closer = (t) => ({ scale: SC * (1 + Math.min(1, Math.max(0, t - 1) / 0.4) * 0.35) });
    assert.equal(run(closer, 3).out.jumps, 0);
    const away = (t) => ({ scale: SC * (1 - Math.min(1, Math.max(0, t - 1) / 0.4) * 0.3) });
    assert.equal(run(away, 3).out.jumps, 0);
});

test('jump: a camera jerk (one frame) or a lost frame — not a jump', () => {
    const jerk = (t) => ({ up: t > 1 && t < 1.04 ? 0.6 : 0 });
    assert.equal(run(jerk, 2).out.jumps, 0);
    const r = new JumpReader();
    for (let i = 0; i < 30; i++) r.read(pose(), i * 33);
    r.read(null, 1100); // (no pose for a while, then it is back)
    r.read(pose({ up: 0.5 }), 1500); r.read(pose({ up: 0.5 }), 1533);
    assert.equal(r.read(pose({ up: 0.5 }), 1566).jumps, 0);
});

test('jump: two jumps one after the other — two jumps', () => {
    const r = new JumpReader();
    run(jump(0.5), 3, r);
    assert.equal(run(jump(0.5), 3, r).out.jumps, 2);
});

test('jump: the gravity multiplier changes how high the hero jumps', () => {
    const earth = jumpHeight(1, 1);
    assert.ok(earth > 2.2 && earth < 2.6, `Earth ${earth}`); // (~1.2 m)
    assert.ok(jumpHeight(1, 0.38) > earth * 2); // Mars
    assert.ok(jumpHeight(1, 0.17) > jumpHeight(1, 0.38)); // the Moon
    assert.ok(jumpHeight(1, 2) < earth * 0.25); // heavy
    assert.ok(jumpHeight(1, 2.5) < 0.2); // Jupiter: almost no jump
    assert.ok(jumpSpeed(0, 1) < jumpSpeed(1, 1));
});
