/** Снимок поля «Битвы существ» со стартовой камеры (полоса, горка, кольца). Run: ZNS_START_TIMEOUT=600000 node --test tests/e2e/brawl-field-shot.test.mjs */
import test from 'node:test';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';
const PORT = Number(process.env.ZNS_TEST_PORT) || 8203;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });
test('brawl field shot', { timeout: 1700000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'brawl');
    await waitHudVisible(page, 120000).catch(() => {});
    await page.evaluate(async () => { const g = window.__zns.game, sleep = (ms) => new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 600 && !g.brawl?._stripBuilt; i++) await sleep(100); await sleep(8000); });
    await page.screenshot({ path: process.env.SHOT_OUT || 'docs/media/brawl-field.png' });
});
