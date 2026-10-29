// «Flying Maxima»: fast along the ground (Earth and planets), into space only straight up for FLYMAX.UP_HOLD s.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightController, FLIGHT } from '../../src/game/Flight.js';
import { Space, FLYMAX } from '../../src/game/Space.js';

function fastFlight(dive = 0) {
    const f = new FlightController();
    f.start();
    f.state = 'cruise'; f.t = 5; f.fast = true;
    f.steering = () => ({ turn: 0, dive }); // (the body leans: dive<0 — up)
    return f;
}
function spaceWith(f) {
    const S = Object.create(Space.prototype);
    const calls = [];
    S.game = { flight: f, fx: {}, hud: { setVoice() {} }, isDeadLocal: false };
    S.state = 'off'; S._msgAt = {}; S._overlay = () => {};
    S._beginAscend = () => { calls.push('ascend'); S.upHold = 0; f.fast = false; return true; }; // (as the real one: the count and the fast flight end)
    return { S, calls };
}
const run = (f, S, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) { f.update(dt, {}); S._climbStep(dt); } };

test('fast flight along the surface reaches 120+ m/s and never goes to space', () => {
    const f = fastFlight(0);
    const { S, calls } = spaceWith(f);
    run(f, S, 30);
    assert.ok(f.speed >= 120 && f.speed <= FLIGHT.FAST_SPEED, `speed ${f.speed}`);
    assert.equal(calls.length, 0);
    assert.equal(S.upHold || 0, 0);
});
test('a slanted climb (45°) never goes to space', () => {
    const f = fastFlight(-0.5);
    const { S, calls } = spaceWith(f);
    run(f, S, 30);
    assert.ok(f.pitch < FLYMAX.UP_DEG * Math.PI / 180);
    assert.equal(calls.length, 0);
});
test('straight up for UP_HOLD seconds goes to space', () => {
    const f = fastFlight(-1);
    const { S, calls } = spaceWith(f);
    run(f, S, 2); // (the path swings up)
    assert.equal(calls.length, 0);
    run(f, S, FLYMAX.UP_HOLD + 0.3);
    assert.deepEqual(calls, ['ascend']);
});
test('4 s up and then a levelling off: the count starts again', () => {
    const f = fastFlight(-1);
    const { S, calls } = spaceWith(f);
    run(f, S, 2 + 2);
    assert.ok(S.upHold > 1.5 && S.upHold < FLYMAX.UP_HOLD);
    f.steering = () => ({ turn: 0, dive: 0 });
    run(f, S, 3);
    assert.equal(S.upHold, 0);
    assert.equal(calls.length, 0);
    f.steering = () => ({ turn: 0, dive: -1 });
    run(f, S, 3);
    assert.equal(calls.length, 0); // (only 3 s of the new hold)
});
test('plain flight («Флайн») stays slow and cannot climb straight up', () => {
    const f = fastFlight(-1); f.fast = false;
    run(f, spaceWith(f).S, 20);
    assert.ok(f.speed <= FLIGHT.MAX_SPEED + 1e-6);
    assert.ok(f.pitch <= FLIGHT.MAX_CLIMB + 1e-6);
});
test('landing ends the fast flight', () => {
    const f = fastFlight(0);
    f.land('landed');
    assert.equal(f.fast, false);
});
