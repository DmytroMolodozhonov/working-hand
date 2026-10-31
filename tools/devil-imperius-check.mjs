// «Империус Максима» в Дьяволоса в НАСТОЯЩЕЙ игре: вселиться (как после удачного броска), «бежать на месте», повернуться, ударить —
// сколько он прошёл; снимки: из-за спины и из его глаз. Usage: ZNS_CHROME=... node tools/devil-imperius-check.mjs [--out docs/media]
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const srv = await startServer(Number(arg('--port', 8199)));
const browser = await launch({});
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 640, height: 400 } });
    await startFromMenu(page, 'creative').catch(async (e) => { if (!/Timeout/.test(e.message)) throw e; await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 600000 }); });
    await waitHudVisible(page, 180000);
    const r1 = await page.evaluate(async () => {
        const g = window.__zns.game, d = g.terrain.data, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const s = d.hellPlan.spawn;
        g.heroApply.pending = { id: 'hell', age: 0, far: true, hold: null, origin: null, cells: null, t: { x: s.x, z: s.z, layer: s.y, up: 3, down: 3, yaw: 0 } };
        for (let i = 0; i < 3000 && g.heroApply.pending; i++) await sleep(100);
        for (let i = 0; i < 300 && !g.diabolos.d; i++) await sleep(100);
        const D = g.diabolos.d, dx = s.x - D.x, dz = s.z - D.z, L = Math.hypot(dx, dz);
        g.heroApply.pending = { id: 'near', age: 0, far: true, hold: null, origin: null, cells: null, t: { x: D.x + dx / L * 130, z: D.z + dz / L * 130, layer: 15, up: 40, down: 40, yaw: 0 } };
        for (let i = 0; i < 3000 && g.heroApply.pending; i++) await sleep(100);
        await sleep(2000);
        const im = g.imperius, rr = im.claim('dv', D.id, im.me, 'ImperiusMaxima');
        im.onTaken('dv', D.id, 'ImperiusMaxima', rr);
        for (let i = 0; i < 200 && im.phase !== 'on'; i++) await sleep(100);
        const p0 = { x: D.x, z: D.z, yaw: D.yaw };
        // «бежит на месте» 10 с игры
        const ch = g.character; let run = true;
        Object.defineProperty(ch, 'isRunning', { get: () => run, set() {}, configurable: true });
        Object.defineProperty(ch, 'runIntensity', { get: () => (run ? 0.8 : 0), set() {}, configurable: true });
        const t0 = D.t; while (D.t - t0 < 10) await sleep(100);
        run = false;
        const p1 = { x: D.x, z: D.z };
        return { ok: rr, phase: im.phase, kind: im.kind, walked: Math.round(Math.hypot(p1.x - p0.x, p1.z - p0.z)), walk: im.I.walk, mode: D.mode, eye: im._eye, imp: !!D.imp };
    });
    console.log(JSON.stringify(r1));
    await page.screenshot({ path: path.join(out, 'devil-imperius-back.png') });
    await page.evaluate(async () => { const g = window.__zns.game; g.cameraMode = 'fpv'; await new Promise((r) => setTimeout(r, 4000)); });
    await page.screenshot({ path: path.join(out, 'devil-imperius-eyes.png') });
    console.log('ok');
} finally { await browser.close(); srv.stop(); }
