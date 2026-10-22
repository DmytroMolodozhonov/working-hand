/**
 * Creative start has a city merchant's stall: the merchant stands behind his counter and goods lie on it.
 * Run: ZNS_TEST_PORT=8198 node --test tests/e2e/creative-market.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8198;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('creative: a merchant stands at his stall by the start with goods on the counter, and the hero has coins', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.waitForFunction(() => {
        const g = window.__zns.game, cs = g.castleLife.castles.get('cvmarket');
        return cs && cs.awake && [...cs.active.values()].some((v) => v.role === 'merchant');
    }, null, { timeout: 60000 });
    const r = await page.evaluate(() => {
        const g = window.__zns.game, cs = g.castleLife.castles.get('cvmarket'), v = [...cs.active.values()][0];
        const st = cs.def.stalls[0];
        return { z: v.z, backZ: st.back.z, coins: g.inventory.coins(), keys: [...g.castleLife.talk.stalls.keys()] };
    });
    assert.ok(Math.abs(r.z - r.backZ) < 3, `merchant at his stall ${JSON.stringify(r)}`);
    assert.ok(r.coins > 0, 'coins to test with');
    await page.waitForFunction(() => { const s = window.__zns.game.castleLife.talk.stalls.get('cvmarket:s0'); return s && s.goods.length >= 3; }, null, { timeout: 30000 });
    assert.deepEqual(realErrors(errors), []);
});
