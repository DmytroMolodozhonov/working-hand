// Бой с Дьяволосом в НАСТОЯЩЕЙ игре (ад, воркеры): игрок в ~100 м от его места (за цепью), потом в ~45 м (в досягаемости);
// разбудили — посекундно: где он, какой ход, сколько прошёл; итог — путь, ходы, попытки хвата.
// Usage: ZNS_CHROME=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node tools/devil-fightbench.mjs [--sec 40]
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEC = Number(arg('--sec', 40));
const srv = await startServer(Number(arg('--port', 8198)));
const browser = await launch({});
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative').catch(async (e) => { if (!/Timeout/.test(e.message)) throw e; await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 600000 }); });
    await waitHudVisible(page, 180000);
    const r = await page.evaluate(async (SEC) => {
        const g = window.__zns.game, d = g.terrain.data, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const s = d.hellPlan.spawn;
        g.heroApply.pending = { id: 'hell', age: 0, far: true, hold: null, origin: null, cells: null, t: { x: s.x, z: s.z, layer: s.y, up: 3, down: 3, yaw: 0 } };
        for (let i = 0; i < 3000 && g.heroApply.pending; i++) await sleep(100);
        for (let i = 0; i < 300 && !g.diabolos.d; i++) await sleep(100);
        const dv = g.diabolos, D = dv.d, cx = dv.site.cx, cz = dv.site.cz;
        const ux = (s.x - cx) / Math.hypot(s.x - cx, s.z - cz), uz = (s.z - cz) / Math.hypot(s.x - cx, s.z - cz);
        const put = async (r) => { g.heroApply.pending = { id: 'p', age: 0, far: true, hold: null, origin: null, cells: null, t: { x: cx + ux * r, z: cz + uz * r, layer: 15, up: 40, down: 40, yaw: 0 } }; for (let i = 0; i < 3000 && g.heroApply.pending; i++) await sleep(100); };
        g.combat.maxHp = g.combat.hp = 1e6;
        const out = { phases: [] };
        for (const [name, rr] of [['далеко (за цепью)', 150], ['близко (в досягаемости)', 95]]) {
            await put(rr);
            await sleep(1500);
            dv.log.length = 0;
            dv.boltHit(dv.d, 'Bombardo', g.localId);
            const E = dv.d, t0 = E.t, tr = []; let path = 0, px = E.x, pz = E.z, last = -1;
            while (E.t - t0 < SEC) { await sleep(150); if (g.combat.hp < 1e5) g.combat.hp = 1e6; path += Math.hypot(E.x - px, E.z - pz); px = E.x; pz = E.z; const k = Math.floor(E.t - t0); if (k !== last && k % 3 === 0) { last = k; const me = g.character.group.position; tr.push([k, E.mode, E.move?.id || '-', Math.round(Math.hypot(me.x - E.x, me.z - E.z)), Math.round(path), +E.strain.toFixed(1)]); } }
            out.phases.push({ name, path: Math.round(path), moves: dv.log.map((l) => /ход (\w+)/.exec(l)?.[1]).filter(Boolean), says: dv.log.filter((l) => /говорит/.test(l)).length, trace: tr });
        }
        return out;
    }, SEC);
    console.log(JSON.stringify(r));
} finally { await browser.close(); srv.stop(); }
