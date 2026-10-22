#!/usr/bin/env node
/**
 * ultra-screenshots.mjs — pictures of «Ультра качество» next to the usual mode (the same place,
 * the same moments: day, sunset, night, rain). Run:  node tools/ultra-screenshots.mjs [out dir]
 *   --seed 20261015   --size 1280x720   --only day,night
 */
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const out = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : 'ultra-shots');
const SEED = parseInt(opt('seed', '20261015'), 10);
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const ONLY = opt('only', null)?.split(',');
fs.mkdirSync(out, { recursive: true });

// moments: day phase (0 dawn … 0.5 sunset … 1), where to look (yaw), rain
const MOMENTS = [
    { name: 'day', phase: 0.2, yaw: 0.6 },
    { name: 'sun', elev: 0.3, yaw: 0, faceSun: true },
    { name: 'sunset', elev: 0.05, yaw: 0, faceSun: true },
    { name: 'night', phase: 0.88, yaw: 2.2 },
    { name: 'rain', phase: 0.25, yaw: 1.4, rain: true },
].filter((m) => !ONLY || ONLY.includes(m.name));

const srv = await startServer(8600 + Math.floor(Math.random() * 300));
const browser = await launch();
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: W, height: H } });
    await page.evaluate(({ SEED }) => {
        const z = window.__zns;
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: SEED, zombieCount: 0, graphics: '3', viewDistance: 'medium' });
    }, { SEED });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 120000 });
    await sleep(3000);
    await page.evaluate(() => { const st = document.createElement('style'); st.textContent = '#hud, #hud * { display: none !important; } #fps-counter { display: none !important; }'; document.head.appendChild(st); });
    // away from the start's pedestals: a meadow nearby
    await page.evaluate(({ at }) => {
        const g = window.__zns.game, p = g.character.group.position;
        p.x += at[0]; p.z += at[1];
        p.y = g.collision.groundY(p.x, p.z) + 0.05;
    }, { at: opt('at', '70,-40').split(',').map(Number) });
    await sleep(4000);
    for (const m of MOMENTS) {
        for (const ultra of [false, true]) {
            if (m.elev != null && m.phase == null) {
                // (the afternoon moment when the sun stands that high)
                m.phase = await page.evaluate(async (elev) => {
                    const { sunAt } = await import('/src/world/World.js');
                    let best = 0.5, bd = 9;
                    for (let p = 0.3; p < 0.75; p += 0.001) { const e = sunAt(p); if (Math.abs(e - elev) < bd) { bd = Math.abs(e - elev); best = p; } }
                    return best;
                }, m.elev);
            }
            await page.evaluate(({ m, ultra }) => {
                const g = window.__zns.game;
                g.dayPhase = () => m.phase;
                g.world.setDayPhase(m.phase);
                if (m.rain) g.storm?.startRain?.(); else if (g.storm) { g.storm.rainUntil = 0; g.storm.until = 0; }
                g.ultra.set(ultra);
                if (ultra && m.rain) { const U = g.ultra; U.update(0); } // (soaked at once for the picture)
                let yaw = m.yaw;
                if (m.faceSun) { const s = g.world.sky.uniforms.uSunDir.value; yaw = Math.atan2(-s.x, -s.z); }
                g.cameraBaseRotation = yaw; g.smoothBody = yaw; g.character.setBodyRotation(yaw);
            }, { m, ultra });
            if (ultra && m.rain) await page.evaluate(async () => { const { ULTRA } = await import('/src/fx/UltraUniforms.js'); window.__wet = setInterval(() => { ULTRA.wet.value = 1; }, 50); });
            await sleep(ultra ? 6000 : 2500); // (the lawn round the hero is made a little a frame)
            await page.screenshot({ path: path.join(out, `${m.name}-${ultra ? 'ultra' : 'standard'}.png`) });
            if (ultra && m.rain) await page.evaluate(() => clearInterval(window.__wet));
        }
    }
    const info = await page.evaluate(() => { const g = window.__zns.game; return { programs: g.renderer.info.programs.length, prewarmed: g.prewarmedPrograms, late: g.renderer.info.programs.slice(g.prewarmedPrograms).map((p) => p.name + ' ' + String(p.cacheKey).slice(0, 160)), grass: g.ultra.grass?.stats, hdr: g.ultra.post?.hdr }; });
    console.log(JSON.stringify(info));
    const bad = errors.filter((e) => !/AudioContext|favicon|ERR_|GPU stall|GL Driver/i.test(e));
    if (bad.length) console.log('errors:', bad.slice(0, 8));
} finally {
    await browser.close();
    srv.stop();
}
console.log('saved to', out);
