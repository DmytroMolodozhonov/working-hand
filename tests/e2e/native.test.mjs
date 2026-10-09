/**
 * The camera network as a program of its own (pose_native.py next to server.py):
 * the game takes the points from it and never runs a network on its own thread.
 * Needs MediaPipe for Python; ZNS_TEST_PYTHON points at a python that has it
 * (and a test video in place of the camera). Skipped otherwise.
 * Run: ZNS_TEST_PYTHON=/path/to/python ZNS_TEST_VIDEO=person.mp4 node --test tests/e2e/native.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { startServer, launch, startFromMenu, realErrors } from './harness.mjs';

const PY = process.env.ZNS_TEST_PYTHON || 'python3';
const VIDEO = process.env.ZNS_TEST_VIDEO;
let has = false;
try { execFileSync(PY, ['-c', 'import mediapipe, cv2'], { stdio: 'ignore' }); has = !!VIDEO; } catch (e) { has = false; }

test('camera network program: the game gets the body and both hands from it and keeps its frames', { skip: !has && 'no MediaPipe for Python / no test video' }, async () => {
    const srv = await startServer(Number(process.env.ZNS_TEST_PORT) || 8211, { python: PY, env: { ZNS_CAMERA_FILE: VIDEO } });
    const browser = await launch({});
    try {
        const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
        const errors = [];
        page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
        page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
        await page.addInitScript(() => { window.__ZNS_NO_WORLD_PROBE__ = true; window.__ZNS_FIXED_QUALITY__ = true; });
        await page.goto(srv.url);
        await page.waitForFunction(() => !!window.__zns);
        await startFromMenu(page, 'creative');
        await page.waitForFunction(() => window.__zns.poseService.stats.results >= 10, null, { timeout: 180000 });
        const r = await page.evaluate(async () => {
            const ps = window.__zns.poseService;
            const r0 = ps.stats.results, t0 = performance.now();
            await new Promise((res) => setTimeout(res, 5000));
            const res = ps.lastResults || {};
            return {
                mode: ps.stats.mode, backend: ps.stats.backend, perSec: (ps.stats.results - r0) / ((performance.now() - t0) / 1000),
                pose: !!res.poseLandmarks, left: !!res.leftHandLandmarks, right: !!res.rightHandLandmarks,
                browserNet: !!(ps.holistic || ps.runner || ps.worker), cameraOpened: !!ps.stream,
            };
        });
        assert.equal(r.mode, 'native', JSON.stringify(r));
        assert.ok(r.pose && r.left && r.right, 'body and both hands from the program ' + JSON.stringify(r));
        assert.ok(!r.browserNet && !r.cameraOpened, 'no network and no camera in the browser');
        assert.ok(r.perSec > 3, `poses keep coming (${r.perSec.toFixed(1)}/s)`);
        assert.deepEqual(realErrors(errors), []);
    } finally {
        await browser.close();
        srv.stop();
    }
});
