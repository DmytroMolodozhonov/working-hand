/**
 * The head turns the view the same after a long game as at the start (right as well as left).
 * Run: ZNS_TEST_PORT=8197 node --test tests/e2e/head-turn.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch();
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('head turn: after minutes of turning (gentle held turns, full turns round, running, FPS drops) right turns as fast as at the start', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'down' }, 5, 50);
    const out = await page.evaluate(() => {
        const g = window.__zns.game;
        const base = { ...g.currentPose };
        g.settings.drifting = true;
        // the game's own player update, fast-forwarded (game time, synchronously)
        const step = (yaw, dt, extra = {}) => {
            g.poseSmoother.to = null;
            g.currentPose = { ...base, ...extra, headRotation: { yaw, pitch: 0 } };
            g._updatePlayer(dt);
        };
        const run = (yaw, sec, dt = 1 / 60, extra) => {
            const a = g.cameraBaseRotation;
            for (let t = 0; t < sec; t += dt) step(yaw, dt, extra);
            return g.cameraBaseRotation - a;
        };
        run(0, 3);
        const r0 = run(0.3, 1);
        run(0, 3);
        const l0 = -run(-0.3, 1);
        run(0, 3);
        // a gentle right turn held for a while (eyes stay on the screen)
        const holdFirst = run(0.25, 2);
        run(0.25, 16);
        const holdLater = run(0.25, 2);
        run(0, 3);
        // five minutes of playing: turns both ways (more to the right), turning round many
        // times, running, the frame rate sinking later and a few long hitches
        let seed = 11;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        let head = 0, t = 0;
        while (t < 300) {
            const dt = t > 150 ? (rnd() < 0.02 ? 0.5 : 1 / 15) : 1 / 60;
            const target = rnd() < 0.3 ? 0 : (rnd() < 0.65 ? 1 : -1) * (0.17 + rnd() * 0.55);
            const running = rnd() < 0.4;
            for (let k = 0; k < 1.5 / dt; k++, t += dt) {
                head += (target - head) * Math.min(1, dt * 4);
                step(head, dt, { isRunning: running, runIntensity: running ? 0.8 : 0 });
            }
        }
        const turnedRound = Math.abs(g.cameraBaseRotation) / (2 * Math.PI);
        run(0, 3);
        const r1 = run(0.3, 1);
        run(0, 3);
        const l1 = -run(-0.3, 1);
        return { r0, l0, r1, l1, holdFirst, holdLater, turnedRound, neutral: g.yawNeutral };
    });
    console.log('head turn', JSON.stringify(out));
    assert.ok(out.r0 > 0.4 && Math.abs(out.r0 - out.l0) < 0.05 * out.r0, `right and left alike at the start: ${out.r0} / ${out.l0}`);
    assert.ok(out.holdLater > 0.9 * out.holdFirst, `a held gentle right turn keeps turning: ${out.holdFirst} → ${out.holdLater}`);
    assert.ok(out.r1 > 0.9 * out.r0, `right as fast after five minutes: ${out.r0} → ${out.r1}`);
    assert.ok(Math.abs(out.r1 - out.l1) < 0.2 * out.r0, `right ${out.r1} vs left ${out.l1}`);
    assert.ok(Math.abs(out.neutral) < 0.05, `"straight" stayed straight (${out.neutral})`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
