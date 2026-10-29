/**
 * Данжи в настоящей игре (браузер): подходишь к развалинам или подземелью — сундуки появляются сами (один раз, на своих местах),
 * открываются и дают вещи своего вида: в волшебных развалинах — волшебные (свитки), в подземельях — как в пещере.
 * Run: node --test tests/e2e/dungeons.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8187;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

/** Go to a dungeon of this kind (the nearest one in the world), wait for its chests, check them and open one. */
async function visit(page, kind) {
    return page.evaluate(async (kind) => {
        const g = window.__zns.game, t = g.terrain.data;
        if (!t.dungeons) return { err: 'this world has no dungeons (generation ' + g.gen + ')' };
        let best = null;
        for (let gz = -8; gz <= 8; gz++) for (let gx = -8; gx <= 8; gx++) {
            const s = t.dungeons.cellOf(gx, gz);
            if (s && s.type === kind && (!best || Math.hypot(s.x, s.z) < Math.hypot(best.x, best.z))) best = s;
        }
        if (!best) return { err: 'no ' + kind + ' near the start' };
        const b = best.ready();
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        // to the way in, over the ground
        const e = b.entrance;
        g.character.group.position.set(e.x, g.collision.groundY(e.x, e.z) + 6, e.z);
        let mine = [];
        for (let i = 0; i < 400; i++) {
            await sleep(100);
            mine = g.chests.filter((c) => String(c.id).startsWith(best.id));
            if (mine.length >= b.chests.length) break;
        }
        const ids = mine.map((c) => c.id);
        const out = { id: best.id, want: b.chests.length, made: mine.length, unique: new Set(ids).size, caveOf: mine.every((c) => c.cave === best.id), flavor: mine.map((c) => c.dungeonFlavor || null), looks: mine.map((c) => c.style) };
        // each chest stands where the plan says (the builder's chests are on solid floors)
        out.apart = mine.every((c) => b.chests.some((d) => Math.hypot(d.x - c.mesh.position.x, d.z - c.mesh.position.z) < 0.5));
        // a second look a moment later makes no more of them
        await sleep(1500);
        out.again = g.chests.filter((c) => String(c.id).startsWith(best.id)).length;
        // open one: things rise out of it
        const before = new Set(g.items.loose.keys());
        const w0 = g.weapons.weapons.length;
        g.openChest(mine[0]);
        await sleep(1500);
        const items = [...g.items.loose.entries()].filter(([k]) => !before.has(k)).map(([, L]) => L.item);
        out.things = items.map((it) => it.kind + (it.stat ? ':' + it.stat : '') + (it.magic ? '*' : ''));
        out.weapons = g.weapons.weapons.length - w0;
        return out;
    }, kind);
}

test('a magical ruin: its chests appear when you come, once; opened, they give things of magic (scrolls)', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld', { smooth: true });
    await waitHudVisible(page);
    const r = await visit(page, 'ruin_chapel');
    assert.ok(!r.err, r.err);
    assert.equal(r.made, r.want, `chests made ${r.made} of ${r.want}`);
    assert.equal(r.unique, r.made, 'every chest its own id');
    assert.ok(r.caveOf && r.apart, 'chests on the places of the plan');
    assert.ok(r.flavor.every((f) => f === 'magic'), 'magical ruin: magical chests');
    assert.equal(r.again, r.made, 'no second set of chests');
    assert.ok(r.things.length >= 2, `things came out of the chest: ${r.things}`);
    assert.ok(r.things.some((t) => /^scroll/.test(t) || /^wand/.test(t) || /\*/.test(t)), `magic things: ${r.things}`);
    assert.ok(!r.things.some((t) => t === 'scroll:hp' || t === 'scroll:fatigue'), 'no health / mana scrolls');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('an underground dungeon: down a stair, chests in different rooms; opened — things as of a cave', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld', { smooth: true });
    await waitHudVisible(page);
    const r = await visit(page, 'crypt');
    assert.ok(!r.err, r.err);
    assert.equal(r.made, r.want, `chests made ${r.made} of ${r.want}`);
    assert.ok(r.want >= 2 && r.want <= 3);
    assert.ok(r.flavor.every((f) => f === null), 'under the ground: no ruin flavour, the cave\'s loot');
    assert.equal(r.again, r.made);
    assert.ok(r.things.length + r.weapons >= 1, `things came out: ${r.things}`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
