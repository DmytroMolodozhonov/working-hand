/**
 * A sea castle's port — in a real browser.
 * Run: node --test tests/e2e/port.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8164;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);

test('sea castle: walk on the quay and the piers, the harbour water moves, port chests hold the sailors\' stores', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const info = await page.evaluate(() => {
        const g = window.__zns.game;
        const idx = g.world.terrain.data.castles;
        let best = null;
        for (let gz = -8; gz <= 8; gz++) for (let gx = -8; gx <= 8; gx++) {
            const c = idx.cellOf(gx, gz);
            if (c && c.variant === 'sea' && (!best || Math.hypot(c.x, c.z) < Math.hypot(best.x, best.z))) best = c;
        }
        if (!best) return null;
        window.__port = best;
        const P = best.port, pr = P.piers[0];
        const q = { x: (pr.a.x + pr.b.x) / 2, z: (pr.a.z + pr.b.z) / 2 };
        g.character.group.position.set(q.x, pr.y + 2.0, q.z);
        g.world.terrain.flushAround(q.x, q.z);
        g.seaSurface?.flush(q.x, q.z);
        return { id: best.id, ships: P.ships, berths: P.berths.length, cannons: P.cannons.length, pierY: pr.y };
    });
    assert.ok(info, 'a sea castle in the world');
    assert.equal(info.berths, info.ships.length);
    await frames(page, 40);
    const st = await page.evaluate(() => {
        const g = window.__zns.game, c = window.__port;
        const p = g.character.group.position;
        const chests = g.chests.filter((ch) => ch.castle && ch.castle.id === c.id && ch.room === 'port');
        return { y: p.y, sea: g.seaSurface?.mesh.visible, chests: chests.length, people: [...g.castleLife.byId.values()].filter((v) => v.cs.def.id === c.id).length };
    });
    assert.ok(Math.abs(st.y - (info.pierY + 2.0)) < 0.3, `stands on the pier (y ${st.y})`);
    assert.ok(st.sea, 'the sea surface is drawn in the harbour');
    assert.equal(st.chests, info.ships.length, 'a chest per berth on the quay');
    // a port chest opened: food and other sailors' stores float up
    const loot = await page.evaluate(() => {
        const g = window.__zns.game, c = window.__port;
        const ch = g.chests.find((x) => x.castle && x.castle.id === c.id && x.room === 'port');
        const before = g.items.loose.size;
        ch.locked = false;
        g.openChest(ch);
        return { open: ch.isOpen, got: g.items.loose.size - before };
    });
    assert.ok(loot.open && loot.got >= 2, `loot ${loot.got}`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
