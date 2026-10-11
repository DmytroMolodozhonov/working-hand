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
    // (a real blow: the fist's path reaches the zombie's face fast — BodyStrikes — not just a fast wrist somewhere near)
    await ev(guest.page, (id) => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        const z = g.zombieById.get(id);
        g.character.group.position.set(z.group.position.x - 2.5, 1.5, z.group.position.z);
        g.currentPose = { ...(g.currentPose || {}), hasPose: true, headRotation: { yaw: 0, pitch: 0 } };
        const S = g.strikes;
        const st = { x: -3 };
        S.has.left = S.has.right = false; // (the fist's path starts where it is put)
        window.__punch = { orig: S.update, knuckles: S._knuckles, curl: g.character.getGripCurl };
        g.character.getGripCurl = () => 0.95;
        S._knuckles = (side, out) => {
            if (side !== 'right') return out.set(0, -80, 0);
            const head = z.head.getWorldPosition(new THREE.Vector3());
            return out.copy(head).add(new THREE.Vector3(st.x, 0, 0));
        };
        S.update = (dt) => { st.x = Math.min(0.3, st.x + 10 * dt); window.__punch.orig.call(S, dt); };
    }, zid2);
    await wf(host.page, (id) => window.__zns.game.zombieById.get(id).health < 5, zid2, 60000);
    await ev(guest.page, () => {
        const g = window.__zns.game, P = window.__punch;
        g.strikes.update = P.orig; g.strikes._knuckles = P.knuckles; g.character.getGripCurl = P.curl;
    });

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

test('two players both called «Игрок»: the guest becomes «Игрок 2» and never gets the host\'s learned scroll spell or things', async () => {
    const host = await openPlayer('');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    // the host burns a Lightning Strike scroll: only the host learns it
    const h = await ev(host.page, async () => {
        const g = window.__zns.game;
        const before = g.knowsSpell('LightningStrike');
        g.items.releaseHand('left');
        g.items.takeIntoHand({ kind: 'scroll', uid: 'ls1', stat: 'spell', spell: 'LightningStrike' }, 'left');
        g.items.burnHeldScroll();
        await g.keeper.save();
        return { mode: g.config.mode, before, after: g.knowsSpell('LightningStrike'), name: g.net.name, keys: Object.keys(g.keeper.players) };
    });
    assert.equal(h.mode, 'freeworld');
    assert.equal(h.name, 'Игрок');
    assert.ok(!h.before && h.after, 'the host learned it by burning the scroll');
    assert.ok(h.keys.every((k) => k.startsWith('id:')), 'kept under the host\'s own id, not the name ' + h.keys);
    const guest = await openPlayer('');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await sleep(1500);
    const gs = await ev(guest.page, () => {
        const g = window.__zns.game;
        return { knows: g.knowsSpell('LightningStrike'), spells: g.bonus?.spells ?? null, pid: g.net.pid };
    });
    assert.equal(gs.knows, false, 'the guest with the same name did not learn the host\'s scroll');
    assert.equal(gs.spells, null);
    const names = await ev(host.page, () => window.__zns.net.playerList().map((p) => p.name).sort());
    assert.deepEqual(names, ['Игрок', 'Игрок 2']);
    const pids = await ev(host.page, () => [...window.__zns.net.players.values()].map((p) => p.pid));
    assert.ok(pids.every(Boolean) && pids[0] !== pids[1], 'each player has their own lasting id');
    assert.deepEqual(realErrors(host.errors), []);
    assert.deepEqual(realErrors(guest.errors), []);
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
            g.knock?.reset(); // (a spell before may have thrown it off its feet)
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

    // (the guest carries coins and a sword: they drop at the body — Death.js)
    await ev(guest.page, () => { const inv = window.__zns.game.inventory; inv.slots[3] = { kind: 'coins', uid: 'mpc1', count: 33 }; inv.slots[4] = { kind: 'weapon', type: 'sword', id: 'mpsw1', magic: false, bonus: 0 }; });
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
    // the body stays and the things lie at it: the host owns them, everybody sees them
    const near = (id) => {
        const g = window.__zns.game;
        const b = [...g.death.bodies.values()].find((x) => x.k === 'p' && x.who === id);
        if (!b) return null;
        const d = (p) => Math.hypot(p.x - b.x, p.z - b.z);
        return { model: !!b.model?.parent, coins: [...g.items.loose.values()].some((L) => L.item.kind === 'coins' && L.item.count === 33 && d(L.model.position) < 4), sword: g.weapons.weapons.some((w) => w.id === 'mpsw1' && d(w.position) < 4) };
    };
    await wf(host.page, ([src, id]) => { const r = eval(src)(id); return r && r.model && r.coins && r.sword; }, [near.toString(), ids[1]], 20000);
    await wf(guest.page, ([src, id]) => { const r = eval(src)(id); return r && r.model && r.coins && r.sword; }, [near.toString(), ids[1]], 20000);
    assert.equal(await ev(guest.page, () => window.__zns.game.inventory.slots.filter(Boolean).length), 0, 'the guest has nothing left');
    // No kick to the menu: «Возродиться» brings the player back, the others see it
    await wf(guest.page, () => !document.getElementById('death-respawn-btn').disabled, null, 20000);
    await guest.page.click('#death-respawn-btn');
    await wf(guest.page, () => { const c = window.__zns.game.combat; return !c.dead && c.hp === 20; }, null, 20000);
    await wf(host.page, () => [...window.__zns.game.remotes.values()][0]?.dead === false, null, 20000);
    assert.deepEqual(await ev(guest.page, () => window.__zns.game.inventory.slots.filter(Boolean).map((s) => s.kind + (s.plain ? ':plain' : ''))), ['wand:plain'], 'back with only the wooden wand');
    // The HOST dies: its room stays open, the guest stays in the game
    await ev(host.page, () => window.__zns.game.combat.die(null, 'test'));
    await wf(host.page, () => !document.getElementById('death-screen').classList.contains('hidden'), null, 20000);
    await new Promise((r) => setTimeout(r, 4000));
    assert.ok(await ev(guest.page, () => window.__zns.net.active && window.__zns.game.active), 'the guest is still in the game');
    assert.ok(await ev(host.page, () => window.__zns.net.active && window.__zns.game.active), 'the host is still hosting');
    assert.ok(await ev(guest.page, (id) => [...window.__zns.game.death.bodies.values()].some((b) => b.who === id && b.model?.parent), ids[0]), 'the guest sees the host\'s body');

    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await host.context.close();
    await guest.context.close();
});

test('sword duel: a thrust stays in the other player — both see it in the same place in the body, it bleeds; it comes out on the hand drawing back', async () => {
    const host = await openPlayer('Мечник1');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Мечник2');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active && window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active && window.__zns.game.remotes.size === 1, null, 120000);
    const ids = await Promise.all([host.page, guest.page].map((p) => ev(p, () => window.__zns.game.localId)));
    // the guest stands right in front of the host
    const spot = await ev(host.page, () => { const p = window.__zns.game.character.group.position; return [p.x, p.y, p.z - 1.8]; });
    await ev(guest.page, (t) => { const g = window.__zns.game; g.character.group.position.set(t[0], t[1], t[2]); g.knockback.set(0, 0, 0); }, spot);
    await wf(host.page, (t) => { const r = [...window.__zns.game.remotes.values()][0]; return Math.hypot(r.position.x - t[0], r.position.z - t[2]) < 0.3; }, spot, 20000);
    // the host takes a sword (everybody sees it)
    await ev(host.page, () => {
        const g = window.__zns.game;
        const w = g.weapons.spawn('sword', g.character.getHandWorldPosition('right'), null, 'duelsw');
        g.sync.weaponAppeared(w);
        g.weapons.grab(w, 'right', 0.5);
    });
    await wf(guest.page, (hid) => window.__zns.game.sync.weaponOwners.get('duelsw') === hid && window.__zns.game.weapons.byId.has('duelsw'), ids[0], 20000);
    const hp0 = await ev(guest.page, () => window.__zns.game.combat.hp);
    // a thrust into the guest (Weapons.checkHits finds it; the unit tests cover the swing itself)
    const local = (page, isHost) => ev(page, ([isH, gid]) => {
        const g = window.__zns.game;
        const grp = isH ? g.remotes.get(gid).character.group : g.character.group;
        const w = g.weapons.byId.get('duelsw');
        grp.updateMatrixWorld(true);
        return grp.worldToLocal(w.getTipPosition()).toArray();
    }, [isHost, ids[1]]);
    const hostSees = await ev(host.page, (gid) => {
        const g = window.__zns.game;
        const w = g.weapons.byId.get('duelsw');
        const t = g.combat.meleeTarget(gid);
        g.weapons.onHit(t, 4, new window.__zns.THREE.Vector3(0, 0, -1), true, w, null);
        const [b, tp] = w.getBladeSegment();
        g.weapons._stab(w, t, g.weapons.hands.right, b, tp);
        return { stuck: !!w.stuckIn, held: g.weapons.hands.right.held === w };
    }, ids[1]);
    assert.ok(hostSees.stuck, 'the blade went in');
    assert.ok(hostSees.held, 'still in the host\'s hand');
    await wf(guest.page, () => window.__zns.game.bleeding.anchors.has('duelsw') && window.__zns.game.bleeding.rate > 0, null, 20000);
    await wf(guest.page, (h) => window.__zns.game.combat.hp < h, hp0, 20000);
    const tipH = await local(host.page, true);
    // (the guest's computer draws it there on its next frame)
    await wf(guest.page, (t) => {
        const g = window.__zns.game;
        const p = g.character.group.worldToLocal(g.weapons.byId.get('duelsw').getTipPosition());
        return Math.hypot(p.x - t[0], p.y - t[1], p.z - t[2]) < 0.05;
    }, tipH, 20000);
    const tipG = await local(guest.page, false);
    // the guest steps aside: on both computers the blade goes with the body
    await ev(guest.page, () => { const g = window.__zns.game; g.character.group.position.x += 2; });
    await wf(guest.page, ([t, gp]) => {
        const g = window.__zns.game;
        if (g.character.group.position.x < gp - 0.1) return false;
        const p = g.character.group.worldToLocal(g.weapons.byId.get('duelsw').getTipPosition());
        return Math.hypot(p.x - t[0], p.y - t[1], p.z - t[2]) < 0.05;
    }, [tipG, spot[0] + 2], 20000);
    await wf(host.page, ([gid, t, gp]) => {
        const g = window.__zns.game;
        const grp = g.remotes.get(gid).character.group;
        if (grp.position.x < gp - 0.1) return false;
        const p = grp.worldToLocal(g.weapons.byId.get('duelsw').getTipPosition());
        return Math.hypot(p.x - t[0], p.y - t[1], p.z - t[2]) < 0.05;
    }, [ids[1], tipH, spot[0] + 2], 20000);
    // the host draws the hand back: it comes out, still in the host's hand; the guest bleeds slower
    await ev(host.page, () => window.__zns.game.weapons._unstick(window.__zns.game.weapons.byId.get('duelsw'), false));
    await wf(guest.page, () => !window.__zns.game.bleeding.anchors.has('duelsw') && window.__zns.game.bleeding.rate === 0.5, null, 20000);
    assert.ok(await ev(host.page, () => window.__zns.game.weapons.hands.right.held?.id === 'duelsw'), 'still held');
    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await host.context.close();
    await guest.context.close();
});

test('sword duel: a strong slash cuts off the other player\'s arm, then the head — on both computers; a slow one cuts nothing', async () => {
    const host = await openPlayer('Рубака1');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Рубака2');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active && window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active && window.__zns.game.remotes.size === 1, null, 120000);
    const ids = await Promise.all([host.page, guest.page].map((p) => ev(p, () => window.__zns.game.localId)));
    const spot = await ev(host.page, () => { const p = window.__zns.game.character.group.position; return [p.x + 3, p.y, p.z - 3]; });
    await ev(guest.page, (t) => { const g = window.__zns.game; g.character.group.position.set(t[0], t[1], t[2]); g.knockback.set(0, 0, 0); }, spot);
    await wf(host.page, (t) => { const r = [...window.__zns.game.remotes.values()][0]; return Math.hypot(r.position.x - t[0], r.position.z - t[2]) < 0.3; }, spot, 20000);
    await ev(host.page, () => {
        const g = window.__zns.game;
        const w = g.weapons.spawn('sword', g.character.getHandWorldPosition('right'), null, 'cutsw');
        g.sync.weaponAppeared(w);
        g.weapons.grab(w, 'right', 0.5);
    });
    await wf(guest.page, (hid) => window.__zns.game.sync.weaponOwners.get('cutsw') === hid, ids[0], 20000);
    // The host's hand carries the blade through the guest's body at `speed` m/s, frame by frame
    // (1/60 s): the blade itself follows the hand, the host's weapons find the cut, it goes to
    // the guest's computer by the network. In the guest's own frame: the blade lies along X with
    // its point at tipX; `down` — a chop at (y, z) edge down, else a slash along Z at height y.
    const slash = (o) => ev(host.page, ([gid, o]) => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const grp = g.remotes.get(gid).character.group;
        const ws = g.weapons, w = ws.byId.get('cutsw');
        const qL = new T.Quaternion().setFromRotationMatrix(o.down
            ? new T.Matrix4().makeBasis(new T.Vector3(0, -1, 0), new T.Vector3(1, 0, 0), new T.Vector3(0, 0, 1))
            : new T.Matrix4().makeBasis(new T.Vector3(0, 0, 1), new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0)));
        const [b, t] = w.getBladeSegment();
        const tip = t.clone().sub(w.position).applyQuaternion(w.quaternion.clone().invert()).applyQuaternion(qL); // (COM → point)
        grp.updateMatrixWorld(true);
        const qW = grp.getWorldQuaternion(new T.Quaternion()).multiply(qL);
        const at = (k) => grp.localToWorld(o.down ? new T.Vector3(o.tipX - tip.x, o.y + k - tip.y, o.z - tip.z) : new T.Vector3(o.tipX - tip.x, o.y - tip.y, k - tip.z));
        const target = g.combat.meleeTarget(gid);
        const k0 = o.down ? 1.6 : -1.8, k1 = o.down ? -1.6 : 1.8;
        w.position.copy(at(k0)); w.quaternion.copy(qW); w.velocity.set(0, 0, 0); w.angularVelocity.set(0, 0, 0);
        w.drive.quaternion.copy(qW);
        ws.hands.right.hasPrev = false;
        const n = Math.round(Math.abs(k1 - k0) / (o.speed / 60)) + 20;
        for (let i = 0; i < n; i++) {
            ws.frame++;
            w.drive.position.copy(at(k0 + Math.sign(k1 - k0) * Math.min(Math.abs(k1 - k0), (o.speed / 60) * (i + 1))));
            w.step(1 / 60, null);
            ws.checkHits([target], 1 / 60);
            target.damageCooldown = 0;
        }
        const p = grp.worldToLocal(w.getTipPosition());
        return o.down ? p.y : p.z;
    }, [ids[1], o]);
    // where the guest's left arm is (as the host sees it): the middle of its bone
    const arm = await ev(host.page, (gid) => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const grp = g.remotes.get(gid).character.group;
        const L = g.dismember.which(g.combat.meleeTarget(gid)).body.limbs.find((l) => l.name === 'leftArm');
        const sg = L.segs[0], ob = sg.objs ? sg.objs[0] : sg.obj;
        ob.updateWorldMatrix(true, false);
        return grp.worldToLocal(new T.Vector3(...(sg.o || [0, 0, 0])).addScaledVector(new T.Vector3(...sg.ax).normalize(), Math.min(0.7, sg.len * 0.7)).applyMatrix4(ob.matrixWorld)).toArray();
    }, ids[1]);
    const lost = (page, isHost) => ev(page, ([isH, gid]) => {
        const g = window.__zns.game;
        const ch = isH ? g.remotes.get(gid).character : g.character;
        return Object.keys(ch.limbs || {}).filter((k) => ch.limbs[k] != null).sort().join(',');
    }, [isHost, ids[1]]);
    // slow: nothing comes off
    const chop = { down: true, tipX: arm[0] + 0.3, y: arm[1], z: arm[2] };
    const ySlow = await slash({ ...chop, speed: 2.5 });
    assert.ok(ySlow > arm[1] - 0.2, `a slow blade stops on the arm's bone (${ySlow.toFixed(2)} by ${arm[1].toFixed(2)})`);
    await sleep(1500);
    assert.equal(await lost(guest.page, false), '', 'a slow blade cuts nothing');
    // strong: the left arm
    await slash({ ...chop, speed: 12 });
    await wf(guest.page, () => window.__zns.game.character.limbs?.leftArm != null, null, 20000);
    await wf(host.page, (gid) => window.__zns.game.remotes.get(gid).character.limbs?.leftArm != null, ids[1], 20000);
    // strong at the neck: the head — the guest dies
    await sleep(500); // (one cut per 0.3 s)
    await slash({ down: false, tipX: 1.2, y: 1.55, speed: 12 });
    await wf(guest.page, () => window.__zns.game.combat.dead, null, 20000);
    await wf(host.page, (gid) => window.__zns.game.remotes.get(gid).character.limbs?.head != null || window.__zns.game.remotes.get(gid).dead, ids[1], 20000);
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
        await ev(guest.page, (t) => { const g = window.__zns.game; g.character.group.position.set(t[0], t[1] - 0.6, t[2]); g.knockback.set(0, 0, 0); g.knock?.reset(); }, t);
        await wf(host.page, (t) => { const r = [...window.__zns.game.remotes.values()][0]; return Math.hypot(r.position.x - t[0], r.position.z - t[2]) < 0.6; }, t, 20000);
    };
    const hostCast = (spell) => ev(host.page, (spell) => {
        const g = window.__zns.game;
        g._lastDuelCast = 0;
        return g._castDuel(spell, spell, true);
    }, spell);
    // The guest answers: turns to the host, points the right hand right at him (a charge flies
    // where the hand points — it is not steered round to a wizard the hand is not on) and casts
    const guestAnswer = () => ev(guest.page, () => {
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
    await ev(guest.page, () => { window.__zns.game.combat.stunLeft = 0; window.__zns.game.knock?.reset(); });

    // 2) Duel: the guest answers — charges meet and push; the rested wizard wins
    await setContact(host.page, true, false);
    await setContact(guest.page, true, false);
    await ev(host.page, () => { window.__zns.game.combat.fatigue = 30; });
    await ev(guest.page, () => { window.__zns.game.combat.fatigue = 3; window.__zns.game.combat.hp = 4; });
    await aim();
    await hostCast('Stupefy');
    assert.equal(await guestAnswer(), ids[0], 'the guest points at the host');
    await wf(host.page, () => window.__zns.game.duel.clashes.length === 1, null, 40000);
    await wf(guest.page, () => window.__zns.game.duel.clashes.length === 1, null, 20000);
    await wf(guest.page, () => window.__zns.game.combat.stunned, null, 90000);
    assert.equal(await ev(host.page, () => window.__zns.game.combat.stunned), false, 'the stronger one wins');
    await ev(guest.page, () => { window.__zns.game.combat.stunLeft = 0; window.__zns.game.knock?.reset(); });

    // 3) Calm exit: hand off the opponent, then a flick → the duel just ends
    await ev(host.page, () => { window.__zns.game.combat.fatigue = 30; });
    await ev(guest.page, () => { window.__zns.game.combat.fatigue = 30; window.__zns.game.combat.hp = 20; });
    await aim();
    await hostCast('Stupefy');
    assert.equal(await guestAnswer(), ids[0], 'the guest points at the host');
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

test('«Левиоса» on a wizard holds him up (the same phrase heard again lets nothing go), any two charges against each other meet, a friend\'s wand points as in his own hand', async () => {
    const host = await openPlayer('Гарри');
    await host.page.click('#mp-private-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Драко');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active && window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active && window.__zns.game.remotes.size === 1, null, 120000);
    const hostId = await ev(host.page, () => window.__zns.game.localId);
    const aim = async (dist) => {
        const t = await ev(host.page, (dist) => {
            const g = window.__zns.game;
            return g.character.getHandWorldPosition('right').addScaledVector(g.character.getHandDirection('right'), dist).toArray();
        }, dist);
        await ev(guest.page, (t) => { const g = window.__zns.game; g.character.group.position.set(t[0], t[1] - 0.6, t[2]); g.knockback.set(0, 0, 0); g.knock?.reset(); }, t);
        await wf(host.page, (t) => { const r = [...window.__zns.game.remotes.values()][0]; return Math.hypot(r.position.x - t[0], r.position.z - t[2]) < 0.6; }, t, 20000);
    };
    const say = (page, text, fin) => ev(page, ([text, fin]) => window.__zns.game.castLocalSpell(text, fin), [text, fin]);

    // 1) «Левиоса» at the guest: he rises — and the microphone repeating the phrase (unfinished,
    //    then final) does not set him down again: he stays up, following the host's hand
    await aim(14);
    const height = () => ev(guest.page, () => { const g = window.__zns.game, p = g.character.group.position; return p.y - g.collision.surfaceY(p.x, p.z); });
    await wf(guest.page, () => window.__zns.game.character.onGround, null, 20000);
    const h0 = await height();
    assert.equal(await say(host.page, 'вингардиум левиоса', false), 'Levitation');
    await wf(guest.page, () => !!window.__zns.game.levitation.lifted, null, 20000);
    await wf(host.page, () => window.__zns.game.levitation.state?.kind === 'player', null, 20000);
    await sleep(700);
    assert.equal(await say(host.page, 'вингардиум левиоса', false), null, 'the same phrase again: nothing');
    await sleep(500);
    assert.equal(await say(host.page, 'вингардиум левиоса', true), null, 'its final version: nothing');
    await sleep(1500);
    const up = await ev(guest.page, () => { const g = window.__zns.game, p = g.character.group.position; return { lifted: !!g.levitation.lifted, h: p.y - g.collision.surfaceY(p.x, p.z) }; });
    assert.ok(up.lifted, 'still held up');
    assert.ok(up.h > h0 + 0.5, `up in the air: ${up.h.toFixed(2)} (standing ${h0.toFixed(2)})`);
    // the host turns: the guest is carried with the hand
    const before = await ev(guest.page, () => window.__zns.game.character.group.position.toArray());
    await ev(host.page, () => { const g = window.__zns.game; g.character.group.rotation.y = g.smoothBody = g.cameraBaseRotation = g.character.group.rotation.y + 0.6; });
    await wf(guest.page, (b) => { const p = window.__zns.game.character.group.position; return Math.hypot(p.x - b[0], p.z - b[2]) > 3; }, before, 15000);
    assert.ok(await ev(guest.page, () => !!window.__zns.game.levitation.lifted), 'carried, not dropped');
    // a new phrase later lets him down
    await wf(host.page, () => window.__zns.game.levitation.state?.age > 2.6, null, 20000); // (game time: the test browser is slow)
    assert.equal(await say(host.page, 'вингардиум левиоса', true), 'Levitation');
    await wf(guest.page, () => !window.__zns.game.levitation.lifted, null, 15000);
    await ev(host.page, () => { const g = window.__zns.game; g.character.group.rotation.y = g.smoothBody = g.cameraBaseRotation = g.character.group.rotation.y - 0.6; });
    await wf(guest.page, () => window.__zns.game.character.onGround, null, 20000);

    // 2) A duel from two DIFFERENT spells, the guest's hand a little beside the host (not his
    //    target): the charges fly against each other and meet all the same
    await ev(host.page, () => { window.__zns.game.combat.fatigue = 30; });
    await ev(guest.page, () => { window.__zns.game.combat.fatigue = 30; });
    await aim(25);
    await sleep(500);
    await ev(host.page, () => { const g = window.__zns.game; g._lastDuelCast = 0; return g._castDuel('Stupefy', 'Stupefy', true); });
    const guestTk = await ev(guest.page, () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const target = [...g.remotes.values()][0].position.clone().add(new T.Vector3(0, 0.6, 0));
        for (let i = 0; i < 6; i++) {
            ch.group.updateMatrixWorld(true);
            const o = g.castOrigin('right', new T.Vector3()), d = ch.getPointingDirection('right', new T.Vector3());
            const want = target.clone().sub(o);
            const err = Math.atan2(-want.x, -want.z) - Math.atan2(-d.x, -d.z);
            ch.group.rotation.y = g.smoothBody = g.cameraBaseRotation = ch.group.rotation.y + Math.atan2(Math.sin(err), Math.cos(err));
        }
        // (6° beside him: too far off to be aimed at him)
        ch.group.rotation.y = g.smoothBody = g.cameraBaseRotation = ch.group.rotation.y + 0.11;
        ch.group.updateMatrixWorld(true);
        return g.duel.cast('SapiraDuel', null, 'right').tk;
    });
    assert.equal(guestTk, 'n', 'the guest\'s charge is aimed at nobody');
    await wf(host.page, () => window.__zns.game.duel.clashes.length === 1, null, 20000);
    await wf(guest.page, () => window.__zns.game.duel.clashes.length === 1, null, 20000);
    // (the guest lets go calmly: hand off, then a flick)
    await ev(guest.page, () => { const d = window.__zns.game.duel; const t0 = performance.now(); const real = d._contact.bind(d); d._contact = (id, ...r) => (id === d.me ? { ok: false, jerk: performance.now() - t0 > 450 } : real(id, ...r)); });
    await wf(host.page, () => window.__zns.game.duel.clashes.length === 0, null, 30000);

    // 3) The host takes a wand: on the guest's screen it points the way it points in his hand
    await ev(host.page, () => window.__zns.game.items.takeIntoHand({ kind: 'wand', uid: 'mpw1', plain: true, model: 0, color: 0x8b5a2b, power: 0 }, 'right'));
    await wf(guest.page, (id) => !!window.__zns.game.items.remoteHeld.get(id)?.right, hostId, 20000);
    await sleep(1500);
    const own = await ev(host.page, () => { const T = window.__zns.THREE, m = window.__zns.game.items.held.right.model; return new T.Vector3(0, 1, 0).applyQuaternion(m.getWorldQuaternion(new T.Quaternion())).toArray(); });
    const seen = await ev(guest.page, (id) => { const T = window.__zns.THREE, m = window.__zns.game.items.remoteHeld.get(id).right.model; return new T.Vector3(0, 1, 0).applyQuaternion(m.quaternion).toArray(); }, hostId);
    const ang = Math.acos(Math.max(-1, Math.min(1, own[0] * seen[0] + own[1] * seen[1] + own[2] * seen[2]))) * 180 / Math.PI;
    assert.ok(ang < 15, `the friend's wand points as in his own hand (off by ${ang.toFixed(1)}°)`);

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
    assert.match(row, /Выживание/); // (the player-facing name of 'freeworld')
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
