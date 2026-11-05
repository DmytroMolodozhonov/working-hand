#!/usr/bin/env node
/** Cuts on a villager and their pieces (tools/cut/stage.html): the arm, the leg, the head, a slanted cut; the pieces laid beside. */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch } from '../tests/e2e/harness.mjs';
const OUT = process.argv[2] || 'shots/cut-stage';
fs.mkdirSync(OUT, { recursive: true });
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 5 * 60 * 1000);
const srv = await startServer(8186);
const browser = await launch({ viewport: { width: 700, height: 560 } });
try {
    const page = await browser.newPage({ viewport: { width: 700, height: 560 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
    await page.goto(srv.url + '/tools/cut/stage.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    const shot = async (name, fn, ang, dist, h) => { const r = await page.evaluate(([fn, ang, dist, h]) => { const C = window.__C; const out = new Function('C', fn)(C); C.shot(ang, dist, h); return out; }, [fn, ang, dist, h]); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log(name, JSON.stringify(r)); };
    await shot('0-whole', "C.reset(3)", 0, 9, 2.5);
    await shot('1-arm-front', "C.reset(3); const a = C.cut('leftArm', 0.6); C.layPieces(); C.anim(); return a", 0, 9, 2.5);
    await shot('2-arm-side', "", Math.PI / 2, 6, 3);
    await shot('3-leg', "C.reset(3); const a = C.cut('rightLeg', 0.7); C.layPieces(); C.anim(); return a", 0, 9, 2.5);
    await shot('4-head', "C.reset(3); const a = C.cut('head', 0); C.layPieces(); C.anim(); return a", 0, 9, 3);
    await shot('5-slant', "C.reset(5, 'knight'); const a = C.cut('rightArm', 0.4, [0.5, -0.8, 0.2]); C.layPieces(); C.anim(); return a", 0, 8, 3);
    await shot('6-all', "C.reset(7); for (const n of ['head','leftArm','rightArm','leftLeg','rightLeg']) C.cut(n, n === 'head' ? 0 : 0.5); C.layPieces(); C.anim(); return true", 0.3, 13, 4);
    await shot('8-far-arm', "C.reset(3, 'farmer', true); const a = C.cut('leftArm', 0.6); C.layPieces(); C.anim(); return a", 0, 9, 2.5);
    await shot('9-far-all', "C.reset(7, 'farmer', true); for (const n of ['head','leftArm','rightArm','leftLeg','rightLeg']) C.cut(n, n === 'head' ? 0 : 0.5); C.layPieces(); C.anim(); return true", 0.3, 13, 4);
    await shot('p0-before', "C.reset(4, 'farmer', true); C.anim(0.2); return true", 0.4, 14, 5);
    await shot('p1-burst', "return C.burst()", 0.4, 14, 5);
    await shot('p2-0.15s', "C.run(0.15)", 0.4, 14, 5);
    await shot('p3-0.4s', "C.run(0.25)", 0.4, 14, 5);
    await shot('p4-1s', "C.run(0.6)", 0.4, 16, 6);
    await shot('p5-3s', "C.run(2)", 0.4, 18, 8);
    await shot('7-stump-close', "C.reset(3); C.cut('leftArm', 0.5); C.anim(); return true", 1.0, 3.5, 3.6);
} finally { clearTimeout(killer); await browser.close(); srv.stop(); }
