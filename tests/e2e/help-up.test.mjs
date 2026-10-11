/**
 * Helping up one who lies on the ground — two real browsers: the guest is knocked down, the
 * host reaches down, both close their fingers round each other's hand, the host's hand goes
 * up and the guest's body follows it onto its feet (the hands then let go). Let go too early:
 * it sinks back. A hand only held out (not taken), raised, lifts nobody.
 * Run: node --test tests/e2e/help-up.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { chromium } from 'playwright';
import { startServer, sleep, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8173;
const PEER_PORT = 9019;
let srv, browser, peerServer;

test.before(async () => {
    srv = await startServer(PORT);
    peerServer = PeerServer({ port: PEER_PORT, path: '/zns', host: '127.0.0.1' });
    browser = await chromium.launch({ args: [
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    ] });
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
    page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns);
    await page.click('[data-tab="tab-mp"]');
    await page.fill('#mp-name', name);
    await page.click('#mp-advanced > summary');
    await page.fill('#mp-server', `127.0.0.1:${PEER_PORT}/zns`);
    return { page, errors, context };
}

const wf = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const ev = (page, fn, arg) => page.evaluate(fn, arg);

async function feed2(A, a, B, b, count, ms = 33) {
    for (let i = 0; i < count; i++) {
        const fa = frame(typeof a === 'function' ? a(i) : a), fb = frame(typeof b === 'function' ? b(i) : b);
        const inj = (raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); };
        await Promise.all([A.evaluate(inj, fa), B.evaluate(inj, fb)]);
        await sleep(ms);
    }
}

async function settle(pages, fps = 12, max = 40000) {
    const t0 = Date.now();
    while (Date.now() - t0 < max) {
        const a = await Promise.all(pages.map((p) => ev(p, () => window.__zns.game.frameCount)));
        await sleep(1000);
        const b = await Promise.all(pages.map((p) => ev(p, () => window.__zns.game.frameCount)));
        if (b.every((n, i) => n - a[i] >= fps)) return;
    }
}
const hs = (page) => ev(page, () => window.__zns.game.handHold.state());
const kd = (page) => ev(page, () => { const k = window.__zns.game.knock; return { state: k.state, lift: +k.lift.toFixed(2), pitch: +window.__zns.game.character.group.rotation.x.toFixed(2) }; });
let PAGES = [], ERRS = [];
async function until(page, fn, timeout = 5000) {
    try { await wf(page, fn, null, timeout); } catch (e) {
        for (const p of PAGES) console.log('state:', JSON.stringify(await hs(p)), JSON.stringify(await kd(p)), JSON.stringify(await ev(p, () => window.__zns.game.handHold.log)));
        console.log('errors:', JSON.stringify(ERRS));
        throw e;
    }
}

test('helping up one who lies: the hands take each other, the helper pulls up, the body follows; let go early — it sinks back', async () => {
    const host = await openPlayer('Аня');
    await host.page.evaluate(() => { document.getElementById('mp-mode').value = 'creative'; });
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Боря');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    const H = host.page, G = guest.page;
    PAGES = [H, G];
    ERRS = [host.errors, guest.errors];

    const spot = await ev(H, () => {
        const col = window.__zns.game.collision, T = window.__zns.THREE;
        for (const x of [0, 20, -20, 40, -40, 60, -60, 80, -80, 100, -100]) for (const z of [30, 60, -30, 90, -60, 120, 0]) {
            const g0 = col.groundY(x, z);
            let ok = true;
            for (let dx = -2; dx <= 7 && ok; dx += 1) for (let dz = -4; dz <= 4 && ok; dz += 1) {
                const gy = col.groundY(x + dx, z + dz);
                if (Math.abs(gy - g0) > 0.3) ok = false;
                if (col.resolveCylinder(new T.Vector3(x + dx, gy + 2, z + dz), 0.48, gy, 3.5)) ok = false;
            }
            if (ok) return { x, z, y: g0 + 2 };
        }
        return null;
    });
    assert.ok(spot, 'a flat place');
    const place = (page, x, z, yaw, dy = 0) => ev(page, ([x, y, z, yaw]) => {
        const g = window.__zns.game, ch = g.character;
        ch.group.position.set(x, y, z);
        ch.group.rotation.y = g.smoothBody = g.cameraBaseRotation = yaw;
        g.yawNeutral = g.smoothHead?.yaw ?? 0;
        ch.verticalVelocity = 0;
        g.knockback.set(0, 0, 0);
        if (g._solid) g._solid.has = false;
    }, [x, spot.y + dy, z, yaw]);
    // the guest lies on its back (long enough not to get up by itself), the right arm held up, the hand open
    const UP_OPEN = { arms: 'forward', rightCurl: 0, leftCurl: 0.5 }, UP_SHUT = { arms: 'forward', rightCurl: 0.95, leftCurl: 0.5 };
    await place(G, spot.x, spot.z, 0);
    await place(H, spot.x + 6, spot.z, Math.PI / 2);
    await settle([H, G]);
    await ev(G, () => window.__zns.game.knock.knock({ dir: 'back', down: 60 }));
    // the host reaches down: bent at the knees (`bend` 1: squatting … 0: straight), the arm forward, the wrist up or down
    const reach = (dy, curl, bend = 1) => ({ arms: 'forward', wristOffset: [0, dy], rightCurl: curl, leftCurl: 0.5, noseY: 0.25 + 0.35 * bend });
    await feed2(H, reach(0, 0), G, UP_OPEN, 30);
    assert.equal((await kd(G)).state, 'down', 'the guest lies');
    // where the guest's hand is (on the host's screen); how low the host's wrist must go to meet it
    const their = await ev(H, () => {
        const g = window.__zns.game, hh = g.handHold, r = [...g.remotes.values()][0];
        return { p: hh.palm(r.character, 'right').toArray(), kd: r.character.knockedDown };
    });
    assert.ok(their.kd, 'the host sees the guest lying');
    const myPalm = () => ev(H, () => { const g = window.__zns.game, p = g.handHold.palm(g.character, 'right'), b = g.character.group.position; return [p.x - b.x, p.y, p.z - b.z]; });
    let LOW = 0, my = null, best = Infinity;
    for (const dy of [-0.2, -0.15, -0.1, -0.05, 0, 0.05]) {
        await feed2(H, reach(dy, 0), G, UP_OPEN, 15);
        const m = await myPalm();
        const e = Math.abs(m[1] - their.p[1]);
        if (e < best) { best = e; LOW = dy; my = m; }
    }
    console.log('the lying hand:', JSON.stringify(their), 'the host\'s wrist at', LOW, 'palm', JSON.stringify(my));
    // the host steps so its palm is beside the lying hand (a few small corrections: the arms settle)
    await place(H, their.p[0] - my[0] + 0.25, their.p[2] - my[2], Math.PI / 2);
    let d0 = Infinity;
    for (let k = 0; k < 4 && d0 >= 0.4; k++) {
        await feed2(H, reach(LOW, 0), G, UP_OPEN, 15);
        const m = await ev(H, () => { const g = window.__zns.game, hh = g.handHold, r = [...g.remotes.values()][0]; const a = hh.palm(g.character, 'right'), b = hh.palm(r.character, 'right'); return { d: a.distanceTo(b), dx: b.x - a.x, dz: b.z - a.z, pos: g.character.group.position.toArray() }; });
        d0 = m.d;
        if (d0 >= 0.4) await place(H, m.pos[0] + m.dx + 0.2, m.pos[2] + m.dz, Math.PI / 2);
    }
    console.log('the two palms apart:', d0.toFixed(2));
    assert.ok(d0 < 0.55, 'the hands meet');

    // 1) a hand only held out, not taken (the guest's stays open): raised — nobody lifted
    await feed2(H, (i) => reach(LOW - Math.min(1, i / 15) * 0.1, 0, 1 - Math.min(1, i / 15)), G, UP_OPEN, 25);
    assert.equal((await kd(G)).state, 'down', 'an open hand raised lifts nobody');
    assert.equal((await kd(G)).lift, 0);
    await feed2(H, reach(LOW, 0), G, UP_OPEN, 15);

    // 2) both close their fingers round each other's hand
    await feed2(H, (i) => reach(LOW, i < 3 ? 0 : 0.95), G, (i) => (i < 3 ? UP_OPEN : UP_SHUT), 14);
    await until(G, () => { const s = window.__zns.game.handHold.state(); return s.mine.right && s.onMe.right; });
    await until(H, () => { const s = window.__zns.game.handHold.state(); return s.mine.right && s.onMe.right; });
    console.log('hands held:', JSON.stringify(await hs(G)));
    assert.match((await hs(G)).line, /Аня держит вас за руку — пусть потянет вверх/);
    assert.match((await hs(H)).line, /потяните руку вверх/);

    // the host's hand goes a little up (still bent down) and lets go: the body rose a little, then sinks back
    for (let i = 0; i < 12; i++) await feed2(H, reach(LOW - (i / 11) * 0.12, 0.95), G, UP_SHUT, 1);
    await feed2(H, reach(LOW - 0.12, 0.95), G, UP_SHUT, 5);
    const half = await kd(G);
    console.log('half way:', JSON.stringify(half));
    assert.equal(half.state, 'down');
    assert.ok(half.lift > 0.1, `the body follows the hand up (${half.lift})`);
    await feed2(H, reach(LOW - 0.12, 0), G, UP_SHUT, 25);
    await until(G, () => !window.__zns.game.handHold.state().onMe.right);
    await feed2(H, reach(LOW, 0), G, UP_SHUT, 20);
    const back = await kd(G);
    console.log('let go early:', JSON.stringify(back));
    assert.equal(back.state, 'down', 'let go early: still lying');
    assert.ok(back.lift < 0.05, 'the body sank back');
    // (the guest opens its hand too)
    await feed2(H, reach(LOW, 0), G, UP_OPEN, 12);
    await until(G, () => { const s = window.__zns.game.handHold.state(); return !s.mine.right && !s.onMe.right; });

    // 3) again — and now the host pulls all the way up: the guest stands, the hands let go
    await feed2(H, (i) => reach(LOW, i < 3 ? 0 : 0.95), G, (i) => (i < 3 ? UP_OPEN : UP_SHUT), 14);
    await until(G, () => { const s = window.__zns.game.handHold.state(); return s.mine.right && s.onMe.right; });
    const lifts = [];
    for (let i = 0; i < 24; i++) {
        const k = Math.min(1, i / 16);
        await feed2(H, reach(LOW - k * 0.2, 0.95, 1 - k), G, UP_SHUT, 1);
        if (i % 4 === 3) lifts.push(await kd(G));
    }
    console.log('pulling up:', JSON.stringify(lifts));
    await until(G, () => window.__zns.game.knock.state !== 'down', 4000);
    assert.ok(lifts.some((k) => k.lift > 0.2 && k.lift < 0.9), 'the body rose gradually, following the hand');
    await feed2(H, reach(LOW - 0.2, 0.95, 0), G, UP_SHUT, 10);
    await until(G, () => { const s = window.__zns.game.handHold.state(); return !s.mine.right && !s.onMe.right; });
    await until(H, () => { const s = window.__zns.game.handHold.state(); return !s.mine.right && !s.onMe.right; });
    await feed2(H, reach(LOW - 0.2, 0.95, 0), G, UP_SHUT, 25);
    const up = await kd(G);
    console.log('after:', JSON.stringify(up));
    assert.equal(up.state, 'up', 'on the feet');
    assert.ok(Math.abs(up.pitch) < 0.1, 'standing straight');
    assert.equal(await ev(H, () => [...window.__zns.game.remotes.values()][0].character.knockedDown), false, 'the host sees the guest standing');

    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], p.errors.join('\n'));
    await host.context.close();
    await guest.context.close();
});
