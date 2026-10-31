// Снимки Дьяволоса: node tools/devil-screenshots.mjs [--out docs/media] — стенд tools/devil-view.html (сервер — на этом же процессе).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(ROOT, 'docs/media');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); s.end(b); }); }).listen(0);
const port = srv.address().port;
const SHOTS = {
    'devil-sleep': { pose: { sit: 1, sleep: 1, eyes: 0.04 }, heat: 0.2, cam: '-150,45,-170', look: '0,35,0' },
    'devil-stand': { pose: { face: { brow: -1, snarl: 0.7, ear: -0.6, nostril: 0.8, pupil: 0.6 }, jaw: 0.3 }, heat: 0.8, cam: '-170,50,-230', look: '0,65,0' },
    'devil-tongue': { pose: { face: { brow: 0.4, browL: 0.5, lidR: 0.4, tongue: 1, wag: 1, ear: 0.6 }, jaw: 0.75 }, heat: 0.6, cam: '-25,108,-60', look: '0,104,-12' },
    'devil-face': { pose: { face: { brow: -1, snarl: 1, ear: -1, nostril: 1, pupil: 0.5 }, jaw: 0.5, maw: 1 }, heat: 1, cam: '18,112,-55', look: '0,106,-12' },
    'devil-act-tongue': { act: 'tongueTaunt', ak: 0.5, t: 1.3, heat: 0.6, cam: '-30,110,-70', look: '0,103,-10' },
    'devil-act-laugh': { act: 'laugh', ak: 0.5, heat: 0.6, cam: '-120,80,-170', look: '0,85,0' },
    'devil-act-chainpull': { act: 'chainPull', ak: 0.45, heat: 1, cam: '150,50,-140', look: '0,55,0' },
    'devil-act-beckon': { act: 'beckon', ak: 0.5, t: 0.4, heat: 0.6, cam: '-90,90,-170', look: '0,90,0' },
    'devil-act-teeth': { act: 'pickTeeth', ak: 0.5, heat: 0.4, mood: 'calm', cam: '-40,108,-80', look: '0,100,-10' },
    'devil-death-shock': { death: 0.6, cam: '-120,90,-150', look: '0,80,0' },
    'devil-death-agony': { death: 4, cam: '-140,80,-170', look: '0,75,0' },
    'devil-death-fall': { death: 11, cam: '-130,60,-160', look: '0,55,0' },
    'devil-death-ash': { death: 16.5, cam: '-150,70,-180', look: '0,60,0' },
    'devil-grab': { grab: 6, cam: '-80,110,-150', look: '0,100,0' },
    'devil-chain': { pose: { strain: 1, lean: 1, face: { brow: -1, snarl: 1, ear: -1 }, jaw: 0.8, armL: { raise: 0.6 }, armR: { raise: 0.6 } }, heat: 1, cam: '140,30,-120', look: '-10,30,20' },
};
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const br = await chromium.launch({ executablePath: process.env.ZNS_CHROME || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await br.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.error('page:', e.message));
page.on('console', (m) => console.error('console:', m.type(), m.text()));
page.on('requestfailed', (r) => console.error('req:', r.url()));
page.on('response', (r) => { if (r.status() >= 400) console.error('404:', r.url()); });
fs.mkdirSync(out, { recursive: true });
for (const [name, s] of Object.entries(SHOTS)) {
    if (only && !name.includes(only)) continue;
    const heat = s.heat ?? 0.7; const u = `http://localhost:${port}/tools/devil-view.html?pose=${encodeURIComponent(JSON.stringify(s.pose || {}))}&heat=${heat}&cam=${s.cam}&look=${s.look}${s.act ? `&act=${s.act}&ak=${s.ak}&mood=${s.mood || 'angry'}` : ''}${s.t != null ? `&t=${s.t}` : ''}${s.death != null ? `&death=${s.death}` : ''}${s.grab != null ? `&grab=${s.grab}` : ''}`;
    await page.goto(u);
    await page.waitForFunction(() => window.__done, null, { timeout: 120000 });
    await page.screenshot({ path: path.join(out, name + '.png') });
    console.log('снимок', name);
}
await br.close(); srv.close();
