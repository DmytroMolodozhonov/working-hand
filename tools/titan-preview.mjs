// A quick stand for the titans' bodies (TitanModels.js) — no game, seconds instead of minutes: each titan on a patch of its planet's
// ground under a sun, three cameras (front, three-quarter, close), saved to docs/media/shots/titan-preview/<look>-<view>.png.
//   node tools/titan-preview.mjs [mercury,venus,…]
// (the real portraits on the planets themselves: node tools/shot.mjs titans)
import { startServer, launch } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('docs/media/shots/titan-preview');
fs.mkdirSync(OUT, { recursive: true });
const only = (process.argv[2] || '').split(',').filter(Boolean);
// poses: node tools/titan-preview.mjs iron '[{"name":"forge","act":"forge","a":0.4,"site":[0,-0.35]}]'
const POSES = process.argv[3] ? JSON.parse(process.argv[3]) : null;
const srv = await startServer(8790 + Math.floor(Math.random() * 90));
const browser = await launch({ viewport: { width: 960, height: 540 } });
const kill = setTimeout(() => { console.log('timeout'); process.exit(2); }, 10 * 60 * 1000);
try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
    await page.goto(srv.url + 'index.html'.replace('index.html', '') + 'tools/titan-preview.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const ids = only.length ? only : ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    for (const id of ids) {
        const shots = POSES ? POSES.map((p) => [p.name, p.view || 'three', p]) : [['front', 'front', null], ['three', 'three', null], ['close', 'close', null]];
        for (const [name, view, pose] of shots) {
            const url = await page.evaluate(([i, v, p]) => window.__shoot(i, v, p), [id, view, pose]);
            fs.writeFileSync(path.join(OUT, `${id}-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
        }
        console.log('📷', id);
    }
} finally {
    clearTimeout(kill);
    await browser.close();
    srv.stop();
}
