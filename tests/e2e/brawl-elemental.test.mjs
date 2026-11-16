/**
 * «Битва существ»: НАСТОЯЩИЕ маги стихий (ElementalMages / EarthMages) против зомби — их магия должна ранить существ команды врага.
 * Run: node --test tests/e2e/brawl-elemental.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8198;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the real elemental mages hurt the zombies of the other team', { timeout: 1700000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
    await startFromMenu(page, 'brawl');
    await waitHudVisible(page, 120000).catch(() => {});
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms)), out = {};
        for (let i = 0; i < 300 && !g.terrain?.data?.landMade?.(0, 0); i++) await sleep(100);
        const B = g.brawl;
        out.put = [B.spawn('fire', 'A', -14, -6), B.spawn('water', 'A', -14, -2), B.spawn('earth', 'A', -14, 2), B.spawn('air', 'A', -14, 6)].map((e) => !!e);
        for (let i = 0; i < 6; i++) B.spawn('zombie', 'B', 14, -9 + i * 3.5);
        const mages = () => [...B.roster.values()].filter((e) => e.def.elemental).map((e) => g.castleLife.byId.get(e.id)).filter(Boolean);
        out.elements = mages().map((v) => v.element);
        const hp0 = g.zombies.map((z) => z.health ?? z.hp);
        const hits = {};
        const orig = g.damageZombie.bind(g);
        g.damageZombie = (z, amount, w, dir, by, ...rest) => { if (typeof by === 'string' && by.startsWith('brawlelem:')) { const el = g.castleLife.byId.get(by)?.element || '?'; hits[el] = (hits[el] || 0) + 1; } return orig(z, amount, w, dir, by, ...rest); };
        await sleep(1500);
        out.started = B.start();
        let shardHits = 0; const origSh = B.shardHit.bind(B);
        B.shardHit = (sh, b) => { const ok = origSh(sh, b); if (ok) shardHits++; return ok; };
        const phases = {};
        let lifted = 0, thrown = 0, strip = !!B._strip;
        const lv = g.levitation, origLet = lv.letGo.bind(lv);
        lv.letGo = (ck, c, gentle) => { if (typeof c.lev?.by === 'string' && c.lev.by.startsWith('brawlelem:')) { thrown++; } return origLet(ck, c, gentle); };
        for (let i = 0; i < 3000 && B.state === 'fight'; i++) {
            await sleep(100);
            if (i % 20 === 0) for (const v of mages()) { (phases[v.element] ||= new Set()).add(v.mode + ':' + (v.foe ? 'foe' : 'nofoe')); }
            for (const v of mages()) if (v.elemental?.carry && !v.elemental.carry.seen) { v.elemental.carry.seen = true; lifted++; }
        }
        out.state = B.state; out.winner = B.winner; out.alive = B.aliveCount();
        out.hits = hits; out.shardHits = shardHits; out.lifted = lifted; out.thrown = thrown; out.strip = strip || !!B._strip;
        out.phases = Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, [...v]]));
        out.zombiesLeft = g.zombies.filter((z) => !z.isDead && !z.isDying).length;
        out.mageHp = mages().map((v) => [v.element, Math.round(v.hp), Math.round(v.mana)]);
        return out;
    });
    console.log(JSON.stringify(r));
    await page.screenshot({ path: 'docs/media/brawl-elemental.png' });
    assert.ok(r.put.every(Boolean), 'all four mages were put');
    assert.deepEqual(r.elements.sort(), ['air', 'earth', 'fire', 'water']);
    assert.ok(r.started);
    assert.ok(r.strip, 'the strip between the teams is there');
    console.log('water shards that hit creatures:', r.shardHits);
    console.log('air mage: lifted', r.lifted, 'thrown/dropped', r.thrown);
    assert.ok(r.zombiesLeft < 6, 'the mages killed or the fight went: ' + r.zombiesLeft);
});
