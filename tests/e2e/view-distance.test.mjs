/**
 * «Прорисовка мира»: Medium by default; set in the pause menu it changes the running game at
 * once — the fog moves away and the terrain loads farther, gradually (no long freeze).
 * Run: ZNS_TEST_PORT=8272 node --test tests/e2e/view-distance.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8272;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); setTimeout(() => process.exit(0), 500).unref(); });

test('view distance: Medium by default, Maximum from the pause menu streams in without a freeze', async () => {
    const { page, errors } = await openPage(browser, srv.url);
    assert.equal(await page.evaluate(() => document.getElementById('view-distance').value), 'medium');
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => {
        const g = window.__zns.game;
        return { scale: g.world.viewDistance, far: g.scene.fog.far, chunks: g.world.terrain.meshes.size, R: g.world.terrain.radiusChunks };
    });
    assert.equal(before.scale, 1.6);

    // the pause menu → «Общие настройки» → «Графика» → «Максимальная»
    await page.keyboard.press('Escape');
    await page.click('[data-pause-tab="pause-settings"]');
    await page.click('#pause-settings .sub-tab[data-sub="set-graphics"]');
    await page.selectOption('#view-distance', 'max');
    await page.keyboard.press('Escape'); // (continues)
    // frames while the far land loads (logged: the longest frame)
    const run = await page.evaluate(async () => {
        const g = window.__zns.game;
        // (the terrain's own share of a frame: chunks are built a few at a time)
        const t = g.world.terrain, orig = t.update.bind(t);
        let tu = 0;
        t.update = (f) => { const a = performance.now(); orig(f); tu = Math.max(tu, performance.now() - a); };
        let last = performance.now(), worst = 0;
        const t0 = last;
        while (performance.now() - t0 < 6000) {
            await new Promise((r) => requestAnimationFrame(r));
            const now = performance.now();
            worst = Math.max(worst, now - last);
            last = now;
        }
        return { R: g.world.terrain.radiusChunks, far: g.scene.fog.far, chunks: g.world.terrain.meshes.size, queue: g.world.terrain._queue.length, worst, tu, saved: JSON.parse(localStorage.getItem('zns-settings'))['view-distance'] };
    });
    console.log('before', before, 'after', run);
    assert.ok(run.far > before.far * 1.7, `the fog moved away: ${before.far} → ${run.far}`);
    // (software rendering in tests is slow: the far chunks are still coming, one by one)
    assert.ok(run.R > before.R && run.chunks > before.chunks, `more land loads: ${JSON.stringify([before, run])}`);
    assert.ok(run.tu < 120, `the terrain never takes a long frame: ${run.tu} ms`);
    assert.equal(run.saved, 'max');
    assert.deepEqual(realErrors(errors), []);
});
