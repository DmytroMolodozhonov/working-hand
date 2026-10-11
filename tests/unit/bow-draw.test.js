/**
 * Drawing a bow with a noisy camera (BowDraw): the fingers take the string at the
 * bow, it follows the hand back to the chin, opening them shoots as strong as it
 * was drawn; the hand brought forward lets it down without a shot; a flicker of
 * the tracking or a hand lost by the face never shoots by itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BowDraw, drawProgress, MIN_SHOT } from '../../src/game/BowDraw.js';

const DT = 1 / 60;
/** A repeatable noise (−1 … 1). */
function noise(seed = 1) {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; };
}
/** Run `secs` of frames; `at(t)` → {progress, curl, near?}; returns the events. */
function run(b, secs, at) {
    const evs = [];
    for (let t = 0; t < secs; t += DT) {
        const f = at(t);
        const e = b.step({ near: f.progress != null && f.progress < 0.3, ...f }, DT);
        if (e) evs.push(e);
    }
    return evs;
}

test('bow draw: fingers close at the bow, the string follows the hand to the chin, opening shoots at full power', () => {
    const b = new BowDraw();
    // the open hand comes to the bow: nothing yet
    assert.deepEqual(run(b, 0.3, () => ({ progress: 0.05, curl: 0.1 })), []);
    assert.equal(b.held, false);
    // the fingers close on the string
    assert.deepEqual(run(b, 0.1, () => ({ progress: 0.05, curl: 0.85 })), [{ type: 'take' }]);
    // half way back: half drawn (the string follows the hand, not more, not less)
    run(b, 0.5, () => ({ progress: 0.05 + 0.4, curl: 0.85 }));
    assert.ok(Math.abs(b.draw - 0.5) < 0.05, `half way → half drawn (${b.draw.toFixed(2)})`);
    // at the chin: fully
    run(b, 0.5, () => ({ progress: 0.95, curl: 0.85 }));
    assert.ok(b.draw > 0.97, `at the chin → fully drawn (${b.draw.toFixed(2)})`);
    const evs = run(b, 0.3, () => ({ progress: 0.95, curl: 0.05 }));
    assert.equal(evs.length, 1);
    assert.equal(evs[0].type, 'shoot');
    assert.ok(evs[0].power > 0.95, `full power (${evs[0].power.toFixed(2)})`);
    assert.equal(b.held, false);
});

test('bow draw: a real, noisy camera — the jittering hand, fingers that flicker open for a frame — still draws fully and shoots once, only when the fingers open', () => {
    const b = new BowDraw();
    const n = noise(7);
    const evs = [];
    let t = 0;
    const frame = (progress, curl) => { const e = b.step({ progress, near: progress < 0.3, curl }, DT); if (e) evs.push({ ...e, t }); t += DT; };
    // at the bow, closing the fingers (the reading jumps around)
    for (let i = 0; i < 20; i++) frame(0.08 + 0.08 * n(), 0.75 + 0.15 * n());
    assert.deepEqual(evs.map((e) => e.type), ['take']);
    // drawing back over half a second; every 10th frame the fingers read open (a flicker)
    for (let i = 0; i < 30; i++) frame(0.08 + (i / 30) * 0.9 + 0.1 * n(), i % 10 === 5 ? 0.1 : 0.75 + 0.15 * n());
    // holding at the chin, aiming (a second), the hand lost for a few frames now and then
    let minDraw = 1;
    for (let i = 0; i < 60; i++) { frame(0.95 + 0.1 * n(), i % 15 < 3 ? null : 0.75 + 0.15 * n()); if (i > 10) minDraw = Math.min(minDraw, b.draw); }
    assert.deepEqual(evs.map((e) => e.type), ['take'], 'no shot by itself: ' + JSON.stringify(evs));
    assert.ok(minDraw > 0.85, `held fully drawn while aiming (lowest ${minDraw.toFixed(2)})`);
    // the fingers open
    for (let i = 0; i < 12; i++) frame(0.97 + 0.1 * n(), 0.1 + 0.1 * n());
    assert.deepEqual(evs.map((e) => e.type), ['take', 'shoot']);
    assert.ok(evs[1].power > 0.85, `strong (${evs[1].power.toFixed(2)})`);
});

test('bow draw: the hand brought forward again lets the string down — opening the fingers then shoots nothing', () => {
    const b = new BowDraw();
    run(b, 0.2, () => ({ progress: 0.1, curl: 0.9 }));
    run(b, 0.6, (t) => ({ progress: 0.1 + Math.min(1, t / 0.4) * 0.6, curl: 0.9 }));
    assert.ok(b.draw > 0.6, `drawn (${b.draw.toFixed(2)})`);
    // slowly forward to the bow
    run(b, 1.0, (t) => ({ progress: 0.7 - Math.min(1, t / 0.8) * 0.65, curl: 0.9 }));
    assert.ok(b.draw < 0.05, `let down (${b.draw.toFixed(2)})`);
    const evs = run(b, 0.3, () => ({ progress: 0.05, curl: 0.05 }));
    assert.deepEqual(evs, [{ type: 'letdown' }]);
    assert.ok(MIN_SHOT > 0.05);
});

test('bow draw: a hand the camera loses by the face keeps the string; seen open again — the arrow flies', () => {
    const b = new BowDraw();
    run(b, 0.2, () => ({ progress: 0.1, curl: 0.9 }));
    run(b, 0.6, () => ({ progress: 0.9, curl: 0.9 }));
    const d = b.draw;
    assert.deepEqual(run(b, 1.5, () => ({ progress: null, curl: null })), [], 'lost: nothing happens');
    assert.ok(b.held && Math.abs(b.draw - d) < 1e-9, 'the string stays as it was');
    const evs = run(b, 0.2, () => ({ progress: 0.92, curl: 0.05 }));
    assert.equal(evs[0]?.type, 'shoot');
});

test('bow draw: fingers closing by the chin do not take the string (only at the bow)', () => {
    const b = new BowDraw();
    assert.deepEqual(run(b, 0.5, () => ({ progress: 0.9, curl: 0.9, near: true })), []);
    assert.equal(b.held, false);
});

test('bow draw: the way to the chin — in the picture for a sideways archer, in depth for a bow arm pointed at the camera', () => {
    // sideways: the bow fist far out to the side of the picture, the hand half way to the chin
    const side = drawProgress({ bow: { x: 0, y: 0 }, anchor: { x: 1.6, y: 0 }, hand: { x: 0.8, y: 0.02 }, sw: 0.5 }, 1.0);
    assert.ok(Math.abs(side.progress - 0.5) < 0.05, `sideways: half way (${side.progress.toFixed(2)})`);
    assert.equal(side.near, false);
    // at the camera: the bow fist seen right by the face; the hand at the chin is far back in depth
    const atCam = drawProgress({ bow: { x: 0, y: 0 }, anchor: { x: 0.08, y: 0.05 }, hand: { x: 0.08, y: 0.06 }, sw: 0.5 }, 1.15);
    assert.ok(atCam.progress > 0.95, `at the camera: the depth shows the draw (${atCam.progress.toFixed(2)})`);
    // and the hand at the bow there: near, hardly any way
    const atBow = drawProgress({ bow: { x: 0, y: 0 }, anchor: { x: 0.08, y: 0.05 }, hand: { x: 0.01, y: 0 }, sw: 0.5 }, 0.62);
    assert.ok(atBow.near && atBow.take && atBow.progress < 0.1, JSON.stringify(atBow));
    // the hand by the chin there: near the bow fist in the picture, yet it cannot take the string
    const chin = drawProgress({ bow: { x: 0, y: 0 }, anchor: { x: 0.12, y: 0.08 }, hand: { x: 0.13, y: 0.09 }, sw: 0.5 }, 1.1);
    assert.ok(chin.near && !chin.take, JSON.stringify(chin));
    // nothing seen of the picture: the 3D arms alone
    assert.ok(Math.abs(drawProgress(null, 0.875).progress - 0.5) < 1e-9);
    assert.equal(drawProgress(null, null).progress, null);
});
