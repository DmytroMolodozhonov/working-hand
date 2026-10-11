/**
 * Swimming with the arms: in deep water a real crawl (arms in turn reaching up and pulling
 * down) moves the hero forward, lying flat in the water; no strokes — afloat, in place.
 * Dived under, without strokes the body floats up; the air runs out meanwhile.
 * Run: ZNS_TEST_PORT=8253 node --test tests/e2e/swim.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8253;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

/** The arms in front of the body: the person's left arm at `kl`, the right at `kr` (0 = straight up, 1 = down at the hip). */
const crawl = (kl, kr) => {
    const f = frame({ arms: 'hang', leftCurl: null, rightCurl: null });
    const p = f.poseLandmarks;
    for (const [s, e, w, x, k] of [[11, 13, 15, 0.6, kl], [12, 14, 16, 0.4, kr]]) {
        const wy = p[s].y - 0.3 + 0.6 * k;
        p[e] = { x: x + 0.04, y: (p[s].y + wy) / 2, z: -0.1, visibility: 0.99 };
        p[w] = { x, y: wy, z: -0.2, visibility: 0.99 };
    }
    return f;
};
const feedRaw = async (page, raws) => {
    for (const raw of raws) {
        await page.evaluate((r) => { r.ts = performance.now(); window.__zns.poseService.injectRaw(r); }, raw);
        await new Promise((r) => setTimeout(r, 33));
    }
};
const state = (page) => page.evaluate(() => {
    const g = window.__zns.game, ch = g.character, p = ch.group.position;
    const net = ch.serializePose();
    return { x: p.x, y: p.y, z: p.z, yaw: ch.group.rotation.y, swim: g.swim.swimming, under: g.swim.underwater, atTop: g.swim.atTop, tilt: -ch.group.rotation.x, sw: net.sw, rx: net.rx, air: g.swim.air };
});

test('crawl with the arms: the hero swims forward lying flat; no strokes — afloat in place; under the water — floats up', async () => {
    const { page, errors } = await openPage(browser, srv.url);
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const spot = await page.evaluate(async () => {
        const g = window.__zns.game, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        // deep water all around (8 m) — room to swim
        const deep = (x, z) => { const w = g.swim.waterAt(x, z); return w && w.depth >= 6 ? w : null; };
        for (let rad = 110; rad < 900; rad += 12) for (let a = 0; a < 64; a++) {
            const x = Math.cos(a / 64 * Math.PI * 2) * rad, z = Math.sin(a / 64 * Math.PI * 2) * rad;
            g.terrain.data.ensure?.(Math.round(x), Math.round(z));
            const w = deep(x, z);
            if (w && [0, 1, 2, 3, 4, 5, 6, 7].every((i) => deep(x + 8 * Math.cos(i * Math.PI / 4), z + 8 * Math.sin(i * Math.PI / 4)))) {
                ch.group.position.set(x, w.surface - 1, z);
                await frames(10);
                return { x, z, surface: w.surface };
            }
        }
        return null;
    });
    assert.ok(spot, 'a deep lake near the spawn');
    // no strokes: afloat, the head above the water, staying put
    await feedRaw(page, Array.from({ length: 30 }, () => crawl(1, 1)));
    const s0 = await state(page);
    assert.ok(s0.swim && !s0.under, 'swimming, the head above the water');
    await feedRaw(page, Array.from({ length: 20 }, () => crawl(1, 1)));
    const s1 = await state(page);
    assert.ok(Math.hypot(s1.x - s0.x, s1.z - s0.z) < 0.3, `no strokes: in place (${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(2)})`);
    // the crawl: the arms in turn (~0.5 s a pull) for ~4 s
    const raws = [];
    for (let c = 0; c < 8; c++) for (let i = 0; i < 15; i++) { const k = i / 14; raws.push(c % 2 ? crawl(1 - k, k) : crawl(k, 1 - k)); }
    await feedRaw(page, raws);
    const s2 = await state(page);
    const dx = s2.x - s1.x, dz = s2.z - s1.z, dist = Math.hypot(dx, dz);
    assert.ok(dist > 2.5, `the crawl moved the hero (${dist.toFixed(2)} m)`);
    // forward is where the hero faces (−Z turned by the yaw)
    const fwd = (-Math.sin(s2.yaw) * dx - Math.cos(s2.yaw) * dz) / dist;
    assert.ok(fwd > 0.8, `forward (${fwd.toFixed(2)})`);
    assert.ok(s2.swim && !s2.under && s2.atTop, 'still on top of the water');
    assert.ok(s2.tilt > 0.9, `lying in the water (${s2.tilt.toFixed(2)})`);
    // the others see it: the body's tilt and the legs' kick go over the network
    assert.ok(s2.rx < -0.9 && s2.sw > 0, `sent: rx ${s2.rx}, sw ${s2.sw}`);
    // dived under (deep), no strokes: it floats up, the air runs out
    await page.evaluate((sp) => { const g = window.__zns.game; g.swim.y = sp.surface - 4.5; g.swim.atTop = false; g.character.group.position.y = sp.surface - 4.5; }, spot);
    await feedRaw(page, Array.from({ length: 4 }, () => crawl(1, 1)));
    await page.evaluate(async () => { const g = window.__zns.game, f = g.frameCount; while (g.frameCount < f + 10) await new Promise((res) => setTimeout(res, 30)); });
    const s3 = await state(page);
    // (by the game's own frames: a slow test machine draws few of them)
    const rose = await page.evaluate(async () => {
        const g = window.__zns.game, y0 = g.swim.y;
        const f = g.frameCount; while (g.frameCount < f + 60) await new Promise((res) => setTimeout(res, 30));
        return g.swim.y - y0;
    });
    const s4 = await state(page);
    assert.ok(s3.under, 'under the water');
    assert.ok(rose > 0.3, `floats up (${rose.toFixed(2)})`);
    assert.ok(s4.air < 20, `the air runs out (${s4.air.toFixed(1)})`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
