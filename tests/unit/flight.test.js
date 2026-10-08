import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightController, FLIGHT } from '../../src/game/Flight.js';
import { torsoMetrics } from '../../src/input/PoseInterpreter.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

const neutral = { lateral: 0, depth: -0.05, noseRel: 0.9 };
const run = (f, seconds, input) => {
    let out;
    for (let i = 0; i < Math.round(seconds * 60); i++) out = f.update(1 / 60, input);
    return out;
};

test('«Флайн» is recognised by voice (and does not clash with other spells)', () => {
    for (const w of ['флайн', 'Флайн', 'флаин', 'флай', 'fly', 'полёт']) assert.equal(matchSpell(w), 'Flight', w);
    assert.equal(matchSpell('бомбардо'), 'Bombardo');
    assert.equal(matchSpell('инферно'), 'Inferno');
});

test('take-off: vertical climb, speed grows, then the body turns horizontal (Superman)', () => {
    const f = new FlightController();
    assert.ok(f.start());
    let out = f.update(1 / 60, { armsUp: true, torso: neutral });
    const v0 = out.up;
    out = run(f, 1.0, { armsUp: true, torso: neutral });
    assert.ok(out.up > v0 && out.up > 5, `accelerating upwards (${out.up.toFixed(1)})`);
    assert.ok(Math.abs(out.forward) < 1e-6, 'straight up during take-off');
    out = run(f, 5, { armsUp: false, torso: neutral }); // arms are free after take-off
    assert.equal(f.state, 'cruise');
    assert.ok(out.tilt > FLIGHT.MAX_TILT - 0.15, `horizontal body (${out.tilt.toFixed(2)})`);
    assert.ok(out.forward > 15, `flying forward fast (${out.forward.toFixed(1)})`);
    out = run(f, 10, { armsUp: false, torso: neutral });
    assert.ok(f.speed <= FLIGHT.MAX_SPEED + 1e-9 && f.speed > FLIGHT.MAX_SPEED - 0.5, 'reaches the speed limit');
    assert.ok(Math.abs(out.pitch) < 0.1, 'calm body flies level');
});

test('dropping the arms right after the word cancels the spell', () => {
    const f = new FlightController();
    f.start();
    run(f, 0.2, { armsUp: true, torso: neutral });
    run(f, 0.5, { armsUp: false, torso: neutral });
    assert.notEqual(f.state, 'cruise');
    assert.equal(f.active, false);
    assert.equal(f.lastEvent, 'cancelled');
    // a tiny tracking glitch (0.1 s) is forgiven
    const g = new FlightController();
    g.start();
    run(g, 0.3, { armsUp: true, torso: neutral });
    run(g, 0.1, { armsUp: false, torso: neutral });
    run(g, 0.8, { armsUp: true, torso: neutral });
    assert.equal(g.active, true);
});

test('the torso steers: lean sideways = turn, lean forward = dive, lean back = climb', () => {
    const f = new FlightController();
    f.start();
    run(f, 4, { armsUp: true, torso: neutral });
    let out = run(f, 0.5, { torso: { ...neutral, lateral: 0.4 } });
    assert.ok(out.yawRate > 0.5, `lean left turns left (${out.yawRate})`);
    out = run(f, 0.5, { torso: { ...neutral, lateral: -0.4 } });
    assert.ok(out.yawRate < -0.5, 'lean right turns right');
    out = run(f, 1.5, { torso: { ...neutral, depth: neutral.depth - 0.12 } });
    assert.ok(out.pitch < -0.5 && out.up < 0, `lean forward dives (${out.pitch.toFixed(2)})`);
    out = run(f, 2, { torso: { ...neutral, depth: neutral.depth + 0.12 } });
    assert.ok(out.pitch > 0.4 && out.up > 0, `lean back climbs (${out.pitch.toFixed(2)})`);
    // Without hips in the camera: head/shoulder drop steers too
    out = run(f, 2, { torso: { lateral: 0, depth: null, noseRel: neutral.noseRel - 0.5 } });
    assert.ok(out.pitch < -0.3, 'leaning forward (no hips visible) dives');
});

test('landing: diving into the ground ends the flight, skimming does not', () => {
    const f = new FlightController();
    f.start();
    run(f, 4, { armsUp: true, torso: neutral });
    run(f, 0.5, { torso: neutral });
    assert.equal(f.touchGround(1.0), false, 'level flight just skims');
    run(f, 1.5, { torso: { ...neutral, depth: neutral.depth - 0.12 } });
    assert.equal(f.touchGround(5), false, 'still high');
    assert.equal(f.touchGround(1.5), true, 'dive + ground = landing');
    const out = run(f, 1.0, {});
    assert.equal(f.state, 'idle');
    assert.equal(out.tilt, 0, 'standing upright again');
});

test('torso metrics: lean directions from pose landmarks', () => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
    lm[0] = { x: 0.5, y: 0.25, z: 0, visibility: 1 };
    lm[11] = { x: 0.6, y: 0.4, z: 0, visibility: 1 }; lm[12] = { x: 0.4, y: 0.4, z: 0, visibility: 1 };
    lm[23] = { x: 0.57, y: 0.8, z: 0, visibility: 1 }; lm[24] = { x: 0.43, y: 0.8, z: 0, visibility: 1 };
    const n = torsoMetrics(lm);
    // Lean to the person's left: shoulders move to the image right
    const left = lm.map((p) => ({ ...p }));
    left[11].x += 0.06; left[12].x += 0.06; left[0].x += 0.08;
    assert.ok(torsoMetrics(left).lateral > n.lateral + 0.2);
    // Lean forward: shoulders come towards the camera
    const fwd = lm.map((p) => ({ ...p }));
    fwd[11].z = -0.15; fwd[12].z = -0.15;
    assert.ok(torsoMetrics(fwd).depth < n.depth - 0.1);
    // Hips out of view → shoulder roll
    const nohips = lm.map((p) => ({ ...p }));
    nohips[23].visibility = 0.1; nohips[24].visibility = 0.1;
    nohips[11].y += 0.05;
    const m = torsoMetrics(nohips);
    assert.equal(m.hips, false);
    assert.ok(m.lateral > 0.2);
});

test('«Паузин»: hover on the spot, «Флайн» flies on', () => {
    const f = new FlightController();
    f.start();
    let o;
    for (let i = 0; i < 60 * 4; i++) o = f.update(1 / 60, { armsUp: true, torso: { lateral: 0, noseRel: 0, depth: 0 } });
    assert.equal(f.state, 'cruise');
    assert.ok(o.forward > 5);
    assert.equal(f.pause(), true);
    for (let i = 0; i < 60 * 3; i++) o = f.update(1 / 60, { torso: { lateral: 0, noseRel: 0, depth: 0 } });
    assert.equal(o.forward, 0, 'stopped');
    assert.ok(Math.abs(o.up) < 0.3, 'stays at its height (gentle bob)');
    assert.ok(o.tilt < 0.3, 'upright in the air');
    assert.equal(f.touchGround(0.5), false, 'hovering never lands by itself');
    assert.equal(f.resume(), true);
    for (let i = 0; i < 60 * 2; i++) o = f.update(1 / 60, { torso: { lateral: 0, noseRel: 0, depth: 0 } });
    assert.ok(o.forward > 5, 'flies on');
});

test('«Паузин» is recognised', () => {
    for (const w of ['паузин', 'Паузин', 'пауза', 'pause']) assert.equal(matchSpell(w), 'Pause', w);
});
