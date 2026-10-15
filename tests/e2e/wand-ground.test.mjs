/**
 * The wand and the ground: bending to the ground, a hand down at it, crouching, a hand pressed on
 * it, a spell at it — the wand stays in the hand. Only the outstretched hand opened, or a real
 * throw, lets it go — the same for either hand (a left-hander's too).
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
    test(`the wand and the ground (${dom === 'right' ? 'a right-hander' : 'a left-hander'}): bending, crouching, a hand at the ground keep it; the outstretched hand opened drops it; a throw with either hand throws it`, async () => {
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
            // the outstretched hand opened: it falls
            await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9, ...C(side, 0) }, 30);
            const fell = await where(page, uid);
            assert.ok(!fell.side && fell.loose, `${side}: the outstretched hand opened lets it fall ` + JSON.stringify(fell));
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
