/**
 * Endless world, rivers/lakes and water bending — in a real browser.
 * Run: npm run test:e2e
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = 8150;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('endless world: flying far away streams terrain in and out, no edge, no stalls', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const t = g.terrain;
        const ch = g.character;
        const shown = () => [...t.meshes.values()].filter((e) => e.ground.visible || e.raised.visible).length;
        const atSpawn = shown();
        g.startFlight(true);
        g.stats.worstLogicMs = 0;
        // Fly far east (fast-forwarding the position along the way)
        for (let i = 0; i < 60; i++) {
            ch.group.position.x += 35;
            ch.group.position.y = Math.max(ch.group.position.y, g.collision.groundY(ch.group.position.x, ch.group.position.z) + 12);
            await new Promise((res) => setTimeout(res, 120));
        }
        for (let i = 0; i < 150 && t._queue.length; i++) await new Promise((res) => setTimeout(res, 100));
        const p = ch.group.position;
        let near = 0;
        for (const e of t.meshes.values()) if (Math.hypot(e.cx * 32 + 16 - p.x, e.cz * 32 + 16 - p.z) < 100) near++;
        return {
            x: p.x, atSpawn, near, meshes: t.meshes.size, data: t.data.chunks.size,
            ground: g.collision.groundY(p.x, p.z), queue: t._queue.length,
            maxBuild: t.stats.maxBuildMs, worstLogic: g.stats.worstLogicMs, skyX: g.world.sky.position.x,
        };
    });
    assert.ok(r.x > 2000, `flew ${r.x.toFixed(0)} m`);
    assert.ok(r.atSpawn > 20, `chunks around spawn (${r.atSpawn})`);
    assert.ok(r.near >= 25, `terrain loaded around the player far away (${r.near} chunks)`);
    assert.equal(r.queue, 0, 'everything around is loaded');
    assert.ok(r.meshes < 260, `far chunks are unloaded (${r.meshes} meshes)`);
    assert.ok(r.data < 900, `chunk data is evicted (${r.data})`);
    assert.ok(Number.isFinite(r.ground), 'ground under the player');
    assert.ok(Math.abs(r.skyX - r.x) < 1, 'sky travels with the player');
    assert.ok(r.worstLogic < 200, `no long stalls while streaming (worst ${r.worstLogic.toFixed(0)} ms, chunk ${r.maxBuild.toFixed(1)} ms)`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('water bending: Waterbollow at a river, Максима, Water forming, Frozen → ice blocks, drops', async () => {
    // Small window: software rendering in the test browser is slow, game time must keep moving
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const t = g.terrain.data;
        const ch = g.character;
        const W = g.water;
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const say = async (text) => { g._lastWaterCast = 0; const n = g.castLocalSpell(text, true); await sleep(50); return n; };
        const out = {};
        // Far from water the spell explains what to do
        out.dry = await say('вотербол');
        out.dryHint = document.getElementById('voice-debug')?.innerText || '';
        // Find water and stand in it (on the river bed)
        let spot = null;
        for (let x = 140; x < 900 && !spot; x += 3) for (let z = -300; z < 300; z += 3) if (t.get(x, 0, z) === 8 && t.get(x + 1, 0, z) === 8) { spot = { x, z }; break; }
        out.spot = spot;
        ch.group.position.set(spot.x, g.collision.groundY(spot.x, spot.z) + 1.0, spot.z);
        for (let i = 0; i < 60 && g.terrain._queue.length; i++) await sleep(100);
        await sleep(300);
        out.cast = await say('вотербол');
        out.rising = W.state && W.state.phase;
        for (let i = 0; i < 300 && W.state && W.state.phase !== 'held'; i++) await sleep(100);
        out.held = W.state && W.state.phase;
        out.v0 = W.state.volume;
        out.max1 = await say('максима');
        out.max2 = await say('максима');
        out.v1 = W.state.volume;
        out.ballVisible = W.ball.visible;
        // Forming: lead the ball through the air (the body walks, the hand stays calm)
        out.form = await say('water forming');
        const start = ch.group.position.clone();
        for (let i = 0; i < 40; i++) {
            ch.group.position.x = start.x + i * 0.15;
            await sleep(60);
        }
        out.formed = W.state ? W.state.formed.size : -1;
        out.v2 = W.state ? W.state.volume : -1;
        const cells = W.state ? [...W.state.formed.values()] : [];
        out.frozen = await say('frozen');
        out.ice = cells.filter(([x, L, z]) => t.get(x, L, z) === 10).length;
        out.iceSolid = cells.length ? t.isSolidAt(cells[0][0], cells[0][1] - 1, cells[0][2]) : false;
        out.ballFrozen = W.state ? W.state.frozen : null;
        out.formIce = await say('water forming'); // not possible from ice
        // Drop the ice ball: it falls and stays in the world (solid)
        W.drop();
        for (let i = 0; i < 300 && W.falling.length; i++) await sleep(100);
        out.resting = W.resting.length;
        out.restBox = W.resting[0] ? !!g.collision.boxes.get(W.resting[0].boxId) : false;
        // Liquid ball dropped by a sharp jerk of the hand → splash, nothing stays
        await sleep(700);
        ch.group.position.set(spot.x, g.collision.groundY(spot.x, spot.z) + 1.0, spot.z);
        await sleep(300);
        out.cast2 = await say('water ball');
        for (let i = 0; i < 300 && W.state && W.state.phase !== 'held'; i++) await sleep(100);
        await sleep(900);
        out.held2 = W.state && W.state.phase;
        if (W.state) { W.state.history.unshift({ t: W._t, x: 50, y: 0, z: 0 }); W.state.history.length = 1; }
        await sleep(300);
        out.afterJerk = W.state;
        for (let i = 0; i < 300 && W.falling.length; i++) await sleep(100);
        out.restingAfterLiquid = W.resting.length;
        // «Frozen» without a water ball is the normal ice beam
        g.lastMagicTime = Date.now();
        g.lastSpellCastTime = 0;
        out.iceBeam = await say('frozen');
        out.iceCells = g.iceCells.length;
        return out;
    });
    assert.equal(r.dry, null, 'no water nearby → nothing happens');
    assert.match(r.dryHint, /вод/i);
    assert.ok(r.spot, 'a river or lake exists');
    assert.equal(r.cast, 'Waterball');
    assert.equal(r.rising, 'rising');
    assert.equal(r.held, 'held', 'water rose into a ball in the hand');
    assert.equal(r.max1, 'Maxima');
    assert.equal(r.max2, 'Maxima');
    assert.ok(r.v1 >= r.v0 + 7, `«Максима» twice: ${r.v0} → ${r.v1} m³`);
    assert.ok(r.ballVisible);
    assert.equal(r.form, 'WaterForming');
    assert.ok(r.formed >= 3, `water blocks formed (${r.formed})`);
    assert.ok(r.v2 < r.v1, 'forming spends the ball\'s water');
    assert.equal(r.frozen, 'Frozen');
    assert.equal(r.ice, r.formed, 'every formed block became ice');
    assert.ok(r.iceSolid, 'ice is solid');
    assert.ok(r.ballFrozen === true || r.ballFrozen === null);
    assert.equal(r.formIce, null, 'ice cannot be formed');
    assert.equal(r.resting, 1, 'the dropped ice ball stays in the world');
    assert.ok(r.restBox, 'and it is solid');
    assert.equal(r.cast2, 'Waterball');
    assert.equal(r.held2, 'held');
    assert.equal(r.afterJerk, null, 'a sharp jerk drops the spell');
    assert.equal(r.restingAfterLiquid, 1, 'liquid water just splashes');
    assert.equal(r.iceBeam, 'Ice');
    assert.ok(r.iceCells >= r.formed);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
