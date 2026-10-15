/**
 * A house made by magic in a real browser: its rooms are lit as a house's (not a cave's dark) at
 * level 1 and 2, its lanterns really shine (a light at the nearest lanterns), and one lies down in
 * its bed as in a villager's.
 * Run: node --test tests/e2e/magic-house-light.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8213;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

// (the headless browser draws a few frames a second: the magic's 10 s are run at once)
const finish = (page) => page.evaluate(() => { const hm = window.__zns.game.houseMagic; for (let i = 0; i < 400 && hm.magic; i++) hm.update(0.05); return !hm.magic; });
const waitFor = async (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

test('magic house: lit rooms (levels 1 and 2), shining lanterns, its bed to lie in', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // build level 1 a little away from the start
    const start = await page.evaluate(() => {
        const g = window.__zns.game, me = g.character.group.position;
        const x = Math.round(me.x + 30), z = Math.round(me.z);
        g.houseMagic.testAim = { x, z };
        return g.houseMagic._hostStart({ kind: 'CreateHouse', at: [x, g.collision.groundY(x, z), z], c: [me.x, me.z] }, g.localId);
    });
    assert.equal(start, true);
    assert.equal(await finish(page), true);

    const inside = async (level) => page.evaluate(async (level) => {
        const g = window.__zns.game, hm = g.houseMagic, rec = [...hm.list.values()][0];
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const p = hm.plan(rec);
        const b = p.beds[0];
        // in the bedroom, beside the bed, by day
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.2;
        g.world.setDayPhase(g.dayPhase());
        const c = Math.cos(b.yaw), s = Math.sin(b.yaw), lx = 1.25 + 0.9;
        g.character.group.position.set(b.x + lx * c, b.y + 2.2, b.z - lx * s);
        g.world.terrain.flushAround?.(b.x, b.z);
        await frames(90);
        const day = { level: rec.level, cave: g._caveK, indoor: g._indoorK, sky: g.world.terrain.data.skyAt(b.x + lx * c, b.y + 0.5, b.z - lx * s) };
        // at night: the lanterns shine
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.87;
        g.world.setDayPhase(g.dayPhase());
        await frames(30);
        const lit = (g.lanterns?.lights || []).filter((l) => l.intensity > 0).map((l) => l.position.distanceTo(g.character.group.position));
        return { ...day, lit: lit.length, near: Math.min(...lit) };
    }, level);

    const l1 = await inside(1);
    assert.ok(l1.cave < 0.1, `level 1: not a cave's dark: ${JSON.stringify(l1)}`);
    assert.ok(l1.indoor > 0.9, `level 1: indoors (lit rooms): ${JSON.stringify(l1)}`);
    assert.ok(l1.sky > 0.9, `level 1: the daylight of the rooms: ${JSON.stringify(l1)}`);
    assert.ok(l1.lit >= 1 && l1.near < 12, `level 1: a lantern shines at night: ${JSON.stringify(l1)}`);

    // lie down in its bed (crouch beside it, as at a villager's bed)
    await page.evaluate(() => window.__zns.game.character.setCrouching(true));
    await waitFor(page, () => !!window.__zns.game.beds.lying, null, 15000);
    const lying = await page.evaluate(() => { const g = window.__zns.game; return g.beds.lying; });
    assert.match(lying, /^mh.*b0$/);
    await page.evaluate(() => { const g = window.__zns.game; g.character.setCrouching(false); g.beds.standUp(); });

    // level 2
    const up = await page.evaluate(() => {
        const g = window.__zns.game, hm = g.houseMagic, rec = [...hm.list.values()][0];
        const p = hm.plan(rec);
        rec.t -= 600 * 1000;
        const ax = p.rect.x1 + 4;
        g.character.group.position.set(ax + 4, g.collision.groundY(ax + 4, rec.z) + 2.2, rec.z);
        return hm._hostStart({ kind: 'ImproveHouse', at: [ax, rec.G, rec.z], c: [ax + 4, rec.z], hid: rec.id }, g.localId);
    });
    assert.equal(up, true);
    assert.equal(await finish(page), true);
    const l2 = await inside(2);
    assert.ok(l2.cave < 0.1 && l2.indoor > 0.9 && l2.sky > 0.9, `level 2: lit rooms: ${JSON.stringify(l2)}`);
    assert.ok(l2.lit >= 1 && l2.near < 12, `level 2: a lantern shines at night: ${JSON.stringify(l2)}`);
    assert.deepEqual(realErrors(errors), []);
});
