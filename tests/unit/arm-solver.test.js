/**
 * The hero's arm as a human arm (ArmSolver) — the author: «когда я замахиваюсь, рука не настолько реалистична… дело в
 * самой руке, её ограничениях и примитивности». The full sweep: node tools/armbench.mjs --check (limits only tighten).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArmSolver } from '../../src/entities/ArmSolver.js';
import { bench, LIMITS } from '../../tools/armbench.mjs';

// a right arm in the picture: the person faces the camera, its right shoulder on the picture's left (hero +x = picture −x)
const pic = (X, Y, Z, s = 0.45) => ({ x: 0.5 - X * s, y: 0.4 - Y * s, z: Z * s * 0.6 });
function settle(solver, sh, el, wr, frames = 40) {
    let o;
    for (let i = 0; i < frames; i++) { solver.shoulders(pic(-0.19, 0, 0), pic(0.19, 0, 0)); o = solver.solve('right', sh, el, wr, 1); }
    return o;
}

test('a straight arm out to the side is straight out to the side (the old way leant it ~45° forward)', () => {
    const s = new ArmSolver();
    settle(s, pic(0.19, 0, 0), pic(0.19, -0.3, 0), pic(0.19, -0.56, 0)); // (hanging first: its whole length is seen)
    const o = settle(s, pic(0.19, 0, 0), pic(0.49, 0, 0), pic(0.75, 0, 0));
    assert.ok(o.u.x > 0.95 && Math.abs(o.u.z) < 0.25, JSON.stringify(o.u));
    assert.ok(o.f.x > 0.95 && Math.abs(o.f.z) < 0.25, JSON.stringify(o.f));
});

test('a throw\'s wind-up is drawn behind the shoulder (elbow out and back, the hand up behind the head)', () => {
    const s = new ArmSolver();
    settle(s, pic(0.19, 0, 0), pic(0.19, -0.3, 0), pic(0.19, -0.56, 0));
    const el = [0.19 + 0.27, 0.04, 0.11], wr = [el[0] - 0.02, el[1] + 0.18, el[2] + 0.16];
    const o = settle(s, pic(0.19, 0, 0), pic(...el), pic(...wr));
    assert.ok(o.f.z > 0.3 && o.behindF, 'the forearm goes back: ' + JSON.stringify(o.f));
    assert.ok(o.g.z > 0.02, 'the shoulder is drawn back with it: ' + JSON.stringify(o.g));
});

test('without the camera\'s depth the arm is in front; a forearm across the chest never goes through the torso', () => {
    const s = new ArmSolver();
    settle(s, pic(0.19, 0, 0), pic(0.19, -0.3, 0), pic(0.19, -0.56, 0));
    // a hand across the chest, the camera saying (wrongly) it is behind
    const el = [0.25, -0.12, -0.24], wr = [0.0, -0.1, -0.26];
    const lie = (p) => ({ ...p, z: p.z + 0.08 });
    const o = settle(s, pic(0.19, 0, 0), pic(...el), lie(pic(...wr)));
    assert.ok(o.u.z * 1.0 + o.f.z * 0.9 < -0.38, 'the hand in front of the chest, not in it: ' + JSON.stringify([o.u, o.f]));
    const r = settle(new ArmSolver(), { x: 0.4, y: 0.4, z: 0 }, { x: 0.4, y: 0.45, z: 0 }, { x: 0.4, y: 0.5, z: 0 });
    assert.ok(r.u.z < 0 && r.f.z < 0, 'no depth from the camera: in front');
});

test('the sweep: the hero\'s arm follows the player\'s far closer than the old way', () => {
    const r = bench({ seeds: 2 });
    assert.ok(r.new.uP90 <= LIMITS.uP90 && r.new.fP90 <= LIMITS.fP90, `directions ${r.new.uP90.toFixed(1)}° / ${r.new.fP90.toFixed(1)}°`);
    assert.ok(r.new.handP90 <= LIMITS.handP90, `hand ${r.new.handP90.toFixed(2)} m`);
    assert.ok(r.new.sideOk >= LIMITS.sideOk && r.new.cockBehind >= LIMITS.cockBehind, `side ${r.new.sideOk}, wind-up ${r.new.cockBehind}`);
    assert.ok(r.new.uMean < r.old.uMean / 2 && r.new.handMean < r.old.handMean / 2, 'at least twice closer than the old way');
});
