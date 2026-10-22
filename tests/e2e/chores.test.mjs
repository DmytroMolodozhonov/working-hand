/**
 * The people's chores (Chores.js) — in a real browser: by a castle the townsfolk do their jobs
 * (the things in their hands and on the ground), and a blast near drops every chore at once.
 * Run: node --test tests/e2e/chores.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8171;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);

test('chores: the townsfolk do their jobs by the castle; danger drops them', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        const p = c.gate;
        g.character.group.position.set(p.x, p.y + 2.2, p.z);
        g.world.terrain.flushAround(p.x, p.z);
    });
    await frames(page, 100);
    // every walker sent to a chore now (instead of waiting for the dice)
    await page.evaluate(() => {
        const L = window.__zns.game.castleLife, rnd = Math.random;
        Math.random = () => 0.01; // (the dice say «a chore»)
        try { for (const v of L.byId.values()) if (v.job === 'wander' && !v.dead && !v.goingHome) { v.trips = 3; v.waitT = 0; v.path = null; L._nextTrip(v); } } finally { Math.random = rnd; }
    });
    let busy = [];
    for (let i = 0; i < 30 && busy.length < 1; i++) {
        await frames(page, 30);
        busy = await page.evaluate(() => [...window.__zns.game.castleLife.byId.values()].filter((v) => v.mode === 'chore').map((v) => ({ id: v.id, chore: v.chore, shown: v.model.chore, props: v.model.props.children.filter((o) => o.visible).length + (v.model._choreHand?.visible ? 1 : 0) })));
    }
    assert.ok(busy.length >= 1, 'somebody is at a chore');
    for (const b of busy) assert.equal(b.shown, b.chore, `${b.id}: the model shows the chore`);
    // a blast among them: nobody goes on with the chore
    const after = await page.evaluate(() => {
        const L = window.__zns.game.castleLife;
        const v = [...L.byId.values()].find((o) => o.mode === 'chore');
        L.alarm({ x: v.x + 3, y: v.y, z: v.z }, 'blast', null, 6);
        return v.id;
    });
    await frames(page, 40);
    const v = await page.evaluate((id) => { const o = window.__zns.game.castleLife.byId.get(id); return o ? { mode: o.mode, chore: o.chore, shown: o.model.chore } : null; }, after);
    if (v) { assert.notEqual(v.mode, 'chore'); assert.equal(v.shown, null); }
    assert.deepEqual(realErrors(errors), []);
});
