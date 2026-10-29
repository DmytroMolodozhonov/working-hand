/**
 * The players' voice chat — three real browsers with fake microphones (Chrome's beeping test device), the game's own
 * transport (Network.js over a local PeerJS server) and VoiceChat.js; the world itself is not loaded (three game worlds
 * in software rendering are too slow for a test machine): the players stand where the test puts them.
 *   - «Создать сервер»: the voice chat is off by default;
 *   - «через весь мир»: the voices go both ways, the «говорит» mark comes, the echo guard gets the exact copy of what is played;
 *   - changed on the go: «с радиусом» — far: silent, near: heard; «выключен» — every call ends;
 *   - a guest takes «через свои устройства» for himself: no calls of his;
 *   - a pair of guests whose direct link «failed» goes through the host;
 *   - a guest leaves: his calls end on the others, nothing of him is left.
 * Run: node --test tests/e2e/voicechat.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { chromium } from 'playwright';
import { startServer, sleep } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8173;
const PEER_PORT = 9019;
let srv, browser, peerServer;

test.before(async () => {
    srv = await startServer(PORT);
    peerServer = PeerServer({ port: PEER_PORT, path: '/zns', host: '127.0.0.1' });
    browser = await chromium.launch({ executablePath: process.env.ZNS_CHROME || undefined, args: [
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
        '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    ] });
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
    peerServer?.close?.();
    setTimeout(() => process.exit(0), 500).unref();
});

/** A page at the menu with its own Network + VoiceChat (a stand-in for the game: where the players stand, the marks). */
async function openPlayer(name, code = null) {
    const context = await browser.newContext({ viewport: { width: 480, height: 300 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; window.__ZNS_NO_FULLSCREEN__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns);
    const id = await page.evaluate(async ([name, code, server]) => {
        const { Network } = await import('/src/net/Network.js');
        const { VoiceChat } = await import('/src/net/VoiceChat.js');
        const net = new Network();
        const id = code ? await net.join(code, name, server) : (await net.host(name, server), net.code);
        const remotes = new Map();
        const game = {
            remotes, camera: { position: { x: 0, y: 3.4, z: 0 } }, collision: null, sound: null, swim: null, space: null,
            hud: { notify: (t) => { (window.__notes ||= []).push(t); }, voiceChat: (st) => { window.__vcHud = st; } },
        };
        // (the friends stand 3 m away until the test moves them)
        const keep = () => { for (const pid of net.players.keys()) if (pid !== net.localId && !remotes.has(pid)) remotes.set(pid, { id: pid, position: { x: 3, y: 2, z: 0 }, setSpeaking(on) { this.speaking = on; } }); for (const pid of [...remotes.keys()]) if (!net.players.has(pid)) remotes.delete(pid); };
        net.on('players', keep); net.on('peer-join', keep); net.on('peer-leave', keep);
        const vc = new VoiceChat({ net, game, voice: null, serverMode: code ? 'off' : 'world' });
        net.on('message', (m) => { if (typeof m?.t === 'string' && m.t.startsWith('vc')) vc.onNet(m); });
        setInterval(() => { keep(); vc.frame(0.05); }, 50);
        window.__t = { net, vc, game };
        return code ? net.localId : net.code;
    }, [name, code, `127.0.0.1:${PEER_PORT}/zns`]);
    return { page, errors, context, id };
}

const wf = (page, fn, arg, timeout = 45000) => page.waitForFunction(fn, arg, { timeout, polling: 200 });
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const st = (page) => ev(page, () => window.__t.vc.status());
const heardBy = (page) => wf(page, () => window.__t.vc.status().peers.some((p) => p.heard));

test('voice chat: off by default; world → radius → off on the go, own devices, through the host, a guest leaves', async () => {
    // «Создать сервер»: the voice chat is off until the player chooses it
    {
        const ctx = await browser.newContext();
        const p = await ctx.newPage();
        await p.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
        await p.goto(srv.url);
        await p.waitForFunction(() => !!document.getElementById('mp-voice'));
        assert.equal(await p.evaluate(() => document.getElementById('mp-voice').value), 'off', 'по умолчанию голосовой чат выключен');
        assert.equal(await p.evaluate(() => document.getElementById('mp-voice').options.length), 4, 'четыре режима');
        await ctx.close();
    }
    const host = await openPlayer('Аня');
    const code = host.id;
    const g1 = await openPlayer('Боря', code);
    const H = host.page, A = g1.page;

    // the guest learns the server's mode from the host; the voices go both ways
    await wf(A, () => window.__t.vc.status().mode === 'world');
    await heardBy(H);
    await heardBy(A);
    assert.equal((await st(A)).mic, 'on', 'микрофон чата у гостя включён');
    // the fake microphone beeps: the friend's voice is played here and the echo guard gets its exact copy
    await wf(A, () => { const r = window.__t.vc.guard.refs.get('play:H'); return !!r && performance.now() - r.last < 3000; });
    await wf(H, () => [...window.__t.vc.peers.values()].some((p) => performance.now() - p.speakAt < 3000));
    // («говорит»: the mark over his name and in the small box)
    await wf(A, () => window.__vcHud?.speakers?.length > 0 && window.__t.game.remotes.get('H')?.speaking === true);
    // (his own voice's levels come over the network too: the copy for Discord)
    await wf(A, () => !!window.__t.vc.guard.refs.get('net:H'));

    // the host switches to «с радиусом»: far away — silent; near — heard
    await ev(H, () => window.__t.vc.setServerMode('radius'));
    await wf(A, () => window.__t.vc.status().mode === 'radius');
    await ev(H, (id) => { window.__t.game.remotes.get(id).position.x = 400; }, g1.id);
    await wf(H, () => { const p = window.__t.vc.status().peers[0]; return p && p.heard && p.gain === 0; });
    await ev(H, (id) => { window.__t.game.remotes.get(id).position.x = 6; }, g1.id);
    await wf(H, () => { const p = window.__t.vc.status().peers[0]; return p && p.gain > 0; });
    // (in space there is no air: silent however near)
    await ev(H, () => { window.__t.game.camera.position.y = 40000; });
    await wf(H, () => window.__t.vc.status().peers[0].gain === 0);
    await ev(H, () => { window.__t.game.camera.position.y = 3.4; });

    // a guest takes «через свои устройства» for himself: no calls of his
    await ev(A, () => window.__t.vc.set({ me: 'own' }));
    await wf(A, () => window.__t.vc.status().mode === 'own' && window.__t.vc.calls.size === 0);
    await wf(H, () => window.__t.vc.calls.size === 0);
    await ev(A, () => window.__t.vc.set({ me: 'auto' }));
    await heardBy(A);

    // a third player; the two guests' direct link «fails»: their voices go through the host
    const g2 = await openPlayer('Вика', code);
    const B = g2.page;
    await ev(H, () => window.__t.vc.setServerMode('world'));
    await wf(B, () => window.__t.vc.status().mode === 'world');
    const ida = g1.id, idb = g2.id;
    await ev(H, ([a, b]) => { const vc = window.__t.vc; vc.failed.add(a < b ? `${a}|${b}` : `${b}|${a}`); vc.net.send(vc._modeMsg()); vc._wantCalls(); }, [ida, idb]);
    await wf(B, (a) => { const c = window.__t.vc.calls.get('r:' + a); return !!c && c.ok; }, ida, 60000);
    await wf(A, (b) => { const c = window.__t.vc.calls.get('r:' + b); return !!c && c.ok; }, idb, 60000);
    await wf(A, (b) => !window.__t.vc.calls.has('d:' + b), idb);
    assert.ok((await st(B)).relay, 'видно, что часть голосов идёт через хоста');
    // (the relayed voice is played too)
    await wf(B, (a) => { const r = window.__t.vc.guard.refs.get('play:' + a); return !!r && performance.now() - r.last < 3000; }, ida);

    // the host switches it off: every call ends
    await ev(H, () => window.__t.vc.setServerMode('off'));
    for (const P of [H, A, B]) await wf(P, () => window.__t.vc.calls.size === 0 && window.__t.vc.status().mode === 'off');
    // («вкл» again, then a guest leaves: his calls end on the others, nothing of him is left)
    await ev(H, () => window.__t.vc.setServerMode('world'));
    await wf(H, () => window.__t.vc.calls.size >= 2, null, 60000);
    await ev(B, () => { window.__t.net.sayGoodbye(); window.__t.net.leave(); });
    await g2.context.close();
    try { await wf(H, (b) => { const vc = window.__t.vc; return !vc.peers.has(b) && ![...vc.calls.values()].some((c) => c.src === b || c.with === b); }, idb); } catch (e) {
        console.log('host:', JSON.stringify(await ev(H, (b) => { const vc = window.__t.vc; return { players: [...vc.net.players.keys()], peers: [...vc.peers.keys()], calls: [...vc.calls.entries()].map(([k, c]) => [k, c.src, c.with, c.ok]), b }; }, idb)));
        throw e;
    }
    await wf(A, (b) => !window.__t.vc.peers.has(b) && !window.__t.vc.guard.refs.has('play:' + b), idb);

    assert.deepEqual([...host.errors, ...g1.errors, ...g2.errors], [], 'без ошибок на страницах');
    await sleep(100);
});
