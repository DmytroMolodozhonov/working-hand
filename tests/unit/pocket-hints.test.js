// The quiet pocket hints in the camera's window (PocketHints.js): places from the pose, left-hander mirrored,
// nothing without a pose, grey when shut, the glow only for the place the hand goes to, no blinking, small icons.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PocketHints, placesFrom, iconPx, ICON_H, ALPHA, HINT_AT, IDS } from '../../src/input/PocketHints.js';
import { bodyPlaces } from '../../src/input/PoseInterpreter.js';
import { frame } from '../e2e/poses.mjs';

const mkPl = () => ({ pocket: { x: 0, y: 0 }, wand: { x: 0, y: 0 }, T: 0 });
const pose = (o = {}) => frame({ arms: 'hang', ...o }).poseLandmarks;
const info = (o = {}) => ({ on: true, leftHanded: false, shut: false, wand: true, ...o });

test('places follow the body: pocket and pouch at the right hip, the wand in front a little to the other side', () => {
    const lm = pose(), P = mkPl();
    assert.ok(placesFrom(P, lm));
    assert.ok(Math.abs(P.pocket.x - lm[24].x) < P.T * 0.2, 'at the right hip joint (the pocket\'s opening)');
    assert.ok(P.pocket.x > lm[24].x && P.pocket.x < (lm[23].x + lm[24].x) / 2, 'the pocket on the right half of the belt (the coins are taken there too)');
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
    for (const id of ['pocket', 'wand']) {
        assert.ok(Math.abs(a[id].x - (1 - b[id].x)) < 1e-9, id + ' x');
        assert.ok(Math.abs(a[id].y - b[id].y) < 1e-9, id + ' y');
    }
});

test('no pose, no hips, lying, off — nothing', () => {
    const P = mkPl();
    assert.equal(placesFrom(P, null), false);
    const lm = pose();
    const blind = lm.map((p, i) => (i === 23 || i === 24 ? { ...p, visibility: 0.1 } : p));
    // (почему не false: бёдра вне кадра теперь угадываются по плечам — PoseInterpreter.beltHips `est`, коммит bebbaa9: карман и
    // палочку берут и сидя близко к камере; метки стоят там же, где их читает игра)
    assert.equal(placesFrom(P, blind), true, 'hips not seen: guessed from the shoulders');
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
    assert.ok(h.items.pocket.glow > 0.8 && h.items.wand.glow < 0.05);
    assert.ok(h.items.pocket.a > ALPHA.base && h.items.pocket.a <= ALPHA.near + 1e-9);
    assert.ok(Math.abs(h.items.wand.a - ALPHA.base) < 0.02, 'the others stay as they are');
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
    for (let i = 0; i < 30; i++) h.step(0.066, lm, info({ wand: false }));
    assert.ok(h.items.wand.a < 0.02);
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
    assert.ok(HINT_AT.pocket && !HINT_AT.purse && !IDS.includes('purse'), 'no mark of its own for the coins: they are taken at the pocket (the author)');
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

test('the drawn mark is where the game reads the zone — any camera shape, right- or left-handed; the things on the belt, on the right', async () => {
    const { BELT_AT } = await import('../../src/input/PoseInterpreter.js');
    for (const aspect of [4 / 3, 16 / 9]) for (const lefty of [false, true]) {
        const mirror = (lm) => { const m = lm.map((p) => ({ ...p, x: 1 - p.x })); for (const [a, b] of [[11, 12], [13, 14], [15, 16], [23, 24]]) [m[a], m[b]] = [m[b], m[a]]; return m; };
        const get = (o) => { const lm = frame(o).poseLandmarks; return lefty ? mirror(lm) : lm; };
        const offW = lefty ? 16 : 15, offE = lefty ? 14 : 13, domW = lefty ? 15 : 16, domE = lefty ? 13 : 14;
        const tag = `aspect ${aspect.toFixed(2)} ${lefty ? 'left' : 'right'}-handed`;
        // the other hand's wrist right on the drawn pocket (the elbow goes with it): the game reads «pocket»
        let lm = get({ arms: 'hang', pocket: 'cross' }), P = mkPl();
        assert.ok(placesFrom(P, lm, lefty, aspect), tag);
        const move = (l, w, e, to) => { const dx = to.x - l[w].x, dy = to.y - l[w].y; l[w] = { ...l[w], x: to.x, y: to.y }; l[e] = { ...l[e], x: l[e].x + dx, y: l[e].y + dy }; };
        move(lm, offW, offE, P.pocket);
        assert.equal(bodyPlaces(lm, null, null, aspect, lefty).pocket.off, true, 'pocket ' + tag);
        // ...and that place is ON the belt, on the leading side: between the hips' middle and the leading hip joint, at the hip line
        const hip = lm[lefty ? 23 : 24], mid = (lm[23].x + lm[24].x) / 2, T = hip.y - lm[lefty ? 12 : 11].y;
        assert.ok((P.pocket.x - hip.x) * (mid - hip.x) > 0 && Math.abs(P.pocket.x - hip.x) < Math.abs(mid - hip.x), 'on the right half of the belt ' + tag);
        assert.ok(Math.abs(P.pocket.y - hip.y) < 0.15 * T, 'at the belt line ' + tag);
        // the coins are taken at the SAME place: a fist (not going in) on the pocket's mark — the game reads «purse»
        const ff = frame({ arms: 'hang', purse: 'cross', leftCurl: 0.9, mirror: lefty }), fl = ff.poseLandmarks, hd = ff.hands.find((x) => x.label === (lefty ? 'Left' : 'Right'))?.landmarks;
        const R = mkPl(); placesFrom(R, fl, lefty, aspect);
        assert.ok(Math.hypot((fl[offW].x - R.pocket.x) * aspect, fl[offW].y - R.pocket.y) / R.T < 0.2, 'the coins\' hand is on the pocket\'s mark ' + tag);
        const pr = bodyPlaces(fl, lefty ? null : hd, lefty ? hd : null, aspect, lefty);
        assert.ok(pr.purse.off === true && pr.pocket.off === false, 'purse ' + tag);
        // the wand's mark: the leading hand there is at the wand's place
        lm = get({ arms: 'hang', belt: 'right' });
        if (lefty) lm = mirror(frame({ arms: 'hang', belt: 'right' }).poseLandmarks);
        const Q = mkPl(); placesFrom(Q, lm, lefty, aspect); move(lm, domW, domE, Q.wand);
        const b = bodyPlaces(lm, null, null, aspect, lefty).belt[lefty ? 'left' : 'right'];
        assert.ok(b && b.dy > BELT_AT.dy[0] && b.dy < BELT_AT.dy[1] && b.u > BELT_AT.u[0] && b.u < BELT_AT.u[1], 'wand ' + tag);
        assert.ok(Math.abs(b.u - (BELT_AT.u[0] + BELT_AT.u[1]) / 2) < 1e-6, 'the wand mark is the zone\'s middle ' + tag);
    }
});

test('a wand in a hand is drawn as the game holds it: from the real wrist, its direction and length (mirror: the hero\'s right is the window\'s right)', async () => {
    const THREE = await import('three');
    const { Inventory } = await import('../../src/game/Inventory.js');
    const { drawHeldWands } = await import('../../src/input/PocketHintsDraw.js');
    // the game's side: a hero turned any way, the wand in the right hand pointing up and to the hero's right
    const group = new THREE.Group(); group.position.set(5, 2, -3); group.rotation.y = 0.7;
    const la = new THREE.Group(), ra = new THREE.Group(); la.position.set(-0.6, 1, 0); ra.position.set(0.6, 1, 0); group.add(la, ra);
    const hand = new THREE.Vector3(0.6, 0, -0.5);
    const model = new THREE.Group(); model.position.copy(hand); model.rotation.z = -Math.PI / 4; model.userData.tipY = 0.6; group.add(model);
    group.updateMatrixWorld(true);
    const game = { character: { group, leftArmAnchor: la, rightArmAnchor: ra, getHandWorldPosition: (s, out) => out.copy(hand).applyMatrix4(group.matrixWorld) }, items: { held: { right: { item: { kind: 'wand' }, model } } } };
    const o = { shut: false };
    Inventory.prototype._heldWandHint.call({ game }, o);
    const w = o.held.right;
    assert.ok(w.on && !o.held.left.on);
    assert.ok(Math.abs(o.held.shoulder - 1.2) < 1e-6, 'the hero\'s shoulders');
    assert.ok(Math.abs(w.bx) < 1e-6 && Math.abs(w.by) < 1e-6, 'the butt in the hand');
    assert.ok(Math.abs(w.tx - 0.6 * Math.SQRT1_2) < 1e-6 && Math.abs(w.ty - 0.6 * Math.SQRT1_2) < 1e-6, 'the tip up and to the right, in the hero\'s own space');
    // the window's side: the line from the player's right wrist, up and to the window's right, as long as the hero's wand in shoulders
    const lm = pose(), lines = [];
    const ctx = { save() {}, restore() {}, beginPath() {}, stroke() {}, fill() {}, arc() {}, moveTo(x, y) { this._m = [x, y]; }, lineTo(x, y) { lines.push([...this._m, x, y]); } };
    drawHeldWands(ctx, 320, 240, lm, o.held, 4 / 3, 1);
    assert.ok(lines.length >= 2);
    const [x0, y0, x1, y1] = lines[0], wr = lm[16];
    assert.ok(Math.abs(x0 - (1 - wr.x) * 320) < 1e-6 && Math.abs(y0 - wr.y * 240) < 1e-6, 'from the real right wrist (mirrored like the skeleton)');
    assert.ok(x1 > x0 && y1 < y0, 'up and to the window\'s right');
    const S = Math.hypot((lm[11].x - lm[12].x) * 4 / 3, lm[11].y - lm[12].y);
    assert.ok(Math.abs(Math.hypot((x1 - x0) * (4 / 3) / 320, (y1 - y0) / 240) - 0.6 * S / 1.2) < 1e-6, 'its length: half the shoulders, as the hero\'s');
    // no wand in a hand — nothing drawn
    lines.length = 0;
    drawHeldWands(ctx, 320, 240, lm, { left: { on: false }, right: { on: false }, shoulder: 1 }, 4 / 3, 1);
    assert.equal(lines.length, 0);
});
