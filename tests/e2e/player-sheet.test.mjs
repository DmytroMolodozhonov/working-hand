/** The «🧙 Игрок» tab: first in the pause menu, open by default, shows the hero's real numbers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, realErrors, startFromMenu, sleep } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT || 8798);
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch(); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('Escape opens «Игрок» first; cards show HP, mana, name; the 3D hero draws only while open', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('pause-menu').classList.contains('hidden'));
    const tabs = await page.$$eval('.pause-tab:not([hidden])', (els) => els.map((e) => e.dataset.pauseTab));
    assert.equal(tabs[0], 'pause-player');
    assert.equal(await page.$eval('[data-pause-tab="pause-player"]', (e) => e.classList.contains('active')), true);
    await page.waitForSelector('#pause-player .ps-row');
    const rows = await page.$$eval('#pause-player .ps-label', (els) => els.map((e) => e.textContent));
    for (const l of ['Здоровье', 'Мана', 'Устойчивость']) assert.ok(rows.includes(l), l + ' in ' + rows.join());
    assert.ok((await page.textContent('#pause-player .ps-name')).length > 0);
    await sleep(1200); // (the 3D hero loads)
    await page.screenshot({ path: process.env.PS_SHOT || '/tmp/player-sheet.png' });
    // other tab: the preview is given back
    await page.click('[data-pause-tab="pause-audio"]');
    assert.equal(await page.evaluate(() => document.getElementById('pause-player').classList.contains('active')), false);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
