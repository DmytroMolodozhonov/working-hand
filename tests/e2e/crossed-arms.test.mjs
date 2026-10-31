/**
 * «Protection» by crossing the arms before the chest (CrossedArms.js): up within the first pictures of the cross (no hold), down when they open;
 * not by arms at the sides / forward / up / in the T / in the pockets / at the mouth.
 * Run: node --test tests/e2e/crossed-arms.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8190;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

const shield = (page) => page.evaluate(() => { const c = window.__zns.game.combat; return c.shield ? { type: c.shield.type, gesture: !!c.shield.gesture } : null; });
const reset = (page) => page.evaluate(() => { const g = window.__zns.game; g.combat.shield = null; g.combat.fatigue = g.combat.maxFatigue || 100; g.crossedShield.track.reset(); g.crossedShield.mine = false; g.crossedShield.tent = false; g.crossedShield.refused = false; });
let clock = null; // (the pictures' own time, 30 a second — CrossTrack reads it, not the page's clock)
/** `secs` of camera at 30 pictures a second: each picture goes in (PoseService.onRawPose → the gesture at once), then the game's frame steps. */
async function tick(page, pose, secs) {
    const n = Math.round(secs * 30);
    if (clock == null) clock = await page.evaluate(() => performance.now());
    for (let i = 0; i < n; i++) {
        clock += 1000 / 30;
        await page.evaluate(({ raw, ts }) => { raw.ts = ts; window.__zns.poseService.injectRaw(raw); }, { raw: frame(pose), ts: clock });
        await page.evaluate(() => window.__zns.game.crossedShield.update(1 / 30));
    }
}

test('freeworld: crossed arms raise the shield and opening them takes it down; other poses do not', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await tick(page, { arms: 'hang' }, 0.3);
    assert.equal(await shield(page), null);
    // not these (2 s of each)
    const not = { hang: { arms: 'hang' }, forward: { arms: 'forward' }, up: { arms: 'up' }, T: { raise: 90 }, pockets: { arms: 'hang', pocket: 'both' }, mouth: { arms: 'hang', toMouth: 'right' }, mouthLeft: { arms: 'hang', toMouth: 'left' } };
    for (const [name, pose] of Object.entries(not)) {
        await reset(page);
        await tick(page, pose, 2);
        assert.equal(await shield(page), null, `${name}: no shield`);
    }
    // crossed: up within the first pictures (no 0.35 s hold any more) — the same plain «Protection» (5 mana), marked as the gesture's
    await reset(page);
    await tick(page, { crossedArms: true }, 0.1); // (3 pictures: the jump in, a guess, confirmed)
    assert.deepEqual(await shield(page), { type: 1, gesture: true }, 'up within 0.1 s');
    assert.ok(!(await page.evaluate(() => window.__zns.game.combat.shield.tent)), 'confirmed, not a guess');
    await tick(page, { crossedArms: true }, 0.3);
    // (what it costs — once for a guess and its confirmation — is in tests/unit/protection-gesture.test.js: here the page's own clock runs between the pictures)
    // the shield stands in front of the crossed arms (not at a wand's tip), facing the body's front
    const place = await page.evaluate(() => {
        const g = window.__zns.game, c = g.combat, ch = g.character;
        const at = c.shieldAt('right'), dir = c.shieldDir('right');
        const l = ch.getHandWorldPosition('left'), r = ch.getHandWorldPosition('right');
        const mid = l.clone().add(r).multiplyScalar(0.5);
        const fwd = ch.crossShieldPose().dir;
        return { ahead: at.clone().sub(mid).dot(fwd), side: at.clone().sub(mid).sub(fwd.clone().multiplyScalar(at.clone().sub(mid).dot(fwd))).length(), face: dir.dot(fwd), ser: c.serialize()[7] };
    });
    assert.ok(place.ahead > 0.1 && place.ahead < 1, `a bit ahead of the arms: ${place.ahead}`);
    assert.ok(place.side < 0.05 && place.face > 0.99 && place.ser === 1, JSON.stringify(place));
    await tick(page, { crossedArms: true }, 2);
    assert.ok(await shield(page), 'stays while crossed');
    // opened: gone after ~0.2 s, not before
    await tick(page, { arms: 'hang' }, 0.1);
    assert.ok(await shield(page), 'a blink of the arms keeps it');
    await tick(page, { arms: 'hang' }, 0.2);
    assert.equal(await shield(page), null, 'arms open → shield gone');
    // a voice shield: the gesture adds nothing and opening the arms does not take it down
    await reset(page);
    const voiced = await page.evaluate(() => { const g = window.__zns.game; const n = g.castLocalSpell('protection', true); return { n, why: g.lastCastWhy, last: Date.now() - (g._lastShieldCast || 0), st: g.crossedShield.track.state, log: g.spellLog?.lines?.slice?.(-3) }; });
    assert.equal((await shield(page))?.gesture, false, JSON.stringify(voiced));
    await tick(page, { crossedArms: true }, 1);
    await tick(page, { arms: 'hang' }, 1);
    assert.ok(await shield(page), 'the voice shield stays');
    // no mana: no shield (the hint is the voice one), and not asked again until the arms open
    await reset(page);
    await page.evaluate(() => { const g = window.__zns.game; g.combat.enabled = true; g.combat.fatigue = 0; });
    await tick(page, { crossedArms: true }, 1);
    assert.equal(await shield(page), null, 'no mana, no shield');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
