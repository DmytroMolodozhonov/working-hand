/**
 * «Битва существ»: обычные маги дерутся своим настоящим умом (WizardFight) против зомби; потом «полная очистка поля» чинит землю,
 * убирает трупы и вещи. Run: node --test tests/e2e/brawl-mages.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8199;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('ordinary mages fight with their real spells; the full sweep leaves a clean field', { timeout: 1700000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
    await startFromMenu(page, 'brawl');
    await waitHudVisible(page, 120000).catch(() => {});
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms)), out = {};
        for (let i = 0; i < 300 && !g.terrain?.data?.landMade?.(0, 0); i++) await sleep(100);
        const B = g.brawl;
        out.put = [B.spawn('novice', 'A', -14, -5), B.spawn('wizard', 'A', -14, 0), B.spawn('archmage', 'A', -14, 5)].map((e) => !!e);
        out.putB = [B.spawn('wizard', 'B', 14, -3), B.spawn('archmage', 'B', 14, 3), B.spawn('zombie', 'B', 16, -8), B.spawn('zombie', 'B', 16, 8)].map((e) => !!e);
        const mages = () => [...B.roster.values()].filter((e) => e.def.group === 'Маги').map((e) => g.castleLife.byId.get(e.id)).filter(Boolean);
        const hits = {}, orig = g.damageZombie.bind(g);
        g.damageZombie = (z, amount, w, dir, by, ...rest) => { if (typeof by === 'string' && by.startsWith('brawlfield:')) hits[by] = (hits[by] || 0) + 1; return orig(z, amount, w, dir, by, ...rest); };
        await sleep(1500);
        out.started = B.start();
        const modes = new Set(), spells = new Set();
        for (let i = 0; i < 3000 && B.state === 'fight'; i++) {
            await sleep(100);
            for (const v of mages()) { modes.add(v.mode); if (v.prep?.spell) spells.add(v.prep.spell); }
        }
        out.state = B.state; out.winner = B.winner; out.alive = B.aliveCount();
        out.hitsOnZombies = hits; out.modes = [...modes]; out.spells = [...spells];
        out.zombiesLeft = g.zombies.filter((z) => !z.isDead && !z.isDying).length;
        // the sweep: break the ground, lie a thing about, then clean it all
        const data = g.terrain.data;
        let L = 40; while (L > -20 && data.get(5, L, 5) === 0) L--;
        out.blockBefore = data.get(5, L, 5);
        data.set(5, L, 5, 0);
        out.blockBroken = data.get(5, L, 5);
        out.bodiesBefore = g.death.bodies.size;
        out.sweep = B.sweep();
        await sleep(500);
        out.blockAfter = data.get(5, L, 5);
        out.rosterAfter = B.count(); out.bodiesAfter = g.death.bodies.size;
        out.zombiesAfter = g.zombies.length; out.animalsAfter = g.animals.list.length;
        out.peopleAfter = [...g.castleLife.byId.values()].filter((v) => v.brawl).length;
        out.stateAfter = B.state;
        return out;
    });
    console.log(JSON.stringify(r));
    await page.screenshot({ path: 'docs/media/brawl-mages.png' });
    assert.ok(r.put.every(Boolean) && r.putB.every(Boolean));
    assert.ok(r.started);
    assert.ok(r.state === 'over' || r.alive.A + r.alive.B < 9, 'the real spells kill: ' + JSON.stringify(r.alive) + ' ' + r.spells);
    assert.equal(r.blockBroken, 0);
    assert.equal(r.blockAfter, r.blockBefore, 'the broken ground is whole again');
    assert.equal(r.rosterAfter, 0); assert.equal(r.bodiesAfter, 0); assert.equal(r.zombiesAfter, 0); assert.equal(r.peopleAfter, 0);
    assert.equal(r.stateAfter, 'setup');
});
