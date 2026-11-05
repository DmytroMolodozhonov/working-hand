// Pictures of the loading's whirlpool passage (src/ui/PortalLoader.js): the pull over the menu, the passage (several palettes), the arrival.
// Usage: node tools/portal-screenshots.mjs [--out docs/media]
import { startServer } from '../tests/e2e/harness.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8796)));
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const kill = setTimeout(() => { console.error('timeout'); process.exit(2); }, 300000);
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(m.text()); });
    await page.goto(srv.url + '/tools/portal/stage.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
    const shot = async (name) => { await page.screenshot({ path: path.join(out, `loading-${name}.png`) }); console.log('saved', name); };
    const freeze = (ms) => page.waitForTimeout(ms);
    for (let k = 0; k < 3; k++) {
        await page.evaluate(() => { const P = window.__portal; P.start(document.getElementById('main-menu')); P.progress(8, 'Инициализация...'); });
        if (k === 0) { await freeze(700); await shot('pull'); }
        await freeze(2600);
        await page.evaluate((k) => window.__portal.progress([35, 62, 88][k], ['Прорисовка мира... 47%', 'Подготовка звуков... 80%', 'Компиляция шейдеров... 91%'][k]), k);
        await freeze(1500);
        await shot('passage-' + (k + 1));
        if (k === 2) { await page.evaluate(() => window.__portal.finish()); await freeze(1100); await shot('arrival'); await freeze(2400); }
        else { await page.evaluate(() => { const P = window.__portal; P.finish(); }); await freeze(2600); }
        await page.evaluate(() => { document.getElementById('main-menu').classList.remove('hidden'); });
    }
} finally {
    clearTimeout(kill);
    await browser.close();
    srv.stop?.(); srv.proc?.kill?.();
}
process.exit(0);
