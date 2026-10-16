/**
 * «Бум» in a real browser (Creative: the test mountain left of the pedestals): said with the hand at the
 * mountain, it shakes and glows from inside (the ground swells, the cracks light up), then bursts — rocks fly
 * on arcs, dust, a shock wave — and a crater is left where the mountain was. The game's own work in a frame
 * stays light while the crater is dug (a few ms a frame). Its pictures go to docs/spells/boom/.
 * Run: node --test tests/e2e/boom.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8191;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('«Бум»: the mountain swells, glows, bursts from inside — a crater; light frames; its pictures', { timeout: 600000 }, async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 720 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const dir = path.join(ROOT, 'docs', 'spells', 'boom');
    fs.mkdirSync(dir, { recursive: true });
    const shot = async (name) => {
        const url = await page.evaluate(() => {
            const g = window.__zns.game, T = window.__zns.THREE;
            const cam = g._boomCam || (g._boomCam = new T.PerspectiveCamera(62, 1280 / 720, 0.1, 3000));
            cam.position.set(-10, 34, 82); cam.lookAt(-84, 12, 20);
            const fog = g.scene.fog, far = fog?.far, near = fog?.near; if (fog && fog.far != null) { fog.near = 400; fog.far = 1400; }
            g.character.group.visible = false;
            g.scene.updateMatrixWorld(true);
            g.renderer.render(g.scene, cam);
            g.character.group.visible = true;
            if (fog && far != null) { fog.near = near; fog.far = far; }
            return g.renderer.domElement.toDataURL('image/png');
        });
        fs.writeFileSync(path.join(dir, name), Buffer.from(url.split(',')[1], 'base64'));
    };
    // the hero at the meadow before the mountain, the hand at it
    const before = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        const data = g.world.terrain.data;
        ch.group.position.set(20, data.topLayer(20, 22) + 2.5, 22);
        ch.verticalVelocity = 0;
        g.world.terrain.flushAround?.(-60, 22);
        for (let i = 0; i < 60; i++) await frame();
        let peak = 0;
        for (let x = -130; x <= -50; x++) for (let z = -20; z <= 60; z++) peak = Math.max(peak, data.topLayer(x, z));
        return { peak, mid: data.topLayer(-88, 22) };
    });
    await shot('1-mountain-before.png');
    const cast = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const data = g.world.terrain.data;
        g.boom.testAim = { o: new T.Vector3(18, data.topLayer(18, 22) + 2, 22), d: new T.Vector3(-1, 0.06, 0).normalize() };
        // the game's own work a frame (the spell, the crater, the world's update)
        const worst = { boom: 0, world: 0, n: 0, _burst: 0, _rocksUpdate: 0, _after: 0, _swell: 0 };
        const wrap = (o, k, key) => { const f = o[k].bind(o); o[k] = (...a) => { const t0 = performance.now(); const r = f(...a); const d = performance.now() - t0; if (d > worst[key]) { worst[key] = d; const b = g.boom.list[0]; worst[key + 'At'] = b ? `t ${b.t.toFixed(2)} burst ${b.burst} phase ${b.job?.phase} i ${b.job?.i} rocks ${g.boom.rocks?.list.length}` : 'none'; } return r; }; };
        for (const k of ['_burst', '_rocksUpdate', '_after', '_swell']) wrap(g.boom, k, k);
        wrap(g.boom, 'update', 'boom');
        wrap(g.world, 'update', 'world');
        window.__boomWorst = worst;
        const name = g.castLocalSpell('Бум', true);
        const talk = g.boom.list.length;
        return { name, list: g.boom.list.length, talk, why: g.lastCastWhy, voice: document.getElementById('voice-status')?.textContent || g.hud?._lastVoice || null, target: g.world.terrain.data.raycast(g.boom.testAim.o, g.boom.testAim.d, 230) };
    });
    assert.equal(cast.name, 'Boom', 'cast: ' + JSON.stringify(cast));
    // the swelling: glowing cracks (wait until it is well under way)
    await page.waitForFunction(() => { const b = window.__zns.game.boom.list[0]; return b && !b.burst && b.t > 1.0; }, null, { timeout: 30000 });
    await shot('2-swelling-glowing-cracks.png');
    await page.waitForFunction(() => { const b = window.__zns.game.boom.list[0]; return b && b.burst && b.t > 0.45; }, null, { timeout: 30000 });
    await shot('3-burst-rocks-flying.png');
    const mid = await page.evaluate(() => { const P = window.__zns.game.boom.rocks; return { rocks: P?.list.length || 0 }; });
    // (while it settles the picture is drawn only every 6th frame: here the processor draws it — the game's own time goes on)
    await page.evaluate(() => { const g = window.__zns.game, r = g.renderer.render.bind(g.renderer); let n = 0; g._boomRender = r; g.renderer.render = (s, c) => (s !== g.scene || ++n % 6 === 0 ? r(s, c) : undefined); });
    await page.waitForFunction(() => { const g = window.__zns.game; return !g.boom.list.length && !(g.boom.rocks?.list.length); }, null, { timeout: 400000, polling: 1000 })
        .catch(async (e) => { console.log('state', await page.evaluate(() => { const g = window.__zns.game, b = g.boom.list[0]; return { t: b?.t, phase: b?.job?.phase, i: b?.job?.i, rocks: g.boom.rocks?.list.length, frames: g.frameCount }; })); throw e; });
    await page.evaluate(() => { const g = window.__zns.game; g.renderer.render = g._boomRender; });
    const after = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        for (let i = 0; i < 40; i++) await frame();
        const data = g.world.terrain.data;
        let peak = 0;
        for (let x = -130; x <= -50; x++) for (let z = -20; z <= 60; z++) peak = Math.max(peak, data.topLayer(x, z));
        const e = g.explosions.find((x) => x.boom);
        return { peak, mid: e ? data.topLayer(Math.round(e.p[0]), Math.round(e.p[2])) : null, e, worst: window.__boomWorst, mana: g.mana?.spellsUsed?.has?.('Boom') };
    });
    await shot('4-crater.png');
    console.log(JSON.stringify({ before, mid, after }));
    assert.ok(mid.rocks > 20, 'rocks fly: ' + mid.rocks);
    assert.ok(after.e, 'saved with the world (g.explosions)');
    assert.ok(after.mid < before.mid - 8 || after.mid < 2, `the mountain gone: the middle ${before.mid} → ${after.mid}`);
    assert.ok(after.peak < before.peak, `its peak gone: ${before.peak} → ${after.peak}`);
    assert.ok(after.worst.boom < 60, // (here the processor draws the picture too: a few times slower than a real computer)
        `the spell's work a frame stays light: ${after.worst.boom.toFixed(1)} ms`);
    // talk: «бум» inside a sentence casts nothing
    const talk = await page.evaluate(() => { const g = window.__zns.game; g.boom._lastCast = 0; return g.castLocalSpell('и тут бум, всё упало', true); });
    assert.equal(talk, null, 'talk is no spell');
    assert.deepEqual(realErrors(errors), []);
});
