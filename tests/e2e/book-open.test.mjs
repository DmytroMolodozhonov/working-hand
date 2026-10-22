/**
 * The book opened as in real play (in «Выживание», the hands from the camera): it came into
 * the right hand; the left hand comes OPEN to the covers' outer half and closes — both hands
 * hold it; apart — it opens; the right hand lets go; the free fingertip turns a page.
 * (Before: the fore-edge was turned away from the other hand — out of its reach: it never opened.)
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

test('book from the camera hands: taken by the other hand, opened by the hands apart, a page turned by the fingertip', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const pose = (o) => ({ arms: 'forward', palmsIn: true, rightCurl: 0.9, ...o });
    await page.evaluate(() => { const g = window.__zns.game; for (const s of ['left', 'right']) g.items.releaseHand(s); });
    await feed(page, pose({ leftCurl: 0, wristOffset: [0.05, 0] }), 10, 40);
    await page.evaluate(() => window.__zns.game.items._gotItem({ kind: 'book', uid: 'bko', id: 4245, spells: ['CreateWall', 'Gather'] }, 'right'));
    await feed(page, pose({ leftCurl: 0, wristOffset: [0.05, 0] }), 10, 40);
    // the open left hand comes closer until it is on the covers' outer half (or at the fore-edge)
    const onIt = () => page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, R = g.books.reading;
        const m = g.items.held.right?.model;
        if (!m) return null;
        m.updateMatrixWorld(true);
        const l = m.worldToLocal(R._hand('left').G.clone());
        return { z: l.z / 0.42, y: Math.abs(l.y) / 0.3, x: Math.abs(l.x) };
    });
    let at = null, where = null;
    for (let dx = 0.05; dx >= -0.16; dx -= 0.01) {
        await feed(page, pose({ leftCurl: 0, wristOffset: [dx, 0] }), 4, 40);
        where = await onIt();
        if (where && where.z > 0.5 && where.z < 1.2 && where.y < 1.1 && where.x < 0.25) { at = dx; break; }
    }
    assert.ok(at != null, 'the left hand reaches the covers ' + JSON.stringify(where));
    await feed(page, pose({ leftCurl: 0.9, wristOffset: [at, 0] }), 15, 40);
    const two = await page.evaluate(() => ({ mode: window.__zns.game.books.reading.s?.mode || null }));
    // the hands apart: it opens
    await feed(page, pose({ leftCurl: 0.9, wristOffset: [0.06, 0] }), 25, 40);
    const apart = await page.evaluate(() => { const R = window.__zns.game.books.reading; return { mode: R.s?.mode || null, phi: R.s?.phi ?? 0 }; });
    // the right hand opens: the book stays open in the left one
    await feed(page, pose({ rightCurl: 0, leftCurl: 0.9, wristOffset: [0.06, 0] }), 25, 40);
    const one = await page.evaluate(() => { const g = window.__zns.game, R = g.books.reading; return { mode: R.s?.mode || null, half: R.s?.half, left: g.items.held.left?.item.kind, phi: R.s?.phi ?? 0 }; });
    // the right index fingertip (the camera's hand, only its tip led by the test) slides under the
    // edge of the right page and carries it over the spine
    const turned = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, R = g.books.reading, s = R.s;
        if (!s || s.mode !== 'one') return null;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const tip = { right: null };
        R.input = (sd) => { const keep = R.input; R.input = null; const h = R._hand(sd); R.input = keep; if (tip[sd]) h.tip = tip[sd]; return h; };
        const m = s.model, book = m.userData.book, Wb = 0.42, Tb = 0.06;
        const local = (x, z) => m.localToWorld(new T.Vector3(x, 0, z));
        const spread0 = s.spread;
        book.R.updateWorldMatrix(true, false);
        tip.right = book.R.localToWorld(new T.Vector3(Wb * 0.85, 0, Tb + 0.01));
        await frames(4);
        let seen = 0;
        for (let i = 0; i <= 30; i++) {
            const a = 0.15 + (i / 30) * 1.9;
            tip.right = local(Math.cos(a) * Wb * 0.85, Tb + Math.sin(a) * Wb * 0.85);
            await frames(1);
            if (R.s?.sheet) seen++;
        }
        tip.right = null;
        for (let i = 0; i < 60 && R.s?.sheet; i++) await frames(1);
        R.input = null;
        return { spread0, spread: R.s?.spread, seen };
    });
    assert.equal(two.mode, 'two', 'the left hand took the covers ' + JSON.stringify({ at, where, two }));
    assert.ok(apart.mode === 'two' && apart.phi > 1.0, 'hands apart: it opened ' + JSON.stringify(apart));
    assert.ok(one.mode === 'one' && one.left === 'book', 'the right hand let go: open in the left ' + JSON.stringify(one));
    assert.ok(turned && turned.seen > 5 && turned.spread === turned.spread0 + 1, 'the page followed the finger and turned ' + JSON.stringify(turned));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
