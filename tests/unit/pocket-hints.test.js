// The quiet pocket hints in the camera's window (PocketHints.js): places from the pose, left-hander mirrored,
// nothing without a pose, grey when shut, the glow only for the place the hand goes to, no blinking, small icons.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PocketHints, placesFrom, iconPx, ICON_H, ALPHA, HINT_AT } from '../../src/input/PocketHints.js';
import { bodyPlaces } from '../../src/input/PoseInterpreter.js';
import { frame } from '../e2e/poses.mjs';

const mkPl = () => ({ pocket: { x: 0, y: 0 }, purse: { x: 0, y: 0 }, wand: { x: 0, y: 0 }, T: 0 });
const pose = (o = {}) => frame({ arms: 'hang', ...o }).poseLandmarks;
const info = (o = {}) => ({ on: true, leftHanded: false, shut: false, wand: true, purse: true, ...o });

test('places follow the body: pocket and pouch at the right hip, the wand in front a little to the other side', () => {
    const lm = pose(), P = mkPl();
    assert.ok(placesFrom(P, lm));
    assert.ok(Math.abs(P.pocket.x - lm[24].x) < P.T * 0.2, 'at the right hip joint (the pocket\'s opening)');
    assert.ok(P.purse.x < P.pocket.x, 'the pouch further out than the pocket');
    assert.ok(P.wand.x > P.pocket.x, 'the wand towards the middle / the other side');
    assert.ok(Math.abs(P.pocket.y - lm[24].y) < P.T * 0.3, 'at the belt');
    // moves with the body, not fixed on the screen
    const lm2 = lm.map((p) => ({ ...p, x: p.x + 0.1, y: p.y + 0.05 })), P2 = mkPl();
    placesFrom(P2, lm2);
    assert.ok(Math.abs(P2.pocket.x - P.pocket.x - 0.1) < 1e-9 && Math.abs(P2.pocket.y - P.pocket.y - 0.05) < 1e-9);
});

test('the hint is where the game reads the zone: the other hand there is «pocket»', () => {
    const f = frame({ arms: 'hang', pocket: 'cross' });
    const lm = f.poseLandmarks, P = mkPl();
    placesFrom(P, lm);
    const wr = lm[15];
    assert.ok(Math.hypot((wr.x - P.pocket.x) * 4 / 3, wr.y - P.pocket.y) / P.T < 0.35, 'the real pocket pose is close to the drawn place');
    const hand = (l) => f.hands.find((h) => h.label === l)?.landmarks;
    assert.equal(bodyPlaces(lm, hand('Right'), hand('Left')).pocket.off, true);
});

test('a left-hander: all mirrored', () => {
    const lm = pose(), m = lm.map((p) => ({ ...p, x: 1 - p.x }));
    [m[11], m[12]] = [m[12], m[11]]; [m[23], m[24]] = [m[24], m[23]]; [m[15], m[16]] = [m[16], m[15]];
    const a = mkPl(), b = mkPl();
    placesFrom(a, lm, false);
    placesFrom(b, m, true);
    for (const id of ['pocket', 'purse', 'wand']) {
        assert.ok(Math.abs(a[id].x - (1 - b[id].x)) < 1e-9, id + ' x');
        assert.ok(Math.abs(a[id].y - b[id].y) < 1e-9, id + ' y');
    }
});

test('no pose, no hips, lying, off — nothing', () => {
    const P = mkPl();
    assert.equal(placesFrom(P, null), false);
    const lm = pose();
    const blind = lm.map((p, i) => (i === 23 || i === 24 ? { ...p, visibility: 0.1 } : p));
    assert.equal(placesFrom(P, blind), false, 'hips not seen');
    const lying = lm.map((p) => ({ ...p, x: p.y, y: p.x * 0.2 })); // (the torso lies across the picture)
    assert.equal(placesFrom(P, lying), false, 'lying');
    const h = new PocketHints();
    assert.equal(h.step(0.07, lm, info({ on: false })), false, 'switched off');
    assert.equal(h.step(0.07, null, info()), false, 'no pose');
});

test('fades in and out softly, never blinks; the places do not jump', () => {
    const h = new PocketHints(), lm = pose();
    h.step(0.066, lm, info());
    assert.ok(h.k > 0 && h.k < 0.5, 'fading in');
    for (let i = 0; i < 6; i++) h.step(0.066, lm, info());
    assert.equal(h.k, 1);
    h.step(0.066, null, info()); // (one lost picture — still there)
    assert.ok(h.k > 0.5);
    let steps = 0;
    while (h.step(0.066, null, info())) steps++;
    assert.ok(steps >= 3 && steps < 10, 'gone in a few pictures: ' + steps);
    // the body moves a little: the place follows smoothly (no jump of the whole way at once)
    const g = new PocketHints();
    for (let i = 0; i < 8; i++) g.step(0.066, lm, info());
    const x0 = g.items.pocket.x;
    g.step(0.066, lm.map((p) => ({ ...p, x: p.x + 0.2 })), info());
    const moved = g.items.pocket.x - x0;
    assert.ok(moved > 0.05 && moved < 0.2, 'smoothly: ' + moved);
});

test('the glow only on the place the hand goes to, and only a soft level', () => {
    const lm = pose(), h = new PocketHints(), P = mkPl();
    placesFrom(P, lm);
    const near = lm.map((p, i) => (i === 15 ? { ...p, x: P.pocket.x + 0.01, y: P.pocket.y } : p));
    for (let i = 0; i < 30; i++) h.step(0.066, near, info());
    assert.equal(h.near, 'pocket');
    assert.ok(h.items.pocket.glow > 0.8 && h.items.purse.glow < 0.05 && h.items.wand.glow < 0.05);
    assert.ok(h.items.pocket.a > ALPHA.base && h.items.pocket.a <= ALPHA.near + 1e-9);
    assert.ok(Math.abs(h.items.purse.a - ALPHA.base) < 0.02, 'the others stay thin');
    // the leading (right) hand goes to the wand, not to the pocket
    const h2 = new PocketHints(), w = lm.map((p, i) => (i === 16 ? { ...p, x: P.wand.x, y: P.wand.y } : p));
    for (let i = 0; i < 30; i++) h2.step(0.066, w, info());
    assert.equal(h2.near, 'wand');
    // far hands: nothing glows
    const h3 = new PocketHints();
    for (let i = 0; i < 30; i++) h3.step(0.066, lm.map((p, i2) => (i2 === 15 ? { ...p, y: 0.1 } : p)), info());
    assert.equal(h3.near, null);
});

test('the wand not on the belt (in the hand, dropped) — its hint fades away; no pouch — none', () => {
    const lm = pose(), h = new PocketHints();
    for (let i = 0; i < 20; i++) h.step(0.066, lm, info());
    assert.ok(h.items.wand.a > 0.3);
    for (let i = 0; i < 30; i++) h.step(0.066, lm, info({ wand: false, purse: false }));
    assert.ok(h.items.wand.a < 0.02 && h.items.purse.a < 0.02);
    assert.ok(h.items.pocket.a > 0.3, 'the pocket stays');
});

test('shut (monster, still, dead, Imperius): grey and dim, no glow even with the hand on it', () => {
    const lm = pose(), h = new PocketHints(), P = mkPl();
    placesFrom(P, lm);
    const near = lm.map((p, i) => (i === 15 ? { ...p, x: P.pocket.x, y: P.pocket.y } : p));
    for (let i = 0; i < 30; i++) h.step(0.066, near, info({ shut: true }));
    assert.equal(h.shut, true);
    assert.equal(h.near, null);
    assert.ok(Math.abs(h.items.pocket.a - ALPHA.shut) < 0.02);
});

test('icons are small: at most 9 % of the window, never when the window is tiny', () => {
    assert.ok(iconPx(240, 0.4) <= ICON_H * 240 + 1e-9);
    assert.ok(iconPx(240, 0.2) <= 0.3 * 0.2 * 240 + 1e-9, 'a small torso — a small icon');
    assert.equal(iconPx(60, 0.4), 0, 'a tiny window: only the rings');
    assert.ok(HINT_AT.pocket.out < HINT_AT.purse.out);
});

test('one call is cheap and makes no new objects', () => {
    const h = new PocketHints(), lm = pose(), inf = info();
    for (let i = 0; i < 5; i++) h.step(0.066, lm, inf);
    const items = h.items, keys = Object.keys(items.pocket).join();
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) h.step(0.066, lm, inf);
    assert.ok((performance.now() - t0) / 2000 < 0.05, 'under 0.05 ms');
    assert.equal(h.items, items);
    assert.equal(Object.keys(h.items.pocket).join(), keys);
});
