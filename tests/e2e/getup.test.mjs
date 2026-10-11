/**
 * Getting up after a fall with a real, noisy camera: standing still never lifts the body, a shallow
 * squat does; afterwards the head spins (the picture blurred and swaying) and it fades away.
 * Run: ZNS_TEST_PORT=8263 node --test tests/e2e/getup.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8263;
let srv, browser, shared;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); setTimeout(() => process.exit(0), 500).unref(); });

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** n camera frames with the nose at `noseY` (± jitter, a wild frame now and then) */
const noisy = async (page, noseY, n) => {
    for (let i = 0; i < n; i++) {
        const y = noseY + (rnd() - 0.5) * 0.05 + (rnd() < 0.03 ? (rnd() - 0.5) * 0.2 : 0);
        await page.evaluate((r) => { r.ts = performance.now(); window.__zns.poseService.injectRaw(r); }, frame({ arms: 'hang', noseY: y }));
        await new Promise((r) => setTimeout(r, 33));
    }
};
const knockState = (page) => page.evaluate(() => window.__zns.game.knock.state);

test('a noisy camera: standing still keeps me down, a shallow squat gets me up; then dizzy for a while', async () => {
    const { page, errors } = await openPage(browser, srv.url);
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await noisy(page, 0.25, 20);
    await page.evaluate(() => window.__zns.game.knock.knock({ dir: 'back', strength: 0.6 }));
    await page.waitForFunction(() => { const k = window.__zns.game.knock; return k.state === 'down' && k.t >= k.minDown; }, null, { timeout: 60000, polling: 100 });
    await noisy(page, 0.25, 90);
    assert.equal((await knockState(page)), 'down', 'standing still with a jittery camera: still lying');
    const d = await page.evaluate(() => ({ k: window.__zns.game.knock.dizzy, f: window.__zns.game.renderer.domElement.style.filter }));
    assert.ok(d.k > 0.3 && /blur/.test(d.f), `dizzy, the picture blurred: ${JSON.stringify(d)}`);
    // a shallow squat (the nose 0.2 lower, never past the old crouch line 0.5) and back up
    for (let i = 0; i < 40 && !(await page.evaluate(() => window.__zns.game.knock.squatted)); i++) await noisy(page, 0.45, 3);
    for (let i = 0; i < 40 && (await knockState(page)) === 'down'; i++) await noisy(page, 0.26, 3);
    assert.notEqual((await knockState(page)), 'down', 'up by a shallow squat');
    // the dizziness fades away and the picture is clear again
    await page.evaluate(() => { window.__zns.game.knock.dizzyLeft = 0.3; });
    await page.waitForFunction(() => window.__zns.game.knock.dizzy === 0 && !window.__zns.game.renderer.domElement.style.filter, null, { timeout: 30000, polling: 100 });
    assert.deepEqual(realErrors(errors), []);
    shared = { page, errors };
});

test('lying: turning the head looks round freely, the lying body does not spin; standing, it turns the body as before', async () => {
    const { page, errors } = shared;                                                // (the same game: a second one is too slow headless)
    await page.waitForFunction(() => window.__zns.game.knock.state === 'up', null, { timeout: 60000, polling: 100 });
    const r = await page.evaluate(() => {
        const g = window.__zns.game, base = { ...g.currentPose };
        g.settings.drifting = true;
        const run = (yaw, pitch, sec, dt = 1 / 60) => {
            for (let t = 0; t < sec; t += dt) { g.poseSmoother.to = null; g.currentPose = { ...base, headRotation: { yaw, pitch } }; g._updatePlayer(dt); }
        };
        g.knock.knock({ dir: 'back', down: 60 });
        run(0, 0, 1.5);
        const b0 = g.cameraBaseRotation, ry0 = g.character.group.rotation.y;
        run(0.6, 0, 2);
        const lying = { body: g.cameraBaseRotation - b0, ry: g.character.group.rotation.y - ry0, head: g.character.head.rotation.y };
        run(-0.6, -0.3, 2);
        const back = { head: g.character.head.rotation.y, pitch: g.character.head.rotation.x, ry: g.character.group.rotation.y - ry0 };
        g.knock.standNow(); run(0, 0, 2);
        const b1 = g.cameraBaseRotation;
        run(0.6, 0, 1);
        return { lying, back, standing: g.cameraBaseRotation - b1, head: g.character.head.rotation.y };
    });
    assert.ok(Math.abs(r.lying.body) < 1e-6 && Math.abs(r.lying.ry) < 1e-6, `the lying body stays put: ${JSON.stringify(r.lying)}`);
    assert.ok(r.lying.head > 0.8, `the head turns further lying: ${r.lying.head}`);
    assert.ok(r.back.head < -0.8 && Math.abs(r.back.ry) < 1e-6, `and the other way: ${JSON.stringify(r.back)}`);
    assert.ok(Math.abs(r.standing) > 0.3 && r.head < 0.8, `standing: the head turns the body as before: ${JSON.stringify(r)}`);
    assert.deepEqual(realErrors(errors), []);
});
