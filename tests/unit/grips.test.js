import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SimplifiedHand, GRIP_POSES, GRIP_SHAPES } from '../../src/entities/SimplifiedHand.js';

/** Every finger bone's box sampled (corners, edge middles, face centres) in the palm's frame. */
function boneSamples(hand) {
    hand.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(hand.palm.matrixWorld).invert();
    const out = [];
    for (const [name, segs] of Object.entries(hand.fingerMeshes)) {
        segs.forEach((seg, i) => {
            const g = seg.mesh.geometry.parameters, hx = g.width / 2, hy = g.height / 2, hz = g.depth / 2;
            for (const x of [-hx, 0, hx]) for (const y of [-hy, 0, hy]) for (const z of [-hz, 0, hz]) {
                if (x === 0 && y === 0 && z === 0) continue;
                const p = new THREE.Vector3(x, y, z).applyMatrix4(seg.mesh.matrixWorld).applyMatrix4(inv);
                out.push({ name, i, p });
            }
        });
    }
    return out;
}
const depth = (S, p) => (S.ball ? Math.hypot(p.y - S.y, p.z - S.z, p.x) : Math.hypot(p.y - S.y, p.z - S.z)) - S.r;

for (const name of Object.keys(GRIP_SHAPES)) {
    for (const side of ['right', 'left']) {
        test(`grip «${name}» (${side} hand): the fingers lie on the thing, none goes into it`, () => {
            const S = GRIP_SHAPES[name];
            const hand = new SimplifiedHand(side);
            hand.group.visible = true;
            hand.setGrip(0.6, name);
            assert.equal(hand.gripOverride.pose, GRIP_POSES[name]);
            for (let i = 0; i < 60; i++) hand.update(null);
            const sm = boneSamples(hand);
            const deepest = sm.reduce((m, s) => Math.min(m, depth(S, s.p)), Infinity);
            assert.ok(deepest > -0.012, `no bone goes into it (deepest ${(deepest * 100).toFixed(1)} cm)`);
            // the fingers close round it: the end bones of at least three fingers touch it
            const touching = ['index', 'middle', 'ring', 'pinky', 'thumb'].filter((f) => sm.some((s) => s.name === f && s.i >= 1 && Math.abs(depth(S, s.p)) < 0.03));
            assert.ok(touching.length >= 3, `fingers on it: ${touching.join(', ')}`);
        });
    }
}
