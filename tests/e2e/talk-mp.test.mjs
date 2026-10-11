/**
 * A guest talks to the host's villagers: the host's net (a fake one here) thinks the answer, its
 * first sentence reaches the guest as soon as it is written, the guest sees and hears every line;
 * words of a talk are not eaten by the checks that a spell is really mine.
 * Run: ZNS_TEST_PORT=8187 node --test tests/e2e/talk-mp.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8187;
const PEER_PORT = 9019;
let srv, browser, peerServer;

test.before(async () => {
    srv = await startServer(PORT);
    peerServer = PeerServer({ port: PEER_PORT, path: '/zns', host: '127.0.0.1' });
    browser = await launch();
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
    peerServer?.close?.();
    setTimeout(() => process.exit(0), 500).unref();
});

async function openPlayer(name) {
    const context = await browser.newContext({ viewport: { width: 480, height: 300 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns);
    await page.click('[data-tab="tab-mp"]');
    await page.fill('#mp-name', name);
    await page.click('#mp-advanced > summary');
    await page.fill('#mp-server', `127.0.0.1:${PEER_PORT}/zns`);
    return { page, errors, context };
}

const wf = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 250 });
const ev = (page, fn, arg) => page.evaluate(fn, arg);

/** Both at the castle nearest the world's centre; the hero can't die. */
const toCastle = (page) => ev(page, () => {
    const g = window.__zns.game;
    const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    window.__castle = c;
    g.character.group.position.set(c.gate.x, c.gate.y + 2.2, c.gate.z);
    g.world.terrain.flushAround(c.gate.x, c.gate.z);
    g.castleLife.talk._llmTried = true; // (no real download in the tests)
    g.combat.damage = () => {}; g.damageLocalPlayer = () => {};
    // every line a villager really says here (shown and voiced), with the time
    const L = g.castleLife;
    window.__lines = [];
    const voice = L.talk.voice.bind(L.talk);
    L.talk.voice = (v, text, ...rest) => { window.__lines.push({ id: v.id, text, t: performance.now() }); return voice(v, text, ...rest); };
    return c.id;
});

test('a guest talks to the host\'s villagers: the host\'s net answers, the first sentence comes at once, nothing is lost', async () => {
    const host = await openPlayer('Хозяин');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Друг');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await toCastle(host.page);
    await toCastle(guest.page);
    // the host's villagers are out, the guest sees them
    await wf(host.page, () => [...window.__zns.game.castleLife.byId.values()].some((v) => v.cs.def.id === window.__castle.id && !v.dead && v.role === 'farmer'), null, 60000);
    const vid = await ev(host.page, () => [...window.__zns.game.castleLife.byId.values()].find((v) => v.cs.def.id === window.__castle.id && !v.dead && v.role === 'farmer').id);
    await wf(guest.page, (id) => window.__zns.game.castleLife.byId.has(id), vid, 60000);
    // the host's net (fake): writes the first sentence in 0.3 s, the whole answer in 1.6 s
    await ev(host.page, () => {
        const T = window.__zns.game.castleLife.talk;
        T.llm = {
            ready: true,
            dispose() {},
            chat: ({ onPartial }) => new Promise((res) => {
                setTimeout(() => onPartial?.('Да ничего, путник. '), 300);
                setTimeout(() => onPartial?.('Король у нас строгий, но добрый.'), 1500);
                setTimeout(() => res('Да ничего, путник. Король у нас строгий, но добрый.'), 1600);
            }),
        };
        window.__zns.game.sync.villagerAI(true);
    });
    await wf(guest.page, () => window.__zns.game.castleLife.talk.hostSmart === true, null, 20000);
    const stand = (id) => {
        const g = window.__zns.game, v = g.castleLife.byId.get(id);
        for (const o of g.castleLife.byId.values()) { o.talking = 0; o.bowT = 999; }
        // (the villager stands still while we talk)
        g.character.group.position.set(v.x + 1.6, v.y + 1.95, v.z);
        g.character.group.rotation.y = Math.atan2(1.6, 0);
        return true;
    };
    // the villager said something before (a greeting, «Хм…»): the host's lines must still reach me
    await ev(guest.page, (id) => { const g = window.__zns.game; g.castleLife._say(g.castleLife.byId.get(id), 'Ну…', 2); }, vid);
    await ev(guest.page, stand, vid);
    const asked = await ev(guest.page, (id) => {
        const T = window.__zns.game.castleLife.talk;
        window.__asked = performance.now();
        return T.hear('как там у вас король') && T._listener()?.id === id;
    }, vid);
    assert.ok(asked, 'the villager hears the guest');
    await wf(guest.page, () => window.__lines.some((l) => l.t > window.__asked && /Король у нас строгий/.test(l.text)), null, 15000);
    const r = await ev(guest.page, (id) => {
        const after = window.__lines.filter((l) => l.t > window.__asked && l.id === id);
        const first = after.find((l) => /Да ничего, путник/.test(l.text));
        return { texts: after.map((l) => l.text), firstMs: first ? Math.round(first.t - window.__asked) : null };
    }, vid);
    assert.ok(r.firstMs !== null && r.firstMs < 1300, `the first sentence comes before the whole answer: ${r.firstMs} ms (${r.texts.join(' | ')})`);
    assert.ok(r.texts.some((t) => /^Король у нас строгий/.test(t)), `the rest after it: ${r.texts.join(' | ')}`);
    assert.equal(r.texts.filter((t) => /Да ничего, путник/.test(t)).length, 1, 'said once');

    // words of a talk with a spell's sound in them («собери» ~ Gather) reach the villager in multiplayer
    await new Promise((res) => setTimeout(res, 1700));
    await ev(guest.page, stand, vid);
    await ev(guest.page, () => { window.__asked = performance.now(); window.__zns.game.lastMagicTime = 0; window.__zns.voice.onResult('собери войско', true); });
    await wf(guest.page, (id) => window.__lines.some((l) => l.t > window.__asked && l.id === id && !/^(Хм|Э-э|Так|Сейчас|Ну)…?\.?$/.test(l.text)), vid, 15000);
    assert.deepEqual(realErrors(host.errors).filter((e) => !/PeerJS|Negotiation|connection/i.test(e)), []);
    assert.deepEqual(realErrors(guest.errors).filter((e) => !/PeerJS|Negotiation|connection/i.test(e)), []);
});
