/**
 * The wand and the ground: bending to the ground, a hand down at it, crouching, a hand pressed on
 * it, a spell at it, the outstretched hand opened, held still a little lowered — the wand stays in the
 * hand. Only a real throw lets it go — the same for either hand (a left-hander's too). Running and
 * working the arms (ArmPump): faster, and the wand stays.
 * Run: node --test tests/e2e/wand-ground.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed, frame } from './poses.mjs';

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

async function feedF(page, opts, count) {
    for (let i = 0; i < count; i++) {
        const f0 = await page.evaluate(() => window.__zns.game.frameCount);
        await feed(page, opts, 1, 30);
        for (let k = 0; k < 50 && (await page.evaluate(() => window.__zns.game.frameCount)) < f0 + 1; k++) await new Promise((r) => setTimeout(r, 10));
    }
}

const C = (side, v) => (side === 'left' ? { leftCurl: v } : { rightCurl: v });

/** An overhand throw with `side`: drawn back behind the shoulder, swung forward, the fingers open. */
async function overhand(page, side, steps = 1) { // (one picture: a real throw is fast; two at a headless page's pace are only just over the wand's speed)
    const held = { leftCurl: 0.9, rightCurl: 0.9 };
    await feedF(page, { windup: side, ...held }, 10);
    const a = frame({ windup: side, ...held }), b = frame({ arms: 'forward', ...held });
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const f = frame({ arms: 'forward', ...held });
        f.poseLandmarks = a.poseLandmarks.map((p, k) => ({ ...p, x: p.x + (b.poseLandmarks[k].x - p.x) * t, y: p.y + (b.poseLandmarks[k].y - p.y) * t, z: p.z + (b.poseLandmarks[k].z - p.z) * t }));
        f.hands = b.hands.map((h, j) => ({ ...h, landmarks: h.landmarks.map((p, k) => { const q = a.hands[j].landmarks[k]; return { x: q.x + (p.x - q.x) * t, y: q.y + (p.y - q.y) * t, z: q.z + (p.z - q.z) * t }; }) }));
        await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, f);
        await new Promise((r) => setTimeout(r, 33));
    }
    await feed(page, { arms: 'forward', ...held, ...C(side, 0) }, 8, 33);
}

const give = (page, side, uid) => page.evaluate(({ side, uid }) => {
    const g = window.__zns.game;
    for (const s of ['left', 'right']) { g.items.releaseHand(s); g.weapons.release(s); }
    for (const L of [...g.items.loose.values()]) if (L.item.kind === 'wand') g.items.removeLoose(L.item.uid);
    g._castAt = -1e9;
    g.items.letLog.length = 0;
    g.items.takeIntoHand({ kind: 'wand', uid, plain: true, model: 0, color: 0x8b5a2b, power: 0 }, side);
}, { side, uid });
/** (for the messages) each hand every frame: up, speed, curl, hand above the shoulder, cocked / back / peak / held */
const watch = (page) => page.evaluate(() => {
    const g = window.__zns.game, ch = g.character;
    window.__ring = { left: [], right: [] };
    const upd = g.items.update.bind(g.items);
    g.items.update = (dt) => {
        for (const s of ['left', 'right']) {
            const a = ch.armState(s), t = g.items._thr[s], r = window.__ring[s];
            r.push([g.frameCount, ...[a.up, a.speed, ch.getGripCurl(s), a.hand.y - a.shoulder.y, a.hand.z - a.shoulder.z].map((x) => +x.toFixed(2)), ch.isHandTracked(s) ? 'T' : '-', t.cock ? 'C' : '-', t.back ? 'B' : '-', t.peak ? 'P' + t.peak.speed.toFixed(1) : '-', t.held ? 'H' : '-', g.spellBusy() ? 'busy' : ''].join(' '));
            if (r.length > 30) r.shift();
        }
        return upd(dt);
    };
});
const ring = (page, side) => page.evaluate((side) => (window.__ring?.[side] || []).join('\n'), side);
const where = (page, uid) => page.evaluate((uid) => {
    const g = window.__zns.game, L = g.items.loose.get(uid);
    const side = ['left', 'right'].find((s) => g.items.held[s]?.item.uid === uid) || null;
    return { side, loose: !!L, v: L ? +L.vel.length().toFixed(1) : 0 };
}, uid);

for (const dom of ['right', 'left']) {
    test(`the wand and the ground (${dom === 'right' ? 'a right-hander' : 'a left-hander'}): bending, crouching, a hand at the ground keep it; the outstretched hand opened keeps it; a throw with either hand throws it`, async () => {
        const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
        await startFromMenu(page, 'creative');
        await waitHudVisible(page);
        await page.evaluate((dom) => { window.__zns.game.settings.leftHanded = dom === 'left'; }, dom);
        await watch(page);
        await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10);
        for (const side of ['right', 'left']) {
            const uid = 'gw-' + side;
            await give(page, side, uid);
            await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 8);
            // a hand thrust down to the ground, fast, the pinch seen open; down again from above the head
            for (let k = 0; k < 3; k++) {
                await feedF(page, { arms: 'up', rightCurl: 0.9, leftCurl: 0.9 }, 4);
                await feedF(page, { arms: 'down', noseY: 0.6, forward: -0.3, ...C(side, 0.1) }, 6);
            }
            // bending down, the wrists far below and behind the shoulders (as the camera sees a stoop), the hand lost and back
            await feedF(page, (i) => ({ arms: 'down', noseY: 0.6, forward: 0.3, wristOffset: [0, 0.2], ...C(side, i % 4 === 0 ? null : 0.05) }), 16);
            // crouching with the hand pressed on the ground, then up again fast
            await feedF(page, { arms: 'down', noseY: 0.7, ...C(side, 0.05) }, 8);
            await feedF(page, { arms: 'up', ...C(side, 0.05) }, 4);
            await feedF(page, { arms: 'down', noseY: 0.7, ...C(side, 0.05) }, 4);
            // «Earthquake» / a spell at the ground: the wand pointed down at it
            await page.evaluate(() => { window.__zns.game._castAt = performance.now(); });
            await feedF(page, { arms: 'down', ...C(side, 0.1) }, 8);
            await page.evaluate(() => { window.__zns.game._castAt = -1e9; });
            await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 8);
            assert.deepEqual(await where(page, uid), { side, loose: false, v: 0 }, `${side}: working at the ground the wand stays in the hand`);
            // the outstretched hand opened (the author holds it by one finger, the other four open): it stays
            await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9, ...C(side, 0) }, 30);
            assert.deepEqual(await where(page, uid), { side, loose: false, v: 0 }, `${side}: the outstretched hand opened keeps the wand`);
            // held still, a little lowered, swaying a little, the camera shaking, the fingers seen closing and opening
            await feedF(page, (i) => ({ arms: 'forward', wristOffset: [0.01 * Math.sin(i / 3), 0.05 + 0.015 * Math.sin(i / 2)], jitter: 0.004, rightCurl: 0.9, leftCurl: 0.9, ...C(side, i % 7 < 2 ? 0.9 : 0) }), 50);
            assert.deepEqual(await where(page, uid), { side, loose: false, v: 0 }, `${side}: held still and a little lowered, the wand stays\n` + await ring(page, side));
            assert.deepEqual(await page.evaluate(() => [...window.__zns.game.items.letLog]), [], 'nothing left the hand');
            // a real throw with this hand
            await give(page, side, uid + 't');
            await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 8);
            await overhand(page, side);
            const thrown = await where(page, uid + 't');
            assert.ok(!thrown.side && thrown.loose && thrown.v > 3, `${side}: thrown ` + JSON.stringify(thrown) + '\n' + await ring(page, side));
        }
        assert.deepEqual(realErrors(errors), []);
        await page.close();
    });
}

/** Running on the spot (the shoulders bob), the arms pumping in turn as a runner's (`a`: how far, 0 — still). */
function runFrame(i, a, wand = 0.9) {
    const f = frame({ arms: 'forward', bob: i % 2 ? 0.006 : -0.006, rightCurl: i % 5 ? wand : 0, leftCurl: 0.9 });
    const d = a * Math.sin(i * 2 * Math.PI / 12); // (a swing ~0.4 s each way)
    const p = f.poseLandmarks;
    p[15].y -= d; p[13].y -= d * 0.5; p[15].z -= d; // (the left forward and up …)
    p[16].y += d; p[14].y += d * 0.5; p[16].z += d; // (… the right back and down, and the other way)
    for (const h of f.hands) for (const q of h.landmarks) q.y += h.label === 'Right' ? -d : d;
    return f;
}
async function feedRun(page, a, n) {
    for (let i = 0; i < n; i++) {
        const f0 = await page.evaluate(() => window.__zns.game.frameCount);
        await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, runFrame(i, a));
        await new Promise((r) => setTimeout(r, 33));
        for (let k = 0; k < 50 && (await page.evaluate(() => window.__zns.game.frameCount)) < f0 + 1; k++) await new Promise((r) => setTimeout(r, 10));
    }
}

test('running and working the arms as a runner: up to +40% faster, and the wand never flies out of the hand', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await watch(page);
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10);
    await give(page, 'right', 'rw');
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 8);
    // running, the arms still: no bonus
    await feedRun(page, 0, 40);
    const still = await page.evaluate(() => { const ch = window.__zns.game.character; return { run: ch.isRunning, k: ch.runIntensity, bonus: ch.armPump.bonus }; });
    assert.ok(still.run, 'running ' + JSON.stringify(still));
    assert.equal(still.bonus, 0, 'the arms still: no bonus');
    // running and pumping the arms
    let max = 0;
    for (let k = 0; k < 4; k++) {
        await feedRun(page, 0.09, 30);
        const s = await page.evaluate(() => { const ch = window.__zns.game.character; return { bonus: ch.armPump.bonus, pump: ch.armPump.pumping, speed: ch.armPump.speed }; });
        max = Math.max(max, s.bonus);
        assert.ok(s.bonus <= 0.4 + 1e-9, 'never over +40% ' + JSON.stringify(s));
    }
    assert.ok(max > 0.1, 'the arms working: faster ' + max);
    assert.deepEqual(await where(page, 'rw'), { side: 'right', loose: false, v: 0 }, 'the wand stays in the hand\n' + await ring(page, 'right'));
    assert.deepEqual(await page.evaluate(() => [...window.__zns.game.items.letLog]), [], 'nothing left the hand');
    // the arms working without the legs: nothing
    for (let i = 0; i < 60; i++) {
        const f = runFrame(i, 0.09);
        const g = frame({ arms: 'forward' });
        for (const k of [11, 12, 0, 9, 10]) f.poseLandmarks[k] = g.poseLandmarks[k];
        await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, f);
        await new Promise((r) => setTimeout(r, 33));
    }
    const legsStill = await page.evaluate(() => { const ch = window.__zns.game.character; return { run: ch.isRunning, bonus: ch.armPump.bonus }; });
    assert.ok(!legsStill.run && legsStill.bonus < 0.02, 'the arms without the legs: no bonus ' + JSON.stringify(legsStill));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
