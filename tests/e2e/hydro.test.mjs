/**
 * «Пентаграмма водяной силы» в настоящей игре: без дара «Waterbollow» вдали от воды не работает; шар воды у пруда → встали в круг (50 маны) → дар;
 * теперь «Waterbollow» работает и далеко от воды (из влажности воздуха); лёд дара не даёт.
 * Run: node --test tests/e2e/hydro.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8199;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('hydro: ice gives nothing; liquid water at the stand gives the gift; Waterbollow then works away from water', { timeout: 900000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    await startFromMenu(page, 'creative', { smooth: true }).catch(async (e) => {
        if (!/Timeout/.test(e.message)) throw e;
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 420000 });
    });
    await waitHudVisible(page, 120000);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const out = {};
        const { BLOCK } = await import('/src/world/Terrain.js');
        const data = g.world.terrain.data, p = g.character.group.position;
        // a pond right by the hero
        const cx = Math.round(p.x) + 3, cz = Math.round(p.z);
        for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) { const t = data.topLayer(cx + dx, cz + dz); for (let L = t - 3; L <= t; L++) data.set(cx + dx, L, cz + dz, BLOCK.WATER); }
        await sleep(800);
        const ctx = (hints) => ({ m: { x: p.x, y: p.y - 2, z: p.z, r: 3 }, pays: false, mana: 100, hint: (t) => hints.push(t), fx() {} });
        // 0) no water held: refused
        const h0 = []; out.noWater = g.hydro.useCircle(ctx(h0)); out.noWaterHint = h0[0] || '';
        // 1) the ball at the pond (the water spell itself), then ICE: refused
        g.water.state = null;
        out.start = g.water.start(); await sleep(400);
        out.ballHeld = !!g.water.state;
        if (g.water.state) { g.water.state.frozen = true; const h1 = []; out.iceGift = g.hydro.useCircle(ctx(h1)); out.iceHint = h1[0] || ''; g.water.state.frozen = false; }
        // 2) liquid: the gift
        const h2 = []; out.gift = g.hydro.useCircle(ctx(h2)); out.on = g.hydro.on;
        // 3) the ball is let go; far from any water, with the gift, the spell starts
        g.water.drop?.(); g.water.state = null; await sleep(300);
        const far = { x: p.x + 220, z: p.z + 220 };
        p.set(far.x, g.collision.groundY(far.x, far.z) + 2, far.z); await sleep(1500);
        const near = g.world.terrain.data.findWaterSurface(p.x, p.z, 6, p.y);
        out.nearWater = !!near;
        out.farStart = g.water.start(); await sleep(400);
        out.farBall = !!g.water.state;
        out.mistOrHumid = g.water.state ? { vol: g.water.state.volume } : null;
        // 4) without the gift the same place gives nothing
        g.water.drop?.(); g.water.state = null; g.hydro.on = false; await sleep(300);
        out.noGiftStart = g.water.start(); out.noGiftBall = !!g.water.state;
        return out;
    });
    console.log(JSON.stringify(r));
    assert.equal(r.noWater, false);
    assert.equal(r.ballHeld, true, 'the ball rose at the pond');
    assert.equal(r.iceGift, false, 'ice gives nothing');
    assert.equal(r.gift, true);
    assert.equal(r.on, true);
    assert.equal(r.nearWater, false, 'the test place is dry');
    assert.equal(r.farBall, true, 'with the gift Waterbollow works away from water');
    assert.equal(r.noGiftBall, false, 'without it — no');
});
