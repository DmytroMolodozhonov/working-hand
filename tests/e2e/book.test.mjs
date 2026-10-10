/**
 * The spell book in the hands, like a real book: the other hand takes the cover,
 * the book is as open as the hands are apart, a hand lets go — the free fingertip
 * lifts a page by its edge and carries it over; fingers don't go into the pages.
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

test('book: taken by the cover, opened by the hands, a page turned by a fingertip, closed by lowering the arm', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0 }, 10, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const B = g.books, R = B.reading;
        g.items._gotItem({ kind: 'book', uid: 'bk1', id: 4242, spells: ['CreateWall', 'Gather'] }, 'right');
        await frames(3);
        const m = g.items.held.right.model;
        // the hands, as the test moves them (positions in front of the hero)
        ch.group.updateMatrixWorld(true);
        const fwd = new T.Vector3(0, 0, -1).applyQuaternion(ch.group.quaternion);
        const side = new T.Vector3(1, 0, 0).applyQuaternion(ch.group.quaternion);
        const C = ch.group.position.clone().addScaledVector(fwd, 1.4).setY(ch.group.position.y + 1.0);
        const H = { left: { G: m.position.clone(), curl: 0, tip: null, up: true }, right: { G: m.position.clone(), curl: 0.9, tip: null, up: true } };
        R.input = (s) => H[s];
        // 1) the left hand comes to the book and closes on its cover: both hands hold it
        H.left.G.copy(m.position); H.left.curl = 0.9;
        await frames(12);
        const two = { mode: R.s?.mode, holdL: R.s?.hold.left, holdR: R.s?.hold.right, busyL: R.handBusy('left') };
        // 2) hands apart (1.3 m): open at 2·asin(0.65 / w)
        H.left.G.copy(C).addScaledVector(side, -0.65); H.right.G.copy(C).addScaledVector(side, 0.65);
        await frames(20);
        const w = R.w;
        const edge = (half) => new T.Vector3((half === 'left' ? -1 : 1) * w * Math.sin(R.s.phi / 2), 0, w * Math.cos(R.s.phi / 2)).applyQuaternion(m.quaternion).add(m.position);
        const open1 = { phi: R.s.phi, want: 2 * Math.asin(0.65 / w), eL: edge('left').distanceTo(H.left.G), eR: edge('right').distanceTo(H.right.G) };
        // wider: more open
        H.left.G.copy(C).addScaledVector(side, -0.78); H.right.G.copy(C).addScaledVector(side, 0.78);
        await frames(20);
        const open2 = { phi: R.s.phi, scale: m.scale.x };
        const eye = R._eye(new T.Vector3());
        const facing = new T.Vector3(0, 0, 1).applyQuaternion(m.quaternion).dot(eye.clone().sub(m.position).normalize());
        // 3) the right hand opens: it lets go; the book stays open in the left hand (Items: left now)
        H.right.curl = 0.05;
        await frames(20);
        const one = { mode: R.s?.mode, half: R.s?.half, owner: g.items.held.left?.item.kind, right: !!g.items.held.right, phi: R.s?.phi };
        // 4) the right index fingertip slides under the edge of the right page and carries it over the spine
        const book = m.userData.book;
        const local = (x, z) => { const p = new T.Vector3(x, 0, z); return m.localToWorld(p); };
        const Wb = 0.42, Tb = 0.06;
        const sheetSeen = [];
        const spread0 = R.s.spread;
        // under the edge of the right page (in the right half's frame), then round the spine
        book.R.updateWorldMatrix(true, false);
        H.right.tip = book.R.localToWorld(new T.Vector3(Wb * 0.85, 0, Tb + 0.01));
        await frames(4);
        for (let i = 0; i <= 30; i++) {
            const a = 0.15 + (i / 30) * 1.9; // round the spine from the right page up past the middle
            H.right.tip = local(Math.cos(a) * Wb * 0.85, Tb + Math.sin(a) * Wb * 0.85);
            await frames(1);
            if (R.s.sheet) sheetSeen.push(+R.s.sheet.beta.toFixed(2));
        }
        H.right.tip = null; // the finger goes away: the page falls on over by itself
        for (let i = 0; i < 60 && R.s.sheet; i++) await frames(1);
        const turned = { spread0, spread: R.s.spread, sheet: !!R.s.sheet, seen: sheetSeen.length, maxBeta: Math.max(...sheetSeen), mapL: book.faceL.material.map === R.s.tex[R.s.spread].left };
        // 5) a page let go before the middle falls back
        book.R.updateWorldMatrix(true, false);
        H.right.tip = book.R.localToWorld(new T.Vector3(Wb * 0.85, 0, Tb + 0.01));
        await frames(4);
        for (let i = 0; i <= 12; i++) { const a = 0.15 + (i / 12) * 0.8; H.right.tip = local(Math.cos(a) * Wb * 0.85, Tb + Math.sin(a) * Wb * 0.85); await frames(1); }
        const midway = R.s.sheet ? +R.s.sheet.beta.toFixed(2) : null;
        H.right.tip = null;
        for (let i = 0; i < 60 && R.s.sheet; i++) await frames(1);
        const back = { midway, spread: R.s.spread };
        // reading the spread teaches its spell
        await frames(50);
        const learned = [...B.learned];
        // 6) the holding arm lowered: it closes in that hand
        H.left.up = false;
        await frames(50);
        const closed = { s: !!R.s, phi: book.phi, held: g.items.held.left?.item.kind };
        R.input = null;
        return { two, open1, open2, facing, one, turned, back, learned, closed };
    });
    assert.deepEqual(r.two.mode, 'two', 'the other hand took the cover: ' + JSON.stringify(r.two));
    assert.ok(r.two.busyL, 'the hand on the cover holds nothing else');
    assert.ok(Math.abs(r.open1.phi - r.open1.want) < 0.08, 'as open as the hands are apart ' + JSON.stringify(r.open1));
    assert.ok(r.open1.eL < 0.05 && r.open1.eR < 0.05, 'the edges are in the hands ' + JSON.stringify(r.open1));
    assert.ok(r.open2.phi > r.open1.phi + 0.2, 'hands wider: more open');
    assert.ok(Math.abs(r.open2.scale - 1.6) < 1e-6, 'it does not grow by magic');
    assert.ok(r.facing > 0.6, 'the pages look at the reader ' + r.facing);
    assert.equal(r.one.mode, 'one', 'a hand let go: open in the other ' + JSON.stringify(r.one));
    assert.ok(r.one.owner === 'book' && !r.one.right, 'the book is in the left hand now');
    assert.ok(r.turned.seen > 10 && r.turned.maxBeta > 1.6, 'the page followed the finger over the spine ' + JSON.stringify(r.turned));
    assert.ok(r.turned.spread === r.turned.spread0 + 1 && !r.turned.sheet && r.turned.mapL, 'it landed: the next spread ' + JSON.stringify(r.turned));
    assert.ok(r.back.midway != null && r.back.midway > 0.5 && r.back.spread === r.turned.spread, 'let go before the middle: it fell back ' + JSON.stringify(r.back));
    assert.ok(r.learned.includes('CreateWall'), 'reading the spread taught its spell ' + JSON.stringify(r.learned));
    assert.ok(!r.closed.s && r.closed.phi === 0 && r.closed.held === 'book', 'arm down: closed in the fist ' + JSON.stringify(r.closed));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('book: with the camera hands — the left fist closes on it, the hands apart open it, the right hand opens and lets go', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0, wristOffset: [-0.07, 0] }, 10, 40);
    await page.evaluate(() => window.__zns.game.items._gotItem({ kind: 'book', uid: 'bk2', id: 4243, spells: ['Gather'] }, 'right'));
    // hands together in front, the left one closes on the book
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9, wristOffset: [-0.07, 0] }, 20, 40);
    const two = await page.evaluate(() => { const R = window.__zns.game.books.reading; return { mode: R.s?.mode, phi: R.s?.phi }; });
    // apart
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9, wristOffset: [0.02, 0] }, 20, 40);
    const apart = await page.evaluate(() => { const R = window.__zns.game.books.reading; return { mode: R.s?.mode, phi: R.s?.phi }; });
    // the right hand opens
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0.9, wristOffset: [0.02, 0] }, 20, 40);
    const one = await page.evaluate(() => { const g = window.__zns.game, R = g.books.reading; return { mode: R.s?.mode, left: g.items.held.left?.item.kind, right: !!g.items.held.right }; });
    // a finger pushed into the pages comes back out of them
    const push = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, R = g.books.reading, s = R.s;
        if (!s) return null;
        const hand = g.character.getActiveHands().right;
        const book = s.model.userData.book;
        // move the hand so that its index tip is 0.1 deep in the middle of the right page
        hand.group.updateMatrixWorld(true);
        const tip = R._tip(hand, 'right').clone();
        book.R.updateWorldMatrix(true, false);
        const target = book.R.localToWorld(new T.Vector3(0.25, 0, 0.0));
        const off = target.clone().sub(tip);
        hand.group.parent.getWorldQuaternion(new T.Quaternion());
        const inv = hand.group.parent.getWorldQuaternion(new T.Quaternion()).invert();
        hand.group.position.add(off.applyQuaternion(inv));
        hand.group.updateMatrixWorld(true);
        const depth = (p) => book.R.worldToLocal(p.clone()).z - 0.062;
        const before = depth(R._tip(hand, 'right'));
        R._pushOut(s, 'right', { hand });
        const after = depth(R._tip(hand, 'right'));
        return { before, after };
    });
    assert.equal(two.mode, 'two', 'the left fist took the cover ' + JSON.stringify(two));
    assert.ok(apart.phi > (two.phi || 0) + 0.2, 'hands apart: it opened ' + JSON.stringify({ two, apart }));
    assert.ok(one.mode === 'one' && one.left === 'book' && !one.right, 'the right hand let go ' + JSON.stringify(one));
    assert.ok(push && push.before < -0.02 && push.after >= -0.005, 'the finger is not inside the pages ' + JSON.stringify(push));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
