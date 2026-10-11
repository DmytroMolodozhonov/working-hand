/**
 * The swift book-bird in the real game: the Creative pedestal holds its book of «Флайн»
 * (no scroll of flight there), it flies twice as fast as an ordinary book-bird, and its
 * book burnt teaches flight: «Инферно» said with it in the hand, the flame on it lying on the
 * ground, or the hand holding it in a campfire.
 * Run: node --test tests/e2e/swift-book.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('swift book: on the Creative pedestal, twice as fast in the air, teaches «Флайн» only burnt', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, B = g.books;
        const pedestal = [...B.books.values()].find((b) => b.spells.includes('Flight'));
        const flightScrolls = [...g.items.loose.values()].filter((L) => L.item.kind === 'scroll' && L.item.stat === 'flight').length;
        // two birds side by side, the same hop: the swift one gets there in half the time
        const at = g.character.group.position.clone().add(new T.Vector3(0, 12, -30));
        const ord = B._spawnBird(12345, at.clone());
        const swift = B._spawnBird(900012345, at.clone().add(new T.Vector3(2, 0, 0)));
        for (const b of [ord, swift]) b.t = b.wait = 99;
        B._updateBird(ord, 0.01); B._updateBird(swift, 0.01);
        const durs = [ord.dur / ord.from.distanceTo(ord.to), swift.dur / swift.from.distanceTo(swift.to)];
        const cover = swift.model.children.find((c) => c.isMesh)?.material.color.getHex();
        // reading does not teach «Флайн»: burning does — «Инферно» said with the book in the hand
        const was = g.config.mode;
        g.config.mode = 'freeworld';
        g.bonus = null; B.learned.delete('Flight');
        const before = g.knowsFlight();
        for (const sd of ['left', 'right']) g.items.releaseHand(sd);
        g.items.takeIntoHand({ kind: 'book', uid: 'sb1', id: 900000777, spells: ['Flight'], swift: true }, 'left');
        g._castLocalSpell('инферно', true);
        const heldGone = !g.items.held.left;
        const afterSay = g.knowsFlight();
        // a swift book lying on the ground: the flame reaches it, it burns, the burner learns
        g.bonus = null; B.learned.delete('Flight');
        const gat = g.character.group.position.clone().add(new T.Vector3(0, 0, -6));
        gat.y = g.collision.groundY(gat.x, gat.z) + 0.3;
        B.placeBook(gat, 900000778);
        g._flameBurnsPaper(gat.clone().add(new T.Vector3(0, 0, 4)), new T.Vector3(0, 0, -1), 8, g.localId);
        const groundGone = !B.books.has(900000778), afterFlame = g.knowsFlight();
        // held in a campfire's flames: it catches fire
        g.bonus = null; B.learned.delete('Flight');
        g.items.takeIntoHand({ kind: 'book', uid: 'sb2', id: 900000779, spells: ['Flight'], swift: true }, 'right');
        const hp = g.items.held.right.model.getWorldPosition(new T.Vector3());
        g.campfires.kindle(hp.x, hp.y - 0.5, hp.z);
        g.campfires._fireAt = () => true; // (the hand stays in the flames whatever the arm does)
        g._heldPaperInFire(0.5); g._heldPaperInFire(0.5);
        const fireGone = !g.items.held.right, afterFire = g.knowsFlight();
        g.config.mode = was;
        return { pedestal: !!pedestal, pedestalSwift: pedestal?.id >= 900000000, flightScrolls, durs, cover, before, heldGone, afterSay, groundGone, afterFlame, fireGone, afterFire };
    });
    assert.ok(r.pedestal && r.pedestalSwift, 'the swift book lies on a Creative pedestal');
    assert.equal(r.flightScrolls, 0, 'no scroll of flight on the pedestals');
    assert.ok(Math.abs(r.durs[0] / r.durs[1] - 2) < 1e-6, `twice as fast: ${r.durs}`);
    assert.equal(r.cover, 0x7fc8f0, 'sky-blue cover');
    assert.equal(r.before, false, 'in «Выживание» flight is not known before');
    assert.ok(r.heldGone && r.afterSay, '«Инферно» with the book in the hand: it burns, «Флайн» known ' + JSON.stringify(r));
    assert.ok(r.groundGone && r.afterFlame, 'the flame on a book lying on the ground: it burns, «Флайн» known');
    assert.ok(r.fireGone && r.afterFire, 'held in a campfire: it burns, «Флайн» known');
    assert.deepEqual(realErrors(errors), []);
});
