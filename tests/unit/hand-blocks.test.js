// Hands never go into blocks (HandBlocks.js): a hand reaching through a counter or a wall
// stops on its surface, seen from the shoulder; soft things (leaves, water) let it in.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { firstSolid, handPushBack, handBlocked, HAND_GAP } from '../../src/game/HandBlocks.js';
import { BLOCK } from '../../src/world/Terrain.js';

// a market counter: blocks x 0…1, layers 0…1 (y −0.5 … 1.5 as Terrain lays layers: L = floor(y + 1.5))
const counter = (x, y, z) => Math.round(x) >= 0 && Math.round(x) <= 1 && Math.floor(y + 1.5) >= 1 && Math.floor(y + 1.5) <= 2 && Math.abs(z) < 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

test('a hand pushed down into the counter top stops on it (never in it)', () => {
    const S = V(-1.2, 3.2, 0); // the shoulder, before the counter
    const P = V(0.3, 1.0, 0); // the palm half a metre into the top
    const push = handPushBack(S, [P], counter, V());
    assert.ok(push, 'held back');
    const at = P.clone().add(push);
    assert.ok(!counter(at.x, at.y, at.z), 'the hand is out of the counter');
    assert.ok(at.y > 1.5 - 0.01 || at.x < -0.5 + 0.01, 'on its top or at its front: ' + at.toArray());
    assert.ok(push.length() < 1, 'only as far as it went in');
});

test('a hand that went right through the counter (the far side in the air) is stopped at its front', () => {
    const S = V(-2, 0.8, 0);
    const P = V(2.2, 0.8, 0); // beyond the counter, in the air
    const push = handPushBack(S, [P], counter, V());
    const at = P.clone().add(push);
    assert.ok(Math.abs(at.x - (-0.5 - HAND_GAP)) < 0.03, 'at the front face: ' + at.x);
});

test('a free hand is left alone; a shoulder inside a block says nothing', () => {
    assert.equal(handPushBack(V(-2, 3, 0), [V(-0.8, 2, 0)], counter, V()), null);
    assert.equal(handPushBack(V(0.5, 1, 0), [V(-1, 1, 0)], counter, V()), null);
    assert.equal(firstSolid(V(-2, 3, 0), V(-1, 3, 0), counter, V()), null);
});

test('soft things let a hand in: leaves, water, wheat, flowers; planks, stone, cloth stop it', () => {
    for (const b of [BLOCK.AIR, BLOCK.WATER, BLOCK.LEAVES, BLOCK.WHEAT, BLOCK.FLOWERS, BLOCK.VEG]) assert.ok(!handBlocked(b), 'soft ' + b);
    for (const b of [BLOCK.PLANKS, BLOCK.PLANKS_DARK, BLOCK.STONE, BLOCK.CLOTH_WHITE, BLOCK.CS_GREY, BLOCK.FENCE]) assert.ok(handBlocked(b), 'hard ' + b);
});
