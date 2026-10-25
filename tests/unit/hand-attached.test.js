// The drawn hand never comes apart from the forearm (a narrow house, a corner): any push on it bends the
// arm; a hand left off its place by other code springs back by itself (snaps when far, or NaN).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter as Character } from '../../src/entities/Character.js';

const hands = (c) => [c.leftSimplifiedHand, c.rightSimplifiedHand, c.leftDetailedHand, c.rightDetailedHand];
const gap = (c) => Math.max(...hands(c).map((h) => Math.abs(h.group.position.x) + Math.abs(h.group.position.y) + Math.abs(h.group.position.z - c.BONE_LENGTH_LOWER)));

test('a hand pushed against walls stays on the forearm in every frame, and a stray offset closes', () => {
    const c = new Character(new THREE.Scene());
    c.group.updateMatrixWorld(true);
    const push = new THREE.Vector3();
    for (let i = 0; i < 90; i++) {
        c.update(1 / 60, null, false);
        // corner of a 3x3 room: hands shoved in changing directions
        push.set(Math.sin(i / 5) * 0.6, Math.cos(i / 7) * 0.4, -0.5);
        c.setHandOffset('left', push, 0.6);
        c.setHandOffset('right', push.negate(), 0.6);
        c.group.updateMatrixWorld(true);
        assert.ok(gap(c) < 1e-6, 'frame ' + i + ': wrist apart by ' + gap(c));
    }
    // other code leaves a hand off its place (the old bug), even NaN
    c.leftDetailedHand.group.position.set(0.3, 0, c.BONE_LENGTH_LOWER + 0.2);
    c.rightSimplifiedHand.group.position.set(NaN, 0, 0);
    c.leftSimplifiedHand.group.position.set(0.05, 0.03, c.BONE_LENGTH_LOWER);
    for (let i = 0; i < 6; i++) c.update(1 / 60, null, false);
    assert.ok(gap(c) < 0.02, 'closed within a few frames: ' + gap(c));
});
