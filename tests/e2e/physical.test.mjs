/**
 * Physical interaction (Impact / Knockdown / BodyImpact / CreatureImpact / BodyStrikes):
 * pushes, staggers, knockdowns, punches, head jolts and falls — on players and on creatures.
 * Run: ZNS_TEST_PORT=8241 node --test tests/e2e/physical.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8195;
const PEER_PORT = 9030;
let srv, browser, peerServer;
test.before(async () => {
    srv = await startServer(PORT);
    peerServer = PeerServer({ port: PEER_PORT, path: '/zns', host: '127.0.0.1' });
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
    peerServer?.close?.();
    setTimeout(() => process.exit(0), 500).unref();
});

const wf = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const squatUp = async (page) => { await feed(page, { arms: 'down', noseY: 0.62 }, 12, 40); await feed(page, { arms: 'down', noseY: 0.25 }, 12, 40); };

/** Drive one of `page`'s hands with a fist along a path to a point (the real BodyStrikes code decides). */
const fistInto = (page, targetExpr, from, speed = 8) => ev(page, ([targetExpr, from, speed]) => {
    const g = window.__zns.game, T = window.__zns.THREE, S = g.strikes;
    const target = new Function('g', 'T', `return ${targetExpr}`);
    const st = { k: 0 };
    const len = Math.hypot(...from);
    window.__fist = window.__fist || { orig: S.update, knuckles: S._knuckles, curl: g.character.getGripCurl };
    g.character.getGripCurl = () => 0.95;
    S._knuckles = (side, out) => {
        if (side !== 'right') return out.set(0, -80, 0);
        const t = target(g, T);
        const k = Math.min(1 + 0.3 / len, st.k);
        return out.copy(t).add(new T.Vector3(...from).multiplyScalar(1 - k));
    };
    S.update = (dt) => { st.k += speed * dt / len; window.__fist.orig.call(S, dt); };
}, [targetExpr, from, speed]);
const fistOff = (page) => ev(page, () => {
    const g = window.__zns.game, F = window.__fist;
    if (!F) return;
    g.strikes.update = F.orig; g.strikes._knuckles = F.knuckles; g.character.getGripCurl = F.curl;
    window.__fist = null;
});

test('falls and creatures: a high fall knocks me over (up by a squat); spells and fists throw zombies and animals, they get up by themselves', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'down' }, 12, 40);

    // 1) dropped from 9 m: off the feet; up only after lying 1.5 s and a squat
    await ev(page, () => { const g = window.__zns.game; g.knock.reset(); g.character.group.position.y += 9; });
    await wf(page, () => window.__zns.game.knock.state === 'down', null, 5000);
    assert.ok(await ev(page, () => window.__zns.game.character.group.rotation.x > 1 || Math.abs(window.__zns.game.character.group.rotation.z) > 1 || window.__zns.game.knock.state === 'down'));
    await new Promise((r) => setTimeout(r, 1700));
    await squatUp(page);
    await wf(page, () => window.__zns.game.knock.state === 'up', null, 5000);
    // a small drop: stays on the feet
    await ev(page, () => { window.__zns.game.character.group.position.y += 2.5; });
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await ev(page, () => window.__zns.game.knock.state), 'up');

    // 2) Earthquake under a zombie and a pig: both fall, lie, then get up by themselves
    const ids = await ev(page, () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const yaw = ch.group.rotation.y, f = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const zp = ch.group.position.clone().addScaledVector(f, 7);
        const z = g._createZombie(zp);
        z.health = 80; z.speed = z.baseSpeed = 0;
        const pp = ch.group.position.clone().addScaledVector(f, 9).add(new T.Vector3(f.z * 2, 0, -f.x * 2));
        const pig = g.animals._spawn('pig', new T.Vector3(pp.x, g.collision.groundY(pp.x, pp.z) + 0.5, pp.z));
        return { z: z.id, pig: pig.id };
    });
    await new Promise((r) => setTimeout(r, 500));
    await ev(page, () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const yaw = ch.group.rotation.y, d = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const o = ch.group.position.clone().setY(g.collision.groundY(ch.group.position.x, ch.group.position.z));
        g.spells.cast('EarthquakeMaxima', o, d, 'right', g.localId);
    });
    await wf(page, (id) => ['falling', 'down'].includes(window.__zns.game.creatureImpact.stateOf(window.__zns.game.zombieById.get(id))), ids.z, 5000);
    await wf(page, (id) => ['falling', 'down'].includes(window.__zns.game.creatureImpact.stateOf(window.__zns.game.animals.byId.get(id))), ids.pig, 5000);
    await wf(page, (id) => Math.abs(window.__zns.game.zombieById.get(id).group.userData.impPivot?.rotation.x || 0) > 1.3, ids.z, 3000);
    assert.equal(await ev(page, () => window.__zns.game.knock.state), 'up', 'my own quake does not throw me');
    await wf(page, (ids) => { const g = window.__zns.game; return g.creatureImpact.stateOf(g.zombieById.get(ids.z)) === 'up' && g.creatureImpact.stateOf(g.animals.byId.get(ids.pig)) === 'up'; }, ids, 12000);

    // 3) a real fist into the zombie's face: it is hurt and its head snaps
    await ev(page, (id) => {
        const g = window.__zns.game, z = g.zombieById.get(id);
        g.character.group.position.set(z.group.position.x - 2.4, g.character.group.position.y, z.group.position.z);
        window.__zh = z.health; window.__zj = 0;
        const tick = () => { if (!window.__zj_on) return; window.__zj = Math.max(window.__zj, Math.abs(z.head.rotation.x) + Math.abs(z.head.rotation.y) + Math.abs(z.head.rotation.z)); requestAnimationFrame(tick); };
        window.__zj_on = true; tick();
    }, ids.z);
    await fistInto(page, `g.zombieById.get(${JSON.stringify(ids.z)}).head.getWorldPosition(new T.Vector3())`, [-1.6, 0, 0]);
    await wf(page, (id) => window.__zns.game.zombieById.get(id).health < window.__zh, ids.z, 5000);
    await fistOff(page);
    const jolt = await ev(page, () => { window.__zj_on = false; return window.__zj; });
    assert.ok(jolt > 0.08, `the zombie's head snapped (${jolt})`);
    assert.ok((await ev(page, () => window.__zns.game.strikes.log.at(-1))).k === 'punch');

    // 4) my own Bombardo next to me: thrown off my feet (creative: no harm)
    await ev(page, () => {
        const g = window.__zns.game, T = window.__zns.THREE, p = g.character.group.position;
        g.knock.reset();
        g.explode(new T.Vector3(p.x + 2, p.y - 1.5, p.z), 3.6, g.localId, 1);
    });
    await wf(page, () => window.__zns.game.knock.down, null, 3000);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

async function openPlayer(name) {
    const context = await browser.newContext({ viewport: { width: 560, height: 320 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; window.__ZNS_FIXED_QUALITY__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns);
    await page.click('[data-tab="tab-mp"]');
    await page.fill('#mp-name', name);
    await page.click('#mp-advanced > summary');
    await page.fill('#mp-server', `127.0.0.1:${PEER_PORT}/zns`);
    return { page, errors, context };
}

test('players: a punch in the face snaps the head back and hurts; a shove throws off the feet (up by a squat); spells knock down', async () => {
    const A = await openPlayer('Боец');
    await A.page.click('#mp-private-btn'); // (free world)
    await wf(A.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await A.page.textContent('.mp-code-big');
    const V = await openPlayer('Цель');
    await V.page.fill('#mp-code', code);
    await V.page.click('#mp-join-btn');
    for (const p of [A, V]) await wf(p.page, () => window.__zns.game && window.__zns.game.active && window.__zns.game.remotes.size === 1, null, 120000);
    const vid = await ev(V.page, () => window.__zns.game.localId);
    await feed(A.page, { arms: 'down' }, 8, 40);
    await feed(V.page, { arms: 'down' }, 8, 40);

    // V stands 2.4 in front of A, facing A
    const place = async () => {
        const t = await ev(A.page, () => {
            const g = window.__zns.game, ch = g.character, y = ch.group.rotation.y, p = ch.group.position;
            return [p.x - Math.sin(y) * 2.4, p.y, p.z - Math.cos(y) * 2.4, y + Math.PI];
        });
        await ev(V.page, (t) => { const g = window.__zns.game, ch = g.character; ch.group.position.set(t[0], t[1], t[2]); ch.group.rotation.y = g.smoothBody = g.cameraBaseRotation = t[3]; g.knockback.set(0, 0, 0); g.knock.reset(); g.impact.reset(); }, t);
        await wf(A.page, (t) => { const r = [...window.__zns.game.remotes.values()][0]; return Math.hypot(r.position.x - t[0], r.position.z - t[2]) < 0.3; }, t, 20000);
        return t;
    };
    await place();

    // 1) a fast fist into V's face (as A sees it)
    await ev(V.page, () => {
        const g = window.__zns.game;
        window.__vj = 0; window.__vj_on = true;
        const tick = () => { if (!window.__vj_on) return; window.__vj = Math.max(window.__vj, Math.abs(g.impact.jolt.pitch)); requestAnimationFrame(tick); };
        tick();
    });
    const dirToV = await ev(A.page, () => { const g = window.__zns.game, y = g.character.group.rotation.y; return [Math.sin(y) * 1.6, 0, Math.cos(y) * 1.6]; });
    await fistInto(A.page, '[...g.remotes.values()][0].character.head.getWorldPosition(new T.Vector3())', dirToV, 8);
    await wf(V.page, () => window.__zns.game.combat.hp === 19, null, 10000);
    await fistOff(A.page);
    await new Promise((r) => setTimeout(r, 600));
    const vj = await ev(V.page, () => { window.__vj_on = false; return window.__vj; });
    assert.ok(vj > 0.08, `V's head snapped back (${vj})`);
    assert.equal(await ev(V.page, () => window.__zns.game.knock.down), false, 'a punch alone does not throw a body');
    assert.equal((await ev(A.page, () => window.__zns.game.strikes.log.at(-1))).pt, 'head');

    // 2) a strong two-hand shove: V falls on the back, A sees it lying; V gets up only by a squat after 1.5 s
    await place();
    await ev(A.page, (to) => {
        const g = window.__zns.game, y = g.character.group.rotation.y;
        g.sync.playerPush(to, { k: 'shove', n: 2, pt: 'body', i: [-Math.sin(y) * 14, 0, -Math.cos(y) * 14], s: 'right' });
    }, vid);
    await wf(V.page, () => window.__zns.game.knock.down, null, 10000);
    assert.equal(await ev(V.page, () => window.__zns.game.knock.dir), 'back');
    assert.equal(await ev(V.page, () => window.__zns.game.combat.hp), 19, 'a push never hurts');
    await wf(A.page, () => { const r = [...window.__zns.game.remotes.values()][0]; return r.character.knockedDown && r.character.group.rotation.x > 1.0 && !r.character.flying; }, null, 10000);
    await new Promise((r) => setTimeout(r, 1700));
    await squatUp(V.page);
    await wf(V.page, () => window.__zns.game.knock.state === 'up', null, 6000);
    await wf(A.page, () => ![...window.__zns.game.remotes.values()][0].character.knockedDown, null, 10000);

    // 3) Earthquake runs under V: down (not stunned: the hands are free), −3
    await place();
    await ev(A.page, () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, y = ch.group.rotation.y;
        const o = ch.group.position.clone().setY(g.collision.groundY(ch.group.position.x, ch.group.position.z));
        const d = new T.Vector3(-Math.sin(y), 0, -Math.cos(y));
        g.spells.cast('Earthquake', o, d, 'right', g.localId); g.sync.spell('Earthquake', o, d, 'right');
    });
    await wf(V.page, () => window.__zns.game.knock.down, null, 10000);
    assert.equal(await ev(V.page, () => window.__zns.game.combat.stunned), false);
    assert.equal(await ev(V.page, () => window.__zns.game.combat.hp), 16);
    assert.equal(await ev(V.page, () => window.__zns.game.startFlight(true)), false, 'no flying off while lying');

    for (const p of [A, V]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await A.context.close();
    await V.context.close();
});
