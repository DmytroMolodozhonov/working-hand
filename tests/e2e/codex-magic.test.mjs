/**
 * «✨ Магия» in the main menu: the sections Заклинания / Зелья / Пентаграммы; the unlearned pentagrams show no picture.
 * Run: node --test tests/e2e/codex-magic.test.mjs  (a snapshot goes to $ZNS_SHOT_DIR if set)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('menu «Магия»: three sections, potions with recipes, pentagram cards without pictures for the unlearned', async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1180, height: 720 } });
    await page.click('.tab-btn[data-tab="tab-spells"]');
    const tabs = await page.$$eval('#magic-sections .sub-tab', (b) => b.map((x) => x.textContent));
    assert.deepEqual(tabs.map((t) => t.replace(/^\S+\s/, '')), ['Заклинания', 'Зелья', 'Пентаграммы']);
    assert.ok(await page.$$eval('#spells-grid .item-card', (c) => c.length) > 10);
    const shot = process.env.ZNS_SHOT_DIR;
    await page.click('#magic-sections .sub-tab:nth-child(2)');
    assert.equal(await page.$$eval('#potion-cats .sub-tab', (c) => c.length), 4);
    assert.ok(await page.$$eval('#potions-grid .potion-card', (c) => c.length) >= 3);
    if (shot) await page.screenshot({ path: `${shot}/magic-potions.png` });
    await page.click('#magic-sections .sub-tab:nth-child(3)');
    assert.ok(await page.$$eval('#pentagrams-grid .pent-card', (c) => c.length) >= 7);
    assert.ok(await page.$$eval('#pentagrams-grid .pent-svg', (c) => c.length) >= 7, 'the main menu: every drawing is shown');
    assert.equal(await page.$$eval('#pentagram-cats .sub-tab', (c) => c.length), 3);
    if (shot) await page.screenshot({ path: `${shot}/magic-pentagrams.png` });
    // a Survival hero: only the learned ones show the picture
    await page.evaluate(async () => { const m = await import('/src/ui/Codex.js'); m.renderPentagramsTab('pentagrams-grid', new Set(['devil', 'teleport', 'life'])); });
    assert.equal(await page.$$eval('#pentagrams-grid .pent-svg', (c) => c.length), 3);
    if (shot) { await page.locator('.pent-card.learned').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${shot}/magic-pentagrams-learned.png` }); }
});
