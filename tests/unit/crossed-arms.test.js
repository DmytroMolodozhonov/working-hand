// «Protection» by crossed arms (CrossedArms.js): the pure pose from the camera's points, the hold / release timers, the hysteresis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crossedPose, CrossedGesture, CROSS } from '../../src/game/CrossedArms.js';

// the picture: x right, y down; the person's left on the picture's right (shoulders 0.6 / 0.4, line y 0.42, width 0.2)
const P = (lw, rw, extra = {}) => {
    const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.8, z: 0, visibility: 0.95 }));
    p[11] = { x: 0.6, y: 0.42, z: 0, visibility: 0.99 }; p[12] = { x: 0.4, y: 0.42, z: 0, visibility: 0.99 };
    p[15] = { ...p[15], x: lw[0], y: lw[1] }; p[16] = { ...p[16], x: rw[0], y: rw[1] };
    return Object.assign(p, extra);
};

test('crossed arms before the chest are a cross', () => assert.equal(crossedPose(P([0.45, 0.52], [0.55, 0.52])), true));

test('hands on the opposite shoulders (as the dead are laid) are a cross too', () => assert.equal(crossedPose(P([0.42, 0.44], [0.58, 0.44])), true));

test('a mirror image (left shoulder on the picture\'s left) is the same cross', () => {
    const p = P([0.55, 0.52], [0.45, 0.52]);
    p[11].x = 0.4; p[12].x = 0.6;
    assert.equal(crossedPose(p), true);
});

test('the other poses are not', () => {
    const no = {
        hanging: P([0.66, 0.82], [0.34, 0.82]),
        forward: P([0.6, 0.44], [0.4, 0.44]),
        up: P([0.65, 0.17], [0.35, 0.17]),
        T: P([0.95, 0.42], [0.05, 0.42]),
        pockets: P([0.58, 0.79], [0.42, 0.79]),
        mouth: P([0.515, 0.35], [0.49, 0.5]), // (a hand at the mouth: above the shoulders)
        mouthCrossed: P([0.45, 0.33], [0.55, 0.33]), // (both at the face, crossed: not the chest)
        clasped: P([0.51, 0.52], [0.49, 0.52]), // (fingers locked in the middle)
        together: P([0.5, 0.5], [0.5, 0.5]),
        beltCrossed: P([0.45, 0.8], [0.55, 0.8]), // (hands crossed low, at the belt)
        stretchedAside: P([0.1, 0.45], [0.9, 0.45]), // (wrists swapped far outside the shoulders: not a cross)
        lost: P([0.45, 0.52], [0.55, 0.52], { 15: { x: 0.45, y: 0.52, visibility: 0.1 } }),
    };
    for (const [name, p] of Object.entries(no)) assert.equal(crossedPose(p), false, name);
});

test('hysteresis: a cross a bit off the entry limits holds, but does not start', () => {
    const loose = P([0.49, 0.52], [0.51, 0.52]); // (swapped by 0.1 W: under SWAP_IN, over SWAP_OUT)
    assert.equal(crossedPose(loose, false), false);
    assert.equal(crossedPose(loose, true), true);
});

test('timers: ~0.35 s to confirm, ~0.2 s to let go; a flicker does neither', () => {
    const g = new CrossedGesture(), dt = 1 / 30;
    let t = 0, on = null;
    while (t < 1 && !on) { on = g.step(dt, true); t += dt; }
    assert.equal(on, 'on');
    assert.ok(t >= CROSS.HOLD - 1e-6 && t < CROSS.HOLD + 2 * dt, `confirmed after ${t}`);
    for (let i = 0; i < 3; i++) assert.equal(g.step(dt, false), null); // (one lost frame is not letting go)
    assert.equal(g.step(dt, true), null);
    t = 0; let off = null;
    while (t < 1 && !off) { off = g.step(dt, false); t += dt; }
    assert.equal(off, 'off');
    assert.ok(t >= CROSS.RELEASE - 1e-6 && t < CROSS.RELEASE + 2 * dt, `released after ${t}`);
    const h = new CrossedGesture(); // (a brush of the arms, 0.2 s, is no shield)
    for (let i = 0; i < 6; i++) assert.equal(h.step(dt, true), null);
    assert.equal(h.step(dt, false), null);
    for (let i = 0; i < 20; i++) assert.equal(h.step(dt, false), null);
});
