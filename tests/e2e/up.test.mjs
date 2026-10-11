/**
 * «Up» («Ап»): a raised hand lying on the ground — up at once; a raised hand in deep water —
 * thrown up out of it in an arc towards where the hand points.
 * Run: ZNS_TEST_PORT=8251 node --test tests/e2e/up.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8251;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

/** Arms up (both, or only the person's left one: the right one hangs). */
const armsUp = (onlyLeft = false) => {
    const f = frame({ raise: onlyLeft ? 140 : 165 });
    if (onlyLeft) {
        const p = f.poseLandmarks;
        p[14] = { x: 0.36, y: 0.6, z: 0, visibility: 0.99 }; p[16] = { x: 0.34, y: 0.82, z: 0, visibility: 0.99 };
    }
    return f;
};
const feedRaw = async (page, raw, n = 12) => {
    for (let i = 0; i < n; i++) {
        await page.evaluate((r) => { r.ts = performance.now(); window.__zns.poseService.injectRaw(r); }, raw);
        await new Promise((r) => setTimeout(r, 33));
    }
};

test('«Up»: knocked down, a hand up + «Up» — back on the feet at once; 7 mana; not while stunned; not without a hand up', async () => {
    const { page, errors } = await openPage(browser, srv.url);
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await feedRaw(page, frame({ arms: 'hang' }), 10);
    await page.evaluate(() => { const g = window.__zns.game; g.knock.knock({ dir: 'back', down: 30 }); g.combat.fatigue = 50; });
    await page.waitForFunction(() => window.__zns.game.knock.state === 'down', null, { timeout: 20000 });
    // the arms hanging: nothing
    const noArm = await page.evaluate(() => window.__zns.game.castLocalSpell('Ап', true));
    assert.equal(noArm, null, 'no hand up: no «Up»');
    // stunned: nothing
    await feedRaw(page, armsUp(), 15);
    const stunned = await page.evaluate(() => { const g = window.__zns.game; g.combat.stunned = true; g.combat.stunLeft = 3; const r = g.castLocalSpell('Up', true); g.combat.stunned = false; g.combat.stunLeft = 0; return r; });
    assert.equal(stunned, null, 'stunned: no «Up»');
    await feedRaw(page, armsUp(), 5);
    const r = await page.evaluate(() => { const g = window.__zns.game; const f0 = g.combat.fatigue; const name = g.castLocalSpell('Ап', true); return { name, state: g.knock.state, paid: f0 - g.combat.fatigue }; });
    assert.equal(r.name, 'Up');
    assert.equal(r.state, 'rising', 'getting up now, not after 30 s');
    assert.ok(Math.abs(r.paid - 7) < 0.01 || Math.abs(r.paid - 6) < 0.01, `7 mana (a wand saves 15%): ${r.paid}`);
    await page.waitForFunction(() => window.__zns.game.knock.state === 'up', null, { timeout: 20000 });
    // standing: «Up» does nothing
    assert.equal(await page.evaluate(() => window.__zns.game.castLocalSpell('Up', true)), null);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('«Up» in deep water: thrown up out of it, an arc towards the raised hand', async () => {
    const { page, errors } = await openPage(browser, srv.url);
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const spot = await page.evaluate(async () => {
        const g = window.__zns.game, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        for (let rad = 110; rad < 900; rad += 12) for (let a = 0; a < 64; a++) {
            const x = Math.cos(a / 64 * Math.PI * 2) * rad, z = Math.sin(a / 64 * Math.PI * 2) * rad;
            g.terrain.data.ensure?.(Math.round(x), Math.round(z));
            const w = g.swim.waterAt(x, z);
            if (w && w.depth >= 6) { ch.group.position.set(x, w.surface - 1, z); await frames(20); return { x, z, surface: w.surface }; }
        }
        return null;
    });
    assert.ok(spot, 'a deep lake near the spawn');
    await feedRaw(page, armsUp(true), 15);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, ch = g.character, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        for (let i = 0; i < 20 && !g.swim.swimming; i++) { g.swim.kick = 1; await frames(1); }
        g.combat.fatigue = 50;
        const swimming = g.swim.swimming;
        const arm = g.up.raisedArm(new T.Vector3());
        const p0 = ch.group.position.clone();
        const name = g.castLocalSpell('Up', true);
        let top = p0.y, out = false;
        for (let i = 0; i < 400 && g.up.leap; i++) { await frames(1); top = Math.max(top, ch.group.position.y); if (!g.swim.swimming && ch.swimY == null) out = true; }
        const d = ch.group.position.clone().sub(p0).setY(0);
        const ah = arm ? new T.Vector3(arm.x, 0, arm.z) : null;
        return { swimming, name, armUp: !!arm, rise: top - p0.y, out, dist: d.length(), cos: ah && ah.length() > 0.05 && d.length() > 0.1 ? d.normalize().dot(ah.normalize()) : null, down: g.knock.down };
    });
    assert.ok(r.swimming, 'swimming before');
    assert.ok(r.armUp, 'the raised hand is seen');
    assert.equal(r.name, 'Up');
    assert.ok(r.out, 'out of the water');
    assert.ok(r.rise > 3, `thrown up high (${r.rise.toFixed(1)})`);
    assert.ok(r.dist > 3, `flew sideways (${r.dist.toFixed(1)} m)`);
    assert.ok(r.cos != null && r.cos > 0.8, `towards the raised hand (cos ${r.cos})`);
    assert.ok(!r.down, 'not knocked down by an ordinary landing');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
