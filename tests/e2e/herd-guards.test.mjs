/**
 * The herds' guardians in the game: hit a cow of a herd with a bull — he turns into the bronze bull and
 * charges; hit a sheep of a flock with a leader ram — he becomes the minotaur. Pictures: test-results/guard-*.png
 * Run: ZNS_TEST_PORT=8253 node --test tests/e2e/herd-guards.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8253;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the bronze bull wakes and charges; the leader ram becomes a minotaur', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // (away from the start's pedestals: the bull would rush into them)
    await page.evaluate(() => { const p = window.__zns.game.character.group.position; p.x += 45; p.z += 30; });
    const dir = path.join(ROOT, 'test-results');
    fs.mkdirSync(dir, { recursive: true });

    const stage = (type) => page.evaluate(async (type) => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, A = g.animals;
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        A._migT = 1e9; A._spawnT = 1e9; A.guards.log.length = 0;
        for (const a of [...A.list]) A._remove(a);
        const fw = g.camera.getWorldDirection(new T.Vector3()).setY(0).normalize();
        const at = ch.group.position.clone().addScaledVector(fw, 22);
        const rnd = Math.random; Math.random = () => 0.01;
        let herd; try { herd = A.spawnHerdAt(type, 3, at.x, at.z); } finally { Math.random = rnd; }
        const gd = herd.find((a) => a.guard);
        for (let i = 0; i < 10; i++) await frame();
        const d0 = gd.group.position.distanceTo(ch.group.position);
        A.hit(herd.find((a) => a !== gd), 1, fw.clone(), g.localId);
        // (the software renderer draws ~1 frame a second here: the animals' own clock is run on in steps —
        // in the real world, its ground and walls — and then the picture is drawn)
        const step = (secs, stop) => { for (let t = 0; t < secs; t += 1 / 20) { A.update(1 / 20); if (stop?.()) return t; } return secs; };
        const awakeAt = step(10, () => gd.form === 2);
        let closest = d0;
        step(20, () => { closest = Math.min(closest, gd.group.position.distanceTo(ch.group.position)); return A.guards.log.some((e) => ['gore', 'fire', 'punch', 'butt'].includes(e.ev)); });
        // (face him for the picture)
        const to = gd.group.position.clone().sub(ch.group.position);
        ch.group.rotation.y = Math.atan2(-to.x, -to.z);
        for (let i = 0; i < 3; i++) await frame();
        return { form: gd.form, awakeAt, d0, closest, log: A.guards.log.map((e) => e.ev), scale: gd.model.scale.y, mino: !!gd.model.userData.minotaur?.visible };
    }, type);

    const bull = await stage('cow');
    assert.equal(bull.form, 2, JSON.stringify(bull));
    assert.ok(bull.closest < bull.d0 - 5 || bull.log.some((e) => e === 'gore' || e === 'fire'), `he came at me (${JSON.stringify(bull)})`);
    await page.screenshot({ path: path.join(dir, 'guard-bull.png') });

    const ram = await stage('sheep');
    assert.equal(ram.form, 2, JSON.stringify(ram));
    assert.ok(ram.mino, 'the minotaur stands');
    assert.ok(ram.closest < ram.d0 - 3 || ram.log.some((e) => e === 'punch' || e === 'butt'), `he came at me (${JSON.stringify(ram)})`);
    await page.screenshot({ path: path.join(dir, 'guard-minotaur.png') });
    assert.deepEqual(realErrors(errors), []);
});
