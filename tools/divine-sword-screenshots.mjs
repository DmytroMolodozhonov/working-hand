/**
 * Pictures of the divine sword beside the plain one (tools/divine-view.html): node tools/divine-sword-screenshots.mjs [--out docs/media]
 * → docs/media/divine-sword-<name>.png and the sizes of both (Box3, metres).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(ROOT, arg('out', 'docs/media'));
const SETS = { day: 'cam=side', night: 'cam=side&night=1', blade: 'cam=close&night=1', hilt: 'cam=hilt', far: 'cam=far&night=1' };
const port = 8900 + Math.floor(Math.random() * 90);
const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ZNS_CHROME || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
    for (const [name, qs] of Object.entries(SETS)) {
        const page = await browser.newPage({ viewport: { width: 560, height: 560 } });
        const errs = [];
        page.on('pageerror', (e) => errs.push(String(e)));
        page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
        await page.goto(`http://127.0.0.1:${port}/tools/divine-view.html?w=560&h=560&${qs}`);
        await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
        await page.evaluate(() => window.__shot());
        if (name === 'day') console.log('sizes (m):', JSON.stringify(await page.evaluate(() => window.__sizes)));
        const file = path.join(OUT, `divine-sword-${name}.png`);
        await page.locator('canvas').screenshot({ path: file });
        console.log(file, errs.length ? 'ERR ' + errs.join(' | ').slice(0, 400) : '');
        await page.close();
    }
} finally { await browser.close(); srv.kill(); }
