/** «Flashlight» before/after pictures: node tools/flashlight-screenshots.mjs → docs/media/flashlight-<scene>-<old|new>.png */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/media');
const port = 8900 + Math.floor(Math.random() * 100);
const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
    for (const scene of ['cave', 'night', 'wall']) for (const mode of ['old', 'new']) {
        const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
        page.on('pageerror', (e) => console.log('ERR', String(e)));
        await page.goto(`http://127.0.0.1:${port}/tools/flashlight-view.html?mode=${mode}&scene=${scene}`);
        await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
        await page.screenshot({ path: path.join(OUT, `flashlight-${scene}-${mode}.png`) });
        await page.close();
    }
} finally { await browser.close(); srv.kill(); }
