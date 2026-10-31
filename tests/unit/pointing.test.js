/**
 * «Куда указывает палочка» (the author: «V5 подтормаживает, не указывает туда, куда нужно, нет плавности»): the whole chain
 * camera → filters → drawn V5 wand on synthetic pointing (tools/handbench/pointing.mjs, pointbench.mjs for the table).
 * Thresholds only ever tighten.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { measure, settle } from '../../tools/handbench/pointing.mjs';
import { HandFilter } from '../../src/input/TrackingGuard.js';
import { PoseSmoother } from '../../src/input/PoseSmoother.js';
import { cameraLine } from '../../src/game/HandsLog.js';
import { smoothFactor } from '../../src/input/HandSmooth.js';

test('the V5 wand points where the arm points (was 34.5° off towards the thumb: the grip\'s slant carried into the aim)', () => {
    for (const [yaw, pitch] of [[0, 0], [15, 5], [40, 0], [-30, 0], [0, 35], [0, -30]]) {
        const r = measure({ move: 'still', yaw, pitch });
        assert.ok(r.bias < 1.5, `${yaw}/${pitch}: ${r.bias.toFixed(2)}°`);
    }
    const left = measure({ move: 'still', side: 'left' });
    assert.ok(left.bias < 1.5, `left-handed: ${left.bias.toFixed(2)}°`);
});

test('a still wand does not tremble (the camera\'s jitter: ≤ 0.35° RMS, no steps frame to frame)', () => {
    const r = measure({ move: 'still' });
    assert.ok(r.jit <= 0.35, `jitter ${r.jit.toFixed(3)}°`);
    assert.ok(r.tremble <= 0.06, `steps ${r.tremble.toFixed(3)}°`);
});

test('the delay end to end (a camera giving its pictures 70 ms late): a careful aim ≤ 100 ms, sweeping ≤ 105, slow tracking ≤ 150 (were 135 / 165 / 245)', () => {
    assert.ok(measure({ move: 'aim' }).lagMs <= 100);
    assert.ok(measure({ move: 'sweep' }).lagMs <= 105);
    assert.ok(measure({ move: 'track', ms: 3000 }).lagMs <= 150);
});

test('a quick flick: no overshoot past the target (the arm shown ahead stops where the hand stopped)', () => {
    const s = settle({});
    assert.ok(s.over <= 2, `overshoot ${s.over.toFixed(2)}°`);
    assert.ok(s.ms != null && s.ms <= 150, `settled in ${s.ms} ms`);
});

test('the hand\'s filter: a slow steady move is not taken for jitter (its speed from the steadied velocities)', () => {
    const f = new HandFilter({ minCutoff: 0.6, beta: 8, dCutoff: 4, floorK: 1.5, floorT: 3, dead: 0.3 });
    const out = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    const hand = (dx) => Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + dx + (i % 5) * 0.01, y: 0.5 + Math.floor(i / 5) * 0.012, z: 0 }));
    // 3 s moving steadily at ~1.3 palm sizes a second (a careful aim): the filter must not fall behind more than ~2 pictures' travel
    let t = 0, x = 0;
    for (let k = 0; k < 90; k++) { t += 1 / 30; x += 0.0025; f.filter(hand(x), t, out); }
    const behind = (0.5 + x) - out[0].x;
    assert.ok(behind < 0.0025 * 2.5, `behind ${behind.toFixed(4)} (≈ ${(behind / 0.0025).toFixed(1)} pictures)`);
});

test('the smoother shows a steadily moving arm ahead of its old picture, a still one as it is', () => {
    const s = new PoseSmoother();
    const P = (x, ts) => ({ leftShoulder: { x: 0.6, y: 0.4, z: 0 }, rightShoulder: { x: 0.4, y: 0.4, z: 0 }, leftElbow: { x: 0.7, y: 0.5, z: 0 }, leftWrist: { x, y: 0.5, z: 0 }, rightElbow: { x: 0.3, y: 0.5, z: 0 }, rightWrist: { x: 0.25, y: 0.5, z: 0 }, ts });
    // pictures every 33 ms, each 60 ms old when it comes; the left wrist moves 0.01 a picture (0.3 a second)
    let shown = null;
    for (let k = 0; k < 20; k++) { const now = 1000 + k * 33; s.push(P(0.75 + 0.01 * k, now - 60), now); shown = s.sample(now + 16); }
    const newest = 0.75 + 0.01 * 19;
    assert.ok(shown.leftWrist.x > newest + 0.01, `shown ${shown.leftWrist.x.toFixed(3)}, picture ${newest.toFixed(3)}`);
    assert.equal(shown.rightWrist.x, 0.25); // (the still arm: not moved)
    // the left hand holding a thing it may throw: not carried (the hands' memory needs the true speed)
    s.hold.left = true;
    assert.ok(Math.abs(s.sample(1000 + 19 * 33 + 30).leftWrist.x - newest) < 1e-9); // (once the blend from the shown pose is over)
});

test('the journal «Руки»: the camera\'s line says why poses come rarely / late', () => {
    const ok = cameraLine({ poses: 30, camFps: 30, age: 70, stages: [2, 30, 6], gameFps: 60, lead: 60, engine: 'V5' });
    assert.ok(ok.text.includes('30 поз/с') && !ok.bad, ok.text);
    const slow = cameraLine({ poses: 12, camFps: 15, age: 160, stages: [40, 70, 8], gameFps: 50 });
    assert.ok(slow.bad);
    for (const why of ['камера сама даёт только 15', 'нейросети считают кадр 70', 'кадр ждал 40']) assert.ok(slow.text.includes(why), slow.text);
});

test('«Плавность камеры» moves the hands\' filters sensibly: 0 % quickest, the default 70 % as tuned, 100 % smoothest', () => {
    assert.ok(Math.abs(smoothFactor(70) - 1) < 1e-9);
    assert.ok(smoothFactor(0) > 3.5 && smoothFactor(100) < 0.6);
    assert.ok(smoothFactor(30) > smoothFactor(50));
});
