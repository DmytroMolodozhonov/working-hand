/**
 * «Water Vortex» between two computers (Выживание): the host's vortex is seen round the
 * host on the guest's screen, it flies at the guest, the guest's own computer decides the
 * hit (knocked down), the host's «Bubble» wraps the guest, «Frozen» freezes them
 * (−2 HP a second on the guest's computer), the guest's «Fire Maxima» from inside melts
 * the ice on both computers.
 * Run: ZNS_TEST_PORT=8179 node --test tests/e2e/vortex-mp.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8179;
const PEER_PORT = 9013;
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

test('Water Vortex over the network: seen by all, the hit decided by the one hit, Bubble, Frozen, Fire Maxima from inside', async () => {
    const host = await openPlayer('Маг1');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Маг2');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(guest.page, () => document.getElementById('mp-status').textContent.includes('Подключено'), null, 30000);
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    const [hostId, guestId] = await Promise.all([host.page, guest.page].map((p) => ev(p, () => window.__zns.game.localId)));
    assert.equal(await ev(host.page, () => window.__zns.game.config.mode), 'freeworld');

    // The host has gathered a vortex (as if by swinging the hand): the guest sees its rings round the host
    const hp = await ev(host.page, () => {
        const g = window.__zns.game, V = g.vortex;
        const p = g.character.group.position;
        g.character.isArmRaised = () => false; // (no camera: the arm hangs — nothing is pointed yet, it keeps gathering)
        V.state = { phase: 'gather', side: 'right', t: 0, idle: 0, still: 0, volume: 20, shown: 20, src: p.clone(), angle: 0, spin: 3, lastDir: null, power: 1 };
        return p.toArray();
    });
    await wf(guest.page, (id) => { const V = window.__zns.game.vortex; return V.remote.has(id) && V.blobs.count > 50; }, hostId, 20000);

    // The guest stands 10 m away; the host sends the vortex at them and says «Bubble» as it flies
    await ev(guest.page, (p) => {
        const g = window.__zns.game;
        g.character.group.position.set(p[0] + 10, p[1], p[2]);
        g.knockback.set(0, 0, 0);
        g.combat.shield = null;
    }, hp);
    await wf(host.page, (p) => { const r = [...window.__zns.game.remotes.values()][0]; return Math.abs(r.position.x - (p[0] + 10)) < 0.6; }, hp, 20000);
    const hpGuest0 = await ev(guest.page, () => window.__zns.game.combat.hp);
    const sent = await ev(host.page, () => {
        const g = window.__zns.game, V = g.vortex, T = window.__zns.THREE;
        const r = [...g.remotes.values()][0];
        const from = g.character.group.position.clone().add(new T.Vector3(0, 0.4, 0));
        const to = r.position.clone().add(new T.Vector3(0, 0.4, 0));
        V.state.volume = 20;
        V._launch(to.sub(from).normalize(), true); // (exactly at the guest)
        g.combat.fatigue = 30;
        return { flights: V.flights.size, bubble: g.castLocalSpell('bubble', true) };
    });
    assert.equal(sent.flights, 1);
    assert.equal(sent.bubble, 'VortexBubble', '«Bubble» said while it flies');
    // The guest's computer decides the hit: knocked down by the water, not hurt; then the bubble round them
    await wf(guest.page, () => window.__zns.game.vortex.log.some((e) => e.ev === 'push' && e.tk === 'p'), null, 30000);
    const hit = await ev(guest.page, () => { const g = window.__zns.game; return { kd: g.character.knockedDown, stunned: g.combat.stunned, stun: g.combat.stunLeft, kind: g.combat.stunKind, hp: g.combat.hp, log: g.vortex.log.slice(-6), fly: g.flight?.active }; });
    assert.ok(hit.kd, `knocked down by the vortex ${JSON.stringify(hit)}`);
    assert.equal(hit.hp, hpGuest0, 'the water does not hurt');
    await wf(guest.page, () => !!window.__zns.game.vortex.myTrap(), null, 20000);
    await wf(host.page, (id) => [...window.__zns.game.vortex.bubbles.values()].some((b) => b.tk === 'p' && b.tid === id), guestId, 20000);

    // «Frozen» from the host: the guest is in ice and loses 2 HP a second
    await wf(host.page, () => [...window.__zns.game.vortex.bubbles.values()].some((b) => b.t > 1), null, 20000);
    assert.equal(await ev(host.page, () => { window.__zns.game.combat.fatigue = 30; return window.__zns.game.castLocalSpell('frozen', true); }), 'Frozen');
    await wf(guest.page, () => window.__zns.game.vortex.myTrap()?.phase === 'ice', null, 20000);
    assert.ok(await ev(guest.page, () => window.__zns.game.combat.immobile), 'the body can\'t move in the ice');
    const hpIce = await ev(guest.page, () => window.__zns.game.combat.hp);
    await wf(guest.page, (h) => window.__zns.game.combat.hp <= h - 4, hpIce, 30000);
    // nothing but «Fire Maxima» works from inside
    assert.equal(await ev(guest.page, () => window.__zns.game.castLocalSpell('protection maxima', true)), null);
    await wf(guest.page, () => !window.__zns.game.combat.stunned, null, 20000);
    assert.equal(await ev(guest.page, () => { window.__zns.game.combat.fatigue = 30; return window.__zns.game.castLocalSpell('fire maxima', true); }), 'FireMaxima');
    await wf(guest.page, () => !window.__zns.game.vortex.myTrap() && !window.__zns.game.combat.encased, null, 20000);
    await wf(host.page, () => window.__zns.game.vortex.bubbles.size === 0, null, 20000);
    await wf(guest.page, () => window.__zns.game.vortex.bubbles.size === 0, null, 20000);
    assert.ok(await ev(host.page, () => window.__zns.game.vortex.log.some((e) => e.ev === 'melt' && e.ice)), 'the host saw the ice melt');

    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await host.context.close();
    await guest.context.close();
});
