/**
 * The wand's belt with a real-like camera (the points jitter): the hand brought to the
 * belly is shown AT the belly, by the wand (it was far in front, it could not reach it);
 * opened and closed there, looking down, it takes the wand; tucked in, it puts it back.
 * First person: looking down one sees one's own torso.
 * Run: ZNS_TEST_PORT=8198 node --test tests/e2e/wand-belt.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8198;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
/** Like feed(), but every point jitters as a real camera network's does (±`n` of the picture). */
async function feedNoisy(page, opts, count, ms = 40, n = 0.006) {
    for (let i = 0; i < count; i++) {
        const f = frame(opts);
        for (const p of f.poseLandmarks) { p.x += rnd() * n; p.y += rnd() * n; }
        for (const h of f.hands) for (const p of h.landmarks) { p.x += rnd() * n * 0.5; p.y += rnd() * n * 0.5; }
        await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, f);
        await new Promise((r) => setTimeout(r, ms));
    }
}

test('the wand\'s belt with a jittering camera: the hand reaches the wand at the belly, takes it looking down, tucks it back; the torso is seen looking down', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.inventory.slots.fill(null);
        g.inventory.slots[1] = { kind: 'wand', uid: 'wb1', type: 0 };
        g.inventory._render();
        window.__zns.poseService.interpreter.lastHead.pitch = -0.6; // (looking down at the belt)
    });
    // the open right hand to the belt
    await feedNoisy(page, { arms: 'hang', belt: 'right', rightCurl: 0, leftCurl: 0 }, 12);
    await page.waitForFunction(() => window.__zns.game.inventory.belt.lookingDown(), null, { timeout: 30000 });
    await feedNoisy(page, { arms: 'hang', belt: 'right', rightCurl: 0, leftCurl: 0 }, 4);
    const reach = await page.evaluate(async () => {
        const { BELT_TOP, BELT_TIP } = await import('/src/game/WandBelt.js');
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        ch.group.updateMatrixWorld(true);
        const local = ch.getHandWorldPosition('right', new T.Vector3()).applyMatrix4(new T.Matrix4().copy(ch.group.matrixWorld).invert());
        // the nearest point of the wand on the belt (its handle → its tip, the hero's space)
        const near = new T.Line3(BELT_TOP.clone(), BELT_TIP.clone()).closestPointToPoint(local, true, new T.Vector3());
        return { d: near.distanceTo(local), z: local.z, cam: g.camera.layers.mask, body: ch.body.layers.mask, head: ch.head.layers.mask, seen: !!g.inventory.belt.model };
    });
    assert.ok(reach.z > -0.75 && reach.z < -0.4, `the hand at the belly, not far ahead (z ${reach.z.toFixed(2)})`);
    assert.ok(reach.seen && reach.d < 0.45, `the hand by the wand (${reach.d.toFixed(2)})`);
    assert.ok((reach.cam & reach.body) !== 0, 'first person: the torso is seen');
    assert.equal(reach.cam & reach.head, 0, 'first person: the head is not (the eyes are in it)');
    // the fingers close on it
    await feedNoisy(page, { arms: 'hang', belt: 'right', rightCurl: 0.9, leftCurl: 0 }, 15);
    const took = await page.evaluate(() => ({ r: window.__zns.game.items.held.right?.item.kind || null, log: window.__zns.game.inventory.belt.log.join(',') }));
    assert.equal(took.r, 'wand', 'taken ' + JSON.stringify(took));
    // away from the belt, then tucked back in (the tip down)
    await feedNoisy(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0 }, 15);
    await feedNoisy(page, { arms: 'hang', belt: 'right', rightRot: Math.PI, rightCurl: 0.9, leftCurl: 0 }, 25);
    const back = await page.evaluate(() => ({ r: window.__zns.game.items.held.right?.item.kind || null, belt: !!window.__zns.game.inventory.belt.model }));
    assert.ok(!back.r && back.belt, 'tucked back in ' + JSON.stringify(back));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
