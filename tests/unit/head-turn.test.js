import test from 'node:test';
import assert from 'node:assert/strict';
import { headTurnStep, HEAD_DEAD, NEUTRAL_MAX } from '../../src/game/HeadTurn.js';

const DT = 1 / 60;

/** Hold the head at `yaw` for `sec` seconds; how far the body turned (rad). */
function hold(st, yaw, sec, dt = DT) {
    let turned = 0;
    for (let t = 0; t < sec; t += dt) turned += headTurnStep(st, yaw, dt).rate * dt;
    return turned;
}

test('a gentle held turn keeps turning: "straight" does not creep after the turned head', () => {
    const st = { neutral: 0 };
    const first = hold(st, 0.25, 2);
    assert.ok(first > 0.5, `turns at first (${first})`);
    // keep holding for a minute: the speed stays the same
    for (let i = 0; i < 30; i++) hold(st, 0.25, 2);
    const later = hold(st, 0.25, 2);
    assert.ok(Math.abs(later - first) < 1e-9, `as fast after a minute (${first} → ${later})`);
    assert.equal(st.neutral, 0);
});

test('a long session of left/right turns leaves right as fast as left and as at the start', () => {
    const st = { neutral: 0 };
    const rightAtStart = hold({ neutral: 0 }, 0.3, 1);
    // ten minutes: many turns of every size both ways (more to the right), rests in between,
    // the head smoothly coming back through the small angles, FPS dropping later on
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let head = 0;
    for (let t = 0; t < 600;) {
        const dt = t > 300 ? 1 / 12 : DT; // (the game slows down later)
        const target = rnd() < 0.35 ? 0 : (rnd() < 0.65 ? 1 : -1) * (0.17 + rnd() * 0.5);
        for (let k = 0; k < 2 / dt; k++, t += dt) {
            head += (target - head) * Math.min(1, dt * 3); // (a smoothed, gradual head)
            headTurnStep(st, head, dt);
        }
    }
    for (let k = 0; k < 40 / DT; k++) headTurnStep(st, head *= 0.9, DT); // (looking at the screen again for a while)
    const right = hold({ ...st }, 0.3, 1), left = -hold({ ...st }, -0.3, 1);
    assert.ok(Math.abs(right - rightAtStart) < 0.05 * rightAtStart, `right as at the start (${rightAtStart} → ${right})`);
    assert.ok(Math.abs(right - left) < 0.05 * right, `right ${right} vs left ${left}`);
});

test('a player at rest beside the camera is learned (the view stops turning)', () => {
    const st = { neutral: 0 };
    // the camera beside the screen: the head rests 0.12 off — inside the dead zone, learned
    hold(st, 0.12, 60);
    assert.ok(Math.abs(st.neutral - 0.12) < 0.01, `learned ${st.neutral}`);
    assert.equal(hold(st, 0.12, 1), 0);
    // and then, from there, right and left turn equally
    const r = hold({ ...st }, st.neutral + 0.3, 1), l = -hold({ ...st }, st.neutral - 0.3, 1);
    assert.ok(Math.abs(r - l) < 1e-6);
});

test('"straight" never wanders further than a camera beside the screen could need', () => {
    const st = { neutral: 0 };
    // the head slowly walking right, always just inside the dead zone
    for (let i = 0; i < 20000; i++) headTurnStep(st, st.neutral + HEAD_DEAD * 0.9, DT);
    assert.ok(st.neutral <= NEUTRAL_MAX + 1e-12);
});

test('broken numbers never freeze or poison the turn', () => {
    const st = { neutral: NaN };
    assert.deepEqual(headTurnStep(st, NaN, DT), { rate: 0, rel: 0 });
    assert.equal(st.neutral, 0);
    assert.equal(headTurnStep(st, 0.3, 0).rate, 0);
    assert.ok(headTurnStep(st, 0.5, DT).rate > 0);
    assert.ok(headTurnStep(st, -0.5, DT).rate < 0);
});

test('the turn speed does not depend on how far the body has already turned round', () => {
    // (the body's angle grows without bound over full turns; the speed only uses the head)
    const a = { neutral: 0 }, b = { neutral: 0 };
    let body = 0;
    for (let t = 0; t < 120; t += DT) body += headTurnStep(a, 0.6, DT).rate * DT; // ~40 full turns
    assert.ok(body > 2 * Math.PI * 30);
    assert.equal(headTurnStep(a, 0.3, DT).rate, headTurnStep(b, 0.3, DT).rate);
    assert.equal(headTurnStep(a, -0.3, DT).rate, -headTurnStep(b, 0.3, DT).rate);
});
