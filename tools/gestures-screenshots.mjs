// A contact sheet of the talk gestures (docs/media/gestures-<prefix>.png): four characters (a trader, a knight, a king, a mage) × four
// moments (joy and a show, anger, a start back at fear, laughter). Run it on two checkouts to see the difference: `--root <dir>` serves
// that checkout (for «before», `git worktree add /tmp/old <commit>`), `--prefix before|after`.
// Usage: node tools/gestures-screenshots.mjs [--root .] [--prefix after] [--out docs/media] [--port 8793]
import { launch } from '../tests/e2e/harness.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = path.resolve(arg('--root', '.'));
const out = path.resolve(arg('--out', 'docs/media'));
const prefix = arg('--prefix', 'after');
const port = Number(arg('--port', 8793));
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.resolve('tools/gestures-view.html'), path.join(root, 'tools/gestures-view.html'));
const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 920, height: 1200 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/tools/gestures-view.html`);
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    const url = await page.evaluate(() => window.render());
    fs.writeFileSync(path.join(out, `gestures-${prefix}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log('written', path.join(out, `gestures-${prefix}.png`), errs.length ? errs : '');
} finally { await browser.close(); srv.kill(); }
