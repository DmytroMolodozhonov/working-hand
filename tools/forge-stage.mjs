#!/usr/bin/env node
/** «Create a Cauldron» phase by phase (tools/forge/stage.html): the armour on the ground, gathering, glowing, melting, cast, cooled. */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch } from '../tests/e2e/harness.mjs';
const OUT = process.argv[2] || 'shots/forge-stage';
fs.mkdirSync(OUT, { recursive: true });
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 4 * 60 * 1000);
const srv = await startServer(8187);
const browser = await launch({ viewport: { width: 720, height: 480 } });
try {
    const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    await page.goto(srv.url + '/tools/forge/stage.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    const shot = async (name, js) => { await page.evaluate(js); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log(name); };
    await shot('0-armour', 'window.__F.shot()');
    await shot('1-gather', 'window.__F.cast(); window.__F.run(0.9)');
    await shot('2-heat', 'window.__F.run(1.4)');
    await shot('3-melt', 'window.__F.run(1.1)');
    await shot('4-cast', 'window.__F.run(1.0)');
    await shot('5-cool', 'window.__F.run(1.0)');
    await shot('6-done', 'window.__F.run(1.4)');
} finally { clearTimeout(killer); await browser.close(); srv.stop(); }
