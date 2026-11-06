// Picture of «🔍 Поиск» (CodexSearch.js) in the main menu: node tools/search-screenshot.mjs [--out docs/media/search.png] (ZNS_CHROME=/path)
import { startServer, launch } from '../tests/e2e/harness.mjs';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const srv = await startServer(Number(arg('--port', 8870)));
const browser = await launch();
const guard = setTimeout(() => process.exit(1), 120000);
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(srv.url);
    await page.waitForSelector('#main-menu .tab-btn.active', { state: 'visible', timeout: 60000 }); await page.waitForTimeout(2000); // (the page's script must have started)
    await page.fill('#menu-search', 'зелье крепкого');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.resolve(arg('--out', 'docs/media/search.png')) });
    await page.fill('#menu-search', 'дракон');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.resolve(arg('--out2', 'docs/media/search-dragon.png')) });
} finally { clearTimeout(guard); await browser.close(); srv.stop?.(); }
process.exit(0);
