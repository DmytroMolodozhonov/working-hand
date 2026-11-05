#!/usr/bin/env node
/** The fire serpent alone on a plain field (tools/serpent/stage.html): shots of its shape — pouring out, lying, crawling, its head. */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch } from '../tests/e2e/harness.mjs';
const OUT = process.argv[2] || 'shots/serpent-stage';
fs.mkdirSync(OUT, { recursive: true });
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 10 * 60 * 1000);
const srv = await startServer(8183);
const browser = await launch({ viewport: { width: 1000, height: 560 } });
try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
    await page.goto(srv.url + '/tools/serpent/stage.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    // cam: 'head' — beside the head; 'all' — the whole body in the frame, from `side` (an angle) at `elev` (rad)
    const shot = async (name, n, cam, side = 0.6, elev = 0.45) => {
        const info = await page.evaluate(([n, cam, side, elev]) => {
            const S = window.__S, s = S.fs.mine, V = S.THREE.Vector3; S.step(n);
            if (cam === 'head') {
                const f = s.face, sx = f.z, sz = -f.x; // (its side)
                S.cam.position.set(s.head.x + sx * 34 + f.x * 18, s.head.y + 6, s.head.z + sz * 34 + f.z * 18); S.cam.lookAt(s.head);
            } else {
                const b = new S.THREE.Box3(); for (let i = s.i0; i < s.p.length; i++) b.expandByPoint(s.p[i]); b.expandByPoint(s.head);
                const c = b.getCenter(new V()), R = b.getSize(new V()).length() * 0.62 + 10;
                S.cam.position.set(c.x + Math.cos(side) * Math.cos(elev) * R * 1.25, c.y + Math.sin(elev) * R * 1.25, c.z + Math.sin(side) * Math.cos(elev) * R * 1.25); S.cam.lookAt(c);
            }
            S.draw();
            return { walked: Math.round(s.walked), mode: s.mode, head: [s.head.x, s.head.y, s.head.z].map((v) => +v.toFixed(1)), lead: [s.lead.x, s.lead.z].map((v) => +v.toFixed(1)) };
        }, [n, cam, side, elev]);
        await page.screenshot({ path: path.join(OUT, name + '.png') });
        console.log(name, JSON.stringify(info));
    };
    await shot('1-pouring', 60, 'all', 0.6, 0.5);
    await shot('2-out', 240, 'all', 0.6, 0.6);
    await shot('3-crawl', 400, 'all', 2.2, 0.35);
    await shot('4-head', 20, 'head');
    await shot('5-later', 600, 'all', 4, 0.5);
    // at dusk (the fire against a dark sky, as in the film)
    await page.evaluate(() => { const S = window.__S, s = S.fs.mine; S.scene.background.set(0x10131c); S.scene.fog.color.set(0x10131c); S.scene.children.forEach((o) => { if (o.isHemisphereLight) o.intensity = 0.15; }); S.step(30); const f = s.face; S.cam.position.set(s.head.x + f.z * 40 + f.x * 30, s.head.y + 4, s.head.z - f.x * 40 + f.z * 30); S.cam.lookAt(s.head.x, s.head.y - 2, s.head.z); S.draw(); });
    await page.screenshot({ path: path.join(OUT, '7-night-head.png') });
    // as the hero sees it: from his eyes, 3.4 m up
    await page.evaluate(() => { const S = window.__S, s = S.fs.mine; S.cam.position.set(0, 3.4, 0); S.cam.lookAt(s.head.x, 6, s.head.z); S.draw(); });
    await page.screenshot({ path: path.join(OUT, '6-hero-eyes.png') });
    // right at it (the author's shot: bitten / held — the camera almost in its body): nothing may white the screen out
    await page.evaluate(() => { const S = window.__S, s = S.fs.mine, k = Math.max(s.i0, s.p.length - 12), q = s.p[k]; S.cam.position.set(q.x + 4, q.y + 3, q.z + 4); S.cam.lookAt(s.head); S.draw(); });
    await page.screenshot({ path: path.join(OUT, '8-close.png') });
    await page.evaluate(() => { const S = window.__S, s = S.fs.mine; S.cam.position.set(s.head.x + s.face.x * 3, s.head.y + 1, s.head.z + s.face.z * 3); S.cam.lookAt(s.head.x - s.face.x * 10, s.head.y, s.head.z - s.face.z * 10); S.draw(); });
    await page.screenshot({ path: path.join(OUT, '9-in-jaws.png') });
} finally { clearTimeout(killer); await browser.close(); srv.stop(); }
