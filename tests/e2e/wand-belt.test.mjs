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
    assert.ok((reach.cam & reach.body) !== 0, 'first person: the torso (below the eyes) is seen');
    assert.equal(reach.cam & reach.head, 0, 'first person: the head is not (the eyes are in it)');
    // the fingers close on it
    await feedNoisy(page, { arms: 'hang', belt: 'right', rightCurl: 0.9, leftCurl: 0 }, 15);
    const took = await page.evaluate(() => ({ r: window.__zns.game.items.held.right?.item.kind || null, log: window.__zns.game.inventory.belt.log.join(',') }));
    assert.equal(took.r, 'wand', 'taken ' + JSON.stringify(took));
    // away from the belt, then tucked back in (the tip down)
    await feedNoisy(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0 }, 15);
    // ...riding along as on a sailing ship going up its stair (the whole body moves: 5 m/s on, 1 up) — the hand is still against the body
    await page.evaluate(() => { const ch = window.__zns.game.character; window.__ride = setInterval(() => { ch.group.position.x += 0.08; ch.group.position.y += 0.016; }, 16); });
    await feedNoisy(page, { arms: 'hang', belt: 'right', rightRot: Math.PI, rightCurl: 0.9, leftCurl: 0 }, 25);
    await page.evaluate(() => clearInterval(window.__ride));
    const back = await page.evaluate(() => ({ r: window.__zns.game.items.held.right?.item.kind || null, belt: !!window.__zns.game.inventory.belt.model }));
    assert.ok(!back.r && back.belt, 'tucked back in ' + JSON.stringify(back));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('the wand is tucked in only on purpose: the head only a little lowered, lowered, resting a little to the left, hanging, wind-ups and flicks past the hip — never (a jittering camera); brought to the waistband and held — yes', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.inventory.slots.fill(null);
        g.items.takeIntoHand({ kind: 'wand', uid: 'wb2', type: 0 }, 'right');
    });
    const held = () => page.evaluate(() => window.__zns.game.items.held.right?.item.kind || null);
    const head = (p) => page.evaluate((p) => { window.__zns.poseService.interpreter.lastHead.pitch = p; }, p);
    await head(-0.6); // (looking down all along: only the hand decides)
    await feedNoisy(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0 }, 10);
    // the wand lowered: down, a little to the left, the tip down — and resting there
    await feedNoisy(page, { arms: 'hang', lowLeft: true, rightRot: Math.PI, rightCurl: 0.9, leftCurl: 0 }, 50);
    assert.equal(await held(), 'wand', 'lowered a little to the left: still in the hand');
    await feedNoisy(page, { arms: 'hang', rightRot: Math.PI, rightCurl: 0.9, leftCurl: 0 }, 40);
    assert.equal(await held(), 'wand', 'hanging: still in the hand');
    await feedNoisy(page, { arms: 'down', rightRot: Math.PI, rightCurl: 0.9, leftCurl: 0 }, 30);
    assert.equal(await held(), 'wand', 'arms down: still in the hand');
    // wind-ups and flicks (throwing Lumos): the arm swings back past the hip, the tip down,
    // and forward again — never tucked in
    for (let k = 0; k < 6; k++) {
        await feedNoisy(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0 }, 2, 30);
        await feedNoisy(page, { arms: 'hang', belt: 'right', rightRot: Math.PI, rightCurl: 0.9, leftCurl: 0 }, 3, 30);
        await feedNoisy(page, { arms: 'hang', rightRot: Math.PI, rightCurl: 0.9, leftCurl: 0 }, 2, 30);
        await feedNoisy(page, { arms: 'up', rightCurl: 0.9, leftCurl: 0 }, 2, 30);
    }
    assert.equal(await held(), 'wand', 'wind-ups and flicks past the hip: still in the hand');
    // brought to the waistband with the head only a little lowered: not tucked in (it needs a real look down)
    await head(-0.3);
    await feedNoisy(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0 }, 10);
    await feedNoisy(page, { arms: 'hang', belt: 'right', rightRot: Math.PI, rightCurl: 0.9, leftCurl: 0 }, 25);
    assert.equal(await held(), 'wand', 'the head a little lowered: still in the hand');
    // tucked in on purpose: looking down, from in front, pushed down into the waistband, the tip down
    await head(-0.6);
    await feedNoisy(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0 }, 10);
    await feedNoisy(page, { arms: 'hang', belt: 'right', rightRot: Math.PI, rightCurl: 0.9, leftCurl: 0 }, 25);
    const r = await page.evaluate(() => ({ r: window.__zns.game.items.held.right?.item.kind || null, belt: !!window.__zns.game.inventory.belt.model, log: window.__zns.game.inventory.belt.log.join(',') }));
    assert.ok(!r.r && r.belt, 'pushed into the waistband: tucked in ' + JSON.stringify(r));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
