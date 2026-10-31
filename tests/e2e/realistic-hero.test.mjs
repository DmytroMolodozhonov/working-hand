/**
 * The «Реалистичный» hero in the game (Общие настройки → Модель героя): it appears, its bones follow the
 * camera's body, hands and face (synthetic poses), nothing in the console; the Creative mirror reflects it.
 * Run: ZNS_TEST_PORT=8231 node --test tests/e2e/realistic-hero.test.mjs  (a picture: ZNS_SKIN_SHOT=/path.png)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, waitHudVisible, realErrors, sleep } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8231;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch(); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the realistic hero: arms, fingers and face from the camera; the standard one hidden; the mirror shows it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await page.evaluate(() => { const el = document.getElementById('hero-model'); el.value = 'real'; el.dispatchEvent(new Event('change')); });
    // (Творческий; the software video card of a container loads the world in ~100 s — a long wait)
    await page.waitForFunction(() => document.getElementById('saved-worlds')?.children.length > 0 && document.querySelector('.mode-row .mode-card'));
    if (await page.isHidden('#create-world')) await page.click('#create-world-btn');
    await page.click('.mode-card[data-mode="creative"]');
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 300000 });
    await waitHudVisible(page, 120000);
    await page.waitForFunction(() => window.__zns.game.character.real?.shown, null, { timeout: 120000 });
    await feed(page, { arms: 'up', rightCurl: 1, leftCurl: 0, face: { smile: 1 } }, 25, 40);
    const a = await page.evaluate(() => {
        const g = window.__zns.game, ch = g.character, R = ch.real;
        const v = (o) => { const p = new (o.position.constructor)(); return p.setFromMatrixPosition(o.matrixWorld); };
        ch.group.updateMatrixWorld(true);
        // the realistic palm's bone where the game's palm is (the group's space → the world)
        const bone = R.bones.find((b) => b.name === 'handR'), palm = ch.rightSimplifiedHand.palm;
        const d = v(bone).distanceTo(v(palm));
        const curl = ch.rightSimplifiedHand.fingerMeshes.index[1].pivot.rotation.x;
        const f2 = R.bones.find((b) => b.name === 'index1R');
        return { d, curl, fingerFollows: v(f2).distanceTo(v(ch.rightSimplifiedHand.fingerMeshes.index[1].pivot)), smile: ch.face?.smileL, bodyHidden: !ch.body.visible, meshes: Object.keys(R.meshes).length, wear: Object.keys(R.wear) };
    });
    assert.ok(a.bodyHidden, 'the standard torso hidden');
    assert.ok(a.d < 0.01, `the palm on the game's palm (${a.d})`);
    assert.ok(a.fingerFollows < 0.01, `the finger bones on the game's (${a.fingerFollows})`);
    assert.ok(a.smile > 0.15, `the smile read from the face (${a.smile})`);
    // the face closes the eyes, then opens the mouth
    await feed(page, { arms: 'hang', face: { close: 1 } }, 20, 40);
    const blink = await page.evaluate(() => window.__zns.game.character.real.face.blinkL);
    assert.ok(blink > 0.6, `the eyes closed (${blink})`);
    // the mirror: stand in front of it, look at it
    await page.evaluate(() => {
        const g = window.__zns.game, ch = g.character, m = g.mirror;
        const p = m.group.position;
        ch.group.position.set(p.x + 11, ch.group.position.y, p.z);
        g.cameraBaseRotation = Math.PI / 2; ch.setBodyRotation(Math.PI / 2);
    });
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0.5, face: { jaw: 1 } }, 30, 40);
    await sleep(500);
    const m = await page.evaluate(() => ({ ...window.__zns.game.mirror.stats, rt: !!window.__zns.game.mirror.rt, calls: window.__zns.game.renderer.info.render.calls }));
    assert.ok(m.passes > 3 && m.rt, `the mirror drew its reflection (${JSON.stringify(m)})`);
    if (process.env.ZNS_SKIN_SHOT) await page.screenshot({ path: process.env.ZNS_SKIN_SHOT });
    // back to the standard model: the realistic one off, the standard parts seen again
    await page.evaluate(() => { const el = document.getElementById('hero-model'); el.value = 'std'; el.dispatchEvent(new Event('change')); });
    const back = await page.evaluate(() => ({ body: window.__zns.game.character.body.visible, real: window.__zns.game.character.real.shown }));
    assert.deepEqual(back, { body: true, real: false });
    await page.evaluate(() => { const el = document.getElementById('hero-model'); el.value = 'std'; el.dispatchEvent(new Event('change')); });
    assert.deepEqual(realErrors(errors), []);
});
