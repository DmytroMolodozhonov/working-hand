#!/usr/bin/env node
/**
 * sunken-screenshots.mjs — pictures of the sea's bottom secrets (SunkenWorld.js): a wreck and the sunken temple, seen under the water.
 * Run:  node tools/sunken-screenshots.mjs [--out dir] [--seed N]
 * The browser and the server always close (finally); a global timeout ends a hung run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, waitHudVisible } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'shots/sunken');
const SEED = parseInt(opt('seed', '777'), 10);
fs.mkdirSync(OUT, { recursive: true });
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 30 * 60 * 1000);

const srv = await startServer(Number(opt('port', '8175')));
const browser = await launch({ viewport: { width: 960, height: 540 } });
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 960, height: 540 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    await page.waitForFunction(() => window.__zns?.startGame, null, { timeout: 120000 });
    await page.evaluate((seed) => { const z = window.__zns; z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed, zombieCount: 0, graphics: '3', viewDistance: 'high' }); }, SEED);
    await waitHudVisible(page, Number(process.env.ZNS_START_TIMEOUT || 300000));
    const shoot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('📸', name); };
    const frames = (n) => page.evaluate(async (n) => { const g = window.__zns.game; const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); }, n);
    // the sites near the nearest sea, nearest first; each: its land made, then its fit asked
    const found = await page.evaluate(async () => {
        const g = window.__zns.game, S = await import('/src/game/SunkenSites.js');
        const me = g.character.group.position, sea = g.sea.index.nearest(me.x, me.z, 8);
        const list = [];
        S.sunkenSitesNear(sea.x, sea.z, Math.min(4000, sea.r0 + 400), g.seed, (s) => list.push(s));
        list.sort((a, b) => Math.hypot(a.x - sea.x, a.z - sea.z) - Math.hypot(b.x - sea.x, b.z - sea.z));
        const out = {};
        for (const s of list) {
            if (out[s.kind]) continue;
            if (Math.hypot(s.x - sea.x, s.z - sea.z) > sea.r0 + 100) continue;
            g.world.terrain.flushAround?.(s.x, s.z);
            const t0 = performance.now();
            let fit;
            while (performance.now() - t0 < 20000) {
                let pend = false;
                fit = S.siteFits(s, (x, z) => { const w = g.sunken._seaAt(x, z); if (w === undefined) pend = true; return w || null; });
                if (!pend) break;
                await new Promise((r) => setTimeout(r, 100));
            }
            if (fit) out[s.kind] = { ...s, fit };
            if (out.wreck && out.temple) break;
        }
        return { sea: { x: sea.x, z: sea.z, r0: sea.r0 }, n: list.length, out };
    });
    console.log(JSON.stringify(found));
    for (const kind of ['wreck', 'temple']) {
        const s = found.out[kind];
        if (!s) { console.log('no', kind, 'fits near this sea'); continue; }
        const views = kind === 'temple' ? [[30, 0, 6, 'front'], [24, 2.4, 9, 'side'], [9, 0, 3.5, 'door']] : [[34, 0.6, 5, 'side'], [20, 2.2, 9, 'bow'], [12, -0.9, 3, 'deck']];
        for (const [d, a, up, name] of views) {
            await page.evaluate(([s, d, a, up]) => {
                const g = window.__zns.game, yaw = s.yaw + (s.kind === 'temple' ? 0 : Math.PI / 2) + a;
                const x = s.x + Math.sin(yaw) * d, z = s.z + Math.cos(yaw) * d, y = s.fit.top + up;
                const hold = () => { g.character.group.position.set(x, y, z); g.character.verticalVelocity = 0; g.character.group.rotation.y = Math.atan2(-(s.x - x), -(s.z - z)); };
                clearInterval(window.__hold); window.__hold = setInterval(hold, 5); hold();
                g.smoothHead && (g.smoothHead.pitch = -0.2);
            }, [s, d, a, up]);
            await frames(150);
            await shoot(kind + '-' + name);
        }
    }
} finally {
    clearTimeout(killer);
    await browser.close();
    srv.stop();
}
