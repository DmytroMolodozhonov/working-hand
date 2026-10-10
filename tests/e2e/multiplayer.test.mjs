/**
 * Multiplayer end-to-end: host + guests in separate browser contexts,
 * connected through a local PeerJS signalling server (the public PeerJS cloud
 * is used in real games; here the sandbox has no internet).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch, sleep, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8150;
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

test('host + 2 guests: lobby, shared world, zombies, hits, explosions, weapons, late join', async () => {
    const host = await openPlayer('Хост');
    await host.page.evaluate(() => { document.getElementById('mp-mode').value = 'creative'; }); // (the mode of «Создать сервер»)
    await host.page.click('#mp-private-btn'); // (the game by code starts at once; the code is shown)
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    assert.match(code, /^[A-Z2-9]{5}$/);

    const guest = await openPlayer('Гость');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(guest.page, () => document.getElementById('mp-status').textContent.includes('Подключено'), null, 30000);
    await wf(host.page, () => document.getElementById('mp-players').textContent.includes('Гость'), null, 15000);

    // The host is already playing (creative) → the guest starts with the same world
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    const seeds = await Promise.all([host.page, guest.page].map((p) => ev(p, () => window.__zns.game.seed)));
    assert.equal(seeds[0], seeds[1], 'same world seed');

    // Both see each other
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);

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
    await wf(host.page, () => window.__zns.game.explosions.length === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.explosions.length === 1, null, 120000);
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
        await wf(late.page, () => window.__zns.game.explosions.length === 1, null, 120000);
    } catch (e) {
        console.log('late joiner state', JSON.stringify(await ev(late.page, () => ({ ex: window.__zns.game.explosions.length, welcome: !!window.__zns.pendingWelcome, wex: window.__zns.pendingWelcome?.explosions?.length, role: window.__zns.net.role }))));
        console.log('host state', JSON.stringify(await ev(host.page, () => ({ ex: window.__zns.game.explosions.length }))), late.errors.slice(0, 5));
        throw e;
    }
    assert.equal(await craterOf(late.page), ch, 'late joiner has the same crater');
    await wf(late.page, () => window.__zns.game.remotes.size === 2, null, 120000);
    await wf(host.page, () => window.__zns.game.remotes.size === 2, null, 120000);

    // Guest leaves → the host removes their avatar
    await guest.context.close();
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);

    for (const p of [host, late]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    assert.deepEqual(realErrors(guest.errors), []);
    await host.context.close();
    await late.context.close();
});

test('players are solid: running straight at another player stops against the body, to the side goes round, both ways, on a horse too', async () => {
    const host = await openPlayer('Стена');
    await host.page.evaluate(() => { document.getElementById('mp-mode').value = 'creative'; });
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Бегун');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);

    // A straight lane along −Z with flat ground and nothing in the way of a body, wide
    // enough on the +x side for the runner going round the standing player (2.4 m out):
    // a tree or a slope there would push the runner back into the other body (walls win)
    const lane = await ev(host.page, () => {
        const g = window.__zns.game, col = g.collision, T = window.__zns.THREE;
        for (const x of [2, -3, 12, -12, 20, -20, 30, -30, 40, -40, 50, -50, 60, -60]) {
            const g0 = col.groundY(x, 30);
            let ok = true;
            for (let z = 30; z >= 2 && ok; z -= 0.25) {
                for (const dx of [-1, 0, 1, 1.8, 2.4]) {
                    const gy = col.groundY(x + dx, z);
                    if (Math.abs(gy - g0) > 0.4) ok = false;
                    const p = new T.Vector3(x + dx, gy + 2, z);
                    if (col.resolveCylinder(p, 0.48, gy, 3.5)) ok = false;
                }
            }
            if (ok) return { x, y: g0 + 2 };
        }
        return null;
    });
    assert.ok(lane, 'a free lane');
    console.log('lane', JSON.stringify(lane));
    const STAND = 14; // (the standing player's place on the lane)

    // Put a hero somewhere (a teleport: no path checked), facing `yaw`, running or not
    const place = (page, x, z, yaw, running) => ev(page, ([x, y, z, yaw, running]) => {
        const g = window.__zns.game, ch = g.character;
        g.currentPose = null; // (no camera: nothing else turns or stops the body)
        ch.group.position.set(x, y, z);
        ch.group.rotation.y = g.smoothBody = g.cameraBaseRotation = yaw;
        ch.verticalVelocity = 0;
        g.knockback.set(0, 0, 0);
        if (g._solid) g._solid.has = false;
        ch.setRunning(running, 1);
    }, [x, lane.y, z, yaw, running]);
    const stop = (page) => ev(page, () => window.__zns.game.character.setRunning(false));
    const seen = (page, x, z) => wf(page, ([x, z]) => {
        const r = [...window.__zns.game.remotes.values()][0];
        return Math.hypot(r.position.x - x, r.position.z - z) < 0.3;
    }, [x, z], 20000);
    // Every drawn frame on this screen: how close the two bodies came. Both stand upright
    // facing along z, so the drawn hero is 1.2 m deep (the head) and 1.8 m wide (the arms
    // hang 0.9 m out from the middle): `gap` < 0 means one body is inside the other.
    // `hand`: how far a thing held in the right hand was drawn from that hand.
    const watch = (page) => ev(page, () => {
        const g = window.__zns.game;
        const me = g.character.group.position, r = [...g.remotes.values()][0].position;
        const side = Math.sign(me.z - r.z) || 1;
        const held = g.items.held.right, grip = g.character.getGripObject('right'), v = new window.__zns.THREE.Vector3();
        const w = window.__solidWatch = { mid: Infinity, gap: Infinity, ahead: Infinity, hand: 0, frames: 0, on: true };
        const tick = () => {
            if (!w.on) return;
            const dx = me.x - r.x, dz = me.z - r.z;
            w.mid = Math.min(w.mid, Math.hypot(dx, dz));
            w.gap = Math.min(w.gap, Math.hypot(Math.max(0, Math.abs(dx) - 0.6), dz) - 1.2);
            w.ahead = Math.min(w.ahead, side * dz); // (still on the side it came from)
            if (held && g.items.held.right === held) w.hand = Math.max(w.hand, held.model.position.distanceTo(grip.getWorldPosition(v)));
            w.frames++;
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    const unwatch = (page) => ev(page, () => { window.__solidWatch.on = false; return window.__solidWatch; });
    const pos = (page) => ev(page, () => { const p = window.__zns.game.character.group.position; return { x: p.x, z: p.z }; });
    const zPast = (page, z, sign) => wf(page, ([z, sign]) => sign * (window.__zns.game.character.group.position.z - z) > 0, [z, sign], 60000);
    const f2 = (v) => v.toFixed(2);

    // 0) The lane is free: with nobody on it the runner gets all the way through
    await place(host.page, lane.x + 25, STAND, 0, false);
    await place(guest.page, lane.x, STAND + 10, 0, true);
    await zPast(guest.page, STAND - 6, -1);
    await stop(guest.page);

    // 1) The guest runs straight at the host's back: stops against the body and stays outside
    await place(host.page, lane.x, STAND, 0, false);
    await place(guest.page, lane.x, STAND + 10, 0, false);
    // (the runner holds an apple: it must stay in the hand while the body presses on)
    assert.ok(await ev(guest.page, () => { const g = window.__zns.game; g.inventory.select(-1); return g.items.takeIntoHand({ kind: 'apple', uid: 'solid-apple', count: 1 }, 'right'); }), 'an apple in the hand');
    await seen(guest.page, lane.x, STAND);
    await seen(host.page, lane.x, STAND + 10);
    await Promise.all([watch(host.page), watch(guest.page)]);
    await ev(guest.page, () => window.__zns.game.character.setRunning(true, 1));
    await zPast(guest.page, STAND + 1.8, -1);
    await sleep(2500); // (keeps running into the body for a while)
    const g1 = await pos(guest.page);
    await stop(guest.page);
    await sleep(800);
    let [hw, gw] = await Promise.all([unwatch(host.page), unwatch(guest.page)]);
    const h1 = await pos(host.page);
    console.log('straight', JSON.stringify({ g1, h1, hostScreen: hw, guestScreen: gw }));
    assert.ok(gw.frames > 10 && hw.frames > 10, 'frames were drawn');
    assert.ok(gw.gap >= -0.02 && gw.ahead >= 1.15, `the runner never went into the body on its own screen (gap ${f2(gw.gap)}, ${f2(gw.ahead)} m in front)`);
    assert.ok(hw.gap >= -0.1 && hw.ahead >= 1.1, `nor on the other player's screen (gap ${f2(hw.gap)})`);
    assert.ok(g1.z > STAND + 1.15 && g1.z < STAND + 1.6, `stopped in front, touching (z ${f2(g1.z)})`);
    assert.ok(Math.abs(g1.x - lane.x) < 0.3, 'straight on, no sliding round');
    assert.ok(Math.hypot(h1.x - lane.x, h1.z - STAND) < 0.05, 'the standing player was not shoved');
    assert.ok(gw.hand < 0.05, `the apple stayed in the runner's hand, not pushed on into the other body (${f2(gw.hand)} m from the hand)`);

    // 2) A bit to the side (1 m): the runner goes round the body, shoulder past shoulder
    await place(guest.page, lane.x + 1, STAND + 10, 0, false);
    await seen(host.page, lane.x + 1, STAND + 10);
    await seen(guest.page, lane.x, STAND);
    await Promise.all([watch(host.page), watch(guest.page)]);
    await ev(guest.page, () => window.__zns.game.character.setRunning(true, 1));
    await zPast(guest.page, STAND - 4, -1);
    await stop(guest.page);
    await sleep(800);
    [hw, gw] = await Promise.all([unwatch(host.page), unwatch(guest.page)]);
    const h2 = await pos(host.page);
    console.log('to the side', JSON.stringify({ h2, hostScreen: hw, guestScreen: gw }));
    assert.ok(gw.gap >= -0.02, `the shoulders never went into each other (gap ${f2(gw.gap)}, middles ${f2(gw.mid)} m apart)`);
    assert.ok(hw.gap >= -0.15, `nor on the other player's screen (gap ${f2(hw.gap)})`);
    assert.ok(Math.hypot(h2.x - lane.x, h2.z - STAND) < 0.3, 'the standing player was not shoved');
    assert.ok(gw.hand < 0.1, `sliding round, the apple stayed in the hand (${f2(gw.hand)} m from it)`);

    // 3) The other way round: the host turns and runs at the standing guest
    // (the host leaves the spot first: a body can't be put into another one)
    await place(host.page, lane.x, STAND - 10, Math.PI, false);
    await seen(guest.page, lane.x, STAND - 10);
    await place(guest.page, lane.x, STAND, 0, false);
    await seen(host.page, lane.x, STAND);
    await Promise.all([watch(host.page), watch(guest.page)]);
    await ev(host.page, () => window.__zns.game.character.setRunning(true, 1));
    await zPast(host.page, STAND - 1.8, 1);
    await sleep(2500);
    const h3 = await pos(host.page);
    await stop(host.page);
    await sleep(800);
    [hw, gw] = await Promise.all([unwatch(host.page), unwatch(guest.page)]);
    const g3 = await pos(guest.page);
    console.log('back', JSON.stringify({ h3, g3, hostScreen: hw, guestScreen: gw }));
    assert.ok(hw.gap >= -0.02 && hw.ahead >= 1.15, `the host never went into the guest (gap ${f2(hw.gap)})`);
    assert.ok(gw.gap >= -0.1 && gw.ahead >= 1.1, `nor on the guest's screen (gap ${f2(gw.gap)})`);
    assert.ok(h3.z < STAND - 1.15 && h3.z > STAND - 1.6, `stopped in front (z ${f2(h3.z)})`);
    assert.ok(Math.hypot(g3.x - lane.x, g3.z - STAND) < 0.05, 'the guest was not shoved');

    // 4) On a horse at a gallop: the horse stops at the guest (its head 2.8 m in front of the rider)
    await place(host.page, lane.x + 1.5, STAND - 14, Math.PI, false);
    const mounted = await ev(host.page, ([x, z]) => {
        const g = window.__zns.game, A = g.animals, T = window.__zns.THREE;
        const horse = A._spawn('horse', new T.Vector3(x, g.collision.groundY(x, z) + 0.5, z), { bonus: 20 });
        horse.tamed = g.localId; // (tamed: it lets its owner on)
        A.tryMount();
        if (g._solid) g._solid.has = false;
        return A.riding === horse;
    }, [lane.x, STAND - 14]);
    assert.ok(mounted, 'on the horse');
    await seen(guest.page, lane.x, STAND - 14);
    await watch(host.page);
    await ev(host.page, () => window.__zns.game.character.setRunning(true, 1));
    await zPast(host.page, STAND - 6, 1);
    await sleep(2500);
    const h4 = await pos(host.page);
    await stop(host.page);
    await sleep(800);
    hw = await unwatch(host.page);
    const g4 = await pos(guest.page);
    console.log('horse', JSON.stringify({ h4, g4, hostScreen: hw }));
    assert.ok(hw.ahead > 4.1, `the horse never went into the guest (the rider ${f2(hw.ahead)} m from the guest)`);
    assert.ok(h4.z < STAND - 4.1 && h4.z > STAND - 4.8, `stopped in front (z ${f2(h4.z)})`);
    assert.ok(Math.hypot(g4.x - lane.x, g4.z - STAND) < 0.3, 'the guest was not trampled aside');
    await ev(host.page, () => window.__zns.game.animals.dismount());

    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await host.context.close();
    await guest.context.close();
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

test('Свободный мир: no tables, 20 HP, fatigue, spells hurt players, shields, freezing + shatter, death', async () => {
    const host = await openPlayer('Маг1');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Маг2');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(guest.page, () => document.getElementById('mp-status').textContent.includes('Подключено'), null, 30000);

    // (the host is already playing: the free world is the default mode)
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);

    const st = await Promise.all([host.page, guest.page].map((p) => ev(p, () => {
        const g = window.__zns.game;
        return {
            mode: g.config.mode, pvp: g.combat.enabled, hp: g.combat.hp, fatigue: g.combat.fatigue,
            weapons: g.weapons.weapons.length, tables: g.world.tables.length, zombies: g.zombies.length,
            bar: !document.getElementById('fatigue-container').classList.contains('hidden'),
            hpBar: document.getElementById('hp-text').textContent,
        };
    })));
    for (const s of st) {
        assert.equal(s.mode, 'freeworld');
        assert.ok(s.pvp);
        assert.equal(s.hp, 20);
        assert.equal(s.weapons, 0, 'no tables with weapons');
        assert.equal(s.tables, 0);
        assert.equal(s.zombies, 0);
        assert.ok(s.bar, 'fatigue bar shown');
        assert.match(s.hpBar, /20\/20/);
    }

    // Put the guest 12 m in front of the host's right hand
    const ids = await Promise.all([host.page, guest.page].map((p) => ev(p, () => window.__zns.game.localId)));
    const aim = async () => {
        const target = await ev(host.page, () => {
            const g = window.__zns.game;
            const o = g.character.getHandWorldPosition('right');
            const d = g.character.getHandDirection('right');
            return { o: o.toArray(), d: d.toArray(), t: o.clone().addScaledVector(d, 12).toArray() };
        });
        await ev(guest.page, (t) => {
            const g = window.__zns.game;
            g.character.group.position.set(t[0], t[1] - 0.6, t[2]);
            g.knockback.set(0, 0, 0);
        }, target.t);
        await wf(host.page, (t) => {
            const r = [...window.__zns.game.remotes.values()][0];
            return Math.hypot(r.position.x - t[0], r.position.z - t[2]) < 0.6;
        }, target.t, 20000);
        return target;
    };
    const castAt = (name) => ev(host.page, (n) => {
        const g = window.__zns.game;
        const o = g.character.getHandWorldPosition('right');
        const d = g.character.getHandDirection('right');
        g.spells.cast(n, o, d, 'right', g.localId);
        g.sync.spell(n, o, d, 'right');
    }, name);
    const guestHp = () => ev(guest.page, () => window.__zns.game.combat.hp);

    // Sapira hits the other player: 4 damage, the host sees it too
    await aim();
    await castAt('Sapira');
    await wf(guest.page, () => window.__zns.game.combat.hp === 16, null, 20000);
    await wf(host.page, () => [...window.__zns.game.remotes.values()][0].hp === 16, null, 20000);

    // Fatigue: Sapira costs 20 of 30 — a second one right away is too tiring
    const fat = await ev(host.page, () => {
        const g = window.__zns.game;
        g.lastMagicTime = Date.now(); g.lastSpellCastTime = 0;
        // Arms hanging down (no camera here): the word alone — e.g. the other player's
        // voice reaching this microphone — casts nothing
        g.character.isArmRaised = () => false; // (without a camera the arms stick out forward)
        const hanging = g.castLocalSpell('сапира', true);
        g.character.isArmRaised = () => true; // now the hand is raised and points at the guest
        const a = g.castLocalSpell('сапира', true);
        const f1 = g.combat.fatigue;
        g.lastSpellCastTime = 0;
        const b = g.castLocalSpell('сапира', true);
        return { hanging, a, b, f1 };
    });
    assert.equal(fat.hanging, null, 'no duel spell with the arms down');
    assert.equal(fat.a, 'Sapira');
    assert.ok(fat.f1 <= 10.5, `fatigue spent (${fat.f1})`);
    assert.equal(fat.b, null, 'not enough strength');
    await wf(guest.page, () => window.__zns.game.combat.hp === 12, null, 20000).catch(() => {}); // the real cast may also hit
    await ev(guest.page, () => { window.__zns.game.combat.hp = 20; });

    // Protection Maxima on the guest: the host sees the dome, spells bounce off
    await aim();
    await ev(guest.page, () => { window.__zns.game.combat.shield = { type: 2, side: 'right', left: 3 }; });
    await wf(host.page, () => [...window.__zns.game.remotes.values()][0].combat.shield === 2, null, 20000);
    await castAt('Thunderwave');
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await guestHp(), 20, 'shield stopped Thunderwave');
    const domeSeen = await ev(host.page, () => [...window.__zns.game.remotes.values()][0].visuals.dome.visible);
    assert.ok(domeSeen, 'the dome is visible to the other player');
    await wf(guest.page, () => !window.__zns.game.combat.shield, null, 30000);

    // Bombardo blast next to the guest hurts them (not the caster)
    const hostHp0 = await ev(host.page, () => window.__zns.game.combat.hp);
    await ev(host.page, (id) => {
        const g = window.__zns.game;
        const r = [...g.remotes.values()][0];
        g.explode(r.position.clone(), 3.6, g.localId, 1);
    });
    await wf(guest.page, () => window.__zns.game.combat.hp < 20, null, 20000);
    assert.equal(await ev(host.page, () => window.__zns.game.combat.hp), hostHp0);

    // Frozen guest: everyone sees the ice; any punch shatters them → death screen, back to menu
    await ev(guest.page, (by) => window.__zns.game.combat.freeze(by), ids[0]);
    await wf(host.page, () => [...window.__zns.game.remotes.values()][0].combat.frozen, null, 20000);
    const status = await ev(guest.page, () => document.getElementById('pvp-status').innerText);
    assert.match(status, /заморозили.*20/s);
    await ev(host.page, (to) => window.__zns.game.sync.playerHit(to, 1), ids[1]);
    await wf(guest.page, () => !document.getElementById('death-screen').classList.contains('hidden'), null, 20000);
    const death = await ev(guest.page, () => document.getElementById('death-text').innerText);
    assert.match(death, /Маг1/);
    assert.match(death, /заморож/);
    await wf(host.page, () => [...window.__zns.game.remotes.values()][0]?.dead || window.__zns.game.remotes.size === 0, null, 20000);
    // No kick to the menu: «Возродиться» brings the player back, the others see it
    await wf(guest.page, () => !document.getElementById('death-respawn-btn').disabled, null, 20000);
    await guest.page.click('#death-respawn-btn');
    await wf(guest.page, () => { const c = window.__zns.game.combat; return !c.dead && c.hp === 20; }, null, 20000);
    await wf(host.page, () => [...window.__zns.game.remotes.values()][0]?.dead === false, null, 20000);
    // The HOST dies: its room stays open, the guest stays in the game
    await ev(host.page, () => window.__zns.game.combat.die(null, 'test'));
    await wf(host.page, () => !document.getElementById('death-screen').classList.contains('hidden'), null, 20000);
    await new Promise((r) => setTimeout(r, 4000));
    assert.ok(await ev(guest.page, () => window.__zns.net.active && window.__zns.game.active), 'the guest is still in the game');
    assert.ok(await ev(host.page, () => window.__zns.net.active && window.__zns.game.active), 'the host is still hosting');

    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await host.context.close();
    await guest.context.close();
});

test('duel magic: Остолбеней flies and stuns, charges meet and push, calm exit, shield, Авада Кедавра', async () => {
    const host = await openPlayer('Гарри');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Драко');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(guest.page, () => document.getElementById('mp-status').textContent.includes('Подключено'), null, 30000);
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    const ids = await Promise.all([host.page, guest.page].map((p) => ev(p, () => window.__zns.game.localId)));

    // Guest stands in front of the host's right hand (far enough to answer a fast charge)
    const aim = async (dist = 25) => {
        const t = await ev(host.page, (dist) => {
            const g = window.__zns.game;
            const o = g.character.getHandWorldPosition('right');
            const d = g.character.getHandDirection('right');
            return o.clone().addScaledVector(d, dist).toArray();
        }, dist);
        await ev(guest.page, (t) => { const g = window.__zns.game; g.character.group.position.set(t[0], t[1] - 0.6, t[2]); g.knockback.set(0, 0, 0); }, t);
        await wf(host.page, (t) => { const r = [...window.__zns.game.remotes.values()][0]; return Math.hypot(r.position.x - t[0], r.position.z - t[2]) < 0.6; }, t, 20000);
    };
    const hostCast = (spell) => ev(host.page, (spell) => {
        const g = window.__zns.game;
        g._lastDuelCast = 0;
        return g._castDuel(spell, spell, true);
    }, spell);
    // In the test browser there is no camera: the guest "keeps the hand on the opponent" by decree
    // (only for this player's own hand — what it hears about the other player stays real)
    const setContact = (page, ok, jerk) => ev(page, ([ok, jerk]) => {
        const d = window.__zns.game.duel;
        const real = d._realContact || (d._realContact = d._contact.bind(d));
        d._contact = (id, ...rest) => (id === d.me ? { ok, jerk } : real(id, ...rest));
    }, [ok, jerk]);

    // 1) Остолбеней: a charge flies (not instant) and stuns on arrival
    await aim();
    assert.equal(await hostCast('Stupefy'), 'Stupefy');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(await ev(guest.page, () => window.__zns.game.combat.stunned), false, 'not instant');
    assert.ok(await ev(guest.page, () => window.__zns.game.duel.bolts.size === 1), 'the guest sees the charge coming');
    await wf(guest.page, () => window.__zns.game.combat.stunned, null, 40000);
    const st = await ev(guest.page, () => document.getElementById('pvp-status').innerText);
    assert.match(st, /Остолбеней/);
    await ev(guest.page, () => { window.__zns.game.combat.stunLeft = 0; });

    // 2) Duel: the guest answers — charges meet and push; the rested wizard wins
    await setContact(host.page, true, false);
    await setContact(guest.page, true, false);
    await ev(host.page, () => { window.__zns.game.combat.fatigue = 30; });
    await ev(guest.page, () => { window.__zns.game.combat.fatigue = 3; window.__zns.game.combat.hp = 4; });
    await aim();
    await hostCast('Stupefy');
    await ev(guest.page, (hostId) => {
        const g = window.__zns.game;
        g.duel.cast('Stupefy', { side: 'right', t: { kind: 'p', id: hostId, dist: 25 } });
    }, ids[0]);
    await wf(host.page, () => window.__zns.game.duel.clashes.length === 1, null, 40000);
    await wf(guest.page, () => window.__zns.game.duel.clashes.length === 1, null, 20000);
    await wf(guest.page, () => window.__zns.game.combat.stunned, null, 90000);
    assert.equal(await ev(host.page, () => window.__zns.game.combat.stunned), false, 'the stronger one wins');
    await ev(guest.page, () => { window.__zns.game.combat.stunLeft = 0; });

    // 3) Calm exit: hand off the opponent, then a flick → the duel just ends
    await ev(host.page, () => { window.__zns.game.combat.fatigue = 30; });
    await ev(guest.page, () => { window.__zns.game.combat.fatigue = 30; window.__zns.game.combat.hp = 20; });
    await aim();
    await hostCast('Stupefy');
    await ev(guest.page, (hostId) => window.__zns.game.duel.cast('Stupefy', { side: 'right', t: { kind: 'p', id: hostId, dist: 25 } }), ids[0]);
    await wf(host.page, () => window.__zns.game.duel.clashes.length === 1, null, 40000);
    // (the guest's hand off the opponent stops pushing — a quick, calm move away then a flick)
    await ev(guest.page, () => {
        const d = window.__zns.game.duel;
        const real = d._realContact || (d._realContact = d._contact.bind(d));
        const t0 = performance.now();
        // hand moved calmly away, then shaken off
        d._contact = (id, ...rest) => (id === d.me ? { ok: false, jerk: performance.now() - t0 > 450 } : real(id, ...rest));
    });
    await wf(host.page, () => window.__zns.game.duel.clashes.length === 0, null, 20000);
    await new Promise((r) => setTimeout(r, 800));
    const exitStunned = await ev(guest.page, () => window.__zns.game.combat.stunned);
    if (exitStunned || await ev(host.page, () => window.__zns.game.combat.stunned)) {
        console.log('host duel log', JSON.stringify(await ev(host.page, () => window.__zns.game.duel.log)));
        console.log('guest duel log', JSON.stringify(await ev(guest.page, () => window.__zns.game.duel.log)));
    }
    assert.equal(exitStunned, false, 'nobody hit after a calm exit');
    assert.equal(await ev(host.page, () => window.__zns.game.combat.stunned), false);
    await setContact(guest.page, true, false);

    // 4) Protection Maxima stops Авада Кедавра
    await aim();
    await ev(guest.page, () => { window.__zns.game.combat.shield = { type: 2, side: 'right', left: 8 }; });
    await ev(host.page, () => { window.__zns.game.combat.fatigue = 30; });
    assert.equal(await hostCast('AvadaKedavra'), 'AvadaKedavra');
    await wf(guest.page, () => window.__zns.game.duel.bolts.size === 0, null, 40000);
    assert.equal(await ev(guest.page, () => window.__zns.game.combat.dead), false, 'shield saved the wizard');

    // 5) Авада Кедавра without a shield: instant death, back to the menu
    await ev(guest.page, () => { window.__zns.game.combat.shield = null; });
    await aim();
    await ev(host.page, () => { window.__zns.game.combat.fatigue = 30; });
    assert.equal(await hostCast('AvadaKedavra'), 'AvadaKedavra');
    await wf(guest.page, () => !document.getElementById('death-screen').classList.contains('hidden'), null, 40000);
    assert.match(await ev(guest.page, () => document.getElementById('death-text').innerText), /Авада Кедавра/);

    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await host.context.close();
    await guest.context.close();
});

test('server list: «Создать сервер» starts a game that the other player sees in the list and joins without a code', async () => {
    const a = await openPlayer('Дима');
    const b = await openPlayer('Друг');
    // An empty list at first
    await b.page.click('#mp-refresh-btn');
    await wf(b.page, () => /нет ни одного/.test(document.getElementById('mp-server-list').textContent), null, 40000);
    await a.page.click('#mp-create-open');
    await a.page.fill('#mp-srv-name', 'Замок Димы');
    await a.page.selectOption('#mp-mode', 'freeworld');
    await a.page.click('#mp-host-btn');
    await wf(a.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    // The friend's list shows it (name, mode, players)
    await b.page.click('#mp-refresh-btn');
    await wf(b.page, () => document.getElementById('mp-server-list').textContent.includes('Замок Димы'), null, 40000);
    const row = await b.page.textContent('.mp-server-row');
    assert.match(row, /Свободный мир/);
    assert.match(row, /1\/10/);
    await b.page.click('.mp-server-row');
    await wf(b.page, () => document.getElementById('mp-server-info').textContent.includes('Дима'), null, 10000);
    await b.page.click('#mp-enter-btn');
    await wf(b.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    assert.equal(await ev(b.page, () => window.__zns.game.config.mode), 'freeworld');
    await wf(a.page, () => window.__zns.game.remotes.size === 1, null, 60000);
    // the friend's own hero (made in «Персонаж») is what the host sees
    await wf(a.page, () => !!([...window.__zns.game.remotes.values()][0].character.look), null, 30000);
    // the minimap says which server this is (both sides)
    await wf(a.page, () => window.__zns.game.hud.minimapServer === 'Замок Димы', null, 10000);
    await wf(b.page, () => window.__zns.game.hud.minimapServer === 'Замок Димы', null, 10000);
    // a sword slash on the friend: a light cut on their body, seen by both, no bleeding drain
    await ev(a.page, () => {
        const g = window.__zns.game;
        const t = g.combat.meleeTargets()[0];
        g.combat.hitRemote(t, 2, false, { lx: 0.2, y: 0.9, lz: -0.6, side: 1, speed: 9 });
    });
    await wf(b.page, () => window.__zns.game.bleeding.cuts.length === 1, null, 15000);
    await wf(a.page, () => window.__zns.game.bleeding.cuts.length === 1, null, 15000);
    const cutB = await ev(b.page, () => { const g = window.__zns.game; return { rate: g.bleeding.rate, hp: g.combat.hp, onBody: g.bleeding.cuts[0].mesh.parent === g.character.body }; });
    assert.equal(cutB.rate, 0, 'a cut is not a deep wound');
    assert.equal(cutB.hp, 18);
    assert.ok(cutB.onBody, 'on the body');
    assert.ok(await ev(a.page, () => { const g = window.__zns.game; return g.bleeding.cuts[0].mesh.parent === [...g.remotes.values()][0].character.body; }), 'seen on the friend');
    // blade on blade: the clang and the sparks work in a real browser
    assert.equal(await ev(a.page, () => { const ws = window.__zns.game.weapons; ws._clang([0, 2, 0], 8); return ws.clangCount; }), 1);
    assert.deepEqual(realErrors(a.errors), []);
    assert.deepEqual(realErrors(b.errors), []);
    await a.context.close();
    await b.context.close();
});

test('no direct path between the computers: the server still shows in the list, joining says the direct link failed; another version is told to update', async () => {
    const a = await openPlayer('Хост2');
    await a.page.evaluate(() => { document.getElementById('mp-mode').value = 'creative'; });
    await a.page.click('#mp-create-open');
    await a.page.fill('#mp-srv-name', 'Без прямой');
    await a.page.click('#mp-host-btn');
    await wf(a.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    // a friend whose router lets no direct connection through (no addresses at all)
    const b = await openPlayer('ДругЗаРоутером');
    await b.page.evaluate(() => { window.__ZNS_ICE_POLICY__ = 'relay'; });
    await b.page.click('#mp-refresh-btn');
    await wf(b.page, () => /Сервер SRV/.test(document.getElementById('mp-server-list').textContent), null, 40000);
    await b.page.click('.mp-server-row');
    await b.page.click('#mp-enter-btn');
    await wf(b.page, () => document.getElementById('mp-status').textContent.includes('❌'), null, 45000);
    const said = await b.page.textContent('#mp-status');
    assert.match(said, /напрямую/, 'it says the direct link failed, not «no internet»: ' + said);
    // a friend with another version of the game: told to update
    const c = await openPlayer('СтараяВерсия');
    const code = await ev(a.page, () => window.__zns.net.code);
    await c.page.evaluate(() => { window.__zns.net.version = 'f00dbad'; });
    const hostVer = await ev(a.page, () => window.__zns.net.version);
    await c.page.fill('#mp-code', code);
    await c.page.click('#mp-join-btn');
    if (hostVer) {
        await wf(c.page, () => /верси/.test(document.getElementById('mp-status').textContent), null, 40000);
        assert.match(await c.page.textContent('#mp-status'), /Обновить и запустить/);
    }
    // a hand-typed connection server is pointed out (only the same one sees each other)
    assert.match(await b.page.textContent('#mp-custom-warn'), /свой сервер связи/);
    // (a failed direct link is logged by the network module as an error — that is expected here)
    assert.deepEqual(realErrors(a.errors).filter((e) => !/PeerJS|Negotiation|connection/i.test(e)), []);
    await a.context.close();
    await b.context.close();
    await c.context.close();
});
