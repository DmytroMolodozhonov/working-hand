/**
 * «Логово зельевара» в настоящей игре (браузер, воркеры): Творческий → start() → зал строится → котёл с водой над огнём, вещи на полках →
 * «Firefighting» тушит костёр → вода остывает. Снимок зала: docs/media/potion-lair-north.png.
 * Run: node --test tests/e2e/potion-lair.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8192;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the potion-maker\'s lair is built, lit, stocked; the fire goes out and the water cools', { timeout: 1700000 }, async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    await startFromMenu(page, 'creative', { smooth: true }).catch(async (e) => {
        if (!/Timeout/.test(e.message)) throw e;
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 420000 });
    });
    await waitHudVisible(page, 120000);
    if (errors?.length) console.log('PAGEERR', JSON.stringify(errors.slice(0, 5)));
    await page.exposeFunction('__shotHook', async (n) => { await page.screenshot({ path: `docs/media/potion-lair-${n}.png` }); });
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const out = {};
        out.started = g.potionLair.start();
        for (let i = 0; i < 1800 && (g.potionLair.state || !g.potionLair.plan); i++) await sleep(100);
        await sleep(3000);
        const me = g.character.group.position;
        out.pos = [Math.round(me.x), Math.round(me.y), Math.round(me.z)];
        out.inLair = g.potionLair.inLair;
        const c = g.cauldrons.list.get('potion_lair_cauldron');
        out.cauldron = !!c; out.water = c?.st.water; out.fire = c?.fire;
        out.dark = g.world.cave;
        const count = () => [...g.items.loose.values()].filter((L) => Math.abs(L.model.position.x - 1400) < 30 && Math.abs(L.model.position.z + 1400) < 30).length;
        for (let i = 0; i < 600 && count() < 52; i++) await sleep(100); // (the shelves fill in portions, a few per frame)
        out.items = count();
        await sleep(3000);
        const lairItems = [...g.items.loose.values()].filter((L) => L.item.lair);
        out.floor = lairItems.filter((L) => L.model.position.y < 96.6).length; // (nothing rolled off the shelves onto the floor)
        out.apple = lairItems.filter((L) => L.item.kind === 'apple').map((L) => Math.round(L.model.position.y * 10) / 10);
        for (let i = 0; i < 300 && !(c.st.heat >= 1); i++) await sleep(100);
        out.heat = c?.st.heat;
        await window.__shotHook?.('north');
        window.__shot1 = true;
        // the fire out (what «Firefighting» does): the water cools by and by
        for (const f of [...g.campfires.list.values()]) g.campfires._out(f);
        await sleep(6000);
        out.heatAfter = c?.st.heat;
        return out;
    });
    console.log(JSON.stringify(r));
    assert.ok(r.started && r.inLair, 'hero is in the lair');
    assert.ok(r.cauldron && r.water > 3 && r.fire, 'cauldron with water on a fire');
    assert.ok(r.items >= 52, `shelves stocked: ${r.items}`);
    assert.equal(r.floor, 0, 'no shelf item on the floor');
    assert.equal(r.apple.length, 1, `exactly one golden apple on its shelf: ${JSON.stringify(r.apple)}`);
    assert.ok(r.heat >= 1 && r.heatAfter < r.heat, 'boiled, then cooled');
    await masterCheck(page);
});

// the potion master: stands at the cauldron, answers by the rules, brews a potion with «Levitation» from the shelves and hands a flask over
async function masterCheck(page) {
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const out = { log: [] };
        g.potionLair.start();
        for (let i = 0; i < 1800 && (g.potionLair.state || !g.potionLair.plan); i++) await sleep(100);
        for (let i = 0; i < 1200 && !g.potionMaster.v; i++) await sleep(100);
        const v = g.potionMaster.v;
        out.master = !!v; out.title = v?.title; out.name = v?.name;
        if (!v) return out;
        out.listener = g.castleLife.talk._listener('привет') === v; // (he hears the hero all over the hall, not only up close)
        out.dist = Math.round(Math.hypot(v.x - g.character.group.position.x, v.z - g.character.group.position.z));
        out.where = g.potionMaster.hear(v, 'где яйцо дракона');
        out.fixed = g.cauldrons.list.get('potion_lair_cauldron').fixed === true;
        out.metMe = v.metMe === true;
        out.list = g.potionMaster.hear(v, 'какие зелья ты знаешь').slice(0, 60);
        out.recipe = g.potionMaster.hear(v, 'как сварить зелье исцеления');
        out.hint = g.potionMaster.hear(v, 'что дальше класть');
        out.start = g.potionMaster.hear(v, 'свари зелье исцеления').slice(0, 40);
        const c = g.cauldrons.list.get('potion_lair_cauldron');
        const phases = [];
        for (let i = 0; i < 9000 && g.potionMaster.job; i++) {
            const j = g.potionMaster.job;
            if (phases[phases.length - 1] !== j.phase + ':' + j.sub) phases.push(j.phase + ':' + j.sub);
            if (j.phase === 'brew' && c.st.phase === 'brewing') c.st.t = Math.max(c.st.t, (c.st.dur || 30) - 0.2); // (the brewing time: not waited at 1 frame a second)
            await sleep(100);
        }
        out.phases = phases; out.ings = JSON.stringify(c.st.ings); out.phase = c.st.phase;
        out.potions = [...g.items.loose.values()].filter((L) => L.item.kind === 'potion' && L.item.rec === 'heal').length;
        out.por = c.st.por;
        return out;
    });
    console.log(JSON.stringify(r));
    assert.ok(r.master && /Мастер зелий/.test(r.title), 'the master stands there');
    assert.ok(r.listener && r.dist >= 5, `he hears from ${r.dist} m`);
    assert.ok(/покажу|Идёмте|вот сюда/i.test(r.where), `он должен показать, а не рассказывать: ${r.where}`);
    assert.ok(r.fixed && r.metMe, 'the cauldron is fastened; he knows the guest');
    assert.ok(r.recipe.includes('золотое яблоко') && r.recipe.includes('кристалл маны'));
    assert.ok(/Принял|Варим/.test(r.start));
    assert.ok(r.phases.some((p) => p.startsWith('throw:fly')), 'ingredients flew');
    assert.ok(r.potions >= 1, 'a flask of the potion was handed over');
}
