/**
 * Fire next to water stays bright: the flames are drawn after the see-through water (rivers, lakes,
 * the sea, water magic). Before, the water's surface behind a fire was painted over the flames and
 * «swallowed» them. In a real browser: standing in a river, flames hanging over the water in front of
 * the camera — the pixel where they are is read back as drawn now, and as drawn the old way (the fire
 * first, the water after it): now it is clearly brighter and redder.
 * Run: ZNS_TEST_PORT=8187 node --test tests/e2e/fire-water.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8187;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('fire over water: the flames (Hellfire, Inferno, burning trees, campfires) are not swallowed by the water behind them', async () => {
    const { page, errors } = await openPage(browser, srv.url, { viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'hang' }, 20, 33);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, t = g.terrain.data;
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await sleep(30); };
        let spot = null;
        const wide = (x, z) => { for (let dx = -10; dx <= 10; dx += 2) for (let dz = -10; dz <= 10; dz += 2) if (t.get(x + dx, 0, z + dz) !== 8) return false; return true; };
        for (let x = 140; x < 1400 && !spot; x += 3) for (let z = -400; z < 400; z += 3) if (t.get(x, 0, z) === 8 && wide(x, z)) { spot = { x, z }; break; }
        if (!spot) return { spot };
        g.character.group.position.set(spot.x, g.collision.groundY(spot.x, spot.z) + 1.0, spot.z);
        for (let i = 0; i < 80 && g.terrain._queue.length; i++) await sleep(100);
        await frames(10);
        // flames hanging over the water a few metres in front of the camera, a little below its eye
        const cam = g.camera;
        cam.updateMatrixWorld(true);
        const fwd = new T.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new T.Quaternion())).setY(0).normalize();
        const p = cam.getWorldPosition(new T.Vector3()).addScaledVector(fwd, 5);
        p.y = g.collision.groundY(p.x, p.z) + 0.6;
        const glow = g.fx.glow;
        glow.clear();
        for (let i = 0; i < 40; i++) glow.spawn(p.x + (Math.random() - 0.5) * 0.4, p.y + (Math.random() - 0.5) * 0.4, p.z + (Math.random() - 0.5) * 0.4, 0, 0, 0, 0xff7a10, 0.9, 1000, { shrink: 0, spin: 0 });
        await frames(3); // (drawn into the pool)
        g.paused = true; // (nothing moves while the pixels are read)
        await sleep(200);
        const q = p.clone().project(cam);
        const gl = g.renderer.getContext();
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const px = Math.round((q.x * 0.5 + 0.5) * w), py = Math.round((q.y * 0.5 + 0.5) * h);
        const behind = { x: p.x, z: p.z, water: t.get(Math.round(p.x), 0, Math.round(p.z)) === 8 };
        const read = () => {
            g.renderer.render(g.scene, cam);
            const b = new Uint8Array(4);
            gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
            return [b[0], b[1], b[2]];
        };
        const now = read();
        const keep = glow.mesh.renderOrder;
        glow.mesh.renderOrder = 0; // (the old way: the fire first, the water after it)
        const old = read();
        glow.mesh.renderOrder = keep;
        glow.clear();
        g.paused = false;
        const waters = [];
        g.scene.traverse((o) => { if (o.isMesh && o.material?.transparent && o.material.opacity < 0.9 && o.renderOrder >= 1 && o.renderOrder < 3 && o.visible) waters.push(o.renderOrder); });
        return { spot, behind, now, old, order: keep, waters: waters.length };
    });
    assert.ok(r.spot, 'wide water');
    assert.ok(r.behind.water, 'the flames hang over the water');
    assert.ok(r.order >= 3, `the glowing effects are drawn after the water (renderOrder ${r.order})`);
    const bright = (c) => c[0] + c[1] * 0.5;
    assert.ok(r.now[0] > 200, `the flames are bright red-orange over the water: ${JSON.stringify(r)}`);
    assert.ok(bright(r.now) > bright(r.old) + 25, `not swallowed by the water as before: now ${r.now} vs the old way ${r.old}`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
