#!/usr/bin/env node
/**
 * sea-look.mjs — how the sea's surface looks (SeaSurface.js): from the shore, out at sea away from and against the sun, in a gale,
 * from under the water looking up. Run:  node tools/sea-look.mjs [--out dir] [--seed N]
 * The browser and the server always close (finally); a global timeout ends a hung run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, waitHudVisible } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'shots/sea-look');
const SEED = parseInt(opt('seed', '777'), 10);
fs.mkdirSync(OUT, { recursive: true });
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 25 * 60 * 1000);

const srv = await startServer(Number(opt('port', '8176')));
const browser = await launch({ viewport: { width: 960, height: 540 } });
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 960, height: 540 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    page.on('console', (m) => { if (m.type() === 'error' && /shader|GLSL|program/i.test(m.text())) console.error('console', m.text().slice(0, 400)); });
    await page.waitForFunction(() => window.__zns?.startGame, null, { timeout: 120000 });
    await page.evaluate((seed) => { const z = window.__zns; z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed, zombieCount: 0, graphics: '3', viewDistance: 'high' }); }, SEED);
    await waitHudVisible(page, Number(process.env.ZNS_START_TIMEOUT || 300000));
    const shoot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('📸', name); };
    const sea = await page.evaluate(() => { const g = window.__zns.game, me = g.character.group.position, s = g.sea.index.nearest(me.x, me.z, 8); return { x: s.x, z: s.z, r0: s.r0 }; });
    // put the hero at (x, z), `up` m over the water, looking along `yaw` (or at the sun: 'sun' / away: 'away'), the head pitched
    const at = (x, z, up, look, pitch, wind = null) => page.evaluate(async ([x, z, up, look, pitch, wind]) => {
        const g = window.__zns.game;
        if (wind != null) { g.weatherClock = null; g._windOverride = wind; }
        g.world.terrain.flushAround?.(x, z);
        const U = (await import('/src/fx/UltraUniforms.js')).ULTRA;
        const sd = U.sunDir.value;
        const yaw = look === 'sun' ? Math.atan2(-sd.x, -sd.z) : look === 'away' ? Math.atan2(sd.x, sd.z) : look;
        const hold = () => { g.character.group.position.set(x, -0.6 + 2 + up, z); g.character.verticalVelocity = 0; g.character.group.rotation.y = yaw; if (g.smoothHead) g.smoothHead.pitch = pitch; };
        clearInterval(window.__hold); window.__hold = setInterval(hold, 5); hold();
        const f = g.frameCount; while (g.frameCount < f + 110) await new Promise((r) => setTimeout(r, 20));
    }, [x, z, up, look, pitch, wind]);
    const a = 0.7, sx = sea.x + Math.cos(a) * (sea.r0 - 30), sz = sea.z + Math.sin(a) * (sea.r0 - 30);
    await at(sx, sz, 5, Math.atan2(-(sea.x - sx), -(sea.z - sz)), -0.12); await shoot('1-shore');
    const mx = sea.x + Math.cos(a) * sea.r0 * 0.4, mz = sea.z + Math.sin(a) * sea.r0 * 0.4;
    await at(mx, mz, 4, 'away', -0.18); await shoot('2-open-away-from-sun');
    await at(mx, mz, 4, 'sun', -0.08); await shoot('3-open-against-sun');
    await at(mx, mz, 12, 'away', -0.45); await shoot('4-looking-down');
    await page.evaluate(() => { const g = window.__zns.game; g.sea.storm = 1.8; const up = g._updateWind.bind(g); g._updateWind = () => { up(); g.sea.storm = 1.8; }; });
    await at(mx, mz, 6, 'away', -0.15); await shoot('5-gale');
    await page.evaluate(() => { const g = window.__zns.game; g.sea.storm = 0.2; g._updateWind = () => { g.sea.storm = 0.2; }; });
    await at(mx, mz, -6, 'away', 0.9); await shoot('6-under-looking-up');
    // the sky: noon looking up, the sunset against the sun over the sea, the night
    const setPhase = (want) => page.evaluate(async (want) => {
        const g = window.__zns.game, W = await import('/src/world/World.js');
        let best = 0, bd = 9;
        for (let p = 0; p < 1; p += 0.001) { const e = W.sunAt(p, new (await import('three')).Vector3()); const d = Math.abs(e - want.elev) + (want.rising === undefined ? 0 : 0); if (d < bd && (want.after == null || p > want.after)) { bd = d; best = p; } }
        g.dayPhase = () => best; g.world.setDayPhase(best);
        return best;
    }, want);
    await page.evaluate(() => { const g = window.__zns.game; g.sea.storm = 0.3; g._updateWind = () => { g.sea.storm = 0.3; }; });
    await setPhase({ elev: 0.9 }); await at(mx, mz, 4, 'away', 0.75); await shoot('7-sky-noon-up');
    await setPhase({ elev: 0.06, after: 0.4 }); await at(mx, mz, 4, 'sun', 0.05); await shoot('8-sunset-sea');
    await at(mx, mz, 4, 'away', 0.25); await shoot('9-sunset-away');
    await setPhase({ elev: -0.6 }); await at(mx, mz, 4, 'away', 0.5); await shoot('10-night');
} finally {
    clearTimeout(killer);
    await browser.close();
    srv.stop();
}
