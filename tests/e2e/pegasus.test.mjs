/**
 * The Pegasus in the game: fed (trusted), mounted, a slap on his head — he spreads his wings and takes off
 * with the rider. Picture: test-results/pegasus.png
 * Run: ZNS_TEST_PORT=8255 node --test tests/e2e/pegasus.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8255;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('mount the Pegasus, slap his head, fly', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, A = g.animals;
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        A._migT = 1e9; A._spawnT = 1e9;
        for (const a of [...A.list]) A._remove(a);
        ch.group.position.x += 45; ch.group.position.z += 30; // (away from the start's pedestals)
        await frame();
        const fw = g.camera.getWorldDirection(new T.Vector3()).setY(0).normalize();
        const at = ch.group.position.clone().addScaledVector(fw, 8);
        const { PEGASUS_COLOR } = await import('/src/game/AnimalModels.js');
        const peg = A._spawn('horse', new T.Vector3(at.x, g.collision.groundY(at.x, at.z) + 0.5, at.z), { color: PEGASUS_COLOR, yaw: Math.atan2(fw.x, fw.z) });
        for (let i = 0; i < 3; i++) await frame();
        // not trusted: he doesn't let me on
        ch.group.position.set(peg.group.position.x + 1.2, ch.group.position.y, peg.group.position.z);
        A.tryMount();
        const refused = !A.riding;
        peg.trustBy = g.localId; peg.trustUntil = Date.now() + 60000; // (as if a golden apple won him over)
        A.tryMount();
        const mounted = A.riding === peg && !peg.tamed;
        // a slap: the hand comes down onto his head
        peg.model.updateMatrixWorld(true);
        const hp = peg.model.userData.head.getWorldPosition(new T.Vector3());
        A._slapLast = [hp.clone().add(new T.Vector3(0, 1.2, 0))];
        const slap = A._slap(peg, 1 / 20, [hp.clone().add(new T.Vector3(0, 0.05, 0))]);
        if (slap) A._pegasusToggle(peg);
        const y0 = peg.group.position.y;
        let maxY = y0;
        for (let i = 0; i < 40; i++) { A.update(1 / 20); maxY = Math.max(maxY, peg.group.position.y); }
        for (let i = 0; i < 3; i++) await frame();
        return { refused, mounted, slap, flying: !!peg.riderFly, rose: maxY - y0, wings: peg.wingOpen, onBack: Math.abs(ch.group.position.y - peg.group.position.y) < 6, tamed: peg.tamed };
    });
    assert.ok(r.refused, JSON.stringify(r));
    assert.ok(r.mounted, JSON.stringify(r));
    assert.ok(r.slap && r.flying, JSON.stringify(r));
    assert.ok(r.rose > 0.5, `he took off (${JSON.stringify(r)})`);
    assert.ok(r.wings > 0.8 && r.onBack, JSON.stringify(r));
    assert.equal(r.tamed, null, 'never tamed');
    // the picture: him on the grass, wings spread
    await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, A = g.animals;
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        A.dismount(); A.riding && (A.riding.riderFly = false, A.dismount());
        const peg = A.list.find((a) => a.pegasus);
        A.riding = null; peg.rider = null; peg.riderFly = false;
        const ch = g.character, fw = g.camera.getWorldDirection(new T.Vector3()).setY(0).normalize(), side = new T.Vector3(-fw.z, 0, fw.x);
        const at = ch.group.position.clone().addScaledVector(fw, 12);
        peg.group.position.set(at.x, g.collision.groundY(at.x, at.z) + 2.5, at.z);
        peg.group.rotation.set(0, Math.atan2(side.x, side.z), 0);
        peg.lev = { picture: true }; peg.flyCode = 1;
        for (let i = 0; i < 30; i++) A._animate(peg, 0, 1 / 30);
        peg.flapPh = 0.4; A._animate(peg, 0, 0.001);
        for (let i = 0; i < 2; i++) await frame();
    });
    const dir = path.join(ROOT, 'test-results');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'pegasus.png') });
    assert.deepEqual(realErrors(errors), []);
});
