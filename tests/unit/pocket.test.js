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

import { lookPitch } from '../../src/input/PoseInterpreter.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('the head tilted back looks straight up (a real head goes ~40° back before the camera loses the face)', () => {
    assert.equal(lookPitch(0.1), 0.1, 'small nods as they are');
    assert.equal(lookPitch(-0.6), -0.6, 'looking down as it is');
    assert.ok(lookPitch(0.7) > 1.5, `40° back: almost straight up (${(lookPitch(0.7) * 57.3).toFixed(0)}°)`);
    assert.ok(lookPitch(1.2) < Math.PI / 2, 'never over the top');
    for (let p = 0; p < 1.2; p += 0.05) assert.ok(lookPitch(p + 0.05) >= lookPitch(p), 'smooth, one way');
});

test('«Assemble» is «Gather» too (Gather is not always heard right)', () => {
    for (const w of ['assemble', 'Ассембл', 'эссембл', 'gather', 'гезер']) assert.equal(matchSpell(w), 'Gather', w);
});

import { handAtMouth } from '../../src/input/PoseInterpreter.js';
import { frame } from '../e2e/poses.mjs';

test('eating: the hand brought to the mouth is seen in the picture; a hand in front of the chest or hanging is not', () => {
    const at = frame({ toMouth: 'right', rightCurl: 0.8 });
    const hands = (f, label) => f.hands.find((h) => h.label === label)?.landmarks;
    assert.equal(handAtMouth(at.poseLandmarks, hands(at, 'Left'), 'right'), true, 'the right hand at the mouth');
    assert.equal(handAtMouth(at.poseLandmarks, null, 'right'), true, 'the hand unseen: the wrist under the mouth');
    const fwd = frame({ arms: 'forward', rightCurl: 0.8 });
    assert.equal(handAtMouth(fwd.poseLandmarks, hands(fwd, 'Left'), 'right'), false, 'arm stretched forward');
    const down = frame({ arms: 'hang', rightCurl: 0.8 });
    assert.equal(handAtMouth(down.poseLandmarks, hands(down, 'Left'), 'right'), false, 'arm hanging');
});

test('pocket: lowering a hand that holds a thing (the elbow a little bent, the wrist beside the thigh, the fist down) does not put it away', () => {
    // the wrist at the hip height but beside the thigh, the elbow relaxed (~15–25°)
    const lEl = [0.64, 0.6], lWr = [0.655, 0.8];
    const p = person({ lEl, lWr, rEl: mirror(lEl), rWr: mirror(lWr) });
    assert.equal(pocketPose(p, null, 'left'), false, 'hand unseen at the side');
    assert.equal(pocketPose(p, handAt(lWr, 0), 'left'), false, 'a fist pointing down at the side');
    assert.equal(pocketPose(p, null, 'right'), false);
});
