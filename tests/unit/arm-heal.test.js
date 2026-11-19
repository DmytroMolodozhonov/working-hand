// The arm and the wand under the author's real conditions (19.11): an arm raised half out of the picture, running, one bad number from the camera, a long game.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArmSolver } from '../../src/entities/ArmSolver.js';
import { OneEuroFilter } from '../../src/core/math.js';
import { AimSteady } from '../../src/game/V5WandAim.js';
import { ArmGuard } from '../../src/input/ArmGuard.js';
import { run } from '../../tools/handbench/pointing.mjs';
import { frame } from '../e2e/poses.mjs';

const R2D = 180 / Math.PI;
const jitterOf = (rows, from = 4000) => {
    const sel = rows.filter((r) => r.t > from), m = new THREE.Vector3();
    for (const r of sel) m.add(r.aim);
    m.normalize();
    return Math.sqrt(sel.reduce((a, r) => a + (r.aim.angleTo(m) * R2D) ** 2, 0) / sel.length);
};

test('one NaN from the camera never poisons the filters for good', () => {
    const f = new OneEuroFilter(1, 1, 1);
    for (let i = 0; i < 10; i++) f.filter(0.5 + i * 0.001, i / 30);
    f.filter(NaN, 10 / 30); f.filter(Infinity, 11 / 30); f.filter(0.52, NaN);
    const v = f.filter(0.51, 12 / 30);
    assert.ok(Number.isFinite(v) && Math.abs(v - 0.5) < 0.1, 'still a number near the arm: ' + v);
    f.x = NaN; // (a poisoned state — healed on the next number)
    assert.ok(Number.isFinite(f.filter(0.4, 13 / 30)));
});

test('the arm solver heals a poisoned memory and never answers with NaN', () => {
    const s = new ArmSolver();
    const sh = { x: 0.4, y: 0.42, z: 0 }, el = { x: 0.4, y: 0.26, z: 0 }, wr = { x: 0.4, y: 0.1, z: 0 };
    const ls = { x: 0.6, y: 0.42, z: 0 };
    for (let i = 0; i < 40; i++) { s.shoulders(ls, sh, 1.78); s.solve('right', sh, el, wr, 1.78); }
    s.right.du = NaN; s.right.Lu = Infinity; s.right.nu.v = NaN; s.W = NaN;
    const o = s.solve('right', sh, el, wr, 1.78);
    for (const k of ['u', 'f', 'g']) assert.ok(Number.isFinite(o[k].x + o[k].y + o[k].z), k + ' is finite');
    assert.ok(s.healed >= 1, 'it noticed');
    // a picture with a missing depth
    const o2 = s.solve('right', { x: 0.4, y: 0.42 }, { x: 0.4, y: 0.26 }, { x: 0.4, y: 0.1 }, 1.78);
    assert.ok(Number.isFinite(o2.f.x + o2.f.y + o2.f.z));
});

test('a point out of the top of the picture: its bone goes UP from the parent, even when no bone was ever seen (tracking restarted with the arm already raised)', () => {
    const base = frame({ arms: 'down', leftCurl: null, rightCurl: null }).poseLandmarks;
    const g = new ArmGuard({ filter: false, log: null });
    let s = 7; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
    const ys = [];
    for (let i = 0; i < 300; i++) {
        const pose = base.map((p) => ({ ...p }));
        pose[14] = { ...pose[14], x: 0.395, y: 0.149 + gauss() * 0.002, z: 0, visibility: 0.99 };
        const y = -0.08, o = Math.min(1, (0.03 - y) / 0.12);
        pose[16] = { ...pose[16], x: 0.39 + gauss() * 0.04 * o, y: y + gauss() * 0.05 * o, z: gauss() * 0.06 * o, visibility: Math.max(0.02, 0.99 - 0.95 * o - r() * 0.25 * o) };
        const out = g.process(pose, i * 33.3);
        if (i > 90) ys.push(out[16].y);
    }
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const sd = Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length);
    assert.ok(mean < 0.149 - 0.1, 'the wrist is well above the elbow: ' + mean.toFixed(3));
    assert.ok(sd < 0.01, 'and steady (the raw guess had sd 0.05): ' + sd.toFixed(4));
    // the bone is never longer than a human one
    assert.ok(0.149 - mean < 0.66 * 0.2 * (16 / 9) * 1.1 + 0.01);
});

test('the aim of an arm raised half out of the picture: steady (the stress bench), at the start and after a long game', { timeout: 120000 }, () => {
    const chain = { camHz: 30, drawHz: 60, latency: 100 };
    const clean = jitterOf(run({ move: 'up', ms: 20000, chain }).rows);
    const clip = jitterOf(run({ move: 'up', clipTop: true, ms: 20000, chain }).rows);
    assert.ok(clip < 2.5, 'raised half out of the frame: ' + clip.toFixed(2) + '° (was ~8°)');
    assert.ok(clean < 0.6);
    const long = run({ move: 'up', clipTop: true, runBob: true, ms: 12 * 60000, chain }).rows;
    const first = jitterOf(long.filter((r) => r.t < 60000), 4000), last = jitterOf(long.filter((r) => r.t > 11 * 60000), 11 * 60000 + 4000);
    assert.ok(last < first + 0.6, `no degradation: first ${first.toFixed(2)}° last ${last.toFixed(2)}°`);
});

test('running: the wand\'s own steadier holds back the step shake (2.7 Hz) but lets a fast turn through', () => {
    const shake = (running) => {
        const st = new AimSteady(), cur = new THREE.Vector3(0, 1, 0); let e = 0, k = 0;
        for (let i = 0; i < 900; i++) {
            const tgt = new THREE.Vector3(Math.sin(2 * Math.PI * 2.7 * i / 60) * 0.07, 1, 0).normalize();
            cur.lerp(tgt, st.alpha(cur, tgt, 1 / 60, running)).normalize();
            if (i > 300) { e += (Math.atan2(cur.x, cur.y) * R2D) ** 2; k++; }
        }
        return Math.sqrt(e / k);
    };
    assert.ok(shake(true) < shake(false) * 0.5, `${shake(true).toFixed(2)}° running vs ${shake(false).toFixed(2)}°`);
    // a flick (60° in 100 ms) is followed while running
    const st = new AimSteady(), cur = new THREE.Vector3(0, 1, 0), tgt = new THREE.Vector3(Math.sin(1.05), Math.cos(1.05), 0);
    let t = 0; for (; t < 40; t++) { cur.lerp(tgt, st.alpha(cur, tgt, 1 / 60, true)).normalize(); if (cur.angleTo(tgt) < 0.1) break; }
    assert.ok(t < 20, 'caught the flick in ' + t + ' frames');
    const j = jitterOf(run({ move: 'still', yaw: 15, pitch: 5, runBob: true, ms: 20000, chain: { camHz: 30, drawHz: 60, latency: 100 } }).rows);
    assert.ok(j < 2.6, 'a running player\'s wand: ' + j.toFixed(2) + '° (was 4.5°)');
});
