/**
 * Handing a thing over — two real browsers: the SECONDARY hand touches the other's secondary hand for ~2.5 s
 * and the empty hand takes it; not from the main hand, not into a busy hand, not after a short touch.
 * Run: node --test tests/e2e/handover.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { chromium } from 'playwright';
import { startServer, openPage, startFromMenu, waitHudVisible, sleep, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8173;
const PEER_PORT = 9019;
let srv, browser, peerServer;

test.before(async () => {
    srv = await startServer(PORT);
    peerServer = PeerServer({ port: PEER_PORT, path: '/zns', host: '127.0.0.1' });
    // (two games side by side: neither window may be slowed down as a background one)
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

/** Both cameras at once: `a(i)` / `b(i)` the pose options of frame i (~30 FPS). */
async function feed2(A, a, B, b, count, ms = 33) {
    for (let i = 0; i < count; i++) {
        const fa = frame(typeof a === 'function' ? a(i) : a), fb = frame(typeof b === 'function' ? b(i) : b);
        const inj = (raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); };
        await Promise.all([A.evaluate(inj, fa), B.evaluate(inj, fb)]);
        await sleep(ms);
    }
}

/** Wait until both games run smoothly again (a teleport streams new land in: the frames stall for a while). */
async function settle(pages, fps = 12, max = 40000) {
    const t0 = Date.now();
    while (Date.now() - t0 < max) {
        const a = await Promise.all(pages.map((p) => ev(p, () => window.__zns.game.frameCount)));
        await sleep(1000);
        const b = await Promise.all(pages.map((p) => ev(p, () => window.__zns.game.frameCount)));
        if (b.every((n, i) => n - a[i] >= fps)) return;
    }
}

const held = (page, side) => ev(page, (s) => window.__zns.game.items.held[s]?.item?.kind || null, side);

test('handover: touch 2.5 s with the secondary hand into an empty secondary hand; refusals', async () => {
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
    const spot = await ev(H, () => {
        const col = window.__zns.game.collision, T = window.__zns.THREE;
        for (const x of [0, 20, -20, 40, -40, 60, -60, 80, -80]) for (const z of [30, 60, -30, 90]) {
            const g0 = col.groundY(x, z);
            let ok = true;
            for (let dx = -4; dx <= 4 && ok; dx += 1) for (let dz = -12; dz <= 10 && ok; dz += 1) {
                const gy = col.groundY(x + dx, z + dz);
                if (Math.abs(gy - g0) > 0.3) ok = false;
                if (col.resolveCylinder(new T.Vector3(x + dx, gy + 2, z + dz), 0.48, gy, 3.5)) ok = false;
            }
            if (ok) return { x, z, y: g0 + 2 };
        }
        return null;
    });
    assert.ok(spot, 'a flat place');
    const place = (page, x, z, yaw) => ev(page, ([x, y, z, yaw]) => {
        const g = window.__zns.game, ch = g.character;
        ch.group.position.set(x, y, z);
        ch.group.rotation.y = g.smoothBody = g.cameraBaseRotation = yaw;
        g.yawNeutral = g.smoothHead?.yaw ?? 0;
        ch.verticalVelocity = 0;
        g.knockback.set(0, 0, 0);
        if (g._solid) g._solid.has = false;
    }, [x, spot.y, z, yaw]);
    // (the secondary hand of a right-handed hero is the left one; the left fist closed round the thing)
    const OPEN = { arms: 'forward', rightCurl: 0, leftCurl: 0.5 };
    const FIST = { arms: 'forward', rightCurl: 0, leftCurl: 0.95 };
    await place(H, spot.x, spot.z, 0);
    await place(G, spot.x, spot.z - 6, Math.PI);
    await feed2(H, OPEN, G, OPEN, 15);
    const local = await ev(H, () => { const g = window.__zns.game, p = g.handHold.palm(g.character, 'left').sub(g.character.group.position); return { x: p.x, z: p.z }; });
    await place(G, spot.x + local.x * 2, spot.z + local.z * 2 - 0.3, Math.PI);
    await settle([H, G]);
    const dist = () => ev(H, () => { const g = window.__zns.game, hh = g.handHold, r = [...g.remotes.values()][0]; return hh.palm(g.character, 'left').distanceTo(hh.palm(r.character, 'left')); });
    await feed2(H, OPEN, G, OPEN, 20);
    const d0 = await dist();
    console.log('left palms apart', d0.toFixed(2));
    assert.ok(d0 < 1.0, 'the left hands meet');
    const give = (page, kind, side) => ev(page, ([k, s]) => { const g = window.__zns.game; g.items.takeIntoHand({ kind: k, uid: 'hov-' + Math.random().toString(36).slice(2, 8), count: 1 }, s, { closed: true }); }, [kind, side]);

    // 1) a short touch (< 2 s) passes nothing
    await give(H, 'apple', 'left');
    await feed2(H, FIST, G, OPEN, 40); // ≈ 1.3 s
    await feed2(H, FIST, G, { ...OPEN, arms: 'hang' }, 3);
    assert.equal(await held(H, 'left'), 'apple', 'a short touch: the thing stays');
    assert.equal(await held(G, 'left'), null);

    // 2) the taker's secondary hand is busy: refused, the thing stays
    await give(G, 'stick', 'left');
    await feed2(H, FIST, G, FIST, 140);
    assert.equal(await held(H, 'left'), 'apple', 'busy hand: not passed');
    assert.equal(await held(G, 'left'), 'stick');
    await ev(G, () => { const g = window.__zns.game; g.items.releaseHand('left'); });

    // 3) the full touch into an empty hand
    await feed2(H, FIST, G, OPEN, 130); // ≈ 4.3 s
    await until2(G, () => window.__zns.game.items.held.left?.item?.kind === 'apple');
    assert.equal(await held(H, 'left'), null, 'the giver let go: the thing is in one place');
    assert.equal(await held(G, 'left'), 'apple');

    // 4) from the MAIN hand nothing is passed
    await ev(G, () => { const g = window.__zns.game; g.items.releaseHand('left'); });
    await give(H, 'apple', 'right');
    await feed2(H, { arms: 'forward', rightCurl: 0.95, leftCurl: 0.5 }, G, OPEN, 140);
    assert.equal(await held(G, 'left'), null, 'the main hand does not give');
    assert.equal(await held(H, 'right'), 'apple');
    console.log('errors:', JSON.stringify([host.errors, guest.errors]));
    assert.deepEqual(realErrors(host.errors.concat(guest.errors)), []);
});

async function until2(page, fn, timeout = 6000) { await wf(page, fn, null, timeout); }
