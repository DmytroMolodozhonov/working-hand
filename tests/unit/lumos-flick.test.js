import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LUMOS } from '../../src/game/WandMagic.js';
import { LumosThrow } from '../../src/game/HandRelease.js';

/**
 * The Lumos light is thrown like a thing (the author: «not when I really throw»): a wind-up by the head or behind
 * the shoulder, a fast swing forward — it leaves at the swing's end, the way the hand went. A 15-fps noisy camera.
 */
const SH = { x: 0.7, y: 1.25, z: 0 };
function swing(det, { start, v, n = 3, hold = 200, after = 10, seed = 3, behind = false }) {
    let r = seed; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647 - 0.5);
    let h = { ...start }, t = 0, out = null, at = -1, swingEnd = 0;
    const step = (vRel) => {
        const res = det.update({ now: t, hand: { x: h.x + rnd() * 0.05, y: h.y + rnd() * 0.05, z: h.z + rnd() * 0.05 }, shoulder: SH,
            vRel: { x: vRel.x + rnd() * 0.6, y: vRel.y + rnd() * 0.6, z: vRel.z + rnd() * 0.6 }, behind: behind && t < hold });
        if (res && !out) { out = res; at = t; }
    };
    for (; t < hold; t += 66) step({ x: 0, y: 0, z: 0 });
    for (let i = 0; i < n; i++, t += 66) { h = { x: h.x + v.x * 0.066, y: h.y + v.y * 0.066, z: h.z + v.z * 0.066 }; step(v); }
    swingEnd = t;
    for (let k = 0; k < after; k++, t += 66) step({ x: v.x * 0.15, y: v.y * 0.15, z: v.z * 0.15 });
    return { out, at, swingEnd };
}

test('Lumos throw: the hand by the head (or behind the shoulder), a fast swing forward — it flies that way at the swing\'s end', () => {
    const r = swing(new LumosThrow(), { start: { x: 0.8, y: 1.7, z: 0 }, v: { x: 0, y: -1.5, z: -6.5 } });
    assert.ok(r.out, 'thrown');
    assert.ok(r.out.dir.z < -0.8, 'forward ' + JSON.stringify(r.out.dir));
    assert.ok(r.at >= r.swingEnd - 66 && r.at <= r.swingEnd + 132, `at the swing's end (${r.at} vs ${r.swingEnd})`);
    // to the right: it goes to the right
    const side = swing(new LumosThrow(), { start: { x: 0.6, y: 1.7, z: 0 }, v: { x: 3.5, y: -1, z: -5.5 } });
    assert.ok(side.out && side.out.dir.x > 0.4, 'to the right ' + JSON.stringify(side.out?.dir));
    // from behind the shoulder
    assert.ok(swing(new LumosThrow(), { start: { x: 0.8, y: 1.4, z: 0.3 }, behind: true, v: { x: 0, y: -0.5, z: -6.5 } }).out, 'from behind the shoulder');
    // a harder swing: a faster light
    const hard = swing(new LumosThrow(), { start: { x: 0.8, y: 1.7, z: 0 }, v: { x: 0, y: -1.5, z: -11 } });
    assert.ok(hard.out.speed > r.out.speed, 'harder');
});

test('Lumos throw: never without a wind-up, never a wave while talking, a swing down or back, a slow move, the arm just held', () => {
    assert.equal(swing(new LumosThrow(), { start: { x: 0.8, y: 1.2, z: -0.6 }, v: { x: 0, y: 0, z: -7 } }).out, null, 'a jab from the chest: no wind-up');
    assert.equal(swing(new LumosThrow(), { start: { x: 0.8, y: 1.7, z: 0 }, v: { x: 7, y: 0, z: -1 } }).out, null, 'a wave aside');
    assert.equal(swing(new LumosThrow(), { start: { x: 0.8, y: 1.7, z: 0 }, v: { x: 0, y: -7, z: -1.5 } }).out, null, 'a swing down');
    assert.equal(swing(new LumosThrow(), { start: { x: 0.8, y: 1.7, z: -0.5 }, v: { x: 0, y: 0, z: 6 } }).out, null, 'back');
    assert.equal(swing(new LumosThrow(), { start: { x: 0.8, y: 1.7, z: 0 }, v: { x: 0, y: -1, z: -3 }, n: 6 }).out, null, 'slow');
    assert.equal(swing(new LumosThrow(), { start: { x: 0.8, y: 1.7, z: 0 }, v: { x: 0, y: 0, z: 0 }, hold: 3000 }).out, null, 'held up');
    // talking: the hands move about at the chest, quick little moves every way
    const d = new LumosThrow();
    let any = null;
    for (let t = 0; t < 5000; t += 50) any = any || d.update({ now: t, hand: { x: 0.6 + 0.1 * Math.sin(t / 90), y: 1.0 + 0.1 * Math.cos(t / 70), z: -0.5 }, shoulder: SH, vRel: { x: 3 * Math.cos(t / 90), y: -2 * Math.sin(t / 70), z: 1.5 * Math.sin(t / 50) } });
    assert.equal(any, null, 'talking');
    assert.ok(LUMOS.STILL >= 1000, 'walking / running: a moment standing still first');
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
