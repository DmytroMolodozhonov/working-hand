/**
 * «Стоп» takes off a «Protection» shield on any hand, in Survival too (the hand shield and the gods' one).
 * Run: node --test tests/e2e/shield-stop.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8189;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('freeworld: «стоп» removes a shield on the left hand (plain, gods, with a wand in either hand) and on the right', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0 }, 6, 30);
    const cases = [['left', false, null], ['right', false, null], ['left', true, null], ['left', false, 'left'], ['left', false, 'right'], ['right', false, 'left']];
    for (const [side, gods, wand] of cases) {
        const r = await page.evaluate(([side, gods, wand]) => {
            const g = window.__zns.game, c = g.combat;
            for (const s of ['left', 'right']) g.items.releaseHand(s);
            if (wand) g.items.takeIntoHand({ kind: 'wand', uid: 'sw', plain: true, model: 0, color: 0x8b5a2b, power: 0 }, wand);
            c.fatigue = c.maxFatigue || 100;
            c.shield = { type: 1, side, left: 50, drain: 0.5, age: 0, gods, wand: side === wand };
            const name = g.castLocalSpell('стоп', true);
            const out = { name, shield: !!c.shield, mode: g.config.mode };
            g.items.releaseHand('left'); g.items.releaseHand('right');
            return out;
        }, [side, gods, wand]);
        assert.ok(!r.shield, `${side} gods=${gods} wand=${wand}: the shield is gone ${JSON.stringify(r)}`);
    }
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
