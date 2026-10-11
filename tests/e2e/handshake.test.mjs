/**
 * Hands holding hands — two real browsers (a handshake, letting go, pulling apart, leading
 * another player by the hand, breaking free) and a villager (a handshake offered, being led).
 * Run: node --test tests/e2e/handshake.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { chromium } from 'playwright';
import { startServer, openPage, startFromMenu, waitHudVisible, sleep, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8171;
const PEER_PORT = 9017;
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
const hs = (page) => ev(page, () => window.__zns.game.handHold.state());
let PAGES = [], ERRS = [];
/** Wait for a hand state; on a timeout show what both computers think. */
async function until(page, fn, timeout = 5000) {
    try { await wf(page, fn, null, timeout); } catch (e) {
        for (const p of PAGES) console.log('state:', JSON.stringify(await hs(p)), JSON.stringify(await ev(p, () => { const g = window.__zns.game, hh = g.handHold, r = [...g.remotes.values()][0]; return { d: r ? hh.palm(g.character, 'right').distanceTo(hh.palm(r.character, 'right')) : null, c: g.character.getGripCurl('right'), hist: hh.hist.right.slice(-6).map((h) => [+h.c.toFixed(2), !!h.who]), log: hh.log, fps: g.frameCount }; })));
        console.log('errors:', JSON.stringify(ERRS));
        throw e;
    }
}

test('handshake between two players: hands meet, fingers close, both see it; letting go; pulling apart; leading by the hand; breaking free', async () => {
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

    // a flat open place
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
    // Put a hero at (x, z) facing yaw (a teleport), the body kept turned that way by the camera's drift
    const place = (page, x, z, yaw) => ev(page, ([x, y, z, yaw]) => {
        const g = window.__zns.game, ch = g.character;
        ch.group.position.set(x, y, z);
        ch.group.rotation.y = g.smoothBody = g.cameraBaseRotation = yaw;
        g.yawNeutral = g.smoothHead?.yaw ?? 0;
        ch.verticalVelocity = 0;
        g.knockback.set(0, 0, 0);
        if (g._solid) g._solid.has = false;
    }, [x, spot.y, z, yaw]);
    const OPEN = { arms: 'forward', rightCurl: 0, leftCurl: 0.5 };
    const SHUT = { arms: 'forward', rightCurl: 0.95, leftCurl: 0.5 };

    // The host faces −z, the guest +z: both hold the right hand out
    await place(H, spot.x, spot.z, 0);
    await place(G, spot.x, spot.z - 6, Math.PI);
    await feed2(H, OPEN, G, OPEN, 15);
    // where my right palm is, in my body's frame (the same for both: the same pose)
    const local = await ev(H, () => {
        const g = window.__zns.game, ch = g.character, T = window.__zns.THREE;
        const p = g.handHold.palm(ch, 'right').sub(ch.group.position);
        return { x: p.x, y: p.y, z: p.z, n: g.handHold.normal(ch, 'right').toArray().map((v) => +v.toFixed(2)) };
    });
    console.log('right palm (body frame, yaw 0):', JSON.stringify(local));
    // the guest stands so its right palm is 0.3 in front of the host's (a body turned by π: x and z flip)
    const gx = spot.x + local.x + local.x, gz = spot.z + local.z + local.z - 0.3;
    await place(G, gx, gz, Math.PI);
    await settle([H, G]);
    await feed2(H, OPEN, G, OPEN, 20);
    const meet = await ev(H, () => {
        const g = window.__zns.game, hh = g.handHold, r = [...g.remotes.values()][0];
        const a = hh.palm(g.character, 'right'), b = hh.palm(r.character, 'right');
        return { d: a.distanceTo(b), na: hh.normal(g.character, 'right').toArray(), nb: hh.normal(r.character, 'right').toArray() };
    });
    console.log('palms on the host screen:', JSON.stringify(meet));
    assert.ok(meet.d < 0.55, `the open hands meet (${meet.d.toFixed(2)} apart)`);
    assert.deepEqual((await hs(H)).mine, { left: null, right: null }, 'open hands touching: nothing yet');

    // both close their fingers round the other's hand
    await feed2(H, (i) => (i < 3 ? OPEN : SHUT), G, (i) => (i < 3 ? OPEN : SHUT), 12);
    await until(H, () => window.__zns.game.handHold.state().shaking.includes('right'));
    await until(G, () => window.__zns.game.handHold.state().shaking.includes('right'));
    await feed2(H, SHUT, G, SHUT, 6);
    const look = (page) => ev(page, () => {
        const g = window.__zns.game, hh = g.handHold, ch = g.character, r = [...g.remotes.values()][0];
        const mine = ch.getActiveHands().right, theirs = r.character.getActiveHands().right;
        const a = hh.palm(ch, 'right'), b = hh.palm(r.character, 'right');
        const joint = a.clone().add(b).multiplyScalar(0.5);
        const da = mine.palm.getWorldPosition(new window.__zns.THREE.Vector3()), db = theirs.palm.getWorldPosition(new window.__zns.THREE.Vector3());
        return {
            line: document.getElementById('hud-hand')?.textContent || '',
            minePose: !!mine.gripOverride?.pose, theirPose: !!theirs.gripOverride?.pose,
            mineIndex: mine.fingerMeshes.index[0].pivot.rotation.x, theirIndex: theirs.fingerMeshes.index[0].pivot.rotation.x,
            drawnApart: da.distanceTo(db), mineToJoint: da.distanceTo(joint), theirToJoint: db.distanceTo(joint), log: hh.log.slice(-5),
        };
    });
    const lh = await look(H), lg = await look(G);
    console.log('errors:', JSON.stringify(ERRS));
    console.log('shaking (host):', JSON.stringify(lh), '(guest):', JSON.stringify(lg));
    for (const [l, who] of [[lh, 'Боря'], [lg, 'Аня']]) {
        assert.equal(l.line, `🤝 Рукопожатие с ${who}`);
        assert.ok(l.minePose && l.theirPose, 'both hands in the handshake grip');
        assert.ok(l.mineIndex < -0.5 && l.theirIndex < -0.5, 'fingers closed round the other hand');
        assert.ok(l.mineToJoint < 0.45 && l.theirToJoint < 0.45, 'the joined hands are at the midpoint of the two real hands');
        assert.ok(l.drawnApart > 0.08, 'the two hands are not inside each other');
    }

    // shaking: the host's hand goes up and down — the joined hands follow, the shake goes on
    const joints = [];
    for (let k = 0; k < 6; k++) {
        const dy = k % 2 ? 0.03 : -0.03;
        await feed2(H, { ...SHUT, wristOffset: [0, dy] }, G, SHUT, 5);
        joints.push(await ev(G, () => { const g = window.__zns.game, r = [...g.remotes.values()][0]; return r.character.getActiveHands().right.palm.getWorldPosition(new window.__zns.THREE.Vector3()).y; }));
    }
    const swing = Math.max(...joints) - Math.min(...joints);
    console.log('the joined hands on the guest screen go up and down by', swing.toFixed(2));
    assert.ok(swing > 0.1, 'the shake is the host\'s real hand moving');
    await until(G, () => window.__zns.game.handHold.state().shaking.includes('right'), 300); // (still shaking)

    // letting go: both open the fingers
    await feed2(H, OPEN, G, OPEN, 12);
    await until(H, () => { const s = window.__zns.game.handHold.state(); return !s.mine.right && !s.onMe.right; });
    await until(G, () => { const s = window.__zns.game.handHold.state(); return !s.mine.right && !s.onMe.right; });
    await until(H, () => (document.getElementById('hud-hand')?.textContent || '') === '');

    // again, then pulled apart: the guest steps back — the hands slip out
    await feed2(H, (i) => (i < 3 ? OPEN : SHUT), G, (i) => (i < 3 ? OPEN : SHUT), 12);
    await until(G, () => window.__zns.game.handHold.state().shaking.includes('right'));
    await place(G, gx, gz - 1.6, Math.PI);
    await feed2(H, SHUT, G, SHUT, 15);
    await until(H, () => { const s = window.__zns.game.handHold.state(); return !s.shaking.length && !s.mine.right; });
    await until(G, () => { const s = window.__zns.game.handHold.state(); return !s.shaking.length && !s.mine.right; });
    await feed2(H, OPEN, G, OPEN, 8);

    // Leading by the hand: only the host closes round the guest's open hand
    await place(G, gx, gz, Math.PI);
    await feed2(H, OPEN, G, OPEN, 15);
    await feed2(H, (i) => (i < 3 ? OPEN : SHUT), G, OPEN, 10);
    await until(G, () => window.__zns.game.handHold.state().onMe.right?.hs === 'right');
    const held = await hs(G);
    assert.equal(held.shaking.length, 0, 'not a handshake: only one hand closed');
    assert.match(held.line, /Аня держит вас за руку/);
    assert.match((await hs(H)).line, /Вы держите за руку: Боря/);
    // the host walks backwards (+z) 5 units: the guest stumbles after the hand
    const g0 = await ev(G, () => window.__zns.game.character.group.position.z);
    for (let k = 1; k <= 25; k++) {
        await ev(H, ([z]) => { window.__zns.game.character.group.position.z = z; }, [spot.z + k * 0.2]);
        await feed2(H, SHUT, G, OPEN, 1, 30);
    }
    await feed2(H, SHUT, G, OPEN, 10);
    const g1 = await ev(G, () => window.__zns.game.character.group.position.z);
    console.log('the guest was led from z', g0.toFixed(2), 'to', g1.toFixed(2));
    assert.ok(g1 - g0 > 3, `the guest followed the hand (${(g1 - g0).toFixed(2)})`);
    assert.ok((await hs(G)).onMe.right, 'still held');
    // the host sees the guest's arm stretched to its hand
    const reach = await ev(H, () => {
        const g = window.__zns.game, r = [...g.remotes.values()][0], T = window.__zns.THREE;
        const mine = g.handHold.palm(g.character, 'right');
        return r.character.getActiveHands().right.palm.getWorldPosition(new T.Vector3()).distanceTo(mine);
    });
    assert.ok(reach < 0.6, `the held hand is drawn in the holding one (${reach.toFixed(2)})`);

    // breaking free: a sharp jerk of the held arm (straight down to the side, fast)
    await feed2(H, SHUT, G, (i) => (i < 6 ? OPEN : { arms: 'hang', rightCurl: 0, leftCurl: 0.5 }), 10, 33);
    await until(G, () => !window.__zns.game.handHold.state().onMe.right);
    await until(H, () => !window.__zns.game.handHold.state().mine.right);
    console.log('broke free by a jerk');

    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], p.errors.join('\n'));
    await host.context.close();
    await guest.context.close();
});
