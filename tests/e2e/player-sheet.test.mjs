/** The «🧙 Игрок» tab: second tab of the pause menu (after «Меню»), shows the hero's real numbers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, realErrors, startFromMenu, sleep } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT || 8798);
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch(); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('«Игрок» is the second tab; cards show HP, mana, name; the 3D hero draws only while open', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('pause-menu').classList.contains('hidden'));
    const tabs = await page.$$eval('.pause-tab:not([hidden])', (els) => els.map((e) => e.dataset.pauseTab));
    assert.deepEqual(tabs.slice(0, 2), ['pause-main', 'pause-player']); // («Меню», then «Игрок»; «Меню» is open by default)
    assert.equal(await page.$eval('[data-pause-tab="pause-main"]', (e) => e.classList.contains('active')), true);
    await page.click('[data-pause-tab="pause-player"]');
    await page.waitForSelector('#pause-player .ps-row');
    const rows = await page.$$eval('#pause-player .ps-label', (els) => els.map((e) => e.textContent));
    for (const l of ['Здоровье', 'Мана', 'Устойчивость']) assert.ok(rows.includes(l), l + ' in ' + rows.join());
    assert.ok((await page.textContent('#pause-player .ps-name')).length > 0);
    await sleep(1200); // (the 3D hero loads)
    await page.screenshot({ path: process.env.PS_SHOT || '/tmp/player-sheet.png' });
    // opened again and again: the 3D hero is drawn every time (non-empty pixels), also after the armour changed
    const painted = () => page.evaluate(async () => {
        await new Promise((r) => setTimeout(r, 900));
        const c = document.querySelector('#pause-player .ps-canvas');
        const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
        const x = t.getContext('2d'); x.drawImage(c, 0, 0);
        const d = x.getImageData(0, 0, t.width, t.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
        return n;
    });
    assert.ok(await painted() > 2000, 'first opening paints the hero');
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Escape'); // close
        await page.waitForFunction(() => document.getElementById('pause-menu').classList.contains('hidden'));
        if (i === 1) await page.evaluate(() => { const g = window.__zns.game; g.armor.worn.helmet = { kind: 'armor', piece: 'helmet', magic: true, uid: 'x', hp: 30 }; });
        await page.keyboard.press('Escape'); // open
        await page.waitForFunction(() => !document.getElementById('pause-menu').classList.contains('hidden'));
        await page.click('[data-pause-tab="pause-player"]');
        assert.ok(await painted() > 2000, 'opening ' + (i + 2) + ' paints the hero');
    }
    // other tab: the preview is given back
    await page.click('[data-pause-tab="pause-main"]');
    assert.equal(await page.evaluate(() => document.getElementById('pause-player').classList.contains('active')), false);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
