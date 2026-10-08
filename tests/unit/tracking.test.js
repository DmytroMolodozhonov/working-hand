import test from 'node:test';
import assert from 'node:assert/strict';
import { assignHands, HandStabilizer, PoseStabilizer, isSaneHand } from '../../src/input/TrackingGuard.js';
import { PoseInterpreter } from '../../src/input/PoseInterpreter.js';

/** Synthetic open hand (image coords), fingers pointing up from the wrist. */
export function makeHand(wx, wy, size = 0.1, curl = 0) {
    const lm = [{ x: wx, y: wy, z: 0 }];
    const bases = [[-0.35, -0.25], [-0.2, -0.85], [0, -0.9], [0.18, -0.85], [0.33, -0.75]];
    const lens = [0.45, 0.75, 0.82, 0.75, 0.6];
    bases.forEach(([bx, by], f) => {
        const mx = wx + bx * size, my = wy + by * size;
        const L = lens[f] * size / 3;
        for (let j = 0; j < 4; j++) {
            if (j === 0) { lm.push({ x: mx, y: my, z: 0 }); continue; }
            // Curl folds the finger back towards the palm
            const ang = curl * (Math.PI * 0.55) * j;
            const prev = lm[lm.length - 1];
            lm.push({ x: prev.x, y: prev.y - L * Math.cos(ang), z: -L * Math.sin(ang) });
        }
    });
    return lm;
}

function makePose(lwx = 0.62, lwy = 0.6, rwx = 0.38, rwy = 0.6) {
    const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
    p[0] = { x: 0.5, y: 0.25, z: -0.3, visibility: 0.99 };
    p[11] = { x: 0.6, y: 0.4, z: 0, visibility: 0.99 }; // person's left shoulder (image right)
    p[12] = { x: 0.4, y: 0.4, z: 0, visibility: 0.99 };
    p[13] = { x: 0.62, y: 0.5, z: 0, visibility: 0.99 };
    p[14] = { x: 0.38, y: 0.5, z: 0, visibility: 0.99 };
    p[15] = { x: lwx, y: lwy, z: 0, visibility: 0.99 };
    p[16] = { x: rwx, y: rwy, z: 0, visibility: 0.99 };
    return p;
}

test('synthetic hand is sane, broken ones are not', () => {
    assert.ok(isSaneHand(makeHand(0.5, 0.5)));
    const nan = makeHand(0.5, 0.5); nan[3].x = NaN;
    assert.ok(!isSaneHand(nan));
    const collapsed = makeHand(0.5, 0.5, 0.001);
    assert.ok(!isSaneHand(collapsed));
});

test('hands are assigned by the body wrist, not by the (flipping) network label', () => {
    const pose = makePose();
    const leftHand = makeHand(0.62, 0.6), rightHand = makeHand(0.38, 0.6);
    // Labels deliberately wrong
    const r = assignHands([{ landmarks: leftHand, label: 'Left', score: 0.9 }, { landmarks: rightHand, label: 'Left', score: 0.9 }], pose);
    assert.equal(r.left, leftHand);
    assert.equal(r.right, rightHand);
    const one = assignHands([{ landmarks: rightHand, label: 'Left', score: 0.9 }], pose);
    assert.equal(one.right, rightHand);
    assert.equal(one.left, null);
});

test('ghost "hand" far from both wrists (e.g. on the face) is ignored', () => {
    const pose = makePose();
    const ghost = makeHand(0.5, 0.15);
    const r = assignHands([{ landmarks: ghost, label: 'Right', score: 0.9 }], pose);
    assert.equal(r.left, null);
    assert.equal(r.right, null);
});

test('low-confidence detections are dropped; without a body the label is used (mirrored)', () => {
    const h = makeHand(0.3, 0.5);
    assert.equal(assignHands([{ landmarks: h, label: 'Left', score: 0.2 }], null).right, null);
    const r = assignHands([{ landmarks: h, label: 'Left', score: 0.9 }], null);
    assert.equal(r.right, h);
});

test('a one-frame teleport glitch is rejected, a real move is accepted after confirmation', () => {
    const s = new HandStabilizer();
    let t = 0;
    for (let i = 0; i < 10; i++) assert.ok(s.process(makeHand(0.4, 0.5), (t += 33)));
    assert.equal(s.process(makeHand(0.9, 0.1), (t += 33)), null, 'glitch rejected');
    assert.ok(s.process(makeHand(0.41, 0.5), (t += 33)), 'back to normal');
    // Real relocation: same new position for several frames
    assert.equal(s.process(makeHand(0.85, 0.2), (t += 33)), null);
    assert.equal(s.process(makeHand(0.85, 0.2), (t += 33)), null);
    assert.ok(s.process(makeHand(0.85, 0.2), (t += 33)), 'confirmed after 3 frames');
});

test('mangled hand (wrong bone proportions) is rejected', () => {
    const s = new HandStabilizer();
    let t = 0;
    for (let i = 0; i < 10; i++) s.process(makeHand(0.4, 0.5), (t += 33));
    const bad = makeHand(0.4, 0.5);
    for (let i = 5; i < 21; i++) { bad[i].x = 0.4 + (i % 3) * 0.06; bad[i].y = 0.5 - (i % 5) * 0.05; }
    assert.equal(s.process(bad, (t += 33)), null);
    assert.ok(s.rejected >= 1);
});

test('pose: low-visibility wrist keeps its last good value instead of flailing', () => {
    const ps = new PoseStabilizer();
    let t = 0;
    let out;
    for (let i = 0; i < 5; i++) out = ps.process(makePose(), (t += 33));
    const glitch = makePose(0.1, 0.95);
    glitch[15].visibility = 0.1;
    out = ps.process(glitch, (t += 33));
    assert.ok(Math.abs(out[15].x - 0.62) < 0.02, `held at ${out[15].x}`);
    // Whole pose lost briefly → last pose bridged
    assert.ok(ps.process(null, (t += 100)));
    assert.equal(ps.process(null, (t += 2000)), null);
});

test('interpreter: punch, crouch and running from landmarks (original rules)', () => {
    const it = new PoseInterpreter(null);
    let d = it.process({ poseLandmarks: makePose() }, null);
    assert.equal(d.isPunching, false);
    d = it.process({ poseLandmarks: makePose(0.62, 0.3) }, null); // wrist moved 0.3 in one frame
    assert.equal(d.isPunching, true);
    const crouch = makePose(); crouch[0].y = 0.6;
    d = it.process({ poseLandmarks: crouch }, null);
    assert.equal(d.isCrouching, true);
    const up = makePose(); up[0].y = 0.4;
    d = it.process({ poseLandmarks: up }, null);
    assert.equal(d.isCrouching, false);
    // Shoulder bobbing → running
    const it2 = new PoseInterpreter(null);
    for (let i = 0; i < 8; i++) {
        const p = makePose(); const dy = (i % 2 ? 0.03 : -0.03);
        p[11].y += dy; p[12].y += dy;
        d = it2.process({ poseLandmarks: p }, null);
    }
    assert.equal(d.isRunning, true);
    assert.ok(d.runIntensity > 0.5);
});
