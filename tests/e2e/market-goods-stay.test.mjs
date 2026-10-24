/**
 * Goods and their price cards stay on the counter whatever the merchant does (walks off, is pushed, is scared),
 * and over minutes of game time. Run: ZNS_TEST_PORT=8199 node --test tests/e2e/market-goods-stay.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8199;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('creative market: goods and price cards stay on the counter top over time and with a disturbed merchant', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.waitForFunction(() => { const s = window.__zns.game.castleLife.talk.stalls.get('cvmarket:s0'); return s && s.goods.length >= 3; }, null, { timeout: 60000 });
    const sample = () => page.evaluate(() => {
        const g = window.__zns.game, cs = g.castleLife.castles.get('cvmarket'), c = cs.def.stalls[0].counter, s = g.castleLife.talk.stalls.get('cvmarket:s0');
        const v = [...cs.active.values()].find((x) => x.role === 'merchant');
        const tags = g.castleLife.talk._tagMap;
        return {
            top: c.top, merchant: v && { x: v.x, y: v.y, z: v.z },
            goods: s.goods.map((uid) => { const L = g.items.loose.get(uid); if (!L) return null; const p = L.model.position, t = tags?.get(uid); return { y: p.y, x: p.x, z: p.z, rest: !!L.rest, tagY: t ? t.sp.position.y : null }; }),
        };
    });
    const check = (r, when) => {
        assert.ok(r.goods.length >= 1, `${when}: goods exist`);
        for (const q of r.goods) {
            if (!q) continue;
            assert.ok(q.y > r.top - 0.05 && q.y < r.top + 1.5, `${when}: good on the counter top ${JSON.stringify(q)} top ${r.top}`);
            if (q.tagY != null) assert.ok(q.tagY > q.y, `${when}: card over its good ${JSON.stringify(q)}`);
        }
    };
    check(await sample(), 'start');
    // the merchant is shoved, tilted and frightened
    await page.evaluate(() => {
        const g = window.__zns.game, cs = g.castleLife.castles.get('cvmarket'), v = [...cs.active.values()].find((x) => x.role === 'merchant');
        v.x += 1.5; v.z -= 1.5; v.slope = 0.9;
        g.castleLife.alarm?.({ x: v.x, y: v.y, z: v.z + 6 }, 'explosion', null, 20);
    });
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(2500); check(await sample(), 'disturbed ' + i); }
    assert.deepEqual(realErrors(errors), []);
});

test('castle market: every stall keeps its goods and cards on the counter top', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        const p = c.stalls[0].front;
        g.character.group.position.set(p.x, p.y + 2.2, p.z);
        g.world.terrain.flushAround(p.x, p.z);
    });
    await page.waitForFunction(() => {
        const g = window.__zns.game, c = window.__castle;
        return c.stalls.some((_, i) => (g.castleLife.talk.stalls.get(c.id + ':s' + i)?.goods.length || 0) >= 3);
    }, null, { timeout: 90000 });
    const sample = () => page.evaluate(() => {
        const g = window.__zns.game, c = window.__castle, tags = g.castleLife.talk._tagMap, out = [];
        c.stalls.forEach((st, i) => {
            const s = g.castleLife.talk.stalls.get(c.id + ':s' + i);
            for (const uid of s?.goods || []) {
                const L = g.items.loose.get(uid); if (!L) continue;
                const p = L.model.position, t = tags?.get(uid);
                out.push({ stall: i, top: st.counter.top, y: p.y, x: p.x, z: p.z, tagY: t ? t.sp.position.y : null, rest: !!L.rest });
            }
        });
        return out;
    });
    const check = (r, when) => {
        assert.ok(r.length > 0, `${when}: goods exist`);
        for (const q of r) assert.ok(q.y > q.top - 0.05 && q.y < q.top + 1.5 && (q.tagY == null || q.tagY > q.y), `${when}: ${JSON.stringify(q)}`);
    };
    check(await sample(), 'start');
    await page.evaluate(() => {
        const g = window.__zns.game, L = g.castleLife;
        for (const v of L.byId.values()) if (v.job === 'stall') { v.x += 1.2; v.slope = 0.9; }
        const st = window.__castle.stalls[0].front;
        L.alarm?.({ x: st.x, y: st.y, z: st.z }, 'explosion', null, 30);
    });
    for (let i = 0; i < 8; i++) { await page.waitForTimeout(3000); check(await sample(), 'disturbed ' + i); }
    assert.deepEqual(realErrors(errors), []);
});
