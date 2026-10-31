// «Вид с точки появления в аду в сторону Дьяволоса» — в НАСТОЯЩЕЙ игре (воркеры, туман ада, загрузка Дьяволоса).
// Usage: node tools/devil-arrival-screenshot.mjs [--out docs/media] [--port 8197]
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const near = Number(arg('--near', 0)); // (м от Дьяволоса: 0 — с точки прибытия)
const name = arg('--name', 'devil-arrival');
const up = Number(arg('--up', 0)); // (м над полом)
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8197)));
const browser = await launch({});
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1400, height: 800 } });
    await startFromMenu(page, 'creative').catch(async (e) => { if (!/Timeout/.test(e.message)) throw e; await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 600000 }); });
    await waitHudVisible(page, 180000);
    const info = await page.evaluate(async ([NEAR, UP]) => {
        const g = window.__zns.game, d = g.terrain.data, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const P = d.hellPlan, s = P.spawn, H = (await import('/src/world/HellMap.js')).HELL;
        g.heroApply.pending = { id: 'hell', age: 0, far: true, hold: null, origin: null, cells: null, t: { x: s.x, z: s.z, layer: s.y, up: 3, down: 3, yaw: Math.atan2(H.CX - s.x, H.CZ - s.z) } };
        for (let i = 0; i < 3000 && g.heroApply.pending; i++) await sleep(100);
        for (let i = 0; i < 300 && !(g.diabolos.model && g.world.hell > 0.95); i++) await sleep(100);
        await sleep(4000);
        if (NEAR > 0 && g.diabolos.d) {
            const dv = g.diabolos.d, dx = s.x - dv.x, dz = s.z - dv.z, L = Math.hypot(dx, dz);
            const x = dv.x + dx / L * NEAR, z = dv.z + dz / L * NEAR;
            if (UP > 0) { g.flight?.start?.(); }
            g.heroApply.pending = { id: 'near', age: 0, far: true, hold: null, origin: null, cells: null, t: { x, z, layer: 15, up: 40, down: 40, yaw: 0 } };
            for (let i = 0; i < 3000 && g.heroApply.pending; i++) await sleep(100);
            if (UP > 0) { g.character.group.position.y += UP; g.character.verticalVelocity = 0; }
            await sleep(5000);
        }
        const me = g.character.group.position, dv = g.diabolos.d;
        return { me: [me.x, me.y, me.z].map(Math.round), devil: dv ? [dv.x, dv.y, dv.z].map(Math.round) : null, dist: dv ? Math.round(Math.hypot(dv.x - me.x, dv.z - me.z)) : null, loaded: !!g.diabolos.model, hell: g.world.hell, fogFar: Math.round(g.world.scene.fog.far), proxK: g.diabolos._proxK, spawn: s };
    }, [near, up]);
    console.log(JSON.stringify(info));
    // смотрим на Дьяволоса: камера героя поворачивается к нему, чуть вверх
    await page.evaluate(async (PITCH) => {
        const g = window.__zns.game, dv = g.diabolos.d, me = g.character.group.position, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        if (!dv) return;
        const yaw = Math.atan2(-(dv.x - me.x), -(dv.z - me.z));
        for (let i = 0; i < 30; i++) {
            if (g.character.group) g.character.group.rotation.y = yaw;
            if (g.cameraCtl) { g.cameraCtl.yaw = yaw; g.cameraCtl.pitch = PITCH; }
            if (g.player) { g.player.yaw = yaw; g.player.pitch = PITCH; }
            if ('yaw' in g) g.yaw = yaw;
            if (g.smoothHead) g.smoothHead.pitch = PITCH;
            await sleep(50);
        }
        await sleep(1500);
    }, near > 0 ? 0.35 : 0.04);
    await page.screenshot({ path: path.join(out, name + '.png') });
    console.log('→', path.join(out, name + '.png'));
} finally { await browser.close(); srv.stop(); }
