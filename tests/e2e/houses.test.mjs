/**
 * Village houses — in a real browser: a real door, glass in the windows that
 * breaks, beds, a chest of food the family guards, animals in the pens.
 * Run: node --test tests/e2e/houses.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8189;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);

test('houses: a door in the doorway, glass that breaks, beds, a chest of food the family guards, animals in a pen', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    // to the nearest castle's village: a poor house with its chest
    const info = await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        const i = c.houses.findIndex((h) => !h.rich && h.doorRec && h.chests.length);
        window.__hi = i;
        const h = c.houses[i];
        g.character.group.position.set(h.door.x, h.door.y + 2.2, h.door.z);
        g.world.terrain.flushAround(h.door.x, h.door.z);
        return { id: h.id, kind: h.kind, pens: c.pens.length };
    });
    await frames(page, 30);
    const r = await page.evaluate(() => {
        const g = window.__zns.game, c = window.__castle, h = c.houses[window.__hi];
        const rec = g.houses.active.get(h.id);
        const door = g.doors.list.get(h.id + 'd');
        return {
            active: !!rec, door: !!door, doorW: door?.w,
            beds: h.bedSpots.filter((b, k) => g.beds.list.has(h.id + 'b' + k)).length,
            chest: g.chests.some((x) => x.id === h.id + 'c0'),
            panes: g.houses.glass.count,
            family: [...g.castleLife.byId.values()].filter((v) => v.job === 'home' && v.house === window.__hi).length,
            houses: g.houses.active.size,
        };
    });
    assert.ok(r.active && r.door && r.doorW === 3, 'a door stands in the doorway');
    assert.ok(r.beds >= 1 && r.chest, 'a bed and a chest inside');
    assert.ok(r.panes >= 4, `glass in the windows (${r.panes})`);
    assert.ok(r.family >= 1, 'somebody is at home');

    // the door: people of the house open it as they pass
    const door = await page.evaluate(async () => {
        const g = window.__zns.game, h = window.__castle.houses[window.__hi];
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const d = g.doors.list.get(h.id + 'd');
        const v = [...g.castleLife.byId.values()].find((x) => x.job === 'home' && x.house === window.__hi);
        v.homeAt = { x: d.x, y: d.y, z: d.z }; v.x = d.x; v.z = d.z; v.waitT = 30;
        const t0 = performance.now();
        while (d.a < 1 && performance.now() - t0 < 6000) await frames(2);
        return { a: d.a, open: d.boxId == null };
    });
    assert.ok(door.a >= 1 && door.open, `the door opens for its people (${door.a.toFixed(2)})`);

    // glass: a blast breaks the panes near it; broken panes are saved
    const glass = await page.evaluate(() => {
        const g = window.__zns.game;
        const p = g.houses.panes[0];
        const n0 = g.houses.panes.length;
        g.houses.hitAt({ x: p.x, y: p.y, z: p.z }, 1);
        const snap = g.houses.snapshot();
        return { n0, n1: g.houses.panes.length, saved: snap.broken.includes(p.id) };
    });
    assert.ok(glass.n1 < glass.n0 && glass.saved, 'the pane broke and stays broken');

    // the chest: food inside; the family sees me take it and attacks (cursing)
    const theft = await page.evaluate(async () => {
        const g = window.__zns.game, c = window.__castle, h = c.houses[window.__hi];
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const chest = g.chests.find((x) => x.id === h.id + 'c0');
        const fam = [...g.castleLife.byId.values()].filter((v) => v.job === 'home' && v.house === window.__hi);
        for (const v of fam) { v.x = h.inside.x; v.z = h.inside.z; v.y = h.inside.y; }
        const cp = chest.getPosition();
        g.character.group.position.set(h.inside.x, h.inside.y + 2.2, h.inside.z);
        const before = new Set(g.items.loose.keys());
        const wasOpen = chest.isOpen;
        const seen = g.castleLife.theft(window.__castle, window.__hi, g.localId, chest.getPosition());
        const dbg = JSON.stringify({ wasOpen, seen, fam: fam.map((v) => [v.id, v.entry.home, Math.round(v.x - g.character.group.position.x), Math.round(v.y), Math.round(g.character.group.position.y), g.castleLife._sees(v, g.character.group.position)]) });
        g.openChest(chest, null, g.localId);
        await frames(5);
        const loot = [...g.items.loose.values()].filter((L) => !before.has(L.item.uid)).map((L) => L.item.kind);
        const foes = fam.filter((v) => v.foe === g.localId).length;
        const said = fam.map((v) => v.bubble?.text || v.lastSaid || '').join(' | ');
        return { loot, foes, said, cp: [cp.x, cp.z], dbg };
    });
    const food = theft.loot.filter((k) => ['bread', 'cheese', 'pie', 'steak', 'apple', 'wool', 'arrows', 'coins'].includes(k)).length;
    assert.ok(theft.loot.length >= 2 && food >= theft.loot.length - 1, 'mostly food: ' + theft.loot.join(','));
    assert.ok(theft.foes >= 1, 'the family attacks the thief ' + theft.dbg);

    // pens: animals inside their fences
    if (info.pens) {
        const pen = await page.evaluate(async () => {
            const g = window.__zns.game, c = window.__castle;
            const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
            const p = c.pens[0];
            g.character.group.position.set(p.x + 8, p.y + 2.2, p.z + 8);
            g.world.terrain.flushAround(p.x, p.z);
            await frames(30);
            const mine = g.animals.list.filter((a) => a.pen && a.pen.id === p.id);
            await frames(60);
            const inside = mine.filter((a) => Math.abs(a.group.position.x - p.x) <= p.r + 0.6 && Math.abs(a.group.position.z - p.z) <= p.r + 0.6).length;
            return { n: mine.length, want: p.animals.length, inside };
        });
        assert.equal(pen.n, pen.want, 'the pen has its animals');
        assert.equal(pen.inside, pen.n, 'they stay inside the fence');
    }
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
