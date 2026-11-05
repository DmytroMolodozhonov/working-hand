/**
 * The leap out of the water (the author 05.11: «быстро плывёшь вверх — выпрыгиваешь из воды дугой, как рыба»): Swimming._breachOut /
 * _breachStep on a stand-in body — out with its speed, an arc (nose up, level, nose down), back into the water under its surface.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Swimming, BREACH } from '../../src/game/Swimming.js';

function stand() {
    const ch = { group: new THREE.Group(), verticalVelocity: 0, jumpAir: false, onGround: false, jumpVel: new THREE.Vector3(), size: 1, tilts: [], setFlightTilt(t) { this.tilts.push(t); } };
    ch.head = { rotation: { x: 0 } };
    ch.group.position.set(0, -1.5, 0);
    const g = { character: ch, sound: null, flight: null, boards: null, ships: null };
    const s = Object.create(Swimming.prototype);
    Object.assign(s, { game: g, motion: { speed: 5, pitch: 0.6, tilt: 0, reset() {} }, strokes: { reset() {} }, y: -1.5, atTop: false, breach: null, splashes: 0, _splash() { s.splashes++; } });
    return { s, g, ch };
}

test('swimming up fast it leaps out in an arc and dives back in under the surface', () => {
    const { s, ch } = stand();
    const w = { surface: 0, depth: 20 };
    s._breachOut({ up: 9, forward: 6 }, w);
    assert.ok(s.breach && ch.jumpAir && ch.verticalVelocity > BREACH.MIN_UP, 'out with its speed');
    assert.ok(Math.hypot(ch.jumpVel.x, ch.jumpVel.z) > 3, 'on along where it swims');
    // fly it: the character's gravity (as in the game's air)
    let top = -Infinity, dt = 1 / 60, n = 0;
    while (s.breach && n++ < 600) {
        ch.verticalVelocity -= 20 * dt;
        ch.group.position.y += ch.verticalVelocity * dt;
        top = Math.max(top, ch.group.position.y - 1.95);
        s._breachStep(dt, w);
    }
    assert.ok(top > 1, 'the feet came out of the water: ' + top.toFixed(2));
    assert.equal(s.breach, null, 'back in the water');
    assert.ok(s.y < w.surface && !s.atTop, 'under its surface again');
    assert.ok(ch.tilts[0] < 1 && ch.tilts.at(-1) > 1.8, 'nose up leaving, nose down coming back: ' + ch.tilts[0].toFixed(2) + ' → ' + ch.tilts.at(-1).toFixed(2));
    assert.ok(s.splashes >= 2, 'splashes out and in');
});
