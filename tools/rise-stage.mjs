#!/usr/bin/env node
/** A villager jolted and getting up (tools/rise/stage.html): frames every 0.15 s from lying to standing, glued into one strip per throw. */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch } from '../tests/e2e/harness.mjs';
const OUT = process.argv[2] || 'shots/rise-stage';
const FAR = process.argv.includes('--far');
fs.mkdirSync(OUT, { recursive: true });
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 8 * 60 * 1000);
const srv = await startServer(8185);
const browser = await launch({ viewport: { width: 260, height: 300 } });
try {
    const page = await browser.newPage({ viewport: { width: 260, height: 300 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
    await page.goto(srv.url + '/tools/rise/stage.html');
    await page.waitForFunction(() => window.__R && window.__ready, null, { timeout: 60000 });
    for (const [n, seed, yaw, ang] of [[1, 3, 0.3, 0.0], [2, 5, 2.0, 2.4], [3, 7, -1.0, 4.1]]) {
        await page.evaluate(([seed, yaw, ang, far]) => { window.__R.setup(seed, yaw, far); window.__R.jolt(ang, 22); }, [seed, yaw, ang, FAR]);
        // lie down first (falling + lying), then frames through the getting up
        let st = await page.evaluate(() => window.__R.step(1.0));
        let guard = 0;
        while (st !== 'rising' && guard++ < 200) st = await page.evaluate(() => window.__R.step(0.1));
        await page.evaluate(() => window.__R.step(-0)); 
        for (let f = 0; f < 22; f++) {
            const info = await page.evaluate(() => { const r = window.__R; r.step(0.15); return r.shot(0.9); });
            await page.screenshot({ path: path.join(OUT, `t${n}-${String(f).padStart(2, '0')}.png`) });
            if (f % 5 === 0) console.log(n, f, JSON.stringify(info));
        }
    }
} finally { clearTimeout(killer); await browser.close(); srv.stop(); }
