/**
 * Multiplayer end-to-end: host + guests in separate browser contexts,
 * connected through a local PeerJS signalling server (the public PeerJS cloud
 * is used in real games; here the sandbox has no internet).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch, sleep, realErrors } from './harness.mjs';

const PORT = 8150;
const PEER_PORT = 9010;
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
    // PeerServer keeps an http server open
    setTimeout(() => process.exit(0), 500).unref();
});

async function openPlayer(name) {
    const context = await browser.newContext({ viewport: { width: 800, height: 450 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns);
    await page.click('#mp-panel > summary');
    await page.fill('#mp-name', name);
    await page.click('#mp-advanced > summary');
    await page.fill('#mp-server', `127.0.0.1:${PEER_PORT}/zns`);
    return { page, errors, context };
}

const wf = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 250 });
const ev = (page, fn, arg) => page.evaluate(fn, arg);

test('host + 2 guests: lobby, shared world, zombies, hits, explosions, weapons, late join', async () => {
    const host = await openPlayer('Хост');
    await host.page.click('#mp-host-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    assert.match(code, /^[A-Z2-9]{5}$/);

    const guest = await openPlayer('Гость');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(guest.page, () => document.getElementById('mp-status').textContent.includes('Подключено'), null, 30000);
    await wf(host.page, () => document.getElementById('mp-players').textContent.includes('Гость'), null, 15000);

    // Host starts creative → guest starts automatically with the same world
    await host.page.click('#start-btn');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    const seeds = await Promise.all([host.page, guest.page].map((p) => ev(p, () => window.__zns.game.seed)));
    assert.equal(seeds[0], seeds[1], 'same world seed');

    // Both see each other
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 30000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 30000);

    // Guest walks somewhere → host sees the avatar there
    await ev(guest.page, () => { window.__zns.game.character.group.position.set(12, 1.5, 8); });
    await wf(host.page, () => {
        const r = [...window.__zns.game.remotes.values()][0];
        return Math.abs(r.position.x - 12) < 0.5 && Math.abs(r.position.z - 8) < 0.5;
    }, null, 20000);

    // Host spawns a zombie → appears for the guest
    const zid = await ev(host.page, () => {
        const g = window.__zns.game;
        const z = g._createZombie(new window.__zns.THREE.Vector3(12, 0.5, 0));
        z.health = 5;
        return z.id;
    });
    await wf(guest.page, (id) => window.__zns.game.zombieById.has(id), zid, 20000);

    // Guest hits the zombie (sword) → the host applies the damage → everybody sees it die
    await ev(guest.page, (id) => {
        const g = window.__zns.game;
        const z = g.zombieById.get(id);
        g.onLocalHit(z, 5, new window.__zns.THREE.Vector3(1, 0, 0), true);
    }, zid);
    await wf(host.page, (id) => window.__zns.game.zombieById.get(id)?.isDead, zid, 20000);
    await wf(guest.page, (id) => window.__zns.game.zombieById.get(id)?.isDead, zid, 20000);
    await wf(guest.page, () => window.__zns.game.killCount === 1, null, 10000);

    // Guest punches a second zombie with a bare fist (fast wrist movement)
    const zid2 = await ev(host.page, () => {
        const g = window.__zns.game;
        const z = g._createZombie(new window.__zns.THREE.Vector3(14, 0.5, 8));
        z.health = 5;
        z.speed = z.baseSpeed = 0;
        return z.id;
    });
    await wf(guest.page, (id) => window.__zns.game.zombieById.has(id), zid2, 20000);
    await ev(guest.page, () => {
        const g = window.__zns.game;
        g.character.group.position.set(12, 1.5, 8);
        g.playerAttackCooldown = 0;
        g.currentPose = { ...(g.currentPose || {}), isPunching: true, headRotation: { yaw: 0, pitch: 0 } };
    });
    await wf(host.page, (id) => window.__zns.game.zombieById.get(id).health < 5, zid2, 20000);
    await ev(guest.page, () => { window.__zns.game.currentPose.isPunching = false; });

    // Guest casts Бомбардо → host explodes it → craters identical on both machines
    await ev(guest.page, () => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        const o = new THREE.Vector3(-10, 4, -20), target = new THREE.Vector3(-10, -0.5, -30);
        const d = target.clone().sub(o).normalize();
        g.spells.cast('Bombardo', o, d, 'right', g.localId);
        g.sync.spell('Bombardo', o, d, 'right');
    });
    await wf(host.page, () => window.__zns.game.explosions.length === 1, null, 30000);
    await wf(guest.page, () => window.__zns.game.explosions.length === 1, null, 30000);
    const craterOf = (p) => ev(p, () => {
        const t = window.__zns.game.terrain;
        const out = [];
        for (let x = -16; x <= -4; x++) for (let z = -36; z <= -24; z++) out.push(t.topLayer(x, z));
        return out.join(',');
    });
    const [ch, cg] = await Promise.all([craterOf(host.page), craterOf(guest.page)]);
    assert.equal(ch, cg, 'terrain identical after the explosion');
    assert.ok(ch.split(',').some((v) => Number(v) < 0), 'there is a crater');

    // Weapons: guest picks up the sword → host knows who holds it; guest throws it → host simulates
    const guestId = await ev(guest.page, () => window.__zns.game.localId);
    await ev(guest.page, () => {
        const g = window.__zns.game;
        const w = g.weapons.byId.get('tS');
        g.weapons.grab(w, 'right', 0.5);
    });
    await wf(host.page, (gid) => window.__zns.game.sync.weaponOwners.get('tS') === gid, guestId, 15000);
    await ev(guest.page, () => {
        const g = window.__zns.game;
        g.weapons.hands.right.held.velocity.set(4, 3, 0);
        g.weapons.release('right');
    });
    await wf(host.page, () => !window.__zns.game.sync.weaponOwners.has('tS'), null, 15000);
    await wf(host.page, () => window.__zns.game.weapons.byId.get('tS').sleeping, null, 60000);

    // A third player joins mid-game and receives the current world (crater included)
    const late = await openPlayer('Опоздавший');
    await late.page.fill('#mp-code', code);
    await late.page.click('#mp-join-btn');
    await wf(late.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    try {
        await wf(late.page, () => window.__zns.game.explosions.length === 1, null, 30000);
    } catch (e) {
        console.log('late joiner state', JSON.stringify(await ev(late.page, () => ({ ex: window.__zns.game.explosions.length, welcome: !!window.__zns.pendingWelcome, wex: window.__zns.pendingWelcome?.explosions?.length, role: window.__zns.net.role }))));
        console.log('host state', JSON.stringify(await ev(host.page, () => ({ ex: window.__zns.game.explosions.length }))), late.errors.slice(0, 5));
        throw e;
    }
    assert.equal(await craterOf(late.page), ch, 'late joiner has the same crater');
    await wf(late.page, () => window.__zns.game.remotes.size === 2, null, 30000);
    await wf(host.page, () => window.__zns.game.remotes.size === 2, null, 30000);

    // Guest leaves → the host removes their avatar
    await guest.context.close();
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 30000);

    for (const p of [host, late]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    assert.deepEqual(realErrors(guest.errors), []);
    await host.context.close();
    await late.context.close();
});

test('joining a wrong code shows a clear message', async () => {
    const p = await openPlayer('Кто-то');
    await p.page.fill('#mp-code', 'ZZZZZ');
    await p.page.click('#mp-join-btn');
    await wf(p.page, () => document.getElementById('mp-status').textContent.includes('❌'), null, 40000);
    const text = await p.page.textContent('#mp-status');
    assert.match(text, /не найдена|ожидания/);
    await p.context.close();
});
