/**
 * «Firefighting» in a real browser (Creative): a raised hand + the words — the burst puts out a campfire
 * ahead; «Let the Hellfire Come» is only knocked back by a burst, and «Firefighting Maxima» held on it
 * drowns it. Run: ZNS_TEST_PORT=8191 node --test tests/e2e/firefighting.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8191;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('«Firefighting»: a burst puts out a campfire; the Hellfire is knocked back by it and drowned by «Firefighting Maxima»', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const raw = frame({ arms: 'forward', wristOffset: [0, 0.05], rightTilt: 1.57 });
    await page.evaluate((raw) => {
        window.__ffPose = setInterval(() => window.__zns.poseService.injectRaw({ ...JSON.parse(JSON.stringify(raw)), ts: performance.now() }), 33);
    }, raw);
    await page.waitForFunction(() => window.__zns.game.character.isArmRaised('right'), null, { timeout: 20000 });
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const o = g.castOrigin('right', new T.Vector3());
        const d = ch.getHandDirection('right').setY(0).normalize();
        const p = o.clone().addScaledVector(d, 7);
        // a campfire 7 m ahead
        const cf = g.campfires.kindle(p.x, g.collision.groundY(p.x, p.z), p.z);
        g.lastSpellCastTime = 0; g.lastMagicTime = Date.now(); // (the hand raised a moment ago)
        const cast = g.castLocalSpell('файрфайтинг', true);
        let t0 = performance.now();
        while (g.campfires.list.has(cf.id) && performance.now() - t0 < 4000) await frames(1);
        const campfireOut = !g.campfires.list.has(cf.id);
        // the Hellfire, then a burst on it: only knocked back
        await frames(40);
        const hf = g.hellfire.cast(true);
        t0 = performance.now();
        while (g.hellfire.state && g.hellfire.state.R < 2.6 && performance.now() - t0 < 6000) await frames(1);
        const R0 = g.hellfire.state?.R ?? 0;
        // (aimed straight at the blaze)
        const aimAt = () => { const s = g.hellfire.state; if (!s) return; const sp = g.spells.spells.find((x) => x.spray); if (sp) { sp.spray.d.copy(s.c).sub(sp.spray.o).normalize(); } };
        g.lastSpellCastTime = 0; g.lastMagicTime = Date.now(); // (the hand raised a moment ago)
        const burst = g.castLocalSpell('fire fighting', true);
        for (let i = 0; i < 20; i++) { aimAt(); await frames(1); }
        const afterBurst = g.hellfire.state ? g.hellfire.state.R : 0;
        const knocked = g.hellfire.log.some((e) => e.ev === 'doused');
        const stillBurning = !!g.hellfire.state;
        // the hose
        g.lastSpellCastTime = 0; g.lastMagicTime = Date.now(); // (the hand raised a moment ago)
        const hose = g.castLocalSpell('файрфайтинг максима', true);
        t0 = performance.now();
        const handPose = g.spells.hooks.handPose;
        g.spells.hooks.handPose = (id, side) => { const s = g.hellfire.state; const h = handPose(id, side); if (s && h) h.dir = s.c.clone().sub(h.origin).normalize(); return h; };
        while (g.hellfire.state && performance.now() - t0 < 8000) await frames(1);
        g.spells.hooks.handPose = handPose;
        const drowned = !g.hellfire.state && g.hellfire.log.some((e) => e.ev === 'out' && e.why === 'water');
        // «стоп» ends the hose
        const hoseLeft = g.spells.spells.some((x) => x.kind === 'FirefightingMaxima' && x.life > 0);
        g.stopSpells();
        const hoseAfterStop = g.spells.spells.some((x) => x.kind === 'FirefightingMaxima' && x.life > 0);
        return { cast, campfireOut, hf, R0, burst, afterBurst, knocked, stillBurning, hose, drowned, hoseLeft, hoseAfterStop };
    });
    await page.evaluate(() => clearInterval(window.__ffPose));
    const s = JSON.stringify(r);
    assert.equal(r.cast, 'Firefighting', s);
    assert.ok(r.campfireOut, 'the campfire went out ' + s);
    assert.equal(r.hf, 'Hellfire');
    assert.equal(r.burst, 'Firefighting');
    assert.ok(r.knocked && r.stillBurning, 'a burst only knocks the Hellfire back ' + s);
    assert.equal(r.hose, 'FirefightingMaxima');
    assert.ok(r.drowned, 'the hose drowned the Hellfire ' + s);
    assert.ok(!r.hoseAfterStop, '«стоп» ends the hose ' + s);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
