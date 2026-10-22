/**
 * Drawing a bow through a real, noisy camera: archer poses (the bow arm at the
 * camera, the other hand drawing to the chin) with jitter in every landmark, a
 * guessed depth that wobbles, finger readings that flicker and a drawing hand the
 * camera loses now and then. Both hands. The string is taken by closing the
 * fingers at the bow, follows the hand, opening shoots (strong); brought forward
 * it is let down without a shot. Creative: the quiver never runs out.
 * Run: node --test tests/e2e/bow-draw.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8193;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

let seed = 3;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; };
/** A camera's picture of these poses: every landmark jitters, the depth more. */
function noisy(opts) {
    const f = frame(opts);
    f.poseLandmarks = f.poseLandmarks.map((p) => ({ ...p, x: p.x + rnd() * 0.008, y: p.y + rnd() * 0.008, z: p.z + rnd() * 0.06 }));
    return f;
}
/** One picture per game frame (a slow test machine must not skip them). */
async function show(page, opts, count) {
    for (let i = 0; i < count; i++) {
        const f0 = await page.evaluate(() => window.__zns.game.frameCount);
        await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, noisy(typeof opts === 'function' ? opts(i) : opts));
        await new Promise((r) => setTimeout(r, 30));
        for (let k = 0; k < 50 && (await page.evaluate(() => window.__zns.game.frameCount)) < f0 + 1; k++) await new Promise((r) => setTimeout(r, 10));
    }
}
const state = (page) => page.evaluate(() => {
    const g = window.__zns.game, n = g.gear.nock;
    const bow = g.items.heldOf('bow'), S = bow?.model.userData.bowString;
    return {
        nock: n?.state || null, held: !!n?.string?.held, draw: n?.draw || 0,
        pulled: S ? S.tipX - S.nockX : 0, sight: !!g.gear._sight?.visible, net: g.gear.netBow() || null,
        shots: g.__shots.slice(), arrows: bow?.item.arrows,
    };
});

test('a bow through a noisy camera, either hand: fingers close on the string, it follows the hand to the chin, opening shoots strong; brought forward — let down, no shot', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        g.__shots = [];
        const fire = g.gear.fire.bind(g.gear);
        g.gear.fire = (from, vel, dmg, by) => { g.__shots.push(vel.length()); return fire(from, vel, dmg, by); };
    });
    for (const side of ['left', 'right']) {
        const other = side === 'left' ? 'right' : 'left';
        // the drawing fingers' reading flickers (synthetic hands read closed from ~0.15 up); every 9th
        // picture the camera loses the drawing hand
        const pose = (draw, curl) => (i) => ({
            archer: side, draw, [side + 'Curl']: 0.9, [side + 'Tilt']: 1.3, [side + 'Rot']: side === 'left' ? 1.57 : -1.57,
            [other + 'Curl']: curl == null || i % 9 === 4 ? null : curl < 0.3 ? curl + Math.abs(rnd()) * 0.05 : curl + rnd() * 0.1,
        });
        await page.evaluate(() => { const g = window.__zns.game; for (const s of ['left', 'right']) g.items.releaseHand(s); g.gear._dropNock(); });
        await show(page, { arms: 'hang' }, 12);
        await page.evaluate((side) => { const g = window.__zns.game; g.__shots.length = 0; g.items.takeIntoHand({ kind: 'bow', uid: 'bd-' + side, type: 0, arrows: 0 }, side); }, side);
        await show(page, pose(null, null), 12);
        // the open hand at the bow: an arrow on the string, the string not taken yet
        await show(page, pose(0, 0.05), 10);
        let s = await state(page);
        assert.equal(s.nock, 'nocked', `${side}: an arrow on the string ` + JSON.stringify(s));
        assert.equal(s.held, false, `${side}: open fingers do not hold the string`);
        // the fingers close on it, then the hand goes back to the chin
        await show(page, pose(0, 0.85), 8);
        assert.equal((await state(page)).held, true, `${side}: the fingers took the string`);
        await show(page, (i) => pose(0.5 * (i + 1) / 8, 0.85)(i), 8);
        const half = await state(page);
        await show(page, (i) => pose(0.5 + 0.5 * (i + 1) / 8, 0.85)(i), 8);
        await show(page, pose(1, 0.85), 14);
        s = await state(page);
        assert.ok(half.draw > 0.2 && half.draw < s.draw, `${side}: the string follows the hand (half way ${half.draw.toFixed(2)}, at the chin ${s.draw.toFixed(2)})`);
        assert.ok(s.draw > 0.85, `${side}: at the chin it is fully drawn ` + JSON.stringify(s));
        assert.ok(s.pulled > 0.25, `${side}: the string is pulled back (${s.pulled.toFixed(2)})`);
        assert.ok(s.sight, `${side}: fully drawn — the faint aim line shows`);
        assert.deepEqual(s.net, [side === 'left' ? 1 : 0, Math.round(s.draw * 100) / 100], `${side}: the others are told how far it is drawn`);
        assert.equal(s.shots.length, 0, `${side}: no shot by itself while aiming`);
        // the fingers open: one strong arrow
        await show(page, pose(1, 0.05), 10);
        s = await state(page);
        assert.equal(s.shots.length, 1, `${side}: the fingers opened — the arrow flew ` + JSON.stringify(s));
        assert.ok(s.shots[0] > 22 + 0.8 * 58, `${side}: strong (${s.shots[0].toFixed(0)} m/s)`);
        assert.equal(s.sight, false, `${side}: the aim line is gone`);
        // again (creative: the quiver never runs out), but brought forward again — let down, no shot
        await show(page, pose(0, 0.05), 10);
        await show(page, pose(0, 0.85), 8);
        await show(page, (i) => pose(0.6 * (i + 1) / 8, 0.85)(i), 8);
        await show(page, (i) => pose(0.6 - 0.6 * (i + 1) / 16, 0.85)(i), 16);
        await show(page, pose(0, 0.05), 10);
        s = await state(page);
        assert.equal(s.shots.length, 1, `${side}: let down — no second shot ` + JSON.stringify(s));
        assert.equal(s.nock, 'nocked', `${side}: the arrow stays on the string`);
        assert.equal(s.arrows, 0, `${side}: creative — no arrows needed`);
    }
    // outside creative every shot takes an arrow
    await page.evaluate(() => { const g = window.__zns.game; g.config.mode = 'freeworld'; g.gear._dropNock(); g.items.heldOf('bow').item.arrows = 3; });
    const P = (draw, curl) => ({ archer: 'right', draw, rightCurl: 0.9, rightTilt: 1.3, rightRot: -1.57, leftCurl: curl });
    await show(page, P(null, null), 8);
    await show(page, P(0, 0.85), 10);
    await show(page, (i) => P(Math.min(1, (i + 1) / 8), 0.85), 14);
    await show(page, P(1, 0.05), 10);
    const sv = await state(page);
    await page.evaluate(() => { window.__zns.game.config.mode = 'creative'; });
    assert.equal(sv.arrows, 2, 'freeworld: one arrow fewer ' + JSON.stringify(sv));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
