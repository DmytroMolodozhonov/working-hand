/**
 * The body as in life, from the camera (poses.mjs): a real jump is a jump in the game; up onto a
 * two-block ledge with a jump; in a bed — no movement of the arms or the body gets the hero up,
 * only a real jump. (Up a two-block ledge by the hands: ledge.test.mjs.)
 * Run: ZNS_TEST_PORT=8271 node --test tests/e2e/body-moves.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame, jumpFrames } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8271;
let srv, browser, page, errors;
test.before(async () => {
    srv = await startServer(PORT); browser = await launch({});
    ({ page, errors } = await openPage(browser, srv.url));
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
});
test.after(async () => { await browser?.close(); srv?.stop(); setTimeout(() => process.exit(0), 500).unref(); });

/** Camera frames at 30 FPS (in the page: the clock as a camera's); the hero's highest feet over the start. */
const play = (list) => page.evaluate(async (list) => {
    const g = window.__zns.game, ch = g.character, y0 = ch.group.position.y;
    let top = y0;
    for (const f of list) {
        f.ts = performance.now(); window.__zns.poseService.injectRaw(f);
        await new Promise((r) => setTimeout(r, 33));
        top = Math.max(top, ch.group.position.y);
    }
    return { rise: top - y0 };
}, list);
const STAND = (n) => Array.from({ length: n }, () => frame({ arms: 'hang', legs: { left: 'stand', right: 'stand' }, scale: 0.7 }));

/** A flat open spot (`wall`: a 2-block wall across it, 1 m ahead of the hero, who faces it). */
const spot = (wall = 0) => page.evaluate(async (wall) => {
    const g = window.__zns.game, D = g.terrain.data, ch = g.character;
    const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
    let cx = 0, cz = 0, L0 = 0;
    for (let n = window.__spotNext || 0; n < 1000; n++) {
        const r = 24 + Math.floor(n / 24) * 9, a = n % 24;
        window.__spotNext = n + 1;
        cx = Math.round(Math.cos(a / 24 * 6.283) * r); cz = Math.round(Math.sin(a / 24 * 6.283) * r);
        D.ensure?.(cx, cz);
        L0 = D.topLayer(cx, cz);
        let ok = !g.swim.waterAt(cx, cz);
        for (let dx = -4; dx <= 4 && ok; dx++) for (let dz = -5; dz <= 4 && ok; dz++) if (D.topLayer(cx + dx, cz + dz) !== L0 || D.solidIn(cx + dx, cz + dz, L0 + 1, L0 + 8) || g.swim.waterAt(cx + dx, cz + dz)) ok = false;
        if (ok) break;
    }
    const stone = D.get(cx, L0, cz);
    if (wall) for (let dx = -3; dx <= 3; dx++) for (let dz = -4; dz <= -2; dz++) for (let L = L0 + 1; L <= L0 + wall; L++) D.set(cx + dx, L, cz + dz, stone);
    ch.group.rotation.y = 0; g.cameraBaseRotation = 0;
    ch.group.position.set(cx, L0 - 0.5 + 2, wall ? cz - 1.5 + 0.55 : cz);
    ch.verticalVelocity = 0;
    await frames(20);
    return { cx, cz, floor: L0 - 0.5, top: L0 - 0.5 + wall };
}, wall);

test('a real jump in front of the camera: the hero jumps (and lands); standing still is no jump', async () => {
    await spot();
    const still = await play(STAND(45));
    assert.ok(still.rise < 0.05, 'standing: no jump ' + still.rise);
    // (the squat before the jump moves the hands down with the body: that is no pull on the edge)
    await page.evaluate(() => { const L = window.__zns.game.ledge, o = L._startOver.bind(L); window.__overs = 0; L._startOver = () => { window.__overs++; o(); }; });
    const j = await play(jumpFrames({ h: 0.5 }));
    assert.equal(await page.evaluate(() => window.__overs), 0, 'up by the jump, not by the hands');
    assert.ok(j.rise > 0.4, 'jumped up: ' + j.rise);
    const s = await page.evaluate(() => ({ jumps: window.__zns.game.currentPose?.jump?.jumps, onGround: window.__zns.game.character.onGround }));
    assert.ok(s.onGround, 'landed');
});

test('up onto a two-block ledge with a real jump; standing at it with the arms hanging climbs nothing', async () => {
    const w = await spot(2);
    await play(STAND(30));
    const g0 = await page.evaluate(() => { const ch = window.__zns.game.character, p = ch.group.position; return { ground: ch.groundY, x: p.x, y: p.y, z: p.z, ry: ch.group.rotation.y }; });
    assert.equal(g0.ground, w.floor, 'still at the foot of the ledge (the hanging hands at the edge\'s height pull nothing) ' + JSON.stringify([g0, w]));
    // (the squat before the jump moves the hands down with the body: that is no pull on the edge)
    await page.evaluate(() => { const L = window.__zns.game.ledge, o = L._startOver.bind(L); window.__overs = 0; L._startOver = () => { window.__overs++; o(); }; });
    const j = await play(jumpFrames({ h: 0.5 }));
    assert.equal(await page.evaluate(() => window.__overs), 0, 'up by the jump, not by the hands');
    const s = await page.evaluate(() => { const ch = window.__zns.game.character; return { ground: ch.groundY, z: ch.group.position.z, onGround: ch.onGround }; });
    s.rise = j.rise;
    assert.ok(s.onGround && Math.abs(s.ground - w.top) < 1e-6 && s.z < w.cz - 1.5, `up on the ledge: ${JSON.stringify(s)} ${JSON.stringify(w)}`);
});

test('in a bed: the arms, standing up, walking — still lying; a real jump — up beside the bed', async () => {
    const w = await spot();
    const bed = await page.evaluate(async ({ cx, cz, floor }) => {
        const g = window.__zns.game, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const b = g.beds.spawnBed({ x: cx, y: floor, z: cz - 3 }, 0, 'white', { id: 'test-bed-moves' });
        g.beds._standAt = 0;
        ch.group.position.set(b.x, b.y + 1.2 + 2, b.z); // (up on its mattress: lies down at once)
        await frames(20);
        return { lying: g.beds.lying };
    }, w);
    assert.equal(bed.lying, 'test-bed-moves', 'lies in the bed');
    // the arms waved, up, forward; standing straight; steps on the spot — 4 s
    const busy = [];
    for (let i = 0; i < 120; i++) busy.push(frame({ arms: ['up', 'forward', 'down', 'hang'][Math.floor(i / 6) % 4], bob: (i % 4) * 0.01, legs: { left: i % 8 < 4 ? 'up' : 'stand', right: i % 8 < 4 ? 'stand' : 'up' }, scale: 0.7 }));
    await play(busy);
    assert.equal(await page.evaluate(() => window.__zns.game.beds.lying), 'test-bed-moves', 'still lying after moving the arms and the body');
    await play(jumpFrames({ h: 0.5 }));
    const up = await page.evaluate(() => { const g = window.__zns.game, ch = g.character; return { lying: g.beds.lying, rx: ch.group.rotation.x }; });
    assert.equal(up.lying, null, 'a real jump: up from the bed');
    assert.equal(up.rx, 0);
    assert.deepEqual(realErrors(errors).filter((e) => !/status of 404/.test(e)), []);
});
