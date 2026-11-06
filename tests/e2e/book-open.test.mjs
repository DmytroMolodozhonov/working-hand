/**
 * The book as in real play (in «Выживание», the hands from the camera; the author 06.11): it comes into the right hand — and it is OPEN by itself; the fist squeezing it
 * shuts it, loosened it opens again; the free index finger drawn across the book turns a page (forward one way, back the other).
 * Run: ZNS_TEST_PORT=8199 node --test tests/e2e/book-open.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8199;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('book from the camera hands: open by itself, squeezed shut and loosened open again, a page turned by a swipe of the finger', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const pose = (o) => ({ arms: 'forward', palmsIn: true, rightCurl: 0.55, leftCurl: 0, ...o });
    await page.evaluate(() => { const g = window.__zns.game; for (const s of ['left', 'right']) g.items.releaseHand(s); });
    await feed(page, pose({}), 10, 40);
    await page.evaluate(() => window.__zns.game.items._gotItem({ kind: 'book', uid: 'bko', id: 4245, spells: ['CreateWall', 'Gather'] }, 'right'));
    await feed(page, pose({}), 70, 40);
    const state = () => page.evaluate(() => { const R = window.__zns.game.books.reading; return { mode: R.s?.mode || null, phi: R.s?.phi ?? 0, spread: R.s?.spread ?? -1 }; });
    const opened = await state();
    // squeezed hard: shut; loosened: open again
    await feed(page, pose({ rightCurl: 1 }), 40, 40);
    const shut = await state();
    await feed(page, pose({}), 70, 40);
    const again = await state();
    // the left index fingertip drawn across the book from the right to the left (the camera's hand, only its tip led by the test)
    const turned = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, R = g.books.reading, s = R.s;
        if (!s) return null;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const tip = { left: null };
        R.input = (sd) => { const keep = R.input; R.input = null; const h = R._hand(sd); R.input = keep; if (tip[sd]) h.tip = tip[sd]; return h; };
        const m = s.model, Wb = 0.42, Tb = 0.06;
        const at = (x) => m.localToWorld(new T.Vector3(x * Wb, 0, Tb + 0.04 / 1.6));
        const spread0 = s.spread;
        for (let i = 0; i <= 14; i++) { tip.left = at(0.6 - (i / 14) * 0.8); await frames(1); }
        tip.left = null;
        for (let i = 0; i < 90 && (R.s?.sheet || R.s?.spread === spread0); i++) await frames(1);
        const fwd = R.s?.spread;
        await frames(40);
        for (let i = 0; i <= 14; i++) { tip.left = at(-0.5 + (i / 14) * 0.8); await frames(1); }
        tip.left = null;
        for (let i = 0; i < 90 && (R.s?.sheet || R.s?.spread === fwd); i++) await frames(1);
        const back = R.s?.spread;
        R.input = null;
        return { spread0, fwd, back };
    });
    assert.ok(opened.mode === 'one' && opened.phi > 2.2, 'open by itself ' + JSON.stringify(opened));
    assert.ok(shut.phi < 0.4, 'squeezed shut ' + JSON.stringify(shut));
    assert.ok(again.phi > 2.2, 'loosened: open again ' + JSON.stringify(again));
    assert.ok(turned && turned.fwd === turned.spread0 + 1 && turned.back === turned.spread0, 'a swipe turned the page forward and back ' + JSON.stringify(turned));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
