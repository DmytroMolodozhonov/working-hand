/**
 * F9: a 10-second recording of the hands for the developer — every camera result, what
 * the game drew every frame (the palm, the wand, the grip, a real stick), saved by the
 * server into recordings/ (and downloaded by the browser).
 * Run: ZNS_TEST_PORT=8197 node --test tests/e2e/hand-record.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('F9 records the hands for 10 s: the camera\'s points, the drawn wand and palm, saved into recordings/', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'hr1', plain: true, model: 0, color: 0x8b5a2b, power: 0 }, 'right');
    });
    await feed(page, { arms: 'forward', rightCurl: 0.4, leftCurl: 0 }, 5, 40);
    await page.keyboard.press('F9');
    await feed(page, (i) => ({ arms: 'forward', rightCurl: 0.4, leftCurl: 0, rightStick: 0.2 + i * 0.01 }), 60, 100);
    await page.waitForFunction(() => document.body.innerText.includes('Запись руки сохранена'), null, { timeout: 30000 });
    const text = await page.evaluate(() => document.body.innerText.match(/Запись руки сохранена: ([^\n(]+)/)?.[1]?.trim());
    assert.ok(text && fs.existsSync(text), `the file: ${text}`);
    const rec = JSON.parse(fs.readFileSync(text, 'utf-8'));
    fs.unlinkSync(text);
    assert.equal(rec.kind, 'zns-hands');
    assert.equal(rec.held.right, 'wand');
    assert.ok(rec.camera.length > 30, `camera results: ${rec.camera.length}`);
    assert.ok(rec.camera.some((c) => c.hands?.length && c.hands[0].lm.length === 21), 'the hands\' 21 points');
    assert.ok(rec.camera.some((c) => c.sticks?.length), 'the sticks');
    assert.ok(rec.frames.length > 10 && rec.frames.some((f) => f.right?.palm && f.wand), 'the drawn palm and wand');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
