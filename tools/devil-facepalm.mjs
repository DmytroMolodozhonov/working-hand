// Кадры фейспалма Дьяволоса для окна «Пропустить обучение» (main.js tutorialGate): node tools/devil-facepalm.mjs [--test]
// Стенд — tools/devil-view.html (тот же, что у devil-screenshots.mjs); кадры → assets/ui/devil-facepalm-N.webp.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const test = process.argv.includes('--test');
const out = path.join(ROOT, 'assets/ui');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); s.end(b); }); }).listen(0);
const port = srv.address().port;
const CAM = process.env.CAM || '-10,100,-175', LOOK = process.env.LOOK || '0,88,0'; // (a wide view, cropped: a narrow one loses the model — its bounds)
const K = test ? [0.1, 0.5] : [0, 0.06, 0.12, 0.18, 0.24, 0.3, 0.42, 0.55];
const br = await chromium.launch({ executablePath: process.env.ZNS_CHROME || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const killer = setTimeout(() => { console.log('timeout'); process.exit(2); }, 15 * 60 * 1000);
try {
    const page = await br.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => console.error('page:', e.message));
    fs.mkdirSync(out, { recursive: true });
    for (let i = 0; i < K.length; i++) {
        const t = 1 + K[i] * 3.6;
        await page.goto(`http://localhost:${port}/tools/devil-view.html?heat=0.6&cam=${CAM}&look=${LOOK}&act=facepalm&ak=${K[i]}&mood=angry&t=${t}`);
        await page.waitForFunction(() => window.__done, null, { timeout: 120000 });
        const png = path.join(test ? '/tmp' : out, `devil-facepalm-${i}.png`);
        await page.screenshot({ path: png });
        execFileSync('python3', ['-c', `from PIL import Image; Image.open('${png}').crop((450, 100, 830, 480)).resize((360, 360), Image.LANCZOS).save('${png.replace('.png', '.webp')}', quality=80)`]);
        if (!test) fs.unlinkSync(png);
        console.log('кадр', i, K[i]);
    }
} finally { clearTimeout(killer); await br.close(); srv.close(); }
