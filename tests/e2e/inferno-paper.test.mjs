/**
 * «Инферно» burns the scrolls and books it reaches (in the other hand, lying on the ground) —
 * a scroll burnt by my own flame gives me its power; and with a wand in a hand, the magic is
 * always that hand's (the other raised hand never casts).
 * Run: ZNS_TEST_PORT=8188 node --test tests/e2e/inferno-paper.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8188;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('Inferno burns a scroll in the other hand (its power is mine) and a book on the ground; a wand in a hand: only that hand casts', async () => {
    const { page, errors } = await openPage(browser, srv.url, { viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'iw', type: 0 }, 'right');
        g.items.takeIntoHand({ kind: 'scroll', uid: 'is1', stat: 'spell', spell: 'Alive' }, 'left');
    });
    // only the LEFT arm raised: the spell hand is still the wand's
    await feed(page, { arms: 'forward', wristOffset: [0, 0.05], leftCurl: 0.8, rightCurl: 0.8 }, 20, 33);
    const r = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE;
        g._updateMagicGesture();
        const out = { wandSide: g.wandSide(), magicHand: g.magicHand };
        // the flame pointed at the scroll in the left hand
        const p = g.items.held.left.model.getWorldPosition(new T.Vector3());
        const o = p.clone().add(new T.Vector3(0, 0, 3)), d = new T.Vector3(0, 0, -1);
        g._flameBurnsPaper(o, d, 6, g.localId);
        out.scrollGone = !g.items.held.left;
        out.learnt = !!g.bonus?.spells?.Alive;
        // a book lying on the ground ahead
        const at = g.character.group.position.clone().add(new T.Vector3(0, 0, -6));
        at.y = g.collision.groundY(at.x, at.z) + 0.3;
        g.items.spawnLoose({ kind: 'book', uid: 'ib1', id: 1, spells: [] }, at);
        g._flameBurnsPaper(at.clone().add(new T.Vector3(0, 0, 4)), d, 8, g.localId);
        out.bookGone = !g.items.loose.has('ib1');
        return out;
    });
    assert.equal(r.wandSide, 'right');
    assert.equal(r.magicHand, 'right', 'the wand hand casts, not the other raised hand');
    assert.ok(r.scrollGone && r.learnt, 'the scroll burnt and its spell is mine ' + JSON.stringify(r));
    assert.ok(r.bookGone, 'the book on the ground burnt');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
