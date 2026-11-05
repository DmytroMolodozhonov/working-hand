#!/usr/bin/env node
/**
 * under-look.mjs — the underwater world (UnderwaterLight, SeaFloor, ReefFish, SeaCritters, the generation-24 seabed): shots under the
 * sea by day (shallow, deep, looking up at the sun's shafts, along the bottom) and at night. Run: node tools/under-look.mjs [--out dir] [--seed N]
 * The browser and the server always close (finally); a global timeout ends a hung run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, waitHudVisible } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'shots/under-look');
const SEED = parseInt(opt('seed', '777'), 10);
fs.mkdirSync(OUT, { recursive: true });
const killer = setTimeout(() => { console.error('timeout'); process.exit(2); }, 25 * 60 * 1000);

const srv = await startServer(Number(opt('port', '8177')));
const browser = await launch({ viewport: { width: 960, height: 540 } });
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 960, height: 540 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    page.on('console', (m) => { if (m.type() === 'error' && /shader|GLSL|program|WebGL/i.test(m.text())) console.error('console', m.text().slice(0, 600)); });
    await page.waitForFunction(() => window.__zns?.startGame, null, { timeout: 120000 });
    await page.evaluate((seed) => { const z = window.__zns; z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed, zombieCount: 0, graphics: '3', viewDistance: 'high' }); }, SEED);
    await waitHudVisible(page, Number(process.env.ZNS_START_TIMEOUT || 300000));
    const shoot = async (name) => { const fps = await page.evaluate(async () => { const g = window.__zns.game, f = g.frameCount, t = performance.now(); await new Promise((r) => setTimeout(r, 2500)); return ((g.frameCount - f) / ((performance.now() - t) / 1000)).toFixed(1); }); await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000 }); console.log('📸', name, 'fps', fps); };
    const sea = await page.evaluate(() => { const g = window.__zns.game, me = g.character.group.position, s = g.sea.index.nearest(me.x, me.z, 8); return { x: s.x, z: s.z, r0: s.r0, gen: g.gen }; });
    console.log('sea', JSON.stringify(sea));
    // the hero held at (x, z), `under` m below the surface, looking along yaw with the head pitched
    const at = (x, z, under, yaw, pitch, frames = 12) => page.evaluate(async ([x, z, under, yaw, pitch, frames]) => {
        const g = window.__zns.game;
        const d = g.world.terrain.data, top = d.topLayer(Math.round(x), Math.round(z));
        under = Math.min(under, Math.max(1.5, -top - 4)); // (never into the bottom)
        g.world.terrain.flushAround?.(x, z);
        if (!window.__seaAt || Math.hypot(window.__seaAt[0] - x, window.__seaAt[1] - z) > 60) { g.seaSurface?.flush?.(x, z); window.__seaAt = [x, z]; } // (the sea's surface made at once for the new place)
        const hold = () => { g.character.group.position.set(x, -0.2 - under - 1.6, z); g.character.verticalVelocity = 0; g.character.group.rotation.y = yaw; if (g.smoothHead) g.smoothHead.pitch = pitch; };
        clearInterval(window.__hold); window.__hold = setInterval(hold, 5); hold();
        const f = g.frameCount; while (g.frameCount < f + frames) await new Promise((r) => setTimeout(r, 20));
        return { fish: g.seaFloor?.reef?.count, crabs: g.seaFloor?.critters?.count('crab'), turtles: g.seaFloor?.critters?.count('tBody'), under: g.swim?.eyeUnder, depth: g.underwaterLight?.depth };
    }, [x, z, under, yaw, pitch, frames]);
    const setPhase = (elev) => page.evaluate(async (elev) => {
        const g = window.__zns.game, W = await import('/src/world/World.js'), T = await import('three');
        let best = 0, bd = 9;
        for (let p = 0; p < 1; p += 0.001) { const e = W.sunAt(p, new T.Vector3()); if (Math.abs(e - elev) < bd) { bd = Math.abs(e - elev); best = p; } }
        g.dayPhase = () => best; g.world.setDayPhase(best);
    }, elev);
    await setPhase(0.8);
    // real sea: points out from the shore (the sea's signed distance) — shallow, the shelf, the deep
    const spots = await page.evaluate(() => {
        const g = window.__zns.game, S = g.world.terrain.data.seas, me = g.character.group.position, out = [];
        for (const want of [40, 110, 260]) {
            let best = null;
            for (let r = 50; r < 3000 && !best; r += 25) for (let a = 0; a < 6.28 && !best; a += 0.2) { const x = me.x + Math.cos(a) * r, z = me.z + Math.sin(a) * r; const d = S.signedDist(x, z); if (Math.abs(d - want) < 12) best = [x, z]; }
            if (best) out.push(best);
        }
        return out;
    });
    console.log('spots', JSON.stringify(spots));
    let i = 0;
    for (const [x, z] of spots) {
        i++;
        console.log(i, JSON.stringify(await at(x, z, 3, 0.4, -0.25, 25)));
        await shoot(`${i}a-shallow-down`);
        console.log(JSON.stringify(await at(x, z, 8, 2.0, -0.05, 8)));
        await shoot(`${i}b-along`);
        console.log(JSON.stringify(await at(x, z, 10, 4.0, 0, 8)));
        await shoot(`${i}c-deep`);
    }
    await setPhase(-0.5);
    await at(spots[1][0], spots[1][1], 6, 1.0, -0.2); await shoot('9-night');
} finally {
    clearTimeout(killer);
    await browser.close();
    srv.stop();
}
