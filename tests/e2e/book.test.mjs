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

test('book: taken by the cover, opened by the hands, tilted by the wrists, a page turned by a fingertip, closed by lowering the arm', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // (the camera's hands closed: the book stays in whichever hand the test gives it)
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10, 40);
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
        await frames(3); // (the left hand is seen open first: a fist arriving takes nothing)
        // 1) the left hand comes to the covers' edge (the fore-edge) and closes on it: both hands hold it
        m.updateMatrixWorld(true);
        H.left.G.copy(m.localToWorld(new T.Vector3(0, -0.1, 0.42))); H.left.curl = 0.9;
        await frames(12);
        const two = { mode: R.s?.mode, holdL: R.s?.hold.left, holdR: R.s?.hold.right, busyL: R.handBusy('left') };
        // 2) hands apart (1.3 m): open at 2·asin(0.65 / w)
        H.left.G.copy(C).addScaledVector(side, -0.65); H.right.G.copy(C).addScaledVector(side, 0.65);
        await frames(20);
        const w = R.w, t = R.t, gy = R.s.gy;
        const edge = (half) => new T.Vector3((half === 'left' ? -1 : 1) * (t + w * Math.sin(R.s.phi / 2)), gy, w * Math.cos(R.s.phi / 2)).applyQuaternion(m.quaternion).add(m.position);
        const open1 = { phi: R.s.phi, want: 2 * Math.asin((0.65 - t) / w), eL: edge('left').distanceTo(H.left.G), eR: edge('right').distanceTo(H.right.G), gy };
        // wider: more open
        H.left.G.copy(C).addScaledVector(side, -0.78); H.right.G.copy(C).addScaledVector(side, 0.78);
        await frames(20);
        const open2 = { phi: R.s.phi, scale: m.scale.x };
        // the hands' fingers turn (the wrists bend back by 0.5 rad): the book tilts with them
        const spine = () => new T.Vector3(0, 1, 0).applyQuaternion(m.quaternion);
        H.left.Y = new T.Vector3(0, 1, 0); H.right.Y = new T.Vector3(0, 1, 0);
        await frames(5);
        const s0 = spine();
        H.left.Y = new T.Vector3(0, Math.cos(0.5), Math.sin(0.5)).applyQuaternion(ch.group.quaternion); H.right.Y = H.left.Y.clone();
        await frames(10);
        const tilt = s0.angleTo(spine());
        delete H.left.Y; delete H.right.Y;
        await frames(5);
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
        return { two, open1, open2, tilt, facing, one, turned, back, learned, closed };
    });
    assert.deepEqual(r.two.mode, 'two', 'the other hand took the cover: ' + JSON.stringify(r.two));
    assert.ok(r.two.busyL, 'the hand on the cover holds nothing else');
    assert.ok(Math.abs(r.open1.phi - r.open1.want) < 0.08, 'as open as the hands are apart ' + JSON.stringify(r.open1));
    assert.ok(r.open1.eL < 0.05 && r.open1.eR < 0.05, 'the edges are in the hands ' + JSON.stringify(r.open1));
    assert.ok(r.open1.gy < -0.05, 'held below the middle of the edges ' + JSON.stringify(r.open1));
    assert.ok(r.open2.phi > r.open1.phi + 0.2, 'hands wider: more open');
    assert.ok(Math.abs(r.open2.scale - 1.6) < 1e-6, 'it does not grow by magic');
    assert.ok(Math.abs(r.tilt - 0.5) < 0.08, 'the wrists bent: the book tilted as much ' + r.tilt);
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

/** Hand points inside the book (the halves' boards and pages, or the closed book), per holding hand. */
const MEASURE = () => {
    const g = window.__zns.game, T = window.__zns.THREE, R = g.books.reading;
    const hb = g.items.heldOf('book');
    if (!hb) return { none: true, loose: [...g.items.loose.values()].some((L) => L.item.kind === 'book') };
    const m = hb.model, b = m.userData.book;
    const W = 0.42, H = 0.6, Tt = 0.06, Bb = 0.025;
    m.updateMatrixWorld(true);
    const res = { mode: R.s?.mode || 'fist', phi: b.phi || 0, support: !!R.s?.support, spine: new T.Vector3(0, 1, 0).applyQuaternion(m.quaternion).toArray(), held: hb.side };
    const busy = R.s ? Object.values(R.s.hold).filter(Boolean) : [hb.side];
    for (const side of busy) {
        const hand = g.character.getActiveHands()[side];
        hand.group.updateMatrixWorld(true);
        let n = 0;
        for (const segs of Object.values(hand.fingerMeshes)) for (const sg of segs) for (const y of [0.05, 0.1, 0.14]) {
            const p = sg.pivot.localToWorld(new T.Vector3(0, y, 0));
            for (const [half, sx] of [[b.L, -1], [b.R, 1]]) {
                const l = half.worldToLocal(p.clone()), x = sx * l.x;
                // (deeper than 1 cm: a touch is not "in")
                if (x > 0.01 && x < W - 0.01 && Math.abs(l.y) < H / 2 - 0.01 && l.z > -Bb + 0.006 && l.z < Tt - 0.006) n++;
            }
        }
        const palm = hand.palm.getWorldPosition(new T.Vector3());
        for (const [half, sx] of [[b.L, -1], [b.R, 1]]) {
            const l = half.worldToLocal(palm.clone()), x = sx * l.x;
            if (x > 0 && x < W && Math.abs(l.y) < H / 2 && l.z > -Bb && l.z < Tt) n += 100;
        }
        res[side] = n;
    }
    return res;
};

test('book: with the camera hands — held by its edge, fingers on the covers never in them, opened by the hands apart, dropped only by an opened stretched arm', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const pose = (o) => ({ arms: 'forward', palmsIn: true, ...o });
    await feed(page, pose({ rightCurl: 0.9, leftCurl: 0, wristOffset: [-0.1, 0] }), 10, 40);
    await page.evaluate(() => window.__zns.game.items._gotItem({ kind: 'book', uid: 'bk2', id: 4243, spells: ['Gather'] }, 'right'));
    await feed(page, pose({ rightCurl: 0.9, leftCurl: 0, wristOffset: [-0.1, 0] }), 20, 40);
    const fist = await page.evaluate(MEASURE);
    // the left hand closes on the covers' edge
    await feed(page, pose({ rightCurl: 0.9, leftCurl: 0.9, wristOffset: [-0.1, 0] }), 20, 40);
    const two = await page.evaluate(MEASURE);
    // apart
    await feed(page, pose({ rightCurl: 0.9, leftCurl: 0.9, wristOffset: [0.02, 0] }), 20, 40);
    const apart = await page.evaluate(MEASURE);
    // the wrists bent (the fingers towards the camera): still no finger in it
    await feed(page, pose({ rightCurl: 0.9, leftCurl: 0.9, wristOffset: [0.02, 0], leftTilt: 0.6, rightTilt: 0.6 }), 20, 40);
    const tilted = await page.evaluate(MEASURE);
    // much wider than the book: it lies flat between the hands, nothing lets go (only arms spread
    // wide let the cover slip out — book-hands.test.js)
    await feed(page, pose({ rightCurl: 0.9, leftCurl: 0.9, wristOffset: [0.08, 0] }), 20, 40);
    const wide = await page.evaluate(MEASURE);
    // the right hand opens: it lets go, the book stays open in the left one (rigidly)
    await feed(page, pose({ rightCurl: 0, leftCurl: 0.9, wristOffset: [0.02, 0] }), 20, 40);
    const one = await page.evaluate(() => { const g = window.__zns.game, R = g.books.reading; return { mode: R.s?.mode, left: g.items.held.left?.item.kind, right: !!g.items.held.right }; });
    const oneIn = await page.evaluate(MEASURE);
    // a finger pushed into the pages comes back out of them (at most a little at a time)
    const push = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, R = g.books.reading, s = R.s;
        if (!s) return null;
        const hand = g.character.getActiveHands().right;
        const book = s.model.userData.book;
        hand.group.updateMatrixWorld(true);
        const tip = R._tip(hand, 'right').clone();
        book.R.updateWorldMatrix(true, false);
        const target = book.R.localToWorld(new T.Vector3(0.25, 0, 0.0));
        const inv = hand.group.parent.getWorldQuaternion(new T.Quaternion()).invert();
        hand.group.position.add(target.clone().sub(tip).applyQuaternion(inv));
        hand.group.updateMatrixWorld(true);
        const depth = (p) => book.R.worldToLocal(p.clone()).z - 0.062;
        const before = depth(R._tip(hand, 'right'));
        const at = hand.group.position.clone();
        R._pushOut(s, 'right', { hand });
        const moved = hand.group.position.distanceTo(at);
        const after = depth(R._tip(hand, 'right'));
        return { before, after, moved };
    });
    // the left (holding) hand opens: never held by an open hand — it lies on the palm (turned up) or falls
    const drop = [];
    for (let i = 0; i < 6; i++) {
        await feed(page, pose({ rightCurl: 0, leftCurl: 0, wristOffset: [0.02, 0] }), 4, 40);
        drop.push(await page.evaluate(MEASURE));
    }
    assert.equal(fist.right, 0, 'the closed book in the fist: no finger in it ' + JSON.stringify(fist));
    assert.equal(two.mode, 'two', 'the left hand took the covers\' edge ' + JSON.stringify(two));
    assert.ok(apart.phi > two.phi + 0.5, 'hands apart: it opened ' + JSON.stringify({ two, apart }));
    assert.ok(apart.left === 0 && apart.right === 0, 'held open: no finger in the pages ' + JSON.stringify(apart));
    assert.ok(Math.abs(apart.spine[1]) > 0.9, 'upright, not a tray ' + JSON.stringify(apart));
    assert.ok(tilted.left === 0 && tilted.right === 0, 'tilted: no finger in it ' + JSON.stringify(tilted));
    assert.ok(wide.mode === 'two' && wide.phi > 3.0, 'pulled wide: still in both hands, flat ' + JSON.stringify(wide));
    assert.ok(one.mode === 'one' && one.left === 'book' && !one.right, 'the right hand let go ' + JSON.stringify(one));
    assert.equal(oneIn.left, 0, 'in one hand: no finger in it ' + JSON.stringify(oneIn));
    assert.ok(push && push.before < -0.02 && push.after > push.before && push.moved <= 0.15 + 1e-6, 'the finger is pushed back out of the pages, never torn off the arm ' + JSON.stringify(push));
    const last = drop[drop.length - 1];
    assert.ok((last.none && last.loose) || (last.mode === 'one' && last.support && last.left === 0), 'the opened hand does not pinch it: on the palm or dropped ' + JSON.stringify(last));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('book: in one hand, the hand opens palm up — the book lies on the palm; opened palm down on a stretched arm — it falls', async () => {
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
        const H = { left: { G: m.localToWorld(new T.Vector3(0, -0.1, 0.42)), curl: 0, tip: null, up: true }, right: { G: m.position.clone(), curl: 0.9, tip: null, up: true } };
        R.input = (s) => H[s];
        await frames(3); // (it comes open to the edge, then closes on it)
        H.left.curl = 0.9;
        await frames(12);
        const C = H.right.G.clone();
        H.left.G.copy(C).add(new T.Vector3(-1.2, 0, 0));
        await frames(15);
        // the left hand lets go: open in the right one
        H.left.curl = 0;
        await frames(15);
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
