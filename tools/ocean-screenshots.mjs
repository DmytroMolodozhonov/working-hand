#!/usr/bin/env node
/**
 * ocean-screenshots.mjs — pictures of the sea update: the sea at a calm, a fresh breeze, a gale and a storm (SeaWind.js — the
 * waves, the white horses, the grey sea), and a waterspout in a storm (OceanStorm.js / WaterspoutFx.js).
 * Run:  node tools/ocean-screenshots.mjs [--out dir] [--seed N] [--underwater]
 * The browser and the server always close (finally); a global timeout ends a hung run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, waitHudVisible } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'shots/ocean');
const SEED = parseInt(opt('seed', '777'), 10);
fs.mkdirSync(OUT, { recursive: true });
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 12 * 60 * 1000);

const srv = await startServer(Number(opt('port', '8174')));
const browser = await launch({ viewport: { width: 960, height: 540 } });
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 960, height: 540 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    await page.waitForFunction(() => window.__zns?.startGame, null, { timeout: 120000 });
    await page.evaluate((seed) => { const z = window.__zns; z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed, zombieCount: 0, graphics: '3', viewDistance: 'high' }); }, SEED);
    await waitHudVisible(page, Number(process.env.ZNS_START_TIMEOUT || 300000));
    const shoot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('📸', name); };
    const prep = await page.evaluate(async (seed) => {
        const g = window.__zns.game;
        const O = await import('/src/world/OceanWeather.js');
        const W = await import('/src/world/SeaWind.js');
        const me = g.character.group.position;
        const idx = g.sea.index, sea = idx.nearest(me.x, me.z, 8);
        // the moments: calm, fresh, gale, storm with a spout on this sea
        const at = {};
        for (let t = 1e6; t < 1e6 + 86400 * 30 && !(at.calm && at.fresh && at.gale && at.spout); t += 20) {
            const L = W.windLevelSmooth(W.windAt(seed, t).speed);
            if (!at.calm && L < 1.8) at.calm = t;
            if (!at.fresh && L > 5 && L < 5.6) at.fresh = t;
            if (!at.gale && L > 7 && L < 7.6) at.gale = t;
            if (!at.spout && O.stormWeight(seed, t) >= 1) {
                const sp = O.spoutsOf(idx, sea, seed, t).find((s) => s.k > 0.8);
                if (sp) at.spout = { t, x: sp.x, z: sp.z };
            }
        }
        return { sea: { id: sea.id, x: sea.x, z: sea.z, r0: sea.r0 }, at };
    }, SEED);
    console.log(JSON.stringify(prep));
    const place = async (x, z, lookX, lookZ, up = 6) => page.evaluate(async ([x, z, lx, lz, up]) => {
        const g = window.__zns.game;
        g.world.terrain.flushAround?.(x, z);
        const y = Math.max(g.collision.groundY(x, z), -0.6) + 2 + up;
        const hold = () => { g.character.group.position.set(x, y, z); g.character.verticalVelocity = 0; g.character.group.rotation.y = Math.atan2(-(lx - x), -(lz - z)); };
        clearInterval(window.__hold); window.__hold = setInterval(hold, 5); hold();
        g.smoothHead && (g.smoothHead.pitch = 0.05);
        const f = g.frameCount; while (g.frameCount < f + 90) await new Promise((r) => setTimeout(r, 20));
    }, [x, z, lookX, lookZ, up]);
    // the sea's look by the wind: from the shore looking out
    const S = prep.sea;
    const a = 0.7, sx = S.x + Math.cos(a) * (S.r0 - 40), sz = S.z + Math.sin(a) * (S.r0 - 40);
    for (const k of ['calm', 'fresh', 'gale']) {
        await page.evaluate((t) => { window.__zns.game.weatherClock = t; }, prep.at[k]);
        await place(sx, sz, S.x, S.z, 8);
        await shoot('sea-' + k);
    }
    if (prep.at.spout) {
        const sp = prep.at.spout;
        await page.evaluate((t) => { window.__zns.game.weatherClock = t; }, sp.t);
        // 160 m off, between it and the sea's middle
        const dx = sp.x - S.x, dz = sp.z - S.z, l = Math.hypot(dx, dz) || 1;
        await place(sp.x - dx / l * 160, sp.z - dz / l * 160, sp.x, sp.z, 10);
        await page.evaluate(async () => { const g = window.__zns.game; const f = g.frameCount; while (g.frameCount < f + 120) await new Promise((r) => setTimeout(r, 20)); });
        await shoot('storm-spout');
        await place(sp.x - dx / l * 60, sp.z - dz / l * 60, sp.x, sp.z, 4);
        await shoot('storm-spout-near');
    }
} finally {
    clearTimeout(killer);
    await browser.close();
    srv.stop();
}
