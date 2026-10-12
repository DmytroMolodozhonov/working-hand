import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DropGate, ThrowDetector, poseBehind } from '../../src/game/HandRelease.js';
import { VoxelCharacter } from '../../src/entities/Character.js';

// ------------------------------------------------------------------ DropGate
const out = { reach: 0.95, forward: 0.9, up: 0, speed: 0, palmUp: 0, tracked: true };
const run = (gate, s, ms, step = 33) => { let t0 = s.t0 ?? 1000, any = false, at = -1; for (let t = 0; t <= ms; t += step) { if (gate.update({ ...out, ...s, now: t0 + t })) { any = true; if (at < 0) at = t; } } return { any, at }; };

test('DropGate: the outstretched hand opened and kept open 250 ms drops the thing — not sooner', () => {
    const g = new DropGate();
    assert.equal(g.update({ ...out, now: 1000, curl: 0.1 }), false);
    assert.equal(g.update({ ...out, now: 1200, curl: 0.1 }), false, 'at 200 ms still held');
    assert.equal(g.update({ ...out, now: 1260, curl: 0.1 }), true, 'at 260 ms it falls');
});

test('DropGate: never by accident — a hanging arm, a lost hand, a flicker, a palm up, a moving hand', () => {
    assert.equal(run(new DropGate(), { curl: 0.05, reach: 0.95, forward: -0.9, up: -0.9 }, 3000).any, false, 'arm hanging at the side');
    assert.equal(run(new DropGate(), { curl: 0.05, reach: 0.95, forward: 0.5, up: -0.86 }, 3000).any, false, 'arm hanging (the camera guesses it a little forward)');
    assert.equal(run(new DropGate(), { curl: 0.05, reach: 0.5 }, 3000).any, false, 'a bent arm (the hand by the body)');
    assert.equal(run(new DropGate(), { curl: 0, tracked: false }, 5000).any, false, 'the camera lost the hand');
    assert.equal(run(new DropGate(), { curl: 0.05, palmUp: 0.9 }, 3000).any, false, 'an apple on a flat palm stays');
    assert.equal(run(new DropGate(), { curl: 0.05, speed: 5 }, 3000).any, false, 'in the middle of a swing');
    assert.equal(run(new DropGate(), { curl: 0.35 }, 3000).any, false, 'a half-open hand');
    const g = new DropGate();
    assert.equal(run(g, { curl: 0.1, t0: 1000 }, 100).any, false);
    assert.equal(g.update({ ...out, now: 1133, curl: 0.8 }), false, 'one frame closed');
    assert.equal(run(g, { curl: 0.1, t0: 1166 }, 100).any, false, 'open again only 100 ms');
});

test('DropGate: a thing that came into an open hand stays until the fingers closed on it once', () => {
    const g = new DropGate();
    g.reset(false);
    assert.equal(run(g, { curl: 0.05, t0: 0 }, 2000).any, false, 'never closed: kept');
    g.update({ ...out, now: 3000, curl: 0.6 });
    const r = run(g, { curl: 0.05, t0: 3100 }, 1000);
    assert.ok(r.any && r.at >= 250 && r.at < 300, 'after closing once it drops when opened ' + JSON.stringify(r));
});

// -------------------------------------------------------------- ThrowDetector
const V = (x, y, z) => ({ x, y, z });
const SH = V(0.7, 1.25, 0);

/** wind-up above the shoulder at t=0, then a swing forward/down for `n` frames, then the hand opens */
function overhand(det, { start = V(0.8, 1.75, -0.2), vRel = V(0, -3, -9), curlSwing = 0.9, openAt = 150, curlOpen = 0.2, weight = 1, swingAt = 33, n = 3, track = () => true, curlWind = 0.9, strict = false, behind = false } = {}) {
    const r = [];
    for (let t = 0; t < swingAt; t += 33) r.push(det.update({ now: t, hand: t < 99 ? start : V(start.x, SH.y + 0.1, start.z), shoulder: SH, vRel: V(0, 0, 0), vWorld: [0, 0, 0], curl: curlWind, tracked: true, weight, strict, behind: behind && t < 99 }));
    let h = { ...start };
    for (let i = 0; i < n; i++) {
        const t = swingAt + i * 33;
        h = V(h.x + vRel.x * 0.033, h.y + vRel.y * 0.033 - 0.12, h.z + vRel.z * 0.033);
        r.push(det.update({ now: t, hand: h, shoulder: SH, vRel, vWorld: [vRel.x + 1, vRel.y, vRel.z], curl: curlSwing, tracked: track(t), weight, strict }));
    }
    for (let t = swingAt + n * 33; t <= swingAt + n * 33 + 800; t += 33) {
        const curl = t >= swingAt + openAt ? curlOpen : curlSwing;
        r.push(det.update({ now: t, hand: h, shoulder: SH, vRel: V(0, 0, -0.5), vWorld: [0, 0, -0.5], curl, tracked: track(t), weight, strict }));
    }
    return r.find(Boolean) || null;
}

test('ThrowDetector: wind-up by the head, a fast swing, the fingers let go = a throw with the swing\'s speed', () => {
    const t = overhand(new ThrowDetector());
    assert.ok(t && t.speed > 9, 'thrown ' + JSON.stringify(t));
    assert.deepEqual(t.vWorld, [1, -3, -9], 'the world speed of the fastest moment');
});

test('ThrowDetector: no wind-up (from the hip), a fist kept closed, a late opening — no throw', () => {
    assert.equal(overhand(new ThrowDetector(), { start: V(0.8, 0.65, -0.2) }), null, 'from the hip: a jab, not a throw');
    assert.equal(overhand(new ThrowDetector(), { curlOpen: 0.9 }), null, 'the fist kept hold: a chop');
    assert.equal(overhand(new ThrowDetector(), { openAt: 640 }), null, 'opened long after the swing');
    assert.equal(overhand(new ThrowDetector(), { swingAt: 1200 }), null, 'the swing long after the wind-up');
    assert.equal(overhand(new ThrowDetector(), { curlWind: 0.2, curlSwing: 0.2 }), null, 'an open hand all along held nothing: no throw');
});

test('ThrowDetector: the hand lost in the blur of the swing — opening seen 200 ms later still throws', () => {
    const t = overhand(new ThrowDetector(), { openAt: 99, track: (t) => t < 132 || t > 300 });
    assert.ok(t && t.speed > 9, 'thrown ' + JSON.stringify(t));
});

test('ThrowDetector: running (world speed, no swing against the body) never throws', () => {
    const d = new ThrowDetector();
    let thrown = null;
    for (let t = 0; t < 3000; t += 33) thrown = thrown || d.update({ now: t, hand: V(0.8, 1.7, -0.3), shoulder: SH, vRel: V(0, 0, 0), vWorld: [0, 0, -7.5], curl: t > 1500 ? 0.2 : 0.9, tracked: true });
    assert.equal(thrown, null);
});

test('ThrowDetector: heavy things need a faster swing', () => {
    assert.equal(overhand(new ThrowDetector(), { weight: 4, vRel: V(0, -2, -6.5), n: 5 }), null, 'a hammer at 6.8 m/s: not a throw');
    assert.ok(overhand(new ThrowDetector(), { weight: 0.2, vRel: V(0, -2, -6.5), n: 5 }), 'an apple at 6.8 m/s is thrown');
    assert.ok(overhand(new ThrowDetector(), { weight: 4, vRel: V(0, -3, -8.5) }), 'at 9 m/s it is');
});

test('poseBehind: the camera sees the wrist behind the shoulder', () => {
    assert.equal(poseBehind({ rightWrist: { z: 0.15 }, rightShoulder: { z: 0 } }, 'right'), true);
    assert.equal(poseBehind({ rightWrist: { z: -0.4 }, rightShoulder: { z: 0 } }, 'right'), false);
    assert.equal(poseBehind(null, 'right'), false);
});

// ------------------------------------------------------------- Character
test('Character: running or turning gives the hand no speed of its own; a swing does', () => {
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setShowHands(true);
    for (let i = 0; i < 30; i++) { ch.group.position.z -= 7.5 / 60; ch.update(1 / 60, null, false); }
    assert.ok(ch.handRelVelocity.right.length() < 0.3, 'running: ' + ch.handRelVelocity.right.length());
    assert.ok(Math.abs(ch.handVelocity.right.length() - 7.5) < 0.5, 'the world speed is the body\'s: ' + ch.handVelocity.right.length());
    for (let i = 0; i < 30; i++) { ch.group.rotation.y += 2 / 60; ch.update(1 / 60, null, false); }
    assert.ok(ch.handRelVelocity.right.length() < 0.3, 'turning: ' + ch.handRelVelocity.right.length());
    for (let i = 0; i < 6; i++) { ch.rightArmAnchor.rotation.x -= 0.25; ch.update(1 / 60, null, false); }
    assert.ok(ch.handRelVelocity.right.length() > 5, 'a swing of the arm: ' + ch.handRelVelocity.right.length());
});

test('Character.armState: an arm stretched forward reads outstretched; a hanging one does not', () => {
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.group.updateMatrixWorld(true);
    ch.rightArmAnchor.lookAt(ch.rightArmAnchor.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, -2)));
    let a = ch.armState('right');
    assert.ok(a.reach > 0.95 && a.forward > 0.95 && Math.abs(a.up) < 0.1, JSON.stringify({ r: a.reach, f: a.forward, u: a.up }));
    ch.setIdlePose();
    a = ch.armState('right');
    assert.ok(a.up < -0.9, 'hanging: ' + a.up);
});

import { ThrowDetector as TD2, THROW as TH2 } from '../../src/game/HandRelease.js';

test('a throw whose hand the camera lost in the blur: a strong swing forward lets go at its end; a blow down, or a sword, does not', () => {
    const run = (vz, vy, blurOk) => {
        const t = new TD2();
        const sh = { x: 0, y: 0, z: 0 };
        let out = null;
        const step = (i, hand, v, curl, tracked) => { out = out || t.update({ now: i * 33, hand, shoulder: sh, vRel: v, vWorld: [0, 0, 0], curl, tracked, blurOk }); };
        step(0, { x: 0, y: 0.6, z: 0.2 }, { x: 0, y: 0, z: 0 }, 0.9, true); // wound up, held
        step(1, { x: 0, y: 0.5, z: 0.1 }, { x: 0, y: 0, z: 0 }, 0.9, true);
        step(2, { x: 0, y: 0.2, z: -0.6 }, { x: 0, y: vy, z: vz }, 0.9, false); // the fast swing: the hand is lost
        step(3, { x: 0, y: 0.0, z: -1.2 }, { x: 0, y: vy * 0.3, z: vz * 0.3 }, 0, false); // its end
        return out;
    };
    assert.ok(run(-12, -2, true), 'forward: thrown');
    assert.equal(run(-3, -12, true), null, 'a blow down keeps hold');
    assert.equal(run(-12, -2, false), null, 'a sword (no blur rule) keeps hold');
    assert.ok(TH2.END > 0 && TH2.END < 1);
});

test('ThrowDetector (the wand, strict): a flick or a hand raised only a little never throws it; a real wind-up behind the shoulder and a strong swing do', () => {
    // a little lift of the hand (just over the shoulder) and a quick flick, the fingers open
    assert.equal(overhand(new ThrowDetector(), { strict: true, start: V(0.8, 1.75, -0.2), vRel: V(0, -3, -9) }), null, 'a wand swing from by the head: not thrown');
    assert.equal(overhand(new ThrowDetector(), { strict: true, start: V(0.8, 1.6, -1.2), vRel: V(0, -2, -6) }), null, 'a small flick: not thrown');
    // the hand drawn back behind the shoulder, a strong long swing forward, the fingers open
    assert.ok(overhand(new ThrowDetector(), { strict: true, behind: true, start: V(0.8, 1.75, 0.3), vRel: V(0, -3, -12), n: 5 }), 'a real throw of the wand');
    // the same small lift throws an apple (not strict) — the wand is just harder to lose
    assert.ok(overhand(new ThrowDetector(), { start: V(0.8, 1.75, -0.2), vRel: V(0, -3, -9) }), 'an apple goes with a smaller swing');
});

test('ThrowDetector: a hand only a little over the shoulder is no wind-up', () => {
    assert.equal(overhand(new ThrowDetector(), { start: V(0.8, 1.6, -0.6), vRel: V(0, -3, -9) }), null);
});

test('ThrowDetector (the wand): raised high to cast and then pointed forward with the fingers open is no throw', () => {
    assert.equal(overhand(new ThrowDetector(), { strict: true, start: V(0.8, 2.3, -0.8), vRel: V(0, -4, -10), n: 5 }), null);
});

import { holdsFast } from '../../src/game/HandRelease.js';
test('swimming: a stroke (a reach up behind the head and a fast pull, the hand opening) would look like a throw — a swimmer\'s hand holds fast', () => {
    // the stroke really looks like a throw to the detector…
    assert.ok(overhand(new ThrowDetector(), { strict: true, behind: true, start: V(0.8, 1.75, 0.3), vRel: V(0, -3, -12), n: 5 }), 'a stroke is shaped like a wand throw');
    // …so nothing is let go while swimming (Items / Weapons / the wood skip their throw and drop checks)
    assert.equal(holdsFast({ swimming: true }), true);
    assert.equal(holdsFast({ swimY: 1.2 }), true, '(the body held up by the water)');
    assert.equal(holdsFast({ swimming: false, swimY: null }), false, 'on land: throws as usual');
});

test('lying on the ground (and a moment after getting up) the hand holds fast — flailing to get up throws nothing', () => {
    const ch = { swimming: false, swimY: null, knockedDown: true };
    assert.equal(holdsFast(ch, 1000), true, 'lying: the arms push and wave to get up');
    ch.knockedDown = false;
    assert.equal(holdsFast(ch, 1000 + 1000), true, 'just up: still pushing up');
    assert.equal(holdsFast(ch, 1000 + 1600), false, 'standing a while: throws as usual');
});
