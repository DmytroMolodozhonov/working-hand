/**
 * The spell «Fire» and campfires — in a real browser.
 * Run: node --test tests/e2e/campfire.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8162;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);
const waitFor = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

test('«Fire»: a campfire on the ground, glows at night, wood makes it burn longer, meat in it becomes a steak, it hurts, goes out, is saved', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await frames(page, 20);
    // night, so the fire glows
    const before = await page.evaluate(() => {
        const g = window.__zns.game;
        g.dayStart = Date.now() - 0.75 * 24 * 60 * 1000;
        if (g.dayCycle) g.world.setDayPhase(g.dayPhase());
        return { programs: g.renderer.info.programs.length, fires: g.campfires.list.size };
    });
    assert.equal(before.fires, 0);
    const cast = await page.evaluate(() => window.__zns.game.castDebug('Fire'));
    assert.equal(cast, 'Fire');
    await frames(page, 30);
    const fire = await page.evaluate(() => {
        const g = window.__zns.game;
        const f = [...g.campfires.list.values()][0];
        const me = g.character.group.position;
        return {
            n: g.campfires.list.size, left: f.left, dist: Math.hypot(f.x - me.x, f.z - me.z),
            onGround: Math.abs(f.y - g.collision.groundAt(f.x, f.z, f.y + 1)) < 0.05,
            inScene: !!f.model.parent, night: g.world.nightAmount, light: g.campfires.light.intensity,
            lights: (() => { let n = 0; g.scene.traverse((o) => { if (o.isLight) n++; }); return n; })(),
            programs: g.renderer.info.programs.length, voice: g.hud.voiceText(),
        };
    });
    assert.equal(fire.n, 1);
    assert.ok(fire.left > 170 && fire.left <= 180, `burns 3 minutes (${fire.left})`);
    assert.ok(fire.dist < 25, `within reach (${fire.dist.toFixed(1)} m)`);
    assert.ok(fire.onGround, 'stands on the ground');
    assert.ok(fire.inScene);
    assert.ok(fire.night > 0.6, `night (${fire.night})`);
    assert.ok(fire.light > 0.3, `lights the ground at night (${fire.light})`);
    assert.ok(fire.programs <= before.programs, `no new shaders when the first campfire appears (${before.programs} → ${fire.programs})`);
    assert.match(fire.voice, /Костёр/);
    // a second «Fire» at the same place: it is already there
    await page.evaluate(() => window.__zns.game.castDebug('Fire'));
    assert.equal(await page.evaluate(() => window.__zns.game.campfires.list.size), 1, 'no second fire on top of the first');

    // firewood: the chosen wood stack held at the fire
    await page.evaluate(() => {
        const g = window.__zns.game;
        g.inventory.addResource(6, 5); // wood
        const i = g.inventory.slots.findIndex((s) => s && s.kind === 'res' && s.block === 6);
        g.inventory.select(i);
        // the fire right under the hand (as if the player stood at it and held the wood out)
        const f = [...g.campfires.list.values()][0];
        const hand = g.character.getGripObject('right').getWorldPosition(new window.__zns.THREE.Vector3());
        g.campfires._place({ id: f.id, x: hand.x, y: hand.y - 1, z: hand.z, left: f.left });
        window.__left0 = f.left;
    });
    await waitFor(page, () => [...window.__zns.game.campfires.list.values()][0].left > window.__left0 + 30);
    const wood = await page.evaluate(() => {
        const g = window.__zns.game;
        const f = [...g.campfires.list.values()][0];
        g.inventory.select(-1);
        return { left: f.left, count: g.inventory.slots.find((s) => s && s.kind === 'res' && s.block === 6)?.count ?? 0, voice: g.hud.voiceText() };
    });
    assert.ok(wood.left > 200, `wood: burns longer (${wood.left.toFixed(0)} s)`);
    assert.ok(wood.count < 5, `wood was used (${wood.count} left)`);
    assert.match(wood.voice, /Дрова|вовсю/);

    // meat lying in the fire becomes a steak
    await page.evaluate(() => {
        const g = window.__zns.game;
        const f = [...g.campfires.list.values()][0];
        // put the fire back on the ground in front of the player
        const me = g.character.group.position;
        const x = me.x, z = me.z - 6, y = g.collision.groundAt(x, z, me.y);
        g.campfires._place({ id: f.id, x, y, z, left: f.left });
        g.items.spawnLoose({ kind: 'meat', uid: 'cf-meat', count: 1 }, new window.__zns.THREE.Vector3(x + 0.2, y + 0.6, z));
    });
    await waitFor(page, () => window.__zns.game.items.loose.get('cf-meat')?.item.kind === 'steak', null, 20000);

    // standing in the fire hurts (Свободный мир)
    const hurt = await page.evaluate(async () => {
        const g = window.__zns.game;
        const f = [...g.campfires.list.values()][0];
        const hp0 = g.combat.hp;
        const home = g.character.group.position.clone();
        // (wait in game time: headless frames can be slow)
        const t0 = performance.now();
        while (g.combat.hp >= hp0 && performance.now() - t0 < 20000) {
            g.character.group.position.set(f.x, f.y + 2, f.z);
            await new Promise((r) => setTimeout(r, 100));
        }
        const hp1 = g.combat.hp;
        g.character.group.position.copy(home);
        return { hp0, hp1 };
    });
    assert.ok(hurt.hp1 < hurt.hp0, `the fire hurts (${hurt.hp0} → ${hurt.hp1})`);

    // saved with the world
    const snap = await page.evaluate(() => window.__zns.game.keeper.snapshot().campfires);
    assert.equal(snap.length, 1);
    assert.ok(snap[0].left > 0 && Number.isFinite(snap[0].x));

    // fast-forward: the flames shrink, embers, then it is gone
    await page.evaluate(() => { [...window.__zns.game.campfires.list.values()][0].left = 0.5; });
    await frames(page, 20);
    const embers = await page.evaluate(() => {
        const f = [...window.__zns.game.campfires.list.values()][0];
        return { there: !!f, flames: f?.model.userData.flames.visible, left: f?.left };
    });
    assert.equal(embers.there, true, 'embers are still there');
    assert.equal(embers.flames, false, 'no flames, only embers');
    await page.evaluate(() => { [...window.__zns.game.campfires.list.values()][0].left = -14.9; });
    await frames(page, 20);
    const gone = await page.evaluate(() => ({ n: window.__zns.game.campfires.list.size, snap: window.__zns.game.keeper.snapshot().campfires.length, light: window.__zns.game.campfires.light.intensity }));
    assert.deepEqual(gone, { n: 0, snap: 0, light: 0 });

    // restoring a saved world brings the fire back
    await page.evaluate(() => window.__zns.game.campfires.restore([{ id: 'saved1', x: 3, y: window.__zns.game.collision.groundY(3, 3), z: 3, left: 90 }]));
    assert.equal(await page.evaluate(() => window.__zns.game.campfires.list.get('saved1')?.left), 90);

    assert.deepEqual(realErrors(errors), []);
});
