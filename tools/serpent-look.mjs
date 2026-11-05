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
    // the hero stands still (the fire held where it is); a camera above and aside sees the whole serpent
    await page.evaluate(() => {
        const g = window.__zns.game, h = g.hellfire.state, me = g.character.group.position.clone(), hc = h.c.clone();
        window.__me = me;
        const hold = () => { g.character.group.position.copy(me); g.character.verticalVelocity = 0; if (g.hellfire.state) g.hellfire.state.c.copy(hc); };
        window.__hold = setInterval(hold, 5);
        const orig = g._updateCamera.bind(g), V = g.camera.position.constructor;
        g._updateCamera = (dt) => { orig(dt); const c = window.__cam; if (c) { g.camera.position.set(...c[0]); g.camera.lookAt(new V(...c[1])); } };
    });
    const look = (n, cam) => page.evaluate(async ([n, cam]) => {
        const g = window.__zns.game, s = g.fireSerpent.mine, me = window.__me;
        const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20));
        if (!s) return { gone: true, log: g.fireSerpent.log.slice(-6) };
        const c = s.lead.clone().lerp(me, 0.4);
        // cam: [distance back, height] — from my side, looking at the middle between me and it
        const dx = me.x - s.lead.x, dz = me.z - s.lead.z, l = Math.hypot(dx, dz) || 1;
        window.__cam = [[c.x + dx / l * cam[0] + dz / l * cam[0] * 0.5, c.y + cam[1], c.z + dz / l * cam[0] - dx / l * cam[0] * 0.5], [c.x, c.y + 4, c.z]];
        const f2 = g.frameCount; while (g.frameCount < f2 + 2) await new Promise((r) => setTimeout(r, 20));
        return { walked: Math.round(s.walked), i0: s.i0, mode: s.mode, lift: +s.lift.toFixed(2), head: [s.head.x, s.head.y, s.head.z].map((v) => +v.toFixed(1)), lead: [s.lead.x, s.lead.z].map((v) => +v.toFixed(1)), me: [me.x, me.z].map((v) => +v.toFixed(1)), hp: Math.round(s.hp), fx: g.fireSerpent.pool?.active, log: g.fireSerpent.log.slice(-3) };
    }, [n, cam]);
    console.log('pouring', JSON.stringify(await look(40, [70, 45])));
    await shoot('1-pouring');
    console.log('out', JSON.stringify(await look(260, [110, 70])));
    await shoot('2-out-wide');
    console.log('crawl', JSON.stringify(await look(200, [60, 25])));
    await shoot('3-crawl');
    // the head close: from the side, a little above it
    console.log('head', JSON.stringify(await page.evaluate(() => { const g = window.__zns.game, s = g.fireSerpent.mine, h = s.head, f = s.face; window.__cam = [[h.x + f.z * 26 + f.x * 18, h.y + 6, h.z - f.x * 26 + f.z * 18], [h.x, h.y, h.z]]; return true; })));
    await frames(3);
    await shoot('4-head');
    // ravage a place
    console.log('sweep', JSON.stringify(await page.evaluate(() => { const g = window.__zns.game, s = g.fireSerpent.mine, me = window.__me; if (!s) return null; s.point = { x: me.x + 45, y: me.y, z: me.z + 20 }; s.mode = 'sweep'; s.modeT = 0; return true; })));
    console.log('sweeping', JSON.stringify(await look(300, [90, 60])));
    await shoot('5-sweep');
    // water on it: «Firefighting Maxima» (the douse, held 2 s)
    console.log('douse', JSON.stringify(await page.evaluate(() => { const g = window.__zns.game, s = g.fireSerpent.mine; if (!s) return null; for (let i = 0; i < 40; i++) g.fireSerpent.douse(() => true, 0.05); return { hp: Math.round(s.hp), fade: s.fade }; })));
    await frames(20);
    await shoot('6-doused');
    console.log('end', JSON.stringify(await page.evaluate(() => window.__zns.game.fireSerpent.log.slice(-6))));
} finally {
    clearTimeout(killer);
    await browser.close();
    srv.stop();
}
