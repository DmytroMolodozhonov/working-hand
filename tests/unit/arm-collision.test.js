/**
 * The hand at a wall, a slope, a ceiling (the author: «когда я близко подхожу к стене или горе, рука проходит сквозь гору… и
 * начинает дрожать, у неё истерика»): never in it, no back-and-forth, no twitch; the shoulder at the wall does not let the arm
 * through. The whole way: noisy camera → filters → the arm → HandBlocks (tools/armstab.mjs, limits only tighten).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { slideOut, HAND_GAP } from '../../src/game/HandBlocks.js';
import { wall, LIMITS } from '../../tools/armstab.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const wallX = (x) => Math.round(x) >= 2; // blocks x ≥ 2: the face at x 1.5

test('a hand in a wall is slid out along its face — where the player put it, not dragged towards the shoulder', () => {
    const O = V(0, 2, 0), P = V(1.8, 2.4, -0.6);
    const m = slideOut(O, P, (x) => wallX(x), V());
    const at = P.clone().add(m);
    assert.ok(Math.abs(at.x - (1.5 - HAND_GAP)) < 0.02, 'on the face: ' + at.x.toFixed(3));
    assert.ok(Math.abs(at.y - 2.4) < 1e-6 && Math.abs(at.z + 0.6) < 1e-6, 'the same place along the wall');
    assert.equal(slideOut(O, V(1.2, 2, 0), (x) => wallX(x), V()), null, 'a free hand: nothing');
});

test('a fingertip at a step\'s edge keeps the face it lay on (a stepped slope must not swap top / front frame by frame)', () => {
    // a step: layer ≤ 1 for z ≥ 0, i.e. the top at y 0.5, the front face at z −0.5
    const solid = (x, y, z) => Math.floor(y + 1.5) <= 1 && Math.round(z) >= 0;
    const O = V(0, 2.5, -2);
    const P = V(0, 0.45, -0.45); // just in, near the edge: either face would do
    const top = slideOut(O, P, solid, V(), HAND_GAP, V(0, 1, 0));
    assert.ok(top && Math.abs(P.y + top.y - (0.5 + HAND_GAP)) < 0.02 && Math.abs(top.z) < 1e-6, 'kept on the top: ' + top?.toArray());
    const front = slideOut(O, P, solid, V(), HAND_GAP, V(0, 0, -1));
    assert.ok(front && Math.abs(P.z + front.z - (-0.5 - HAND_GAP)) < 0.02 && Math.abs(front.y) < 1e-6, 'kept on the front: ' + front?.toArray());
});

test('pressed on a wall, a slope, a ceiling; the shoulder at a wall; walking along it: never in, no hysterics, no twitch', () => {
    const r = wall({ seeds: 1, noise: 0.3 }); // (a usual camera — tools/armstab.mjs)
    for (const [k, v] of Object.entries(r)) {
        assert.ok(v.depthCm <= LIMITS.wallDepthCm, `${k}: ${v.depthCm.toFixed(1)} cm in it (before, the shoulder at a wall: 45 cm)`);
        assert.ok(v.ncm <= LIMITS.wallCm, `${k}: ${v.ncm.toFixed(2)} cm in and out`);
        assert.ok(v.flips <= LIMITS.wallFlips, `${k}: back and forth ${v.flips.toFixed(1)} a second (before: 14…18)`);
        assert.ok(v.jump <= LIMITS.wallJumpCm, `${k}: a ${v.jump.toFixed(1)} cm twitch`);
    }
});
