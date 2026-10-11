/**
 * Ships between two computers: a guest standing on the host's moving ship stays on its deck
 * (both screens), the guest's hands on the wheel steer the host's ship, the guest's sail
 * spell and blows reach the host, the host's ship, sails and crew are seen by the guest.
 * Run: ZNS_TEST_PORT=8183 node --test tests/e2e/ships-mp.test.mjs
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

/** The same ship on both computers (as a port's ships are: made from the world itself). */
const toSea = (page, z) => ev(page, (z) => {
    const g = window.__zns.game;
    const S = g.terrain.data.seas, sea = S.nearest(0, 0);
    let a = 0.7;
    for (; a < 7; a += 0.3) { const q = S.pointAt(sea, a, 220); if (S.signedDist(q.x, q.z) > 160) break; }
    const p = S.pointAt(sea, a, 220);
    g.world.terrain.flushAround(p.x, p.z);
    g.ships.calm = true;
    const s = g.ships.spawn('galleon', Math.round(p.x), Math.round(p.z), 0.3, { id: 'mp-ship' });
    window.__ship = s;
    const w = s.pose.toWorld(-3, s.layout.deck + 2, z, { x: 0, y: 0, z: 0 });
    g.character.group.position.set(w.x, w.y, w.z);
    s.collider.forget(g.character.group.position);
    return true;
}, z);

test('ships over the network: aboard the host\'s moving ship, the guest\'s wheel and sails, blows on the crew', async () => {
    const host = await openPlayer('Капитан');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Юнга');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(guest.page, () => document.getElementById('mp-status').textContent.includes('Подключено'), null, 30000);
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    const guestId = await ev(guest.page, () => window.__zns.game.localId);
    await toSea(host.page, -16);
    await toSea(guest.page, 6);
    // the guest stands on the deck; the host's ship goes ahead and turns
    await wf(guest.page, () => window.__zns.game.ships.me?.ship.id === 'mp-ship', null, 30000);
    const l0 = await ev(guest.page, () => ({ ...window.__zns.game.ships.me.l }));
    await ev(host.page, () => { window.__ship.st.forced = { u: 3, r: 0.02 }; });
    await wf(host.page, () => Math.hypot(window.__ship.st.u) > 2.9 && window.__ship.st.yaw > 0.36, null, 60000);
    await wf(guest.page, () => window.__ship.st.yaw > 0.33, null, 30000);
    const g1 = await ev(guest.page, () => ({ me: window.__zns.game.ships.me?.ship.id || null, l: { ...(window.__zns.game.ships.me?.l || {}) } }));
    assert.equal(g1.me, 'mp-ship', 'the guest is still aboard on their own screen');
    assert.ok(Math.hypot(g1.l.x - l0.x, g1.l.z - l0.z) < 0.4, `and on the same spot of the deck (${Math.hypot(g1.l.x - l0.x, g1.l.z - l0.z).toFixed(2)} m)`);
    const seen = await ev(host.page, (gid) => {
        const g = window.__zns.game, r = g.remotes.get(gid), s = window.__ship;
        const l = s.pose.toLocal(r.position.x, r.position.y, r.position.z, { x: 0, y: 0, z: 0 });
        return { ship: r.ship, l };
    }, guestId);
    assert.equal(seen.ship, 'mp-ship', 'the host knows the guest stands on the ship');
    assert.ok(Math.hypot(seen.l.x - l0.x, seen.l.z - l0.z) < 0.8, 'and draws them on its deck');
    await ev(host.page, () => { window.__ship.st.forced = { u: 0, r: 0 }; });

    // the guest's hands on the wheel steer the host's ship
    await ev(guest.page, () => {
        const g = window.__zns.game, s = window.__ship, H = s.layout.helm;
        for (const sd of ['left', 'right']) g.items.releaseHand(sd);
        window.__hand = { a: 0, curl: 0 };
        g.ships.helm.input = (side) => {
            if (side !== 'right') return null;
            const w = s.pose.toWorld(H.x + Math.sin(window.__hand.a) * H.rimR, H.y + Math.cos(window.__hand.a) * H.rimR, H.z + 0.05, { x: 0, y: 0, z: 0 });
            return { G: new window.__zns.THREE.Vector3(w.x, w.y, w.z), curl: window.__hand.curl };
        };
    });
    await new Promise((r) => setTimeout(r, 600));
    await ev(guest.page, () => { window.__hand.curl = 1; });
    await wf(guest.page, () => !!window.__zns.game.ships.helm.held.right, null, 20000);
    for (let i = 1; i <= 10; i++) { await ev(guest.page, (i) => { window.__hand.a = 0.1 * i; }, i); await new Promise((r) => setTimeout(r, 250)); }
    await wf(host.page, (gid) => window.__ship.wheel > 0.4 && window.__ship.helmBy === gid, guestId, 30000);
    await ev(guest.page, () => { window.__hand.curl = 0; });

    // the guest's sails: the host lets them down, the guest sees them come down
    await ev(guest.page, () => window.__zns.game.sync.net.send({ t: 'sunf', id: 'mp-ship', s: ['main:course'], o: 1 }));
    await wf(host.page, () => window.__ship.sails.find((x) => x.id === 'main:course').target === 1, null, 20000);
    await wf(guest.page, () => window.__ship.sails.find((x) => x.id === 'main:course').open > 0.99, null, 60000);
    // the crew is the host's: a guest's blow on a sailor counts there
    const hp0 = await ev(host.page, () => { const v = [...window.__zns.game.ships.crew.byId.values()].find((x) => x.role === 'sailor'); window.__sid = v.id; return v.hp; });
    const sid = await ev(host.page, () => window.__sid);
    await ev(guest.page, (sid) => { const g = window.__zns.game, v = g.ships.crew.byId.get(sid); g.ships.crew.hit(v, 4, new window.__zns.THREE.Vector3(1, 0, 0), g.localId, {}); }, sid);
    await wf(host.page, ({ sid, hp0 }) => window.__zns.game.ships.crew.byId.get(sid).hp < hp0, { sid, hp0 }, 20000);
    assert.deepEqual(realErrors(host.errors), []);
    assert.deepEqual(realErrors(guest.errors), []);
});
