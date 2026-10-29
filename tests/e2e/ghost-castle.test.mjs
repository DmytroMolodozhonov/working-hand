/**
 * Замок призраков в настоящей игре (браузер, воркеры): без зрения невидимого его нет совсем (ни блоков, ни сундуков); получил зрение — замок
 * «проявляется» на своём месте (блоки, сундуки), потерял — исчезает, земля остаётся прежней.
 * Run: node --test tests/e2e/ghost-castle.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8189;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the Castle of Ghosts: absent without the sight, in the land with it, gone again without it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld', { smooth: true });
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, v = g.terrain, d = v.data;
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        if (!d.ghost) return { err: 'no ghost index (generation ' + g.gen + ')' };
        const out = {};
        // 1) the workers decide the cells (the main thread never does): ask round the start until a castle is known
        let site = null;
        for (let t = 0; t < 400 && !site; t++) {
            for (const cz of [-1, 0, 1]) for (const cx of [-1, 0, 1]) v.ghostAsk(cx * 4600 + 768, cz * 4600 + 768);
            await sleep(100);
            site = d.ghost.list().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0] || null;
        }
        if (!site) return { err: 'no castle found within 3 × 3 × 3 cells' };
        out.id = site.id;
        const B = window.__zns.BLOCK || null;
        // 2) a hero without the sight 150 m from it: nothing of the castle in his land, no chests
        const far = { x: site.x, z: site.z - 150 };
        g.character.group.position.set(far.x, g.collision.groundY(far.x, far.z) + 8, far.z);
        g.sight.sees = false;
        for (let i = 0; i < 20; i++) await sleep(100);
        const blockAt = () => d.get(site.x, site.F, site.z);
        out.offBlock = blockAt();
        out.offOn = d.ghost.on;
        out.offChests = g.chests.filter((c) => String(c.cave || '').startsWith('gc')).length;
        // 3) the sight: the castle comes in (workers drop and make the chunks again)
        g.sight.sees = true;
        for (let i = 0; i < 300 && !(d.ghost.on && site.shown); i++) await sleep(100);
        out.on = d.ghost.on; out.shown = site.shown;
        for (let i = 0; i < 300; i++) { await sleep(100); if (d.get(site.x, site.F, site.z) >= 73 && d.get(site.x, site.F, site.z) <= 77) break; }
        out.onBlock = blockAt();
        out.hasLite = site.hasLite;
        // 4) into the castle: its chests appear (four), each its own
        g.character.group.position.set(site.x, site.F + 6, site.z);
        for (let i = 0; i < 300; i++) { await sleep(100); if (g.chests.filter((c) => String(c.cave || '').startsWith('gc')).length >= 4) break; }
        const mine = g.chests.filter((c) => String(c.cave || '').startsWith('gc'));
        out.chests = mine.length; out.unique = new Set(mine.map((c) => c.id)).size; out.local = mine.every((c) => c.localOnly); out.flavor = [...new Set(mine.map((c) => c.dungeonFlavor))];
        out.haze = g.world.ghostHaze || 0;
        // 5) the sight is gone (death takes it): the castle goes out, the chests with it, the land as it was
        g.character.group.position.set(far.x, g.collision.groundY(far.x, far.z) + 8, far.z);
        g.sight.sees = false;
        for (let i = 0; i < 300 && (d.ghost.on || site.shown); i++) await sleep(100);
        for (let i = 0; i < 100; i++) { await sleep(100); if (d.get(site.x, site.F, site.z) === 0) break; }
        out.offAgain = d.get(site.x, site.F, site.z);
        out.chestsAgain = g.chests.filter((c) => String(c.cave || '').startsWith('gc')).length;
        return out;
    });
    assert.ok(!r.err, r.err);
    assert.equal(r.offOn, false);
    assert.ok(!(r.offBlock >= 73 && r.offBlock <= 77), 'no black stone without the sight');
    assert.equal(r.offChests, 0);
    assert.ok(r.on && r.shown, 'the castle is in the land with the sight');
    assert.ok(r.onBlock >= 73 && r.onBlock <= 77, 'the terrace is black stone: ' + r.onBlock);
    assert.equal(r.chests, 4, 'four chests');
    assert.equal(r.unique, 4);
    assert.ok(r.local, 'each seer\'s own chests');
    assert.deepEqual(r.flavor, ['ghost']);
    assert.equal(r.offAgain, 0, 'the terrace is air again');
    assert.equal(r.chestsAgain, 0, 'the chests went with it');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
