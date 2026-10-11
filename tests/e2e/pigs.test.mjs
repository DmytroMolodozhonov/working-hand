/**
 * Pigs with wings: the hero runs at a pig — it takes off, flies away and lands again; a picture of
 * the new pigs (four looks on the grass, one in the air with its wings spread).
 * Run: ZNS_TEST_PORT=8251 node --test tests/e2e/pigs.test.mjs   (pictures: test-results/pigs-*.png)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8251;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('a pig takes off when the hero runs at it, flies away and lands; the new look', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);

    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, A = g.animals;
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        A._migT = 1e9; A._spawnT = 1e9;
        for (const a of [...A.list]) A._remove(a);
        const fw = g.camera.getWorldDirection(new T.Vector3()).setY(0).normalize();
        const base = ch.group.position.clone();
        // a dry spot ahead for the pig
        let at = null;
        for (let d = 14; d < 40 && !at; d += 2) { const p = base.clone().addScaledVector(fw, d); if (A._landOk(p.x, p.z)) at = p; }
        if (!at) return { err: 'no grass ahead' };
        const pig = A._spawn('pig', new T.Vector3(at.x, g.collision.groundY(at.x, at.z) + 0.5, at.z), { yaw: Math.atan2(fw.x, fw.z) });
        for (let i = 0; i < 20; i++) await frame();
        const start = pig.group.position.clone();
        // the hero runs at it (7 m/s)
        let t0 = performance.now(), took = false;
        for (let i = 0; i < 600 && !took; i++) {
            await frame();
            const now = performance.now(), dt = Math.min(0.1, (now - t0) / 1000); t0 = now;
            const to = pig.group.position.clone().sub(ch.group.position).setY(0);
            if (to.length() > 3) ch.group.position.addScaledVector(to.normalize(), 7 * dt);
            took = !!pig.fly;
        }
        if (!took) return { err: 'it did not take off', state: pig.state, d: pig.group.position.distanceTo(ch.group.position) };
        let maxH = 0, landed = false, codes = new Set();
        const T0 = performance.now();
        while (performance.now() - T0 < 120000) {
            await frame();
            const p = pig.group.position;
            maxH = Math.max(maxH, p.y - A._floor(p.x, p.z));
            codes.add(pig.flyCode & 7);
            if (!pig.fly) { landed = true; break; }
        }
        for (let i = 0; i < 40; i++) await frame();
        const p = pig.group.position;
        return { took, landed, maxH, codes: [...codes], far: Math.hypot(p.x - start.x, p.z - start.z), onGround: p.y - A._floor(p.x, p.z), wings: pig.wingOpen, alive: !pig.dead };
    });
    assert.ok(!r.err, JSON.stringify(r));
    assert.ok(r.took, 'it took off');
    assert.ok(r.maxH > 5, `it flew up (${JSON.stringify(r)})`);
    assert.ok(r.landed, `it landed (${JSON.stringify(r)})`);
    assert.ok(r.far > 20, `somewhere else (${JSON.stringify(r)})`);
    assert.ok(r.alive && Math.abs(r.onGround - 0.5) < 0.3, `on its feet (${JSON.stringify(r)})`);
    assert.ok(r.wings < 0.2, `wings folded (${JSON.stringify(r)})`);

    // the picture: four looks on the grass and one in the air with spread wings
    await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, A = g.animals;
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        for (const a of [...A.list]) A._remove(a);
        const fw = g.camera.getWorldDirection(new T.Vector3()).setY(0).normalize(), side = new T.Vector3(-fw.z, 0, fw.x);
        const cam = g.camera.getWorldPosition(new T.Vector3());
        const put = (d, s, look, up = 0) => {
            const p = cam.clone().addScaledVector(fw, d).addScaledVector(side, s);
            const a = A._spawn('pig', new T.Vector3(p.x, g.collision.groundY(p.x, p.z) + 0.5 + up, p.z), { color: look, yaw: Math.atan2(side.x, side.z) + (look % 2 ? 0.5 : -0.4) });
            a.idle = 'stand'; a.idleT = 1e9;
            return a;
        };
        [1, 2, 3, 4].forEach((k, i) => put(9 + (i % 2) * 2.5, (i - 1.5) * 3.2, k));
        const fl = put(12, 0.5, 2, 4.5);
        fl.lev = { picture: true }; // (held: it doesn't think — only its wings move)
        fl.flyCode = 1;
        for (let i = 0; i < 40; i++) { await frame(); A._animate(fl, 0, 1 / 30); }
        // (the wings up in the middle of a beat)
        fl.flapPh = Math.PI / 2 - 0.3; fl.flapAmp = 0.6; A._animate(fl, 0, 0.001);
        await frame(); await frame();
    });
    const dir = path.join(ROOT, 'test-results');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'pigs-look.png') });
    assert.deepEqual(realErrors(errors), []);
});
