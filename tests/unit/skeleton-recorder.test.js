/**
 * SkeletonRecorder: a jerk of the drawn arm saves the seconds around it (the camera's raw skeleton + what was drawn), in the
 * shape tools/armreplay.mjs plays; F10's long recording the same.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SkeletonRecorder, SKEL } from '../../src/game/SkeletonRecorder.js';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { replay } from '../../tools/armreplay.mjs';
import { frame } from '../e2e/poses.mjs';

function setup() {
    const ch = new VoxelCharacter(new THREE.Scene());
    const ps = { recordTaps: [], lastResults: null, native: true, _nativeVideo: { videoWidth: 640, videoHeight: 480 }, stats: {} };
    const game = { character: ch, active: true, currentPose: null, poseSmoother: { lead: 0.1 }, items: null };
    const rec = new SkeletonRecorder(game, ps, { save: false });
    return { ch, ps, game, rec };
}

test('skeleton recorder: a caught jerk keeps the seconds before and after it - camera skeleton and drawn arms', async () => {
    const { ps, rec } = setup();
    const after = SKEL.AFTER_S; SKEL.AFTER_S = 0.05;
    try {
        for (let i = 0; i < 20; i++) {
            const lm = frame({ arms: 'forward' }).poseLandmarks;
            for (const f of ps.recordTaps) f({ poseLandmarks: lm });
            ps.lastResults = { poseLandmarks: lm };
            rec._onFrame();
            await new Promise((r) => setTimeout(r, 5));
        }
        rec.jerk('right', { turn: 40, lift: 30, fix: 0.5 });
        await new Promise((r) => setTimeout(r, 80));
        rec._onFrame();
        const out = rec.lastRec;
        assert.ok(out, 'nothing saved');
        assert.equal(out.kind, 'zns-jerk');
        assert.equal(out.jerk.side, 'right');
        assert.ok(out.camera.length >= 20 && out.camera[0].pose.length === 25 && out.camera[0].vis.length === 25);
        assert.ok(out.frames.length >= 20 && out.frames[0].right.fore.length === 3 && out.frames[0].guard.length === 6);
        // (a second one at once is not saved: one in GAP_S)
        rec.jerk('left', { turn: 30, lift: 10, fix: 0 });
        assert.equal(rec.pending, null);
        // tools/armreplay.mjs plays it
        const r = replay(out, { side: 'right' });
        assert.ok(r.frames > 0);
    } finally { SKEL.AFTER_S = after; rec.stop(); }
});

test('skeleton recorder: F10 starts and stops a long recording', () => {
    const { ps, rec } = setup();
    assert.equal(rec.toggleLong(), true);
    const lm = frame({ arms: 'down' }).poseLandmarks;
    for (let i = 0; i < 5; i++) { for (const f of ps.recordTaps) f({ poseLandmarks: lm }); rec._onFrame(); }
    assert.equal(rec.toggleLong(), false);
    assert.equal(rec.lastRec.kind, 'zns-skel');
    assert.equal(rec.lastRec.camera.length, 5);
    rec.stop();
    assert.equal(ps.recordTaps.length, 0);
});
