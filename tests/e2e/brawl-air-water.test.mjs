/**
 * Маг воздуха и маг воды в «Битве существ» (автор 16.11: «беспомощные… бесполезный»): каждый против мага огня по ~60 с.
 * Записывается, чем каждый бьёт (лезвия ветра, иглы, осколки, вихрь, бросок) и сколько жизни потерял противник. Должны ранить, а не только толкать.
 * Run: ZNS_START_TIMEOUT=600000 node --test tests/e2e/brawl-air-water.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8207;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('air and water mages hurt their foe in «Битва существ»', { timeout: 1700000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    await page.addInitScript(() => { window.__ZNS_SHOT_FAST__ = true; }); // (shaders as they are seen: a container without a graphics card took >15 min to warm up)
    await page.reload(); await page.waitForFunction(() => !!window.__zns);
    await startFromMenu(page, 'brawl');
    await waitHudVisible(page, 120000).catch(() => {});
    const out = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        for (let i = 0; i < 300 && !g.terrain?.data?.landMade?.(0, 0); i++) await sleep(100);
        const B = g.brawl, L = g.castleLife, EM = g.elementalMages, res = {};
        for (const el of ['air', 'water']) {
            B.sweep?.();
            await sleep(800);
            const me = B.spawn(el, 'A', -12, 0), foe = B.spawn('fire', 'B', 12, 0);
            await sleep(1500);
            const v = L.byId.get(me.id), f = L.byId.get(foe.id);
            const used = {}, n = (k) => { used[k] = (used[k] || 0) + 1; };
            const add = g.duel._addBolt.bind(g.duel);
            g.duel._addBolt = (o) => { if (o?.by === v.id) n('bolt:' + o.spell); return add(o); };
            const cast = EM.cast.bind(EM); EM.cast = (vv, name, ...a) => { const ok = cast(vv, name, ...a); if (vv === v && ok) n('cast:' + name); return ok; };
            const hp0 = f.hp;
            B.start();
            let minHp = hp0, t = 0, myHp = v.hp;
            for (; t < 120 && B.state === 'fight'; t++) { await sleep(500); if (!f.dead) minHp = Math.min(minHp, f.hp); myHp = v.dead ? 0 : v.hp; }
            g.duel._addBolt = add; EM.cast = cast;
            res[el] = { foeHp0: hp0, foeMin: f.dead ? 0 : minHp, foeDead: !!f.dead, myHp, secs: t / 2, used, water: v.elemental?.water };
            B.stop?.();
        }
        return res;
    });
    console.log(JSON.stringify(out, null, 1));
    for (const el of ['air', 'water']) {
        const r = out[el];
        assert.ok(r.foeHp0 - r.foeMin >= 8, `${el}: the fire mage lost ${r.foeHp0 - r.foeMin} HP (must be hurt, not only pushed)`);
    }
});
