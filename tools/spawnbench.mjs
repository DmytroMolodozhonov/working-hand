#!/usr/bin/env node
/**
 * spawnbench.mjs — вход в Творческий с выбранным «Где появиться» (жалоба автора: «У Ледяной Королевы» — в игру не зайти).
 *   node tools/spawnbench.mjs [--spot queen] [--seeds 20261015,7] [--gen 20] [--ice-arena 1|0] [--wait 300] [--after 40]
 * Печатает: ошибки консоли и pageerror, где встал герой, твёрдая ли земля под ним. Код выхода 1 — были ошибки или герой не встал.
 */
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SPOT = opt('spot', 'queen'), GEN = opt('gen', null), WAIT = +opt('wait', '300'), AFTER = +opt('after', '40');
const SEEDS = opt('seeds', '20261015').split(',').map(Number);
const ARENA = opt('ice-arena', null);
const srv = await startServer(8900 + Math.floor(Math.random() * 100));
const browser = await launch();
let bad = 0;
try {
    for (const seed of SEEDS) {
        const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 640, height: 360 } });
        await page.evaluate((a) => {
            const z = window.__zns, cfg = { ...z.readConfig(), mode: 'creative', map: null, seed: a.seed, zombieCount: 0 };
            cfg.hero = { ...(cfg.hero || {}), spawn: a.SPOT };
            if (a.GEN) cfg.gen = +a.GEN;
            if (a.ARENA != null) cfg.iceArena = a.ARENA === '1';
            z.startGame(cfg);
        }, { seed, SPOT, GEN, ARENA });
        const t0 = Date.now(); let placed = false, info = null;
        while ((Date.now() - t0) / 1000 < WAIT) {
            info = await page.evaluate(() => { const g = window.__zns.game; if (!g || !g.active) return null; const p = g.character.group.position; return { frames: g.frameCount, pending: !!g.heroApply?.pending, x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), toast: g.hud?.lastToast || null }; }).catch(() => null);
            if (info && info.frames > 3 && !info.pending && (Math.abs(info.x) > 50 || Math.abs(info.z) > 50)) { placed = true; break; }
            await sleep(500);
        }
        await sleep(AFTER * 1000);
        const end = await page.evaluate(() => { const g = window.__zns.game, p = g.character.group.position; return { x: Math.round(p.x), y: +p.y.toFixed(1), z: Math.round(p.z), vy: g.character.verticalVelocity, hp: g.combat?.hp }; }).catch((e) => ({ err: String(e) }));
        const errs = errors.filter((e) => !/ERR_TUNNEL|ERR_NAME|XNNPACK|Web Speech|AudioContext|favicon|WebGL|GPU stall|GL Driver/i.test(e));
        console.log(`seed ${seed}: placed=${placed} start=${JSON.stringify(info)} end=${JSON.stringify(end)} ошибок=${errs.length}`);
        for (const e of errs.slice(0, 10)) console.log('   ' + e.slice(0, 300));
        if (!placed || errs.length) bad++;
        await page.close();
    }
} finally { await browser.close(); srv.close?.(); }
process.exit(bad ? 1 : 0);
