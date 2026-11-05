/**
 * «Логово зельевара» в настоящей игре (браузер, воркеры): Творческий → start() → зал строится → котёл с водой над огнём, вещи на полках →
 * «Firefighting» тушит костёр → вода остывает. Снимок зала: docs/media/potion-lair-north.png.
 * Run: node --test tests/e2e/potion-lair.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8192;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the potion-maker\'s lair is built, lit, stocked; the fire goes out and the water cools', { timeout: 900000 }, async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    await startFromMenu(page, 'creative', { smooth: true }).catch(async (e) => {
        if (!/Timeout/.test(e.message)) throw e;
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 420000 });
    });
    await waitHudVisible(page, 120000);
    if (errors?.length) console.log('PAGEERR', JSON.stringify(errors.slice(0, 5)));
    await page.exposeFunction('__shotHook', async (n) => { await page.screenshot({ path: `docs/media/potion-lair-${n}.png` }); });
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const out = {};
        out.started = g.potionLair.start();
        for (let i = 0; i < 1800 && (g.potionLair.state || !g.potionLair.plan); i++) await sleep(100);
        await sleep(3000);
        const me = g.character.group.position;
        out.pos = [Math.round(me.x), Math.round(me.y), Math.round(me.z)];
        out.inLair = g.potionLair.inLair;
        const c = g.cauldrons.list.get('potion_lair_cauldron');
        out.cauldron = !!c; out.water = c?.st.water; out.fire = c?.fire;
        out.dark = g.world.cave;
        const count = () => [...g.items.loose.values()].filter((L) => Math.abs(L.model.position.x - 1400) < 30 && Math.abs(L.model.position.z + 1400) < 30).length;
        for (let i = 0; i < 600 && count() < 52; i++) await sleep(100); // (the shelves fill in portions, a few per frame)
        out.items = count();
        for (let i = 0; i < 300 && !(c.st.heat >= 1); i++) await sleep(100);
        out.heat = c?.st.heat;
        await window.__shotHook?.('north');
        window.__shot1 = true;
        // the fire out (what «Firefighting» does): the water cools by and by
        for (const f of [...g.campfires.list.values()]) g.campfires._out(f);
        await sleep(6000);
        out.heatAfter = c?.st.heat;
        return out;
    });
    console.log(JSON.stringify(r));
    assert.ok(r.started && r.inLair, 'hero is in the lair');
    assert.ok(r.cauldron && r.water > 3 && r.fire, 'cauldron with water on a fire');
    assert.ok(r.items >= 52, `shelves stocked: ${r.items}`);
    assert.ok(r.heat >= 1 && r.heatAfter < r.heat, 'boiled, then cooled');
});
