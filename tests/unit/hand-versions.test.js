/**
 * Hand versions (settings): V3 (stable, the default) — the hand as it was before the
 * full hand (its turn from the knuckles, whole fingers, a wand in the fist); V4 (being
 * finished) — the palm's whole turn, every finger joint, a wand held like a pen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { PEN_GRIP } from '../../src/entities/SimplifiedHand.js';

test('hand versions: V3 is the default and the old stable hand; V4 is the full hand; switching back and forth works', () => {
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setShowHands(true);
    const h = ch.rightSimplifiedHand;
    assert.equal(ch.handVersion, 'v3');
    assert.equal(h.fullPose, false, 'V3: no full turn of the palm');
    assert.equal(h.HISTORY_LENGTH, 2);
    h.setGrip(0.38, 'pen');
    assert.equal(h.gripOverride.pose, null, 'V3: a wand in the fist, no pen grip');
    h.setGrip(null);
    ch.setHandVersion('v4');
    assert.equal(h.fullPose, true);
    assert.equal(ch.leftSimplifiedHand.fullPose, true);
    assert.equal(ch.getActiveHands().right, h, 'V4 is the voxel hand too');
    assert.equal(h.group.visible, true, 'still shown');
    h.setGrip(0.38, 'pen');
    assert.equal(h.gripOverride.pose, PEN_GRIP, 'V4: the pen grip');
    ch.setHandVersion('v3');
    assert.equal(h.fullPose, false);
    assert.equal(h.gripOverride.pose, null, 'back to V3: the pen grip goes too');
    ch.setHandVersion('v9');
    assert.equal(ch.handVersion, 'v3', 'an unknown version is ignored');
});
