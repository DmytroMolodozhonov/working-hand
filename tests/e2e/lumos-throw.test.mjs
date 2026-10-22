/**
 * The Lumos light: «Ahead» sends it out of the wand; a sharp swing of the hand with the wand throws it
 * (soft rules — no fingers, no big wind-up; a 20-fps camera); the wand itself stays in the hand.
 * Run: node --test tests/e2e/lumos-throw.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

async function setup() {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0.8, leftCurl: 0 }, 12, 40);
    await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'lw1', plain: true, model: 0, color: 0x8b5a2b, power: 0 }, 'right');
        await frames(3);
    });
    return { page, errors };
}

test('«Ahead»: with the Lumos shining the light leaves the wand and flies; without it — a hint, nothing flies', async () => {
    const { page, errors } = await setup();
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, W = g.wandMagic;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const none = g.castLocalSpell('Ahead', true);
        const lumos = g.castLocalSpell('Люмос', true);
        await frames(3);
        const ahead = g.castLocalSpell('Эхед', true);
        await frames(3);
        return { none, lumos, ahead, thrown: W.thrown.length, light: !!W.light, wand: !!g.items.heldOf('wand') };
    });
    assert.equal(r.none, null, 'no Lumos: no spell');
    assert.equal(r.lumos, 'Lumos');
    assert.equal(r.ahead, 'LumosAhead');
    assert.equal(r.thrown, 1, 'the light flies');
    assert.equal(r.light, false, 'the tip is dark');
    assert.ok(r.wand, 'the wand stays in the hand');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('a sharp swing forward with the wand hand throws the light (a 20-fps camera); the wand stays in the hand', async () => {
    const { page, errors } = await setup();
    await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        g.castLocalSpell('Люмос', true);
        g.wandMagic._movedAt = -1e9;
        await frames(60); // (standing still)
    });
    // the hand by the head, then a fast swing forward / down, seen by a 20-fps camera
    await feed(page, { windup: 'right', rightCurl: 0.5, leftCurl: 0, jitter: 0.004 }, 14, 50);
    await feed(page, { arms: 'forward', rightCurl: 0.5, leftCurl: 0, jitter: 0.004 }, 10, 50);
    await feed(page, { arms: 'hang', rightCurl: 0.5, leftCurl: 0, jitter: 0.004 }, 6, 50);
    const r = await page.evaluate(() => {
        const g = window.__zns.game, W = g.wandMagic;
        return { thrown: W.thrown.length, light: !!W.light, wand: !!g.items.heldOf('wand'), log: (g.perf?.events || []).slice(-6) };
    });
    assert.equal(r.thrown, 1, 'the light was thrown ' + JSON.stringify(r.log));
    assert.equal(r.light, false);
    assert.ok(r.wand, 'the wand did not fly away');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
