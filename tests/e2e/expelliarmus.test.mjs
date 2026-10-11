/**
 * «Экспеллиармус» over the network: the host casts it at the guest — the guest's wand flies out
 * of his hand, lands 4–10 m away as a loose thing both see, and the host picks it up (the same
 * wand: colour, power…). Run alone: node --test tests/e2e/expelliarmus.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8163;
const PEER_PORT = 9017;
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
    const context = await browser.newContext({ viewport: { width: 560, height: 320 } });
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

test('«Экспеллиармус» at a second player: his wand flies off, lands, the caster picks it up', async () => {
    const host = await openPlayer('Гарри');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Драко');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(guest.page, () => document.getElementById('mp-status').textContent.includes('Подключено'), null, 30000);
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    const hostId = await ev(host.page, () => window.__zns.game.localId);

    // the guest holds a wand of his own
    const WAND = { kind: 'wand', uid: 'drako-wand', color: 0x33aa55, model: 5, power: 33, fav: 'Inferno', dir: 'duel' };
    await ev(guest.page, (w) => {
        const g = window.__zns.game;
        for (const s of ['right', 'left']) if (g.items.held[s]) g.items.releaseHand(s);
        g.items.takeIntoHand(w, 'right', { closed: true });
    }, WAND);
    assert.equal(await ev(guest.page, () => window.__zns.game.items.wand?.uid), 'drako-wand');

    // the guest stands right where the host's hand points, 12 m away
    const t = await ev(host.page, () => {
        const g = window.__zns.game;
        const o = g.character.getHandWorldPosition('right');
        const d = g.character.getHandDirection('right');
        return o.clone().addScaledVector(d, 12).toArray();
    });
    await ev(guest.page, (t) => { const g = window.__zns.game; g.character.group.position.set(t[0], t[1] - 0.6, t[2]); g.knockback.set(0, 0, 0); g.knock?.reset(); }, t);
    await wf(host.page, (t) => { const r = [...window.__zns.game.remotes.values()][0]; return Math.hypot(r.position.x - t[0], r.position.z - t[2]) < 0.6; }, t, 20000);

    // the host casts
    const cast = await ev(host.page, () => { const g = window.__zns.game; g._lastDuelCast = 0; return g._castDuel('Expelliarmus', 'Expelliarmus', true); });
    assert.equal(cast, 'Expelliarmus');
    // the guest's wand leaves his hand…
    await wf(guest.page, () => !window.__zns.game.items.wand, null, 40000);
    const voice = await ev(guest.page, () => window.__zns.game.duel.log.filter((e) => e.ev === 'disarmed').map((e) => e.out));
    assert.deepEqual(voice, ['wand']);
    // …flies as a loose thing both see, and lands
    for (const p of [host.page, guest.page]) await wf(p, () => window.__zns.game.items.loose.has('drako-wand'), null, 20000);
    await wf(host.page, () => window.__zns.game.items.loose.get('drako-wand')?.rest, null, 20000);
    const landed = await ev(host.page, (t) => {
        const L = window.__zns.game.items.loose.get('drako-wand');
        const p = L.model.position;
        return { d: Math.hypot(p.x - t[0], p.z - t[2]), item: L.item };
    }, t);
    assert.ok(landed.d > 2.5 && landed.d < 11.5, 'landed a few metres off: ' + landed.d);
    assert.equal(landed.item.color, WAND.color, 'the same wand');
    assert.equal(landed.item.power, WAND.power);

    // the caster grabs it (the host's hand reached it first)
    await ev(host.page, (id) => { const g = window.__zns.game; for (const s of ['right', 'left']) if (g.items.held[s]) g.items.releaseHand(s); g.items.pickUp('drako-wand', id, 'right'); }, hostId);
    assert.equal(await ev(host.page, () => window.__zns.game.items.wand?.uid), 'drako-wand');
    await wf(guest.page, () => !window.__zns.game.items.loose.has('drako-wand'), null, 20000);

    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await host.context.close();
    await guest.context.close();
});

test('«Экспеллиармус» at a tower wizard: his wand flies off; he runs and takes it back — or a player is quicker', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const t = g.world.terrain.data.towers.near(0, 0, 4000).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__tower = t;
        g.character.group.position.set(t.gate.x, t.gate.y + 2.2, t.gate.z);
        g.world.terrain.flushAround(t.gate.x, t.gate.z);
    });
    await page.waitForFunction(() => [...window.__zns.game.castleLife.byId.values()].some((v) => v.wizard && !v.dead && v.model?.toolKind === 'wand'), null, { timeout: 60000, polling: 300 });
    const knock = () => page.evaluate(() => {
        const g = window.__zns.game;
        const v = [...g.castleLife.byId.values()].find((v) => v.wizard && !v.dead && !v.noWand && v.model?.toolKind === 'wand' && v.role !== 'master');
        v.foe = null; v.stunT = 0;
        g.duel.applyToCreature('Expelliarmus', v, g.localId); // (the host decides castle people)
        window.__wiz = v;
        return { id: v.id, noWand: v.noWand, tool: v.model.toolKind, uid: v.lostWand?.uid, loose: !!g.items.loose.get(v.lostWand?.uid), at: [v.x, v.y, v.z] };
    });
    // 1) the wand flies off and lands; the wizard fetches it himself
    const a = await knock();
    assert.ok(a.noWand && a.tool === 'none' && a.loose, 'the wand left his hand: ' + JSON.stringify(a));
    await page.waitForFunction((uid) => window.__zns.game.items.loose.get(uid)?.rest, a.uid, { timeout: 20000, polling: 200 });
    const land = await page.evaluate(([uid, at]) => { const p = window.__zns.game.items.loose.get(uid).model.position; return Math.hypot(p.x - at[0], p.z - at[2]); }, [a.uid, a.at]);
    assert.ok(land > 1.5 && land < 11.5, 'landed a few metres off: ' + land);
    await page.waitForFunction((uid) => !window.__wiz.noWand && !window.__zns.game.items.loose.has(uid), a.uid, { timeout: 60000, polling: 300 });
    assert.equal(await page.evaluate(() => window.__wiz.model.toolKind), 'wand', 'the wand back in his hand');

    // 2) knocked out again — this time the player takes it first: it is the player's now
    const b = await knock();
    await page.evaluate((uid) => { const g = window.__zns.game; for (const s of ['right', 'left']) if (g.items.held[s]) g.items.releaseHand(s); g.items.pickUp(uid, g.localId, 'right'); }, b.uid);
    assert.equal(await page.evaluate(() => window.__zns.game.items.wand?.uid), b.uid, 'the player holds the wizard\'s wand');
    await page.waitForFunction(() => window.__wiz.lostWand === null, null, { timeout: 30000, polling: 300 }); // (he notices it is gone)
    const after = await page.evaluate(() => ({ noWand: window.__wiz.noWand, lost: window.__wiz.lostWand, tool: window.__wiz.model.toolKind }));
    assert.deepEqual(after, { noWand: true, lost: null, tool: 'none' }, 'the wizard stays without a wand');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
