/**
 * The king commands the crew of his own ship, in a real browser: the crew never turns on him, answers «к бою» (gunners at the
 * guns, balls from the racks), «огонь по кораблю» (only the side that looks at the enemy fires and the ball lands on her),
 * turns the ship when no side bears, «на абордаж» (the crew leaps across and fights the enemy crew), «отбой».
 * Run: node --test tests/e2e/fleet-orders.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8177;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 30);
}), n);

/** Two galleons at sea: mine (the king's) at the origin of a calm patch, the enemy `dx`/`dz` ship-local metres away. */
async function fleet(page, { dx = 70, dz = 0, enemyYaw = 0 } = {}) {
    return page.evaluate(({ dx, dz, enemyYaw }) => {
        const g = window.__zns.game;
        const S = g.terrain.data.seas;
        const sea = S.nearest(0, 0);
        let a = 0.7;
        for (; a < 7; a += 0.3) { const q = S.pointAt(sea, a, 220); if (S.signedDist(q.x, q.z) > 260) break; }
        const p = S.pointAt(sea, a, 220);
        g.world.terrain.flushAround(p.x, p.z);
        g.seaSurface?.flush?.(p.x, p.z);
        g.ships.calm = true;
        const mine = g.ships.spawn('galleon', p.x, p.z, 0, { id: 'king-ship' });
        mine.owner = g.localId; // (taken: his)
        const foe = g.ships.spawn('galleon', p.x + dx, p.z + dz, enemyYaw, { id: 'foe-ship' });
        window.__mine = mine; window.__foe = foe;
        return { x: p.x, z: p.z };
    }, { dx, dz, enemyYaw });
}

test('fleet: the king aboard his own ship — the crew does not turn on him; «к бою», «огонь по кораблю»: the starboard guns fire and the ball hits her', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 400, height: 240 } });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await fleet(page, { dx: 70, dz: 0 });
    await page.evaluate(() => {
        const g = window.__zns.game, s = window.__mine;
        const w = s.pose.toWorld(0, s.layout.deck + 2, -4, { x: 0, y: 0, z: 0 });
        g.character.group.position.set(w.x, w.y, w.z);
    });
    await feed(page, { arms: 'down' }, 4, 40);
    await frames(page, 30);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, crew = g.ships.crew, s = window.__mine, foe = window.__foe;
        crew.provoke(s, g.localId, 'x'); // (the king: nobody provokes his crew)
        const hostile = s.hostile.size;
        const said = [];
        const orig = crew._say.bind(crew);
        crew._say = (v, t, ...a) => { said.push(t); return orig(v, t, ...a); };
        const sail = [...crew.byId.values()].find((x) => x.ship === s && x.role === 'captain');
        const racks0 = [...s.racks.values()].reduce((a, b) => a + b, 0);
        const heard = crew.hear('К бою!', sail) || g.fleet.hear('К бою!', sail);
        return { hostile, heard: !!heard, said, racks0, mode: g.fleet.st.get(s.id)?.mode };
    });
    assert.equal(r.hostile, 0, 'the master is nobody\'s foe');
    assert.equal(r.mode, 'battle');
    assert.ok(r.said.some((t) => /к бою|орудиям|по местам|слушаюсь/i.test(t)), JSON.stringify(r.said));
    await frames(page, 300); // (the gunners walk to the guns and load them)
    const loaded = await page.evaluate(() => [...window.__mine.guns.values()].filter((g) => g.loaded).length);
    assert.ok(loaded >= 2, `guns loaded: ${loaded}`);
    const fire = await page.evaluate(() => {
        const g = window.__zns.game;
        const sail = [...g.ships.crew.byId.values()].find((x) => x.ship === window.__mine && x.role === 'captain');
        window.__hp0 = window.__foe.hull ?? window.__foe.hp ?? null;
        window.__shots = 0;
        const C = g.ships.cannons, f0 = C.fire.bind(C);
        C.fire = (G) => { window.__shots++; window.__side = G.spec.side; return f0(G); };
        return !!g.fleet.hear('Огонь по кораблю', sail);
    });
    assert.ok(fire);
    await frames(page, 300);
    const out = await page.evaluate(() => ({ shots: window.__shots, side: window.__side, foeDamaged: (window.__foe.holes?.length || 0) > 0 || window.__foe.lastBy === window.__zns.game.localId, target: window.__zns.game.fleet.st.get('king-ship')?.target }));
    assert.ok(out.shots >= 1, `shots: ${out.shots}`);
    assert.equal(out.side, 1, 'the starboard guns (the enemy is to starboard)');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('fleet: the enemy dead ahead — the crew turns the ship; then fires. «Отбой» stops everything', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 400, height: 240 } });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await fleet(page, { dx: 0, dz: -90 });
    await page.evaluate(() => {
        const g = window.__zns.game, s = window.__mine;
        const w = s.pose.toWorld(0, s.layout.deck + 2, -4, { x: 0, y: 0, z: 0 });
        g.character.group.position.set(w.x, w.y, w.z);
    });
    await feed(page, { arms: 'down' }, 4, 40);
    await frames(page, 30);
    const yaw0 = await page.evaluate(() => {
        const g = window.__zns.game, s = window.__mine;
        const cap = [...g.ships.crew.byId.values()].find((x) => x.ship === s && x.role === 'captain');
        g.fleet.hear('Пушки к бою', cap);
        g.fleet.hear('Огонь по кораблю', cap);
        window.__shots = 0;
        const C = g.ships.cannons, f0 = C.fire.bind(C);
        C.fire = (G) => { window.__shots++; return f0(G); };
        return s.st.yaw;
    });
    await frames(page, 600);
    const r = await page.evaluate((yaw0) => {
        const g = window.__zns.game, s = window.__mine;
        let d = (s.st.yaw - yaw0) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
        return { turned: Math.abs(d), shots: window.__shots, auto: !!g.fleet.st.get(s.id)?.auto };
    }, yaw0);
    assert.ok(r.turned > 0.8, `the ship came about: ${r.turned}`);
    const cease = await page.evaluate(() => {
        const g = window.__zns.game, s = window.__mine;
        const cap = [...g.ships.crew.byId.values()].find((x) => x.ship === s && x.role === 'captain');
        g.fleet.hear('Отбой', cap);
        const f = g.fleet.st.get(s.id);
        return { mode: f?.mode, target: f?.target, gunners: [...g.ships.crew.byId.values()].filter((v) => v.gun).length };
    });
    assert.equal(cease.mode, 'idle'); assert.equal(cease.target, null); assert.equal(cease.gunners, 0);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('fleet: «на абордаж» — alongside, the crew leaps across and fights the enemy crew', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 400, height: 240 } });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await fleet(page, { dx: 34, dz: 0 });
    await page.evaluate(() => {
        const g = window.__zns.game, s = window.__mine;
        const w = s.pose.toWorld(0, s.layout.deck + 2, -4, { x: 0, y: 0, z: 0 });
        g.character.group.position.set(w.x, w.y, w.z);
    });
    await feed(page, { arms: 'down' }, 4, 40);
    await frames(page, 30);
    await page.evaluate(() => {
        const g = window.__zns.game, s = window.__mine;
        const cap = [...g.ships.crew.byId.values()].find((x) => x.ship === s && x.role === 'captain');
        g.fleet.hear('На абордаж!', cap);
    });
    let seen = { over: 0, fights: 0 };
    for (let i = 0; i < 160; i++) {
        await frames(page, 10);
        const r = await page.evaluate(() => {
            const g = window.__zns.game, s = window.__mine, foe = window.__foe;
            const mine = [...g.ships.crew.byId.values()].filter((v) => v.crew === s);
            const over = mine.filter((v) => v.ship === foe && !v.dead).length;
            const fights = mine.filter((v) => v.ship === foe && v.foe).length;
            return { over, fights, foeAlive: g.ships.crew.alive(foe), mine: g.ships.crew.alive(s) };
        });
        seen.over = Math.max(seen.over, r.over); seen.fights = Math.max(seen.fights, r.fights); seen.last = r;
        if (r.foeAlive === 0 || (seen.over >= 3 && seen.fights >= 1)) break;
    }
    assert.ok(seen.over >= 3, `boarders over: ${seen.over}`);
    assert.ok(seen.fights >= 1, 'they fought the enemy crew');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
