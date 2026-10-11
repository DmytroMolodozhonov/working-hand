/**
 * Mana (the bar at the bottom of the free world): its maximum grows with spells that work,
 * death takes the growth away — in a real browser.
 * Run: node --test tests/e2e/mana.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8171;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('mana: Левиоса lifting a cow grows the maximum to 31 («Мана: …/31» on the bar); death → 30 again', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const bar = () => document.getElementById('fatigue-text').textContent;
        await frames(10);
        for (const a of [...g.animals.list]) g.animals._remove(a);
        const before = { max: g.mana.max, bar: bar() };
        // nothing pointed at: Leviosa fails — the maximum stays
        g._lastLevitate = 0;
        const miss = g.castLocalSpell('вингардиум левиоса', true);
        const afterMiss = g.mana.max;
        const hand = ch.getHandWorldPosition('right', new T.Vector3());
        const dir = ch.getHandDirection('right', new T.Vector3()).setY(0).normalize();
        const p = hand.clone().addScaledVector(dir, 5);
        p.y = g.collision.groundY(p.x, p.z) + 0.5;
        const cow = g.animals._spawn('cow', p, {});
        await frames(3);
        g.combat.fatigue = g.combat.maxFatigue || 30;
        g._lastLevitate = 0;
        const said = g.castLocalSpell('вингардиум левиоса', true);
        await frames(10);
        const lifted = { max: g.mana.max, held: !!cow.lev, bar: bar() };
        g.levitation.release(false);
        // death: the growth is lost
        g.combat.die(null, 'test');
        await frames(3);
        const dead = g.mana.max;
        g.respawn();
        await frames(5);
        return { before, miss, afterMiss, said, lifted, dead, after: { max: g.mana.max, bar: bar() } };
    });
    assert.equal(r.before.max, 30);
    assert.match(r.before.bar, /Мана: \d+\/30/);
    assert.equal(r.miss, null);
    assert.equal(r.afterMiss, 30, 'a spell that did not work gives nothing');
    assert.equal(r.said, 'Levitation');
    assert.ok(r.lifted.held, 'the cow is lifted');
    assert.equal(r.lifted.max, 31);
    assert.match(r.lifted.bar, /Мана: \d+\/31/);
    assert.equal(r.dead, 30, 'death: back to 30');
    assert.equal(r.after.max, 30);
    assert.match(r.after.bar, /Мана: 30\/30/);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
