/**
 * Beds and sleeping — in a real browser.
 * Run: node --test tests/e2e/beds.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8163;
const PEER_PORT = PORT + 1013; // (its own signalling server: other test files may run at the same time)
let srv, browser, peerServer;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
    if (peerServer) {
        peerServer.close?.();
        setTimeout(() => process.exit(0), 500).unref(); // (PeerServer keeps an http server open)
    }
});

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);
const waitFor = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

test('beds: wool from a sheep, logs thrown from the hand, «Create a Bed», «Change a color», sleeping through the night, the save', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await frames(page, 10);

    // a sheep dies → 2–3 balls of wool roll out
    const wool = await page.evaluate(() => {
        const g = window.__zns.game, THREE = window.__zns.THREE;
        window.__said = [];
        const sv = g.hud.setVoice.bind(g.hud);
        g.hud.setVoice = (t, s) => { window.__said.push(String(t)); return sv(t, s); };
        const me = g.character.group.position;
        const p = new THREE.Vector3(me.x + 8, 0, me.z - 6);
        p.y = g.collision.groundY(p.x, p.z) + 0.5;
        const a = g.animals._spawn('sheep', p, { id: 'test-sheep' });
        g.animals.hit(a, 100, null, g.localId);
        return { dead: a.dead, n: [...g.items.loose.values()].filter((L) => L.item.kind === 'wool').length };
    });
    assert.equal(wool.dead, true);
    assert.ok(wool.n >= 2 && wool.n <= 3, 'wool balls: ' + wool.n);

    // wood out of the hand: a bundle of 4 logs; touching it puts the wood back
    const thrown = await page.evaluate(async () => {
        const g = window.__zns.game;
        const { BLOCK } = await import('/src/world/Terrain.js');
        g.inventory.addResource(BLOCK.WOOD, 10);
        const i = g.inventory.slots.findIndex((s) => s && s.kind === 'res' && s.block === BLOCK.WOOD);
        g.inventory.select(i);
        const s = g.inventory.slots[i];
        const first = g.beds.throwWood();
        const afterThrow = s.count;
        // pick the first bundle up again: back into the stack
        g.items.pickUp(first.uid, g.localId, 'right');
        const afterPick = s.count;
        const second = g.beds.throwWood();
        return { inHand: g.inventory.inHand?.kind, first: first?.count, afterThrow, afterPick, second: second?.count, left: s.count, uid: second.uid };
    });
    assert.deepEqual({ ...thrown, uid: undefined }, { inHand: 'res', first: 4, afterThrow: 6, afterPick: 10, second: 4, left: 6, uid: undefined });
    await frames(page, 90); // the bundle lands

    // gather the wool next to the logs; only 2 at first → the hint says what's missing
    const missing = await page.evaluate((uid) => {
        const g = window.__zns.game;
        const L = g.items.loose.get(uid);
        const at = L.model.position.clone();
        window.__at = at;
        const balls = [...g.items.loose.values()].filter((x) => x.item.kind === 'wool');
        balls.forEach((b, i) => { b.model.position.set(at.x + (i < 2 ? 0.8 + i * 0.7 : 40), at.y + 0.4, at.z + 0.6); b.rest = false; b.vel.set(0, 0, 0); });
        g.beds.testAim = { x: at.x, y: at.y, z: at.z };
        window.__said.length = 0;
        const r = g.castLocalSpell('Create a Bed', true);
        return { r, rest: L.rest, said: window.__said.join(' | '), beds: g.beds.list.size };
    }, thrown.uid);
    assert.equal(missing.r, null);
    assert.equal(missing.beds, 0);
    assert.match(missing.said, /Нужно ещё: 1 клубок шерсти/);

    // the third ball comes — «Create a Bed»: sparks, a white bed; the materials are gone
    await page.waitForTimeout(1300);
    const made = await page.evaluate(() => {
        const g = window.__zns.game, at = window.__at;
        const extra = [...g.items.loose.values()].filter((x) => x.item.kind === 'wool').find((b) => Math.abs(b.model.position.x - at.x) > 20);
        if (extra) { extra.model.position.set(at.x - 0.8, at.y + 0.4, at.z - 0.5); extra.rest = false; }
        else g.items.spawnLoose({ kind: 'wool', uid: 'w-extra', count: 1 }, at.clone().add(new window.__zns.THREE.Vector3(-0.8, 0.4, -0.5)));
        return new Promise((res) => setTimeout(() => {
            const r = g.castLocalSpell('Крейт э бед', true);
            const b = [...g.beds.list.values()][0];
            const near = [...g.items.loose.values()].filter((x) => (x.item.kind === 'wool' || x.item.kind === 'logs') && x.model.position.distanceTo(at) < 4).length;
            res({ r, n: g.beds.list.size, color: b?.color, near, dist: b ? Math.hypot(b.x - at.x, b.z - at.z) : null, inScene: !!b?.model.parent, box: b?.boxId != null });
        }, 600));
    });
    assert.equal(made.r, 'CreateBed');
    assert.equal(made.n, 1);
    assert.equal(made.color, 'white');
    assert.equal(made.near, 0, 'the logs and the wool are used up');
    assert.ok(made.dist < 2, 'the bed stands where the things lay');
    assert.ok(made.inScene && made.box);

    // «Change a color синий» → blue at once; an interim phrase + its final version recolour once
    await page.waitForTimeout(1300);
    const painted = await page.evaluate(async () => {
        const g = window.__zns.game;
        const b = [...g.beds.list.values()][0];
        g.beds.testAim = { x: b.x, y: b.y, z: b.z };
        const r1 = g.castLocalSpell('Change a color синий', true);
        const blue = b.color, hex = b.model.userData.blanket[0].material.color.getHex();
        await new Promise((r) => setTimeout(r, 1300));
        const r2 = g.castLocalSpell('поменяй цвет на красный', false);
        const r3 = g.castLocalSpell('поменяй цвет на красный', true);
        window.__said.length = 0;
        await new Promise((r) => setTimeout(r, 1300));
        const r4 = g.castLocalSpell('Change a color', true);
        return { r1, blue, hex, r2, r3, red: b.color, r4, said: window.__said.join(' | ') };
    });
    assert.deepEqual({ ...painted, said: undefined }, { r1: 'ChangeColor', blue: 'blue', hex: 0x2c5fd6, r2: 'ChangeColor', r3: null, red: 'red', r4: null, said: undefined });
    assert.match(painted.said, /Назовите цвет/);

    // night: sit down at the bed → the hero lies; everybody (me) asleep and still → morning
    const lay = await page.evaluate(() => {
        const g = window.__zns.game;
        g.beds.testAim = null;
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.75;
        g.world.setDayPhase(g.dayPhase());
        const b = [...g.beds.list.values()][0];
        const c = Math.cos(b.ry), s = Math.sin(b.ry), lx = 1.25 + 0.9;
        const ch = g.character;
        ch.group.position.set(b.x + lx * c, g.collision.groundY(b.x + lx * c, b.z - lx * s) + 2, b.z - lx * s);
        ch.setCrouching(true); // (the tracking would say: the player sat down)
        return { night: g.world.nightAmount, isNight: g.isNight };
    });
    assert.ok(lay.night > 0.9 && lay.isNight);
    await waitFor(page, () => !!window.__zns.game.beds.lying, null, 15000);
    const lying = await page.evaluate(() => {
        const g = window.__zns.game, ch = g.character, b = g.beds.list.get(g.beds.lying);
        return { rx: ch.group.rotation.x, onBed: Math.hypot(ch.group.position.x - b.x, ch.group.position.z - b.z) < 1, high: ch.group.position.y - b.y };
    });
    assert.ok(Math.abs(lying.rx - Math.PI / 2) < 0.01, 'lies on the back');
    assert.ok(lying.onBed && lying.high > 1 && lying.high < 2, JSON.stringify(lying));
    await waitFor(page, () => !!window.__zns.game.beds.sleeping, null, 15000);
    const asleep = await page.evaluate(() => ({ overlay: document.getElementById('sleep-fade')?.textContent }));
    assert.match(asleep.overlay, /Вы заснули/);
    await waitFor(page, () => !window.__zns.game.beds.sleeping, null, 15000);
    const morning = await page.evaluate(() => {
        const g = window.__zns.game;
        return { phase: g.dayPhase(), night: g.world.nightAmount, isNight: g.isNight, overlay: document.getElementById('sleep-fade').style.display, said: window.__said.join(' | '), lying: !!g.beds.lying };
    });
    assert.ok(morning.phase < 0.15, 'morning: ' + morning.phase);
    assert.ok(morning.night < 0.05 && !morning.isNight);
    assert.equal(morning.overlay, 'none');
    assert.match(morning.said, /Доброе утро/);
    assert.equal(morning.lying, true, 'still in bed after waking up');

    // stand up (the player stood up for real) → beside the bed, upright
    await page.evaluate(() => window.__zns.game.character.setCrouching(false));
    await waitFor(page, () => !window.__zns.game.beds.lying, null, 10000);
    const up = await page.evaluate(() => {
        const g = window.__zns.game, ch = g.character, b = [...g.beds.list.values()][0];
        return { rx: ch.group.rotation.x, d: Math.hypot(ch.group.position.x - b.x, ch.group.position.z - b.z) };
    });
    assert.equal(up.rx, 0);
    assert.ok(up.d > 1.5, 'stands beside the bed');

    // the bed is in the world save; a castle bed by its id is not reset by the generator
    const saved = await page.evaluate(() => {
        const g = window.__zns.game, THREE = window.__zns.THREE;
        const snap = g.keeper.snapshot();
        const me = g.character.group.position;
        g.beds.restore([{ id: 'castle1-bed1', x: me.x + 20, y: g.collision.groundY(me.x + 20, me.z), z: me.z, ry: 0, color: 'green' }]);
        const again = g.beds.spawnBed(new THREE.Vector3(me.x + 20, 0, me.z), 0, 'white', { id: 'castle1-bed1' });
        return { beds: snap.beds, kept: again.color, n: g.beds.list.size };
    });
    assert.equal(saved.beds.length, 1);
    assert.equal(saved.beds[0].color, 'red');
    assert.deepEqual(Object.keys(saved.beds[0]).sort(), ['color', 'id', 'ry', 'x', 'y', 'z']);
    assert.equal(saved.kept, 'green');
    assert.equal(saved.n, 2);

    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

// ------------------------------------------------------------------ multiplayer
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

test('beds in multiplayer: a guest creates and repaints (the host decides), both lie down → the night passes for both', async () => {
    peerServer = PeerServer({ port: PEER_PORT, path: '/zns', host: '127.0.0.1' });
    const host = await openPlayer('Хост');
    await host.page.evaluate(() => { document.getElementById('mp-mode').value = 'creative'; }); // (the mode of «Создать сервер»)
    await host.page.click('#mp-private-btn'); // (the game by code starts at once; the code is shown)
    await waitFor(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Гость');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await waitFor(guest.page, () => document.getElementById('mp-status').textContent.includes('Подключено'), null, 30000);
    await waitFor(host.page, () => document.getElementById('mp-players').textContent.includes('Гость'), null, 15000);
    await waitFor(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await waitFor(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await waitFor(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await waitFor(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);

    // the host's world: logs and wool on the ground (the guest sees them too)
    const spot = await host.page.evaluate(() => {
        const g = window.__zns.game, THREE = window.__zns.THREE;
        const at = { x: 14, z: 6 };
        at.y = g.collision.groundY(at.x, at.z);
        g.items.spawnLoose({ kind: 'logs', uid: 'mp-logs', count: 4, block: 1, color: 0x8b5a2b }, new THREE.Vector3(at.x, at.y + 0.3, at.z));
        for (let i = 0; i < 3; i++) g.items.spawnLoose({ kind: 'wool', uid: 'mp-wool' + i, count: 1 }, new THREE.Vector3(at.x + 0.7 * (i - 1), at.y + 0.3, at.z + 0.9));
        return at;
    });
    await waitFor(guest.page, () => ['mp-logs', 'mp-wool0', 'mp-wool1', 'mp-wool2'].every((u) => window.__zns.game.items.loose.has(u)), null, 20000);
    await frames(host.page, 30);
    // the guest casts «Create a Bed» at them → the host makes the bed, everybody sees it
    const cast = await guest.page.evaluate((at) => {
        const g = window.__zns.game;
        g.beds.testAim = at;
        return g.castLocalSpell('Create a Bed', true);
    }, spot);
    assert.equal(cast, 'CreateBed');
    await waitFor(host.page, () => window.__zns.game.beds.list.size === 1, null, 20000);
    await waitFor(guest.page, () => window.__zns.game.beds.list.size === 1 && !window.__zns.game.items.loose.has('mp-logs') && !window.__zns.game.items.loose.has('mp-wool1'), null, 20000);
    // the guest repaints it green
    await guest.page.waitForTimeout(1300);
    const id = await guest.page.evaluate(() => {
        const g = window.__zns.game, b = [...g.beds.list.values()][0];
        g.beds.testAim = { x: b.x, y: b.y, z: b.z };
        g.castLocalSpell('поменяй цвет на зелёный', true);
        return b.id;
    });
    await waitFor(host.page, (id) => window.__zns.game.beds.list.get(id)?.color === 'green', id, 20000);
    await waitFor(guest.page, (id) => window.__zns.game.beds.list.get(id)?.color === 'green', id, 20000);

    // a second bed from the castle API on the host → the guest gets it
    const id2 = await host.page.evaluate((at) => {
        const g = window.__zns.game, THREE = window.__zns.THREE;
        const p = new THREE.Vector3(at.x + 9, 0, at.z);
        p.y = g.collision.groundY(p.x, p.z);
        return g.beds.spawnBed(p, 0, 'pink').id;
    }, spot);
    await waitFor(guest.page, (id) => window.__zns.game.beds.list.get(id)?.color === 'pink', id2, 20000);

    // night for both (the same clock); the host lies down alone: the night goes on
    const dayStart = await host.page.evaluate(() => {
        const g = window.__zns.game;
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.75;
        g.world.setDayPhase(g.dayPhase());
        return g.dayStart;
    });
    await guest.page.evaluate((d) => { const g = window.__zns.game; g.dayStart = d; g.world.setDayPhase(g.dayPhase()); }, dayStart);
    const sitDown = (page, bedId) => page.evaluate((bedId) => {
        const g = window.__zns.game, b = g.beds.list.get(bedId), ch = g.character;
        const c = Math.cos(b.ry), s = Math.sin(b.ry), lx = 1.25 + 0.9;
        ch.group.position.set(b.x + lx * c, g.collision.groundY(b.x + lx * c, b.z - lx * s) + 2, b.z - lx * s);
        ch.setCrouching(true);
    }, bedId);
    await sitDown(host.page, id);
    await waitFor(host.page, () => !!window.__zns.game.beds.lying, null, 15000);
    await host.page.waitForTimeout(5000);
    assert.equal(await host.page.evaluate(() => !!window.__zns.game.beds.sleeping), false, 'the guest is still awake');
    // the guest lies down too → the host sees him lying → after 3 s of stillness the night passes for both
    await sitDown(guest.page, id2);
    await waitFor(guest.page, () => !!window.__zns.game.beds.lying, null, 15000);
    await waitFor(host.page, () => { const r = [...window.__zns.game.remotes.values()][0]; return Math.abs(r.character.group.rotation.x - Math.PI / 2) < 0.1; }, null, 15000);
    await waitFor(guest.page, () => !!window.__zns.game.beds.sleeping, null, 20000);
    await waitFor(guest.page, () => !window.__zns.game.beds.sleeping, null, 20000);
    await waitFor(host.page, () => !window.__zns.game.beds.sleeping, null, 20000);
    const days = await Promise.all([host.page, guest.page].map((p) => p.evaluate(() => { const g = window.__zns.game; return { start: g.dayStart, phase: g.dayPhase(), night: g.world.nightAmount }; })));
    assert.equal(days[0].start, days[1].start, 'the host decided the morning for both');
    for (const d of days) assert.ok(d.phase < 0.15 && d.night < 0.05, JSON.stringify(d));

    assert.deepEqual(realErrors(host.errors).filter((e) => !/peer|webrtc|ice/i.test(e)), []);
    assert.deepEqual(realErrors(guest.errors).filter((e) => !/peer|webrtc|ice/i.test(e)), []);
    await guest.context.close();
    await host.context.close();
});
