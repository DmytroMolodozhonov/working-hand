/**
 * «Защита дома» in the real game, two players: the host builds a small house, aims at it and says
 * «Protection House», «Максима» ×3 and «стоп» (−20 −15 mana, a 7 m sphere both see); the guest
 * can't walk in — until the host aims at him and says «Protection House Grant». «Protection
 * Invisible»: the guest far off sees only the land (the terrain's shader hides the house), near —
 * the house. The Creative pedestal holds the book of protection. Run alone:
 * node --test tests/e2e/house-ward.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8171;
const PEER_PORT = 9031;
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
const frames = (page, n = 10) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

test('«Protection House» + «Максима» ×3 + «стоп»: the guest can\'t come in until «Protection House Grant»', async () => {
    const host = await openPlayer('Хозяин');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Гость');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(guest.page, () => document.getElementById('mp-status').textContent.includes('Подключено'), null, 30000);
    for (const p of [host.page, guest.page]) await wf(p, () => window.__zns.game && window.__zns.game.active && window.__zns.game.remotes.size === 1, null, 120000);

    // the host builds a little house 12 m ahead and aims at it
    const H = await ev(host.page, () => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const me = g.character.group.position;
        const cx = Math.round(me.x) + 12, cz = Math.round(me.z);
        const data = g.terrain.data;
        const L0 = data.topLayer(cx, cz) + 1;
        const list = [];
        for (let L = L0; L < L0 + 3; L++) for (let i = -2; i <= 2; i++) for (const [x, z] of [[i, -2], [i, 2], [-2, i], [2, i]]) list.push([cx + x, L, cz + z, 10]);
        g.builder.applyEdits(list);
        g.sync?.blocks?.(list);
        g.books.learned.add('ProtectionHouse'); g.books.learned.add('ProtectionHouseGrant'); g.books.learned.add('ProtectionInvisible');
        g.combat.maxFatigue = 200; g.combat.fatigue = 200;
        const aim = (to) => { g.wards._hand = () => { const o = g.character.group.position.clone().add(new T.Vector3(0, 2, 0)); return { side: 'right', o, d: to.clone().sub(o).normalize() }; }; };
        window.__aim = aim;
        aim(new T.Vector3(cx - 2, L0 - 0.5, cz));
        return { cx, cz, L0 };
    });
    const mana0 = await ev(host.page, () => window.__zns.game.combat.fatigue);
    assert.equal(await ev(host.page, () => window.__zns.game._castLocalSpell('протекшн хаус', true)), 'ProtectionHouse');
    // the charge lands; the dome grows by itself while the hand is on it (no «Максима»)
    await wf(host.page, () => { const w = [...window.__zns.game.wards.list.values()][0]; return w && w.r >= 7; }, null, 20000);
    assert.equal(await ev(host.page, () => window.__zns.game._castLocalSpell('стоп', true)), 'Stand');
    const w = await ev(host.page, () => { const w = [...window.__zns.game.wards.list.values()][0]; return { r: w.r, c: w.c, setting: w.setting, mana: window.__zns.game.combat.fatigue }; });
    assert.ok(w.r >= 7 && w.r < 8, `${w.r}`);
    assert.equal(w.setting, false);
    assert.ok(Math.abs(mana0 - w.mana - (20 + 3 * (w.r - 1.5))) < 2.5, `20 + 3 a metre: ${mana0 - w.mana}`);
    // the guest's computer has the same sphere
    await wf(guest.page, (r) => { const W = window.__zns.game.wards; return W.list.size === 1 && Math.abs([...W.list.values()][0].r - r) < 0.02; }, w.r, 20000);

    // the guest walks at it: pushed back at the surface
    const tryIn = () => ev(guest.page, async (c) => {
        const g = window.__zns.game;
        const p = g.character.group.position;
        const y = g.collision.groundY(c.x - 6, c.z) + 2.2;
        p.set(c.x - 6.6, y, c.z);
        await new Promise((r) => setTimeout(r, 300));
        p.set(c.x - 6.4, p.y, c.z); // (a step into it)
        await new Promise((res) => { let k = 0; const f = () => (++k >= 6 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
        return Math.hypot(p.x - c.x, p.y - 1 - c.y, p.z - c.z);
    }, w.c);
    const out = await tryIn();
    assert.ok(out >= w.r - 0.05, `the guest stays out: ${out}`);

    // the host lets him in: aims at him and says «Protection House Grant»
    const guestAt = await ev(guest.page, (c) => { const g = window.__zns.game; const p = g.character.group.position; p.set(c.x - 9, g.collision.groundY(c.x - 9, c.z) + 2.2, c.z); return p.toArray(); }, w.c);
    await wf(host.page, (t) => { const r = [...window.__zns.game.remotes.values()][0]; return Math.hypot(r.position.x - t[0], r.position.z - t[2]) < 0.8; }, guestAt, 20000);
    await ev(host.page, (c) => {
        const g = window.__zns.game, T = window.__zns.THREE;
        g.character.group.position.set(c.x - 6, g.character.group.position.y, c.z + 2);
        const r = [...g.remotes.values()][0];
        window.__aim(r.position.clone().add(new T.Vector3(0, 1.4, 0)));
    }, w.c);
    assert.equal(await ev(host.page, () => window.__zns.game._castLocalSpell('протекшн хаус грант', true)), 'ProtectionHouseGrant');
    await wf(guest.page, () => [...window.__zns.game.wards.list.values()][0].ids?.includes(window.__zns.game.localId), null, 20000);
    const inside = await ev(guest.page, async (c) => {
        const g = window.__zns.game;
        const p = g.character.group.position;
        p.set(c.x - 1, p.y, c.z);
        await new Promise((res) => { let k = 0; const f = () => (++k >= 6 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
        return Math.hypot(p.x - c.x, p.z - c.z);
    }, w.c);
    assert.ok(inside < 2, `now the guest comes in: ${inside}`);

    // «Protection Invisible»: the guest far off sees only the land, near — the house
    await ev(guest.page, (c) => { const g = window.__zns.game; const p = g.character.group.position; p.set(c.x - 30, g.collision.groundY(c.x - 30, c.z) + 2.2, c.z); }, w.c);
    await ev(host.page, (c) => { const T = window.__zns.THREE; window.__aim(new T.Vector3(c.x, c.y, c.z)); window.__zns.game._lastWardCast = {}; }, w.c);
    assert.equal(await ev(host.page, () => window.__zns.game._castLocalSpell('протекшн инвизибл', true)), 'ProtectionInvisible');
    await wf(guest.page, () => [...window.__zns.game.wards.list.values()][0].inv, null, 20000);
    await frames(guest.page, 10);
    const far = await ev(guest.page, () => { const W = window.__zns.game.wards; const L = [...W.looks.values()][0]; return { n: window.__zns.wardHide?.n.value ?? null, k: L.k, disc: !!L.disc?.visible }; });
    assert.ok(far.k < 0.01 && far.disc, 'far: hidden, the land drawn over it ' + JSON.stringify(far));
    await ev(guest.page, (c) => { const p = window.__zns.game.character.group.position; p.set(c.x - 7 - 2, p.y, c.z); }, w.c);
    await frames(guest.page, 10);
    const near = await ev(guest.page, () => [...window.__zns.game.wards.looks.values()][0].k);
    assert.ok(near > 0.99, 'near: the house is there ' + near);

    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await host.context.close();
    await guest.context.close();
});

test('Creative: the book of protection lies on a pedestal; the three spells are known', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(() => {
        const g = window.__zns.game;
        const book = [...g.books.books.values()].find((b) => b.spells.includes('ProtectionHouse'));
        return { book: !!book, spells: book?.spells, knows: ['ProtectionHouse', 'ProtectionInvisible', 'ProtectionHouseGrant'].map((n) => g.knowsSpell(n)) };
    });
    assert.ok(r.book, 'on a pedestal');
    assert.deepEqual(r.spells, ['ProtectionHouse', 'ProtectionInvisible', 'ProtectionHouseGrant']);
    assert.deepEqual(r.knows, [true, true, true]);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
