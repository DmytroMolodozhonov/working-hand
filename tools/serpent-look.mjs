#!/usr/bin/env node
/**
 * serpent-look.mjs — the fire serpent of «Let the Hellfire Come» (FireSerpent.js) in the real game: the Hellfire is lit, «Serpent» called,
 * then shots of it rising, standing over its fire, ravaging a place; the log of its events and any errors. Run: node tools/serpent-look.mjs [--out dir]
 * The browser and the server always close (finally); a global timeout ends a hung run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, waitHudVisible } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'shots/serpent-look');
fs.mkdirSync(OUT, { recursive: true });
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 40 * 60 * 1000);
const srv = await startServer(Number(opt('port', '8181')));
const browser = await launch({ viewport: { width: 960, height: 540 } });
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 960, height: 540 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message, e.stack?.slice(0, 400)));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text().slice(0, 400)); });
    await page.waitForFunction(() => window.__zns?.startGame, null, { timeout: 120000 });
    await page.evaluate(() => { const z = window.__zns; z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: 777, zombieCount: 0, graphics: '3', viewDistance: 'normal' }); });
    await waitHudVisible(page, 600000);
    const shoot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000 }); console.log('📸', name); };
    const frames = (n) => page.evaluate(async (n) => { const g = window.__zns.game, f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); }, n);
    // the Hellfire, then the serpent
    const r1 = await page.evaluate(() => { const g = window.__zns.game; g.character.isArmRaised = () => true; const a = g.hellfire.cast(true); return { a, st: !!g.hellfire.state }; });
    console.log('hellfire', JSON.stringify(r1));
    await frames(6);
    const r2 = await page.evaluate(() => { const g = window.__zns.game; const a = g.fireSerpent.cast(true); const s = g.fireSerpent.mine; return { a, mine: !!s, anchor: s && [s.anchor.x, s.anchor.y, s.anchor.z].map((v) => +v.toFixed(1)) }; });
    console.log('serpent', JSON.stringify(r2));
    // the hero steps back to see it whole (the fire stays where it is: we hold it there)
    const back = (d, n) => page.evaluate(async ([d, n]) => {
        const g = window.__zns.game, s = g.fireSerpent.mine, h = g.hellfire.state;
        if (!s || !h) return { gone: true, log: g.fireSerpent.log.slice(-6) };
        const A = s.anchor.clone(), me = g.character.group.position;
        const dx = me.x - A.x, dz = me.z - A.z, l = Math.hypot(dx, dz) || 1;
        const x = A.x + dx / l * d, z = A.z + dz / l * d;
        const hc = h.c.clone();
        const hold = () => { g.character.group.position.set(x, g.collision.groundY(x, z) + 2.2, z); g.character.verticalVelocity = 0; g.character.group.rotation.y = Math.atan2(x - A.x, z - A.z); h.c.copy(hc); };
        clearInterval(window.__hold); window.__hold = setInterval(hold, 5); hold();
        const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20));
        return { grow: +s.grow.toFixed(2), mode: s.mode, head: [s.p[s.p.length - 1].x, s.p[s.p.length - 1].y, s.p[s.p.length - 1].z].map((v) => +v.toFixed(1)), hp: Math.round(s.hp), log: g.fireSerpent.log.slice(-4) };
    }, [d, n]);
    console.log('rising', JSON.stringify(await back(45, 4)));
    await shoot('1-rising');
    console.log('risen', JSON.stringify(await back(55, 14)));
    await shoot('2-risen');
    // ravage a place
    console.log('sweep', JSON.stringify(await page.evaluate(() => { const g = window.__zns.game, s = g.fireSerpent.mine; if (!s) return null; s.point = { x: s.anchor.x + 12, y: s.anchor.y, z: s.anchor.z + 6 }; s.mode = 'sweep'; s.modeT = 0; return true; })));
    console.log('sweeping', JSON.stringify(await back(55, 10)));
    await shoot('3-sweep');
    // water on it: «Firefighting Maxima» (the douse, held 2 s)
    console.log('douse', JSON.stringify(await page.evaluate(() => { const g = window.__zns.game, s = g.fireSerpent.mine; if (!s) return null; for (let i = 0; i < 40; i++) g.fireSerpent.douse(() => true, 0.05); return { hp: Math.round(s.hp), fade: s.fade }; })));
    await frames(6);
    await shoot('4-doused');
    console.log('end', JSON.stringify(await page.evaluate(() => window.__zns.game.fireSerpent.log.slice(-6))));
} finally {
    clearTimeout(killer);
    await browser.close();
    srv.stop();
}
