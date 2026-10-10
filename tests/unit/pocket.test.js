import test from 'node:test';
import assert from 'node:assert/strict';
import { pocketPose } from '../../src/input/PoseInterpreter.js';

/** A person facing the camera (their left = the picture's right); arms set per side. */
function person({ lEl, lWr, rEl, rWr, hipsVis = 0.95 }) {
    const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
    p[11] = { x: 0.6, y: 0.42, z: 0, visibility: 0.99 }; p[12] = { x: 0.4, y: 0.42, z: 0, visibility: 0.99 };
    p[23] = { x: 0.57, y: 0.8, z: 0, visibility: hipsVis }; p[24] = { x: 0.43, y: 0.8, z: 0, visibility: hipsVis };
    const put = (i, [x, y]) => { p[i] = { x, y, z: 0, visibility: 0.9 }; };
    put(13, lEl); put(15, lWr); put(14, rEl); put(16, rWr);
    return p;
}
/** A hand at the wrist: fingers along the angle (rad from straight down, picture plane). */
function handAt([wx, wy], ang = 0) {
    const h = Array.from({ length: 21 }, () => ({ x: wx, y: wy, z: 0 }));
    h[9] = { x: wx + Math.sin(ang) * 0.05, y: wy + Math.cos(ang) * 0.05, z: 0 };
    return h;
}
const mirror = ([x, y]) => [1 - x, y];

test('pocket: a hand put into the front pocket (wrist at the hip, elbow bent, the hand gone in)', () => {
    const lEl = [0.67, 0.6], lWr = [0.58, 0.79];
    const p = person({ lEl, lWr, rEl: mirror(lEl), rWr: mirror(lWr) });
    assert.equal(pocketPose(p, null, 'left'), true);
    assert.equal(pocketPose(p, null, 'right'), true);
    assert.equal(pocketPose(p, handAt(lWr, 0.2), 'left'), true, 'fingers into the pocket (down) — still in');
});

test('pocket: an arm simply hanging at the side is not in the pocket', () => {
    const lEl = [0.64, 0.6], lWr = [0.66, 0.82];
    const p = person({ lEl, lWr, rEl: mirror(lEl), rWr: mirror(lWr) });
    assert.equal(pocketPose(p, handAt(lWr, 0), 'left'), false);
    assert.equal(pocketPose(p, null, 'right'), false, '(even when the hand isn\'t seen)');
});

test('pocket: hands on the waist (fingers sideways) are not in the pocket', () => {
    const lEl = [0.72, 0.58], lWr = [0.62, 0.7];
    const p = person({ lEl, lWr, rEl: mirror(lEl), rWr: mirror(lWr) });
    assert.equal(pocketPose(p, handAt(lWr, -1.4), 'left'), false);
});

test('pocket: reaching down to the ground is not; no hips in the picture — can\'t tell', () => {
    const lEl = [0.66, 0.66], lWr = [0.62, 0.98];
    assert.equal(pocketPose(person({ lEl, lWr, rEl: mirror(lEl), rWr: mirror(lWr) }), null, 'left'), false);
    const inP = person({ lEl: [0.67, 0.6], lWr: [0.58, 0.79], rEl: [0.33, 0.6], rWr: [0.42, 0.79], hipsVis: 0.2 });
    assert.equal(pocketPose(inP, null, 'left'), null);
});
