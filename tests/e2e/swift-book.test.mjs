/**
 * The swift book-bird in the real game: the Creative pedestal holds its book of «Флайн»
 * (no scroll of flight there), it flies twice as fast as an ordinary book-bird, and its
 * book taken in the hand teaches flight.
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

test('swift book: on the Creative pedestal, twice as fast in the air, teaches «Флайн»', async () => {
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
        // its book in the hand teaches flight: the reading code learns it
        g.bonus = null;
        B.learned.delete('Flight');
        B.learnFlight();
        return { pedestal: !!pedestal, pedestalSwift: pedestal?.id >= 900000000, flightScrolls, durs, cover, flight: !!g.bonus?.flight };
    });
    assert.ok(r.pedestal && r.pedestalSwift, 'the swift book lies on a Creative pedestal');
    assert.equal(r.flightScrolls, 0, 'no scroll of flight on the pedestals');
    assert.ok(Math.abs(r.durs[0] / r.durs[1] - 2) < 1e-6, `twice as fast: ${r.durs}`);
    assert.equal(r.cover, 0x7fc8f0, 'sky-blue cover');
    assert.ok(r.flight, 'reading it: flight known');
    assert.deepEqual(realErrors(errors), []);
});
