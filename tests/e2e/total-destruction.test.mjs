/**
 * «Total Destruction» — in a real browser: a castle falls into ruins.
 * Run: node --test tests/e2e/total-destruction.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8167;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);

test('pointing at a castle and saying «Total Destruction»: only with its scroll and 100 max mana; it shakes, then the castle lies in ruins', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const info = await page.evaluate(() => {
        const g = window.__zns.game, T = g.world.terrain.data;
        const c = T.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__c = c;
        // stand 40 m from it, the hand raised and pointing at its middle
        const me = g.character.group.position;
        me.set(c.x + 40, T.surfaceY(c.x + 40, c.z) + 2.2, c.z);
        g.world.terrain.flushAround(c.x, c.z);
        return { x: c.x, z: c.z };
    });
    await frames(page, 30);
    const res = await page.evaluate(() => {
        const g = window.__zns.game, T = g.world.terrain.data, c = window.__c, ch = g.character;
        const V = ch.group.position.constructor;
        ch.isArmRaised = () => true;
        ch.getHandDirection = () => {
            const o = g.castOrigin('right');
            const gy = T.surfaceY(c.x, c.z);
            return new V(c.x - o.x, gy - o.y, c.z - o.z).normalize();
        };
        // (around the place the hand points at)
        const at = T.raycast(g.castOrigin('right'), ch.getHandDirection('right'), 160);
        const ax = Math.round(at.x), az = Math.round(at.z), g0 = Math.round(T.surfaceY(c.x + 40, c.z) + 0.5);
        const built = () => { let n = 0; for (let x = ax - 9; x <= ax + 9; x++) for (let z = az - 9; z <= az + 9; z++) for (let L = g0 - 3; L < g0 + 40; L++) if (T.get(x, L, z) >= 20) n++; return n; };
        const high = () => { let n = 0; for (let x = ax - 9; x <= ax + 9; x++) for (let z = az - 9; z <= az + 9; z++) for (let L = g0 + 6; L < g0 + 40; L++) if (T.get(x, L, z) >= 20) n++; return n; };
        const out = { before: built(), highBefore: high() };
        g.lastSpellCastTime = 0;
        out.noScroll = g.castLocalSpell('Total Destruction', true);
        g.bonus = g.bonus || { hp: 0, fatigue: 0 }; g.bonus.spells = { ...(g.bonus.spells || {}), TotalDestruction: true };
        out.weak = g.castLocalSpell('Total Destruction', true);
        g.combat.addMaxFatigue(120);
        g.combat.fatigue = g.combat.maxFatigue;
        const mana0 = g.combat.fatigue;
        out.cast = g.castLocalSpell('Total Destruction', true);
        out.paid = mana0 - g.combat.fatigue;
        out.still = built(); // (it only shakes at first)
        window.__built = built; window.__high = high;
        return out;
    });
    assert.equal(res.noScroll, null, 'not without its scroll');
    assert.equal(res.weak, null, 'not with a mana maximum under 100');
    assert.equal(res.cast, 'TotalDestruction');
    assert.equal(Math.round(res.paid), 80, '80 mana');
    assert.equal(res.still, res.before, 'at first the ground only shakes');
    assert.ok(res.before > 100 && res.highBefore > 20, 'the castle stands');
    await page.waitForFunction(() => window.__zns.game.destruction.list.length === 0, null, { timeout: 150000 });
    const after = await page.evaluate(() => {
        const g = window.__zns.game;
        return { built: window.__built(), high: window.__high(), ruinSaved: g.explosions.some((e) => e.ruin), shook: g.fx.shake >= 0 };
    });
    assert.ok(after.built < res.before * 0.7, `most of the castle came down (${res.before} → ${after.built})`);
    assert.ok(after.built > 0, 'ruins are left');
    assert.ok(after.high < res.highBefore * 0.2, `no tall walls stand (${res.highBefore} → ${after.high})`);
    assert.ok(after.ruinSaved, 'kept for saves and late joiners');
    assert.deepEqual(realErrors(errors), []);
});
