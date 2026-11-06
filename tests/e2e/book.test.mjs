/**
 * The spell book in the hand (the author 06.11): it is open by itself in one hand; the open hand lets it lie on the palm, an opened stretched arm drops it.
 * Run: node --test tests/e2e/book.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8193;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('book: open by itself in one hand; the hand opens palm up — the book lies on the palm; opened palm down on a stretched arm — it falls', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0 }, 10, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, R = g.books.reading;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        g.items._gotItem({ kind: 'book', uid: 'bk3', id: 4244, spells: ['Gather'] }, 'right');
        await frames(3);
        const m = g.items.held.right.model;
        m.updateMatrixWorld(true);
        const H = { left: { G: new T.Vector3(-1.5, 1, 0), curl: 0, tip: null, up: true }, right: { G: m.position.clone(), curl: 0.55, tip: null, up: true } };
        R.input = (s) => H[s];
        H.right.curl = 0.55; // (a calm hand: the book opens by itself — no second hand needed)
        await frames(80);
        const one = { mode: R.s?.mode, half: R.s?.half };
        // the right hand opens, its palm up (the arm stretched — still not a drop: the palm is under it)
        H.right.curl = 0; H.right.palmUp = true; H.right.ext = true;
        await frames(25);
        const lying = { support: !!R.s?.support, held: g.items.held.right?.item.kind, n: new T.Vector3(0, 0, 1).applyQuaternion(m.quaternion).y };
        // it closes on it again: held where it lies
        H.right.curl = 0.9;
        await frames(15);
        const again = { support: !!R.s?.support, mode: R.s?.mode };
        // the arm bent, the hand opens palm down: the fingers still have it (nothing falls by accident)
        H.right.palmUp = false; H.right.ext = false; H.right.curl = 0;
        await frames(25);
        const bent = { mode: R.s?.mode, held: g.items.held.right?.item.kind };
        // the arm stretched and the hand opened: now it falls
        H.right.ext = true;
        await frames(25);
        const dropped = { held: !!g.items.held.right, loose: [...g.items.loose.values()].some((L) => L.item.uid === 'bk3'), open: m.userData.book.phi };
        R.input = null;
        return { one, lying, again, bent, dropped };
    });
    assert.equal(r.one.mode, 'one', JSON.stringify(r));
    assert.ok(r.lying.support && r.lying.held === 'book', 'lies on the palm, still in that hand ' + JSON.stringify(r));
    assert.ok(r.again.mode === 'one' && !r.again.support, 'the fingers closed on it again ' + JSON.stringify(r));
    assert.ok(r.bent.mode === 'one' && r.bent.held === 'book', 'a bent arm opened: still in the hand ' + JSON.stringify(r));
    assert.ok(!r.dropped.held && r.dropped.loose && r.dropped.open === 0, 'an opened stretched arm let it fall (closed) ' + JSON.stringify(r));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
