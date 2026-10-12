/**
 * Danger in a castle — in a real browser: a blast in the village, the people hide in houses
 * (or run away from it, never towards it); later, when it is quiet, builders put it back.
 * Run: node --test tests/e2e/castle-danger.test.mjs
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

test('a blast in a village: people hide away from it, then builders put back what it broke', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game, T = g.world.terrain.data;
        const c = T.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__c = c;
        // in the village, by a house
        const h = c.houses[0];
        const me = g.character.group.position;
        me.set(h.door.x + 6, T.surfaceY(h.door.x + 6, h.door.z) + 2.2, h.door.z);
        g.world.terrain.flushAround(me.x, me.z);
    });
    await frames(page, 5);
    const before = await page.evaluate(() => {
        const g = window.__zns.game, L = g.castleLife, c = window.__c;
        // (the page draws slowly here: the people's life is worked out at once, a game second at a time)
        window.__live = (s) => { for (let i = 0; i < s * 4; i++) L.update(0.25); };
        window.__live(20);
        const cs = L.castles.get(c.id);
        const people = [...cs.active.values()].filter((v) => !v.dead && v.role !== 'knight' && v.role !== 'king' && v.role !== 'advisor');
        // the blast: by the house nearest to most of them (a Bombardo)
        const v0 = people[0];
        const p = new (g.character.group.position.constructor)(v0.x + 9, v0.y + 1, v0.z);
        window.__blast = { x: p.x, z: p.z };
        window.__dist0 = people.map((v) => [v.id, Math.hypot(v.x - p.x, v.z - p.z)]);
        g.applyExplosion(p, 4, true, 1, 'zz-nobody');
        return { people: people.length };
    });
    assert.ok(before.people >= 2, 'people in the village');
    const mid = await page.evaluate(() => {
        const g = window.__zns.game, L = g.castleLife, b = window.__blast;
        window.__live(5);
        const out = { states: {}, closer: 0, scared: 0 };
        for (const [id, d0] of window.__dist0) {
            const v = L.byId.get(id);
            if (!v || v.dead || d0 > 40) continue;
            if (v.fear) { out.scared++; out.states[v.fear.state] = (out.states[v.fear.state] || 0) + 1; }
            if (Math.hypot(v.x - b.x, v.z - b.z) < Math.min(d0, 10) - 1.5) out.closer++;
        }
        out.site = L.rebuild.sites.size;
        return out;
    });
    assert.ok(mid.scared >= 1, 'somebody took fright: ' + JSON.stringify(mid));
    assert.equal(mid.closer, 0, 'nobody ran towards the blast: ' + JSON.stringify(mid));
    assert.ok(mid.site >= 1, 'the broken place is remembered for the builders');
    // quiet for a long while (the clocks pushed on): builders come out and work
    const work = await page.evaluate(async () => {
        const g = window.__zns.game, L = g.castleLife, R = L.rebuild;
        g.fire.burningBlocks.clear(); g.fire.burningTrees.length = 0; // (the fire it lit burnt out)
        R._t += 1000; L.fright._t += 1000;
        for (const v of L.byId.values()) if (v.fear) v.fear.lastT -= 1000;
        const s = [...R.sites.values()][0];
        await new Promise((r) => { const t = setInterval(() => { if (s.plan || !R.sites.size) { clearInterval(t); r(); } }, 100); setTimeout(r, 15000); });
        const total = s.plan?.total || 0;
        // two game minutes of their work, worked out at once (the page draws slowly here)
        const cs = L.castles.get(window.__c.id);
        let most = 0;
        for (let i = 0; i < 480 && s.plan; i++) {
            R.update(0.25);
            most = Math.max(most, s.workers.size);
            for (const v of [...cs.active.values()]) if (v.job === 'rebuild' && !v.handLink) L._think(v, 0.25);
        }
        return { total, workers: most, log: R.log.size };
    });
    assert.ok(work.total > 0, 'there is something to put back: ' + JSON.stringify(work));
    assert.ok(work.workers >= 1 && work.log >= 3, 'builders came out and put blocks back: ' + JSON.stringify(work));
    assert.deepEqual(realErrors(errors), []);
});
