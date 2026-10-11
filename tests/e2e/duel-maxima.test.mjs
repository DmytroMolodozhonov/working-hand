/**
 * «Максима» shouted in a duel clash — two players over the network: the guest shouts,
 * the host (the referee) counts it, and the meeting point moves to the host faster.
 * Run: node --test tests/e2e/duel-maxima.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8173;
const PEER_PORT = Number(process.env.ZNS_PEER_PORT) || 9031;
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
    page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('duel «Максима»: the guest shouts it in a clash — −5 mana, the host counts it, the meeting point goes to the host faster; not again within 3 s', async () => {
    const host = await openPlayer('Гарри');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Драко');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    const ids = await Promise.all([host.page, guest.page].map((p) => ev(p, () => window.__zns.game.localId)));
    assert.equal(await ev(host.page, () => window.__zns.game.config.mode), 'freeworld');

    // the guest stands 25 m in front of the host's right hand
    const t = await ev(host.page, () => {
        const g = window.__zns.game;
        return g.character.getHandWorldPosition('right').addScaledVector(g.character.getHandDirection('right'), 25).toArray();
    });
    await ev(guest.page, (t) => { const g = window.__zns.game; g.character.group.position.set(t[0], t[1] - 0.6, t[2]); g.knockback.set(0, 0, 0); }, t);
    await wf(host.page, (t) => { const r = [...window.__zns.game.remotes.values()][0]; return Math.hypot(r.position.x - t[0], r.position.z - t[2]) < 0.6; }, t, 20000);
    // no camera here: each keeps the hand on the opponent "by decree" (only their own hand)
    for (const p of [host.page, guest.page]) {
        await ev(p, () => {
            const d = window.__zns.game.duel;
            const real = d._contact.bind(d);
            d._contact = (id, ...rest) => (id === d.me ? { ok: true, jerk: false } : real(id, ...rest));
        });
    }
    // equally strong (full mana and health)
    for (const p of [host.page, guest.page]) await ev(p, () => { const c = window.__zns.game.combat; c.fatigue = c.maxFatigue || 30; c.hp = 20; });
    // the host casts, the guest answers: a clash
    await ev(host.page, () => { const g = window.__zns.game; g._lastDuelCast = 0; return g._castDuel('Stupefy', 'Stupefy', true); });
    const answered = await ev(guest.page, () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const host = [...g.remotes.values()][0];
        const target = host.position.clone().add(new T.Vector3(0, 0.6, 0));
        for (let i = 0; i < 6; i++) {
            ch.group.updateMatrixWorld(true);
            const o = g.castOrigin('right', new T.Vector3());
            const d = ch.getPointingDirection('right', new T.Vector3());
            const want = target.clone().sub(o);
            const err = Math.atan2(-want.x, -want.z) - Math.atan2(-d.x, -d.z);
            ch.group.rotation.y = g.smoothBody = g.cameraBaseRotation = ch.group.rotation.y + Math.atan2(Math.sin(err), Math.cos(err));
        }
        ch.group.updateMatrixWorld(true);
        const aim = g.duel.pickSide(true);
        if (!aim) return null;
        g.duel.cast('Stupefy', aim);
        return aim.t.id;
    });
    assert.equal(answered, ids[0]);
    await wf(host.page, () => window.__zns.game.duel.clashes.length === 1, null, 40000);
    await wf(guest.page, () => window.__zns.game.duel.clashes.length === 1, null, 20000);
    // the referee without luck or jitter, so the push is measurable
    await ev(host.page, () => { window.__realRandom = Math.random; Math.random = () => 0.5; });
    const sample = () => ev(host.page, () => { const c = window.__zns.game.duel.clashes[0]; return c ? { p: c.p, t: performance.now(), a: c.a.by, boostA: c.boostA || 0, boostB: c.boostB || 0 } : null; });
    const s0 = await sample();
    await sleep(1500);
    const s1 = await sample();
    assert.ok(s0 && s1, 'the clash goes on');
    const guestIsB = s0.a !== ids[1];
    const toHost = (a, b) => ((guestIsB ? -1 : 1) * (b.p - a.p)) / ((b.t - a.t) / 1000); // + = towards the host
    const before = toHost(s0, s1);
    // the guest shouts «Максима»
    const m0 = await ev(guest.page, () => window.__zns.game.combat.fatigue);
    const said = await ev(guest.page, () => window.__zns.game.castLocalSpell('максима', true));
    const m1 = await ev(guest.page, () => window.__zns.game.combat.fatigue);
    const pulse = await ev(guest.page, () => !!window.__zns.game.duel.clashes[0]?.pulse);
    await wf(host.page, (k) => { const c = window.__zns.game.duel.clashes[0]; return c && (c[k] || 0) === 1; }, guestIsB ? 'boostB' : 'boostA', 10000);
    const s2 = await sample();
    await sleep(1500);
    const s3 = await sample();
    const after = toHost(s2, s3);
    const again = await ev(guest.page, () => window.__zns.game.castLocalSpell('максима', true));
    const hostHeard = await ev(host.page, () => window.__zns.game.duel.log.some((e) => e.ev === 'maxima'));
    await ev(host.page, () => { Math.random = window.__realRandom; });
    assert.equal(said, 'Maxima');
    assert.ok(m0 - m1 >= 4.9, `−5 mana at once (${m0.toFixed(1)} → ${m1.toFixed(1)})`);
    assert.ok(pulse, 'the meeting point pulses');
    assert.ok(hostHeard, 'the host counted it');
    assert.ok(after > before + 0.015, `the meeting point goes to the host faster (${before.toFixed(3)} → ${after.toFixed(3)} a second)`);
    assert.equal(again, null, 'not again within 3 s');
    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await host.context.close();
    await guest.context.close();
});
