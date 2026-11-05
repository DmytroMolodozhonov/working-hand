// «Отход назад от нападающих» (the author 05.11): stepping with a foe coming at me in front — back, facing it; turned away — forward.
import test from 'node:test';
import assert from 'node:assert/strict';
import { threatStep, THREAT_BACK } from '../../src/game/ThreatBack.js';

/** Run `secs` at 30 a second: the foe moves by fn(t) → {x, z}; me at the origin looking along −z (yaw 0) or as given. */
function run(st, secs, foe, yaw = 0, t0 = 0) {
    let r = null;
    for (let i = 1; i <= secs * 30; i++) { const t = t0 + i / 30, p = foe(t); r = threatStep(st, { x: 0, z: 0, yaw }, p ? [{ id: 'v1', ...p }] : [], 1 / 30, t); }
    return r;
}

test('a villager running at me from the front: back; turned away from him: forward (running away)', () => {
    const st = {};
    const r = run(st, 2, (t) => ({ x: 0, z: -14 + t * 4 }));
    assert.equal(r.back, true);
    assert.ok(r.foe.ang < 10);
    const away = run(st, 0.5, (t) => ({ x: 0, z: -6 }), Math.PI, 2); // (I turned round: he is behind me)
    assert.equal(away.back, false, 'turned away: the steps go forward');
});

test('not a foe: strolling up to talk, standing far, passing by far, nobody', () => {
    assert.equal(run({}, 3, (t) => ({ x: 0, z: -14 + t * 1.2 })).back, false, 'walking up slowly');
    assert.equal(run({}, 3, () => ({ x: 0, z: -8 })).back, false, 'standing');
    assert.equal(run({}, 3, (t) => ({ x: -30 + t * 6, z: -20 })).back, false, 'far away running past');
    assert.equal(run({}, 1, () => null).back, false);
});

test('a foe that came stays one while it stands at me and strikes (HOLD), then not', () => {
    const st = {};
    run(st, 2, (t) => ({ x: 0, z: Math.min(-2, -12 + t * 5) }));
    assert.equal(run(st, 1, () => ({ x: 0, z: -2 }), 0, 2).back, true, 'striking at me');
    assert.equal(run(st, THREAT_BACK.HOLD + 2, () => ({ x: 0, z: -12 }), 0, 3).back, false, 'went off and stands far: no more');
});

test('to the side: within FACE° — back; past it — forward', () => {
    const a = 60 * Math.PI / 180, b = 85 * Math.PI / 180;
    assert.equal(run({}, 2, (t) => { const d = 14 - t * 4; return { x: -Math.sin(a) * d, z: -Math.cos(a) * d }; }).back, true);
    assert.equal(run({}, 2, (t) => { const d = 14 - t * 4; return { x: -Math.sin(b) * d, z: -Math.cos(b) * d }; }).back, false);
});
