// Pictures of the magic interface (src/ui/MagicUi.js + magic-ui.css): the main menu over the living whirl, and the pause (Escape) window.
// Usage: node tools/magicui-screenshots.mjs [--out docs/media]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8797)));
const exe = process.env.ZNS_CHROME || undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const kill = setTimeout(() => { console.error('timeout'); process.exit(2); }, 240000);
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.addInitScript(() => { globalThis.__muHQ = true; });
    await page.goto(srv.url);
    await page.waitForSelector('#main-menu .mu-whirl', { timeout: 60000 });
    await page.waitForTimeout(2500);
    // a stroke of the cursor and a click: the trail, the burst, the ring through the whirl
    for (let i = 0; i <= 14; i++) { await page.mouse.move(380 + i * 40, 600 - i * 12); await page.waitForTimeout(16); }
    await page.hover('.tab-btn[data-tab="tab-spells"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(out, 'magic-ui-menu.png') });
    console.log('saved menu');
    // the pause over the game (here: over the whirl alone)
    await page.evaluate(() => { document.getElementById('main-menu').classList.add('hidden'); document.getElementById('pause-menu').classList.remove('hidden'); });
    await page.waitForTimeout(1600);
    const b = await page.locator('#pause-continue-btn').boundingBox();
    for (let i = 0; i <= 10; i++) { await page.mouse.move(b.x - 200 + i * 30, b.y + 120 - i * 10); await page.waitForTimeout(16); }
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2);
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(out, 'magic-ui-pause.png') });
    console.log('saved pause');
} finally {
    clearTimeout(kill);
    await browser.close();
    srv.stop?.(); srv.proc?.kill?.();
}
process.exit(0);
