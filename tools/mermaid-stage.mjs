#!/usr/bin/env node
/** The hero with the mermaid's tail on a plain stage (tools/mermaid/stage.html): side, front, back, mid-stroke. */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch } from '../tests/e2e/harness.mjs';
const OUT = process.argv[2] || 'shots/mermaid-stage';
fs.mkdirSync(OUT, { recursive: true });
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 5 * 60 * 1000);
const srv = await startServer(8184);
const browser = await launch({ viewport: { width: 700, height: 800 } });
try {
    const page = await browser.newPage({ viewport: { width: 700, height: 800 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    await page.goto(srv.url + '/tools/mermaid/stage.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    const shot = async (name, type, hue, ang, sweep = 0, tilt = 0, land = false) => {
        await page.evaluate(([type, hue, ang, sweep, tilt, land]) => {
            const M = window.__M; M.use(type, hue); M.tail.set(true, sweep, land); M.ch.group.rotation.x = -tilt;
            M.ch.group.updateMatrixWorld(true);
            const b = new M.THREE.Box3().setFromObject(M.ch.group), c = b.getCenter(new M.THREE.Vector3()), R = b.getSize(new M.THREE.Vector3()).length();
            M.cam.position.set(c.x + Math.sin(ang) * R * 1.05, c.y + R * 0.12, c.z + Math.cos(ang) * R * 1.05); M.cam.lookAt(c); M.draw();
        }, [type, hue, ang, sweep, tilt, land]);
        await page.screenshot({ path: path.join(OUT, name + '.png') });
        console.log('📸', name);
    };
    await shot('1-classic-34', 'classic', 0.5, Math.PI * 0.72);
    await shot('2-veil-34', 'veil', 0.92, Math.PI * 0.72);
    await shot('3-shark-side', 'shark', 0.6, Math.PI / 2);
    await shot('4-classic-swim', 'classic', 0.08, Math.PI / 2, 0.7, 1.35);
    await shot('5-veil-land', 'veil', 0.75, Math.PI * 0.6, 0.05, 0, true);
    await shot('6-front-join', 'classic', 0.33, Math.PI);
} finally { clearTimeout(killer); await browser.close(); srv.stop(); }
