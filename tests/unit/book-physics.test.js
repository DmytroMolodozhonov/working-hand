import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { frameFromHands, frameFromOneHand, pageLimits, PageSheet, sheetLag } from '../../src/game/BookPhysics.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const W = 0.95;
const eye = V(0, 2, 2); // the reader stands at +Z, looking towards −Z

test('book in two hands: as open as the hands are apart; the free edges are exactly in the hands', () => {
    for (const d of [0.05, 0.6, 1.2, 1.9]) {
        const pL = V(-d / 2, 1, 0), pR = V(d / 2, 1, 0);
        const f = frameFromHands(pL, pR, eye, W);
        assert.ok(Math.abs(f.phi - 2 * Math.asin(Math.min(1, d / (2 * W)))) < 1e-9);
        // the outer edges of the halves (in the book's frame: ±w·sin(φ/2) across, w·cos(φ/2) to the reader)
        for (const [s, p] of [[-1, pL], [1, pR]]) {
            const edge = V(s * W * Math.sin(f.phi / 2), 0, W * Math.cos(f.phi / 2)).applyQuaternion(f.quat).add(f.pos);
            assert.ok(edge.distanceTo(p) < 1e-6, `edge ${s} at the hand (d=${d}): ${edge.distanceTo(p)}`);
        }
        // the pages look at the reader; the spine is away from him
        const Z = V(0, 0, 1).applyQuaternion(f.quat);
        assert.ok(Z.dot(V(0, 1, 2).normalize()) > 0.4, 'pages towards the eye');
        assert.ok(f.pos.z <= 1e-9, 'spine behind the hands');
    }
    // hands together: closed; a hand's width apart: well open; shoulder-wide: flat
    assert.ok(frameFromHands(V(-0.02, 1, 0), V(0.02, 1, 0), eye, W).phi < 0.1);
    assert.ok(frameFromHands(V(-0.95, 1, 0), V(0.95, 1, 0), eye, W).phi > Math.PI - 1e-6);
});

test('book in two hands: one hand higher tilts the book (no fixed pose)', () => {
    const f = frameFromHands(V(-0.8, 0.8, 0), V(0.8, 1.2, 0), eye, W);
    const X = V(1, 0, 0).applyQuaternion(f.quat);
    assert.ok(X.y > 0.2, 'the line of the book follows the hands');
});

test('book in one hand: the held half\'s edge is in that hand, open as it was', () => {
    const grip = V(-0.7, 1, 0);
    const f = frameFromOneHand(grip, 'left', 2.6, eye, W);
    const edge = V(-W * Math.sin(1.3), 0, W * Math.cos(1.3)).applyQuaternion(f.quat).add(f.pos);
    assert.ok(edge.distanceTo(grip) < 1e-6);
});

test('a page left alone falls to the side it leans to', () => {
    const phi = Math.PI * 0.9;
    const { bR, bL } = pageLimits(phi);
    const a = new PageSheet(1, phi);
    a.beta = Math.PI / 2 - 0.15; // not yet over the top
    let r = null;
    for (let i = 0; i < 300 && !r; i++) r = a.step(1 / 60, phi);
    assert.equal(r, 'right', 'back where it was');
    assert.equal(a.beta, bR);
    const b = new PageSheet(1, phi);
    b.beta = Math.PI / 2 + 0.15; // over the top
    r = null;
    for (let i = 0; i < 300 && !r; i++) r = b.step(1 / 60, phi);
    assert.equal(r, 'left', 'turned');
    assert.equal(b.beta, bL);
});

test('a fingertip under the edge lifts the page and it follows the finger; over the top it falls on by itself', () => {
    const phi = Math.PI * 0.9;
    const s = new PageSheet(1, phi);
    const dt = 1 / 60;
    // the finger slides under the edge and lifts it slowly to 70°
    let f = s.beta;
    for (let i = 0; i < 60; i++) {
        f = Math.min(1.22, f + 0.02);
        s.touch(f, dt);
        assert.equal(s.step(dt, phi), null);
        assert.ok(s.beta >= f - s.gap - 1e-9, 'never through the finger');
    }
    assert.ok(s.beta - 1.22 > -1e-9 && s.beta - 1.22 < 0.1, 'the page is where the finger holds it (a little swing up): ' + s.beta);
    // the finger stops at 70° and holds: the page rests on it (doesn't fall back)
    for (let i = 0; i < 60; i++) { s.touch(1.22, dt); s.step(dt, phi); }
    assert.ok(Math.abs(s.beta - 1.22) < 0.02, 'resting on the finger');
    // the finger lets go before the middle: it falls back
    s.touch(null, dt);
    let r = null;
    for (let i = 0; i < 300 && !r; i++) r = s.step(dt, phi);
    assert.equal(r, 'right');
    // a new page: the finger carries it just past the middle and stops — it goes on over by itself
    const t = new PageSheet(1, phi);
    f = t.beta;
    r = null;
    for (let i = 0; i < 120 && !r; i++) { f = Math.min(Math.PI / 2 + 0.2, f + 0.03); t.touch(f, dt); r = t.step(dt, phi); }
    for (let i = 0; i < 300 && !r; i++) { t.touch(Math.PI / 2 + 0.2, dt); r = t.step(dt, phi); }
    assert.equal(r, 'left', 'turned over');
});

test('turning back: a finger under the left page carries it to the right', () => {
    const phi = Math.PI;
    const s = new PageSheet(-1, phi);
    assert.equal(s.beta, Math.PI);
    let f = s.beta, r = null;
    for (let i = 0; i < 200 && !r; i++) { f = Math.max(0.3, f - 0.04); s.touch(f, 1 / 60); r = s.step(1 / 60, phi); }
    assert.equal(r, 'right');
});

test('a flick: a quick push and the finger is gone — the page flies over', () => {
    const phi = Math.PI;
    const s = new PageSheet(1, phi);
    const dt = 1 / 60;
    let f = 0;
    for (let i = 0; i < 6; i++) { f += 0.17; s.touch(f, dt); s.step(dt, phi); } // ~10 rad/s up to ~1 rad
    s.touch(null, dt);
    let r = null;
    for (let i = 0; i < 300 && !r; i++) r = s.step(dt, phi);
    assert.equal(r, 'left', 'the swing carried it over the top');
});

test('a moving page bends (its edge lags) but never into the pages', () => {
    const phi = Math.PI * 0.95;
    const { bR } = pageLimits(phi);
    const s = new PageSheet(1, phi);
    s.beta = bR + 0.05; s.omega = 8;
    const lag = sheetLag(s, phi);
    assert.ok(lag > 0 && lag <= 0.05 + 1e-9, 'lags, but stays above the right pages: ' + lag);
    s.beta = 1.5; s.omega = 8;
    assert.ok(sheetLag(s, phi) > 0.3);
    s.omega = 0;
    assert.equal(sheetLag(s, phi), 0, 'still: flat');
});
