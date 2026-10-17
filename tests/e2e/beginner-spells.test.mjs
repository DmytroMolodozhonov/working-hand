/**
 * A new world in «Выживание», host and guest: said → refused («Вы ещё не знаете …», no mana) for every spell a beginner
 * does not know (SpellBook.js); the known ones get past that check. Run: node --test tests/e2e/beginner-spells.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8177;
const PEER_PORT = 9017;
let srv, browser, peerServer;
test.before(async () => { srv = await startServer(PORT); peerServer = PeerServer({ port: PEER_PORT, path: '/zns', host: '127.0.0.1' }); browser = await launch(); });
test.after(async () => { await browser?.close(); srv?.stop(); peerServer?.close?.(); setTimeout(() => process.exit(0), 500).unref(); });

const UNKNOWN = ['Protection Maxima', 'Бомбардо Максима', 'Earthquake Максима', 'Liquidation Maxima', 'Айс Максима', 'Frozen Maxima', 'Джолт Максима',
    'Circle Attack', 'Circle Attack Maxima', 'Дравдаун', 'Overgrown', 'Брейнрот', 'Анфёрл', 'Анфёрл Максима', 'Фёрл', 'Snowman', 'Вингардиум Левиоса Максима',
    'Create a Floor', 'Create a Wall', 'Create a Door', 'Create a House', 'Create a Castle', 'Ice Bridge', 'Breakthrough', 'Create a Board',
    'Waterbollow', 'Wave Attack', 'Air Bubble', 'Water Vortex', 'Firefighting Максима', 'Let it rain', 'Fire Maxima'];
const KNOWN = ['Бомбардо', 'Earthquake', 'Liquidation', 'Protection', 'Айс', 'Джолт', 'Firefighting', 'Fire', 'Create a Bed', 'Stitching', 'Gather', 'Люмос', 'Акцио'];

async function openPlayer(name) {
    const context = await browser.newContext({ viewport: { width: 560, height: 320 } });
    const page = await context.newPage();
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns);
    await page.click('[data-tab="tab-mp"]');
    await page.fill('#mp-name', name);
    await page.click('#mp-advanced > summary');
    await page.fill('#mp-server', `127.0.0.1:${PEER_PORT}/zns`);
    return page;
}

const check = (page) => page.evaluate(({ UNKNOWN, KNOWN }) => {
    const g = window.__zns.game, said = [];
    g.hud.setVoice = (t) => said.push(String(t));
    const bad = [];
    for (const w of UNKNOWN) {
        said.length = 0;
        const mana = g.combat.fatigue;
        const r = g.castLocalSpell(w, true);
        if (r || !said.some((t) => /Вы ещё не знаете/.test(t)) || g.combat.fatigue < mana) bad.push(`${w}: ${r} ${said.join(' / ')}`);
    }
    for (const w of KNOWN) { g.castLocalSpell(w, true); if (g.lastCastWhy === 'это заклинание вы ещё не знаете') bad.push(`${w}: not known`); }
    return { bad, spells: Object.keys(g.bonus?.spells || {}), learned: [...(g.books?.learned || [])] };
}, { UNKNOWN, KNOWN });

test('a new Survival world: host and guest know only the beginner\'s spells', async () => {
    const host = await openPlayer('Хост');
    await host.evaluate(() => { document.getElementById('mp-mode').value = 'freeworld'; });
    await host.click('#mp-private-btn');
    await host.waitForFunction(() => !!document.querySelector('.mp-code-big'), null, { timeout: 30000 });
    const code = await host.textContent('.mp-code-big');
    const guest = await openPlayer('Гость');
    await guest.fill('#mp-code', code);
    await guest.click('#mp-join-btn');
    for (const p of [host, guest]) await p.waitForFunction(() => window.__zns.game?.active && window.__zns.game.config.mode === 'freeworld', null, { timeout: 120000, polling: 250 });
    for (const [who, p] of [['host', host], ['guest', guest]]) {
        const r = await check(p);
        assert.deepEqual(r.bad, [], who);
        assert.deepEqual([r.spells, r.learned], [[], []], `${who}: a new hero has learned nothing`);
    }
});
