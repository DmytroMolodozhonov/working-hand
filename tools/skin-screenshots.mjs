/**
 * Pictures of the hero, the standard model and the «Реалистичный» one side by side (tools/skin-view.html):
 *   node tools/skin-screenshots.mjs [--out docs/media] [--size 420] [--only front,side] [--set name:query …]
 * Each picture: docs/media/skin-<name>-<model>.png (small PNGs for the author to compare with himself).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(ROOT, arg('out', 'docs/media'));
const SIZE = +arg('size', 420);
const SETS = {
    front: 'cam=front', side: 'cam=side', back: 'cam=back', three: 'cam=three&pose=armup',
    face: 'cam=face', smile: 'cam=face&face=smile', surprise: 'cam=face&face=surprise', blink: 'cam=face&face=blink', o: 'cam=face&face=o', angry: 'cam=face&face=angry', faceside: 'cam=faceside',
    fist: 'cam=hand&pose=fist', point: 'cam=hand&pose=point', open: 'cam=hand&pose=reach',
    crouch: 'cam=three&pose=crouch', walk: 'cam=side&pose=walk', tpose: 'cam=front&pose=tpose',
};
const only = arg('only', '') ? arg('only').split(',') : Object.keys(SETS);
const extra = process.argv.filter((a, i) => process.argv[i - 1] === '--set');
for (const e of extra) { const [n, qs] = e.split(':'); SETS[n] = qs; only.push(n); }
const models = (arg('models', 'real,std')).split(',');

const port = 8700 + Math.floor(Math.random() * 200);
const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ZNS_CHROME || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
    for (const name of only) {
        for (const model of models) {
            const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
            const errs = [];
            page.on('pageerror', (e) => errs.push(String(e)));
            page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
            await page.goto(`http://127.0.0.1:${port}/tools/skin-view.html?model=${model}&w=${SIZE}&h=${SIZE}&${SETS[name]}${arg('q') ? '&' + arg('q') : ''}`);
            await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
            await page.evaluate(() => window.__shot());
            const file = path.join(OUT, `skin-${name}-${model}.png`);
            await page.locator('canvas').screenshot({ path: file });
            console.log(file, errs.length ? 'ERR ' + errs.join(' | ').slice(0, 400) : '');
            await page.close();
        }
    }
} finally {
    await browser.close();
    srv.kill();
}
