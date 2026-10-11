/**
 * Blown-up buildings come down — in a real browser.
 * Run: node --test tests/e2e/collapse.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8161;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);

test('blasting the bottom of a house\'s walls: its roof falls down, the door breaks, beds and glass don\'t hang in the air', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const info = await page.evaluate(() => {
        const g = window.__zns.game, T = g.world.terrain.data;
        const c = T.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        const h = c.houses.find((x) => x.doorRec && x.kind === 'cottage') || c.houses.find((x) => x.doorRec);
        window.__h = h;
        g.character.group.position.set(h.door.x, h.door.y + 2.2, h.door.z);
        g.world.terrain.flushAround(h.door.x, h.door.z);
        return { id: h.id, kind: h.kind };
    });
    await frames(page, 40);
    const before = await page.evaluate(() => {
        const g = window.__zns.game, h = window.__h;
        return { door: g.doors.list.has(h.id + 'd'), panes: g.houses.panes.filter((p) => p.house?.h === h).length };
    });
    assert.ok(before.door, 'the house has its door');
    // stand away, then blow the walls through all round at the bottom
    const res = await page.evaluate(async () => {
        const g = window.__zns.game, T = g.world.terrain.data, h = window.__h;
        const V = g.character.group.position.constructor;
        g.character.group.position.set(h.c.x + 40, h.door.y + 2.2, h.c.z + 40);
        const L0 = Math.round(h.door.y + 1.5);
        // the highest built block over the middle (the roof)
        let top = -1;
        for (let L = L0 + 14; L > L0; L--) if (T.get(Math.round(h.c.x), L, Math.round(h.c.z)) !== 0) { top = L; break; }
        let falls = 0;
        const R = h.r + 1;
        for (let a = 0; a < 24; a++) {
            const x = h.c.x + Math.cos(a / 24 * Math.PI * 2) * (R - 1.5), z = h.c.z + Math.sin(a / 24 * Math.PI * 2) * (R - 1.5);
            const before = g.falling.pieces.length;
            g.applyExplosion(new V(x, h.door.y + 0.6, z), 2.6, true, 1, 'local');
            falls += g.falling.pieces.length - before;
        }
        return { top, falls, L0 };
    });
    await frames(page, 60);
    const after = await page.evaluate((top) => {
        const g = window.__zns.game, T = g.world.terrain.data, h = window.__h;
        const beds = [...g.beds.list.values()].filter((b) => Math.hypot(b.x - h.c.x, b.z - h.c.z) < h.r);
        const hanging = beds.filter((b) => { const L = Math.round(b.y + 1.5); return T.floorBelow(Math.round(b.x), Math.round(b.z), L) < L - 1; }).length;
        return { roofThere: T.get(Math.round(h.c.x), top, Math.round(h.c.z)) !== 0, door: g.doors.list.has(h.id + 'd'), falling: g.falling.pieces.length, hanging };
    }, res.top);
    assert.ok(res.top > res.L0 + 3, 'there was a roof');
    assert.ok(res.falls >= 1, 'something fell');
    assert.equal(after.roofThere, false, 'the roof is not hanging where it was');
    assert.equal(after.door, false, 'the door broke with its wall');
    assert.equal(after.falling, 0, 'the pieces have landed');
    assert.equal(after.hanging, 0, 'no bed hangs in the air');
    assert.deepEqual(realErrors(errors), []);
});
