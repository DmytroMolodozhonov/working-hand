/**
 * Маг воздуха в «Битве существ» колдует «Thunderwave» и «Lightning Strike» (автор 17.11): против группы зомби и мага огня ~60 с — что он колдует.
 * Run: ZNS_START_TIMEOUT=900000 node --test tests/e2e/brawl-air-sky.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8209;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the air mage says Thunderwave and Lightning Strike', { timeout: 1700000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    await page.addInitScript(() => { window.__ZNS_SHOT_FAST__ = true; });
    await page.reload(); await page.waitForFunction(() => !!window.__zns);
    await startFromMenu(page, 'brawl');
    await waitHudVisible(page, 120000).catch(() => {});
    const out = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        for (let i = 0; i < 300 && !g.terrain?.data?.landMade?.(0, 0); i++) await sleep(100);
        const B = g.brawl, L = g.castleLife, used = {};
        const air = B.spawn('air', 'A', -14, 0);
        B.spawn('supermage', 'B', 14, 0); B.spawn('zombie', 'B', 13, 3); B.spawn('zombie', 'B', 13, -3); // (a tough foe: the zombies alone died to his blades before a Thunderwave left his hands)
        await sleep(1500);
        const v = L.byId.get(air.id);
        B.start(); const ph = []; let t = 0;
        const sc = g.spells.cast.bind(g.spells); // (after start: the field's own log wraps the cast at the start of a fight)
        g.spells.cast = (name, o, d, s, by, ...r) => { if (by === v.id) used[name] = (used[name] || 0) + 1; return sc(name, o, d, s, by, ...r); };
        for (; t < 140 && B.state === 'fight' && !v.dead; t++) { await sleep(500); const p = v.elemental?.phase + (v.fly ? '^' : ''); if (ph[ph.length - 1] !== p) ph.push(p); }
        used._secs = t / 2; used._phases = ph.slice(0, 60).join(' '); used._sky = String(!(window.__zns.game.skyVisibleProbe));
        g.spells.cast = sc;
        return { used, airHp: v.dead ? 0 : v.hp, state: B.state, winner: B.winner };
    });
    console.log(JSON.stringify(out));
    assert.ok(out.used.Thunderwave || out.used.LightningHit, 'the sky magic was used: ' + JSON.stringify(out.used));
});
