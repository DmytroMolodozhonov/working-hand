// Бой с Дьяволосом в НАСТОЯЩЕЙ игре: ад, игрок в ~110 м, разбудили — что он делает (ходы, ходьба, речь) за N секунд игры.
// Usage: ZNS_CHROME=... node tools/devil-fightbench.mjs [--sec 60] [--port 8198]
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEC = Number(arg('--sec', 60));
const srv = await startServer(Number(arg('--port', 8198)));
const browser = await launch({});
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 420, height: 260 } });
    await startFromMenu(page, 'creative').catch(async (e) => { if (!/Timeout/.test(e.message)) throw e; await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 600000 }); });
    await waitHudVisible(page, 180000);
    const r = await page.evaluate(async (SEC) => {
        const g = window.__zns.game, d = g.terrain.data, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const P = d.hellPlan, s = P.spawn;
        g.heroApply.pending = { id: 'hell', age: 0, far: true, hold: null, origin: null, cells: null, t: { x: s.x, z: s.z, layer: s.y, up: 3, down: 3, yaw: 0 } };
        for (let i = 0; i < 3000 && g.heroApply.pending; i++) await sleep(100);
        for (let i = 0; i < 300 && !g.diabolos.d; i++) await sleep(100);
        const dv = g.diabolos, D = dv.d;
        const ax = D.x, az = D.z;
        // к нему: 110 м, по дороге прибытия
        const dx = s.x - D.x, dz = s.z - D.z, L = Math.hypot(dx, dz);
        g.heroApply.pending = { id: 'near', age: 0, far: true, hold: null, origin: null, cells: null, t: { x: D.x + dx / L * 110, z: D.z + dz / L * 110, layer: 15, up: 40, down: 40, yaw: 0 } };
        for (let i = 0; i < 3000 && g.heroApply.pending; i++) await sleep(100);
        await sleep(3000);
        g.combat.maxHp = g.combat.hp = 1e6; // (не умирать)
        dv.log.length = 0;
        dv.boltHit(D, 'Bombardo', g.localId);
        const t0 = D.t; let path = 0, px = D.x, pz = D.z, frames = 0;
        while (D.t - t0 < SEC) { await sleep(200); path += Math.hypot(D.x - px, D.z - pz); px = D.x; pz = D.z; frames++; if (g.combat.hp < 1e5) g.combat.hp = 1e6; }
        const moves = dv.log.map((l) => /ход (\w+)/.exec(l)?.[1]).filter(Boolean);
        return { gameSec: Math.round(D.t - t0), realFrames: frames, path: Math.round(path), fromStart: Math.round(Math.hypot(D.x - ax, D.z - az)), moves, says: dv.log.filter((l) => /говорит/.test(l)).slice(0, 6), mode: D.mode, walkShare: +D.walkShare.toFixed(2), decisions: dv.log.filter((l) => /решение/.test(l)).slice(0, 8) };
    }, SEC);
    console.log(JSON.stringify(r, null, 1));
} finally { await browser.close(); srv.stop(); }
