/**
 * The coin pouches on the belt's right side with a real-like camera (the points jitter):
 * only the LEFT hand (across the body) and only looking down ties a pouch on (held there a
 * moment, or the fingers opened there) or takes one; the right hand, lowered, hanging,
 * swinging arms never. A left-hander mirrored.
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

test('coin pouches with a jittering camera: the LEFT hand across, looking down, ties one on (held, or the fingers opened) and takes one; the right hand, not looking, lowered and swinging arms never; a left-hander mirrored', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const give = (n, side = 'left') => page.evaluate(([c, s]) => { const g = window.__zns.game; for (const x of ['left', 'right']) g.items.releaseHand(x); g.items.takeIntoHand({ kind: 'coins', uid: 'cb' + c + s, count: c }, s); }, [n, side]);
    const state = () => page.evaluate(() => { const g = window.__zns.game, p = g.inventory.purse; return { r: g.items.held.right?.item.count ?? null, l: g.items.held.left?.item.count ?? null, belt: p.count, shown: document.getElementById('coin-count')?.textContent, log: p.log.join(',') }; });
    const look = async (pitch) => {
        await page.evaluate((p) => { window.__zns.poseService.interpreter.lastHead.pitch = p; }, pitch);
        await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0.9 }, 4);
        await page.waitForFunction((d) => window.__zns.game.inventory.headDown === d, pitch < 0, { timeout: 30000 });
    };
    await page.evaluate(() => { const g = window.__zns.game; g.inventory.select(-1); g.inventory.purse.count = 0; g.__coinSounds = 0; const s = g.sound; if (s) { const f = s.playCoins.bind(s); s.playCoins = () => { g.__coinSounds++; f(); }; } });
    await give(40);
    // lowered, hanging arms, arms swinging as in walking (the hand passing the hip), across NOT looking down: it stays in the hand
    await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0.9 }, 30);
    await feedNoisy(page, { arms: 'down', rightCurl: 0, leftCurl: 0.9 }, 30);
    await feedNoisy(page, (i) => ({ raise: 8 + 10 * Math.sin(i / 3), rightCurl: 0, leftCurl: 0.9 }), 40);
    await feedNoisy(page, { arms: 'hang', purse: 'cross', rightCurl: 0, leftCurl: 0.9 }, 30);
    const kept = await state();
    // looking down: the right hand with a pouch at its hip never ties it on (it is the wand's hand)
    await look(-0.8);
    await give(25, 'right');
    await feedNoisy(page, { arms: 'hang', purse: 'hip', rightCurl: 0.9, leftCurl: 0 }, 25);
    const rightHand = await state();
    // the left hand across to the right hip, held there: tied on
    await give(40);
    await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0.9 }, 6);
    await feedNoisy(page, { arms: 'hang', purse: 'cross', rightCurl: 0, leftCurl: 0.9 }, 20);
    const held = await state();
    await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 15);
    // the next one: brought there and the fingers opened at once — tied on (emptied into it)
    await give(30);
    await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0.9 }, 10);
    await feedNoisy(page, { arms: 'hang', purse: 'cross', rightCurl: 0, leftCurl: 0.9 }, 4);
    await feedNoisy(page, { arms: 'hang', purse: 'cross', rightCurl: 0, leftCurl: 0 }, 4);
    const opened = await state();
    await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 15);
    // the right hand on the pouches, the fingers close: nothing; the left hand: a pouch
    await page.evaluate(() => { const g = window.__zns.game; for (const x of ['left', 'right']) g.items.releaseHand(x); });
    await feedNoisy(page, { arms: 'hang', purse: 'hip', rightCurl: 0, leftCurl: 0 }, 8);
    await feedNoisy(page, { arms: 'hang', purse: 'hip', rightCurl: 0.9, leftCurl: 0 }, 20);
    const rightTake = await state();
    await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 15);
    await feedNoisy(page, { arms: 'hang', purse: 'cross', rightCurl: 0, leftCurl: 0 }, 8);
    await feedNoisy(page, { arms: 'hang', purse: 'cross', rightCurl: 0, leftCurl: 0.9 }, 25);
    const taken = await state();
    const sounds = await page.evaluate(() => window.__zns.game.__coinSounds);
    // a left-hander (the setting): the right hand across to the LEFT hip ties it on; the left hand at its own hip never
    await look(0);
    await page.evaluate(() => { const g = window.__zns.game; for (const x of ['left', 'right']) g.items.releaseHand(x); g.inventory.purse.count = 0; const sel = document.getElementById('handedness'); sel.value = 'left'; sel.dispatchEvent(new Event('change')); });
    await feedNoisy(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 10);
    await look(-0.8);
    await give(15, 'left');
    await feedNoisy(page, { arms: 'hang', purse: 'hip', rightCurl: 0.9, mirror: true }, 25); // (the left hand at the left hip)
    const lefty1 = await state();
    await give(15, 'right');
    await feedNoisy(page, { arms: 'hang', purse: 'cross', leftCurl: 0.9, rightCurl: 0, mirror: true }, 25); // (the right hand across to the left hip)
    const lefty2 = await state();
    await page.evaluate(() => { const sel = document.getElementById('handedness'); sel.value = 'right'; sel.dispatchEvent(new Event('change')); });
    assert.ok(kept.l === 40 && kept.belt === 0, 'lowered, hanging, swinging arms, not looking down never tie it on ' + JSON.stringify(kept));
    assert.ok(rightHand.r === 25 && rightHand.belt === 0, 'the right hand never ties one on ' + JSON.stringify(rightHand));
    assert.ok(held.l === null && held.belt === 40 && held.shown === '40', 'the left hand held at the right hip: tied on ' + JSON.stringify(held));
    assert.ok(opened.l === null && opened.belt === 70, 'the fingers opened at the hip: tied on ' + JSON.stringify(opened));
    assert.ok(rightTake.r === null && rightTake.belt === 70, 'the right hand never takes one off ' + JSON.stringify(rightTake));
    assert.ok(taken.l === 70 && taken.belt === 0, 'taken off by the left hand looking down ' + JSON.stringify(taken));
    assert.ok(sounds >= 2 || !(await page.evaluate(() => !!window.__zns.game.sound?.enabled)), 'the coins jingle when tied on (' + sounds + ')');
    assert.ok(lefty1.l === 15 && lefty1.belt === 0, 'a left-hander\'s left hand never ties it on ' + JSON.stringify(lefty1));
    assert.ok(lefty2.r === null && lefty2.belt === 15, 'a left-hander\'s right hand across to the left hip: tied on ' + JSON.stringify(lefty2));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
