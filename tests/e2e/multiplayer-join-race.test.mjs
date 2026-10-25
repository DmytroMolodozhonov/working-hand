/** Real local WebRTC: delayed broker response plus repeated menu actions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch, openPage, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_JOIN_TEST_PORT) || 8193;
const PEER_PORT = Number(process.env.ZNS_JOIN_PEER_PORT) || 9012;
let srv, browser, peerServer, httpServer;
test.before(async () => {
    srv = await startServer(PORT);
    peerServer = PeerServer({ port: PEER_PORT, path: '/zns', host: '127.0.0.1' }, (server) => { httpServer = server; });
    browser = await launch();
});
test.after(async () => {
    await browser?.close(); srv?.stop(); httpServer?.close();
    // PeerServer keeps internal maintenance timers: preserve the test runner's failure code.
    setTimeout(() => process.exit(process.exitCode || 0), 500).unref();
});

async function player(name) {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 1800 } });
    const context = page.context();
    await page.getByRole('button', { name: '🌐 Мультиплеер', exact: true }).click();
    await page.locator('#mp-name').fill(name);
    await page.locator('#mp-advanced > summary').click();
    await page.locator('#mp-server').fill(`127.0.0.1:${PEER_PORT}/zns`);
    await page.evaluate(() => {
        document.getElementById('fps-limit').value = '30';
        document.getElementById('graphics-quality').value = '0';
        document.getElementById('view-distance').value = 'low';
    });
    return { context, page, errors };
}

const wait = (page, fn, timeout = 180000) => page.waitForFunction(fn, null, { timeout });

test('delayed real lobby join through list and code: one peer, one roster entry, progress and retry', { timeout: 240000 }, async () => {
    const host = await player('Хост');
    // Real transport/menu, before the host starts a world. Avoid GPU speed masking connection races.
    await host.page.evaluate(async () => {
        const net = window.__zns.net;
        await net.host('Хост', document.getElementById('mp-server').value, null, { slots: true });
        net.info = { name: 'Без клонов', mode: 'creative', playing: false };
    });
    const code = await host.page.evaluate(() => window.__zns.net.code);

    for (const byCode of [false, true]) {
        const guest = await player(byCode ? 'Гость по коду' : 'Гость из списка');
        if (byCode) await guest.page.locator('#mp-code').fill(code);
        else {
            await guest.page.evaluate(() => { window.__ZNS_NO_WORLD_PROBE__ = false; });
            await guest.page.locator('#mp-refresh-btn').click();
            await wait(guest.page, () => document.getElementById('mp-server-list').textContent.includes('Без клонов'), 40000);
            assert.equal(await guest.page.locator('.mp-server-row').count(), 1);
            await guest.page.locator('.mp-server-row').click();
            await guest.page.locator('#mp-code').fill(code);
        }
        await guest.page.evaluate(() => { window.__ZNS_NO_WORLD_PROBE__ = true; window.__zns.net.stopProbe(); });
        // Real PeerJS/WebRTC, only the broker's open callback is delayed by six seconds.
        await guest.page.evaluate(() => {
            const RealPeer = window.Peer;
            window.__joinPeers = 0; window.__joinCalls = 0;
            window.Peer = class extends RealPeer {
                constructor(...args) { super(...args); window.__joinPeers++; }
                emit(type, ...args) {
                    if (type === 'open' && !this.__delayed) {
                        this.__delayed = true;
                        setTimeout(() => super.emit(type, ...args), 6000);
                        return true;
                    }
                    return super.emit(type, ...args);
                }
            };
            const net = window.__zns.net, join = net.join.bind(net);
            net.join = (...args) => { window.__joinCalls++; return join(...args); };
        });
        const button = byCode ? '#mp-join-btn' : '#mp-enter-btn';
        await guest.page.locator(button).click();
        await guest.page.evaluate(() => {
            for (let i = 0; i < 10; i++) {
                for (const id of ['mp-enter-btn', 'mp-join-btn', 'mp-host-btn', 'mp-private-btn']) document.getElementById(id)?.click();
            }
        });
        assert.equal(await guest.page.evaluate(() => window.__joinPeers), 1);
        assert.equal(await guest.page.evaluate(() => window.__joinCalls), 1);
        assert.equal(await guest.page.locator('#mp-join-btn').isDisabled(), true);
        assert.match(await guest.page.locator('#mp-status').textContent(), /Подключаемся/);
        await wait(guest.page, () => window.__zns.net.isClient && window.__zns.net.players.size === 2);
        await wait(host.page, () => window.__zns.net.conns.size === 1);
        assert.equal(await host.page.evaluate(() => window.__zns.net.conns.size), 1);
        assert.equal(await host.page.evaluate(() => window.__zns.net.players.size), 2);
        assert.equal(await guest.page.evaluate(() => window.__joinPeers), 1);
        assert.deepEqual(realErrors(guest.errors), []);
        await guest.context.close();
        await wait(host.page, () => window.__zns.net.conns.size === 0);
    }

    const retry = await player('Повтор');
    await retry.page.locator('#mp-code').fill('ZZZZZ');
    await retry.page.locator('#mp-join-btn').click();
    await wait(retry.page, () => document.getElementById('mp-status').textContent.includes('❌'), 40000);
    assert.equal(await retry.page.locator('#mp-join-btn').isDisabled(), false);
    await retry.page.locator('#mp-code').fill(code);
    await retry.page.locator('#mp-join-btn').click();
    await wait(retry.page, () => window.__zns.net.isClient && window.__zns.net.players.size === 2);
    await wait(host.page, () => window.__zns.net.conns.size === 1);
    assert.equal(await host.page.evaluate(() => window.__zns.net.players.size), 2);
    assert.deepEqual(realErrors(host.errors), []);
    await retry.context.close(); await host.context.close();
});