/**
 * tools/armreplay.mjs plays a real camera recording (F9) through the game's arm chain: a still arm forward with the camera's
 * small noise must give no jerk of the drawn bones.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../../tools/armreplay.mjs';
import { frame } from '../e2e/poses.mjs';

let seed = 3;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;

test('arm replay: a still arm held forward (15 pictures a second, a little noise) - no jerks of the drawn arm', () => {
    const camera = [];
    for (let i = 0; i < 150; i++) {
        const f = frame({ arms: 'forward' }).poseLandmarks;
        camera.push({ t: i * 66, pose: f.slice(0, 25).map((p) => [p.x + rnd() * 0.004, p.y + rnd() * 0.004, p.z]), vis: f.slice(0, 25).map((p) => p.visibility) });
    }
    const r = replay({ video: { videoWidth: 640, videoHeight: 480 }, camera }, { side: 'right', min: 12 });
    assert.ok(r.frames > 500, `played ${r.frames} frames`);
    assert.equal(r.calm.length, 0, `jerks: ${JSON.stringify(r.calm.slice(0, 3))}`);
});
