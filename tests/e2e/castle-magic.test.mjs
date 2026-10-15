/**
 * «Create a Castle» in a real browser (Creative): the castle's blocks are made in the worker, it rises in
 * its 30 s (run at once here), its doors, beds and chests are there, no error; two pictures of it are
 * saved in docs/screenshots/castle/ (outside, in front of its gate; the throne hall).
 * Run: node --test tests/e2e/castle-magic.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8217;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('«Create a Castle»: a whole castle with its gate, iron doors, beds, chests — and its pictures', { timeout: 240000 }, async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 720 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // the castle ~70 m from the start (tried in a few directions until a place fits)
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, cm = g.castleMagic, me = g.character.group.position;
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        let res = null, at = null;
        for (const [dx, dz] of [[0, -110], [110, 0], [-110, 0], [0, 110], [150, -150], [-150, 150], [200, 0], [0, -200]]) {
            at = { x: Math.round(me.x + dx), z: Math.round(me.z + dz) };
            g.character.group.position.set(at.x - dx * 0.4, me.y, at.z - dz * 0.4);
            for (let i = 0; i < 20; i++) await frame();
            res = cm._hostStart({ at: [at.x, 0, at.z], c: [at.x - dx * 0.4, at.z - dz * 0.4] }, g.localId);
            if (res === true) break;
        }
        if (res !== true) return { res };
        // (the headless browser draws a few frames a second: the 30 s run here, a little a frame, the worker given its time)
        for (let i = 0; i < 4000 && cm.magic; i++) { cm.update(0.05); if (i % 20 === 0) await frame(); }
        const rec = [...cm.list.values()][0];
        const lay = rec && cm.plan(rec);
        return { res, done: !cm.magic, at, face: rec?.face, doors: lay ? lay.doors.filter((d) => g.doors.list.has(rec.id + d.id)).length : 0, beds: [...g.beds.list.keys()].filter((k) => k.startsWith(rec?.id)).length, chests: cm.chests.size };
    });
    assert.equal(r.res, true, JSON.stringify(r));
    assert.ok(r.done, JSON.stringify(r));
    assert.equal(r.doors, 7, JSON.stringify(r));
    assert.equal(r.beds, 4, JSON.stringify(r));
    assert.equal(r.chests, 3, JSON.stringify(r));

    // the pictures: rendered from a camera of their own (the hero's eyes are not where the picture is)
    const dir = path.join(ROOT, 'docs', 'screenshots', 'castle');
    fs.mkdirSync(dir, { recursive: true });
    const shot = async (name, where) => {
        const url = await page.evaluate(async (where) => {
            const g = window.__zns.game, T = window.__zns.THREE, cm = g.castleMagic, rec = [...cm.list.values()][0];
            const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
            const lay = cm.plan(rec);
            const gate = lay.gate, mid = { x: rec.x, z: rec.z };
            const fx = gate.x - mid.x, fz = gate.z - mid.z, fl = Math.hypot(fx, fz), ux = fx / fl, uz = fz / fl;
            const cam = new T.PerspectiveCamera(where === 'out' ? 62 : 75, 1280 / 720, 0.1, 2000);
            let eye, look;
            if (where === 'out') { eye = new T.Vector3(mid.x + ux * 95 + uz * 38, rec.G + 22, mid.z + uz * 95 - ux * 38); look = new T.Vector3(mid.x, rec.G + 22, mid.z); }
            else { eye = new T.Vector3(mid.x + ux * 5, rec.G + 5.5, mid.z + uz * 5); look = new T.Vector3(mid.x - ux * 20, rec.G + 4, mid.z - uz * 20); }
            g.character.group.position.set(eye.x, rec.G + 3, eye.z);
            g.dayStart = Date.now() - 24 * 60 * 1000 * 0.3;
            g.world.setDayPhase?.(g.dayPhase());
            g.world.terrain.flushAround?.(eye.x, eye.z);
            for (let i = 0; i < 160; i++) await frame();
            cam.position.copy(eye); cam.lookAt(look);
            g.scene.updateMatrixWorld(true);
            g.renderer.render(g.scene, cam);
            return g.renderer.domElement.toDataURL('image/png');
        }, where);
        fs.writeFileSync(path.join(dir, name), Buffer.from(url.split(',')[1], 'base64'));
    };
    await shot('castle-outside.png', 'out');
    await shot('castle-throne-hall.png', 'in');
    assert.deepEqual(realErrors(errors), []);
});
