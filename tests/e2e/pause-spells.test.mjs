/**
 * Escape in «Выживание»: the «✨ Заклинания» tab lists only the spells the hero can say now (a scroll's
 * spell appears once learned); the setting «Подсказки» is in the pause menu too.
 * Run: node --test tests/e2e/pause-spells.test.mjs   (ZNS_SHOT=1 also saves docs/ui/pause-spells.jpg)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8176;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

const allNames = (page) => page.evaluate(async () => {
    const out = [];
    for (const b of [...document.querySelectorAll('#pause-spell-cats .sub-tab')].map((x) => x.textContent)) {
        [...document.querySelectorAll('#pause-spell-cats .sub-tab')].find((x) => x.textContent === b).click();
        out.push(...[...document.querySelectorAll('#pause-spells-grid .item-name')].map((e) => e.textContent));
    }
    return out;
});

test('pause menu in Survival: only the spells the hero knows; «Подсказки» setting', async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1600, height: 900 } });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#pause-menu:not(.hidden)');
    assert.equal(await page.evaluate(() => document.querySelector('[data-pause-tab="pause-spells"]').hidden), false, 'the tab is there');
    assert.ok(await page.$('#pause-hints-mode'), '«Подсказки» in the pause menu');
    await page.click('[data-pause-tab="pause-spells"]');
    const before = await allNames(page);
    assert.ok(before.some((n) => n.startsWith('Инферно')), 'a spell known without a scroll');
    assert.ok(!before.some((n) => n.startsWith('Тандервейв')), 'a scroll spell not learned yet: not listed');
    assert.ok(!before.some((n) => n.startsWith('Флайн')), 'no flight before the flying book');
    // learned from its scroll: listed at once
    await page.evaluate(() => { const g = window.__zns.game; g.bonus = { ...(g.bonus || {}), spells: { ...(g.bonus?.spells || {}), Thunderwave: true } }; });
    await page.click('[data-pause-tab="pause-main"]');
    await page.click('[data-pause-tab="pause-spells"]');
    const after = await allNames(page);
    assert.ok(after.some((n) => n.startsWith('Тандервейв')), 'learned: listed');
    assert.ok(after.length < 80, `only some of the spells: ${after.length}`);
    if (process.env.ZNS_SHOT) {
        await page.evaluate(() => [...document.querySelectorAll('#pause-spell-cats .sub-tab')][0].click());
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(ROOT, 'docs/ui/pause-spells.jpg'), type: 'jpeg', quality: 85 });
        await page.click('[data-pause-tab="pause-main"]');
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(ROOT, 'docs/ui/pause-hints-setting.jpg'), type: 'jpeg', quality: 85 });
    }
});
