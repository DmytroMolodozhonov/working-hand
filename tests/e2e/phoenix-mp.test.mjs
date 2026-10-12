/**
 * The phoenix between two computers (Выживание): the host flies it, the guest sees it; the guest
 * is wounded (an arm cut off, bleeding) — his computer tells the host, the host's phoenix comes
 * and heals him: the guest's own computer makes him whole, the host sees his arm back. The
 * guest's blow on it goes to the host.
 * Run: ZNS_TEST_PORT=8183 node --test tests/e2e/phoenix-mp.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8183;
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

test('phoenix over the network: seen by the guest, heals the wounded guest (host decides, guest applies), a guest\'s blow reaches the host', async () => {
    const host = await openPlayer('Маг1');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Маг2');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    const guestId = await ev(guest.page, () => window.__zns.game.localId);

    // the host's phoenix, low in the air near the guest; the guest sees it there
    await ev(host.page, (gid) => {
        const g = window.__zns.game, P = g.phoenixes;
        P.enabled = false;
        for (const f of [...P.list]) P._remove(f);
        P.callChance = 1;
        const r = g.remotes.get(gid);
        const p = r.position.clone().add(new window.__zns.THREE.Vector3(12, 8, 4));
        P.spawn(p, 'phx-test');
    }, guestId);
    await wf(guest.page, () => { const f = window.__zns.game.phoenixes.list.find((q) => q.id === 'phx-test'); return f && f.net; }, null, 10000);

    // the guest is wounded: an arm cut off, it bleeds
    await ev(guest.page, () => {
        const g = window.__zns.game;
        g.dismember._cutMine({ limb: 'rightArm', d: 0.6, n: [0, 0, 1], v: [5, 0, 0], lf: g.dismember.life }, null, true);
    });
    await wf(host.page, () => window.__zns.game.phoenixes.log.some((e) => e.ev === 'roll' && e.ok), null, 10000);
    await wf(host.page, (gid) => [...window.__zns.game.remotes.values()][0]?.character.limbs?.rightArm != null, guestId, 10000);
    // it lands, the guest stands still: it heals him (on his computer)
    await wf(guest.page, () => window.__zns.game.phoenixes.log.some((e) => e.ev === 'healed'), null, 40000);
    const g2 = await ev(guest.page, () => { const g = window.__zns.game; return { arm: g.character.limbs?.rightArm != null, bleed: g.bleeding.rate, hp: g.combat.hp, max: g.combat.maxHp || 20 }; });
    assert.deepEqual(g2, { arm: false, bleed: 0, hp: g2.max, max: g2.max }, 'the guest is whole again');
    await wf(host.page, () => [...window.__zns.game.remotes.values()][0]?.character.limbs?.rightArm == null, null, 10000);

    // the guest strikes it: the host's phoenix is hurt
    const hp0 = await ev(host.page, () => window.__zns.game.phoenixes.byId('phx-test').hp);
    await ev(guest.page, () => { const P = window.__zns.game.phoenixes; P.hit(P.list.find((q) => q.id === 'phx-test'), 4, 'melee'); });
    await wf(host.page, (h) => window.__zns.game.phoenixes.byId('phx-test').hp < h, hp0, 10000);

    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await host.context.close();
    await guest.context.close();
});
