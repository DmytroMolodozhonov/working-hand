/**
 * The settlements' different buildings — in a real browser (world generation 11, Buildings.js): the mill's sails turn, the church bell hangs
 * in its belfry, the smith stands at his counter with arms for sale, the priest lives in the church, the doors and the glass are real.
 * Run: node --test tests/e2e/buildings.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8191;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);

test('a new world has the new buildings; the sails turn, the bell hangs, the smith sells arms, the priest lives in the church', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld', { smooth: true });
    await waitHudVisible(page);
    const gen = await page.evaluate(() => window.__zns.game.gen);
    assert.ok(gen >= 11, 'a new world is generation 11');
    // the nearest castle with a mill, a church and a smithy (a grand one has all) — else any with a smithy
    const found = await page.evaluate(() => {
        const g = window.__zns.game, d = g.world.terrain.data;
        const all = d.castles.near(0, 0, 6000).slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
        const c = all.find((s) => (s.buildings || []).some((b) => b.kind === 'mill') && s.buildings.some((b) => b.kind === 'church') && s.buildings.some((b) => b.kind === 'smithy'));
        if (!c) return null;
        window.__castle = c;
        return { id: c.id, kinds: c.buildings.map((b) => b.kind), fx: c.fx.map((f) => f.k) };
    });
    assert.ok(found, 'a castle with a mill, a church and a smithy');
    assert.ok(found.fx.includes('vanes') && found.fx.includes('bell') && found.fx.includes('smoke'));

    // ---- the mill: go to it; its sails are made and turn
    await page.evaluate(() => {
        const g = window.__zns.game, c = window.__castle, v = c.fx.find((f) => f.k === 'vanes');
        g.character.group.position.set(v.x + v.dx * 30, v.y + 8, v.z + v.dz * 30);
        g.world.terrain.flushAround(v.x, v.z);
    });
    await frames(page, 90);
    const sails = await page.evaluate(async () => {
        const g = window.__zns.game, rec = [...g.buildingFx.active.values()].find((r) => r.f.k === 'vanes');
        if (!rec) return null;
        const a = rec.rotor.rotation.z;
        const f0 = g.frameCount, t0 = performance.now();
        while (g.frameCount < f0 + 6 && performance.now() - t0 < 90000) await new Promise((r) => setTimeout(r, 100)); // (a few frames: the headless browser draws slowly)
        return { turned: rec.rotor.rotation.z !== a, y: rec.obj.position.y, ground: window.__castle.F };
    });
    assert.ok(sails && sails.turned, 'the sails turn');
    assert.ok(sails.y - 8 > sails.ground + 5, 'high over the ground');

    // ---- the church: its bell hangs (and tolls when the alarm comes)
    const bell = await page.evaluate(async () => {
        const g = window.__zns.game, c = window.__castle, f = c.fx.find((x) => x.k === 'bell' && x.big);
        g.character.group.position.set(f.x + 25, f.y + 4, f.z + 25);
        g.world.terrain.flushAround(f.x, f.z);
        const wait = async (n) => { const f0 = g.frameCount, t0 = performance.now(); while (g.frameCount < f0 + n && performance.now() - t0 < 90000) await new Promise((r) => setTimeout(r, 100)); };
        await wait(20);
        g.buildingFx.alarm({ x: f.x, y: f.y, z: f.z }, 60);
        await wait(40);
        const rec = [...g.buildingFx.active.values()].find((r) => r.f.k === 'bell' && r.f.big);
        return rec ? { swing: rec.swing, ringing: !!rec.ring || rec.swing > 0.01 } : null;
    });
    assert.ok(bell && bell.ringing, 'the bell swings in an alarm');

    // ---- the smithy: the door, the glass, the smith at his counter and arms on it
    const smith = await page.evaluate(async () => {
        const g = window.__zns.game, c = window.__castle;
        const i = c.houses.findIndex((h) => h.bld === 'smithy');
        const h = c.houses[i];
        g.character.group.position.set(h.door.x, h.door.y + 2.2, h.door.z);
        g.world.terrain.flushAround(h.door.x, h.door.z);
        window.__smithy = i;
        const stallI = c.stalls.findIndex((s) => s.shop === 'smith');
        window.__stall = stallI;
        const t0 = performance.now();
        let seller = null, goods = [];
        while (performance.now() - t0 < 170000) { // (the headless browser draws a few frames a second: the houses, the people and the goods come with the frames)
            await new Promise((r) => setTimeout(r, 400));
            seller = [...g.castleLife.byId.values()].find((v) => v.cs.def === c && v.entry.stall === stallI && !v.dead);
            const key = g.castleLife.talk?._stallKey?.(c, stallI);
            goods = [...g.items.loose.values()].filter((L) => L.item.shop?.stall === key).map((L) => L.item.kind + ':' + (L.item.type || ''));
            if (seller && goods.length >= 3 && g.houses.active.get(h.id) && g.doors.list.get(h.id + 'd')) break;
        }
        const rec = g.houses.active.get(h.id);
        return { door: !!g.doors.list.get(h.id + 'd'), doorW: g.doors.list.get(h.id + 'd')?.w, active: !!rec, title: seller?.title, trade: seller?.entry.trade, goods, panes: g.houses.glass.count };
    });
    assert.ok(smith.active && smith.door && smith.doorW === 3, 'a real door, 3 wide');
    assert.equal(smith.trade, 'smith');
    assert.equal(smith.title, 'Кузнец');
    assert.ok(smith.goods.length >= 3 && smith.goods.every((s) => /^(weapon|shield)/.test(s)), 'arms on the counter: ' + smith.goods);
    assert.ok(smith.panes >= 3, 'glass in the windows');

    // ---- the church: its first resident is the priest (in the day he is at home; the church has no bed: at night nobody is out)
    const church = await page.evaluate(async () => {
        const g = window.__zns.game, c = window.__castle, L = g.castleLife;
        const i = c.houses.findIndex((h) => h.bld === 'church');
        const h = c.houses[i];
        const first = L._homesOf(c).get(i)?.[0];
        const e = first != null ? L._roster(c, first) : null;
        let seen = null;
        if (!g.isNight) {
            g.character.group.position.set(h.door.x, h.door.y + 2.2, h.door.z + 3);
            g.world.terrain.flushAround(h.door.x, h.door.z);
            const t0 = performance.now();
            while (performance.now() - t0 < 100000 && !seen) {
                await new Promise((r) => setTimeout(r, 400));
                seen = [...L.byId.values()].find((v) => v.cs.def === c && v.job === 'home' && v.house === i && v.entry.trade === 'priest');
            }
        }
        return { trade: e?.trade, title: seen?.title, cross: seen ? !!seen.model?.look?.cross : null, night: g.isNight, flavor: h.flavor };
    });
    assert.equal(church.trade, 'priest');
    if (!church.night) { assert.ok(church.title === 'Священник' || church.title === 'Священница', 'the priest is at home: ' + church.title); assert.ok(church.cross); }
    assert.equal(church.flavor, 'scrolls');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
