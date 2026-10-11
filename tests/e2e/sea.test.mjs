/**
 * The sea — in a real browser (deep water, beaches, waves, swimming on the waves).
 * Run: node --test tests/e2e/sea.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8163;
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

test('the sea: deep water far out, a sandy beach, a moving surface, swimming rises and falls on the waves', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const info = await page.evaluate(() => {
        const g = window.__zns.game;
        const S = g.terrain.data.seas;
        const sea = S.nearest(0, 0);
        let a = 0.7;
        for (; a < 7; a += 0.3) { const q = S.pointAt(sea, a, 200); if (S.signedDist(q.x, q.z) > 150) break; }
        const p = S.pointAt(sea, a, 200), b = S.pointAt(sea, a, -6);
        window.__seaPt = p;
        g.character.group.position.set(p.x, -2.1, p.z);
        g.world.terrain.flushAround(p.x, p.z);
        g.seaSurface.flush(p.x, p.z);
        const d = g.terrain.data, bx = Math.round(b.x), bz = Math.round(b.z);
        return {
            gen: g.gen, top: d.topLayer(Math.round(p.x), Math.round(p.z)),
            beach: d.get(bx, d.topLayer(bx, bz), bz), SAND: 9,
            sea: d.isSeaColumn(Math.round(p.x), Math.round(p.z)),
        };
    });
    assert.ok(info.gen >= 2, 'a new world has seas (generation 2 or newer): ' + info.gen);
    assert.ok(info.top <= -12, `deep: floor at layer ${info.top}`);
    assert.equal(info.beach, info.SAND, 'sand on the beach');
    assert.ok(info.sea);
    await frames(page, 30);
    const surf = await page.evaluate(() => {
        const g = window.__zns.game, S = g.seaSurface;
        const t0 = S.uniforms.uTime.value;
        return { visible: S.mesh.visible, ready: S.ready, a4: S.amp(4), a200: S.amp(200), t0 };
    });
    assert.ok(surf.visible && surf.ready, 'the wave surface is drawn');
    assert.ok(surf.a4 < 0.2 && surf.a200 > 0.6, `small waves at the shore, big out at sea ${surf.a4} ${surf.a200}`);
    await frames(page, 10);
    assert.ok(await page.evaluate((t0) => window.__zns.game.seaSurface.uniforms.uTime.value !== t0, surf.t0), 'the waves move');

    // swim: kick the legs (knees up and down) — afloat the body follows the waves
    const samples = [];
    for (let i = 0; i < 14; i++) {
        await feed(page, (k) => ({ arms: 'hang', bob: k % 2 ? 0.02 : -0.02 }), 6, 50);
        samples.push(await page.evaluate(() => {
            const g = window.__zns.game, p = g.character.group.position;
            const w = g.swim.waterAt(p.x, p.z);
            return { swim: g.swim.swimming, y: p.y, float: g.swim.floatY, wave: w.wave, k: g.swim.kick, run: g.currentPose?.isRunning };
        }));
    }
    const afloat = samples.slice(4);
    assert.ok(afloat.every((s) => s.swim), 'swimming in the deep sea');
    const err = Math.max(...afloat.map((s) => Math.abs(s.y - s.float)));
    assert.ok(err < 0.3, `the body follows the wave (off by ${err})`);
    const ys = afloat.map((s) => s.y), waves = afloat.map((s) => s.wave);
    assert.ok(Math.max(...waves) - Math.min(...waves) > 0.1, 'the waves rise and fall');
    assert.ok(Math.max(...ys) - Math.min(...ys) > 0.1, 'and so does the swimmer');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
