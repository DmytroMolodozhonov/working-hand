// The head turns the view also when the face net finds no face (a step farther from the camera):
// the body net's nose and ears give the turn (HeadFromBody.js), learnt against the face net meanwhile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HeadFromBody } from '../../src/input/HeadFromBody.js';
import { PoseInterpreter } from '../../src/input/PoseInterpreter.js';

// a head (x right, y down, z away from the camera) turned by yaw (the nose to the picture's right), pitch (up)
function head(yaw, pitch, { size = 0.035, cx = 0.5, cy = 0.2, aspect = 4 / 3 } = {}) {
    const at = ([x, y, z]) => {
        const X = x * Math.cos(yaw) - z * Math.sin(yaw), Z = x * Math.sin(yaw) + z * Math.cos(yaw);
        const Y2 = y * Math.cos(pitch) + Z * Math.sin(pitch);
        return { x: cx + X * size / aspect, y: cy + Y2 * size, z: 0, visibility: 0.99 };
    };
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.9, z: 0, visibility: 0.9 }));
    lm[0] = at([0, 0.15, -0.7]); // the nose
    lm[7] = at([0.75, 0, 0.35]); // the person's left ear: on the picture's right
    lm[8] = at([-0.75, 0, 0.35]);
    lm[11] = { x: cx + 0.07, y: cy + 0.1, z: 0, visibility: 0.99 };
    lm[12] = { x: cx - 0.07, y: cy + 0.1, z: 0, visibility: 0.99 };
    return lm;
}

test('the nose and the ears give the head\'s turn: the same way and about as far as the face net', () => {
    const H = new HeadFromBody();
    for (const yaw of [-0.6, -0.3, 0, 0.3, 0.6]) {
        const e = H.estimate(H.read(head(yaw, 0), 4 / 3));
        assert.ok(Math.abs(e.yaw - yaw) < 0.03, `${yaw} → ${e.yaw}`);
    }
    // not real ears (one point, below the shoulders): nothing
    const bad = head(0, 0);
    bad[7] = { ...bad[8] };
    assert.equal(H.read(bad, 4 / 3), null);
    const low = head(0, 0);
    low[7].y = low[8].y = 0.8;
    assert.equal(H.read(low, 4 / 3), null);
});

test('never a face: looking straight is where the nose usually is; up and down follow it', () => {
    const H = new HeadFromBody();
    for (let i = 0; i < 40; i++) H.estimate(H.read(head(0, 0), 4 / 3), 0.05);
    assert.ok(Math.abs(H.estimate(H.read(head(0, 0), 4 / 3), 0.05).pitch) < 0.02);
    assert.ok(H.estimate(H.read(head(0, 0.35), 4 / 3), 0.05).pitch > 0.2, 'looking up');
    assert.ok(H.estimate(H.read(head(0, -0.35), 4 / 3), 0.05).pitch < -0.2, 'looking down');
});

test('learnt from the face net while both see the head (here: its turn reads 30% bigger) → no jump when the face is lost', () => {
    const H = new HeadFromBody();
    for (let i = 0; i < 200; i++) {
        const yaw = Math.sin(i / 9) * 0.5, pitch = Math.sin(i / 13) * 0.3;
        H.learn(H.read(head(yaw, pitch), 4 / 3), yaw * 1.3, pitch + 0.05);
    }
    const e = H.estimate(H.read(head(0.4, 0.2), 4 / 3));
    assert.ok(Math.abs(e.yaw - 0.52) < 0.05, `yaw ${e.yaw}`);
    assert.ok(Math.abs(e.pitch - 0.25) < 0.06, `pitch ${e.pitch}`);
});

test('PoseInterpreter: no face found — the head still turns (from the body)', () => {
    const P = new PoseInterpreter(null);
    const video = { videoWidth: 640, videoHeight: 480 };
    let d;
    for (let i = 0; i < 30; i++) d = P.process({ poseLandmarks: head(0.5, 0), faceLandmarks: null }, video);
    assert.ok(d.headRotation.yaw > 0.35, `yaw ${d.headRotation.yaw}`);
    for (let i = 0; i < 30; i++) d = P.process({ poseLandmarks: head(-0.5, 0), faceLandmarks: null }, video);
    assert.ok(d.headRotation.yaw < -0.35, `yaw ${d.headRotation.yaw}`);
});

test('head lost for a while (far, against the light): the view does not freeze on the last turn — it eases back, and a head seen again takes over at once', () => {
    const real = performance.now.bind(performance);
    let now = 1000;
    performance.now = () => now;
    try {
        const P = new PoseInterpreter(null);
        const video = { videoWidth: 640, videoHeight: 480 };
        let d;
        for (let i = 0; i < 40; i++) { now += 50; d = P.process({ poseLandmarks: head(0.5, 0), faceLandmarks: null }, video); }
        const turned = d.headRotation.yaw;
        assert.ok(turned > 0.35);
        // nothing seen (no nose, no ears): the first half second it holds, then it eases back
        const blind = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.05 }));
        for (let i = 0; i < 8; i++) { now += 50; d = P.process({ poseLandmarks: blind, faceLandmarks: null }, video); }
        assert.ok(d.headRotation.yaw > turned * 0.9, 'a short gap holds the turn');
        for (let i = 0; i < 80; i++) { now += 50; d = P.process({ poseLandmarks: blind, faceLandmarks: null }, video); }
        assert.ok(d.headRotation.yaw < turned * 0.4, `eased back (${turned} → ${d.headRotation.yaw})`);
        // seen again (turned the other way): no slow crawl from the old value
        now += 50; d = P.process({ poseLandmarks: head(-0.5, 0), faceLandmarks: null }, video);
        assert.ok(d.headRotation.yaw < -0.3, `back at once (${d.headRotation.yaw})`);
    } finally {
        performance.now = real;
    }
});
