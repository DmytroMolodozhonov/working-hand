// The camera's face read as the «Реалистичный» hero's muscles (FaceExpr.js), and sent to the others in a few letters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FaceReader, encodeFace, decodeFace, faceDiff, applyFaceDiff, neutralFace, restFace, idleFace, FACE_KEYS } from '../../src/entities/FaceExpr.js';

/** A plain face's 478 points (only the ones read matter), the picture's x right, y down; moved by `f`, turned by `roll`. */
function facePoints({ smile = 0, close = 0, jaw = 0, brow = 0, wide = 0, gaze = 0, roll = 0 } = {}) {
    const P = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    const put = (i, x, y) => { P[i] = { x, y, z: 0 }; };
    // (the subject's right eye at the picture's left)
    put(33, 0.4, 0.45); put(133, 0.46, 0.45); put(263, 0.6, 0.45); put(362, 0.54, 0.45);
    const lid = 0.012 * (1 - close);
    put(159, 0.43, 0.45 - lid); put(145, 0.43, 0.45 + lid); put(386, 0.57, 0.45 - lid); put(374, 0.57, 0.45 + lid);
    put(468, 0.43 - gaze * 0.01, 0.45); put(473, 0.57 - gaze * 0.01, 0.45);
    for (const [i, x] of [[70, 0.4], [63, 0.415], [105, 0.43], [66, 0.445], [107, 0.46]]) put(i, x, 0.41 - brow * 0.01);
    for (const [i, x] of [[300, 0.6], [293, 0.585], [334, 0.57], [296, 0.555], [336, 0.54]]) put(i, x, 0.41 - brow * 0.01);
    put(10, 0.5, 0.33); put(152, 0.5, 0.68);
    put(0, 0.5, 0.585); put(2, 0.5, 0.55);
    put(13, 0.5, 0.6); put(14, 0.5, 0.6 + jaw * 0.04);
    put(61, 0.46 - wide * 0.01, 0.605 - smile * 0.012); put(291, 0.54 + wide * 0.01, 0.605 - smile * 0.012);
    if (roll) for (const p of P) { const dx = p.x - 0.5, dy = p.y - 0.5, c = Math.cos(roll), s = Math.sin(roll); p.x = 0.5 + dx * c - dy * s; p.y = 0.5 + dx * s + dy * c; }
    return P;
}

function settle(r, opts, t0 = 0) {
    let f;
    for (let i = 0; i < 40; i++) f = r.read(facePoints(opts), 1, t0 + i / 30);
    return f;
}

test('a calm face reads calm; a smile, closed eyes, an open jaw, raised brows, a wide mouth read as such', () => {
    const r = new FaceReader();
    const calm = settle(r, {});
    for (const k of FACE_KEYS) assert.ok(Math.abs(calm[k]) < 0.15, `${k} calm: ${calm[k]}`);
    const smile = settle(r, { smile: 1 }, 2);
    assert.ok(smile.smileL > 0.4 && smile.smileR > 0.4, `smile ${smile.smileL} ${smile.smileR}`);
    const shut = settle(new FaceReader(), { close: 0.95 }, 0);
    const r2 = new FaceReader(); settle(r2, {}); const blink = settle(r2, { close: 0.95 }, 2);
    assert.ok(blink.blinkL > 0.8 && blink.blinkR > 0.8, `blink ${blink.blinkL}`);
    assert.ok(shut.blinkL >= 0, 'never negative');
    const r3 = new FaceReader(); settle(r3, {});
    assert.ok(settle(r3, { jaw: 1 }, 2).jaw > 0.4, 'jaw');
    const r4 = new FaceReader(); settle(r4, {});
    const up = settle(r4, { brow: 1 }, 2);
    assert.ok(up.browL > 0.4 && up.browR > 0.4, `brows ${up.browL}`);
    const r5 = new FaceReader(); settle(r5, {});
    assert.ok(settle(r5, { wide: 1.5 }, 2).wide > 0.3, 'wide');
    const r6 = new FaceReader(); settle(r6, {});
    assert.ok(settle(r6, { wide: -1.5 }, 2).wide < -0.3, 'pucker («о»)');
});

test('a head tilted to the shoulder is a tilt, not a smile or a frown (the face is read in its own frame)', () => {
    const r = new FaceReader();
    settle(r, {});
    const f = settle(r, { roll: 0.3 }, 2);
    assert.ok(Math.abs(f.roll) > 0.3, `roll ${f.roll}`);
    for (const k of ['smileL', 'smileR', 'browL', 'browR', 'jaw', 'blinkL']) assert.ok(Math.abs(f[k]) < 0.2, `${k} ${f[k]}`);
});

test('the eyes looking aside move the gaze', () => {
    const r = new FaceReader();
    settle(r, {});
    assert.ok(Math.abs(settle(r, { gaze: 1 }, 2).gazeX) > 0.2);
});

test('a face in 14 letters, back the same within a step; only the changed numbers travel', () => {
    const f = { ...neutralFace(), smileL: 0.7, blinkR: 1, gazeX: -0.4, roll: 0.25 };
    const s = encodeFace(f);
    assert.equal(s.length, 14);
    const back = decodeFace(s);
    for (const k of FACE_KEYS) assert.ok(Math.abs(back[k] - f[k]) < 0.035, k);
    const g = { ...f, jaw: 0.6 };
    const d = faceDiff(s, encodeFace(g));
    assert.equal(d.length, 2, 'one changed number: two letters');
    assert.equal(applyFaceDiff(s, d), encodeFace(g));
    assert.equal(faceDiff(s, s), '');
    assert.equal(decodeFace('bad'), null);
});

test('a face nobody tracks blinks by itself and keeps the look’s resting face', () => {
    const base = restFace(3 + 0 * 6); // (angry eyes, a smile)
    assert.ok(base.browIn < 0 && base.smileL > 0);
    const st = {};
    let blinked = false;
    for (let i = 0; i < 60 * 8; i++) { const f = idleFace(st, 1 / 60, base); if (f.blinkL > 0.9) blinked = true; assert.ok(f.browIn < 0); }
    assert.ok(blinked, 'blinked within 8 s');
});
