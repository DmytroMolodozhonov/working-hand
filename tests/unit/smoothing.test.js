import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseSmoother } from '../../src/input/PoseSmoother.js';
import { matchSpell, bombardoRadius, MAXIMA_POWER } from '../../src/fx/SpellManager.js';

const pose = (x, yaw, extra = {}) => ({
    headRotation: { yaw, pitch: 0 },
    bodyRotation: 0,
    leftWrist: { x, y: 0.5, z: 0 },
    rightWrist: { x: 1 - x, y: 0.5, z: 0 },
    leftHandLandmarks: [{ x, y: 0.5, z: 0 }],
    rightHandLandmarks: null,
    isPunching: false,
    ...extra,
});

test('pose smoother: motion between camera results is continuous', () => {
    const s = new PoseSmoother();
    assert.equal(s.sample(0), null);
    // 20 results per second
    for (let i = 0; i <= 10; i++) s.push(pose(0.5, 0), i * 50);
    s.push(pose(0.6, 0.4), 550);
    // Right after the new result the hero has not jumped there
    const a = s.sample(551);
    assert.ok(a.leftWrist.x < 0.505, `jumped: ${a.leftWrist.x}`);
    // Half-way it is half-way, and it keeps moving every rendered frame
    const b = s.sample(562);
    assert.ok(b.leftWrist.x > 0.53 && b.leftWrist.x < 0.57, `${b.leftWrist.x}`);
    assert.ok(b.headRotation.yaw > 0.15 && b.headRotation.yaw < 0.25);
    assert.ok(b.leftHandLandmarks[0].x > 0.53);
    // ...and arrives quickly (half an interval), well before the next result
    const c = s.sample(580);
    assert.equal(c.leftWrist.x, 0.6);
    assert.equal(c.headRotation.yaw, 0.4);
});

test('pose smoother: a new result starts from what is on screen (no jumps back)', () => {
    const s = new PoseSmoother();
    for (let i = 0; i <= 10; i++) s.push(pose(0.5, 0), i * 50);
    s.push(pose(0.7, 0), 550);
    const mid = s.sample(562).leftWrist.x;
    s.push(pose(0.7, 0), 566); // next result arrives early
    const after = s.sample(567).leftWrist.x;
    assert.ok(Math.abs(after - mid) < 0.01, `${mid} → ${after}`);
});

test('pose smoother: flags come from the latest result, appearing hands are shown at once', () => {
    const s = new PoseSmoother();
    s.push(pose(0.5, 0), 0);
    s.push(pose(0.5, 0, { isPunching: true, rightHandLandmarks: [{ x: 0.2, y: 0.2, z: 0 }] }), 50);
    const p = s.sample(51);
    assert.equal(p.isPunching, true);
    assert.equal(p.rightHandLandmarks[0].x, 0.2);
    s.push(pose(0.5, 0, { leftHandLandmarks: null }), 100);
    assert.equal(s.sample(101).leftHandLandmarks, null); // lost hand is not dragged along
    s.reset();
    assert.equal(s.sample(200), null);
});

test('«Бомбардо Максима» is recognised and is 3× stronger', () => {
    for (const w of ['бомбардо максима', 'Бомбардо Максима', 'бомбарда максимум', 'bombardo maxima', 'бомба да максима']) assert.equal(matchSpell(w), 'BombardoMaxima', w);
    for (const w of ['бомбардо', 'бомбарда', 'bombardo']) assert.equal(matchSpell(w), 'Bombardo', w);
    assert.equal(MAXIMA_POWER, 3);
    // 3× the energy → the crater holds ~5× more ground than a normal Bombardo
    const vol = (r) => r ** 3;
    assert.ok(vol(bombardoRadius(MAXIMA_POWER)) / vol(bombardoRadius(1)) > 4.5);
    assert.equal(bombardoRadius(1), 3.6);
});
