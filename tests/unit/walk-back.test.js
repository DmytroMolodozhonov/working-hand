// «Ходьба назад» (the author 05.11, twice: «сильно наклонял спину, но никак не уходит»). A real body in 3-D (hips, shoulders, head)
// leaning back from the hips, turning, stepping away from the camera, seated with the hips out of the frame — projected into the
// camera's picture as the network gives it (x, y in the frame, z — the depth from the hips' middle in the width's scale, with a jitter)
// → torsoMetrics → leanBack. Found: the old sign needed the hips clearly in the frame (seated — never), the shoulders' width changed as
// much by stepping away from the camera.
import test from 'node:test';
import assert from 'node:assert/strict';
import { torsoMetrics } from '../../src/input/PoseInterpreter.js';
import { _leanBack, LEAN_BACK } from '../../src/game/Game.js';

const DEG = Math.PI / 180;
let seed = 1;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const jit = (s) => (rnd() - 0.5) * 2 * s;

/**
 * The 33 landmarks of a body: lean (deg, + back from the hips), turn (deg, round the spine), dist (m to the camera), seated (the hips
 * low, out of the frame, unseen). Metres: hips 0.3 wide, shoulders 0.42 wide, 0.52 over the hips; the head over them.
 */
function body({ lean = 0, turn = 0, dist = 2.4, seated = false, noise = 0.012 } = {}) {
    const P = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
    const pts = { 0: [0, 0.78, -0.09], 7: [0.07, 0.76, 0], 8: [-0.07, 0.76, 0], 9: [0.02, 0.72, -0.08], 10: [-0.02, 0.72, -0.08], 11: [0.21, 0.52, 0], 12: [-0.21, 0.52, 0],
        13: [0.27, 0.27, 0], 14: [-0.27, 0.27, 0], 15: [0.27, 0.05, -0.08], 16: [-0.27, 0.05, -0.08], 23: [0.15, 0, 0], 24: [-0.15, 0, 0] };
    const up = new Set([0, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const f = 1.1, cy = seated ? 0.62 : 0.3; // (seated: the camera sees the chest and the head; the hips under the frame)
    let hz = 0;
    const world = {};
    for (const [k, [x0, y0, z0]] of Object.entries(pts)) {
        let x = x0, y = y0, z = z0;
        if (up.has(+k)) { const c = Math.cos(lean * DEG), s = Math.sin(lean * DEG); [y, z] = [y * c - z * s, y * s + z * c]; } // (leaning back: z away from the camera)
        const c = Math.cos(turn * DEG), s = Math.sin(turn * DEG); [x, z] = [x * c + z * s, -x * s + z * c];
        world[k] = [x, y, z];
    }
    hz = (world[23][2] + world[24][2]) / 2;
    for (const [k, [x, y, z]] of Object.entries(world)) {
        const d = dist + z;
        P[k] = { x: 0.5 + f * x / d + jit(noise * 0.3), y: 0.5 - f * (y - cy) / d + jit(noise * 0.3), z: f * (z - hz) / dist + jit(noise), visibility: 0.95 };
        if (seated && (+k === 23 || +k === 24)) P[k].visibility = 0.15;
    }
    return P;
}

/** Feed `secs` of a pose (30 a second) → the last leanBack value and the most seen. */
function run(st, o, secs, stepping = true) {
    let last = 0, max = 0;
    for (let i = 0; i < secs * 30; i++) { last = _leanBack(st, torsoMetrics(body(o)), 1 / 30, stepping); max = Math.max(max, last); }
    return { last, max };
}

test('standing: upright never walks back (noise over a minute, stepping); leaning back 30° while stepping — back; upright — stops; never by itself', () => {
    seed = 1;
    const st = {};
    assert.equal(run(st, {}, 60).max, 0, 'upright with a jitter: never');
    assert.equal(run(st, { lean: 30 }, 1).last, 1, 'leaning back (≈ 30°) while stepping');
    assert.equal(run(st, {}, 1).last, 0, 'upright: stops');
    assert.equal(run(st, { lean: 40 }, 1).last, 1, 'a strong lean: the same — only while stepping (ch.backward needs the steps)');
});

test('the author\'s «почти всегда хожу назад»: a body whose own upright depth is large (a low camera, a chair, a posture) walks forward', () => {
    seed = 7;
    for (const lean of [12, 20, 28]) {
        const st = {};
        run(st, { lean }, 3, false); // (the first seconds: its own upright measured, standing)
        assert.equal(run(st, { lean }, 20).max, 0, `its own posture ${lean}° is its upright`);
        assert.equal(run(st, { lean: lean + 30 }, 1.5).last, 1, `and a real lean back from it counts (${lean}° → ${lean + 30}°)`);
    }
});

test('a blink of a lean (shorter than HOLD) — nothing: the camera\'s jump never walks back', () => {
    seed = 8;
    const st = {};
    run(st, {}, 5);
    assert.equal(run(st, { lean: 30 }, LEAN_BACK.HOLD * 0.5).max, 0);
});
test('seated at the monitor, the hips out of the frame: the lean back is still seen (the old sign never saw it)', () => {
    seed = 2;
    const st = {};
    assert.equal(run(st, { seated: true }, 20).max, 0);
    assert.ok(run(st, { seated: true, lean: 32 }, 1.5).last >= 1);
    // (the old sign: no depth without the hips)
    assert.equal(torsoMetrics(body({ seated: true, lean: 25 })).depth, null);
});

test('not a lean back: turning round, leaning forward, stepping away from the camera, a small sway', () => {
    seed = 3;
    for (const o of [{ turn: 40 }, { turn: -40 }, { lean: -25 }, { dist: 3.6 }, { dist: 1.6 }, { lean: 4 }]) {
        const st = {};
        run(st, {}, 5);
        assert.equal(run(st, o, 3).max, 0, JSON.stringify(o));
    }
});

test('its own upright is learned: a player who stands a little back all the time is not walking back for ever', () => {
    seed = 4;
    const st = {};
    run(st, { lean: 9 }, 30);
    assert.equal(run(st, { lean: 9 }, 5).max, 0);
    assert.equal(run(st, { lean: 40 }, 1.5).last >= 1, true, 'and a real lean from it still counts');
    assert.ok(LEAN_BACK.ON > LEAN_BACK.OFF);
});

test('no depth from the camera (an old engine): nothing, never a walk', () => {
    const st = {};
    const t = torsoMetrics(body({ lean: 30 }).map((p) => ({ ...p, z: 0 })));
    assert.equal(_leanBack(st, t, 1 / 30), 0);
});

test('standing still (not stepping) never walks back, whatever the lean', () => {
    seed = 9;
    const st = {};
    run(st, {}, 3);
    // (the hero walks back only while stepping on the spot — Game: ch.backward = back && ch.isRunning)
    assert.ok(run(st, { lean: 25 }, 2, false).max <= 1);
});

test('the author\'s «хожу назад, хотя должен идти вперёд»: stepping makes the shoulders look 10° «deeper» than standing — still forward', () => {
    seed = 11;
    const st = {};
    run(st, {}, 4, false); // (standing: its upright)
    assert.equal(run(st, { lean: 5 }, 30, true).max, 0, 'stepping with the body\'s own small lean: forward');
    assert.equal(run(st, { lean: 42 }, 1.5, true).last, 1, 'a real lean back while stepping: back');
});

test('stuck on «back» with the lean not changing (an offset of the camera) — the upright is taken anew, forward again', () => {
    const st = {};
    const t = (tilt) => ({ tilt });
    for (let i = 0; i < 90; i++) _leanBack(st, t(Math.sin(i) * 1.5), 1 / 30, true);
    let last = 0;
    for (let i = 0; i < 60; i++) last = _leanBack(st, t(14 + Math.sin(i) * 1.5), 1 / 30, true);
    assert.equal(last, 1);
    for (let i = 0; i < 30 * (LEAN_BACK.STUCK + 2); i++) last = _leanBack(st, t(14 + Math.sin(i) * 1.5), 1 / 30, true);
    assert.equal(last, 0, 'not back for ever');
    assert.ok(st.stuck >= 1);
});

test('the 3-D body\'s tilt (the camera program sends it): a straight back walks forward; leaning back ~12° — back; it wins over the noisy depth', () => {
    const st = {};
    const t = (tilt, back = 0.6) => ({ tilt, back, sw: 0.2 }); // (a noisy depth saying «leaning back» all the time)
    let max = 0;
    for (let i = 0; i < 30 * 10; i++) max = Math.max(max, _leanBack(st, t((Math.sin(i) * 2)), 1 / 30, true)); // (a straight back, ±2° of jitter)
    assert.equal(max, 0, 'a straight back: forward, whatever the depth says');
    let last = 0;
    for (let i = 0; i < 30; i++) last = _leanBack(st, t(12 + Math.sin(i)), 1 / 30, true);
    assert.equal(last, 1, 'leaning back 12°: back');
    for (let i = 0; i < 20; i++) last = _leanBack(st, t(1), 1 / 30, true);
    assert.equal(last, 0, 'straight again: forward');
});
