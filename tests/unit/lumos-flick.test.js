import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { lumosFlick, LUMOS } from '../../src/game/WandMagic.js';

/**
 * Lumos is thrown only by a real flick of the wand — never by walking (the arms swing), nor by one
 * jumpy camera frame: the light stays at the tip until «Нокс» / «стоп».
 */
const trailOf = (fn, ms = 400, step = 16) => {
    const trail = [];
    for (let t = 0; t <= ms; t += step) trail.push({ t, p: fn(t / 1000) });
    return { trail, now: ms };
};
const FWD = new THREE.Vector3(0, 0.2, 1).normalize(); // (the wand points ahead, a little up)

test('Lumos throw: a wind-up, then a quick steady throw where the wand points — the light flies', () => {
    // drawn back 0.35 m (0.15–0.45 s), then the tip goes 1 m ahead in the last 0.16 s
    const { trail, now } = trailOf((s) => new THREE.Vector3(0, 1.4, s < 0.15 ? 0.4 : s < 0.45 ? 0.4 - (s - 0.15) * 1.17 : s < 0.64 ? 0.05 : 0.05 + (s - 0.64) * 6.25), 800);
    const d = lumosFlick(trail, now, FWD);
    assert.ok(d && d.z > 0.9, 'thrown ahead');
    // the same fast move with no wind-up (a jerk of the hand): the light stays on the wand
    const jerk = trailOf((s) => new THREE.Vector3(0, 1.4, 0.05 + Math.max(0, s - 0.64) * 6.25), 800);
    assert.equal(lumosFlick(jerk.trail, jerk.now, FWD), null, 'a jerk with no wind-up');
});

test('Lumos flick: never by walking (the arm swings), a jumpy frame, a slow move or a flick down', () => {
    // walking: the arm swings ±0.35 m about twice a second
    for (let ph = 0; ph < 6.3; ph += 0.7) {
        const { trail, now } = trailOf((s) => new THREE.Vector3(0.05 * Math.sin(ph + s * 12), 1.1, 0.3 + 0.35 * Math.sin(ph + s * 12)));
        assert.equal(lumosFlick(trail, now, FWD), null, `walking swing (phase ${ph})`);
    }
    // one jumpy camera frame: the tip jumps 0.9 m for a moment
    const jump = trailOf((s) => new THREE.Vector3(0, 1.4, Math.abs(s - 0.392) < 0.01 ? 1.2 : 0.3));
    assert.equal(lumosFlick(jump.trail, jump.now, FWD), null, 'a jumpy frame');
    // a slow, calm move of the arm
    const slow = trailOf((s) => new THREE.Vector3(0, 1.4, 0.3 + s * 1.2));
    assert.equal(lumosFlick(slow.trail, slow.now, FWD), null, 'a calm move');
    // fast, but straight down at the feet
    const down = trailOf((s) => new THREE.Vector3(0, 1.4 - Math.max(0, s - 0.25) * 6, 0.3));
    assert.equal(lumosFlick(down.trail, down.now, FWD), null, 'down at the feet');
    // fast, but backwards (away from where the wand points)
    const back = trailOf((s) => new THREE.Vector3(0, 1.4, 0.3 - Math.max(0, s - 0.25) * 6));
    assert.equal(lumosFlick(back.trail, back.now, FWD), null, 'against the wand');
    assert.ok(LUMOS.STILL >= 1000, 'a moment standing still first');
});

test('«Lightning Writing»: another player\'s drawing comes as points — joined into lines, broken where they broke it', async () => {
    const { WandMagic } = await import('../../src/game/WandMagic.js');
    const added = [];
    const game = { scene: { add: (o) => added.push(o), remove: () => {} } };
    const w = new WandMagic(game);
    w.remoteDraw('p1', 0xff8800, [[0, 1, 0], [0.1, 1, 0], [0.2, 1.05, 0], null, [5, 1, 0], [5.1, 1, 0]]);
    const e = w.remoteDrawings.get('p1');
    assert.equal(e.lines.length, 3, 'two strokes, a break, one stroke');
    // the next batch goes on from the last point
    w.remoteDraw('p1', 0xff8800, [[5.2, 1, 0]]);
    assert.equal(e.lines.length, 4);
    // garbage from the network draws nothing
    w.remoteDraw('p1', 0xff8800, [['x', 1, 0], [1e9]]);
    assert.equal(e.lines.length, 4);
});

test('a thrown Lumos is seen flying: it slows down by itself, bounces off a wall instead of sticking to it, and hangs in the air', async () => {
    const { WandMagic } = await import('../../src/game/WandMagic.js');
    // a wall 3 m ahead (z < -3), the ground below y = 0
    const blocked = (x, y, z) => z < -3 || y < 0;
    const game = { scene: { add() {}, remove() {} }, collision: { pointBlocked: blocked } };
    const w = new WandMagic(game);
    w._flick = 0;
    const throwOne = (wm) => { const t = { glow: { position: new THREE.Vector3(), scale: { setScalar() {} }, material: {} }, pos: new THREE.Vector3(0, 1.5, 0), vel: new THREE.Vector3(0, 0, -LUMOS.THROW_SPEED), flown: 0, stuck: false, bounces: 0, age: 0, level: 2, mine: true }; wm.thrown.push(t); return t; };
    const t = throwOne(w);
    const path = [];
    for (let i = 0; i < 300 && !t.stuck; i++) { w._flyThrown(t, 1 / 60); path.push(t.pos.z); }
    // not a jump: after a tenth of a second it is still on its way to the wall
    assert.ok(path[5] > -2, 'still flying after 0.1 s: ' + path[5].toFixed(2));
    assert.ok(Math.min(...path) > -3.01, 'never inside the wall');
    assert.ok(t.bounces >= 1, 'it bounced off the wall');
    assert.ok(t.pos.z > Math.min(...path) + 0.3, 'and came back off it (not stuck on it)');
    // in the open it slows down and stops by itself, short of its range
    const open = new WandMagic({ scene: { add() {}, remove() {} }, collision: { pointBlocked: () => false } });
    open._flick = 0;
    const o = throwOne(open);
    for (let i = 0; i < 60 * 15 && !o.stuck; i++) open._flyThrown(o, 1 / 60);
    assert.ok(o.stuck && o.flown > 15 && o.flown <= LUMOS.THROW_RANGE + 0.5, `drifted ${o.flown.toFixed(1)} m and hangs there`);
});
