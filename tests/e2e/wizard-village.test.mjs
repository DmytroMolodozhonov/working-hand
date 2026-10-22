/**
 * A wizards' settlement in the real game: its people come out (the Elder in the hall, the sellers at
 * the crooked lane's counters with their goods), the central fire burns, the plaque is on the statue,
 * the library's scrolls lie on its table, the pawnshop buys 40 % under. Run alone:
 * node --test tests/e2e/wizard-village.test.mjs   (ZNS_SHOT=1: screenshots into scratch/)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8171;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch(); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('a wizards’ settlement comes to life: Elder, sellers with goods, the fire, the plaque, the library, the pawnshop', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const v = await page.evaluate(() => {
        const g = window.__zns.game;
        const s = g.world.terrain.data.villages.spawnVillage();
        window.__v = s;
        const f = s.stalls[0].front;
        g.character.group.position.set(f.x, f.y + 3, f.z);
        g.world.terrain.flushAround(f.x, f.z);
        return { id: s.id, x: s.x, z: s.z, houses: s.dwellings, trades: s.stalls.map((t) => t.trade) };
    });
    assert.ok(v.houses >= 80, JSON.stringify(v));
    // the people: the sellers behind their counters, the Elder in his chair
    await page.waitForFunction(() => { const L = window.__zns.game.castleLife; const cs = L.castles.get(window.__v.id); return cs?.awake && [...cs.active.values()].filter((p) => p.job === 'stall').length >= 6; }, null, { timeout: 90000, polling: 500 });
    const people = await page.evaluate(() => {
        const cs = window.__zns.game.castleLife.castles.get(window.__v.id);
        const a = [...cs.active.values()];
        return { elder: a.find((p) => p.idx === 0)?.title, sellers: a.filter((p) => p.job === 'stall').map((p) => p.entry.rank), roles: [...new Set(a.map((p) => p.role))] };
    });
    assert.equal(people.elder, 'Старейшина');
    assert.ok(people.sellers.every((r) => r === 'novice'), 'every seller is weak: ' + people.sellers);
    // the goods on the counters (not on the pawnshop's), the fire, the plaque, the library's scrolls
    await page.waitForFunction(() => {
        const g = window.__zns.game, s = window.__v;
        const goods = [...g.items.loose.values()].filter((L) => L.item.shop?.stall?.startsWith(s.id + ':'));
        const full = s.stalls.every((t, i) => t.pawn || goods.filter((L) => L.item.shop.stall === s.id + ':s' + i).length >= 3);
        return full && g.campfires.nearest(s.fire, 2.5) && g.wizVillages.plaques.has(s.id) && (g.wizVillages.scrolls.get(s.id)?.length || 0) === s.library.scrolls.length;
    }, null, { timeout: 60000, polling: 500 });
    const shop = await page.evaluate(() => {
        const g = window.__zns.game, s = window.__v;
        const pawn = s.stalls.findIndex((t) => t.pawn);
        const goods = [...g.items.loose.values()].filter((L) => L.item.shop?.stall?.startsWith(s.id + ':'));
        return { pawnGoods: goods.filter((L) => L.item.shop.stall === s.id + ':s' + pawn).length, kinds: [...new Set(goods.map((L) => L.item.kind))] };
    });
    assert.equal(shop.pawnGoods, 0, 'the pawnshop sells nothing');
    for (const k of ['potion', 'robe', 'wand', 'armor', 'scroll']) assert.ok(shop.kinds.includes(k), `${k} on sale: ${shop.kinds}`);
    // the pawnshop: a plain bow put on its counter — the price is 60 % of a merchant's (25)
    const offer = await page.evaluate(async () => {
        const g = window.__zns.game, s = window.__v;
        const st = s.stalls.find((t) => t.pawn);
        g.character.group.position.set(st.front.x, st.front.y + 1.95, st.front.z);
        const c = st.counter;
        g.items.spawnLoose({ kind: 'bow', uid: 'pawn-bow', type: 0, magic: false, bonus: 0, arrows: 5 }, new (g.character.group.position.constructor)((c.x0 + c.x1) / 2, c.top + 0.3, (c.z0 + c.z1) / 2));
        for (let i = 0; i < 100 && !(g.castleLife.talk.offer?.uid === 'pawn-bow'); i++) await new Promise((r) => setTimeout(r, 100));
        const o = g.castleLife.talk.offer;
        return o ? { price: o.price, kind: o.kind } : null;
    });
    assert.deepEqual(offer, { price: 15, kind: 'sell' }, 'the pawnshop pays 60 % of 25 for a plain bow');
    if (process.env.ZNS_SHOT) {
        const dir = path.join(ROOT, 'scratch');
        fs.mkdirSync(dir, { recursive: true });
        for (const [name, u, vv, h, lu, lv] of [['lane', 0, -15, 9, 0, -45], ['plaza', 26, -26, 22, 0, 6], ['town', 150, -150, 90, 0, 0]]) {
            await page.evaluate(([u, vv, h, lu, lv]) => {
                const g = window.__zns.game, s = window.__v;
                const wx = (a, b) => s.x + (s.rot === 0 ? a : s.rot === 1 ? -b : s.rot === 2 ? -a : b), wz = (a, b) => s.z + (s.rot === 0 ? b : s.rot === 1 ? a : s.rot === 2 ? -b : -a);
                g.character.group.position.set(wx(u, vv), s.F + h, wz(u, vv));
                g.world.terrain.flushAround(wx(u, vv), wz(u, vv));
                const dx = wx(lu, lv) - wx(u, vv), dz = wz(lu, lv) - wz(u, vv);
                g.cameraBaseRotation = Math.atan2(-dx, -dz);
                g.character.setBodyRotation?.(g.cameraBaseRotation);
            }, [u, vv, h, lu, lv]);
            await page.waitForTimeout(6000);
            await page.screenshot({ path: path.join(dir, `village-${name}.png`) });
        }
    }
    assert.deepEqual(realErrors(errors), []);
});
