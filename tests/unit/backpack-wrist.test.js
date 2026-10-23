import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { backpackSpot, BACKPACK_WEAR } from '../../src/game/Items.js';

// The hero: ~3.5 m, shoulders at x ±0.7, y 0.5 above the hips (the arm anchor), back at z +0.4, the arm 1.9 m long.
const V = (x, y, z) => new THREE.Vector3(x, y, z);

test('backpack: a hand behind the back, or at the shoulder, puts it on; a hand hanging or held out in front does not', () => {
    const rs = V(0.7, 0.5, 0), ls = V(-0.7, 0.5, 0);
    for (const [hand, sh, name] of [[V(0.9, 0.2, 0.6), rs, 'right behind'], [V(-0.9, 0.2, 0.6), ls, 'left behind'], [V(0.6, 0.9, 0.2), rs, 'right over the shoulder'], [V(-0.5, 1.0, -0.2), ls, 'left at the shoulder'], [V(-0.3, 0.3, 0.5), rs, 'right hand reaching to the left back']]) {
        assert.ok(backpackSpot(hand, V(0, -1, -0.5), sh), name);
    }
    assert.equal(backpackSpot(V(1.0, -1.2, -0.3), V(-1, -1.2, -0.3), rs), null, 'hanging at the side');
    assert.equal(backpackSpot(V(0.4, 0.5, -1.6), V(-1, -1.2, -0.3), rs), null, 'held out in front');
    assert.equal(backpackSpot(V(0.9, -0.6, -0.9), V(-1, -1.2, -0.3), rs), null, 'in front of the belt');
    assert.ok(BACKPACK_WEAR.T <= 0.4 && BACKPACK_WEAR.SHOULDER_R <= 1.2);
});

test('the wrist is never torn off the forearm: any pose, a push on the hand, a quick shake', () => {
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter(scene, {});
    ch.group.updateMatrixWorld(true);
    const L2 = ch.BONE_LENGTH_LOWER;
    const gap = (side) => {
        const el = side === 'left' ? ch.leftElbowAnchor : ch.rightElbowAnchor;
        const hands = ch.getActiveHands()[side];
        el.updateMatrixWorld(true); hands.group.updateMatrixWorld(true);
        const elbow = el.getWorldPosition(new THREE.Vector3());
        const wrist = el.localToWorld(new THREE.Vector3(0, 0, L2));
        const drawn = hands.group.getWorldPosition(new THREE.Vector3());
        return { len: elbow.distanceTo(wrist), off: wrist.distanceTo(drawn) };
    };
    const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    for (let i = 0; i < 400; i++) {
        const side = rnd() < 0.5 ? 'left' : 'right';
        const target = V((rnd() - 0.5) * 6, (rnd() - 0.3) * 4, (rnd() - 0.8) * 4);
        ch.reachHand(side, target, 1, 0);
        // pushed by a body / a wall (also hard, many times in a frame, then letting go)
        ch.setHandOffset(side, V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(4));
        ch.update(1 / 60, null, false);
        for (const s of ['left', 'right']) {
            const g = gap(s);
            assert.ok(g.off < 1e-4, `hand off the forearm's end by ${g.off.toFixed(3)} m (${s})`);
        }
    }
});
