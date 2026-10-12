/**
 * The coin pouches on the belt's right side with a real-like camera (the points jitter):
 * a pouch in the hand brought to the right hip is tied on (held there a moment, or the
 * fingers opened there; the left hand reaching across too); lowered, hanging, swinging
 * arms never; taken off looking down.
 * Run: ZNS_TEST_PORT=8197 node --test tests/e2e/coin-belt.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

let seed = 5;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
/** Like feed(), but every point jitters as a real camera network's does (±`n` of the picture). */
async function feedNoisy(page, opts, count, ms = 40, n = 0.008) {
    for (let i = 0; i < count; i++) {
        const f = frame(typeof opts === 'function' ? opts(i) : opts);
        for (const p of f.poseLandmarks) { p.x += rnd() * n; p.y += rnd() * n; }
        for (const h of f.hands) for (const p of h.landmarks) { p.x += rnd() * n * 0.5; p.y += rnd() * n * 0.5; }
        await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, f);
        await new Promise((r) => setTimeout(r, ms));
    }
}

test('coin pouches with a jittering camera: brought to the right hip — tied on (held, or the fingers opened; the left hand across too); lowered and swinging arms never; taken off looking down', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const give = (n, side = 'right') => page.evaluate(([c, s]) => { const g = window.__zns.game; for (const x of ['left', 'right']) g.items.releaseHand(x); g.items.takeIntoHand({ kind: 'coins', uid: 'cb' + c, count: c }, s); }, [n, side]);
    const state = () => page.evaluate(() => { const g = window.__zns.game, p = g.inventory.purse; return { r: g.items.held.right?.item.count ?? null, l: g.items.held.left?.item.count ?? null, belt: p.count, shown: document.getElementById('coin-count')?.textContent, log: p.log.join(',') }; });
    await page.evaluate(() => { const g = window.__zns.game; g.inventory.select(-1); g.__coinSounds = 0; const s = g.sound; if (s) { const f = s.playCoins.bind(s); s.playCoins = () => { g.__coinSounds++; f(); }; } });
    await give(40);
    // lowered, hanging arms, arms swinging as in walking (the hand passing the hip): it stays in the hand
    await feedNoisy(page, { arms: 'hang', rightCurl: 0.9, leftCurl: 0 }, 30);
    await feedNoisy(page, { arms: 'down', rightCurl: 0.9, leftCurl: 0 }, 30);
    await feedNoisy(page, (i) => ({ raise: 8 + 10 * Math.sin(i / 3), rightCurl: 0.9, leftCurl: 0 }), 40);
    await feedNoisy(page, (i) => (i % 6 < 3 ? { arms: 'hang', rightCurl: 0.9, leftCurl: 0 } : { arms: 'down', rightCurl: 0.9, leftCurl: 0 }), 40);
    const kept = await state();
    // the fist with it at the belt by the right hip, held there: tied on
    await feedNoisy(page, { arms: 'hang', purse: 'hip', rightCurl: 0.9, leftCurl: 0 }, 20);
    const held = await state();
    await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 15);
    // the next one: brought there and the fingers opened at once — tied on (emptied into it)
    await give(30);
    await feedNoisy(page, { arms: 'hang', rightCurl: 0.9, leftCurl: 0 }, 10);
    await feedNoisy(page, { arms: 'hang', purse: 'hip', rightCurl: 0.9, leftCurl: 0 }, 4);
    await feedNoisy(page, { arms: 'hang', purse: 'hip', rightCurl: 0, leftCurl: 0 }, 4);
    const opened = await state();
    await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 15);
    // the left hand reaching across to the right hip
    await give(20, 'left');
    await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0.9 }, 10);
    await feedNoisy(page, { arms: 'hang', purse: 'cross', rightCurl: 0, leftCurl: 0.9 }, 20);
    const across = await state();
    await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 15);
    // taken off: looking down, the open hand at it, the fingers close
    await page.evaluate(() => { window.__zns.poseService.interpreter.lastHead.pitch = -0.8; });
    await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 10);
    await page.waitForFunction(() => window.__zns.game.inventory.belt.lookingDown(), null, { timeout: 30000 });
    await feedNoisy(page, { arms: 'hang', purse: 'hip', rightCurl: 0, leftCurl: 0 }, 8);
    await feedNoisy(page, { arms: 'hang', purse: 'hip', rightCurl: 0.9, leftCurl: 0 }, 25);
    const taken = await state();
    const sounds = await page.evaluate(() => window.__zns.game.__coinSounds);
    assert.ok(kept.r === 40 && kept.belt === 0, 'lowered, hanging, swinging arms never tie it on ' + JSON.stringify(kept));
    assert.ok(held.r === null && held.belt === 40 && held.shown === '40', 'held at the right hip: tied on ' + JSON.stringify(held));
    assert.ok(opened.r === null && opened.belt === 70, 'the fingers opened at the hip: tied on ' + JSON.stringify(opened));
    assert.ok(across.l === null && across.belt === 90, 'the left hand across to the right hip ' + JSON.stringify(across));
    assert.ok(taken.r === 90 && taken.belt === 0, 'taken off looking down ' + JSON.stringify(taken));
    assert.ok(sounds >= 3 || !(await page.evaluate(() => !!window.__zns.game.sound?.enabled)), 'the coins jingle when tied on (' + sounds + ')');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
